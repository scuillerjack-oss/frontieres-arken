// V12 — Atouts du joueur humain (modèle économique, docs/V12-cahier-des-charges.md §3).
// Module PUR : aucun DOM, aucun hasard, aucune date. Les niveaux d'atouts viennent du profil du joueur
// (src/domain/profile.js) et sont INJECTÉS dans la partie par l'interface, à la création ou au chargement
// (`setPlayerBonuses`). Le moteur lit `state.bonuses[playerNationId]` ; les nations IA n'en ont jamais.
//
// Règle d'or : un atout est un pourcentage sur une mécanique de jeu (revenus, recrues, chantiers, forts, marine).
// Aucun atout ne donne directement de l'or ni des troupes.
//
// Les petits pourcentages ne doivent pas disparaître dans les arrondis (+3 % de 16 or = 0,48 or) : le surplus
// fractionnaire est cumulé, en centièmes, dans `state.boostCredit[nation][clé]` et versé dès qu'il fait une unité
// entière. Sur la durée, le gain est donc exactement de +N %.
//
// V15.3 : le bonus de nation (RULES.nationBonus, pour toutes les nations, IA comprises) passe par les mêmes mécaniques et
// s'ajoute à l'atout. `bonusPct` reste l'atout seul (joueur humain) ; le moteur lit `effectPct`. Pas de bonus dans le tutoriel.
import { RULES } from './constants.js';
import { aiGoldPct } from './difficulty.js';

export const BOOST_KEYS = Object.freeze(['gold', 'recruit', 'build', 'fort', 'naval']);
export const BOOST_MAX_LEVEL = 10;
export const BOOST_STEP_PCT = 1; // +1 % par niveau
export const BOOST_COST_TOKENS = 1; // coût FIXE : 1 jeton par niveau (choix de Jack)

const int = n => Math.max(0, Math.floor(Number(n) || 0));
export const emptyLevels = () => Object.fromEntries(BOOST_KEYS.map(k => [k, 0]));
/** Niveaux bornés 0..10, clés inconnues ignorées. */
export function sanitizeLevels(levels = {}) {
  return Object.fromEntries(BOOST_KEYS.map(k => [k, Math.min(BOOST_MAX_LEVEL, int(levels?.[k]))]));
}

/** Injecte les niveaux d'atouts du profil dans la partie, pour le SEUL joueur humain. Renvoie l'état. */
export function setPlayerBonuses(state, levels) {
  if (!state) return state;
  state.bonuses = { [state.playerNationId]: sanitizeLevels(levels) };
  state.boostCredit = state.boostCredit && typeof state.boostCredit === 'object' ? state.boostCredit : {};
  return state;
}

/** Pourcentage d'un atout pour une nation : 0 pour toute nation qui n'est pas le joueur humain. */
export function bonusPct(state, nationId, key) {
  if (!state || nationId == null || nationId !== state.playerNationId) return 0;
  if (state.controllers && state.controllers[nationId] !== 'human') return 0;
  return Math.min(BOOST_MAX_LEVEL, int(state.bonuses?.[nationId]?.[key])) * BOOST_STEP_PCT;
}

/** V15.3 : bonus de nation, en %. */
export const nationBonusPct = (state, nationId, key) => state?.tutorialMode ? 0 : int(RULES.nationBonus[nationId]?.[key]);
/** V15.3 : effet total sur une mécanique = atout du joueur + bonus de la nation. */
export const effectPct = (state, nationId, key) => bonusPct(state, nationId, key) + nationBonusPct(state, nationId, key);

function creditOf(state, nationId) {
  state.boostCredit ||= {};
  return (state.boostCredit[nationId] ||= {});
}
/** Ajoute `hundredths` centièmes au crédit `key` et renvoie le nombre d'unités entières à verser. */
function addCredit(state, nationId, key, hundredths) {
  const c = creditOf(state, nationId);
  c[key] = int(c[key]) + int(hundredths);
  const whole = Math.floor(c[key] / 100);
  c[key] -= whole * 100;
  return whole;
}

/** Or : surplus de revenu du tour (à ajouter au revenu de base). Met à jour le crédit. */
export function goldBonus(state, nationId, baseIncome) {
  // V15.3 : Difficile peut ajouter un bonus d'or aux IA (annoncé au joueur, jamais à l'humain).
  const pct = effectPct(state, nationId, 'gold') + (state.controllers?.[nationId] === 'ai' ? aiGoldPct(state) : 0);
  if (!pct || baseIncome <= 0) return 0;
  return addCredit(state, nationId, 'gold', int(baseIncome) * pct);
}

/** Recrutement : nombre de fantassins réellement livrés pour `amount` commandés (sans modifier l'état). */
export function recruitPreview(state, nationId, type, amount) {
  const pct = type === 'infantry' ? effectPct(state, nationId, 'recruit') : 0;
  if (!pct) return int(amount);
  const c = int(state.boostCredit?.[nationId]?.recruit);
  return int(amount) + Math.floor((c + int(amount) * pct) / 100);
}
/** Recrutement : idem, en consommant le crédit (appelé par le moteur quand l'ordre est passé). */
export function recruitAmount(state, nationId, type, amount) {
  const pct = type === 'infantry' ? effectPct(state, nationId, 'recruit') : 0;
  if (!pct) return int(amount);
  return int(amount) + addCredit(state, nationId, 'recruit', int(amount) * pct);
}

/** Construction : tours de chantier gagnés ce tour pour `activeSites` chantiers en cours (+N % de vitesse). */
export function buildTurnsGained(state, nationId, activeSites) {
  const pct = effectPct(state, nationId, 'build');
  if (!pct || !activeSites) return 0;
  return addCredit(state, nationId, 'build', int(activeSites) * pct);
}

/** Forteresse : multiplicateur supplémentaire du facteur de fort (défenseur joueur, fort construit). */
export const fortBonusFactor = (state, nationId) => 1 + effectPct(state, nationId, 'fort') / 100;
/** Marine : multiplicateur des dégâts des navires de guerre du joueur. */
export const navalBonusFactor = (state, nationId) => 1 + effectPct(state, nationId, 'naval') / 100;
