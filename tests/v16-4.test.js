// V16.4 — tour « en direct » : horloge (pure), annonces du bandeau, réglage mémorisé hors sauvegarde, branchement de l'interface.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { arkenV9Map as map } from '../src/map/arken-v9-map.js';
import { createGameState } from '../src/state/create-game-state.js';
import { encodeSave } from '../src/persistence/save-codec.js';
import { eventKnownToPlayer, resolveInterturn } from '../src/domain/game-engine.js';
import {
  DEFAULT_LIVE_SETTINGS, LIVE_SETTINGS_KEY, LIVE_SPEEDS, claimResolution, clockView, createLiveClock, createTurnGate,
  decodeLiveSettings, isPaused, liveApplies, liveNationOrder, loadLiveSettings, retime, saveLiveSettings, setHold,
  setManualPause, syncHolds, tick, toggleManualPause, turnDurationMs
} from '../src/presentation/live-clock.js';
import { NOTHING_KNOWN, actorOf, nationAnnouncements, newsAt, shortNews } from '../src/presentation/live-news.js';
import { SAVE_KEY } from '../src/presentation/guide-input.js';
import { flatSource, readSource, root } from './helpers/sources.js';

const memory = () => { const m = new Map(); return { getItem: k => m.has(k) ? m.get(k) : null, setItem: (k, v) => m.set(k, String(v)), map: m }; };
const FIVE = ['valmorne', 'roc-epine', 'noireflamme', 'oroel', 'aurel'];

test('durée : secondes par nation × nations en vie (lent 15, normal 10, rapide 5)', () => {
  assert.deepEqual(LIVE_SPEEDS, { lent: 15, normal: 10, rapide: 5 });
  assert.equal(turnDurationMs(5, 'normal'), 50000);
  assert.equal(turnDurationMs(4, 'lent'), 60000);
  assert.equal(turnDurationMs(3, 'rapide'), 15000);
  assert.equal(turnDurationMs(5, 'inconnu'), 50000, 'vitesse inconnue = normale');
  assert.equal(turnDurationMs(0, 'normal'), 10000, 'jamais une horloge vide');
  const c = createLiveClock({ turn: 4, nationIds: FIVE, speed: 'rapide', now: 1000 });
  assert.equal(c.durationMs, 25000);
});

test('passage de nation en nation, joueur en dernier, éliminés absents', () => {
  const order = liveNationOrder(FIVE, id => id !== 'noireflamme', 'roc-epine');
  assert.deepEqual(order, ['valmorne', 'oroel', 'aurel', 'roc-epine']);
  const c = createLiveClock({ nationIds: order, speed: 'normal', now: 0 });
  assert.equal(c.durationMs, 40000);
  const at = t => { tick(c, t); return clockView(c); };
  assert.equal(at(0).nationId, 'valmorne');
  assert.equal(at(9999).nationId, 'valmorne');
  assert.equal(at(10000).nationId, 'oroel');
  const v = at(25000);
  assert.equal(v.nationId, 'aurel'); assert.equal(v.segmentProgress, .5); assert.equal(v.progress, 25000 / 40000); assert.equal(v.remainingMs, 15000);
  assert.equal(at(39999).nationId, 'roc-epine');
});

test('pause et reprise : le temps ne court pas pendant la pause', () => {
  const c = createLiveClock({ nationIds: FIVE, speed: 'rapide', now: 0 });
  tick(c, 3000); assert.equal(c.elapsed, 3000);
  setManualPause(c, true, 3000); assert.ok(isPaused(c));
  assert.equal(tick(c, 60000), null, 'aucune résolution en pause'); assert.equal(c.elapsed, 3000);
  toggleManualPause(c, 60000); assert.ok(!isPaused(c));
  tick(c, 61000); assert.equal(c.elapsed, 4000);
});

test('pauses automatiques : fenêtre, page cachée, bulle ; elles se cumulent avec la pause du joueur', () => {
  const c = createLiveClock({ nationIds: FIVE, speed: 'rapide', now: 0 });
  syncHolds(c, { dialog: true, hidden: false }, 1000);
  assert.equal(c.elapsed, 1000);
  tick(c, 30000); assert.equal(c.elapsed, 1000, 'fenêtre ouverte : horloge arrêtée');
  assert.deepEqual(clockView(c).holds, ['dialog']);
  setHold(c, 'hidden', true, 30000); syncHolds(c, { dialog: false }, 31000);
  tick(c, 40000); assert.equal(c.elapsed, 1000, 'page cachée : horloge arrêtée');
  setManualPause(c, true, 40000); setHold(c, 'hidden', false, 41000);
  tick(c, 50000); assert.equal(c.elapsed, 1000, 'la pause du joueur reste après le retour');
  setManualPause(c, false, 50000); tick(c, 52000); assert.equal(c.elapsed, 3000);
});

