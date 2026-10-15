import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState } from '../src/state/create-game-state.js';
import { SAVE_SCHEMA_VERSION } from '../src/domain/constants.js';
import { map, NATIONS, assertInvariants } from './helpers/fixtures.js';

const CAPITALS = { valmorne: 'p01', 'roc-epine': 'p05', noireflamme: 'p09', oroel: 'p13', aurel: 'p17' };

for (const player of NATIONS) {
  test(`nouvelle partie jouable avec ${player}`, () => {
    const s = createGameState({ map, playerNationId: player });
    assert.equal(s.schemaVersion, SAVE_SCHEMA_VERSION);
    assert.equal(s.mapId, map.id);
    assert.equal(s.turn, 1);
    assert.equal(s.turnPhase, 'planning');
    assert.equal(s.playerNationId, player);
    assert.equal(s.seed, 'arken-v0');
    for (const id of NATIONS) {
      assert.equal(s.controllers[id], id === player ? 'human' : 'ai');
      assert.deepEqual(s.nations[id], { treasury: 120, eliminated: false, capitalId: CAPITALS[id] });
    }
    // Traits IA attribués dans l'ordre de la carte aux 4 nations non jouées.
    const others = NATIONS.filter(id => id !== player);
    assert.deepEqual(s.ai.traits, Object.fromEntries(others.map((id, i) => [id, ['prudent', 'offensif', 'fidele', 'impulsif'][i]])));
    assert.equal(Object.keys(s.provinces).length, 20);
    for (const p of map.provinces) {
      const st = s.provinces[p.id], cap = CAPITALS[p.initialOwner] === p.id;
      assert.equal(st.ownerId, p.initialOwner);
      assert.deepEqual(st.units, cap ? { infantry: 200, cavalry: 10, armor: 6, artillery: 2, balloon: 1 } : { infantry: 40, cavalry: 0, armor: 0, artillery: 0, balloon: 0 });
      assert.equal(st.warships, 0);
      assert.deepEqual(st.buildings, { bank: 0, factory: 0, fort: 0, port: 0 });
      assert.equal(st.portSite, Boolean(p.port));
    }
    assertInvariants(s, player);
  });
}

test('nation inconnue refusée (dont les identifiants de NATION_IDS)', () => {
  assert.throws(() => createGameState({ map, playerNationId: 'arken' }), /invalid_player_nation/);
  assert.throws(() => createGameState({ map, playerNationId: 'nope' }), /invalid_player_nation/);
});

test('carte invalide refusée', () => {
  const bad = { ...map, provinces: map.provinces.slice(0, 19) };
  assert.throws(() => createGameState({ map: bad, playerNationId: 'valmorne' }), /invalid_map/);
});
