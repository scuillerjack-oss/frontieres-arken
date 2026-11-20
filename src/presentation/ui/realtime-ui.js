// Interface — V17.3 : partie en TEMPS RÉEL, interface définitive façon AM 3 (cahier V17 §1, §6, §8, §11, §12 « V17.3 »).
// - En bas à droite : la date (« 12 mars 2027 ») et ▶ Play / ⏸ Pause / ⏩ ×2 (cadenas sans Premium → écran « Premium
//   bientôt », la vraie offre est la V17.7). Toucher la date : les troupes en route, avec « Rappeler ».
// - En haut au centre : le message d'événement (dernier fait connu ; le toucher ouvre le Journal).
// - Dessous : les alertes en bandeaux (attaque en approche, conquête, proposition, ballon, famine à venir). Elles
//   n'arrêtent JAMAIS le temps (décision de Jack, §1.1) : la fenêtre de décision s'ouvre en touchant le bandeau, ou plus tard
//   depuis le Journal (« À décider »).
// - Sur la carte : troupes, navires et ballons qui avancent chaque jour (ui/map-units-layer.js), touchables.
// - Plus de « Fin du tour », plus d'animation de fin de tour, plus de bandeau « tour en direct » en temps réel.
// Le temps ne s'arrête que hors du jeu : Réglages, Aide, Atouts, Palmarès, écran Premium, fin de partie, pub, appli en
// arrière-plan. Une partie reprise repart toujours en pause (§1.4). Sauvegarde : tous les 10 jours de jeu, à chaque pause,
// à chaque ordre et à la mise en arrière-plan (§11), au plus une fois par seconde (realtime-clock.js, pur).

import { RULES } from '../../domain/constants.js';
import {
  advanceDay, executePendingOrders, formatDate, incomeFor, proposalsToAnswer, recallConvoy, recallMarch
} from '../../domain/game-engine.js';
import { arkenV9Map as map } from '../../map/arken-v9-map.js';
import { seaFatePopups } from '../alliances-view.js';
import {
  createDayClock, createSaveGate, dueDays, isClockRunning, setClockPaused, setClockSpeed, syncClockHolds, wantSave
} from '../realtime-clock.js';
import {
  compositionText, dateText, eventBanners, famineReminder, incomingBanners, monthlyIncomeText, proposalBanners, seaBanners,
  tickerText, tokenSheet, visibleBanners
} from '../realtime-view.js';
import { $, nation, province, toast } from './base.js';
import { openBalloon } from './balloon-ui.js';
import { showCapitalPopups, showProposalPopups, showSeaPopup } from './event-popups.js';
import { drawFoodHud, explainFood } from './food-ui.js';
import { currentTokens, setUnitOpener } from './map-units-layer.js';
import { battleNews, bombardRows, openBattle, setBattleRefresh, wireBombardRows } from './realtime-battles-ui.js';
import { focusProvince, render } from './map-view.js';
import { actionModal, selectProvince, showProvinceSheet } from './province-sheet.js';
import { profile, save, selected, state } from './session.js';
import { renderJournal, showEndScreen } from './turn-flow.js';

const SPEED_KEY = 'frontieres-arken-vitesse'; // réglage du téléphone (§11) : jamais dans la partie
const OUT_OF_GAME = ['#settingsDialog', '#helpDialog', '#boostDialog', '#palmaresDialog', '#premiumDialog', '#endDialog'];
let famineDay = null; // jour du dernier bandeau de famine (début ou rappel), pour au plus un rappel tous les 30 jours
let clock = null, clockGame = null, timer = 0, gate = null, alerts = [], seen = new Set(), lastDock = '', lastTicker = '', lastAlerts = '';
const now = () => (globalThis.performance?.now?.() ?? Date.now());
const names = { nation: id => nation(id).short, province: id => province(id).name };
export const realtimeOn = () => Boolean(state) && state.mode === 'realtime';
const onScreen = () => realtimeOn() && !$('#gameScreen').hidden;
export const isPremium = () => profile?.premium === true; // V17.7 : l'achat Premium posera ce drapeau dans le profil
const savedSpeed = () => { try { return isPremium() && localStorage.getItem(SPEED_KEY) === '2' ? 2 : 1; } catch { return 1; } };

