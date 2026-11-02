// V15.3 — Bonus de chaque nation : les textes montrés au joueur. Les valeurs sont dans RULES.nationBonus, le moteur les lit dans boosts.js.
// Module pur. Le texte est calculé depuis RULES : il ne peut pas annoncer autre chose que ce que fait le moteur.
import { RULES } from './constants.js';

const TITLES = Object.freeze({ valmorne: 'Levées des bois', 'roc-epine': 'Murs de pierre', noireflamme: 'Forges noires', oroel: 'Marins du Nord', aurel: 'Comptoirs du Sud' });
const EFFECTS = Object.freeze({
  gold: pct => `+${pct} % d’or chaque tour`,
  recruit: pct => `+${pct} % d’infanterie recrutée`,
  build: pct => `Chantiers ${pct} % plus rapides`,
  fort: pct => `Forteresses ${pct} % plus solides`,
  naval: pct => `Navires de guerre ${pct} % plus puissants`
});
/** { title, text } du bonus de cette nation (les IA ont le même que le joueur), ou null. */
export function nationBonusInfo(id) {
  const [key, pct] = Object.entries(RULES.nationBonus[id] || {})[0] || [];
  return key ? { title: TITLES[id], text: EFFECTS[key](pct) } : null;
}
