import { RULES, LAND_UNIT_TYPES } from './constants.js';

const sum = units => LAND_UNIT_TYPES.reduce((n, k) => n + (Number(units?.[k]) || 0), 0);
const provinceDef = (map, id) => map.provinces.find(p => p.id === id);
const safeNum = n => Number.isFinite(Number(n)) ? Number(n) : 0;
const nationName = (map, id) => map.nations.find(n => n.id === id)?.short || 'Nation inconnue';
const pairWar = (state, a, b) => state.diplomacy.wars.some(w => w.active !== false && w.participants.includes(a) && w.participants.includes(b));
const pairTreaty = (state, a, b, type) => state.diplomacy.treaties.some(t => t.active !== false && t.type === type && t.parties.includes(a) && t.parties.includes(b));
const reservedDiplomaticFunds = (state, nationId) => (state.orders || []).filter(o => o.kind === 'diplomacy' && o.action === 'ceasefire' && o.nationId === nationId && o.status === 'pending').reduce((n,o)=>n+(o.amount||0),0);
export const spendableTreasury = (state, nationId) => Math.max(0,(state.nations[nationId]?.treasury||0)-reservedDiplomaticFunds(state,nationId));

export const incomeFor = (state, nationId) => Object.values(state.provinces).filter(p => p.ownerId === nationId).reduce((n, p) => n + RULES.baseIncome + (p.buildings.bank || 0) * RULES.bankIncome + (p.buildings.factory || 0) * RULES.factoryIncome, 0);
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
export function queueConstruction(state, { nationId, provinceId, type }) {
  const p = state.provinces[provinceId], r = RULES.buildings[type];
  if (!p || p.ownerId !== nationId) return { ok: false, error: 'Province non contrôlée' };
  if (!r) return { ok: false, error: 'Construction indisponible' };
  if (type === 'port' && !p.portSite) return { ok: false, error: 'Cette province ne peut pas accueillir de port' };
  const active = (state.productionQueue || []).filter(q => q.kind === 'building' && q.provinceId === provinceId && q.type === type).length;
  const pending = (state.orders || []).filter(o => o.kind === 'construction' && o.provinceId === provinceId && o.type === type && o.status === 'pending').length;
  if (type === 'fort' && (p.buildings.fort || 0) + active + pending >= 3) return { ok: false, error: 'Forteresse au niveau maximum' };
  if (type === 'port' && ((p.buildings.port || 0) + active + pending)) return { ok: false, error: 'Un port existe ou est déjà en construction' };
  const cost = type === 'fort' ? r.costs[(p.buildings.fort || 0) + active + pending] : r.cost;
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
  state.diplomacy.treaties = state.diplomacy.treaties.filter(t => !(t.parties?.includes(attacker) && t.parties?.includes(defender)));
  state.diplomacy.wars.push({ active: true, participants: [attacker, defender], started: state.turn });
  state.events.push({ turn: state.turn, type: 'diplomacy', nationId: attacker, target: defender, relation: 'war', reason: 'combat' });
}
function battle(state, toId, attacker, units, warships = 0, naval = false, originIds = []) {
  const target = state.provinces[toId], defender = target.ownerId;
  if (!defender || defender === attacker) return { ok: false, error: 'La cible n’est plus ennemie' };
  ensureWar(state, attacker, defender);
  const beforeDef = sum(target.units) + (target.warships || 0), beforeAtk = sum(units) + warships;
  const def = landPower(target.units, true) * RULES.fortDefense[target.buildings.fort || 0] + (target.warships || 0) * RULES.units.warship.power;
  const atk = naval ? navalPower({ units, warships, transport: true }) : landPower(units), ratio = atk / Math.max(1, def);
  if (ratio > 1.08) {
    target.ownerId = attacker;
    for (const k of LAND_UNIT_TYPES) target.units[k] = Math.max(0, Math.floor((units[k] || 0) * (1 - Math.min(.8, 1 / Math.max(1.1, ratio) * .55))));
    target.warships = Math.max(0, Math.floor(warships * .7));
    const attackerLosses = beforeAtk - (sum(target.units) + target.warships);
    state.events.push({ turn: state.turn, type: 'conquest', attacker, defender, newOwnerId:attacker, provinceId: toId, originIds:[...originIds], naval, attackerLosses, defenderLosses: beforeDef });
    const capitalId = state.nations[defender]?.capitalId;
    if (capitalId === toId && !state.warChestsClaimed[toId]) { state.warChestsClaimed[toId] = true; state.nations[attacker].treasury += RULES.warChestAmount; state.events.push({ turn: state.turn, type: 'war-chest', attacker, defender, provinceId: toId, amount: RULES.warChestAmount }); }
    return { ok: true, victory: true, ratio, attackerLosses, defenderLosses: beforeDef };
  }
  for (const k of LAND_UNIT_TYPES) target.units[k] = Math.max(0, Math.floor(target.units[k] * (1 - Math.min(.65, ratio * .35))));
  const defenderLosses = beforeDef - (sum(target.units) + target.warships);
  state.events.push({ turn: state.turn, type: 'battle', attacker, defender, provinceId: toId, originIds:[...originIds], naval, attackerLosses: beforeAtk, defenderLosses });
  return { ok: true, victory: false, ratio, attackerLosses: beforeAtk, defenderLosses };
}