test('fin de l\'horloge → une seule résolution ; « Passer » au même moment ne résout pas deux fois', () => {
  const c = createLiveClock({ nationIds: ['a', 'b'], speed: 'rapide', now: 0 });
  assert.equal(tick(c, 9999), null);
  assert.equal(tick(c, 10000), 'expired');
  assert.equal(tick(c, 10500), null, 'jamais deux fois');
  assert.equal(claimResolution(c), false, '« Passer » touché en même temps : refusé');
  const d = createLiveClock({ nationIds: ['a'], speed: 'rapide', now: 0 });
  assert.equal(claimResolution(d), true, '« Passer » avant la fin');
  assert.equal(tick(d, 99999), null, 'la fin de l\'horloge ne résout plus');
  // Verrou de l'interface : fin d'horloge, « Passer » et « Verrouiller et résoudre » passent tous par lui.
  const gate = createTurnGate();
  assert.equal(gate.tryStart(), true); assert.equal(gate.busy, true);
  assert.equal(gate.tryStart(), false, 'deuxième résolution refusée tant que la première n\'est pas finie');
  gate.finish(); assert.equal(gate.tryStart(), true);
});

test('changement de vitesse en cours de tour : la part écoulée est gardée', () => {
  const c = createLiveClock({ nationIds: FIVE, speed: 'normal', now: 0 });
  tick(c, 25000); retime(c, 'rapide', 25000);
  assert.equal(c.durationMs, 25000); assert.equal(c.elapsed, 12500);
});

test('réglage : En direct par défaut, mémorisé dans une clé dédiée, jamais dans la sauvegarde de partie', () => {
  assert.deepEqual(DEFAULT_LIVE_SETTINGS, { flow: 'direct', speed: 'normal' });
  const store = memory();
  assert.deepEqual(loadLiveSettings(store), { flow: 'direct', speed: 'normal' }, 'partie en cours d\'avant la V16.4 : en direct aussi');
  assert.ok(saveLiveSettings({ flow: 'classique', speed: 'rapide' }, store));
  assert.deepEqual(loadLiveSettings(store), { flow: 'classique', speed: 'rapide' });
  assert.notEqual(LIVE_SETTINGS_KEY, SAVE_KEY);
  assert.deepEqual(decodeLiveSettings('{abîmé'), { flow: 'direct', speed: 'normal' });
  assert.deepEqual(decodeLiveSettings('{"flow":"turbo","speed":"x"}'), { flow: 'direct', speed: 'normal' });
  assert.deepEqual(loadLiveSettings({ getItem() { throw new Error('bloqué'); } }), { flow: 'direct', speed: 'normal' });
  assert.equal(saveLiveSettings({ flow: 'direct' }, { setItem() { throw new Error('plein'); } }), false);
  const s = createGameState({ map, playerNationId: 'valmorne', seed: 'v164' });
  const save = encodeSave(s);
  for (const word of ['live', 'deroule', 'flow', 'speed']) assert.ok(!save.includes(`"${word}`), word);
});

test('mode classique et tutoriel : le déroulé en direct ne s\'applique pas', () => {
  assert.equal(liveApplies({ flow: 'direct' }), true);
  assert.equal(liveApplies({ flow: 'classique' }), false);
  assert.equal(liveApplies({ flow: 'direct' }, { tutorial: true }), false);
  assert.equal(liveApplies({ flow: 'direct' }, { miniTuto: true }), false);
});

test('annonces : seulement ce que le joueur sait, par nation, « Rien de connu » sinon', () => {
  const s = createGameState({ map, playerNationId: 'valmorne', seed: 'v164-annonces' });
  for (let i = 0; i < 25; i++) resolveInterturn(s, map);
  const news = nationAnnouncements(s, map);
  assert.deepEqual(Object.keys(news).sort(), [...FIVE].sort());
  assert.deepEqual(news.valmorne, [], 'la séquence du joueur sert au rappel de ses ordres');
  const last = s.events.filter(e => e.turn === s.turn - 1);
  let count = 0;
  for (const id of FIVE) for (const item of news[id]) {
    count++;
    assert.ok(item.text && !item.text.includes('Pertes :'), item.text);
    assert.ok(item.text.length > 5);
  }
  // Tout ce qui est annoncé vient d'un événement connu du joueur.
  const known = last.filter(e => eventKnownToPlayer(s, map, e));
  assert.ok(count >= 1 && count <= known.length);
  assert.equal(news.aurel[0].provinceId, 'p06', 'province concernée gardée pour la surligner');
  // Un événement inconnu ne sort jamais : on cache tout au joueur → plus rien.
  const blind = { ...s, events: s.events.map(e => ({ ...e, type: e.type === 'conquest' ? 'tension' : e.type })) };
  for (const id of FIVE) for (const item of nationAnnouncements(blind, map)[id]) assert.ok(!/prend la province/.test(item.text));
  assert.equal(newsAt([], .5), null); assert.equal(NOTHING_KNOWN, 'Rien de connu');
  assert.equal(newsAt([{ text: 'a' }, { text: 'b' }], .2).text, 'a'); assert.equal(newsAt([{ text: 'a' }, { text: 'b' }], .7).text, 'b');
});

