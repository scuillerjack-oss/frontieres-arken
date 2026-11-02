// V15.3 — Niveaux de difficulté, choisis au début de la partie et stockés dans `state.difficulty`.
// Module pur. Normal est la référence : aucun réglage, mêmes règles pour tous, sans triche. Facile et Difficile ne changent que les
// décisions des dirigeants IA (marges, nombre d'attaques, dépenses). Le seul avantage matériel possible est `aiGoldPct`, et le jeu l'annonce.
// Les atouts et les jetons du joueur sont les mêmes à tous les niveaux : aucun niveau n'en donne plus, aucun ne les retire.
import { RULES } from './constants.js';

export const DIFFICULTY_IDS = Object.freeze(['facile', 'normal', 'difficile']);
export const DEFAULT_DIFFICULTY = 'normal';
export const sanitizeDifficulty = id => DIFFICULTY_IDS.includes(id) ? id : DEFAULT_DIFFICULTY;
export const difficultyOf = state => sanitizeDifficulty(state?.difficulty);
const NEUTRAL = Object.freeze({ marginAdd: 0, oneAttack: false, warDelay: 0, ambition: true, spendLots: 0, aiGoldPct: 0 });
/** Réglages du niveau de cette partie (RULES.difficulty ; Normal : aucun). */
export const levelOf = state => ({ ...NEUTRAL, ...RULES.difficulty[difficultyOf(state)] });
export const aiGoldPct = state => state?.tutorialMode ? 0 : levelOf(state).aiGoldPct;

const LABELS = Object.freeze({ facile: 'Facile', normal: 'Normal', difficile: 'Difficile' });
export const difficultyLabel = id => LABELS[sanitizeDifficulty(id)];
/** Texte du choix du niveau. Tout avantage donné aux IA y est écrit noir sur blanc. */
export function difficultyText(id) {
  const pct = { ...NEUTRAL, ...RULES.difficulty[sanitizeDifficulty(id)] }.aiGoldPct;
  return { facile: 'Les IA attaquent plus tard, moins souvent et prennent moins de risques.',
    normal: 'Mêmes règles pour tous, sans triche.',
    difficile: `Les IA dépensent mieux et prennent plus de risques.${pct ? ` Elles reçoivent aussi +${pct} % d’or : c’est un avantage réel, annoncé ici.` : ' Sans aucun bonus : mêmes règles pour tous.'}` }[sanitizeDifficulty(id)];
}