function consumeOrderForces(state, order) {
  const p = state.provinces[order.fromId], units = {};
  if (!p || p.ownerId !== order.nationId) return { units:Object.fromEntries(LAND_UNIT_TYPES.map(k=>[k,0])), warships:0 };
  for (const k of LAND_UNIT_TYPES) { units[k] = Math.min(p.units[k] || 0, order.units[k] || 0); p.units[k] -= units[k]; }
  const ships = Math.min(p.warships || 0, order.warships || 0); p.warships -= ships;
  return { units, warships: ships };
}
function aggregateMoves(state, map, orders) {
  const groups = new Map();
  for (const o of orders.filter(x => x.kind === 'move')) {
    const key = `${o.toId}|${o.nationId}|${o.routeType}`;
    if (!groups.has(key)) groups.set(key, { toId: o.toId, nationId: o.nationId, routeType: o.routeType, sources: [] });
    groups.get(key).sources.push(o);
  }
  const list = [...groups.values()].sort((a, b) => a.toId.localeCompare(b.toId) || a.nationId.localeCompare(b.nationId) || a.routeType.localeCompare(b.routeType));
  // Friendly transfers are applied before attacks. A target gets at most one battle per inter-turn;
  // attacks from the same nation against it converge into one combined force.
  for (const g of list.filter(x => state.provinces[x.toId]?.ownerId === x.nationId)) for (const o of g.sources.sort((a,b)=>a.fromId.localeCompare(b.fromId))) {
    const force = consumeOrderForces(state, o), target = state.provinces[g.toId];
    if (g.routeType === 'sea') state.transports.push({ nationId: o.nationId, fromId: o.fromId, toId: o.toId, ...force, status: 'embarking', remaining: 1 });
    else { for (const k of LAND_UNIT_TYPES) target.units[k] += force.units[k]; target.warships += force.warships; }
    state.events.push({ turn: state.turn, type: 'movement', nationId: o.nationId, fromId: o.fromId, toId: o.toId, amount: sum(force.units) + force.warships });
  }
  const contested = new Set();
  for (const g of list.filter(x => state.provinces[x.toId]?.ownerId !== x.nationId)) {
    const defender = state.provinces[g.toId]?.ownerId;
    if (!defender || contested.has(g.toId)) continue;
    const forces = g.sources.sort((a,b)=>a.fromId.localeCompare(b.fromId)).map(o => ({ o, force: consumeOrderForces(state, o) }));
    const combined = Object.fromEntries(LAND_UNIT_TYPES.map(k => [k, forces.reduce((n,x)=>n+x.force.units[k],0)]));
    const ships = forces.reduce((n,x)=>n+x.force.warships,0);
    if (g.routeType === 'sea') {
      for (const {o,force} of forces) state.transports.push({ nationId:o.nationId,fromId:o.fromId,toId:o.toId,...force,status:'embarking',remaining:1 });
    } else { battle(state, g.toId, g.nationId, combined, ships, false, forces.map(x=>x.o.fromId)); contested.add(g.toId); }
  }
  for (const o of orders.filter(x => x.kind === 'move')) state.ai?.replay?.push({ turn: state.turn, nationId: o.nationId, action: 'move', target: o.toId });
}

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
    state.productionQueue.push({ kind: o.kind === 'construction' ? 'building' : 'unit', type: o.type, provinceId: o.provinceId, nationId: o.nationId, amount: o.amount || 1, remaining: o.duration });
    state.events.push({ turn: state.turn, type: 'project-started', kind: o.kind, productionType: o.type, provinceId: o.provinceId, nationId: o.nationId, amount: o.amount || 1 });
  }
  for (const q of state.productionQueue) q.remaining--;
  for (const q of state.productionQueue.filter(x => x.remaining <= 0)) {
    const p = state.provinces[q.provinceId];
    if (p) {
      if (q.kind === 'building') p.buildings[q.type] = (p.buildings[q.type] || 0) + 1;
      else if (q.type === 'warship') p.warships = (p.warships || 0) + q.amount;
      else p.units[q.type] = (p.units[q.type] || 0) + q.amount;
      state.events.push({ turn: state.turn, type: 'production-complete', kind: q.kind, productionType: q.type, provinceId: q.provinceId, nationId: q.nationId, amount: q.amount || 1 });
    }
  }
  state.productionQueue = state.productionQueue.filter(q => q.remaining > 0);
}
function resolveTransports(state) {
  for (const t of state.transports) {
    if (t.status === 'embarking') { t.status = 'at-sea'; t.remaining = 1; continue; }
    t.remaining--;
    if (t.remaining > 0) continue;
    const to = state.provinces[t.toId];
    if (to.ownerId === t.nationId) { for (const k of LAND_UNIT_TYPES) to.units[k] += t.units[k]; to.warships += t.warships; }
    else battle(state, t.toId, t.nationId, t.units, t.warships, true, [t.fromId]);
    t.status = 'arrived';
  }
  state.transports = state.transports.filter(t => t.status !== 'arrived');
}

