// Moteur — bombardement des forteresses côtières par les navires de guerre (V14.4).

import { fortBonusFactor, navalBonusFactor } from '../boosts.js';
import { fireFactorFor } from '../realtime/food.js';
import {
  firePower, fortReductionPct, maxWoundsFor, mergeForce, provinceForce, resolveBattle, splitForce,
  writeProvinceForce
} from '../combat.js';
import { LAND_UNIT_TYPES, RULES } from '../constants.js';
import { availableForces, queuedOrder } from './orders.js';
import { isPortPoint, seaDestinations } from './sea-routes.js';
import { pairWar, safeNum } from './shared.js';

// --- V14.4 : bombardement des forteresses côtières par les navires de guerre ----------------------------------
// Règles et chiffres : docs/V14.4-cahier-des-charges.md (Réalisé, Équipe gameplay). RULES.bombard (constants.js).
//  - Ordre { kind:'bombard', nationId, fromId, toId, warships } : navires à quai sur un point de port qu'on possède,
//    contre le point de port ennemi AU BOUT DE SA ROUTE (la « zone de mer » qui les sépare), seulement en guerre.
//    Les navires restent chez eux (ils sont réservés pour le tour : ni escorte ni patrouille).
//  - Résolu au début de l'inter-tour, AVANT les attaques et les débarquements : une attaque ou un débarquement du
//    même tour profite de la brèche.
//  - Flotte ennemie à quai dans un port construit : bataille navale d'abord ; seuls les survivants bombardent.
//  - Brèche ajoutée = breachPerShip × (puissance de feu / feu d'un navire intact), plafonnée à maxPerTurn par tour
//    (toutes flottes confondues) ; brèche totale ≤ 100 %. Protection restante = 100 − brèche (%).
//  - Garnison : garrisonShare de la puissance de feu en blessures, plafonnées à garrisonMaxShare de ses PV (aucun mort) ;
//    la province ne guérit pas ce tour.
//  - Un tour sans bombardement : la brèche se referme de repairPerTurn points. Forteresse détruite (niveau 0) : oubliée.
// Mémoire : state.fortBreach[province] = { pct, turn } (absent des anciennes sauvegardes : vide).
const BR = () => RULES.bombard;
const clampPct = n => Math.max(0, Math.min(100, Math.round(Number(n) || 0)));
/** Brèche actuelle (0 à 100) de la forteresse de `provinceId` ; 0 sans forteresse. */
export function fortBreach(state, provinceId) {
  const b = state.fortBreach?.[provinceId], level = state.provinces?.[provinceId]?.buildings?.fort || 0;
  return level && b ? clampPct(b.pct) : 0;
}
/** Facteur de défense réel d'une forteresse (niveau, atout du propriétaire, brèche). */
/** Cibles de bombardement depuis `fromId` pour `nationId` : points de port au bout des routes, d'une nation en guerre. */
export function bombardTargets(map, state, fromId, nationId = state.provinces?.[fromId]?.ownerId) {
  if (!state.provinces[fromId] || state.provinces[fromId].ownerId !== nationId || !isPortPoint(map, fromId)) return [];
  // V16.0 : sans forteresse il n'y a rien à bombarder (les navires ne tirent plus sur les troupes à terre).
  return seaDestinations(map, fromId).filter(d => { const q = state.provinces[d.id], o = q?.ownerId; return o && o !== nationId && pairWar(state, nationId, o) && (q.buildings?.fort || 0) > 0; }).map(d => d.id);
}
/** Feu de bombardement d'une flotte (même puissance de feu que dans les combats, atout « marine » compris). */
const bombardFire = (state, nationId, fleet) => firePower(fleet, { mode: 'naval', warshipFactor: navalBonusFactor(state, nationId) });
const breachFor = (fire, rules = BR()) => Math.min(rules.maxPerTurn, Math.round(rules.breachPerShip * fire / RULES.combat.units.warship.damage));
/** V17.2 : chiffres d'un « tir » de bombardement — au tour par tour, un tour ; en temps réel, une tranche de 10 jours. */
export function bombardRules(state) {
  if (state?.mode !== 'realtime') return BR();
  const R = RULES.realtime.bombard;
  return { ...BR(), breachPerShip: R.breachPerShip, maxPerTurn: R.maxPerTick, repairPerTurn: R.repairAmount, everyDays: R.everyDays };
}
const garrisonDamageFor = (fire, garrison) => {
  const landMax = LAND_UNIT_TYPES.reduce((n, k) => n + (garrison.units[k] || 0) * RULES.combat.units[k].hp, 0);
  return Math.min(Math.round(fire * BR().garrisonShare), Math.floor(landMax * BR().garrisonMaxShare));
};
/**
 * Aperçu d'un bombardement (interface et IA) : ce que `warships` navires de `fromId` feraient à `toId` ce tour,
 * sans flotte ennemie à quai. { level, breachNow, breachAfter, protectionNow, protectionAfter, reductionNow,
 * reductionAfter, garrisonHp } — protection = part de la forteresse qui tient encore (%), reduction = −X % de dégâts.
 */
