// V17.1 — Armées en marche par la terre (docs/V17-cahier-des-charges.md §6) : départ immédiat, trajet de 30 jours (20 pour une
// armée de cavalerie seule), rencontre en chemin, arrivée, rappel. Les convois (mer) restent dans engine/convoys.js (jours).
// Module pur. Une marche : { id, nationId, fromId, toId, units, warships, wounds, startDay, arriveDay, kind:'land',
// hostile, targetOwner, truces, passage?, returning?, recalled?, met? }.
// Convention des jours : `state.day` est le jour en cours ; advanceDay le traite puis passe au suivant. Une armée partie le
// jour D arrive pendant le traitement du jour arriveDay − 1 : elle est sur place le jour arriveDay (D + 30).

import { COMBAT_TYPES, legacyForce, mergeForce, normalizeForce, resolveCombat, toLegacy } from '../combat.js';
import { LAND_UNIT_TYPES, RULES } from '../constants.js';
import { addStationed, hasPassage } from '../passage.js';
import { addToProvince, fight, lossCount, takeOrderForces, unitCount } from '../engine/battles.js';
import { embark, stampConvoy, trucesOf } from '../engine/convoys.js';
import { ensureWar } from '../engine/diplomacy.js';
import { pairTreaty, pairWar } from '../engine/shared.js';

const D = RULES.realtime.durations;
const hasUnits = f => COMBAT_TYPES.some(k => f.units[k] > 0);
const marchForce = m => legacyForce(m);

/** Durée d'un trajet terrestre : 30 jours ; 20 pour une armée composée uniquement de cavalerie. */
export function landTravelDays(units = {}) {
  const others = LAND_UNIT_TYPES.filter(k => k !== 'cavalry').some(k => (units[k] || 0) > 0);
  return (units.cavalry || 0) > 0 && !others ? D.cavalryLand : D.land;
}
function nextMarchId(state) {
  state.marchSequence = Math.max(1, Number(state.marchSequence) || 1);
  return `m${state.marchSequence++}`;
}
/** Une armée prend la route : elle quitte sa province maintenant (elle ne la défend plus). */
export function createMarch(state, { nationId, fromId, toId, force, startDay = state.day, returning = false, passage = false, guest = false }) {
  const owner = state.provinces[toId]?.ownerId ?? null;
  const legacy = toLegacy(force), days = landTravelDays(legacy.units);
  const m = {
    id: nextMarchId(state), kind: 'land', nationId, fromId, toId, ...legacy, startDay, arriveDay: startDay + days,
    targetOwner: owner, hostile: !returning && owner !== nationId && !hasPassage(state, nationId, owner), truces: trucesOf(state, nationId),
    ...(returning ? { returning: true } : {}), ...(passage ? { passage: true } : {}), ...(guest ? { guest: true } : {})
  };
  (state.marches ||= []).push(m);
  return m;
}
/**
 * Départ des ordres de déplacement du jour (joueur et IA), dans un ordre fixe. Par la terre : une marche ; par la mer :
 * un convoi (embark). Mêmes refus qu'au tour par tour : passage perdu, origine perdue.
 */
export function departMoves(state, map, orders) {
  const moves = orders.filter(x => x.kind === 'move').sort((a, b) => a.fromId.localeCompare(b.fromId) || a.toId.localeCompare(b.toId) || a.nationId.localeCompare(b.nationId) || String(a.id).localeCompare(String(b.id)));
  for (const o of moves) {
    const owner = state.provinces[o.toId]?.ownerId, from = state.provinces[o.fromId];
    if (o.passage && o.routeType !== 'sea' && owner !== o.nationId && !hasPassage(state, o.nationId, owner)) {
      state.events.push({ turn: state.turn, type: 'attack-cancelled', nationId: o.nationId, fromId: o.fromId, provinceId: o.toId, reason: 'passage-lost' });
      continue;
    }
    const guestOk = o.guest && from && from.ownerId !== o.nationId && hasPassage(state, o.nationId, from.ownerId);
    if (!from || (from.ownerId !== o.nationId && !guestOk)) {
      state.events.push({ turn: state.turn, type: 'attack-cancelled', nationId: o.nationId, fromId: o.fromId, provinceId: o.toId, reason: o.guest ? 'passage-lost' : 'origin-lost' });
      continue;
    }
    const force = takeOrderForces(state, o);
    if (!force || !hasUnits(force)) continue;
    if (o.routeType === 'sea') embark(state, map, o, force);
    else {
      const m = createMarch(state, { nationId: o.nationId, fromId: o.fromId, toId: o.toId, force, passage: Boolean(o.passage), guest: Boolean(o.guest) });
      state.events.push({ turn: state.turn, type: 'march-departed', nationId: o.nationId, fromId: o.fromId, toId: o.toId, provinceId: o.toId, marchId: m.id, amount: unitCount(force), arriveDay: m.arriveDay, hostile: m.hostile });
    }
    state.ai?.replay?.push({ turn: state.turn, nationId: o.nationId, action: 'move', target: o.toId });
  }
}
/** Jours déjà parcourus par une marche à la fin du jour `day`. */
const progressed = (m, day) => Math.max(0, day + 1 - m.startDay);
const duration = m => Math.max(1, m.arriveDay - m.startDay);
/**
 * Rencontre en chemin (§5.6) : deux armées ennemies sur la même frontière en sens opposés se battent en rase campagne le jour
 * où la somme de leurs avancées atteint le trajet entier (3 passes, sans forteresse, sans prise) ; une seule fois.
 */
