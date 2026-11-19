// V16.2 — l'île mystérieuse. Cahier : docs/V16-cahier-des-charges.md (« V16.2 — 6e île : l'île mystérieuse »).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { arkenV9Map as map } from '../src/map/arken-v9-map.js';
import { validateMapDefinition } from '../src/map/validate-map.js';
import { createGameState } from '../src/state/create-game-state.js';
import { LAND_UNIT_TYPES, RULES, SAVE_SCHEMA_VERSION } from '../src/domain/constants.js';
import { encodeSave, decodeSave, migrateSave } from '../src/persistence/save-codec.js';
import {
  resolveInterturn, setRelation, eventKnownToPlayer, journalEntry, visibleProvinces, provinceIntel, legalDestinations,
  queueMoveOrder, queueRecruitment, queueConstruction, incomeBreakdown, incomeFor, gameRanking, planAIOrders, islandNeighbors,
  balloonPath, balloonMax, balloonDestinations, queueBalloonBuild, balloonsOf, seaRoutesFrom, availableForces
} from '../src/domain/game-engine.js';
import {
  MYSTERY_ISLAND_ID, NEUTRAL_NAME, ensureMysteryIsland, islandBankShare, mysteryGarrison, nationStartUnits
} from '../src/domain/mystery-island.js';
import { MYSTERY_BUILD_REFUSAL } from '../src/domain/engine/orders.js';
import { aiIslandOrders, islandLaunchPoints } from '../src/domain/engine/ai-island.js';
import { aiAttackSlice } from '../src/domain/engine/ai.js';
import { helpRequestStatus, queueHelpRequest, helpDecision, helpJournalText, helpLineLists } from '../src/domain/alliances.js';
import { buildEndStory } from '../src/domain/story.js';
import { islandSheetView, islandMapBadge, MYSTERY_HELP } from '../src/presentation/mystery-island-view.js';
import { helpChoices } from '../src/presentation/alliances-view.js';
import { TUTORIAL_GUIDE } from '../src/presentation/guide-input.js';
import { DOMAIN_MODULES_V16_2, readSource, root } from './helpers/sources.js';

const NATIONS = map.nations.map(n => n.id);
const P = MYSTERY_ISLAND_ID;
const short = id => map.nations.find(n => n.id === id)?.short || NEUTRAL_NAME;
const pname = id => map.provinces.find(p => p.id === id).name;
/** Partie sans IA : seuls les ordres du test jouent. */
function game(seed = 'v16-2', player = 'valmorne') {
  const s = createGameState({ map, playerNationId: player, seed });
  for (const id of NATIONS) s.controllers[id] = 'human';
  return s;
}
const turns = (s, n) => { for (let i = 0; i < n; i++) resolveInterturn(s, map); };
const units = (inf, extra = {}) => ({ infantry: inf, cavalry: 0, armor: 0, artillery: 0, ...extra });
const total = p => LAND_UNIT_TYPES.reduce((n, k) => n + (p.units[k] || 0), 0);
const alliance = (s, a, b) => assert.ok(setRelation(s, { nationId: a, target: b, type: 'alliance' }).ok);
const journalOf = (s, reader, from = 0) => s.events.slice(from).filter(e => eventKnownToPlayer({ ...s, playerNationId: reader }, map, e))
  .map(e => journalEntry(e, map, reader)).filter(Boolean).map(e => e.text);
/** Petite garnison sur l'île, armées prêtes sur les points de port reliés à l'île. */
function weakIsland(s, garrison = 60) {
  s.provinces[P].units = units(garrison);
  s.provinces.p03.units = units(400); s.provinces.p07.units = units(400); s.provinces.p11.units = units(400);
}

// --- Carte --------------------------------------------------------------------------------------------------------
test('carte : p21 « Île mystérieuse », une province neutre au centre (petite île rocheuse), point de port, sans voisin', () => {
  assert.deepEqual(validateMapDefinition(map), { valid: true, errors: [] });
  const d = map.provinces.find(p => p.id === P);
  assert.equal(map.provinces.length, 21);
  assert.equal(map.provinces.at(-1).id, P, 'p01…p20 ne bougent pas, p21 vient après');
  assert.equal(d.name, 'Île mystérieuse');
  assert.equal(d.initialOwner, null);
  assert.equal(d.neutral, true);
  assert.deepEqual(d.landConnections, []);
  assert.equal(d.landmassId, 'ile-mysterieuse');
  assert.ok(!map.nations.some(n => n.id === P), 'ce n’est pas une nation');
  // La petite île rocheuse au centre de la carte Leonardo (1536 × 1536) : contour entre x 610…745 et y 610…800.
  const xs = d.geometry.points.map(p => p[0]), ys = d.geometry.points.map(p => p[1]);
  assert.ok(Math.min(...xs) >= 600 && Math.max(...xs) <= 750 && Math.min(...ys) >= 600 && Math.max(...ys) <= 800, 'contour au centre');
  assert.ok(d.port && d.port.anchor.x > Math.max(...xs), 'point de port en mer, à l’est de l’île');
  assert.equal(map.image.href, 'assets/carte-leonardo.jpg', 'pas de nouveau dessin de carte');
});

