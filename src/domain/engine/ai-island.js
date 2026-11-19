// Moteur — V16.2 : l'IA et l'île mystérieuse (docs/V16-cahier-des-charges.md, section V16.2). Module PUR.
//
//   - Elle la convoite (point stratégique, super banque +10) dès que SA simulation du combat dit qu'elle la prend : même
//     fonction que pour tout débarquement (aiAttackSlice : garnison visible × marge), marge RULES.mysteryIsland.aiMargin
//     au moins. Contre un propriétaire nation : seulement une nation qu'elle est prête à attaquer ce tour (ses cibles).
//   - Elle s'y installe : les troupes débarquées restent ; elle y renvoie des renforts quand la garnison tombe sous
//     RULES.mysteryIsland.aiMinGarrison ; elle n'en part jamais avec plus de (1 − aiKeepShare) de ses troupes (ai.js).
//   - Elle l'utilise comme base de débarquement : l'île est un point de port à elle, d'où partent les débarquements
//     ordinaires (ai-naval.js) vers les 5 nations.
//   - Seule, elle ne suffit pas, mais avec un allié IA oui : elle lui demande « Prends l'île avec moi » (demande d'aide
//     ordinaire, kind 'island', alliances.js). Accord obtenu : elle embarque dès que les deux armées réunies suffisent ;
//     l'allié embarque le même tour (aiIslandHelpers), les deux débarquent ensemble : prise à deux (battles.js).
//   - Rassemblement : en paix, si l'armée réunie de son île suffirait à moitié (RULES.ai.stagingFactor), elle masse ses
//     troupes sur le point de port relié à l'île.
import { activeHelpPacts, helpPacts, queueHelpRequest } from '../alliances.js';
import { combatValue, mergeForce, normalizeForce, provinceForce, resolveCombat, scaleForce } from '../combat.js';
import { LAND_UNIT_TYPES, RULES } from '../constants.js';
import { aliveNations } from '../leaders.js';
import { MYSTERY_ISLAND_ID, isMysteryIsland } from '../mystery-island.js';
import { garrisonForce } from '../passage.js';
import { aiAttackSlice, aiMemory, holds } from './ai.js';
import { landThreatForce, navalThreat } from './ai-naval.js';
import { recentTruce } from './diplomacy.js';
import { availableForces, queueMoveOrder } from './orders.js';
import { seaDestinations } from './sea-routes.js';
import { pairTreaty, pairWar } from './shared.js';

const MI = RULES.mysteryIsland;
const ASK_EVERY = 6; // tours entre deux demandes « Prends l'île avec moi » au même allié
const unitsOf = (available, share) => Object.fromEntries(LAND_UNIT_TYPES.map(k => [k, Math.floor((available[k] || 0) * share)]));
const anyUnits = units => LAND_UNIT_TYPES.some(k => units[k] > 0);
const pendingTo = (state, nationId, toId) => (state.orders || []).some(o => o.kind === 'move' && o.status === 'pending' && o.nationId === nationId && o.toId === toId);
const sailingTo = (state, nationId, toId) => (state.transports || []).some(t => t.nationId === nationId && t.toId === toId && !t.returning);

/** Points de port de `nationId` d'où part une route vers l'île (le plus garni d'abord) : [{ id, via, turns }]. */
export function islandLaunchPoints(state, map, nationId) {
  return map.provinces.filter(d => state.provinces[d.id]?.ownerId === nationId && !isMysteryIsland(d.id))
    .flatMap(d => seaDestinations(map, d.id).filter(x => x.id === MYSTERY_ISLAND_ID).map(x => ({ id: d.id, via: x.via, turns: x.turns })))
    .sort((a, b) => combatValue({ units: availableForces(state, b.id) }) - combatValue({ units: availableForces(state, a.id) }) || a.id.localeCompare(b.id));
}
/** Escorte : les navires disponibles si une flotte ennemie peut frapper sur la route, sinon aucun. null : route dangereuse sans navire. */
function escortFor(state, map, nationId, from) {
  if (!navalThreat(state, nationId, from.id, from.via, map)) return 0;
  const ships = availableForces(state, from.id).warships;
  return ships > 0 ? ships : null;
}
/** Garde de quoi tenir chez soi face au voisin terrestre hostile le plus fort. */
function keepsHome(state, map, nationId, fromId, units) {
  const threat = landThreatForce(map, state, nationId, fromId);
  if (!threat) return true;
  const p = state.provinces[fromId];
  const kept = normalizeForce({ units: Object.fromEntries(LAND_UNIT_TYPES.map(k => [k, Math.max(0, (p.units[k] || 0) - (units[k] || 0))])) });
  return holds(kept, threat, p.buildings?.fort || 0);
}
/** La simulation dit-elle que `force` prend l'île (garnison complète, alliés stationnés compris, × marge) ? */
function takesIsland(state, force, margin) {
  const defense = scaleForce(garrisonForce(state, MYSTERY_ISLAND_ID), Math.max(1, margin));
  return resolveCombat({ attacker: force, defender: defense, mode: 'landing' }).captured;
}

