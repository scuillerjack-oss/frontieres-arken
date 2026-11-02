// Moteur — IA des dirigeants : cibles, diplomatie, plans d'attaque selon le caractère (docs/V11-contrat.md).

import { activeHelpPacts, helpWarTargets } from '../alliances.js';
import {
  COMBAT_TYPES, combatValue, hasCombatUnits, legacyForce, normalizeForce, provinceForce, resolveBattle,
  resolveCombat, scaleForce, splitForce
} from '../combat.js';
import { LAND_UNIT_TYPES, RULES } from '../constants.js';
import {
  HOSTILITY_WARNING, aliveNations, archetypeOf, chance, charmOf, ensureLeaders, getTension, pickFrom, provokers,
  recentAggressions, reputation, strengthOf
} from '../leaders.js';
import { neighbors } from '../talk.js';
import { perceivedForce, perceivedStrength, visibleProvinces } from '../vision.js';
import { helpReinforce, helpStation, recallStationed } from './ai-help.js';
import { aiNavalOrders, defenseOf, hasOrQueued, landThreat, landThreatForce, navalBase } from './ai-naval.js';
import { fortBreach } from './bombard.js';
import { TRUCE_BETRAYAL_TURNS, queueDiplomaticOrder, recentTruce, refusalsOf } from './diplomacy.js';
import { availableForces, buildingCount, queueConstruction, queueMoveOrder, queueRecruitment } from './orders.js';
import { legalDestinations, seaDestinations } from './sea-routes.js';
import { pairTreaty, pairWar, spendableTreasury } from './shared.js';

