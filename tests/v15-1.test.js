// V15.1 : coalition, IA plus ambitieuse, Valmorne, histoire compacte de la partie et écran de fin.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { arkenV9Map as map } from '../src/map/arken-v9-map.js';
import { createGameState } from '../src/state/create-game-state.js';
import { RULES, SAVE_SCHEMA_VERSION } from '../src/domain/constants.js';
import { checkGameOver, dominantNation, joinsCoalition, journalEntry, planAIOrders, resolveInterturn, updateCoalition } from '../src/domain/game-engine.js';
import { ambitionOf } from '../src/domain/engine/ai.js';
import { ARCHETYPE_LABELS, FINISH_PROVINCES, ceasefireBias } from '../src/domain/leaders.js';
import { buildEndStory, recordStory, storyFromOldSave, turningPoint } from '../src/domain/story.js';
import { decodeSave, encodeSave, migrateSave } from '../src/persistence/save-codec.js';
import { coalitionBanner, coalitionDetails, coalitionPopups } from '../src/presentation/coalition-view.js';
import { endStoryHtml } from '../src/presentation/end-view.js';
import { TUTORIAL_GUIDE } from '../src/presentation/guide-input.js';

const NATIONS = map.nations.map(n => n.id), nm = id => map.nations.find(n => n.id === id).short;
const game = (player = 'valmorne', seed = 'v151') => { const s = createGameState({ map, playerNationId: player, seed }); s.turn = 20; return s; };
const give = (s, id, list) => { for (const p of list) s.provinces[p].ownerId = id; };
const setArch = (s, id, a) => { s.leaders[id] = { archetype: a, revealed: false }; };
const dominate = (s, id = "noireflamme") => give(s, id, ["p13", "p14", "p19", "p20"]); // 8 provinces
const arm = (s, id) => { for (const n of NATIONS) if (n !== s.playerNationId) setArch(s, n, id[n] || 'heros'); };

test('coalition : formée au seuil de provinces avec assez d’avance, pas avant, sur des faits publics', () => {
  const s = game();
  assert.equal(dominantNation(s), null);
  give(s, 'noireflamme', ['p13', 'p14']); // 6
  assert.equal(dominantNation(s), null);
  give(s, 'noireflamme', ['p19']); // 7
  assert.equal(RULES.coalition.formProvinces, 7);
  assert.equal(dominantNation(s), 'noireflamme');
  const tight = game(); give(tight, 'noireflamme', ['p19', 'p20', 'p18']); give(tight, 'oroel', ['p02', 'p03']);
  assert.equal(dominantNation(tight), null, 'pas assez d’avance sur la deuxième');
});

test('coalition : annoncée au journal, membres selon le caractère, aucun or ni troupe offerts', () => {
  const s = game('roc-epine'); dominate(s);
  arm(s, { valmorne: 'heros', noireflamme: 'conquerant', oroel: 'conquerant', aurel: 'batisseur' });
  const gold = NATIONS.map(n => s.nations[n].treasury), troops = JSON.stringify(Object.values(s.provinces).map(p => p.units));
  updateCoalition(s);
  assert.equal(s.coalition.target, 'noireflamme');
  assert.deepEqual(s.coalition.members, ['oroel', 'valmorne']);
  assert.ok(!s.coalition.members.includes('roc-epine'), 'le joueur n’est jamais enrôlé');
  assert.deepEqual(NATIONS.map(n => s.nations[n].treasury), gold);
  assert.equal(JSON.stringify(Object.values(s.provinces).map(p => p.units)), troops);
  const e = s.events.find(x => x.type === 'coalition-formed');
  const text = journalEntry(e, map, 'roc-epine').text;
  assert.match(text, /Noireflamme/); assert.match(text, /Oroël/); assert.match(text, /dissoudra/);
  for (const label of Object.values(ARCHETYPE_LABELS)) assert.ok(!text.includes(label), 'aucun caractère caché dans le journal');
});

