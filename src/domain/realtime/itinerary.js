// V17.13 — Déplacements longs en un seul ordre (demande de Jack du 26/11/2026, docs/V17-cahier-des-charges.md « V17.13 »).
// Le joueur désigne N'IMPORTE QUELLE province : le jeu calcule l'itinéraire le plus court en jours de trajet, par les routes
// terrestres et maritimes existantes (legalDestinations : embarquement seulement depuis un point de port, débarquement au
// point de port au bout de la route), puis les troupes enchaînent les étapes seules. Chaque étape est un ordre de
// déplacement ORDINAIRE (queueMoveOrder → marche ou convoi) : combats, « affronter une nation = entrer en guerre », trêves,
// passage chez un allié, interceptions… restent exactement ceux d'aujourd'hui, à chaque province traversée.
// Le déplacement vers une voisine ne passe pas par ici (comportement inchangé).
//
// Module pur, sans DOM, déterministe. Un itinéraire (sauvegardé dans state.journeys) :
//   { id, nationId, originId, toId, legs:[{ fromId, toId, type:'land'|'sea', via?, turns?, days }], at, carried:{ units, warships },
//     phase:'order'|'travel'|'battle', hostileLeg, startDay, passed:[provinceIds], status:'active' }
// `legs[at]` = étape en cours ; les marches, convois et ordres d'une étape portent `journeyId`.
//
// Choix de l'itinéraire (décision du chef de projet, à valider en bêta) : le plus court passant UNIQUEMENT par ses provinces
// ou celles d'un allié (jamais de guerre déclarée « en passant ») ; s'il n'existe pas, le plus court tout court (la fenêtre
// prévient des nations dont on traversera les provinces). Jamais à travers une nation en trêve avec soi (territoire interdit).

import { LAND_UNIT_TYPES } from '../constants.js';
import { hasPassage } from '../passage.js';
import { availableForces, queueMoveOrder } from '../engine/orders.js';
import { legalDestinations } from '../engine/sea-routes.js';
import { seaDuration } from '../engine/convoys.js';
import { pairTreaty, pairWar } from '../engine/shared.js';
import { isRealtime } from './clock.js';
import { landTravelDays } from './marches.js';

const int = v => Math.max(0, Math.floor(Number(v) || 0));
const cleanUnits = units => Object.fromEntries(LAND_UNIT_TYPES.map(k => [k, int(units?.[k])]));
const total = (units, warships) => LAND_UNIT_TYPES.reduce((n, k) => n + int(units?.[k]), 0) + int(warships);
const ownerOf = (state, id) => state.provinces[id]?.ownerId ?? null;
/** Province « sûre » pour une nation : à elle, ou à un allié (droit de passage). */
export const friendlyProvince = (state, nationId, id) => { const o = ownerOf(state, id); return o === nationId || hasPassage(state, nationId, o); };
/** Territoire interdit en chemin : une nation en trêve avec soi (on n'y passe jamais automatiquement). */
export const forbiddenProvince = (state, nationId, id) => { const o = ownerOf(state, id); return Boolean(o && o !== nationId && pairTreaty(state, nationId, o, 'ceasefire')); };
/** Durée d'une étape en jours (même calcul que le départ réel : marches.js / convoys.js). */
export function legDays(state, map, units, fromId, route) {
  return route.type === 'sea' ? Math.max(1, seaDuration(state, route.turns)) : landTravelDays(units, map, fromId, route.id);
}

/**
 * Plus court chemin (Dijkstra, en jours) de `fromId` vers toutes les provinces. Une province intermédiaire n'est
 * « traversée » (on en repart) que si `through(id)` ; la destination, elle, est toujours atteignable.
 * Égalités départagées par l'identifiant (résultat identique d'une partie à l'autre).
 */
