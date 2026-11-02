// V15.4 — Partie courte de 40 tours, palmarès et titres (docs/V15-cahier-des-charges.md).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { arkenV9Map as map } from '../src/map/arken-v9-map.js';
import { createGameState } from '../src/state/create-game-state.js';
import { RULES, SAVE_SCHEMA_VERSION, SHORT_GAME_SCHEMA_VERSION } from '../src/domain/constants.js';
import { checkGameOver, journalEntry, resolveInterturn } from '../src/domain/game-engine.js';
import { DEFAULT_GAME_LENGTH, gameLengthOf, scaleTurn, sanitizeGameLength } from '../src/domain/game-length.js';
import { builderAwake } from '../src/domain/engine/ai.js';
import { contextFragments } from '../src/domain/talk-compose.js';
import { TITLES, emptyPalmares, gameRecordId, recordFinishedGame, sanitizePalmares } from '../src/domain/palmares.js';
import { createProfile, decodeProfile, encodeProfile } from '../src/domain/profile.js';
import { decodeSave, encodeSave } from '../src/persistence/save-codec.js';
import { createTutorialState } from '../src/presentation/tutorial.js';
import { endTitlesHtml, palmaresHtml } from '../src/presentation/palmares-view.js';
import { DOMAIN_MODULES_V15_4, readSource, root } from './helpers/sources.js';

const NATIONS = map.nations.map(n => n.id);
const game = (o = {}) => createGameState({ map, playerNationId: 'valmorne', seed: 'arken-test', ...o });
const short = o => game({ gameLength: 40, ...o });
const allAI = s => { for (const id of NATIONS) s.controllers[id] = 'ai'; return s; };
/** Partie finie, sans jouer : fin de partie au classement, joueur humain à la place voulue. */
function finished({ gameLength, seed = 'arken-fini', rank = 1, reason = 'turn-limit', turn, nation = 'valmorne', difficulty } = {}) {
  const s = createGameState({ map, playerNationId: nation, seed, gameLength, difficulty });
  const others = NATIONS.filter(n => n !== nation);
  const ranking = [...others.slice(0, rank - 1), nation, ...others.slice(rank - 1)].map((nationId, i) => ({ nationId, rank: i + 1, provinces: 5 - i, capitals: 1, treasury: 0, eliminated: false }));
  s.turn = turn ?? gameLengthOf(s);
  s.gameOver = { reason, turn: s.turn, winnerId: ranking[0].nationId, ranking };
  return s;
}

