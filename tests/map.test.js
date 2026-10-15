import { test } from 'node:test';
import assert from 'node:assert/strict';
import { arkenV1Map, nationsV1, provinceById } from '../src/map/arken-v1-map.js';
import { validateMapDefinition } from '../src/map/validate-map.js';
import { NATION_IDS, MAP_SCHEMA_VERSION } from '../src/domain/constants.js';

const map = arkenV1Map;

test('carte V6 : validate-map OK', () => {
  assert.deepEqual(validateMapDefinition(map), { valid: true, errors: [] });
  assert.equal(map.schemaVersion, MAP_SCHEMA_VERSION);
  assert.equal(map.id, 'arken-v1-original-map'); // utilisé par app.js pour accepter une sauvegarde
});

test('carte V6 : 20 provinces p01..p20, 5 nations, 4 provinces par nation', () => {
  assert.equal(map.provinces.length, 20);
  assert.deepEqual(map.provinces.map(p => p.id), Array.from({ length: 20 }, (_, i) => `p${String(i + 1).padStart(2, '0')}`));
  assert.equal(map.nations.length, 5);
  for (const n of map.nations) assert.equal(map.provinces.filter(p => p.initialOwner === n.id).length, 4, n.id);
});

test('carte V6 : voisinages terrestres symétriques, sans boucle ni doublon', () => {
  for (const p of map.provinces) {
    assert.ok(!p.landConnections.includes(p.id), `${p.id} voisin de lui-même`);
    assert.equal(new Set(p.landConnections).size, p.landConnections.length, `${p.id} doublon`);
    for (const to of p.landConnections) assert.ok(provinceById(to).landConnections.includes(p.id), `${p.id}->${to} asymétrique`);
  }
});

test('carte V6 : voisinages figés (référence pour la V9)', () => {
  const adj = Object.fromEntries(map.provinces.map(p => [p.id, p.landConnections.join(',')]));
  assert.deepEqual(adj, {
    p01: 'p02,p04', p02: 'p01,p03,p04', p03: 'p02,p04,p07', p04: 'p01,p02,p03,p05,p06',
    p05: 'p04,p06,p08,p09', p06: 'p04,p05,p07,p08', p07: 'p03,p06,p08', p08: 'p05,p06,p07,p09,p10',
    p09: 'p05,p08,p10,p11', p10: 'p08,p09,p11,p12', p11: 'p09,p10,p12', p12: 'p10,p11',
    p13: 'p14', p14: 'p13,p15,p16', p15: 'p14,p16', p16: 'p14,p15,p17',
    p17: 'p16,p18,p19', p18: 'p17,p20', p19: 'p17,p20', p20: 'p18,p19'
  });
});

test('carte V6 : 2 masses terrestres (ouest p01-p12, est p13-p20), reliées seulement par mer', () => {
  const reach = start => { const seen = new Set([start]), todo = [start]; while (todo.length) for (const n of provinceById(todo.pop()).landConnections) if (!seen.has(n)) { seen.add(n); todo.push(n); } return seen; };
  assert.equal(reach('p01').size, 12);
  assert.equal(reach('p13').size, 8);
  assert.deepEqual(new Set(map.provinces.map(p => p.landmassId)), new Set(['west', 'east']));
});

test('carte V6 : ports et routes maritimes', () => {
  const ports = map.provinces.filter(p => p.port).map(p => p.id);
  assert.deepEqual(ports, ['p07', 'p11', 'p12', 'p13', 'p15', 'p16', 'p17', 'p20']);
  for (const p of map.provinces) if (p.port) assert.ok(p.coastal, `${p.id} port non côtier`);
  assert.deepEqual(map.maritimeRoutes, [['p07', 'p13'], ['p07', 'p17'], ['p12', 'p17'], ['p12', 'p20'], ['p15', 'p20']]);
  for (const [a, b] of map.maritimeRoutes) assert.ok(provinceById(a).port && provinceById(b).port, `${a}-${b}`);
  // Chaque nation a au moins un site de port (valmorne n'en a AUCUN : elle ne peut jamais prendre la mer depuis chez elle).
  const portByNation = Object.fromEntries(map.nations.map(n => [n.id, map.provinces.filter(p => p.initialOwner === n.id && p.port).length]));
  assert.deepEqual(portByNation, { valmorne: 0, 'roc-epine': 1, noireflamme: 2, oroel: 3, aurel: 2 });
});

test('carte V6 : géométrie = hexagones générés autour d\'une ancre, repère 400×260', () => {
  for (const p of map.provinces) {
    assert.equal(p.geometry.type, 'polygon');
    assert.equal(p.geometry.points.length, 6);
    for (const [x, y] of p.geometry.points) assert.ok(x >= 0 && x <= 400 && y >= 0 && y <= 260, `${p.id} hors repère`);
  }
  assert.deepEqual(provinceById('p01').markerAnchor, { x: 48, y: 42 });
});

test('deux listes de nations : NATION_IDS (constants.js) ne correspond pas à la carte — code mort', () => {
  assert.deepEqual([...NATION_IDS], ['arken', 'valdor', 'kael', 'sol', 'nerys']);
  assert.deepEqual(nationsV1.map(n => n.id), ['valmorne', 'roc-epine', 'noireflamme', 'oroel', 'aurel']);
  assert.equal(map.nations, nationsV1); // c'est cette liste que le jeu utilise
  assert.ok(NATION_IDS.every(id => !nationsV1.some(n => n.id === id)), 'aucun identifiant commun');
});

test('BUG CONNU : zones tactiles qui se chevauchent (p04/p06 et p08/p10) — à corriger par la carte V9', async () => {
  const { pointInPolygon } = await import('../src/presentation/v4-ux.js');
  const overlaps = new Set();
  for (let x = 0; x < 400; x++) for (let y = 0; y < 260; y++) {
    const hit = map.provinces.filter(p => pointInPolygon({ x, y }, p.geometry.points)).map(p => p.id);
    if (hit.length > 1) overlaps.add(hit.join('+'));
  }
  assert.deepEqual([...overlaps].sort(), ['p04+p06', 'p08+p10']);
  for (const p of map.provinces) assert.ok(pointInPolygon(p.markerAnchor, p.geometry.points), `${p.id} ancre hors polygone`);
});
