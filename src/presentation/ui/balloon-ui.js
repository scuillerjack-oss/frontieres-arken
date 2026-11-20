// Interface — V16.1 : ballon d'observation (icône sur la carte, construction, envoi, Détruire / Laisser passer).
// Règles : src/domain/engine/balloons.js ; textes : src/presentation/balloon-view.js.

import {
  balloonBuildStatus, balloonById, balloonDestinations, balloonMax, balloonPath, cancelBalloonOrder, pendingBalloonOrders, queueBalloonBuild,
  queueBalloonSend, queueBalloonShoot
} from '../../domain/game-engine.js';
import { arkenV9Map as map } from '../../map/arken-v9-map.js';
import {
  BALLOON_RULE_TEXT, BALLOON_SHOOT_TEXT, BALLOON_SHOOT_TEXT_RT, balloonDepartDays, balloonMarkers, balloonOf, balloonRouteText, balloonStatusText, islandCenter
} from '../balloon-view.js';
import { balloonHopFraction } from '../realtime-view.js';
import { isTutorial } from '../tutorial.js';
import { $, E, nation, province, toast } from './base.js';
import { eventPopup } from './event-popups.js';
import { render } from './map-view.js';
import { actionModal, confirmationModal } from './province-sheet.js';
import { state } from './session.js';

const me = () => state.playerNationId, short = id => nation(id).short;
const rt = () => state?.mode === 'realtime'; // V17.3 : textes en jours en temps réel
const rtDay = () => rt() ? state.day : null;
const pendingFor = (kind, balloonId) => pendingBalloonOrders(state, me()).find(o => o.kind === kind && o.balloonId === balloonId);

// --- Carte : une icône 🎈 aux couleurs du propriétaire au-dessus de l'île survolée -------------------------------------
export function balloonLayer() {
  const layer = E('g', { class: 'balloons' });
  for (const m of balloonMarkers(state, map)) {
    // V17.3 : en temps réel, un ballon en vol avance jour par jour vers l'île suivante de son trajet.
    if (state.mode === 'realtime' && m.to) {
      const next = balloonPath(map, m.over, m.to)?.[0], a = islandCenter(map, m.over), b = next && islandCenter(map, next);
      if (a && b) { const f = balloonHopFraction(balloonById(state, m.id)?.legTurns, state.day); m.x = Math.round(m.x + (b.x - a.x) * f); m.y = Math.round(m.y + (b.y - a.y) * f); }
    }
    const shoot = !m.own && pendingFor('balloon-shoot', m.id), send = m.own && pendingFor('balloon-send', m.id);
    const g = E('g', { class: `balloon${m.own ? ' own' : ' foreign'}${shoot ? ' targeted' : ''}`, 'data-balloon': m.id, role: 'button', tabindex: '0',
      transform: `translate(${m.x} ${m.y})`,
      'aria-label': m.own ? `Votre ballon d’observation, au-dessus ${balloonOf(short(m.over))}${m.to ? `, en route vers ${short(m.to)}` : ''}` : `Ballon d’observation ${balloonOf(short(m.nationId))} au-dessus de chez vous` });
    g.style.setProperty('--nation', nation(m.nationId).color);
    const inner = E('g', { class: 'ui-scale' }), icon = E('text', { y: 2, class: 'balloon-icon' });
    icon.textContent = '🎈';
    inner.append(E('circle', { r: 36, class: 'balloon-body' }), icon);
    if (m.to || send || shoot) { const tag = E('text', { y: 60, class: 'balloon-tag' }); tag.textContent = shoot ? '✖' : send ? '➜' : state.mode === 'realtime' ? `${Math.max(1, m.eta * 30 - (state.day - 1) % 30)} j` : `${m.eta}`; inner.append(tag); }
    g.append(inner);
    const open = event => { event.stopPropagation(); openBalloon(m.id); };
    g.addEventListener('click', open);
    g.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); open(event); } });
    layer.append(g);
  }
  return layer;
}
export function openBalloon(id) {
  const b = balloonById(state, id);
  if (!b) return;
  return b.nationId === me() ? openOwnBalloon(b) : openForeignBalloon(b);
}

