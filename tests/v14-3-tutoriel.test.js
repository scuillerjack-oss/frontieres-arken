// V14.3 — tutoriel facultatif et rejouable (docs/V14-cahier-des-charges.md, section 2 point 9).
// Le parcours est rejoué ici avec le VRAI moteur : chaque étape doit être réalisable, et ce que dit la bulle doit être vrai.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { arkenV9Map as map } from '../src/map/arken-v9-map.js';
import { resolveInterturn, queueMoveOrder, queueRecruitment, queueConstruction, queueDiplomaticOrder, shipRepairInfo, journalEntry, legalDestinations, gameRanking } from '../src/domain/game-engine.js';
import { queueTalk } from '../src/domain/talk.js';
import { queueHelpRequest, HELP_TURNS } from '../src/domain/alliances.js';
import { getTension, HOSTILITY_WARNING, HOSTILITY_WAR } from '../src/domain/leaders.js';
import { RULES } from '../src/domain/constants.js';
import { encodeSave, decodeSave } from '../src/persistence/save-codec.js';
import { SAVE_KEY } from '../src/presentation/v4-ux.js';
import { MINI_TUTO_KEY } from '../src/presentation/v13-4-ux.js';
import { TUTORIAL_STEPS, TUTORIAL_THEMES, TUTO_SAVE_KEY, TUTO_OFFER_KEY, TUTO_LANDING, TUTO_SEA_ROUTE_LENGTH, createTutorialState, isTutorial, saveKeyFor, storeGame, loadTutorial, clearTutorial,
  tutorialOffered, markTutorialOffered, tutorialCompleted, tutorialStepView, tutorialAdvance, tutorialHint, moveEvent, firstVisibleTarget, bubblePlacement, landingFailed, allyGuestProvince } from '../src/presentation/v14-3-tutoriel.js';
import { assertInvariants } from './helpers/fixtures.js';

const read = f => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
function memoryStorage() { const m = new Map(); return { getItem: k => m.has(k) ? m.get(k) : null, setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), keys: () => [...m.keys()] }; }
const atWar = (s, a, b) => s.diplomacy.wars.some(w => w.active !== false && w.participants.includes(a) && w.participants.includes(b));
const allied = (s, a, b) => s.diplomacy.treaties.some(t => t.active !== false && t.type === 'alliance' && t.parties.includes(a) && t.parties.includes(b));
const journalTexts = s => (s.turnJournal || []).map(e => String(e.text || ''));

