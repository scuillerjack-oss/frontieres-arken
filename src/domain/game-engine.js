import { RULES, LAND_UNIT_TYPES } from './constants.js';
import { fortReductionPct } from './combat.js';
import { resolveBattle, resolveCombat, provinceForce, writeProvinceForce, legacyForce, toLegacy, splitForce, mergeForce, normalizeForce, healForce, combatValue, scaleForce, hasCombatUnits, emptyCounts, totalHp, maxHp, COMBAT_TYPES } from './combat.js';
export { resolveBattle, resolveCombat, provinceForce, combatValue } from './combat.js';
import { hostilityWars, HOSTILITY_WAR, HOSTILITY_WARNING, provokers, charmOf } from './leaders.js';
import { recordStrike, ensureLeaders, archetypeOf, reveal, reputation, recordAggression, getTension, setTension, addTension, acceptsAlliance, ceasefireBias,
  chance, pickFrom, strengthOf, recentAggressions, driftTension, observeLeaders, aliveNations, ARCHETYPE_LABELS } from './leaders.js';
import { publishTalk, aiTalk, aiOfferTalk, pruneTalkPending, neighbors } from './talk.js';
// V13 : demandes d'aide entre alliés (docs/V13-alliances-echanges.md).
import { resolveHelpRequests, expireHelpPacts, helpWarTargets, activeHelpPacts, helpJournalText } from './alliances.js';
// V12 : atouts du joueur humain (injectés dans state.bonuses par l'interface ; jamais pour les IA).
import { goldBonus, recruitAmount, buildTurnsGained, fortBonusFactor, navalBonusFactor } from './boosts.js';
// V13 : vision (brouillard de guerre) partagée par l'interface et l'IA (docs/V13-vision.md).
import { visibleProvinces, perceivedForce, perceivedStrength } from './vision.js';
export { visibleProvinces, provinceIntel, perceivedForce, perceivedStrength, prudentEstimate, visionSharers } from './vision.js';
// V13.4 : l'alliance inclut le droit de passage réciproque (troupes stationnées chez l'allié : passage.js).
import { hasPassage, stationedAt, stationedForce, addStationed, takeStationed, setStationedForce, guestsAt, settleStationed, stationedOf } from './passage.js';
export { hasPassage, stationedAt, stationedForce, guestsAt, stationedOf, garrisonForce, PASSAGE_TEXT } from './passage.js';

const sum = units => LAND_UNIT_TYPES.reduce((n, k) => n + (Number(units?.[k]) || 0), 0);
const provinceDef = (map, id) => map.provinces.find(p => p.id === id);
const safeNum = n => Number.isFinite(Number(n)) ? Number(n) : 0;
// V13 : élision (« d’Oroël », « de Solmara », « de Valmorne »).
const deName = name => /^[AEIOUYÉÈÊÎÏÔÖÛÜÀÂaeiouyéèêîïôöûüàâ]/.test(name) ? `d’${name}` : `de ${name}`;
const nationName = (map, id) => map.nations.find(n => n.id === id)?.short || 'Nation inconnue';
const pairWar = (state, a, b) => state.diplomacy.wars.some(w => w.active !== false && w.participants.includes(a) && w.participants.includes(b));
const pairTreaty = (state, a, b, type) => state.diplomacy.treaties.some(t => t.active !== false && t.type === type && t.parties.includes(a) && t.parties.includes(b));
const reservedDiplomaticFunds = (state, nationId) => (state.orders || []).filter(o => o.kind === 'diplomacy' && o.action === 'ceasefire' && o.nationId === nationId && o.status === 'pending').reduce((n,o)=>n+(o.amount||0),0);
export const spendableTreasury = (state, nationId) => Math.max(0,(state.nations[nationId]?.treasury||0)-reservedDiplomaticFunds(state,nationId));

/** V13.1 : détail du revenu par tour (provinces, banques, usines, ports construits). */
export function incomeBreakdown(state, nationId) {
  const owned = Object.values(state.provinces).filter(p => p.ownerId === nationId);
  const count = key => owned.reduce((n, p) => n + (p.buildings?.[key] > 0 ? 1 : 0), 0);
  const provinces = owned.length, banks = count('bank'), factories = count('factory'), ports = count('port');
  const total = provinces * RULES.baseIncome + banks * RULES.bankIncome + factories * RULES.factoryIncome + ports * (RULES.portIncome || 0);
  return { provinces, banks, factories, ports, total };
}
export const incomeFor = (state, nationId) => incomeBreakdown(state, nationId).total;
/** V13.1 : or rapporté chaque tour par un bâtiment (0 pour la forteresse). */
export const buildingIncome = type => ({ bank: RULES.bankIncome, factory: RULES.factoryIncome, port: RULES.portIncome || 0 })[type] || 0;
// Puissances « V6 » conservées pour compatibilité (plus utilisées par les combats depuis la V10 : voir combat.js).
export const landPower = (u, defense = false) => LAND_UNIT_TYPES.reduce((n, k) => n + (u[k] || 0) * (defense && k === 'artillery' ? RULES.units[k].defensePower : RULES.units[k].power), 0);
export const navalPower = ({ units = {}, warships = 0, transport = false }) => warships * RULES.units.warship.power + landPower(units) * (transport ? RULES.navalTransportPowerFactor : 0);

// --- V10 marine : routes, côte d'arrivée, durée (docs/V10-marine.md) ----------------------------------------
const laneOf = (map, a, b) => (map.seaLanes || []).find(l => (l.from === a && l.to === b) || (l.from === b && l.to === a)) || null;
/** Durée d'une traversée en tours (= nombre d'étapes en mer) : max(minTurns, ⌈longueur / stageLength⌉). */
export const seaTravelTurns = length => Math.max(RULES.naval.minTurns, Math.ceil((Number(length) || 0) / RULES.naval.stageLength));
/**
 * V13 (docs/V13-marine.md) : côte d'arrivée d'une route = UNIQUEMENT le point de port au bout de la route
 * (construit ou non). Plus aucun débarquement sur les provinces voisines.
 */
export function landingCoast(map, endId) {
  const end = provinceDef(map, endId);
  return end ? [end.id] : [];
}
/** Routes maritimes au départ d'une province (qu'un port y soit construit ou non), toujours dans les deux sens. */
export function seaRoutesFrom(map, fromId) {
  return (map.maritimeRoutes || []).filter(([a, b]) => a === fromId || b === fromId).map(([a, b]) => {
    const via = a === fromId ? b : a, lane = laneOf(map, fromId, via);
    return { via, length: lane?.length ?? 0, turns: seaTravelTurns(lane?.length ?? 0) };
  });
}
/** Destinations par mer depuis une province (sans condition de port) : [{ id, type:'sea', via, turns }]. */
function seaDestinations(map, fromId) {
  const from = provinceDef(map, fromId), out = new Map();
  for (const r of seaRoutesFrom(map, fromId)) for (const id of landingCoast(map, r.via)) {
    if (id === fromId || provinceDef(map, id)?.landmassId === from?.landmassId) continue;
    const old = out.get(id);
    if (!old || r.turns < old.turns || (r.turns === old.turns && r.via.localeCompare(old.via) < 0)) out.set(id, { id, type: 'sea', via: r.via, turns: r.turns });
  }
  return [...out.values()].sort((a, b) => a.id.localeCompare(b.id));
}
/** V13 : point de port = province qui a un emplacement de port sur la carte et une route (construit ou non). */
export const isPortPoint = (map, id) => Boolean(provinceDef(map, id)?.port) && seaRoutesFrom(map, id).length > 0;
const ownedPortPoints = (map, state, nationId) => map.provinces.filter(d => state.provinces[d.id]?.ownerId === nationId && isPortPoint(map, d.id));
/**
 * Peut-on embarquer depuis cette province ? { ok, reason } — message clair pour l'interface.
 * V13 : depuis n'importe quel point de port, construit ou non, dès le tour 1 (la possession est vérifiée par l'ordre).
 */
export function embarkStatus(map, state, fromId) {
  const d = provinceDef(map, fromId), p = state.provinces[fromId];
  if (!d || !p) return { ok: false, reason: 'Province inconnue' };
  if (!isPortPoint(map, fromId)) {
    const points = ownedPortPoints(map, state, p.ownerId).map(x => x.name);
    return { ok: false, reason: points.length
      ? `${d.name} n’a pas de point de port. Embarquez depuis un point de port : ${points.join(', ')}.`
      : `${d.name} n’a pas de point de port et vous n’en possédez aucun : conquérez un point de port pour prendre la mer.` };
  }
  return { ok: true, reason: '' };
}
/** V13 : explication d'un refus vers une autre île (pas de point de port au départ, ou pas le port d'arrivée) ; '' sinon. */
export function seaMoveRefusal(map, state, fromId, toId) {
  const from = provinceDef(map, fromId), to = provinceDef(map, toId);
  if (!from || !to || from.landmassId === to.landmassId) return '';
  const st = embarkStatus(map, state, fromId);
  if (!st.ok) return st.reason;
  const ends = seaDestinations(map, fromId).map(x => provinceDef(map, x.id)?.name).filter(Boolean);
  return `On ne débarque qu’au point de port au bout de la route : depuis ${from.name}, la route mène à ${ends.join(', ')}.`;
}

export function legalDestinations(map, state, fromId) {
  const p = provinceDef(map, fromId);
  const out = (p?.landConnections || []).map(id => ({ id, type: 'land' }));
  // V13 : depuis un point de port (construit ou non) vers le point de port au bout de chaque route.
  if (state.provinces[fromId] && embarkStatus(map, state, fromId).ok) out.push(...seaDestinations(map, fromId).filter(x => !out.some(y => y.id === x.id)));
  return out.filter(x => state.provinces[x.id]);
}

function reservedAt(state, fromId, nationId = null) {
  return (state.orders || []).filter(o => o.kind === 'move' && o.fromId === fromId && o.status === 'pending' && (!nationId || o.nationId === nationId)).reduce((out, o) => {
    for (const k of LAND_UNIT_TYPES) out[k] = (out[k] || 0) + (o.units?.[k] || 0);
    out.warships = (out.warships || 0) + (o.warships || 0); return out;
  }, {});
}
/**
 * Forces encore libres dans une province. V13.4 : `nationId` (facultatif) = la nation qui donne l'ordre ; si ce n'est
 * pas le propriétaire, ce sont ses troupes STATIONNÉES chez son allié qui comptent.
 */
export function availableForces(state, fromId, nationId = null) {
  const p = state.provinces[fromId];
  if (p && nationId && p.ownerId !== nationId) {
    const f = stationedForce(state, fromId, nationId), held = reservedAt(state, fromId, nationId);
    return Object.fromEntries([...LAND_UNIT_TYPES.map(k => [k, Math.max(0, f.units[k] - (held[k] || 0))]), ['warships', Math.max(0, f.units.warship - (held.warships || 0))]]);
  }
  const held = reservedAt(state, fromId, p ? p.ownerId : null);
  if (!p) return Object.fromEntries([...LAND_UNIT_TYPES, 'warships'].map(k => [k, 0]));
  return Object.fromEntries([...LAND_UNIT_TYPES.map(k => [k, Math.max(0, (p.units[k] || 0) - (held[k] || 0))]), ['warships', Math.max(0, (p.warships || 0) - (held.warships || 0))]]);
}

function queuedOrder(state, order) {
  state.orders ||= [];
  if (!order.id) {
    state.orderSequence = Math.max(1, Number(state.orderSequence) || 1);
    while (state.orders.some(existing => existing.id === `o${state.orderSequence}`)) state.orderSequence++;
    order.id = `o${state.orderSequence++}`;
  }
  state.orders.push({ ...order, turn: state.turn, status: 'pending' });
  return { ok: true, orderId: order.id };
}
const BUILDING_CAP_ERRORS = {
  bank: 'Une seule banque par province (déjà construite ou en construction)',
  factory: 'Une seule usine par province (déjà construite ou en construction)',
  fort: 'Forteresse déjà au niveau 3 (maximum), en comptant les niveaux en construction',
  port: 'Un port existe ou est déjà en construction'
};
/** Nombre d'exemplaires d'un bâtiment dans une province : construits + en file + commandés ce tour. */
export function buildingCount(state, provinceId, type) {
  const p = state.provinces[provinceId];
  const active = (state.productionQueue || []).filter(q => q.kind === 'building' && q.provinceId === provinceId && q.type === type).length;
  const pending = (state.orders || []).filter(o => o.kind === 'construction' && o.provinceId === provinceId && o.type === type && o.status === 'pending').length;
  return (p?.buildings?.[type] || 0) + active + pending;
}
export const FORT_IN_PROGRESS = 'Forteresse : un niveau est déjà en construction, attendez qu’il soit terminé';
export function queueConstruction(state, { nationId, provinceId, type }) {
  const p = state.provinces[provinceId], r = RULES.buildings[type];
  if (!p || p.ownerId !== nationId) return { ok: false, error: 'Province non contrôlée' };
  if (!r) return { ok: false, error: 'Construction indisponible' };
  if (type === 'port' && !p.portSite) return { ok: false, error: 'Cette province ne peut pas accueillir de port' };
  const count = buildingCount(state, provinceId, type);
  // V10 : plafonds par province, file de construction comprise (RULES.buildings[type].max).
  if (count >= (r.max ?? Infinity)) return { ok: false, error: BUILDING_CAP_ERRORS[type] || 'Maximum atteint dans cette province' };
  // V13.3 (Jack) : la forteresse se construit un niveau à la fois — le niveau 2 ne se lance qu'une fois le 1 terminé.
  if (type === 'fort' && count > (p.buildings.fort || 0)) return { ok: false, error: FORT_IN_PROGRESS };
  const cost = type === 'fort' ? r.costs[count] : r.cost;
  if (spendableTreasury(state,nationId) < cost) return { ok: false, error: 'Trésor insuffisant ou réservé à un cessez-le-feu' };
  state.nations[nationId].treasury -= cost;
  return { ...queuedOrder(state, { kind: 'construction', nationId, provinceId, type, cost, duration: r.turns }), cost };
}

export function queueRecruitment(state, { nationId, provinceId, type, lots = 1 }) {
  const p = state.provinces[provinceId], r = RULES.units[type], count = Math.max(1, Math.floor(safeNum(lots)));
  if (!p || p.ownerId !== nationId) return { ok: false, error: 'Province non contrôlée' };
  if (!r) return { ok: false, error: 'Unité inconnue' };
  // V13 : un navire de guerre exige un port CONSTRUIT et une usine dans la même province (le point de port ne suffit pas).
  if (r.requiresPort && r.requiresFactory && (!p.buildings.port || !p.buildings.factory)) return { ok: false, error: `Navire de guerre : il faut un port construit et une usine dans cette province (manque : ${[!p.buildings.port && 'port', !p.buildings.factory && 'usine'].filter(Boolean).join(' et ')})` };
  if (r.requiresFactory && !p.buildings.factory) return { ok: false, error: 'Usine requise' };
  if (r.requiresPort && !p.buildings.port) return { ok: false, error: 'Port requis' };
  const cost = r.cost * count;
  if (spendableTreasury(state,nationId) < cost) return { ok: false, error: 'Trésor insuffisant ou réservé à un cessez-le-feu' };
  state.nations[nationId].treasury -= cost;
  return { ...queuedOrder(state, { kind: 'recruitment', nationId, provinceId, type, lots: count, amount: r.amount * count, cost, duration: r.turns }), cost, amount: r.amount * count };
}

export function queueMoveOrder(state, map, { nationId, fromId, toId, units = {}, warships = 0 }) {
  const from = state.provinces[fromId], route = legalDestinations(map, state, fromId).find(x => x.id === toId);
  // V13.4 : on peut aussi donner un ordre à ses troupes stationnées chez un allié.
  const guest = from && from.ownerId !== nationId && hasPassage(state, nationId, from.ownerId) && stationedAt(state, fromId, nationId);
  if (!from || (from.ownerId !== nationId && !guest)) return { ok: false, error: 'Origine non contrôlée' };
  if (!route) {
    // V13 : message clair pour une destination sur une autre île (pas de point de port, ou pas le port d'arrivée).
    const refusal = seaMoveRefusal(map, state, fromId, toId);
    if (refusal) return { ok: false, error: refusal };
    return { ok: false, error: 'Aucune route visible ou aucun port opérationnel' };
  }
  // V13 : on n'attaque pas un allié. V13.4 : l'alliance donne le droit de passage — un ordre vers une province alliée
  // est un PASSAGE (les troupes y stationnent et la défendent), sauf si la rupture de l'alliance est déjà ordonnée.
  const targetOwner = state.provinces[toId]?.ownerId;
  const passage = Boolean(targetOwner && targetOwner !== nationId && hasPassage(state, nationId, targetOwner) && !pendingBreak(state, nationId, targetOwner));
  const available = availableForces(state, fromId, nationId), committed = Object.fromEntries(LAND_UNIT_TYPES.map(k => [k, Math.max(0, Math.floor(safeNum(units[k])))]));
  if (LAND_UNIT_TYPES.some(k => committed[k] > available[k])) return { ok: false, error: 'Ces unités sont déjà réservées dans un autre ordre' };
  const ships = Math.max(0, Math.floor(safeNum(warships)));
  if (ships > available.warships) return { ok: false, error: 'Ces navires sont déjà réservés dans un autre ordre' };
  if (!sum(committed) && !ships) return { ok: false, error: 'Aucune force sélectionnée' };
  // V10 : les navires de guerre ne se battent qu'en mer ; ils ne se déplacent que par mer.
  if (ships && route.type !== 'sea') return { ok: false, error: 'Les navires de guerre ne se déplacent que par mer' };
  return queuedOrder(state, { kind: 'move', nationId, fromId, toId, units: committed, warships: ships, routeType: route.type, ...(route.type === 'sea' ? { via: route.via, turns: route.turns } : {}), ...(passage ? { passage: true } : {}), ...(guest ? { guest: true } : {}) });
}
const pendingBreak = (state, nationId, target) => (state.orders || []).some(o => o.kind === 'diplomacy' && o.action === 'break' && o.status === 'pending' && o.nationId === nationId && o.target === target);
// Kept as a compatibility name; since V4 this only queues an order.
export const moveForce = queueMoveOrder;

/**
 * V13.2 — cessez-le-feu au montant choisi : `pay` = or que l'on verse à l'adversaire, `demand` = or qu'on exige de
 * lui (le dominant impose ses conditions). Probabilité d'acceptation estimée selon le rapport de forces et la
 * somme ; la personnalité du dirigeant visé la déplace encore à la résolution (ceasefireBias), en secret.
 */