test('carte : 5 routes vers l’île (une par nation, depuis son point de port le plus proche) ; l’anneau ne change pas', () => {
  const toIsland = map.maritimeRoutes.filter(r => r.includes(P)).map(r => r.find(x => x !== P)).sort();
  assert.deepEqual(toIsland, ['p03', 'p07', 'p11', 'p13', 'p17']);
  assert.deepEqual(toIsland.map(id => map.provinces.find(p => p.id === id).initialOwner).sort(), [...NATIONS].sort());
  const anchor = map.provinces.find(p => p.id === P).port.anchor;
  for (const id of toIsland) {
    const owner = map.provinces.find(p => p.id === id).initialOwner, dist = q => Math.hypot(q.port.anchor.x - anchor.x, q.port.anchor.y - anchor.y);
    const closest = map.provinces.filter(p => p.initialOwner === owner && p.port).sort((a, b) => dist(a) - dist(b))[0];
    assert.equal(closest.id, id, `${owner} : point de port le plus proche`);
  }
  assert.deepEqual(map.maritimeRoutes.filter(r => !r.includes(P)).map(r => [...r].sort().join('-')).sort(), ['p02-p05', 'p03-p14', 'p07-p17', 'p09-p13', 'p11-p19']);
  // Durées : 4 tours vers l'île, 2 entre deux nations.
  for (const r of seaRoutesFrom(map, P)) assert.equal(r.turns, RULES.mysteryIsland.routeTurns);
  assert.equal(RULES.mysteryIsland.routeTurns, 4);
  for (const [a, b] of map.maritimeRoutes.filter(r => !r.includes(P))) assert.equal(seaRoutesFrom(map, a).find(r => r.via === b).turns, 2);
  // Le module de carte généré est à jour avec le JSON (tools/carte).
  const json = JSON.parse(readFileSync(join(root, 'tools/carte/arken-v9-carte.json'), 'utf8'));
  assert.ok(json.provinces.some(p => p.id === P && p.neutral && p.nation === null));
  assert.equal(json.seaRoutes.length, map.maritimeRoutes.length);
});

// --- Garnison neutre ---------------------------------------------------------------------------------------------
test('garnison : neutre, 3 × toutes les troupes d’une nation en début de partie, même composition', () => {
  const s = game();
  const island = s.provinces[P];
  assert.equal(island.ownerId, null);
  assert.equal(island.coOwnerId, null);
  const nationTotal = Object.fromEntries(LAND_UNIT_TYPES.map(k => [k, ['p01', 'p02', 'p03', 'p04'].reduce((n, id) => n + s.provinces[id].units[k], 0)]));
  assert.deepEqual(nationTotal, nationStartUnits());
  assert.deepEqual(island.units, Object.fromEntries(LAND_UNIT_TYPES.map(k => [k, 3 * nationTotal[k]])));
  assert.deepEqual(island.units, { infantry: 960, cavalry: 30, armor: 18, artillery: 6 });
  assert.deepEqual(mysteryGarrison(), island.units);
  assert.equal(island.warships, 0);
  assert.deepEqual(island.buildings, { bank: 0, factory: 0, fort: 0, port: 0 });
});

test('garnison : elle ne recrute jamais, ne bouge jamais, aucune IA ne la dirige', () => {
  const s = createGameState({ map, playerNationId: 'valmorne', seed: 'neutre' });
  for (const id of NATIONS) s.controllers[id] = 'ai';
  const before = { ...s.provinces[P].units };
  for (let i = 0; i < 12; i++) {
    planAIOrders(s, map);
    assert.ok(!s.orders.some(o => !o.nationId || o.fromId === P && s.provinces[P].ownerId === null), 'aucun ordre pour la garnison neutre');
    resolveInterturn(s, map);
  }
  if (s.provinces[P].ownerId === null && !s.events.some(e => e.provinceId === P && e.type === 'battle')) assert.deepEqual(s.provinces[P].units, before);
  assert.ok(!Object.keys(s.nations).includes('null') && !s.controllers.null);
});

