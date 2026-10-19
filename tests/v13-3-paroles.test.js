// V13.3 — retours bêta : paroles des dirigeants plus variées, sans commerce, sans répétition immédiate.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { arkenV9Map as map } from '../src/map/arken-v9-map.js';
import { createGameState } from '../src/state/create-game-state.js';
import { resolveInterturn, setRelation } from '../src/domain/game-engine.js';
import { allTalkLines, talkLineLists, pickLine, usedRecently, recentTexts, publishTalk, talkOptions, RECENT_LINES } from '../src/domain/talk.js';
import { queueHelpRequest } from '../src/domain/alliances.js';
import { pickFrom } from '../src/domain/leaders.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const NATIONS = map.nations.map(n => n.id);
// Les réponses d'aide (HELP_LINES) ne sont pas exportées : on lit le tableau dans la source.
const helpSource = readFileSync(join(root, 'src/domain/alliances.js'), 'utf8');
const HELP_LINES = Function(`return ${helpSource.slice(helpSource.indexOf('const HELP_LINES = ') + 19, helpSource.indexOf('\n};\n', helpSource.indexOf('const HELP_LINES')) + 2)}`)();
const helpLists = () => {
  const out = {};
  const walk = (v, path) => { if (Array.isArray(v)) out[path] = v; else for (const [k, x] of Object.entries(v)) walk(x, path ? `${path}.${k}` : k); };
  walk(HELP_LINES, 'help');
  return out;
};
const allLists = () => ({ ...talkLineLists(), ...helpLists() });

test('V13.3 : plus aucune réplique ne parle de commerce, de marchands ni de ports ouverts', () => {
  for (const [path, list] of Object.entries(allLists())) for (const l of list) {
    assert.doesNotMatch(l, /marchand|commerc|commerç|négoce|échanges? de biens|ports? (sont |est )?ouverts?/i, `${path} : ${l}`);
  }
});

test('V13.3 : chaque liste est au moins triplée (≥ 9 répliques, ≥ 6 pour les listes très spécifiques)', () => {
  const lists = allLists();
  // Listes très spécifiques : réponses d'aide par personnalité, cas particuliers des alliances.
  const specific = path => path.startsWith('help.');
  for (const [path, list] of Object.entries(lists)) {
    assert.ok(list.length >= (specific(path) ? 6 : 9), `${path} : ${list.length} répliques`);
    assert.equal(new Set(list).size, list.length, `${path} : doublon`);
  }
  const total = Object.values(lists).reduce((n, l) => n + l.length, 0);
  assert.ok(total >= 600, `${total} répliques`);
  assert.ok(allTalkLines().length >= 500);
});

test('V13.3 : style — courtes, ponctuées, apostrophes typographiques, espaces avant « ? ! : », jetons connus', () => {
  for (const [path, list] of Object.entries(allLists())) for (const l of list) {
    assert.ok(l.length <= 110, `${path} trop longue (${l.length}) : ${l}`);
    assert.ok(/[.!?…]$/.test(l), `${path} ponctuation finale : ${l}`);
    assert.doesNotMatch(l, /'/, `${path} apostrophe droite : ${l}`);
    assert.doesNotMatch(l.replace(/\{\w+\}/g, 'X'), /[^\s][?!:;]/, `${path} espace avant la ponctuation : ${l}`);
    for (const tok of l.match(/\{[^}]*\}/g) || []) assert.ok(['{to}', '{x}', '{p}', '{gold}'].includes(tok), `${path} jeton inconnu ${tok}`);
    assert.doesNotMatch(l, /\b(idiot|imbécile|crétin|abruti|minable|lâche|débile)s?\b/i, l);
  }
  // Jetons respectés : {gold} seulement dans les offres en or (et toujours présent), {x}/{p} seulement dans les aides.
  for (const [path, list] of Object.entries(talkLineLists())) for (const l of list) {
    if (/Gold/.test(path)) assert.match(l, /\{gold\}/, `${path} : ${l}`); else assert.doesNotMatch(l, /\{gold\}|\{x\}|\{p\}/, `${path} : ${l}`);
    assert.match(l, /\{to\}/, `${path} : ${l}`);
  }
  for (const [path, list] of Object.entries(helpLists())) for (const l of list) {
    assert.match(l, /\{to\}/, `${path} : ${l}`);
    if (/allyOfTarget|outOfReach/.test(path)) assert.match(l, /\{x\}/, `${path} : ${l}`);
  }
});

// --- Anti-répétition --------------------------------------------------------------------------------------------
test('V13.3 : anti-répétition — pickLine saute les répliques des 6 derniers messages du même dirigeant', () => {
  const s = createGameState({ map, playerNationId: 'valmorne', seed: 'paroles' });
  const list = talkLineLists()['ai.conquerorThreat'];
  const start = pickFrom(s, list, 'k', 1);
  assert.equal(pickLine(s, list, 'oroel', 'k', 1), start, 'sans historique : même tirage que pickFrom');
  // Oroël vient de dire la réplique tirée : la suivante non récente est choisie (à partir de l'index tiré).
  publishTalk(s, { from: 'oroel', to: 'valmorne', tone: 'hostile', text: start.replaceAll('{to}', 'Valmorne'), ai: true });
  assert.ok(usedRecently(s, 'oroel', start));
  const next = pickLine(s, list, 'oroel', 'k', 1);
  assert.notEqual(next, start);
  assert.equal(next, list[(list.indexOf(start) + 1) % list.length]);
  // Un autre dirigeant n'est pas concerné.
  assert.equal(pickLine(s, list, 'aurel', 'k', 1), start);
  // Toutes les répliques utilisées sauf une : c'est elle qui sort, quel que soit le tirage.
  const t = createGameState({ map, playerNationId: 'valmorne', seed: 'paroles' });
  const short = list.slice(0, RECENT_LINES + 1);
  for (const l of short.slice(0, RECENT_LINES)) publishTalk(t, { from: 'oroel', to: 'valmorne', tone: 'hostile', text: l.replaceAll('{to}', 'Valmorne'), ai: true });
  for (let k = 0; k < 20; k++) assert.equal(pickLine(t, short, 'oroel', 'k', k), short[RECENT_LINES]);
  // Au-delà des 6 derniers messages, une réplique peut revenir.
  publishTalk(t, { from: 'oroel', to: 'valmorne', tone: 'neutre', text: 'Autre chose.', ai: true });
  assert.equal(recentTexts(t, 'oroel').length, RECENT_LINES);
  assert.ok(!usedRecently(t, 'oroel', short[0]), 'la plus ancienne n\'est plus récente');
});

