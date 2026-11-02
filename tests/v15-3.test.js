// V15.3 : niveaux de difficulté, bonus de nation, fin de partie du Bâtisseur, corrections héritées de la V15.2.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { RULES, SAVE_SCHEMA_VERSION } from '../src/domain/constants.js';
import { DIFFICULTY_IDS, aiGoldPct, difficultyOf, difficultyText, sanitizeDifficulty } from '../src/domain/difficulty.js';
import { nationBonusInfo } from '../src/domain/nations.js';
import { bonusPct, effectPct, fortBonusFactor, navalBonusFactor, recruitPreview, setPlayerBonuses } from '../src/domain/boosts.js';
import { builderAwake } from '../src/domain/engine/ai.js';
import { navalBase } from '../src/domain/engine/ai-naval.js';
import { journalEntry, planAIOrders, queueRecruitment, resolveInterturn } from '../src/domain/game-engine.js';
import { arkenV9Map as map } from '../src/map/arken-v9-map.js';
import { decodeSave, encodeSave, migrateSave } from '../src/persistence/save-codec.js';
import { createSoundEngine } from '../src/presentation/sound-engine.js';
import { TOUCH_GUARD_MS, guardTouches } from '../src/presentation/turn-animation.js';
import { createTutorialState } from '../src/presentation/tutorial.js';
import { createGameState } from '../src/state/create-game-state.js';
import { DOMAIN_MODULES_V15_3, flatSource, readSource } from './helpers/sources.js';

const NATIONS = map.nations.map(n => n.id);
const game = (o = {}) => createGameState({ map, playerNationId: 'valmorne', seed: 'v153', ...o });
const allAi = s => { for (const id of NATIONS) s.controllers[id] = 'ai'; return s; };
const setArch = (s, id, archetype) => { s.leaders[id] = { archetype, revealed: false }; };

