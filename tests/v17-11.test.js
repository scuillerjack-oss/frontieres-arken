// V17.11 — routes maritimes en anneau + étoile vers l'île mystérieuse (schéma de Jack du 22/11/2026,
// docs/V17-cahier-des-charges.md « V17.11 »). Carte espacée : tools/carte/anneau-v17-11.py.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { arkenV9Map as map } from '../src/map/arken-v9-map.js';
import { RULES } from '../src/domain/constants.js';
import * as E from '../src/domain/game-engine.js';
import { landDistanceFactor } from '../src/domain/realtime/marches.js';
import { decodeRealtimeSave, encodeSave } from '../src/persistence/save-codec.js';
import { root } from './helpers/sources.js';

const R = RULES.realtime, ISLE = 'p21';
const NATIONS = map.nations.map(n => n.id);
const byId = id => map.provinces.find(p => p.id === id);
const ownerOf = id => byId(id).initialOwner;
const RING_ORDER = ['valmorne', 'oroel', 'noireflamme', 'aurel', 'roc-epine']; // la couronne, dans le sens des aiguilles
const ringRoutes = map.maritimeRoutes.filter(r => !r.includes(ISLE));
const islandRoutes = map.maritimeRoutes.filter(r => r.includes(ISLE));
const PORTS = map.provinces.filter(p => p.port && !p.neutral).map(p => p.id);
const len = ([a, b]) => Math.hypot(byId(a).port.anchor.x - byId(b).port.anchor.x, byId(a).port.anchor.y - byId(b).port.anchor.y);
const orient = (a, b, c) => Math.sign((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x));
const crosses = (p1, p2, p3, p4) => orient(p1, p2, p3) * orient(p1, p2, p4) < 0 && orient(p3, p4, p1) * orient(p3, p4, p2) < 0;

test('V17.11 : 2 ports par nation, 15 routes : l’anneau (5, entre voisines) + 10 routes port → île', () => {
  assert.equal(PORTS.length, 10);
  for (const n of NATIONS) assert.equal(PORTS.filter(id => ownerOf(id) === n).length, 2, n);
  assert.equal(map.maritimeRoutes.length, 15);
  assert.equal(ringRoutes.length, 5);
  assert.deepEqual(islandRoutes.map(r => r.find(x => x !== ISLE)).sort(), [...PORTS].sort());
  // Chaque port sert à UNE route de l'anneau et à UNE route vers l'île.
  for (const id of PORTS) {
    assert.equal(ringRoutes.filter(r => r.includes(id)).length, 1, `${id} : anneau`);
    assert.equal(islandRoutes.filter(r => r.includes(id)).length, 1, `${id} : île`);
  }
  // Anneau : chaque nation reliée à ses 2 voisines de la couronne, par ses 2 ports (un de chaque côté).
  const pairs = ringRoutes.map(([a, b]) => [ownerOf(a), ownerOf(b)].sort().join('|')).sort();
  assert.deepEqual(pairs, RING_ORDER.map((n, i) => [n, RING_ORDER[(i + 1) % 5]].sort().join('|')).sort());
  for (const n of NATIONS) {
    const mine = ringRoutes.filter(r => r.some(id => ownerOf(id) === n)).map(r => r.find(id => ownerOf(id) === n));
    assert.equal(new Set(mine).size, 2, `${n} : un port vers chaque voisine`);
  }
});

test('V17.11 : routes droites (aucun virage), aucun croisement, l’anneau reste en mer', () => {
  assert.equal(map.seaLanes.length, 15);
  for (const l of map.seaLanes) assert.deepEqual(l.waypoints, [], `${l.from}-${l.to} : ligne droite`);
  const seg = l => [byId(l.from).port.anchor, byId(l.to).port.anchor];
  for (let i = 0; i < map.seaLanes.length; i++) for (let j = i + 1; j < map.seaLanes.length; j++) {
    const [a, b] = seg(map.seaLanes[i]), [c, d] = seg(map.seaLanes[j]);
    assert.ok(!crosses(a, b, c, d), `${map.seaLanes[i].from}-${map.seaLanes[i].to} croise ${map.seaLanes[j].from}-${map.seaLanes[j].to}`);
  }
  for (const l of map.seaLanes) for (const p of map.provinces) {
    if (p.id === ISLE && [l.from, l.to].includes(ISLE)) continue; // les routes de l'île arrivent en son centre
    const [a, b] = seg(l), pts = p.geometry.points.map(([x, y]) => ({ x, y }));
    for (let k = 0; k < pts.length; k++) assert.ok(!crosses(a, b, pts[k], pts[(k + 1) % pts.length]), `${l.from}-${l.to} coupe ${p.id}`);
  }
});