// --- Longueur de la partie ----------------------------------------------------------------------------------------
test('V15.4 : 80 tours par défaut, sans aucune clé en plus dans l’état ; RULES.gameLength reste la référence', () => {
  const s = game();
  assert.equal('gameLength' in s, false);
  assert.equal(gameLengthOf(s), 80);
  assert.equal(RULES.gameLength, 80);
  assert.equal(DEFAULT_GAME_LENGTH, 80);
  assert.equal(s.schemaVersion, SAVE_SCHEMA_VERSION);
  assert.equal(sanitizeGameLength(12), 80);
  assert.equal('gameLength' in game({ gameLength: 12 }), false);
  for (const t of [1, 6, 10, 20, 45]) assert.equal(scaleTurn(s, t), t);
});
test('V15.4 : une partie de 40 tours finit au tour 40, jamais au-delà, IA contre IA', () => {
  for (const seed of ['court-1', 'court-2', 'court-3']) {
    const s = allAI(short({ seed }));
    assert.equal(s.gameLength, 40);
    let turns = 0;
    while (!s.gameOver && turns < 100) { resolveInterturn(s, map); turns++; }
    assert.ok(s.gameOver.turn <= 40, `${seed} : fin au tour ${s.gameOver.turn}`);
    if (s.gameOver.reason === 'turn-limit') assert.equal(s.gameOver.turn, 40);
  }
});
test('V15.4 : alerte des 5 derniers tours au tour 35 d’une partie courte, avec le bon tour de fin ; 80 tours inchangé', () => {
  const s = allAI(short({ seed: 'alerte' })); s.turn = 35; resolveInterturn(s, map);
  const e = s.events.find(x => x.type === 'final-turns');
  assert.equal(e.remaining, 5);
  assert.match(journalEntry(e, map, s.playerNationId).text, /tour 40/);
  const l = allAI(game({ seed: 'alerte' })); l.turn = 75; resolveInterturn(l, map);
  const e80 = l.events.find(x => x.type === 'final-turns');
  assert.equal('length' in e80, false);
  assert.match(journalEntry(e80, map, l.playerNationId).text, /tour 80/);
  const avant = allAI(short({ seed: 'alerte2' })); avant.turn = 75; assert.equal(avant.events.some(x => x.type === 'final-turns'), false);
});
test('V15.4 : les seuils de l’IA suivent la longueur (relance de la guerre, Bâtisseur, coalition, annonces)', () => {
  const s = short();
  assert.equal(scaleTurn(s, RULES.ai.lateTurn), 23);
  assert.equal(scaleTurn(s, RULES.ai.builderLateTurn), 23);
  assert.equal(scaleTurn(s, RULES.coalition.minTurn), 5);
  const ai = readFileSync(join(root, 'src/domain/engine/ai.js'), 'utf8'), naval = readFileSync(join(root, 'src/domain/engine/ai-naval.js'), 'utf8');
  assert.doesNotMatch(ai + naval, /state\.turn (>=|<) RULES\.ai\.(lateTurn|builderLateTurn)/);
  // Bâtisseur : éveillé au tour 23 en 40 tours, encore endormi au même tour en 80.
  const builderIn = st => Object.keys(st.leaders).find(id => st.leaders[id].archetype === 'batisseur');
  const c = short({ seed: 'bat-1' }), l = game({ seed: 'bat-1' }), id = builderIn(c);
  assert.ok(id, 'graine avec un Bâtisseur');
  for (const st of [c, l]) { st.turn = 23; for (const pr of Object.values(st.provinces)) if (pr.ownerId === id) pr.units.infantry = 5000; }
  assert.equal(builderAwake(l, map, id), false);
  assert.equal(builderAwake(c, map, id), true);
  // Les dirigeants parlent de la bonne fin.
  const ctx = (st, T) => { st.turn = T; return contextFragments(st, map, { from: 'roc-epine', to: null, tone: 'neutre' }).map(f => f.id); };
  assert.ok(ctx(short(), 36).includes('fin'));
  assert.ok(!ctx(game(), 36).includes('fin'));
  assert.ok(ctx(game(), 75).includes('fin'));
});
test('V15.4 : le tutoriel reste en 80 tours, sans longueur propre', () => {
  const t = createTutorialState({ map });
  assert.equal('gameLength' in t, false);
  assert.equal(gameLengthOf(t), 80);
});
test('V15.4 : deux parties courtes de même graine sont identiques (moteur déterministe)', () => {
  const play = () => { const s = allAI(short({ seed: 'meme' })); for (let i = 0; i < 12; i++) resolveInterturn(s, map); return JSON.stringify(s); };
  assert.equal(play(), play());
});

