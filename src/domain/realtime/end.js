// V17.8 — Fins de partie du temps réel (docs/V17-cahier-des-charges.md §9.1), vérifiées chaque jour par advanceDay.
// Module pur, déterministe, sans DOM.
//
// 1. Conquête du monde → victoire immédiate : une nation tient les 5 capitales (règle V10) — 'capitals' — ou elle est la
//    seule nation non éliminée — 'last-nation'. L'île mystérieuse n'est pas exigée (cahier : capitales ou dernière nation).
// 2. Défaite : le joueur est éliminé — 'player-eliminated'.
// 3. Fin du temps : le dernier jour (31 décembre 2041 ; partie courte : 31 décembre 2033) — 'turn-limit' (nom gardé :
//    palmarès et titres le lisent) → le classement à points désigne le vainqueur.
// 4. Paix générale, proposée AU JOUEUR SEUL : toutes les nations restantes alliées deux à deux et aucun combat entre elles
//    depuis 90 jours → offre (state.endOffer.offerDay). Accepter → 'peace', le classement désigne le vainqueur. Refuser →
//    reproposée tous les 180 jours tant que la condition dure. Une alliance rompue (ou un combat) remet le compteur à zéro.
//    L'IA ne termine jamais une partie par la paix (aucune offre sans joueur humain vivant).
// L'interface arrête le temps sur la fenêtre d'offre et sur l'écran de fin (§1.1).

import { RULES } from '../constants.js';
import { pairTreaty } from '../engine/shared.js';
import { capitalsVictor } from '../engine/turn.js';
import { gameDaysOf, isRealtime } from './clock.js';
import { countFamineDay, isRankingDay, refreshRanking } from './ranking.js';

const E = () => RULES.realtime.end;
// Événements qui sont un combat entre nations (batailles, assauts, rencontres, interceptions, bombardements).
const COMBAT_EVENTS = new Set(['battle', 'conquest', 'assault', 'field-battle', 'interception', 'bombardment', 'naval-battle', 'convoy-battle']);
const NATION_KEYS = /nation|owner|defender|attacker|winner|from$|^to$|target/i;

/** Mémoire de l'offre de paix (créée à la volée pour une sauvegarde V17.1 à V17.7). */
export function endOfferOf(state) {
  const o = state.endOffer && typeof state.endOffer === 'object' ? state.endOffer : (state.endOffer = {});
  for (const k of ['peaceSince', 'nextOfferDay', 'offerDay']) if (!Number.isFinite(o[k])) o[k] = null;
  return o;
}
export const aliveNations = state => Object.keys(state.nations).filter(id => !state.nations[id].eliminated);
const humanPlayer = state => {
  const me = state.playerNationId;
  return me && state.controllers?.[me] === 'human' && state.nations[me] && !state.nations[me].eliminated ? me : null;
};
/** Toutes les nations restantes (au moins deux) alliées deux à deux ? */
export function allAllied(state) {
  const alive = aliveNations(state);
  if (alive.length < 2) return false;
  for (let i = 0; i < alive.length; i++) for (let j = i + 1; j < alive.length; j++) if (!pairTreaty(state, alive[i], alive[j], 'alliance')) return false;
  return true;
}
/** Nations nommées par un événement (tous les champs qui désignent une nation, tableaux compris). */
function nationsOf(state, e) {
  const out = new Set();
  const add = v => { if (typeof v === 'string' && state.nations[v]) out.add(v); else if (Array.isArray(v)) v.forEach(add); else if (v && typeof v === 'object' && typeof v.id === 'string') add(v.id); };
  for (const [k, v] of Object.entries(e || {})) if (NATION_KEYS.test(k)) add(v);
  return out;
}
/** Un combat entre deux nations vivantes, aujourd'hui (événements) ou en cours (batailles) ? */
export function combatBetweenAlive(state, events = []) {
  const alive = new Set(aliveNations(state));
  for (const b of state.battles || []) if (alive.has(b.defenderId) && (b.attackers || []).some(a => alive.has(a.nationId) && a.nationId !== b.defenderId)) return true;
  for (const e of events) {
    if (!COMBAT_EVENTS.has(e.type)) continue;
    if ([...nationsOf(state, e)].filter(id => alive.has(id)).length >= 2) return true;
  }
  return false;
}
/** Une offre de paix générale attend la réponse du joueur ? */
export const peaceOfferPending = state => isRealtime(state) && !state.gameOver && Number.isFinite(state.endOffer?.offerDay);
/** Jours de paix générale déjà comptés (0 si la condition ne tient pas). */
export const peaceDays = state => Number.isFinite(state.endOffer?.peaceSince) ? Math.max(0, state.day - state.endOffer.peaceSince) : 0; // jours déjà joués

