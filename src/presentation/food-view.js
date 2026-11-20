// V17.4 — Textes de la nourriture (pur : aucun DOM). Le moteur compte en centièmes de vivre (src/domain/realtime/food.js) ;
// l'affichage arrondit au dixième, à la française (« 29,5 »).

import { RULES } from '../domain/constants.js';
import { farmCost, farmLevel, foodStatus, provinceFoodHundredths } from '../domain/game-engine.js';

const H = () => RULES.realtime.food.hundredths;
/** 2950 → « 29,5 » ; 90000 → « 900 » ; arrondi au dixième, sans zéro inutile. */
export function vivres(hundredths) {
  const tenths = Math.round((Number(hundredths) || 0) / (H() / 10)), sign = tenths < 0 ? '−' : '', a = Math.abs(tenths);
  const whole = Math.floor(a / 10), rest = a % 10;
  return `${sign}${String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')}${rest ? `,${rest}` : ''}`;
}
/** « +2,5 / jour », « −3 / jour », « ±0 / jour ». */
export const perDayText = perDay => `${perDay > 0 ? '+' : perDay < 0 ? '' : '±'}${vivres(perDay)} / jour`;

/** Barre du haut : réserve, « +N / jour », et l'état (normal, alerte, famine, grenier plein). */
export function foodHud(state, nationId) {
  const s = foodStatus(state, nationId);
  const tone = s.famine ? 'famine' : s.alert ? 'alert' : s.full ? 'full' : 'ok';
  const note = s.famine ? 'Famine : dégâts −30 %, 1 % de l’armée déserte chaque jour'
    : s.alert ? `Vivres : moins de ${RULES.realtime.food.alertDays} jours de réserve (${Math.floor(s.daysLeft)} j)`
    : s.full ? 'Grenier plein : le surplus est perdu' : `Production ${vivres(s.production)} · consommation ${vivres(s.consumption)}`;
  return { reserve: vivres(s.reserve), perDay: perDayText(s.perDay), tone, note,
    label: `Vivres : ${vivres(s.reserve)}, ${perDayText(s.perDay)}. ${note}` };
}
/** Ligne 🌾 de la fiche d'une de ses provinces : « 🌾 +18 vivres / jour · ferme niveau 1 ». Vide sur l'île ou au tour par tour. */
export function provinceFoodLine(state, provinceId) {
  if (state?.mode !== 'realtime' || provinceId === RULES.mysteryIsland.provinceId) return '';
  const p = state.provinces[provinceId], level = farmLevel(p);
  return `🌾 +${vivres(provinceFoodHundredths(state, provinceId))} vivres / jour${level ? ` · ferme niveau ${level}` : ''}`;
}
/** Carte « Ferme » de l'écran Construction : coût du prochain niveau, durée, gain. */
export function farmCardText(count) {
  const F = RULES.realtime.food, cost = farmCost(count);
  return { cost, days: F.farmDays, gain: `+${F.farmDaily} 🌾/jour`, max: F.farmMax,
    text: cost === null ? `niveau ${F.farmMax} sur ${F.farmMax}` : `${cost} or · ${F.farmDays} jours · +${F.farmDaily} vivres / jour` };
}
/** Messages des événements de nourriture du joueur (bandeaux / messages). */
export function foodEventText(e) {
  if (e.type === 'food-alert') return `🌾 Vivres : il reste moins de ${RULES.realtime.food.alertDays} jours de réserve. Construisez des fermes.`;
  if (e.type === 'famine-start') return '🌾 Famine ! Dégâts −30 % et désertions chaque jour tant que la nourriture manque.';
  if (e.type === 'famine-end') return '🌾 Les vivres sont revenus.';
  if (e.type === 'famine-desertion') {
    const names = { infantry: ['fantassin', 'fantassins'], cavalry: ['cavalier', 'cavaliers'], armor: ['blindé', 'blindés'], artillery: ['canon', 'canons'], warship: ['navire', 'navires'] };
    const parts = Object.entries(e.deserted || {}).filter(([, n]) => n > 0).map(([k, n]) => `${n} ${names[k]?.[n > 1 ? 1 : 0] || k}`);
    return `🌾 Famine : ${parts.join(', ')} ${parts.length > 1 || Object.values(e.deserted || {}).some(n => n > 1) ? 'ont' : 'a'} déserté`;
  }
  return '';
}