// --- Corrections héritées ---------------------------------------------------------------------------------------------
test('accueil : la mélodie s’arrête tout de suite en quittant la partie, sans attendre le geste suivant', () => {
  const src = flatSource('src/presentation/ui/game-flow.js');
  assert.match(src, /setState\(null\);syncMusic\(\);/, 'showWelcome remet la mélodie en accord après avoir quitté la partie');
  assert.match(src, /setActiveScreen\(document,'game'\);syncMusic\(\);/, 'et elle reprend en revenant en partie');
  // Ce que fait cet appel : sans partie (réglages absents), la mélodie s'arrête.
  const ctx = class { state = 'running'; currentTime = 0; destination = {}; createGain() { return { gain: { value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {}, disconnect() {} }; }
    createOscillator() { return { frequency: { setValueAtTime() {} }, connect() {}, start() {}, stop() {}, disconnect() {} }; } resume() { return Promise.resolve(); } suspend() { return Promise.resolve(); } };
  let settings = { music: true, sfx: true };
  const engine = createSoundEngine({ getContextClass: () => ctx, settings: () => settings, setTimer: () => 1, clearTimer: () => {} });
  engine.unlock(); assert.equal(engine.status.music, true);
  settings = null; engine.syncMusic(); assert.equal(engine.status.music, false);
});
const fakeTarget = () => { const on = new Map(); return { on, addEventListener: (t, f) => on.set(t, f), removeEventListener: t => on.delete(t) }; };
const fakeClick = () => { const e = { stopped: 0, stopPropagation() { e.stopped++; }, preventDefault() {} }; return e; };
test('fin d’animation : le deuxième toucher est ignoré un court instant, puis les clics repassent', () => {
  const t = fakeTarget(); let due = null;
  guardTouches(t, { setTimer: (f, ms) => { due = { f, ms }; return 1; }, clearTimer: () => {} });
  const e = fakeClick(); t.on.get('click')(e);
  assert.equal(e.stopped, 1, 'la fenêtre qui s’ouvre ne reçoit pas ce toucher');
  assert.equal(due.ms, TOUCH_GUARD_MS); assert.ok(TOUCH_GUARD_MS <= 500, 'assez court pour ne jamais gêner un vrai choix');
  due.f(); assert.equal(t.on.has('click'), false);
});
test('fin d’animation : doigt encore posé, la garde dure jusqu’à ce qu’il se lève', () => {
  const t = fakeTarget(), timers = [];
  guardTouches(t, { pressing: true, setTimer: (f, ms) => { timers.push({ f, ms }); return timers.length; }, clearTimer: () => {} });
  assert.ok(timers[0].ms > TOUCH_GUARD_MS, 'filet de sécurité seulement');
  t.on.get('pointerup')();
  assert.ok(timers[1].ms <= 100); timers[1].f();
  assert.deepEqual([...t.on.keys()], [], 'plus aucun écouteur ne reste');
});
test('l’animation pose bien la garde en finissant', () => {
  assert.match(readSource('src/presentation/ui/turn-anim.js'), /guardTouches\(document, \{ pressing \}\);\s*\/\/[^\n]*\n\s*resolve\(\);/);
});

// --- Niveaux ----------------------------------------------------------------------------------------------------------
test('niveau : stocké dans la partie, Normal par défaut, valeur inconnue = Normal', () => {
  assert.equal(game().difficulty, 'normal');
  for (const id of DIFFICULTY_IDS) { assert.equal(game({ difficulty: id }).difficulty, id); assert.equal(decodeSave(encodeSave(game({ difficulty: id }))).difficulty, id); }
  assert.equal(game({ difficulty: 'cauchemar' }).difficulty, 'normal');
  assert.equal(sanitizeDifficulty(undefined), 'normal'); assert.equal(difficultyOf({}), 'normal');
});
test('anciennes sauvegardes : schéma 11, elles valent Normal', () => {
  assert.equal(SAVE_SCHEMA_VERSION, 11);
  for (const version of [10, 9]) {
    const old = structuredClone(game({ difficulty: 'difficile' })); delete old.difficulty; old.events = []; old.schemaVersion = version;
    if (version === 9) { delete old.story; delete old.coalition; }
    const m = migrateSave(old);
    assert.equal(m.schemaVersion, 11); assert.equal(m.difficulty, 'normal'); assert.equal(aiGoldPct(m), 0);
    resolveInterturn(m, map); assert.equal(m.difficulty, 'normal');
  }
});
test('Normal : aucun réglage, et la même partie que sans niveau', () => {
  assert.deepEqual(RULES.difficulty.normal, {});
  const a = allAi(game({ seed: 'n1' })), b = allAi(game({ seed: 'n1', difficulty: 'normal' }));
  for (let i = 0; i < 15; i++) { resolveInterturn(a, map); resolveInterturn(b, map); }
  assert.equal(JSON.stringify(a), JSON.stringify(b));
});
test('Normal : présélectionné à l’écran, tout est écrit au choix', () => {
  const src = readSource('src/presentation/ui/game-flow.js');
  assert.match(src, /let level=DEFAULT_DIFFICULTY;/);
  assert.match(src, /difficulty:level/);
  assert.match(difficultyText('normal'), /sans triche/);
  assert.match(difficultyText('difficile'), new RegExp(`\\+${RULES.difficulty.difficile.aiGoldPct} % d’or`));
  assert.doesNotMatch(difficultyText('facile'), /or\b/);
});
test('Difficile : bonus d’or exact pour les IA, jamais pour le joueur ; annoncé au journal ; ni en Normal ni en Facile', () => {
  const pct = RULES.difficulty.difficile.aiGoldPct;
  const gain = (difficulty, id) => { const s = game({ difficulty }); for (const n of NATIONS) if (n !== 'valmorne') s.controllers[n] = 'human'; if (id !== 'valmorne') s.controllers[id] = 'ai'; s.leaders[id] ||= { archetype: 'heros', revealed: false }; const t0 = s.nations[id].treasury; for (const n of NATIONS) for (const k of ['bank']) s.provinces[map.provinces.find(p => p.initialOwner === n).id].buildings[k] = 0; s.ai.plannedTurn = 1; for (let i = 0; i < 1; i++) { s.ai.plannedTurn = s.turn; resolveInterturn(s, map); } return s.nations[id].treasury - t0; };
  assert.equal(gain('difficile', 'noireflamme'), gain('normal', 'noireflamme') + Math.floor(gain('normal', 'noireflamme') * pct / 100));
  assert.equal(gain('difficile', 'valmorne'), gain('normal', 'valmorne'), 'le joueur ne reçoit rien');
  assert.equal(gain('facile', 'noireflamme'), gain('normal', 'noireflamme'));
  const s = game({ difficulty: 'difficile' }), ev = s.events.find(e => e.type === 'difficulty-gold');
  assert.equal(ev.pct, pct);
  assert.match(journalEntry(ev, map, 'valmorne').text, new RegExp(`\\+${pct} % d’or`));
  assert.ok(!game().events.some(e => e.type === 'difficulty-gold'));
  assert.equal(createTutorialState({ map }).difficulty, 'normal');
});
test('Facile : l’IA attend et ose moins, Difficile : elle dépense davantage', () => {
  const orders = difficulty => { const s = allAi(game({ difficulty, seed: 'f1' })); setArch(s, 'roc-epine', 'conquerant'); s.turn = 3; s.ai.plannedTurn = null; planAIOrders(s, map); return s.orders.filter(o => o.nationId === 'roc-epine' && o.kind === 'move' && s.provinces[o.toId]?.ownerId !== 'roc-epine'); };
  assert.ok(RULES.difficulty.facile.warDelay > 0 && RULES.difficulty.facile.marginAdd > 0 && RULES.difficulty.facile.ambition === false && RULES.difficulty.facile.oneAttack);
  assert.ok(orders('facile').length <= orders('normal').length);
  const spent = difficulty => { const s = allAi(game({ difficulty, seed: 'f2' })); setArch(s, 'roc-epine', 'conquerant'); s.turn = 12; s.provinces.p05.buildings.factory = 1; s.provinces.p05.buildings.port = 1; s.provinces.p05.warships = 5; s.nations['roc-epine'].treasury = 500; s.ai.plannedTurn = null; planAIOrders(s, map); return s.orders.filter(o => o.nationId === 'roc-epine' && o.kind === 'recruitment' && o.type === 'armor').length; };
  assert.ok(spent('difficile') > spent('normal'));
});
test('jetons et atouts : les mêmes à tous les niveaux', () => {
  for (const f of ['src/domain/profile.js']) assert.doesNotMatch(readSource(f), /difficult/i, 'les jetons ne dépendent pas du niveau');
  const levels = { gold: 3, recruit: 4, build: 5, fort: 6, naval: 7 };
  const seen = DIFFICULTY_IDS.map(difficulty => { const s = setPlayerBonuses(game({ difficulty }), levels); return ['gold', 'recruit', 'build', 'fort', 'naval'].map(k => bonusPct(s, 'valmorne', k)); });
  assert.deepEqual(seen[0], seen[1]); assert.deepEqual(seen[1], seen[2]);
});

// --- Bonus de nation --------------------------------------------------------------------------------------------------
test('bonus : un par nation, modeste, écrit à partir de la vraie valeur', () => {
  for (const id of NATIONS) {
    const entries = Object.entries(RULES.nationBonus[id]);
    assert.equal(entries.length, 1, id); assert.ok(entries[0][1] > 0 && entries[0][1] <= 15, `${id} : modeste`);
    const info = nationBonusInfo(id); assert.ok(info.title.length > 3); assert.ok(info.text.includes(`${entries[0][1]} %`), id);
  }
  assert.match(flatSource('src/presentation/ui/game-flow.js'), /data-nation-bonus>\$\{bonus\.title\} : \$\{bonus\.text\}/);
});
test('bonus : il sert aussi aux IA, pas dans le tutoriel', () => {
  const s = game();
  assert.equal(effectPct(s, 'noireflamme', 'build'), RULES.nationBonus.noireflamme.build);
  assert.equal(bonusPct(s, 'noireflamme', 'build'), 0, 'ce n’est pas un atout');
  assert.equal(fortBonusFactor(s, 'roc-epine'), 1 + RULES.nationBonus['roc-epine'].fort / 100);
  assert.equal(navalBonusFactor(s, 'oroel'), 1 + RULES.nationBonus.oroel.naval / 100);
  const t = createTutorialState({ map });
  for (const id of NATIONS) assert.equal(effectPct(t, id, Object.keys(RULES.nationBonus[id])[0]), 0, id);
});
test('bonus : chantier, infanterie et or arrivent dans le moteur, et s’ajoutent aux atouts', () => {
  const s = game(); s.controllers.noireflamme = 'human'; s.controllers.oroel = 'human'; s.controllers.aurel = 'human'; s.controllers['roc-epine'] = 'human';
  const base = s.provinces.p02.units.infantry;
  queueRecruitment(s, { nationId: 'valmorne', provinceId: 'p02', type: 'infantry', lots: 5 });
  const t0 = s.nations.aurel.treasury;
  resolveInterturn(s, map);
  assert.equal(s.provinces.p02.units.infantry - base, 100 + RULES.nationBonus.valmorne.recruit);
  assert.equal(s.nations.aurel.treasury - t0, 16, '4 provinces × 4 or ; +4 % : crédit de 64 centièmes, pas encore d’or entier');
  const ev = s.events.find(e => e.type === 'production-complete' && e.bonus);
  assert.match(journalEntry(ev, map, 'valmorne').text, /grâce à vos bonus/);
  const r = setPlayerBonuses(game(), { recruit: 10 });
  assert.equal(recruitPreview(r, 'valmorne', 'infantry', 100), 100 + 10 + RULES.nationBonus.valmorne.recruit);
});

// --- Bâtisseur et bases navales ---------------------------------------------------------------------------------------
const builder = (turn, value = 2000) => { const s = allAi(game({ seed: 'b1' })); setArch(s, 'roc-epine', 'batisseur'); for (const [id, a] of [['valmorne', 'heros'], ['noireflamme', 'heros'], ['oroel', 'heros'], ['aurel', 'heros']]) setArch(s, id, a); s.turn = turn;
  s.provinces.p05.units = { infantry: value, cavalry: 0, armor: 40, artillery: 0 }; s.provinces.p05.buildings.port = 1; s.provinces.p05.buildings.factory = 1; s.provinces.p05.warships = 6; s.nations['roc-epine'].treasury = 900; s.ai.plannedTurn = null; return s; };
test('Bâtisseur : sage avant la fin de partie, il attaque ensuite avec son trésor', () => {
  const before = builder(RULES.ai.builderLateTurn - 1), after = builder(RULES.ai.builderLateTurn);
  assert.equal(builderAwake(before, map, 'roc-epine'), false); assert.equal(builderAwake(after, map, 'roc-epine'), true);
  planAIOrders(before, map); planAIOrders(after, map);
  const invade = s => s.orders.filter(o => o.kind === 'move' && o.nationId === 'roc-epine' && s.provinces[o.toId].ownerId !== 'roc-epine');
  const armor = s => s.orders.filter(o => o.kind === 'recruitment' && o.nationId === 'roc-epine' && o.type === 'armor').length;
  assert.equal(invade(before).length, 0, 'il ne se bat que menacé');
  assert.ok(invade(after).length >= 1, 'il part à la conquête');
  assert.ok(armor(after) > armor(before), 'son or devient une armée');
});
test('Bâtisseur : saigné, il reste prudent ; un autre caractère n’est jamais concerné', () => {
  const s = builder(70, 0); s.provinces.p05.units.armor = 0; s.provinces.p05.warships = 0; for (const id of ['p06', 'p07', 'p08']) s.provinces[id].units.infantry = 1;
  for (const p of Object.values(s.provinces)) if (p.ownerId !== 'roc-epine') p.units.infantry = 5000;
  assert.equal(builderAwake(s, map, 'roc-epine'), false);
  const t = builder(70); setArch(t, 'roc-epine', 'heros'); assert.equal(builderAwake(t, map, 'roc-epine'), false);
});
test('base navale : le Bâtisseur et le Traître la gardent à leur capitale, le Conquérant vise la côte la plus faible', () => {
  const owned = s => map.provinces.filter(p => s.provinces[p.id].ownerId === 'noireflamme');
  const base = arch => { const s = allAi(game({ seed: 'nb' })); setArch(s, 'noireflamme', arch); return navalBase(map, s, owned(s)).id; };
  assert.equal(base('batisseur'), 'p09'); assert.equal(base('traitre'), 'p09'); assert.equal(base('conquerant'), 'p11');
});

// --- Pureté ----------------------------------------------------------------------------------------------------------
test('nouveaux modules : sans DOM ni hasard, dans le service worker', () => {
  const sw = readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
  for (const f of DOMAIN_MODULES_V15_3) {
    const src = readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
    assert.doesNotMatch(src, /\bdocument\b|\bwindow\b|Math\.random|Date\.now/, f);
    assert.ok(sw.includes(`./${f}`), `${f} dans ASSETS`);
  }
});
test('Difficile : l’annonce du bonus d’or arrive dans le journal du premier tour', () => {
  const s = game({ difficulty: 'difficile' }); resolveInterturn(s, map);
  assert.ok(s.turnJournal.some(e => /Niveau Difficile/.test(e.text)));
  const n = game(); resolveInterturn(n, map);
  assert.ok(!n.turnJournal.some(e => /Niveau Difficile/.test(e.text)));
});
