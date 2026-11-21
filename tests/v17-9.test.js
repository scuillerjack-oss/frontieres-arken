// V17.9 — tutoriel refait pour le temps réel, aide réécrite, plus aucun « tour » à l'écran, retrait du tour par tour pour le
// joueur, reliquats des relectures (phare, bandeaux des ordres, ?pub-test, restauration de profil, Atouts).
// Le tutoriel est rejoué ici avec le VRAI moteur, geste par geste : chaque étape doit être réalisable et dire vrai.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { arkenV9Map as map } from '../src/map/arken-v9-map.js';
import { RULES } from '../src/domain/constants.js';
import * as E from '../src/domain/game-engine.js';
import { createRealtimeGame } from '../src/domain/realtime/create.js';
import { encodeSave, decodeRealtimeSave } from '../src/persistence/save-codec.js';
import { createGameState } from '../src/state/create-game-state.js';
import { exportProfile, importProfile, createProfile, BOOST_INFO, MISSION_CATALOG, missionDeltas, HINT_GAMES } from '../src/domain/profile.js';
import { aiGoldPct } from '../src/domain/difficulty.js';
import { ensureWar } from '../src/domain/engine/diplomacy.js';
import { marchesOf } from '../src/domain/realtime/marches.js';
import { foodConsumption, foodProduction } from '../src/domain/realtime/food.js';
import { nationBonusInfo } from '../src/domain/nations.js';
import { lighthouseFleets } from '../src/domain/vision.js';
import { buildEndStory } from '../src/domain/story.js';
import { TUTORIAL_GUIDE } from '../src/presentation/guide-input.js';
import { MYSTERY_HELP, islandSheetView, islandMapBadge } from '../src/presentation/mystery-island-view.js';
import { recruitDetailHtml, SHIP_REPAIR_TEXT, shipRepairChip } from '../src/presentation/recruit-repair-view.js';
import { BOMBARD_RULE_TEXT, bombardPreviewText } from '../src/presentation/bombard-view.js';
import { missingUnitPrerequisites } from '../src/presentation/map-orders-view.js';
import { endStoryHtml } from '../src/presentation/end-view.js';
import { periodLabel } from '../src/presentation/ranking-view.js';
import { eventBanners, incomingBanners, unitTokens } from '../src/presentation/realtime-view.js';
import { forcedAdCheck, giftAvailable, createAdTimer } from '../src/presentation/ad-timer.js';
import {
  TUTORIAL_STEPS, TUTORIAL_THEMES, TUTO_SAVE_KEY, TUTO_VERSION, TUTO_BATTLE, TUTO_SPEED, createTutorialState, isTutorial, isCurrentTutorial,
  loadTutorial, storeGame, tutorialAdvance, tutorialStepView, tutorialWaitDone, tutorialAllowsPlay, tutorialPausesAt, tutorialHint,
  moveEvents, isRunStep
} from '../src/presentation/tutorial.js';
import { readSource, flatSource } from './helpers/sources.js';

const read = f => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
const ME = 'valmorne';
const R = RULES.realtime;
/** « tour » au sens du tour par tour (« demi-tour », « le tour du monde » mis à part). */
const TOUR = /\btours?\b|inter-tour|Fin du tour/i;
const noTour = (text, where) => assert.doesNotMatch(String(text).replace(/demi-tour/g, ''), TOUR, `${where} : ${String(text).slice(0, 140)}`);
function memoryStorage() { const m = new Map(); return { getItem: k => m.has(k) ? m.get(k) : null, setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) }; }

/**
 * Joue le tutoriel comme un joueur : chaque geste de l'interface → l'ordre du moteur → l'événement du tutoriel ; les étapes
 * « regarder » font avancer les jours (▶) jusqu'à ce que ce qu'on attend arrive. `attackPct` : part de Branvale envoyée.
 */
