// Interface — V16.4 : tour « en direct ». Le jeu avance tout seul : une horloge par tour (secondes par nation × nations en
// vie), un bandeau au-dessus de la carte qui passe de nation en nation et annonce ce que le joueur sait de son dernier tour,
// ⏸ Pause / ▶ Reprendre. À la fin de l'horloge : le même chemin que « Verrouiller et résoudre » (playTurn), sans confirmation.
// Le moteur n'est pas touché (résolution simultanée). L'horloge (live-clock.js, pur) n'est jamais sauvegardée.

import { arkenV9Map as map } from '../../map/arken-v9-map.js';
import {
  FLOWS, SPEED_IDS, SPEED_LABELS, clockView, createLiveClock, liveNationOrder, retime, syncHolds, tick, toggleManualPause
} from '../live-clock.js';
import { NOTHING_KNOWN, nationAnnouncements, newsAt } from '../live-news.js';
import { $, E, nation, province } from './base.js';
import { liveSettings, setLiveSettings, state } from './session.js';
import { turnAnimating } from './turn-anim.js';
import { liveOn, pendingOrderLines, playTurn, turnGate } from './turn-flow.js';

const TICK_MS = 250;
const HOLD_TEXT = { dialog: 'fenêtre ouverte', hidden: 'jeu en arrière-plan', tutorial: 'bulle d’aide', move: 'choix de la destination', anim: 'animation' };
let clock = null, clockGame = null, news = {}, lastSpot = '', lastHtml = '', timer = 0;
const now = () => (globalThis.performance?.now?.() ?? Date.now());

/** Le bandeau doit-il tourner maintenant ? (partie à l'écran, pas finie, déroulé en direct) */
const running = () => Boolean(state) && !$('#gameScreen').hidden && !state.gameOver && liveOn();
const visible = sel => { const el = $(sel); return Boolean(el && !el.hidden); };
function holds() {
  return {
    dialog: Boolean(document.querySelector('dialog[open]')), hidden: document.visibilityState === 'hidden',
    tutorial: visible('#tutorialBubble') || visible('#miniTuto'), move: visible('#moveBanner'), anim: turnAnimating()
  };
}
function newClock(t) {
  const ids = map.nations.map(n => n.id).filter(id => state.nations[id]);
  const order = liveNationOrder(ids, id => !state.nations[id].eliminated, state.playerNationId);
  clock = createLiveClock({ turn: state.turn, nationIds: order, speed: liveSettings.speed, now: t });
  clockGame = state; news = nationAnnouncements(state, map, ids); lastSpot = '';
}
/** Le bouton du bas : « Passer » en direct, « Fin du tour » sinon (texte d'origine, mode classique inchangé). */
function syncNextButton(on) {
  const btn = $('#nextTurn'), label = btn?.querySelector('span');
  if (!label) return;
  const text = on ? 'Passer' : 'Fin du tour';
  if (label.textContent !== text) { label.textContent = text; btn.setAttribute('aria-label', on ? 'Passer : résoudre le tour maintenant' : 'Fin du tour'); }
}
function spotlight(provinceId) {
  const svg = $('#map'), at = province(provinceId).markerAnchor;
  if (!svg || !at) return;
  try {
    const ring = E('circle', { class: 'live-ring', r: 90, cx: at.x, cy: at.y });
    ring.style.transformOrigin = `${at.x}px ${at.y}px`; ring.style.transformBox = 'view-box';
    svg.append(ring); setTimeout(() => ring.remove(), 1800);
  } catch {}
}
function line(view) {
  const id = view.nationId;
  if (id === state.playerNationId) {
    const orders = pendingOrderLines();
    if (!orders.length) return { key: `${id}|none`, small: 'VOS ORDRES', text: 'Aucun ordre en attente : touchez une province pour agir.' };
    const i = Math.min(orders.length - 1, Math.floor(view.segmentProgress * orders.length));
    return { key: `${id}|${i}`, small: `VOS ORDRES · ${orders.length} EN ATTENTE`, text: orders[i] };
  }
  const item = newsAt(news[id], view.segmentProgress);
  if (!item) return { key: `${id}|none`, small: '', text: NOTHING_KNOWN };
  return { key: `${id}|${item.text}`, small: item.type, text: item.text, provinceId: item.provinceId };
}
function draw(view) {
  const bar = $('#liveBar');
  const n = view ? nation(view.nationId) : null, l = view ? line(view) : null;
  const pausedWhy = view?.manual ? 'En pause' : view?.paused ? `En pause : ${HOLD_TEXT[view.holds[0]] || 'attente'}` : '';
  const title = view ? `⏱ Tour ${state.turn} · ${n.short}` : `⏱ Résolution du tour…`;
  const secs = view ? `${Math.ceil(view.remainingMs / 1000)} s` : '';
  const html = JSON.stringify([title, secs, pausedWhy, l?.small, l?.text, view?.manual]);
  bar.style.setProperty('--live-color', n?.color || '#e2bf73');
  $('#liveProgress').style.width = `${Math.round((view?.progress ?? 1) * 1000) / 10}%`;
  bar.classList.toggle('paused', Boolean(view?.paused));
  if (html !== lastHtml) {
    lastHtml = html;
    $('#liveTitle').textContent = title; $('#liveTime').textContent = pausedWhy || secs;
    $('#liveKind').textContent = l?.small || ''; $('#liveKind').hidden = !l?.small;
    $('#liveNews').textContent = l ? l.text : 'Les ordres sont verrouillés, le monde agit.';
    const pause = $('#livePause');
    pause.textContent = view?.manual ? '▶ Reprendre' : '⏸ Pause';
    pause.setAttribute('aria-pressed', String(Boolean(view?.manual)));
    pause.disabled = !view;
  }
  // Province concernée : brièvement entourée (sans déplacer la carte : le joueur peut être en train de donner un ordre).
  if (l && l.key !== lastSpot) { lastSpot = l.key; if (l.provinceId && !view.paused) spotlight(l.provinceId); }
}
/** Un battement : met l'horloge à l'heure, applique les pauses automatiques, résout à la fin, dessine le bandeau. */
export function syncLive() {
  const on = running();
  syncNextButton(Boolean(state) && liveOn());
  document.body.classList.toggle('live-on', on);
  const bar = $('#liveBar');
  if (!on) { if (bar) bar.hidden = true; clock = null; clockGame = null; return; }
  bar.hidden = false;
  const t = now();
  if (turnGate.busy) { clock = null; draw(null); return; } // résolution et fenêtres de fin de tour : l'horloge repartira après
  if (!clock || clockGame !== state || clock.turn !== state.turn) newClock(t);
  if (clock.speed !== liveSettings.speed) retime(clock, liveSettings.speed, t);
  syncHolds(clock, holds(), t);
  if (tick(clock, t) === 'expired') { draw(clockView(clock)); playTurn({ live: true }); return; }
  draw(clockView(clock));
}
/** ⏸ / ▶ */
export function toggleLivePause() { if (!clock) return; toggleManualPause(clock, now()); lastHtml = ''; syncLive(); }