test('annonces : rattachées à la nation qui agit (ou visée par le joueur), pertes retirées', () => {
  assert.equal(actorOf({ type: 'battle', attacker: 'oroel', defender: 'valmorne' }, 'valmorne', FIVE), 'oroel');
  assert.equal(actorOf({ type: 'battle', attacker: 'valmorne', defender: 'aurel' }, 'valmorne', FIVE), 'aurel');
  assert.equal(actorOf({ type: 'conquest', attacker: 'oroel', newOwnerId: 'oroel', defender: 'aurel' }, 'valmorne', FIVE), 'oroel');
  assert.equal(actorOf({ type: 'income', nationId: 'valmorne' }, 'valmorne', FIVE), null);
  assert.equal(shortNews('Affrontement à X : Oroël tient la province. Pertes : beaucoup.\nPV perdus'), 'Affrontement à X : Oroël tient la province.');
});

test('interface : horloge branchée, journal remplacé par les annonces, fenêtres de décision gardées, mode classique intact', () => {
  const flow = flatSource('src/presentation/ui/turn-flow.js');
  assert.match(flow, /if\(liveOn\(\)\)return void playTurn\(\{live:true\}\);/, '« Passer » : sans confirmation');
  assert.ok(flow.indexOf('if(liveOn())') < flow.indexOf("actionModal('Terminer le tour'"), 'classique : toujours la fenêtre de confirmation');
  assert.match(flow, /if\(!live\)\{renderJournal\(false\);await dialogClosed\(\$\('#journalDialog'\)\);if\(!same\(\)\)return;\}/);
  for (const w of ['await showCapitalPopups(events)', 'await showBalloonPopups(events)', 'await showProposalPopups()', 'showEndScreen();return;']) assert.ok(flow.includes(w), w);
  assert.match(flow, /if\(!turnGate\.tryStart\(\)\)return;/); assert.match(flow, /finally\{turnGate\.finish\(\);\}/);
  const live = readSource('src/presentation/ui/live-ui.js');
  assert.match(live, /dialog\[open\]/); assert.match(live, /visibilitychange/);
  assert.match(live, /if \(turnGate\.busy\)/, 'l\'horloge repart après la suite de fenêtres');
  assert.match(live, /tick\(clock, t\) === 'expired'\) \{[^}]*playTurn\(\{ live: true \}\)/);
  assert.doesNotMatch(live, /Ad\(/, 'jamais de pub pendant le déroulé');
  assert.doesNotMatch(live, /localStorage|encodeSave|save\(\)/, 'rien de l\'horloge dans la sauvegarde');
  const app = readFileSync(join(root, 'app.js'), 'utf8');
  assert.match(app, /installLive\(\)/); assert.doesNotMatch(app, /renderLiveSettings/, 'V17.9 : plus de réglage du déroulé (tour par tour retiré)');
  const html = readFileSync(join(root, 'index.html'), 'utf8');
  for (const id of ['liveBar', 'livePause', 'liveProgress']) assert.ok(html.includes(`id="${id}"`), id);
  for (const id of ['flowChoices', 'speedChoices']) assert.ok(!html.includes(`id="${id}"`), `V17.9 : ${id} retiré`);
  // V17.7 : plus de pub de début de partie (cahier V17 §10.2).
  const start = flatSource('src/presentation/ui/game-flow.js');
  assert.equal(start.indexOf('showGameStartAd'), -1);
  assert.match(live, /!\$\('#gameScreen'\)\.hidden/);
  const sw = readFileSync(join(root, 'sw.js'), 'utf8');
  for (const f of ['live-clock.js', 'live-news.js', 'ui/live-ui.js']) assert.ok(sw.includes(`/src/presentation/${f}'`), f);
});

test('V16.4 (relecture) : l’horloge s’arrête pendant la pub de début de partie et la fiche ouverte est remise à jour', async () => {
  const { readSource } = await import('./helpers/sources.js');
  const live = readSource('src/presentation/ui/live-ui.js'), flow = readSource('src/presentation/ui/game-flow.js'), turn = readSource('src/presentation/ui/turn-flow.js');
  assert.match(live, /ad: document\.body\.dataset\.adPlaying === '1'/);
  // V17.7 : la pub de début de partie a disparu ; les pubs du temps réel arrêtent l'horloge de la même façon (ad-ui.js).
  assert.doesNotMatch(flow, /showGameStartAd/);
  const ads = readSource('src/presentation/ui/ad-ui.js');
  assert.match(ads, /document\.body\.dataset\.adPlaying = '1'[\s\S]*showForcedAd[\s\S]*finally \{ delete document\.body\.dataset\.adPlaying;/);
  assert.match(turn, /if\(live&&selected&&!\$\('#provinceSheet'\)\.hidden\)showProvinceSheet\(\)/);
});