test('on ne construit ni ne recrute sur l’île (sauf ce qui existe : la super banque) ; refus clair', () => {
  const s = game();
  s.provinces[P].ownerId = 'valmorne'; s.nations.valmorne.treasury = 1000;
  for (const type of ['bank', 'factory', 'fort', 'port']) assert.equal(queueConstruction(s, { nationId: 'valmorne', provinceId: P, type }).error, MYSTERY_BUILD_REFUSAL);
  for (const type of ['infantry', 'cavalry', 'armor', 'artillery', 'warship']) assert.equal(queueRecruitment(s, { nationId: 'valmorne', provinceId: P, type }).error, MYSTERY_BUILD_REFUSAL);
  assert.match(MYSTERY_BUILD_REFUSAL, /on n’y construit rien et on n’y recrute personne/);
  assert.equal(s.nations.valmorne.treasury, 1000, 'rien n’est payé');
  // Ailleurs, rien ne change.
  assert.ok(queueConstruction(s, { nationId: 'valmorne', provinceId: 'p01', type: 'bank' }).ok);
});

// --- Vision -------------------------------------------------------------------------------------------------------
test('vision : les troupes de l’île sont toujours visibles par tous, sans ballon, quel que soit le propriétaire', () => {
  const s = game();
  for (const n of NATIONS) {
    assert.ok(visibleProvinces(s, map, n).has(P), n);
    const intel = provinceIntel(s, map, n, P);
    assert.equal(intel.troopsKnown, true, n);
    assert.deepEqual(intel.units, s.provinces[P].units);
  }
  // Tenue par Oroël, avec des troupes alliées stationnées : toujours connue de tous, forteresse ou non.
  s.provinces[P].ownerId = 'oroel'; s.provinces[P].units = units(120); s.provinces[P].buildings.fort = 2;
  alliance(s, 'oroel', 'aurel');
  s.stationed = [{ nationId: 'aurel', provinceId: P, units: units(30), warships: 0, wounds: {} }];
  for (const n of NATIONS) assert.equal(provinceIntel(s, map, n, P).troopsKnown, true, n);
  assert.equal(provinceIntel(s, map, 'valmorne', P).entrenched, false);
  assert.ok(!(s.balloons || []).length, 'aucun ballon');
});

// --- Super banque -----------------------------------------------------------------------------------------------
test('super banque : +10 or par tour au propriétaire, seul revenu de l’île ; +5 chacun avec un co-propriétaire', () => {
  const s = game();
  const base = incomeFor(s, 'valmorne');
  assert.equal(islandBankShare(s, 'valmorne'), 0);
  s.provinces[P].ownerId = 'valmorne';
  assert.equal(incomeFor(s, 'valmorne'), base + 10);
  assert.equal(incomeBreakdown(s, 'valmorne').island, 10);
  assert.equal(incomeBreakdown(s, 'valmorne').provinces, 4, 'pas de revenu de province en plus');
  alliance(s, 'valmorne', 'roc-epine'); s.provinces[P].coOwnerId = 'roc-epine';
  assert.equal(islandBankShare(s, 'valmorne'), 5);
  assert.equal(islandBankShare(s, 'roc-epine'), 5);
  const before = { v: s.nations.valmorne.treasury, r: s.nations['roc-epine'].treasury }, incV = incomeFor(s, 'valmorne'), incR = incomeFor(s, 'roc-epine');
  assert.equal(incV, base + 5);
  turns(s, 1);
  assert.equal(s.nations.valmorne.treasury - before.v, incV);
  assert.equal(s.nations['roc-epine'].treasury - before.r, incR);
  const income = s.events.filter(e => e.type === 'income' && e.nationId === 'valmorne').at(-1);
  assert.equal(income.island, 5);
  assert.match(journalEntry(income, map, 'valmorne').text, /super banque de l’île \+5/);
  // Aucun autre bâtiment « super banque » ailleurs : le revenu des autres nations ne change pas.
  assert.equal(islandBankShare(s, 'oroel'), 0);
});

// --- Routes et débarquement ----------------------------------------------------------------------------------------
test('routes : depuis l’île, débarquement possible chez n’importe quelle nation (4 tours)', () => {
  const s = game();
  s.provinces[P].ownerId = 'valmorne'; s.provinces[P].units = units(300);
  const dest = legalDestinations(map, s, P);
  assert.deepEqual(dest.map(d => d.id).sort(), ['p03', 'p07', 'p11', 'p13', 'p17']);
  assert.ok(dest.every(d => d.type === 'sea' && d.turns === 4));
  assert.deepEqual([...new Set(dest.map(d => map.provinces.find(p => p.id === d.id).initialOwner))].sort(), [...NATIONS].sort());
  // Un débarquement depuis l'île chez Noireflamme arrive en 4 tours.
  assert.ok(queueMoveOrder(s, map, { nationId: 'valmorne', fromId: P, toId: 'p11', units: units(200) }).ok);
  turns(s, 3);
  assert.equal(s.transports.length, 1);
  turns(s, 1);
  assert.ok(s.events.some(e => (e.type === 'battle' || e.type === 'conquest') && e.provinceId === 'p11' && e.attacker === 'valmorne'));
});

