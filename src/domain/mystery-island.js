// V16.2 — L'île mystérieuse (docs/V16-cahier-des-charges.md, section V16.2). Module PUR : ni DOM, ni hasard, ni date.
//
// La petite île rocheuse au centre de la carte Leonardo : UNE province (`p21`), qui n'est pas une nation.
//   - Au départ : neutre (`ownerId: null`), garnison = RULES.mysteryIsland.garrisonFactor fois TOUTES les troupes d'une
//     nation en début de partie (même composition). Elle ne recrute jamais, ne bouge jamais, aucune IA ne la dirige.
//   - Ses troupes sont toujours visibles par tous (vision.js), quel que soit le propriétaire.
//   - Super banque : RULES.mysteryIsland.bankIncome or par tour au propriétaire (income.js) ; on n'y construit ni n'y
//     recrute rien (orders.js). La super banque ne se construit pas ailleurs et ne se détruit pas.
//   - 5 routes maritimes (une par nation), RULES.mysteryIsland.routeTurns tours chacune (sea-routes.js).
//   - Prise à deux : deux alliés qui débarquent le même tour la prennent ensemble (battles.js) : celui qui la prend
//     (règle de combat : le plus de PV restants) est le propriétaire, l'allié devient co-propriétaire (`coOwnerId`) :
//     banque partagée moitié-moitié, base commune (droit de passage V13.4). Alliance rompue → part perdue, troupes
//     rapatriées (settleStationed puis settleMysteryIsland). Une troisième nation qui la prend récupère tout.
//   - Classement de fin de partie : l'île compte comme une province pour son propriétaire (gameRanking, inchangé).
import { LAND_UNIT_TYPES, RULES, START_UNITS } from './constants.js';

const MI = RULES.mysteryIsland;
export const MYSTERY_ISLAND_ID = MI.provinceId;
export const MYSTERY_ISLAND_NAME = 'Île mystérieuse';
/** Nom donné à la garnison neutre dans les textes (journal, fiches). */
export const NEUTRAL_NAME = 'Garnison neutre';
/** Clé de la garnison neutre dans les tableaux par nation d'un combat (pertes, forces engagées, PV perdus). */
export const NEUTRAL_KEY = 'neutre';
export const isMysteryIsland = id => id === MYSTERY_ISLAND_ID;
/** La partie a-t-elle l'île (carte V9 Leonardo depuis la V16.2, ou ancienne partie complétée au chargement) ? */
export const hasMysteryIsland = state => Boolean(state?.provinces?.[MYSTERY_ISLAND_ID]);
export const islandOwner = state => state?.provinces?.[MYSTERY_ISLAND_ID]?.ownerId ?? null;
export const islandCoOwner = state => state?.provinces?.[MYSTERY_ISLAND_ID]?.coOwnerId ?? null;

/** Toutes les troupes d'une nation en début de partie (capitale + 3 provinces). */
export function nationStartUnits() {
  return Object.fromEntries(LAND_UNIT_TYPES.map(k => [k, (START_UNITS.capital[k] || 0) + 3 * (START_UNITS.province[k] || 0)]));
}
/** Garnison de départ de l'île : garrisonFactor × les troupes d'une nation, même composition (960 / 30 / 18 / 6). */
export function mysteryGarrison(base = nationStartUnits()) {
  return Object.fromEntries(LAND_UNIT_TYPES.map(k => [k, Math.round((Number(base[k]) || 0) * MI.garrisonFactor)]));
}
/** État de départ de la province (create-game-state.js, migration d'une ancienne partie). */
export function newMysteryProvince(base) {
  return {
    ownerId: null, coOwnerId: null,
    units: mysteryGarrison(base), warships: 0,
    wounds: Object.fromEntries([...LAND_UNIT_TYPES, 'warship'].map(k => [k, 0])),
    portSite: true,
    buildings: { bank: 0, factory: 0, fort: 0, port: 0 }
  };
}
/**
 * Ancienne partie (avant la V16.2, carte V9 Leonardo) : l'île est ajoutée, neutre, avec sa garnison de départ. Rien
 * d'autre ne change (aucune province, aucun trésor). Sans effet si l'île est déjà là ou si la carte est une autre.
 * Renvoie true si l'île a été ajoutée.
 */
export function ensureMysteryIsland(state) {
  if (!state?.provinces || state.mapId !== 'arken-v9-leonardo' || state.provinces[MYSTERY_ISLAND_ID]) return false;
  state.provinces[MYSTERY_ISLAND_ID] = newMysteryProvince();
  return true;
}

/** Or rapporté chaque tour par la super banque à `nationId` : tout (10), la moitié chacun avec un co-propriétaire (5), 0. */
export function islandBankShare(state, nationId) {
  const p = state?.provinces?.[MYSTERY_ISLAND_ID];
  if (!p || !nationId || !p.ownerId) return 0;
  const co = p.coOwnerId && p.coOwnerId !== p.ownerId ? p.coOwnerId : null;
  if (p.ownerId === nationId) return co ? Math.floor(MI.bankIncome / 2) : MI.bankIncome;
  return co === nationId ? MI.bankIncome - Math.floor(MI.bankIncome / 2) : 0;
}
/** `nationId` tient-il l'île (propriétaire ou co-propriétaire) ? */
export const holdsIsland = (state, nationId) => Boolean(nationId) && (islandOwner(state) === nationId || islandCoOwner(state) === nationId);

/**
 * Fin de chaque étape de l'inter-tour (après settleStationed) : le co-propriétaire perd sa part quand l'alliance avec le
 * propriétaire est rompue, quand l'une des deux nations est éliminée ou quand l'île change de main (celui qui la prend
 * fixe lui-même son éventuel co-propriétaire : battles.js). Ses troupes stationnées ont déjà été rapatriées
 * (settleStationed, règle V13.4). Événement public « mystery-coowner-lost ».
 */
export function settleMysteryIsland(state) {
  const p = state?.provinces?.[MYSTERY_ISLAND_ID];
  if (!p || !p.coOwnerId) return;
  const co = p.coOwnerId, owner = p.ownerId;
  const allied = (state.diplomacy?.treaties || []).some(t => t.active !== false && t.type === 'alliance' && t.parties?.includes(co) && t.parties?.includes(owner));
  if (owner && owner !== co && allied && !state.nations?.[co]?.eliminated && !state.nations?.[owner]?.eliminated) return;
  p.coOwnerId = null;
  state.events?.push({ turn: state.turn, type: 'mystery-coowner-lost', nationId: co, target: owner, provinceId: MYSTERY_ISLAND_ID,
    reason: state.nations?.[co]?.eliminated ? 'eliminated' : !owner || owner === co ? 'owner' : 'alliance' });
}
