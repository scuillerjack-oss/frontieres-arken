// V10 — interface (retours bêta V9, points 4 à 8) : fonctions pures de présentation.
import test from 'node:test';
import assert from 'node:assert/strict';
import { arkenV9Map as map } from '../src/map/arken-v9-map.js';
import { createGameState } from '../src/state/create-game-state.js';
import { RULES } from '../src/domain/constants.js';
import { mapFrameTransform, territoryOutline, territoryBorders, nationsAtWarWith, trimPolyline, orderPath, missingUnitPrerequisites, unitPrerequisiteText, buildingUnavailableReason } from '../src/presentation/v5-ux.js';

const fresh = () => createGameState({ map, playerNationId: 'valmorne' });

test('V10 point 4 : glisser verticalement quand la carte est plus petite que le cadre (dézoom)', () => {
  const viewport = { width: 400, height: 760 }, size = { width: 760, height: 760 };
  // Zoom minimal : carte 400×400 dans un cadre 400×760 → avant V10, y était bloqué à 0.
  const t = mapFrameTransform({ scale: 400 / 760, x: 0, y: 150 }, viewport, size, 3, 400 / 760);
  assert.equal(t.y, 150);
  const t2 = mapFrameTransform({ scale: 400 / 760, x: 60, y: 0 }, viewport, size, 3, 400 / 760);
  assert.equal(t2.x, 60, 'glisse horizontale aussi');
});

test('V10 point 4 : la carte ne sort jamais entièrement du cadre, à tous les zooms', () => {
  const viewport = { width: 400, height: 760 }, size = { width: 760, height: 760 };
  for (const scale of [400 / 760, 1, 2, 3]) {
    const t = mapFrameTransform({ scale, x: 1e6, y: -1e6 }, viewport, size, 3, 400 / 760);
    const w = size.width * scale, h = size.height * scale;
    // Bord de carte visible : au moins une partie de la carte reste dans le cadre.
    assert.ok(Math.abs(t.x) < (w + viewport.width) / 2, `x dans le cadre au zoom ${scale}`);
    assert.ok(Math.abs(t.y) < (h + viewport.height) / 2, `y dans le cadre au zoom ${scale}`);
  }
  // edgeSlack = 0 : comportement « calé » (recentrage sur la capitale).
  const strict = mapFrameTransform({ scale: 1, x: 1e6, y: 0 }, viewport, size, 3, .5, 0);
  assert.equal(strict.x, (760 - 400) / 2);
});

test('V10 point 6 : liseré de territoire = contour extérieur, sans les frontières internes', () => {
  const ids = ['p01', 'p02', 'p03', 'p04'];
  const outline = territoryOutline(map, ids);
  const total = ids.reduce((n, id) => n + map.provinces.find(p => p.id === id).geometry.points.length, 0);
  assert.ok(outline.length > 20 && outline.length < total, 'les arêtes partagées entre provinces du joueur sont retirées');
  // Une province seule garde tout son contour.
  assert.equal(territoryOutline(map, ['p01']).length, map.provinces.find(p => p.id === 'p01').geometry.points.length);
});

test('V10 point 6 : liseré bleu pour le joueur, rouge pour chaque nation en guerre (wars.active)', () => {
  const s = fresh();
  assert.deepEqual(territoryBorders(s, map).map(b => b.kind), ['player']);
  s.diplomacy.wars.push({ active: true, participants: ['valmorne', 'roc-epine'], started: 1 });
  s.diplomacy.wars.push({ active: false, participants: ['valmorne', 'oroel'], started: 1 });
  s.diplomacy.wars.push({ active: true, participants: ['aurel', 'noireflamme'], started: 1 });
  assert.deepEqual(nationsAtWarWith(s), ['roc-epine']);
  const borders = territoryBorders(s, map);
  assert.deepEqual(borders.map(b => [b.kind, b.nationId]), [['player', 'valmorne'], ['war', 'roc-epine']]);
  assert.deepEqual(borders[1].provinceIds, ['p05', 'p06', 'p07', 'p08']);
});

test('V10 point 5 : la flèche part du point de départ et pointe sur le point (ville) d\'arrivée', () => {
  const a = map.provinces.find(p => p.id === 'p03').markerAnchor, b = map.provinces.find(p => p.id === 'p04').markerAnchor;
  const path = orderPath(map, { fromId: 'p03', toId: 'p04', routeType: 'land' });
  const [start, end] = trimPolyline(path, 26, 22);
  assert.ok(Math.abs(Math.hypot(end.x - b.x, end.y - b.y) - 22) < .01, 'la pointe s\'arrête juste avant le point');
  assert.ok(Math.abs(Math.hypot(start.x - a.x, start.y - a.y) - 26) < .01);
  // Colinéaire avec le segment centre → centre : la flèche vise bien le point.
  const cross = (end.x - a.x) * (b.y - a.y) - (end.y - a.y) * (b.x - a.x);
  assert.ok(Math.abs(cross) < 1e-6 * Math.hypot(b.x - a.x, b.y - a.y) ** 2);
});

test('V10 point 5 : par mer, la flèche suit la route puis termine sur le point, même sans port à l\'arrivée', () => {
  const lane = map.seaLanes.find(l => l.waypoints.length >= 2);
  const to = map.provinces.find(p => p.id === lane.to);
  const path = orderPath(map, { fromId: lane.from, toId: lane.to, routeType: 'sea' });
  assert.deepEqual(path.at(-1), to.markerAnchor);
  for (const w of lane.waypoints) assert.ok(path.includes(w));
  // Province d'arrivée sans port : la route existe quand même (bloquant bêta V9, point 14).
  const noPort = { ...map, provinces: map.provinces.map(p => p.id === lane.to ? { ...p, port: null } : p) };
  const path2 = orderPath(noPort, { fromId: lane.from, toId: lane.to, routeType: 'sea' });
  assert.deepEqual(path2.at(-1), to.markerAnchor);
  assert.ok(path2.length >= lane.waypoints.length + 2);
});

test('V10 point 8 : prérequis du navire de guerre affichés en clair', () => {
  const warship = RULES.units.warship;
  assert.equal(unitPrerequisiteText(warship, {}), 'Navire de guerre : nécessite une usine et un port dans cette province');
  assert.equal(unitPrerequisiteText(warship, { factory: 1 }), 'Navire de guerre : nécessite un port dans cette province');
  assert.equal(unitPrerequisiteText(warship, { factory: 1, port: 1 }), '');
  assert.equal(unitPrerequisiteText(RULES.units.armor, {}), 'Blindés : nécessite une usine dans cette province');
  assert.equal(unitPrerequisiteText(RULES.units.infantry, {}), '');
  assert.deepEqual(missingUnitPrerequisites(warship, { factory: 1 }, { port: 2 }), ['un port (en construction, 2 tours)']);
});

test('V10 point 8 : raisons en clair pour une construction indisponible', () => {
  assert.match(buildingUnavailableReason({ type: 'port', label: 'Port', portSite: false }), /pas de site portuaire/);
  assert.match(buildingUnavailableReason({ type: 'fort', label: 'Forteresse', rule: RULES.buildings.fort, count: 3 }), /niveau maximal/);
  assert.match(buildingUnavailableReason({ type: 'bank', label: 'Banque', rule: { cost: 30, max: 1 }, count: 1 }), /1 maximum par province/);
  assert.match(buildingUnavailableReason({ type: 'bank', label: 'Banque', rule: {}, cost: 30, spendable: 10 }), /il manque 20 or/);
  assert.equal(buildingUnavailableReason({ type: 'bank', label: 'Banque', rule: {}, cost: 30, spendable: 100 }), '');
});
