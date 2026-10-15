// Carte V9 « Leonardo » : données, mer, IA maritime et résolution simultanée.
// Les tests de verrouillage V6 restent sur arken-v1-map (tests/helpers/fixtures.js).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { arkenV9Map as map, provinceByIdV9 as byId, ARKEN_V9_MAP_ID } from '../src/map/arken-v9-map.js';
import { arkenV1Map } from '../src/map/arken-v1-map.js';
import { validateMapDefinition } from '../src/map/validate-map.js';
import { createGameState } from '../src/state/create-game-state.js';
import { legalDestinations, queueMoveOrder, resolveInterturn } from '../src/domain/game-engine.js';
import { pointInPolygon } from '../src/presentation/v4-ux.js';
import { playerOrderArrows, orderPath } from '../src/presentation/v5-ux.js';
import { encodeSave, decodeSave } from '../src/persistence/save-codec.js';
import { seededRandom, assertInvariants } from './helpers/fixtures.js';

const NATIONS = map.nations.map(n => n.id);
const fresh = ({ player = 'valmorne', allHuman = false, allAI = false } = {}) => {
  const s = createGameState({ map, playerNationId: player });
  for (const id of NATIONS) s.controllers[id] = allHuman ? 'human' : allAI ? 'ai' : s.controllers[id];
  return s;
};
const islandOf = id => byId(id).landmassId;
const reach = start => { const seen = new Set([start]), todo = [start]; while (todo.length) for (const n of byId(todo.pop()).landConnections) if (!seen.has(n)) { seen.add(n); todo.push(n); } return seen; };

test('V9 : validate-map OK, nouvel identifiant de carte', () => {
  assert.deepEqual(validateMapDefinition(map), { valid: true, errors: [] });
  assert.equal(map.id, ARKEN_V9_MAP_ID);
  assert.notEqual(map.id, arkenV1Map.id, 'nouvelle carte = nouvel identifiant');
});

test('V9 : 20 provinces p01..p20 dans le même ordre, 5 nations, 4 provinces par nation', () => {
  assert.deepEqual(map.provinces.map(p => p.id), arkenV1Map.provinces.map(p => p.id));
  assert.equal(map.nations.length, 5);
  for (const n of map.nations) assert.equal(map.provinces.filter(p => p.initialOwner === n.id).length, 4, n.id);
});

test('V9 : identifiants, noms, nations, couleurs et biomes identiques à la V6', () => {
  assert.deepEqual(map.nations.map(n => ({ ...n })), arkenV1Map.nations.map(n => ({ ...n })));
  for (const [i, p] of map.provinces.entries()) {
    const old = arkenV1Map.provinces[i];
    assert.deepEqual([p.id, p.name, p.initialOwner, p.biome], [old.id, old.name, old.initialOwner, old.biome]);
  }
});

test('V9 : capitales = 1re province de chaque nation (p01, p05, p09, p13, p17)', () => {
  const s = fresh();
  assert.deepEqual(Object.fromEntries(NATIONS.map(id => [id, s.nations[id].capitalId])),
    { valmorne: 'p01', 'roc-epine': 'p05', noireflamme: 'p09', oroel: 'p13', aurel: 'p17' });
  assert.equal(s.mapId, ARKEN_V9_MAP_ID);
});

test('V9 : voisinages terrestres symétriques, sans boucle ni doublon, limités à chaque île', () => {
  for (const p of map.provinces) {
    assert.ok(!p.landConnections.includes(p.id));
    assert.equal(new Set(p.landConnections).size, p.landConnections.length);
    for (const to of p.landConnections) {
      assert.ok(byId(to).landConnections.includes(p.id), `${p.id}->${to} asymétrique`);
      assert.equal(islandOf(to), islandOf(p.id), `${p.id}->${to} traverse la mer`);
    }
  }
});

test('V9 : chaque île = une nation, 4 provinces, connexe par la terre', () => {
  const islands = new Set(map.provinces.map(p => p.landmassId));
  assert.equal(islands.size, 5);
  for (const island of islands) {
    const members = map.provinces.filter(p => p.landmassId === island);
    assert.equal(members.length, 4);
    assert.equal(new Set(members.map(p => p.initialOwner)).size, 1, `${island} partagée`);
    assert.equal(reach(members[0].id).size, 4, `${island} non connexe`);
  }
});

test('V9 : chaque paire d\'îles est reliée par une route maritime entre deux sites de port', () => {
  const islands = [...new Set(map.provinces.map(p => p.landmassId))];
  const pairs = new Set(map.maritimeRoutes.map(([a, b]) => [islandOf(a), islandOf(b)].sort().join('|')));
  for (let i = 0; i < islands.length; i++) for (let j = i + 1; j < islands.length; j++)
    assert.ok(pairs.has([islands[i], islands[j]].sort().join('|')), `${islands[i]} - ${islands[j]} sans route`);
  assert.equal(map.maritimeRoutes.length, 10);
  for (const [a, b] of map.maritimeRoutes) {
    assert.ok(byId(a).port && byId(b).port, `${a}-${b} : extrémité sans port`);
    assert.notEqual(islandOf(a), islandOf(b));
  }
  for (const island of islands) assert.ok(map.provinces.some(p => p.landmassId === island && p.port), `${island} sans port`);
  assert.equal(map.seaLanes.length, map.maritimeRoutes.length);
});

