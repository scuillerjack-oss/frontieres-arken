// Moteur — V16.1 : ballon d'observation (docs/V16-cahier-des-charges.md, « V16.1 — Règles précises retenues »).
//
// Rien à voir avec l'ancien ballon (une unité, supprimée en V13 : migration 8 → 9 de save-codec.js) : le nouveau
// ballon est un objet à part, rangé dans `state.balloons` (champ facultatif, absent des anciennes parties et des
// nouvelles parties tant que personne n'a construit de ballon : pas de nouveau schéma de sauvegarde).
//
//   Ballon : { id, nationId (propriétaire), over (île survolée, désignée par la nation d'origine de l'île),
//              to (nation de destination, null = immobile), legTurns (tours déjà passés sur le saut en cours),
//              fresh (vient d'être livré : annoncé à la fin de l'inter-tour) }
//
//   - Construction : ordre 'balloon-build' (province à soi avec une usine construite, RULES.balloon.cost or,
//     RULES.balloon.turns tours, file de production). Maximum par nation : RULES.balloon.max, ou bonusMax si elle
//     possède bonusProvince (l'île mystérieuse, V16.2). Il naît au-dessus de l'île de son propriétaire.
//   - Voyage : ordre 'balloon-send'. D'île en île par les routes maritimes (même graphe), chemin le plus court
//     (égalité : ordre alphabétique), RULES.balloon.hopTurns tours par saut. Les navires ne l'arrêtent pas.
//   - Vision : au-dessus d'une île, toutes ses provinces sont visibles pour le propriétaire (troupes comprises, même
//     derrière une forteresse) : branché dans vision.js, donc l'IA en profite aussi. Rapport privé chaque inter-tour.
//   - Abattre : ordre 'balloon-shoot' d'une nation qui possède une province de l'île survolée, résolu au tout début
//     de l'inter-tour. Événement privé, aucune guerre, aucune tension. Le ballon redevient constructible.
//   - Nation éliminée : ses ballons disparaissent. Un ballon au-dessus d'une île conquise y reste.
// Module PUR : ni DOM, ni hasard, ni date.

import { LAND_UNIT_TYPES, RULES } from '../constants.js';
import { aliveNations, archetypeOf, getTension, recentAggressions } from '../leaders.js';
import { queuedOrder, UNDER_ATTACK_BUILD_REFUSAL, underAttack } from './orders.js';
import { pairWar, spendableTreasury } from './shared.js';

const B = RULES.balloon;
export const BALLOON_ORDER_KINDS = Object.freeze(['balloon-build', 'balloon-send', 'balloon-shoot']);

// --- Géographie : une île = les provinces d'origine d'une nation ------------------------------------------------
/** Provinces de l'île d'une nation (son île de départ, quel qu'en soit le propriétaire aujourd'hui). */
export function islandProvinces(map, nationId) {
  const isl = (map.islands || []).find(i => i.nation === nationId);
  if (isl) return [...isl.provinces];
  const first = map.provinces.find(p => p.initialOwner === nationId);
  return first ? map.provinces.filter(p => p.landmassId === first.landmassId).map(p => p.id) : [];
}
/** Nation d'origine de l'île qui porte cette province (null : province hors des îles des nations, ex. p21). */
export function islandOfProvince(map, provinceId) {
  for (const n of map.nations || []) if (islandProvinces(map, n.id).includes(provinceId)) return n.id;
  return null;
}
/** Îles voisines par la mer (au moins une route maritime entre les deux îles), par ordre alphabétique. */
export function islandNeighbors(map, nationId) {
  const mine = new Set(islandProvinces(map, nationId)), out = new Set();
  for (const [a, b] of map.maritimeRoutes || []) {
    const other = mine.has(a) ? b : mine.has(b) ? a : null;
    if (!other || mine.has(other)) continue;
    const n = islandOfProvince(map, other);
    if (n && n !== nationId) out.add(n);
  }
  return [...out].sort();
}
/** Sauts d'un ballon de l'île `from` à l'île `to` (sans `from`, avec `to`) ; [] si déjà là ; null si inaccessible. */
export function balloonPath(map, from, to) {
  if (from === to) return [];
  const prev = new Map([[from, null]]), queue = [from];
  while (queue.length) {
    const n = queue.shift();
    for (const m of islandNeighbors(map, n)) if (!prev.has(m)) { prev.set(m, n); queue.push(m); }
  }
  if (!prev.has(to)) return null;
  const path = [];
  for (let x = to; x !== from; x = prev.get(x)) path.unshift(x);
  return path;
}