export function marchEncounters(state, day = state.day) {
  const list = [...(state.marches || [])].sort((a, b) => String(a.id).localeCompare(String(b.id)));
  for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
    const a = list[i], b = list[j];
    if (a.fromId !== b.toId || a.toId !== b.fromId || a.nationId === b.nationId || !a.hostile || !b.hostile || a.returning || b.returning) continue;
    if ((a.met || []).includes(b.id) || pairTreaty(state, a.nationId, b.nationId, 'alliance')) continue;
    if (!hasUnits(marchForce(a)) || !hasUnits(marchForce(b))) continue;
    const da = duration(a), db = duration(b);
    if (progressed(a, day) * db + progressed(b, day) * da < da * db) continue;
    (a.met ||= []).push(b.id); (b.met ||= []).push(a.id);
    const [first, second] = [a, b].sort((x, y) => x.fromId.localeCompare(y.fromId));
    ensureWar(state, first.nationId, second.nationId);
    const r = resolveCombat({ attacker: marchForce(first), defender: marchForce(second), mode: 'land' });
    Object.assign(first, toLegacy(r.attacker)); Object.assign(second, toLegacy(r.defender));
    state.events.push({ turn: state.turn, type: 'field-battle', attacker: first.nationId, defender: second.nationId, provinceId: first.toId, fromId: first.fromId,
      originIds: [first.fromId, second.fromId], attackerLosses: lossCount(r.attackerLossesByType), defenderLosses: lossCount(r.defenderLossesByType),
      lossesByNation: { [first.nationId]: r.attackerLossesByType, [second.nationId]: r.defenderLossesByType } });
  }
  state.marches = (state.marches || []).filter(m => hasUnits(marchForce(m)));
}
/** Demi-tour d'une armée arrivée au bout de sa route sans pouvoir entrer : elle rentre par le même trajet. */
function sendBack(state, m, force, day) {
  createMarch(state, { nationId: m.nationId, fromId: m.toId, toId: m.fromId, force, startDay: day + 1, returning: true });
}
/** Arrivée chez soi (retour ou repli) : province d'origine encore à soi, sinon chez l'allié, sinon perdue (règles actuelles). */
function arriveHome(state, m, force) {
  const p = state.provinces[m.toId];
  if (p?.ownerId === m.nationId) { addToProvince(p, force); state.events.push({ turn: state.turn, type: 'march-returned', nationId: m.nationId, fromId: m.fromId, toId: m.toId, provinceId: m.toId, amount: unitCount(force) }); return; }
  if (p && hasPassage(state, m.nationId, p.ownerId)) { addStationed(state, m.nationId, m.toId, force); return; }
  state.events.push({ turn: state.turn, type: 'retreat-lost', nationId: m.nationId, provinceId: m.toId, amount: unitCount(force) });
}
/**
 * Arrivées du jour : renfort chez soi, stationnement chez un allié, retour, ou combat (immédiat, 3 passes : provisoire
 * jusqu'à la V17.2). La cible est revérifiée à l'arrivée : passage perdu, trêve signée après le départ, province passée à
 * une nation avec qui l'on n'est pas en guerre → demi-tour. Toutes les nations qui arrivent le même jour sur une province
 * combattent ensemble (B2). Les survivants d'une attaque repoussée rentrent par la route (30 jours).
 */
