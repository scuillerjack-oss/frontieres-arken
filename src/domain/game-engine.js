import { RULES, LAND_UNIT_TYPES } from './constants.js';
import { resolveBattle, resolveCombat, provinceForce, writeProvinceForce, legacyForce, toLegacy, splitForce, mergeForce, normalizeForce, healForce, combatValue, scaleForce, hasCombatUnits, emptyCounts, totalHp, maxHp, COMBAT_TYPES } from './combat.js';
export { resolveBattle, resolveCombat, provinceForce, combatValue } from './combat.js';

const sum = units => LAND_UNIT_TYPES.reduce((n, k) => n + (Number(units?.[k]) || 0), 0);
const provinceDef = (map, id) => map.provinces.find(p => p.id === id);
const safeNum = n => Number.isFinite(Number(n)) ? Number(n) : 0;
const nationName = (map, id) => map.nations.find(n => n.id === id)?.short || 'Nation inconnue';
const pairWar = (state, a, b) => state.diplomacy.wars.some(w => w.active !== false && w.participants.includes(a) && w.participants.includes(b));
const pairTreaty = (state, a, b, type) => state.diplomacy.treaties.some(t => t.active !== false && t.type === type && t.parties.includes(a) && t.parties.includes(b));
const reservedDiplomaticFunds = (state, nationId) => (state.orders || []).filter(o => o.kind === 'diplomacy' && o.action === 'ceasefire' && o.nationId === nationId && o.status === 'pending').reduce((n,o)=>n+(o.amount||0),0);
export const spendableTreasury = (state, nationId) => Math.max(0,(state.nations[nationId]?.treasury||0)-reservedDiplomaticFunds(state,nationId));

export const incomeFor = (state, nationId) => Object.values(state.provinces).filter(p => p.ownerId === nationId).reduce((n, p) => n + RULES.baseIncome + (p.buildings.bank || 0) * RULES.bankIncome + (p.buildings.factory || 0) * RULES.factoryIncome, 0);
// Puissances « V6 » conservées pour compatibilité (plus utilisées par les combats depuis la V10 : voir combat.js).
export const landPower = (u, defense = false) => LAND_UNIT_TYPES.reduce((n, k) => n + (u[k] || 0) * (defense && k === 'artillery' ? RULES.units[k].defensePower : RULES.units[k].power), 0);
export const navalPower = ({ units = {}, warships = 0, transport = false }) => warships * RULES.units.warship.power + landPower(units) * (transport ? RULES.navalTransportPowerFactor : 0);

export function legalDestinations(map, state, fromId) {
  const p = provinceDef(map, fromId), current = state.provinces[fromId];
  const out = (p?.landConnections || []).map(id => ({ id, type: 'land' }));
  if (current?.buildings?.port) for (const [a, b] of map.maritimeRoutes) if (a === fromId || b === fromId) {
    const other = a === fromId ? b : a;
    if (state.provinces[other]?.buildings?.port) out.push({ id: other, type: 'sea' });
  }
  return out.filter(x => state.provinces[x.id]);
}