/**
 * Ordres de `nationId` pour l'île, pendant son plan (après la diplomatie, avant sa flotte). `targets` : nations qu'elle
 * est prête à attaquer ce tour ; `threshold` : sa marge d'attaque (caractère + niveau).
 */
export function aiIslandOrders(state, map, nationId, targets, threshold) {
  const island = state.provinces[MYSTERY_ISLAND_ID];
  if (!island) return;
  const owner = island.ownerId, mem = aiMemory(state, nationId);
  if (owner === nationId) { reinforceIsland(state, map, nationId); return; }
  if (owner && (pairTreaty(state, nationId, owner, 'alliance') || !targets.has(owner) || recentTruce(state, nationId, owner))) return;
  if (pendingTo(state, nationId, MYSTERY_ISLAND_ID) || sailingTo(state, nationId, MYSTERY_ISLAND_ID)) return;
  const points = islandLaunchPoints(state, map, nationId);
  if (!points.length) return;
  const margin = Math.max(threshold, MI.aiMargin);
  // 1. Seule : la plus petite part de ses forces qui prend l'île en simulation.
  for (const from of points) {
    const warships = escortFor(state, map, nationId, from);
    if (warships === null) continue;
    const units = aiAttackSlice(state, map, nationId, from.id, MYSTERY_ISLAND_ID, margin, 'landing', warships, from.via);
    if (units && queueMoveOrder(state, map, { nationId, fromId: from.id, toId: MYSTERY_ISLAND_ID, units, warships }).ok) { mem.islandTry = state.turn; return; }
  }
  // 2. Avec un allié IA : accord déjà obtenu → on embarque si les deux armées réunies suffisent (l'allié suit le même tour).
  const from = points[0], warships = escortFor(state, map, nationId, from);
  if (warships === null) return;
  const mine = unitsOf(availableForces(state, from.id), RULES.ai.attackShares.at(-1));
  if (!anyUnits(mine) || !keepsHome(state, map, nationId, from.id, mine)) return;
  const myForce = normalizeForce({ units: { ...mine, warship: warships } });
  const allies = aliveNations(state).filter(n => n !== nationId && pairTreaty(state, nationId, n, 'alliance') && state.controllers?.[n] === 'ai' && n !== owner);
  const allyForce = ally => { const p = islandLaunchPoints(state, map, ally)[0]; return p ? normalizeForce({ units: unitsOf(availableForces(state, p.id), .7) }) : null; };
  const agreed = allies.find(a => helpPacts(state).some(p => p.kind === 'island' && p.ally === a && p.requester === nationId && !p.fake && p.until >= state.turn));
  if (agreed) {
    const theirs = allyForce(agreed);
    if (theirs && takesIsland(state, mergeForce(myForce, theirs), margin) && queueMoveOrder(state, map, { nationId, fromId: from.id, toId: MYSTERY_ISLAND_ID, units: mine, warships }).ok) { mem.islandTry = state.turn; return; }
  } else if (state.turn - (mem.islandAsk ?? -99) >= ASK_EVERY && !(state.orders || []).some(o => o.kind === 'help' && o.status === 'pending' && o.nationId === nationId)) {
    // Demande « Prends l'île avec moi » à l'allié dont l'armée, ajoutée à la sienne, suffirait.
    const ally = allies.find(a => { const f = allyForce(a); return f && takesIsland(state, mergeForce(myForce, f), margin); });
    if (ally && queueHelpRequest(state, { from: nationId, to: ally, kind: 'island' }).ok) { mem.islandAsk = state.turn; return; }
  }
  // 3. Rassemblement, en paix seulement : l'armée de l'île converge vers le point de port relié à l'île mystérieuse.
  if (aliveNations(state).some(n => n !== nationId && pairWar(state, nationId, n))) return;
  if ((state.orders || []).some(o => o.kind === 'move' && o.status === 'pending' && o.nationId === nationId && (o.staging || o.fromId === from.id))) return;
  const donor = (map.provinces.find(d => d.id === from.id)?.landConnections || []).filter(id => state.provinces[id]?.ownerId === nationId)
    .sort((a, b) => combatValue(provinceForce(state.provinces[b])) - combatValue(provinceForce(state.provinces[a])) || a.localeCompare(b))[0];
  if (!donor) return;
  const moved = unitsOf(availableForces(state, donor), .6);
  if (!anyUnits(moved) || !keepsHome(state, map, nationId, donor, moved)) return;
  const gathered = normalizeForce({ units: Object.fromEntries(LAND_UNIT_TYPES.map(k => [k, (mine[k] || 0) + moved[k]])) });
  if (!takesIsland(state, gathered, Math.max(RULES.ai.stagingFactor, margin * RULES.ai.stagingFactor))) return;
  const r = queueMoveOrder(state, map, { nationId, fromId: donor, toId: from.id, units: moved });
  if (r.ok) state.orders.find(o => o.id === r.orderId).staging = MYSTERY_ISLAND_ID;
}
/** Propriétaire de l'île : renforts depuis le point de port relié quand la garnison est trop faible. */
function reinforceIsland(state, map, nationId) {
  if (combatValue(garrisonForce(state, MYSTERY_ISLAND_ID)) >= combatValue({ units: { infantry: MI.aiMinGarrison } })) return;
  if (pendingTo(state, nationId, MYSTERY_ISLAND_ID) || sailingTo(state, nationId, MYSTERY_ISLAND_ID)) return;
  for (const from of islandLaunchPoints(state, map, nationId)) {
    const warships = escortFor(state, map, nationId, from);
    if (warships === null) continue;
    const units = unitsOf(availableForces(state, from.id), .4);
    if (!anyUnits(units) || combatValue({ units }) < combatValue({ units: { infantry: 40 } }) || !keepsHome(state, map, nationId, from.id, units)) continue;
    if (queueMoveOrder(state, map, { nationId, fromId: from.id, toId: MYSTERY_ISLAND_ID, units, warships }).ok) return;
  }
}
/**
 * Après le plan de toutes les IA : un allié IA engagé par « Prends l'île avec moi » (accord tenu, pas un Traître)
 * embarque vers l'île le même tour que le demandeur (joueur ou IA), pour que les deux débarquent ensemble.
 */