test('V17.11 : l’île mystérieuse à égale distance des 10 ports, plus loin que la voisine (dessin et durée)', () => {
  const toIsle = islandRoutes.map(len), ring = ringRoutes.map(len);
  assert.ok(Math.max(...toIsle) - Math.min(...toIsle) <= 2, `routes vers l'île : ${toIsle.map(Math.round)}`);
  assert.ok(Math.min(...toIsle) > Math.max(...ring), `chaque route vers l'île est plus longue que toute route de l'anneau (${ring.map(Math.round)})`);
  // Durées : toutes égales par type, île plus longue que l'anneau ; temps réel = RULES.realtime.durations.
  assert.ok(map.equalSeaRoutes);
  const s = E.createRealtimeGame({ map, playerNationId: 'valmorne', seed: 'v1711' });
  for (const [a, b] of map.maritimeRoutes) for (const [x, y] of [[a, b], [b, a]]) {
    const r = E.seaRoutesFrom(map, x).find(q => q.via === y);
    const island = [x, y].includes(ISLE);
    assert.equal(r.turns, island ? RULES.mysteryIsland.routeTurns : RULES.naval.ringTurns, `${x}→${y}`);
    assert.equal(r.turns * R.durations.landPerSeaTurn, island ? R.durations.islandSea : R.durations.sea);
  }
  assert.ok(R.durations.islandSea > R.durations.sea);
  assert.deepEqual([R.durations.sea, R.durations.islandSea], [40, 80], 'valeurs de la V17.5b gardées');
  // Un convoi réel : 80 jours depuis n'importe lequel des 10 ports vers l'île, 40 jours vers la voisine.
  for (const id of PORTS) {
    const t = E.createRealtimeGame({ map, playerNationId: ownerOf(id), seed: `v1711-${id}` });
    t.provinces[id].units.infantry = 100;
    assert.ok(E.queueMoveOrder(t, map, { nationId: ownerOf(id), fromId: id, toId: ISLE, units: { infantry: 10 } }).ok, id);
    E.executePendingOrders(t, map);
    assert.equal(t.transports.at(-1).turns, R.durations.islandSea, `${id} → île`);
  }
  assert.ok(s);
});

test('V17.11 : aucune nation inaccessible — l’anneau seul relie tout le monde, l’île aussi', () => {
  const reach = (start, routes) => {
    const seen = new Set([start]), todo = [start];
    while (todo.length) {
      const cur = todo.pop();
      const next = [...(byId(cur).landConnections || []), ...routes.filter(r => r.includes(cur)).map(r => r.find(x => x !== cur))];
      for (const n of next) if (!seen.has(n)) { seen.add(n); todo.push(n); }
    }
    return seen;
  };
  for (const n of NATIONS) {
    const cap = map.provinces.find(p => p.initialOwner === n).id;
    assert.equal(reach(cap, ringRoutes).size, 20, `${n} : toutes les provinces par l'anneau`);
    assert.equal(reach(cap, map.maritimeRoutes).size, 21, `${n} : et l'île`);
  }
  // Depuis l'île, débarquement possible chez chacune des 5 nations, sur ses 2 ports.
  const s = E.createRealtimeGame({ map, playerNationId: 'valmorne', seed: 'v1711-ile' });
  s.provinces[ISLE].ownerId = 'valmorne';
  const dest = E.legalDestinations(map, s, ISLE).map(d => d.id).sort();
  assert.deepEqual(dest, [...PORTS].sort());
});

test('V17.11 : marches à terre inchangées (îles à l’échelle 0,75, référence de distance aussi)', () => {
  const old = JSON.parse(readFileSync(join(root, 'tools/carte/arken-v9-carte.json'), 'utf8'));
  const oldCenter = Object.fromEntries(old.provinces.map(p => [p.id, p.center]));
  const lay = JSON.parse(readFileSync(join(root, 'tools/carte/anneau-v17-11-disposition.json'), 'utf8'));
  assert.equal(R.durations.landDistance.reference, 245 * lay.S);
  const L = R.durations.landDistance;
  for (const p of map.provinces) for (const q of p.landConnections) {
    const [a, b] = [oldCenter[p.id], oldCenter[q]];
    const before = Math.max(L.min, Math.min(L.max, Math.hypot(a[0] - b[0], a[1] - b[1]) / 245));
    const days = f => Math.max(1, Math.round(R.durations.land * f));
    assert.ok(Math.abs(days(landDistanceFactor(map, p.id, q)) - days(before)) <= 1, `${p.id}→${q}`);
  }
});