function shortest(map, state, { fromId, units, seaOnly, through }) {
  const dist = new Map([[fromId, 0]]), prev = new Map(), done = new Set();
  for (;;) {
    let cur = null;
    for (const [id, d] of dist) if (!done.has(id) && (cur === null || d < dist.get(cur) || (d === dist.get(cur) && id < cur))) cur = id;
    if (cur === null) break;
    done.add(cur);
    if (cur !== fromId && !through(cur)) continue;
    const routes = legalDestinations(map, state, cur).filter(r => !seaOnly || r.type === 'sea').sort((a, b) => a.id.localeCompare(b.id));
    for (const r of routes) {
      if (done.has(r.id) || r.id === fromId) continue;
      const days = legDays(state, map, units, cur, r), nd = dist.get(cur) + days;
      if (!dist.has(r.id) || nd < dist.get(r.id)) {
        dist.set(r.id, nd);
        prev.set(r.id, { fromId: cur, toId: r.id, type: r.type, ...(r.type === 'sea' ? { via: r.via, turns: r.turns } : {}), days });
      }
    }
  }
  return { dist, prev };
}
function legsTo(prev, fromId, toId) {
  const legs = [];
  for (let id = toId; id !== fromId;) { const l = prev.get(id); if (!l) return null; legs.unshift(l); id = l.fromId; }
  return legs;
}
/** Nations dont l'itinéraire traverse (ou vise) des provinces hors de chez soi et de ses alliés, avec l'état de guerre. */
export function crossingsOf(state, nationId, legs) {
  const out = [];
  for (const l of legs || []) {
    const o = ownerOf(state, l.toId);
    if (o === nationId || hasPassage(state, nationId, o)) continue;
    const key = o || 'neutral';
    if (!out.some(x => x.nationId === key)) out.push({ nationId: key, war: Boolean(o) && pairWar(state, nationId, o), provinceIds: [] });
    out.find(x => x.nationId === key).provinceIds.push(l.toId);
  }
  return out;
}
/**
 * Itinéraire de `fromId` à `toId` pour ces forces. { ok, legs, days, path, safe, crossings } ou { ok:false, error, reason }.
 * Avec des navires de guerre : uniquement par mer (ils ne marchent pas).
 */
export function planItinerary(map, state, { nationId, fromId, toId, units = {}, warships = 0 }) {
  if (!state.provinces[fromId] || !state.provinces[toId]) return { ok: false, reason: 'unknown', error: 'Province inconnue' };
  if (fromId === toId) return { ok: false, reason: 'same', error: 'Choisissez une autre province que celle de départ' };
  const u = cleanUnits(units), seaOnly = int(warships) > 0;
  const base = { fromId, units: u, seaOnly };
  const tries = [
    { safe: true, through: id => friendlyProvince(state, nationId, id) && !forbiddenProvince(state, nationId, id) },
    { safe: false, through: id => !forbiddenProvince(state, nationId, id) }
  ];
  for (const t of tries) {
    const { prev } = shortest(map, state, { ...base, through: t.through }), legs = prev.has(toId) ? legsTo(prev, fromId, toId) : null;
    if (!legs?.length) continue;
    const days = legs.reduce((n, l) => n + l.days, 0);
    return { ok: true, legs, days, path: [fromId, ...legs.map(l => l.toId)], safe: t.safe || crossingsOf(state, nationId, legs.slice(0, -1)).length === 0, crossings: crossingsOf(state, nationId, legs) };
  }
  return seaOnly ? { ok: false, reason: 'sea-only', error: 'Les navires de guerre ne voyagent que par mer : aucun itinéraire tout en mer jusque-là' }
    : { ok: false, reason: 'no-route', error: 'Aucun itinéraire possible jusque-là (routes coupées ou territoire en trêve)' };
}
/** Provinces atteignables par un itinéraire depuis `fromId` (hors voisines directes), pour la carte. */
export function reachableByItinerary(map, state, { nationId, fromId, units = {}, warships = 0 }) {
  if (!state.provinces[fromId]) return new Set();
  const { dist } = shortest(map, state, { fromId, units: cleanUnits(units), seaOnly: int(warships) > 0, through: id => !forbiddenProvince(state, nationId, id) });
  const near = new Set(legalDestinations(map, state, fromId).map(x => x.id));
  return new Set([...dist.keys()].filter(id => id !== fromId && !near.has(id)));
}

