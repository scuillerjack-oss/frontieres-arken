// Moteur — convois, étapes en mer, interceptions, débarquements (docs/V10-marine.md).

import { navalBonusFactor } from '../boosts.js';
import {
  COMBAT_TYPES, legacyForce, mergeForce, provinceForce, resolveBattle, splitForce, toLegacy, writeProvinceForce
} from '../combat.js';
import { LAND_UNIT_TYPES, RULES } from '../constants.js';
import { addStationed, hasPassage } from '../passage.js';
import { addToProvince, emptyForceLocal, fight, lossCount, unitCount } from './battles.js';
import { isPortPoint, laneOf, seaDestinations, seaRoutesFrom, seaTravelTurns } from './sea-routes.js';
import { pairWar, provinceDef } from './shared.js';

// --- V10 marine : convois, étapes en mer, interceptions, débarquements (docs/V10-marine.md) -----------------
/** Convoi : { id, nationId, fromId, toId, via, stage, turns, units, warships, wounds }.
 *  stage = étapes déjà parcourues (0 au départ) ; arrivée quand stage = turns. Position sur la route : stage / turns. */
export function embark(state, map, o, force) {
  const route = seaDestinations(map, o.fromId).find(x => x.id === o.toId)
    || { via: o.via || o.toId, turns: o.turns || seaTravelTurns(laneOf(map, o.fromId, o.via || o.toId)?.length) };
  state.transportSequence = Math.max(1, Number(state.transportSequence) || 1);
  const id = `c${state.transportSequence++}`;
  state.transports.push({ id, nationId: o.nationId, fromId: o.fromId, toId: o.toId, via: route.via, lane: [o.fromId, route.via].sort().join('|'), stage: 0, turns: route.turns, departed: state.turn,
    truces: trucesOf(state, o.nationId), ...(o.navalStrike ? { strike: true } : {}), ...(o.passage ? { passage: true } : {}), ...(allyPortOf(state, o) ? { allyPort: allyPortOf(state, o) } : {}
    ), ...toLegacy(force) });
  state.events.push({ turn: state.turn, type: 'convoy-departed', nationId: o.nationId, fromId: o.fromId, toId: o.toId, convoyId: id, turns: route.turns, escort: force.units.warship, amount: unitCount(force) });
}
// V14.0 : convoi parti du port d'un allié (troupes stationnées qui rembarquent) : on retient l'allié, pour ne pas perdre
// le convoi si l'alliance est rompue pendant la traversée (voir rescueConvoy).
// V14.1 : trêves en cours au moment où le convoi lève l'ancre (pour reconnaître une trêve signée dans le même inter-tour,
// après son départ : le convoi fait alors demi-tour au lieu de débarquer).
const trucesOf = (state, nationId) => (state.diplomacy?.treaties || []).filter(t => t.active !== false && t.type === 'ceasefire' && t.parties?.includes(nationId)).map(t => t.parties.find(x => x !== nationId)).filter(Boolean).sort();
/** V14.1 : la trêve `truce` avec `owner` a-t-elle été signée après le départ du convoi `t` ? (ancien convoi sans `truces` : règle V13). */
function truceAfterDeparture(t, truce, owner) {
  const departed = Number.isFinite(t.departed) ? t.departed : -Infinity, started = truce.started ?? 0;
  if (departed < started) return true;
  return departed === started && Array.isArray(t.truces) && !t.truces.includes(owner);
}
const allyPortOf = (state, o) => { const owner = state.provinces[o.fromId]?.ownerId; return owner && owner !== o.nationId ? owner : null; };
const laneKey = t => t.lane || [t.fromId, t.via].sort().join('|');
const convoyAlive = t => COMBAT_TYPES.some(k => (k === 'warship' ? t.warships : t.units?.[k]) > 0);
const writeConvoy = (t, force) => Object.assign(t, toLegacy(force));
/** Combat naval : `attacker` (flotte ou convoi) contre le convoi `t`. Seuls les navires tirent ; la cargaison encaisse ×1,5. */
function navalClash(state, { attackerId, attackerForce, t, kind, provinceId }) {
  const res = resolveBattle({ defender: legacyForce(t), attackers: [{ id: attackerId, force: attackerForce, warshipFactor: navalBonusFactor(state, attackerId) }], naval: true, defenderWarshipFactor: navalBonusFactor(state, t.nationId) });
  const a = res.attackers[0];
  writeConvoy(t, res.defender);
  const destroyed = !convoyAlive(t);
  state.events.push({
    turn: state.turn, type: 'interception', kind, nationId: attackerId, attacker: attackerId, defender: t.nationId, target: t.nationId,
    provinceId, fromId: t.fromId, toId: t.toId, convoyId: t.id, escorted: legacyForce({ ...t, warships: t.warships + res.defenderLossesByType.warship }).units.warship > 0,
    attackerLosses: lossCount(a.lossesByType), defenderLosses: lossCount(res.defenderLossesByType),
    lossesByNation: { [attackerId]: a.lossesByType, [t.nationId]: res.defenderLossesByType }, convoyDestroyed: destroyed,
    ...(t.strike ? { strike: true, attackerLeft: a.force.units.warship } : {})
  });
  return a.force;
}
/**
 * Rencontres en mer, après l'avancée d'une étape :
 *  1. deux convois de nations en guerre sur la même route (dans un sens ou dans l'autre) se battent si l'un au
 *     moins a des navires de guerre ; ordre déterministe (identifiants de convoi) ;
 *  2. interception depuis le port d'arrivée : à sa dernière étape en mer (stage = turns − 1), un convoi est attaqué
 *     par les navires de guerre à quai dans la province au bout de la route (`via`) si elle a un port construit et
 *     appartient à une nation en guerre contre lui. Les navires du convoi (escorte) ripostent.
 */
