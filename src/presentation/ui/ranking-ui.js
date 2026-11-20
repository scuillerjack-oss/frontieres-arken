// Interface — V17.8 : écran 🏆 « Classement » (consultable à tout moment depuis la carte, le temps continue de tourner) et
// fenêtre de paix générale (proposée au joueur seul ; elle arrête le temps : c'est une décision de fin, cahier V17 §9.1).
// Textes : presentation/ranking-view.js (pur). Règles : domain/realtime/ranking.js et end.js.

import {
  answerPeaceOffer, formatDate, nextRankingDay, peaceOfferPending, rankingSnapshot
} from '../../domain/game-engine.js';
import { gameDaysOf } from '../../domain/realtime/clock.js';
import { pairTreaty } from '../../domain/engine/shared.js';
import { arkenV9Map as map } from '../../map/arken-v9-map.js';
import { peaceOfferHtml, rankingHtml } from '../ranking-view.js';
import { $, toast } from './base.js';
import { save, state } from './session.js';
import { showEndScreen } from './turn-flow.js';

let shownDay = null;
const me = () => state.playerNationId;
/** Détail des points : pour soi et ses alliés seulement (cahier §9.2). */
const detailFor = id => id === me() || pairTreaty(state, me(), id, 'alliance');

function drawRanking() {
  const snap = rankingSnapshot(state);
  shownDay = snap.day;
  $('#rankBody').innerHTML = rankingHtml(snap, { me: me(), nations: map.nations, detailFor, nextDay: nextRankingDay(snap.day), gameDays: gameDaysOf(state) });
}
/** 🏆 : classement à points (le temps continue de tourner pendant qu'on le lit). */
export function openRanking() {
  if (!state || state.mode !== 'realtime') return;
  drawRanking();
  $('#rankDialog').showModal();
}
/** Fenêtre de paix générale (s'ouvre d'elle-même quand l'offre arrive ; le temps s'arrête tant qu'elle est ouverte). */
export function offerPeaceIfDue() {
  const d = $('#peaceDialog');
  if (!d || d.open || !state || !peaceOfferPending(state)) return false;
  $('#peaceBody').innerHTML = peaceOfferHtml(rankingSnapshot(state), { me: me(), nations: map.nations });
  d.showModal();
  return true;
}
function answer(accept) {
  const r = answerPeaceOffer(state, accept);
  $('#peaceDialog').close();
  if (!r.ok) { toast(r.error); return; }
  save();
  if (r.ended) { showEndScreen(); return; }
  toast(`La partie continue. La question reviendra le ${formatDate(r.nextOfferDay)} si la paix dure.`);
}
/** Battement de l'interface temps réel : l'écran 🏆 ouvert suit la photo des 10 jours ; offre de paix due. */
export function syncRanking() {
  if (!state || state.mode !== 'realtime') return;
  if ($('#rankDialog')?.open && rankingSnapshot(state).day !== shownDay) drawRanking();
  if (!state.gameOver) offerPeaceIfDue();
}
export function installRanking() {
  $('#rankBtn')?.addEventListener('click', openRanking);
  $('#peaceEnd')?.addEventListener('click', () => answer(true));
  $('#peaceContinue')?.addEventListener('click', () => answer(false));
  // Pas de fermeture par « retour » : c'est une décision (Terminer ou Continuer).
  $('#peaceDialog')?.addEventListener('cancel', event => event.preventDefault());
}
