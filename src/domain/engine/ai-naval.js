// Moteur — IA maritime : ports, flottes, débarquements, frappes en mer.

import {
  breachedFactor, combatValue, hasCombatUnits, legacyForce, normalizeForce, provinceForce, resolveBattle,
  resolveCombat, scaleForce, splitForce
} from '../combat.js';
import { LAND_UNIT_TYPES, RULES } from '../constants.js';
import { perceivedForce, visibleProvinces } from '../vision.js';
import { aiAttackSlice, holds, rememberedGarrison } from './ai.js';
import { bombardStatus, fortBreach, queueBombard } from './bombard.js';
import { availableForces, queueConstruction, queueMoveOrder, queueRecruitment } from './orders.js';
import { isPortPoint, seaDestinations } from './sea-routes.js';
import { pairTreaty, pairWar, provinceDef } from './shared.js';

// --- IA maritime (V9, corrige B11) -------------------------------------------------------------
// Uniquement avec les mécaniques V6 : ports (une route n'est ouverte que si ses deux ports sont construits),
// navires de guerre (usine + port), transports (embarquement puis traversée). V10 : décisions évaluées par simulation du combat (combat.js).
const seaRouteCount = (map, id) => (map.maritimeRoutes || []).filter(([a, b]) => a === id || b === id).length;
export const hasOrQueued = (state, provinceId, type) => (state.provinces[provinceId]?.buildings?.[type] || 0) > 0
  || (state.productionQueue || []).some(q => q.kind === 'building' && q.provinceId === provinceId && q.type === type)
  || (state.orders || []).some(o => o.kind === 'construction' && o.status === 'pending' && o.provinceId === provinceId && o.type === type);
// V13 : l'IA ne lit que ce qu'elle voit (garnison réelle si visible, sinon estimation prudente : vision.js).
export const defenseOf = (state, id, map, viewer) => combatValue(perceivedForce(state, map, viewer, id)) * breachedFactor(RULES.fortDefense[state.provinces[id].buildings.fort || 0], fortBreach(state, id));
const hostileTo = (state, nationId, owner) => owner && owner !== nationId && !pairTreaty(state, nationId, owner, 'alliance') && !pairTreaty(state, nationId, owner, 'ceasefire');
// Plus forte menace terrestre immédiate sur une province (forces des voisins hostiles).
export const landThreat = (map, state, nationId, id) => combatValue(landThreatForce(map, state, nationId, id) || normalizeForce({}));
/** Plus forte armée terrestre d'un voisin hostile (force complète, pour simuler un combat).
 *  V13 : telle que `nationId` la voit (troupes invisibles ou retranchées : estimation prudente). */