/** Termine la partie (une seule fois) : classement à points du jour, vainqueur, événement « game-over ». */
export function endRealtimeGame(state, reason, winnerId = null) {
  if (state.gameOver) return state.gameOver;
  const ranking = refreshRanking(state).rows;
  const o = endOfferOf(state); o.offerDay = null;
  state.gameOver = { reason, turn: state.turn, day: state.day, winnerId: winnerId || ranking[0].nationId, ranking, scoring: 'points' };
  state.events.push({ turn: state.turn, type: 'game-over', reason, winnerId: state.gameOver.winnerId, nationId: state.gameOver.winnerId, day: state.day });
  return state.gameOver;
}
/** Suivi de la paix générale (chaque jour) : compteur, offre au bout de 90 jours, relance tous les 180 jours. */
function updatePeace(state, events) {
  const o = endOfferOf(state), day = state.day;
  if (!humanPlayer(state) || !allAllied(state) || combatBetweenAlive(state, events)) {
    o.peaceSince = null; o.nextOfferDay = null; o.offerDay = null;
    return;
  }
  if (o.peaceSince === null) o.peaceSince = day;
  if (o.offerDay !== null) return; // déjà proposée : en attente de la réponse
  if (day - o.peaceSince + 1 < E().peaceDays) return;
  if (o.nextOfferDay !== null && day < o.nextOfferDay) return;
  o.offerDay = day;
}
/**
 * Fin de journée (advanceDay, étape 8) : jours de famine, jour d'élimination, fins 1 à 3, suivi de la paix générale,
 * photo du classement tous les 10 jours. `events` = événements du jour (combats). Renvoie state.gameOver ou null.
 */
export function dailyEnd(state, events = []) {
  if (!isRealtime(state)) return null;
  countFamineDay(state);
  for (const n of Object.values(state.nations)) if (n.eliminated && !Number.isFinite(n.eliminatedDay)) n.eliminatedDay = state.day;
  if (state.gameOver) return state.gameOver;
  const victor = capitalsVictor(state), alive = aliveNations(state), me = state.playerNationId;
  const playerOut = state.controllers?.[me] === 'human' && state.nations[me]?.eliminated;
  if (victor) return endRealtimeGame(state, 'capitals', victor);
  if (playerOut) return endRealtimeGame(state, 'player-eliminated');
  if (alive.length === 1) return endRealtimeGame(state, 'last-nation', alive[0]);
  if (state.day >= gameDaysOf(state)) return endRealtimeGame(state, 'turn-limit');
  updatePeace(state, events);
  if (isRankingDay(state.day)) refreshRanking(state);
  return null;
}
/**
 * Réponse du joueur à l'offre de paix générale. `accept` : la partie se termine au classement actuel ('peace').
 * Refus : reproposée dans 180 jours si la paix dure. Renvoie { ok, ended, nextOfferDay }.
 */
export function answerPeaceOffer(state, accept) {
  if (!peaceOfferPending(state)) return { ok: false, error: 'Aucune offre de paix en attente' };
  const o = endOfferOf(state);
  if (accept) { endRealtimeGame(state, 'peace'); return { ok: true, ended: true }; }
  o.nextOfferDay = o.offerDay + E().reofferDays; // tous les 180 jours, comptés depuis l'offre
  o.offerDay = null;
  return { ok: true, ended: false, nextOfferDay: o.nextOfferDay };
}