test('V9 : la mer s\'ouvre avec les mécaniques V6 (deux ports construits) dans les deux sens', () => {
  const s = fresh({ allHuman: true });
  assert.equal(legalDestinations(map, s, 'p03').some(d => d.type === 'sea'), false);
  for (const p of map.provinces) if (p.port) s.provinces[p.id].buildings.port = 1;
  for (const [a, b] of map.maritimeRoutes) {
    assert.ok(legalDestinations(map, s, a).some(d => d.id === b && d.type === 'sea'), `${a}->${b}`);
    assert.ok(legalDestinations(map, s, b).some(d => d.id === a && d.type === 'sea'), `${b}->${a}`);
  }
  // Depuis ses ports, chaque île atteint les 4 autres.
  for (const island of new Set(map.provinces.map(p => p.landmassId))) {
    const reached = new Set(map.provinces.filter(p => p.landmassId === island && p.port).flatMap(p => legalDestinations(map, s, p.id).filter(d => d.type === 'sea').map(d => islandOf(d.id))));
    assert.equal(reached.size, 4, `${island} n'atteint que ${[...reached]}`);
  }
});

test('V9 : zones tactiles = polygones dans l\'image, sans chevauchement, centre dans sa province (B7)', () => {
  const { width, height } = map.frame;
  assert.deepEqual([width, height], [1536, 1536]);
  for (const p of map.provinces) {
    assert.ok(p.geometry.points.length >= 3);
    for (const [x, y] of p.geometry.points) assert.ok(x >= 0 && x <= width && y >= 0 && y <= height, `${p.id} hors image`);
    assert.ok(pointInPolygon(p.markerAnchor, p.geometry.points), `${p.id} centre hors polygone`);
  }
  const overlaps = new Set();
  for (let x = 0; x < width; x += 4) for (let y = 0; y < height; y += 4) {
    const hit = map.provinces.filter(p => pointInPolygon({ x, y }, p.geometry.points)).map(p => p.id);
    if (hit.length > 1) overlaps.add(hit.join('+'));
  }
  assert.deepEqual([...overlaps], []);
  for (const p of map.provinces) if (p.port)
    assert.ok(!map.provinces.some(q => pointInPolygon(p.port.anchor, q.geometry.points)), `ancre de ${p.id} sur la terre`);
});

test('V9 : flèche d\'un ordre maritime = tracé de la route (ancres des ports + waypoints)', () => {
  const s = fresh({ allHuman: true });
  s.provinces.p07.buildings.port = 1; s.provinces.p13.buildings.port = 1;
  assert.equal(queueMoveOrder(s, map, { nationId: 'roc-epine', fromId: 'p07', toId: 'p13', units: { infantry: 10 } }).ok, true);
  s.playerNationId = 'roc-epine';
  const [arrow] = playerOrderArrows(s, map);
  assert.equal(arrow.routeType, 'sea');
  const path = orderPath(map, arrow);
  const lane = map.seaLanes.find(l => l.from === 'p07' && l.to === 'p13');
  assert.deepEqual(path, [byId('p07').markerAnchor, byId('p07').port.anchor, ...lane.waypoints, byId('p13').port.anchor, byId('p13').markerAnchor]);
  // Sens inverse : même tracé retourné.
  const back = orderPath(map, { fromId: 'p13', toId: 'p07', routeType: 'sea' });
  assert.deepEqual(back, [...path].reverse());
  // Ordre terrestre : segment direct entre centres.
  assert.deepEqual(orderPath(map, { fromId: 'p05', toId: 'p06', routeType: 'land' }), [byId('p05').markerAnchor, byId('p06').markerAnchor]);
});