export function ceasefireChance(state, from, target, { pay = 0, demand = 0 } = {}) {
  const sf = strengthOf(state, from), st = strengthOf(state, target), d = sf + st > 0 ? sf / (sf + st) : .5;
  const tT = Math.max(0, state.nations[target]?.treasury || 0);
  let p = Math.max(.05, Math.min(.7, .1 + (d - .4)));
  if (pay > 0) p += .6 * Math.min(1, pay / Math.max(30, tT * .5 + 20));
  if (demand > 0) p -= (demand / Math.max(20, tT)) * Math.max(.2, 1.1 - d);
  return Math.round(Math.max(0, Math.min(.95, p)) * 100) / 100;
}
export const CEASEFIRE_PROPOSAL_BONUS = .4;
/** V13.2 (relecture) : on exige au plus la moitié du trésor adverse — pas de « racket » d'un trésor entier. */
export const maxCeasefireDemand = (state, target) => Math.floor(Math.max(0, state.nations[target]?.treasury || 0) / 2);
export function queueDiplomaticOrder(state, { nationId, target, action, offerLevel = .5, pay, demand }) {
  if(action==='ultimatum')action='ceasefire';
  if (!state.nations[target] || nationId === target) return { ok: false, error: 'Cible invalide' };
  if (!['war', 'alliance', 'ceasefire', 'break'].includes(action)) return { ok: false, error: 'Action indisponible en V5' };
  if ((state.orders || []).some(o => o.kind === 'diplomacy' && o.nationId === nationId && o.target === target && o.status === 'pending')) return { ok: false, error: 'Une action envers ce pays est déjà prévue pour l’inter-tour' };
  const atWar = pairWar(state, nationId, target), relation = (state.diplomacy.treaties || []).find(t => t.active !== false && t.parties.includes(nationId) && t.parties.includes(target))?.type || 'neutral';
  if (action === 'ceasefire' && !atWar) return { ok: false, error: 'Aucune guerre active' };
  if (action === 'alliance' && (atWar || relation === 'alliance')) return { ok: false, error: 'Un cessez-le-feu est requis et une alliance existe déjà' };
  if (action === 'war' && atWar) return { ok: false, error: 'Déjà en guerre' };
  // V13 : pas de guerre entre alliés — il faut d'abord rompre l'alliance (action 'break', résolue en tout début
  // d'inter-tour ; rompre ET attaquer dans le même tour est une TRAHISON publique).
  if (action === 'war' && relation === 'alliance') return { ok: false, error: 'Vous êtes alliés : rompez d’abord l’alliance' };
  if (action === 'break' && relation !== 'alliance') return { ok: false, error: 'Aucune alliance à rompre' };
  let offer = {};
  if (action === 'ceasefire' && (pay !== undefined || demand !== undefined)) {
    const give = Math.max(0, Math.floor(Number(pay) || 0)), ask = Math.max(0, Math.floor(Number(demand) || 0));
    if (give && ask) return { ok: false, error: 'Choisissez : payer ou exiger, pas les deux' };
    if (ask > Math.max(0, state.nations[target].treasury)) return { ok: false, error: 'Vous exigez plus que son trésor' };
    if (ask > maxCeasefireDemand(state, target)) return { ok: false, error: 'On ne peut exiger plus de la moitié de son trésor' };
    if (spendableTreasury(state, nationId) < give) return { ok: false, error: 'Trésor insuffisant après les sommes déjà réservées' };
    offer = { custom: true, amount: give, demand: ask, acceptanceProbability: ceasefireChance(state, nationId, target, { pay: give, demand: ask }) };
  } else if (action === 'ceasefire') {
    const level = Number(offerLevel);
    if (![.25,.5,.75].includes(level)) return { ok:false,error:'Niveau d’offre invalide' };
    const amount = Math.floor(Math.max(0,state.nations[target].treasury) * level);
    const acceptanceProbability = 1 - level;
    if (spendableTreasury(state,nationId) < amount) return { ok:false,error:'Trésor insuffisant après les sommes déjà réservées' };
    offer = { offerLevel:level, acceptanceProbability, amount };
  }
  return queuedOrder(state, { kind: 'diplomacy', nationId, target, action, ...offer });
}

function ensureWar(state, attacker, defender) {
  if (pairWar(state, attacker, defender)) return;
  // V10 : attaquer = guerre automatique, dans les deux sens (une guerre lie les deux participants), traités rompus.
  openWar(state, attacker, defender, 'combat');
}
/**
 * Ouverture d'une guerre (attaque ou déclaration). V11 : attaquer un allié est une TRAHISON (événement public ;
 * le Traître est alors révélé) ; l'agression est mémorisée et fait monter la tension (leaders.js).
 */
function openWar(state, attacker, defender, reason) {
  const wasAllied = pairTreaty(state, attacker, defender, 'alliance');
  // V14.0 : rompre une trêve signée depuis moins de TRUCE_BETRAYAL_TURNS tours est aussi une trahison.
  const truce = !wasAllied && recentTruce(state, attacker, defender);
  state.diplomacy.treaties = state.diplomacy.treaties.filter(t => !(t.parties?.includes(attacker) && t.parties?.includes(defender)));
  state.diplomacy.wars = state.diplomacy.wars.filter(w => !(w.participants.includes(attacker) && w.participants.includes(defender)));
  state.diplomacy.wars.push({ active: true, participants: [attacker, defender], started: state.turn });
  dropProposals(state, attacker, defender);
  if (reason === 'combat') state.events.push({ turn: state.turn, type: 'diplomacy', nationId: attacker, target: defender, relation: 'war', reason: 'combat' });
  if (wasAllied) {
    state.events.push({ turn: state.turn, type: 'betrayal', nationId: attacker, target: defender });
    reputation(state, attacker).betrayals++;
    if (state.controllers?.[attacker] === 'ai' && archetypeOf(state, attacker) === 'traitre') reveal(state, attacker, 'betrayal');
  } else if (truce) {
    // Même effet de réputation qu'une alliance trahie : événement public TRAHISON, compteur, Traître révélé.
    state.events.push({ turn: state.turn, type: 'betrayal', nationId: attacker, target: defender, truce: true, truceTurns: state.turn - truce.started });
    reputation(state, attacker).betrayals++;
    if (state.controllers?.[attacker] === 'ai' && archetypeOf(state, attacker) === 'traitre') reveal(state, attacker, 'betrayal');
  }
  recordAggression(state, attacker, defender, reason);
}
/**
 * V14.1 — guerre automatique (décision de Jack, 20/10/2026 : « si mes troupes affrontent qui que ce soit, même pour
 * défendre un allié, ça me met donc en guerre avec, au joueur de gérer ses choix politiques après »).
 * `nationId` (dont les troupes ont combattu, en défense) entre en guerre avec `enemy`. Une trêve (ou un traité) avec
 * lui est rompu de fait, SANS trahison : on se défendait (pas d'événement TRAHISON, pas de compteur, pas d'agression
 * mémorisée). Jamais entre alliés (les appelants les écartent du combat), jamais avec une nation éliminée.
 */
function autoWar(state, nationId, enemy, provinceId, host = null) {
  if (!nationId || !enemy || nationId === enemy || !state.nations[nationId] || !state.nations[enemy]) return false;
  if (state.nations[nationId].eliminated || state.nations[enemy].eliminated || pairWar(state, nationId, enemy)) return false;
  if (pairTreaty(state, nationId, enemy, 'alliance')) return false; // filet de sécurité : deux alliés ne se combattent pas
  const brokeTruce = pairTreaty(state, nationId, enemy, 'ceasefire');
  state.diplomacy.treaties = state.diplomacy.treaties.filter(t => !(t.parties?.includes(nationId) && t.parties?.includes(enemy)));
  state.diplomacy.wars.push({ active: true, participants: [nationId, enemy], started: state.turn, auto: true });
  dropProposals(state, nationId, enemy);
  state.events.push({ turn: state.turn, type: 'auto-war', nationId, target: enemy, provinceId, host, ...(brokeTruce ? { brokeTruce: true } : {}) });
  return true;
}
/**
 * V14.2 — guerre déclarée par l'hostilité (tension ≥ 85 %), entre deux nations sans alliance ni trêve. Pas une
 * agression : ni trahison, ni réputation, ni indignation des Héros. Événement public « hostility-war » au journal.
 */
function hostilityWar(state, a, b, value) {
  if (pairWar(state, a, b) || state.nations[a]?.eliminated || state.nations[b]?.eliminated) return false;
  state.diplomacy.wars.push({ active: true, participants: [a, b], started: state.turn, hostility: true });
  dropProposals(state, a, b);
  state.events.push({ turn: state.turn, type: 'hostility-war', nationId: a, target: b, value: Math.round(value) });
  return true;
}
/** V14.0 : en dessous de ce nombre de tours, rompre une trêve est une trahison (Jack, cahier V14 §3 point 2). */
export const TRUCE_BETRAYAL_TURNS = 10;
/** Trêve en cours entre a et b signée depuis moins de TRUCE_BETRAYAL_TURNS tours, ou null (ancienne sauvegarde sans date : null). */
export function recentTruce(state, a, b) {
  const t = (state.diplomacy?.treaties || []).find(x => x.active !== false && x.type === 'ceasefire' && x.parties?.includes(a) && x.parties?.includes(b));
  return t && Number.isFinite(t.started) && state.turn - t.started < TRUCE_BETRAYAL_TURNS ? t : null;
}
/** V14.0 : rompre la trêve avec `target` maintenant serait-il une trahison ? { betrayal, since, left } (pour la fenêtre de confirmation). */
export function truceBreakStatus(state, nationId, target) {
  const t = recentTruce(state, nationId, target);
  if (!t) return { betrayal: false, since: null, left: 0 };
  const since = state.turn - t.started;
  return { betrayal: true, since, left: TRUCE_BETRAYAL_TURNS - since };
}
// Propositions des IA au joueur (alliance, cessez-le-feu) : il répond par un échange (amical = accepte).
const PROPOSAL_TURNS = 6;
function dropProposals(state, a, b) {
  state.diplomacy.proposals = (state.diplomacy.proposals || []).filter(p => !([p.from, p.to].includes(a) && [p.from, p.to].includes(b)));
}
export function activeProposal(state, from, to, action) {
  return (state.diplomacy.proposals || []).find(p => p.from === from && p.to === to && (!action || p.action === action) && p.turn > state.turn - PROPOSAL_TURNS) || null;
}
/** V13.2 : une proposition d'IA rendue caduque dans le même inter-tour (trêve déjà conclue) ne s'affiche plus au journal. */
function supersedeProposalEvents(state, a, b) {
  for (let i = (state.events || []).length - 1; i >= 0 && state.events[i].turn === state.turn; i--) {
    const e = state.events[i];
    if (e.type === 'diplomatic-action' && e.proposal && [e.nationId, e.target].includes(a) && [e.nationId, e.target].includes(b)) e.superseded = true;
  }
}
function makeAlliance(state, a, b) {
  state.diplomacy.wars = state.diplomacy.wars.filter(w => !(w.participants.includes(a) && w.participants.includes(b)));
  state.diplomacy.treaties = state.diplomacy.treaties.filter(t => !(t.parties?.includes(a) && t.parties?.includes(b)));
  state.diplomacy.treaties.push({ active: true, type: 'alliance', parties: [a, b], started: state.turn });
  setTension(state, a, b, Math.min(getTension(state, a, b), 5), 'alliance');
  dropProposals(state, a, b); supersedeProposalEvents(state, a, b); clearRefusals(state, a, b);
}
function makeCeasefire(state, a, b) {
  state.diplomacy.wars = state.diplomacy.wars.filter(w => !(w.participants.includes(a) && w.participants.includes(b)));
  state.diplomacy.treaties = state.diplomacy.treaties.filter(t => !(t.parties?.includes(a) && t.parties?.includes(b)));
  state.diplomacy.treaties.push({ active: true, type: 'ceasefire', parties: [a, b], started: state.turn });
  setTension(state, a, b, Math.min(getTension(state, a, b), 40), 'ceasefire');
  dropProposals(state, a, b); supersedeProposalEvents(state, a, b); clearRefusals(state, a, b);
}

// --- V10 : déplacements et combats simultanés ------------------------------------------------------------
const lossCount = byType => COMBAT_TYPES.reduce((n, k) => n + (byType?.[k] || 0), 0);
const isEmptyForce = f => COMBAT_TYPES.every(k => !f.units[k]);
/** Prélève dans la province d'origine les forces d'un ordre (blessures comprises). null si l'origine est perdue. */
function takeOrderForces(state, order) {
  const p = state.provinces[order.fromId];
  const counts = { ...Object.fromEntries(LAND_UNIT_TYPES.map(k => [k, order.units?.[k] || 0])), warship: order.warships || 0 };
  // V13.4 : troupes stationnées chez un allié (toujours allié au moment du départ).
  if (p && p.ownerId !== order.nationId && hasPassage(state, order.nationId, p.ownerId) && stationedAt(state, order.fromId, order.nationId)) return takeStationed(state, order.nationId, order.fromId, counts);
  if (!p || p.ownerId !== order.nationId) return null;
  const { taken, rest } = splitForce(provinceForce(p), counts);
  writeProvinceForce(p, rest);
  return taken;
}
const addToProvince = (p, force) => writeProvinceForce(p, mergeForce(provinceForce(p), force));
const queueItemCost = q => Number.isFinite(q.cost) ? q.cost : q.kind === 'building'
  ? (q.type === 'fort' ? RULES.buildings.fort.costs[0] : RULES.buildings[q.type]?.cost || 0)
  : Math.round((RULES.units[q.type]?.cost || 0) * (q.amount || 0) / (RULES.units[q.type]?.amount || 1));

/** Province qui change de main : production annulée et remboursée (B4), pillage de capitale (V10). */
function onCapture(state, provinceId, newOwner, oldOwner) {
  const capital = state.nations[oldOwner]?.capitalId === provinceId;
  if (capital) {
    let chest = 0;
    if (!state.warChestsClaimed[provinceId]) { state.warChestsClaimed[provinceId] = true; chest = RULES.warChestAmount; state.nations[newOwner].treasury += RULES.warChestAmount; state.events.push({ turn: state.turn, type: 'war-chest', attacker: newOwner, defender: oldOwner, provinceId, amount: RULES.warChestAmount }); }
    // V13 : un minimum garanti (RULES.capitalPlunderMin) — payé même si la victime est pauvre : elle donne ce
    // qu'elle a, le reste est le butin de la ville (jamais de trésor négatif).
    const treasury = Math.max(0, state.nations[oldOwner].treasury), share = Math.floor(treasury * RULES.capitalPlunderRate);
    const amount = Math.max(share, RULES.capitalPlunderMin ?? 0), fromTreasury = Math.min(amount, treasury), loot = amount - fromTreasury;
    state.nations[oldOwner].treasury -= fromTreasury; state.nations[newOwner].treasury += amount;
    state.events.push({ turn: state.turn, type: 'capital-plunder', attacker: newOwner, defender: oldOwner, provinceId, amount, fromTreasury, loot, rate: RULES.capitalPlunderRate,
      warChest: chest });
  }
  // B4 : la production en cours dans la province perdue est annulée et remboursée intégralement à celui qui l'a payée.
  const lost = (state.productionQueue || []).filter(q => q.provinceId === provinceId && q.nationId !== newOwner);
  for (const q of lost) refundProduction(state, q, provinceId);
  state.productionQueue = (state.productionQueue || []).filter(q => !lost.includes(q));
}
function refundProduction(state, q, provinceId) {
  const amount = queueItemCost(q);
  if (state.nations[q.nationId]) state.nations[q.nationId].treasury += amount;
  state.events.push({ turn: state.turn, type: 'production-lost', nationId: q.nationId, provinceId, productionType: q.type, kind: q.kind, refund: amount });
}

/**
 * Un affrontement dans une province : tous les groupes attaquants (une entrée par nation) contre la garnison.
 * groups : [{ nationId, force, originIds:[...], mode:'land'|'landing', retreatTo:[...] }]
 * Renvoie la liste des replis (survivants des attaquants non vainqueurs), appliqués par l'appelant.
 */
function fight(state, toId, groups, fought, { naval = false } = {}) {
  const target = state.provinces[toId], defender = target.ownerId;
  groups = groups.filter(g => g.nationId !== defender && !isEmptyForce(g.force)).sort((a, b) => a.nationId.localeCompare(b.nationId));
  if (!groups.length) return [];
  for (const g of groups) { ensureWar(state, g.nationId, defender); recordStrike(state, g.nationId, defender); }
  // V13.4 : les troupes alliées stationnées défendent la province avec la garnison (sauf contre leur propre allié).
  // V14.1 : deux alliés ne se combattent jamais — un contingent allié d'un des assaillants reste à l'écart ; une nation
  // éliminée (ancienne sauvegarde) ne défend plus.
  const guests = guestsAt(state, toId).filter(e => !state.nations[e.nationId]?.eliminated && !groups.some(g => g.nationId === e.nationId || pairTreaty(state, e.nationId, g.nationId, 'alliance')));
  // V14.1 (décision de Jack) : des troupes qui combattent mettent leur nation en guerre avec l'adversaire, même pour
  // défendre un allié.
  for (const e of guests) for (const g of groups) autoWar(state, e.nationId, g.nationId, toId, defender);
  const own = provinceForce(target);
  const before = guests.reduce((f, e) => mergeForce(f, legacyForce(e)), own);
  const res = resolveBattle({ defender: before, attackers: groups.map(g => ({ id: g.nationId, force: g.force, mode: g.mode, warshipFactor: navalBonusFactor(state, g.nationId) })), fortLevel: target.buildings.fort || 0,
    fortBonus: fortBonusFactor(state, defender), defenderWarshipFactor: navalBonusFactor(state, defender) });
  fought.add(toId);
  // V14.1 : un assaillant repoussé a vu la garnison ; il s'en souvient (l'IA ne retente pas un débarquement suicide).
  if (!res.captured) for (const g of groups) rememberGarrison(state, g.nationId, toId, before);
  const retreats = [];
  res.attackers.forEach((a, i) => { if (a.id !== res.winnerId && !isEmptyForce(a.force)) retreats.push({ nationId: a.id, force: a.force, to: groups[i].retreatTo || groups[i].originIds }); });
  const guestLosses = {}, guestHpLost = {};
  if (res.captured) {
    for (const e of guests) { guestLosses[e.nationId] = Object.fromEntries(COMBAT_TYPES.map(k => [k, legacyForce(e).units[k]])); guestHpLost[e.nationId] = totalHp(legacyForce(e)); setStationedForce(state, e.nationId, toId, normalizeForce({})); }
    target.ownerId = res.winnerId; writeProvinceForce(target, res.attackers.find(a => a.id === res.winnerId).force);
  } else if (guests.length) {
    // Survivants répartis au prorata de chaque contingent, type par type (le reste revient au propriétaire).
    let left = res.defender;
    for (const e of guests) {
      const g = legacyForce(e), counts = Object.fromEntries(COMBAT_TYPES.map(k => [k, before.units[k] ? Math.floor(res.defender.units[k] * g.units[k] / before.units[k]) : 0]));
      const parts = splitForce(left, counts); left = parts.rest;
      guestLosses[e.nationId] = Object.fromEntries(COMBAT_TYPES.map(k => [k, g.units[k] - parts.taken.units[k]]));
      guestHpLost[e.nationId] = Math.max(0, totalHp(g) - totalHp(parts.taken)); // V14.0 : PV perdus, blessés compris
      setStationedForce(state, e.nationId, toId, parts.taken);
    }
    writeProvinceForce(target, left);
  } else writeProvinceForce(target, res.defender);
  // V13.4 : pertes du propriétaire = pertes totales de la garnison moins celles des renforts alliés.
  const ownLosses = Object.fromEntries(COMBAT_TYPES.map(k => [k, Math.max(0, (res.defenderLossesByType[k] || 0) - Object.values(guestLosses).reduce((n, l) => n + (l[k] || 0), 0))]));
  const primary = res.winnerId || [...res.attackers].sort((x, y) => totalHp(y.force) - totalHp(x.force) || x.id.localeCompare(y.id))[0].id;
  state.events.push({
    turn: state.turn, type: res.captured ? 'conquest' : 'battle', attacker: primary, attackers: groups.map(g => g.nationId), defender,
    ...(res.captured ? { newOwnerId: res.winnerId } : {}), provinceId: toId, originIds: groups.flatMap(g => g.originIds), naval: groups.some(g => g.mode === 'landing') || naval,
    attackerLosses: res.attackers.reduce((n, a) => n + lossCount(a.lossesByType), 0), defenderLosses: lossCount(res.defenderLossesByType),
    attackerHpLost: res.attackers.reduce((n, a) => n + a.hpLost, 0), defenderHpLost: res.defenderHpLost,
    lossesByNation: Object.fromEntries([...res.attackers.map(a => [a.id, a.lossesByType]), [defender, ownLosses], ...Object.entries(guestLosses)]),
    // V13.3 : forces engagées et PV perdus par camp (le joueur comprend pourquoi il perd 340 hommes contre 62).
    engagedByNation: Object.fromEntries([...groups.map(g => [g.nationId, { ...g.force.units }]), [defender, { ...own.units }], ...guests.map(e => [e.nationId, { ...legacyForce(e).units }])]),
    // V14.0 : les PV perdus par les troupes alliées stationnées sont comptés à part (avant : tout au propriétaire).
    hpLostByNation: Object.fromEntries([...res.attackers.map(a => [a.id, a.hpLost]), [defender, Math.max(0, res.defenderHpLost - Object.values(guestHpLost).reduce((n, v) => n + v, 0))], ...Object.entries(guestHpLost)]),
    passes: res.passes.length, fortLevel: target.buildings.fort || 0, ...(groups.some(g => g.mode === 'landing') ? { landingPct: Math.round(RULES.combat.landingPenalty * 100) } : {}), fortPct: fortReductionPct(target.buildings.fort || 0, fortBonusFactor(state, defender)),
    ...(guests.length ? { guests: guests.map(e => e.nationId), guestLosses } : {})
  });
  if (res.captured) onCapture(state, toId, res.winnerId, defender);
  return retreats;
}
/** Repli : les survivants d'une attaque non victorieuse rentrent dans la 1re province d'origine encore à eux ; sinon perdus. */
function applyRetreats(state, retreats) {
  for (const r of retreats) {
    const home = (r.to || []).find(id => state.provinces[id]?.ownerId === r.nationId);
    const ally = !home && (r.to || []).find(id => hasPassage(state, r.nationId, state.provinces[id]?.ownerId));
    if (home) addToProvince(state.provinces[home], r.force);
    else if (ally) addStationed(state, r.nationId, ally, r.force); // V13.4 : retour chez l'allié d'où l'on est parti
    else state.events.push({ turn: state.turn, type: 'retreat-lost', nationId: r.nationId, provinceId: (r.to || [])[0], amount: unitCount(r.force) });
  }
}
const unitCount = f => COMBAT_TYPES.reduce((n, k) => n + (f.units[k] || 0), 0);

