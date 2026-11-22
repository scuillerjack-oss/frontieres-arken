// V14.3 — tutoriel facultatif et rejouable (docs/V14-cahier-des-charges.md, section 2 point 9).
// V17.9 : le tutoriel est refait pour le temps réel (tests du scénario et des étapes : tests/v17-9.test.js). Restent ici les
// garanties de la V14.3 qui valent toujours : sauvegarde distincte, proposé une fois, rejouable, quitter, bulle.
import { test } from 'node:test';
import { readSource } from './helpers/sources.js';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { arkenV9Map as map } from '../src/map/arken-v9-map.js';
import { advanceDay } from '../src/domain/game-engine.js';
import { encodeSave, decodeRealtimeSave } from '../src/persistence/save-codec.js';
import { SAVE_KEY } from '../src/presentation/guide-input.js';
import { TUTO_SAVE_KEY, TUTO_OFFER_KEY, createTutorialState, isTutorial, saveKeyFor, storeGame, loadTutorial, clearTutorial,
  tutorialOffered, markTutorialOffered, tutorialCompleted, firstVisibleTarget, bubblePlacement } from '../src/presentation/tutorial.js';

const read = f => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
function memoryStorage() { const m = new Map(); return { getItem: k => m.has(k) ? m.get(k) : null, setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), keys: () => [...m.keys()] }; }
const decodeSave = text => decodeRealtimeSave(text).state;

test('tutoriel : sauvegarde distincte — la vraie partie (frontieres-arken-v2-save) n\'est jamais écrasée', () => {
  const store = memoryStorage(), real = '{"vraie":"partie","turn":42}';
  store.setItem(SAVE_KEY, real);
  assert.equal(SAVE_KEY, 'frontieres-arken-v2-save');
  assert.notEqual(TUTO_SAVE_KEY, SAVE_KEY);
  const t = createTutorialState({ map });
  assert.equal(saveKeyFor(t), TUTO_SAVE_KEY);
  assert.equal(saveKeyFor({ turn: 3 }), SAVE_KEY, 'une partie normale garde sa clé');
  // Démarrer, jouer, sauvegarder à chaque tour, quitter, reprendre, finir : la vraie partie reste identique.
  assert.equal(storeGame(t, encodeSave, store), true);
  for (let i = 0; i < 5; i++) advanceDay(t, map); storeGame(t, encodeSave, store);
  assert.equal(store.getItem(SAVE_KEY), real);
  const resumed = loadTutorial(decodeSave, store);
  assert.ok(resumed && isTutorial(resumed)); assert.equal(resumed.day, 6, 'reprise au bon jour');
  clearTutorial(store);
  assert.equal(loadTutorial(decodeSave, store), null);
  assert.equal(store.getItem(SAVE_KEY), real, 'toujours intacte après la fin du tutoriel');
  // Une vraie partie stockée sous la clé du tutoriel n'est jamais prise pour un tutoriel.
  store.setItem(TUTO_SAVE_KEY, real); assert.equal(loadTutorial(decodeSave, store), null);
  // Stockage indisponible : pas de plantage.
  const broken = { getItem() { throw new Error('x'); }, setItem() { throw new Error('x'); }, removeItem() { throw new Error('x'); } };
  assert.equal(storeGame(t, encodeSave, broken), false); assert.equal(loadTutorial(decodeSave, broken), null); clearTutorial(broken);
  assert.equal(tutorialOffered(broken), false);
});

test('tutoriel : proposé une seule fois au premier lancement, jamais imposé ; rejouable', () => {
  const store = memoryStorage();
  assert.equal(tutorialOffered(store), false);
  markTutorialOffered(store); assert.equal(tutorialOffered(store), true); assert.equal(tutorialCompleted(store), false);
  markTutorialOffered(store, 'termine'); assert.equal(tutorialCompleted(store), true);
  assert.ok(![TUTO_OFFER_KEY, TUTO_SAVE_KEY].includes(SAVE_KEY));
  const html = read('index.html'), app = readSource('app.js');
  assert.match(html, /id="welcomeTutorial"/, 'entrée sur l\'accueil');
  assert.match(html, /id="replayTutorial">🎓 Jouer le tutoriel</, 'entrée dans les Paramètres');
  assert.match(app, /label:'Passer',value:false\},\{label:'Jouer le tutoriel',value:true,primary:true\}/, 'Jouer le tutoriel / Passer');
  assert.match(app, /async function offerTutorial\(\)\{if\(tutorialOffered\(\)\)return;markTutorialOffered\(\);/, 'proposé une seule fois');
  assert.match(app, /\$\('#replayTutorial'\)\.onclick=\(\)=>\{\$\('#settingsDialog'\)\.close\(\);startTutorial\(\);\}/, 'rejouer = repartir du début');
  assert.match(app, /\$\('#welcomeTutorial'\)\.onclick=\(\)=>startTutorial\(\{resume:true\}\)/, 'accueil = reprendre');
});

