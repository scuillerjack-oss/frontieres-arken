// V13.4 — Droit de passage entre alliés (retour de bêta de Jack, 20/10/2026 : « Passage dans territoire allié
// nécessaire pour aider si guerre. Et automatiquement affecté lors de la signature de l'alliance. »).
// Module PUR : aucun DOM, aucun hasard. Règles : docs/V13-cahier-des-charges.md, section V13.4.
//
// - Le droit de passage n'est PAS un accord séparé : il fait partie de l'alliance (signée → passage libre réciproque,
//   rompue → plus de passage). Il n'existe aucun autre accord de passage dans le jeu.
// - Avec le passage, une nation peut envoyer ses troupes dans une province de son allié (par la terre, ou par la mer
//   jusqu'au point de port allié), les y STATIONNER, les en faire repartir, et elles DÉFENDENT cette province.
// - Troupes stationnées : `state.stationed = [{ nationId, provinceId, units:{…}, warships, wounds:{…} }]`
//   (une entrée par nation et par province ; champ facultatif, absent des anciennes sauvegardes).
// - Alliance rompue, nation éliminée, province passée à une nation non alliée : les troupes stationnées sont
//   rapatriées dans la province la plus proche de leur nation (`settleStationed`), sinon perdues.
import { COMBAT_TYPES, normalizeForce, mergeForce, splitForce, provinceForce, writeProvinceForce, legacyForce, toLegacy, emptyForce } from './combat.js';

export const PASSAGE_TEXT = 'Alliance : passage libre dans vos territoires';

const allied = (state, a, b) => (state.diplomacy?.treaties || []).some(t => t.active !== false && t.type === 'alliance' && t.parties?.includes(a) && t.parties?.includes(b));
const hasUnits = force => COMBAT_TYPES.some(k => force.units[k] > 0);

/** `nationId` peut-il entrer dans les provinces de `owner` ? Oui seulement s'ils sont alliés (l'alliance inclut le passage). */
export const hasPassage = (state, nationId, owner) => Boolean(owner && nationId) && owner !== nationId && allied(state, nationId, owner);

/** Entrée de troupes stationnées de `nationId` dans `provinceId`, ou null. */
export function stationedAt(state, provinceId, nationId) {
  return (state.stationed || []).find(e => e.provinceId === provinceId && e.nationId === nationId && hasUnits(legacyForce(e))) || null;
}
/** Force stationnée (format combat), vide si aucune. */
export const stationedForce = (state, provinceId, nationId) => { const e = stationedAt(state, provinceId, nationId); return e ? legacyForce(e) : emptyForce(); };
/** Toutes les troupes stationnées dans une province (alliés de son propriétaire). */
export const guestsAt = (state, provinceId) => (state.stationed || []).filter(e => e.provinceId === provinceId && hasUnits(legacyForce(e)));
/** Toutes les troupes stationnées d'une nation. */
export const stationedOf = (state, nationId) => (state.stationed || []).filter(e => e.nationId === nationId && hasUnits(legacyForce(e)));

/** Remplace la force stationnée de `nationId` dans `provinceId` (entrée retirée si vide). */
export function setStationedForce(state, nationId, provinceId, force) {
  state.stationed ||= [];
  const f = normalizeForce(force), i = state.stationed.findIndex(e => e.provinceId === provinceId && e.nationId === nationId);
  if (!hasUnits(f)) { if (i >= 0) state.stationed.splice(i, 1); return; }
  const entry = { nationId, provinceId, ...toLegacy(f) };
  if (i >= 0) state.stationed[i] = entry; else state.stationed.push(entry);
}
/** Ajoute des troupes stationnées (renfort). */
export function addStationed(state, nationId, provinceId, force) {
  setStationedForce(state, nationId, provinceId, mergeForce(stationedForce(state, provinceId, nationId), force));
}
/** Prélève `counts` unités ({ infantry, …, warship }) parmi les troupes stationnées ; renvoie la force prélevée. */
export function takeStationed(state, nationId, provinceId, counts) {
  const { taken, rest } = splitForce(stationedForce(state, provinceId, nationId), counts);
  setStationedForce(state, nationId, provinceId, rest);
  return taken;
}
/** Garnison complète d'une province : troupes du propriétaire + troupes alliées stationnées. */
export function garrisonForce(state, provinceId) {
  let f = provinceForce(state.provinces[provinceId]);
  for (const g of guestsAt(state, provinceId)) f = mergeForce(f, legacyForce(g));
  return f;
}

/**
 * Remet de l'ordre dans les troupes stationnées (après une rupture d'alliance, une conquête ou une élimination) :
 *  - province redevenue la sienne : les troupes rejoignent la garnison ;
 *  - province d'un allié : elles restent ;
 *  - sinon (plus de passage) : rapatriement vers une province voisine à elle, sinon sa capitale, sinon sa première
 *    province ; à défaut, elles sont perdues. Un événement le dit au journal.
 */
export function settleStationed(state, map) {
  if (!state.stationed?.length) return;
  const keep = [];
  for (const e of [...state.stationed].sort((a, b) => a.provinceId.localeCompare(b.provinceId) || a.nationId.localeCompare(b.nationId))) {
    const force = legacyForce(e);
    if (!hasUnits(force)) continue;
    if (state.nations?.[e.nationId]?.eliminated) { state.events?.push({ turn: state.turn, type: 'stationed-lost', nationId: e.nationId, target: state.provinces[e.provinceId]?.ownerId, provinceId: e.provinceId, amount: COMBAT_TYPES.reduce((n, k) => n + force.units[k], 0), eliminated: true }); continue; }
    const p = state.provinces[e.provinceId], owner = p?.ownerId;
    if (owner === e.nationId) { writeProvinceForce(p, mergeForce(provinceForce(p), force)); continue; }
    if (hasPassage(state, e.nationId, owner)) { keep.push(e); continue; }
    const own = id => Boolean(id) && state.provinces[id]?.ownerId === e.nationId;
    const near = (map?.provinces?.find(d => d.id === e.provinceId)?.landConnections || []).filter(own).sort()[0];
    const capital = state.nations?.[e.nationId]?.capitalId;
    const home = near || (own(capital) ? capital : null) || Object.keys(state.provinces).sort().find(own) || null;
    const amount = COMBAT_TYPES.reduce((n, k) => n + force.units[k], 0);
    if (home) {
      writeProvinceForce(state.provinces[home], mergeForce(provinceForce(state.provinces[home]), force));
      state.events?.push({ turn: state.turn, type: 'stationed-recalled', nationId: e.nationId, target: owner, provinceId: e.provinceId, toId: home, amount });
    } else state.events?.push({ turn: state.turn, type: 'stationed-lost', nationId: e.nationId, target: owner, provinceId: e.provinceId, amount });
  }
  state.stationed = keep;
}