test('V17.11 : une partie V17.10 se recharge — convois en mer, y compris sur une route qui n’existe plus', () => {
  const s = E.createRealtimeGame({ map, playerNationId: 'valmorne', seed: 'v1710-save' });
  for (const id of NATIONS) if (id !== 'valmorne') s.controllers[id] = 'human';
  s.provinces.p03.units.infantry = 200;
  // Convoi V17.10 sur une route qui existe toujours (Branvale → île).
  assert.ok(E.queueMoveOrder(s, map, { nationId: 'valmorne', fromId: 'p03', toId: ISLE, units: { infantry: 50 } }).ok);
  E.executePendingOrders(s, map);
  E.advanceDays(s, map, 10);
  // Convoi d'une ancienne carte sur une route supprimée (Branvale → Noireflamme, V12) : renfort chez soi à l'arrivée.
  s.provinces.p09.ownerId = 'valmorne';
  s.transports.push({ id: 'c900', nationId: 'valmorne', fromId: 'p03', toId: 'p09', via: 'p09', lane: 'p03|p09', stage: 30, turns: 40,
    departed: 1, departDay: s.day - 30, arriveDay: s.day + 10, units: { infantry: 25, cavalry: 0, armor: 0, artillery: 0 }, warships: 0 });
  const saved = encodeSave(s);
  const { state: back, error } = decodeRealtimeSave(saved);
  assert.equal(error, undefined);
  assert.ok(back && back.transports.length === 2);
  let n = 0;
  while (back.transports.length && n < 200) { E.advanceDay(back, map); n++; }
  assert.equal(back.transports.length, 0, 'tous les convois sont arrivés');
  assert.ok(back.events.some(e => e.type === 'convoy-arrived' && e.fromId === 'p03' && e.toId === 'p09' && e.amount === 25), 'ancien convoi : arrivé en renfort');
  assert.ok(back.events.some(e => e.type === 'battle' || e.provinceId === ISLE || e.toId === ISLE), 'convoi vers l’île : arrivé');
});

test('V17.11 : interface — ancres de port visibles à tous les zooms (R8), pas de pastille sur l’île, carte espacée', () => {
  const css = readFileSync(join(root, 'v5.css'), 'utf8');
  assert.doesNotMatch(css, /\.detail-0 \.port-marker/, 'aucun zoom ne cache les ports (retour R8 de Jack)');
  const view = readFileSync(join(root, 'src/presentation/ui/map-view.js'), 'utf8');
  assert.match(view, /map\.provinces\.filter\(d=>d\.port&&!d\.neutral\)\.forEach\(d=>routeLayer\.push\(portMarker\(d\)\)\)/);
  assert.equal(map.image.href, 'assets/carte-arken-v17-12.jpg'); // V17.12 : îles encore écartées (même dessin)
  assert.ok(readFileSync(join(root, 'sw.js'), 'utf8').includes("'./assets/carte-arken-v17-12.jpg'"));
  // Île mystérieuse : beaucoup plus petite que chaque nation (aire < 1/10 de la plus petite nation).
  const area = pts => Math.abs(pts.reduce((s, [x, y], i) => { const [u, v] = pts[(i + 1) % pts.length]; return s + x * v - u * y; }, 0) / 2);
  const nationArea = n => map.provinces.filter(p => p.initialOwner === n).reduce((s, p) => s + area(p.geometry.points), 0);
  assert.ok(area(byId(ISLE).geometry.points) * 10 < Math.min(...NATIONS.map(nationArea)));
  // Les nations sont espacées : au moins 90 px de mer entre deux îles voisines (repère 1536).
  const gap = (n, m) => {
    let best = Infinity;
    for (const p of map.provinces.filter(x => x.initialOwner === n)) for (const q of map.provinces.filter(x => x.initialOwner === m))
      for (const [x, y] of p.geometry.points) for (const [u, v] of q.geometry.points) best = Math.min(best, Math.hypot(x - u, y - v));
    return best;
  };
  for (let i = 0; i < 5; i++) assert.ok(gap(RING_ORDER[i], RING_ORDER[(i + 1) % 5]) >= 90, `${RING_ORDER[i]} / ${RING_ORDER[(i + 1) % 5]}`);
});