test('tutoriel : quitter à tout moment, retrouver sa partie ; sauvegarde par la bonne clé', () => {
  const app = readSource('app.js');
  assert.match(app, /const save = \(\) => \{ if \(state\) localStorage\.setItem\(saveKeyFor\(state\), encodeSave\(state\)\); \};/);
  assert.doesNotMatch(app, /localStorage\.setItem\(SAVE_KEY/, 'plus aucune écriture directe sur la clé de la vraie partie');
  assert.match(app, /\$\('#miniTutoSkip'\)\.onclick=quitTutorial;/, 'le bouton « Quitter » de la bulle');
  assert.match(app, /function quitTutorial\(\)\{if\(tutoStep===null\)return;pauseRealtime\(\);save\(\);stopTuto\(\);closeAllDialogs\(\);showWelcome\(\);/, 'relecture : plus aucune fenêtre ouverte sur l\'accueil');
  assert.match(app, /function finishTutorial\(\)\{stopTuto\(\);closeAllDialogs\(\);/);
  assert.match(app, /dataset\.permanent!=='true'\)tuto\('journal-closed'\)/, 'relecture : l\'historique ne valide pas l\'étape du journal');
  assert.doesNotMatch(app, /replayMiniTuto|startMiniTuto/, 'V17.9 : plus de mini tuto');
  assert.match(app, /host=\[\.\.\.document\.querySelectorAll\('dialog\[open\]'\)\]\.at\(-1\)\|\|document\.body/, 'relecture : la bulle va dans la fenêtre ouverte (sinon « Quitter » serait inerte)');
  assert.match(app, /if \(\(days \|\| changed\) && !isTutorial\(state\)\) \{ const fresh/, 'le tutoriel ne compte pas pour les missions (V17.9 : temps réel)');
  assert.match(app, /game && !isTutorial\(game\) \? setPlayerBonuses/, 'pas d\'atouts dans le tutoriel');
  assert.ok(read('sw.js').includes("'./src/presentation/tutorial.js'"));
  assert.doesNotMatch(read('src/presentation/tutorial.js'), /frontieres-arken-v2-save/);
});

test('tutoriel : surlignage et bulle — la cible visible la plus précise, la bulle à l\'opposé', () => {
  const visible = new Set(['#rtPlay', '[data-id="p01"]']);
  assert.equal(firstVisibleTarget(['#acceptConfirmation', '#rtPlay'], s => visible.has(s)), '#rtPlay');
  assert.equal(firstVisibleTarget(['#x'], () => { throw new Error('sélecteur'); }), null);
  assert.equal(bubblePlacement({ top: 780, height: 40 }, 852), 'top', 'cible en bas (▶) → bulle en haut');
  assert.equal(bubblePlacement({ top: 100, height: 40 }, 852), 'bottom');
  const css = read('v5.css');
  assert.match(css, /\.tuto-target\{outline:3px solid #3fcf74/);
  assert.match(css, /#miniTuto\.tuto-full\.bottom\{inset:auto 12px calc\(66px \+ env\(safe-area-inset-bottom\)\) 12px\}/, 'safe area en bas');
  assert.match(css, /#miniTuto\{position:fixed;z-index:31;inset:calc\(70px \+ env\(safe-area-inset-top\)\)/, 'safe area en haut');
});

test('version 14.3.0 ou suivante (V17.10 : 17.10.0)', () => {
  assert.equal(JSON.parse(read('package.json')).version, '17.10.2');
});