// --- Itinéraires en cours -------------------------------------------------------------------------------------------
const journeysOf = state => (state.journeys ||= []);
const listOf = state => Array.isArray(state.journeys) ? state.journeys : []; // lecture seule (n'ajoute pas le champ)
export const journeyById = (state, id) => listOf(state).find(j => j.id === id) || null;
export const playerJourneys = (state, nationId) => listOf(state).filter(j => j.nationId === nationId);
const transportOf = (state, j) => (state.marches || []).find(m => m.journeyId === j.id) || (state.transports || []).find(t => t.journeyId === j.id) || null;
const orderOf = (state, j) => (state.orders || []).find(o => o.journeyId === j.id && o.status === 'pending') || null;
function nextJourneyId(state) {
  state.journeySequence = Math.max(1, Number(state.journeySequence) || 1);
  return `j${state.journeySequence++}`;
}
/** Où se trouvent les troupes de l'itinéraire, et quand elles arrivent au bout : { here, moving, arriveDay, nextStopDay }. */
export function journeyStatus(state, j) {
  const leg = j.legs[j.at], tr = transportOf(state, j), rest = j.legs.slice(j.at + 1).reduce((n, l) => n + l.days, 0);
  if (tr) return { here: leg.fromId, moving: true, nextStopId: leg.toId, nextStopDay: tr.arriveDay, arriveDay: tr.arriveDay + rest, transport: tr };
  if (j.phase === 'battle') return { here: leg.toId, moving: false, battle: true, nextStopId: leg.toId, nextStopDay: state.day, arriveDay: state.day + rest };
  return { here: leg.fromId, moving: false, nextStopId: leg.toId, nextStopDay: state.day + leg.days, arriveDay: state.day + leg.days + rest };
}
/** Étapes encore à faire (provinces), étape en cours comprise. */
export const journeyRemaining = j => j.legs.slice(j.at).map(l => l.toId);

function queueLeg(state, map, j, fromId) {
  const leg = j.legs[j.at];
  const r = queueMoveOrder(state, map, { nationId: j.nationId, fromId, toId: leg.toId, units: j.carried.units, warships: j.carried.warships });
  if (!r.ok) return r;
  const o = state.orders.find(x => x.id === r.orderId);
  if (o) o.journeyId = j.id;
  j.phase = 'order';
  j.hostileLeg = !friendlyProvince(state, j.nationId, leg.toId);
  return r;
}
/**
 * Donne l'ordre : l'itinéraire est calculé, la première étape part comme un déplacement ordinaire (l'interface appelle
 * ensuite executePendingOrders, comme pour tout ordre). { ok, journeyId, plan, arriveDay } ou { ok:false, error }.
 */
export function startJourney(state, map, { nationId, fromId, toId, units = {}, warships = 0 }) {
  if (!isRealtime(state)) return { ok: false, error: 'Itinéraire : seulement dans une partie en temps réel' };
  const u = cleanUnits(units), ships = int(warships);
  if (!total(u, ships)) return { ok: false, error: 'Aucune force sélectionnée' };
  const plan = planItinerary(map, state, { nationId, fromId, toId, units: u, warships: ships });
  if (!plan.ok) return plan;
  const j = { id: nextJourneyId(state), nationId, originId: fromId, toId, legs: plan.legs, at: 0, carried: { units: u, warships: ships },
    phase: 'order', hostileLeg: false, startDay: state.day, passed: [], status: 'active' };
  journeysOf(state).push(j);
  const r = queueLeg(state, map, j, fromId);
  if (!r.ok) { state.journeys = journeysOf(state).filter(x => x !== j); return r; }
  const arriveDay = state.day + plan.days;
  state.events.push({ turn: state.turn, type: 'journey-started', day: state.day, nationId, journeyId: j.id, fromId, toId, provinceId: toId, arriveDay, steps: plan.legs.length });
  return { ok: true, journeyId: j.id, plan, arriveDay };
}
function endJourney(state, j, event) {
  state.journeys = listOf(state).filter(x => x !== j);
  for (const t of [...(state.marches || []), ...(state.transports || [])]) if (t.journeyId === j.id) delete t.journeyId;
  for (const o of state.orders || []) if (o.journeyId === j.id) delete o.journeyId;
  if (event) state.events.push({ turn: state.turn, nationId: j.nationId, journeyId: j.id, toId: j.toId, ...event });
}
/**
 * Annule un itinéraire : les troupes terminent l'étape en cours et s'y arrêtent (un départ pas encore parti est annulé :
 * elles restent où elles sont). { ok, stopAt } — pour faire demi-tour tout de suite, « Rappeler ».
 */