// --- Sauvegarde espacée ------------------------------------------------------------------------------------------
function saveFor(reason) {
  if (!realtimeOn() || !gate) return;
  if (wantSave(gate, reason, state.day, now())) save();
}

// --- Icônes touchées et troupes en route ------------------------------------------------------------------------
function recall(kind, id) {
  const r = kind === 'convoy' ? recallConvoy(state, { nationId: state.playerNationId, convoyId: id }) : recallMarch(state, { nationId: state.playerNationId, marchId: id });
  toast(r.ok ? `${kind === 'convoy' ? 'Convoi rappelé' : 'Armée rappelée'} : retour le ${formatDate(r.arriveDay)}` : r.error);
  if (r.ok) saveFor('order');
  refresh();
  return r;
}
/** Fiche d'une icône de la carte : qui, d'où vers où, arrivée prévue, composition (selon la vision), « Rappeler ». */
export function openUnit(token) {
  const s = tokenSheet(token, state.day, names);
  actionModal(s.title, s.kicker.toUpperCase(), `<div class="order-detail unit-sheet"><b>${s.route}</b><span>📅 ${s.arrival}</span><span>${token.known ? '👁' : '❔'} ${s.composition}</span></div>\
<div class="confirm-actions rt-unit-actions"><button class="cancel" id="rtUnitSee">Voir l’arrivée</button>${token.recallable ? '<button class="primary" id="rtRecall">Rappeler</button>' : ''}</div>\
${token.recallable ? '<p class="help-intro">Rappelées, les troupes font demi-tour sur place : le retour dure le temps déjà parcouru.</p>' : ''}`);
  $('#rtUnitSee').onclick = () => { $('#actionDialog').close(); focusProvince(token.toId); };
  const b = $('#rtRecall');
  if (b) b.onclick = () => { $('#actionDialog').close(); recall(token.kind, token.id); };
}
setUnitOpener(openUnit);
setBattleRefresh(() => { saveFor('order'); refresh(); }); // après une retraite
/** Liste des troupes en route du joueur (marches et convois), avec « Rappeler » : en touchant la date. */
function openTroops() {
  const mine = currentTokens().filter(t => t.own);
  actionModal('Troupes en route', dateText(state.day).toUpperCase(), mine.map(t => `<div class="unit-row troop-row"><span>${t.kind === 'convoy' ? '⛵' : '⚔'} ${province(t.fromId).name} → \
${province(t.toId).name}<small>${compositionText(t)} · arrivée le ${formatDate(t.arriveDay)}</small></span>${t.recallable ? `<button data-recall="${t.kind}:${t.id}">Rappeler</button>` : '<b>retour</b>'}</div>`).join('')
    + bombardRows() || '<p>Aucune troupe en route. Touchez une de vos provinces puis « Déplacer / Attaquer » : l’ordre part tout de suite et l’armée apparaît sur la carte.</p>');
  wireBombardRows(openTroops); // V17.2 : bombardements permanents (« Arrêter »)
  document.querySelectorAll('[data-recall]').forEach(b => b.onclick = () => { const [kind, id] = b.dataset.recall.split(':'); recall(kind, id); openTroops(); });
}