function navalEncounters(state) {
  const atSea = state.transports.filter(t => t.stage < t.turns).sort((a, b) => String(a.id).localeCompare(String(b.id)));
  const lanes = [...new Set(atSea.map(laneKey))].sort();
  for (const lane of lanes) {
    const here = atSea.filter(t => laneKey(t) === lane);
    for (let i = 0; i < here.length; i++) for (let j = i + 1; j < here.length; j++) {
      const x = here[i], y = here[j];
      if (x.nationId === y.nationId || !pairWar(state, x.nationId, y.nationId) || !convoyAlive(x) || !convoyAlive(y)) continue;
      if (!x.warships && !y.warships) continue;
      // Le convoi le mieux armé est l'agresseur (égalité : identifiant le plus petit) ; tout le monde tire en même temps.
      const [atk, def] = (y.warships > x.warships) ? [y, x] : [x, y];
      const survivors = navalClash(state, { attackerId: atk.nationId, attackerForce: legacyForce(atk), t: def, kind: 'sea', provinceId: def.via });
      writeConvoy(atk, survivors);
    }
  }
  for (const t of atSea) {
    if (t.stage !== t.turns - 1 || !convoyAlive(t)) continue;
    const harbor = state.provinces[t.via];
    if (!harbor || !harbor.buildings?.port || !(harbor.warships > 0) || harbor.ownerId === t.nationId || !pairWar(state, harbor.ownerId, t.nationId)) continue;
    const { taken: fleet, rest } = splitForce(provinceForce(harbor), { warship: harbor.warships });
    const survivors = navalClash(state, { attackerId: harbor.ownerId, attackerForce: fleet, t, kind: 'port', provinceId: t.via });
    writeProvinceForce(harbor, mergeForce(rest, survivors));
  }
  state.transports = state.transports.filter(convoyAlive);
}
/**
 * Escorte arrivée dans une province SANS port construit : les navires ne peuvent pas y mouiller ; ils repartent
 * aussitôt en convoi vers leur port de départ (même route, même durée). Avec un port construit, ils restent.
 */
