// Interface — V17.13 : déplacements longs en un seul ordre (temps réel). En mode « Déplacer / Attaquer », une province
// verte = voisine (comportement d'avant, inchangé) ; une province plus loin (liseré en pointillés) ouvre la fenêtre de
// l'ITINÉRAIRE : étapes, durée, arrivée estimée, nations traversées ; les troupes enchaînent les étapes seules.
// Itinéraire en cours : tracé en pointillés sur la carte jusqu'au drapeau d'arrivée, « Annuler l'itinéraire » et
// « Changer de destination » dans la fiche des troupes (icône sur la carte ou liste « Troupes en route »).
// Moteur : src/domain/realtime/itinerary.js ; textes FR / EN : ../journey-view.js.

import { LAND_UNIT_TYPES } from '../../domain/constants.js';
import {
  availableForces, cancelJourney, journeyById, journeyStatus, planItinerary, playerJourneys, reachableByItinerary, redirectJourney, startJourney
} from '../../domain/game-engine.js';
import { arkenV9Map as map } from '../../map/arken-v9-map.js';
import { journeyDate, journeyPreset, journeyRoute, journeyTexts, planSummary, stepsText } from '../journey-view.js';
import { $, E, nation, province, toast, unitKeys } from './base.js';
import { render } from './map-view.js';
import { actionModal, confirmationModal } from './province-sheet.js';
import { moveSource, save, setMoveSource, setSelected, state } from './session.js';

const T = () => journeyTexts();
export { journeyTexts };
const names = { province: id => province(id).name, nation: id => nation(id).short };
const rtOn = () => state?.mode === 'realtime';
const me = () => state.playerNationId;
let redirecting = null; // identifiant de l'itinéraire dont on choisit la nouvelle destination

