// V17.4 — Nourriture, fermes, famine (docs/V17-cahier-des-charges.md §4). Module pur, déterministe, sans DOM ni hasard.
// Tout est compté en CENTIÈMES de vivre (entiers) : aucun arrondi flottant, même résultat sur tous les téléphones.
//
// - Production / jour : 8 vivres par province possédée (île mystérieuse : 0) + 10 par niveau de ferme (5 niveaux au plus).
// - Consommation / jour : 1 vivre pour 20 or de troupes (valeur = coût de recrutement), navires compris, où qu'elles soient
//   (provinces, stationnées chez un allié, en marche, en mer). Blessés compris.
// - Réserve nationale (nation.food.reserve) : départ 900 vivres, bornée entre 0 et le grenier (180 jours de production).
// - Alerte quand la réserve tiendra moins de 10 jours (une fois, puis tous les 30 jours) ; famine = réserve à 0 et
//   consommation > production : dégâts × 0,7 (fireFactorFor) et 1 % de l'armée déserte chaque jour.
// - IA (minimum V17.4, la vraie refonte est la V17.5) : aiFarmOrders, appelée avant ses recrutements.

import { COMBAT_TYPES, legacyForce, provinceForce, splitForce, toLegacy, writeProvinceForce } from '../combat.js';
import { RULES } from '../constants.js';
import { isMysteryIsland } from '../mystery-island.js';
import { buildingCount, queueConstruction } from '../engine/orders.js';
import { spendableTreasury } from '../engine/shared.js';
import { isRealtime } from './clock.js';

const F = () => RULES.realtime.food;
const H = () => F().hundredths;

/** Consommation d'UNE unité, en centièmes de vivre par jour : valeur en or × 100 ÷ 20 (fantassin 5, cavalier 20, blindé 150…). */
export function rationOf(type) {
  const r = RULES.units[type];
  if (!r) return 0;
  return Math.round(r.cost * H() / (r.amount * F().goldPerRation));
}
/** Coût du prochain niveau de ferme (niveau déjà construit ou commandé = `count`) ; null au plafond. */
export const farmCost = count => F().farmCosts[count] ?? null;
/** Niveau de ferme construit dans une province. */
export const farmLevel = p => Math.max(0, Math.floor(Number(p?.buildings?.farm) || 0));

/** Production d'une province en centièmes / jour (pour sa nation propriétaire). */
export function provinceFoodHundredths(state, provinceId) {
  const p = state.provinces[provinceId];
  if (!p || !p.ownerId || isMysteryIsland(provinceId)) return 0;
  return (F().provinceDaily + F().farmDaily * farmLevel(p)) * H();
}
/** Production de la nation, en centièmes / jour. */
export function foodProduction(state, nationId) {
  let n = 0;
  for (const [id, p] of Object.entries(state.provinces)) if (p.ownerId === nationId) n += provinceFoodHundredths(state, id);
  return n;
}
const forceRation = f => COMBAT_TYPES.reduce((n, k) => n + (f.units[k] || 0) * rationOf(k), 0);
/** Toutes les « piles » d'unités de la nation (pour la consommation et la désertion), dans l'ordre de départage du cahier. */
function piles(state, nationId) {
  const out = [];
  for (const id of Object.keys(state.provinces).sort()) {
    const p = state.provinces[id];
    if (p.ownerId === nationId) out.push({ kind: 'province', rank: 0, provinceId: id, ref: p, force: provinceForce(p) });
  }
  for (const e of state.stationed || []) if (e.nationId === nationId) out.push({ kind: 'stationed', rank: 1, provinceId: e.provinceId, ref: e, force: legacyForce(e) });
  for (const m of state.marches || []) if (m.nationId === nationId) out.push({ kind: 'march', rank: 2, provinceId: m.fromId, ref: m, force: legacyForce(m) });
  for (const t of state.transports || []) if (t.nationId === nationId) out.push({ kind: 'convoy', rank: 3, provinceId: t.fromId, ref: t, force: legacyForce(t) });
  // V17.2 : les troupes à l'assaut d'une province mangent (et désertent) aussi ; une entrée vidée quitte la bataille au prochain assaut.
  for (const b of state.battles || []) for (const e of b.attackers || []) if (e.nationId === nationId) out.push({ kind: 'battle', rank: 4, provinceId: b.provinceId, ref: e, force: legacyForce(e) });
  return out;
}
/** Consommation de la nation, en centièmes / jour. */
export function foodConsumption(state, nationId) {
  return piles(state, nationId).reduce((n, x) => n + forceRation(x.force), 0);
}
/** Grenier : 180 jours de production (centièmes). */
export const granaryOf = (state, nationId, production = foodProduction(state, nationId)) => production * F().granaryDays;