// --- Sauvegarde ----------------------------------------------------------------------------------------------------
test('V15.4 : sauvegarde : ancienne (sans longueur) = 80 tours, tous schémas ; partie courte conservée au schéma 12', () => {
  for (const version of [8, 9, 10, 11]) {
    const old = structuredClone(game()); old.schemaVersion = version;
    const m = decodeSave(JSON.stringify(old));
    assert.equal(gameLengthOf(m), 80, `schéma ${version}`);
    assert.equal(m.schemaVersion, SAVE_SCHEMA_VERSION);
  }
  const s = short(), text = encodeSave(s);
  assert.equal(JSON.parse(text).schemaVersion, SHORT_GAME_SCHEMA_VERSION);
  const back = decodeSave(text);
  assert.equal(back.gameLength, 40);
  assert.deepEqual(back, s);
  // Une partie de 80 tours s'écrit à l'octet près comme en V15.3.
  assert.equal(JSON.parse(encodeSave(game())).schemaVersion, 11);
});
test('V15.4 : une longueur illisible ne plante pas et revient à 80 tours', () => {
  for (const [schemaVersion, gameLength] of [[12, 99], [12, 'x'], [12, undefined], [11, 40]]) {
    const m = decodeSave(JSON.stringify({ ...game(), schemaVersion, gameLength }));
    assert.equal(gameLengthOf(m), 80);
    assert.equal('gameLength' in m, false);
    assert.equal(m.schemaVersion, 11);
  }
  assert.throws(() => decodeSave(JSON.stringify({ ...game(), schemaVersion: 13 })), /unsupported_save_schema:13/);
});
test('V15.4 : la sauvegarde de partie ne contient ni palmarès ni titre, même après le comptage', () => {
  const p = createProfile(), s = finished({ gameLength: 40 });
  const before = JSON.stringify(s);
  recordFinishedGame(p, s);
  assert.equal(JSON.stringify(s), before, 'le comptage ne touche pas à la partie');
  assert.doesNotMatch(encodeSave(s), /palmares|"titles"|premiere-page|"counted"/);
  assert.ok(encodeProfile(p).includes('premiere-page'));
});

