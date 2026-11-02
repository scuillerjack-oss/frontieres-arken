// Moteur — routes maritimes, côte d'arrivée, durée, destinations légales (docs/V10-marine.md, docs/V13-marine.md).

import { RULES } from '../constants.js';
import { provinceDef } from './shared.js';

// --- V10 marine : routes, côte d'arrivée, durée (docs/V10-marine.md) ----------------------------------------
export const laneOf = (map, a, b) => (map.seaLanes || []).find(l => (l.from === a && l.to === b) || (l.from === b && l.to === a)) || null;
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
export function seaDestinations(map, fromId) {
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

