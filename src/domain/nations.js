// V15.3 — Bonus de chaque nation : les textes montrés au joueur. Les valeurs sont dans RULES.nationBonus, le moteur les lit dans boosts.js.
// Module pur. Le texte est calculé depuis RULES : il ne peut pas annoncer autre chose que ce que fait le moteur.
// V16 : textes dans src/i18n/{fr,en}/domain.js (nationBonus.*).
import { RULES } from './constants.js';
import { t } from '../i18n/i18n.js';

/** { title, text } du bonus de cette nation (les IA ont le même que le joueur), ou null. */
export function nationBonusInfo(id) {
  const [key, pct] = Object.entries(RULES.nationBonus[id] || {})[0] || [];
  return key ? { title: t(`nationBonus.title.${id}`), text: t(`nationBonus.effect.${key}`, { pct }) } : null;
}
