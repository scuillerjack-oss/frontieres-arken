// V17.1 — Nouvelle partie en temps réel (docs/V17-cahier-des-charges.md §11) : l'état de départ du tour par tour
// (createGameState : mêmes nations, troupes, trésor, dirigeants, île mystérieuse) plus les champs du temps réel.
// Module pur. Schéma de sauvegarde 13 (REALTIME_SCHEMA_VERSION), même clé `frontieres-arken-v2-save`.

import { LAND_UNIT_TYPES, REALTIME_SCHEMA_VERSION, RULES, START_UNITS } from '../constants.js';
import { createGameState } from '../../state/create-game-state.js';
import { nextAiDays, periodOfDay } from './clock.js';
import { foodOf } from './food.js';

/**
 * V17.9b : troupes de départ du temps réel (RULES.realtime.start) : capitale, autres provinces, complément par nation.
 * L'île mystérieuse garde sa garnison (calculée sur START_UNITS). Sans réglage, état identique à createGameState.
 */
export function applyRealtimeStart(state, map) {
  const S = RULES.realtime.start || {};
  for (const def of map.provinces) {
    const p = state.provinces[def.id];
    if (!p || def.neutral || !p.ownerId) continue;
    const capital = state.nations[p.ownerId]?.capitalId === def.id;
    const base = (capital ? S.capital : S.province) || (capital ? START_UNITS.capital : START_UNITS.province);
    const extra = S.nation?.[p.ownerId]?.[def.id] || {};
    for (const k of LAND_UNIT_TYPES) p.units[k] = Math.max(0, Math.floor((base[k] || 0) + (extra[k] || 0)));
    for (const k of ['fort', 'farm']) if (extra[k]) p.buildings[k] = Math.max(p.buildings[k] || 0, Math.floor(extra[k]));
  }
  return state;
}
export function createRealtimeGame({ map, playerNationId, seed = 'arken-v0', difficulty, gameLength }) {
  const state = createGameState({ map, playerNationId, seed, difficulty, gameLength });
  state.mode = 'realtime';
  applyRealtimeStart(state, map);
  state.schemaVersion = REALTIME_SCHEMA_VERSION;
  state.day = 1;
  state.turn = periodOfDay(1);
  for (const n of Object.values(state.nations)) n.goldCarry = 0;  // report des revenus, en 1/60 d'or (§3.1)
  for (const id of Object.keys(state.nations)) foodOf(state, id);   // V17.4 : réserve de 900 vivres (en centièmes, §4.3)
  state.marches = []; state.marchSequence = 1;                    // armées en marche par la terre (§6)
  state.battles = [];                                              // batailles en cours (V17.2)
  state.bombardOrders = [];                                        // ordres de bombardement permanents (V17.2)
  state.nextAiDay = nextAiDays(state, 1);                          // prochaine décision de chaque nation (§7)
  state.endOffer = { peaceSince: null, nextOfferDay: null };       // paix générale (V17.8)
  state.rt = { periodEventStart: 0, chronicleIndex: 0, fought: {}, bombarded: {}, periodTalk: [], periodOrders: [], periodIncome: {} };
  for (const e of state.events) e.day = 1;
  return state;
}