/** Joue le tutoriel comme un joueur (gestes de l'interface → ordres du moteur → événements du tutoriel). */
function playTutorial({ landing = { infantry: 160, cavalry: 10, warships: 3 } } = {}) {
  const s = createTutorialState({ map });
  let i = 0; const log = [];
  const ev = e => { const next = tutorialAdvance(i, e, s, map); log.push([TUTORIAL_STEPS[i]?.id, e, next]); i = next ?? TUTORIAL_STEPS.length; };
  const endTurn = () => { resolveInterturn(s, map); assertInvariants(s, 'tutoriel'); ev('end-turn'); };
  ev('ok');                                        // bienvenue
  ev('select:p01');                                // carte
  assert.equal(queueMoveOrder(s, map, { nationId: 'valmorne', fromId: 'p01', toId: 'p02', units: { infantry: 100 } }).ok, true);
  ev(moveEvent({ routeType: 'land', attack: false, toId: 'p02', units: { infantry: 100 } }));
  endTurn(); ev('journal-closed');                 // tour 1
  ev('unit-info');
  assert.equal(queueRecruitment(s, { nationId: 'valmorne', provinceId: 'p01', type: 'infantry', lots: 1 }).ok, true); ev('recruit');
  assert.equal(queueConstruction(s, { nationId: 'valmorne', provinceId: 'p01', type: 'bank' }).ok, true); ev('build');
  endTurn();                                       // tour 2
  ev('diplomacy:oroel');
  assert.equal(queueTalk(s, map, { from: 'valmorne', to: 'oroel', tone: 'hostile' }).ok, true); ev('talk-hostile:oroel');
  endTurn();                                       // tour 3
  const warned = journalTexts(s).some(t => /⚠|dès 85 %/.test(t));
  assert.equal(queueDiplomaticOrder(s, { nationId: 'valmorne', target: 'roc-epine', action: 'alliance' }).ok, true); ev('alliance:roc-epine');
  assert.equal(queueTalk(s, map, { from: 'valmorne', to: 'oroel', tone: 'hostile' }).ok, true); ev('talk-hostile:oroel');
  endTurn();                                       // tour 4
  const afterT4 = { war: atWar(s, 'valmorne', 'oroel'), ally: allied(s, 'valmorne', 'roc-epine'), journal: journalTexts(s) };
  assert.equal(queueHelpRequest(s, { from: 'valmorne', to: 'roc-epine', kind: 'defend', target: 'oroel' }).ok, true); ev('help');
  ev('select:p03');
  const r = queueMoveOrder(s, map, { nationId: 'valmorne', fromId: 'p03', toId: 'p14', units: { infantry: landing.infantry, cavalry: landing.cavalry }, warships: landing.warships });
  assert.equal(r.ok, true, r.error);
  ev(moveEvent({ routeType: 'sea', attack: true, toId: 'p14', units: { infantry: landing.infantry, cavalry: landing.cavalry }, warships: landing.warships }));
  endTurn(); endTurn();                            // tours 5 et 6 : traversée, débarquement
  const report = journalTexts(s);
  ev('journal-closed');
  const nordheme = tutorialStepView(i, s, map);
  ev(nordheme.on[0]);                              // navires blessés
  endTurn();                                       // tour 7 : renforts
  const guest = allyGuestProvince(s, map), renforts = tutorialStepView(i, s, map);
  ev(renforts.on[0]);
  ev('ok'); ev('ok');                              // classement, bravo
  return { s, i, log, warned, afterT4, report, nordheme, guest, renforts };
}

test('tutoriel : l\'ordre pédagogique du cahier (carte → … → classement), étapes courtes avec un objectif concret', () => {
  assert.ok(TUTORIAL_STEPS.length >= 15 && TUTORIAL_STEPS.length <= 30);
  const themes = TUTORIAL_STEPS.map(x => x.theme).filter(t => t !== 'tour');
  const firstIndex = TUTORIAL_THEMES.filter(t => t !== 'tour').map(t => themes.indexOf(t));
  assert.ok(firstIndex.every(n => n >= 0), 'chaque thème est présent');
  assert.deepEqual([...firstIndex].sort((a, b) => a - b), firstIndex, 'les thèmes arrivent dans l\'ordre demandé');
  for (const st of TUTORIAL_STEPS) {
    assert.ok(st.text.length <= 175, `${st.id} : texte court (${st.text.length})`);
    assert.ok(st.on === 'ok' || st.goal, `${st.id} : un geste attendu a un objectif écrit`);
    if (st.on !== 'ok') assert.ok(st.targets.length > 0, `${st.id} : quelque chose est surligné`);
  }
  const all = TUTORIAL_STEPS.map(x => `${x.title} ${x.text} ${x.goal || ''}`).join(' ');
  for (const word of ['ⓘ PV et dégâts', 'banque', '70 %', '85 %', 'alliance', 'aide', 'port', 'débarquement', '3 à 5 tours', 'rapport', 'classement'])
    assert.match(all.toLowerCase(), new RegExp(word.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), word);
});

