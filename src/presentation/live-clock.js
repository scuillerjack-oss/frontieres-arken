// V16.4 — Tour « en direct » : horloge du tour. Module pur : aucune minuterie, aucun DOM, l'heure est toujours fournie.
// L'interface (src/presentation/ui/live-ui.js) l'appelle plusieurs fois par seconde ; le moteur n'est pas concerné :
// à la fin de l'horloge, le tour est résolu par le même chemin que « Verrouiller et résoudre » (résolution simultanée).
//
// Réglages (déroulé, vitesse) : clé DÉDIÉE du téléphone, jamais dans la sauvegarde de partie (ils valent pour toutes les
// parties). Rien de l'horloge n'est sauvegardé : au rechargement, elle repart à zéro.

export const LIVE_SETTINGS_KEY = 'frontieres-arken-deroule';
export const FLOWS = Object.freeze(['direct', 'classique']);
/** Secondes par nation encore en vie. */
export const LIVE_SPEEDS = Object.freeze({ lent: 15, normal: 10, rapide: 5 });
export const SPEED_IDS = Object.freeze(['lent', 'normal', 'rapide']);
export const SPEED_LABELS = Object.freeze({ lent: 'Lent (15 s)', normal: 'Normal (10 s)', rapide: 'Rapide (5 s)' });
export const DEFAULT_LIVE_SETTINGS = Object.freeze({ flow: 'direct', speed: 'normal' });

/** Réglages lus d'un texte quelconque : tout ce qui est inconnu ou abîmé revient aux valeurs par défaut. */
export function decodeLiveSettings(text) {
  let raw = null;
  try { raw = typeof text === 'string' && text ? JSON.parse(text) : null; } catch { raw = null; }
  return {
    flow: FLOWS.includes(raw?.flow) ? raw.flow : DEFAULT_LIVE_SETTINGS.flow,
    speed: SPEED_IDS.includes(raw?.speed) ? raw.speed : DEFAULT_LIVE_SETTINGS.speed
  };
}
export const encodeLiveSettings = settings => JSON.stringify(decodeLiveSettings(JSON.stringify(settings || {})));
export function loadLiveSettings(storage = globalThis.localStorage) {
  try { return decodeLiveSettings(storage?.getItem(LIVE_SETTINGS_KEY)); } catch { return { ...DEFAULT_LIVE_SETTINGS }; }
}
export function saveLiveSettings(settings, storage = globalThis.localStorage) {
  try { storage?.setItem(LIVE_SETTINGS_KEY, encodeLiveSettings(settings)); return true; } catch { return false; }
}
export const secondsPerNation = speed => LIVE_SPEEDS[speed] || LIVE_SPEEDS.normal;
/** Durée du tour en millisecondes : secondes par nation × nations encore en vie (au moins une). */
export const turnDurationMs = (aliveCount, speed) => Math.max(1, Math.floor(aliveCount) || 1) * secondsPerNation(speed) * 1000;

/**
 * Le déroulé en direct s'applique-t-il ? Jamais dans le tutoriel ni pendant le mini tuto (leurs bulles attendent les gestes
 * du joueur, et le bouton « Fin du tour » y est montré) : là, le mode classique est gardé tel quel.
 */
export const liveApplies = (settings, { tutorial = false, miniTuto = false } = {}) => settings?.flow === 'direct' && !tutorial && !miniTuto;

/**
 * Ordre du bandeau : les nations étrangères encore en vie dans l'ordre de la carte, puis la nation du joueur en dernier
 * (rappel de ses ordres juste avant la résolution).
 */
export function liveNationOrder(nationIds, isAlive, playerId) {
  const alive = nationIds.filter(id => isAlive(id));
  return [...alive.filter(id => id !== playerId), ...alive.filter(id => id === playerId)];
}

/** Nouvelle horloge pour un tour. `now` en millisecondes (horloge monotone de préférence). */
export function createLiveClock({ turn = 0, nationIds = [], speed = 'normal', now = 0 } = {}) {
  const ids = nationIds.length ? [...nationIds] : [null];
  return { turn, nationIds: ids, speed, durationMs: turnDurationMs(ids.length, speed), elapsed: 0, lastNow: now, manual: false, holds: new Set(), done: false };
}
export const isPaused = clock => clock.manual || clock.holds.size > 0;
/** Fait avancer le temps écoulé jusqu'à `now` (seulement hors pause). */
export function advance(clock, now) {
  if (!clock.done && !isPaused(clock)) clock.elapsed = Math.min(clock.durationMs, clock.elapsed + Math.max(0, now - clock.lastNow));
  clock.lastNow = now;
  return clock;
}
/** ⏸ / ▶ du joueur. */
export function setManualPause(clock, on, now) { advance(clock, now); clock.manual = Boolean(on); return clock; }
export const toggleManualPause = (clock, now) => setManualPause(clock, !clock.manual, now);
/** Pause automatique : `reason` = 'dialog', 'hidden', 'tutorial', 'move', 'resolving'… */
export function setHold(clock, reason, on, now) { advance(clock, now); if (on) clock.holds.add(reason); else clock.holds.delete(reason); return clock; }
/** Toutes les raisons d'un coup : { dialog: true, hidden: false, … }. */
export function syncHolds(clock, reasons, now) {
  advance(clock, now);
  for (const [reason, on] of Object.entries(reasons || {})) { if (on) clock.holds.add(reason); else clock.holds.delete(reason); }
  return clock;
}
/** Changement de vitesse en cours de tour : la part du tour déjà écoulée est gardée. */
export function retime(clock, speed, now) {
  advance(clock, now);
  const ratio = clock.durationMs ? clock.elapsed / clock.durationMs : 0;
  clock.speed = speed; clock.durationMs = turnDurationMs(clock.nationIds.length, speed); clock.elapsed = Math.round(ratio * clock.durationMs);
  return clock;
}
/** Ce que montre le bandeau : nation en cours, avancement de sa séquence et du tour, temps restant. */
export function clockView(clock) {
  const n = clock.nationIds.length, segment = clock.durationMs / n;
  const index = Math.min(n - 1, Math.floor(clock.elapsed / segment));
  return {
    index, nationId: clock.nationIds[index], segmentProgress: Math.min(1, (clock.elapsed - index * segment) / segment),
    progress: Math.min(1, clock.elapsed / clock.durationMs), remainingMs: Math.max(0, clock.durationMs - clock.elapsed),
    paused: isPaused(clock), manual: clock.manual, holds: [...clock.holds], done: clock.done
  };
}
/**
 * Prend le droit de résoudre le tour : vrai UNE seule fois par horloge. La fin de l'horloge et « Passer » passent tous
 * les deux par ici : toucher « Passer » au moment où l'horloge finit ne résout pas deux tours.
 */
export function claimResolution(clock) { if (clock.done) return false; clock.done = true; return true; }
/** À appeler à chaque battement : renvoie 'expired' une seule fois, quand l'horloge arrive au bout (hors pause). */
export function tick(clock, now) {
  advance(clock, now);
  if (clock.done || isPaused(clock) || clock.elapsed < clock.durationMs) return null;
  return claimResolution(clock) ? 'expired' : null;
}

/**
 * Verrou de la résolution d'un tour (classique comme en direct) : une seule suite « résolution + fenêtres » à la fois.
 * `tryStart()` vrai une seule fois tant que `finish()` n'a pas été appelé.
 */
export function createTurnGate() {
  let busy = false;
  return { get busy() { return busy; }, tryStart() { if (busy) return false; busy = true; return true; }, finish() { busy = false; } };
}
