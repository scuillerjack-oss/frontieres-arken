// V13.4 — retours de bêta de Jack (20/10/2026). Fonctions pures, sans DOM : testables sous Node.
//  1. Alliance = passage libre : textes affichés.
//  2. Forteresse : bonus en % lus dans le moteur (RULES.fortDefense + atout « fort »), jamais recopiés à la main.
//  3. (Mini tutoriel de la première partie : retiré en V17.9.)
import { fortReductionPct, FORT_MAX_LEVEL } from '../domain/combat.js';
import { fortBonusFactor } from '../domain/boosts.js';
import { hasPassage, PASSAGE_TEXT } from '../domain/passage.js';
import { fortBreach } from '../domain/game-engine.js'; // V14.4 : forteresse bombardée

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
  // V14.4 : bombardée — protection réelle de ce tour, et part qui tient encore.
  const breach = level ? fortBreach(state, provinceId) : 0, nowPct = fortReductionPct(level, bonus, breach);
  const text = !level ? '' : breach ? `▣ Forteresse niveau ${level} bombardée : −${nowPct} % de dégâts reçus (au lieu de −${pct} %), protection restante ${100 - breach} %`
    : `▣ Forteresse niveau ${level} : −${pct} % de dégâts reçus par la garnison en défense`;
  return { level, max, pct, nextPct, text, breach, nowPct };
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
  return !f.level ? '' : f.breach ? `▣ Forteresse niveau ${f.level} bombardée (protection restante ${100 - f.breach} %) : ses défenseurs reçoivent −${f.nowPct} % de dégâts.`
    : `▣ Forteresse niveau ${f.level} : ses défenseurs reçoivent −${f.pct} % de dégâts.`;
}

// --- 3. Mini tutoriel (V13.4) : retiré en V17.9, remplacé par le tutoriel du temps réel (src/presentation/tutorial.js).