// --- Palmarès ------------------------------------------------------------------------------------------------------
test('V15.4 : une partie n’est comptée qu’une fois : écran rouvert, sauvegarde rechargée, profil rechargé', () => {
  let p = createProfile();
  const s = finished({ gameLength: 40, difficulty: 'difficile' });
  const first = recordFinishedGame(p, s);
  assert.equal(first.counted, true);
  assert.ok(first.titles.includes('premiere-couronne'));
  assert.equal(p.palmares.games, 1);
  // Écran de fin rouvert : pas de nouveau compte, mais les mêmes titres à afficher.
  const again = recordFinishedGame(p, s);
  assert.equal(again.counted, false);
  assert.deepEqual(again.titles, first.titles);
  // Sauvegarde et profil rechargés.
  p = decodeProfile(encodeProfile(p));
  assert.equal(recordFinishedGame(p, decodeSave(encodeSave(s))).counted, false);
  assert.equal(p.palmares.games, 1);
  assert.equal(p.palmares.wins, 1);
  assert.equal(p.palmares.winsByNation.valmorne, 1);
  assert.equal(p.palmares.winsByDifficulty.difficile, 1);
  assert.equal(p.palmares.gamesByLength[40], 1);
  assert.equal(p.palmares.bestRank, 1);
  assert.deepEqual(p.palmares.fastestWin, { turn: 40, nationId: 'valmorne', length: 40 });
  // Une AUTRE partie compte.
  assert.equal(recordFinishedGame(p, finished({ seed: 'arken-autre', rank: 3 })).counted, true);
  assert.equal(p.palmares.games, 2);
  assert.equal(p.palmares.wins, 1);
  assert.equal(p.palmares.bestRank, 1);
});
test('V15.4 : meilleur classement et plus rapide victoire gardent le meilleur chiffre', () => {
  const p = createProfile();
  recordFinishedGame(p, finished({ seed: 'arken-a', rank: 4 }));
  assert.equal(p.palmares.bestRank, 4);
  assert.equal(p.palmares.fastestWin, null);
  recordFinishedGame(p, finished({ seed: 'arken-b', rank: 2 }));
  assert.equal(p.palmares.bestRank, 2);
  recordFinishedGame(p, finished({ seed: 'arken-c', turn: 60, reason: 'capitals' }));
  recordFinishedGame(p, finished({ seed: 'arken-d', turn: 70, reason: 'capitals' }));
  assert.equal(p.palmares.fastestWin.turn, 60);
  assert.ok(p.palmares.titles.includes('maitre-arken'));
});
test('V15.4 : défaite par élimination : comptée, sans victoire, même si la nation gagnante n’est pas le joueur', () => {
  const p = createProfile();
  recordFinishedGame(p, finished({ seed: 'arken-e', rank: 5, reason: 'player-eliminated', turn: 30 }));
  assert.equal(p.palmares.games, 1);
  assert.equal(p.palmares.wins, 0);
  assert.ok(p.palmares.titles.includes('cendres'));
});
test('V15.4 : le tutoriel n’est jamais compté', () => {
  const p = createProfile(), t = createTutorialState({ map });
  t.gameOver = { reason: 'turn-limit', turn: 8, winnerId: t.playerNationId, ranking: [{ nationId: t.playerNationId, rank: 1 }] };
  assert.equal(recordFinishedGame(p, t).counted, false);
  assert.deepEqual(p.palmares, emptyPalmares());
});
test('V15.4 : partie finie sans identifiant : ne plante pas, n’est jamais comptée, à aucune répétition', () => {
  for (const seed of [undefined, null, '', 42, 'arken-v0']) {
    const p = createProfile(), s = finished({}); s.seed = seed;
    assert.equal(gameRecordId(s), null);
    for (let i = 0; i < 3; i++) assert.deepEqual(recordFinishedGame(p, s), { counted: false, titles: [] });
    assert.equal(p.palmares.games, 0);
  }
  assert.equal(recordFinishedGame(createProfile(), game()).counted, false, 'partie pas finie');
  const bare = finished({ seed: 'arken-nu' }); delete bare.story; bare.gameOver = { reason: 'turn-limit', turn: 80, winnerId: 'aurel' };
  const p = createProfile();
  assert.equal(recordFinishedGame(p, bare).counted, true, 'ancienne fin sans classement');
  assert.equal(p.palmares.bestRank, null);
});
test('V15.4 : profil ancien sans palmarès : repris sans rien perdre ; palmarès abîmé : réparé', () => {
  const old = { ...createProfile(), tokens: 7, gamesStarted: 4, boosts: { ...createProfile().boosts, gold: 3 } };
  delete old.palmares;
  const p = decodeProfile(JSON.stringify(old));
  assert.equal(p.tokens, 7);
  assert.equal(p.gamesStarted, 4);
  assert.equal(p.boosts.gold, 3);
  assert.deepEqual(p.palmares, emptyPalmares());
  for (const bad of [null, 3, 'x', [], { games: -4, titles: 'x', counted: {}, winsByNation: 3, fastestWin: 'y', last: 2, gamesByLength: [1] }]) {
    const s = sanitizePalmares(bad);
    assert.equal(s.games, 0); assert.deepEqual(s.titles, []); assert.deepEqual(s.counted, []); assert.equal(s.fastestWin, null);
  }
  assert.ok(sanitizePalmares({ titles: ['premiere-page', 'inconnu', 'premiere-page'] }).titles.length === 1);
});
test('V15.4 : la mémoire des parties comptées reste bornée', () => {
  const p = createProfile();
  for (let i = 0; i < 230; i++) recordFinishedGame(p, finished({ seed: `arken-${i}`, rank: 2 }));
  assert.equal(p.palmares.games, 230);
  assert.equal(p.palmares.counted.length, 200);
});