/**
 * Résolution des ordres de déplacement, en trois temps (règle V10, documentée dans docs/V10-moteur.md) :
 *  0. Transferts amicaux et embarquements (ordres par mer, mécanique V9 inchangée) ;
 *  1. « Défense d'abord » : une province attaquée qui devait elle-même lancer une attaque se défend d'abord avec
 *     TOUTE sa garnison, contre les attaquants venus de provinces non attaquées ;
 *  2. Toutes les autres attaques partent en même temps. Une attaque dont l'origine est tombée en 1 est annulée
 *     sans combat ni déclaration de guerre (B1). Toutes les nations qui visent une même province combattent
 *     ensemble contre la garnison (B2) ; les combats d'une même vague sont indépendants de l'ordre de traitement.
 */
function aggregateMoves(state, map, orders, fought) {
  const moves = orders.filter(x => x.kind === 'move').sort((a, b) => a.fromId.localeCompare(b.fromId) || a.toId.localeCompare(b.toId) || a.nationId.localeCompare(b.nationId) || String(a.id).localeCompare(String(b.id)));
  const owner0 = Object.fromEntries(Object.entries(state.provinces).map(([id, p]) => [id, p.ownerId]));
  // V13.4 : passage chez un allié (terre). Un ordre de passage dont l'alliance a été rompue entre-temps est annulé
  // (les troupes restent chez elles : jamais de guerre involontaire).
  const passageLost = moves.filter(x => x.passage && x.routeType !== 'sea' && owner0[x.toId] !== x.nationId && !hasPassage(state, x.nationId, owner0[x.toId]));
  for (const o of passageLost) state.events.push({ turn: state.turn, type: 'attack-cancelled', nationId: o.nationId, fromId: o.fromId, provinceId: o.toId, reason: 'passage-lost' });
  const toAlly = x => x.routeType !== 'sea' && owner0[x.toId] !== x.nationId && hasPassage(state, x.nationId, owner0[x.toId]);
  // 0. Transferts amicaux (terre, chez soi ou chez un allié) et tous les embarquements (mer).
  for (const o of moves.filter(x => !passageLost.includes(x) && (owner0[x.toId] === x.nationId || x.routeType === 'sea' || toAlly(x)))) {
    if (o.routeType !== 'sea' && o.guest && state.provinces[o.fromId]?.ownerId !== o.nationId && !hasPassage(state, o.nationId, state.provinces[o.fromId]?.ownerId)) continue;
    const force = takeOrderForces(state, o);
    if (!force) continue;
    if (o.routeType === 'sea') embark(state, map, o, force);
    else if (toAlly(o)) addStationed(state, o.nationId, o.toId, force);
    else addToProvince(state.provinces[o.toId], force);
    if (o.routeType !== 'sea' && toAlly(o)) state.events.push({ turn: state.turn, type: 'movement', nationId: o.nationId, fromId: o.fromId, toId: o.toId, amount: unitCount(force), passage: true, target: owner0[o.toId] });
    else if (owner0[o.toId] === o.nationId) state.events.push({ turn: state.turn, type: 'movement', nationId: o.nationId, fromId: o.fromId, toId: o.toId, amount: unitCount(force) });
  }
  const attacks = moves.filter(x => owner0[x.toId] !== x.nationId && x.routeType !== 'sea' && !toAlly(x) && !passageLost.includes(x));
  const underAttack = new Set(attacks.map(o => o.toId));
  const group = list => {
    const byNation = new Map();
    for (const { o, force } of list) {
      const g = byNation.get(o.nationId) || { nationId: o.nationId, force: emptyForceLocal(), originIds: [], mode: 'land' };
      g.force = mergeForce(g.force, force); if (!g.originIds.includes(o.fromId)) g.originIds.push(o.fromId);
      byNation.set(o.nationId, g);
    }
    return [...byNation.values()];
  };
  // 1. Défense d'abord.
  const wave1Targets = [...new Set(attacks.filter(o => underAttack.has(o.fromId)).map(o => o.fromId))].filter(id => underAttack.has(id)).sort();
  const wave1 = attacks.filter(o => wave1Targets.includes(o.toId) && !underAttack.has(o.fromId));
  const retreats1 = [];
  for (const toId of wave1Targets) {
    const list = wave1.filter(o => o.toId === toId).map(o => ({ o, force: takeOrderForces(state, o) })).filter(x => x.force && !isEmptyForce(x.force));
    retreats1.push(...fight(state, toId, group(list), fought));
  }
  applyRetreats(state, retreats1);
  // 2. Toutes les autres attaques : départs simultanés, puis combats.
  const departures = [];
  for (const o of attacks.filter(x => !wave1.includes(x))) {
    if (state.provinces[o.fromId]?.ownerId !== o.nationId && !(o.guest && hasPassage(state, o.nationId, state.provinces[o.fromId]?.ownerId) && stationedAt(state, o.fromId, o.nationId))) {
      // V13.4 : un ordre donné depuis chez un ancien allié (alliance rompue) n'est pas une « province tombée ».
      state.events.push({ turn: state.turn, type: 'attack-cancelled', nationId: o.nationId, fromId: o.fromId, provinceId: o.toId, reason: o.guest ? 'passage-lost' : 'origin-lost' });
      continue;
    }
    const force = takeOrderForces(state, o);
    if (force && !isEmptyForce(force)) departures.push({ o, force });
  }
  // Armées qui se croisent sur une même frontière (A→B pendant que B→A) : choc frontal en rase campagne
  // (pas de forteresse, pas de prise), puis les survivants poursuivent vers leur cible.
  const pairsDone = new Set();
  for (const x of departures) {
    const key = [x.o.fromId, x.o.toId].sort().join('|');
    if (pairsDone.has(key)) continue;
    const ys = departures.filter(y => y.o.fromId === x.o.toId && y.o.toId === x.o.fromId && y.o.nationId !== x.o.nationId);
    const xs = departures.filter(y => y.o.fromId === x.o.fromId && y.o.toId === x.o.toId && y.o.nationId === x.o.nationId);
    if (!ys.length) continue;
    pairsDone.add(key);
    const sumForces = list => list.reduce((f, y) => mergeForce(f, y.force), emptyForceLocal());
    const [first, second] = [xs, ys].sort((l, r) => l[0].o.fromId.localeCompare(r[0].o.fromId));
    ensureWar(state, first[0].o.nationId, second[0].o.nationId);
    const r = resolveCombat({ attacker: sumForces(first), defender: sumForces(second), mode: 'land' });
    const share = (list, survivors) => { const total = sumForces(list); let left = survivors; list.forEach((y, i) => {
      if (i === list.length - 1) { y.force = left; return; }
      const counts = Object.fromEntries(COMBAT_TYPES.map(k => [k, total.units[k] ? Math.floor(survivors.units[k] * y.force.units[k] / total.units[k]) : 0]));
      const parts = splitForce(left, counts); y.force = parts.taken; left = parts.rest; }); };
    share(first, r.attacker); share(second, r.defender);
    state.events.push({ turn: state.turn, type: 'field-battle', attacker: first[0].o.nationId, defender: second[0].o.nationId, provinceId: first[0].o.toId, fromId: first[0].o.fromId,
      originIds: [first[0].o.fromId, second[0].o.fromId], attackerLosses: lossCount(r.attackerLossesByType), defenderLosses: lossCount(r.defenderLossesByType),
      lossesByNation: { [first[0].o.nationId]: r.attackerLossesByType, [second[0].o.nationId]: r.defenderLossesByType } });
  }
  const retreats2 = [];
  for (const toId of [...new Set(departures.map(x => x.o.toId))].sort()) {
    const here = departures.filter(x => x.o.toId === toId), target = state.provinces[toId];
    // Province prise en vague 1 par la même nation : les troupes arrivent en renfort.
    for (const x of here.filter(x => x.o.nationId === target.ownerId)) addToProvince(target, x.force);
    // Cible passée en vague 1 à une nation avec qui l'attaquant n'était pas en guerre : attaque annulée, retour.
    const changed = here.filter(x => x.o.nationId !== target.ownerId && target.ownerId !== owner0[toId] && !pairWar(state, x.o.nationId, target.ownerId));
    for (const x of changed) { if (state.provinces[x.o.fromId]?.ownerId === x.o.nationId) addToProvince(state.provinces[x.o.fromId], x.force); else if (hasPassage(state, x.o.nationId, state.provinces[x.o.fromId]?.ownerId)) addStationed(state, x.o.nationId, x.o.fromId, x.force); state.events.push({ turn: state.turn, type: 'attack-cancelled', nationId: x.o.nationId, fromId: x.o.fromId, provinceId: toId, reason: 'target-changed' }); }
    retreats2.push(...fight(state, toId, group(here.filter(x => x.o.nationId !== target.ownerId && !changed.includes(x))), fought));
  }
  applyRetreats(state, retreats2);
  for (const o of moves) state.ai?.replay?.push({ turn: state.turn, nationId: o.nationId, action: 'move', target: o.toId });
}
const emptyForceLocal = () => normalizeForce({});

/**
 * V13 : ruptures d'alliance, résolues AVANT les déplacements. Une rupture accompagnée d'une attaque contre l'ancien
 * allié dans le même inter-tour (ou d'une déclaration : `war`) est une TRAHISON : guerre ouverte, événement public,
 * Traître révélé (comportement V11 conservé). Sinon, simple rupture publique (tension +15).
 */
function resolveAllianceBreaks(state, orders) {
  for (const o of orders.filter(x => x.kind === 'diplomacy' && x.action === 'break').sort((a, b) => a.nationId.localeCompare(b.nationId) || a.target.localeCompare(b.target))) {
    if (state.nations[o.nationId]?.eliminated || state.nations[o.target]?.eliminated || !pairTreaty(state, o.nationId, o.target, 'alliance')) continue;
    const strikes = o.war || orders.some(m => m.kind === 'move' && !m.passage && m.nationId === o.nationId && state.provinces[m.toId]?.ownerId === o.target);
    if (strikes) { openWar(state, o.nationId, o.target, 'betrayal'); continue; }
    state.diplomacy.treaties = state.diplomacy.treaties.filter(t => !(t.type === 'alliance' && t.parties?.includes(o.nationId) && t.parties?.includes(o.target)));
    addTension(state, o.nationId, o.target, 15, 'alliance-broken');
    state.events.push({ turn: state.turn, type: 'alliance-broken', nationId: o.nationId, target: o.target });
  }
}
function resolveDiplomacy(state, orders, random, map = null) {
  for (const o of orders.filter(x => x.kind === 'diplomacy' && x.action !== 'break').sort((a,b)=>a.nationId.localeCompare(b.nationId)||a.target.localeCompare(b.target)||a.action.localeCompare(b.action))) {
    if (state.nations[o.nationId]?.eliminated || state.nations[o.target]?.eliminated) continue;
    const atWar = pairWar(state, o.nationId, o.target);
    if(o.action==='tribute'){
      // Complete an already-confirmed V4 transfer; new V5 orders cannot create one.
      state.nations[o.target].treasury+=Math.max(0,o.amount||0);
      state.events.push({turn:state.turn,type:'diplomatic-action',nationId:o.nationId,target:o.target,action:'tribute',amount:o.amount||0});
      state.messages.push({turn:state.turn,nationId:o.nationId,target:o.target,action:'tribute',amount:o.amount||0,status:'resolved'});
      continue;
    }
    // V11 (B9) : une IA qui propose une alliance ou une trêve au joueur humain attend sa réponse (échange public :
    // amical = accepte, hostile = refuse ; ou action diplomatique du joueur).
    if (state.controllers?.[o.nationId] === 'ai' && state.controllers?.[o.target] === 'human' && (o.action === 'alliance' || o.action === 'ceasefire')) {
      if ((o.action === 'ceasefire') !== atWar || pairTreaty(state, o.nationId, o.target, 'alliance')) continue;
      dropProposals(state, o.nationId, o.target);
      // V13.2 : une trêve reproposée après un refus le dit ; une IA qui perd ou qui a été repoussée offre de l'or.
      const refused = refusalsOf(state, o.nationId, o.target, o.action);
      const gold = o.action === 'ceasefire' ? aiCeasefireGold(state, o.nationId, o.target, refused.count) : 0;
      const msg = aiOfferTalk(state, map, o.nationId, o.target, o.action, { again: refused.count > 0, gold });
      state.diplomacy.proposals ||= [];
      state.diplomacy.proposals.push({ from: o.nationId, to: o.target, action: o.action, turn: state.turn, talkId: msg.id, amount: gold, ...(refused.count ? { refusedBefore: refused.count, lastRefusedTurn: refused.turn } : {}) });
      state.events.push({ turn: state.turn, type: 'diplomatic-action', nationId: o.nationId, target: o.target, action: o.action, proposal: true, amount: gold });
      continue;
    }
    if (o.action === 'ceasefire' && o.custom) {
      // V13.2 : montant choisi (payer ou exiger). Une IA qui a elle-même proposé la trêve signe une paix sans
      // exigence, et se montre plus conciliante face à une exigence.
      const proposed = activeProposal(state, o.target, o.nationId, 'ceasefire'), demand = Math.min(o.demand || 0, Math.max(0, state.nations[o.target].treasury));
      const bias = Math.min(ceasefireBias(state, o.target, o.nationId), demand > 0 ? .3 : 1);
      const p = Math.max(0, Math.min(.97, (o.acceptanceProbability ?? 0) + bias + (proposed ? CEASEFIRE_PROPOSAL_BONUS : 0)));
      const accepted = atWar && state.nations[o.nationId].treasury >= (o.amount || 0) && ((proposed && !demand) || random() < p);
      // L'IA proposait déjà la trêve : le joueur n'a rien à payer, et l'or qu'elle offrait lui revient.
      const owed = proposed ? 0 : (o.amount || 0);
      if (accepted && proposed) payProposalGold(state, proposed);
      if (accepted) {
        state.nations[o.nationId].treasury -= owed; state.nations[o.target].treasury += owed;
        state.nations[o.target].treasury -= demand; state.nations[o.nationId].treasury += demand;
        makeCeasefire(state, o.nationId, o.target);
      }
      state.events.push({ turn: state.turn, type: 'ceasefire-offer', nationId: o.nationId, target: o.target, amount: owed, demand, custom: true, acceptanceProbability: o.acceptanceProbability, accepted });
      state.messages.push({ turn: state.turn, nationId: o.nationId, target: o.target, action: 'ceasefire', amount: owed, demand, status: accepted ? 'accepted' : 'refused' });
      continue;
    }
    if (o.action === 'ceasefire') {
      // V11 : la personnalité de la nation qui reçoit l'offre déplace la probabilité d'accepter (leaders.js).
      // Une trêve proposée par l'IA elle-même au joueur ne passe pas ici ; une IA qui a déjà proposé la trêve accepte.
      const proposed = activeProposal(state, o.target, o.nationId, 'ceasefire');
      const p = Math.max(0, Math.min(1, (o.acceptanceProbability ?? 0) + ceasefireBias(state, o.target, o.nationId)));
      const accepted = atWar && (o.legacyFree || proposed || random() < p) && state.nations[o.nationId].treasury >= o.amount;
      if (accepted) {
        state.nations[o.nationId].treasury -= o.amount;
        state.nations[o.target].treasury += o.amount; // B3 corrigé : la somme est versée à la nation qui accepte
        makeCeasefire(state, o.nationId, o.target);
      }
      state.events.push({turn:state.turn,type:'ceasefire-offer',nationId:o.nationId,target:o.target,amount:o.amount||0,offerLevel:o.offerLevel,acceptanceProbability:o.acceptanceProbability,accepted});
      state.messages.push({turn:state.turn,nationId:o.nationId,target:o.target,action:'ceasefire',amount:o.amount||0,status:accepted?'accepted':'refused'});
      continue;
    }
    let accepted = true;
    if (o.action === 'war' && !atWar) openWar(state, o.nationId, o.target, 'declaration');
    else if (o.action === 'alliance' && !atWar) {
      // V11 (B9) : l'IA accepte ou refuse selon sa personnalité et la tension (le Traître accepte tout).
      accepted = Boolean(activeProposal(state, o.target, o.nationId, 'alliance')) || acceptsAlliance(state, o.target, o.nationId);
      if (accepted) makeAlliance(state, o.nationId, o.target);
      else addTension(state, o.nationId, o.target, 5, 'refusal');
    } else accepted = false;
    state.events.push({ turn: state.turn, type: 'diplomatic-action', nationId: o.nationId, target: o.target, action: o.action, amount: o.amount || 0, accepted });
    state.messages.push({ turn: state.turn, nationId: o.nationId, target: o.target, action: o.action, amount: o.amount || 0, status: o.action === 'alliance' ? (accepted ? 'accepted' : 'refused') : 'resolved' });
  }
}
/**
 * V13 : propositions d'IA auxquelles `nationId` peut encore répondre (fenêtre Oui / Non après le journal).
 * Jamais d'alliance proposée par une nation déjà alliée, jamais de trêve hors guerre. `fresh` : seulement celles
 * reçues à l'inter-tour qui vient d'être résolu.
 */
export function proposalsToAnswer(state, nationId = state.playerNationId, { fresh = false } = {}) {
  return (state.diplomacy?.proposals || []).filter(p => p.to === nationId && p.turn > state.turn - PROPOSAL_TURNS && (!fresh || p.turn === state.turn - 1)
    && !state.nations[p.from]?.eliminated
    && (p.action === 'alliance' ? !pairTreaty(state, p.from, nationId, 'alliance') && !pairWar(state, p.from, nationId) : pairWar(state, p.from, nationId)));
}
/** V13.2 : refus mémorisés d'une proposition (de `from` vers `to`), pour qu'une nouvelle offre en tienne compte. */
const REFUSAL_MEMORY = 20;
function clearRefusals(state, a, b) {
  const ref = state.diplomacy?.refusals; if (!ref) return;
  for (const k of Object.keys(ref)) { const [x, y] = k.split('>'); if ([a, b].includes(x) && [a, b].includes(y)) delete ref[k]; }
}
export function refusalsOf(state, from, to, action) {
  const r = state.diplomacy?.refusals?.[`${from}>${to}>${action}`];
  if (r && Number.isFinite(r.turn) && state.turn - r.turn > REFUSAL_MEMORY) return { count: 0, turn: null }; // V13.2 : oublié après 20 tours
  return { count: Math.max(0, Number(r?.count) || 0), turn: r?.turn ?? null };
}
function noteRefusal(state, from, to, action) {
  state.diplomacy.refusals = state.diplomacy.refusals && typeof state.diplomacy.refusals === 'object' ? state.diplomacy.refusals : {};
  const key = `${from}>${to}>${action}`, r = refusalsOf(state, from, to, action);
  state.diplomacy.refusals[key] = { count: r.count + 1, turn: state.turn };
}
/** Or offert par une IA avec sa trêve : rien d'ordinaire ; 20 % de son trésor si elle perd, +15 % par refus (max 50 %). */
export function aiCeasefireGold(state, from, to, refusedCount = 0) {
  const losing = strengthOf(state, from) < .8 * strengthOf(state, to), frac = Math.min(.5, (losing ? .2 : 0) + .15 * refusedCount);
  const gold = Math.floor(Math.max(0, state.nations[from]?.treasury || 0) * frac);
  return gold >= 5 ? gold : 0;
}
/** Or réellement versé quand le joueur accepte une trêve offerte avec de l'or (jamais plus que le trésor). */
function payProposalGold(state, p) {
  const gold = Math.min(Math.max(0, p.amount || 0), Math.max(0, state.nations[p.from]?.treasury || 0));
  if (gold > 0) { state.nations[p.from].treasury -= gold; state.nations[p.to].treasury += gold; }
  return gold;
}
/** V13 : réponse Oui / Non du joueur à une proposition (effet immédiat ; le message n'attend plus de réponse). */
export function respondToProposal(state, { nationId = state.playerNationId, from, accept } = {}) {
  const p = proposalsToAnswer(state, nationId).find(x => x.from === from);
  if (!p) { dropProposals(state, from, nationId); return { ok: false, error: 'Cette proposition n’est plus valable' }; }
  let gold = 0;
  if (accept) { gold = p.action === 'ceasefire' ? payProposalGold(state, p) : 0; (p.action === 'alliance' ? makeAlliance : makeCeasefire)(state, from, nationId); }
  else { dropProposals(state, from, nationId); addTension(state, nationId, from, 5, 'refusal'); noteRefusal(state, from, nationId, p.action); }
  if (p.talkId && state.talkPending?.[nationId]) state.talkPending[nationId] = state.talkPending[nationId].filter(id => id !== p.talkId);
  state.events.push({ turn: state.turn, type: 'diplomatic-action', nationId, target: from, action: p.action, accepted: Boolean(accept), amount: gold, viaTalk: true, ...(accept ? {} : { refusedProposal: true }) });
  return { ok: true, action: p.action, accepted: Boolean(accept), gold };
}
/** Réponse du joueur à une proposition d'une IA : amical = accepte, hostile = refuse. */
function answerProposals(state, msg) {
  if (!msg.replyTo || !msg.to) return;
  const p = (state.diplomacy.proposals || []).find(x => x.talkId === msg.replyTo && x.from === msg.to && x.to === msg.from);
  if (!p) return;
  if (msg.tone === 'amical') {
    if (p.action === 'alliance' && !pairWar(state, p.from, p.to)) makeAlliance(state, p.from, p.to);
    else if (p.action === 'ceasefire' && pairWar(state, p.from, p.to)) { const gold = payProposalGold(state, p); makeCeasefire(state, p.from, p.to);
      state.events.push({ turn: state.turn, type: 'diplomatic-action', nationId: p.to, target: p.from, action: p.action, accepted: true, amount: gold, viaTalk: true }); return; }
    else return;
    state.events.push({ turn: state.turn, type: 'diplomatic-action', nationId: p.to, target: p.from, action: p.action, accepted: true, amount: 0, viaTalk: true });
  } else if (msg.tone === 'hostile') {
    dropProposals(state, p.from, p.to); noteRefusal(state, p.from, p.to, p.action);
    state.events.push({ turn: state.turn, type: 'diplomatic-action', nationId: p.to, target: p.from, action: p.action, accepted: false, refusedProposal: true, amount: 0, viaTalk: true });
  }
}