// --- Son ballon : choisir la nation de destination ---------------------------------------------------------------
function openOwnBalloon(b) {
  const pending = pendingFor('balloon-send', b.id), dests = balloonDestinations(state, map, b.id);
  actionModal('🎈 Notre ballon d’observation', `AU-DESSUS DE ${short(b.over).toUpperCase()}`,
    `<p class="balloon-status">${balloonStatusText(map, b, short, rtDay())}</p>${pending ? `<p class="balloon-pending">Ordre en attente : envoi vers <b>${short(pending.to)}</b>. \
<button class="chip-cancel" data-cancel-balloon="${pending.id}">Annuler</button></p>` : ''}<p>Envoyer le ballon vers :</p><div class="action-list balloon-dests">${dests.map(d => `<div \
class="action-card"><span><b>${nation(d.id).name}</b><small>${balloonRouteText(d, short, rt())}</small></span><button data-balloon-to="${d.id}" ${pending?.to === d.id || b.to === d.id ? 'disabled' : ''}>\
${b.to === d.id ? 'En route' : 'Envoyer'}</button></div>`).join('')}</div>${b.to ? `<button class="secondary" data-balloon-to="${b.over}">Rester au-dessus ${balloonOf(short(b.over))}</button>` : ''}\
<p class="sea-note">${BALLOON_RULE_TEXT(rt())}</p>`);
  document.querySelectorAll('[data-balloon-to]').forEach(btn => btn.onclick = () => {
    const to = btn.dataset.balloonTo, r = queueBalloonSend(state, map, { nationId: me(), balloonId: b.id, to });
    if (!r.ok) return toast(r.error);
    $('#actionDialog').close(); render();
    toast(rt() ? (r.path.length ? `Ballon envoyé vers ${short(to)} : ${r.turns * 30} jours de vol, départ ${balloonDepartDays(state.day) ? `dans ${balloonDepartDays(state.day)} jours (fin du mois de jeu)` : 'aujourd’hui'}.` : `Le ballon restera au-dessus ${balloonOf(short(to))}.`)
      : r.path.length ? `Ballon envoyé vers ${short(to)} : ${r.turns} tours. Ordre ajouté au tour.` : `Le ballon restera au-dessus ${balloonOf(short(to))}. Ordre ajouté au tour.`);
  });
  document.querySelectorAll('[data-cancel-balloon]').forEach(btn => btn.onclick = () => cancelOrder(btn.dataset.cancelBalloon, () => openOwnBalloon(b)));
}

// --- Ballon étranger chez soi : Détruire / Laisser passer -------------------------------------------------------------
async function openForeignBalloon(b) {
  const owner = short(b.nationId), pending = pendingFor('balloon-shoot', b.id);
  const answer = await eventPopup({ kicker: 'BALLON D’OBSERVATION', title: `Ballon ${balloonOf(owner)} au-dessus de chez vous`, cls: 'balloon-popup',
    html: `<p class="capital-lead">${balloonStatusText(map, b, short, rtDay())}</p><p>Il montre à ${owner} toutes les provinces de cette île, troupes comprises.</p>\
<p class="help-intro">${rt() ? BALLOON_SHOOT_TEXT_RT : BALLOON_SHOOT_TEXT}</p>${pending ? '<p class="balloon-pending">Ordre en attente : ce ballon sera abattu.</p>' : ''}`,
    buttons: pending ? [{ label: 'Annuler l’ordre', value: 'cancel' }, { label: 'Fermer', value: null, primary: true }] : [{ label: 'Laisser passer', value: false }, { label: 'Détruire', value: true, primary: true }] });
  if (answer === 'cancel') return cancelOrder(pending.id);
  if (answer === true) shoot(b);
}
function shoot(b) {
  const r = queueBalloonShoot(state, map, { nationId: me(), balloonId: b.id });
  if (!r.ok) return toast(r.error);
  render(); toast(rt() ? `Ordre donné : le ballon ${balloonOf(short(b.nationId))} est abattu.` : `Ordre ajouté : le ballon ${balloonOf(short(b.nationId))} sera abattu au début de l’inter-tour.`);
}
function cancelOrder(orderId, then = null) {
  const r = cancelBalloonOrder(state, orderId, me());
  if (!r.ok) return toast(r.error);
  render(); toast(r.refund ? `Ordre annulé : ${r.refund} or remboursés.` : 'Ordre annulé.');
  if (then) then();
}
/** Fin de tour (après le journal, avant les propositions) : une fenêtre par ballon étranger arrivé au-dessus de chez soi. */
export async function showBalloonPopups(events) {
  if (isTutorial(state)) return;
  const seen = new Set();
  for (const e of events.filter(x => x.type === 'balloon-spotted' && x.nationId === me())) {
    if (seen.has(e.balloonId)) continue;
    seen.add(e.balloonId);
    const b = balloonById(state, e.balloonId);
    if (b && b.over === e.over && !pendingFor('balloon-shoot', b.id)) await openForeignBalloon(b);
  }
}