function aiPlan(state, map, nationId) {
  const owned = map.provinces.filter(p => state.provinces[p.id].ownerId === nationId);
  if (!owned.length) return;
  const factory = owned.find(p => state.provinces[p.id].buildings.factory);
  const source = factory || owned[0];
  if (!factory && state.nations[nationId].treasury >= RULES.buildings.factory.cost) queueConstruction(state, { nationId, provinceId:source.id, type:'factory' });
  const bankProvince = owned.find(p => !state.provinces[p.id].buildings.bank && p.id !== source.id);
  if (bankProvince && state.nations[nationId].treasury >= RULES.buildings.bank.cost) queueConstruction(state, { nationId, provinceId:bankProvince.id, type:'bank' });
  if (state.nations[nationId].treasury >= RULES.units.infantry.cost) queueRecruitment(state, { nationId, provinceId: source.id, type: factory && state.turn % 3 === 0 ? 'armor' : 'infantry' });
  const trait=state.ai.traits?.[nationId]||'prudent';
  const threshold=({offensif:1.08,impulsif:.92,prudent:1.3,fidele:1.45})[trait]||1.25;
  const attacks = owned.flatMap(p => legalDestinations(map, state, p.id).filter(d => {
    const target=state.provinces[d.id],owner=target?.ownerId;
    return owner&&owner!==nationId&&d.type==='land'&&!pairTreaty(state,nationId,owner,'alliance')&&!pairTreaty(state,nationId,owner,'ceasefire');
  }).map(d => ({ from:p, to:d.id, owner:state.provinces[d.id].ownerId, atWar:pairWar(state,nationId,state.provinces[d.id].ownerId) })));
  attacks.sort((a,b)=>Number(b.atWar)-Number(a.atWar)||Number(a.owner===state.playerNationId)-Number(b.owner===state.playerNationId)||a.to.localeCompare(b.to));
  const pick = attacks.find(x => landPower(availableForces(state, x.from.id)) > landPower(state.provinces[x.to].units, true) * (x.atWar?Math.max(.85,threshold-.2):threshold));
  if (pick) {
    const available = availableForces(state, pick.from.id), units = Object.fromEntries(LAND_UNIT_TYPES.map(k => [k, Math.floor(available[k] * .35)]));
    queueMoveOrder(state, map, { nationId, fromId:pick.from.id, toId:pick.to, units });
  }
}
export function planAIOrders(state, map) {
  state.ai ||= { memories:{}, replay:[], traits:{} };
  if (state.ai.plannedTurn === state.turn) return state.orders.filter(o => o.nationId !== state.playerNationId);
  for (const id of Object.keys(state.nations).sort()) if (state.controllers[id] === 'ai') aiPlan(state,map,id);
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
  if (event.type === 'conquest') return true; // World owner changes are public; combat detail remains filtered.
  if (event.provinceId && state.provinces[event.provinceId]?.ownerId === player) return true;
  if (!event.provinceId) return event.type === 'diplomatic-action' && [event.nationId,event.target].includes(player);
  return map.provinces.some(p => state.provinces[p.id].ownerId === player && (state.provinces[p.id].units.balloon || 0) > 0 && p.landConnections.includes(event.provinceId));
}
function eventDirectlyInvolvesPlayer(state, event) {
  const player=state.playerNationId;
  return [event.attacker,event.defender,event.nationId,event.target,event.newOwnerId].includes(player);
}
export function journalEntry(event, map, playerNationId = null) {
  const def = event.provinceId ? provinceDef(map, event.provinceId)?.name : null;
  const where = def || 'lieu inconnu';
  const origins=(event.originIds||[]).map(id=>provinceDef(map,id)?.name).filter(Boolean);
  const route=origins.length?` depuis ${origins.join(', ')} vers ${where}`:` à ${where}`;
  const losses=`Pertes : attaquant ${safeNum(event.attackerLosses)}, défenseur ${safeNum(event.defenderLosses)}.`;
  switch (event.type) {
    case 'battle': return { priority:3,type:'COMBAT',category:'combat',text:`Attaquant : ${nationName(map,event.attacker)}. Défenseur : ${nationName(map,event.defender)}. Province : ${where}. Combat${origins.length?` depuis ${origins.join(', ')}`:''} : la défense tient, sans changement de souveraineté. ${losses}` };
    case 'conquest': {
      const attacker=event.attacker,defender=event.defender;
      const type=attacker===playerNationId?'CONQUÊTE':defender===playerNationId?'TERRITOIRE PERDU':'CONFLIT ÉTRANGER';
      const result=type==='CONQUÊTE'?`${nationName(map,attacker)} prend le contrôle de ${where}`:type==='TERRITOIRE PERDU'?`${nationName(map,attacker)} prend ${where} au joueur`:`${nationName(map,attacker)} prend ${where} à ${nationName(map,defender)}`;
      return {priority:4,type,category:type==='CONQUÊTE'?'conquest':type==='TERRITOIRE PERDU'?'lost':'foreign-conflict',text:`Attaquant : ${nationName(map,attacker)}. Défenseur : ${nationName(map,defender)}. Province : ${where}. Résultat : ${result}. ${losses}`};
    }
    case 'ceasefire-offer': return {priority:2,type:'DIPLOMATIE',category:'blue',text:event.accepted?`Cessez-le-feu accepté par ${nationName(map,event.target)} contre ${safeNum(event.amount)} or.`:`Cessez-le-feu refusé par ${nationName(map,event.target)} ; aucun paiement n’a été débité.`};
    case 'war-chest': return { priority:2,type:'économie',category:'neutral',text:`Trésor de guerre reçu après la prise de ${where} : +${safeNum(event.amount)}.` };
    case 'diplomacy': return { priority:2,type:'diplomatie',category:'blue',text:event.relation==='war'?`${nationName(map,event.nationId)} et ${nationName(map,event.target)} sont désormais en guerre.`:`Relation modifiée entre ${nationName(map,event.nationId)} et ${nationName(map,event.target)}.` };
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
  const priority = new Set(['battle','conquest','diplomacy','diplomatic-action','ceasefire-offer','war-chest']);
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
  aggregateMoves(state,map,locked);
  resolveDiplomacy(state,locked,random);
  resolveProjects(state,locked);
  resolveTransports(state);
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