function resolveProjects(state, orders) {
  for (const o of orders.filter(x => x.kind === 'construction' || x.kind === 'recruitment')) {
    // B4 : une commande passée dans une province perdue pendant cet inter-tour est annulée et remboursée.
    if (state.provinces[o.provinceId]?.ownerId !== o.nationId) { refundProduction(state, { ...o, kind: o.kind === 'construction' ? 'building' : 'unit' }, o.provinceId); continue; }
    state.productionQueue.push({ kind: o.kind === 'construction' ? 'building' : 'unit', type: o.type, provinceId: o.provinceId, nationId: o.nationId, amount: o.amount || 1, remaining: o.duration, cost: o.cost || 0 });
    state.events.push({ turn: state.turn, type: 'project-started', kind: o.kind, productionType: o.type, provinceId: o.provinceId, nationId: o.nationId, amount: o.amount || 1 });
  }
  for (const q of state.productionQueue) q.remaining--;
  // V12 : atout « construction » (+N % de vitesse) — le joueur gagne un tour de chantier supplémentaire chaque fois
  // que le crédit cumulé (N % par chantier actif et par tour) atteint un tour entier ; le chantier le plus avancé d'abord.
  for (const nationId of Object.keys(state.bonuses || {})) {
    const sites = state.productionQueue.filter(q => q.kind === 'building' && q.nationId === nationId && q.remaining > 0)
      .sort((a, b) => a.remaining - b.remaining || String(a.provinceId).localeCompare(String(b.provinceId)) || String(a.type).localeCompare(String(b.type)));
    let gained = buildTurnsGained(state, nationId, sites.length);
    for (const q of sites) { if (!gained) break; q.remaining--; q.boosted = (q.boosted || 0) + 1; gained--; }
  }
  for (const q of state.productionQueue.filter(x => x.remaining <= 0)) {
    const p = state.provinces[q.provinceId];
    // B4 (filet de sécurité) : jamais de livraison à un autre propriétaire que celui qui a payé.
    if (p && p.ownerId !== q.nationId) { refundProduction(state, q, q.provinceId); continue; }
    if (p) {
      if (q.kind === 'building') p.buildings[q.type] = Math.min((p.buildings[q.type] || 0) + 1, RULES.buildings[q.type]?.max ?? Infinity);
      else if (q.type === 'warship') p.warships = (p.warships || 0) + q.amount;
      else {
        // V12 : atout « recrutement » (+N % d'infanterie livrée, joueur humain seulement).
        const delivered = q.kind === 'unit' ? recruitAmount(state, q.nationId, q.type, q.amount) : q.amount;
        p.units[q.type] = (p.units[q.type] || 0) + delivered;
        if (delivered !== q.amount) { q.bonus = delivered - q.amount; q.amount = delivered; }
      }
      state.events.push({ turn: state.turn, type: 'production-complete', kind: q.kind, productionType: q.type, provinceId: q.provinceId, nationId: q.nationId, amount: q.amount || 1, ...(q.bonus ? { bonus: q.bonus } : {}) });
    }
  }
  state.productionQueue = state.productionQueue.filter(q => q.remaining > 0);
}
// --- V10 marine : convois, étapes en mer, interceptions, débarquements (docs/V10-marine.md) -----------------
/** Convoi : { id, nationId, fromId, toId, via, stage, turns, units, warships, wounds }.
 *  stage = étapes déjà parcourues (0 au départ) ; arrivée quand stage = turns. Position sur la route : stage / turns. */
function embark(state, map, o, force) {
  const route = seaDestinations(map, o.fromId).find(x => x.id === o.toId)
    || { via: o.via || o.toId, turns: o.turns || seaTravelTurns(laneOf(map, o.fromId, o.via || o.toId)?.length) };
  state.transportSequence = Math.max(1, Number(state.transportSequence) || 1);
  const id = `c${state.transportSequence++}`;
  state.transports.push({ id, nationId: o.nationId, fromId: o.fromId, toId: o.toId, via: route.via, lane: [o.fromId, route.via].sort().join('|'), stage: 0, turns: route.turns, departed: state.turn, truces: trucesOf(state, o.nationId), ...(o.navalStrike ? { strike: true } : {}), ...(o.passage ? { passage: true } : {}), ...(allyPortOf(state, o) ? { allyPort: allyPortOf(state, o) } : {}), ...toLegacy(force) });
  state.events.push({ turn: state.turn, type: 'convoy-departed', nationId: o.nationId, fromId: o.fromId, toId: o.toId, convoyId: id, turns: route.turns, escort: force.units.warship, amount: unitCount(force) });
}
// V14.0 : convoi parti du port d'un allié (troupes stationnées qui rembarquent) : on retient l'allié, pour ne pas perdre
// le convoi si l'alliance est rompue pendant la traversée (voir rescueConvoy).
// V14.1 : trêves en cours au moment où le convoi lève l'ancre (pour reconnaître une trêve signée dans le même inter-tour,
// après son départ : le convoi fait alors demi-tour au lieu de débarquer).
const trucesOf = (state, nationId) => (state.diplomacy?.treaties || []).filter(t => t.active !== false && t.type === 'ceasefire' && t.parties?.includes(nationId)).map(t => t.parties.find(x => x !== nationId)).filter(Boolean).sort();
/** V14.1 : la trêve `truce` avec `owner` a-t-elle été signée après le départ du convoi `t` ? (ancien convoi sans `truces` : règle V13). */
function truceAfterDeparture(t, truce, owner) {
  const departed = Number.isFinite(t.departed) ? t.departed : -Infinity, started = truce.started ?? 0;
  if (departed < started) return true;
  return departed === started && Array.isArray(t.truces) && !t.truces.includes(owner);
}
const allyPortOf = (state, o) => { const owner = state.provinces[o.fromId]?.ownerId; return owner && owner !== o.nationId ? owner : null; };
const laneKey = t => t.lane || [t.fromId, t.via].sort().join('|');
const convoyAlive = t => COMBAT_TYPES.some(k => (k === 'warship' ? t.warships : t.units?.[k]) > 0);
const writeConvoy = (t, force) => Object.assign(t, toLegacy(force));
/** Combat naval : `attacker` (flotte ou convoi) contre le convoi `t`. Seuls les navires tirent ; la cargaison encaisse ×1,5. */
function navalClash(state, { attackerId, attackerForce, t, kind, provinceId }) {
  const res = resolveBattle({ defender: legacyForce(t), attackers: [{ id: attackerId, force: attackerForce, warshipFactor: navalBonusFactor(state, attackerId) }], naval: true, defenderWarshipFactor: navalBonusFactor(state, t.nationId) });
  const a = res.attackers[0];
  writeConvoy(t, res.defender);
  const destroyed = !convoyAlive(t);
  state.events.push({
    turn: state.turn, type: 'interception', kind, nationId: attackerId, attacker: attackerId, defender: t.nationId, target: t.nationId,
    provinceId, fromId: t.fromId, toId: t.toId, convoyId: t.id, escorted: legacyForce({ ...t, warships: t.warships + res.defenderLossesByType.warship }).units.warship > 0,
    attackerLosses: lossCount(a.lossesByType), defenderLosses: lossCount(res.defenderLossesByType),
    lossesByNation: { [attackerId]: a.lossesByType, [t.nationId]: res.defenderLossesByType }, convoyDestroyed: destroyed,
    ...(t.strike ? { strike: true, attackerLeft: a.force.units.warship } : {})
  });
  return a.force;
}
/**
 * Rencontres en mer, après l'avancée d'une étape :
 *  1. deux convois de nations en guerre sur la même route (dans un sens ou dans l'autre) se battent si l'un au
 *     moins a des navires de guerre ; ordre déterministe (identifiants de convoi) ;
 *  2. interception depuis le port d'arrivée : à sa dernière étape en mer (stage = turns − 1), un convoi est attaqué
 *     par les navires de guerre à quai dans la province au bout de la route (`via`) si elle a un port construit et
 *     appartient à une nation en guerre contre lui. Les navires du convoi (escorte) ripostent.
 */
function navalEncounters(state) {
  const atSea = state.transports.filter(t => t.stage < t.turns).sort((a, b) => String(a.id).localeCompare(String(b.id)));
  const lanes = [...new Set(atSea.map(laneKey))].sort();
  for (const lane of lanes) {
    const here = atSea.filter(t => laneKey(t) === lane);
    for (let i = 0; i < here.length; i++) for (let j = i + 1; j < here.length; j++) {
      const x = here[i], y = here[j];
      if (x.nationId === y.nationId || !pairWar(state, x.nationId, y.nationId) || !convoyAlive(x) || !convoyAlive(y)) continue;
      if (!x.warships && !y.warships) continue;
      // Le convoi le mieux armé est l'agresseur (égalité : identifiant le plus petit) ; tout le monde tire en même temps.
      const [atk, def] = (y.warships > x.warships) ? [y, x] : [x, y];
      const survivors = navalClash(state, { attackerId: atk.nationId, attackerForce: legacyForce(atk), t: def, kind: 'sea', provinceId: def.via });
      writeConvoy(atk, survivors);
    }
  }
  for (const t of atSea) {
    if (t.stage !== t.turns - 1 || !convoyAlive(t)) continue;
    const harbor = state.provinces[t.via];
    if (!harbor || !harbor.buildings?.port || !(harbor.warships > 0) || harbor.ownerId === t.nationId || !pairWar(state, harbor.ownerId, t.nationId)) continue;
    const { taken: fleet, rest } = splitForce(provinceForce(harbor), { warship: harbor.warships });
    const survivors = navalClash(state, { attackerId: harbor.ownerId, attackerForce: fleet, t, kind: 'port', provinceId: t.via });
    writeProvinceForce(harbor, mergeForce(rest, survivors));
  }
  state.transports = state.transports.filter(convoyAlive);
}
/**
 * Escorte arrivée dans une province SANS port construit : les navires ne peuvent pas y mouiller ; ils repartent
 * aussitôt en convoi vers leur port de départ (même route, même durée). Avec un port construit, ils restent.
 */
function dockEscort(state, map, provinceId, nationId, homeId, lane, turns) {
  const p = state.provinces[provinceId];
  if (!p || p.ownerId !== nationId || p.buildings?.port || !(p.warships > 0)) return;
  if (state.provinces[homeId]?.ownerId !== nationId) return; // port de départ perdu : les navires restent à l'ancre
  const { taken, rest } = splitForce(provinceForce(p), { warship: p.warships });
  writeProvinceForce(p, rest);
  state.transportSequence = Math.max(1, Number(state.transportSequence) || 1);
  const id = `c${state.transportSequence++}`;
  state.transports.push({ id, nationId, fromId: provinceId, toId: homeId, via: homeId, lane, stage: 0, turns, returning: true, ...toLegacy(taken) });
  state.events.push({ turn: state.turn, type: 'convoy-departed', nationId, fromId: provinceId, toId: homeId, convoyId: id, turns, escort: taken.units.warship, amount: unitCount(taken), returning: true });
}
const hasLandTroops = force => LAND_UNIT_TYPES.some(k => force.units[k] > 0);
/** Demi-tour : le convoi (ou les survivants d'un débarquement repoussé) rentre à son port de départ par la même
 *  route, avec la même durée. Port de départ perdu : les unités sont perdues en mer. */
function turnBack(state, t, force = legacyForce(t), reason = 'no-troops', map = null) {
  if (state.provinces[t.fromId]?.ownerId !== t.nationId && !hasPassage(state, t.nationId, state.provinces[t.fromId]?.ownerId)) {
    // V14.0 : parti de chez un ancien allié (alliance rompue pendant la traversée) : le convoi n'est plus perdu.
    if (t.allyPort && map) { rescueConvoy(state, map, t, force, t.toId, t.fromId); return; }
    state.events.push({ turn: state.turn, type: 'retreat-lost', nationId: t.nationId, provinceId: t.fromId, amount: unitCount(force), naval: true }); return;
  }
  state.transportSequence = Math.max(1, Number(state.transportSequence) || 1);
  const id = `c${state.transportSequence++}`;
  state.transports.push({ id, nationId: t.nationId, fromId: t.toId, toId: t.fromId, via: t.fromId, lane: laneKey(t), stage: 0, turns: t.turns, returning: true, ...(t.allyPort ? { allyPort: t.allyPort } : {}), ...toLegacy(force) });
  state.events.push({ turn: state.turn, type: 'convoy-returning', reason, nationId: t.nationId, fromId: t.toId, toId: t.fromId, provinceId: t.toId, convoyId: id, amount: unitCount(force), turns: t.turns });
}
/**
 * V14.0 : convoi parti du port d'un allié, dont l'alliance a été rompue pendant la traversée (il n'a plus le droit d'y
 * accoster). Il n'est plus perdu : depuis l'endroit où il se trouve (`atId`), il met le cap sur le point de port AMI
 * (à soi, ou d'un allié) le plus proche par les routes de la carte (routes maritimes : leur durée ; côte à côte sur une
 * même île : 1 tour) ; la traversée dure ce chemin, au moins RULES.naval.minTurns. À défaut de port ami, il revient à son
 * point de départ (`departureId`) et y débarque : ses troupes sont alors rapatriées comme des troupes stationnées
 * (settleStationed). Toujours une ligne au journal.
 */
function friendlyPortRoute(state, map, nationId, atId) {
  const friendly = id => state.provinces[id]?.ownerId === nationId || hasPassage(state, nationId, state.provinces[id]?.ownerId);
  const dist = new Map([[atId, 0]]), done = new Set();
  for (;;) {
    let cur = null;
    for (const [id, d] of dist) if (!done.has(id) && (cur === null || d < dist.get(cur) || (d === dist.get(cur) && id < cur))) cur = id;
    if (cur === null) return null;
    done.add(cur);
    if (cur !== atId && isPortPoint(map, cur) && friendly(cur)) return { id: cur, turns: Math.max(RULES.naval.minTurns, dist.get(cur)) };
    const edges = [...(provinceDef(map, cur)?.landConnections || []).map(id => [id, 1]), ...seaRoutesFrom(map, cur).map(r => [r.via, r.turns])];
    for (const [id, w] of edges) if (state.provinces[id] && !done.has(id) && (!dist.has(id) || dist.get(cur) + w < dist.get(id))) dist.set(id, dist.get(cur) + w);
  }
}
function rescueConvoy(state, map, t, force, atId, departureId) {
  const amount = unitCount(force), port = friendlyPortRoute(state, map, t.nationId, atId);
  state.transportSequence = Math.max(1, Number(state.transportSequence) || 1);
  if (port) {
    const id = `c${state.transportSequence++}`, owner = state.provinces[port.id].ownerId;
    state.transports.push({ id, nationId: t.nationId, fromId: atId, toId: port.id, via: port.id, lane: [atId, port.id].sort().join('|'), stage: 0, turns: port.turns, returning: true, ...(owner !== t.nationId ? { allyPort: owner } : {}), ...toLegacy(force) });
    state.events.push({ turn: state.turn, type: 'convoy-rerouted', nationId: t.nationId, target: t.allyPort, fromId: atId, toId: port.id, provinceId: atId, convoyId: id, amount, turns: port.turns });
    return;
  }
  if (atId !== departureId) {
    // Aucun port ami : retour au point de départ, où il débarquera (branche d'arrivée ci-dessous).
    const id = `c${state.transportSequence++}`;
    state.transports.push({ id, nationId: t.nationId, fromId: atId, toId: departureId, via: departureId, lane: laneKey(t), stage: 0, turns: t.turns, returning: true, allyPort: t.allyPort, ...toLegacy(force) });
    state.events.push({ turn: state.turn, type: 'convoy-rerouted', nationId: t.nationId, target: t.allyPort, fromId: atId, toId: departureId, provinceId: atId, convoyId: id, amount, turns: t.turns, toDeparture: true });
    return;
  }
  addStationed(state, t.nationId, departureId, force); // rapatriées juste après (settleStationed)
  state.events.push({ turn: state.turn, type: 'convoy-rerouted', nationId: t.nationId, target: t.allyPort, fromId: atId, toId: departureId, provinceId: departureId, amount, landed: true });
}
/** Avancée des convois (1 étape par tour), rencontres en mer, puis arrivées : renfort, retour (allié) ou débarquement. */
function resolveTransports(state, map, fought) {
  for (const t of state.transports) t.stage = (Number(t.stage) || 0) + 1;
  navalEncounters(state);
  const arriving = state.transports.filter(t => t.stage >= t.turns).sort((a, b) => String(a.id).localeCompare(String(b.id)));
  state.transports = state.transports.filter(t => t.stage < t.turns);
  for (const toId of [...new Set(arriving.map(t => t.toId))].sort()) {
    const target = state.provinces[toId], here = arriving.filter(t => t.toId === toId), groups = new Map();
    for (const t of here) {
      const force = legacyForce(t);
      if (t.returning && target.ownerId !== t.nationId && hasPassage(state, t.nationId, target.ownerId)) { addStationed(state, t.nationId, toId, force); continue; }
      if (t.returning && target.ownerId !== t.nationId && t.allyPort) { rescueConvoy(state, map, t, force, toId, toId); continue; } // V14.0
      if (t.returning && target.ownerId !== t.nationId) {
        // Retour vers un port perdu entre-temps : plus de port où rentrer.
        state.events.push({ turn: state.turn, type: 'retreat-lost', nationId: t.nationId, provinceId: toId, amount: unitCount(force), naval: true });
        continue;
      }
      if (target.ownerId !== t.nationId && !hasLandTroops(force)) {
        // Navires seuls (patrouille, ou troupes perdues en mer) devant une côte étrangère : pas de débarquement,
        // demi-tour vers le port de départ par la même route.
        turnBack(state, t, legacyForce(t), t.strike ? 'strike' : 'no-troops', map);
        continue;
      }
      if (target.ownerId === t.nationId) {
        addToProvince(target, force);
        state.events.push({ turn: state.turn, type: 'convoy-arrived', nationId: t.nationId, fromId: t.fromId, toId, provinceId: toId, amount: unitCount(force), returning: Boolean(t.returning) });
        if (!t.returning) dockEscort(state, map, toId, t.nationId, t.fromId, laneKey(t), t.turns);
        continue;
      }
      if (hasPassage(state, t.nationId, target.ownerId)) {
        // V13.4 : chez un allié, le convoi débarque paisiblement : ses troupes stationnent (droit de passage).
        addStationed(state, t.nationId, toId, force);
        state.events.push({ turn: state.turn, type: 'convoy-arrived', nationId: t.nationId, fromId: t.fromId, toId, provinceId: toId, amount: unitCount(force), passage: true, target: target.ownerId });
        continue;
      }
      if (t.passage) {
        // Parti pour stationner chez un allié qui ne l'est plus : pas de débarquement (jamais de guerre involontaire).
        state.events.push({ turn: state.turn, type: 'attack-cancelled', reason: 'passage-lost', nationId: t.nationId, fromId: t.fromId, provinceId: toId, naval: true });
        turnBack(state, t, force, 'ally', map);
        continue;
      }
      const truce = (state.diplomacy.treaties || []).find(x => x.active !== false && x.type === 'ceasefire' && x.parties.includes(t.nationId) && x.parties.includes(target.ownerId));
      if (truce && truceAfterDeparture(t, truce, target.ownerId)) {
        // V13 : cessez-le-feu conclu APRÈS le départ du convoi (ex. fenêtre Oui / Non) : pas de débarquement, le convoi
        // rentre. Un convoi parti alors que la trêve existait déjà est une violation délibérée : il débarque (guerre).
        // V14.1 : y compris une trêve signée dans le même inter-tour que le départ (avant : débarquement = trahison).
        state.events.push({ turn: state.turn, type: 'attack-cancelled', reason: 'ceasefire', nationId: t.nationId, fromId: t.fromId, provinceId: toId, naval: true });
        turnBack(state, t, force, 'ceasefire', map);
        continue;
      }
      const g = groups.get(t.nationId) || { nationId: t.nationId, force: emptyForceLocal(), originIds: [], retreatTo: [], mode: 'landing', convoys: [] };
      g.force = mergeForce(g.force, force); g.convoys.push(t);
      if (!g.originIds.includes(t.fromId)) { g.originIds.push(t.fromId); g.retreatTo.push(t.fromId); }
      groups.set(t.nationId, g);
    }
    if (!groups.size) continue;
    // Débarquement repoussé : les survivants rembarquent et rentrent par la même route (pas de repli instantané).
    for (const r of fight(state, toId, [...groups.values()], fought, { naval: true })) turnBack(state, groups.get(r.nationId).convoys[0], r.force, 'repelled', map);
    const winner = groups.get(target.ownerId);
    if (winner) dockEscort(state, map, toId, winner.nationId, winner.convoys[0].fromId, laneKey(winner.convoys[0]), winner.convoys[0].turns);
  }
}
/**
 * V14.2 (retour de Jack) — navires en convalescence (= navires blessés : ils ont perdu des PV et tirent moins fort).
 *  - Dans un PORT CONSTRUIT (le sien, ou celui d'un allié où ils stationnent), ils reviennent à 100 % des PV en
 *    3, 4 ou 5 tours selon les dégâts (SHIP_REPAIR_TURNS : jusqu'à 15 % des PV max perdus → 3 tours, jusqu'à 30 % →
 *    4 tours, au-delà → 5 tours ; une pile ne perd jamais plus de 50 % sans que des navires coulent).
 *  - Ailleurs (point de port sans port construit, province sans port) : réparations de fortune, SHIP_FIELD_REPAIR des
 *    PV max par tour (5 %), soit jusqu'à 10 tours.
 *  - En mer : pas de réparation. Nouveaux dégâts (combat, navires blessés qui arrivent) : le délai est recalculé.
 * Plans mémorisés dans state.shipRepairs[`${nation}@${province}`] = { turnsLeft, wounds } (absent des anciennes
 * sauvegardes : recréé au besoin).
 */
