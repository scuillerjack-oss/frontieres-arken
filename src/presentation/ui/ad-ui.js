// Interface — V17.7 : pubs du temps réel (docs/V17-cahier-des-charges.md §10). Les décisions sont dans ad-timer.js (pur) ;
// ce module ne fait que brancher :
// - l'icône 🎁 discrète sur le bord gauche de la carte (#giftBtn), qui apparaît 5 à 10 min de jeu après la pub précédente
//   et reste jusqu'à ce que le joueur la touche ; une courte confirmation, puis la pub récompensée ; vue en entier =
//   un mois de revenus (10 or minimum) ; le temps est arrêté pendant la pub (data-ad-playing → horloge en attente) ;
// - la pub imposée, seulement à un moment calme (⏸, menu hors jeu, retour à l'accueil, retour dans le jeu), au plus une
//   toutes les 10 min de jeu, jamais pendant une action, en tutoriel, pour un Premium ou après un refus.
// Le compteur de minutes de jeu est un réglage du téléphone (`frontieres-arken-pub`), jamais dans la partie.
// Réglage de TEST caché : `?pub-test=60` dans l'adresse = 1 seconde réelle compte pour 60 secondes de jeu (Playwright).

import { battlesOf, incomeFor } from '../../domain/game-engine.js';
import {
  adTimerSnapshot, applyGiftReward, createAdTimer, forcedAdCheck, forcedShown, giftAvailable, giftUsed, restoreAdTimer, rewardGold, tickAdTimer
} from '../ad-timer.js';
import { adsRefusedThisSession, showForcedAd, showRewardedAd } from '../ads.js';
import { isTutorial } from '../tutorial.js';
import { quietDuring } from './audio.js';
import { $, toast } from './base.js';
import { render } from './map-view.js';
import { actionModal } from './province-sheet.js';
import { moveSource, profile, save, state } from './session.js';
import { miniStep, tutoStep } from './tutorials.js';

const KEY = 'frontieres-arken-pub';
const ACTION_DIALOGS = ['#actionDialog', '#eventDialog', '#nationDialog', '#replaceSaveDialog', '#endDialog', '#premiumDialog'];
let timer = null, busy = false, wasOn = false, leftTutorial = false, lastSaved = -1, lastGift = '';
const speedup = (() => { try { const v = Number(new URLSearchParams(globalThis.location?.search || '').get('pub-test')); return v > 0 ? Math.min(v, 600) : 1; } catch { return 1; } })();