export const isRedirecting = () => Boolean(redirecting) && rtOn();
export const clearRedirect = () => { redirecting = null; };
/** Provinces lointaines proposées en mode déplacement (liseré en pointillés) : atteignables par un itinéraire. */
export function farDestinations() {
  if (!rtOn() || !moveSource) return new Set();
  if (isRedirecting()) return new Set(map.provinces.map(p => p.id).filter(id => id !== moveSource && state.provinces[id]));
  return reachableByItinerary(map, state, { nationId: me(), fromId: moveSource });
}
/** Toucher une province en mode déplacement : itinéraire (lointaine) ou nouvelle destination. true si traité ici. */
export function journeyTap(id, isNeighbour) {
  if (!rtOn() || !moveSource) return false;
  if (isRedirecting()) { finishRedirect(id); return true; }
  if (isNeighbour || id === moveSource) return false;
  const plan = planItinerary(map, state, { nationId: me(), fromId: moveSource, toId: id, units: availableForces(state, moveSource, me()) });
  if (!plan.ok) { toast(plan.error); return true; }
  openJourneySelection(moveSource, id);
  return true;
}
const unitsFromInputs = () => Object.fromEntries(LAND_UNIT_TYPES.map(k => [k, Math.floor(Number(document.querySelector(`[data-force="${k}"]`)?.value) || 0)]));
const shipsFromInput = () => Math.floor(Number(document.querySelector('[data-force="warships"]')?.value) || 0);
const forcesText = (units, ships) => Object.entries(units).filter(([, n]) => n).map(([k, n]) => `${n} ${unitKeys[k].toLowerCase()}`).concat(ships ? [`${ships} navire${ships > 1 ? 's' : ''}`] : []).join(' · ');
function planHtml(plan, fromId) {
  const s = planSummary(plan, { fromId, day: state.day, names });
  if (!s) return `<p class="sea-warn">⚠ ${plan.error}</p>`;
  return `<div class="order-detail journey-plan"><b>🧭 ${s.steps}</b><span>${s.count} · ${s.days}</span><span>📅 ${s.arrival}</span>\
${s.warnings.map(w => `<span class="sea-warn">${w}</span>`).join('')}<small>${s.note}</small></div>`;
}
/** Fenêtre de l'ordre d'itinéraire : forces (50 % / 100 % / au choix), itinéraire recalculé selon les forces choisies. */
export function openJourneySelection(fromId, toId) {
  const available = availableForces(state, fromId, me());
  setMoveSource(null); $('#moveBanner').hidden = true;
  const port = planItinerary(map, state, { nationId: me(), fromId, toId, units: available, warships: 1 }).ok && available.warships > 0;
  const preset = mode => journeyPreset(available, mode, { port });
  const first = preset('50'); // province qui n'a que des navires : les navires sont présélectionnés (relecture V17.13)
  const row = (key, label) => `<div class="unit-row"><span>${label}</span><b>${available[key] || 0}</b><input data-force="${key}" type="number" min="0" max="${available[key] || 0}" value="${key === 'warships' ? first.warships : first.units[key] || 0}" ${available[key] ? '' : 'disabled'}></div>`;
  const rows = [...LAND_UNIT_TYPES.map(k => row(k, unitKeys[k])), ...(port ? [row('warships', 'Navires (escorte)')] : [])].join('');
  actionModal(T().title, `${province(fromId).name} → ${province(toId).name}`, `<div id="journeyPlan"></div><p>${T().choose}</p>${port ? `<p class="sea-note">⚓ ${T().shipsSeaOnly}</p>` : ''}\
<div class="force-presets"><button data-preset="50">50 %</button><button data-preset="100">100 %</button><button data-preset="manual">Personnaliser</button></div>${rows}<p id="forceSummary"></p>\
<button id="confirmJourney" class="primary">${T().send}</button>`);
  const plan = () => planItinerary(map, state, { nationId: me(), fromId, toId, units: unitsFromInputs(), warships: shipsFromInput() });
  const update = () => { $('#journeyPlan').innerHTML = planHtml(plan(), fromId); $('#forceSummary').textContent = forcesText(unitsFromInputs(), shipsFromInput()) || 'Aucune unité sélectionnée'; };
  document.querySelectorAll('[data-force]').forEach(i => { i.oninput = update; });
  document.querySelectorAll('[data-preset]').forEach(b => b.onclick = () => {
    if (b.dataset.preset === 'manual') { document.querySelector('[data-force]')?.focus(); return; }
    const chosen = preset(b.dataset.preset);
    for (const k of LAND_UNIT_TYPES) document.querySelector(`[data-force="${k}"]`).value = chosen.units[k];
    const ships = document.querySelector('[data-force="warships"]');
    if (ships && chosen.warships) ships.value = chosen.warships;
    update();
  });
  update();
  $('#confirmJourney').onclick = () => {
    const units = unitsFromInputs(), warships = shipsFromInput(), p = plan();
    if (!Object.values(units).some(Boolean) && !warships) return toast('Sélectionne au moins une unité');
    if (!p.ok) return toast(p.error);
    confirmationModal(T().confirm, `${planHtml(p, fromId)}<div class="order-detail"><span>Origine : ${province(fromId).name}</span><span>Destination : ${province(toId).name}</span>\
<span>Quantité : ${forcesText(units, warships)}</span><span>Coût : 0 or</span></div>`, () => {
      const r = startJourney(state, map, { nationId: me(), fromId, toId, units, warships });
      if (!r.ok) return toast(r.error);
      $('#actionDialog').close(); setSelected(null); render(); save();
      toast(T().started(journeyDate(r.arriveDay)));
    });
  };
}
// --- Itinéraires en cours ---------------------------------------------------------------------------------------------
/** Itinéraire d'une icône (marche ou convoi du joueur), ou null. */
export function journeyOfToken(token) {
  const list = token?.kind === 'convoy' ? state.transports : state.marches;
  const id = (list || []).find(x => x.id === token?.id)?.journeyId;
  return id ? journeyById(state, id) : null;
}
/** Lignes HTML d'un itinéraire (fiche de l'icône, liste des troupes) avec ses deux boutons. */
export function journeyBlock(j) {
  const st = journeyStatus(state, j), t = T();
  return `<div class="order-detail journey-sheet" data-journey="${j.id}"><b>🧭 ${t.route} : ${stepsText(st.moving || st.battle ? j.legs[j.at].fromId : st.here, j.legs.slice(j.at), names)}</b>\
<span>📅 ${t.arrival(journeyDate(st.arriveDay), t.days(Math.max(0, st.arriveDay - state.day)))}</span>\
<span>${st.battle ? t.inBattle(province(st.nextStopId).name) : t.nextStop(province(st.nextStopId).name, journeyDate(st.nextStopDay))}</span>\
<div class="confirm-actions"><button class="cancel" data-journey-cancel="${j.id}">${t.cancel}</button><button class="primary" data-journey-redirect="${j.id}"${st.battle ? ' disabled' : ''}>${t.redirect}</button></div>\
<small>${t.cancelHelp}</small></div>`;
}
/** Branche les boutons « Annuler l'itinéraire » / « Changer de destination » de la fenêtre ouverte. */
export function wireJourneyButtons(after = () => {}) {
  document.querySelectorAll('[data-journey-cancel]').forEach(b => b.onclick = () => {
    const r = cancelJourney(state, { nationId: me(), journeyId: b.dataset.journeyCancel });
    if (!r.ok) return toast(r.error);
    save(); render(); toast(T().cancelled(province(r.stopAt).name)); after();
  });
  document.querySelectorAll('[data-journey-redirect]').forEach(b => b.onclick = () => startRedirect(b.dataset.journeyRedirect));
}
/** Itinéraires du joueur sans icône sur la carte (départ du jour pas encore parti, bataille d'étape) : pour la liste. */
export const idleJourneys = () => playerJourneys(state, me()).filter(j => !journeyStatus(state, j).moving);
export function startRedirect(journeyId) {
  const j = journeyById(state, journeyId);
  if (!j) return toast('Itinéraire introuvable');
  const st = journeyStatus(state, j);
  $('#actionDialog').close();
  redirecting = journeyId; setSelected(null); setMoveSource(st.moving ? st.nextStopId : st.here);
  $('#provinceSheet').hidden = true; $('#moveBanner').hidden = false; $('#movePrompt').textContent = T().redirectBanner;
  render();
}
function finishRedirect(id) {
  const journeyId = redirecting;
  redirecting = null; setMoveSource(null); $('#moveBanner').hidden = true;
  const r = redirectJourney(state, map, { nationId: me(), journeyId, toId: id });
  render();
  if (!r.ok) return toast(r.error);
  save(); toast(T().redirected(journeyDate(r.arriveDay)));
}
const pathD = pts => pts.map((p, i) => `${i ? 'L' : 'M'}${Math.round(p.x)} ${Math.round(p.y)}`).join(' ');
/** Couche des itinéraires du joueur : étapes à venir en pointillés, drapeau 🏁 à l'arrivée (dans #mapWorld). */
export function journeysLayer() {
  const layer = E('g', { class: 'journeys' });
  if (!rtOn()) return layer;
  for (const j of playerJourneys(state, me())) {
    const r = journeyRoute(map, j, journeyStatus(state, j)), g = E('g', { class: 'journey-route', 'data-journey': j.id });
    g.style.setProperty('--nation', nation(me()).color);
    r.lines.forEach((pts, i) => g.append(E('path', { d: pathD(pts), class: `journey-casing${r.sea[i] ? ' sea' : ''}` }), E('path', { d: pathD(pts), class: `journey-ahead${r.sea[i] ? ' sea' : ''}` })));
    if (r.end) {
      const flag = E('g', { class: 'journey-end', transform: `translate(${Math.round(r.end.x)} ${Math.round(r.end.y)})` }), inner = E('g', { class: 'ui-scale' }), t = E('text', { y: -60 });
      t.textContent = '🏁'; inner.append(t); flag.append(inner); g.append(flag);
    }
    layer.append(g);
  }
  return layer;
}