export const SHIP_REPAIR_TURNS = Object.freeze([{ upTo: .15, turns: 3 }, { upTo: .3, turns: 4 }, { upTo: 1, turns: 5 }]);
export const SHIP_FIELD_REPAIR = .05;
export const shipRepairTurnsFor = (wounds, ships) => {
  const max = ships * RULES.combat.units.warship.hp, share = max > 0 ? wounds / max : 0;
  return wounds > 0 ? SHIP_REPAIR_TURNS.find(r => share <= r.upTo + 1e-9).turns : 0;
};
const repairKey = (nationId, provinceId) => `${nationId}@${provinceId}`;
function repairShips(state, force, nationId, provinceId, inPort) {
  state.shipRepairs = state.shipRepairs && typeof state.shipRepairs === 'object' ? state.shipRepairs : {};
  const key = repairKey(nationId, provinceId), ships = force.units.warship, wounds = force.wounds.warship;
  if (!ships || !wounds) { delete state.shipRepairs[key]; return force; }
  if (!inPort) {
    delete state.shipRepairs[key];
    force.wounds.warship = Math.max(0, wounds - Math.ceil(Math.round(SHIP_FIELD_REPAIR * ships * RULES.combat.units.warship.hp * 1000) / 1000));
    return force;
  }
  let plan = state.shipRepairs[key];
  if (!plan || !(plan.turnsLeft > 0) || wounds > plan.wounds) plan = { turnsLeft: shipRepairTurnsFor(wounds, ships), wounds };
  const healed = Math.ceil(wounds / plan.turnsLeft);
  force.wounds.warship = Math.max(0, wounds - healed);
  plan = { turnsLeft: plan.turnsLeft - 1, wounds: force.wounds.warship };
  if (plan.turnsLeft > 0 && plan.wounds > 0) state.shipRepairs[key] = plan; else delete state.shipRepairs[key];
  return force;
}
/** Guérison des troupes (healForce) + réparation des navires (repairShips). */
function healWithShips(state, force, nationId, provinceId, inPort) {
  const ships = { units: force.units.warship, wounds: force.wounds.warship };
  const healed = healForce(force);
  healed.units.warship = ships.units; healed.wounds.warship = ships.wounds; // les navires suivent leur propre règle
  return repairShips(state, healed, nationId, provinceId, inPort);
}
/**
 * État de convalescence des navires de `nationId` dans `provinceId` (affichage) :
 * { ships, hp, maxHp, wounded, inPort, turnsLeft } ; turnsLeft = tours avant 100 % (estimation au rythme actuel).
 */
export function shipRepairInfo(state, provinceId, nationId = state.provinces?.[provinceId]?.ownerId) {
  const p = state.provinces?.[provinceId];
  if (!p) return null;
  const own = nationId === p.ownerId, e = own ? null : stationedAt(state, provinceId, nationId);
  const ships = own ? p.warships || 0 : e?.warships || 0, wounds = Math.max(0, own ? p.wounds?.warship || 0 : e?.wounds?.warship || 0);
  if (!ships) return null;
  const maxHpShips = ships * RULES.combat.units.warship.hp, inPort = Boolean(p.buildings?.port) && (own || hasPassage(state, nationId, p.ownerId));
  const plan = state.shipRepairs?.[repairKey(nationId, provinceId)];
  const turnsLeft = !wounds ? 0 : inPort ? (plan && plan.wounds === wounds && plan.turnsLeft > 0 ? plan.turnsLeft : shipRepairTurnsFor(wounds, ships))
    : Math.ceil(wounds / Math.ceil(Math.round(SHIP_FIELD_REPAIR * maxHpShips * 1000) / 1000));
  return { ships, hp: maxHpShips - wounds, maxHp: maxHpShips, wounded: wounds > 0, inPort, turnsLeft };
}
/** Guérison : dans chaque province qui n'a pas combattu ce tour, RULES.combat.healRate des PV max par type (navires : voir repairShips). */
function healProvinces(state, fought) {
  for (const [id, p] of Object.entries(state.provinces)) {
    if (fought.has(id)) continue;
    writeProvinceForce(p, healWithShips(state, provinceForce(p), p.ownerId, id, Boolean(p.buildings?.port)));
  }
  for (const e of [...(state.stationed || [])]) if (!fought.has(e.provinceId)) {
    const host = state.provinces[e.provinceId];
    setStationedForce(state, e.nationId, e.provinceId, healWithShips(state, legacyForce(e), e.nationId, e.provinceId, Boolean(host?.buildings?.port)));
  }
}
/** B6 : une nation sans province (ni troupes en mer) est éliminée ; elle ne revient pas. */
function updateEliminations(state) {
  for (const [id, n] of Object.entries(state.nations)) {
    if (n.eliminated) continue;
    const owns = Object.values(state.provinces).some(p => p.ownerId === id);
    const atSea = (state.transports || []).some(t => t.nationId === id);
    if (!owns && !atSea) {
      n.eliminated = true; n.eliminatedTurn = state.turn;
      state.orders = (state.orders || []).filter(o => o.nationId !== id);
      state.diplomacy.wars = state.diplomacy.wars.filter(w => !w.participants.includes(id));
      state.diplomacy.treaties = state.diplomacy.treaties.filter(t => !t.parties?.includes(id));
      state.events.push({ turn: state.turn, type: 'elimination', nationId: id });
    }
  }
}

// --- IA maritime (V9, corrige B11) -------------------------------------------------------------
// Uniquement avec les mécaniques V6 : ports (une route n'est ouverte que si ses deux ports sont construits),
// navires de guerre (usine + port), transports (embarquement puis traversée). V10 : décisions évaluées par simulation du combat (combat.js).
const seaRouteCount = (map, id) => (map.maritimeRoutes || []).filter(([a, b]) => a === id || b === id).length;
const hasOrQueued = (state, provinceId, type) => (state.provinces[provinceId]?.buildings?.[type] || 0) > 0
  || (state.productionQueue || []).some(q => q.kind === 'building' && q.provinceId === provinceId && q.type === type)
  || (state.orders || []).some(o => o.kind === 'construction' && o.status === 'pending' && o.provinceId === provinceId && o.type === type);
// V13 : l'IA ne lit que ce qu'elle voit (garnison réelle si visible, sinon estimation prudente : vision.js).
const defenseOf = (state, id, map, viewer) => { const p = state.provinces[id]; return combatValue(perceivedForce(state, map, viewer, id)) * RULES.fortDefense[p.buildings.fort || 0]; };
const hostileTo = (state, nationId, owner) => owner && owner !== nationId && !pairTreaty(state, nationId, owner, 'alliance') && !pairTreaty(state, nationId, owner, 'ceasefire');
// Plus forte menace terrestre immédiate sur une province (forces des voisins hostiles).
const landThreat = (map, state, nationId, id) => combatValue(landThreatForce(map, state, nationId, id) || normalizeForce({}));
/** Plus forte armée terrestre d'un voisin hostile (force complète, pour simuler un combat).
 *  V13 : telle que `nationId` la voit (troupes invisibles ou retranchées : estimation prudente). */
function landThreatForce(map, state, nationId, id) {
  const seen = visibleProvinces(state, map, nationId);
  const forces = (provinceDef(map, id)?.landConnections || []).filter(n => hostileTo(state, nationId, state.provinces[n]?.ownerId))
    .map(n => { const f = perceivedForce(state, map, nationId, n, seen); f.units.warship = 0; f.wounds.warship = 0; return f; });
  return forces.sort((a, b) => combatValue(b) - combatValue(a))[0] || null;
}
// Base navale : point de port possédé, de préférence déjà équipé (construit ou en chantier : choix stable),
// puis (V13, une seule route par point de port) celui dont la route mène à la côte la plus faible.
function navalBase(map, state, owned) {
  const score = p => (hasOrQueued(state, p.id, 'port') ? 2 : 0) + (hasOrQueued(state, p.id, 'factory') ? 1 : 0);
  const nationId = state.provinces[owned[0]?.id]?.ownerId;
  const across = p => Math.min(Infinity, ...seaDestinations(map, p.id).filter(d => state.provinces[d.id]?.ownerId !== nationId).map(d => defenseOf(state, d.id, map, nationId)));
  return owned.filter(p => isPortPoint(map, p.id))
    .sort((a, b) => score(b) - score(a) || seaRouteCount(map, b.id) - seaRouteCount(map, a.id) || across(a) - across(b) || a.id.localeCompare(b.id))[0] || null;
}
function aiNavalOrders(state, map, nationId, owned, base, threshold, canAttack = owner => hostileTo(state, nationId, owner), arch = null, focus = new Set()) {
  const treasury = () => state.nations[nationId].treasury;
  if (!base) return;
  const baseState = state.provinces[base.id];
  // 1. Port puis usine sur la base navale (les navires exigent les deux au même endroit).
  if (!hasOrQueued(state, base.id, 'port') && treasury() >= RULES.buildings.port.cost) queueConstruction(state, { nationId, provinceId: base.id, type: 'port' });
  if (!hasOrQueued(state, base.id, 'factory') && treasury() >= RULES.buildings.factory.cost + (arch === 'conquerant' ? 0 : 60)) queueConstruction(state, { nationId, provinceId: base.id, type: 'factory' });
  // 2. Flotte : un navire par tour (deux si le trésor déborde), plafond qui grandit avec la partie.
  if (baseState.buildings.port && baseState.buildings.factory) {
    const queuedShips = (state.productionQueue || []).filter(q => q.kind === 'unit' && q.type === 'warship' && q.nationId === nationId).reduce((n, q) => n + q.amount, 0)
      + (state.orders || []).filter(o => o.kind === 'recruitment' && o.type === 'warship' && o.nationId === nationId && o.status === 'pending').reduce((n, o) => n + o.amount, 0);
    const fleet = owned.reduce((n, p) => n + (state.provinces[p.id].warships || 0), 0) + queuedShips;
    // V14.1 (cahier V14 §3 point 3) : plus de bases navales qui s'empilent face à face sans se battre. Sans aucune
    // côte à viser par la mer (aucune nation en guerre ou visée au bout d'une route), la flotte reste petite.
    const seaUse = owned.filter(p => isPortPoint(map, p.id)).some(p => seaDestinations(map, p.id).some(d => { const o = state.provinces[d.id]?.ownerId; return o && o !== nationId && (pairWar(state, nationId, o) || canAttack(o) || focus.has(o)); }));
    const cap = Math.min(30, seaUse ? (arch === 'batisseur' ? 2 : 4) + Math.floor(state.turn / 8) : NAVAL_IDLE_CAP);
    const lots = treasury() >= 400 ? 2 : 1;
    if (fleet < cap && treasury() >= RULES.units.warship.cost * lots + (arch === 'conquerant' ? 0 : 20)) queueRecruitment(state, { nationId, provinceId: base.id, type: 'warship', lots });
  }
  // 3. Ports secondaires quand le trésor le permet (plus de routes ouvertes = plus d'options).
  if (baseState.buildings.port && treasury() >= RULES.buildings.port.cost + 20 && (arch !== 'conquerant' || (baseState.warships || 0) >= 3)) {
    const site = owned.find(p => p.id !== base.id && state.provinces[p.id].portSite && seaRouteCount(map, p.id) > 0 && !hasOrQueued(state, p.id, 'port'));
    if (site) queueConstruction(state, { nationId, provinceId: site.id, type: 'port' });
  }
  const ports = owned.filter(p => state.provinces[p.id].buildings.port);
  // V13 : on embarque depuis tout point de port possédé (construit ou non) vers le point de port au bout de la route.
  const seaLinks = owned.filter(p => isPortPoint(map, p.id)).flatMap(p => seaDestinations(map, p.id).map(d => ({ from: p, to: d.id, via: d.via, turns: d.turns, owner: state.provinces[d.id].ownerId })));
  // 4. Débarquement escorté : au plus un nouveau par tour, et au plus RULES-libre 2 invasions en mer à la fois.
  const invasionsAtSea = (state.transports || []).filter(t => t.nationId === nationId && !t.returning && state.provinces[t.toId]?.ownerId !== nationId).length;
  if (invasionsAtSea < 2) {
    const targets = seaLinks.filter(x => x.owner && x.owner !== nationId && (hostileTo(state, nationId, x.owner) || arch === 'traitre' || arch === 'conquerant') && canAttack(x.owner) && !(state.transports || []).some(t => t.nationId === nationId && t.toId === x.to))
      .map(x => ({ ...x, atWar: pairWar(state, nationId, x.owner) }));
    // V13 : les nations visées au titre d'une aide promise à un allié passent en premier.
    targets.sort((a, b) => Number(focus.has(b.owner)) - Number(focus.has(a.owner)) || Number(b.atWar) - Number(a.atWar) || Number(a.owner === state.playerNationId) - Number(b.owner === state.playerNationId) || defenseOf(state, a.to, map, nationId) - defenseOf(state, b.to, map, nationId) || a.turns - b.turns || a.to.localeCompare(b.to) || a.from.id.localeCompare(b.from.id));
    // Marge plus prudente que sur terre : la cible a plusieurs tours pour se renforcer pendant la traversée.
    // V14.1 (cahier V14 §3 point 4) : un peu plus de goût pour la mer — marge réduite (0,25 → 0,10) sauf vers une
    // capitale (0,35 : pas de débarquement suicide sur les capitales).
    const isCap = id => Object.values(state.nations).some(n => n.capitalId === id);
    const margin = (x) => (x.atWar ? Math.max(1.1, threshold - .2) : threshold) + (isCap(x.to) ? RULES.ai.capitalLandingMargin : RULES.ai.landingExtraMargin) + .05 * (x.turns - RULES.naval.minTurns);
    let launched = false;
    for (const x of targets) {
      const warships = availableForces(state, x.from.id).warships;
      // Pas d'invasion sans escorte… sauf (V13) depuis un point de port sans flotte quand aucun navire ennemi
      // ne peut intercepter sur la route ni au port d'arrivée.
      if (!warships && navalThreat(state, nationId, x.from.id, x.via, map) > 0) continue;
      // V10 : simulation de l'interception éventuelle au port d'arrivée, puis du débarquement (mode 'landing').
      const units = aiAttackSlice(state, map, nationId, x.from.id, x.to, margin(x), 'landing', warships, x.via);
      if (units) { launched = queueMoveOrder(state, map, { nationId, fromId: x.from.id, toId: x.to, units, warships }).ok; break; }
    }
    // V13 : rassemblement. On ne débarque qu'au point de port au bout de la route : quand l'armée (souvent sur la
    // base navale) est sur un autre point de port, elle rejoint par la terre le point de port d'où partira l'invasion,
    // si la simulation montre qu'avec ce renfort le débarquement réussirait. Embarquement au tour suivant.
    if (!launched && !(state.orders || []).some(o => o.kind === 'move' && o.status === 'pending' && o.nationId === nationId && o.staging)) {
      for (const x of targets) {
        if (!availableForces(state, x.from.id).warships && navalThreat(state, nationId, x.from.id, x.via, map) > 0) continue;
        const donors = (x.from.landConnections || []).filter(id => state.provinces[id]?.ownerId === nationId)
          .sort((a, b) => combatValue(provinceForce(state.provinces[b])) - combatValue(provinceForce(state.provinces[a])) || a.localeCompare(b));
        const donor = donors[0];
        if (!donor) continue;
        const avail = availableForces(state, donor), units = Object.fromEntries(LAND_UNIT_TYPES.map(k => [k, Math.floor((avail[k] || 0) * .6)]));
        if (!LAND_UNIT_TYPES.some(k => units[k])) continue;
        const kept = normalizeForce({ units: Object.fromEntries(LAND_UNIT_TYPES.map(k => [k, (state.provinces[donor].units[k] || 0) - units[k]])) });
        const threat = landThreatForce(map, state, nationId, donor);
        if (threat && !holds(kept, threat, state.provinces[donor].buildings.fort || 0)) continue;
        const here = availableForces(state, x.from.id);
        const attacker = normalizeForce({ units: Object.fromEntries(LAND_UNIT_TYPES.map(k => [k, Math.floor((here[k] || 0) * .7) + units[k]])) });
        const target = state.provinces[x.to];
        // V14.1 : le rassemblement commence dès que l'armée réunie atteint la moitié de ce qu'il faut (stagingFactor) ; le
        // débarquement lui-même ne part qu'avec la marge complète (aiAttackSlice), les renforts s'accumulent d'ici là.
        if (!resolveCombat({ attacker, defender: scaleForce(perceivedForce(state, map, nationId, x.to), Math.max(RULES.ai.stagingFactor, margin(x) * RULES.ai.stagingFactor)), fortLevel: target.buildings.fort || 0, mode: 'landing' }).captured) continue;
        const r = queueMoveOrder(state, map, { nationId, fromId: donor, toId: x.from.id, units });
        if (r.ok) { state.orders.find(o => o.id === r.orderId).staging = x.to; break; }
      }
    }
  }
  // 5. Renfort par mer d'une tête de pont menacée ou en première ligne (au plus un par tour), escorté si possible.
  const bridgeheads = seaLinks.filter(x => x.owner === nationId && provinceDef(map, x.to).landConnections.some(n => hostileTo(state, nationId, state.provinces[n]?.ownerId)))
    .sort((a, b) => combatValue(provinceForce(state.provinces[a.to])) - combatValue(provinceForce(state.provinces[b.to])) || a.turns - b.turns || a.to.localeCompare(b.to) || a.from.id.localeCompare(b.from.id));
  for (const x of bridgeheads) {
    if ((state.transports || []).some(t => t.nationId === nationId && t.toId === x.to)) continue;
    const available = availableForces(state, x.from.id), here = combatValue(provinceForce(state.provinces[x.to]));
    const value = units => combatValue({ units });
    if (value(available) < Math.max(value({ infantry: 80 }), here * 2)) continue;
    const units = Object.fromEntries(LAND_UNIT_TYPES.map(k => [k, Math.floor(available[k] * .4)]));
    const kept = Object.fromEntries(LAND_UNIT_TYPES.map(k => [k, available[k] - units[k]]));
    const threat = landThreatForce(map, state, nationId, x.from.id);
    if (threat && !holds(normalizeForce({ units: kept }), threat, state.provinces[x.from.id].buildings.fort || 0)) continue;
    // Escorte si la route est menacée par des navires ennemis (port au bout de la route ou convoi ennemi armé).
    const risky = navalThreat(state, nationId, x.from.id, x.via, map) > 0;
    const warships = risky ? Math.floor(available.warships / 2) : 0;
    if (risky && !warships) continue;
    queueMoveOrder(state, map, { nationId, fromId: x.from.id, toId: x.to, units, warships });
    break;
  }
  // 5 bis. V14.1 : attaque d'une base navale ennemie face à face quand on a l'avantage.
  aiNavalStrike(state, map, nationId, ports);
  // 6. Interception active : une flotte libre attaque un convoi ennemi en mer sur une route qui part de son port
  //    (envoyée sur cette route vers la côte d'en face, elle rencontre le convoi au tour suivant).
  for (const p of ports) {
    const ships = availableForces(state, p.id).warships;
    if (ships < 2) continue;
    const prey = (state.transports || []).filter(t => t.nationId !== nationId && pairWar(state, nationId, t.nationId) && laneKeyOf(t).split('|').includes(p.id) && t.stage + 1 < t.turns)
      .filter(t => combatValue(legacyForce({ warships: ships - 1 }), { naval: true }) > 1.3 * combatValue(legacyForce(t), { naval: true }));
    const t = prey.sort((a, b) => String(a.id).localeCompare(String(b.id)))[0];
    if (!t) continue;
    // Patrouille : la flotte part sur la même route (vers l'autre extrémité) ; elle croise le convoi pendant
    // l'inter-tour, puis, sans troupes à débarquer, fait demi-tour vers son port.
    const other = laneKeyOf(t).split('|').find(id => id !== p.id);
    const dest = seaDestinations(map, p.id).find(d => d.via === other && d.id === other);
    if (!dest) continue;
    const r = queueMoveOrder(state, map, { nationId, fromId: p.id, toId: dest.id, units: {}, warships: ships - 1 });
    if (r.ok) { const o = state.orders.find(x => x.id === r.orderId); o.patrol = true; break; }
  }
}
const laneKeyOf = t => t.lane || [t.fromId, t.via].sort().join('|');
/** V14.1 : flotte maximale (en service + en chantier) d'une nation qui n'a aucune côte à viser par la mer. */
export const NAVAL_IDLE_CAP = 4;
/** V14.1 : avantage exigé (flotte ennemie simulée × marge) avant d'attaquer une base navale ennemie. */
export const NAVAL_STRIKE_MARGIN = 1.3;
/**
 * V14.1 (cahier V14 §3 point 3) : attaque d'une base navale ennemie face à face. Une flotte libre (on garde un navire au
 * port) part vers le port ennemi au bout de sa route quand la simulation du combat naval montre qu'elle coule toute la
 * flotte à quai, même majorée de NAVAL_STRIKE_MARGIN, et garde des navires. Seulement en guerre. Les navires sans troupes
 * rentrent ensuite à leur port (demi-tour). Renvoie l'ordre donné, ou null.
 */