test('tutoriel : les chiffres des bulles sont lus dans le moteur (aucune règle inventée)', () => {
  const all = TUTORIAL_STEPS.map(x => `${x.text} ${x.textIfFailed || ''}`).join(' ');
  assert.equal(HOSTILITY_WARNING, 70); assert.equal(HOSTILITY_WAR, 85);
  assert.match(all, new RegExp(`${RULES.units.infantry.amount} fantassins pour ${RULES.units.infantry.cost} or`));
  assert.match(all, new RegExp(`${RULES.buildings.bank.cost} or, est livrée en ${RULES.buildings.bank.turns} tours, puis rapporte \\+${RULES.bankIncome} or`));
  assert.match(all, new RegExp(`frappent à ${Math.round(RULES.combat.landingPenalty * 100)} %`));
  assert.match(all, new RegExp(`aident ${HELP_TURNS} tours sur place`));
  assert.match(all, new RegExp(`dure ${RULES.gameLength} tours`));
  assert.match(all, /provinces, puis capitales, puis or/);
  // Revenus du 1er tour annoncés au journal (+18 or) et durée de la traversée : ceux du moteur.
  const s = createTutorialState({ map }); resolveInterturn(s, map);
  const income = s.events.find(e => e.type === 'income');
  assert.match(all, new RegExp(`vos revenus \\(\\+${income.amount} or\\)`));
  const route = legalDestinations(map, createTutorialState({ map }), 'p03').find(d => d.id === 'p14');
  assert.equal(map.seaLanes.find(l => l.from === 'p03' && l.to === 'p14').length, TUTO_SEA_ROUTE_LENGTH);
  assert.match(all, new RegExp(`Par la mer : ${route.turns} tours de traversée`));
  // Le classement réel : provinces, puis capitales, puis trésor.
  assert.match(read('src/domain/game-engine.js'), /b\.provinces - a\.provinces \|\| b\.capitals - a\.capitals \|\| b\.treasury - a\.treasury/);
});

test('tutoriel : scénario fixe — partie d\'entraînement séparée, IA seulement pour l\'allié, forces prêtes pour la mer', () => {
  const a = createTutorialState({ map }), b = createTutorialState({ map });
  assert.equal(encodeSave(a), encodeSave(b), 'deux lancements donnent exactement la même partie');
  assert.equal(isTutorial(a), true);
  assert.equal(a.playerNationId, 'valmorne');
  assert.deepEqual(Object.entries(a.controllers).filter(([, c]) => c === 'ai').map(([id]) => id), ['roc-epine']);
  assert.equal(getTension(a, 'valmorne', 'oroel'), 60);
  assert.equal(a.provinces.p03.buildings.port, 1); assert.equal(a.provinces.p03.warships, 3);
  assert.ok(legalDestinations(map, a, 'p03').some(d => d.id === 'p14' && d.type === 'sea'), 'Branvale → Nordhème par la mer');
  assert.equal(a.events.length, 0, 'l\'installation n\'apparaît pas au journal');
  assert.equal(a.settings.hints, false, 'pas de bulles contextuelles par-dessus');
});

test('tutoriel : parcours complet joué avec le vrai moteur — chaque étape est réalisable et dit vrai', () => {
  const { s, i, warned, afterT4, report, nordheme, guest, renforts } = playTutorial();
  assert.equal(i, TUTORIAL_STEPS.length, 'toutes les étapes franchies, aucune sautée');
  assert.ok(warned, 'avertissement d\'hostilité au tour 3');
  assert.equal(afterT4.war, true, 'guerre automatique avec Oroël au tour 4');
  assert.equal(afterT4.ally, true, 'Roc-Épine accepte l\'alliance');
  assert.ok(afterT4.journal.some(t => /GUERRE DÉCLARÉE|guerre est déclarée/.test(t)), afterT4.journal.join('\n'));
  assert.ok(report.some(t => /prend la province/.test(t) && /\nPV perdus, blessés compris/.test(t) && /assaillant à 85 %/.test(t)), 'rapport de conquête');
  assert.equal(s.provinces.p14.ownerId, 'valmorne', 'Nordhème prise');
  assert.equal(landingFailed(s), false);
  assert.deepEqual(nordheme.on, ['select:p14']);
  const ships = shipRepairInfo(s, 'p14', 'valmorne');
  assert.ok(ships && ships.inPort, 'navires au port de Nordhème');
  assert.ok(guest, 'les renforts de Roc-Épine sont arrivés');
  assert.deepEqual(renforts.on, [`select:${guest.id}`]);
  assert.match(renforts.goal, new RegExp(guest.name));
  assert.ok(s.chronicle.some(e => /AIDE/.test(e.type) && /pendant 5 tours/.test(e.text)), 'aide : arrivée puis 5 tours');
  assert.equal(gameRanking(s)[0].nationId, 'valmorne', 'classement : Valmorne premier avec 5 provinces');
});

