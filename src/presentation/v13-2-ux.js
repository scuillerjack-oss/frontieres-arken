// V13.2 — retours de bêta de Jack (18/10/2026). Fonctions pures, sans DOM : testables sous Node.
import { ceasefireChance, spendableTreasury } from '../domain/game-engine.js';
import { strengthOf } from '../domain/leaders.js';

export const CEASEFIRE_STEP = 10;
/**
 * Bornes du choix d'un cessez-le-feu : on peut exiger jusqu'au trésor adverse, ou payer jusqu'à ce qui reste
 * disponible. Mode suggéré : exiger si l'on domine nettement, sinon une paix sans or.
 */
export function ceasefireRange(state, from, target) {
  const maxDemand = Math.max(0, Math.floor(state.nations[target]?.treasury || 0));
  const maxPay = Math.max(0, Math.floor(spendableTreasury(state, from)));
  const sf = strengthOf(state, from), st = strengthOf(state, target), dominant = sf > 1.3 * st;
  const suggested = dominant && maxDemand >= CEASEFIRE_STEP
    ? { mode: 'demand', amount: Math.max(CEASEFIRE_STEP, Math.floor(maxDemand * .3 / CEASEFIRE_STEP) * CEASEFIRE_STEP) }
    : { mode: 'none', amount: 0 };
  return { maxDemand, maxPay, dominant, suggested };
}
/** Montant ramené dans les bornes du mode choisi (pas de 10, sauf le maximum exact). */
export function clampCeasefireAmount(range, mode, amount) {
  if (mode === 'none') return 0;
  const max = mode === 'demand' ? range.maxDemand : range.maxPay;
  return Math.max(0, Math.min(max, Math.floor(Number(amount) || 0)));
}
/** Chance estimée (en %) et une phrase courte, pour l'affichage. La personnalité adverse reste secrète. */
export function ceasefireEstimate(state, from, target, mode, amount) {
  const pay = mode === 'pay' ? amount : 0, demand = mode === 'demand' ? amount : 0;
  const pct = Math.round(ceasefireChance(state, from, target, { pay, demand }) * 100);
  const label = pct >= 70 ? 'très probable' : pct >= 45 ? 'possible' : pct >= 20 ? 'peu probable' : 'très peu probable';
  return { pct, label, pay, demand };
}
/** Ordre à transmettre au moteur. */
export const ceasefireOrder = (mode, amount) => mode === 'pay' ? { pay: amount, demand: 0 } : mode === 'demand' ? { pay: 0, demand: amount } : { pay: 0, demand: 0 };

/**
 * V13.2 : une province d'un allié ne peut pas être attaquée ; on l'indique AVANT la saisie des troupes (Jack :
 * « j'ai mis trop de temps à comprendre »). Renvoie l'allié concerné, ou null. Une rupture déjà ordonnée lève le blocage.
 */
export function allyBlockedTarget(state, nationId, provinceId) {
  const owner = state.provinces?.[provinceId]?.ownerId;
  if (!owner || owner === nationId) return null;
  const allied = (state.diplomacy?.treaties || []).some(t => t.active !== false && t.type === 'alliance' && t.parties?.includes(owner) && t.parties?.includes(nationId));
  if (!allied) return null;
  const breaking = (state.orders || []).some(o => o.kind === 'diplomacy' && o.action === 'break' && o.status === 'pending' && o.nationId === nationId && o.target === owner);
  return breaking ? null : owner;
}
