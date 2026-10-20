// V13 — Vision (brouillard de guerre). Remplace le ballon d'observation. Règles : docs/V13-vision.md.
// Module PUR (aucun DOM, aucun hasard) : utilisé par l'interface (fiche de province, carte, journal) ET par l'IA,
// qui joue avec exactement le même brouillard que le joueur.
//
//   1. Une nation voit les provinces qu'elle possède.
//   2. Une province où elle a AU MOINS UNE TROUPE (unité terrestre) révèle ses voisines PAR VOIE TERRESTRE
//      (map.provinces[].landConnections) : jamais par la mer, jamais au-delà d'une province.
//   3. Les alliés (traité 'alliance' actif) partagent leur vision : règles 1 et 2 appliquées à chacun d'eux.
//   4. Province visible : propriétaire, bâtiments et troupes. Province non visible : propriétaire et bâtiments
//      (la carte politique reste connue), troupes inconnues.
//   5. Forteresse (fort >= 1) d'une nation qui n'est ni soi ni un allié : troupes cachées même si la province est
//      visible (« troupes retranchées »), bâtiments visibles.
import { RULES, LAND_UNIT_TYPES } from './constants.js';
import { provinceForce, normalizeForce, combatValue, regimentStats, mergeForce, legacyForce } from './combat.js';
import { navalBonusFactor } from './boosts.js';

const allied = (state, a, b) => (state.diplomacy?.treaties || []).some(t => t.active !== false && t.type === 'alliance' && t.parties?.includes(a) && t.parties?.includes(b));
const hasLandTroops = p => LAND_UNIT_TYPES.some(k => (p?.units?.[k] || 0) > 0);

/** Nations dont la vision est partagée avec `nationId` : elle-même et ses alliés (traité 'alliance' actif). */
export function visionSharers(state, nationId) {
  const out = new Set(nationId ? [nationId] : []);
  for (const id of Object.keys(state.nations || {})) if (id !== nationId && allied(state, nationId, id)) out.add(id);
  return out;
}

/** Ensemble des identifiants de provinces visibles par `nationId` (vision des alliés comprise). */
export function visibleProvinces(state, map, nationId) {
  const sharers = visionSharers(state, nationId), out = new Set();
  for (const d of map.provinces) {
    const p = state.provinces[d.id];
    if (!p || !sharers.has(p.ownerId)) continue;
    out.add(d.id);
    // V13.4 : des troupes alliées stationnées (droit de passage) révèlent aussi les voisines.
    const guests = (state.stationed || []).some(e => e.provinceId === d.id && sharers.has(e.nationId) && hasLandTroops(e));
    if (hasLandTroops(p) || guests) for (const n of d.landConnections || []) if (state.provinces[n]) out.add(n);
  }
  return out;
}

/**
 * Ce que `nationId` sait d'une province.
 * @returns {{ provinceId, ownerId, buildings, visible:boolean, friendly:boolean, entrenched:boolean, troopsKnown:boolean,
 *             units:object|null, warships:number|null, force:object|null, regiment:{hp,maxHp,damage,wounded}|null }}
 *   entrenched : province visible mais troupes cachées par une forteresse ennemie.
 *   units / warships / force / regiment : null quand les troupes ne sont pas connues.
 * `visible` (facultatif) : ensemble déjà calculé par visibleProvinces (évite de le recalculer en boucle).
 */
export function provinceIntel(state, map, nationId, provinceId, visible = null) {
  const p = state.provinces[provinceId];
  if (!p) return null;
  const sharers = visionSharers(state, nationId), friendly = sharers.has(p.ownerId);
  const seen = friendly || (visible || visibleProvinces(state, map, nationId)).has(provinceId);
  const entrenched = seen && !friendly && (p.buildings?.fort || 0) >= 1;
  const troopsKnown = friendly || (seen && !entrenched);
  const force = troopsKnown ? provinceForce(p) : null;
  return {
    provinceId, ownerId: p.ownerId, buildings: { ...(p.buildings || {}) }, visible: seen, friendly, entrenched, troopsKnown,
    units: troopsKnown ? Object.fromEntries(LAND_UNIT_TYPES.map(k => [k, p.units?.[k] || 0])) : null,
    warships: troopsKnown ? (p.warships || 0) : null,
    force,
    regiment: troopsKnown ? regimentStats(force, { warshipFactor: navalBonusFactor(state, p.ownerId) }) : null
  };
}

/** Les troupes de cette province sont-elles connues de `nationId` ? */
export const troopsKnownTo = (state, map, nationId, provinceId, visible = null) => Boolean(provinceIntel(state, map, nationId, provinceId, visible)?.troopsKnown);

/**
 * Estimation PRUDENTE d'une garnison dont les troupes sont inconnues, à partir de ce qui est public uniquement :
 * capitale ou non, port construit, tour de jeu (RULES.vision). Ne lit jamais l'effectif réel.
 */
export function prudentEstimate(state, provinceId) {
  const v = RULES.vision, p = state.provinces[provinceId];
  const capital = Object.values(state.nations || {}).some(n => n.capitalId === provinceId);
  const growth = 1 + v.growthPerTurn * Math.max(0, (Number(state.turn) || 1) - 1);
  const base = capital ? v.capitalEstimate : v.provinceEstimate;
  const units = Object.fromEntries(Object.entries(base).map(([k, n]) => [k, Math.ceil(n * growth)]));
  if (p?.buildings?.port) units.warship = Math.ceil(v.portWarshipsEstimate * growth);
  return normalizeForce({ units });
}

/** Force d'une province telle que `nationId` la connaît : réelle si visible, sinon estimation prudente. */
export function perceivedForce(state, map, nationId, provinceId, visible = null) {
  const intel = provinceIntel(state, map, nationId, provinceId, visible);
  if (!intel) return normalizeForce({});
  if (!intel.troopsKnown) return prudentEstimate(state, provinceId);
  // V13.4 : des renforts alliés stationnés défendent aussi la province (droit de passage) : ils comptent.
  let f = intel.force;
  for (const e of state.stationed || []) if (e.provinceId === provinceId) f = mergeForce(f, legacyForce(e)); // y compris les siens
  return f;
}

/** Puissance d'une nation telle que `viewer` la perçoit (somme des garnisons vues ou estimées ; convois en mer ignorés). */
export function perceivedStrength(state, map, viewer, target, visible = null) {
  if (viewer === target) return Object.keys(state.provinces).filter(id => state.provinces[id].ownerId === target).reduce((n, id) => n + combatValue(provinceForce(state.provinces[id])), 0);
  const seen = visible || visibleProvinces(state, map, viewer);
  return Object.keys(state.provinces).filter(id => state.provinces[id].ownerId === target).reduce((n, id) => n + combatValue(perceivedForce(state, map, viewer, id, seen)), 0);
}