test('tutoriel : un débarquement trop faible est signalé (conseil), et un échec réel ne bloque pas le tutoriel', () => {
  assert.equal(moveEvent({ routeType: 'sea', attack: true, toId: 'p14', units: { infantry: 20 }, warships: 1 }), 'landing-weak');
  assert.equal(moveEvent({ routeType: 'sea', attack: true, toId: 'p14', units: { infantry: TUTO_LANDING.minTroops }, warships: TUTO_LANDING.minWarships }), 'landing-escorted');
  assert.equal(moveEvent({ routeType: 'land' }), 'move-land');
  const idx = TUTORIAL_STEPS.findIndex(x => x.id === 'debarquer');
  assert.equal(tutorialAdvance(idx, 'landing-weak'), idx, 'pas d\'avance');
  assert.match(tutorialHint(idx, 'landing-weak'), /au moins 2 navires et 60 soldats/);
  // Seuil minimal : il prend bien Nordhème.
  const min = playTutorial({ landing: { infantry: TUTO_LANDING.minTroops, cavalry: 0, warships: TUTO_LANDING.minWarships } });
  assert.equal(min.s.provinces.p14.ownerId, 'valmorne');
  // Si le joueur passe l'étape et que Nordhème n'est pas prise : textes adaptés, cible Branvale.
  const s = createTutorialState({ map }); s.turn = 7;
  const rep = TUTORIAL_STEPS.findIndex(x => x.id === 'reparation');
  assert.equal(landingFailed(s), true);
  assert.deepEqual(tutorialStepView(rep, s).on, ['select:p03']);
  assert.match(tutorialStepView(TUTORIAL_STEPS.findIndex(x => x.id === 'rapport'), s).text, /repoussé/);
  // Renforts pas encore arrivés : l'étape devient une simple explication (« Suivant »).
  const ren = TUTORIAL_STEPS.findIndex(x => x.id === 'renforts'), v = tutorialStepView(ren, s, map);
  assert.deepEqual(v.on, ['ok']); assert.match(v.text, /pas encore/);
});

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
  resolveInterturn(t, map); storeGame(t, encodeSave, store);
  assert.equal(store.getItem(SAVE_KEY), real);
  const resumed = loadTutorial(decodeSave, store);
  assert.ok(resumed && isTutorial(resumed)); assert.equal(resumed.turn, 2, 'reprise au bon tour');
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
  assert.ok(![TUTO_OFFER_KEY, TUTO_SAVE_KEY].includes(MINI_TUTO_KEY) && ![TUTO_OFFER_KEY, MINI_TUTO_KEY].includes(SAVE_KEY));
  const html = read('index.html'), app = read('app.js');
  assert.match(html, /id="welcomeTutorial"/, 'entrée sur l\'accueil');
  assert.match(html, /id="replayTutorial">🎓 Jouer le tutoriel</, 'entrée dans les Paramètres');
  assert.match(app, /label:'Passer',value:false\},\{label:'Jouer le tutoriel',value:true,primary:true\}/, 'Jouer le tutoriel / Passer');
  assert.match(app, /async function offerTutorial\(\)\{if\(tutorialOffered\(\)\)return;markTutorialOffered\(\);/, 'proposé une seule fois');
  assert.match(app, /\$\('#replayTutorial'\)\.onclick=\(\)=>\{\$\('#settingsDialog'\)\.close\(\);startTutorial\(\);\}/, 'rejouer = repartir du début');
  assert.match(app, /\$\('#welcomeTutorial'\)\.onclick=\(\)=>startTutorial\(\{resume:true\}\)/, 'accueil = reprendre');
});