/** Réserve et mémoire de la nation (créées à la volée : une sauvegarde V17.1 sans nourriture part avec 900 vivres). */
export function foodOf(state, nationId) {
  const n = state.nations[nationId];
  if (!n) return null;
  const f = (n.food && typeof n.food === 'object') ? n.food : (n.food = {});
  f.reserve = Number.isFinite(f.reserve) ? Math.max(0, Math.floor(f.reserve)) : F().startReserve * H();
  f.desert = f.desert && typeof f.desert === 'object' ? f.desert : {};
  f.famine = Boolean(f.famine);
  f.famineDays = Math.max(0, Math.floor(Number(f.famineDays) || 0));
  f.alertDay = Number.isFinite(f.alertDay) ? f.alertDay : null;
  f.full = Boolean(f.full);
  return f;
}
/** Jours que tiendra la réserve au rythme actuel (Infinity si la production couvre la consommation). */
export const daysLeft = (reserve, production, consumption) => consumption > production ? reserve / (consumption - production) : Infinity;

/** État lisible (interface, IA, tests). Valeurs en centièmes ; `perDay` = production − consommation. */
export function foodStatus(state, nationId) {
  const f = foodOf(state, nationId), production = foodProduction(state, nationId), consumption = foodConsumption(state, nationId);
  const left = daysLeft(f.reserve, production, consumption);
  return { reserve: f.reserve, production, consumption, perDay: production - consumption, granary: granaryOf(state, nationId, production), daysLeft: left,
    alert: left < F().alertDays, famine: f.famine, famineDays: f.famineDays, full: f.full };
}
/** V17.4 : facteur de dégâts d'une nation (0,7 en famine, 1 sinon). Toujours 1 au tour par tour ou sans nation. */
export function fireFactorFor(state, nationId) {
  if (!isRealtime(state) || !nationId) return 1;
  return state.nations[nationId]?.food?.famine ? F().famineFireFactor : 1;
}

/** Retire UNE unité de type `k` de la plus grosse pile (égalité : province, chez soi, stationnées, marches, convois). */
function desertOne(state, list, k) {
  let best = null;
  for (const x of list) {
    const n = x.force.units[k] || 0;
    if (!n) continue;
    if (!best || n > best.force.units[k] || (n === best.force.units[k] && (x.provinceId < best.provinceId || (x.provinceId === best.provinceId && x.rank < best.rank)))) best = x;
  }
  if (!best) return false;
  best.force = splitForce(best.force, { [k]: 1 }).rest;
  best.dirty = true;
  return true;
}
function writeBack(state, list) {
  for (const x of list) {
    if (!x.dirty) continue;
    if (x.kind === 'province') writeProvinceForce(x.ref, x.force);
    else Object.assign(x.ref, toLegacy(x.force));
  }
  const alive = o => COMBAT_TYPES.some(k => (k === 'warship' ? o.warships : o.units?.[k]) > 0);
  if (list.some(x => x.dirty && x.kind === 'stationed')) state.stationed = (state.stationed || []).filter(alive);
  if (list.some(x => x.dirty && x.kind === 'march')) state.marches = (state.marches || []).filter(alive);
  if (list.some(x => x.dirty && x.kind === 'convoy')) state.transports = (state.transports || []).filter(alive);
}
/**
 * Désertion du jour (famine) : pour chaque type, `reste[k] += unités[k]` (centièmes) ; chaque fois que reste ≥ 100, une
 * unité part. Renvoie les unités parties par type.
 */
export function desertion(state, nationId) {
  const f = foodOf(state, nationId), list = piles(state, nationId), gone = {};
  for (const k of COMBAT_TYPES) {
    const units = list.reduce((n, x) => n + (x.force.units[k] || 0), 0);
    f.desert[k] = (Number(f.desert[k]) || 0) + units * F().famineDesertPct;
    while (f.desert[k] >= H()) {
      f.desert[k] -= H();
      if (!desertOne(state, list, k)) { f.desert[k] = 0; break; }
      gone[k] = (gone[k] || 0) + 1;
    }
    if (!units) f.desert[k] = 0;
  }
  writeBack(state, list);
  return gone;
}

