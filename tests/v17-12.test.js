// V17.12 — îles écartées (retour de bêta de Jack du 23/11/2026 : au zoom minimal, « une espèce de grosse tache »).
// UNIQUEMENT VISUEL : îles de la V17.11 déplacées (translation entière, même taille), cadre agrandi, zoom mesuré sur
// l'ancien cadre. Aucune durée ni règle ne change. docs/V17-cahier-des-charges.md « V17.12 ».
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { arkenV9Map as map } from '../src/map/arken-v9-map.js';
import { RULES } from '../src/domain/constants.js';
import * as E from '../src/domain/game-engine.js';
import { landDistanceFactor } from '../src/domain/realtime/marches.js';
import { decodeRealtimeSave } from '../src/persistence/save-codec.js';
import { WORLD_FIT, ZOOM_REFERENCE, wrapCopyCount, wrapMinZoom, wrapPeriod, zoomOneScale } from '../src/presentation/map-am3-view.js';
import { root } from './helpers/sources.js';

const ISLE = 'p21';
const V11 = JSON.parse(readFileSync(join(root, 'tools/carte/arken-v17-11-carte.json'), 'utf8'));
const V12 = JSON.parse(readFileSync(join(root, 'tools/carte/arken-v17-12-carte.json'), 'utf8'));
const old = Object.fromEntries(V11.provinces.map(p => [p.id, p]));
const byId = id => map.provinces.find(p => p.id === id);
const RING_ORDER = ['valmorne', 'oroel', 'noireflamme', 'aurel', 'roc-epine'];
const owned = n => map.provinces.filter(p => p.initialOwner === n);
const anchorOld = id => ({ x: old[id].port.anchor[0], y: old[id].port.anchor[1] });
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const ringRoutes = map.maritimeRoutes.filter(r => !r.includes(ISLE));
const islandRoutes = map.maritimeRoutes.filter(r => r.includes(ISLE));
const mean = a => a.reduce((s, x) => s + x, 0) / a.length;
// Plus courte distance de côte à côte (sommets des polygones) entre deux groupes de provinces.
const coastGap = (A, B) => {
  let best = Infinity;
  for (const p of A) for (const q of B) for (const [x, y] of p) for (const [u, v] of q) best = Math.min(best, Math.hypot(x - u, y - v));
  return best;
};
const polysNew = ids => ids.map(id => byId(id).geometry.points);
const polysOld = ids => ids.map(id => old[id].polygon);
const idsOf = n => n === ISLE ? [ISLE] : owned(n).map(p => p.id);

test('V17.12 : taille des îles inchangée — chaque île est la même qu’en V17.11, décalée d’un vecteur entier (sans rotation)', () => {
  for (const isl of map.islands) {
    const ids = isl.provinces, first = ids[0];
    const dx = byId(first).geometry.points[0][0] - old[first].polygon[0][0], dy = byId(first).geometry.points[0][1] - old[first].polygon[0][1];
    assert.ok(Number.isInteger(dx) && Number.isInteger(dy));
    for (const id of ids) {
      assert.deepEqual(byId(id).geometry.points, old[id].polygon.map(([x, y]) => [x + dx, y + dy]), `${id} : même contour`);
      assert.deepEqual([byId(id).markerAnchor.x, byId(id).markerAnchor.y], [old[id].center[0] + dx, old[id].center[1] + dy], `${id} : même repère`);
    }
  }
  // Identifiants, voisinages et routes inchangés (seules les coordonnées bougent).
  assert.deepEqual(map.provinces.map(p => [p.id, p.initialOwner, p.landmassId, [...p.landConnections].sort().join()]),
    V11.provinces.map(p => [p.id, p.nation, p.island, [...p.landNeighbors].sort().join()]));
  assert.deepEqual(V12.seaRoutes.map(r => `${r.from}-${r.to}`), V11.seaRoutes.map(r => `${r.from}-${r.to}`));
  assert.deepEqual(map.provinces.filter(p => p.port).map(p => p.id), V11.provinces.filter(p => p.port).map(p => p.id), 'mêmes provinces portuaires');
});