function dockEscort(state, map, provinceId, nationId, homeId, lane, turns) {
  const p = state.provinces[provinceId];
  if (!p || p.ownerId !== nationId || p.buildings?.port || !(p.warships > 0)) return;
  if (state.provinces[homeId]?.ownerId !== nationId) return; // port de départ perdu : les navires restent à l'ancre
  const { taken, rest } = splitForce(provinceForce(p), { warship: p.warships });
  writeProvinceForce(p, rest);
  state.transportSequence = Math.max(1, Number(state.transportSequence) || 1);
  const id = `c${state.transportSequence++}`;
  state.transports.push({ id, nationId, fromId: provinceId, toId: homeId, via: homeId, lane, stage: 0, turns, returning: true, ...toLegacy(taken) });
  state.events.push({ turn: state.turn, type: 'convoy-departed', nationId, fromId: provinceId, toId: homeId, convoyId: id, turns, escort: taken.units.warship, amount: unitCount(taken), returning: true });
}
const hasLandTroops = force => LAND_UNIT_TYPES.some(k => force.units[k] > 0);
/** Demi-tour : le convoi (ou les survivants d'un débarquement repoussé) rentre à son port de départ par la même
 *  route, avec la même durée. Port de départ perdu : les unités sont perdues en mer. */
function turnBack(state, t, force = legacyForce(t), reason = 'no-troops', map = null) {
  if (state.provinces[t.fromId]?.ownerId !== t.nationId && !hasPassage(state, t.nationId, state.provinces[t.fromId]?.ownerId)) {
    // V14.0 : parti de chez un ancien allié (alliance rompue pendant la traversée) : le convoi n'est plus perdu.
    if (t.allyPort && map) { rescueConvoy(state, map, t, force, t.toId, t.fromId); return; }
    state.events.push({ turn: state.turn, type: 'retreat-lost', nationId: t.nationId, provinceId: t.fromId, amount: unitCount(force), naval: true }); return;
  }
  state.transportSequence = Math.max(1, Number(state.transportSequence) || 1);
  const id = `c${state.transportSequence++}`;
  state.transports.push({ id, nationId: t.nationId, fromId: t.toId, toId: t.fromId, via: t.fromId, lane: laneKey(t), stage: 0, turns: t.turns, returning: true, ...(t.allyPort ? { allyPort: t.allyPort } : {}), ...toLegacy(force) });
  state.events.push({ turn: state.turn, type: 'convoy-returning', reason, nationId: t.nationId, fromId: t.toId, toId: t.fromId, provinceId: t.toId, convoyId: id, amount: unitCount(force), turns: t.turns });
}
/**
 * V14.0 : convoi parti du port d'un allié, dont l'alliance a été rompue pendant la traversée (il n'a plus le droit d'y
 * accoster). Il n'est plus perdu : depuis l'endroit où il se trouve (`atId`), il met le cap sur le point de port AMI
 * (à soi, ou d'un allié) le plus proche par les routes de la carte (routes maritimes : leur durée ; côte à côte sur une
 * même île : 1 tour) ; la traversée dure ce chemin, au moins RULES.naval.minTurns. À défaut de port ami, il revient à son
 * point de départ (`departureId`) et y débarque : ses troupes sont alors rapatriées comme des troupes stationnées
 * (settleStationed). Toujours une ligne au journal.
 */