// --- Bandeaux d'alerte -------------------------------------------------------------------------------------------
function pushBanners(list) {
  const t = now();
  for (const b of list) {
    if (seen.has(b.key)) continue;
    seen.add(b.key);
    // Une seule alerte par bataille à l'écran : l'assaut suivant remplace le précédent.
    if (b.action?.battleId) for (const a of alerts) if (a.action?.battleId === b.action.battleId) a.dismissed = true;
    alerts.push({ ...b, at: t, day: state.day });
  }
  if (alerts.length > 40) alerts = alerts.slice(-40);
}
function collectBanners(events) {
  const me = state.playerNationId;
  const fresh = [...eventBanners(events, me, names), ...seaBanners(seaFatePopups(events, me, names), state.day),
    ...incomingBanners(state, currentTokens(), me, names, seen), ...proposalBanners(proposalsToAnswer(state, me), names, seen)];
  const start = (events || []).filter(e => e.type === 'famine-start' && e.nationId === me).at(-1);
  if (start) famineDay = Number(start.day) || state.day;
  if ((events || []).some(e => e.type === 'famine-end' && e.nationId === me)) famineDay = null;
  if (famineDay === null && (events || []).some(e => e.type === 'famine-desertion' && e.nationId === me)) famineDay = state.day; // famine déjà en cours (partie reprise)
  const reminder = famineReminder(events, me, famineDay);
  if (reminder) { famineDay = reminder.day; fresh.push(reminder); }
  pushBanners(fresh);
}
/** Fenêtre de décision d'un bandeau (le temps continue de tourner). */
function openAlert(a) {
  a.dismissed = true; lastAlerts = ''; drawAlerts();
  const act = a.action || {};
  if (act.type === 'province') { focusProvince(act.provinceId); selectProvince(act.provinceId); }
  else if (act.type === 'capital') showCapitalPopups([act.event]);
  else if (act.type === 'sea') showSeaPopup(act.popup); // seulement SA fenêtre
  else if (act.type === 'balloon') openBalloon(act.balloonId);
  else if (act.type === 'proposal') { const list = proposalsToAnswer(state, state.playerNationId).filter(p => p.from === act.from); if (list.length) showProposalPopups(list).then(() => saveFor('order')); else toast('Cette proposition n’est plus valable'); }
  else if (act.type === 'food') explainFood();
  else if (act.type === 'battle') { focusProvince(act.provinceId); if ((state.battles || []).some(b => b.id === act.battleId)) openBattle(act.battleId); else toast('La bataille est terminée'); }
  else if (act.type === 'unit') { const t = currentTokens().find(x => x.kind === act.kind && x.id === act.id); if (t) { focusProvince(t.toId); openUnit(t); } else toast('Ces troupes sont arrivées'); }
  else renderJournal(false);
}
function drawAlerts() {
  const box = $('#rtAlerts');
  if (!box) return;
  const list = visibleBanners(alerts, now()), key = list.map(a => a.key).join('|');
  if (key === lastAlerts) return;
  lastAlerts = key;
  box.hidden = !list.length;
  box.innerHTML = list.map(a => `<div class="rt-alert ${a.tone}" data-kind="${a.kind}"><button class="rt-alert-main" data-alert="${a.key}"><i aria-hidden="true">${a.icon}</i><span>${a.text}</span></button>\
<button class="rt-alert-x" data-dismiss="${a.key}" aria-label="Fermer l’alerte">×</button></div>`).join('');
  box.querySelectorAll('[data-alert]').forEach(b => b.onclick = () => { const a = alerts.find(x => x.key === b.dataset.alert); if (a) openAlert(a); });
  box.querySelectorAll('[data-dismiss]').forEach(b => b.onclick = () => { const a = alerts.find(x => x.key === b.dataset.dismiss); if (a) a.dismissed = true; lastAlerts = ''; drawAlerts(); });
}
/** Journal en temps réel : « À décider » (propositions en attente) et les dernières alertes, chacune rouvrable. */
export function realtimeJournalHtml() {
  if (!realtimeOn()) return '';
  const props = proposalsToAnswer(state, state.playerNationId);
  const decide = props.map(p => `<div class="journal-entry gold rt-decide"><small>À décider</small><div>${nation(p.from).short} vous propose ${p.action === 'alliance' ? 'une alliance' : 'un cessez-le-feu'}.</div>\
<button class="rt-journal-btn" data-rt-proposal="${p.from}">Répondre</button></div>`).join('');
  const recent = [...alerts].reverse().slice(0, 8).map(a => `<div class="journal-entry ${a.tone === 'bad' ? 'red' : a.tone === 'good' ? 'treasure' : 'blue'}"><small>Alerte · ${formatDate(a.day)}</small>\
<div>${a.icon} ${a.text}</div>${a.action && !['journal', 'proposal'].includes(a.action.type) ? `<button class="rt-journal-btn" data-rt-alert="${a.key}">Voir</button>` : ''}</div>`).join('');
  return decide + recent;
}
export function bindRealtimeJournal() {
  document.querySelectorAll('[data-rt-proposal]').forEach(b => b.onclick = () => { $('#journalDialog').close(); openAlert({ action: { type: 'proposal', from: b.dataset.rtProposal } }); });
  document.querySelectorAll('[data-rt-alert]').forEach(b => b.onclick = () => { const a = alerts.find(x => x.key === b.dataset.rtAlert); $('#journalDialog').close(); if (a) openAlert(a); });
}