export function marchArrivals(state, map, fought, day = state.day) {
  const arriving = (state.marches || []).filter(m => day + 1 >= m.arriveDay).sort((a, b) => String(a.id).localeCompare(String(b.id)));
  if (!arriving.length) return;
  state.marches = state.marches.filter(m => !arriving.includes(m));
  for (const toId of [...new Set(arriving.map(m => m.toId))].sort()) {
    const target = state.provinces[toId], groups = new Map();
    for (const m of arriving.filter(x => x.toId === toId)) {
      const force = marchForce(m), owner = target?.ownerId;
      if (m.returning) { arriveHome(state, m, force); continue; }
      if (owner === m.nationId) { addToProvince(target, force); state.events.push({ turn: state.turn, type: 'movement', nationId: m.nationId, fromId: m.fromId, toId, amount: unitCount(force) }); continue; }
      if (hasPassage(state, m.nationId, owner)) {
        addStationed(state, m.nationId, toId, force);
        state.events.push({ turn: state.turn, type: 'movement', nationId: m.nationId, fromId: m.fromId, toId, amount: unitCount(force), passage: true, target: owner });
        continue;
      }
      if (m.passage) { state.events.push({ turn: state.turn, type: 'attack-cancelled', nationId: m.nationId, fromId: m.fromId, provinceId: toId, reason: 'passage-lost' }); sendBack(state, m, force, day); continue; }
      if (owner !== m.targetOwner && owner && !pairWar(state, m.nationId, owner)) {
        state.events.push({ turn: state.turn, type: 'attack-cancelled', nationId: m.nationId, fromId: m.fromId, provinceId: toId, reason: 'target-changed' }); sendBack(state, m, force, day); continue;
      }
      const truce = owner && (state.diplomacy.treaties || []).find(t => t.active !== false && t.type === 'ceasefire' && t.parties.includes(m.nationId) && t.parties.includes(owner));
      if (truce && !(m.truces || []).includes(owner)) {
        // Trêve conclue après le départ : pas d'attaque, l'armée rentre (une armée partie malgré la trêve la viole : combat).
        state.events.push({ turn: state.turn, type: 'attack-cancelled', reason: 'ceasefire', nationId: m.nationId, fromId: m.fromId, provinceId: toId }); sendBack(state, m, force, day); continue;
      }
      const g = groups.get(m.nationId) || { nationId: m.nationId, force: normalizeForce({}), originIds: [], retreatTo: [], mode: 'land', marches: [] };
      g.force = mergeForce(g.force, force); g.marches.push(m);
      if (!g.originIds.includes(m.fromId)) { g.originIds.push(m.fromId); g.retreatTo.push(m.fromId); }
      groups.set(m.nationId, g);
    }
    if (!groups.size) continue;
    for (const r of fight(state, toId, [...groups.values()], fought)) {
      const m = groups.get(r.nationId).marches[0];
      sendBack(state, m, r.force, day);
    }
  }
}
/**
 * Rappel d'une armée en route (§6) : demi-tour sur place, le retour dure le temps déjà parcouru. Rappelée le jour même de
 * son départ : elle rentre aussitôt. { ok, error?, arriveDay? }
 */
export function recallMarch(state, { nationId, marchId }) {
  const m = (state.marches || []).find(x => x.id === marchId);
  if (!m || m.nationId !== nationId) return { ok: false, error: 'Armée introuvable' };
  if (m.returning) return { ok: false, error: 'Cette armée rentre déjà' };
  const elapsed = Math.max(0, state.day - m.startDay), force = marchForce(m);
  state.marches = state.marches.filter(x => x !== m);
  const back = { ...m, fromId: m.toId, toId: m.fromId };
  if (!elapsed) { arriveHome(state, back, force); return { ok: true, arriveDay: state.day }; }
  const r = createMarch(state, { nationId, fromId: m.toId, toId: m.fromId, force, startDay: state.day, returning: true });
  r.arriveDay = state.day + elapsed; r.recalled = true;
  state.events.push({ turn: state.turn, type: 'march-recalled', nationId, fromId: m.fromId, toId: m.toId, provinceId: m.fromId, marchId: r.id, amount: unitCount(force), arriveDay: r.arriveDay });
  return { ok: true, marchId: r.id, arriveDay: r.arriveDay };
}
/** Rappel d'un convoi en mer : il fait demi-tour sur place, le retour dure les jours déjà passés en mer. */
export function recallConvoy(state, { nationId, convoyId }) {
  const t = (state.transports || []).find(x => x.id === convoyId);
  if (!t || t.nationId !== nationId) return { ok: false, error: 'Convoi introuvable' };
  if (t.returning) return { ok: false, error: 'Ce convoi rentre déjà' };
  const elapsed = Math.max(0, Math.floor(Number(t.stage) || 0)), force = legacyForce(t);
  state.transports = state.transports.filter(x => x !== t);
  if (!elapsed) { arriveHome(state, { nationId, fromId: t.toId, toId: t.fromId }, force); return { ok: true, arriveDay: state.day }; }
  state.transportSequence = Math.max(1, Number(state.transportSequence) || 1);
  const id = `c${state.transportSequence++}`;
  const back = stampConvoy(state, { id, nationId, fromId: t.toId, toId: t.fromId, via: t.fromId, lane: t.lane || [t.fromId, t.via].sort().join('|'), stage: 0, turns: elapsed, returning: true, recalled: true,
    ...(t.allyPort ? { allyPort: t.allyPort } : {}), ...toLegacy(force) });
  state.transports.push(back);
  state.events.push({ turn: state.turn, type: 'convoy-returning', reason: 'recalled', nationId, fromId: t.toId, toId: t.fromId, provinceId: t.toId, convoyId: id, amount: unitCount(force), turns: elapsed });
  return { ok: true, convoyId: id, arriveDay: back.arriveDay };
}
/** Toutes les unités d'une nation en marche (comptées dans son armée, et pour savoir si elle est éliminée). */
export const marchesOf = (state, nationId) => (state.marches || []).filter(m => m.nationId === nationId);
