// V13 marine (docs/V13-marine.md) : anneau de 5 routes, points de port dès le tour 1, débarquement uniquement au
// port d'arrivée, trajets dans les deux sens, rembarquement après conquête, navires de guerre = port + usine,
// routes neutres et ports colorés, anciens convois d'une sauvegarde. Carte V9 « Leonardo ».
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { arkenV9Map as map } from '../src/map/arken-v9-map.js';
import { createGameState } from '../src/state/create-game-state.js';
import { legalDestinations, queueMoveOrder, queueRecruitment, resolveInterturn, landingCoast, embarkStatus, seaMoveRefusal, isPortPoint, planAIOrders } from '../src/domain/game-engine.js';
import { convoyMarkers } from '../src/presentation/v5-ux.js';
import { assertInvariants } from './helpers/fixtures.js';

const NATIONS = map.nations.map(n => n.id);
const byId = id => map.provinces.find(p => p.id === id);
const islandOf = id => byId(id).landmassId;
const fresh = (player = 'valmorne') => { const s = createGameState({ map, playerNationId: player }); for (const id of NATIONS) s.controllers[id] = 'human'; return s; };
const sea = (s, id) => legalDestinations(map, s, id).filter(d => d.type === 'sea');
const PORTS = map.provinces.filter(p => p.port).map(p => p.id);
const RING = ['ile-nord-ouest', 'ile-nord-est', 'ile-est', 'ile-sud', 'ile-sud-ouest']; // Valmorne, Oroël, Noireflamme, Aurel, Roc-Épine

// --- Carte : l'anneau -------------------------------------------------------------------------------------------
test('anneau : exactement 5 routes, NO ↔ NE ↔ E ↔ S ↔ SO ↔ NO', () => {
  assert.equal(map.maritimeRoutes.length, 5);
  assert.equal(map.seaLanes.length, 5);
  const pairs = map.maritimeRoutes.map(([a, b]) => [islandOf(a), islandOf(b)].sort().join('|')).sort();
  const expected = RING.map((isl, i) => [isl, RING[(i + 1) % 5]].sort().join('|')).sort();
  assert.deepEqual(pairs, expected);
  assert.deepEqual(map.maritimeRoutes.map(r => [...r].sort().join('-')).sort(), ['p02-p05', 'p03-p14', 'p07-p17', 'p09-p13', 'p11-p19']);
  // Nations : Valmorne NO, Oroël NE, Noireflamme E, Aurel S, Roc-Épine SO.
  assert.deepEqual(RING.map(isl => byId(map.provinces.find(p => p.landmassId === isl).id).initialOwner), ['valmorne', 'oroel', 'noireflamme', 'aurel', 'roc-epine']);
});

test('anneau : chaque île a exactement 2 voisines maritimes ; chaque site de port sert à une seule route', () => {
  for (const isl of RING) {
    const neighbours = new Set(map.maritimeRoutes.filter(([a, b]) => islandOf(a) === isl || islandOf(b) === isl).map(([a, b]) => islandOf(a) === isl ? islandOf(b) : islandOf(a)));
    assert.equal(neighbours.size, 2, `${isl} : ${[...neighbours]}`);
  }
  assert.equal(PORTS.length, 10);
  for (const id of PORTS) assert.equal(map.maritimeRoutes.filter(r => r.includes(id)).length, 1, `${id}`);
  for (const [a, b] of map.maritimeRoutes) assert.ok(byId(a).port && byId(b).port);
});

// Croisement strict de deux segments [p1p2] et [p3p4].
const orient = (a, b, c) => Math.sign((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x));
const crosses = (p1, p2, p3, p4) => orient(p1, p2, p3) * orient(p1, p2, p4) < 0 && orient(p3, p4, p1) * orient(p3, p4, p2) < 0;
const lanePoints = l => [byId(l.from).port.anchor, ...l.waypoints, byId(l.to).port.anchor];
const segments = pts => pts.slice(1).map((p, i) => [pts[i], p]);