function aiNavalStrike(state, map, nationId, ports) {
  const seen = visibleProvinces(state, map, nationId);
  for (const p of [...ports].sort((a, b) => a.id.localeCompare(b.id))) {
    const ships = availableForces(state, p.id).warships;
    if (ships < 3) continue;
    for (const d of seaDestinations(map, p.id)) {
      const harbor = state.provinces[d.via];
      if (!harbor || harbor.ownerId === nationId || !harbor.buildings?.port || !pairWar(state, nationId, harbor.ownerId)) continue;
      if ((state.transports || []).some(t => t.nationId === nationId && t.toId === d.id)) continue;
      // Flotte à quai telle qu'on la voit, ou telle qu'on l'a vue lors d'un combat (mémoire), la plus forte des deux.
      const theirs = Math.max(perceivedForce(state, map, nationId, d.via, seen).units.warship, seen.has(d.via) ? 0 : rememberedGarrison(state, nationId, d.via)?.units.warship || 0);
      if (!theirs) continue;
      const fleet = splitForce(provinceForce(state.provinces[p.id]), { warship: ships - 1 }).taken;
      const sim = resolveBattle({ defender: fleet, attackers: [{ id: 'x', force: scaleForce(legacyForce({ warships: theirs }), NAVAL_STRIKE_MARGIN) }], naval: true });
      if (hasCombatUnits(sim.attackers[0].force, true) || !(sim.defender.units.warship > 0)) continue;
      const r = queueMoveOrder(state, map, { nationId, fromId: p.id, toId: d.id, units: {}, warships: ships - 1 });
      if (r.ok) { const o = state.orders.find(x => x.id === r.orderId); o.navalStrike = true; return o; }
    }
  }
  return null;
}
/** Menace navale sur une route : navires ennemis (en guerre) à quai au bout de la route, ou convois armés en guerre sur la route. */
function navalThreat(state, nationId, fromId, via, map = null) {
  const key = [fromId, via].sort().join('|');
  const harbor = state.provinces[via];
  // V13 : navires à quai tels que l'IA les voit (port lointain non visible : estimation prudente).
  const docked = () => map ? perceivedForce(state, map, nationId, via).units.warship : harbor.warships || 0;
  let n = harbor && harbor.ownerId !== nationId && harbor.buildings?.port && pairWar(state, nationId, harbor.ownerId) ? docked() : 0;
  for (const t of state.transports || []) if (laneKeyOf(t) === key && t.nationId !== nationId && pairWar(state, nationId, t.nationId)) n += t.warships || 0;
  return n;
}
// --- V11 : personnalités (docs/V11-contrat.md, src/domain/leaders.js) ----------------------------------------
// Marge de sécurité exigée avant d'attaquer (garnison simulée × marge), par archétype.
// V14.2 (traits plus marqués) : le Conquérant accepte un combat plus serré (0,95 au lieu de 1,0) et lance jusqu'à
// deux attaques terrestres par tour (ARCH_ATTACKS) ; le Bâtisseur reste très prudent.
const ARCH_MARGIN = { conquerant: .95, traitre: 1.05, heros: 1.15, batisseur: 1.4 };
const ARCH_ATTACKS = { conquerant: 2, traitre: 1, heros: 1, batisseur: 1 };
// Risque de guerre par tour au-delà du seuil « au bord de la guerre » (V14.2 : 70, avant 75), par archétype (le Conquérant n'attend pas).
// À 85 %, la guerre est de toute façon déclarée automatiquement (hostilityWars).
const WAR_RISK = { heros: .12, traitre: .08, batisseur: .04, conquerant: 0 };
const aiMemory = (state, id) => { state.ai.plans ||= {}; return state.ai.plans[id] ||= {}; };
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
    for (const a of recentAggressions(state, 10)) if (a.attacker !== id && !pairTreaty(state, id, a.attacker, 'alliance') && !state.nations[a.attacker]?.eliminated && reachable(state, map, id, a.attacker) && !(charmOf(state, id, a.attacker) >= 3 && !pairWar(state, id, a.attacker))) out.add(a.attacker);
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
    if (units && queueMoveOrder(state, map, { nationId, fromId:x.from.id, toId:x.to, units }).ok) launched++;
  }
  recallStationed(state, map, nationId, owned); // V14.0 : rappel des troupes stationnées chez un allié
  if (activeHelpPacts(state, nationId).some(p => p.kind === 'defend')) helpReinforce(state, map, nationId, owned, base);
  helpStation(state, map, nationId, owned); // V13.4 : droit de passage — stationner chez un allié menacé
  if (arch === 'traitre') traitorStrike(state, nationId);
}
/**
 * V13 : un allié engagé à défendre masse ses renforts sur sa base navale (le point de départ vers la frontière
 * menacée : sur Arken, toutes les frontières entre nations passent par la mer) : 40 % des troupes disponibles de sa
 * province la mieux garnie, sans dégarnir une province menacée. Au plus un renfort par tour.
 */
function helpReinforce(state, map, nationId, owned, base) {
  if (!base) return;
  const value = id => combatValue({ units: availableForces(state, id) });
  const from = owned.filter(p => p.id !== base.id && (p.landConnections || []).includes(base.id) && !landThreat(map, state, nationId, p.id))
    .sort((a, b) => value(b.id) - value(a.id) || a.id.localeCompare(b.id))[0];
  if (!from || value(from.id) < combatValue({ units: { infantry: 40 } })) return;
  const available = availableForces(state, from.id), units = Object.fromEntries(LAND_UNIT_TYPES.map(k => [k, Math.floor(available[k] * .4)]));
  if (!LAND_UNIT_TYPES.some(k => units[k])) return;
  const r = queueMoveOrder(state, map, { nationId, fromId: from.id, toId: base.id, units });
  if (r.ok) state.orders.find(o => o.id === r.orderId).help = true;
}
/**
 * V14.0 : l'IA rappelle ses troupes stationnées chez un allié
 *  - quand le danger est passé : l'allié n'est plus en guerre, n'a pas été attaqué depuis 3 tours, et aucun engagement
 *    « Défends-moi » ne la retient plus ;
 *  - ou quand elle en a besoin chez elle : une de ses provinces est menacée par un voisin qu'elle ne peut pas tenir.
 * Les troupes rentrent par la terre ou par la mer vers la province menacée, sinon la capitale, sinon la plus proche ;
 * si aucune route directe n'existe (troupes à l'intérieur des terres), elles marchent d'abord vers un point de port de
 * l'allié d'où une route mène chez elles. Un ordre de rappel par contingent et par tour.
 */
function recallStationed(state, map, nationId, owned) {
  const mine = stationedOf(state, nationId);
  if (!mine.length) return;
  const ownIds = new Set(owned.map(d => d.id));
  // « Besoin chez elle » : une province qu'elle ne peut pas tenir face à l'armée d'un voisin (terre ou route maritime)
  // avec qui elle est EN GUERRE (un voisin simplement neutre ne suffit pas).
  const seen = visibleProvinces(state, map, nationId);
  const enemyNear = id => [...(provinceDef(map, id)?.landConnections || []), ...seaRoutesFrom(map, id).map(r => r.via)]
    .filter(n => state.provinces[n] && pairWar(state, nationId, state.provinces[n].ownerId))
    .map(n => { const f = perceivedForce(state, map, nationId, n, seen); f.units.warship = 0; f.wounds.warship = 0; return f; })
    .sort((a, b) => combatValue(b) - combatValue(a))[0] || null;
  const threatened = owned.filter(d => { const threat = enemyNear(d.id); return threat && !holds(provinceForce(state.provinces[d.id]), threat, state.provinces[d.id].buildings.fort || 0); }).map(d => d.id);
  const capital = state.nations[nationId]?.capitalId;
  const heroCovers = req => archetypeOf(state, nationId) === 'heros' && recentAggressions(state, 3).some(a => a.victim === req);
  for (const e of [...mine].sort((a, b) => a.provinceId.localeCompare(b.provinceId))) {
    const host = state.provinces[e.provinceId]?.ownerId;
    if (!host || !hasPassage(state, nationId, host)) continue; // settleStationed s'en charge
    if ((state.orders || []).some(o => o.kind === 'move' && o.status === 'pending' && o.nationId === nationId && o.fromId === e.provinceId)) continue;
    const danger = aliveNations(state).some(n => n !== host && n !== nationId && (pairWar(state, host, n) || recentAggressions(state, 3).some(a => a.attacker === n && a.victim === host)));
    const bound = activeHelpPacts(state, nationId).some(p => p.kind === 'defend' && p.requester === host) || heroCovers(host);
    const needed = threatened.length > 0;
    if (!needed && (danger || bound)) continue;
    // V14.1 (« À surveiller » V14.0) : plus de va-et-vient — des troupes envoyées en aide il y a moins de STATION_MIN_TURNS
    // tours restent (escale comprise), sauf si l'on a besoin d'elles chez soi.
    if (!needed && state.turn - (aiMemory(state, nationId).helpSent?.[host] ?? -99) < STATION_MIN_TURNS) continue;
    const avail = availableForces(state, e.provinceId, nationId);
    const units = Object.fromEntries(LAND_UNIT_TYPES.map(k => [k, avail[k] || 0]));
    if (!LAND_UNIT_TYPES.some(k => units[k])) continue;
    const routes = legalDestinations(map, state, e.provinceId);
    const rank = id => (threatened.includes(id) ? 0 : id === capital ? 1 : 2);
    const home = routes.filter(r => ownIds.has(r.id)).sort((a, b) => rank(a.id) - rank(b.id) || (a.turns || 0) - (b.turns || 0) || a.id.localeCompare(b.id))[0];
    // Pas de route directe : d'abord vers un point de port de l'allié d'où l'on peut rentrer par la mer.
    const step = home ? null : routes.filter(r => r.type === 'land' && state.provinces[r.id]?.ownerId === host && legalDestinations(map, state, r.id).some(x => ownIds.has(x.id) && x.type === 'sea'))
      .sort((a, b) => a.id.localeCompare(b.id))[0];
    const to = home || step;
    if (!to) continue;
    const r = queueMoveOrder(state, map, { nationId, fromId: e.provinceId, toId: to.id, units, warships: to.type === 'sea' ? avail.warships || 0 : 0 });
    if (r.ok) { const o = state.orders.find(x => x.id === r.orderId); o.recall = needed ? 'home' : 'safe'; if (!needed) ((aiMemory(state, nationId).recalled ||= {})[host] = state.turn); }
  }
}
/** V14.1 : après un envoi d'aide, les troupes restent au moins ce nombre de tours chez l'allié (sauf besoin chez soi). */
export const STATION_MIN_TURNS = 5;
const noteHelpSent = (state, nationId, host) => { if (host) (aiMemory(state, nationId).helpSent ||= {})[host] = state.turn; };
/**
 * V13.4 : droit de passage — un allié engagé à défendre envoie des troupes STATIONNER dans la province menacée du
 * demandeur (celle de la demande, sinon sa province la plus exposée), par la terre ou par la mer, depuis la province
 * où il peut le mieux s'en passer. Au plus un envoi par tour, et pas tant qu'il y a déjà assez de ses troupes sur place.
 */