export function landThreatForce(map, state, nationId, id) {
  const seen = visibleProvinces(state, map, nationId);
  const forces = (provinceDef(map, id)?.landConnections || []).filter(n => hostileTo(state, nationId, state.provinces[n]?.ownerId))
    .map(n => { const f = perceivedForce(state, map, nationId, n, seen); f.units.warship = 0; f.wounds.warship = 0; return f; });
  return forces.sort((a, b) => combatValue(b) - combatValue(a))[0] || null;
}
// Base navale : point de port possédé, de préférence déjà équipé (construit ou en chantier : choix stable),
// puis (V13, une seule route par point de port) celui dont la route mène à la côte la plus faible.
export function navalBase(map, state, owned) {
  const score = p => (hasOrQueued(state, p.id, 'port') ? 2 : 0) + (hasOrQueued(state, p.id, 'factory') ? 1 : 0);
  const nationId = state.provinces[owned[0]?.id]?.ownerId;
  const across = p => Math.min(Infinity, ...seaDestinations(map, p.id).filter(d => state.provinces[d.id]?.ownerId !== nationId).map(d => defenseOf(state, d.id, map, nationId)));
  return owned.filter(p => isPortPoint(map, p.id))
    .sort((a, b) => score(b) - score(a) || seaRouteCount(map, b.id) - seaRouteCount(map, a.id) || across(a) - across(b) || a.id.localeCompare(b.id))[0] || null;
}
export function aiNavalOrders(state, map, nationId, owned, base, threshold, canAttack = owner => hostileTo(state, nationId, owner), arch = null, focus = new Set()) {
  const treasury = () => state.nations[nationId].treasury;
  if (!base) return;
  const baseState = state.provinces[base.id];
  // 1. Port puis usine sur la base navale (les navires exigent les deux au même endroit).
  if (!hasOrQueued(state, base.id, 'port') && treasury() >= RULES.buildings.port.cost) queueConstruction(state, { nationId, provinceId: base.id, type: 'port' });
  if (!hasOrQueued(state, base.id, 'factory') && treasury() >= RULES.buildings.factory.cost + (arch === 'conquerant' ? 0 : 60)) queueConstruction(state, { nationId, provinceId: base.id, type: 'factory' });
  // 2. Flotte : un navire par tour (deux si le trésor déborde), plafond qui grandit avec la partie.
  if (baseState.buildings.port && baseState.buildings.factory) {
    const queuedShips = (state.productionQueue || []).filter(q => q.kind === 'unit' && q.type === 'warship' && q.nationId === nationId).reduce((n, q) => n + q.amount, 0)
      + (state.orders || []).filter(o => o.kind === 'recruitment' && o.type === 'warship' && o.nationId === nationId && o.status === 'pending').reduce((n, o) => n + o.amount, 0);
    const fleet = owned.reduce((n, p) => n + (state.provinces[p.id].warships || 0), 0) + queuedShips;
    // V14.1 (cahier V14 §3 point 3) : plus de bases navales qui s'empilent face à face sans se battre. Sans aucune
    // côte à viser par la mer (aucune nation en guerre ou visée au bout d'une route), la flotte reste petite.
    const seaUse = owned.filter(p => isPortPoint(map, p.id)).some(p => seaDestinations(map, p.id).some(d => { const o = state.provinces[d.id]?.ownerId; return o && o !== nationId && (pairWar(state, nationId, o) || canAttack(o) || focus.has(o)); }));
    const cap = Math.min(30, seaUse ? (arch === 'batisseur' ? 2 : 4) + Math.floor(state.turn / 8) : NAVAL_IDLE_CAP);
    const lots = treasury() >= 400 ? 2 : 1;
    if (fleet < cap && treasury() >= RULES.units.warship.cost * lots + (arch === 'conquerant' ? 0 : 20)) queueRecruitment(state, { nationId, provinceId: base.id, type: 'warship', lots });
  }
  // 3. Ports secondaires quand le trésor le permet (plus de routes ouvertes = plus d'options).
  if (baseState.buildings.port && treasury() >= RULES.buildings.port.cost + 20 && (arch !== 'conquerant' || (baseState.warships || 0) >= 3)) {
    const site = owned.find(p => p.id !== base.id && state.provinces[p.id].portSite && seaRouteCount(map, p.id) > 0 && !hasOrQueued(state, p.id, 'port'));
    if (site) queueConstruction(state, { nationId, provinceId: site.id, type: 'port' });
  }
  const ports = owned.filter(p => state.provinces[p.id].buildings.port);
  // V13 : on embarque depuis tout point de port possédé (construit ou non) vers le point de port au bout de la route.
  const seaLinks = owned.filter(p => isPortPoint(map, p.id)).flatMap(p => seaDestinations(map, p.id).map(d => ({ from: p, to: d.id, via: d.via, turns: d.turns, owner: state.provinces[d.id].ownerId })));
  // 4. Débarquement escorté : au plus un nouveau par tour, et au plus RULES-libre 2 invasions en mer à la fois.
  const invasionsAtSea = (state.transports || []).filter(t => t.nationId === nationId && !t.returning && state.provinces[t.toId]?.ownerId !== nationId).length;
  if (invasionsAtSea < 2) {
    const targets = seaLinks.filter(x => x.owner && x.owner !== nationId && (hostileTo(state, nationId, x.owner) || arch === 'traitre' || arch === 'conquerant') && canAttack(x.owner) && !(state.transports || []).some(t => t.nationId === nationId && t.toId === x.to))
      .map(x => ({ ...x, atWar: pairWar(state, nationId, x.owner) }));
    // V13 : les nations visées au titre d'une aide promise à un allié passent en premier.
    targets.sort((a, b) => Number(focus.has(b.owner)) - Number(focus.has(a.owner)) || Number(b.atWar) - Number(a.atWar) || Number(a.owner === state.playerNationId) - Number(b.owner === state.playerNationId) || defenseOf(state,
      a.to, map, nationId) - defenseOf(state, b.to, map, nationId) || a.turns - b.turns || a.to.localeCompare(b.to) || a.from.id.localeCompare(b.from.id));
    // Marge plus prudente que sur terre : la cible a plusieurs tours pour se renforcer pendant la traversée.
    // V14.1 (cahier V14 §3 point 4) : un peu plus de goût pour la mer — marge réduite (0,25 → 0,10) sauf vers une
    // capitale (0,35 : pas de débarquement suicide sur les capitales).
    const isCap = id => Object.values(state.nations).some(n => n.capitalId === id);
    const margin = (x) => (x.atWar ? Math.max(1.1, threshold - .2) : threshold) + (isCap(x.to) ? RULES.ai.capitalLandingMargin : RULES.ai.landingExtraMargin) + .05 * (x.turns - RULES.naval.minTurns);
    let launched = false;
    for (const x of targets) {
      const warships = availableForces(state, x.from.id).warships;
      // Pas d'invasion sans escorte… sauf (V13) depuis un point de port sans flotte quand aucun navire ennemi
      // ne peut intercepter sur la route ni au port d'arrivée.
      if (!warships && navalThreat(state, nationId, x.from.id, x.via, map) > 0) continue;
      // V10 : simulation de l'interception éventuelle au port d'arrivée, puis du débarquement (mode 'landing').
      const units = aiAttackSlice(state, map, nationId, x.from.id, x.to, margin(x), 'landing', warships, x.via);
      if (units) { launched = queueMoveOrder(state, map, { nationId, fromId: x.from.id, toId: x.to, units, warships }).ok; break; }
    }
    // V13 : rassemblement. On ne débarque qu'au point de port au bout de la route : quand l'armée (souvent sur la
    // base navale) est sur un autre point de port, elle rejoint par la terre le point de port d'où partira l'invasion,
    // si la simulation montre qu'avec ce renfort le débarquement réussirait. Embarquement au tour suivant.
    if (!launched && !(state.orders || []).some(o => o.kind === 'move' && o.status === 'pending' && o.nationId === nationId && o.staging)) {
      for (const x of targets) {
        if (!availableForces(state, x.from.id).warships && navalThreat(state, nationId, x.from.id, x.via, map) > 0) continue;
        const donors = (x.from.landConnections || []).filter(id => state.provinces[id]?.ownerId === nationId)
          .sort((a, b) => combatValue(provinceForce(state.provinces[b])) - combatValue(provinceForce(state.provinces[a])) || a.localeCompare(b));
        const donor = donors[0];
        if (!donor) continue;
        const avail = availableForces(state, donor), units = Object.fromEntries(LAND_UNIT_TYPES.map(k => [k, Math.floor((avail[k] || 0) * .6)]));
        if (!LAND_UNIT_TYPES.some(k => units[k])) continue;
        const kept = normalizeForce({ units: Object.fromEntries(LAND_UNIT_TYPES.map(k => [k, (state.provinces[donor].units[k] || 0) - units[k]])) });
        const threat = landThreatForce(map, state, nationId, donor);
        if (threat && !holds(kept, threat, state.provinces[donor].buildings.fort || 0)) continue;
        const here = availableForces(state, x.from.id);
        const attacker = normalizeForce({ units: Object.fromEntries(LAND_UNIT_TYPES.map(k => [k, Math.floor((here[k] || 0) * .7) + units[k]])) });
        const target = state.provinces[x.to];
        // V14.1 : le rassemblement commence dès que l'armée réunie atteint la moitié de ce qu'il faut (stagingFactor) ; le
        // débarquement lui-même ne part qu'avec la marge complète (aiAttackSlice), les renforts s'accumulent d'ici là.
        if (!resolveCombat({ attacker, defender: scaleForce(perceivedForce(state, map, nationId, x.to), Math.max(RULES.ai.stagingFactor, margin(x) * RULES.ai.stagingFactor)), fortLevel: target.buildings.fort || 0, mode: 'landing' }).captured) continue;
        const r = queueMoveOrder(state, map, { nationId, fromId: donor, toId: x.from.id, units });
        if (r.ok) { state.orders.find(o => o.id === r.orderId).staging = x.to; break; }
      }
    }
  }
  // 5. Renfort par mer d'une tête de pont menacée ou en première ligne (au plus un par tour), escorté si possible.
  const bridgeheads = seaLinks.filter(x => x.owner === nationId && provinceDef(map, x.to).landConnections.some(n => hostileTo(state, nationId, state.provinces[n]?.ownerId)))
    .sort((a, b) => combatValue(provinceForce(state.provinces[a.to])) - combatValue(provinceForce(state.provinces[b.to])) || a.turns - b.turns || a.to.localeCompare(b.to) || a.from.id.localeCompare(b.from.id));
  for (const x of bridgeheads) {
    if ((state.transports || []).some(t => t.nationId === nationId && t.toId === x.to)) continue;
    const available = availableForces(state, x.from.id), here = combatValue(provinceForce(state.provinces[x.to]));
    const value = units => combatValue({ units });
    if (value(available) < Math.max(value({ infantry: 80 }), here * 2)) continue;
    const units = Object.fromEntries(LAND_UNIT_TYPES.map(k => [k, Math.floor(available[k] * .4)]));
    const kept = Object.fromEntries(LAND_UNIT_TYPES.map(k => [k, available[k] - units[k]]));
    const threat = landThreatForce(map, state, nationId, x.from.id);
    if (threat && !holds(normalizeForce({ units: kept }), threat, state.provinces[x.from.id].buildings.fort || 0)) continue;
    // Escorte si la route est menacée par des navires ennemis (port au bout de la route ou convoi ennemi armé).
    const risky = navalThreat(state, nationId, x.from.id, x.via, map) > 0;
    const warships = risky ? Math.floor(available.warships / 2) : 0;
    if (risky && !warships) continue;
    queueMoveOrder(state, map, { nationId, fromId: x.from.id, toId: x.to, units, warships });
    break;
  }
  // 5 bis. V14.1 : attaque d'une base navale ennemie face à face quand on a l'avantage.
  aiNavalStrike(state, map, nationId, ports);
  // 6. Interception active : une flotte libre attaque un convoi ennemi en mer sur une route qui part de son port
  //    (envoyée sur cette route vers la côte d'en face, elle rencontre le convoi au tour suivant).
  for (const p of ports) {
    const ships = availableForces(state, p.id).warships;
    if (ships < 2) continue;
    const prey = (state.transports || []).filter(t => t.nationId !== nationId && pairWar(state, nationId, t.nationId) && laneKeyOf(t).split('|').includes(p.id) && t.stage + 1 < t.turns)
      .filter(t => combatValue(legacyForce({ warships: ships - 1 }), { naval: true }) > 1.3 * combatValue(legacyForce(t), { naval: true }));
    const t = prey.sort((a, b) => String(a.id).localeCompare(String(b.id)))[0];
    if (!t) continue;
    // Patrouille : la flotte part sur la même route (vers l'autre extrémité) ; elle croise le convoi pendant
    // l'inter-tour, puis, sans troupes à débarquer, fait demi-tour vers son port.
    const other = laneKeyOf(t).split('|').find(id => id !== p.id);
    const dest = seaDestinations(map, p.id).find(d => d.via === other && d.id === other);
    if (!dest) continue;
    const r = queueMoveOrder(state, map, { nationId, fromId: p.id, toId: dest.id, units: {}, warships: ships - 1 });
    if (r.ok) { const o = state.orders.find(x => x.id === r.orderId); o.patrol = true; break; }
  }  // 7. V14.4 : bombardement des forteresses côtières ennemies (navires encore libres).
  aiBombard(state, map, nationId, owned, arch);
}
/**
 * V14.4 : l'IA bombarde avec les MÊMES règles que le joueur (ordre queueBombard). Navires restés libres après les
 * escortes, frappes et patrouilles, sur un point de port face à une nation en guerre ; cible utile seulement : une
 * forteresse pas encore ouverte, ou une côte vers laquelle un de ses convois fait route. Flotte ennemie à quai : elle
 * ne bombarde que si la simulation du combat naval la coule (même marge que l'attaque de base navale). Le Bâtisseur ne
 * bombarde que pour appuyer un débarquement. Au plus un bombardement par port et par tour.
 */