// --- Fiche d'une province : construction et commande en cours ----------------------------------------------------------
/** Carte « Ballon d'observation » de l'écran Construction (refus expliqué : usine, maximum, déjà en construction). */
export function balloonBuildCard(provinceId) {
  const st = balloonBuildStatus(state, { nationId: me(), provinceId });
  return `<div class="action-card balloon-card"><span><b>🎈 Ballon d’observation</b><small>${st.cost} or · ${state.mode === 'realtime' ? '60 jours' : `${st.turns} tour(s)`} · ${balloonMax(state, me())} au maximum</small>${st.ok ? '' : `<small \
class="prereq">⚠ ${st.reason}</small>`}</span><button data-build-balloon ${st.ok ? '' : 'disabled'}>Vérifier</button></div>`;
}
export function bindBalloonBuild(provinceId, after) {
  const btn = document.querySelector('[data-build-balloon]');
  if (!btn) return;
  btn.onclick = () => {
    const st = balloonBuildStatus(state, { nationId: me(), provinceId });
    if (!st.ok) return toast(st.reason);
    confirmationModal('Confirmer la construction', `<div class="order-detail"><span>Action : construire un ballon d’observation</span><span>Province : ${province(provinceId).name}</span><span>\
Durée : ${rt() ? '60 jours' : `${st.turns} tours`}</span><span>Coût : ${st.cost} or</span><span>Trésor après commande : ${state.nations[me()].treasury - st.cost} or</span><span>${BALLOON_RULE_TEXT(rt())}</span></div>`, () => {
      const r = queueBalloonBuild(state, { nationId: me(), provinceId });
      if (!r.ok) return toast(r.error);
      $('#actionDialog').close(); render(); after?.(); toast(rt() ? 'Chantier du ballon lancé : prêt dans 60 jours' : 'Ordre de construction du ballon ajouté à l’inter-tour');
    });
  };
}
/** Pastilles de la fiche : ballon commandé ce tour (annulable, remboursé) ou en construction. */
export function balloonSheetChips(provinceId) {
  const ordered = pendingBalloonOrders(state, me()).filter(o => o.kind === 'balloon-build' && o.provinceId === provinceId)
    .map(o => `<span class="info-chip balloon-chip">🎈 Ballon d’observation commandé (${rt() ? `${o.duration * 30} jours` : `${o.duration} tours`}) <button class="chip-cancel" data-cancel-balloon="${o.id}">Annuler</button></span>`);
  const building = (state.productionQueue || []).filter(q => q.kind === 'balloon' && q.nationId === me() && q.provinceId === provinceId)
    .map(q => `<span class="info-chip balloon-chip">🎈 Ballon d’observation en construction : ${q.remaining} ${rt() ? `jour${q.remaining > 1 ? 's' : ''}` : `tour${q.remaining > 1 ? 's' : ''}`}</span>`);
  return [...ordered, ...building].join('');
}
export function bindBalloonChips(after) {
  document.querySelectorAll('#sheetInfo [data-cancel-balloon]').forEach(btn => btn.onclick = () => cancelOrder(btn.dataset.cancelBalloon, after));
}
