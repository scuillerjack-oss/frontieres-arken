// V17.7 — Compteur de MINUTES DE JEU pour les pubs du temps réel (docs/V17-cahier-des-charges.md §10). Module PUR : aucun
// DOM, aucune minuterie, aucun stockage, aucun Math.random : l'heure et l'état du jeu sont toujours fournis.
//
// Minutes de jeu = temps réel pendant lequel l'horloge des jours TOURNE (pauses, menus hors jeu, pub en cours et appli en
// arrière-plan exclus). En ×2 (Premium), une minute reste une minute.
//
// - Pub récompensée (🎁) : disponible 5 à 10 min de jeu après la précédente (tirage à graine), elle reste disponible tant
//   que le joueur ne l'a pas touchée. Récompense = un mois de revenus (revenu par tour ÷ 2, arrondi au multiple de 5
//   supérieur, au moins 10 or). La regarder remet à zéro le compteur de pub imposée.
// - Pub imposée : au plus une toutes les 10 min de jeu, et seulement à un MOMENT CALME (pause, menu hors jeu, retour au
//   menu, retour dans le jeu). Jamais pendant une action, jamais dans le tutoriel, jamais pour un Premium, jamais après
//   un refus (pub récompensée fermée avant la fin) jusqu'au prochain lancement.
import { RULES } from '../domain/constants.js';

const A = RULES.realtime.ads;
export const MINUTE_MS = 60000;
export const FORCED_EVERY_MS = A.forcedEveryMinutes * MINUTE_MS;
export const REWARDED_MIN_MS = A.rewardedMinMinutes * MINUTE_MS;
export const REWARDED_MAX_MS = A.rewardedMaxMinutes * MINUTE_MS;
/** Moments calmes reconnus : ⏸, ouverture d'un menu hors jeu, retour à l'accueil, retour dans le jeu. */
export const CALM_MOMENTS = Object.freeze(['pause', 'menu', 'home', 'return']);

// Petit hachage déterministe (FNV-1a) : même graine => mêmes délais.
function hash(text) {
  let h = 2166136261;
  for (const c of String(text)) { h ^= c.codePointAt(0); h = Math.imul(h, 16777619) >>> 0; }
  return h >>> 0;
}
/** Délai (ms de jeu) avant la n-ième icône 🎁 : entre 5 et 10 min, à la seconde près. */
export function giftDelayMs(seed, n) {
  const span = (REWARDED_MAX_MS - REWARDED_MIN_MS) / 1000;
  return REWARDED_MIN_MS + (hash(`${seed}|cadeau|${n}`) % (span + 1)) * 1000;
}

const num = v => Number.isFinite(Number(v)) ? Math.max(0, Number(v)) : 0;
/** Nouveau compteur (début de session). `playMs` : minutes déjà jouées (reprise d'un compteur enregistré). */
export function createAdTimer({ seed = 'arken', now = 0 } = {}) {
  return { seed: String(seed), playMs: 0, lastNow: now, running: false, gifts: 0, giftAtMs: giftDelayMs(seed, 0), lastForcedMs: 0, forced: 0 };
}
/** Compteur relu (téléphone) : tout champ invalide est remplacé ; l'heure repart de `now`, le temps arrêté ne compte pas. */
export function restoreAdTimer(raw, { seed = 'arken', now = 0 } = {}) {
  const t = createAdTimer({ seed: raw?.seed || seed, now });
  if (!raw || typeof raw !== 'object') return t;
  t.playMs = num(raw.playMs); t.gifts = Math.floor(num(raw.gifts)); t.forced = Math.floor(num(raw.forced));
  t.giftAtMs = Number.isFinite(Number(raw.giftAtMs)) ? num(raw.giftAtMs) : t.playMs + giftDelayMs(t.seed, t.gifts);
  t.lastForcedMs = Math.min(num(raw.lastForcedMs), t.playMs);
  return t;
}
/** Ce qui se garde sur le téléphone (jamais dans la partie). */
export const adTimerSnapshot = t => ({ seed: t.seed, playMs: Math.round(t.playMs), gifts: t.gifts, giftAtMs: Math.round(t.giftAtMs), lastForcedMs: Math.round(t.lastForcedMs), forced: t.forced });

