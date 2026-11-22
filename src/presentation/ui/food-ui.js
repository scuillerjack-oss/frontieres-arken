// Interface — V17.4 : la réserve de vivres dans la barre du haut (temps réel seulement) et les messages de nourriture.
// Une case « 🌾 VIVRES 900 · +8/j » (entiers depuis la V17.10.2) juste après le trésor (emplacement #foodStat de la V17.3) ; la toucher explique l'état.

import { foodHud } from '../food-view.js';
import { $, toast } from './base.js';
import { state } from './session.js';
import { tuto } from './tutorials.js';

let lastKey = '';
/** V17.3 : la case est posée dans index.html (emplacement prévu, cachée hors temps réel) ; on la remplit et on l'affiche. */
function foodCell() {
  const cell = $('#foodStat');
  if (!cell) return null;
  if (!$('#foodReserve')) cell.innerHTML = '<small>🌾 VIVRES</small><b id="foodReserve">0</b><i id="foodPerDay"></i>';
  if (!cell.dataset.bound) { cell.dataset.bound = '1'; cell.addEventListener('click', explainFood); }
  return cell;
}
/** Toucher la case (ou un bandeau de nourriture) : l'état des vivres en une phrase. */
export function explainFood() { if (state?.mode === 'realtime') { toast(foodHud(state, state.playerNationId).note); tuto('food'); } } // V17.9 : tutoriel
/** Met à jour (ou cache) la case des vivres. */
export function drawFoodHud() {
  const cell = foodCell();
  if (!cell) return;
  if (state?.mode !== 'realtime' || !state.nations?.[state.playerNationId]) { cell.hidden = true; lastKey = ''; return; }
  cell.hidden = false;
  const v = foodHud(state, state.playerNationId), key = JSON.stringify(v);
  if (key === lastKey) return;
  lastKey = key;
  $('#foodReserve').textContent = v.reserve;
  $('#foodPerDay').textContent = v.perDay.replace(' / jour', '/j');
  cell.dataset.tone = v.tone;
  cell.setAttribute('aria-label', v.label);
}
// V17.3 : les messages de nourriture (alerte, famine, retour des vivres, rappel de famine au plus tous les 30 jours) sont des
// bandeaux de l'écran du temps réel (realtime-view.js eventBanners) : plus de message à chaque désertion quotidienne.
