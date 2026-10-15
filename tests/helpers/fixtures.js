// Outils partagés des tests de verrouillage V6.0.2 (aucune modification du code du jeu).
import assert from 'node:assert/strict';
import { arkenV1Map } from '../../src/map/arken-v1-map.js';
import { createGameState } from '../../src/state/create-game-state.js';
import { LAND_UNIT_TYPES } from '../../src/domain/constants.js';
import { maxWoundsFor, COMBAT_TYPES } from '../../src/domain/combat.js';

export const map = arkenV1Map;
export const NATIONS = map.nations.map(n => n.id); // liste réellement utilisée par le jeu
export const PROVINCES = map.provinces.map(p => p.id);

/** Partie neuve. `allHuman` : aucune IA ne planifie (scénarios d'ordres contrôlés). `allAI` : IA contre IA. */
export function freshState({ player = 'valmorne', allHuman = false, allAI = false, seed } = {}) {
  const state = createGameState({ map, playerNationId: player, ...(seed ? { seed } : {}) });
  if (allHuman) for (const id of NATIONS) state.controllers[id] = 'human';
  if (allAI) for (const id of NATIONS) state.controllers[id] = 'ai';
  return state;
}

/** Générateur à graine (mulberry32) — utilisé uniquement dans les tests. */
export function seededRandom(seed = 42) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

function assertWounds(wounds, units, label) {
  assert.ok(wounds && typeof wounds === 'object', `${label} : champ absent`);
  for (const k of COMBAT_TYPES) {
    const w = wounds[k] ?? 0, n = units[k] || 0;
    assert.ok(Number.isInteger(w) && w >= 0, `${label} : ${k}=${w}`);
    assert.ok(w <= maxWoundsFor(k, n), `${label} : ${k} ${w} PV perdus pour ${n} unités`);
  }
}

/** Invariants qui doivent tenir après chaque inter-tour. */
export function assertInvariants(state, label = '') {
  const ctx = m => `${label} tour ${state.turn} : ${m}`;
  for (const id of PROVINCES) {
    const p = state.provinces[id];
    assert.ok(p, ctx(`province ${id} absente`));
    assert.ok(NATIONS.includes(p.ownerId), ctx(`propriétaire invalide ${id}=${p.ownerId}`));
    for (const k of LAND_UNIT_TYPES) {
      const n = p.units[k];
      assert.ok(Number.isInteger(n) && n >= 0, ctx(`unités ${id}.${k}=${n}`));
    }
    assert.ok(Number.isInteger(p.warships) && p.warships >= 0, ctx(`navires ${id}=${p.warships}`));
    for (const [b, n] of Object.entries(p.buildings)) assert.ok(Number.isInteger(n) && n >= 0, ctx(`bâtiment ${id}.${b}=${n}`));
    assert.ok((p.buildings.fort || 0) <= 3, ctx(`fort > 3 en ${id}`));
    // V10 : une banque, une usine, un port au plus par province.
    for (const b of ['bank', 'factory', 'port']) assert.ok((p.buildings[b] || 0) <= 1, ctx(`${b} > 1 en ${id}`));
    // V10 : PV / blessures cohérents (entiers >= 0, nuls sans unité, sous le plafond de blessures).
    assertWounds(p.wounds, { ...p.units, warship: p.warships }, ctx(`blessures ${id}`));
  }
  for (const [id, n] of Object.entries(state.nations)) if (n.eliminated)
    assert.ok(!Object.values(state.provinces).some(p => p.ownerId === id), ctx(`${id} éliminée mais possède une province`));
  for (const id of NATIONS) {
    const t = state.nations[id].treasury;
    assert.ok(Number.isFinite(t) && t >= 0, ctx(`trésor ${id}=${t}`));
  }
  for (const t of state.transports || []) {
    for (const k of LAND_UNIT_TYPES) assert.ok((t.units[k] || 0) >= 0, ctx('transport négatif'));
    assertWounds(t.wounds || {}, { ...t.units, warship: t.warships }, ctx('blessures transport'));
  }
  for (const w of state.diplomacy.wars) assert.ok(w.participants.every(x => NATIONS.includes(x)), ctx('guerre avec nation inconnue'));
  for (const t of state.diplomacy.treaties) assert.ok(t.parties.every(x => NATIONS.includes(x)), ctx('traité avec nation inconnue'));
  assert.equal(state.turnPhase, 'planning', ctx('phase'));
}
