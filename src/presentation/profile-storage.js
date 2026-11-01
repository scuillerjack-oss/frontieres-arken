// V12 — Stockage du profil joueur (hors partie) dans localStorage, clé DÉDIÉE, distincte de la sauvegarde de partie.
// Toute lecture/écriture est protégée : navigation privée, stockage plein ou bloqué → le jeu continue avec un
// profil en mémoire. La logique (jetons, atouts, missions, achats) est dans src/domain/profile.js (pur).
import { decodeProfile, encodeProfile, createProfile, LEGACY_GAMES_STARTED } from '../domain/profile.js';
import { SAVE_KEY } from './v4-ux.js';

export const PROFILE_KEY = 'frontieres-arken-profil';

export function loadProfile(storage = globalThis.localStorage) {
  try {
    const text = storage?.getItem(PROFILE_KEY), profile = decodeProfile(text);
    // V14.4 : pas encore de profil mais déjà une partie sauvegardée (joueur d'avant la V12) : il a déjà joué.
    if (!text && storage?.getItem(SAVE_KEY)) profile.gamesStarted = LEGACY_GAMES_STARTED;
    return profile;
  } catch { return createProfile(); }
}
export function saveProfile(profile, storage = globalThis.localStorage) {
  try { storage?.setItem(PROFILE_KEY, encodeProfile(profile)); return true; } catch { return false; }
}
/** Date LOCALE du téléphone au format AAAA-MM-JJ (les missions changent à minuit, heure locale). */
export function todayLocal(now = new Date()) {
  const pad = n => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}
