// V14.4 — équipe gameplay. Fonctions pures (sans DOM) de l'interface du bombardement des forteresses côtières.
// Tous les chiffres sont lus dans le moteur (bombardPreview, RULES.bombard) : une règle qui change change l'écran.
import { RULES } from '../domain/constants.js';
import { bombardStatus, bombardPreview } from '../domain/game-engine.js';

const plural = (n, one, many = `${one}s`) => `${n} ${n > 1 ? many : one}`;

/** Le bouton « 💥 Bombarder » apparaît-il sur la fiche de `fromId` ? (navires libres face à une côte en guerre) */
export const canBombardFrom = (state, map, fromId, nationId = state.playerNationId) => bombardStatus(map, state, { nationId, fromId }).ok;

/** Ordres de bombardement en attente du joueur depuis `fromId`. */
export const pendingBombards = (state, fromId, nationId = state.playerNationId) =>
  (state.orders || []).filter(o => o.kind === 'bombard' && o.status === 'pending' && o.nationId === nationId && (!fromId || o.fromId === fromId));

/**
 * Ligne d'aperçu pour une cible : ce que `warships` navires feraient ce tour.
 * { protectionNow, protectionAfter, text, detail } — protection = part de la forteresse qui tient encore (%).
 */
export function bombardPreviewText(state, { fromId, toId, warships, nationId = state.playerNationId, name = id => id }) {
  const v = bombardPreview(state, { nationId, fromId, toId, warships });
  if (!v) return null;
  const garrison = `Garnison : environ ${v.garrisonHp} PV de blessures (aucun mort).`;
  if (!v.level) return { ...v, text: `${name(toId)} n’a pas de forteresse : le bombardement ne blesse que la garnison.`, detail: garrison };
  const capped = v.breachAfter - v.breachNow >= RULES.bombard.maxPerTurn ? ` (plafond : ${RULES.bombard.maxPerTurn} points par tour)` : '';
  return { ...v,
    text: `Protection restante de la forteresse : ${v.protectionNow} % → ${v.protectionAfter} % ce tour${capped}.`,
    detail: `Forteresse niveau ${v.level} : −${v.reductionNow} % → −${v.reductionAfter} % de dégâts reçus par la garnison (−${v.reductionFull} % intacte). ${garrison}` };
}

/** Rappel des règles affiché sous l'aperçu (explication de la commande, pas de conseil). */
export const BOMBARD_RULE_TEXT = () => `Vos navires restent à quai, réservés pour ce tour. Une attaque ou un débarquement qui arrive ce tour profite de la brèche. Sans bombardement, la forteresse se \
répare de ${RULES.bombard.repairPerTurn} points par tour. Une flotte ennemie au port se bat d’abord.`;

/** Puce de la fiche : ordre de bombardement prévu depuis cette province. */
export function pendingBombardChip(state, fromId, name = id => id) {
  return pendingBombards(state, fromId).map(o => ({ id: o.id, text: `💥 Bombardement prévu : ${name(o.toId)} (${plural(o.warships, 'navire')})` }));
}

/** Libellé de l'ordre dans le récapitulatif de fin de tour. */
export const bombardSummary = (o, name = id => id) => `Bombardement : ${name(o.fromId)} → ${name(o.toId)} (${plural(o.warships, 'navire')})`;