// --- Attaques publiques, prise seule -------------------------------------------------------------------------------
test('attaque de l’île neutre : publique pour tous (qui, morts, troupes restantes), sans guerre contre personne', () => {
  const s = game();
  s.provinces[P].units = units(300);
  s.provinces.p03.units = units(200);
  assert.ok(queueMoveOrder(s, map, { nationId: 'valmorne', fromId: 'p03', toId: P, units: units(200) }).ok);
  const from = s.events.length;
  turns(s, 4);
  const battle = s.events.slice(from).find(e => e.provinceId === P && e.type === 'battle');
  assert.ok(battle, 'assaut repoussé');
  assert.equal(battle.defender, null);
  assert.ok(battle.mystery && Number.isInteger(battle.mystery.left));
  assert.equal(s.diplomacy.wars.length, 0, 'aucune guerre');
  assert.ok(!s.ai?.reputation?.valmorne?.strikes, 'pas d’agression contre une nation');
  for (const reader of NATIONS) {
    assert.ok(eventKnownToPlayer({ ...s, playerNationId: reader }, map, battle), reader);
    const text = journalEntry(battle, map, reader).text;
    assert.match(text, /🏝 Île mystérieuse : Valmorne attaque ; \d+ morts chez les assaillants, \d+ chez les défenseurs ; il reste \d+ unités sur l’île\./, reader);
    assert.match(text, /Garnison neutre/);
  }
  assert.equal(battle.mystery.left, total(s.provinces[P]));
});

test('prise seule : le propriétaire garde ses survivants sur l’île ; une troisième nation qui la prend récupère tout', () => {
  const s = game();
  weakIsland(s);
  assert.ok(queueMoveOrder(s, map, { nationId: 'valmorne', fromId: 'p03', toId: P, units: units(300) }).ok);
  turns(s, 4);
  assert.equal(s.provinces[P].ownerId, 'valmorne');
  assert.equal(s.provinces[P].coOwnerId, null);
  assert.ok(total(s.provinces[P]) > 0, 'les troupes restent sur l’île');
  assert.equal(islandBankShare(s, 'valmorne'), 10);
  // Noireflamme la prend à Valmorne : guerre, banque entière.
  s.provinces[P].units = units(20);
  assert.ok(queueMoveOrder(s, map, { nationId: 'noireflamme', fromId: 'p11', toId: P, units: units(300) }).ok);
  turns(s, 4);
  assert.equal(s.provinces[P].ownerId, 'noireflamme');
  assert.equal(islandBankShare(s, 'noireflamme'), 10);
  assert.equal(islandBankShare(s, 'valmorne'), 0);
  assert.ok(s.diplomacy.wars.some(w => w.participants.includes('noireflamme') && w.participants.includes('valmorne')), 'attaquer le propriétaire = guerre');
});

// --- Prise à deux ------------------------------------------------------------------------------------------------
function jointCapture(seed = 'deux') {
  const s = game(seed);
  weakIsland(s);
  alliance(s, 'valmorne', 'roc-epine');
  assert.ok(queueMoveOrder(s, map, { nationId: 'valmorne', fromId: 'p03', toId: P, units: units(300) }).ok);
  assert.ok(queueMoveOrder(s, map, { nationId: 'roc-epine', fromId: 'p07', toId: P, units: units(150) }).ok);
  const from = s.events.length;
  turns(s, 4);
  return { s, from };
}
test('prise à deux : propriétaire = celui qui la prend (plus de PV), l’allié devient co-propriétaire, ses troupes restent', () => {
  const { s, from } = jointCapture();
  const p = s.provinces[P];
  assert.equal(p.ownerId, 'valmorne', 'le plus fort la prend (règle de combat existante)');
  assert.equal(p.coOwnerId, 'roc-epine');
  assert.ok((s.stationed || []).some(e => e.nationId === 'roc-epine' && e.provinceId === P), 'l’allié stationne sur l’île');
  assert.ok(!s.events.slice(from).some(e => e.type === 'convoy-returning' && e.nationId === 'roc-epine'), 'il ne rembarque pas');
  assert.equal(islandBankShare(s, 'valmorne'), 5);
  assert.equal(islandBankShare(s, 'roc-epine'), 5);
  const conquest = s.events.slice(from).find(e => e.type === 'conquest' && e.provinceId === P);
  assert.equal(conquest.mystery.coOwnerId, 'roc-epine');
  assert.match(journalEntry(conquest, map, 'oroel').text, /Valmorne la prend avec Roc-Épine : super banque partagée, base commune\./);
  // Les deux s'en servent comme base : chacun peut en repartir (débarquer chez n'importe quelle nation).
  assert.ok(queueMoveOrder(s, map, { nationId: 'roc-epine', fromId: P, toId: 'p13', units: { infantry: 10 } }).ok, 'co-propriétaire');
  assert.ok(queueMoveOrder(s, map, { nationId: 'valmorne', fromId: P, toId: 'p17', units: { infantry: 10 } }).ok, 'propriétaire');
  // Classement : l'île compte comme une province pour le propriétaire principal seulement.
  const rank = gameRanking(s);
  assert.equal(rank.find(r => r.nationId === 'valmorne').provinces, 5);
  assert.equal(rank.find(r => r.nationId === 'roc-epine').provinces, 4);
});