/** Réglages ⚙ : « Déroulé » et « Vitesse ». */
export function renderLiveSettings() {
  const flowLabel = { direct: 'En direct', classique: 'Classique' };
  $('#flowChoices').innerHTML = FLOWS.map(id => `<button type="button" class="level-choice" data-flow="${id}" aria-pressed="${liveSettings.flow === id}">${flowLabel[id]}</button>`).join('');
  $('#speedChoices').innerHTML = SPEED_IDS.map(id => `<button type="button" class="level-choice" data-speed="${id}" aria-pressed="${liveSettings.speed === id}">${SPEED_LABELS[id]}</button>`).join('');
  $('#flowText').textContent = liveSettings.flow === 'direct'
    ? 'Le tour avance tout seul, nation par nation ; « Passer » le résout tout de suite. Les règles ne changent pas.'
    : 'Le tour attend que vous touchiez « Fin du tour » (comme avant).';
  $('#speedChoices').closest('.live-speed').hidden = liveSettings.flow !== 'direct';
  document.querySelectorAll('[data-flow]').forEach(b => b.onclick = () => { setLiveSettings({ flow: b.dataset.flow }); renderLiveSettings(); syncLive(); });
  document.querySelectorAll('[data-speed]').forEach(b => b.onclick = () => { setLiveSettings({ speed: b.dataset.speed }); renderLiveSettings(); syncLive(); });
}
export function installLive() {
  $('#livePause').onclick = toggleLivePause;
  // Pause automatique sans attendre le battement : fenêtre ouverte / fermée, page cachée / revenue.
  new MutationObserver(list => { if (list.some(m => !m.target.closest?.('#liveBar'))) syncLive(); }).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['open', 'hidden'] });
  document.addEventListener('visibilitychange', syncLive);
  clearInterval(timer); timer = setInterval(syncLive, TICK_MS);
  syncLive();
}