function playTutorial({ attackPct = 50, recallLate = false } = {}) {
  const s = createTutorialState({ map });
  let i = 0; const log = [], waited = {};
  const ev = e => { const n = tutorialAdvance(i, e, s); if (n !== i) log.push([TUTORIAL_STEPS[i].id, e, s.day]); i = n ?? TUTORIAL_STEPS.length; };
  const run = () => {
    const id = TUTORIAL_STEPS[i].id, d0 = s.day;
    assert.ok(isRunStep(i) && tutorialAllowsPlay(i), `${id} : étape « regarder »`);
    while (!tutorialWaitDone(i, s) && s.day - d0 < 80) E.advanceDay(s, map);
    assert.ok(tutorialWaitDone(i, s), `${id} : ce qu'on attend arrive dans la partie`);
    waited[id] = s.day - d0; log.push([id, 'attendu', s.day]); i++;
  };
  const go = () => E.executePendingOrders(s, map);
  const move = (from, to, pct = 50, warships = 0) => {
    const a = E.availableForces(s, from, ME), part = k => Math.floor((a[k] || 0) * pct / 100);
    const r = E.queueMoveOrder(s, map, { nationId: ME, fromId: from, toId: to, units: { infantry: part('infantry'), cavalry: part('cavalry'), armor: part('armor'), artillery: part('artillery') }, warships });
    assert.equal(r.ok, true, r.error); go();
    const route = E.legalDestinations(map, s, from).find(x => x.id === to);
    for (const e of moveEvents({ routeType: route.type, fromId: from, toId: to })) ev(e);
  };
  const build = type => { const r = E.queueConstruction(s, { nationId: ME, provinceId: 'p01', type }); assert.equal(r.ok, true, `${type} : ${r.error}`); go(); ev(`build:${type}`); };
  ev('ok'); ev('pan'); ev('select:p01');
  ev('play'); ev('pause'); ev('food');
  for (const t of ['bank', 'farm', 'fort', 'factory']) build(t);
  ev('select:p03');
  assert.equal(E.queueRecruitment(s, { nationId: ME, provinceId: 'p01', type: 'infantry', lots: 1 }).ok, true); go(); ev('recruit');
  move('p01', 'p02');
  run();                                                     // l'armée avance
  if (recallLate) { while (marchesOf(s, ME).some(m => !m.returning)) E.advanceDay(s, map); ev(tutorialStepView(i, s).on[0]); }
  else { const m = s.marches.find(x => x.fromId === 'p01' && !x.returning); assert.equal(E.recallMarch(s, { nationId: ME, marchId: m.id }).ok, true); ev('unit-open'); ev('recall'); }
  move(TUTO_BATTLE.attackFrom, TUTO_BATTLE.province, attackPct);
  move(TUTO_BATTLE.reinforceFrom, TUTO_BATTLE.province);
  run();                                                     // en marche
  const battleView = tutorialStepView(i, s);
  ev(battleView.on.includes('battle-open') && (s.battles || []).length ? 'battle-open' : 'ok');
  run();                                                     // les assauts
  const issue = tutorialStepView(i, s).text; ev('ok');
  ev('journal-closed'); ev('ok');                            // journal, famine
  move('p03', 'p14', 100, 3);                                // la mer
  { const b = s.balloons[0]; assert.equal(E.queueBalloonSend(s, map, { nationId: ME, balloonId: b.id, to: 'aurel' }).ok, true); go(); ev('balloon-open'); ev('balloon-send'); }
  assert.equal(E.queueDiplomaticOrder(s, { nationId: ME, target: 'roc-epine', action: 'alliance' }).ok, true); go(); ev('alliance:roc-epine');
  run();                                                     // la réponse
  const answer = tutorialStepView(i, s).text; ev('ok');
  ev('select:p21'); ev('ranking'); ev('ok'); ev('ok'); ev('ok');
  return { s, i, log, waited, issue, answer };
}