test('prise à deux : alliance rompue → le co-propriétaire perd sa part, ses troupes sont rapatriées (V13.4), annonce publique', () => {
  const { s } = jointCapture('rupture');
  const from = s.events.length;
  assert.ok(setRelation(s, { nationId: 'roc-epine', target: 'valmorne', type: 'war' }).ok);
  assert.equal(s.provinces[P].coOwnerId, null);
  assert.ok(!(s.stationed || []).some(e => e.nationId === 'roc-epine' && e.provinceId === P), 'troupes rapatriées');
  assert.equal(islandBankShare(s, 'valmorne'), 10);
  assert.equal(islandBankShare(s, 'roc-epine'), 0);
  const lost = s.events.slice(from).find(e => e.type === 'mystery-coowner-lost');
  assert.equal(lost.nationId, 'roc-epine');
  assert.equal(lost.reason, 'alliance');
  for (const reader of NATIONS) assert.ok(eventKnownToPlayer({ ...s, playerNationId: reader }, map, lost));
  assert.match(journalEntry(lost, map, 'oroel').text, /Roc-Épine perd sa part de l’île mystérieuse : l’alliance avec Valmorne est rompue/);
  assert.match(journalEntry(lost, map, 'roc-epine').text, /^🏝 Vous perdez votre part/);
  // Même règle par l'ordre « rompre l'alliance » résolu à l'inter-tour.
  const t = jointCapture('rupture-ordre').s;
  t.orders.push({ id: 'oBreak', kind: 'diplomacy', action: 'break', nationId: 'roc-epine', target: 'valmorne', status: 'pending', turn: t.turn });
  turns(t, 1);
  assert.equal(t.provinces[P].coOwnerId, null);
});

test('prise à deux : une troisième nation qui la prend récupère tout (+10), plus de co-propriétaire', () => {
  const { s } = jointCapture('troisieme');
  s.provinces[P].units = units(10);
  s.stationed = (s.stationed || []).filter(e => e.provinceId !== P);
  assert.ok(queueMoveOrder(s, map, { nationId: 'noireflamme', fromId: 'p11', toId: P, units: units(300) }).ok);
  turns(s, 4);
  assert.equal(s.provinces[P].ownerId, 'noireflamme');
  assert.equal(s.provinces[P].coOwnerId, null);
  assert.equal(islandBankShare(s, 'noireflamme'), 10);
  assert.equal(islandBankShare(s, 'roc-epine'), 0);
});

// --- « Attaque avec moi » étendu à l'île ---------------------------------------------------------------------------
test('aide « Prends l’île avec moi » : demande, réponse, et l’allié IA embarque le même tour que le joueur', () => {
  const s = game('aide-ile');
  weakIsland(s, 200);
  s.controllers['roc-epine'] = 'ai';
  alliance(s, 'valmorne', 'roc-epine');
  assert.deepEqual(helpRequestStatus(s, { from: 'valmorne', to: 'roc-epine', kind: 'island' }), { ok: true });
  assert.equal(helpChoices(s, map, 'roc-epine').island.available, true);
  // Accord (sans dépendre du caractère tiré) : engagement tenu, comme une aide acceptée.
  s.diplomacy.help = [{ ally: 'roc-epine', requester: 'valmorne', kind: 'island', against: null, provinceId: null, turn: s.turn, travel: 4, until: s.turn + 9 }];
  assert.ok(queueMoveOrder(s, map, { nationId: 'valmorne', fromId: 'p03', toId: P, units: units(300) }).ok);
  planAIOrders(s, map);
  const ally = s.orders.find(o => o.nationId === 'roc-epine' && o.kind === 'move' && o.toId === P);
  assert.ok(ally, 'l’allié embarque vers l’île le même tour');
  turns(s, 4);
  assert.ok(['valmorne', 'roc-epine'].includes(s.provinces[P].ownerId));
  assert.ok(['valmorne', 'roc-epine'].includes(s.provinces[P].coOwnerId), 'prise à deux');
  // Plus de demande possible : le joueur tient l'île.
  assert.equal(helpRequestStatus(s, { from: 'valmorne', to: 'roc-epine', kind: 'island' }).ok, false);
});

