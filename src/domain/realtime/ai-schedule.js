// V17.5 — L'IA en temps réel (docs/V17-cahier-des-charges.md §7, §12 « V17.5 ») : qui décide quel jour, ce que l'IA fait
// À SA décision en plus du plan du tour par tour (planAIOrders), et les règles « par tour » rythmées en jours.
// Module pur, déterministe, sans DOM.
//
//  - Calendrier : la nation n° i décide les jours où (jour + 2 i) % 10 = 0 (clock.js) ; `decisionCalendar` le liste.
//  - Réponses en 1 à 10 jours : une proposition (alliance, trêve) ou une demande d'aide adressée à une IA attend sa
//    prochaine décision (`deferAnswers` → statut 'awaiting', `answerDay`) ; ce jour-là `releaseAnswers` la remet en
//    attente d'exécution, juste avant que l'IA ne décide.
//  - Rythme (« pace ») : recruter, armer un navire, lancer un débarquement, lancer une attaque terrestre (quota) : au plus
//    une fois par fenêtre de RULES.realtime.ai.pace jours, pas à chacune des 3 décisions d'une période.
//  - Vision sans triche : l'IA voit une armée en marche si elle voit sa province de départ ou d'arrivée (la sienne, celle
//    d'un allié), sa composition seulement si elle voit la province de départ (sinon : estimation prudente, vision.js).
//  - Réactions, à chaque décision : retraite d'une bataille perdue (battleForecast de la V17.2), rappel d'une attaque en
//    route qui échouerait, renfort d'une province menacée par une armée visible (ou recrues sur place si elles arrivent à
//    temps).

import { combatValue, legacyForce, mergeForce, normalizeForce, provinceForce, resolveCombat, scaleForce, splitForce } from '../combat.js';
import { LAND_UNIT_TYPES, RULES } from '../constants.js';
import { garrisonForce, hasPassage } from '../passage.js';
import { prudentEstimate, provinceIntel, troopsKnownTo, visibleProvinces, visionSharers } from '../vision.js';
import { fortBreach } from '../engine/bombard.js';
import { availableForces, queueMoveOrder, queueRecruitment } from '../engine/orders.js';
import { landThreatForce } from '../engine/ai-naval.js';
import { pairTreaty, pairWar, spendableTreasury } from '../engine/shared.js';
import { aiNationOfDay, isRealtime, nextAiDays } from './clock.js';
import { battleAt, battleForecast, retreatFromBattle } from './battles.js';
import { landTravelDays, recallMarch } from './marches.js';
import { foodProduction, plannedConsumption } from './food.js';

const R = RULES.realtime;
const A = () => R.ai;
const B = R.battle;

// --- Calendrier ----------------------------------------------------------------------------------------------------
/** Décisions d'IA entre deux jours (inclus) : [{ day, nationId }] — une nation au plus par jour. */
export function decisionCalendar(state, fromDay, toDay) {
  const out = [];
  for (let d = fromDay; d <= toDay; d++) { const id = aiNationOfDay(state, d); if (id) out.push({ day: d, nationId: id }); }
  return out;
}
/** Prochaine décision de `nationId` strictement après aujourd'hui (1 à 10 jours). */
export const nextDecisionDay = (state, nationId, day = state.day) => nextAiDays(state, day + 1)[nationId];

// --- Réponses en 1 à 10 jours (§7) ---------------------------------------------------------------------------------
/** Nation qui doit répondre à cet ordre (une IA), ou null. */
export function answererOf(state, o) {
  if (o.kind === 'help') return state.controllers?.[o.to] === 'ai' ? o.to : null;
  if (o.kind === 'diplomacy' && (o.action === 'alliance' || o.action === 'ceasefire')) return state.controllers?.[o.target] === 'ai' ? o.target : null;
  return null;
}
/** Un ordre encore ouvert (pas encore exécuté) : en attente d'exécution, ou d'une réponse. */
export const openOrder = o => o.status === 'pending' || o.status === 'awaiting';
/**
 * Avant l'exécution des ordres du jour : une proposition ou une demande d'aide adressée à une IA attend sa prochaine
 * décision (1 à 10 jours). L'ordre reste dans state.orders (statut 'awaiting', `answerDay`, `askedDay`).
 */
