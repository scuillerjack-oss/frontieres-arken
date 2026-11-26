// V17.13 — Déplacements longs (itinéraires) : textes et tracés, rendu pur (sans DOM, testable sous Node ; branché par
// ui/province-sheet.js, ui/realtime-ui.js et ui/map-units-layer.js). Moteur : src/domain/realtime/itinerary.js.
// Textes en français ET en anglais (mêmes clés, même sens, vérifié par tests/v17-13.test.js) : le jeu affiche le
// français tant que le choix de la langue (branche V16-anglais) n'est pas fusionné ; JOURNEY_LANG est le seul réglage.

import { dateOfDay, formatDate } from '../domain/realtime/clock.js';
import { orderPath } from './map-orders-view.js';

export const JOURNEY_LANG = 'fr';
const EN_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const dateIn = (lang, day) => { if (lang !== 'en') return formatDate(day); const d = dateOfDay(day); return `${EN_MONTHS[d.month - 1]} ${d.day}, ${d.year}`; };
const plural = (n, one, many) => `${n} ${n > 1 ? many : one}`;

export const JOURNEY_TEXTS = Object.freeze({
  fr: Object.freeze({
    farHint: 'Vertes : provinces voisines. En pointillés : plus loin, le jeu trace l’itinéraire et vos troupes enchaînent les étapes seules.',
    title: 'Itinéraire',
    steps: n => plural(n, 'étape', 'étapes'),
    days: n => plural(n, 'jour', 'jours'),
    arrival: (date, days) => `Arrivée estimée le ${date} (${days})`,
    estimate: 'Estimation hors batailles : une bataille en chemin retarde l’arrivée.',
    safe: 'Itinéraire par vos provinces et celles de vos alliés.',
    crossing: (who, war) => war ? `⚔ Traverse ${who} (en guerre) : combat à chaque province ennemie traversée.` : `⚠ Traverse ${who} : y entrer déclare la GUERRE à ${who}.`,
    neutral: 'une province neutre',
    sea: 'mer',
    choose: 'Choisissez les forces : elles partent tout de suite et suivent l’itinéraire jusqu’au bout.',
    send: 'Envoyer sur l’itinéraire',
    confirm: 'Confirmer l’itinéraire',
    started: date => `Itinéraire donné : arrivée estimée le ${date}`,
    shipsSeaOnly: 'Avec des navires de guerre, l’itinéraire passe uniquement par la mer.',
    route: 'Itinéraire',
    nextStop: (name, date) => `Prochaine étape : ${name} le ${date}`,
    inBattle: name => `Bataille en cours à ${name} : l’itinéraire reprend après la victoire.`,
    cancel: 'Annuler l’itinéraire',
    redirect: 'Changer de destination',
    cancelled: name => `Itinéraire annulé : les troupes s’arrêtent à ${name}`,
    redirectBanner: 'Touchez la nouvelle destination (n’importe quelle province)',
    redirected: date => `Nouvelle destination : arrivée estimée le ${date}`,
    cancelHelp: 'Annuler : les troupes finissent l’étape en cours puis s’arrêtent. Changer de destination : prise en compte à la prochaine étape. Rappeler : demi-tour tout de suite.',
    bannerArrived: name => `Itinéraire terminé : vos troupes sont arrivées à ${name}`,
    bannerStopped: (name, dest, why) => `Itinéraire vers ${dest} arrêté à ${name} : ${why}`,
    bannerRerouted: (name, dest, date) => `Route coupée à ${name} : nouvel itinéraire vers ${dest}, arrivée estimée le ${date}`,
    why: Object.freeze({
      lost: 'troupes perdues en chemin', repelled: 'les troupes n’ont pas pu entrer', blocked: 'plus aucun chemin possible',
      besieged: 'départ impossible, province assiégée', recalled: 'troupes rappelées', cancelled: 'annulé', 'turned-back': 'les troupes ont fait demi-tour',
      order: 'départ impossible'
    })
  }),
  en: Object.freeze({
    farHint: 'Green: neighbouring provinces. Dotted: further away, the game plots the route and your troops march stage by stage on their own.',
    title: 'Route',
    steps: n => plural(n, 'stage', 'stages'),
    days: n => plural(n, 'day', 'days'),
    arrival: (date, days) => `Estimated arrival on ${date} (${days})`,
    estimate: 'Estimate without battles: a battle on the way delays the arrival.',
    safe: 'Route through your provinces and your allies’ provinces.',
    crossing: (who, war) => war ? `⚔ Crosses ${who} (at war): a battle in every enemy province on the way.` : `⚠ Crosses ${who}: entering declares WAR on ${who}.`,
    neutral: 'a neutral province',
    sea: 'sea',
    choose: 'Choose the forces: they leave right away and follow the route to the end.',
    send: 'Send along the route',
    confirm: 'Confirm the route',
    started: date => `Route ordered: estimated arrival on ${date}`,
    shipsSeaOnly: 'With warships, the route goes by sea only.',
    route: 'Route',
    nextStop: (name, date) => `Next stage: ${name} on ${date}`,
    inBattle: name => `Battle under way at ${name}: the route resumes after victory.`,
    cancel: 'Cancel the route',
    redirect: 'Change destination',
    cancelled: name => `Route cancelled: the troops stop at ${name}`,
    redirectBanner: 'Tap the new destination (any province)',
    redirected: date => `New destination: estimated arrival on ${date}`,
    cancelHelp: 'Cancel: the troops finish the current stage, then stop. Change destination: applied at the next stage. Recall: turn back right now.',
    bannerArrived: name => `Route complete: your troops have reached ${name}`,
    bannerStopped: (name, dest, why) => `Route to ${dest} stopped at ${name}: ${why}`,
    bannerRerouted: (name, dest, date) => `Route cut at ${name}: new route to ${dest}, estimated arrival on ${date}`,
    why: Object.freeze({
      lost: 'troops lost on the way', repelled: 'the troops could not get in', blocked: 'no possible way left',
      besieged: 'cannot leave, the province is under siege', recalled: 'troops recalled', cancelled: 'cancelled', 'turned-back': 'the troops turned back',
      order: 'cannot leave'
    })
  })
});
export const journeyTexts = (lang = JOURNEY_LANG) => JOURNEY_TEXTS[lang] || JOURNEY_TEXTS.fr;
export const journeyDate = (day, lang = JOURNEY_LANG) => dateIn(lang, day);