// --- Qui a quoi --------------------------------------------------------------------------------------------------
export const balloonsOf = (state, nationId) => (state.balloons || []).filter(b => b.nationId === nationId);
export const balloonById = (state, id) => (state.balloons || []).find(b => b.id === id) || null;
/** Ballons autorisés : 1, ou 2 pour la nation qui possède l'île mystérieuse (V16.2). */
export const balloonMax = (state, nationId) => state.provinces?.[B.bonusProvince]?.ownerId === nationId ? B.bonusMax : B.max;
const pendingOf = (state, nationId, kind) => (state.orders || []).filter(o => o.kind === kind && o.status === 'pending' && o.nationId === nationId);
/** Ballons en construction : file de production + commandes du tour. */
export const balloonsInConstruction = (state, nationId) =>
  (state.productionQueue || []).filter(q => q.kind === 'balloon' && q.nationId === nationId).length + pendingOf(state, nationId, 'balloon-build').length;
/** Nations qui possèdent au moins une province de l'île survolée (le propriétaire du ballon exclu). */
export function balloonViewers(state, map, balloon) {
  const ids = new Set(islandProvinces(map, balloon.over).map(id => state.provinces[id]?.ownerId).filter(Boolean));
  ids.delete(balloon.nationId);
  return [...ids].filter(id => !state.nations[id]?.eliminated).sort();
}
/** Ballons que `nationId` voit sur la carte : les siens, et ceux qui survolent une île où il possède une province. */
export const visibleBalloons = (state, map, nationId) =>
  (state.balloons || []).filter(b => b.nationId === nationId || balloonViewers(state, map, b).includes(nationId));
/** Ballons étrangers au-dessus de chez `nationId` (ceux qu'il peut abattre). */
export const foreignBalloonsOver = (state, map, nationId) => (state.balloons || []).filter(b => b.nationId !== nationId && balloonViewers(state, map, b).includes(nationId));
/** Provinces que les ballons de `nationId` lui montrent (troupes comprises). */
export function balloonSeenProvinces(state, map, nationId) {
  const out = new Set();
  for (const b of state.balloons || []) if (b.nationId === nationId) for (const id of islandProvinces(map, b.over)) if (state.provinces[id]) out.add(id);
  return out;
}

