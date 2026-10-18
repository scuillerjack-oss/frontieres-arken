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
  // V13 : les routes de l'anneau sont droites ; on ajoute 2 points de passage à une route pour tester le tracé.
  const base = map.seaLanes[0], A = map.provinces.find(p => p.id === base.from).port.anchor, B = map.provinces.find(p => p.id === base.to).port.anchor;
  const lane = { ...base, waypoints: [{ x: A.x + (B.x - A.x) / 3, y: A.y + (B.y - A.y) / 3 + 5 }, { x: A.x + 2 * (B.x - A.x) / 3, y: A.y + 2 * (B.y - A.y) / 3 - 5 }] };
  const wmap = { ...map, seaLanes: [lane, ...map.seaLanes.slice(1)] };
  const to = map.provinces.find(p => p.id === lane.to);
  const path = orderPath(wmap, { fromId: lane.from, toId: lane.to, routeType: 'sea' });
  assert.deepEqual(path.at(-1), to.markerAnchor);
  for (const w of lane.waypoints) assert.ok(path.includes(w));
  // Province d'arrivée sans port : la route existe quand même (bloquant bêta V9, point 14).
  const noPort = { ...wmap, provinces: map.provinces.map(p => p.id === lane.to ? { ...p, port: null } : p) };
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

// --- V10 marine et moteur : affichage (convois, PV, journal) ------------------------------------------------------
import { convoyMarkers, convoySeaPath, pointAlong, forceHealthRows, journalCategoryClass } from '../src/presentation/v5-ux.js';
import { TUTORIAL_GUIDE } from '../src/presentation/v4-ux.js';
import { journalEntry } from '../src/domain/game-engine.js';

test('V10 marine : jeton de convoi placé à son étape sur la route, tours restants, points d\'étape', () => {
  const s = fresh();
  s.transports.push({ id: 'c1', nationId: 'valmorne', fromId: 'p03', toId: 'p20', via: 'p19', lane: 'p03|p19', stage: 1, turns: 3, units: { infantry: 40, cavalry: 0, armor: 0, artillery: 0 }, warships: 2, wounds: {} });
  s.transports.push({ id: 'c2', nationId: 'oroel', fromId: 'p14', toId: 'p03', via: 'p03', lane: 'p03|p14', stage: 0, turns: 2, units: { infantry: 20 }, warships: 0, wounds: {} });
  const [mine, theirs] = convoyMarkers(s, map);
  assert.deepEqual([mine.remaining, mine.stages.length, mine.troops, mine.warships], [2, 2, 40, 2]);
  const path = convoySeaPath(map, s.transports[0]);
  assert.deepEqual(path[0], map.provinces.find(p => p.id === 'p03').port.anchor);
  assert.deepEqual(path.at(-1), map.provinces.find(p => p.id === 'p19').port.anchor);
  assert.deepEqual(mine.position, pointAlong(path, 1 / 3));
  // Convoi étranger : composition cachée ; au départ, sur l'ancre du port d'origine (sens p14 → p03).
  assert.deepEqual([theirs.own, theirs.troops, theirs.warships], [false, null, null]);
  assert.deepEqual(theirs.position, map.provinces.find(p => p.id === 'p14').port.anchor);
});

test('V10 : PV lisibles dans la fiche (« 8 blindés · 92 % PV »)', () => {
  const hp = Object.fromEntries(Object.entries(RULES.combat.units).map(([k, u]) => [k, u.hp]));
  const rows = forceHealthRows({ units: { infantry: 200, cavalry: 0, armor: 8, artillery: 0 }, warships: 1, wounds: { armor: Math.round(8 * 240 * .08), infantry: 0, warship: 0 } }, hp);
  assert.deepEqual(rows.map(r => r.text), ['200 fantassins · 100 % PV', '8 blindés · 92 % PV', '1 navire · 100 % PV']);
  assert.equal(rows[1].wounded, true);
});

test('V10 : nouvelles catégories du journal stylées (pillage, élimination, affrontement, ordre annulé, marine, fin)', () => {
  const expected = { 'PILLAGE': 'plunder', 'ÉLIMINATION': 'elimination', 'AFFRONTEMENT': 'foreign-conflict', 'ORDRE ANNULÉ': 'cancelled', 'INTERCEPTION': 'naval', 'DÉBARQUEMENT': 'naval', 'MARINE': 'naval', 'FIN DE PARTIE': 'endgame', 'CONQUÊTE': 'conquest' };
  for (const [type, cls] of Object.entries(expected)) assert.equal(journalCategoryClass(type), cls, type);
  // Chaque type produit par le moteur a un style dédié (jamais « neutral » par défaut pour ces événements).
  const events = [
    { type: 'capital-plunder', attacker: 'valmorne', defender: 'oroel', provinceId: 'p13', amount: 10 },
    { type: 'elimination', nationId: 'oroel' },
    { type: 'battle', attacker: 'oroel', defender: 'aurel', provinceId: 'p17' },
    { type: 'attack-cancelled', nationId: 'valmorne', fromId: 'p03', provinceId: 'p04', reason: 'origin-lost' },
    { type: 'interception', kind: 'sea', attacker: 'oroel', defender: 'valmorne', target: 'valmorne', fromId: 'p03', toId: 'p14', provinceId: 'p14' },
    { type: 'convoy-arrived', nationId: 'valmorne', provinceId: 'p19', amount: 3 },
    { type: 'game-over', reason: 'turn-limit', turn: 60, winnerId: 'valmorne' }
  ];
  for (const e of events) assert.notEqual(journalCategoryClass(journalEntry(e, map, 'valmorne').type), 'neutral', e.type);
});

test('V13 marine : aide « maritime » à jour (anneau, points de port, durée, interception, escorte)', () => {
  const text = TUTORIAL_GUIDE.find(x => x.id === 'maritime').text;
  assert.match(text, /anneau/);
  assert.match(text, /point de port ⚓ que l’on possède \(construit ou non, dès le tour 1\)/);
  assert.match(text, /débarque uniquement au point de port au bout de la route/);
  assert.match(text, /port construit \+ une usine/);
  assert.doesNotMatch(text, /voisines côtières/);
  assert.match(text, /2 tours au minimum/);
  assert.match(text, /intercepter/);
  assert.match(text, /escorter/);
  assert.doesNotMatch(text, /à chaque extrémité/);
  assert.ok(TUTORIAL_GUIDE.some(x => x.id === 'endgame' && /60 tours/.test(x.text)));
});
