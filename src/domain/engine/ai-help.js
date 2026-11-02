// Moteur — IA : renforts aux alliés, troupes stationnées, rappels.

import { activeHelpPacts } from '../alliances.js';
import { combatValue, normalizeForce, provinceForce } from '../combat.js';
import { LAND_UNIT_TYPES } from '../constants.js';
import { aliveNations, archetypeOf, recentAggressions } from '../leaders.js';
import { hasPassage, stationedForce, stationedOf } from '../passage.js';
import { perceivedForce, visibleProvinces } from '../vision.js';
import { landThreat, landThreatForce, navalThreat } from './ai-naval.js';
import { aiMemory, holds } from './ai.js';
import { availableForces, queueMoveOrder } from './orders.js';
import { legalDestinations, seaRoutesFrom } from './sea-routes.js';
import { pairTreaty, pairWar, provinceDef } from './shared.js';

/**
 * V13 : un allié engagé à défendre masse ses renforts sur sa base navale (le point de départ vers la frontière
 * menacée : sur Arken, toutes les frontières entre nations passent par la mer) : 40 % des troupes disponibles de sa
 * province la mieux garnie, sans dégarnir une province menacée. Au plus un renfort par tour.
 */
export function helpReinforce(state, map, nationId, owned, base) {
  if (!base) return;
  const value = id => combatValue({ units: availableForces(state, id) });
  const from = owned.filter(p => p.id !== base.id && (p.landConnections || []).includes(base.id) && !landThreat(map, state, nationId, p.id))
    .sort((a, b) => value(b.id) - value(a.id) || a.id.localeCompare(b.id))[0];
  if (!from || value(from.id) < combatValue({ units: { infantry: 40 } })) return;
  const available = availableForces(state, from.id), units = Object.fromEntries(LAND_UNIT_TYPES.map(k => [k, Math.floor(available[k] * .4)]));
  if (!LAND_UNIT_TYPES.some(k => units[k])) return;
  const r = queueMoveOrder(state, map, { nationId, fromId: from.id, toId: base.id, units });
  if (r.ok) state.orders.find(o => o.id === r.orderId).help = true;
}
/**
 * V14.0 : l'IA rappelle ses troupes stationnées chez un allié
 *  - quand le danger est passé : l'allié n'est plus en guerre, n'a pas été attaqué depuis 3 tours, et aucun engagement
 *    « Défends-moi » ne la retient plus ;
 *  - ou quand elle en a besoin chez elle : une de ses provinces est menacée par un voisin qu'elle ne peut pas tenir.
 * Les troupes rentrent par la terre ou par la mer vers la province menacée, sinon la capitale, sinon la plus proche ;
 * si aucune route directe n'existe (troupes à l'intérieur des terres), elles marchent d'abord vers un point de port de
 * l'allié d'où une route mène chez elles. Un ordre de rappel par contingent et par tour.
 */