export function deferAnswers(state) {
  if (!isRealtime(state)) return 0;
  let n = 0;
  for (const o of state.orders || []) {
    if (o.status !== 'pending' || o.answerReady) continue;
    const who = answererOf(state, o);
    if (!who) continue;
    o.status = 'awaiting'; o.answerDay = nextDecisionDay(state, who); o.askedDay = state.day; n++;
  }
  return n;
}
/** Jour d'une décision : les réponses dues aujourd'hui (ou dont l'IA a disparu) repartent pour être exécutées. */
export function releaseAnswers(state, day = state.day) {
  let n = 0;
  for (const o of state.orders || []) {
    if (o.status !== 'awaiting') continue;
    const who = o.kind === 'help' ? o.to : o.target;
    if (o.answerDay <= day || state.nations[who]?.eliminated || state.controllers?.[who] !== 'ai') { o.status = 'pending'; o.answerReady = true; n++; }
  }
  return n;
}

// --- Rythme des règles « par tour » --------------------------------------------------------------------------------
const paceOf = (state, nationId) => {
  state.ai ||= {}; state.ai.pace ||= {};
  const p = (state.ai.pace[nationId] ||= {});
  p.attacks = Array.isArray(p.attacks) ? p.attacks : [];
  return p;
};
/** L'action `kind` (recruit, ship, landing) est-elle permise aujourd'hui ? Toujours au tour par tour. */
export function paceReady(state, nationId, kind, days = A().pace[kind]) {
  if (!isRealtime(state)) return true;
  const last = paceOf(state, nationId)[kind];
  return !Number.isFinite(last) || state.day - last >= days;
}
export function notePace(state, nationId, kind) { if (isRealtime(state)) paceOf(state, nationId)[kind] = state.day; }
/**
 * Attaques terrestres lancées dans la fenêtre en cours (0 au tour par tour). `days` : la fenêtre (RULES.realtime.ai.pace.attack ;
 * en Facile, RULES.realtime.diplomacy.easyAttackEveryDays : une attaque par 30 jours, cahier §2.2).
 */
export function attacksInPace(state, nationId, days = A().pace.attack) {
  if (!isRealtime(state)) return 0;
  const p = paceOf(state, nationId), keep = Math.max(A().pace.attack, R.diplomacy.easyAttackEveryDays);
  p.attacks = p.attacks.filter(d => state.day - d < keep);
  return p.attacks.filter(d => state.day - d < days).length;
}
export function noteAttack(state, nationId) { if (isRealtime(state)) paceOf(state, nationId).attacks.push(state.day); }
/** Quota d'attaques terrestres de la fenêtre (ARCH_ATTACKS × attacksPerPace, arrondi, au moins 1). */
export const attackQuota = (state, base) => isRealtime(state) ? Math.max(1, Math.round(base * A().attacksPerPace)) : base;
/** Statistiques des réactions (outil de mesure). */
const stat = (state, key) => { state.ai ||= {}; state.ai.rtStats ||= {}; state.ai.rtStats[key] = (state.ai.rtStats[key] || 0) + 1; };

// --- Armées en marche visibles -------------------------------------------------------------------------------------
/**
 * Armées en marche que `nationId` voit (mêmes règles que le joueur, §8) : les siennes et celles de ses alliés, et toute
 * marche dont il voit la province de départ ou d'arrivée. `known` : composition connue (troupes du départ connues :
 * visible et pas derrière une forteresse ennemie, ou soi / allié — comme `compositionKnown` de l'interface).
 */
