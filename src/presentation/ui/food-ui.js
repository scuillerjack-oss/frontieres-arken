// Interface — V17.4 : la réserve de vivres dans la barre du haut (temps réel seulement) et les messages de nourriture.
// Petit module à part pour ne pas toucher au rendu de la carte ni à l'écran du temps réel (V17.3) : une case
// « 🌾 VIVRES 900 · +2,5/j » ajoutée juste après le trésor ; la toucher explique l'état (production, alerte, famine).

import { foodEventText, foodHud } from '../food-view.js';
import { $, toast } from './base.js';
import { state } from './session.js';

let lastKey = '';
function foodCell() {
  let cell = $('#foodStat');
  if (cell) return cell;
  const gold = $('#gold')?.closest('.hud-stat');
  if (!gold) return null;
  cell = document.createElement('button');
  cell.id = 'foodStat'; cell.type = 'button'; cell.className = 'hud-stat food-stat';
  cell.innerHTML = '<small>🌾 VIVRES</small><b id="foodReserve">0</b><i id="foodPerDay"></i>';
  cell.addEventListener('click', () => { if (state?.mode === 'realtime') toast(foodHud(state, state.playerNationId).note); });
  gold.after(cell);
  return cell;
}
/** Met à jour (ou retire) la case des vivres. */
export function drawFoodHud() {
  if (state?.mode !== 'realtime' || !state.nations?.[state.playerNationId]) { $('#foodStat')?.remove(); lastKey = ''; return; }
  const cell = foodCell();
  if (!cell) return;
  const v = foodHud(state, state.playerNationId), key = JSON.stringify(v);
  if (key === lastKey && cell.isConnected) return;
  lastKey = key;
  $('#foodReserve').textContent = v.reserve;
  $('#foodPerDay').textContent = v.perDay.replace(' / jour', '/j');
  cell.dataset.tone = v.tone;
  cell.setAttribute('aria-label', v.label);
}
/** Messages du joueur : alerte (moins de 10 jours), famine, désertions, retour des vivres. */
export function showFoodNews(events) {
  const me = state?.playerNationId;
  const mine = (events || []).filter(e => e.nationId === me && ['food-alert', 'famine-start', 'famine-end', 'famine-desertion'].includes(e.type));
  const pick = mine.find(e => e.type === 'famine-start') || mine.find(e => e.type === 'famine-end') || mine.find(e => e.type === 'food-alert') || mine.find(e => e.type === 'famine-desertion');
  if (pick) toast(foodEventText(pick));
}
