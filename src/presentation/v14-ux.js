// V14.0 — fonctions pures (sans DOM) de l'interface, testables sous Node.
//  1. Trêve rompue puis rejouée : prévenir AVANT de rompre une trêve récente que ce sera une trahison.
import { truceBreakStatus, TRUCE_BETRAYAL_TURNS } from '../domain/game-engine.js';

export { TRUCE_BETRAYAL_TURNS };
const tours = n => `${n} tour${n > 1 ? 's' : ''}`;
/**
 * Avertissement à afficher avant une déclaration de guerre ou une attaque contre `target`, ou '' si rien à dire.
 * Trêve signée depuis moins de 10 tours : « ce sera une trahison » ; plus ancienne : simple rappel.
 */
export function truceWarning(state, nationId, target, short = 'cette nation') {
  const st = truceBreakStatus(state, nationId, target);
  if (st.betrayal) return `⚠ Trêve signée avec ${short} ${st.since > 0 ? `il y a ${tours(st.since)}` : 'ce tour-ci'} : la rompre maintenant est une TRAHISON que tout Arken verra (comme trahir un allié). Dans ${tours(st.left)}, ce ne sera plus une trahison.`;
  const truce = (state.diplomacy?.treaties || []).some(t => t.active !== false && t.type === 'ceasefire' && t.parties?.includes(nationId) && t.parties?.includes(target));
  return truce ? `Trêve en cours avec ${short} depuis plus de ${TRUCE_BETRAYAL_TURNS} tours : l’attaquer rompt la trêve (guerre), sans trahison.` : '';
}