export function visibleMarchesFor(state, map, nationId, seen = visibleProvinces(state, map, nationId)) {
  const sharers = visionSharers(state, nationId), out = [];
  for (const m of state.marches || []) {
    const friendly = sharers.has(m.nationId);
    if (!friendly && !seen.has(m.fromId) && !seen.has(m.toId)) continue;
    // Même règle que le joueur : composition connue si les troupes de la province de départ le sont (forteresse : non).
    out.push({ march: m, known: friendly || troopsKnownTo(state, map, nationId, m.fromId, seen) });
  }
  return out;
}
/** Force d'une marche telle que `nationId` la connaît : réelle si la composition est connue, sinon estimation prudente. */
export const marchEstimate = (state, v) => {
  if (v.known) return legacyForce(v.march);
  const f = prudentEstimate(state, v.march.fromId); f.units.warship = 0; f.wounds.warship = 0; return f;
};
const mergeAll = forces => forces.reduce((f, x) => mergeForce(f, x), normalizeForce({}));
/** Armées hostiles visibles qui marchent sur `provinceId` (province de `nationId`) : { force, arriveDay } ou null. */
export function incomingThreat(state, map, nationId, provinceId, seen = null) {
  if (!state.marches?.length) return null;
  const list = visibleMarchesFor(state, map, nationId, seen || visibleProvinces(state, map, nationId))
    .filter(v => v.march.toId === provinceId && v.march.nationId !== nationId && !v.march.returning && v.march.hostile && !pairTreaty(state, nationId, v.march.nationId, 'alliance'));
  if (!list.length) return null;
  return { force: mergeAll(list.map(v => marchEstimate(state, v))), arriveDay: Math.min(...list.map(v => v.march.arriveDay)), marches: list.map(v => v.march.id) };
}
/** Renforts visibles du propriétaire de `provinceId` (et de ses alliés) qui y marchent : ils défendront aussi. */
export function incomingSupport(state, map, viewer, provinceId, seen = null) {
  if (!state.marches?.length) return null;
  const owner = state.provinces[provinceId]?.ownerId;
  if (!owner) return null;
  const list = visibleMarchesFor(state, map, viewer, seen || visibleProvinces(state, map, viewer))
    .filter(v => v.march.toId === provinceId && v.march.nationId !== viewer && (v.march.nationId === owner || hasPassage(state, v.march.nationId, owner)) && (!v.march.hostile || v.march.returning));
  return list.length ? mergeAll(list.map(v => marchEstimate(state, v))) : null;
}
const holds = (garrison, threat, fortLevel, breach = 0) => !resolveCombat({ attacker: scaleForce(threat, .9), defender: garrison, fortLevel, fortBreach: breach }).captured;
const ownMarchesTo = (state, nationId, provinceId) => (state.marches || []).filter(m => m.nationId === nationId && m.toId === provinceId && !m.returning);
/** Dernier jour (traitement du moteur) où une armée arrivée peut encore se battre : arrivée de l'ennemi + 2 assauts. */
const lastAssaultDay = arriveDay => arriveDay - 1 + (B.assaults - 1) * B.assaultEveryDays;

// --- Réactions à la décision ---------------------------------------------------------------------------------------
/** Retraite des batailles que la simulation (battleForecast) dit perdues, sauf renfort à soi qui arrive à temps. */
export function aiRetreats(state, map, nationId) {
  let n = 0;
  for (const b of [...(state.battles || [])]) {
    if (!b.attackers.some(e => e.nationId === nationId)) continue;
    const f = battleForecast(state, b.id);
    if (!f || f.assaultsLeft <= 0 || (f.captured && f.winnerId === nationId)) continue;
    // Une victoire d'un allié laisse ses troupes rentrer de toute façon : la retraite ne change rien, on la prend tout de suite.
    const last = b.nextAssaultDay + (f.assaultsLeft - 1) * B.assaultEveryDays;
    const coming = ownMarchesTo(state, nationId, b.provinceId).some(m => m.arriveDay - 1 <= last)
      || (state.transports || []).some(t => t.nationId === nationId && t.toId === b.provinceId && !t.returning && (t.arriveDay ?? Infinity) - 1 <= last);
    if (coming) continue;
    if (retreatFromBattle(state, map, { nationId, battleId: b.id }).ok) { n++; stat(state, 'retreats'); }
  }
  return n;
}
/** Garnison qu'une nation se rappelle (V14.1, mémoire des assauts repoussés), ou null. */
function remembered(state, nationId, provinceId) {
  const m = state.ai?.seenGarrisons?.[nationId]?.[provinceId];
  return m && m.owner === state.provinces[provinceId]?.ownerId ? normalizeForce({ units: m.units }) : null;
}
/**
 * Rappel d'une attaque en route qui échouerait : la province visée (garnison vue ou estimée, renforts visibles en route
 * compris) tient face à toutes ses armées en marche vers elle, même avec une marge réduite (RULES.realtime.ai.recallMargin).
 */
export function aiRecalls(state, map, nationId) {
  const seen = visibleProvinces(state, map, nationId), targets = new Set();
  for (const m of state.marches || []) if (m.nationId === nationId && m.hostile && !m.returning && !m.passage) targets.add(m.toId);
  let n = 0;
  for (const toId of [...targets].sort()) {
    const target = state.provinces[toId], owner = target?.ownerId;
    if (!target || owner === nationId || battleAt(state, toId)) continue;
    if (owner && !pairWar(state, nationId, owner) && pairTreaty(state, nationId, owner, 'alliance')) continue;
    const mine = ownMarchesTo(state, nationId, toId).filter(m => m.hostile && !m.passage);
    const attacker = mergeAll(mine.map(m => legacyForce(m)));
    let defense = provinceIntel(state, map, nationId, toId, seen)?.troopsKnown ? garrisonForce(state, toId) : prudentEstimate(state, toId);
    const mem = seen.has(toId) ? null : remembered(state, nationId, toId);
    if (mem && combatValue(mem) > combatValue(defense)) defense = mem;
    const support = incomingSupport(state, map, nationId, toId, seen);
    if (support) defense = mergeForce(defense, support);
    const r = resolveCombat({ attacker, defender: scaleForce(defense, A().recallMargin), fortLevel: target.buildings?.fort || 0, fortBreach: fortBreach(state, toId), mode: 'land' });
    if (r.captured) continue;
    for (const m of mine) if (recallMarch(state, { nationId, marchId: m.id }).ok) { n++; stat(state, 'recalls'); }
  }
  return n;
}
/**
 * Renfort d'une province menacée par une armée visible qu'elle ne tiendrait pas : une part des troupes d'une province
 * voisine (qui garde de quoi tenir), si elle arrive avant le dernier assaut ; sinon, des fantassins recrutés sur place
 * s'ils sont livrés à temps. Capitale d'abord.
 */