export function cancelJourney(state, { nationId, journeyId }) {
  const j = journeyById(state, journeyId);
  if (!j || j.nationId !== nationId) return { ok: false, error: 'Itinéraire introuvable' };
  const o = orderOf(state, j), st = journeyStatus(state, j);
  if (o) state.orders = state.orders.filter(x => x !== o);
  const stopAt = o ? o.fromId : st.nextStopId;
  endJourney(state, j, { type: 'journey-stopped', reason: 'cancelled', provinceId: stopAt });
  return { ok: true, stopAt };
}
/**
 * Change la destination en cours de route. Les troupes en marche finissent l'étape en cours (on ne change pas de route au
 * milieu d'un chemin), puis suivent le nouvel itinéraire. { ok, arriveDay, plan } ou { ok:false, error } (rien ne change).
 */
export function redirectJourney(state, map, { nationId, journeyId, toId }) {
  const j = journeyById(state, journeyId);
  if (!j || j.nationId !== nationId) return { ok: false, error: 'Itinéraire introuvable' };
  if (j.phase === 'battle') return { ok: false, error: 'Bataille en cours à l’étape : attendez son issue pour changer de destination' };
  const o = orderOf(state, j), st = journeyStatus(state, j);
  const anchor = o ? o.fromId : st.nextStopId, startDay = o ? state.day : st.nextStopDay;
  if (toId === anchor) {
    if (o) { state.orders = state.orders.filter(x => x !== o); endJourney(state, j, { type: 'journey-arrived', provinceId: anchor }); return { ok: true, arriveDay: state.day }; }
    j.legs = j.legs.slice(0, j.at + 1); j.toId = toId;
    return { ok: true, arriveDay: st.nextStopDay };
  }
  const plan = planItinerary(map, state, { nationId, fromId: anchor, toId, units: j.carried.units, warships: j.carried.warships });
  if (!plan.ok) return plan;
  if (o) {
    state.orders = state.orders.filter(x => x !== o);
    const old = { legs: j.legs, at: j.at, toId: j.toId };
    j.legs = plan.legs; j.at = 0; j.toId = toId;
    const r = queueLeg(state, map, j, anchor);
    if (!r.ok) { Object.assign(j, old); queueLeg(state, map, j, anchor); return r; }
  } else { j.legs = [j.legs[j.at], ...plan.legs]; j.toId = toId; }
  const arriveDay = startDay + plan.days;
  state.events.push({ turn: state.turn, type: 'journey-rerouted', reason: 'player', nationId, journeyId: j.id, provinceId: anchor, toId, arriveDay });
  return { ok: true, arriveDay, plan };
}
/**
 * Arrêt propre d'un itinéraire, avec avis (journey-stopped) : rappel d'une étape (« Rappeler » : demi-tour, sans repartir
 * ensuite), départ refusé (province assiégée, passage perdu, origine perdue). Sans itinéraire : ne fait rien.
 */
