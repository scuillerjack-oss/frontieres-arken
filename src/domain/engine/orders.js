// Moteur — ordres du joueur et des IA : forces disponibles, construction, recrutement, déplacement.

import { LAND_UNIT_TYPES, RULES } from '../constants.js';
import { hasPassage, stationedAt, stationedForce } from '../passage.js';
import { legalDestinations, seaMoveRefusal } from './sea-routes.js';
import { safeNum, spendableTreasury, sum } from './shared.js';

function reservedAt(state, fromId, nationId = null) {
  return (state.orders || []).filter(o => (o.kind === 'move' || o.kind === 'bombard') && o.fromId === fromId && o.status === 'pending' && (!nationId || o.nationId === nationId)).reduce((out, o) => {
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

export function queuedOrder(state, order) {
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
  if (r.requiresPort && r.requiresFactory && (!p.buildings.port || !p.buildings.factory)) return { ok: false,
    error: `Navire de guerre : il faut un port construit et une usine dans cette province (manque : ${[!p.buildings.port && 'port', !p.buildings.factory && 'usine'].filter(Boolean).join(' et ')})` };
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