// --- Étapes ---------------------------------------------------------------------------------------------------------
test('tutoriel : étapes courtes, une idée chacune, dans l’ordre des thèmes, tout le programme demandé par Jack', () => {
  const ids = TUTORIAL_STEPS.map(s => s.id);
  // Programme de la demande : carte et défilement, date et ▶ ⏸ ⏩, or et vivres, 5 constructions, recruter, envoyer une armée et
  // la voir avancer, rappel, bataille en 3 assauts avec renfort et retraite, famine, mer et convois, ballon, diplomatie
  // (alliance, réponse), île mystérieuse et phare, classement et fin de partie, 🎁.
  for (const id of ['defiler', 'date', 'pause', 'or-vivres', 'banque', 'ferme', 'forteresse', 'usine', 'port', 'recruter', 'envoyer', 'avancer', 'rappel',
    'attaquer', 'renfort', 'bataille', 'assauts', 'famine', 'mer', 'ballon', 'diplomatie', 'reponse', 'ile', 'classement', 'fin', 'cadeau']) assert.ok(ids.includes(id), id);
  assert.equal(new Set(ids).size, ids.length);
  let last = 0;
  for (const st of TUTORIAL_STEPS) {
    const k = TUTORIAL_THEMES.indexOf(st.theme); assert.ok(k >= last, `${st.id} : thème dans l’ordre`); last = k;
    assert.ok(st.title.length <= 32, `${st.id} : titre court`);
    if (st.text) assert.ok(st.text.length <= 250, `${st.id} : ${st.text.length} caractères`);
    if (st.goal) assert.ok(st.goal.length <= 140, `${st.id} : objectif court`);
    const gesture = ![].concat(st.on).includes('ok');
    if (gesture) assert.ok(st.goal, `${st.id} : un geste demandé = un objectif « 👉 » écrit`);
  }
  // Les textes nomment les vrais boutons et les vraies règles.
  const text = id => TUTORIAL_STEPS.find(s => s.id === id).text;
  assert.match(text('date'), /▶/); assert.match(text('date'), /⏩ ×2 est réservé au Premium/); assert.match(text('pause'), /⏸/);
  assert.match(text('bataille'), new RegExp(`${R.battle.assaults} assauts, un tous les ${R.battle.assaultEveryDays} jours`)); assert.match(text('bataille'), /Retraite/);
  assert.match(text('renfort'), /rejoint au prochain assaut/);
  assert.match(text('banque'), new RegExp(`${RULES.buildings.bank.cost} or, ${R.durations.buildings.bank} jours`));
  assert.match(text('ferme'), new RegExp(`\\+${R.food.farmDaily} vivres par jour`));
  assert.match(text('famine'), new RegExp(`${R.food.famineDesertPct} % de l’armée déserte chaque jour`));
  assert.match(text('mer'), new RegExp(`${R.durations.sea} jours de mer`));
  assert.match(text('reponse'), new RegExp(`${R.diplomacy.aiAnswerMaxDays} au plus`));
  assert.match(text('ile'), /phare 🗼/);
  assert.match(text('classement'), new RegExp(`${R.ranking.province} par province, \\+${R.ranking.capital} par capitale`));
  assert.match(text('fin'), /31 décembre 2041/); assert.match(text('fin'), /5 capitales/); assert.match(text('fin'), /en paix/);
  assert.match(text('cadeau'), /🎁/); assert.match(text('cadeau'), /Jamais dans ce tutoriel/);
});

test('tutoriel : jamais de conseil de stratégie, jamais de « tour » (les joueurs découvrent les stratégies eux-mêmes)', () => {
  const all = TUTORIAL_STEPS.flatMap(s => [s.title, s.text, s.goal || '']);
  const s = createTutorialState({ map });
  for (const st of TUTORIAL_STEPS) if (st.dynamic) { const v = tutorialStepView(TUTORIAL_STEPS.indexOf(st), s); all.push(v.text); }
  for (const t of all) {
    noTour(t, 'tutoriel');
    assert.doesNotMatch(t, /\b(conseil|astuce|pensez à|n’oubliez|il vaut mieux|mieux vaut|le plus efficace|stratégie gagnante|il faut (construire|recruter|attaquer))/i, t);
  }
  assert.match(TUTORIAL_STEPS.at(-1).text, /Les stratégies, c’est à vous de les trouver/);
});

test('tutoriel : partie d’entraînement en temps réel, scénario fixe, sauvegarde à part, sans pub ni atouts', () => {
  const s = createTutorialState({ map });
  assert.equal(s.mode, 'realtime'); assert.equal(s.day, 1); assert.ok(isTutorial(s) && isCurrentTutorial(s));
  assert.equal(s.tutorialRun.version, TUTO_VERSION);
  assert.deepEqual(Object.entries(s.controllers).filter(([, c]) => c === 'ai').map(([id]) => id), ['roc-epine'], 'une seule IA : le futur allié');
  assert.equal(s.provinces[TUTO_BATTLE.province].ownerId, 'oroel');
  assert.equal(s.provinces.p03.buildings.port, 1); assert.equal(s.provinces.p03.warships, 3);
  assert.equal(s.balloons.length, 1); assert.equal(s.settings.hints, false);
  assert.ok(foodProduction(s, ME) >= foodConsumption(s, ME), 'vivres à l’équilibre ou positifs au départ (pas de « −25/j »)');
  assert.ok(foodProduction(s, ME) - foodConsumption(s, ME) <= 10 * R.food.hundredths, 'légèrement positifs');
  assert.equal(aiGoldPct(s), 0);
  // Une ancienne partie de tutoriel au tour par tour (V14.3) n'est jamais reprise.
  const store = memoryStorage(), old = createGameState({ map, playerNationId: ME, seed: 'x' }); old.tutorialMode = true;
  store.setItem(TUTO_SAVE_KEY, encodeSave(old));
  assert.equal(loadTutorial(t => decodeRealtimeSave(t).state, store), null);
  storeGame(s, encodeSave, store); assert.ok(loadTutorial(t => decodeRealtimeSave(t).state, store));
  // Pas de pub, pas de 🎁, pas de mission pendant le tutoriel.
  const t = createAdTimer({ seed: 'x', now: 0 }); t.playMs = 3600e3; t.giftAtMs = 0;
  assert.equal(giftAvailable(t, { tutorial: true }), false);
  assert.equal(forcedAdCheck(t, { moment: 'pause', tutorial: true }).ok, false);
  const ad = readSource('src/presentation/ui/ad-ui.js');
  assert.match(ad, /export const inTutorialNow = \(\) => isTutorial\(state\) \|\| tutoStep !== null;/);
});

