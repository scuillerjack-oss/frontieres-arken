// Interface — V17.1 : partie en TEMPS RÉEL, écran provisoire (l'interface complète est la V17.3, la carte la V17.6).
// Une horloge simple (src/presentation/realtime-clock.js, pure) : 1 jour = 2 s, ▶ / ⏸ dans le bandeau au-dessus de la carte,
// la date à la place du tour. Les ordres du joueur partent tout de suite (executePendingOrders, même en pause). Les armées en
// marche sont dessinées dans un calque à part ajouté au SVG (#rtMarches), sans toucher au rendu de la carte (map-view.js).
// Pas de pause automatique pendant le jeu (décision de Jack, cahier §1.1) : seuls la page cachée et une pub arrêtent le temps ;
// une partie reprise repart en pause (§1.4).

import { RULES } from '../../domain/constants.js';
import { advanceDay, executePendingOrders, formatDate, formatShortDate, recallConvoy, recallMarch } from '../../domain/game-engine.js';
import { arkenV9Map as map } from '../../map/arken-v9-map.js';
import { createDayClock, dueDays, isClockRunning, setClockPaused, syncClockHolds } from '../realtime-clock.js';
import { $, E, nation, province, toast } from './base.js';
import { showCapitalPopups, showProposalPopups, showSeaPopups } from './event-popups.js';
import { drawFoodHud, showFoodNews } from './food-ui.js';
import { render } from './map-view.js';
import { actionModal, showProvinceSheet } from './province-sheet.js';
import { save, selected, state } from './session.js';
import { showEndScreen } from './turn-flow.js';

let clock = null, clockGame = null, timer = 0, lastDrawn = '', popups = Promise.resolve(), lastNews = '';
const now = () => (globalThis.performance?.now?.() ?? Date.now());
export const realtimeOn = () => Boolean(state) && state.mode === 'realtime';
const onScreen = () => realtimeOn() && !$('#gameScreen').hidden;
const unitsOf = x => ['infantry', 'cavalry', 'armor', 'artillery'].reduce((n, k) => n + (x.units?.[k] || 0), 0) + (x.warships || 0);

