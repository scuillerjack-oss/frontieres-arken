// V14.1 — fonctions pures (sans DOM) de l'interface, testables sous Node.
//  Cahier V14, section 3, point 6 : au lancement, la carte est centrée sur la capitale du joueur (sur un téléphone, elle
//  montrait l'ouest), avec un bouton « Voir toute la carte ».
import { panLimit } from './v5-ux.js';

export const WHOLE_MAP_LABEL = 'Voir toute la carte';
export const BACK_TO_CAPITAL_LABEL = 'Revenir à ma capitale';
/** Zoom maximal de la vue de lancement (assez pour centrer, sans perdre le voisinage de vue). */
export const LAUNCH_MAX_ZOOM = 1.5;
/** Marge de glisse au-delà du bord autorisée pour centrer une capitale proche du bord (= PAN_SLACK de l'interface). */
export const LAUNCH_EDGE_SLACK = .22;

/**
 * Vue de lancement : { scale, x, y } (mêmes conventions que mapFrameTransform : translation en pixels autour du centre,
 * carte calée sur le cadre) qui met la capitale `anchor` (repère de la carte, ex. 1536 × 1536) au
 * centre de l'écran. Le zoom est le plus petit (≥ 1, ≤ LAUNCH_MAX_ZOOM) qui permet ce centrage, avec la même marge de
 * glisse au-delà du bord que le doigt (LAUNCH_EDGE_SLACK) ; une capitale trop près du bord est au plus près du centre.
 */
export function launchView({ anchor, frame, viewport, content, maxZoom = LAUNCH_MAX_ZOOM, edgeSlack = LAUNCH_EDGE_SLACK }) {
  const k = content.width / frame.width; // pixels par unité de carte, au zoom 1
  const dx = (frame.width / 2 - anchor.x) * k, dy = (frame.height / 2 - anchor.y) * k;
  const fits = s => [[content.width, viewport.width, dx], [content.height, viewport.height, dy]].every(([size, view, d]) => Math.abs(d) * s <= panLimit(size * s, view, edgeSlack) + 1e-6);
  // Plus petit zoom (pas de 0,05) qui permet le centrage, borné à maxZoom.
  let scale = 1;
  while (scale < maxZoom && !fits(scale)) scale = Math.min(maxZoom, Math.round((scale + .05) * 100) / 100);
  const bound = (v, size, view) => { const l = panLimit(size * scale, view, edgeSlack); return Math.max(-l, Math.min(l, v)); };
  return { scale, x: bound(dx * scale, content.width, viewport.width), y: bound(dy * scale, content.height, viewport.height) };
}

/** Vue « toute la carte » : le zoom minimal (la carte entière tient dans l'écran), centrée. */
export const wholeMapView = minZoom => ({ scale: minZoom, x: 0, y: 0 });

/** La carte entière est-elle affichée (zoom minimal) ? Sert à basculer le libellé du bouton. */
export const showsWholeMap = (scale, minZoom) => scale <= minZoom + 1e-6;

/** Position à l'écran (pixels depuis le coin du cadre) d'un point de la carte pour une vue donnée. */
export function screenPoint({ point, frame, viewport, content, view }) {
  const k = content.width / frame.width;
  // La carte (#map) est centrée dans le cadre ; transformation CSS translate(x, y) scale(s) autour de son centre.
  return { x: viewport.width / 2 + view.x + view.scale * (point.x * k - content.width / 2),
    y: viewport.height / 2 + view.y + view.scale * (point.y * k - content.height / 2) };
}