// --- Ordres ------------------------------------------------------------------------------------------------------
export const BALLOON_ERRORS = Object.freeze({
  factory: 'Il faut une usine dans cette province',
  building: 'Un ballon est déjà en construction'
});
const haveText = (have, max) => `Vous avez déjà ${have > 1 ? `${have} ballons` : 'un ballon'} (${max} au maximum)`;
/** Peut-on construire un ballon dans cette province ? { ok, reason, cost, turns } — message clair pour l'interface. */
export function balloonBuildStatus(state, { nationId, provinceId }) {
  const p = state.provinces[provinceId], base = { cost: B.cost, turns: B.turns };
  if (!p || p.ownerId !== nationId) return { ...base, ok: false, reason: 'Province non contrôlée' };
  if (!p.buildings?.factory) return { ...base, ok: false, reason: BALLOON_ERRORS.factory };
  if (underAttack(state, provinceId)) return { ...base, ok: false, reason: UNDER_ATTACK_BUILD_REFUSAL }; // V17.5b
  const max = balloonMax(state, nationId), have = balloonsOf(state, nationId).length, building = balloonsInConstruction(state, nationId);
  if (have + building >= max) return { ...base, ok: false, reason: building ? BALLOON_ERRORS.building : haveText(have, max) };
  if (spendableTreasury(state, nationId) < B.cost) return { ...base, ok: false, reason: 'Trésor insuffisant ou réservé à un cessez-le-feu' };
  return { ...base, ok: true, reason: '' };
}
export function queueBalloonBuild(state, { nationId, provinceId }) {
  const st = balloonBuildStatus(state, { nationId, provinceId });
  if (!st.ok) return { ok: false, error: st.reason };
  state.nations[nationId].treasury -= B.cost;
  return { ...queuedOrder(state, { kind: 'balloon-build', nationId, provinceId, cost: B.cost, duration: B.turns }), cost: B.cost };
}
/** Destinations possibles d'un ballon : toutes les îles sauf celle qu'il survole, avec le trajet. */
export function balloonDestinations(state, map, balloonId) {
  const b = balloonById(state, balloonId);
  if (!b) return [];
  return (map.nations || []).map(n => n.id).filter(id => id !== b.over).map(id => {
    const path = balloonPath(map, b.over, id);
    return path ? { id, path, turns: path.length * B.hopTurns } : null;
  }).filter(Boolean);
}
export function queueBalloonSend(state, map, { nationId, balloonId, to }) {
  const b = balloonById(state, balloonId);
  if (!b || b.nationId !== nationId) return { ok: false, error: 'Ballon introuvable' };
  if (!islandProvinces(map, to).length) return { ok: false, error: 'Destination inconnue' };
  const path = balloonPath(map, b.over, to);
  if (!path) return { ok: false, error: 'Aucune route maritime vers cette nation' };
  if (!path.length && !b.to) return { ok: false, error: 'Le ballon est déjà au-dessus de cette nation' };
  // Un seul ordre d'envoi par ballon et par tour : le nouveau remplace l'ancien.
  state.orders = (state.orders || []).filter(o => !(o.kind === 'balloon-send' && o.status === 'pending' && o.balloonId === balloonId));
  return { ...queuedOrder(state, { kind: 'balloon-send', nationId, balloonId, to, hops: path.length }), path, turns: path.length * B.hopTurns };
}
/** Peut-on abattre ce ballon ? Il faut posséder une province de l'île qu'il survole (et ne pas en être le propriétaire). */
export function balloonShootStatus(state, map, { nationId, balloonId }) {
  const b = balloonById(state, balloonId);
  if (!b) return { ok: false, reason: 'Ballon introuvable' };
  if (b.nationId === nationId) return { ok: false, reason: 'C’est votre ballon' };
  if (!balloonViewers(state, map, b).includes(nationId)) return { ok: false, reason: 'Ce ballon n’est pas au-dessus de chez vous' };
  return { ok: true, reason: '' };
}
export function queueBalloonShoot(state, map, { nationId, balloonId }) {
  const st = balloonShootStatus(state, map, { nationId, balloonId });
  if (!st.ok) return { ok: false, error: st.reason };
  const old = pendingOf(state, nationId, 'balloon-shoot').find(o => o.balloonId === balloonId);
  if (old) return { ok: true, orderId: old.id };
  return queuedOrder(state, { kind: 'balloon-shoot', nationId, balloonId, owner: balloonById(state, balloonId).nationId });
}
/** Ordres de ballon en attente d'une nation (récapitulatif, annulation). */
export const pendingBalloonOrders = (state, nationId) => (state.orders || []).filter(o => BALLOON_ORDER_KINDS.includes(o.kind) && o.status === 'pending' && o.nationId === nationId);
/** Annule un ordre de ballon en attente ; une construction est remboursée. */
export function cancelBalloonOrder(state, orderId, nationId) {
  const i = (state.orders || []).findIndex(o => o.id === orderId && o.nationId === nationId && o.status === 'pending' && BALLOON_ORDER_KINDS.includes(o.kind));
  if (i < 0) return { ok: false, error: 'Ordre en attente introuvable' };
  const [order] = state.orders.splice(i, 1);
  if (order.kind === 'balloon-build' && state.nations[nationId]) state.nations[nationId].treasury += order.cost || 0;
  return { ok: true, order, refund: order.kind === 'balloon-build' ? order.cost || 0 : 0 };
}