test('V17.12 : écarts agrandis (≈ ×2,5 entre voisines), l’île mystérieuse reste la plus loin (proportions de l’anneau)', () => {
  // Mer entre deux voisines de la couronne (côte à côte) : ×2,5 en moyenne, au moins ×1,4 chacune.
  const ratios = RING_ORDER.map((n, i) => {
    const m = RING_ORDER[(i + 1) % 5];
    return coastGap(polysNew(idsOf(n)), polysNew(idsOf(m))) / coastGap(polysOld(idsOf(n)), polysOld(idsOf(m)));
  });
  assert.ok(Math.min(...ratios) >= 1.4 && mean(ratios) >= 2.2, `voisines : ${ratios.map(r => r.toFixed(2))}`);
  // Mer entre chaque nation et l'île mystérieuse : agrandie elle aussi (au moins ×1,5).
  const toIsle = RING_ORDER.map(n => coastGap(polysNew(idsOf(n)), polysNew([ISLE])) / coastGap(polysOld(idsOf(n)), polysOld([ISLE])));
  assert.ok(Math.min(...toIsle) >= 1.5, `île : ${toIsle.map(r => r.toFixed(2))}`);
  // Routes dessinées : anneau ×2,3 en moyenne ; routes de l'île 430 → 600 px, toutes égales.
  const len = ([a, b]) => dist(byId(a).port.anchor, byId(b).port.anchor), lenOld = ([a, b]) => dist(anchorOld(a), anchorOld(b));
  assert.ok(mean(ringRoutes.map(r => len(r) / lenOld(r))) >= 2.2, 'anneau : routes ≈ ×2,3');
  const isle = islandRoutes.map(len);
  assert.ok(Math.max(...isle) - Math.min(...isle) <= 2 && Math.min(...isle) >= 598, `île : ${isle.map(Math.round)}`);
  assert.ok(mean(isle) / mean(islandRoutes.map(lenOld)) >= 1.39);
  // Proportions : chaque route vers l'île est plus longue que TOUTE route de l'anneau (l'île reste au loin, au centre).
  assert.ok(Math.min(...isle) > Math.max(...ringRoutes.map(len)) * 1.1, 'île nettement plus loin que deux voisines (≥ 10 % de plus que la plus longue route de l’anneau)');
  // Le monde est plus grand (cadre 1826 × 1900 au lieu de 1536 × 1536).
  assert.deepEqual([map.frame.width, map.frame.height], [1826, 1900]);
  assert.deepEqual([map.image.width, map.image.height], [1826, 1900]);
});

test('V17.12 : durées strictement identiques — anneau 40 j, île 80 j, marches à terre au jour près', () => {
  assert.ok(map.equalSeaRoutes);
  assert.deepEqual([RULES.naval.ringTurns, RULES.mysteryIsland.routeTurns], [2, 4]);
  assert.deepEqual([RULES.realtime.durations.sea, RULES.realtime.durations.islandSea], [40, 80]);
  assert.equal(RULES.realtime.durations.landDistance.reference, 183.75);
  for (const [a, b] of map.maritimeRoutes) for (const [x, y] of [[a, b], [b, a]]) {
    const r = E.seaRoutesFrom(map, x).find(q => q.via === y);
    assert.equal(r.turns, [x, y].includes(ISLE) ? 4 : 2, `${x}→${y}`);
  }
  // Marches à terre : facteur de distance EXACTEMENT celui de la V17.11 (distances internes à une île identiques).
  const v11Map = { provinces: V11.provinces.map(p => ({ id: p.id, markerAnchor: { x: p.center[0], y: p.center[1] } })) };
  for (const p of map.provinces) for (const q of p.landConnections) assert.equal(landDistanceFactor(map, p.id, q), landDistanceFactor(v11Map, p.id, q), `${p.id}→${q}`);
  // Un vrai convoi : 80 jours vers l'île depuis chacun des 10 ports, 40 jours vers la voisine.
  for (const id of islandRoutes.map(r => r.find(x => x !== ISLE))) {
    const n = byId(id).initialOwner, s = E.createRealtimeGame({ map, playerNationId: n, seed: `v1712-${id}` });
    s.provinces[id].units.infantry = 100;
    assert.ok(E.queueMoveOrder(s, map, { nationId: n, fromId: id, toId: ISLE, units: { infantry: 10 } }).ok, id);
    const ring = ringRoutes.find(r => r.includes(id)), to = ring.find(x => x !== id);
    assert.ok(E.queueMoveOrder(s, map, { nationId: n, fromId: id, toId: to, units: { infantry: 10 } }).ok, `${id}→${to}`);
    E.executePendingOrders(s, map);
    const days = s.transports.map(t => [t.toId, t.arriveDay - t.departDay]).sort();
    assert.deepEqual(days, [[ISLE, 80], [to, 40]].sort(), id);
  }
});