test('tutoriel : parcours complet joué avec le vrai moteur — bataille en 3 assauts avec renfort, réponse de l’allié, aucune étape bloquée', () => {
  const r = playTutorial();
  assert.equal(r.i, TUTORIAL_STEPS.length, `toutes les étapes : ${r.log.map(x => x[0]).join(' ')}`);
  assert.deepEqual(r.log.map(x => x[0]), TUTORIAL_STEPS.map(x => x.id), 'chaque étape une fois, dans l’ordre');
  const s = r.s, b = s.events.filter(e => e.provinceId === TUTO_BATTLE.province);
  const assaults = b.filter(e => e.type === 'assault').map(e => e.assault);
  assert.deepEqual(assaults, [1, 2, 3], '3 assauts');
  assert.ok(b.some(e => e.type === 'battle-reinforced'), 'le renfort de Sylvaren rejoint la bataille');
  assert.equal(s.provinces[TUTO_BATTLE.province].ownerId, ME, 'prise au 3e assaut');
  assert.match(r.issue, /Haut-Bois est à vous/);
  assert.match(r.answer, /Roc-Épine accepte/);
  assert.ok(r.waited.reponse >= 1 && r.waited.reponse <= R.diplomacy.aiAnswerMaxDays, `réponse en ${r.waited.reponse} jours`);
  assert.ok(r.waited.avancer === 4, 'l’armée avance 4 jours');
  assert.ok(s.day < 60, `entraînement court : ${s.day} jours`);
  assert.ok(!s.gameOver);
  assert.ok(!s.nations[ME].food.famine);
  assert.ok(s.transports.some(t => t.nationId === ME && t.toId === 'p14'), 'le convoi est parti');
  assert.ok(s.balloons[0].to === 'aurel' || s.balloons[0].over === 'aurel');
  // Sauvegarde du tutoriel au milieu : relue telle quelle.
  assert.deepEqual(decodeRealtimeSave(encodeSave(s)).state.tutorialRun, s.tutorialRun);
});

test('tutoriel : ce que dit la bulle suit ce qui s’est vraiment passé (attaque à 100 %, rappel trop tard)', () => {
  const full = playTutorial({ attackPct: 100 });
  assert.equal(full.i, TUTORIAL_STEPS.length);
  assert.match(full.issue, /est à vous/, 'prise dès le 1er assaut : la bulle le dit');
  const late = playTutorial({ recallLate: true });
  assert.equal(late.i, TUTORIAL_STEPS.length, 'armée déjà arrivée : l’étape du rappel devient une explication');
  const s = createTutorialState({ map });
  const k = TUTORIAL_STEPS.findIndex(x => x.id === 'issue');
  assert.match(tutorialStepView(k, s).text, /La défense a tenu/, 'province pas prise : la bulle le dit');
  const kb = TUTORIAL_STEPS.findIndex(x => x.id === 'bataille');
  assert.deepEqual(tutorialStepView(kb, s).on, ['ok'], 'pas de bataille : explication, pas de geste impossible');
});