// --- Livraison (appelée par production.js) ----------------------------------------------------------------------
/** Ballon livré par la file de production. Au-delà du maximum (île mystérieuse perdue entre-temps) : remboursé. */
export function deliverBalloon(state, q) {
  if (balloonsOf(state, q.nationId).length >= balloonMax(state, q.nationId)) {
    if (state.nations[q.nationId]) state.nations[q.nationId].treasury += q.cost || 0;
    state.events.push({ turn: state.turn, type: 'production-lost', nationId: q.nationId, provinceId: q.provinceId, productionType: 'balloon', kind: 'balloon', refund: q.cost || 0, reason: 'max' });
    return null;
  }
  state.balloons ||= [];
  let k = 1;
  while (state.balloons.some(b => b.id === `b-${q.nationId}-${state.turn}-${k}`)) k++;
  const balloon = { id: `b-${q.nationId}-${state.turn}-${k}`, nationId: q.nationId, over: q.nationId, to: null, legTurns: 0, fresh: true };
  state.balloons.push(balloon);
  state.events.push({ turn: state.turn, type: 'production-complete', kind: 'balloon', productionType: 'balloon', provinceId: q.provinceId, nationId: q.nationId, amount: 1 });
  return balloon;
}

// --- Inter-tour ---------------------------------------------------------------------------------------------------
const byId = (a, b) => String(a.nationId).localeCompare(String(b.nationId)) || String(a.id).localeCompare(String(b.id));
/** Tout début de l'inter-tour, avant tout déplacement : les ballons visés sont abattus. Aucune guerre, aucune tension. */
export function resolveBalloonShots(state, map, locked) {
  if (!state.balloons?.length) return;
  for (const o of locked.filter(x => x.kind === 'balloon-shoot').sort(byId)) {
    const b = balloonById(state, o.balloonId);
    if (!b || !balloonShootStatus(state, map, { nationId: o.nationId, balloonId: b.id }).ok) continue;
    state.balloons = state.balloons.filter(x => x !== b);
    state.events.push({ turn: state.turn, type: 'balloon-shot', nationId: b.nationId, target: o.nationId, over: b.over, balloonId: b.id });
  }
}
const amountOf = o => LAND_UNIT_TYPES.reduce((n, k) => n + (o.units?.[k] || 0), 0) + (o.warships || 0);
/** Rapport privé : ce que les autres nations font sur l'île survolée (ordres de ce tour, chantiers en cours). */
export function balloonReport(state, map, balloon, locked) {
  const island = new Set(islandProvinces(map, balloon.over)), others = o => o.nationId !== balloon.nationId && island.has(o.provinceId ?? o.fromId);
  const sites = (state.productionQueue || []).filter(q => (q.kind === 'building' || q.kind === 'balloon') && others(q))
    .map(q => ({ provinceId: q.provinceId, type: q.type, remaining: q.remaining }))
    .sort((a, b) => a.provinceId.localeCompare(b.provinceId) || String(a.type).localeCompare(String(b.type)));
  const recruits = locked.filter(o => o.kind === 'recruitment' && others(o)).map(o => ({ provinceId: o.provinceId, type: o.type, amount: o.amount || 0 }))
    .sort((a, b) => a.provinceId.localeCompare(b.provinceId) || a.type.localeCompare(b.type));
  const moves = locked.filter(o => o.kind === 'move' && others(o) && amountOf(o) > 0)
    .map(o => ({ fromId: o.fromId, toId: o.toId, amount: amountOf(o), sea: o.routeType === 'sea' }))
    .sort((a, b) => a.fromId.localeCompare(b.fromId) || a.toId.localeCompare(b.toId));
  return { sites, recruits, moves };
}
function announceOver(state, map, b) {
  for (const viewer of balloonViewers(state, map, b))
    state.events.push({ turn: state.turn, type: 'balloon-spotted', nationId: viewer, owner: b.nationId, over: b.over, balloonId: b.id, passing: Boolean(b.to) });
}
/**
 * Fin de l'inter-tour (après les combats, la production et les éliminations) :
 *  1. ballons des nations éliminées : disparaissent ; 2. ordres d'envoi ; 3. rapport privé de chaque ballon (île
 *  survolée pendant le tour) ; 4. voyage : un saut tous les RULES.balloon.hopTurns inter-tours ; 5. annonces.
 */
