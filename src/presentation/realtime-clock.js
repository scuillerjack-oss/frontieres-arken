// V17.1 — Horloge des jours, côté interface (provisoire, remplacée par live-clock.js en V17.3). Module pur : aucune
// minuterie, aucun DOM, l'heure est toujours fournie. L'interface l'appelle tous les 250 ms ; elle dit combien de jours le
// moteur doit avancer (advanceDay), au plus 4 d'un coup pour rattraper un téléphone lent (cahier V17 §1.1).
// Rien n'en est sauvegardé : une partie reprise repart toujours EN PAUSE (§1.4).

import { RULES } from '../domain/constants.js';

const C = RULES.realtime.clock;
/** Nouvelle horloge, en pause par défaut. `speed` : 1 (2 s par jour) ou 2 (1 s par jour, Premium — V17.7). */
export function createDayClock({ now = 0, paused = true, speed = 1 } = {}) {
  return { lastNow: now, carryMs: 0, paused: Boolean(paused), speed: speed === 2 ? 2 : 1, holds: new Set() };
}
export const msPerDayOf = clock => clock.speed === 2 ? C.fastMsPerDay : C.msPerDay;
export const isClockRunning = clock => !clock.paused && clock.holds.size === 0;
/** ⏸ / ▶ du joueur. */
export function setClockPaused(clock, paused, now) { clock.lastNow = now; clock.paused = Boolean(paused); return clock; }
/** Arrêts imposés hors jeu (page cachée, publicité…) : `reasons` = { hidden: true, ad: false }. */
export function syncClockHolds(clock, reasons, now) {
  for (const [k, on] of Object.entries(reasons || {})) { if (on) clock.holds.add(k); else clock.holds.delete(k); }
  if (!isClockRunning(clock)) clock.lastNow = now;
  return clock;
}
/**
 * Battement : nombre de jours à jouer maintenant (0 en pause). Le temps réel écoulé s'accumule ; au-delà de 4 jours
 * d'avance, le surplus est oublié (pas de rattrapage infini après un gel du téléphone).
 */
export function dueDays(clock, now) {
  const elapsed = Math.max(0, now - clock.lastNow);
  clock.lastNow = now;
  if (!isClockRunning(clock)) return 0;
  const per = msPerDayOf(clock);
  clock.carryMs += elapsed;
  const days = Math.floor(clock.carryMs / per);
  if (days > C.maxDaysPerTick) { clock.carryMs = 0; return C.maxDaysPerTick; }
  clock.carryMs -= days * per;
  return days;
}
/** Avancement du jour en cours (0 à 1), pour une barre de progression. */
export const dayProgress = clock => Math.min(1, clock.carryMs / msPerDayOf(clock));