/** « Valmorne → Branvale → ⛵ Nordhème → Glacenoire » (noms donnés par `names.province`). */
export function stepsText(fromId, legs, names, lang = JOURNEY_LANG) {
  return [names.province(fromId), ...(legs || []).map(l => `${l.type === 'sea' ? '⛵ ' : ''}${names.province(l.toId)}`)].join(' → ');
}
/**
 * Résumé d'un itinéraire calculé (planItinerary) pour la fenêtre de l'ordre : étapes, durée, date d'arrivée, avertissements.
 * `names` : { province(id), nation(id) }.
 */
export function planSummary(plan, { fromId, day, names, lang = JOURNEY_LANG }) {
  const T = journeyTexts(lang);
  if (!plan?.ok) return null;
  const warnings = (plan.crossings || []).map(c => T.crossing(c.nationId === 'neutral' ? T.neutral : names.nation(c.nationId), c.war));
  return {
    steps: stepsText(fromId, plan.legs, names, lang), count: T.steps(plan.legs.length), days: T.days(plan.days), arriveDay: day + plan.days,
    arrival: T.arrival(dateIn(lang, day + plan.days), T.days(plan.days)), warnings, safe: warnings.length === 0 || plan.safe,
    note: warnings.length ? T.estimate : `${T.safe} ${T.estimate}`
  };
}
/** Bandeaux des itinéraires du joueur (arrivée, arrêt, nouvel itinéraire), comme realtime-view.js eventBanners. */
export function journeyBanners(events, me, names, lang = JOURNEY_LANG) {
  const T = journeyTexts(lang), out = [];
  for (const e of events || []) {
    if (e.nationId !== me || !String(e.type).startsWith('journey-')) continue;
    const at = names.province(e.provinceId), dest = names.province(e.toId), action = { type: 'province', provinceId: e.provinceId };
    if (e.type === 'journey-arrived') out.push({ key: `journey:${e.journeyId}:arrived`, kind: 'journey', tone: 'good', icon: '🏁', text: T.bannerArrived(at), action });
    else if (e.type === 'journey-stopped' && e.reason !== 'cancelled') out.push({ key: `journey:${e.journeyId}:stopped`, kind: 'journey', tone: 'warn', icon: '🛑', text: T.bannerStopped(at, dest, T.why[e.reason] || T.why.blocked), action });
    else if (e.type === 'journey-rerouted' && e.reason === 'blocked') out.push({ key: `journey:${e.journeyId}:rerouted:${e.day ?? ''}:${e.provinceId}`, kind: 'journey', tone: 'info', icon: '🧭', text: T.bannerRerouted(at, dest, dateIn(lang, e.arriveDay)), action });
  }
  return out;
}
/**
 * Tracé des étapes à venir d'un itinéraire (après l'étape en cours, déjà dessinée par l'icône de la marche ou du convoi) :
 * une polyligne par étape (repère de la carte) et le point d'arrivée. `status` = journeyStatus.
 */
export function journeyRoute(map, j, status) {
  const upcoming = j.legs.slice(status?.moving || status?.battle ? j.at + 1 : j.at);
  const lines = upcoming.map(l => orderPath(map, { fromId: l.fromId, toId: l.toId, routeType: l.type, via: l.via })).filter(p => p.length > 1);
  const end = map.provinces.find(p => p.id === j.toId)?.markerAnchor || null;
  return { lines, end, sea: upcoming.map(l => l.type === 'sea') };
}