test('V17.12 : le moteur ignore la longueur dessinée — même un ordre sans durée prend la durée de sa route', () => {
  const src = readFileSync(join(root, 'src/domain/engine/convoys.js'), 'utf8');
  assert.doesNotMatch(src, /seaTravelTurns\(/, 'plus aucun calcul de durée depuis la longueur dans les convois');
  assert.match(src, /turns: o\.turns \|\| routeTurns\(o\.fromId, o\.via \|\| o\.toId, laneOf\(map, o\.fromId, o\.via \|\| o\.toId\)\?\.length, map\)/);
  // Aucun module du domaine ne lit les coordonnées des ports ni la longueur des routes pour une durée.
  for (const f of ['src/domain/engine/sea-routes.js', 'src/domain/engine/ai-naval.js', 'src/domain/vision.js', 'src/domain/engine/balloons.js', 'src/domain/engine/bombard.js'])
    assert.doesNotMatch(readFileSync(join(root, f), 'utf8'), /port\.anchor|markerAnchor|geometry\.points/, f);
});

test('V17.12 : une vraie sauvegarde V17.11 (convois en mer) se charge et continue EXACTEMENT comme en V17.11', () => {
  const fx = JSON.parse(readFileSync(join(root, 'tests/data/sauvegarde-v17-11.json'), 'utf8'));
  assert.equal(fx.version, '17.11.0');
  const { state, error } = decodeRealtimeSave(fx.save);
  assert.equal(error, undefined);
  assert.equal(state.transports.length, fx.transports);
  assert.ok(state.transports.some(t => t.toId === ISLE) && state.transports.some(t => t.toId !== ISLE), 'convois vers l’île et vers une voisine');
  for (let i = 0; i < 400 && !state.gameOver; i++) E.advanceDay(state, map);
  assert.equal(createHash('sha256').update(JSON.stringify(state)).digest('hex'), fx.after400, '400 jours plus tard : état identique, au bit près, à celui calculé par le code V17.11');
});

test('V17.12 : zoom — zoom max et vue de lancement identiques à la V17.11, zoom min = monde entier (paysage et portrait)', () => {
  const frame = map.frame, P = wrapPeriod(frame);
  const view = readFileSync(join(root, 'src/presentation/ui/map-view.js'), 'utf8');
  assert.match(view, /const cover=zoomOneScale\(frameSize,ZOOM_REFERENCE\);/);
  assert.match(view, /minZoom=wrapMinZoom\(frameSize,FRAME,PERIOD,undefined,ZOOM_REFERENCE\)/);
  assert.match(view, /MAX_ZOOM = 3,/);
  assert.deepEqual(ZOOM_REFERENCE, { width: 1536, height: 1536 });
  const pts = map.provinces.flatMap(d => d.geometry.points), xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  const W = Math.max(...xs) - Math.min(...xs), H = Math.max(...ys) - Math.min(...ys);
  for (const vp of [{ width: 844, height: 390 }, { width: 860, height: 390 }, { width: 667, height: 375 }, { width: 390, height: 844 }]) {
    // Zoom max : autant de pixels par unité de carte qu'en V17.11 (cadre 1536 × 1536, zoom 3) → rien n'est plus petit.
    const before = 3 * Math.max(vp.width / 1536, vp.height / 1536);
    assert.ok(Math.abs(3 * zoomOneScale(vp) - before) < 1e-12, JSON.stringify(vp));
    // Zoom min : les 5 nations et l'île tiennent à l'écran, et jamais deux fois le même point.
    const z = wrapMinZoom(vp, frame, P, WORLD_FIT, ZOOM_REFERENCE), k = z * zoomOneScale(vp);
    assert.ok(W * k <= vp.width * .75 && H * k <= vp.height * .75, `monde entier ${JSON.stringify(vp)}`);
    assert.ok(vp.width <= P * k, `jamais deux fois la même nation ${JSON.stringify(vp)}`);
    assert.equal(wrapCopyCount(vp.width, P * k), 1);
    // Plus dézoomé qu'en V17.11 (le monde est plus grand) mais pas démesurément.
    const v11 = wrapMinZoom(vp, { width: 1536, height: 1536 });
    assert.ok(z < v11 && z > v11 * .6, `${JSON.stringify(vp)} : ${z.toFixed(3)} / ${v11.toFixed(3)}`);
  }
});

test('V17.12 : nouvelle image (poids raisonnable), en cache hors ligne ; outils de carte présents', () => {
  const sw = readFileSync(join(root, 'sw.js'), 'utf8');
  assert.equal(map.image.href, 'assets/carte-arken-v17-12.jpg');
  assert.ok(sw.includes("'./assets/carte-arken-v17-12.jpg'"));
  assert.ok(!sw.includes("'./assets/carte-arken-v17-11.jpg'"), 'l’ancienne image n’est plus mise en cache');
  const jpg = readFileSync(join(root, 'assets/carte-arken-v17-12.jpg'));
  assert.ok(jpg.length < 420 * 1024, `${Math.round(jpg.length / 1024)} Ko`);
  const lay = JSON.parse(readFileSync(join(root, 'tools/carte/anneau-v17-12-disposition.json'), 'utf8'));
  assert.equal(lay.S, 0.75);
  assert.deepEqual(lay.frame, [1826, 1900]);
  assert.equal(JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version, '17.13.0');
});
