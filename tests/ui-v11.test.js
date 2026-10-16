// V11 — interface des personnalités (retours bêta V9, points 17 et 18) et correctifs du testeur V10.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { arkenV9Map as map } from '../src/map/arken-v9-map.js';
import { createGameState } from '../src/state/create-game-state.js';
import { journalCategoryClass, convoyMarkers } from '../src/presentation/v5-ux.js';
import { TONE_ORDER, toneMeta, crestGlyph, talkFeed, talkBadgeCount, pendingTalkIds, tensionGauge, tensionBorderGroups, convoyTokenPosition } from '../src/presentation/v11-ux.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = p => readFileSync(join(root, p), 'utf8');
const fresh = () => createGameState({ map, playerNationId: 'valmorne' });

test('V11 : trois tons proposés, dans l\'ordre hostile → neutre → amical, chacun avec icône et classe', () => {
  assert.deepEqual([...TONE_ORDER], ['hostile', 'neutre', 'amical']);
  for (const t of TONE_ORDER) { assert.ok(toneMeta(t).icon); assert.equal(toneMeta(t).cls, `tone-${t}`); }
  assert.equal(toneMeta('inconnu').id, 'neutre', 'ton inconnu affiché comme neutre');
  for (const n of map.nations) assert.notEqual(crestGlyph(n.crest), '✦', `blason de ${n.id}`);
});

test('V11 : fil public trié du plus récent au plus ancien, avec réponses et messages adressés au joueur', () => {
  const s = fresh();
  s.talk = [
    { id: 't1', turn: 1, from: 'noireflamme', to: 'valmorne', tone: 'hostile', text: 'Vos frontières tremblent.', replyTo: null },
    { id: 't2', turn: 1, from: 'aurel', to: null, tone: 'amical', text: 'Paix à tous.', replyTo: null },
    { id: 't3', turn: 2, from: 'valmorne', to: 'noireflamme', tone: 'neutre', text: 'Nous verrons.', replyTo: 't1' },
    { id: 't4', turn: 2, from: 'oroel', to: 'valmorne', tone: 'amical', text: 'Commerçons.', replyTo: null }
  ];
  s.talkPending = { valmorne: ['t4'] };
  const feed = talkFeed(s);
  assert.deepEqual(feed.map(m => m.id), ['t4', 't3', 't2', 't1']);
  assert.equal(feed.find(m => m.id === 't3').replyToFrom, 'noireflamme');
  assert.equal(feed.find(m => m.id === 't3').fromMe, true);
  assert.equal(feed.find(m => m.id === 't2').to, null, 'message à tous');
  assert.deepEqual(feed.filter(m => m.awaitingReply).map(m => m.id), ['t4']);
  assert.equal(talkBadgeCount(s), 1);
});

test('V11 : badge robuste (sans fil, ids orphelins, message du joueur lui-même)', () => {
  const s = fresh();
  assert.equal(talkBadgeCount(s), 0, 'partie sans state.talk');
  s.talk = [{ id: 'a', turn: 1, from: 'valmorne', to: 'valmorne', tone: 'neutre', text: '…' }];
  s.talkPending = { valmorne: ['a', 'disparu'], aurel: ['a'] };
  assert.equal(pendingTalkIds(s).size, 0);
  assert.deepEqual(talkFeed(s, 'valmorne', { limit: 0 }), []);
});

test('V11 point 18 : jauge de tension bornée 0–100 avec libellé du contrat', () => {
  assert.deepEqual(tensionGauge({ value: 12, label: 'calme' }), { value: 12, pct: 12, label: 'calme', rank: 0, cls: 'tension-0' });
  assert.equal(tensionGauge({ value: 140, label: 'au bord de la guerre' }).pct, 100);
  assert.equal(tensionGauge({ value: -5, label: 'tendu' }).value, 0);
  assert.equal(tensionGauge(undefined).label, 'calme');
  assert.equal(tensionGauge({ value: 80, label: 'au bord de la guerre' }).rank, 3);
});