test('coalition : elle vise aussi le joueur, avec exactement la même règle', () => {
  const s = game('noireflamme'); dominate(s);
  arm(s, { valmorne: 'heros', 'roc-epine': 'conquerant', oroel: 'conquerant', aurel: 'batisseur' });
  updateCoalition(s);
  assert.equal(s.coalition.target, 'noireflamme');
  assert.match(coalitionBanner(s, nm).text, /contre vous/);
  assert.match(journalEntry(s.events.at(-1), map, 'noireflamme').text, /contre vous/);
});

test('coalition : dissoute quand le danger recule, avec hystérésis', () => {
  const s = game(); dominate(s); arm(s, { 'roc-epine': 'heros', noireflamme: 'conquerant', oroel: 'heros', aurel: 'heros' });
  updateCoalition(s); assert.ok(s.coalition);
  give(s, 'oroel', ['p13', 'p14']); // 6 : au-dessus du seuil de dissolution
  updateCoalition(s); assert.ok(s.coalition, 'tient encore : pas de clignotement');
  give(s, 'oroel', ['p16']); give(s, 'aurel', ['p19', 'p20']);
  updateCoalition(s);
  assert.equal(s.coalition, null);
  const e = s.events.find(x => x.type === 'coalition-dissolved');
  assert.equal(e.reason, 'receded');
  assert.match(journalEntry(e, map, 'valmorne').text, /dissoute/);
});

test('caractères : Héros allié et Bâtisseur tranquille restent dehors, Traître allié entre et prépare sa trahison, trêve récente respectée', () => {
  const s = game(); dominate(s);
  const ally = (a, b) => s.diplomacy.treaties.push({ type: 'alliance', parties: [a, b], active: true, started: 1 });
  setArch(s, 'oroel', 'heros'); ally('oroel', 'noireflamme');
  assert.equal(joinsCoalition(s, 'oroel', 'noireflamme'), false);
  setArch(s, 'aurel', 'batisseur'); assert.equal(joinsCoalition(s, 'aurel', 'noireflamme'), false);
  give(s, 'noireflamme', ['p17', 'p18']); assert.equal(joinsCoalition(s, 'aurel', 'noireflamme'), true, 'domination écrasante');
  setArch(s, 'roc-epine', 'traitre'); ally('roc-epine', 'noireflamme');
  assert.equal(joinsCoalition(s, 'roc-epine', 'noireflamme', 0), false, 'attend que d’autres ouvrent le bal');
  assert.equal(joinsCoalition(s, 'roc-epine', 'noireflamme', 1), true);
  setArch(s, 'roc-epine', 'conquerant'); s.diplomacy.treaties = [{ type: 'ceasefire', parties: ['roc-epine', 'noireflamme'], active: true, started: s.turn - 2 }];
  assert.equal(joinsCoalition(s, 'roc-epine', 'noireflamme'), false, 'trêve récente respectée');
});

test('membre à portée : déclaration de guerre ordinaire contre la nation dominante', () => {
  const s = game('roc-epine'); dominate(s);
  arm(s, { valmorne: 'heros', noireflamme: 'conquerant', oroel: 'heros', aurel: 'heros' });
  // Oroël n'a plus sa capitale ni son port : on lui rend de quoi toucher Noireflamme.
  give(s, 'oroel', ['p13', 'p14']);
  give(s, 'noireflamme', ['p17', 'p18']);
  updateCoalition(s);
  assert.ok(s.coalition.members.includes('oroel'));
  planAIOrders(s, map);
  assert.ok(s.orders.some(o => o.kind === 'diplomacy' && o.nationId === 'oroel' && o.target === 'noireflamme' && o.action === 'war'));
});

test('dirigeants : la coalition s’annonce dans les échanges, en réplique composée', () => {
  const s = game('roc-epine'); dominate(s);
  arm(s, { valmorne: 'heros', noireflamme: 'conquerant', oroel: 'conquerant', aurel: 'heros' });
  s.turn = 20;
  resolveInterturn(s, map);
  const said = s.talk.filter(m => m.turn === 20 && m.to === 'noireflamme' && m.tone === 'hostile');
  assert.ok(s.coalition && said.length >= 1, 'un dirigeant parle');
  assert.ok(said.some(m => s.coalition.members.includes(m.from)));
});