test('anneau : aucune route n\'en croise une autre ni ne coupe une province (test géométrique des segments)', () => {
  for (let i = 0; i < map.seaLanes.length; i++) for (let j = i + 1; j < map.seaLanes.length; j++)
    for (const [a, b] of segments(lanePoints(map.seaLanes[i]))) for (const [c, d] of segments(lanePoints(map.seaLanes[j])))
      assert.ok(!crosses(a, b, c, d), `${map.seaLanes[i].from}-${map.seaLanes[i].to} croise ${map.seaLanes[j].from}-${map.seaLanes[j].to}`);
  // Les routes restent en mer : aucun segment ne traverse le contour d'une province.
  for (const lane of map.seaLanes) for (const [a, b] of segments(lanePoints(lane))) for (const p of map.provinces) {
    const poly = p.geometry.points.map(([x, y]) => ({ x, y }));
    for (const [c, d] of segments([...poly, poly[0]])) assert.ok(!crosses(a, b, c, d), `${lane.from}-${lane.to} coupe ${p.id}`);
  }
  // Ancres de port : près de la côte de leur province (moins de 40 px du contour), plus près d'elle que des autres.
  const distToPoly = (pt, poly) => Math.min(...segments([...poly, poly[0]]).map(([a, b]) => {
    const dx = b.x - a.x, dy = b.y - a.y, t = Math.max(0, Math.min(1, ((pt.x - a.x) * dx + (pt.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
    return Math.hypot(pt.x - a.x - t * dx, pt.y - a.y - t * dy);
  }));
  for (const id of PORTS) {
    const d = Object.fromEntries(map.provinces.map(p => [p.id, distToPoly(byId(id).port.anchor, p.geometry.points.map(([x, y]) => ({ x, y })))]));
    assert.ok(d[id] < 40, `${id} : ancre à ${Math.round(d[id])} px de sa côte`);
    assert.ok(map.provinces.every(p => p.id === id || d[p.id] > d[id]), `${id} : ancre plus près d'une autre province`);
  }
});

// --- Embarquement ---------------------------------------------------------------------------------------------
test('embarquement dès le tour 1 depuis un point de port NON construit, vers le port d\'en face', () => {
  const s = fresh();
  assert.equal(s.turn, 1);
  for (const id of PORTS) assert.equal(s.provinces[id].buildings.port, 0);
  assert.deepEqual(sea(s, 'p03'), [{ id: 'p14', type: 'sea', via: 'p14', turns: 2 }]);
  assert.deepEqual(sea(s, 'p02'), [{ id: 'p05', type: 'sea', via: 'p05', turns: 2 }]);
  assert.equal(embarkStatus(map, s, 'p03').ok, true);
  assert.ok(isPortPoint(map, 'p02') && isPortPoint(map, 'p03') && !isPortPoint(map, 'p01') && !isPortPoint(map, 'p04'));
  const r = queueMoveOrder(s, map, { nationId: 'valmorne', fromId: 'p03', toId: 'p14', units: { infantry: 30 } });
  assert.equal(r.ok, true);
  assert.deepEqual([s.orders[0].routeType, s.orders[0].via, s.orders[0].turns], ['sea', 'p14', 2]);
});

test('embarquement interdit depuis une province sans point de port, avec un message clair', () => {
  const s = fresh();
  assert.deepEqual(sea(s, 'p01'), []);
  assert.deepEqual(sea(s, 'p04'), []);
  const st = embarkStatus(map, s, 'p01');
  assert.equal(st.ok, false);
  assert.equal(st.reason, 'Valmorne n’a pas de point de port. Embarquez depuis un point de port : Sylvaren, Branvale.');
  const r = queueMoveOrder(s, map, { nationId: 'valmorne', fromId: 'p04', toId: 'p14', units: { infantry: 10 } });
  assert.equal(r.ok, false);
  assert.match(r.error, /^Haut-Bois n’a pas de point de port\. Embarquez depuis un point de port : Sylvaren, Branvale\.$/);
  // Nation qui a perdu tous ses points de port.
  s.provinces.p02.ownerId = 'roc-epine'; s.provinces.p03.ownerId = 'oroel';
  assert.match(embarkStatus(map, s, 'p01').reason, /vous n’en possédez aucun : conquérez un point de port/);
  // On n'embarque pas depuis le point de port d'un autre.
  assert.equal(queueMoveOrder(s, map, { nationId: 'valmorne', fromId: 'p03', toId: 'p14', units: { infantry: 1 } }).error, 'Origine non contrôlée');
});

test('débarquement UNIQUEMENT au point de port au bout de la route (plus de côte voisine)', () => {
  const s = fresh();
  for (const id of PORTS) assert.deepEqual(landingCoast(map, id), [id]);
  // Glacenoire (p13) est voisine de Nordhème (p14) mais n'est pas au bout de la route de Branvale.
  for (const to of ['p13', 'p15', 'p16', 'p09', 'p19']) {
    const r = queueMoveOrder(s, map, { nationId: 'valmorne', fromId: 'p03', toId: to, units: { infantry: 10 } });
    assert.equal(r.ok, false, to);
    assert.equal(r.error, 'On ne débarque qu’au point de port au bout de la route : depuis Branvale, la route mène à Nordhème.');
  }
  assert.equal(seaMoveRefusal(map, s, 'p03', 'p04'), '', 'même île : pas de message maritime');
  // Toutes les destinations par mer de toutes les provinces sont des points de port.
  for (const p of map.provinces) for (const d of sea(s, p.id)) assert.ok(PORTS.includes(d.id), `${p.id} -> ${d.id}`);
});

// --- Aller et retour --------------------------------------------------------------------------------------------
test('chaque route se parcourt dans les deux sens, port construit ou non', () => {
  const s = fresh();
  for (const [a, b] of map.maritimeRoutes) {
    assert.ok(sea(s, a).some(d => d.id === b), `${a} -> ${b}`);
    assert.ok(sea(s, b).some(d => d.id === a), `${b} -> ${a}`);
  }
});

test('aller-retour réel : Branvale → Nordhème puis Nordhème → Branvale (convois arrivés)', () => {
  const s = fresh();
  s.provinces.p14.ownerId = 'valmorne'; s.provinces.p14.units.infantry = 10; // tête de pont tenue
  s.provinces.p03.units.infantry = 100;
  assert.equal(queueMoveOrder(s, map, { nationId: 'valmorne', fromId: 'p03', toId: 'p14', units: { infantry: 60 } }).ok, true);
  resolveInterturn(s, map);
  assert.equal(s.transports.length, 1);
  resolveInterturn(s, map);
  assert.equal(s.transports.length, 0);
  assert.equal(s.provinces.p14.units.infantry, 70, 'aller : arrivé');
  assert.equal(queueMoveOrder(s, map, { nationId: 'valmorne', fromId: 'p14', toId: 'p03', units: { infantry: 50 } }).ok, true);
  resolveInterturn(s, map); resolveInterturn(s, map);
  assert.equal(s.transports.length, 0);
  assert.equal(s.provinces.p03.units.infantry, 90, 'retour : arrivé');
  assert.equal(s.events.filter(e => e.type === 'convoy-arrived' && e.nationId === 'valmorne').length, 2);
  assertInvariants(s, 'aller-retour');
});

// --- Conquête d'un point de port -------------------------------------------------------------------------------
test('un point de port conquis permet de rembarquer (retour et suite de l\'anneau)', () => {
  const s = fresh();
  s.provinces.p03.units.infantry = 400; s.provinces.p14.units.infantry = 20;
  assert.equal(queueMoveOrder(s, map, { nationId: 'valmorne', fromId: 'p03', toId: 'p14', units: { infantry: 400 } }).ok, true);
  resolveInterturn(s, map); resolveInterturn(s, map);
  assert.equal(s.provinces.p14.ownerId, 'valmorne', 'Nordhème conquise par la mer');
  assert.equal(s.provinces.p14.buildings.port, 0);
  // Rembarquement depuis le point de port conquis (non construit) : retour vers Branvale.
  assert.deepEqual(sea(s, 'p14').map(d => d.id), ['p03']);
  assert.equal(queueMoveOrder(s, map, { nationId: 'valmorne', fromId: 'p14', toId: 'p03', units: { infantry: 10 } }).ok, true);
  // Glacenoire (p13) conquise à son tour : on peut continuer l'anneau vers Noireflamme (p09).
  s.provinces.p13.ownerId = 'valmorne';
  assert.deepEqual(sea(s, 'p13').map(d => d.id), ['p09']);
  assert.equal(queueMoveOrder(s, map, { nationId: 'valmorne', fromId: 'p13', toId: 'p09', units: { infantry: 10 } }).ok, true);
  // L'ancien propriétaire ne peut plus embarquer de Nordhème.
  assert.equal(queueMoveOrder(s, map, { nationId: 'oroel', fromId: 'p14', toId: 'p03', units: { infantry: 1 } }).error, 'Origine non contrôlée');
});

// --- Navires de guerre -----------------------------------------------------------------------------------------
test('navire de guerre : exige un port CONSTRUIT et une usine dans la province (message clair)', () => {
  const s = fresh(); s.nations.valmorne.treasury = 1000;
  const recruit = () => queueRecruitment(s, { nationId: 'valmorne', provinceId: 'p03', type: 'warship' });
  assert.equal(recruit().error, 'Navire de guerre : il faut un port construit et une usine dans cette province (manque : port et usine)');
  s.provinces.p03.buildings.factory = 1;
  assert.equal(recruit().error, 'Navire de guerre : il faut un port construit et une usine dans cette province (manque : port)');
  s.provinces.p03.buildings.factory = 0; s.provinces.p03.buildings.port = 1;
  assert.equal(recruit().error, 'Navire de guerre : il faut un port construit et une usine dans cette province (manque : usine)');
  s.provinces.p03.buildings.factory = 1;
  assert.equal(recruit().ok, true);
  // Province sans site de port : pas de port possible, donc pas de navire.
  s.provinces.p01.buildings.factory = 1;
  assert.match(queueRecruitment(s, { nationId: 'valmorne', provinceId: 'p01', type: 'warship' }).error, /manque : port/);
});

// --- Sauvegardes : anciens convois sur une route supprimée -----------------------------------------------------
test('ancien convoi d\'une sauvegarde sur une route supprimée (Branvale–Lunémont) : il arrive proprement', () => {
  const s = fresh();
  s.provinces.p19.ownerId = 'valmorne';
  const inf = { infantry: 0, cavalry: 0, armor: 0, artillery: 0, balloon: 0 };
  s.transports = [
    { id: 'c1', nationId: 'valmorne', fromId: 'p03', toId: 'p19', via: 'p19', lane: 'p03|p19', stage: 1, turns: 3, units: { ...inf, infantry: 40 }, warships: 0, wounds: { ...inf, warship: 0 } },
    // Débarquement V10 sur une côte voisine (p20, pas un point de port) via une route qui n'existe plus.
    { id: 'c2', nationId: 'valmorne', fromId: 'p03', toId: 'p20', via: 'p19', lane: 'p03|p19', stage: 2, turns: 3, units: { ...inf, infantry: 600 }, warships: 1, wounds: { ...inf, warship: 0 } }
  ];
  s.transportSequence = 3;
  assert.equal(convoyMarkers(s, map).length, 2, 'affichage sans plantage');
  const before = s.provinces.p19.units.infantry;
  resolveInterturn(s, map);
  assert.ok(s.events.some(e => e.naval && e.provinceId === 'p20'), 'le débarquement a lieu');
  resolveInterturn(s, map);
  assert.equal(s.provinces.p19.units.infantry, before + 40, 'renfort arrivé');
  for (let i = 0; i < 4; i++) resolveInterturn(s, map);
  assert.equal(s.transports.length, 0, 'plus aucun convoi bloqué en mer');
  assertInvariants(s, 'anciens convois');
});

// --- IA -----------------------------------------------------------------------------------------------------------
test('IA : embarque depuis un point de port qu\'elle possède, même sans port construit', () => {
  const s = createGameState({ map, playerNationId: 'valmorne' });
  for (const id of NATIONS) s.controllers[id] = 'ai';
  for (const n of Object.values(s.nations)) n.treasury = 0;
  s.diplomacy.wars.push({ active: true, participants: ['noireflamme', 'aurel'], started: 1 });
  s.provinces.p11.units.infantry = 400; s.provinces.p19.units.infantry = 10;
  assert.equal(s.provinces.p11.buildings.port, 0);
  planAIOrders(s, map);
  const o = s.orders.find(x => x.nationId === 'noireflamme' && x.kind === 'move' && x.routeType === 'sea');
  assert.ok(o, 'invasion par mer préparée');
  assert.deepEqual([o.fromId, o.toId, o.warships], ['p11', 'p19', 0]);
});

test('IA : en 40 tours, les convois partent et arrivent, toujours entre points de port', () => {
  const s = createGameState({ map, playerNationId: 'valmorne' });
  for (const id of NATIONS) s.controllers[id] = 'ai';
  for (let i = 0; i < 40; i++) {
    planAIOrders(s, map);
    for (const o of s.orders.filter(o => o.kind === 'move' && o.status === 'pending' && o.routeType === 'sea'))
      assert.ok(PORTS.includes(o.fromId) && PORTS.includes(o.toId), `${o.fromId} -> ${o.toId}`);
    resolveInterturn(s, map);
    assertInvariants(s, `IA t${s.turn}`);
  }
  assert.ok(s.events.some(e => e.type === 'convoy-departed'), 'des convois partent');
  assert.ok(s.events.some(e => e.type === 'convoy-arrived' || (e.naval && (e.type === 'conquest' || e.type === 'battle'))), 'des convois arrivent');
  assert.ok(s.events.filter(e => e.naval && (e.type === 'conquest' || e.type === 'battle')).every(e => PORTS.includes(e.provinceId)));
});

// --- Affichage ------------------------------------------------------------------------------------------------------
test('affichage : routes neutres (plus de jaune « open »), ports colorés selon le propriétaire', () => {
  const app = readFileSync(new URL('../app.js', import.meta.url), 'utf8'), css = readFileSync(new URL('../v5.css', import.meta.url), 'utf8');
  assert.doesNotMatch(css, /\.route\.maritime\.open/);
  assert.doesNotMatch(app, /maritime\$\{built/);
  assert.match(app, /class:'route maritime'/);
  assert.match(app, /inner\.style\.setProperty\('--port',color\)/);
  assert.match(app, /Point d’embarquement/);
});