/** Étape « nourriture » d'un jour (realtime/day.js) : réserve, alerte, famine, désertion, événements privés. */
export function dailyFood(state) {
  if (!isRealtime(state)) return;
  const day = state.day;
  for (const id of Object.keys(state.nations).sort()) {
    const n = state.nations[id];
    if (n.eliminated) { if (n.food?.famine) n.food.famine = false; continue; } // une nation éliminée n'a plus de famine
    const f = foodOf(state, id), production = foodProduction(state, id), consumption = foodConsumption(state, id), granary = granaryOf(state, id, production);
    const raw = f.reserve + production - consumption;
    f.full = raw > granary && production > consumption;
    f.reserve = Math.max(0, Math.min(granary, raw));
    const starving = f.reserve === 0 && consumption > production;
    if (starving && !f.famine) { f.famine = true; state.events.push({ turn: state.turn, type: 'famine-start', nationId: id, day }); }
    if (!starving && f.famine) { f.famine = false; f.famineDays = 0; f.alertDay = null; f.desert = {}; state.events.push({ turn: state.turn, type: 'famine-end', nationId: id, day }); }
    if (f.famine) {
      f.famineDays++;
      const gone = desertion(state, id);
      if (Object.keys(gone).length) state.events.push({ turn: state.turn, type: 'famine-desertion', nationId: id, day, deserted: gone });
      continue;
    }
    // Alerte : réserve < 10 jours au rythme actuel ; une fois, puis tous les 30 jours tant que ça dure.
    const left = daysLeft(f.reserve, production, consumption);
    if (left < F().alertDays) {
      if (f.alertDay === null || day - f.alertDay >= F().alertRepeatDays) { f.alertDay = day; state.events.push({ turn: state.turn, type: 'food-alert', nationId: id, day, daysLeft: Math.floor(left), reserve: f.reserve }); }
    } else f.alertDay = null;
  }
}

// --- IA (minimum de la V17.4 ; refonte en V17.5) ------------------------------------------------------------------------
/** Production prévue : fermes en chantier ou commandées comprises (centièmes / jour). */
function plannedProduction(state, nationId) {
  const farms = [...(state.productionQueue || []).filter(q => q.kind === 'building' && q.type === 'farm' && q.nationId === nationId),
    ...(state.orders || []).filter(o => o.kind === 'construction' && o.type === 'farm' && o.nationId === nationId && o.status === 'pending')];
  return foodProduction(state, nationId) + farms.filter(q => state.provinces[q.provinceId]?.ownerId === nationId).length * F().farmDaily * H();
}
/** Consommation prévue : troupes en recrutement ou commandées comprises (centièmes / jour). */
export function plannedConsumption(state, nationId) {
  const coming = [...(state.productionQueue || []).filter(q => q.kind === 'unit' && q.nationId === nationId),
    ...(state.orders || []).filter(o => o.kind === 'recruitment' && o.nationId === nationId && o.status === 'pending')];
  return foodConsumption(state, nationId) + coming.reduce((n, q) => n + (q.amount || 0) * rationOf(q.type), 0);
}
const farmInProgress = (state, nationId) => (state.productionQueue || []).some(q => q.kind === 'building' && q.type === 'farm' && q.nationId === nationId)
  || (state.orders || []).some(o => o.kind === 'construction' && o.type === 'farm' && o.nationId === nationId && o.status === 'pending');
/**
 * L'IA garde de quoi manger (§4.5) : si la production prévue est sous 110 % de la consommation prévue, ou si la réserve
 * tient moins de 15 jours de consommation alors que la production ne suffit pas, elle lance UN niveau de ferme dans sa
 * province qui en a le moins (égalité : identifiant), en gardant 10 or. Une ferme en chantier à la fois.
 * Renvoie null si aucune ferme n'est nécessaire, sinon { needed: true, ok } (ok : niveau commandé). Sans or pour la
 * ferme, l'IA épargne (ai.js : ni recrutement ni banque à cette décision).
 */
export function aiFarmOrders(state, nationId) {
  if (!isRealtime(state) || farmInProgress(state, nationId)) return null;
  const production = plannedProduction(state, nationId), consumption = plannedConsumption(state, nationId), f = foodOf(state, nationId);
  const short = production * 100 < consumption * Math.round(F().aiTargetMargin * 100);
  const lowReserve = production < consumption && f.reserve < consumption * F().aiReserveDays;
  if (!short && !lowReserve) return null;
  const none = { needed: true, ok: false };
  const spots = Object.keys(state.provinces).filter(id => state.provinces[id].ownerId === nationId && !isMysteryIsland(id))
    .map(id => ({ id, count: buildingCount(state, id, 'farm') })).filter(x => x.count < F().farmMax)
    .sort((a, b) => a.count - b.count || a.id.localeCompare(b.id));
  const spot = spots[0];
  if (!spot) return null; // toutes les fermes au plafond : il faut conquérir (rien à épargner)
  const cost = farmCost(spot.count);
  if (spendableTreasury(state, nationId) - cost < F().aiGoldReserve) return none;
  const r = queueConstruction(state, { nationId, provinceId: spot.id, type: 'farm' });
  return r.ok ? { needed: true, ...r } : none;
}
