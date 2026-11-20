// V16.1 — Ballon d'observation : textes et positions pour l'interface. Fonctions pures, sans DOM : testables sous Node.
// Les règles sont dans src/domain/engine/balloons.js ; ici, seulement ce qu'on affiche. Aucun conseil stratégique.

import { RULES } from '../domain/constants.js';
import { balloonPath, islandProvinces, visibleBalloons } from '../domain/game-engine.js';

const B = RULES.balloon;
/** Tours restants avant d'arriver à destination (0 : immobile). */
export function balloonEta(map, balloon) {
  if (!balloon?.to) return 0;
  const path = balloonPath(map, balloon.over, balloon.to);
  return path ? Math.max(1, path.length * B.hopTurns - (balloon.legTurns || 0)) : 0;
}
/** Centre d'une île (moyenne des points de ses provinces), dans le repère de la carte. */
export function islandCenter(map, nationId) {
  const pts = islandProvinces(map, nationId).map(id => map.provinces.find(p => p.id === id)?.markerAnchor).filter(Boolean);
  if (!pts.length) return null;
  return { x: pts.reduce((n, p) => n + p.x, 0) / pts.length, y: pts.reduce((n, p) => n + p.y, 0) / pts.length };
}
/**
 * Icônes 🎈 visibles par `me` : ses ballons, et les ballons étrangers au-dessus d'une île où il possède une province.
 * Au-dessus du centre de l'île survolée ; plusieurs ballons sur la même île sont décalés côte à côte.
 */
export function balloonMarkers(state, map, me = state.playerNationId) {
  const list = visibleBalloons(state, map, me), byIsland = new Map();
  for (const b of list) byIsland.set(b.over, [...(byIsland.get(b.over) || []), b]);
  return list.map(b => {
    const c = islandCenter(map, b.over), same = byIsland.get(b.over), i = same.indexOf(b);
    if (!c) return null;
    return { id: b.id, nationId: b.nationId, own: b.nationId === me, over: b.over, to: b.to || null, eta: balloonEta(map, b),
      x: Math.round(c.x + (i - (same.length - 1) / 2) * 90), y: Math.round(c.y - 150) };
  }).filter(Boolean);
}
/** Ligne d'état d'un ballon : « Au-dessus de X » ou « Au-dessus de X, en route vers Y : arrivée dans N tours ». */
export function balloonStatusText(map, balloon, name, day = null) {
  const eta = balloonEta(map, balloon);
  // V17.3 : en temps réel (`day` fourni), l'arrivée se compte en jours (sauts de 60 jours comptés par périodes de 30).
  if (balloon.to && day !== null) { const n = balloonEtaDays(eta, day); return `Au-dessus ${deOf(name(balloon.over))}, en route vers ${name(balloon.to)} : arrivée dans ${n} jour${n > 1 ? 's' : ''}.`; }
  return balloon.to ? `Au-dessus ${deOf(name(balloon.over))}, en route vers ${name(balloon.to)} : arrivée dans ${eta} tour${eta > 1 ? 's' : ''}.` : `Au-dessus ${deOf(name(balloon.over))}.`;
}
/** Trajet affiché pour une destination : « 4 tours, en survolant Oroël ». */
export function balloonRouteText(dest, name, realtime = false) {
  const over = dest.path.slice(0, -1).map(name);
  if (realtime) return `${dest.turns * PERIOD} jours${over.length ? `, en survolant ${over.join(', ')}` : ''}`;
  return `${dest.turns} tour${dest.turns > 1 ? 's' : ''}${over.length ? `, en survolant ${over.join(', ')}` : ''}`;
}
/** Ligne du récapitulatif de fin de tour pour un ordre de ballon. */
export function balloonOrderText(order, { province, nation }) {
  if (order.kind === 'balloon-build') return `Ballon d’observation : construction à ${province(order.provinceId)} (${order.cost} or, ${order.duration} tours)`;
  if (order.kind === 'balloon-send') return `Ballon d’observation : envoi vers ${nation(order.to)}`;
  if (order.kind === 'balloon-shoot') return `Abattre le ballon ${deOf(nation(order.owner))}`;
  return '';
}
const deOf = name => /^[AEIOUYÉÈÊÎÏÔÖÛÜÀÂaeiouyéèêîïôöûüàâ]/.test(name) ? `d’${name}` : `de ${name}`;
export const balloonOf = deOf;
/** Ce que fait un ballon, en une phrase (fenêtres et aide). */
const PERIOD = RULES.realtime.daysPerPeriod;
/** V17.3 : jours avant l'arrivée d'un ballon en vol (`eta` en périodes de 30 jours, la période en cours entamée). */
export const balloonEtaDays = (eta, day) => Math.max(1, eta * PERIOD - (Math.max(1, Math.floor(day)) - 1) % PERIOD);
/** V17.3 : jours avant le départ d'un ballon envoyé (il part à la fin de la période de 30 jours en cours, V17.1). */
export const balloonDepartDays = day => (PERIOD - Math.floor(day) % PERIOD) % PERIOD;
export const BALLOON_RULE_TEXT = (realtime = false) => realtime
  ? `Au-dessus d’une île, un ballon montre à son propriétaire toutes les provinces de cette île, troupes comprises, et lui envoie tous les ${PERIOD} jours un rapport des chantiers, recrutements et mouvements. Il met ${B.hopTurns * PERIOD} jours par île, en suivant les routes maritimes.`
  : `Au-dessus d’une île, un ballon montre à son propriétaire toutes les provinces de cette île, troupes comprises, et lui envoie chaque tour un rapport des chantiers, recrutements et mouvements. Il avance de ${B.hopTurns} tours par île, en suivant les routes maritimes.`;
/** V17.3 : en temps réel, l'ordre d'abattre est exécuté tout de suite (executePendingOrders, ballons abattus en premier). */
export const BALLOON_SHOOT_TEXT_RT = 'Abattre un ballon ne déclenche aucune guerre. Son propriétaire est seulement prévenu. L’ordre est exécuté immédiatement, avant que le ballon ne bouge.';
export const BALLOON_SHOOT_TEXT = 'Abattre un ballon ne déclenche aucune guerre. Son propriétaire est seulement prévenu. L’ordre est exécuté au début du prochain inter-tour, avant que le ballon ne bouge.';