function helpStation(state, map, nationId, owned) {
  const pacts = activeHelpPacts(state, nationId).filter(p => p.kind === 'defend');
  // Le Héros n'attend pas qu'on le lui demande : il vient défendre un allié attaqué récemment (IA ou joueur).
  // V14.1 : après un rappel « danger passé », il ne revient que pour une NOUVELLE agression (pas de va-et-vient).
  const recalled = aiMemory(state, nationId).recalled || {};
  if (archetypeOf(state, nationId) === 'heros') for (const a of recentAggressions(state, 3))
    if (a.victim !== nationId && pairTreaty(state, nationId, a.victim, 'alliance') && !pacts.some(p => p.requester === a.victim) && !(a.turn <= (recalled[a.victim] ?? -99))) pacts.push({ requester: a.victim, kind: 'defend', provinceId: null });
  for (const pact of pacts) {
    const req = pact.requester;
    const enemies = new Set(aliveNations(state).filter(n => n !== req && n !== nationId && (pairWar(state, req, n) || recentAggressions(state, 3).some(a => a.attacker === n && a.victim === req))));
    const exposed = id => (provinceDef(map, id)?.landConnections || []).some(n => enemies.has(state.provinces[n]?.ownerId))
      || (map.maritimeRoutes || []).some(([a, b]) => (a === id && enemies.has(state.provinces[b]?.ownerId)) || (b === id && enemies.has(state.provinces[a]?.ownerId)));
    const theirs = map.provinces.filter(d => state.provinces[d.id]?.ownerId === req).map(d => d.id);
    const wanted = [pact.provinceId, ...theirs.filter(exposed).sort((a, b) => Number(state.nations[req]?.capitalId === b) - Number(state.nations[req]?.capitalId === a) || a.localeCompare(b))]
      .filter((id, i, list) => id && list.indexOf(id) === i && state.provinces[id]?.ownerId === req);
    // V14.0 : troupes déjà stationnées chez le demandeur, dans une province qui n'est pas menacée (escale) : elles
    // avancent vers la province menacée voisine.
    for (const e of stationedOf(state, nationId).filter(x => state.provinces[x.provinceId]?.ownerId === req && !wanted.includes(x.provinceId)).sort((a, b) => a.provinceId.localeCompare(b.provinceId))) {
      if ((state.orders || []).some(o => o.kind === 'move' && o.status === 'pending' && o.nationId === nationId && o.fromId === e.provinceId)) continue;
      const toId = wanted.find(id => legalDestinations(map, state, e.provinceId).some(x => x.id === id && x.type === 'land'));
      const avail = availableForces(state, e.provinceId, nationId), units = Object.fromEntries(LAND_UNIT_TYPES.map(k => [k, avail[k] || 0]));
      if (!toId || !LAND_UNIT_TYPES.some(k => units[k])) continue;
      const r = queueMoveOrder(state, map, { nationId, fromId: e.provinceId, toId, units });
      if (r.ok) { state.orders.find(o => o.id === r.orderId).help = true; noteHelpSent(state, nationId, req); }
    }
    for (const toId of wanted) {
      if (combatValue(stationedForce(state, toId, nationId)) >= combatValue({ units: { infantry: 60 } })) continue;
      if ((state.orders || []).some(o => o.kind === 'move' && o.status === 'pending' && o.nationId === nationId && o.toId === toId) || (state.transports || []).some(t => t.nationId === nationId && t.toId === toId)) continue;
      const sources = owned.filter(d => legalDestinations(map, state, d.id).some(x => x.id === toId))
        .map(d => ({ d, route: legalDestinations(map, state, d.id).find(x => x.id === toId), value: combatValue({ units: availableForces(state, d.id) }) }))
        .filter(x => x.value >= combatValue({ units: { infantry: 40 } }) && (x.route.type === 'land' || !navalThreat(state, nationId, x.d.id, x.route.via, map)))
        .sort((a, b) => b.value - a.value || a.d.id.localeCompare(b.d.id));
      // V14.0 (vérification du point 1 du cahier V14) : province menacée hors de portée directe (ex. Branvale, au nord
      // de Valmorne, pour Roc-Épine qui n'atteint que Sylvaren par la mer) → escale dans une province du demandeur d'où
      // une route terrestre y mène ; les troupes avancent au tour suivant (boucle ci-dessus). Avant, l'allié ne venait
      // qu'une fois la province menacée tombée.
      const steps = sources.length ? [] : owned.flatMap(d => legalDestinations(map, state, d.id)
        .filter(x => x.id !== toId && state.provinces[x.id]?.ownerId === req && legalDestinations(map, state, x.id).some(y => y.id === toId && y.type === 'land'))
        .map(x => ({ d, stage: x.id, route: x, value: combatValue({ units: availableForces(state, d.id) }) })))
        .filter(x => x.value >= combatValue({ units: { infantry: 40 } }) && (x.route.type === 'land' || !navalThreat(state, nationId, x.d.id, x.route.via, map)))
        .filter(x => !(state.orders || []).some(o => o.kind === 'move' && o.status === 'pending' && o.nationId === nationId && o.toId === x.stage) && !(state.transports || []).some(t => t.nationId === nationId && t.toId === x.stage))
        .sort((a, b) => b.value - a.value || a.d.id.localeCompare(b.d.id) || a.stage.localeCompare(b.stage));
      for (const { d, stage } of [...sources.map(x => ({ d: x.d, stage: toId })), ...steps]) {
        const available = availableForces(state, d.id), units = Object.fromEntries(LAND_UNIT_TYPES.map(k => [k, Math.floor(available[k] * .4)]));
        if (!LAND_UNIT_TYPES.some(k => units[k])) continue;
        const kept = normalizeForce({ units: Object.fromEntries(LAND_UNIT_TYPES.map(k => [k, (state.provinces[d.id].units[k] || 0) - units[k]])) });
        const threat = landThreatForce(map, state, nationId, d.id);
        if (threat && !holds(kept, threat, state.provinces[d.id].buildings.fort || 0)) continue;
        const r = queueMoveOrder(state, map, { nationId, fromId: d.id, toId: stage, units });
        if (r.ok) { state.orders.find(o => o.id === r.orderId).help = true; noteHelpSent(state, nationId, req); return; }
      }
    }
  }
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
function aiAttackSlice(state, map, nationId, fromId, toId, margin, mode, warships = 0, via = null) {
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
    const r = resolveCombat({ attacker: taken, defender: interceptors && via === toId ? (() => { const d = normalizeForce(defense); d.units.warship = 0; d.wounds.warship = 0; return d; })() : defense, fortLevel: target.buildings.fort || 0, mode });
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
function rememberGarrison(state, nationId, provinceId, force) {
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
const holds = (garrison, threat, fortLevel) => !resolveCombat({ attacker: scaleForce(threat, .9), defender: garrison, fortLevel }).captured;
export function planAIOrders(state, map) {
  state.ai ||= { memories:{}, replay:[], traits:{} };
  ensureLeaders(state);
  if (state.ai.plannedTurn === state.turn) return state.orders.filter(o => o.nationId !== state.playerNationId);
  for (const id of Object.keys(state.nations).sort()) if (state.controllers[id] === 'ai' && !state.nations[id].eliminated) aiPlan(state,map,id);
  state.ai.plannedTurn=state.turn;
  return state.orders.filter(o => o.nationId !== state.playerNationId);
}

export function setRelation(state, { nationId, target, type }) {
  if (nationId === target) return { ok:false, error:'Cible invalide' };
  const atWar = pairWar(state, nationId, target);
  if (type === 'alliance' && atWar) return { ok:false, error:'Un cessez-le-feu est requis avant une alliance' };
  if (type === 'ceasefire' && !atWar) return { ok:false, error:'Aucune guerre active' };
  state.diplomacy.wars = state.diplomacy.wars.filter(w => !(w.participants.includes(nationId) && w.participants.includes(target)));
  state.diplomacy.treaties = state.diplomacy.treaties.filter(t => !(t.parties?.includes(nationId) && t.parties?.includes(target)));
  if (type === 'war') state.diplomacy.wars.push({ active:true, participants:[nationId,target], started:state.turn });
  if (type === 'alliance' || type === 'ceasefire') state.diplomacy.treaties.push({ active:true, type, parties:[nationId,target], started:state.turn });
  state.events.push({ turn:state.turn, type:'diplomacy', nationId, target, relation:type });
  settleStationed(state, null);
  return { ok:true };
}
export function recordDiplomaticAction(state, { nationId, target, action, offerLevel = .5 }) {
  if (action === 'prisoners') return { ok:false, error:'Action supprimée en V3' };
  if(action==='tribute')return{ok:false,error:'Le tribut séparé a été retiré en V5'};
  if(action==='ultimatum'||action==='ceasefire')return queueDiplomaticOrder(state,{nationId,target,action,offerLevel});
  const amount=0;
  state.messages.push({ turn:state.turn, nationId, target, action, amount, status:'recorded' });
  state.events.push({ turn:state.turn, type:'diplomatic-action', nationId, target, action, amount });
  return { ok:true };
}

export function eventKnownToPlayer(state, map, event) {
  const player = state.playerNationId;
  if ([event.attacker,event.defender,event.nationId,event.target,event.newOwnerId,...(event.originIds||[]),...(event.guests||[])].includes(player)) return true;
  // V10 : tout affrontement (pris ou tenu), pillage de capitale et élimination sont publics ; le détail des pertes
  // n'est donné qu'aux nations impliquées (voir journalEntry).
  if (['conquest', 'battle', 'field-battle', 'capital-plunder', 'elimination', 'interception', 'game-over', 'talk', 'betrayal', 'reveal', 'alliance-broken', 'final-turns', 'auto-war', 'hostility-war'].includes(event.type)) return true;
  if (event.type === 'hostility-warning') return false; // V14.2 : avertissement privé (le joueur concerné est traité plus haut)
  // V11 : un franchissement de seuil de tension n'est connu que s'il concerne le joueur (traité plus haut).
  if (event.type === 'tension') return false;
  if ((event.attackers || []).includes(player)) return true;
  if (event.provinceId && state.provinces[event.provinceId]?.ownerId === player) return true;
  if (!event.provinceId) return event.type === 'diplomatic-action' && [event.nationId,event.target].includes(player);
  // V13 : la règle « ballon » est remplacée par la vision (province visible du joueur ou de ses alliés).
  return visibleProvinces(state, map, player).has(event.provinceId);
}
/** Le joueur est-il partie prenante de l'événement (attaquant, défenseur, cible…) ? */
export function eventInvolvesNation(event, nationId) {
  if (!nationId) return false;
  return [event.attacker,event.defender,event.nationId,event.target,event.newOwnerId,...(event.attackers||[]),...(event.guests||[])].includes(nationId);
}
// `balloon` : seulement pour relire les événements d'anciennes parties (le ballon est supprimé en V13).
const LABELS_LOSS = { infantry:'fantassins', cavalry:'cavaliers', armor:'blindés', artillery:'artilleurs', balloon:'ballons', warship:'navires' };
const LABELS_ONE = { infantry:'fantassin', cavalry:'cavalier', armor:'blindé', artillery:'artilleur', balloon:'ballon', warship:'navire' };
const lossText = byType => { const parts = Object.entries(byType || {}).filter(([,n]) => n > 0).map(([k,n]) => `${n} ${(n === 1 ? LABELS_ONE[k] : LABELS_LOSS[k]) || k}`); return parts.length ? parts.join(', ') : 'aucune'; };
/**
 * Entrée de journal d'un événement. `playerNationId` = nation qui lit le journal.
 * Affrontements (V10) : texte public « Affrontement à X entre A et B — province prise / tenue » ; le détail des
 * pertes n'est ajouté que si la nation qui lit est impliquée (champ `details`).
 */
export function journalEntry(event, map, playerNationId = null) {
  const def = event.provinceId ? provinceDef(map, event.provinceId)?.name : null;
  const where = def || 'lieu inconnu';
  const involved = playerNationId === null || eventInvolvesNation(event, playerNationId);
  const sides = event => { const atk = [...new Set(event.attackers?.length ? event.attackers : [event.attacker])].map(id => nationName(map,id)); return `${atk.join(' et ')} et ${nationName(map,event.defender)}`; };
  const lossDetails = () => {
    if (!involved) return '';
    if (event.lossesByNation) {
      let t = ' Pertes : ' + Object.entries(event.lossesByNation).map(([id, l]) => `${nationName(map,id)} ${lossText(l)}`).join(' ; ') + '.';
      // V13.3 : forces engagées, PV perdus (les blindés et l'artillerie encaissent beaucoup avant de mourir), forteresse.
      if (event.engagedByNation) t += ' Forces engagées : ' + Object.entries(event.engagedByNation).map(([id, u]) => `${nationName(map,id)} ${lossText(u)}`).join(' ; ') + '.';
      const mods = [event.fortLevel > 0 ? `forteresse niveau ${event.fortLevel} : −${safeNum(event.fortPct ?? fortReductionPct(event.fortLevel))} % de dégâts reçus par le défenseur` : '', event.guests?.length ? `renforts alliés en défense : ${event.guests.map(id => nationName(map, id)).join(', ')}` : '', event.naval ? `débarquement : assaillant à ${Math.round((event.landingPct ?? 70))} %` : ''].filter(Boolean);
      // V14.2 (Jack) : un saut de ligne sépare le récap du début des pertes totales avec blessés.
      if (event.hpLostByNation) t += '\nPV perdus, blessés compris : ' + Object.entries(event.hpLostByNation).map(([id, hp]) => `${nationName(map,id)} ${safeNum(hp)}`).join(' ; ') + (mods.length ? ` (${mods.join(' ; ')})` : '') + '.';
      return t;
    }
    return ` Pertes : attaquant ${safeNum(event.attackerLosses)}, défenseur ${safeNum(event.defenderLosses)}.`;
  };
  const how = event.naval ? ' (débarquement)' : '';
  switch (event.type) {
    case 'battle': {
      const mine = involved && playerNationId !== null;
      // V13.3 (Jack) : être attaqué doit sauter aux yeux.
      if (event.defender === playerNationId && playerNationId !== null) return { priority:4, type:'⚠ ON VOUS ATTAQUE', category:'under-attack', public:true,
        text:`${where} attaquée par ${[...new Set(event.attackers?.length ? event.attackers : [event.attacker])].map(id => nationName(map,id)).join(' et ')}${how} : vous tenez la province.${lossDetails()}` };
      return { priority:3, type: mine ? (event.naval ? 'DÉBARQUEMENT' : 'COMBAT') : 'AFFRONTEMENT', category: mine ? 'combat' : 'foreign-conflict', public:true,
        text:`Affrontement à ${where} entre ${sides(event)}${how} : ${nationName(map,event.defender)} tient la province.${lossDetails()}` };
    }
    case 'conquest': {
      const winner = event.newOwnerId || event.attacker, defender = event.defender;
      const type = winner===playerNationId?'CONQUÊTE':defender===playerNationId?'⚠ TERRITOIRE PERDU':'CONFLIT ÉTRANGER';
      return { priority:4, type, category:type==='CONQUÊTE'?'conquest':type==='⚠ TERRITOIRE PERDU'?'under-attack':'foreign-conflict', public:true,
        text:`Affrontement à ${where} entre ${sides(event)}${how} : ${nationName(map,winner)} prend la province.${lossDetails()}` };
    }
    case 'capital-plunder': return { priority:4, type:'PILLAGE', category: event.attacker===playerNationId?'conquest':event.defender===playerNationId?'lost':'foreign-conflict', public:true,
      text: event.loot > 0 && !(event.fromTreasury > 0)
        ? `Capitale prise : ${nationName(map,event.attacker)} s’empare de ${where} et pille ${safeNum(event.amount)} or de butin (trésor ${deName(nationName(map,event.defender))} vide : minimum garanti).`
        : event.loot > 0
        ? `Capitale prise : ${nationName(map,event.attacker)} s’empare de ${where} et pille ${safeNum(event.amount)} or (minimum garanti : ${safeNum(event.fromTreasury)} or du trésor ${deName(nationName(map,event.defender))}, ${safeNum(event.loot)} or de butin).`
        : `Capitale prise : ${nationName(map,event.attacker)} s’empare de ${where} et pille ${safeNum(event.amount)} or du trésor ${deName(nationName(map,event.defender))} (${Math.round((event.rate ?? RULES.capitalPlunderRate)*100)} %).` };
    case 'elimination': return { priority:4, type:'ÉLIMINATION', category: event.nationId===playerNationId?'lost':'foreign-conflict', public:true, text:`${nationName(map,event.nationId)} n’a plus aucune province : la nation est éliminée.` };
    case 'field-battle': return { priority:3, type: involved && playerNationId !== null ? 'COMBAT' : 'AFFRONTEMENT', category: involved && playerNationId !== null ? 'combat' : 'foreign-conflict', public:true,
      text:`Affrontement en rase campagne entre ${nationName(map,event.attacker)} et ${nationName(map,event.defender)}, entre ${provinceDef(map,event.fromId)?.name || '?'} et ${where} : les deux armées se sont croisées.${lossDetails()}` };
    case 'interception': {
      const mine = involved && playerNationId !== null;
      const route = `${provinceDef(map,event.fromId)?.name || '?'} → ${provinceDef(map,event.toId)?.name || '?'}`;
      const how = event.kind === 'port' ? `par la flotte du port de ${where}` : 'en pleine mer';
      const outcome = event.convoyDestroyed ? 'le convoi est coulé' : event.escorted ? 'l’escorte a protégé le convoi' : 'le convoi poursuit sa route avec des pertes';
      if (event.strike) return { priority:3, type:'INTERCEPTION', category: !mine ? 'foreign-conflict' : 'combat', public:true,
        text:`Bataille navale devant le port de ${where} : la flotte ${deName(nationName(map,event.defender))} attaque la base navale ${deName(nationName(map,event.attacker))} ; ${event.convoyDestroyed ? 'la flotte d’attaque est coulée' : event.attackerLeft > 0 ? 'les deux flottes survivent, l’assaillant rentre au port' : 'la flotte du port est détruite'}.${lossDetails()}` };
      return { priority:3, type:'INTERCEPTION', category: !mine ? 'foreign-conflict' : event.target===playerNationId ? (event.convoyDestroyed ? 'lost' : 'combat') : 'combat', public:true,
        text:`Interception ${how} : ${nationName(map,event.attacker)} attaque un convoi de ${nationName(map,event.defender)} (${route}) ; ${outcome}.${lossDetails()}` };
    }
    case 'convoy-departed': return { priority:1, type:'MARINE', category:'neutral', text: event.returning
      ? `L’escorte repart de ${provinceDef(map,event.fromId)?.name || '?'} (pas de port pour mouiller) vers ${provinceDef(map,event.toId)?.name || '?'} : ${safeNum(event.turns)} tours en mer.`
      : `Convoi embarqué à ${provinceDef(map,event.fromId)?.name || '?'} vers ${provinceDef(map,event.toId)?.name || '?'} : ${safeNum(event.turns)} tours en mer${event.escort ? `, escorté par ${event.escort} navire${event.escort > 1 ? 's' : ''}` : ', sans escorte'}.` };
    case 'convoy-arrived': if (event.passage) return { priority:2, type:'PASSAGE', category:'help', text: event.target === playerNationId && playerNationId !== null
        ? `🤝 Un convoi de ${nationName(map,event.nationId)} (allié) arrive à ${where} : ${safeNum(event.amount)} unités y stationnent et la défendront avec vous.`
        : `🤝 Convoi arrivé chez ${nationName(map,event.target)} (allié) à ${where} : ${safeNum(event.amount)} unités y stationnent et la défendront.` };
      return { priority:2, type:'DÉBARQUEMENT', category:'neutral', text:`${event.returning ? 'Retour au port' : 'Convoi arrivé'} à ${where} : ${safeNum(event.amount)} unités débarquées en renfort.` };
    case 'convoy-returning': return { priority:2, type:'MARINE', category:'neutral', text: event.reason === 'repelled'
      ? `Débarquement repoussé à ${where} : ${safeNum(event.amount)} survivants rembarquent et rentrent à ${provinceDef(map,event.toId)?.name || 'leur port'} (${safeNum(event.turns)} tours).`
      : event.reason === 'strike' ? `Après l’attaque du port de ${where}, la flotte rentre à ${provinceDef(map,event.toId)?.name || 'son port'} (${safeNum(event.turns)} tours).`
      : event.reason === 'ally' ? `Le convoi rentre à ${provinceDef(map,event.toId)?.name || 'son port'} (${safeNum(event.turns)} tours).`
      : `Plus de troupes à débarquer devant ${where} : les navires font demi-tour vers ${provinceDef(map,event.toId)?.name || 'leur port'}.` };
    // V11 : personnalités, échanges publics, tension.
    case 'talk': return { priority: event.target === playerNationId ? 3 : 1, type:'ÉCHANGE', category:'talk', public:true, tone: event.tone,
      text:`${nationName(map,event.nationId)} → ${event.target ? (event.target === playerNationId ? 'vous' : nationName(map,event.target)) : 'à tous'} : « ${event.text || '…'} »` };
    case 'betrayal': if (event.truce) return { priority:5, type:'TRAHISON', category:'betrayal', public:true,
      text:`Trahison : ${nationName(map,event.nationId)} rompt la trêve signée ${event.truceTurns > 0 ? `il y a ${safeNum(event.truceTurns)} tour${event.truceTurns > 1 ? 's' : ''}` : 'ce tour-ci'} et attaque ${event.target === playerNationId ? 'votre nation' : nationName(map,event.target)}. Tout Arken le saura.` };
      return { priority:5, type:'TRAHISON', category:'betrayal', public:true,
      text:`Trahison : ${nationName(map,event.nationId)} attaque ${event.target === playerNationId ? 'votre nation, son alliée' : `${nationName(map,event.target)}, son allié`}. L’alliance est rompue.` };
    // V14.1 : guerre automatique (des troupes ont combattu en défendant un allié).
    case 'auto-war': {
      const X = nationName(map, event.target), G = nationName(map, event.nationId), host = event.host ? nationName(map, event.host) : null;
      const at = def ? ` à ${def}${host && event.host !== event.nationId ? ` (en défendant ${event.host === playerNationId ? 'votre province' : host})` : ''}` : '';
      if (event.nationId === playerNationId && playerNationId !== null) return { priority:4, type:'GUERRE', category:'combat', public:true,
        text:`⚔ Vos troupes ont combattu ${X} : vous êtes désormais en guerre avec ${X}.${at ? ` Combat${at}.` : ''}${event.brokeTruce ? ` La trêve avec ${X} est rompue, sans trahison : vous vous défendiez.` : ''}` };
      if (event.target === playerNationId && playerNationId !== null) return { priority:4, type:'GUERRE', category:'combat', public:true,
        text:`⚔ Les troupes ${deName(G)} ont combattu les vôtres${at} : ${G} est désormais en guerre avec vous.${event.brokeTruce ? ` La trêve est rompue, sans trahison de sa part : ${G} se défendait.` : ''}` };
      return { priority:3, type:'GUERRE', category:'foreign-conflict', public:true,
        text:`⚔ Les troupes ${deName(G)} ont combattu ${X}${at} : ${G} est désormais en guerre avec ${X}.${event.brokeTruce ? ' Leur trêve est rompue, sans trahison.' : ''}` };
    }
    // V14.2 : hostilité — avertissement à 70 %, guerre déclarée automatiquement à 85 %.
    case 'hostility-warning': {
      const other = event.nationId === playerNationId ? event.target : event.target === playerNationId ? event.nationId : null;
      if (!other) return null;
      return { priority:4, type:'⚠ HOSTILITÉ', category:'under-attack', public:false,
        text:`Tension avec ${nationName(map,other)} : ${safeNum(event.value)} %. Attention : dès ${HOSTILITY_WAR} % (à partir du prochain tour), la guerre sera déclarée automatiquement. Un message amical, une alliance ou une trêve fait baisser la tension.` };
    }
    case 'hostility-war': {
      const A = nationName(map, event.nationId), B = nationName(map, event.target);
      const other = event.nationId === playerNationId ? B : event.target === playerNationId ? A : null;
      if (other) return { priority:5, type:'⚔ GUERRE DÉCLARÉE', category:'under-attack', public:true,
        text:`L’hostilité avec ${other} a atteint ${safeNum(event.value)} % (seuil : ${HOSTILITY_WAR} %) : la guerre est déclarée entre vous et ${other}. Vos troupes peuvent désormais l’attaquer, et les siennes vous attaquer.` };
      return { priority:3, type:'GUERRE', category:'foreign-conflict', public:true,
        text:`L’hostilité entre ${A} et ${B} a atteint ${safeNum(event.value)} % : les deux nations sont désormais en guerre.` };
    }
    case 'reveal': return { priority:4, type:'RÉVÉLATION', category:'reveal', public:true,
      text:`${nationName(map,event.nationId)} se révèle : ${ARCHETYPE_LABELS[event.archetype] || 'un dirigeant'}${({ betrayal:' — il a trahi son allié', conquest:' — ses conquêtes ne laissent aucun doute', defense:' — il prend les armes pour défendre les nations attaquées', builder:' — il bâtit et ne cherche pas la guerre' })[event.revealedBy || event.reason] || ''}.` };
    case 'tension': {
      const other = event.nationId === playerNationId ? event.target : event.nationId;
      return { priority: event.label === 'au bord de la guerre' ? 3 : 2, type:'TENSION', category:'tension',
        text: event.rising ? `Tension avec ${nationName(map,other)} : ${event.label} (${safeNum(event.value)} %).${event.label === 'au bord de la guerre' ? ` À ${HOSTILITY_WAR} %, la guerre sera déclarée automatiquement.` : ''}` : `La tension retombe avec ${nationName(map,other)} : ${event.label} (${safeNum(event.value)} %).` };
    }
    // V13 : alliances (rupture, demandes d'aide).
    case 'alliance-broken': return { priority:4, type:'DIPLOMATIE', category:'blue', public:true,
      text:`${nationName(map,event.nationId)} rompt son alliance avec ${event.target === playerNationId ? 'vous' : nationName(map,event.target)}.` };
    case 'help-answer': case 'help-broken': case 'help-ended': return { priority: event.type === 'help-ended' ? 2 : 4, type:'AIDE', category: event.type === 'help-broken' || (event.type === 'help-answer' && !event.accepted) ? 'help-refused' : 'help', text: helpJournalText(event, map, playerNationId) };
    case 'game-over': return { priority:5, type:'FIN DE PARTIE', category: event.winnerId===playerNationId?'conquest':'foreign-conflict', public:true,
      text: event.reason==='capitals' ? `${nationName(map,event.winnerId)} tient les cinq capitales : victoire !` : event.reason==='player-eliminated' ? `Votre nation est éliminée. ${nationName(map,event.winnerId)} mène le classement.` : `Fin de la partie au tour ${safeNum(event.turn)} : ${nationName(map,event.winnerId)} termine en tête du classement.` };
    case 'attack-cancelled': if (event.reason === 'passage-lost') return { priority:2, type:'ORDRE ANNULÉ', category:'neutral', text:`Passage vers ${where} annulé : l’alliance a été rompue. Vos troupes ne bougent pas${event.naval ? ' et le convoi rentre au port' : ''}.` };
      if (event.reason === 'ally-land') return { priority:2, type:'ORDRE ANNULÉ', category:'neutral', text:`Attaque vers ${where} annulée : pas de guerre entre alliés.` };
      if (event.reason === 'ceasefire') return { priority:2, type:'ORDRE ANNULÉ', category:'neutral', text:`Débarquement à ${where} annulé : un cessez-le-feu a été conclu pendant la traversée. Le convoi rentre à ${provinceDef(map,event.fromId)?.name || 'son port'}.` };
      if (event.reason === 'ally') return { priority:2, type:'ORDRE ANNULÉ', category:'neutral', text:`Débarquement à ${where} annulé : la province appartient à un allié. Le convoi rentre à ${provinceDef(map,event.fromId)?.name || 'son port'}.` };
      return { priority:2, type:'ORDRE ANNULÉ', category:'neutral', text: event.reason === 'target-changed' ? `Attaque vers ${where} annulée : la province a changé de main avant l’arrivée des troupes, qui rentrent à ${provinceDef(map,event.fromId)?.name || 'leur base'}.` : `Attaque vers ${where} annulée : la province de départ ${provinceDef(map,event.fromId)?.name || ''} est tombée avant le départ des troupes.` };
    case 'production-lost': return { priority:2, type:'production', category:'lost', text:`Production perdue à ${where} (province prise) : ${RULES.units[event.productionType]?.label || ({bank:'banque',factory:'usine',fort:'forteresse',port:'port'})[event.productionType] || 'commande'} annulée, ${safeNum(event.refund)} or remboursés.` };
    case 'income': {
      const parts = [`${safeNum(event.provinces)} province${event.provinces > 1 ? 's' : ''} × ${RULES.baseIncome}`];
      if (event.banks) parts.push(`${safeNum(event.banks)} banque${event.banks > 1 ? 's' : ''} × ${RULES.bankIncome}`);
      if (event.factories) parts.push(`${safeNum(event.factories)} usine${event.factories > 1 ? 's' : ''} × ${RULES.factoryIncome}`);
      if (event.ports) parts.push(`${safeNum(event.ports)} port${event.ports > 1 ? 's' : ''} × ${RULES.portIncome}`);
      if (event.bonus) parts.push(`atout +${safeNum(event.bonus)}`);
      return { priority:0, type:'REVENUS', category:'treasure', text:`💰 Revenus du tour : +${safeNum(event.amount)} or (${parts.join(' · ')}).` };
    }
    case 'retreat-lost': if (event.naval) return { priority:2, type:'MARINE', category:'lost', text:`Des navires n’ont plus de port où rentrer (${where} perdue) : ${safeNum(event.amount)} unités perdues en mer.` };
      return { priority:2, type:'COMBAT', category:'lost', text:`Les survivants d’une attaque n’ont pas pu se replier (province de départ perdue) : ${safeNum(event.amount)} unités perdues.` };
    case 'ceasefire-offer': if (event.custom) { const who = nationName(map, event.target), by = nationName(map, event.nationId);
        if (!event.accepted) return { priority:2, type:'DIPLOMATIE', category:'blue', text:`${who} refuse le cessez-le-feu proposé par ${by} ; aucun or n’a changé de mains.` };
        return { priority:2, type:'DIPLOMATIE', category:'blue', text: event.demand > 0 ? `Cessez-le-feu : ${who} accepte vos conditions et verse ${safeNum(event.demand)} or à ${by}.`.replace('vos conditions', event.nationId === playerNationId ? 'vos conditions' : 'les conditions')
          : event.amount > 0 ? `Cessez-le-feu accepté par ${who} contre ${safeNum(event.amount)} or, versés par ${by}.` : `Cessez-le-feu sans paiement accepté par ${who}.` }; }
      return {priority:2,type:'DIPLOMATIE',category:'blue',text:event.accepted?`Cessez-le-feu accepté par ${nationName(map,event.target)} contre ${safeNum(event.amount)} or, versés à ${nationName(map,event.target)}.`:`Cessez-le-feu refusé par ${nationName(map,event.target)} ; aucun paiement n’a été débité.`};
    case 'final-turns': return { priority:2, type:'FIN DE PARTIE', category:'endgame', text:`⏳ Plus que ${safeNum(event.remaining)} tours avant la fin de la partie (tour ${RULES.gameLength}). Classement : provinces, puis capitales, puis trésor.` };
    case 'war-chest': return { priority:2,type:'économie',category:'neutral',text:`Trésor de guerre reçu après la prise de ${where} : +${safeNum(event.amount)}.` };
    case 'diplomacy': return { priority:2,type:'diplomatie',category:'blue',text:event.relation==='war'?(event.reason==='combat'?`${nationName(map,event.nationId)} attaque ${nationName(map,event.target)} : les deux nations sont désormais en guerre.`:`${nationName(map,event.nationId)} et ${nationName(map,event.target)} sont désormais en guerre.`):`Relation modifiée entre ${nationName(map,event.nationId)} et ${nationName(map,event.target)}.` };
    case 'diplomatic-action': if (event.proposal && event.superseded) return null;
      if (event.proposal) return { priority:3, type:'DIPLOMATIE', category:'blue', text:`${nationName(map,event.nationId)} ${event.target===playerNationId?'vous ':''}propose ${event.action==='alliance'?'une alliance':'un cessez-le-feu'}${event.target===playerNationId?' : répondez Oui ou Non dans la fenêtre qui suit ce journal.':` à ${nationName(map,event.target)}.`}` };
      if (event.viaTalk) return { priority:3, type:'DIPLOMATIE', category:'blue', text:`${event.action==='alliance'?(event.accepted?'Alliance conclue':'Alliance refusée'):(event.accepted?'Cessez-le-feu conclu':'Cessez-le-feu refusé')} entre ${nationName(map,event.nationId)} et ${nationName(map,event.target)}${event.accepted&&event.amount>0?` : ${nationName(map,event.target)} verse ${safeNum(event.amount)} or`:''}.` };
      if (event.action==='alliance' && event.accepted!==undefined) return { priority:2, type:'DIPLOMATIE', category:'blue', text: event.accepted ? `Alliance conclue entre ${nationName(map,event.nationId)} et ${nationName(map,event.target)}.` : `${nationName(map,event.target)} refuse l’alliance proposée par ${nationName(map,event.nationId)}.` };
      return { priority:2,type:'DIPLOMATIE',category:'blue',text:event.action==='tribute'?`Ancien transfert diplomatique V4 de ${safeNum(event.amount)} or effectué au profit de ${nationName(map,event.target)}.`:`${({war:'Déclaration de guerre',alliance:'Proposition d’alliance',ceasefire:'Proposition de cessez-le-feu'})[event.action] || 'Action diplomatique'} résolue avec ${nationName(map,event.target)}.` };
    case 'production-complete': return { priority:1,type:'production',category:'neutral',text:`${safeNum(event.amount)}${event.bonus ? ` (dont +${safeNum(event.bonus)} grâce à l’atout Recrutement)` : ''} ${RULES.units[event.productionType]?.label || (event.productionType==='bank'?'banque':event.productionType==='factory'?'usine':event.productionType==='fort'?'forteresse':event.productionType==='port'?'port':'élément')} terminé(s) à ${where}.` };
    case 'project-started': return { priority:1,type:'production',category:'neutral',text:`Projet lancé : ${RULES.units[event.productionType]?.label || ({bank:'banque',factory:'usine',fort:'forteresse',port:'port'})[event.productionType] || 'construction'} à ${where}.` };
    case 'movement': if (event.passage) return { priority:2, type:'PASSAGE', category:'help', text: event.target === playerNationId && playerNationId !== null
        ? `🤝 ${nationName(map,event.nationId)} (allié) envoie ${safeNum(event.amount)} unités stationner à ${provinceDef(map,event.toId)?.name || 'lieu inconnu'} : elles défendront la province avec vous.`
        : `🤝 Passage chez ${nationName(map,event.target)} (allié) : ${safeNum(event.amount)} unités stationnent à ${provinceDef(map,event.toId)?.name || 'lieu inconnu'} et la défendront.` };
      return { priority:1,type:'déplacement',category:'neutral',text:`Mouvement vers ${provinceDef(map,event.toId)?.name || 'lieu inconnu'} effectué.` };
    case 'convoy-rerouted': return { priority:3, type:'MARINE', category:'neutral', text: event.landed
      ? `Plus d’alliance avec ${nationName(map,event.target)} et aucun port ami : le convoi débarque à ${where}, son point de départ, et ses ${safeNum(event.amount)} unités sont rapatriées.`
      : event.toDeparture ? `Plus d’alliance avec ${nationName(map,event.target)} et aucun port ami : le convoi (${safeNum(event.amount)} unités) revient à ${provinceDef(map,event.toId)?.name || 'son point de départ'}, son point de départ, pour y débarquer (${safeNum(event.turns)} tours).`
      : `Plus d’alliance avec ${nationName(map,event.target)} : le convoi ne peut plus y accoster et rentre au port ami le plus proche, ${provinceDef(map,event.toId)?.name || 'un port ami'} (${safeNum(event.amount)} unités, ${safeNum(event.turns)} tours).` };
    case 'stationed-recalled': return { priority:3, type:'PASSAGE', category:'neutral', text:`Plus d’alliance avec ${nationName(map,event.target)} : ${safeNum(event.amount)} unités quittent ${where} et rentrent à ${provinceDef(map,event.toId)?.name || 'leur base'}.` };
    case 'stationed-lost': if (event.eliminated) return { priority:3, type:'PASSAGE', category:'lost', text:`${nationName(map,event.nationId)} est éliminée : ses ${safeNum(event.amount)} unités stationnées à ${where} se dispersent.` };
      return { priority:3, type:'PASSAGE', category:'lost', text:`Plus d’alliance avec ${nationName(map,event.target)} et plus aucune province où rentrer : ${safeNum(event.amount)} unités perdues à ${where}.` };
    default: return null;
  }
}
function aggregateEntries(entries) {
  const merged = new Map();
  for (const e of entries) {
    if (e.type === 'production') {
      const key = `${e.category}|${e.text.replace(/^\d+ /,'')}`;
      if (merged.has(key)) { const old=merged.get(key),n=Number(old.text.match(/^\d+/)?.[0]||0)+Number(e.text.match(/^\d+/)?.[0]||0); old.text=old.text.replace(/^\d+/,String(n)); continue; }
      merged.set(key,e);
    } else merged.set(`${e.type}|${e.text}`,e);
  }
  return [...merged.values()];
}
export function buildTurnJournal(state, map, fromIndex = state.lastJournalEventIndex || 0) {
  const priority = new Set(['hostility-warning','hostility-war','auto-war','convoy-rerouted','stationed-recalled','stationed-lost','final-turns','income','battle','conquest','field-battle','diplomacy','diplomatic-action','ceasefire-offer','war-chest','capital-plunder','elimination','attack-cancelled','production-lost','retreat-lost','interception','convoy-arrived','convoy-departed','convoy-returning','game-over','talk','betrayal','reveal','tension','alliance-broken','help-answer','help-broken','help-ended','movement']);
  const entries = aggregateEntries(state.events.slice(fromIndex).filter(e => priority.has(e.type) && (e.type !== 'movement' || e.passage) && eventKnownToPlayer(state,map,e)).map(e => journalEntry(e,map,state.playerNationId)).filter(Boolean)).sort((a,b)=>b.priority-a.priority);
  state.lastJournalEventIndex = state.events.length; state.turnJournal = entries; state.journal = entries;
  return entries;
}
export function buildPermanentJournal(state, map, fromIndex = 0) {
  const entries = aggregateEntries(state.events.slice(fromIndex).filter(e => eventKnownToPlayer(state,map,e)).map(e=>journalEntry(e,map,state.playerNationId)).filter(Boolean));
  state.chronicle.push(...entries); return entries;
}
function seededRandom(state) {
  let h=2166136261;for(const char of String(state.seed||'arken-v5'))h=Math.imul(h^char.charCodeAt(0),16777619);
  const counter=(Number(state.randomCounter)||0)+1;state.randomCounter=counter;
  let x=(h^Math.imul(counter,0x9e3779b9))>>>0;x^=x<<13;x^=x>>>17;x^=x<<5;
  return (x>>>0)/4294967296;
}
// --- V10 : fin de partie (docs/V10-marine.md §5) -----------------------------------------------------------
const capitalIds = state => [...new Set(Object.values(state.nations).map(n => n.capitalId).filter(Boolean))];
/** Classement : provinces, puis capitales tenues, puis trésor (égalité : identifiant de nation). */
export function gameRanking(state) {
  const caps = capitalIds(state);
  return Object.keys(state.nations).map(id => ({
    nationId: id,
    provinces: Object.values(state.provinces).filter(p => p.ownerId === id).length,
    capitals: caps.filter(c => state.provinces[c]?.ownerId === id).length,
    treasury: Math.max(0, Math.floor(state.nations[id].treasury || 0)),
    eliminated: Boolean(state.nations[id].eliminated)
  })).sort((a, b) => b.provinces - a.provinces || b.capitals - a.capitals || b.treasury - a.treasury || a.nationId.localeCompare(b.nationId))
    .map((r, i) => ({ ...r, rank: i + 1 }));
}
/** Nation qui tient toutes les capitales (victoire anticipée), sinon null. */
export function capitalsVictor(state) {
  const caps = capitalIds(state);
  const owners = new Set(caps.map(c => state.provinces[c]?.ownerId));
  return caps.length && owners.size === 1 ? [...owners][0] : null;
}
/**
 * Fin de partie, vérifiée à la fin de chaque inter-tour, enregistrée UNE fois dans state.gameOver :
 *  - 'capitals' : une nation tient les 5 capitales (victoire anticipée) ;
 *  - 'player-eliminated' : le joueur humain n'a plus rien (défaite) ;
 *  - 'turn-limit' : fin du tour RULES.gameLength (80 depuis V13.2) ou d'un tour suivant pour une ancienne sauvegarde.
 * Le moteur ne bloque rien (les simulations IA continuent) ; c'est l'interface qui arrête la partie.
 */
export function checkGameOver(state) {
  if (state.gameOver) return state.gameOver;
  const victor = capitalsVictor(state), player = state.playerNationId;
  const playerOut = state.controllers?.[player] === 'human' && state.nations[player]?.eliminated;
  const reason = victor ? 'capitals' : playerOut ? 'player-eliminated' : state.turn >= RULES.gameLength ? 'turn-limit' : null;
  if (!reason) return null;
  const ranking = gameRanking(state);
  state.gameOver = { reason, turn: state.turn, winnerId: victor || ranking[0].nationId, ranking };
  state.events.push({ turn: state.turn, type: 'game-over', reason, winnerId: state.gameOver.winnerId, nationId: state.gameOver.winnerId });
  return state.gameOver;
}
export function resolveInterturn(state, map, { random = () => seededRandom(state) } = {}) {
  const fromIndex = state.lastJournalEventIndex || 0;
  // AI makes plans during the planning phase, before any order is resolved.
  planAIOrders(state,map);
  const locked = (state.orders || []).filter(o=>o.status==='pending').map(o=>({...o,units:o.units?{...o.units}:undefined}));
  state.turnPhase='locking-orders';
  state.lockedOrders = locked;
  state.turnPhase='resolving-inter-turn';
  const fought = new Set(); // provinces où un combat a eu lieu ce tour (pas de guérison)
  const eventStart = state.events.length;
  resolveAllianceBreaks(state,locked);
  settleStationed(state,map); // V13.4 : alliance rompue = plus de passage, les troupes stationnées rentrent
  aggregateMoves(state,map,locked,fought);
  settleStationed(state,map);
  resolveDiplomacy(state,locked,random,map);
  resolveProjects(state,locked);
  resolveTransports(state,map,fought);
  healProvinces(state,fought);
  updateEliminations(state);
  settleStationed(state,map);
  for (const id of Object.keys(state.nations)) {
    const base = incomeFor(state,id), extra = goldBonus(state, id, base); // V12 : atout « or » (joueur humain seulement)
    state.nations[id].treasury += base + extra;
    if (extra) state.events.push({ turn: state.turn, type: 'boost-gold', nationId: id, amount: extra });
    // V13.1 : le joueur voit chaque tour ce que rapportent ses provinces et ses bâtiments.
    if (id === state.playerNationId && !state.nations[id].eliminated) state.events.push({ turn: state.turn, type: 'income', nationId: id, amount: base + extra, bonus: extra, ...incomeBreakdown(state, id) });
  }
  resolveTalk(state,map,locked,eventStart);
  checkGameOver(state);
  // V13.2 : prévenir quand il ne reste que 5 tours (le tour qui commence compris).
  if (!state.gameOver && state.turn + 1 === RULES.gameLength - 4) state.events.push({ turn: state.turn, type: 'final-turns', remaining: 5 });
  state.orders = []; state.lockedOrders = [];
  buildPermanentJournal(state,map,fromIndex);
  buildTurnJournal(state,map,fromIndex);
  state.turn++;
  state.events.push({ turn:state.turn,type:'turn-start' });
  state.turnPhase='planning';
  return state;
}
export const nextTurn = resolveInterturn;
/**
 * V11 : échanges publics à la fin de l'inter-tour. 1) messages commandés (ordres `talk`, joueur compris) publiés
 * dans l'ordre des nations ; une réponse amicale/hostile à une proposition d'IA l'accepte/la refuse ; 2) les
 * dirigeants IA répondent et parlent selon leur personnalité ; 3) dérive de la tension, observation des dirigeants.
 */
function resolveTalk(state, map, locked, eventStart) {
  state.talk ||= []; state.talkPending ||= {}; state.tension ||= {};
  const published = [];
  const talkOrders = locked.filter(o => o.kind === 'talk').sort((a, b) => a.nationId.localeCompare(b.nationId) || String(a.to ?? '').localeCompare(String(b.to ?? '')) || String(a.id).localeCompare(String(b.id)));
  for (const o of talkOrders) {
    if (state.nations[o.nationId]?.eliminated || (o.to && state.nations[o.to]?.eliminated)) continue;
    const msg = publishTalk(state, { from: o.nationId, to: o.to ?? null, tone: o.tone, text: o.text, replyTo: o.replyTo ?? null });
    answerProposals(state, msg);
    published.push(msg);
  }
  // V13 : réponses des alliés aux demandes d'aide (avant les paroles des IA : elles comptent dans le quota).
  resolveHelpRequests(state, map, locked, id => legalDestinations(map, state, id)); // V14.2 : trajet estimé de l'aide
  aiTalk(state, map, { published, turnEvents: state.events.slice(eventStart) });
  expireHelpPacts(state);
  // V14.2 : guerre automatique à 85 % d'hostilité (avant la dérive de fin de tour, après tous les échanges du tour).
  hostilityWars(state, (a, b, value) => hostilityWar(state, a, b, value));
  // Propositions des IA expirées.
  state.diplomacy.proposals = (state.diplomacy.proposals || []).filter(p => p.turn > state.turn - PROPOSAL_TURNS && !state.nations[p.from]?.eliminated);
  driftTension(state);
  observeLeaders(state);
  pruneTalkPending(state);
}
export const adviserText = (state, role) => role==='finance' ? (state.nations[state.playerNationId].treasury<40?'Nos caisses sont basses.':'Le trésor reste disponible pour investir.') : 'Les frontières doivent être surveillées.';