export function bombardPreview(state, { nationId, fromId, toId, warships } = {}) {
  const p = state.provinces?.[toId], from = state.provinces?.[fromId];
  if (!p || !from) return null;
  const level = p.buildings?.fort || 0, bonus = fortBonusFactor(state, p.ownerId), now = fortBreach(state, toId);
  const ships = Math.max(0, Math.min(Math.floor(Number(warships) || 0), from.warships || 0));
  const fleet = splitForce(provinceForce(from), { warship: ships }).taken, fire = bombardFire(state, nationId, fleet), rules = bombardRules(state);
  const after = level ? Math.min(100, now + breachFor(fire, rules)) : 0;
  return { level, ships, breachNow: now, breachAfter: after, protectionNow: level ? 100 - now : 0, protectionAfter: level ? 100 - after : 0,
    reductionNow: fortReductionPct(level, bonus, now), reductionAfter: fortReductionPct(level, bonus, after), reductionFull: fortReductionPct(level, bonus),
    garrisonHp: garrisonDamageFor(fire, provinceForce(p)), maxPerTurn: rules.maxPerTurn, ...(rules.everyDays ? { everyDays: rules.everyDays } : {}) };
}
/** Peut-on bombarder depuis `fromId` ? { ok, reason, targets, warships } (message clair pour l'interface). */
export function bombardStatus(map, state, { nationId, fromId }) {
  const p = state.provinces?.[fromId];
  if (!p || p.ownerId !== nationId) return { ok: false, reason: 'Province non contrôlée', targets: [], warships: 0 };
  const warships = availableForces(state, fromId, nationId).warships;
  if (!isPortPoint(map, fromId)) return { ok: false, reason: 'Bombarder : il faut un point de port ⚓ face à la côte ennemie.', targets: [], warships };
  const targets = bombardTargets(map, state, fromId, nationId);
  if (!warships) return { ok: false, reason: 'Bombarder : aucun navire de guerre disponible ici.', targets, warships };
  if (!targets.length) return { ok: false, reason: 'Bombarder : il faut, en face, une forteresse d’une nation avec qui vous êtes en guerre.', targets, warships };
  return { ok: true, reason: '', targets, warships };
}
/** Ordre « Bombarder » : les navires restent à quai (réservés pour le tour) et tirent à l'inter-tour. */
export function queueBombard(state, map, { nationId, fromId, toId, warships } = {}) {
  const st = bombardStatus(map, state, { nationId, fromId });
  if (!st.ok) return { ok: false, error: st.reason };
  if (!st.targets.includes(toId)) return { ok: false, error: 'Bombarder : on ne bombarde que la forteresse du point de port au bout de la route, chez une nation en guerre avec vous.' };
  const ships = Math.max(0, Math.floor(safeNum(warships)));
  if (!ships) return { ok: false, error: 'Aucun navire sélectionné' };
  if (ships > st.warships) return { ok: false, error: 'Ces navires sont déjà réservés dans un autre ordre' };
  return queuedOrder(state, { kind: 'bombard', nationId, fromId, toId, units: {}, warships: ships });
}
/** Résolution des bombardements du tour (avant les déplacements). Renvoie l'ensemble des provinces bombardées. */
export function resolveBombardments(state, map, orders, fought) {
  const rules = bombardRules(state);
  state.fortBreach = state.fortBreach && typeof state.fortBreach === 'object' ? state.fortBreach : {};
  const list = orders.filter(o => o.kind === 'bombard').sort((a, b) => a.toId.localeCompare(b.toId) || a.nationId.localeCompare(b.nationId) || a.fromId.localeCompare(b.fromId) || String(a.id).localeCompare(String(b.id)));
  const hit = new Set(), addedThisTurn = {};
  for (const o of list) {
    const from = state.provinces[o.fromId], target = state.provinces[o.toId];
    // Conditions revérifiées : province toujours à soi, toujours en guerre, navires encore là.
    if (!from || !target || !(target.buildings?.fort > 0) || from.ownerId !== o.nationId || target.ownerId === o.nationId || !pairWar(state, o.nationId, target.ownerId)) continue;
    if (!seaDestinations(map, o.fromId).some(d => d.id === o.toId)) continue;
    const ships = Math.min(o.warships || 0, from.warships || 0);
    if (!ships) continue;
    let { taken: fleet, rest } = splitForce(provinceForce(from), { warship: ships });
    const owner = target.ownerId, event = { turn: state.turn, type: 'bombardment', nationId: o.nationId, attacker: o.nationId, defender: owner, target: owner, provinceId: o.toId, fromId: o.fromId, warships: ships };
    // Flotte ennemie à quai (port construit) : bataille navale d'abord.
    if (target.buildings?.port && target.warships > 0) {
      const { taken: docked, rest: ashore } = splitForce(provinceForce(target), { warship: target.warships });
      const res = resolveBattle({ defender: docked, attackers: [{ id: o.nationId, force: fleet, warshipFactor: navalBonusFactor(state, o.nationId), fireFactor: fireFactorFor(state, o.nationId) }], naval: true, defenderWarshipFactor: navalBonusFactor(state, owner), defenderFireFactor: fireFactorFor(state, owner) });
      fleet = res.attackers[0].force;
      writeProvinceForce(target, mergeForce(ashore, res.defender));
      event.harbor = { attackerLost: res.attackers[0].lossesByType.warship, defenderLost: res.defenderLossesByType.warship, defenderLeft: res.defender.units.warship };
      fought.add(o.toId);
    }
    writeProvinceForce(from, mergeForce(rest, fleet));
    event.warshipsLeft = fleet.units.warship;
    if (!fleet.units.warship) { state.events.push(event); continue; }
    const fire = bombardFire(state, o.nationId, fleet);
    // Brèche (plafonnée par tour, toutes flottes confondues).
    const level = target.buildings?.fort || 0;
    if (level) {
      const before = fortBreach(state, o.toId), room = Math.max(0, rules.maxPerTurn - (addedThisTurn[o.toId] || 0));
      const add = Math.min(room, breachFor(fire, rules), 100 - before);
      addedThisTurn[o.toId] = (addedThisTurn[o.toId] || 0) + add;
      state.fortBreach[o.toId] = { pct: before + add, turn: state.turn };
      Object.assign(event, { fortLevel: level, breachBefore: before, breachAfter: before + add, protectionLeft: 100 - (before + add),
        fortPct: fortReductionPct(level, fortBonusFactor(state, owner), before + add), fortFullPct: fortReductionPct(level, fortBonusFactor(state, owner)),
        ...(rules.everyDays ? { everyDays: rules.everyDays, ...(o.permanentId ? { orderId: o.permanentId } : {}) } : {}) });
    }
    // Dégâts limités à la garnison : blessures seulement (aucun mort), réparties au prorata des PV.
    const garrison = provinceForce(target), dmg = garrisonDamageFor(fire, garrison);
    let dealt = 0;
    if (dmg > 0) {
      const pools = LAND_UNIT_TYPES.map(k => [k, Math.max(0, garrison.units[k] * RULES.combat.units[k].hp - garrison.wounds[k])]), total = pools.reduce((n, [, v]) => n + v, 0);
      for (const [k, pool] of pools) {
        if (!pool || !total) continue;
        const w = Math.min(maxWoundsFor(k, garrison.units[k]), garrison.wounds[k] + Math.round(dmg * pool / total));
        dealt += w - garrison.wounds[k]; garrison.wounds[k] = w;
      }
      writeProvinceForce(target, garrison);
    }
    event.garrisonHp = dealt;
    fought.add(o.toId); hit.add(o.toId);
    state.events.push(event);
  }
  return hit;
}
/** Fin du tour : une forteresse qui n'a pas été bombardée ce tour se répare lentement. */
export function repairForts(state, hit) {
  if (!state.fortBreach || typeof state.fortBreach !== 'object') return;
  for (const [id, b] of Object.entries(state.fortBreach)) {
    if (!(state.provinces[id]?.buildings?.fort > 0) || !(b?.pct > 0)) { delete state.fortBreach[id]; continue; }
    if (hit.has(id)) continue;
    b.pct = clampPct(b.pct - bombardRules(state).repairPerTurn);
    if (!b.pct) delete state.fortBreach[id];
  }
}

