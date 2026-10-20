// V13.4 — retours de bêta de Jack (20/10/2026). Fonctions pures, sans DOM : testables sous Node.
//  1. Alliance = passage libre : textes affichés.
//  2. Forteresse : bonus en % lus dans le moteur (RULES.fortDefense + atout « fort »), jamais recopiés à la main.
//  3. Mini tutoriel de la première partie : étapes, progression, mémoire « déjà vu » dans une clé DÉDIÉE
//     (`frontieres-arken-mini-tuto`), distincte de la clé de sauvegarde de partie (SAVE_KEY, jamais touchée).
import { fortReductionPct, FORT_MAX_LEVEL } from '../domain/combat.js';
import { fortBonusFactor } from '../domain/boosts.js';
import { hasPassage, PASSAGE_TEXT } from '../domain/passage.js';

// --- 1. Passage entre alliés -----------------------------------------------------------------------------------
export { PASSAGE_TEXT };
/** Puce de la fiche d'une province alliée, ou '' : « Alliance : passage libre dans vos territoires ». */
export function passageChip(state, nationId, owner) {
  return hasPassage(state, nationId, owner) ? `🤝 ${PASSAGE_TEXT} : vos troupes peuvent y aller, y rester et la défendre` : '';
}

// --- 2. Forteresse ---------------------------------------------------------------------------------------------
/**
 * Ce que la forteresse d'une province apporte, en chiffres réels (niveau construit, atout du propriétaire compris).
 * @returns {{ level, max, pct, nextPct, text }} pct = −X % de dégâts reçus par la garnison en défense.
 */
export function fortInfo(state, provinceId) {
  const p = state.provinces?.[provinceId], level = p?.buildings?.fort || 0, max = FORT_MAX_LEVEL();
  const bonus = fortBonusFactor(state, p?.ownerId);
  const pct = fortReductionPct(level, bonus), nextPct = level < max ? fortReductionPct(level + 1, bonus) : null;
  const text = level ? `▣ Forteresse niveau ${level} : −${pct} % de dégâts reçus par la garnison en défense` : '';
  return { level, max, pct, nextPct, text };
}
/** Ligne du menu Construction pour la forteresse (niveau suivant, ou niveau maximal). */
export function fortBuildText(state, provinceId) {
  const f = fortInfo(state, provinceId);
  if (f.level >= f.max) return `défense : −${f.pct} % de dégâts reçus (niveau maximal)`;
  return `niveau ${f.level + 1} : −${f.nextPct} % de dégâts reçus en défense${f.level ? ` (aujourd’hui −${f.pct} %)` : ''} · ne rapporte rien`;
}
/** Avertissement avant une attaque contre une province fortifiée ('' sans forteresse). */
export function fortAttackWarning(state, provinceId) {
  const f = fortInfo(state, provinceId);
  return f.level ? `▣ Forteresse niveau ${f.level} : ses défenseurs reçoivent −${f.pct} % de dégâts.` : '';
}

// --- 3. Mini tutoriel ------------------------------------------------------------------------------------------
export const MINI_TUTO_KEY = 'frontieres-arken-mini-tuto';
/**
 * Étapes (6) : chacune avance quand le joueur fait VRAIMENT le geste (`on` = événement de l'interface).
 * Événements : 'own-province' (fiche d'une de ses provinces), 'recruit' (recrutement ajouté), 'move' (ordre de
 * déplacement ajouté), 'diplomacy' (fenêtre Diplomatie ouverte), 'end-turn' (tour résolu), 'ok' (bouton Compris).
 */
export const MINI_TUTO_STEPS = Object.freeze([
  { id: 'select', title: '1/6 · Votre royaume', text: 'Touchez une de vos provinces (entourée de bleu) pour ouvrir sa fiche.', on: 'own-province' },
  { id: 'recruit', title: '2/6 · Recruter', text: 'Touchez « Recruter », ajoutez un lot avec + puis validez.', on: 'recruit' },
  { id: 'move', title: '3/6 · Déplacer', text: 'Sur la fiche, touchez « Déplacer / Attaquer », puis une province verte, et ajoutez l’ordre.', on: 'move' },
  { id: 'diplomacy', title: '4/6 · Diplomatie', text: 'Touchez une province étrangère puis « Diplomatie ». Une alliance donne le passage libre chez l’allié pour l’aider.', on: 'diplomacy' },
  { id: 'end-turn', title: '5/6 · Fin du tour', text: 'Touchez « Fin du tour » puis « Verrouiller et résoudre » : tous les ordres se jouent en même temps.', on: 'end-turn' },
  { id: 'done', title: '6/6 · À vous de jouer !', text: 'Le journal résume le tour. Pour revoir ce tuto : ⚙ Paramètres → « Relancer le mini tuto ».', on: 'ok' }
]);
const safeGet = (storage, key) => { try { return storage?.getItem(key) ?? null; } catch { return null; } };
const safeSet = (storage, key, value) => { try { storage?.setItem(key, value); return true; } catch { return false; } };
const safeDel = (storage, key) => { try { storage?.removeItem(key); } catch { /* stockage indisponible */ } };
/** Le mini tuto a-t-il déjà été vu (terminé ou passé) sur cet appareil ? */
export const miniTutoSeen = (storage = globalThis.localStorage) => safeGet(storage, MINI_TUTO_KEY) === 'vu';
/** À afficher au début d'une NOUVELLE partie seulement si jamais vu. */
export const shouldStartMiniTuto = (storage = globalThis.localStorage) => !miniTutoSeen(storage);
/** Terminé ou « Passer » : ne se réaffiche plus. */
export const markMiniTutoSeen = (storage = globalThis.localStorage) => safeSet(storage, MINI_TUTO_KEY, 'vu');
/** Réglages → « Relancer le mini tuto ». */
export const resetMiniTuto = (storage = globalThis.localStorage) => safeDel(storage, MINI_TUTO_KEY);
/** Étape suivante après l'événement `event` (index inchangé si l'événement ne concerne pas l'étape ; null = fini). */
export function miniTutoAdvance(index, event) {
  const step = MINI_TUTO_STEPS[index];
  if (!step) return null;
  if (step.on !== event) return index;
  return index + 1 < MINI_TUTO_STEPS.length ? index + 1 : null;
}