// --- V11 : personnalités (docs/V11-contrat.md, src/domain/leaders.js) ----------------------------------------
// Marge de sécurité exigée avant d'attaquer (garnison simulée × marge), par archétype.
// V14.2 (traits plus marqués) : le Conquérant accepte un combat plus serré (0,95 au lieu de 1,0) et lance jusqu'à
// deux attaques terrestres par tour (ARCH_ATTACKS) ; le Bâtisseur reste très prudent.
const ARCH_MARGIN = { conquerant: .95, traitre: 1.05, heros: 1.15, batisseur: 1.4 };
const ARCH_ATTACKS = { conquerant: 2, traitre: 1, heros: 1, batisseur: 1 };
// Risque de guerre par tour au-delà du seuil « au bord de la guerre » (V14.2 : 70, avant 75), par archétype (le Conquérant n'attend pas).
// À 85 %, la guerre est de toute façon déclarée automatiquement (hostilityWars).
const WAR_RISK = { heros: .12, traitre: .08, batisseur: .04, conquerant: 0 };
export const aiMemory = (state, id) => { state.ai.plans ||= {}; return state.ai.plans[id] ||= {}; };
const reachable = (state, map, a, b) => neighbors(state, map, a, b);
/** Nations que ce dirigeant est prêt à attaquer ce tour-ci. */
function warTargets(state, map, id, arch) {
  const out = new Set(), mem = aiMemory(state, id), alive = aliveNations(state).filter(n => n !== id);
  for (const n of alive) if (pairWar(state, id, n)) out.add(n);
  if (arch === 'batisseur') return out; // ne se bat que menacé (déjà en guerre)
  if (arch === 'conquerant') {
    // Domination : il choisit tôt une proie (la plus faible qu'il peut atteindre), sans attendre la tension,
    // et ne respecte une trêve que le temps qu'elle cesse d'être une trahison (V14.0 : 10 tours, avant 5).
    const startTurn = 2 + Math.floor(chance(state, 'conq-start', id) * 3);
    // Proie atteignable depuis sa base navale (là où sont sa flotte et son armée) ou par la terre.
    const owned = map.provinces.filter(p => state.provinces[p.id].ownerId === id), base = navalBase(map, state, owned);
    const coast = new Set([...(base ? seaDestinations(map, base.id).map(d => d.id) : []), ...owned.flatMap(p => p.landConnections || [])]);
    const fromBase = n => [...coast].some(pid => state.provinces[pid]?.ownerId === n);
    if (state.turn >= startTurn) {
      const prey = alive.filter(n => !pairTreaty(state, id, n, 'alliance') && reachable(state, map, id, n))
        .filter(n => { const t = state.diplomacy.treaties.find(x => x.active !== false && x.type === 'ceasefire' && x.parties.includes(id) && x.parties.includes(n)); return !t || state.turn - t.started >= TRUCE_BETRAYAL_TURNS; })
        .sort((a, b) => Number(fromBase(b)) - Number(fromBase(a)) || perceivedStrength(state, map, id, a) - perceivedStrength(state, map, id, b) || a.localeCompare(b));
      if (prey.length && !out.size) out.add(prey[0]);
      // Assez fort : une deuxième proie (V14.2 : dès 1,25 fois sa force, avant 1,5).
      if (prey.length > 1 && strengthOf(state, id) > 1.25 * perceivedStrength(state, map, id, prey[1])) out.add(prey[1]);
    }
    // V14.2 (Jack : « les provocations doivent le pousser à attaquer ») : qui le provoque devient une cible, dès le tour
    // suivant (sauf un allié, ou une trêve récente qu'il ne rompt pas pour ne pas passer pour un traître).
    for (const n of provokers(state, id)) if (n !== id && !pairTreaty(state, id, n, 'alliance') && !recentTruce(state, id, n) && reachable(state, map, id, n)) out.add(n);
  }
  if (arch === 'heros') {
    // Punir les agresseurs récents (sauf ses alliés : il est fidèle).
    // V14.2 : naïf, il épargne un agresseur qui l'a beaucoup flatté (3 messages amicaux récents) — sauf s'il est déjà en guerre avec lui.
    for (const a of recentAggressions(state, 10)) if (a.attacker !== id && !pairTreaty(state, id, a.attacker, 'alliance') && !state.nations[a.attacker]?.eliminated && reachable(state, map, id,
      a.attacker) && !(charmOf(state, id, a.attacker) >= 3 && !pairWar(state, id, a.attacker))) out.add(a.attacker);
  }
  if (arch === 'traitre') {
    const t = traitorState(state, map, id);
    if (t.mark && state.turn >= t.strikeTurn && pairTreaty(state, id, t.mark, 'alliance')) out.add(t.mark);
    else if (t.mark && !pairTreaty(state, id, t.mark, 'alliance') && state.turn >= t.strikeTurn + 4) out.add(t.mark);
  }
  // Tension « au bord de la guerre » : risque de guerre chaque tour (décision mémorisée : rancune).
  mem.grudges ||= [];
  for (const n of alive) {
    if (out.has(n) || pairTreaty(state, id, n, 'alliance') || !reachable(state, map, id, n)) continue;
    const t = getTension(state, id, n);
    if (mem.grudges.includes(n)) { if (t >= 50) out.add(n); else mem.grudges = mem.grudges.filter(x => x !== n); continue; }
    if (t >= HOSTILITY_WARNING && chance(state, 'war-risk', state.turn, id, n) < (WAR_RISK[arch] ?? .08) * (1 + (t - HOSTILITY_WARNING) / 15)) { mem.grudges.push(n); out.add(n); }
  }
  return out;
}
/** Le Traître choisit une cible (« marque »), la courtise, puis la frappe au moment opportun. */
function traitorState(state, map, id) {
  const mem = aiMemory(state, id);
  // V14.2 : coup porté (plus allié avec sa marque) → il passe à la suivante au bout de 6 tours (avant 12).
  if (mem.mark && (state.nations[mem.mark]?.eliminated || (state.turn > (mem.strikeTurn || 0) + 6 && !pairTreaty(state, id, mem.mark, 'alliance')))) { mem.mark = null; }
  // V14.2 (Jack : « le traître peut trahir n'importe qui, autant de fois que c'est à son avantage ») : N'IMPORTE QUEL
  // allié devient la marque dès que c'est payant — allié depuis au moins 5 tours, et plus faible que lui : à moins de
  // 85 % de sa force s'il est occupé par une autre guerre, à moins de 60 % sinon. Même une ancienne victime peut être retrahie.
  const ripe = aliveNations(state).filter(n => n !== id && pairTreaty(state, id, n, 'alliance') && reachable(state, map, id, n)
    && state.turn - (state.diplomacy.treaties.find(t => t.active !== false && t.type === 'alliance' && t.parties.includes(id) && t.parties.includes(n))?.started ?? state.turn) >= 5
    && (aliveNations(state).some(x => x !== id && x !== n && pairWar(state, n, x)) ? perceivedStrength(state, map, id, n) < .85 * strengthOf(state, id) : perceivedStrength(state, map, id, n) < .6 * strengthOf(state, id)))
    .sort((a, b) => perceivedStrength(state, map, id, a) - perceivedStrength(state, map, id, b) || a.localeCompare(b));
  if (ripe.length && (!mem.mark || !pairTreaty(state, id, mem.mark, 'alliance') || state.turn < (mem.strikeTurn || 0) - 3)) {
    if (mem.mark !== ripe[0]) { mem.mark = ripe[0]; mem.strikeTurn = state.turn; }
  }
  if (!mem.mark) {
    const cand = aliveNations(state).filter(n => n !== id && reachable(state, map, id, n) && !pairWar(state, id, n));
    if (cand.length) {
      mem.mark = pickFrom(state, cand.sort(), 'traitor-mark', id, state.turn);
      // V14.2 : un allié déjà en place se trahit plus vite (pas besoin de le courtiser).
      mem.strikeTurn = state.turn + (pairTreaty(state, id, mem.mark, 'alliance') ? 3 : 7) + Math.floor(chance(state, 'traitor-strike', id, state.turn) * 6);
    }
  }
  state.ai.traitorMark ||= {};
  state.ai.traitorMark[id] = mem.mark || null;
  // Moment opportun : la cible est déjà occupée par une autre guerre.
  if (mem.mark && pairTreaty(state, id, mem.mark, 'alliance') && aliveNations(state).some(n => n !== id && pairWar(state, mem.mark, n)) && state.turn >= mem.strikeTurn - 3) mem.strikeTurn = Math.min(mem.strikeTurn, state.turn);
  return mem;
}
const pendingDiplo = (state, id, target) => (state.orders || []).some(o => o.kind === 'diplomacy' && o.status === 'pending' && o.nationId === id && o.target === target);
/** Diplomatie IA (B9) : alliances et trêves proposées selon la personnalité. */
function aiDiplomacy(state, map, id, arch, targets, helpTargets = new Set()) {
  const alive = aliveNations(state).filter(n => n !== id), mem = aiMemory(state, id);
  const propose = (target, action, level = .25) => {
    if (pendingDiplo(state, id, target) || state.nations[target]?.eliminated) return;
    const key = `${action}:${target}`; mem.lastOffer ||= {};
    if (state.turn - (mem.lastOffer[key] ?? -99) < 5) return;
    // V13.2 : face au joueur, une offre refusée n'est pas reproposée avant 6 tours ; après deux refus, l'IA
    // n'insiste plus, sauf si elle est en train de s'effondrer (moins de la moitié de la force du joueur).
    if (state.controllers?.[target] === 'human') {
      const r = refusalsOf(state, id, target, action);
      if (r.count && state.turn - r.turn < 6) return;
      if (r.count >= 2 && !(action === 'ceasefire' && strengthOf(state, id) < .5 * strengthOf(state, target))) return;
    }
    const r = queueDiplomaticOrder(state, { nationId: id, target, action, ...(action === 'ceasefire' ? { offerLevel: level } : {}) });
    if (r.ok) { mem.lastOffer[key] = state.turn; reputation(state, id).offers++; }
  };
  for (const n of alive) {
    const war = pairWar(state, id, n), ally = pairTreaty(state, id, n, 'alliance');
    if (war) {
      if (helpTargets.has(n)) continue; // V13 : engagé aux côtés d'un allié, il ne demande pas la paix
      const losing = strengthOf(state, id) < .7 * perceivedStrength(state, map, id, n), since = state.turn - (state.diplomacy.wars.find(w => w.participants.includes(id) && w.participants.includes(n))?.started ?? state.turn);
      if (arch === 'batisseur' && since >= 2) propose(n, 'ceasefire', .25);
      else if (arch === 'conquerant' && losing && since >= 4) propose(n, 'ceasefire', .25);
      else if (arch === 'heros' && since >= 6 && !recentAggressions(state, 8).some(a => a.attacker === n)) propose(n, 'ceasefire', .25);
      else if (arch === 'traitre' && losing && since >= 3) propose(n, 'ceasefire', .25);
      continue;
    }
    if (ally) continue;
    // V14.2 : le Traître courtise sa marque, mais aussi tout voisin calme (tension < 40) : chaque alliance est une
    // trahison possible plus tard, « autant de fois que c'est à son avantage ». Au plus 2 alliés à la fois, et pas avant
    // le tour 10 (sinon il « endort » le Conquérant dès le début et retarde les premières guerres).
    if (arch === 'traitre') {
      const t = traitorState(state, map, id), allies = alive.filter(x => pairTreaty(state, id, x, 'alliance')).length;
      if (n === t.mark && state.turn >= 2 && state.turn < t.strikeTurn) propose(n, 'alliance');
      else if (state.turn >= 10 && allies < 2 && reachable(state, map, id, n) && getTension(state, id, n) < 40 && chance(state, 'traitor-court', state.turn, id, n) < .35) propose(n, 'alliance');
    }
    if (arch === 'heros' && recentAggressions(state, 6).some(a => a.victim === n && a.attacker !== id) && getTension(state, id, n) < 40) propose(n, 'alliance');
    if (arch === 'batisseur' && state.turn >= 6 && getTension(state, id, n) < 15 && archetypeOf(state, n) === 'heros' && state.controllers?.[n] === 'ai') propose(n, 'alliance');
  }
}
function aiPlan(state, map, nationId) {
  const owned = map.provinces.filter(p => state.provinces[p.id].ownerId === nationId);
  if (!owned.length) return;
  const arch = archetypeOf(state, nationId) || 'batisseur';
  const base = navalBase(map, state, owned);
  const targets = warTargets(state, map, nationId, arch);
  // V13 : engagements pris auprès d'un allié (demande d'aide acceptée) : guerre déclarée et attaques contre X.
  // V14.0 (relecture) : une trêve signée depuis moins de 10 tours est respectée, même pour aider un allié — sinon l'IA
  // deviendrait « traître » malgré elle (rompre une trêve récente est une trahison).
  const helpTargets = new Set([...helpWarTargets(state, map, nationId)].filter(x => !recentTruce(state, nationId, x)));
  for (const x of helpTargets) {
    targets.add(x);
    if (!pairWar(state, nationId, x) && !pendingDiplo(state, nationId, x)) queueDiplomaticOrder(state, { nationId, target: x, action: 'war' });
  }
  aiDiplomacy(state, map, nationId, arch, targets, helpTargets);
  if (arch === 'traitre') traitorPrepare(state, nationId);
  const treasury = () => spendableTreasury(state, nationId);
  const factory = owned.find(p => state.provinces[p.id].buildings.factory);
  const source = factory || base || owned[0];
  // Le Conquérant (et le Traître qui prépare son coup) arment d'abord la flotte ; les autres construisent l'économie.
  const warlike = arch === 'conquerant' || arch === 'traitre' || targets.size > 0;
  if (warlike) aiNavalOrders(state, map, nationId, owned, base, ARCH_MARGIN[arch], owner => targets.has(owner), arch, helpTargets);
  // Épargne pour la flotte : sans au moins 2 navires (en service ou en chantier), une nation belliqueuse
  // n'achète ni infanterie ni banque (sinon le trésor ne permet jamais d'armer un navire : IA passive de la V10).
  const ships = owned.reduce((n, p) => n + (state.provinces[p.id].warships || 0), 0) + (state.transports || []).filter(t => t.nationId === nationId).reduce((n, t) => n + (t.warships || 0), 0)
    + (state.productionQueue || []).filter(q => q.kind === 'unit' && q.type === 'warship' && q.nationId === nationId).reduce((n, q) => n + q.amount, 0)
    + (state.orders || []).filter(o => o.kind === 'recruitment' && o.type === 'warship' && o.nationId === nationId && o.status === 'pending').reduce((n, o) => n + o.amount, 0);
  const saving = warlike && base && ships < (arch === 'conquerant' ? 3 : 2) && !owned.some(p => landThreat(map, state, nationId, p.id) > 0);
  if (!factory && treasury() >= RULES.buildings.factory.cost) queueConstruction(state, { nationId, provinceId:source.id, type:'factory' });
  const banks = arch === 'batisseur' ? owned : owned.filter(p => p.id !== source.id);
  const bankProvince = banks.find(p => !hasOrQueued(state, p.id, 'bank'));
  if (bankProvince && !saving && treasury() >= RULES.buildings.bank.cost + (warlike ? 40 : 0)) { if (queueConstruction(state, { nationId, provinceId:bankProvince.id, type:'bank' }).ok) reputation(state, nationId).builds++; }
  if (arch === 'batisseur' || arch === 'heros') {
    // Défense : fortifie la capitale puis la base navale quand la tension monte ou à mesure que le trésor grossit.
    const worry = aliveNations(state).some(n => n !== nationId && getTension(state, nationId, n) >= 50);
    for (const p of [owned.find(x => state.nations[nationId].capitalId === x.id), base].filter(Boolean)) {
      const lvl = buildingCount(state, p.id, 'fort');
      if (lvl < 3 && (worry || arch === 'batisseur') && treasury() >= RULES.buildings.fort.costs[lvl] + 40) { if (queueConstruction(state, { nationId, provinceId: p.id, type: 'fort' }).ok) reputation(state, nationId).builds++; break; }
    }
  }
  if (!saving && treasury() >= RULES.units.infantry.cost) queueRecruitment(state, { nationId, provinceId: source.id, type: factory && state.turn % 3 === 0 ? 'armor' : 'infantry' });
  if (arch === 'conquerant' && !saving && factory && treasury() >= RULES.units.armor.cost + 40) queueRecruitment(state, { nationId, provinceId: source.id, type: 'armor' });
  if (!warlike) aiNavalOrders(state, map, nationId, owned, base, ARCH_MARGIN[arch], owner => targets.has(owner), arch, helpTargets);
  const attacks = owned.flatMap(p => legalDestinations(map, state, p.id).filter(d => {
    const target=state.provinces[d.id],owner=target?.ownerId;
    return owner&&owner!==nationId&&d.type==='land'&&targets.has(owner)&&(!pairTreaty(state,nationId,owner,'ceasefire')||(arch==='conquerant'&&!recentTruce(state,nationId,owner)))&&(!pairTreaty(state,nationId,owner,'alliance')||arch==='traitre');
  }).map(d => ({ from:p, to:d.id, owner:state.provinces[d.id].ownerId, atWar:pairWar(state,nationId,state.provinces[d.id].ownerId) })));
  attacks.sort((a,b)=>Number(helpTargets.has(b.owner))-Number(helpTargets.has(a.owner))||Number(b.atWar)-Number(a.atWar)||defenseOf(state,a.to,map,nationId)-defenseOf(state,b.to,map,nationId)||a.to.localeCompare(b.to)||a.from.id.localeCompare(b.from.id));
  // V10 : l'IA évalue l'attaque en simulant le vrai combat (déterministe) contre la garnison majorée d'une marge
  // selon sa personnalité ; elle engage la plus petite part de ses forces disponibles qui gagne, en gardant de quoi tenir.
  const threshold = ARCH_MARGIN[arch];
  let launched = 0;
  for (const x of attacks) {
    if (launched >= (ARCH_ATTACKS[arch] || 1)) break;
    if (launched && state.orders.some(o => o.kind === 'move' && o.status === 'pending' && o.nationId === nationId && (o.fromId === x.from.id || o.toId === x.to))) continue;
    // V14.2 : en guerre, le Conquérant se contente d'un avantage minime (0,8 au lieu de 0,85).
    const margin = x.atWar ? Math.max(arch === 'conquerant' ? .8 : .85, threshold - .2) : threshold;
    const units = aiAttackSlice(state, map, nationId, x.from.id, x.to, margin, 'land');
    if (!units) continue;
    if (queueMoveOrder(state, map, { nationId, fromId:x.from.id, toId:x.to, units }).ok) launched++;
    else if (arch !== 'conquerant') break; // comportement V14.1 conservé pour les autres personnalités
  }
  recallStationed(state, map, nationId, owned); // V14.0 : rappel des troupes stationnées chez un allié
  if (activeHelpPacts(state, nationId).some(p => p.kind === 'defend')) helpReinforce(state, map, nationId, owned, base);
  helpStation(state, map, nationId, owned); // V13.4 : droit de passage — stationner chez un allié menacé
  if (arch === 'traitre') traitorStrike(state, nationId);
}
/**
 * Le coup du Traître : une invasion part vers son allié (ou le délai est largement dépassé) → il rompt l'alliance
 * par une déclaration de guerre résolue dans le même inter-tour (TRAHISON publique, Traître révélé).
 */