test('V11 point 18 : liseré orange seulement pour « au bord de la guerre », jamais pour une nation déjà en guerre', () => {
  const s = fresh();
  const levels = { noireflamme: 'au bord de la guerre', oroel: 'au bord de la guerre', aurel: 'tendu', 'roc-epine': 'calme' };
  const groups = tensionBorderGroups(s, map, id => ({ value: 0, label: levels[id] }), ['oroel']);
  assert.deepEqual(groups.map(g => g.nationId), ['noireflamme']);
  assert.deepEqual(groups[0].provinceIds, ['p09', 'p10', 'p11', 'p12']);
  assert.equal(groups[0].kind, 'brink');
});

test('V11 : nouvelles catégories du journal colorées (ÉCHANGE, TRAHISON, RÉVÉLATION, TENSION)', () => {
  const expected = { 'ÉCHANGE': 'talk', 'TRAHISON': 'betrayal', 'RÉVÉLATION': 'reveal', 'TENSION': 'tension' };
  for (const [type, cls] of Object.entries(expected)) {
    assert.equal(journalCategoryClass(type), cls, type);
    assert.match(read('v5.css'), new RegExp(`\\.journal-entry\\.${cls}\\{`), `style CSS pour ${cls}`);
  }
});

test('Testeur V10 : le jeton d\'un convoi au départ ne masque plus les ancres de port voisines', () => {
  const s = fresh();
  // Départ de Sylvaren (p02) vers Roc-Épine (p05) : les deux ancres sont à 50 unités l'une de l'autre.
  s.transports.push({ id: 'c1', nationId: 'valmorne', fromId: 'p02', toId: 'p05', via: 'p05', lane: 'p02|p05', stage: 0, turns: 2, units: { infantry: 20 }, warships: 0, wounds: {} });
  // Départ de Branvale (p03) vers Lunémont (p19) : route longue, le jeton glisse le long de la route.
  s.transports.push({ id: 'c2', nationId: 'valmorne', fromId: 'p03', toId: 'p19', via: 'p19', lane: 'p03|p19', stage: 0, turns: 3, units: { infantry: 20 }, warships: 0, wounds: {} });
  const anchors = map.provinces.filter(p => p.port).map(p => p.port.anchor);
  for (const m of convoyMarkers(s, map)) {
    const at = convoyTokenPosition(m, map);
    const nearest = Math.min(...anchors.map(a => Math.hypot(a.x - at.x, a.y - at.y)));
    assert.ok(at.shifted, `${m.id} décalé`);
    assert.ok(nearest >= 55, `${m.id} : jeton à ${Math.round(nearest)} unités de l'ancre la plus proche`);
  }
  // En pleine mer, le jeton reste à sa vraie place.
  s.transports.length = 0;
  s.transports.push({ id: 'c3', nationId: 'valmorne', fromId: 'p07', toId: 'p13', via: 'p13', lane: 'p07|p13', stage: 2, turns: 4, units: { infantry: 20 }, warships: 0, wounds: {} });
  const [mid] = convoyMarkers(s, map), at = convoyTokenPosition(mid, map);
  assert.equal(at.shifted, false);
  assert.deepEqual({ x: at.x, y: at.y }, mid.position);
});

test('Testeur V10 : la bulle du tutoriel passe en haut quand la fiche de province est ouverte', () => {
  assert.match(read('v5.css'), /#tutorialBubble\.top\{top:[^}]*bottom:auto/);
  const app = read('app.js');
  assert.match(app, /function placeTutorial\(\)\{[^}]*classList\.toggle\('top',!\$\('#provinceSheet'\)\.hidden\)/);
  assert.match(app, /\$\('#provinceSheet'\)\.hidden=false;placeTutorial\(\)/, 'appelé à l\'ouverture de la fiche');
});

test('V11 : barre du bas avec le bouton Échanges et son badge ; bouton Échanger dans la fiche d\'une province étrangère', () => {
  const html = read('index.html');
  assert.match(html, /id="journalBtn"[\s\S]*id="talkBtn"[\s\S]*id="talkBadge"[\s\S]*id="nextTurn"/);
  assert.match(html, /<dialog id="talkDialog"/);
  assert.match(read('app.js'), /\[\['diplo','Diplomatie'\],\['talk','Échanger'\]\]/);
});

test('V11 : les modules du moteur des personnalités sont mis en cache hors ligne', () => {
  const sw = read('sw.js');
  for (const p of ['./src/domain/leaders.js', './src/domain/talk.js', './src/presentation/v11-ux.js', './src/presentation/v11-talk-ui.js']) assert.ok(sw.includes(`'${p}'`), p);
});
