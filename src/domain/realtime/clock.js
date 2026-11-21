// V17.1 — Horloge du temps réel, côté moteur : numéro de jour ↔ date, période de 30 jours, longueur de la partie.
// Module pur : aucune minuterie, aucun `Date` (calendrier grégorien calculé à la main, années bissextiles comprises).
// Le moteur ne connaît pas les secondes : l'interface lui dit seulement « un jour de plus » (advanceDay, day.js).

import { RULES } from '../constants.js';

const R = RULES.realtime;
export const MONTHS = Object.freeze(['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']);

export const isRealtime = state => state?.mode === 'realtime';
export const isLeapYear = y => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
export const daysInMonth = (y, m) => [31, isLeapYear(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];

// Jours depuis le 1er janvier de l'an 0 (calendrier grégorien proleptique, algorithme « days from civil »).
function civilToDays(y, m, d) {
  const yy = m <= 2 ? y - 1 : y, era = Math.floor(yy / 400), yoe = yy - era * 400;
  const doy = Math.floor((153 * (m + (m > 2 ? -3 : 9)) + 2) / 5) + d - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe;
}
function daysToCivil(z) {
  const era = Math.floor(z / 146097), doe = z - era * 146097;
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100)), mp = Math.floor((5 * doy + 2) / 153);
  const d = doy - Math.floor((153 * mp + 2) / 5) + 1, m = mp + (mp < 10 ? 3 : -9);
  return { year: yoe + era * 400 + (m <= 2 ? 1 : 0), month: m, day: d };
}
const START = civilToDays(R.startDate.year, R.startDate.month, R.startDate.day);

/** Date du jour n° `day` (jour 1 = RULES.realtime.startDate) : { year, month (1-12), day (1-31) }. */
export const dateOfDay = day => daysToCivil(START + Math.floor(Number(day) || 1) - 1);
/** Numéro de jour d'une date (inverse de dateOfDay). */
export const dayOfDate = (year, month, day) => civilToDays(year, month, day) - START + 1;
/** « 14 mars 2029 » (le 1er : « 1er janvier 2027 »). */
export function formatDate(day) {
  const d = dateOfDay(day);
  return `${d.day === 1 ? '1er' : d.day} ${MONTHS[d.month - 1]} ${d.year}`;
}
/** « 14/03/2029 » (journal). */
export function formatShortDate(day) {
  const d = dateOfDay(day), two = n => String(n).padStart(2, '0');
  return `${two(d.day)}/${two(d.month)}/${d.year}`;
}
/** Période de 30 jours d'un jour (= state.turn d'une partie temps réel) : jours 1-30 → 1, 31-60 → 2… */
export const periodOfDay = day => Math.floor((Math.max(1, Math.floor(Number(day) || 1)) - 1) / R.daysPerPeriod) + 1;
/** Dernier jour d'une période : les règles « par période » (guérison, paroles, dérive de la tension…) passent ce jour-là. */
export const isPeriodEnd = day => day % R.daysPerPeriod === 0;
const isShort = state => state?.gameLength === 40;
/** Durée de la partie en jours : 5 479 (15 ans), 2 557 en partie courte (7 ans). */
export const gameDaysOf = state => isShort(state) ? R.gameDays.short : R.gameDays.normal;
/** Longueur en périodes de 30 jours (183 ; 86 en partie courte). */
export const gamePeriodsOf = state => isShort(state) ? R.gamePeriods.short : R.gamePeriods.normal;
/** Jours des alertes de fin : [{ id, day }] (« Il reste 1 an » / « 6 mois », « Dernier mois »). */
export function endAlertDays(state) {
  const end = gameDaysOf(state), last = dateOfDay(end);
  return (isShort(state) ? R.endAlerts.short : R.endAlerts.normal).map(a => {
    if (a.days) return { id: a.id, day: end - a.days + 1 };
    // n mois avant la fin : le lendemain du même jour n mois plus tôt (fin le 31/12/2041 → 1er janvier 2041 pour 12 mois).
    let y = last.year, m = last.month - a.months + 1;
    while (m <= 0) { m += 12; y--; }
    return { id: a.id, day: m > 12 ? end + 1 : dayOfDate(y, m, 1) };
  });
}
/** Nations qui décident le jour `day` : la nation n° i (ordre des nations de la partie) quand (jour + 2 i) % 10 = 0. */
export function aiNationOfDay(state, day) {
  const ids = Object.keys(state.nations || {});
  const i = ids.findIndex((_, k) => (day + R.ai.offsetDays * k) % R.ai.decisionEveryDays === 0);
  const id = i >= 0 ? ids[i] : null;
  return id && state.controllers?.[id] === 'ai' && !state.nations[id].eliminated ? id : null;
}
/** Prochain jour de décision de chaque nation à partir de `day` (affichage, sauvegarde : state.nextAiDay). */
export function nextAiDays(state, day) {
  const ids = Object.keys(state.nations || {}), out = {};
  ids.forEach((id, k) => { let d = day; while ((d + R.ai.offsetDays * k) % R.ai.decisionEveryDays !== 0) d++; out[id] = d; });
  return out;
}