function aiBombard(state, map, nationId, owned, arch) {
  const seen = visibleProvinces(state, map, nationId);
  for (const p of owned.filter(x => isPortPoint(map, x.id)).sort((a, b) => a.id.localeCompare(b.id))) {
    const st = bombardStatus(map, state, { nationId, fromId: p.id });
    if (!st.ok) continue;
    for (const toId of st.targets) {
      const t = state.provinces[toId], convoy = (state.transports || []).some(c => c.nationId === nationId && c.toId === toId && !c.returning);
      const useful = convoy || ((t.buildings.fort || 0) > 0 && fortBreach(state, toId) < 100 && arch !== 'batisseur');
      if (!useful) continue;
      const theirs = t.buildings?.port ? Math.max(perceivedForce(state, map, nationId, toId, seen).units.warship, seen.has(toId) ? 0 : rememberedGarrison(state, nationId, toId)?.units.warship || 0) : 0;
      if (theirs) {
        const fleet = splitForce(provinceForce(state.provinces[p.id]), { warship: st.warships }).taken;
        const sim = resolveBattle({ defender: fleet, attackers: [{ id: 'x', force: scaleForce(legacyForce({ warships: theirs }), NAVAL_STRIKE_MARGIN) }], naval: true });
        if (hasCombatUnits(sim.attackers[0].force, true) || !(sim.defender.units.warship > 0)) continue;
      }
      if (queueBombard(state, map, { nationId, fromId: p.id, toId, warships: st.warships }).ok) break;
    }
  }
}
const laneKeyOf = t => t.lane || [t.fromId, t.via].sort().join('|');
/** V14.1 : flotte maximale (en service + en chantier) d'une nation qui n'a aucune côte à viser par la mer. */
export const NAVAL_IDLE_CAP = 4;
/** V14.1 : avantage exigé (flotte ennemie simulée × marge) avant d'attaquer une base navale ennemie. */
export const NAVAL_STRIKE_MARGIN = 1.3;
/**
 * V14.1 (cahier V14 §3 point 3) : attaque d'une base navale ennemie face à face. Une flotte libre (on garde un navire au
 * port) part vers le port ennemi au bout de sa route quand la simulation du combat naval montre qu'elle coule toute la
 * flotte à quai, même majorée de NAVAL_STRIKE_MARGIN, et garde des navires. Seulement en guerre. Les navires sans troupes
 * rentrent ensuite à leur port (demi-tour). Renvoie l'ordre donné, ou null.
 */