test('tutoriel : le temps est en pause pendant les explications, ▶ seulement aux étapes « regarder », à 1 jour par seconde', () => {
  for (const [i, st] of TUTORIAL_STEPS.entries()) {
    if (st.clock === 'run') { assert.ok(tutorialAllowsPlay(i) && typeof st.until === 'function' && /▶/.test(st.goal), st.id); continue; }
    if (st.id === 'date' || st.id === 'pause') { assert.ok(tutorialAllowsPlay(i), st.id); continue; }
    assert.equal(tutorialAllowsPlay(i), false, `${st.id} : ▶ refusé (explication en pause)`);
    assert.equal(tutorialPausesAt(i), true, `${st.id} : le temps s'arrête en arrivant`);
  }
  assert.equal(tutorialPausesAt(TUTORIAL_STEPS.findIndex(x => x.id === 'pause')), false, 'l’étape « pause » laisse tourner le temps jusqu’à ⏸');
  assert.match(tutorialHint(TUTORIAL_STEPS.findIndex(x => x.id === 'banque'), 'play'), /en pause pendant cette explication/);
  assert.match(tutorialHint(0, 'fast'), /réservé au Premium/);
  assert.equal(TUTO_SPEED, 2);
  const ui = readSource('src/presentation/ui/realtime-ui.js');
  assert.match(ui, /if \(inTutorial\(\) && mode !== 'pause'\) \{/);
  assert.match(ui, /tuto\(mode === 'fast' \? 'fast' : 'play'\);\n    if \(!tutorialAllowsPlay\(tutoStep\)\) return true;\n    setClockSpeed\(clock, TUTO_SPEED, t\)/, '⏩ n’ouvre jamais l’offre Premium dans le tutoriel');
  assert.ok(ui.indexOf("if (inTutorial() && mode !== 'pause')") < ui.indexOf("openPremium({ from: 'fast' })"));
  assert.match(ui, /export function pauseRealtime\(\)/);
  const tu = readSource('src/presentation/ui/tutorials.js');
  assert.match(tu, /if\(tutorialWaitDone\(tutoStep,state\)\)return setTutoStep\(tutoStep\+1\);/);
  assert.match(tu, /if\(tutorialPausesAt\(i\)\)pauseRealtime\(\);/);
});

test('tutoriel : chaque geste réel est émis par l’interface (glisser, ▶ ⏸, vivres, construire, armée, rappel, bataille, ballon, 🏆)', () => {
  const app = readSource('app.js');
  for (const re of [/tuto\('pan'\)/, /tuto\('pause'\)/, /tuto\('food'\)/, /tuto\(`build:\$\{type\}`\)/, /for\(const ev of moveEvents\(\{routeType:route\?\.type,fromId,toId\}\)\)tuto\(ev\)/,
    /tuto\('unit-open'\)/, /tuto\('recall'\)/, /tuto\('battle-open'\)/, /tuto\('balloon-send'\)/, /tuto\('ranking'\)/, /tuto\(`select:\$\{id\}`\)/, /tuto\('recruit'\)/,
    /tuto\(`\$\{action\}:\$\{target\}`\)/, /tuto\('journal-closed'\)/]) assert.match(app, re);
  assert.deepEqual(moveEvents({ routeType: 'land', fromId: 'p01', toId: 'p02' }), ['move-land', 'move:p01-p02']);
  assert.deepEqual(moveEvents({ routeType: 'sea', fromId: 'p03', toId: 'p14' }), ['move-sea', 'move:p03-p14']);
});

test('tutoriel : rejouable depuis ⚙ et depuis l’accueil, proposé au premier lancement, remplace l’ancien tutoriel et le mini tuto', () => {
  const app = readSource('app.js'), html = read('index.html');
  assert.match(html, /id="replayTutorial">🎓 Jouer le tutoriel</); assert.match(html, /id="welcomeTutorial"/);
  assert.match(app, /\$\('#replayTutorial'\)\.onclick=\(\)=>\{\$\('#settingsDialog'\)\.close\(\);startTutorial\(\);\}/);
  assert.match(app, /\$\('#welcomeTutorial'\)\.onclick=\(\)=>startTutorial\(\{resume:true\}\)/);
  assert.match(app, /async function offerTutorial\(\)\{if\(tutorialOffered\(\)\)return;markTutorialOffered\(\);/);
  assert.match(app, /setup\(\)\{[^\n]*offerTutorial\(\);\}/);
  assert.match(app, /createTutorialState\(\{map\}\)/);
  assert.doesNotMatch(app, /MINI_TUTO|startMiniTuto|replayMiniTuto|miniStep/, 'plus de mini tuto');
  assert.doesNotMatch(html, /replayMiniTuto|Relancer le mini tuto/);
  assert.doesNotMatch(read('src/presentation/tutorial.js'), /createGameState|end-turn|Fin du tour/, 'plus rien du tutoriel au tour par tour');
});

// --- Aide (?) et textes affichés : plus aucun « tour » ---------------------------------------------------------------
test('aide (?) réécrite pour le temps réel : règles lues dans RULES.realtime, aucun « tour »', () => {
  for (const x of TUTORIAL_GUIDE) { noTour(x.text, `aide « ${x.id} »`); assert.ok(x.text.length <= 280, x.id); }
  const g = id => TUTORIAL_GUIDE.find(x => x.id === id).text;
  assert.match(g('time'), new RegExp(`1 jour toutes les ${R.clock.msPerDay / 1000} secondes`));
  assert.match(g('move'), new RegExp(`${R.durations.land * R.durations.landDistance.min} à ${R.durations.land * R.durations.landDistance.max} jours`));
  assert.match(g('food'), new RegExp(`${R.food.provinceDaily} vivres par jour`));
  assert.match(g('battle'), new RegExp(`${R.battle.assaults} assauts, un tous les ${R.battle.assaultEveryDays} jours`));
  assert.match(g('build'), /\+2,5 or \/ mois/);
  assert.match(g('balloon'), new RegExp(`${R.durations.balloonHop} jours par île`));
  assert.match(g('ranking'), new RegExp(`${R.ranking.province} points par province`));
  assert.match(MYSTERY_HELP.text, new RegExp(`${RULES.mysteryIsland.routeTurns * R.durations.landPerSeaTurn} jours de mer`));
  for (const id of ['time', 'food', 'battle', 'ranking', 'gift']) assert.ok(TUTORIAL_GUIDE.some(x => x.id === id), id);
  // Bulles d'explication : seulement les 2 premières parties (règle de Jack d'octobre), jamais pendant le tutoriel.
  const tu = readSource('src/presentation/ui/tutorials.js');
  assert.match(tu, /export function hintsOn\(\)\{return hintsActive\(profile\)/);
  assert.match(tu, /if \(tutoStep!==null\) return; \/\/ jamais pendant le tutoriel/);
  assert.equal(HINT_GAMES, 2);
});

test('plus aucun « tour » visible : recrutement, réparation, bombardement, Atouts, nations, accueil, île, prérequis, récit de fin', () => {
  for (const k of Object.keys(RULES.units)) { const h = recruitDetailHtml(k).replace(/<[^>]+>/g, ' '); noTour(h, `recrutement ${k}`); assert.match(h, new RegExp(`${R.durations.units[k]} jours de recrutement`)); }
  noTour(SHIP_REPAIR_TEXT, 'réparation'); assert.match(SHIP_REPAIR_TEXT, /90, 120 ou 150 jours/);
  noTour(shipRepairChip({ ships: 2, hp: 500, maxHp: 1400, wounded: true, inPort: true, turnsLeft: 4, daysLeft: 40 }), 'pastille des navires');
  assert.match(shipRepairChip({ ships: 2, hp: 500, maxHp: 1400, wounded: true, inPort: true, turnsLeft: 4, daysLeft: 40 }), /100 % dans 40 jours/);
  noTour(BOMBARD_RULE_TEXT(), 'bombardement'); assert.match(BOMBARD_RULE_TEXT(), new RegExp(`tous les ${R.bombard.everyDays} jours`));
  // Aperçu du bombardement en temps réel (règles en jours de la V17.2) : « au prochain tir », plafond par tir.
  const s = createRealtimeGame({ map, playerNationId: ME, seed: 'bomb' });
  s.provinces.p03.buildings.port = 1; s.provinces.p03.warships = 4; s.provinces.p14.buildings.fort = 2;
  ensureWar(s, ME, 'oroel');
  const v = bombardPreviewText(s, { fromId: 'p03', toId: 'p14', warships: 4, name: id => id });
  if (v) { noTour(v.text, 'aperçu du bombardement'); assert.match(v.text, /au prochain tir/); assert.match(v.text, new RegExp(`plafond : ${R.bombard.maxPerTick} points par tir`)); }
  for (const b of Object.values(BOOST_INFO)) noTour(b.text, 'Atouts');
  for (const m of MISSION_CATALOG) noTour(m.label, 'missions');
  for (const n of map.nations) noTour(nationBonusInfo(n.id).text, `bonus ${n.id}`);
  noTour(missingUnitPrerequisites(RULES.units.armor, {}, { factory: 45 }).join(), 'prérequis');
  const html = read('index.html'), welcome = html.match(/<section id="welcomeScreen"[\s\S]*?<\/section>/)[0];
  noTour(welcome.replace(/<[^>]+>/g, ' '), 'accueil'); assert.match(welcome, /STRATÉGIE EN TEMPS RÉEL/);
  noTour(JSON.parse(read('manifest.webmanifest')).description, 'manifeste');
  assert.doesNotMatch(html, /<title>[^<]*tour/i);
  // Fiche de l'île en temps réel : revenus par mois, partage compris (+2,5 chacun).
  const chips = islandSheetView(s, map, ME, id => id, id => id).chips.join(' | ');
  assert.match(chips, /\+5 or \/ mois à son propriétaire \(\+2,5 chacun/);
  assert.equal(islandMapBadge(s), '🏦+5/mois', 'badge de l’île sur la carte : par mois');
  // Récit de fin d'une vraie partie temps réel (V17.8) : daté au mois, sans « tour ».
  const g = createRealtimeGame({ map, playerNationId: ME, seed: 'recit' });
  for (const id of Object.keys(g.nations)) g.controllers[id] = 'ai';
  for (let d = 0; d < 400; d++) E.advanceDay(g, map);
  const story = endStoryHtml(buildEndStory(g, map), { when: periodLabel, realtime: true, rule: 'x' }).replace(/<[^>]+>/g, ' ');
  noTour(story, 'récit de fin');
  // Missions des Atouts en temps réel : un mois de jeu compte (« Jouer 3 mois de jeu »).
  assert.equal(missionDeltas([{ type: 'month-played' }, { type: 'month-played' }], ME).turns, 2);
  assert.match(readSource('src/presentation/ui/realtime-ui.js'), /for \(let d = dayBefore \+ 1; d <= state\.day; d\+\+\) if \(\(d - 1\) % 30 === 0\) months\+\+;/);
});

// --- Retrait du tour par tour -----------------------------------------------------------------------------------------
test('retrait du tour par tour : plus de « Classique », plus de ?tour-par-tour, toute nouvelle partie est en temps réel', () => {
  const app = readSource('app.js'), flow = flatSource('src/presentation/ui/game-flow.js'), html = read('index.html');
  assert.doesNotMatch(app, /turnBasedTest|tour-par-tour/);
  assert.doesNotMatch(flow, /createGameState/);
  assert.match(flow, /setState\(applyBoosts\(createRealtimeGame\(\{map,/);
  assert.doesNotMatch(html, /flowChoices|speedChoices|DÉROULÉ DU TOUR|VITESSE \(PAR NATION\)/);
  assert.doesNotMatch(app, /renderLiveSettings/);
  // Une partie tour par tour enregistrée n'est jamais reprise (message du §11 conservé).
  const old = createGameState({ map, playerNationId: ME, seed: 'old' });
  assert.equal(decodeRealtimeSave(encodeSave(old)).refused, 'turn-based');
  assert.match(readSource('src/presentation/ui/session.js'), /const r = decodeRealtimeSave\(raw\);/);
});

// --- Reliquats des relectures -----------------------------------------------------------------------------------------
function islandGame() {
  const s = createRealtimeGame({ map, playerNationId: ME, seed: 'phare-179' });
  for (const id of Object.keys(s.nations)) s.controllers[id] = 'human';
  return s;
}
const oroelPort = s => map.provinces.find(d => s.provinces[d.id].ownerId === 'oroel' && E.legalDestinations(map, s, d.id).some(x => x.id === 'p21'));
test('phare : un seul bandeau par flotte, rien pour une flotte alliée, alerte pour les flottes déjà en route quand on prend l’île', () => {
  const names = { nation: id => id, province: id => id };
  // 1) L'île est à moi ; Oroël (étranger) et Aurel (allié) embarquent vers l'île.
  const s = islandGame(); s.provinces.p21.ownerId = ME;
  s.diplomacy.treaties.push({ type: 'alliance', parties: [ME, 'aurel'], active: true, started: s.turn });
  const from = oroelPort(s); s.provinces[from.id].units.infantry = 300;
  const aurelFrom = map.provinces.find(d => s.provinces[d.id].ownerId === 'aurel' && E.legalDestinations(map, s, d.id).some(x => x.id === 'p21'));
  assert.ok(E.queueMoveOrder(s, map, { nationId: 'oroel', fromId: from.id, toId: 'p21', units: { infantry: 100 } }).ok);
  assert.ok(E.queueMoveOrder(s, map, { nationId: 'aurel', fromId: aurelFrom.id, toId: 'p21', units: { infantry: 30 } }).ok);
  const ev0 = s.events.length; E.executePendingOrders(s, map);
  let alerts = s.events.slice(ev0).filter(e => e.type === 'lighthouse');
  assert.deepEqual(alerts.map(e => e.target), ['oroel'], 'pas d’avis pour la flotte alliée');
  // Un seul bandeau pour la flotte d'Oroël (🗼), pas de « ⛵ Flotte en route » en double ; rien pour la flotte alliée.
  const tokens = unitTokens(s, map, ME, E.visibleProvinces(s, map, ME));
  assert.deepEqual(incomingBanners(s, tokens, ME, names).filter(b => b.text.includes('p21')), [], 'pas de bandeau ⛵ en double');
  assert.equal(eventBanners(alerts, ME, names).filter(b => b.icon === '🗼').length, 1);
  // Pas d'avis répété les jours suivants.
  const ev1 = s.events.length; for (let d = 0; d < 5; d++) E.advanceDay(s, map);
  assert.equal(s.events.slice(ev1).filter(e => e.type === 'lighthouse').length, 0, 'une seule fois par flotte');
  // Fiche de l'île : la flotte alliée n'y est pas signalée.
  const chips = islandSheetView(s, map, ME, id => id, id => id).chips.filter(c => c.startsWith('🗼 Flotte'));
  assert.equal(chips.length, 1); assert.match(chips[0], /oroel/);
  // 2) Une flotte part vers l'île neutre ; je prends l'île ensuite : elle est signalée à ce moment-là.
  const t = islandGame(); const f2 = oroelPort(t); t.provinces[f2.id].units.infantry = 300;
  assert.ok(E.queueMoveOrder(t, map, { nationId: 'oroel', fromId: f2.id, toId: 'p21', units: { infantry: 100 } }).ok);
  E.executePendingOrders(t, map);
  assert.equal(t.events.filter(e => e.type === 'lighthouse').length, 0, 'île neutre : personne ne veille');
  t.provinces.p21.ownerId = ME; t.provinces.p21.units = { infantry: 50, cavalry: 0, armor: 0, artillery: 0 };
  const ev2 = t.events.length; E.advanceDay(t, map);
  alerts = t.events.slice(ev2).filter(e => e.type === 'lighthouse');
  assert.equal(alerts.length, 1, 'flotte déjà en route signalée quand on tient l’île');
  assert.equal(alerts[0].nationId, ME); assert.equal(alerts[0].target, 'oroel');
  assert.equal(lighthouseFleets(t, map, ME).length, 1);
});

test('bandeaux : les ordres exécutés par l’interface passent eux aussi par collectBanners', () => {
  const ui = readSource('src/presentation/ui/realtime-ui.js');
  const start = ui.indexOf('const eventStart = state.events.length;'), exec = ui.indexOf('executePendingOrders(state, map); changed = true;');
  assert.ok(start > 0 && exec > start, 'le début des événements est pris avant les ordres de l’interface');
  assert.match(ui, /collectBanners\(state\.events\.slice\(eventStart\)\)/);
});

test('?pub-test est ignoré dans le build Google Play ; l’écran Atouts n’est jamais recouvert par une pub imposée', () => {
  const ad = readSource('src/presentation/ui/ad-ui.js');
  assert.match(ad, /const speedup = \(\(\) => \{ try \{ if \(PLAY_CONFIG\.play\) return 1;/);
  assert.match(ad, /import \{ PLAY_CONFIG \} from '\.\.\/play-config\.js';/);
  assert.match(ad, /const ACTION_DIALOGS = \[[^\]]*'#boostDialog'[^\]]*\]/);
  assert.doesNotMatch(readSource('src/presentation/ui/realtime-ui.js'), /CALM_MENUS = \[[^\]]*#boostDialog/);
});

test('restauration de profil : « premium: true » sans achat n’est pas accepté', () => {
  const forged = { ...createProfile(), premium: true, adsRemoved: true, starterPack: true, purchases: [] };
  const r = importProfile(exportProfile(forged));
  assert.equal(r.ok, true); assert.equal(r.profile.premium, false); assert.equal(r.profile.adsRemoved, false);
  // Un vrai achat enregistré (Premium) est gardé.
  const bought = { ...createProfile(), purchases: [{ productId: 'premium', date: '2026-11-20', test: true }] };
  assert.equal(importProfile(exportProfile(bought)).profile.premium, true);
  assert.match(readSource('src/presentation/ui/boosts-ui.js'), /if\(profile\.premium\)\{r\.profile\.premium=true;/);
});