// --- Date, ▶ ⏸ ⏩, message d'événement, barre du haut ------------------------------------------------------------
function drawDock() {
  const dock = $('#rtDock');
  if (!dock) return;
  dock.hidden = false;
  const paused = clock.paused, running = isClockRunning(clock), fast = clock.speed === 2;
  const key = JSON.stringify([state.day, paused, running, fast, isPremium()]);
  if (key === lastDock) return;
  lastDock = key;
  $('#rtDateText').textContent = dateText(state.day);
  $('#rtSpeedTag').textContent = paused ? 'EN PAUSE' : !running ? 'ARRÊTÉ' : fast ? '×2' : '×1';
  dock.classList.toggle('paused', paused); dock.classList.toggle('fast', fast && !paused);
  $('#rtPlay').setAttribute('aria-pressed', String(!paused && !fast)); $('#rtPause').setAttribute('aria-pressed', String(paused));
  $('#rtFast').setAttribute('aria-pressed', String(!paused && fast)); $('#rtFast').classList.toggle('locked', !isPremium());
  $('#rtDate').setAttribute('aria-label', `${dateText(state.day)} : voir les troupes en route`);
}
function drawTicker() {
  const bar = $('#liveBar');
  if (!bar) return;
  bar.hidden = false;
  const tokens = currentTokens(), me = state.playerNationId;
  const t = tickerText(state, me, { paused: clock.paused, mine: tokens.filter(x => x.own).length, coming: tokens.filter(x => x.relation === 'foreign' && !x.returning && state.provinces[x.toId]?.ownerId === me).length, battle: battleNews() }), key = t.icon + t.text;
  bar.classList.toggle('paused', clock.paused);
  if (key === lastTicker) return;
  lastTicker = key;
  $('#liveTitle').textContent = ''; $('#liveTime').textContent = ''; $('#liveKind').hidden = true;
  $('#liveNews').textContent = `${t.icon} ${t.text}`;
}
/** Barre du haut : plus de « TOUR » (la date est en bas à droite) ; trésor avec le revenu par mois sous le montant (§3.1). */
function drawHud() {
  const el = $('#goldRate'), rate = monthlyIncomeText(incomeFor(state, state.playerNationId)).replace(' or / mois', '/mois');
  if (el && (el.textContent !== rate || el.hidden)) { el.textContent = rate; el.hidden = false; el.closest('.hud-stat')?.setAttribute('aria-label', `Trésor : revenu ${rate.replace('/mois', ' or par mois')}`); }
  drawFoodHud(); // V17.4 : réserve de vivres et « +N/j » dans l'emplacement #foodStat
}
function refresh() {
  render();
  if (selected && !$('#provinceSheet').hidden) showProvinceSheet();
  lastDock = ''; lastTicker = '';
  drawHud(); drawDock(); drawTicker(); drawAlerts();
}
function leaveRealtime() {
  document.body.classList.remove('rt-on', 'live-on');
  for (const id of ['#rtDock', '#rtAlerts']) { const el = $(id); if (el) el.hidden = true; }
  const rate = $('#goldRate'); if (rate && !rate.hidden) rate.hidden = true;
  drawFoodHud(); // cache la case des vivres hors temps réel
}
const outOfGame = () => OUT_OF_GAME.some(sel => $(sel)?.open);

