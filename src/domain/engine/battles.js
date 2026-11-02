// Moteur — déplacements et combats simultanés, prises de province, retraites.

import { fortBonusFactor, navalBonusFactor } from '../boosts.js';
import {
  COMBAT_TYPES, fortReductionPct, legacyForce, mergeForce, normalizeForce, provinceForce, resolveBattle,
  resolveCombat, splitForce, totalHp, writeProvinceForce
} from '../combat.js';
import { LAND_UNIT_TYPES, RULES } from '../constants.js';
import { recordStrike } from '../leaders.js';
import { addStationed, guestsAt, hasPassage, setStationedForce, stationedAt, takeStationed } from '../passage.js';
import { rememberGarrison } from './ai.js';
import { fortBreach } from './bombard.js';
import { embark } from './convoys.js';
import { autoWar, ensureWar } from './diplomacy.js';
import { pairTreaty, pairWar } from './shared.js';

// --- V10 : déplacements et combats simultanés ------------------------------------------------------------
export const lossCount = byType => COMBAT_TYPES.reduce((n, k) => n + (byType?.[k] || 0), 0);
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
export const addToProvince = (p, force) => writeProvinceForce(p, mergeForce(provinceForce(p), force));
const queueItemCost = q => Number.isFinite(q.cost) ? q.cost : q.kind === 'building'
  ? (q.type === 'fort' ? RULES.buildings.fort.costs[0] : RULES.buildings[q.type]?.cost || 0)
  : Math.round((RULES.units[q.type]?.cost || 0) * (q.amount || 0) / (RULES.units[q.type]?.amount || 1));

/** Province qui change de main : production annulée et remboursée (B4), pillage de capitale (V10). */
function onCapture(state, provinceId, newOwner, oldOwner) {
  const capital = state.nations[oldOwner]?.capitalId === provinceId;
  if (capital) {
    let chest = 0;
    if (!state.warChestsClaimed[provinceId]) { state.warChestsClaimed[provinceId] = true; chest = RULES.warChestAmount; state.nations[newOwner].treasury += RULES.warChestAmount;
      state.events.push({ turn: state.turn, type: 'war-chest', attacker: newOwner, defender: oldOwner, provinceId, amount: RULES.warChestAmount }); }
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
export function refundProduction(state, q, provinceId) {
  const amount = queueItemCost(q);
  if (state.nations[q.nationId]) state.nations[q.nationId].treasury += amount;
  state.events.push({ turn: state.turn, type: 'production-lost', nationId: q.nationId, provinceId, productionType: q.type, kind: q.kind, refund: amount });
}

/**
 * Un affrontement dans une province : tous les groupes attaquants (une entrée par nation) contre la garnison.
 * groups : [{ nationId, force, originIds:[...], mode:'land'|'landing', retreatTo:[...] }]
 * Renvoie la liste des replis (survivants des attaquants non vainqueurs), appliqués par l'appelant.
 */
export function fight(state, toId, groups, fought, { naval = false } = {}) {
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
  const breach = fortBreach(state, toId); // V14.4 : forteresse bombardée (ce tour ou avant, pas encore réparée)
  const res = resolveBattle({ defender: before, attackers: groups.map(g => ({ id: g.nationId, force: g.force, mode: g.mode, warshipFactor: navalBonusFactor(state, g.nationId) })), fortLevel: target.buildings.fort || 0,
    fortBonus: fortBonusFactor(state, defender), defenderWarshipFactor: navalBonusFactor(state, defender), fortBreach: breach });
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
    passes: res.passes.length, fortLevel: target.buildings.fort || 0, ...(groups.some(g => g.mode === 'landing') ? { landingPct: Math.round(RULES.combat.landingPenalty * 100) } : {}), fortPct: fortReductionPct(target.buildings.fort || 0, fortBonusFactor(state, defender), breach),
    ...(breach && target.buildings.fort ? { fortBreach: breach } : {}),
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
export const unitCount = f => COMBAT_TYPES.reduce((n, k) => n + (f.units[k] || 0), 0);

/**
 * Résolution des ordres de déplacement, en trois temps (règle V10, documentée dans docs/V10-moteur.md) :
 *  0. Transferts amicaux et embarquements (ordres par mer, mécanique V9 inchangée) ;
 *  1. « Défense d'abord » : une province attaquée qui devait elle-même lancer une attaque se défend d'abord avec
 *     TOUTE sa garnison, contre les attaquants venus de provinces non attaquées ;
 *  2. Toutes les autres attaques partent en même temps. Une attaque dont l'origine est tombée en 1 est annulée
 *     sans combat ni déclaration de guerre (B1). Toutes les nations qui visent une même province combattent
 *     ensemble contre la garnison (B2) ; les combats d'une même vague sont indépendants de l'ordre de traitement.
 */
export function aggregateMoves(state, map, orders, fought) {
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
    for (const x of changed) { if (state.provinces[x.o.fromId]?.ownerId === x.o.nationId) addToProvince(state.provinces[x.o.fromId], x.force);
      else if (hasPassage(state, x.o.nationId, state.provinces[x.o.fromId]?.ownerId)) addStationed(state, x.o.nationId, x.o.fromId, x.force);
      state.events.push({ turn: state.turn, type: 'attack-cancelled', nationId: x.o.nationId, fromId: x.o.fromId, provinceId: toId, reason: 'target-changed' }); }
    retreats2.push(...fight(state, toId, group(here.filter(x => x.o.nationId !== target.ownerId && !changed.includes(x))), fought));
  }
  applyRetreats(state, retreats2);
  for (const o of moves) state.ai?.replay?.push({ turn: state.turn, nationId: o.nationId, action: 'move', target: o.toId });
}
export const emptyForceLocal = () => normalizeForce({});