test('aide « Prends l’île avec moi » : réponses selon le caractère, textes du journal, listes de répliques', () => {
  const s = game('aide-textes');
  s.controllers.oroel = 'ai'; alliance(s, 'valmorne', 'oroel');
  assert.ok(queueHelpRequest(s, { from: 'valmorne', to: 'oroel', kind: 'island' }).ok);
  turns(s, 1);
  const answer = s.events.find(e => e.type === 'help-answer' && e.help === 'island');
  assert.ok(answer);
  const text = helpJournalText(answer, map, 'valmorne');
  assert.match(text, answer.accepted ? /accepte de prendre l’île mystérieuse avec vous : quand vos troupes embarqueront pour l’île, les siennes partiront le même tour/ : /refuse de prendre l’île mystérieuse avec vous/);
  // Le Traître promet et ne vient pas ; jamais si l'île est aux mains d'un allié de l'allié.
  s.leaders.oroel.archetype = 'traitre';
  assert.deepEqual(helpDecision(s, 'oroel', { from: 'valmorne', kind: 'island' }, map), { accept: true, fake: true, reason: 'traitor' });
  s.provinces[P].ownerId = 'aurel'; alliance(s, 'oroel', 'aurel');
  assert.equal(helpDecision(s, 'oroel', { from: 'valmorne', kind: 'island' }, map).reason, 'ally-of-target');
  for (const arch of ['heros', 'conquerant', 'batisseur', 'traitre']) for (const k of ['yes', 'no']) assert.ok(helpLineLists()[`${arch}.island.${k}`].length >= 12, `${arch}.island.${k}`);
});

// --- Ballons --------------------------------------------------------------------------------------------------------
test('ballons : jamais au-dessus de l’île, jamais de passage par l’île ; 2e ballon pour le propriétaire de l’île', () => {
  for (const n of NATIONS) {
    assert.ok(!islandNeighbors(map, n).includes(null) && !islandNeighbors(map, n).includes(P), n);
    assert.equal(islandNeighbors(map, n).length, 2, `${n} : l’anneau seulement`);
    for (const m of NATIONS) assert.ok(!(balloonPath(map, n, m) || []).some(x => x === null || x === P), `${n} → ${m}`);
  }
  const s = game('ballon');
  s.provinces.p01.buildings.factory = 1; s.nations.valmorne.treasury = 500;
  assert.equal(balloonMax(s, 'valmorne'), 1);
  s.provinces[P].ownerId = 'valmorne';
  assert.equal(balloonMax(s, 'valmorne'), 2);
  assert.ok(queueBalloonBuild(s, { nationId: 'valmorne', provinceId: 'p01' }).ok);
  turns(s, RULES.balloon.turns);
  const b = balloonsOf(s, 'valmorne')[0];
  assert.ok(balloonDestinations(s, map, b.id).every(d => NATIONS.includes(d.id) && !d.path.includes(P)));
  assert.ok(readSource('src/domain/engine/balloons.js').includes('islandOfProvince(map, other)'), 'les îles de ballon sont celles des nations');
});

// --- IA ---------------------------------------------------------------------------------------------------------
test('IA : elle convoite l’île quand sa simulation de combat dit qu’elle la prend, jamais sinon', () => {
  const s = game('ia-ile');
  s.controllers.valmorne = 'ai';
  assert.deepEqual(islandLaunchPoints(s, map, 'valmorne').map(x => x.id), ['p03']);
  // Garnison complète (960 fantassins…) contre 400 fantassins : pas de tentative.
  s.provinces.p03.units = units(400);
  aiIslandOrders(s, map, 'valmorne', new Set(), 1.15);
  assert.ok(!s.orders.some(o => o.nationId === 'valmorne' && o.toId === P));
  // Grosse armée sur le point de port : débarquement vers l'île.
  s.provinces.p03.units = units(4000, { armor: 60 });
  aiIslandOrders(s, map, 'valmorne', new Set(), 1.15);
  const o = s.orders.find(x => x.nationId === 'valmorne' && x.toId === P);
  assert.ok(o, 'débarquement commandé');
  assert.equal(o.routeType, 'sea');
  // Contre un propriétaire nation : seulement si c'est une de ses cibles du tour.
  const t = game('ia-ile-2'); t.controllers.valmorne = 'ai'; t.provinces[P].ownerId = 'oroel'; t.provinces[P].units = units(50); t.provinces.p03.units = units(600);
  aiIslandOrders(t, map, 'valmorne', new Set(), 1.15);
  assert.ok(!t.orders.some(x => x.nationId === 'valmorne' && x.toId === P), 'Oroël n’est pas une cible');
  aiIslandOrders(t, map, 'valmorne', new Set(['oroel']), 1.15);
  assert.ok(t.orders.some(x => x.nationId === 'valmorne' && x.toId === P), 'Oroël est une cible');
});