function aiNavalStrike(state, map, nationId, ports) {
  const seen = visibleProvinces(state, map, nationId);
  for (const p of [...ports].sort((a, b) => a.id.localeCompare(b.id))) {
    const ships = availableForces(state, p.id).warships;
    if (ships < 3) continue;
    for (const d of seaDestinations(map, p.id)) {
      const harbor = state.provinces[d.via];
      if (!harbor || harbor.ownerId === nationId || !harbor.buildings?.port || !pairWar(state, nationId, harbor.ownerId)) continue;
      if ((state.transports || []).some(t => t.nationId === nationId && t.toId === d.id)) continue;
      // Flotte à quai telle qu'on la voit, ou telle qu'on l'a vue lors d'un combat (mémoire), la plus forte des deux.
      const theirs = Math.max(perceivedForce(state, map, nationId, d.via, seen).units.warship, seen.has(d.via) ? 0 : rememberedGarrison(state, nationId, d.via)?.units.warship || 0);
      if (!theirs) continue;
      const fleet = splitForce(provinceForce(state.provinces[p.id]), { warship: ships - 1 }).taken;
      const sim = resolveBattle({ defender: fleet, attackers: [{ id: 'x', force: scaleForce(legacyForce({ warships: theirs }), NAVAL_STRIKE_MARGIN) }], naval: true });
      if (hasCombatUnits(sim.attackers[0].force, true) || !(sim.defender.units.warship > 0)) continue;
      const r = queueMoveOrder(state, map, { nationId, fromId: p.id, toId: d.id, units: {}, warships: ships - 1 });
      if (r.ok) { const o = state.orders.find(x => x.id === r.orderId); o.navalStrike = true; return o; }
    }
  }
  return null;
}
/** Menace navale sur une route : navires ennemis (en guerre) à quai au bout de la route, ou convois armés en guerre sur la route. */
export function navalThreat(state, nationId, fromId, via, map = null) {
  const key = [fromId, via].sort().join('|');
  const harbor = state.provinces[via];
  // V13 : navires à quai tels que l'IA les voit (port lointain non visible : estimation prudente).
  const docked = () => map ? perceivedForce(state, map, nationId, via).units.warship : harbor.warships || 0;
  let n = harbor && harbor.ownerId !== nationId && harbor.buildings?.port && pairWar(state, nationId, harbor.ownerId) ? docked() : 0;
  for (const t of state.transports || []) if (laneKeyOf(t) === key && t.nationId !== nationId && pairWar(state, nationId, t.nationId)) n += t.warships || 0;
  return n;
}