// --- V17.2 : bombardement en ORDRE PERMANENT (temps réel, cahier V17 §5.3) ----------------------------------------------
// Un ordre « Bombarder X » (queueBombard, inchangé) devient, en temps réel, un ordre permanent state.bombardOrders[] =
// { id, nationId, fromId, toId, warships, sinceDay }. Tous les 10 jours (jours multiples de 10) : bataille contre la flotte
// à quai d'abord (port construit), puis brèche +4 par navire intact, +10 au plus par tranche (toutes flottes confondues).
// Les navires restent à quai chez eux (ils défendent leur port, ils peuvent repartir : l'ordre tire avec ceux qui restent).
// L'ordre s'arrête de lui-même : paix, plus de navires, forteresse prise (ou disparue), port de départ perdu, ou annulation.
/** Enregistre les ordres « bombard » exécutés aujourd'hui comme ordres permanents (même trio nation / départ / cible : mis à jour). */
export function registerBombardOrders(state, orders) {
  state.bombardOrders = Array.isArray(state.bombardOrders) ? state.bombardOrders : [];
  for (const o of orders.filter(x => x.kind === 'bombard')) {
    const old = state.bombardOrders.find(x => x.nationId === o.nationId && x.fromId === o.fromId && x.toId === o.toId);
    if (old) { old.warships = o.warships; continue; }
    state.bombardSequence = Math.max(1, Number(state.bombardSequence) || 1);
    const id = `bo${state.bombardSequence++}`;
    state.bombardOrders.push({ id, nationId: o.nationId, fromId: o.fromId, toId: o.toId, warships: o.warships, sinceDay: state.day });
    state.events.push({ turn: state.turn, type: 'bombard-ordered', nationId: o.nationId, attacker: o.nationId, defender: state.provinces[o.toId]?.ownerId, provinceId: o.toId, fromId: o.fromId,
      warships: o.warships, orderId: id, everyDays: RULES.realtime.bombard.everyDays });
  }
}
/** Raison pour laquelle un ordre permanent s'arrête (ou null s'il tient toujours). */
function bombardStop(state, map, o) {
  const from = state.provinces[o.fromId], target = state.provinces[o.toId];
  if (!from || from.ownerId !== o.nationId) return 'port-lost';
  if (!target || target.ownerId === o.nationId) return 'captured';
  if (!(target.buildings?.fort > 0)) return 'no-fort';
  if (!pairWar(state, o.nationId, target.ownerId)) return 'peace';
  if (!seaDestinations(map, o.fromId).some(d => d.id === o.toId)) return 'no-route';
  if (!(Math.min(o.warships || 0, from.warships || 0) > 0)) return 'no-ships';
  return null;
}
/** Annulation par le joueur (ou l'IA). { ok, error? } */
export function cancelBombardOrder(state, { nationId, orderId }) {
  const o = (state.bombardOrders || []).find(x => x.id === orderId);
  if (!o || o.nationId !== nationId) return { ok: false, error: 'Ordre de bombardement introuvable' };
  state.bombardOrders = state.bombardOrders.filter(x => x !== o);
  state.events.push({ turn: state.turn, type: 'bombard-stopped', reason: 'cancelled', nationId, provinceId: o.toId, fromId: o.fromId, orderId: o.id, ...(Number.isFinite(state.day) ? { day: state.day } : {}) });
  return { ok: true };
}
/** Une tranche de 10 jours de bombardement : ordres arrêtés retirés, les autres tirent. Renvoie les provinces bombardées. */
export function bombardTick(state, map, fought) {
  const keep = [];
  for (const o of [...(state.bombardOrders || [])].sort((a, b) => String(a.id).localeCompare(String(b.id)))) {
    const why = bombardStop(state, map, o);
    if (why) { state.events.push({ turn: state.turn, type: 'bombard-stopped', reason: why, nationId: o.nationId, provinceId: o.toId, fromId: o.fromId, orderId: o.id }); continue; }
    keep.push(o);
  }
  state.bombardOrders = keep;
  const hit = resolveBombardments(state, map, keep.map(o => ({ kind: 'bombard', id: o.id, permanentId: o.id, nationId: o.nationId, fromId: o.fromId, toId: o.toId, warships: o.warships })), fought);
  // Flotte coulée devant le port : l'ordre s'arrête (plus de navires).
  state.bombardOrders = state.bombardOrders.filter(o => (state.provinces[o.fromId]?.warships || 0) > 0 || !state.events.push({ turn: state.turn, type: 'bombard-stopped', reason: 'no-ships', nationId: o.nationId, provinceId: o.toId, fromId: o.fromId, orderId: o.id }));
  return hit;
}