export function aiIslandHelpers(state, map) {
  if (!state.provinces[MYSTERY_ISLAND_ID]) return;
  for (const ally of aliveNations(state).filter(n => state.controllers?.[n] === 'ai')) {
    for (const pact of activeHelpPacts(state, ally).filter(p => p.kind === 'island')) {
      const owner = state.provinces[MYSTERY_ISLAND_ID].ownerId;
      if (owner === ally || owner === pact.requester || (owner && pairTreaty(state, ally, owner, 'alliance'))) continue;
      const requesterGoes = (state.orders || []).some(o => o.kind === 'move' && o.status === 'pending' && o.nationId === pact.requester && o.toId === MYSTERY_ISLAND_ID && !o.passage);
      if (!requesterGoes || pendingTo(state, ally, MYSTERY_ISLAND_ID)) continue;
      for (const from of islandLaunchPoints(state, map, ally)) {
        const warships = escortFor(state, map, ally, from);
        if (warships === null) continue;
        const units = unitsOf(availableForces(state, from.id), .7);
        if (!anyUnits(units) || !keepsHome(state, map, ally, from.id, units)) continue;
        const r = queueMoveOrder(state, map, { nationId: ally, fromId: from.id, toId: MYSTERY_ISLAND_ID, units, warships });
        if (r.ok) { state.orders.find(o => o.id === r.orderId).help = true; break; }
      }
    }
  }
}
