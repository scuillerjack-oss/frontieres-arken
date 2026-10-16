// V12 — Stockage du profil joueur (hors partie) dans localStorage, clé DÉDIÉE, distincte de la sauvegarde de partie.
// Toute lecture/écriture est protégée : navigation privée, stockage plein ou bloqué → le jeu continue avec un
// profil en mémoire. La logique (jetons, atouts, missions, achats) est dans src/domain/profile.js (pur).
import { decodeProfile, encodeProfile, createProfile } from '../domain/profile.js';

export const PROFILE_KEY = 'frontieres-arken-profil';

export function loadProfile(storage = globalThis.localStorage) {
  try { return decodeProfile(storage?.getItem(PROFILE_KEY)); } catch { return createProfile(); }
}
export function saveProfile(profile, storage = globalThis.localStorage) {
  try { storage?.setItem(PROFILE_KEY, encodeProfile(profile)); return true; } catch { return false; }
}
/** Date LOCALE du téléphone au format AAAA-MM-JJ (les missions changent à minuit, heure locale). */
export function todayLocal(now = new Date()) {
  const pad = n => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}