export function recallStationed(state, map, nationId, owned) {
  const mine = stationedOf(state, nationId);
  if (!mine.length) return;
  const ownIds = new Set(owned.map(d => d.id));
  // « Besoin chez elle » : une province qu'elle ne peut pas tenir face à l'armée d'un voisin (terre ou route maritime)
  // avec qui elle est EN GUERRE (un voisin simplement neutre ne suffit pas).
  const seen = visibleProvinces(state, map, nationId);
  const enemyNear = id => [...(provinceDef(map, id)?.landConnections || []), ...seaRoutesFrom(map, id).map(r => r.via)]
    .filter(n => state.provinces[n] && pairWar(state, nationId, state.provinces[n].ownerId))
    .map(n => { const f = perceivedForce(state, map, nationId, n, seen); f.units.warship = 0; f.wounds.warship = 0; return f; })
    .sort((a, b) => combatValue(b) - combatValue(a))[0] || null;
  const threatened = owned.filter(d => { const threat = enemyNear(d.id); return threat && !holds(provinceForce(state.provinces[d.id]), threat, state.provinces[d.id].buildings.fort || 0); }).map(d => d.id);
  const capital = state.nations[nationId]?.capitalId;
  const heroCovers = req => archetypeOf(state, nationId) === 'heros' && recentAggressions(state, 3).some(a => a.victim === req);
  for (const e of [...mine].sort((a, b) => a.provinceId.localeCompare(b.provinceId))) {
    const host = state.provinces[e.provinceId]?.ownerId;
    if (!host || !hasPassage(state, nationId, host)) continue; // settleStationed s'en charge
    if ((state.orders || []).some(o => o.kind === 'move' && o.status === 'pending' && o.nationId === nationId && o.fromId === e.provinceId)) continue;
    const danger = aliveNations(state).some(n => n !== host && n !== nationId && (pairWar(state, host, n) || recentAggressions(state, 3).some(a => a.attacker === n && a.victim === host)));
    const bound = activeHelpPacts(state, nationId).some(p => p.kind === 'defend' && p.requester === host) || heroCovers(host);
    const needed = threatened.length > 0;
    if (!needed && (danger || bound)) continue;
    // V14.1 (« À surveiller » V14.0) : plus de va-et-vient — des troupes envoyées en aide il y a moins de STATION_MIN_TURNS
    // tours restent (escale comprise), sauf si l'on a besoin d'elles chez soi.
    if (!needed && state.turn - (aiMemory(state, nationId).helpSent?.[host] ?? -99) < STATION_MIN_TURNS) continue;
    const avail = availableForces(state, e.provinceId, nationId);
    const units = Object.fromEntries(LAND_UNIT_TYPES.map(k => [k, avail[k] || 0]));
    if (!LAND_UNIT_TYPES.some(k => units[k])) continue;
    const routes = legalDestinations(map, state, e.provinceId);
    const rank = id => (threatened.includes(id) ? 0 : id === capital ? 1 : 2);
    const home = routes.filter(r => ownIds.has(r.id)).sort((a, b) => rank(a.id) - rank(b.id) || (a.turns || 0) - (b.turns || 0) || a.id.localeCompare(b.id))[0];
    // Pas de route directe : d'abord vers un point de port de l'allié d'où l'on peut rentrer par la mer.
    const step = home ? null : routes.filter(r => r.type === 'land' && state.provinces[r.id]?.ownerId === host && legalDestinations(map, state, r.id).some(x => ownIds.has(x.id) && x.type === 'sea'))
      .sort((a, b) => a.id.localeCompare(b.id))[0];
    const to = home || step;
    if (!to) continue;
    const r = queueMoveOrder(state, map, { nationId, fromId: e.provinceId, toId: to.id, units, warships: to.type === 'sea' ? avail.warships || 0 : 0 });
    if (r.ok) { const o = state.orders.find(x => x.id === r.orderId); o.recall = needed ? 'home' : 'safe'; if (!needed) ((aiMemory(state, nationId).recalled ||= {})[host] = state.turn); }
  }
}
/** V14.1 : après un envoi d'aide, les troupes restent au moins ce nombre de tours chez l'allié (sauf besoin chez soi). */
export const STATION_MIN_TURNS = 5;
const noteHelpSent = (state, nationId, host) => { if (host) (aiMemory(state, nationId).helpSent ||= {})[host] = state.turn; };
/**
 * V13.4 : droit de passage — un allié engagé à défendre envoie des troupes STATIONNER dans la province menacée du
 * demandeur (celle de la demande, sinon sa province la plus exposée), par la terre ou par la mer, depuis la province
 * où il peut le mieux s'en passer. Au plus un envoi par tour, et pas tant qu'il y a déjà assez de ses troupes sur place.
 */