export function aiDefend(state, map, nationId) {
  const seen = visibleProvinces(state, map, nationId), capital = state.nations[nationId]?.capitalId;
  const owned = map.provinces.filter(d => state.provinces[d.id]?.ownerId === nationId)
    .sort((a, b) => Number(b.id === capital) - Number(a.id === capital) || a.id.localeCompare(b.id));
  let n = 0;
  for (const d of owned) {
    const threat = incomingThreat(state, map, nationId, d.id, seen);
    if (!threat) continue;
    const p = state.provinces[d.id], fort = p.buildings?.fort || 0, breach = fortBreach(state, d.id);
    const help = ownMarchesTo(state, nationId, d.id).filter(m => m.arriveDay - 1 <= lastAssaultDay(threat.arriveDay));
    const garrison = mergeAll([garrisonForce(state, d.id), ...help.map(m => legacyForce(m))]);
    if (holds(garrison, threat.force, fort, breach)) continue;
    const deadline = lastAssaultDay(threat.arriveDay);
    let sent = false;
    const donors = (d.landConnections || []).filter(id => state.provinces[id]?.ownerId === nationId && !battleAt(state, id))
      .sort((a, b) => combatValue({ units: availableForces(state, b) }) - combatValue({ units: availableForces(state, a) }) || a.localeCompare(b));
    for (const q of donors) {
      const avail = availableForces(state, q);
      for (const share of A().reinforceShares) {
        let units = Object.fromEntries(LAND_UNIT_TYPES.map(k => [k, Math.floor((avail[k] || 0) * share)]));
        if (state.day + landTravelDays(units, map, q, d.id) - 1 > deadline) units = Object.fromEntries(LAND_UNIT_TYPES.map(k => [k, k === 'cavalry' ? avail.cavalry || 0 : 0]));
        if (!LAND_UNIT_TYPES.some(k => units[k]) || state.day + landTravelDays(units, map, q, d.id) - 1 > deadline) break;
        // La province qui donne garde de quoi tenir (menace des voisins et des armées en route vers elle).
        const rest = splitForce(provinceForce(state.provinces[q]), units).rest, danger = landThreatForce(map, state, nationId, q);
        if (danger && !holds(rest, danger, state.provinces[q].buildings?.fort || 0, fortBreach(state, q))) continue;
        if (!holds(mergeForce(garrison, normalizeForce({ units })), threat.force, fort, breach) && share !== A().reinforceShares.at(-1)) continue;
        const r = queueMoveOrder(state, map, { nationId, fromId: q, toId: d.id, units });
        if (r.ok) { state.orders.find(o => o.id === r.orderId).defend = true; sent = true; n++; stat(state, 'reinforcements'); }
        break;
      }
      if (sent) break;
    }
    // Recrues livrées au plus tard la veille de l'arrivée ennemie (une province assiégée ne livre pas ses recrues).
    if (sent || !A().emergencyRecruit || state.day + R.durations.units.infantry - 1 > threat.arriveDay - 2) continue;
    // Pas de recrues d'urgence pour une nation qui ne se nourrit plus (elle garde son or pour la ferme, §4.5).
    if (foodProduction(state, nationId) < plannedConsumption(state, nationId)) continue;
    if (spendableTreasury(state, nationId) >= RULES.units.infantry.cost && queueRecruitment(state, { nationId, provinceId: d.id, type: 'infantry' }).ok) { n++; stat(state, 'emergencyRecruits'); }
  }
  return n;
}
/**
 * Ce que fait l'IA du jour AVANT son plan (planAIOrders) : retraites, rappels, renforts. Les réponses dues
 * (releaseAnswers) sont relâchées par day.js juste avant.
 */
export function aiReact(state, map, nationId) {
  if (!isRealtime(state) || state.controllers?.[nationId] !== 'ai' || state.nations[nationId]?.eliminated) return;
  aiRetreats(state, map, nationId);
  aiRecalls(state, map, nationId);
  aiDefend(state, map, nationId);
}
