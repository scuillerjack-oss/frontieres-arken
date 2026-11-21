// V17.8 — Classement à points du temps réel (docs/V17-cahier-des-charges.md §9.2). Module pur, déterministe, sans DOM.
//
// | Élément                                                           | Points          |
// | Province possédée (île mystérieuse comprise, propriétaire principal) | 100            |
// | Capitale tenue (la sienne ou une autre), en plus de la province      | +150           |
// | Troupes (valeur en or, toutes unités, blessées comprises, où qu'elles soient) | 1 / 20 or |
// | Trésor                                                             | 1 / 20 or       |
// | Jours sans famine                                                  | 1 / 50 jours (au plus 109 en partie normale) |
// | Nation éliminée : 0 point, classée après les vivantes, la plus tardivement éliminée devant |
// Égalité : provinces, puis capitales, puis identifiant (comme gameRanking).
//
// Le classement montré pendant la partie est une PHOTO prise tous les 10 jours (state.rt.ranking) ; la fin de partie
// recalcule le classement du jour même. Le détail des cinq lignes n'est montré que pour soi et ses alliés (interface).

import { RULES } from '../constants.js';
import { foodConsumption } from './food.js';
import { gameDaysOf } from './clock.js';

const K = () => RULES.realtime.ranking;
const F = () => RULES.realtime.food;
const capitalIds = state => [...new Set(Object.values(state.nations).map(n => n.capitalId).filter(Boolean))];
const famineBag = state => {
  const rt = (state.rt && typeof state.rt === 'object') ? state.rt : (state.rt = {});
  return (rt.famineTotal = rt.famineTotal && typeof rt.famineTotal === 'object' ? rt.famineTotal : {});
};

/**
 * Valeur en or des troupes d'une nation : toutes ses piles (provinces, stationnées chez un allié, en marche, en mer, à
 * l'assaut), blessés compris. Calculée comme la nourriture : 1 vivre par jour = 20 or de troupes (food.js, mêmes piles).
 */
export const troopGold = (state, nationId) => Math.floor(foodConsumption(state, nationId) * F().goldPerRation / F().hundredths);
/** Jours de famine cumulés d'une nation depuis le début de la partie (compteur tenu par end.js, chaque jour). */
export const famineTotal = (state, nationId) => Math.max(0, Math.floor(Number(famineBag(state)[nationId]) || 0));
/** Jours écoulés sans famine (jour en cours compris), au plus la durée de la partie. */
export function noFamineDays(state, nationId) {
  const elapsed = Math.min(Math.max(0, Math.floor(Number(state.day) || 0)), gameDaysOf(state));
  return Math.max(0, elapsed - famineTotal(state, nationId));
}
/** Plafond des points « jours sans famine » : 109 en partie normale (5 479 ÷ 50), 51 en partie courte. */
export const foodPointsCap = state => Math.floor(gameDaysOf(state) / K().noFamineDaysPerPoint);
/** Jour d'élimination (V17.8 : `eliminatedDay` ; ancienne sauvegarde : fin de la période d'élimination). */
export const eliminationDay = n => Number.isFinite(n?.eliminatedDay) ? n.eliminatedDay : Number.isFinite(n?.eliminatedTurn) ? n.eliminatedTurn * RULES.realtime.daysPerPeriod : 0;

/** Points d'une nation, avec le détail des cinq lignes du §9.2. */
export function nationScore(state, nationId) {
  const n = state.nations[nationId], caps = new Set(capitalIds(state)), eliminated = Boolean(n?.eliminated);
  const owned = Object.entries(state.provinces).filter(([, p]) => p.ownerId === nationId);
  const provinces = owned.length, capitals = owned.filter(([id]) => caps.has(id)).length;
  const treasury = Math.max(0, Math.floor(Number(n?.treasury) || 0)), troops = troopGold(state, nationId), calm = noFamineDays(state, nationId);
  const parts = eliminated ? { provinces: 0, capitals: 0, troops: 0, treasury: 0, food: 0 } : {
    provinces: provinces * K().province,
    capitals: capitals * K().capital,
    troops: Math.floor(troops / K().troopGoldPerPoint),
    treasury: Math.floor(treasury / K().treasuryGoldPerPoint),
    food: Math.min(foodPointsCap(state), Math.floor(calm / K().noFamineDaysPerPoint))
  };
  const score = parts.provinces + parts.capitals + parts.troops + parts.treasury + parts.food;
  return { nationId, score, parts, provinces, capitals, treasury, troopGold: troops, noFamineDays: calm, eliminated,
    ...(eliminated ? { eliminatedDay: eliminationDay(n) } : {}) };
}
/**
 * Classement à points de toutes les nations : vivantes par points (égalité : provinces, capitales, identifiant), puis
 * les éliminées, la plus tardivement éliminée devant. Chaque ligne garde aussi les champs de gameRanking (provinces,
 * capitals, treasury, eliminated, rank) : l'écran de fin et le palmarès les lisent tels quels.
 */
export function realtimeRanking(state) {
  return Object.keys(state.nations).map(id => nationScore(state, id)).sort((a, b) =>
    (a.eliminated - b.eliminated)
    || (a.eliminated ? (b.eliminatedDay - a.eliminatedDay) : (b.score - a.score || b.provinces - a.provinces || b.capitals - a.capitals))
    || a.nationId.localeCompare(b.nationId)).map((r, i) => ({ ...r, rank: i + 1 }));
}
/** Photo du classement (tous les 10 jours, et à la fin) : { day, rows }. */
export function refreshRanking(state) {
  const rt = (state.rt && typeof state.rt === 'object') ? state.rt : (state.rt = {});
  rt.ranking = { day: Math.max(1, Math.floor(Number(state.day) || 1)), rows: realtimeRanking(state) };
  return rt.ranking;
}
/** Classement montré à l'écran 🏆 : la dernière photo (prise maintenant s'il n'y en a pas encore). Ne change rien d'autre. */
export function rankingSnapshot(state) {
  const r = state?.rt?.ranking;
  return r && Array.isArray(r.rows) && r.rows.length && Number.isFinite(r.day) ? r : refreshRanking(state);
}
/** Prochain jour de mise à jour de la photo (jours multiples de 10). */
export const nextRankingDay = day => (Math.floor(Math.max(0, Number(day) || 0) / K().refreshEveryDays) + 1) * K().refreshEveryDays;
/** Jour de mise à jour de la photo ? */
export const isRankingDay = day => day % K().refreshEveryDays === 0;
/** Compte un jour de famine pour chaque nation affamée (appelé une fois par jour, après la nourriture). */
export function countFamineDay(state) {
  const bag = famineBag(state);
  for (const [id, n] of Object.entries(state.nations)) if (!n.eliminated && n.food?.famine) bag[id] = (Number(bag[id]) || 0) + 1;
}