function ensure(now) {
  if (timer) return timer;
  let raw = null;
  try { raw = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch {}
  timer = raw ? restoreAdTimer(raw, { now }) : createAdTimer({ seed: `pub-${Date.now().toString(36)}`, now });
  return timer;
}
function persist() { try { if (timer) localStorage.setItem(KEY, JSON.stringify(adTimerSnapshot(timer))); } catch {} }

// Parties lancées pendant ce lancement (jamais de pub « retour dans le jeu » au début d'une nouvelle partie).
const freshGames = new WeakSet();
export const markNewGame = game => { if (game) freshGames.add(game); };
export const isNewGame = game => freshGames.has(game);
export const inTutorialNow = () => isTutorial(state) || tutoStep !== null || miniStep !== null;
/** Le joueur est-il en train d'agir ? Destination à choisir, fenêtre de décision ou d'ordre ouverte, bataille à lui en cours. */
export function playerActing() {
  if (moveSource) return true;
  if (ACTION_DIALOGS.some(sel => $(sel)?.open)) return true;
  if (state?.mode === 'realtime' && battlesOf(state, state.playerNationId).length) return true;
  return false;
}
const adPlaying = () => document.body.dataset.adPlaying === '1' || Boolean(document.querySelector('#adOverlay[open]'));

/** Pub imposée à un moment calme (si les règles le permettent). Renvoie la raison du refus, ou 'shown' / 'unavailable'. */
export async function calmMoment(moment, { tutorial = inTutorialNow() } = {}) {
  const t = ensure(performance.now());
  if (busy || adPlaying()) return 'busy';
  const check = forcedAdCheck(t, { moment, premium: profile?.premium === true, tutorial, refused: adsRefusedThisSession(), action: playerActing(), gameOver: Boolean(state?.gameOver) });
  document.body.dataset.forcedAd = `${moment}:${check.ok ? 'ok' : check.reason}`; // repère pour les tests Playwright
  if (!check.ok) return check.reason;
  forcedShown(t); persist(); busy = true; drawGift();
  document.body.dataset.adPlaying = '1'; // l'horloge des jours s'arrête pendant la pub (realtime-ui.js)
  try { const r = await quietDuring(() => showForcedAd({ profile, inTutorial: tutorial })); return r.shown ? 'shown' : 'unavailable'; }
  finally { delete document.body.dataset.adPlaying; busy = false; drawGift(); }
}

function giftGold() { return state ? rewardGold(incomeFor(state, state.playerNationId)) : 0; }
function giftVisible() {
  return Boolean(timer) && !busy && state?.mode === 'realtime' && !$('#gameScreen').hidden && giftAvailable(timer, { tutorial: inTutorialNow(), gameOver: Boolean(state.gameOver) });
}
export function drawGift() {
  const btn = $('#giftBtn');
  if (!btn) return;
  const on = giftVisible(), gold = on ? giftGold() : 0, key = `${on}:${gold}`;
  if (key === lastGift) return;
  lastGift = key;
  btn.hidden = !on;
  if (on) { $('#giftGold').textContent = `+${gold}`; btn.setAttribute('aria-label', `Pub récompensée : +${gold} or`); }
}
/** 🎁 touchée : courte confirmation (le temps continue), puis la pub ; récompense seulement si elle est vue en entier. */
export function openGift() {
  if (!giftVisible()) return;
  const gold = giftGold();
  actionModal('Bonus du trésor', '🎁 PUB RÉCOMPENSÉE · FACULTATIVE', `<p class="gift-offer">Regardez une courte publicité jusqu’au bout : <b>+${gold} or</b> (un mois de revenus).</p>\
<p class="help-intro">Le temps du jeu s’arrête pendant la pub. « Plus tard » : l’icône reste disponible.</p>\
<div class="confirm-actions"><button class="cancel" id="giftLater">Plus tard</button><button class="primary" id="giftWatch">Regarder</button></div>`);
  $('#giftLater').onclick = () => $('#actionDialog').close();
  $('#giftWatch').onclick = async () => {
    $('#actionDialog').close();
    if (busy || !giftVisible()) return;
    const game = state, me = state.playerNationId;
    busy = true; drawGift(); document.body.dataset.adPlaying = '1';
    let r;
    try { r = await quietDuring(() => showRewardedAd({ label: `Publicité récompensée : +${gold} or` })); }
    finally { delete document.body.dataset.adPlaying; busy = false; }
    if (r?.rewarded) {
      if (game === state && applyGiftReward(game, me, gold, { rewarded: true })) { save(); render(); }
      giftUsed(timer, { rewarded: true }); persist();
      toast(`🎁 +${gold} or ajoutés au trésor`);
    } else if (r?.dismissed) {
      giftUsed(timer, { rewarded: false }); persist();
      toast('Publicité fermée avant la fin : pas de bonus, et plus aucune pub imposée jusqu’au prochain lancement');
    } else toast('Publicité indisponible pour le moment : l’icône reste là, réessayez plus tard');
    lastGift = ''; drawGift();
  };
}

/**
 * Battement de realtime-ui.js (250 ms). `onScreen` : partie temps réel affichée ; `running` : horloge des jours qui tourne
 * (pauses, menus, pub et arrière-plan exclus). Détecte le retour à l'accueil (moment calme « home »).
 */
export function syncAds({ now, onScreen, running }) {
  const t = ensure(now);
  tickAdTimer(t, { now, running: onScreen && running, speedup });
  if (onScreen) leftTutorial = inTutorialNow();
  else if (wasOn && !$('#welcomeScreen')?.hidden) calmMoment('home', { tutorial: leftTutorial });
  wasOn = onScreen;
  const step = Math.floor(t.playMs / 15000);
  if (step !== lastSaved) { lastSaved = step; persist(); }
  drawGift();
}
export function installAds() {
  $('#giftBtn')?.addEventListener('click', openGift);
}