test('à l’écran : règle expliquée, jamais de conseil stratégique', () => {
  const s = game(); dominate(s); arm(s, { 'roc-epine': 'heros', noireflamme: 'conquerant', oroel: 'heros', aurel: 'heros' });
  updateCoalition(s);
  const d = coalitionDetails(s, nm), pop = coalitionPopups(s.events, s, nm)[0];
  assert.ok(pop); assert.equal(coalitionBanner(s, nm).mine, false);
  assert.ok(d.rule.includes(`${RULES.coalition.formProvinces} provinces`)); assert.ok(d.rule.includes(`${RULES.coalition.dissolveProvinces} provinces ou moins`));
  const help = TUTORIAL_GUIDE.find(x => x.id === 'coalition').text;
  for (const t of [d.lead, d.rule, d.note, pop.lead, pop.text, help]) assert.doesNotMatch(t, /\b(il faut|vous devez|attaquez|conseil|astuce|stratégie)\b/i);
});

test('Valmorne : l’armée née dans sa capitale sans port marche vers le point de port, par un ordre ordinaire ; pas celle du joueur', () => {
  const s = createGameState({ map, playerNationId: 'oroel', seed: 'val' });
  planAIOrders(s, map);
  const m = s.orders.find(o => o.kind === 'move' && o.nationId === 'valmorne' && o.fromId === 'p01');
  assert.ok(m, 'ordre de marche'); assert.ok(['p02', 'p03'].includes(m.toId));
  assert.ok(m.units.infantry < s.provinces.p01.units.infantry, 'la capitale garde une garnison');
  const h = createGameState({ map, playerNationId: 'valmorne', seed: 'val' });
  planAIOrders(h, map);
  assert.ok(!h.orders.some(o => o.nationId === 'valmorne'), 'jamais d’ordre à la place du joueur');
});

test('ambition : capitale et nation affaiblie tentées d’abord ; pas de trêve pour celle qu’on peut achever', () => {
  const s = game();
  assert.equal(RULES.ai.finishProvinces, FINISH_PROVINCES);
  assert.equal(ambitionOf(s, map, 'p05'), 2);
  assert.equal(ambitionOf(s, map, 'p06'), 0);
  give(s, 'valmorne', ['p06', 'p07']);
  assert.equal(ambitionOf(s, map, 'p08'), 1, 'Roc-Épine réduite à 2 provinces');
  setArch(s, 'oroel', 'conquerant'); assert.equal(ceasefireBias(s, 'oroel', 'roc-epine'), -1);
  setArch(s, 'oroel', 'batisseur'); assert.notEqual(ceasefireBias(s, 'oroel', 'roc-epine'), -1);
});

test('fin de partie : le Conquérant dénonce une trêve ancienne, jamais une trêve récente', () => {
  const run = started => {
    const s = createGameState({ map, playerNationId: 'aurel', seed: 'late' });
    s.turn = RULES.ai.lateTurn + 1; setArch(s, 'valmorne', 'conquerant');
    s.diplomacy.treaties.push({ type: 'ceasefire', parties: ['valmorne', 'roc-epine'], active: true, started: s.turn - started });
    s.diplomacy.treaties.push({ type: 'ceasefire', parties: ['valmorne', 'oroel'], active: true, started: s.turn - started });
    planAIOrders(s, map);
    return s.orders.filter(o => o.kind === 'diplomacy' && o.nationId === 'valmorne' && o.action === 'war');
  };
  assert.equal(run(2).length, 0);
  assert.ok(run(20).length >= 1);
});

test('histoire : compacte (mesurée sur 80 tours), une mesure par tour, déterministe', () => {
  const s = createGameState({ map, playerNationId: 'oroel', seed: 'taille' });
  for (const id of NATIONS) s.controllers[id] = 'ai';
  for (let i = 0; i < 80 && !s.gameOver; i++) resolveInterturn(s, map);
  const bytes = Buffer.byteLength(JSON.stringify(s.story));
  console.log(`# info V15.1 histoire : ${bytes} octets sur ${s.turn - 1} tours (sauvegarde entière : ${Buffer.byteLength(encodeSave(s))} octets)`);
  assert.ok(bytes <= 4096, `${bytes} octets`);
  for (const id of NATIONS) assert.equal(s.story.prov[id].length, s.turn);
  assert.ok(s.story.battles.length <= 6);
});