export function resolveBalloonFlights(state, map, locked) {
  if (!state.balloons) return;
  purgeBalloons(state);
  applyBalloonSends(state, map, locked);
  balloonReports(state, map, locked);
  for (const b of [...state.balloons].sort(byId)) {
    if (b.fresh) { delete b.fresh; announceOver(state, map, b); continue; }
    if (!b.to) continue;
    b.legTurns = (b.legTurns || 0) + 1;
    if (b.legTurns < B.hopTurns) continue;
    hopBalloon(state, map, b);
  }
}
const purgeBalloons = state => { state.balloons = state.balloons.filter(b => state.nations[b.nationId] && !state.nations[b.nationId].eliminated); };
/** Ordres d'envoi : nouveau cap (un changement de cap fait recommencer le saut). */
function applyBalloonSends(state, map, locked) {
  for (const o of locked.filter(x => x.kind === 'balloon-send').sort(byId)) {
    const b = balloonById(state, o.balloonId);
    if (!b || b.nationId !== o.nationId) continue;
    const path = balloonPath(map, b.over, o.to);
    if (!path) continue;
    if (!path.length) { b.to = null; b.legTurns = 0; if (b.legDays !== undefined) b.legDays = 0; continue; } // arrêt au-dessus de l'île actuelle
    const oldNext = b.to ? balloonPath(map, b.over, b.to)?.[0] : null;
    if (oldNext !== path[0]) { b.legTurns = 0; if (b.legDays !== undefined) b.legDays = 0; } // changement de cap : le saut recommence
    b.to = o.to;
  }
}
/** Rapport privé de chaque ballon (sauf celui qui vient d'être livré, ou au-dessus d'une île toute à lui). */
function balloonReports(state, map, locked) {
  for (const b of [...state.balloons].sort(byId)) {
    if (b.fresh) continue; // livré ce tour-ci : premier rapport au prochain inter-tour
    if (!balloonViewers(state, map, b).length) continue; // au-dessus d'une île toute à lui : rien à rapporter
    state.events.push({ turn: state.turn, type: 'balloon-report', nationId: b.nationId, over: b.over, balloonId: b.id, ...balloonReport(state, map, b, locked) });
  }
}
/** Le ballon passe au-dessus de l'île suivante de son chemin. */
function hopBalloon(state, map, b) {
  const next = balloonPath(map, b.over, b.to)?.[0];
  if (!next) { b.to = null; b.legTurns = 0; if (b.legDays !== undefined) b.legDays = 0; return; }
  b.over = next; b.legTurns = 0; if (b.legDays !== undefined) b.legDays = 0;
  const arrived = b.over === b.to;
  if (arrived) b.to = null;
  state.events.push({ turn: state.turn, type: 'balloon-moved', nationId: b.nationId, over: b.over, balloonId: b.id, arrived, ...(arrived ? {} : { to: b.to }) });
  announceOver(state, map, b);
}

