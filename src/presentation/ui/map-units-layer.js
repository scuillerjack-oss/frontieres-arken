// Interface — V17.3 : troupes visibles qui avancent sur la carte (cahier V17 §6, §8). Couche à part, branchée par
// map-view.js DANS #mapWorld : les copies <use> du défilement sans fin (V17.6) la répètent donc d'elles-mêmes.
// Une icône par armée en marche (char) et par convoi (navire), aux couleurs de la nation, posée sur la flèche de son trajet
// à la fraction (jour − départ) ÷ (arrivée − départ) : elle ne bouge qu'une fois par jour, par petits sauts (pas
// d'animation continue). Touchable : composition (selon la vision), arrivée prévue, « Rappeler » pour les siennes.
// Les positions viennent de realtime-view.js (pur, testé).

import { visibleProvinces } from '../../domain/vision.js';
import { arkenV9Map as map } from '../../map/arken-v9-map.js';
import { tokenTag, unitTokens } from '../realtime-view.js';
import { E, nation } from './base.js';
import { state } from './session.js';

let opener = () => {};
/** realtime-ui.js donne la fenêtre à ouvrir quand on touche une icône. */
export const setUnitOpener = fn => { opener = fn; };
/** Icônes du jour vues par le joueur (même calcul pour la couche et pour les bandeaux). */
export const currentTokens = () => state?.mode === 'realtime' ? unitTokens(state, map, state.playerNationId, visibleProvinces(state, map, state.playerNationId)) : [];

const RING = { own: '#ffe17d', ally: '#7fc0ff', foreign: '#ff6a5f' };
// Silhouettes blanches dessinées à la main (aucune image à charger), tournées vers la droite ; retournées si le trajet va à gauche.
function tankGlyph() {
  const g = E('g', { class: 'unit-glyph' });
  g.append(E('rect', { x: -21, y: 3, width: 42, height: 11, rx: 5.5 }), E('path', { d: 'M-18 3 L-14 -5 L15 -5 L19 3 Z' }),
    E('rect', { x: -9, y: -13, width: 16, height: 9, rx: 3 }), E('rect', { x: 6, y: -11, width: 18, height: 4, rx: 2 }));
  for (const x of [-14, -5, 4, 13]) g.append(E('circle', { cx: x, cy: 8.5, r: 2.6, class: 'wheel' }));
  return g;
}
function shipGlyph() {
  const g = E('g', { class: 'unit-glyph' });
  g.append(E('path', { d: 'M-23 3 L23 3 L15 13 L-16 13 Z' }), E('rect', { x: -1.5, y: -18, width: 3, height: 21 }),
    E('path', { d: 'M2 -17 L18 0 L2 0 Z' }), E('path', { d: 'M-3 -14 L-16 0 L-3 0 Z', class: 'sail-back' }));
  return g;
}
const pathD = pts => pts.map((p, i) => `${i ? 'L' : 'M'}${Math.round(p.x)} ${Math.round(p.y)}`).join(' ');
/** Trajet restant (de l'icône à l'arrivée) en pointillés + pointe de flèche à l'arrivée ; trajet fait, très estompé. */
function routeOf(t) {
  const g = E('g', { class: `unit-route ${t.relation}${t.kind === 'convoy' ? ' sea' : ''}` });
  g.style.setProperty('--nation', nation(t.nationId).color);
  const end = t.path.at(-1), before = t.path.at(-2);
  g.append(E('path', { d: pathD(t.path), class: 'route-done' }), E('path', { d: pathD(t.ahead), class: 'route-casing' }), E('path', { d: pathD(t.ahead), class: 'route-ahead' }));
  // Pointe de flèche à l'arrivée, en retrait de la ville (même retrait que l'icône) ; sa taille suit --line (lisible à tout zoom).
  const ang = Math.atan2(end.y - before.y, end.x - before.x), seg = Math.hypot(end.x - before.x, end.y - before.y), back = Math.min(70, seg * .3);
  const tip = E('g', { transform: `translate(${Math.round(end.x - Math.cos(ang) * back)} ${Math.round(end.y - Math.sin(ang) * back)}) rotate(${Math.round(ang * 180 / Math.PI)})` });
  tip.append(E('path', { d: 'M8 0 L-16 -11 L-11 0 L-16 11 Z', class: 'route-tip' }));
  g.append(tip);
  return g;
}
function tokenOf(t) {
  const label = `${t.kind === 'convoy' ? 'Convoi' : 'Armée'} ${t.own ? 'à vous' : `de ${nation(t.nationId).short}`} vers ${t.toId ? map.provinces.find(p => p.id === t.toId)?.name : ''}${t.returning ? ' (retour)' : ''}`;
  const g = E('g', { class: `unit-token ${t.kind} ${t.relation}${t.returning ? ' returning' : ''}${t.known ? '' : ' unknown'}`, 'data-unit': `${t.kind}:${t.id}`,
    'data-day-x': String(t.x), role: 'button', tabindex: '0', transform: `translate(${t.x} ${t.y})`, 'aria-label': label });
  g.style.setProperty('--nation', nation(t.nationId).color); g.style.setProperty('--ring', RING[t.relation]);
  const inner = E('g', { class: 'ui-scale' }), flip = Math.abs(t.heading) > 90;
  const glyph = t.kind === 'convoy' ? shipGlyph() : tankGlyph();
  if (flip) glyph.setAttribute('transform', 'scale(-1 1)');
  inner.append(E('rect', { x: -33, y: -25, width: 66, height: 50, rx: 16, class: 'unit-body' }), glyph);
  const tag = E('text', { y: 46, class: 'unit-tag' }); tag.textContent = tokenTag(t, state.day); inner.append(tag);
  if (!t.known) { const q = E('text', { x: 31, y: -21, class: 'unit-unknown' }); q.textContent = '?'; inner.append(E('circle', { cx: 31, cy: -23, r: 13, class: 'unit-unknown-dot' }), q); }
  g.append(inner);
  const open = event => { event.stopPropagation(); opener(t); };
  g.addEventListener('click', open);
  g.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); open(event); } });
  return g;
}
/** Couche complète (#rtUnits) : trajets dessous, icônes dessus. Vide hors temps réel. */
export function unitsLayer(tokens = currentTokens()) {
  const layer = E('g', { id: 'rtUnits', class: 'rt-units' }), routes = E('g', { class: 'unit-routes' }), icons = E('g', { class: 'unit-icons' });
  for (const t of tokens) { routes.append(routeOf(t)); icons.append(tokenOf(t)); }
  layer.append(routes, icons);
  return layer;
}