test('tutoriel : quitter à tout moment, retrouver sa partie ; sauvegarde par la bonne clé', () => {
  const app = read('app.js');
  assert.match(app, /const save = \(\) => \{ if \(state\) localStorage\.setItem\(saveKeyFor\(state\), encodeSave\(state\)\); \};/);
  assert.doesNotMatch(app, /localStorage\.setItem\(SAVE_KEY/, 'plus aucune écriture directe sur la clé de la vraie partie');
  assert.match(app, /function endMiniTuto\(\)\{if\(tutoStep!==null\)return quitTutorial\(\);/, 'le bouton « Quitter » de la bulle');
    assert.match(app, /function quitTutorial\(\)\{save\(\);stopTuto\(\);closeAllDialogs\(\);showWelcome\(\);/, 'relecture : plus aucune fenêtre ouverte sur l\'accueil');
  assert.match(app, /function finishTutorial\(\)\{stopTuto\(\);closeAllDialogs\(\);/);
  assert.match(app, /const game=state,same=\(\)=>state===game;/, 'relecture : la suite de la fin du tour s\'arrête si on a quitté');
  for (const w of ['showCapitalPopups(events);if(!same())return;', 'showSeaPopups(events);if(!same())return;', "dialogClosed($('#journalDialog'));if(!same())return;"]) assert.ok(app.includes(w), w);
  assert.match(app, /dataset\.permanent!=='true'\)tuto\('journal-closed'\)/, 'relecture : l\'historique ne valide pas l\'étape du journal');
  assert.match(app, /\$\('#miniTutoNext'\)\.hidden=v\.on\.includes\('end-turn'\)/, 'relecture : une fin de tour ne se saute pas');
  assert.match(app, /\$\('#replayMiniTuto'\)\.onclick=\(\)=>\{if\(tutoStep!==null\)return/, 'relecture : mini tuto pas relancé pendant le tutoriel');
  assert.match(app, /host=\[\.\.\.document\.querySelectorAll\('dialog\[open\]'\)\]\.at\(-1\)\|\|document\.body/, 'relecture : la bulle va dans la fenêtre ouverte (sinon « Quitter » serait inerte)');
  assert.match(app, /if\(!isTutorial\(state\)\)trackMissions\(events\)/, 'le tutoriel ne compte pas pour les missions');
  assert.match(app, /game && !isTutorial\(game\) \? setPlayerBonuses/, 'pas d\'atouts dans le tutoriel');
  assert.ok(read('sw.js').includes("'./src/presentation/v14-3-tutoriel.js'"));
  assert.doesNotMatch(read('src/presentation/v14-3-tutoriel.js'), /frontieres-arken-v2-save/);
});

test('tutoriel : surlignage et bulle — la cible visible la plus précise, la bulle à l\'opposé', () => {
  const visible = new Set(['#nextTurn', '[data-id="p01"]']);
  assert.equal(firstVisibleTarget(['#confirmEndTurn', '#nextTurn'], s => visible.has(s)), '#nextTurn');
  assert.equal(firstVisibleTarget(['#x'], () => { throw new Error('sélecteur'); }), null);
  assert.equal(bubblePlacement({ top: 780, height: 40 }, 852), 'top', 'cible en bas (Fin du tour) → bulle en haut');
  assert.equal(bubblePlacement({ top: 100, height: 40 }, 852), 'bottom');
  const css = read('v5.css');
  assert.match(css, /\.tuto-target\{outline:3px solid #3fcf74/);
  assert.match(css, /#miniTuto\.tuto-full\.bottom\{inset:auto 12px calc\(66px \+ env\(safe-area-inset-bottom\)\) 12px\}/, 'safe area en bas');
  assert.match(css, /#miniTuto\{position:fixed;z-index:31;inset:calc\(70px \+ env\(safe-area-inset-top\)\)/, 'safe area en haut');
});

test('version 14.3.0', () => {
  assert.equal(JSON.parse(read('package.json')).version, '14.3.0');
});