function reservedAt(state, fromId) {
  return (state.orders || []).filter(o => o.kind === 'move' && o.fromId === fromId && o.status === 'pending').reduce((out, o) => {
    for (const k of LAND_UNIT_TYPES) out[k] = (out[k] || 0) + (o.units?.[k] || 0);
    out.warships = (out.warships || 0) + (o.warships || 0); return out;
  }, {});
}
export function availableForces(state, fromId) {
  const p = state.provinces[fromId], held = reservedAt(state, fromId);
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
export function queueConstruction(state, { nationId, provinceId, type }) {
  const p = state.provinces[provinceId], r = RULES.buildings[type];
  if (!p || p.ownerId !== nationId) return { ok: false, error: 'Province non contrôlée' };
  if (!r) return { ok: false, error: 'Construction indisponible' };
  if (type === 'port' && !p.portSite) return { ok: false, error: 'Cette province ne peut pas accueillir de port' };
  const count = buildingCount(state, provinceId, type);
  // V10 : plafonds par province, file de construction comprise (RULES.buildings[type].max).
  if (count >= (r.max ?? Infinity)) return { ok: false, error: BUILDING_CAP_ERRORS[type] || 'Maximum atteint dans cette province' };
  const cost = type === 'fort' ? r.costs[count] : r.cost;
  if (spendableTreasury(state,nationId) < cost) return { ok: false, error: 'Trésor insuffisant ou réservé à un cessez-le-feu' };
  state.nations[nationId].treasury -= cost;
  return { ...queuedOrder(state, { kind: 'construction', nationId, provinceId, type, cost, duration: r.turns }), cost };
}

export function queueRecruitment(state, { nationId, provinceId, type, lots = 1 }) {
  const p = state.provinces[provinceId], r = RULES.units[type], count = Math.max(1, Math.floor(safeNum(lots)));
  if (!p || p.ownerId !== nationId) return { ok: false, error: 'Province non contrôlée' };
  if (!r) return { ok: false, error: 'Unité inconnue' };
  if (r.requiresFactory && !p.buildings.factory) return { ok: false, error: 'Usine requise' };
  if (r.requiresPort && !p.buildings.port) return { ok: false, error: 'Port requis' };
  const cost = r.cost * count;
  if (spendableTreasury(state,nationId) < cost) return { ok: false, error: 'Trésor insuffisant ou réservé à un cessez-le-feu' };
  state.nations[nationId].treasury -= cost;
  return { ...queuedOrder(state, { kind: 'recruitment', nationId, provinceId, type, lots: count, amount: r.amount * count, cost, duration: r.turns }), cost, amount: r.amount * count };
}

export function queueMoveOrder(state, map, { nationId, fromId, toId, units = {}, warships = 0 }) {
  const from = state.provinces[fromId], route = legalDestinations(map, state, fromId).find(x => x.id === toId);
  if (!from || from.ownerId !== nationId) return { ok: false, error: 'Origine non contrôlée' };
  if (!route) return { ok: false, error: 'Aucune route visible ou aucun port opérationnel' };
  const available = availableForces(state, fromId), committed = Object.fromEntries(LAND_UNIT_TYPES.map(k => [k, Math.max(0, Math.floor(safeNum(units[k])))]));
  if (LAND_UNIT_TYPES.some(k => committed[k] > available[k])) return { ok: false, error: 'Ces unités sont déjà réservées dans un autre ordre' };
  const ships = Math.max(0, Math.floor(safeNum(warships)));
  if (ships > available.warships) return { ok: false, error: 'Ces navires sont déjà réservés dans un autre ordre' };
  if (!sum(committed) && !ships) return { ok: false, error: 'Aucune force sélectionnée' };
  return queuedOrder(state, { kind: 'move', nationId, fromId, toId, units: committed, warships: ships, routeType: route.type });
}
// Kept as a compatibility name; since V4 this only queues an order.
export const moveForce = queueMoveOrder;

export function queueDiplomaticOrder(state, { nationId, target, action, offerLevel = .5 }) {
  if(action==='ultimatum')action='ceasefire';
  if (!state.nations[target] || nationId === target) return { ok: false, error: 'Cible invalide' };
  if (!['war', 'alliance', 'ceasefire'].includes(action)) return { ok: false, error: 'Action indisponible en V5' };
  if ((state.orders || []).some(o => o.kind === 'diplomacy' && o.nationId === nationId && o.target === target && o.status === 'pending')) return { ok: false, error: 'Une action envers ce pays est déjà prévue pour l’inter-tour' };
  const atWar = pairWar(state, nationId, target), relation = (state.diplomacy.treaties || []).find(t => t.active !== false && t.parties.includes(nationId) && t.parties.includes(target))?.type || 'neutral';
  if (action === 'ceasefire' && !atWar) return { ok: false, error: 'Aucune guerre active' };
  if (action === 'alliance' && (atWar || relation === 'alliance')) return { ok: false, error: 'Un cessez-le-feu est requis et une alliance existe déjà' };
  if (action === 'war' && atWar) return { ok: false, error: 'Déjà en guerre' };
  let offer = {};
  if (action === 'ceasefire') {
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
  state.diplomacy.treaties = state.diplomacy.treaties.filter(t => !(t.parties?.includes(attacker) && t.parties?.includes(defender)));
  state.diplomacy.wars.push({ active: true, participants: [attacker, defender], started: state.turn });
  state.events.push({ turn: state.turn, type: 'diplomacy', nationId: attacker, target: defender, relation: 'war', reason: 'combat' });
}

// --- V10 : déplacements et combats simultanés ------------------------------------------------------------
const lossCount = byType => COMBAT_TYPES.reduce((n, k) => n + (byType?.[k] || 0), 0);
const isEmptyForce = f => COMBAT_TYPES.every(k => !f.units[k]);
/** Prélève dans la province d'origine les forces d'un ordre (blessures comprises). null si l'origine est perdue. */
function takeOrderForces(state, order) {
  const p = state.provinces[order.fromId];
  if (!p || p.ownerId !== order.nationId) return null;
  const counts = { ...Object.fromEntries(LAND_UNIT_TYPES.map(k => [k, order.units?.[k] || 0])), warship: order.warships || 0 };
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
    if (!state.warChestsClaimed[provinceId]) { state.warChestsClaimed[provinceId] = true; state.nations[newOwner].treasury += RULES.warChestAmount; state.events.push({ turn: state.turn, type: 'war-chest', attacker: newOwner, defender: oldOwner, provinceId, amount: RULES.warChestAmount }); }
    const amount = Math.floor(Math.max(0, state.nations[oldOwner].treasury) * RULES.capitalPlunderRate);
    state.nations[oldOwner].treasury -= amount; state.nations[newOwner].treasury += amount;
    state.events.push({ turn: state.turn, type: 'capital-plunder', attacker: newOwner, defender: oldOwner, provinceId, amount, rate: RULES.capitalPlunderRate });
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
  for (const g of groups) ensureWar(state, g.nationId, defender);
  const before = provinceForce(target);
  const res = resolveBattle({ defender: before, attackers: groups.map(g => ({ id: g.nationId, force: g.force, mode: g.mode })), fortLevel: target.buildings.fort || 0 });
  fought.add(toId);
  const retreats = [];
  res.attackers.forEach((a, i) => { if (a.id !== res.winnerId && !isEmptyForce(a.force)) retreats.push({ nationId: a.id, force: a.force, to: groups[i].retreatTo || groups[i].originIds }); });
  if (res.captured) { target.ownerId = res.winnerId; writeProvinceForce(target, res.attackers.find(a => a.id === res.winnerId).force); }
  else writeProvinceForce(target, res.defender);
  const primary = res.winnerId || [...res.attackers].sort((x, y) => totalHp(y.force) - totalHp(x.force) || x.id.localeCompare(y.id))[0].id;
  state.events.push({
    turn: state.turn, type: res.captured ? 'conquest' : 'battle', attacker: primary, attackers: groups.map(g => g.nationId), defender,
    ...(res.captured ? { newOwnerId: res.winnerId } : {}), provinceId: toId, originIds: groups.flatMap(g => g.originIds), naval: groups.some(g => g.mode === 'landing') || naval,
    attackerLosses: res.attackers.reduce((n, a) => n + lossCount(a.lossesByType), 0), defenderLosses: lossCount(res.defenderLossesByType),
    attackerHpLost: res.attackers.reduce((n, a) => n + a.hpLost, 0), defenderHpLost: res.defenderHpLost,
    lossesByNation: Object.fromEntries([...res.attackers.map(a => [a.id, a.lossesByType]), [defender, res.defenderLossesByType]]),
    passes: res.passes.length, fortLevel: target.buildings.fort || 0
  });
  if (res.captured) onCapture(state, toId, res.winnerId, defender);
  return retreats;
}
/** Repli : les survivants d'une attaque non victorieuse rentrent dans la 1re province d'origine encore à eux ; sinon perdus. */
function applyRetreats(state, retreats) {
  for (const r of retreats) {
    const home = (r.to || []).find(id => state.provinces[id]?.ownerId === r.nationId);
    if (home) addToProvince(state.provinces[home], r.force);
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
  // 0. Transferts amicaux (terre) et tous les embarquements (mer).
  for (const o of moves.filter(x => owner0[x.toId] === x.nationId || x.routeType === 'sea')) {
    const force = takeOrderForces(state, o);
    if (!force) continue;
    if (o.routeType === 'sea') state.transports.push({ nationId: o.nationId, fromId: o.fromId, toId: o.toId, ...toLegacy(force), status: 'embarking', remaining: 1 });
    else addToProvince(state.provinces[o.toId], force);
    if (owner0[o.toId] === o.nationId) state.events.push({ turn: state.turn, type: 'movement', nationId: o.nationId, fromId: o.fromId, toId: o.toId, amount: unitCount(force) });
  }
  const attacks = moves.filter(x => owner0[x.toId] !== x.nationId && x.routeType !== 'sea');
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
    if (state.provinces[o.fromId]?.ownerId !== o.nationId) {
      state.events.push({ turn: state.turn, type: 'attack-cancelled', nationId: o.nationId, fromId: o.fromId, provinceId: o.toId, reason: 'origin-lost' });
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
    for (const x of changed) { addToProvince(state.provinces[x.o.fromId], x.force); state.events.push({ turn: state.turn, type: 'attack-cancelled', nationId: x.o.nationId, fromId: x.o.fromId, provinceId: toId, reason: 'target-changed' }); }
    retreats2.push(...fight(state, toId, group(here.filter(x => x.o.nationId !== target.ownerId && !changed.includes(x))), fought));
  }
  applyRetreats(state, retreats2);
  for (const o of moves) state.ai?.replay?.push({ turn: state.turn, nationId: o.nationId, action: 'move', target: o.toId });
}
const emptyForceLocal = () => normalizeForce({});

function resolveDiplomacy(state, orders, random) {
  for (const o of orders.filter(x => x.kind === 'diplomacy').sort((a,b)=>a.nationId.localeCompare(b.nationId)||a.target.localeCompare(b.target)||a.action.localeCompare(b.action))) {
    const atWar = pairWar(state, o.nationId, o.target);
    if(o.action==='tribute'){
      // Complete an already-confirmed V4 transfer; new V5 orders cannot create one.
      state.nations[o.target].treasury+=Math.max(0,o.amount||0);
      state.events.push({turn:state.turn,type:'diplomatic-action',nationId:o.nationId,target:o.target,action:'tribute',amount:o.amount||0});
      state.messages.push({turn:state.turn,nationId:o.nationId,target:o.target,action:'tribute',amount:o.amount||0,status:'resolved'});
      continue;
    }
    if (o.action === 'ceasefire') {
      const accepted = atWar && (o.legacyFree || random() < o.acceptanceProbability) && state.nations[o.nationId].treasury >= o.amount;
      if (accepted) {
        state.nations[o.nationId].treasury -= o.amount;
        state.nations[o.target].treasury += o.amount; // B3 corrigé : la somme est versée à la nation qui accepte
        state.diplomacy.wars = state.diplomacy.wars.filter(w => !(w.participants.includes(o.nationId) && w.participants.includes(o.target)));
        state.diplomacy.treaties = state.diplomacy.treaties.filter(t => !(t.parties?.includes(o.nationId) && t.parties?.includes(o.target)));
        state.diplomacy.treaties.push({ active:true,type:'ceasefire',parties:[o.nationId,o.target],started:state.turn });
      }
      state.events.push({turn:state.turn,type:'ceasefire-offer',nationId:o.nationId,target:o.target,amount:o.amount||0,offerLevel:o.offerLevel,acceptanceProbability:o.acceptanceProbability,accepted});
      state.messages.push({turn:state.turn,nationId:o.nationId,target:o.target,action:'ceasefire',amount:o.amount||0,status:accepted?'accepted':'refused'});
      continue;
    }
    if ((o.action === 'alliance' && !atWar) || (o.action === 'war' && !atWar)) {
      state.diplomacy.wars = state.diplomacy.wars.filter(w => !(w.participants.includes(o.nationId) && w.participants.includes(o.target)));
      state.diplomacy.treaties = state.diplomacy.treaties.filter(t => !(t.parties?.includes(o.nationId) && t.parties?.includes(o.target)));
      if (o.action === 'war') state.diplomacy.wars.push({ active: true, participants: [o.nationId, o.target], started: state.turn });
      if (o.action === 'alliance') state.diplomacy.treaties.push({ active: true, type: o.action, parties: [o.nationId, o.target], started: state.turn });
    }
    state.events.push({ turn: state.turn, type: 'diplomatic-action', nationId: o.nationId, target: o.target, action: o.action, amount: o.amount || 0 });
    state.messages.push({ turn: state.turn, nationId: o.nationId, target: o.target, action: o.action, amount: o.amount || 0, status: 'resolved' });
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
  for (const q of state.productionQueue.filter(x => x.remaining <= 0)) {
    const p = state.provinces[q.provinceId];
    // B4 (filet de sécurité) : jamais de livraison à un autre propriétaire que celui qui a payé.
    if (p && p.ownerId !== q.nationId) { refundProduction(state, q, q.provinceId); continue; }
    if (p) {
      if (q.kind === 'building') p.buildings[q.type] = Math.min((p.buildings[q.type] || 0) + 1, RULES.buildings[q.type]?.max ?? Infinity);
      else if (q.type === 'warship') p.warships = (p.warships || 0) + q.amount;
      else p.units[q.type] = (p.units[q.type] || 0) + q.amount;
      state.events.push({ turn: state.turn, type: 'production-complete', kind: q.kind, productionType: q.type, provinceId: q.provinceId, nationId: q.nationId, amount: q.amount || 1 });
    }
  }
  state.productionQueue = state.productionQueue.filter(q => q.remaining > 0);
}
// Mécanique de transport V9 inchangée (embarquement → mer → arrivée) ; seule l'arrivée utilise le combat V10 :
// débarquement (mode 'landing') contre la garnison, navires de l'attaquant en appui. Refonte marine : agent suivant.
function resolveTransports(state, fought) {
  for (const t of state.transports) {
    if (t.status === 'embarking') { t.status = 'at-sea'; t.remaining = 1; continue; }
    t.remaining--;
    if (t.remaining > 0) continue;
    const to = state.provinces[t.toId], force = legacyForce(t);
    if (to.ownerId === t.nationId) addToProvince(to, force);
    else {
      const retreats = fight(state, t.toId, [{ nationId: t.nationId, force, originIds: [t.fromId], mode: 'landing', retreatTo: [t.fromId] }], fought, { naval: true });
      applyRetreats(state, retreats);
    }
    t.status = 'arrived';
  }
  state.transports = state.transports.filter(t => t.status !== 'arrived');
}
/** Guérison : dans chaque province qui n'a pas combattu ce tour, RULES.combat.healRate des PV max par type. */
function healProvinces(state, fought) {
  for (const [id, p] of Object.entries(state.provinces)) {
    if (fought.has(id)) continue;
    writeProvinceForce(p, healForce(provinceForce(p)));
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
const defenseOf = (state, id) => { const p = state.provinces[id]; return combatValue(provinceForce(p)) * RULES.fortDefense[p.buildings.fort || 0]; };
const hostileTo = (state, nationId, owner) => owner && owner !== nationId && !pairTreaty(state, nationId, owner, 'alliance') && !pairTreaty(state, nationId, owner, 'ceasefire');
// Plus forte menace terrestre immédiate sur une province (forces des voisins hostiles).
const landThreat = (map, state, nationId, id) => combatValue(landThreatForce(map, state, nationId, id) || normalizeForce({}));
/** Plus forte armée terrestre d'un voisin hostile (force complète, pour simuler un combat). */
function landThreatForce(map, state, nationId, id) {
  const forces = (provinceDef(map, id)?.landConnections || []).filter(n => hostileTo(state, nationId, state.provinces[n]?.ownerId))
    .map(n => { const f = provinceForce(state.provinces[n]); f.units.warship = 0; f.wounds.warship = 0; return f; });
  return forces.sort((a, b) => combatValue(b) - combatValue(a))[0] || null;
}
// Base navale : site portuaire possédé, de préférence déjà équipé, puis celui qui ouvre le plus de routes.
function navalBase(map, state, owned) {
  const score = p => { const b = state.provinces[p.id].buildings; return (b.port ? 2 : 0) + (b.factory ? 1 : 0); };
  return owned.filter(p => state.provinces[p.id].portSite && seaRouteCount(map, p.id) > 0)
    .sort((a, b) => score(b) - score(a) || seaRouteCount(map, b.id) - seaRouteCount(map, a.id) || a.id.localeCompare(b.id))[0] || null;
}
function aiNavalOrders(state, map, nationId, owned, base, threshold) {
  const treasury = () => state.nations[nationId].treasury;
  if (!base) return;
  const baseState = state.provinces[base.id];
  // 1. Port puis usine sur la base navale (les navires exigent les deux au même endroit).
  if (!hasOrQueued(state, base.id, 'port') && treasury() >= RULES.buildings.port.cost) queueConstruction(state, { nationId, provinceId: base.id, type: 'port' });
  if (!hasOrQueued(state, base.id, 'factory') && treasury() >= RULES.buildings.factory.cost + 60) queueConstruction(state, { nationId, provinceId: base.id, type: 'factory' });
  // 2. Flotte : un navire par tour (deux si le trésor déborde), plafond qui grandit avec la partie.
  if (baseState.buildings.port && baseState.buildings.factory) {
    const queuedShips = (state.productionQueue || []).filter(q => q.kind === 'unit' && q.type === 'warship' && q.nationId === nationId).reduce((n, q) => n + q.amount, 0)
      + (state.orders || []).filter(o => o.kind === 'recruitment' && o.type === 'warship' && o.nationId === nationId && o.status === 'pending').reduce((n, o) => n + o.amount, 0);
    const fleet = owned.reduce((n, p) => n + (state.provinces[p.id].warships || 0), 0) + queuedShips;
    const cap = Math.min(30, 4 + Math.floor(state.turn / 8));
    const lots = treasury() >= 400 ? 2 : 1;
    if (fleet < cap && treasury() >= RULES.units.warship.cost * lots + 20) queueRecruitment(state, { nationId, provinceId: base.id, type: 'warship', lots });
  }
  // 3. Ports secondaires quand le trésor le permet (plus de routes ouvertes = plus d'options).
  if (baseState.buildings.port && treasury() >= RULES.buildings.port.cost + 20) {
    const site = owned.find(p => p.id !== base.id && state.provinces[p.id].portSite && seaRouteCount(map, p.id) > 0 && !hasOrQueued(state, p.id, 'port'));
    if (site) queueConstruction(state, { nationId, provinceId: site.id, type: 'port' });
  }
  const ports = owned.filter(p => state.provinces[p.id].buildings.port);
  const seaLinks = ports.flatMap(p => legalDestinations(map, state, p.id).filter(d => d.type === 'sea').map(d => ({ from: p, to: d.id, owner: state.provinces[d.id].ownerId })));
  // 4. Débarquement : au plus un par tour, jamais tant qu'une flotte d'invasion de cette nation est en mer.
  const invasionAtSea = (state.transports || []).some(t => t.nationId === nationId && state.provinces[t.toId]?.ownerId !== nationId);
  if (!invasionAtSea) {
    const targets = seaLinks.filter(x => hostileTo(state, nationId, x.owner)).map(x => ({ ...x, atWar: pairWar(state, nationId, x.owner) }));
    targets.sort((a, b) => Number(b.atWar) - Number(a.atWar) || Number(a.owner === state.playerNationId) - Number(b.owner === state.playerNationId) || defenseOf(state, a.to) - defenseOf(state, b.to) || a.to.localeCompare(b.to) || a.from.id.localeCompare(b.from.id));
    // Marge plus prudente que sur terre : la cible a un tour entier pour se renforcer pendant la traversée.
    const margin = (x) => (x.atWar ? Math.max(1.1, threshold - .2) : threshold) + RULES.ai.landingExtraMargin;
    for (const x of targets) {
      const warships = availableForces(state, x.from.id).warships;
      if (!warships) continue; // pas d'invasion sans escorte
      // V10 : simulation du débarquement (mode 'landing') contre la garnison majorée de la marge.
      const units = aiAttackSlice(state, map, nationId, x.from.id, x.to, margin(x), 'landing', warships);
      if (units) { queueMoveOrder(state, map, { nationId, fromId: x.from.id, toId: x.to, units, warships }); break; }
    }
  }
  // 5. Renfort par mer d'une tête de pont menacée ou en première ligne (au plus un par tour).
  const bridgeheads = seaLinks.filter(x => x.owner === nationId && provinceDef(map, x.to).landConnections.some(n => hostileTo(state, nationId, state.provinces[n]?.ownerId)))
    .sort((a, b) => combatValue(provinceForce(state.provinces[a.to])) - combatValue(provinceForce(state.provinces[b.to])) || a.to.localeCompare(b.to) || a.from.id.localeCompare(b.from.id));
  for (const x of bridgeheads) {
    const available = availableForces(state, x.from.id), here = combatValue(provinceForce(state.provinces[x.to]));
    const value = units => combatValue({ units });
    if (value(available) < Math.max(value({ infantry: 80 }), here * 2)) continue;
    const units = Object.fromEntries(LAND_UNIT_TYPES.map(k => [k, Math.floor(available[k] * .4)]));
    const kept = Object.fromEntries(LAND_UNIT_TYPES.map(k => [k, available[k] - units[k]]));
    const threat = landThreatForce(map, state, nationId, x.from.id);
    if (threat && !holds(normalizeForce({ units: kept }), threat, state.provinces[x.from.id].buildings.fort || 0)) continue;
    queueMoveOrder(state, map, { nationId, fromId: x.from.id, toId: x.to, units });
    break;
  }
}

function aiPlan(state, map, nationId) {
  const owned = map.provinces.filter(p => state.provinces[p.id].ownerId === nationId);
  if (!owned.length) return;
  const base = navalBase(map, state, owned);
  const factory = owned.find(p => state.provinces[p.id].buildings.factory);
  const source = factory || base || owned[0];
  if (!factory && state.nations[nationId].treasury >= RULES.buildings.factory.cost) queueConstruction(state, { nationId, provinceId:source.id, type:'factory' });
  const bankProvince = owned.find(p => !state.provinces[p.id].buildings.bank && p.id !== source.id);
  if (bankProvince && state.nations[nationId].treasury >= RULES.buildings.bank.cost) queueConstruction(state, { nationId, provinceId:bankProvince.id, type:'bank' });
  if (state.nations[nationId].treasury >= RULES.units.infantry.cost) queueRecruitment(state, { nationId, provinceId: source.id, type: factory && state.turn % 3 === 0 ? 'armor' : 'infantry' });
  const trait=state.ai.traits?.[nationId]||'prudent';
  const threshold=({offensif:1.08,impulsif:.92,prudent:1.3,fidele:1.45})[trait]||1.25;
  aiNavalOrders(state, map, nationId, owned, base, threshold);
  const attacks = owned.flatMap(p => legalDestinations(map, state, p.id).filter(d => {
    const target=state.provinces[d.id],owner=target?.ownerId;
    return owner&&owner!==nationId&&d.type==='land'&&!pairTreaty(state,nationId,owner,'alliance')&&!pairTreaty(state,nationId,owner,'ceasefire');
  }).map(d => ({ from:p, to:d.id, owner:state.provinces[d.id].ownerId, atWar:pairWar(state,nationId,state.provinces[d.id].ownerId) })));
  attacks.sort((a,b)=>Number(b.atWar)-Number(a.atWar)||Number(a.owner===state.playerNationId)-Number(b.owner===state.playerNationId)||a.to.localeCompare(b.to));
  // V10 : l'IA évalue l'attaque en simulant le vrai combat (déterministe) contre la garnison majorée d'une marge
  // selon son trait ; elle engage la plus petite part de ses forces disponibles qui gagne, en gardant de quoi tenir.
  for (const x of attacks) {
    const margin = x.atWar ? Math.max(.85, threshold - .2) : threshold;
    const units = aiAttackSlice(state, map, nationId, x.from.id, x.to, margin, 'land');
    if (units) { queueMoveOrder(state, map, { nationId, fromId:x.from.id, toId:x.to, units }); break; }
  }
}
/** Plus petite part (35 %, 50 %, 70 %) des forces disponibles qui prend la cible en simulation, ou null. */
function aiAttackSlice(state, map, nationId, fromId, toId, margin, mode, warships = 0) {
  const available = availableForces(state, fromId), target = state.provinces[toId];
  const defense = scaleForce(provinceForce(target), Math.max(1, margin));
  const home = provinceForce(state.provinces[fromId]);
  for (const share of RULES.ai.attackShares) {
    const units = Object.fromEntries(LAND_UNIT_TYPES.map(k => [k, Math.floor(available[k] * share)]));
    if (!LAND_UNIT_TYPES.some(k => units[k] && k !== 'balloon')) continue;
    const { taken, rest } = splitForce(home, { ...units, warship: warships });
    const r = resolveCombat({ attacker: taken, defender: defense, fortLevel: target.buildings.fort || 0, mode });
    if (!r.captured) continue;
    // Garder chez soi de quoi tenir face à la menace terrestre voisine.
    const threat = landThreatForce(map, state, nationId, fromId);
    if (threat && !holds(rest, threat, state.provinces[fromId].buildings.fort || 0)) continue;
    return units;
  }
  return null;
}
const holds = (garrison, threat, fortLevel) => !resolveCombat({ attacker: scaleForce(threat, .9), defender: garrison, fortLevel }).captured;
export function planAIOrders(state, map) {
  state.ai ||= { memories:{}, replay:[], traits:{} };
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
  if ([event.attacker,event.defender,event.nationId,event.target,event.newOwnerId,...(event.originIds||[])].includes(player)) return true;
  // V10 : tout affrontement (pris ou tenu), pillage de capitale et élimination sont publics ; le détail des pertes
  // n'est donné qu'aux nations impliquées (voir journalEntry).
  if (['conquest', 'battle', 'field-battle', 'capital-plunder', 'elimination'].includes(event.type)) return true;
  if ((event.attackers || []).includes(player)) return true;
  if (event.provinceId && state.provinces[event.provinceId]?.ownerId === player) return true;
  if (!event.provinceId) return event.type === 'diplomatic-action' && [event.nationId,event.target].includes(player);
  return map.provinces.some(p => state.provinces[p.id].ownerId === player && (state.provinces[p.id].units.balloon || 0) > 0 && p.landConnections.includes(event.provinceId));
}
/** Le joueur est-il partie prenante de l'événement (attaquant, défenseur, cible…) ? */
export function eventInvolvesNation(event, nationId) {
  if (!nationId) return false;
  return [event.attacker,event.defender,event.nationId,event.target,event.newOwnerId,...(event.attackers||[])].includes(nationId);
}
const LABELS_LOSS = { infantry:'fantassins', cavalry:'cavaliers', armor:'blindés', artillery:'canons', balloon:'ballons', warship:'navires' };
const lossText = byType => { const parts = Object.entries(byType || {}).filter(([,n]) => n > 0).map(([k,n]) => `${n} ${LABELS_LOSS[k] || k}`); return parts.length ? parts.join(', ') : 'aucune'; };
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
    if (event.lossesByNation) return ' Pertes : ' + Object.entries(event.lossesByNation).map(([id, l]) => `${nationName(map,id)} ${lossText(l)}`).join(' ; ') + '.';
    return ` Pertes : attaquant ${safeNum(event.attackerLosses)}, défenseur ${safeNum(event.defenderLosses)}.`;
  };
  const how = event.naval ? ' (débarquement)' : '';
  switch (event.type) {
    case 'battle': {
      const mine = involved && playerNationId !== null;
      return { priority:3, type: mine ? 'COMBAT' : 'AFFRONTEMENT', category: mine ? 'combat' : 'foreign-conflict', public:true,
        text:`Affrontement à ${where} entre ${sides(event)}${how} : ${nationName(map,event.defender)} tient la province.${lossDetails()}` };
    }
    case 'conquest': {
      const winner = event.newOwnerId || event.attacker, defender = event.defender;
      const type = winner===playerNationId?'CONQUÊTE':defender===playerNationId?'TERRITOIRE PERDU':'CONFLIT ÉTRANGER';
      return { priority:4, type, category:type==='CONQUÊTE'?'conquest':type==='TERRITOIRE PERDU'?'lost':'foreign-conflict', public:true,
        text:`Affrontement à ${where} entre ${sides(event)}${how} : ${nationName(map,winner)} prend la province.${lossDetails()}` };
    }
    case 'capital-plunder': return { priority:4, type:'PILLAGE', category: event.attacker===playerNationId?'conquest':event.defender===playerNationId?'lost':'foreign-conflict', public:true,
      text:`Capitale prise : ${nationName(map,event.attacker)} s’empare de ${where} et pille ${safeNum(event.amount)} or du trésor de ${nationName(map,event.defender)} (${Math.round((event.rate ?? RULES.capitalPlunderRate)*100)} %).` };
    case 'elimination': return { priority:4, type:'ÉLIMINATION', category: event.nationId===playerNationId?'lost':'foreign-conflict', public:true, text:`${nationName(map,event.nationId)} n’a plus aucune province : la nation est éliminée.` };
    case 'field-battle': return { priority:3, type: involved && playerNationId !== null ? 'COMBAT' : 'AFFRONTEMENT', category: involved && playerNationId !== null ? 'combat' : 'foreign-conflict', public:true,
      text:`Affrontement en rase campagne entre ${nationName(map,event.attacker)} et ${nationName(map,event.defender)}, entre ${provinceDef(map,event.fromId)?.name || '?'} et ${where} : les deux armées se sont croisées.${lossDetails()}` };
    case 'attack-cancelled': return { priority:2, type:'ORDRE ANNULÉ', category:'neutral', text: event.reason === 'target-changed' ? `Attaque vers ${where} annulée : la province a changé de main avant l’arrivée des troupes, qui rentrent à ${provinceDef(map,event.fromId)?.name || 'leur base'}.` : `Attaque vers ${where} annulée : la province de départ ${provinceDef(map,event.fromId)?.name || ''} est tombée avant le départ des troupes.` };
    case 'production-lost': return { priority:2, type:'production', category:'lost', text:`Production perdue à ${where} (province prise) : ${RULES.units[event.productionType]?.label || ({bank:'banque',factory:'usine',fort:'forteresse',port:'port'})[event.productionType] || 'commande'} annulée, ${safeNum(event.refund)} or remboursés.` };
    case 'retreat-lost': return { priority:2, type:'COMBAT', category:'lost', text:`Les survivants d’une attaque n’ont pas pu se replier (province de départ perdue) : ${safeNum(event.amount)} unités perdues.` };
    case 'ceasefire-offer': return {priority:2,type:'DIPLOMATIE',category:'blue',text:event.accepted?`Cessez-le-feu accepté par ${nationName(map,event.target)} contre ${safeNum(event.amount)} or, versés à ${nationName(map,event.target)}.`:`Cessez-le-feu refusé par ${nationName(map,event.target)} ; aucun paiement n’a été débité.`};
    case 'war-chest': return { priority:2,type:'économie',category:'neutral',text:`Trésor de guerre reçu après la prise de ${where} : +${safeNum(event.amount)}.` };
    case 'diplomacy': return { priority:2,type:'diplomatie',category:'blue',text:event.relation==='war'?(event.reason==='combat'?`${nationName(map,event.nationId)} attaque ${nationName(map,event.target)} : les deux nations sont désormais en guerre.`:`${nationName(map,event.nationId)} et ${nationName(map,event.target)} sont désormais en guerre.`):`Relation modifiée entre ${nationName(map,event.nationId)} et ${nationName(map,event.target)}.` };
    case 'diplomatic-action': return { priority:2,type:'DIPLOMATIE',category:'blue',text:event.action==='tribute'?`Ancien transfert diplomatique V4 de ${safeNum(event.amount)} or effectué au profit de ${nationName(map,event.target)}.`:`${({war:'Déclaration de guerre',alliance:'Proposition d’alliance',ceasefire:'Proposition de cessez-le-feu'})[event.action] || 'Action diplomatique'} résolue avec ${nationName(map,event.target)}.` };
    case 'production-complete': return { priority:1,type:'production',category:'neutral',text:`${safeNum(event.amount)} ${RULES.units[event.productionType]?.label || (event.productionType==='bank'?'banque':event.productionType==='factory'?'usine':event.productionType==='fort'?'forteresse':event.productionType==='port'?'port':'élément')} terminé(s) à ${where}.` };
    case 'project-started': return { priority:1,type:'production',category:'neutral',text:`Projet lancé : ${RULES.units[event.productionType]?.label || ({bank:'banque',factory:'usine',fort:'forteresse',port:'port'})[event.productionType] || 'construction'} à ${where}.` };
    case 'movement': return { priority:1,type:'déplacement',category:'neutral',text:`Mouvement vers ${provinceDef(map,event.toId)?.name || 'lieu inconnu'} effectué.` };
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
  const priority = new Set(['battle','conquest','field-battle','diplomacy','diplomatic-action','ceasefire-offer','war-chest','capital-plunder','elimination','attack-cancelled','production-lost','retreat-lost']);
  const entries = aggregateEntries(state.events.slice(fromIndex).filter(e => priority.has(e.type) && eventKnownToPlayer(state,map,e)).map(e => journalEntry(e,map,state.playerNationId)).filter(Boolean)).sort((a,b)=>b.priority-a.priority);
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
export function resolveInterturn(state, map, { random = () => seededRandom(state) } = {}) {
  const fromIndex = state.lastJournalEventIndex || 0;
  // AI makes plans during the planning phase, before any order is resolved.
  planAIOrders(state,map);
  const locked = (state.orders || []).filter(o=>o.status==='pending').map(o=>({...o,units:o.units?{...o.units}:undefined}));
  state.turnPhase='locking-orders';
  state.lockedOrders = locked;
  state.turnPhase='resolving-inter-turn';
  const fought = new Set(); // provinces où un combat a eu lieu ce tour (pas de guérison)
  aggregateMoves(state,map,locked,fought);
  resolveDiplomacy(state,locked,random);
  resolveProjects(state,locked);
  resolveTransports(state,fought);
  healProvinces(state,fought);
  updateEliminations(state);
  for (const id of Object.keys(state.nations)) state.nations[id].treasury += incomeFor(state,id);
  state.orders = []; state.lockedOrders = [];
  buildPermanentJournal(state,map,fromIndex);
  buildTurnJournal(state,map,fromIndex);
  state.turn++;
  state.events.push({ turn:state.turn,type:'turn-start' });
  state.turnPhase='planning';
  return state;
}
export const nextTurn = resolveInterturn;
export const adviserText = (state, role) => role==='finance' ? (state.nations[state.playerNationId].treasury<40?'Nos caisses sont basses.':'Le trésor reste disponible pour investir.') : 'Les frontières doivent être surveillées.';