test('IA : propriétaire, elle s’y installe (renforts, garde au moins la moitié de ses troupes) et s’en sert de base', () => {
  const s = game('ia-base');
  s.controllers.valmorne = 'ai';
  s.provinces[P].ownerId = 'valmorne'; s.provinces[P].units = units(60); s.provinces.p03.units = units(500);
  aiIslandOrders(s, map, 'valmorne', new Set(), 1.15);
  assert.ok(s.orders.some(o => o.nationId === 'valmorne' && o.fromId === 'p03' && o.toId === P), 'renfort vers l’île');
  // Depuis l'île, l'IA n'engage jamais plus de la moitié de la garnison.
  const t = game('ia-base-2'); t.provinces[P].ownerId = 'valmorne'; t.provinces[P].units = units(1000);
  t.provinces.p11.units = units(5);
  const slice = aiAttackSlice(t, map, 'valmorne', P, 'p11', 1, 'landing', 0, 'p11');
  assert.ok(slice && slice.infantry <= 500, `part engagée : ${slice?.infantry}`);
  t.provinces[P].units = units(150); // 50 % ne suffisent plus contre l'estimation prudente : pas d'attaque
  assert.equal(aiAttackSlice(t, map, 'valmorne', P, 'p11', 1.2, 'landing', 0, 'p11'), null);
  // L'île n'est jamais choisie comme base navale ni comme lieu de construction.
  const u = createGameState({ map, playerNationId: 'oroel', seed: 'ia-base-3' });
  for (const id of NATIONS) u.controllers[id] = 'ai';
  u.provinces[P].ownerId = 'valmorne'; u.nations.valmorne.treasury = 2000;
  planAIOrders(u, map);
  assert.ok(!u.orders.some(o => (o.kind === 'construction' || o.kind === 'recruitment') && o.provinceId === P));
});

test('IA : seule elle ne suffit pas, avec un allié IA oui → elle propose « Prends l’île avec moi »', () => {
  const s = game('ia-demande');
  s.controllers.valmorne = 'ai'; s.controllers['roc-epine'] = 'ai';
  alliance(s, 'valmorne', 'roc-epine');
  s.provinces[P].units = units(700);
  s.provinces.p03.units = units(650); s.provinces.p07.units = units(700);
  aiIslandOrders(s, map, 'valmorne', new Set(), 1.15);
  assert.ok(!s.orders.some(o => o.kind === 'move' && o.toId === P), 'seule : pas de débarquement');
  const ask = s.orders.find(o => o.kind === 'help' && o.nationId === 'valmorne');
  assert.ok(ask && ask.help === 'island' && ask.to === 'roc-epine');
});

test('IA : parties complètes avec l’île (états valides, journal lisible, île neutre ou tenue par une nation)', () => {
  for (let g = 0; g < 4; g++) {
    const s = createGameState({ map, playerNationId: NATIONS[g], seed: `v162-ia-${g}` });
    for (const id of NATIONS) s.controllers[id] = 'ai';
    for (let i = 0; i < 80 && !s.gameOver; i++) {
      resolveInterturn(s, map);
      const p = s.provinces[P];
      assert.ok(p.ownerId === null || NATIONS.includes(p.ownerId));
      assert.ok(p.coOwnerId === null || (p.coOwnerId !== p.ownerId && NATIONS.includes(p.coOwnerId)));
      for (const k of LAND_UNIT_TYPES) assert.ok(Number.isInteger(p.units[k]) && p.units[k] >= 0);
      assert.deepEqual(p.buildings, { bank: 0, factory: 0, fort: 0, port: 0 }, 'rien n’est construit sur l’île');
    }
    for (const e of s.events) assert.doesNotThrow(() => journalEntry(e, map, s.playerNationId));
    assert.ok(buildEndStory(s, map));
  }
});