/**
 * Battement : ajoute le temps réel écoulé depuis le battement précédent SEULEMENT si l'horloge tournait pendant ce temps
 * (`running` = état de l'horloge pendant l'intervalle qui se termine). Plafonné à 5 s par battement : un téléphone gelé
 * ne fait pas gagner de minutes. `speedup` (réglage de test `?pub-test=N`) : N secondes de jeu par seconde réelle.
 */
export function tickAdTimer(t, { now, running, speedup = 1 }) {
  const elapsed = Math.max(0, num(now) - num(t.lastNow));
  if (t.running) t.playMs += Math.min(elapsed, 5000) * Math.max(1, num(speedup)); // speedup : réglage de test seulement
  t.lastNow = num(now); t.running = Boolean(running);
  return t;
}
export const playMinutes = t => t.playMs / MINUTE_MS;

/** Récompense de la pub 🎁 : un mois de revenus (revenu par tour ÷ 2), arrondi au multiple de 5 supérieur, 10 or minimum. */
export function rewardGold(incomePerTurn) {
  const month = num(incomePerTurn) / 2;
  return Math.max(A.rewardMinGold, Math.ceil(month / A.rewardRoundTo) * A.rewardRoundTo);
}

/** L'icône 🎁 est-elle à montrer ? Jamais dans le tutoriel ni partie finie ; disponible aussi pour les Premium (c'est un choix). */
export function giftAvailable(t, { tutorial = false, gameOver = false } = {}) {
  return !tutorial && !gameOver && t.playMs >= t.giftAtMs;
}
/** Minutes de jeu avant la prochaine icône (0 si elle est là). */
export const giftInMs = t => Math.max(0, t.giftAtMs - t.playMs);
/**
 * Pub 🎁 terminée. `rewarded` : vue en entier (récompense versée par l'interface) ; sinon fermée avant la fin. Dans les
 * deux cas l'icône disparaît et la suivante revient 5 à 10 min de jeu plus tard ; vue en entier, elle remet à zéro le
 * compteur de pub imposée (le joueur qui choisit ses pubs n'en subit pas d'autres).
 */
export function giftUsed(t, { rewarded }) {
  t.gifts++;
  t.giftAtMs = t.playMs + giftDelayMs(t.seed, t.gifts);
  if (rewarded) t.lastForcedMs = t.playMs;
  return t;
}

/**
 * Peut-on imposer une pub maintenant ? Renvoie { ok, reason }. `moment` : un des CALM_MOMENTS (sinon : pas un moment
 * calme). `action` : le joueur est en train d'agir (choix d'une destination, fenêtre de décision, fiche ou ordre en cours,
 * bataille du joueur en cours). `refused` : une pub a été refusée pendant ce lancement.
 */
export function forcedAdCheck(t, { moment = null, premium = false, tutorial = false, refused = false, action = false, gameOver = false } = {}) {
  if (premium) return { ok: false, reason: 'premium' };
  if (tutorial) return { ok: false, reason: 'tutorial' };
  if (refused) return { ok: false, reason: 'refused' };
  if (!CALM_MOMENTS.includes(moment)) return { ok: false, reason: 'not-calm' };
  if (action) return { ok: false, reason: 'action' };
  if (gameOver && moment !== 'home') return { ok: false, reason: 'game-over' };
  if (t.playMs - t.lastForcedMs < FORCED_EVERY_MS) return { ok: false, reason: 'too-soon' };
  return { ok: true, reason: '' };
}
/** Une pub imposée vient d'être montrée (ou tentée : pas de pub disponible = on n'insiste pas avant 10 min). */
export function forcedShown(t) { t.lastForcedMs = t.playMs; t.forced++; return t; }
