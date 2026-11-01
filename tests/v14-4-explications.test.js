// V14.4 — équipe gameplay, point A1 : messages d'explication seulement pendant les 2 premières parties du joueur
// (compteur dans le PROFIL, jamais dans la sauvegarde de partie), conseils « solution » retirés, tutoriel rejouable.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createProfile, decodeProfile, encodeProfile, sanitizeProfile, recordGameStarted, hintsActive, HINT_GAMES, LEGACY_GAMES_STARTED } from '../src/domain/profile.js';
import { loadProfile, saveProfile, PROFILE_KEY } from '../src/presentation/profile-storage.js';
import { SAVE_KEY } from '../src/presentation/v4-ux.js';
import { seaFatePopups } from '../src/presentation/v13-ux.js';
import { arkenV9Map as map } from '../src/map/arken-v9-map.js';
import { createGameState } from '../src/state/create-game-state.js';

const read = f => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
const memory = (init = {}) => { const m = new Map(Object.entries(init)); return { getItem: k => m.has(k) ? m.get(k) : null, setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), m }; };

test('explications : 1re et 2e partie oui, 3e partie non ; compteur du profil', () => {
  const p = createProfile();
  assert.equal(HINT_GAMES, 2);
  assert.equal(p.gamesStarted, 0);
  assert.equal(hintsActive(p), true, 'avant la toute première partie');
  assert.equal(recordGameStarted(p), 1); assert.equal(hintsActive(p), true, '1re partie');
  assert.equal(recordGameStarted(p), 2); assert.equal(hintsActive(p), true, '2e partie');
  assert.equal(recordGameStarted(p), 3); assert.equal(hintsActive(p), false, '3e partie : plus d’explications');
  // Le compteur survit à l'enregistrement et au rechargement du profil.
  const back = decodeProfile(encodeProfile(p));
  assert.equal(back.gamesStarted, 3);
  assert.equal(hintsActive(back), false);
});

test('explications : ancien profil (V12-V14.3, sans compteur) = a déjà joué, rien d’autre ne change', () => {
  const old = { version: 1, tokens: 7, boosts: { gold: 3 }, adsRemoved: true, starterPack: true, purchases: [{ orderId: 'x', productId: 'pack_debutant', date: '2026-10-01', test: true }],
    daily: { date: '2026-10-30', progress: { turns: 2 }, rewarded: false }, rewardedDates: ['2026-10-29'], earned: { missions: 4, purchases: 3 } };
  const p = decodeProfile(JSON.stringify(old));
  assert.equal(p.gamesStarted, LEGACY_GAMES_STARTED);
  assert.equal(hintsActive(p), false);
  assert.equal(p.tokens, 7); assert.equal(p.boosts.gold, 3); assert.equal(p.adsRemoved, true); assert.equal(p.purchases.length, 1);
  assert.equal(p.daily.progress.turns, 2); assert.deepEqual(p.earned, { missions: 4, purchases: 3, bonus: 0 }); assert.equal(p.bonusAds, 0);
  // Profil illisible : profil neuf (explications activées), jamais d'erreur.
  assert.equal(decodeProfile('{cassé').gamesStarted, 0);
  assert.equal(sanitizeProfile({ gamesStarted: -4 }).gamesStarted, 0);
});

test('explications : stockage — pas de profil mais une partie sauvegardée = a déjà joué ; nouveau joueur = 0', () => {
  assert.equal(loadProfile(memory()).gamesStarted, 0, 'nouveau joueur');
  const veteran = memory({ [SAVE_KEY]: '{"schemaVersion":9}' });
  assert.equal(loadProfile(veteran).gamesStarted, LEGACY_GAMES_STARTED, 'joueur d’avant le profil');
  const s = memory(); const p = loadProfile(s); recordGameStarted(p); saveProfile(p, s);
  assert.equal(loadProfile(s).gamesStarted, 1);
  assert.ok(!s.m.get(PROFILE_KEY).includes('"turn"'), 'profil séparé de la partie');
  // Le compteur n'est pas dans la sauvegarde de partie.
  const game = createGameState({ map, playerNationId: 'valmorne', seed: 'x' });
  assert.equal(JSON.stringify(game).includes('gamesStarted'), false);
});

test('explications : interface — bulles filtrées, compteur à chaque vraie partie (pas le tutoriel), tutoriel rejouable', () => {
  const app = read('app.js'), html = read('index.html');
  assert.match(app, /function hintsOn\(\)\{return hintsActive\(profile\)/);
  assert.match(app, /if \(!state\.settings\.hints \|\| !hintsOn\(\)/, 'toutes les bulles passent par hintsOn');
  // Le compteur avance au choix de la nation d'une nouvelle partie, et nulle part ailleurs (le tutoriel ne compte pas).
  assert.equal(app.match(/recordGameStarted\(profile\)/g).length, 1);
  assert.match(app, /\$\('#nationDialog'\)\.close\(\);save\(\);recordGameStarted\(profile\);saveMyProfile\(\);/);
  assert.match(app, /c\.tip&&hintsOn\(\)/, 'le rappel de règle des fenêtres de mer aussi');
  assert.match(html, /id="welcomeTutorial"/); assert.match(html, /id="replayTutorial"/);
});

test('explications : les conseils qui donnent la solution sont retirés, les explications de règle restent', () => {
  const names = { nation: id => id, province: id => id };
  const pops = seaFatePopups([
    { type: 'battle', naval: true, attackers: ['valmorne'], attacker: 'valmorne', defender: 'oroel', provinceId: 'p14', attackerLosses: 10, defenderLosses: 2 },
    { type: 'interception', defender: 'valmorne', attacker: 'oroel', convoyDestroyed: true, provinceId: 'p14', fromId: 'p03', toId: 'p14', defenderLosses: 5 }
  ], 'valmorne', names);
  assert.equal(pops.length, 2);
  for (const p of pops) assert.doesNotMatch(p.tip, /Débarque en nombre|envoie d’abord|Construis|escorter/);
  assert.match(pops[0].tip, /85 %/);
  assert.match(pops[1].tip, /ne peut pas se défendre/);
});