// --- Sauvegarde ------------------------------------------------------------------------------------------------
test('sauvegarde : une ancienne partie (sans p21) reste jouable — l’île est ajoutée neutre au chargement', () => {
  const s = createGameState({ map, playerNationId: 'valmorne', seed: 'ancienne' });
  for (const id of NATIONS) s.controllers[id] = 'ai';
  turns(s, 3);
  const old = JSON.parse(encodeSave(s));
  delete old.provinces[P];
  assert.equal(old.schemaVersion, SAVE_SCHEMA_VERSION);
  const loaded = decodeSave(JSON.stringify(old));
  assert.equal(loaded.schemaVersion, SAVE_SCHEMA_VERSION, 'pas de nouveau schéma');
  assert.equal(loaded.provinces[P].ownerId, null);
  assert.deepEqual(loaded.provinces[P].units, mysteryGarrison());
  for (const id of Object.keys(old.provinces)) assert.deepEqual(loaded.provinces[id], old.provinces[id], `${id} intacte`);
  assert.equal(loaded.turn, old.turn);
  turns(loaded, 3);
  assert.equal(loaded.turn, old.turn + 3);
  // Partie déjà complétée : rien ne bouge ; co-propriétaire conservé à l'aller-retour.
  const { s: joint } = jointCapture('sauve');
  const again = decodeSave(encodeSave(joint));
  assert.deepEqual(again.provinces[P], joint.provinces[P]);
  assert.equal(again.provinces[P].coOwnerId, 'roc-epine');
  // Autre carte (V6) : rien n'est ajouté.
  const v6 = { ...old, mapId: 'arken-v1-original-map', provinces: { ...old.provinces } };
  assert.equal(ensureMysteryIsland(v6), false);
  assert.ok(!migrateSave(v6).provinces[P]);
});

// --- Province neutre partout --------------------------------------------------------------------------------------
test('province neutre : journal, histoire de fin, classement et coalition l’acceptent', () => {
  const { s, from } = jointCapture('neutre-partout');
  const conquest = s.events.slice(from).find(e => e.type === 'conquest' && e.provinceId === P);
  assert.equal(conquest.defender, null);
  assert.ok(conquest.lossesByNation.neutre, 'pertes de la garnison neutre');
  assert.match(journalEntry(conquest, map, 'valmorne').text, /Garnison neutre/);
  assert.doesNotMatch(journalEntry(conquest, map, 'valmorne').text, /Nation inconnue|null|undefined/);
  s.gameOver = { reason: 'turn-limit', turn: s.turn, winnerId: 'valmorne', ranking: gameRanking(s) };
  const story = buildEndStory(s, map);
  assert.deepEqual(story.islands.map(x => x.text), ['Valmorne prend l’île mystérieuse avec Roc-Épine']);
  assert.ok(!gameRanking(s).some(r => r.nationId === null));
  assert.equal(gameRanking(s).length, 5);
});

// --- Interface --------------------------------------------------------------------------------------------------
test('interface : fiche « Île mystérieuse » (garnison, super banque +10, routes 4 tours, co-propriétaire), aide, carte', () => {
  const s = game('fiche');
  const v = islandSheetView(s, map, 'valmorne', short, pname);
  assert.equal(v.kicker, 'Île mystérieuse · neutre');
  assert.ok(v.chips.some(c => /Garnison toujours visible par tous/.test(c)));
  assert.ok(v.chips.some(c => /Super banque : \+10 or par tour/.test(c)));
  assert.ok(v.chips.some(c => /Routes : 4 tours vers chacune des 5 nations/.test(c) && /depuis Branvale/.test(c)));
  assert.ok(v.chips.some(c => /pour la garder, il faut y laisser des troupes/.test(c)));
  assert.equal(v.canMove, false);
  const { s: j } = jointCapture('fiche-2');
  const w = islandSheetView(j, map, 'roc-epine', short, pname);
  assert.equal(w.kicker, 'Île mystérieuse · à Valmorne, avec vous');
  assert.ok(w.chips.some(c => /Co-propriétaire : Roc-Épine/.test(c)));
  assert.ok(w.chips.some(c => /vous touchez \+5 or par tour/.test(c)));
  assert.equal(w.canMove, true);
  assert.equal(islandMapBadge(j), '🏦+10 🤝');
  assert.equal(TUTORIAL_GUIDE.find(x => x.id === 'mystery'), MYSTERY_HELP);
  assert.match(MYSTERY_HELP.text, /Super banque : \+10 or par tour/);
  const app = readSource('app.js');
  assert.match(app, /islandSheetView\(state,map,state\.playerNationId/);
  assert.match(app, /islandMapBadge\(state\)/);
  assert.match(app, /data-help="island"/);
  assert.match(readSource('src/presentation/ui/base.js'), /id === null \? NEUTRAL/);
});

test('modules purs : ni DOM, ni hasard, ni date (île mystérieuse)', () => {
  for (const f of [...DOMAIN_MODULES_V16_2, 'src/domain/engine/ai-island.js', 'src/presentation/mystery-island-view.js']) {
    const src = readFileSync(join(root, f), 'utf8');
    assert.doesNotMatch(src, /Math\.random|Date\.now|new Date|document\.|window\./, f);
  }
  assert.match(readFileSync(join(root, 'sw.js'), 'utf8'), /mystery-island\.js[\s\S]*|ai-island\.js/);
  assert.ok(readFileSync(join(root, 'sw.js'), 'utf8').includes('./src/domain/engine/ai-island.js'));
  assert.ok(readFileSync(join(root, 'sw.js'), 'utf8').includes('./src/presentation/mystery-island-view.js'));
});