// V13 : pas de guerre entre alliés — le Traître ROMPT d'abord l'alliance (ordre 'break' préparé avant ses attaques,
// pour qu'il puisse viser son allié), puis frappe dans le même inter-tour : c'est la trahison (V11 conservé).
function traitorPrepare(state, nationId) {
  const mem = aiMemory(state, nationId), mark = mem.mark;
  if (!mark || !pairTreaty(state, nationId, mark, 'alliance') || state.turn < mem.strikeTurn) return;
  state.orders = state.orders.filter(o => !(o.kind === 'diplomacy' && o.status === 'pending' && o.nationId === nationId && o.target === mark));
  // Délai largement dépassé : rupture + déclaration de guerre, même sans invasion prête.
  const r = queueDiplomaticOrder(state, { nationId, target: mark, action: 'break' });
  if (r.ok && state.turn >= mem.strikeTurn + 6) state.orders.find(o => o.id === r.orderId).war = true;
}
/** Sans invasion lancée contre son allié (et avant la limite), le Traître garde son masque : rupture annulée. */
function traitorStrike(state, nationId) {
  const mem = aiMemory(state, nationId), mark = mem.mark;
  const brk = (state.orders || []).find(o => o.kind === 'diplomacy' && o.action === 'break' && o.status === 'pending' && o.nationId === nationId && o.target === mark);
  if (!brk || brk.war) return;
  const invading = state.orders.some(o => o.kind === 'move' && o.status === 'pending' && !o.passage && o.nationId === nationId && state.provinces[o.toId]?.ownerId === mark);
  if (!invading) state.orders.splice(state.orders.indexOf(brk), 1);
}
/** Plus petite part (35 %, 50 %, 70 %) des forces disponibles qui prend la cible en simulation, ou null. */
export function aiAttackSlice(state, map, nationId, fromId, toId, margin, mode, warships = 0, via = null) {
  const available = availableForces(state, fromId), target = state.provinces[toId];
  // Débarquement : flotte ennemie qui peut intercepter au port d'arrivée (navires à quai, en guerre ou cible du débarquement).
  const harbor = via ? state.provinces[via] : null;
  // V13 : l'IA ne voit que ce que sa vision lui montre (vision.js) ; sinon elle suppose une garnison prudente.
  const seen = visibleProvinces(state, map, nationId);
  const harborShips = harbor ? perceivedForce(state, map, nationId, via, seen).units.warship : 0;
  const interceptors = harbor && harbor.ownerId !== nationId && harbor.buildings?.port && harborShips > 0 && (pairWar(state, nationId, harbor.ownerId) || harbor.ownerId === target.ownerId)
    ? scaleForce(legacyForce({ warships: harborShips }), Math.max(1, margin)) : null;
  // V14.1 : province invisible mais garnison vue lors d'un assaut repoussé récent : on retient la plus forte des deux.
  const perceived = perceivedForce(state, map, nationId, toId, seen), recalled = seen.has(toId) ? null : rememberedGarrison(state, nationId, toId);
  const defense = scaleForce(recalled && combatValue(recalled) > combatValue(perceived) ? recalled : perceived, Math.max(1, margin));
  const home = provinceForce(state.provinces[fromId]);
  for (const share of RULES.ai.attackShares) {
    const units = Object.fromEntries(LAND_UNIT_TYPES.map(k => [k, Math.floor(available[k] * share)]));
    if (!LAND_UNIT_TYPES.some(k => units[k])) continue;
    let { taken, rest } = splitForce(home, { ...units, warship: warships });
    if (interceptors) {
      const sea = resolveBattle({ defender: taken, attackers: [{ id: 'x', force: interceptors }], naval: true });
      taken = sea.defender;
      if (!hasCombatUnits(taken, true)) continue;
    }
    // Navires à quai dans la province visée : ils défendent aussi (comptés dans la garnison, sauf s'ils ont déjà intercepté).
    const r = resolveCombat({ attacker: taken, defender: interceptors && via === toId ? (() => { const d = normalizeForce(defense); d.units.warship = 0; d.wounds.warship = 0; return d; })() : defense, fortLevel: target.buildings.fort || 0, mode, fortBreach: fortBreach(state, toId) });
    if (!r.captured) continue;
    // Garder chez soi de quoi tenir face à la menace terrestre voisine.
    const threat = landThreatForce(map, state, nationId, fromId);
    if (threat && !holds(rest, threat, state.provinces[fromId].buildings.fort || 0)) continue;
    return units;
  }
  return null;
}
/** V14.1 : mémoire des garnisons vues lors d'une attaque repoussée (state.ai.seenGarrisons[nation][province]). */
export const GARRISON_MEMORY_TURNS = 80; // une partie entière (tant que la province n’a pas changé de main)
export function rememberGarrison(state, nationId, provinceId, force) {
  state.ai ||= {}; state.ai.seenGarrisons ||= {};
  const mem = (state.ai.seenGarrisons[nationId] ||= {});
  mem[provinceId] = { turn: state.turn, owner: state.provinces[provinceId]?.ownerId, units: Object.fromEntries(COMBAT_TYPES.map(k => [k, force.units[k] || 0])) };
}
/** Garnison dont `nationId` se souvient (même propriétaire, moins de GARRISON_MEMORY_TURNS tours), sinon null. */
export function rememberedGarrison(state, nationId, provinceId) {
  const m = state.ai?.seenGarrisons?.[nationId]?.[provinceId];
  if (!m || state.turn - m.turn > GARRISON_MEMORY_TURNS || m.owner !== state.provinces[provinceId]?.ownerId) return null;
  return normalizeForce({ units: m.units });
}
export const holds = (garrison, threat, fortLevel) => !resolveCombat({ attacker: scaleForce(threat, .9), defender: garrison, fortLevel }).captured;
export function planAIOrders(state, map) {
  state.ai ||= { memories:{}, replay:[], traits:{} };
  ensureLeaders(state);
  if (state.ai.plannedTurn === state.turn) return state.orders.filter(o => o.nationId !== state.playerNationId);
  for (const id of Object.keys(state.nations).sort()) if (state.controllers[id] === 'ai' && !state.nations[id].eliminated) aiPlan(state,map,id);
  state.ai.plannedTurn=state.turn;
  return state.orders.filter(o => o.nationId !== state.playerNationId);
}