export function stopJourney(state, journeyId, reason, provinceId) {
  const j = journeyId ? journeyById(state, journeyId) : null;
  if (j) endJourney(state, j, { type: 'journey-stopped', reason, provinceId });
}
/**
 * Chaque jour, après les arrivées et les assauts : chaque itinéraire dont l'étape est finie repart vers l'étape suivante
 * (ordre ordinaire, qui part le lendemain matin, jour d'arrivée sur place), après RECALCUL de la suite de l'itinéraire
 * avec la carte du jour. Étape impossible et aucun autre chemin, troupes perdues ou repoussées : arrêt propre + avis.
 * `fromEvent` : index des événements du jour (arrivées de la journée).
 */
export function advanceJourneys(state, map, fromEvent = 0) {
  if (!state.journeys?.length) return; // aucune écriture dans l'état sans itinéraire (parties identiques à la V17.12)
  const today = state.events.slice(fromEvent);
  for (const j of [...journeysOf(state)].sort((a, b) => a.id.localeCompare(b.id))) {
    if (!state.nations[j.nationId] || state.nations[j.nationId].eliminated) { endJourney(state, j, null); continue; }
    const leg = j.legs[j.at];
    if (!leg) { endJourney(state, j, null); continue; }
    if (orderOf(state, j)) continue; // départ pas encore parti (il part au début du jour suivant)
    const tr = transportOf(state, j);
    if (tr) { if (tr.returning) endJourney(state, j, { type: 'journey-stopped', reason: 'turned-back', provinceId: leg.fromId }); else j.phase = 'travel'; continue; }
    const here = leg.toId;
    if ((state.battles || []).some(b => b.provinceId === here && b.attackers.some(e => e.nationId === j.nationId))) { j.phase = 'battle'; continue; }
    const arrived = today.some(e => e.journeyId === j.id && (e.type === 'movement' || e.type === 'convoy-arrived'));
    const held = friendlyProvince(state, j.nationId, here);
    // Départ annulé avant d'être parti (ordre retiré par le joueur) : les troupes n'ont pas bougé.
    if (j.phase === 'order' && !arrived) { endJourney(state, j, { type: 'journey-stopped', reason: 'cancelled', provinceId: leg.fromId }); continue; }
    // Étape vers chez soi / un allié : il faut l'arrivée du jour (sinon l'armée a été détruite en chemin, ou a fait demi-tour).
    // Étape hostile : la province doit être prise (bataille gagnée, ou prise dès le premier assaut).
    const ok = held && (arrived || j.hostileLeg);
    if (!ok) { endJourney(state, j, { type: 'journey-stopped', reason: j.hostileLeg ? 'repelled' : 'lost', provinceId: here }); continue; }
    j.passed.push(here);
    if (here === j.toId || j.at === j.legs.length - 1) { endJourney(state, j, { type: 'journey-arrived', provinceId: here }); continue; }
    const avail = availableForces(state, here, j.nationId);
    const units = Object.fromEntries(LAND_UNIT_TYPES.map(k => [k, Math.min(int(j.carried.units[k]), int(avail[k]))]));
    const warships = Math.min(int(j.carried.warships), int(avail.warships));
    if (!total(units, warships)) { endJourney(state, j, { type: 'journey-stopped', reason: 'lost', provinceId: here }); continue; }
    j.carried = { units, warships };
    const planned = j.legs.slice(j.at + 1).map(l => l.toId).join(',');
    const plan = planItinerary(map, state, { nationId: j.nationId, fromId: here, toId: j.toId, units, warships });
    if (!plan.ok) { endJourney(state, j, { type: 'journey-stopped', reason: 'blocked', provinceId: here }); continue; }
    j.legs = plan.legs; j.at = 0;
    const r = queueLeg(state, map, j, here);
    if (!r.ok) { endJourney(state, j, { type: 'journey-stopped', reason: 'order', error: r.error, provinceId: here }); continue; }
    if (plan.legs.map(l => l.toId).join(',') !== planned) state.events.push({ turn: state.turn, type: 'journey-rerouted', reason: 'blocked', nationId: j.nationId, journeyId: j.id, provinceId: here, toId: j.toId, arriveDay: state.day + 1 + plan.days });
  }
}