/** Un battement (250 ms) : ordres du joueur partis, jours dus joués, bandeaux, sauvegarde espacée. */
export function syncRealtime() {
  if (!onScreen()) { if (clock && state?.mode !== 'realtime') { clock = null; clockGame = null; } if (!realtimeOn() || $('#gameScreen').hidden) leaveRealtime(); return; }
  const t = now();
  document.body.classList.add('rt-on', 'live-on');
  if (!clock || clockGame !== state) {
    clock = createDayClock({ now: t, paused: true }); setClockSpeed(clock, savedSpeed(), t); clockGame = state;
    gate = createSaveGate({ day: state.day, now: t }); alerts = []; seen = new Set(); lastAlerts = ''; famineDay = state.nations[state.playerNationId]?.food?.famine ? state.day : null;
    refresh(); collectBanners([]);
  }
  if (state.gameOver) { drawDock(); drawTicker(); return; }
  syncClockHolds(clock, { hidden: document.visibilityState === 'hidden', ad: document.body.dataset.adPlaying === '1', menu: outOfGame() }, t);
  let changed = false;
  if ((state.orders || []).some(o => o.status === 'pending')) { executePendingOrders(state, map); changed = true; saveFor('order'); }
  const days = dueDays(clock, t), eventStart = state.events.length;
  for (let i = 0; i < days && !state.gameOver; i++) advanceDay(state, map);
  if (days || changed) refresh();
  if (days || changed) collectBanners(state.events.slice(eventStart));
  if (state.gameOver) { save(); setClockPaused(clock, true, t); drawDock(); showEndScreen(); return; }
  saveFor('day');
  drawHud(); drawDock(); drawTicker(); drawAlerts();
}
/** ▶ / ⏸ / ⏩. `mode` : 'play', 'pause', 'fast' ou 'toggle' (ancien bouton du bandeau, tour par tour). */
export function setRealtimeSpeed(mode) {
  if (!clock || !realtimeOn()) return false;
  const t = now();
  if (mode === 'toggle') mode = clock.paused ? 'play' : 'pause';
  if (mode === 'fast' && !isPremium()) { $('#premiumDialog')?.showModal(); return true; }
  if (mode === 'pause') { setClockPaused(clock, true, t); saveFor('pause'); }
  else { setClockSpeed(clock, mode === 'fast' ? 2 : 1, t); setClockPaused(clock, false, t); try { if (isPremium()) localStorage.setItem(SPEED_KEY, String(clock.speed)); } catch {} }
  lastDock = ''; lastTicker = ''; drawDock(); drawTicker();
  return true;
}
export const toggleRealtimePause = () => setRealtimeSpeed('toggle');
export function installRealtime() {
  // Page cachée : arrêt du temps et sauvegarde ; au retour, la partie reste en pause (cahier §1.4).
  document.addEventListener('visibilitychange', () => {
    if (!realtimeOn() || !clock) return;
    if (document.visibilityState === 'hidden') { setClockPaused(clock, true, now()); saveFor('hidden'); }
    syncRealtime();
  });
  addEventListener('pagehide', () => { if (realtimeOn()) saveFor('hidden'); });
  $('#liveBar')?.addEventListener('click', event => { if (!realtimeOn() || event.target.closest('#livePause')) return; renderJournal(false); });
  $('#rtPlay')?.addEventListener('click', () => setRealtimeSpeed('play'));
  $('#rtPause')?.addEventListener('click', () => setRealtimeSpeed('pause'));
  $('#rtFast')?.addEventListener('click', () => setRealtimeSpeed('fast'));
  $('#rtDate')?.addEventListener('click', () => { if (realtimeOn()) openTroops(); });
  clearInterval(timer); timer = setInterval(syncRealtime, RULES.realtime.clock.tickMs);
  syncRealtime();
}