function friendlyPortRoute(state, map, nationId, atId) {
  const friendly = id => state.provinces[id]?.ownerId === nationId || hasPassage(state, nationId, state.provinces[id]?.ownerId);
  const dist = new Map([[atId, 0]]), done = new Set(), prev = new Map();
  for (;;) {
    let cur = null;
    for (const [id, d] of dist) if (!done.has(id) && (cur === null || d < dist.get(cur) || (d === dist.get(cur) && id < cur))) cur = id;
    if (cur === null) return null;
    done.add(cur);
    if (cur !== atId && isPortPoint(map, cur) && friendly(cur)) {
      // Campagne V16, bug n° 3 : le trajet peut avoir plusieurs étapes (côte, puis mer). On retient la VRAIE route
      // maritime empruntée (la dernière du trajet), pour que le convoi soit dessiné et rencontré sur une route de la carte.
      let lane = null;
      for (let id = cur; prev.has(id) && !lane; id = prev.get(id).from) if (prev.get(id).sea) lane = [prev.get(id).from, id].sort().join('|');
      return { id: cur, turns: Math.max(RULES.naval.minTurns, dist.get(cur)), lane };
    }
    const edges = [...(provinceDef(map, cur)?.landConnections || []).map(id => [id, 1, false]), ...seaRoutesFrom(map, cur).map(r => [r.via, r.turns, true])];
    for (const [id, w, sea] of edges) if (state.provinces[id] && !done.has(id) && (!dist.has(id) || dist.get(cur) + w < dist.get(id))) { dist.set(id, dist.get(cur) + w); prev.set(id, { from: cur, sea }); }
  }
}
function rescueConvoy(state, map, t, force, atId, departureId) {
  const amount = unitCount(force), port = friendlyPortRoute(state, map, t.nationId, atId);
  state.transportSequence = Math.max(1, Number(state.transportSequence) || 1);
  if (port) {
    const id = `c${state.transportSequence++}`, owner = state.provinces[port.id].ownerId;
    state.transports.push({ id, nationId: t.nationId, fromId: atId, toId: port.id, via: port.id, lane: port.lane || laneKey(t), stage: 0, turns: port.turns, returning: true, ...(owner !== t.nationId ? { allyPort: owner } : {}), ...toLegacy(force) });
    state.events.push({ turn: state.turn, type: 'convoy-rerouted', nationId: t.nationId, target: t.allyPort, fromId: atId, toId: port.id, provinceId: atId, convoyId: id, amount, turns: port.turns });
    return;
  }
  if (atId !== departureId) {
    // Aucun port ami : retour au point de départ, où il débarquera (branche d'arrivée ci-dessous).
    const id = `c${state.transportSequence++}`;
    state.transports.push({ id, nationId: t.nationId, fromId: atId, toId: departureId, via: departureId, lane: laneKey(t), stage: 0, turns: t.turns, returning: true, allyPort: t.allyPort, ...toLegacy(force) });
    state.events.push({ turn: state.turn, type: 'convoy-rerouted', nationId: t.nationId, target: t.allyPort, fromId: atId, toId: departureId, provinceId: atId, convoyId: id, amount, turns: t.turns, toDeparture: true });
    return;
  }
  addStationed(state, t.nationId, departureId, force); // rapatriées juste après (settleStationed)
  state.events.push({ turn: state.turn, type: 'convoy-rerouted', nationId: t.nationId, target: t.allyPort, fromId: atId, toId: departureId, provinceId: departureId, amount, landed: true });
}
/** Avancée des convois (1 étape par tour), rencontres en mer, puis arrivées : renfort, retour (allié) ou débarquement. */
export function resolveTransports(state, map, fought) {
  for (const t of state.transports) t.stage = (Number(t.stage) || 0) + 1;
  navalEncounters(state);
  const arriving = state.transports.filter(t => t.stage >= t.turns).sort((a, b) => String(a.id).localeCompare(String(b.id)));
  state.transports = state.transports.filter(t => t.stage < t.turns);
  for (const toId of [...new Set(arriving.map(t => t.toId))].sort()) {
    const target = state.provinces[toId], here = arriving.filter(t => t.toId === toId), groups = new Map();
    for (const t of here) {
      const force = legacyForce(t);
      if (t.returning && target.ownerId !== t.nationId && hasPassage(state, t.nationId, target.ownerId)) { addStationed(state, t.nationId, toId, force); continue; }
      if (t.returning && target.ownerId !== t.nationId && t.allyPort) { rescueConvoy(state, map, t, force, toId, toId); continue; } // V14.0
      if (t.returning && target.ownerId !== t.nationId) {
        // Retour vers un port perdu entre-temps : plus de port où rentrer.
        state.events.push({ turn: state.turn, type: 'retreat-lost', nationId: t.nationId, provinceId: toId, amount: unitCount(force), naval: true });
        continue;
      }
      if (target.ownerId !== t.nationId && !hasLandTroops(force)) {
        // Navires seuls (patrouille, ou troupes perdues en mer) devant une côte étrangère : pas de débarquement,
        // demi-tour vers le port de départ par la même route.
        turnBack(state, t, legacyForce(t), t.strike ? 'strike' : 'no-troops', map);
        continue;
      }
      if (target.ownerId === t.nationId) {
        addToProvince(target, force);
        state.events.push({ turn: state.turn, type: 'convoy-arrived', nationId: t.nationId, fromId: t.fromId, toId, provinceId: toId, amount: unitCount(force), returning: Boolean(t.returning) });
        if (!t.returning) dockEscort(state, map, toId, t.nationId, t.fromId, laneKey(t), t.turns);
        continue;
      }
      if (hasPassage(state, t.nationId, target.ownerId)) {
        // V13.4 : chez un allié, le convoi débarque paisiblement : ses troupes stationnent (droit de passage).
        addStationed(state, t.nationId, toId, force);
        state.events.push({ turn: state.turn, type: 'convoy-arrived', nationId: t.nationId, fromId: t.fromId, toId, provinceId: toId, amount: unitCount(force), passage: true, target: target.ownerId });
        continue;
      }
      if (t.passage) {
        // Parti pour stationner chez un allié qui ne l'est plus : pas de débarquement (jamais de guerre involontaire).
        state.events.push({ turn: state.turn, type: 'attack-cancelled', reason: 'passage-lost', nationId: t.nationId, fromId: t.fromId, provinceId: toId, naval: true });
        turnBack(state, t, force, 'ally', map);
        continue;
      }
      const truce = (state.diplomacy.treaties || []).find(x => x.active !== false && x.type === 'ceasefire' && x.parties.includes(t.nationId) && x.parties.includes(target.ownerId));
      if (truce && truceAfterDeparture(t, truce, target.ownerId)) {
        // V13 : cessez-le-feu conclu APRÈS le départ du convoi (ex. fenêtre Oui / Non) : pas de débarquement, le convoi
        // rentre. Un convoi parti alors que la trêve existait déjà est une violation délibérée : il débarque (guerre).
        // V14.1 : y compris une trêve signée dans le même inter-tour que le départ (avant : débarquement = trahison).
        state.events.push({ turn: state.turn, type: 'attack-cancelled', reason: 'ceasefire', nationId: t.nationId, fromId: t.fromId, provinceId: toId, naval: true });
        turnBack(state, t, force, 'ceasefire', map);
        continue;
      }
      const g = groups.get(t.nationId) || { nationId: t.nationId, force: emptyForceLocal(), originIds: [], retreatTo: [], mode: 'landing', convoys: [] };
      g.force = mergeForce(g.force, force); g.convoys.push(t);
      if (!g.originIds.includes(t.fromId)) { g.originIds.push(t.fromId); g.retreatTo.push(t.fromId); }
      groups.set(t.nationId, g);
    }
    if (!groups.size) continue;
    // Débarquement repoussé : les survivants rembarquent et rentrent par la même route (pas de repli instantané).
    for (const r of fight(state, toId, [...groups.values()], fought, { naval: true })) turnBack(state, groups.get(r.nationId).convoys[0], r.force, 'repelled', map);
    const winner = groups.get(target.ownerId);
    if (winner) dockEscort(state, map, toId, winner.nationId, winner.convoys[0].fromId, laneKey(winner.convoys[0]), winner.convoys[0].turns);
  }
}