test('V9 résolution simultanée : « j\'attaque X→Y pendant qu\'on attaque X » résolu dans le même tour', () => {
  // Valmorne attaque p03 (X) → p04 (Y, tenue par Roc-Épine) ; Noireflamme (qui tient p02 = Z) attaque p03.
  const s = fresh({ allHuman: true });
  s.provinces.p04.ownerId = 'roc-epine';
  s.provinces.p02.ownerId = 'noireflamme';
  s.provinces.p03.units.infantry = 100;
  s.provinces.p02.units.infantry = 300;
  assert.equal(queueMoveOrder(s, map, { nationId: 'valmorne', fromId: 'p03', toId: 'p04', units: { infantry: 100 } }).ok, true);
  assert.equal(queueMoveOrder(s, map, { nationId: 'noireflamme', fromId: 'p02', toId: 'p03', units: { infantry: 300 } }).ok, true);
  resolveInterturn(s, map);
  assert.equal(s.turn, 2);
  assert.equal(s.orders.length, 0);
  const fights = s.events.filter(e => e.type === 'battle' || e.type === 'conquest').map(e => [e.type, e.attacker, e.provinceId]);
  // Comportement V6 conservé (voir AUDIT B1) : cibles traitées par identifiant, p03 avant p04.
  assert.deepEqual(fights, [['conquest', 'noireflamme', 'p03'], ['battle', 'valmorne', 'p04']]);
  assert.equal(s.provinces.p03.ownerId, 'noireflamme');
  assert.equal(s.provinces.p04.ownerId, 'roc-epine');
  assertInvariants(s, 'V9 simultané');
});

test('V9 résolution simultanée : un débarquement part le même tour qu\'une attaque terrestre et arrive deux inter-tours plus tard', () => {
  const s = fresh({ allHuman: true });
  s.provinces.p03.buildings.port = 1; s.provinces.p14.buildings.port = 1; s.provinces.p03.warships = 3;
  s.provinces.p13.units.infantry = 400;
  queueMoveOrder(s, map, { nationId: 'valmorne', fromId: 'p03', toId: 'p14', units: { infantry: 20 }, warships: 3 });
  queueMoveOrder(s, map, { nationId: 'oroel', fromId: 'p13', toId: 'p14', units: { infantry: 400 } });
  resolveInterturn(s, map);
  assert.equal(s.transports.length, 1, 'flotte embarquée');
  assert.equal(s.provinces.p14.units.infantry, 440, 'renfort amical appliqué dans le même inter-tour');
  resolveInterturn(s, map);
  const naval = s.events.find(e => e.naval);
  assert.ok(naval, 'combat naval à l\'arrivée');
  assert.equal(naval.provinceId, 'p14');
  assert.equal(s.transports.length, 0);
  assertInvariants(s, 'V9 débarquement');
});

// --- Simulation IA contre IA sur la carte V9 ---------------------------------------------------
let originalRandom, randomCalls = 0;
before(() => { originalRandom = Math.random; const r = seededRandom(99); Math.random = () => { randomCalls++; return r(); }; });
after(() => { Math.random = originalRandom; });

const TURNS = 200;
const games = {};
function simulate(player, turns = TURNS) {
  const s = fresh({ player, allAI: true });
  for (let i = 0; i < turns; i++) { resolveInterturn(s, map); assertInvariants(s, `V9 IA(${player})`); }
  return s;
}

for (const player of NATIONS) {
  test(`V9 IA contre IA (${player}) : ${TURNS} tours, invariants à chaque tour, combats et conquêtes inter-îles`, () => {
    const s = games[player] = simulate(player);
    assert.equal(s.turn, TURNS + 1);
    const crossIsland = s.events.filter(e => (e.type === 'battle' || e.type === 'conquest') && (e.originIds || []).some(o => islandOf(o) !== islandOf(e.provinceId)));
    assert.ok(crossIsland.length >= 3, `IA passive : ${crossIsland.length} combat(s) inter-îles`);
    assert.ok(crossIsland.some(e => e.type === 'conquest'), 'au moins une conquête par la mer');
    assert.ok(crossIsland.every(e => e.naval), 'tout combat inter-îles passe par la mer');
    // Plus aucune île n'appartient entièrement à sa nation d'origine au bout de 200 tours dans au moins un cas.
    const moved = map.provinces.filter(p => s.provinces[p.id].ownerId !== p.initialOwner).length;
    assert.ok(moved > 0, 'la carte a bougé');
  });
}

test('V9 IA : pas suicidaire — chaque débarquement est escorté et la plupart réussissent', () => {
  let landings = 0, wins = 0;
  for (const s of Object.values(games)) for (const e of s.events.filter(x => x.naval && (x.type === 'battle' || x.type === 'conquest'))) { landings++; if (e.type === 'conquest') wins++; }
  assert.ok(landings > 0);
  assert.ok(wins / landings >= .6, `${wins}/${landings} débarquements réussis`);
});

test('V9 IA : déterministe (deux parties identiques) et sans Math.random', () => {
  const a = simulate('oroel', 80), b = simulate('oroel', 80);
  assert.deepEqual(a, b);
  assert.equal(randomCalls, 0);
});

test('V9 : sauvegarde/reprise d\'une partie IA en cours (transports en mer compris) donne la même suite', () => {
  const a = simulate('aurel', 60);
  const b = decodeSave(encodeSave(a));
  assert.equal(b.mapId, ARKEN_V9_MAP_ID);
  for (let i = 0; i < 30; i++) { resolveInterturn(a, map); resolveInterturn(b, map); }
  assert.deepEqual(b, a);
});