// --- V17.5 : ballons en temps réel (vols en jours) ------------------------------------------------------------------
// Un ordre d'envoi s'applique le jour même ; le ballon vole jour par jour (RULES.realtime.durations.balloonHop jours par
// saut, `legDays`) ; un ballon livré s'annonce le lendemain de sa livraison ; le rapport privé reste tous les 30 jours.
// `legTurns` (périodes entières déjà passées sur le saut) est tenu à jour pour l'affichage existant.
/** Ordres d'envoi exécutés tout de suite (executePendingOrders). */
export function sendBalloonsNow(state, map, locked) {
  if (!state.balloons) return;
  purgeBalloons(state);
  for (const b of state.balloons) if (!Number.isFinite(b.legDays)) b.legDays = (b.legTurns || 0) * RULES.realtime.daysPerPeriod;
  applyBalloonSends(state, map, locked);
}
/** Un jour de vol pour chaque ballon. */
export function advanceBalloonsDay(state, map) {
  if (!state.balloons?.length) return;
  purgeBalloons(state);
  const hopDays = RULES.realtime.durations.balloonHop;
  for (const b of [...state.balloons].sort(byId)) {
    if (!Number.isFinite(b.legDays)) b.legDays = (b.legTurns || 0) * RULES.realtime.daysPerPeriod;
    if (b.fresh) { delete b.fresh; announceOver(state, map, b); continue; }
    if (!b.to) continue;
    b.legDays++;
    b.legTurns = Math.floor(b.legDays / RULES.realtime.daysPerPeriod);
    if (b.legDays >= hopDays) hopBalloon(state, map, b);
  }
}
/** Rapport privé des ballons, tous les 30 jours (ordres de la période lus au-dessus de l'île survolée). */
export function balloonPeriodReports(state, map, locked) {
  if (!state.balloons) return;
  purgeBalloons(state);
  balloonReports(state, map, locked);
}

// --- IA (appelée par planAIOrders, après le plan du dirigeant : le ballon se paie avec ce qui reste) -----------------
/** Mémoire du Héros pour « agresseur récent » : la même que pour ses guerres (engine/ai.js, HERO_MEMORY_TURNS). */
export const AI_BALLOON_HERO_MEMORY = 5;
/** Le dirigeant abat-il ce ballon ? Conquérant et Traître toujours, Bâtisseur jamais, Héros si le propriétaire est un agresseur récent. */
export function aiShootsBalloon(state, nationId, balloon) {
  const arch = archetypeOf(state, nationId);
  if (arch === 'conquerant' || arch === 'traitre') return true;
  if (arch === 'heros') return recentAggressions(state, AI_BALLOON_HERO_MEMORY).some(a => a.attacker === balloon.nationId);
  return false;
}
/** Nations à observer : celles avec qui il est en guerre, sinon la plus forte tension (égalité : ordre alphabétique). */
export function aiBalloonTargets(state, nationId) {
  const others = aliveNations(state).filter(n => n !== nationId), byTension = (a, b) => getTension(state, nationId, b) - getTension(state, nationId, a) || a.localeCompare(b);
  const wars = others.filter(n => pairWar(state, nationId, n)).sort(byTension);
  return wars.length ? wars : others.sort(byTension).slice(0, 1);
}
/**
 * Construction d'un ballon par l'IA s'il lui en manque un et qu'il lui reste `reserve` or après l'achat (usine requise ;
 * la capitale d'abord). V17.5 : en temps réel, appelée AVANT les recrutements avec une petite réserve
 * (RULES.realtime.ai.balloonReserve) : sinon l'IA, qui dépense tous les 10 jours, n'atteint jamais 90 or.
 */
export function aiBalloonBuild(state, map, nationId, reserve = B.aiReserve) {
  if (balloonsOf(state, nationId).length + balloonsInConstruction(state, nationId) >= balloonMax(state, nationId) || spendableTreasury(state, nationId) < B.cost + reserve) return null;
  const capital = state.nations[nationId]?.capitalId;
  const site = map.provinces.map(d => d.id).filter(id => state.provinces[id]?.ownerId === nationId && state.provinces[id].buildings?.factory)
    .sort((a, b) => Number(b === capital) - Number(a === capital) || a.localeCompare(b))[0];
  return site ? queueBalloonBuild(state, { nationId, provinceId: site }) : null;
}
export function aiBalloonOrders(state, map, nationId) {
  for (const b of foreignBalloonsOver(state, map, nationId)) if (aiShootsBalloon(state, nationId, b)) queueBalloonShoot(state, map, { nationId, balloonId: b.id });
  aiBalloonBuild(state, map, nationId, state.mode === 'realtime' ? RULES.realtime.ai.balloonReserve : B.aiReserve);
  const targets = aiBalloonTargets(state, nationId);
  balloonsOf(state, nationId).forEach((b, i) => {
    const target = targets[i] || targets[0];
    if (target && b.over !== target && b.to !== target) queueBalloonSend(state, map, { nationId, balloonId: b.id, to: target });
  });
}
