// V17.1 — Horloge des jours, côté interface (V17.3 : horloge définitive, ×2, sauvegarde espacée). Module pur : aucune
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
/** V17.3 : ⏩ ×2 (Premium) / retour ×1. Le temps déjà accumulé est gardé, en proportion du jour en cours. */
export function setClockSpeed(clock, speed, now) {
  const before = msPerDayOf(clock);
  dueDaysCarry(clock, now);
  clock.speed = speed === 2 ? 2 : 1;
  clock.carryMs = Math.floor(clock.carryMs * msPerDayOf(clock) / before);
  return clock;
}
// Accumule le temps écoulé sans jouer de jour (le jour entamé n'est pas perdu au changement de vitesse).
function dueDaysCarry(clock, now) {
  const elapsed = Math.max(0, now - clock.lastNow);
  clock.lastNow = now;
  if (isClockRunning(clock)) clock.carryMs = Math.min(clock.carryMs + elapsed, msPerDayOf(clock) - 1);
}
/** Jours de jeu par seconde réelle (affichage, tests) : 0,5 en ×1, 1 en ×2, 0 en pause. */
export const daysPerSecond = clock => isClockRunning(clock) ? 1000 / msPerDayOf(clock) : 0;

/**
 * V17.3 — Quand sauvegarder (cahier §11) : tous les 10 jours de jeu, à chaque pause, à chaque ordre, à la mise en
 * arrière-plan ; jamais plus d'une fois par seconde (écriture de 100 à 300 ko), sauf la mise en arrière-plan (le
 * téléphone peut couper l'appli juste après) qui passe toujours. Module pur : l'heure et le jour sont fournis.
 */
export const SAVE_EVERY_DAYS = 10;
export const SAVE_MIN_MS = 1000;
export function createSaveGate({ day = 1, now = -Infinity } = {}) { return { lastDay: day, lastNow: now, pending: false }; }
/**
 * Faut-il écrire maintenant ? `reason` : 'day' (battement), 'pause', 'order', 'hidden'. Une demande refusée par la limite
 * d'une seconde reste en attente (`pending`) et passe au battement suivant.
 */
export function wantSave(gate, reason, day, now) {
  const due = reason === 'day' ? (gate.pending || day - gate.lastDay >= SAVE_EVERY_DAYS) : true;
  if (!due) return false;
  if (reason !== 'hidden' && now - gate.lastNow < SAVE_MIN_MS) { gate.pending = true; return false; }
  gate.lastDay = day; gate.lastNow = now; gate.pending = false;
  return true;
}

/** Avancement du jour en cours (0 à 1), pour une barre de progression. */
export const dayProgress = clock => Math.min(1, clock.carryMs / msPerDayOf(clock));