/** Armées visibles du joueur (provisoire, la vision complète est la V17.3) : les siennes, et celles qui viennent chez lui. */
const visibleMarches = () => (state.marches || []).filter(m => m.nationId === state.playerNationId || state.provinces[m.toId]?.ownerId === state.playerNationId);
function drawMarches() {
  const svg = $('#map');
  if (!svg) return;
  svg.querySelector('#rtMarches')?.remove();
  const layer = E('g', { id: 'rtMarches', class: 'rt-marches' });
  for (const m of visibleMarches()) {
    const a = province(m.fromId).markerAnchor, b = province(m.toId).markerAnchor, span = Math.max(1, m.arriveDay - m.startDay);
    const f = .15 + .7 * Math.min(1, Math.max(0, (state.day - m.startDay) / span)), x = a.x + (b.x - a.x) * f, y = a.y + (b.y - a.y) * f;
    const own = m.nationId === state.playerNationId;
    const g = E('g', { class: `rt-march${own ? ' own' : ''}`, 'data-march': m.id, role: 'button', tabindex: '0', transform: `translate(${Math.round(x)} ${Math.round(y)})`,
      'aria-label': `Armée de ${nation(m.nationId).short} vers ${province(m.toId).name}, arrivée le ${formatDate(m.arriveDay)}` });
    g.append(E('line', { x1: 0, y1: 0, x2: Math.round(b.x - x), y2: Math.round(b.y - y), stroke: nation(m.nationId).color, 'stroke-width': 6, 'stroke-dasharray': '14 10', opacity: .8 }));
    const disc = E('circle', { r: 24, fill: nation(m.nationId).color, stroke: '#fff7df', 'stroke-width': 5 });
    const icon = E('text', { y: 9, 'text-anchor': 'middle', 'font-size': 26 }); icon.textContent = m.returning ? '↩' : '⚔';
    g.append(disc, icon);
    g.addEventListener('click', event => { event.stopPropagation(); openMarch(m.id); });
    layer.append(g);
  }
  svg.append(layer);
}
/** Fiche d'une armée en marche : composition (les siennes), date d'arrivée, bouton « Rappeler ». */
function openMarch(id) {
  const m = (state.marches || []).find(x => x.id === id);
  if (!m) return;
  const own = m.nationId === state.playerNationId;
  actionModal(`Armée ${m.returning ? 'qui rentre' : 'en marche'}`, `${nation(m.nationId).short.toUpperCase()} · ${formatShortDate(state.day)}`,
    `<div class="order-detail"><span>${province(m.fromId).name} → ${province(m.toId).name}</span><span>Arrivée : ${formatDate(m.arriveDay)}</span>\
<span>${own ? `${unitsOf(m)} unités` : 'Composition inconnue'}</span></div>${own && !m.returning ? '<button id="rtRecall" class="primary">Rappeler</button>' : ''}`);
  const b = $('#rtRecall');
  if (b) b.onclick = () => { const r = recallMarch(state, { nationId: state.playerNationId, marchId: m.id }); $('#actionDialog').close(); toast(r.ok ? `Armée rappelée : retour le ${formatDate(r.arriveDay)}` : r.error); refresh(); };
}
/** Liste des troupes en route du joueur (marches et convois), avec « Rappeler » : ouverte en touchant le bandeau. */
function openTroops() {
  const me = state.playerNationId, marches = (state.marches || []).filter(m => m.nationId === me), convoys = (state.transports || []).filter(t => t.nationId === me);
  const row = (kind, x, arrive) => `<div class="unit-row"><span>${kind === 'march' ? '⚔' : '⛵'} ${province(x.fromId).name} → ${province(x.toId).name} · ${unitsOf(x)} unités · arrivée le ${formatDate(arrive)}</span>\
${x.returning ? '<b>retour</b>' : `<button data-recall-${kind}="${x.id}">Rappeler</button>`}</div>`;
  actionModal('Troupes en route', formatDate(state.day).toUpperCase(), [...marches.map(m => row('march', m, m.arriveDay)), ...convoys.map(t => row('convoy', t, t.arriveDay ?? state.day + t.turns - t.stage))].join('')
    || '<p>Aucune troupe en route. Touchez une de vos provinces pour donner un ordre : il part tout de suite.</p>');
  document.querySelectorAll('[data-recall-march]').forEach(b => b.onclick = () => { const r = recallMarch(state, { nationId: me, marchId: b.dataset.recallMarch }); toast(r.ok ? `Armée rappelée : retour le ${formatDate(r.arriveDay)}` : r.error); refresh(); openTroops(); });
  document.querySelectorAll('[data-recall-convoy]').forEach(b => b.onclick = () => { const r = recallConvoy(state, { nationId: me, convoyId: b.dataset.recallConvoy }); toast(r.ok ? `Convoi rappelé : retour le ${formatDate(r.arriveDay)}` : r.error); refresh(); openTroops(); });
}
/** Ligne d'information du bandeau : dernier fait marquant connu du joueur, sinon les troupes en route. */
function newsLine() {
  const last = [...(state.turnJournal || [])][0];
  const mine = (state.marches || []).filter(m => m.nationId === state.playerNationId).length + (state.transports || []).filter(t => t.nationId === state.playerNationId).length;
  const coming = (state.marches || []).filter(m => m.nationId !== state.playerNationId && state.provinces[m.toId]?.ownerId === state.playerNationId).length;
  if (coming) return `⚠ ${coming} armée${coming > 1 ? 's' : ''} ennemie${coming > 1 ? 's' : ''} en route vers vos provinces`;
  if (mine) return `${mine} troupe${mine > 1 ? 's' : ''} en route · touchez ici pour les voir ou les rappeler`;
  return last?.text ? String(last.text).split('\n')[0] : 'Touchez une province pour donner un ordre : il part tout de suite.';
}
function drawBar() {
  const bar = $('#liveBar');
  if (!bar) return;
  bar.hidden = false; document.body.classList.add('live-on');
  const running = clock && isClockRunning(clock), paused = clock?.paused;
  const title = `📅 ${formatDate(state.day)}`, time = running ? '×1' : paused ? 'En pause' : 'Arrêté', news = paused ? '⏸ En pause — touchez ▶ pour faire avancer le temps' : newsLine();
  const key = JSON.stringify([title, time, news, paused]);
  bar.classList.toggle('paused', !running);
  $('#liveProgress').style.width = `${Math.round(Math.min(1, (clock?.carryMs || 0) / RULES.realtime.clock.msPerDay) * 1000) / 10}%`;
  if (key === lastDrawn) return;
  lastDrawn = key;
  $('#liveTitle').textContent = title; $('#liveTime').textContent = time; $('#liveKind').hidden = true; $('#liveNews').textContent = news;
  const pause = $('#livePause');
  pause.textContent = paused ? '▶ Jouer' : '⏸ Pause'; pause.setAttribute('aria-pressed', String(Boolean(paused))); pause.disabled = false;
}
/** HUD : la date à la place du tour ; plus de bouton « Fin du tour ». */
function drawHud() {
  const turn = $('#turn');
  const text = formatShortDate(state.day);
  if (turn && turn.textContent !== text) { turn.textContent = text; turn.dataset.rtDay = String(state.day); turn.style.fontSize = '.72em'; }
  const label = turn?.closest('.hud-stat')?.querySelector('small');
  if (label && label.textContent !== 'DATE') label.textContent = 'DATE';
  const next = $('#nextTurn'); next.hidden = true; next.style.display = 'none'; // la feuille de style du paysage l'affiche malgré [hidden]
  drawFoodHud(); // V17.4 : réserve de vivres et « +N / jour »
}
function refresh() {
  render();
  if (selected && !$('#provinceSheet').hidden) showProvinceSheet();
  drawMarches(); drawHud(); lastDrawn = ''; drawBar();
}
const chain = task => { popups = popups.then(task).catch(() => {}); };
/** Un battement : ordres du joueur partis, jours dus joués, fenêtres d'événements (sans arrêter le temps). */
export function syncRealtime() {
  if (!onScreen()) {
    if (clock && state?.mode !== 'realtime') { clock = null; clockGame = null; }
    if (!realtimeOn()) { drawFoodHud(); const turn = $('#turn'); if (turn?.dataset.rtDay) { delete turn.dataset.rtDay; turn.style.fontSize = ''; const l = turn.closest('.hud-stat')?.querySelector('small'); if (l) l.textContent = 'TOUR'; const next = $('#nextTurn'); next.hidden = false; next.style.display = ''; } }
    return;
  }
  const t = now();
  if (!clock || clockGame !== state) { clock = createDayClock({ now: t, paused: true }); clockGame = state; lastDrawn = ''; refresh(); }
  if (state.gameOver) { drawHud(); drawBar(); return; }
  syncClockHolds(clock, { hidden: document.visibilityState === 'hidden', ad: document.body.dataset.adPlaying === '1' }, t);
  let changed = false;
  if ((state.orders || []).some(o => o.status === 'pending')) { executePendingOrders(state, map); changed = true; }
  const days = dueDays(clock, t), eventStart = state.events.length;
  for (let i = 0; i < days && !state.gameOver; i++) advanceDay(state, map);
  if (days) changed = true;
  if (changed) refresh();
  else { if (!$('#rtMarches')) drawMarches(); drawHud(); drawBar(); }
  if (!days) return;
  const events = state.events.slice(eventStart);
  if (state.gameOver) { save(); setClockPaused(clock, true, t); showEndScreen(); return; }
  const news = events.find(e => e.type === 'conquest' && (e.defender === state.playerNationId || e.newOwnerId === state.playerNationId));
  if (news && news.provinceId !== lastNews) { lastNews = news.provinceId; toast(news.newOwnerId === state.playerNationId ? `${province(news.provinceId).name} est à vous !` : `${province(news.provinceId).name} est tombée`); }
  showFoodNews(events); // V17.4
  chain(() => showCapitalPopups(events));
  chain(() => showSeaPopups(events));
  if (events.some(e => e.type === 'talk' || e.type === 'diplomatic-action' || e.type === 'ceasefire-offer')) chain(() => showProposalPopups());
}
export function toggleRealtimePause() {
  if (!clock || !realtimeOn()) return false;
  setClockPaused(clock, !clock.paused, now());
  if (clock.paused) save();
  lastDrawn = ''; drawBar();
  return true;
}
export function installRealtime() {
  // Page cachée : arrêt du temps et sauvegarde ; au retour, la partie reste en pause (cahier §1.4).
  document.addEventListener('visibilitychange', () => { if (!realtimeOn() || !clock) return; if (document.visibilityState === 'hidden') { setClockPaused(clock, true, now()); save(); } syncRealtime(); });
  addEventListener('pagehide', () => { if (realtimeOn()) save(); });
  $('#liveBar')?.addEventListener('click', event => { if (!realtimeOn() || event.target.closest('#livePause')) return; openTroops(); });
  clearInterval(timer); timer = setInterval(syncRealtime, RULES.realtime.clock.tickMs);
  syncRealtime();
}