export function helpStation(state, map, nationId, owned) {
  const pacts = activeHelpPacts(state, nationId).filter(p => p.kind === 'defend');
  // Le Héros n'attend pas qu'on le lui demande : il vient défendre un allié attaqué récemment (IA ou joueur).
  // V14.1 : après un rappel « danger passé », il ne revient que pour une NOUVELLE agression (pas de va-et-vient).
  const recalled = aiMemory(state, nationId).recalled || {};
  if (archetypeOf(state, nationId) === 'heros') for (const a of recentAggressions(state, 3))
    if (a.victim !== nationId && pairTreaty(state, nationId, a.victim, 'alliance') && !pacts.some(p => p.requester === a.victim) && !(a.turn <= (recalled[a.victim] ?? -99))) pacts.push({ requester: a.victim, kind: 'defend', provinceId: null });
  for (const pact of pacts) {
    const req = pact.requester;
    const enemies = new Set(aliveNations(state).filter(n => n !== req && n !== nationId && (pairWar(state, req, n) || recentAggressions(state, 3).some(a => a.attacker === n && a.victim === req))));
    const exposed = id => (provinceDef(map, id)?.landConnections || []).some(n => enemies.has(state.provinces[n]?.ownerId))
      || (map.maritimeRoutes || []).some(([a, b]) => (a === id && enemies.has(state.provinces[b]?.ownerId)) || (b === id && enemies.has(state.provinces[a]?.ownerId)));
    const theirs = map.provinces.filter(d => state.provinces[d.id]?.ownerId === req).map(d => d.id);
    const wanted = [pact.provinceId, ...theirs.filter(exposed).sort((a, b) => Number(state.nations[req]?.capitalId === b) - Number(state.nations[req]?.capitalId === a) || a.localeCompare(b))]
      .filter((id, i, list) => id && list.indexOf(id) === i && state.provinces[id]?.ownerId === req);
    // V14.0 : troupes déjà stationnées chez le demandeur, dans une province qui n'est pas menacée (escale) : elles
    // avancent vers la province menacée voisine.
    for (const e of stationedOf(state, nationId).filter(x => state.provinces[x.provinceId]?.ownerId === req && !wanted.includes(x.provinceId)).sort((a, b) => a.provinceId.localeCompare(b.provinceId))) {
      if ((state.orders || []).some(o => o.kind === 'move' && o.status === 'pending' && o.nationId === nationId && o.fromId === e.provinceId)) continue;
      const toId = wanted.find(id => legalDestinations(map, state, e.provinceId).some(x => x.id === id && x.type === 'land'));
      const avail = availableForces(state, e.provinceId, nationId), units = Object.fromEntries(LAND_UNIT_TYPES.map(k => [k, avail[k] || 0]));
      if (!toId || !LAND_UNIT_TYPES.some(k => units[k])) continue;
      const r = queueMoveOrder(state, map, { nationId, fromId: e.provinceId, toId, units });
      if (r.ok) { state.orders.find(o => o.id === r.orderId).help = true; noteHelpSent(state, nationId, req); }
    }
    for (const toId of wanted) {
      if (combatValue(stationedForce(state, toId, nationId)) >= combatValue({ units: { infantry: 60 } })) continue;
      if ((state.orders || []).some(o => o.kind === 'move' && o.status === 'pending' && o.nationId === nationId && o.toId === toId) || (state.transports || []).some(t => t.nationId === nationId && t.toId === toId)) continue;
      const sources = owned.filter(d => legalDestinations(map, state, d.id).some(x => x.id === toId))
        .map(d => ({ d, route: legalDestinations(map, state, d.id).find(x => x.id === toId), value: combatValue({ units: availableForces(state, d.id) }) }))
        .filter(x => x.value >= combatValue({ units: { infantry: 40 } }) && (x.route.type === 'land' || !navalThreat(state, nationId, x.d.id, x.route.via, map)))
        .sort((a, b) => b.value - a.value || a.d.id.localeCompare(b.d.id));
      // V14.0 (vérification du point 1 du cahier V14) : province menacée hors de portée directe (ex. Branvale, au nord
      // de Valmorne, pour Roc-Épine qui n'atteint que Sylvaren par la mer) → escale dans une province du demandeur d'où
      // une route terrestre y mène ; les troupes avancent au tour suivant (boucle ci-dessus). Avant, l'allié ne venait
      // qu'une fois la province menacée tombée.
      const steps = sources.length ? [] : owned.flatMap(d => legalDestinations(map, state, d.id)
        .filter(x => x.id !== toId && state.provinces[x.id]?.ownerId === req && legalDestinations(map, state, x.id).some(y => y.id === toId && y.type === 'land'))
        .map(x => ({ d, stage: x.id, route: x, value: combatValue({ units: availableForces(state, d.id) }) })))
        .filter(x => x.value >= combatValue({ units: { infantry: 40 } }) && (x.route.type === 'land' || !navalThreat(state, nationId, x.d.id, x.route.via, map)))
        .filter(x => !(state.orders || []).some(o => o.kind === 'move' && o.status === 'pending' && o.nationId === nationId && o.toId === x.stage) && !(state.transports || []).some(t => t.nationId === nationId && t.toId === x.stage))
        .sort((a, b) => b.value - a.value || a.d.id.localeCompare(b.d.id) || a.stage.localeCompare(b.stage));
      for (const { d, stage } of [...sources.map(x => ({ d: x.d, stage: toId })), ...steps]) {
        const available = availableForces(state, d.id), units = Object.fromEntries(LAND_UNIT_TYPES.map(k => [k, Math.floor(available[k] * .4)]));
        if (!LAND_UNIT_TYPES.some(k => units[k])) continue;
        const kept = normalizeForce({ units: Object.fromEntries(LAND_UNIT_TYPES.map(k => [k, (state.provinces[d.id].units[k] || 0) - units[k]])) });
        const threat = landThreatForce(map, state, nationId, d.id);
        if (threat && !holds(kept, threat, state.provinces[d.id].buildings.fort || 0)) continue;
        const r = queueMoveOrder(state, map, { nationId, fromId: d.id, toId: stage, units });
        if (r.ok) { state.orders.find(o => o.id === r.orderId).help = true; noteHelpSent(state, nationId, req); return; }
      }
    }
  }
}