test('V13.3 : propositions du joueur — pas deux fois de suite la même phrase après l\'avoir publiée', () => {
  const s = createGameState({ map, playerNationId: 'valmorne', seed: 'joueur' });
  for (const id of NATIONS) s.controllers[id] = 'human';
  setRelation(s, { nationId: 'valmorne', target: 'oroel', type: 'war' });
  const said = [];
  for (let i = 0; i < RECENT_LINES; i++) {
    const [hostile] = talkOptions(s, map, { from: 'valmorne', to: 'oroel' });
    assert.ok(!said.includes(hostile.text), `répétition : ${hostile.text}`);
    said.push(hostile.text);
    publishTalk(s, { from: 'valmorne', to: 'oroel', tone: 'hostile', text: hostile.text });
  }
});

// --- Simulation IA contre IA ------------------------------------------------------------------------------------
function simulate(seed, turns = 80) {
  const s = createGameState({ map, playerNationId: 'valmorne', seed });
  for (const id of NATIONS) s.controllers[id] = 'ai';
  const talks = [];
  for (let i = 0; i < turns && !s.events.some(e => e.type === 'game-over'); i++) {
    const before = new Set((s.talk || []).map(m => m.id));
    resolveInterturn(s, map);
    for (const m of s.talk || []) if (!before.has(m.id)) talks.push({ ...m });
  }
  return { s, talks };
}
const SEEDS = ['paroles-1', 'paroles-2', 'paroles-3'];

test('V13.3 : 80 tours IA contre IA — tous les jetons remplacés, aucun commerce, aucune répétition récente', () => {
  let total = 0;
  const distinct = new Set();
  for (const seed of SEEDS) {
    const { talks } = simulate(seed);
    total += talks.length;
    const byLeader = {};
    for (const m of talks) {
      assert.doesNotMatch(m.text, /[{}]/, `${seed} : jeton non remplacé : ${m.text}`);
      assert.doesNotMatch(m.text, /marchand|commerc|commerç/i, m.text);
      distinct.add(m.text);
      const prev = (byLeader[m.from] ||= []);
      // Un dirigeant ne republie pas un texte de ses 6 derniers messages (hors réplique unique épuisée).
      assert.ok(!prev.slice(-RECENT_LINES).includes(m.text), `${seed} : ${m.from} répète « ${m.text} »`);
      prev.push(m.text);
    }
  }
  assert.ok(total > 20, `${total} messages`);
  assert.ok(distinct.size / total > .6, `${distinct.size} textes distincts sur ${total}`);
});

test('V13.3 : déterminisme — même graine, mêmes messages ; autre graine, autres messages', () => {
  const a = simulate('determinisme', 40).talks.map(m => `${m.turn}|${m.from}|${m.to}|${m.text}`);
  const b = simulate('determinisme', 40).talks.map(m => `${m.turn}|${m.from}|${m.to}|${m.text}`);
  const c = simulate('autre-graine', 40).talks.map(m => `${m.turn}|${m.from}|${m.to}|${m.text}`);
  assert.ok(a.length > 0);
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, c);
});

test('V13.3 : réponses d\'aide — jetons {to}, {x}, {p} remplacés pour chaque personnalité', () => {
  for (const arch of ['heros', 'conquerant', 'batisseur', 'traitre']) for (let turn = 1; turn <= 6; turn++) {
    const s = createGameState({ map, playerNationId: 'valmorne', seed: `aide-${arch}-${turn}` });
    for (const id of NATIONS) s.controllers[id] = id === 'valmorne' ? 'human' : 'ai';
    s.leaders = Object.fromEntries(NATIONS.filter(id => id !== 'valmorne').map(id => [id, { archetype: arch, revealed: false }]));
    setRelation(s, { nationId: 'valmorne', target: 'aurel', type: 'alliance' });
    const p = Object.keys(s.provinces).find(id => s.provinces[id].ownerId === 'valmorne');
    s.turn = turn;
    const req = turn % 2 ? { kind: 'defend', provinceId: p } : { kind: 'attack', target: 'oroel' };
    assert.equal(queueHelpRequest(s, { from: 'valmorne', to: 'aurel', ...req }).ok, true);
    resolveInterturn(s, map);
    const answer = s.talk.find(m => m.from === 'aurel' && m.to === 'valmorne' && s.events.some(e => e.type === 'help-answer' && e.talkId === m.id));
    assert.ok(answer, `${arch} : réponse`);
    assert.doesNotMatch(answer.text, /[{}]/, answer.text);
  }
});