test('sauvegarde V14.4 (schéma 9) : migrée, reprise, jouable ; histoire déclarée partielle, faits réels repris', () => {
  const s = createGameState({ map, playerNationId: 'oroel', seed: 'migr' });
  for (let i = 0; i < 12; i++) resolveInterturn(s, map);
  const old = JSON.parse(JSON.stringify(s)); delete old.story; delete old.coalition; old.schemaVersion = 9;
  old.events.push({ turn: 9, type: 'capital-plunder', attacker: 'valmorne', defender: 'oroel', provinceId: 'p13' });
  const m = decodeSave(JSON.stringify(old));
  assert.equal(m.schemaVersion, SAVE_SCHEMA_VERSION);
  assert.equal(m.coalition, null);
  assert.equal(m.story.partial, true); assert.equal(m.story.from, m.turn - 1);
  assert.ok(m.story.marks.some(x => x[1] === 'c' && x[4] === 'p13'));
  for (let i = 0; i < 3; i++) resolveInterturn(m, map);
  for (const id of NATIONS) assert.equal(m.story.prov[id].length, 4);
  assert.deepEqual(decodeSave(encodeSave(m)), m);
});

test('écran de fin : vieille partie arrivant à la fin sans historique : écran propre, aucun chiffre inventé', () => {
  const s = createGameState({ map, playerNationId: 'oroel', seed: 'vieux' });
  s.turn = 80; checkGameOver(s);
  for (const st of [{ ...s, story: null }, { ...s, story: storyFromOldSave({ ...s, events: [] }) }]) {
    const story = buildEndStory(st, map), html = endStoryHtml(story);
    assert.equal(story.partial, true);
    assert.equal(story.turning, null);
    assert.match(html, /end-partial/); assert.doesNotMatch(html, /undefined|NaN|null/);
    assert.equal((html.match(/<path/g) || []).length, 0, 'pas de courbe sans historique');
    for (const r of s.gameOver.ranking) assert.ok(html.includes(nm(r.nationId)));
  }
  const v9 = JSON.parse(JSON.stringify(s)); delete v9.story; delete v9.coalition; v9.schemaVersion = 9;
  assert.match(endStoryHtml(buildEndStory(migrateSave(v9), map)), /end-partial/);
});

test('écran de fin : vrais caractères seulement à la fin, nom écrit à côté de chaque courbe', () => {
  const s = createGameState({ map, playerNationId: 'oroel', seed: 'recit' });
  for (let i = 0; i < 20; i++) resolveInterturn(s, map);
  assert.equal(buildEndStory(s, map), null, 'rien de révélé pendant la partie');
  s.turn = 80; checkGameOver(s); recordStory(s, s.events.length);
  const html = endStoryHtml(buildEndStory(s, map));
  for (const id of NATIONS) { if (id !== 'oroel') assert.ok(html.includes(ARCHETYPE_LABELS[s.leaders[id].archetype]), id); assert.ok(html.includes(nm(id))); }
  assert.match(html, /<li class="end-nation me/);
  assert.ok((html.match(/<path/g) || []).length === 5);
  assert.doesNotMatch(html, /undefined|NaN/);
});

test('tournant : dernier passage en tête du vainqueur, sinon plus forte bascule, sinon rien', () => {
  const ids = ['a', 'b'];
  const t = turningPoint({ from: 0, prov: { a: '4455667', b: '5555333' } }, ids, 'a');
  assert.deepEqual([t.turn, t.kind, t.provinces], [4, 'lead', 6]);
  const swing = turningPoint({ from: 0, prov: { a: '6668888', b: '4444222' } }, ids, 'a');
  assert.equal(swing.kind, 'swing');
  assert.equal(turningPoint({ from: 0, prov: { a: '4', b: '4' } }, ids, 'a'), null);
  assert.equal(turningPoint({ from: 0, prov: { a: '4444', b: '4444' } }, ids, 'a'), null);
});

test('le service worker met les nouveaux modules hors ligne', () => {
  const sw = readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
  for (const m of ['src/domain/engine/coalition.js', 'src/domain/story.js', 'src/presentation/coalition-view.js', 'src/presentation/end-view.js']) assert.ok(sw.includes(`./${m}`), m);
});
