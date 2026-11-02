// V15.4 — Longueur de la partie : 80 tours (référence) ou Partie courte de 40 tours. Module pur.
// La valeur vit dans `state.gameLength`, écrite SEULEMENT pour une partie courte : une partie de 80 tours garde exactement l'état
// de la V15.3, à l'octet près (preuve : tools/equilibre.mjs --empreintes --verifier=tools/empreintes-v15.3.json). Absente : 80 tours.
import { RULES } from './constants.js';

export const SHORT_GAME_LENGTH = 40;
export const DEFAULT_GAME_LENGTH = RULES.gameLength;
export const GAME_LENGTHS = Object.freeze([DEFAULT_GAME_LENGTH, SHORT_GAME_LENGTH]);
export const sanitizeGameLength = n => n === SHORT_GAME_LENGTH ? SHORT_GAME_LENGTH : DEFAULT_GAME_LENGTH;
export const gameLengthOf = state => sanitizeGameLength(state?.gameLength);
/** Un seuil exprimé en tours d'une partie de 80 tours, ramené à la longueur de cette partie. En 80 tours : le seuil tel quel. */
export const scaleTurn = (state, turn) => {
  const length = gameLengthOf(state);
  return length === DEFAULT_GAME_LENGTH ? turn : Math.round(turn * length / DEFAULT_GAME_LENGTH);
};
const LABELS = Object.freeze({ [DEFAULT_GAME_LENGTH]: `${DEFAULT_GAME_LENGTH} tours`, [SHORT_GAME_LENGTH]: `Courte · ${SHORT_GAME_LENGTH} tours` });
export const gameLengthLabel = n => LABELS[sanitizeGameLength(n)];
export function gameLengthText(n) {
  return sanitizeGameLength(n) === SHORT_GAME_LENGTH
    ? `Partie courte : mêmes règles, fin au tour ${SHORT_GAME_LENGTH}. Les dirigeants se pressent plus tôt.`
    : `Partie complète : fin au tour ${DEFAULT_GAME_LENGTH}.`;
}