// --- Titres --------------------------------------------------------------------------------------------------------
test('V15.4 : titres : aucun effet ni promesse : ni avantage, ni pub, ni achat, et le moteur ne les lit pas', () => {
  const forbidden = /avantage|bonus|puissan|\bpubs?\b|publicit|achat|acheter|payer|payant|jeton|atout|boutique|gratuit/i;
  assert.ok(TITLES.length >= 8);
  for (const t of TITLES) assert.doesNotMatch(`${t.name} ${t.text}`, forbidden, t.id);
  const p = createProfile();
  p.palmares.titles = TITLES.map(t => t.id);
  assert.doesNotMatch(palmaresHtml(p.palmares, map.nations), forbidden);
  assert.doesNotMatch(endTitlesHtml(p.palmares.titles), forbidden);
  assert.doesNotMatch(readSource('src/domain/game-engine.js'), /palmares|\.titles\b/);
  // Un profil plein de titres ne change pas la partie.
  const play = () => { const s = allAI(short({ seed: 'titres' })); for (let i = 0; i < 6; i++) resolveInterturn(s, map); return JSON.stringify(s); };
  assert.equal(play(), play());
});
test('V15.4 : titres cachés : les conditions ne s’affichent qu’une fois le titre obtenu', () => {
  const html = palmaresHtml(emptyPalmares(), map.nations);
  for (const t of TITLES) { assert.ok(!html.includes(t.name), t.id); assert.ok(!html.includes(t.text), t.id); }
  assert.match(html, new RegExp(`${TITLES.length} titres restent à découvrir`));
  const p = createProfile();
  recordFinishedGame(p, finished({ seed: 'arken-t', rank: 2 }));
  const after = palmaresHtml(p.palmares, map.nations);
  assert.match(after, /Première page/);
  assert.doesNotMatch(after, /Maître d’Arken/);
});
test('V15.4 : cinq bannières, seul contre tous, retour de loin, chroniqueur', () => {
  const p = createProfile();
  NATIONS.forEach((nation, i) => recordFinishedGame(p, finished({ seed: `arken-n${i}`, nation })));
  assert.ok(p.palmares.titles.includes('cinq-bannieres'));
  const s = finished({ seed: 'arken-x' }); s.story.marks = [[12, 'f', 'valmorne', 'aurel'], [14, 'c', 'aurel', 'valmorne', 'p01']];
  recordFinishedGame(p, s);
  assert.ok(p.palmares.titles.includes('seul-contre-tous'));
  assert.ok(p.palmares.titles.includes('retour-de-loin'));
  for (let i = 0; i < 4; i++) recordFinishedGame(p, finished({ seed: `arken-m${i}`, rank: 2 }));
  assert.ok(p.palmares.titles.includes('chroniqueur'));
});

// --- Interface et code ---------------------------------------------------------------------------------------------
test('V15.4 : interface : choix de la durée à côté du niveau, 80 présélectionné ; palmarès depuis l’accueil', () => {
  const index = readFileSync(join(root, 'index.html'), 'utf8'), app = readSource('app.js');
  assert.match(index, /id="lengthChoices"/);
  assert.match(index, /id="welcomePalmares"/);
  assert.match(index, /id="palmaresDialog"/);
  assert.match(app, /let gameLength=DEFAULT_GAME_LENGTH/);
  assert.match(app, /difficulty:level,gameLength\}/);
  assert.match(app, /const record=recordFinishedGame\(profile,state\)/);
  assert.match(app, /\$\('#welcomePalmares'\)\.onclick=openPalmares/);
});
test('V15.4 : pub de début de partie : même appel qu’en 80 tours, sans condition sur la durée', () => {
  const flow = readSource('src/presentation/ui/game-flow.js');
  assert.match(flow, /showGameStartAd\(\{profile,inTutorial:isTutorial\(state\)\|\|shouldStartMiniTuto\(\)\}\)/);
  assert.doesNotMatch(readFileSync(join(root, 'src/presentation/ads.js'), 'utf8'), /gameLength/);
});
test('V15.4 : modules purs : ni DOM, ni hasard, ni date ; présents hors ligne ; version 15.4.0', () => {
  const sw = readFileSync(join(root, 'sw.js'), 'utf8');
  for (const f of DOMAIN_MODULES_V15_4) {
    const code = readFileSync(join(root, f), 'utf8').replace(/\/\/.*$/gm, '');
    assert.doesNotMatch(code, /\bdocument\b|\bwindow\b|localStorage|Math\.random|Date\.now|new Date/, f);
    assert.ok(sw.includes(`'./${f}'`), f);
  }
  assert.ok(sw.includes("'./src/presentation/palmares-view.js'"));
  assert.equal(JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version, '15.4.0');
});
test('V15.4 : checkGameOver : ancienne partie à 80 au-delà du tour 40 non finie ; partie courte au tour 40 finie', () => {
  const l = game(); l.turn = 40; assert.equal(checkGameOver(l), null);
  const s = short(); s.turn = 40; assert.equal(checkGameOver(s).reason, 'turn-limit');
  const v = short(); v.turn = 39; assert.equal(checkGameOver(v), null);
});
