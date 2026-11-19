// V16.0 — banques +5, alliances publiques, navires de guerre contre les troupes en mer seulement.
// Cahier : docs/V16-cahier-des-charges.md (section V16.0).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { arkenV9Map as map } from '../src/map/arken-v9-map.js';
import { createGameState } from '../src/state/create-game-state.js';
import { RULES } from '../src/domain/constants.js';
import { resolveBattle, normalizeForce } from '../src/domain/combat.js';
import { resolveInterturn, setRelation, queueBombard, bombardStatus, bombardTargets, eventKnownToPlayer, journalEntry, incomeFor } from '../src/domain/game-engine.js';

const F = units => normalizeForce({ units });
const NATIONS = map.nations.map(n => n.id);

test('V16.0 : une banque rapporte +5 or par tour', () => {
  assert.equal(RULES.bankIncome, 5);
  const s = createGameState({ map, playerNationId: 'valmorne' });
  const before = incomeFor(s, 'valmorne');
  s.provinces.p02.buildings.bank = 1;
  assert.equal(incomeFor(s, 'valmorne'), before + 5);
});

test('V16.0 : à terre, un navire ne tire que sur les navires (troupes à terre intactes)', () => {
  const r = resolveBattle({ defender: F({ infantry: 300 }), attackers: [{ id: 'a', force: F({ warship: 5 }) }], passes: 1 });
  assert.equal(r.defenderHpLost, 0, 'aucun dégât sur des troupes à terre');
  const vs = resolveBattle({ defender: F({ infantry: 300, warship: 2 }), attackers: [{ id: 'a', force: F({ warship: 5 }) }], passes: 1 });
  assert.ok(vs.defenderHpLost > 0, 'les navires à quai sont visés');
  assert.equal(vs.defenderLossesByType.infantry, 0);
  // Navires en défense d'un port : ils ne touchent pas les troupes qui débarquent.
  const land = resolveBattle({ defender: F({ warship: 4 }), attackers: [{ id: 'a', mode: 'landing', force: F({ infantry: 200 }) }], passes: 1 });
  assert.equal(land.attackers[0].hpLost, 0);
});

test('V16.0 : en mer, les navires touchent les troupes embarquées (troupes dans l’eau)', () => {
  const r = resolveBattle({ defender: F({ infantry: 300 }), attackers: [{ id: 'a', force: F({ warship: 3 }) }], naval: true, passes: 1 });
  assert.ok(r.defenderHpLost > 0);
});

function island({ fort = 3 } = {}) {
  const s = createGameState({ map, playerNationId: 'valmorne', seed: 'v16-0' });
  for (const id of NATIONS) s.controllers[id] = 'human';
  setRelation(s, { nationId: 'valmorne', target: 'oroel', type: 'war' });
  s.provinces.p14.units = { infantry: 300, cavalry: 0, armor: 0, artillery: 0 }; s.provinces.p14.buildings.fort = fort;
  s.provinces.p03.buildings.port = 1; s.provinces.p03.warships = 4;
  return s;
}

test('V16.0 : le bombardement n’ouvre qu’une brèche dans les murs, sans blesser la garnison', () => {
  const s = island();
  assert.equal(queueBombard(s, map, { nationId: 'valmorne', fromId: 'p03', toId: 'p14', warships: 4 }).ok, true);
  resolveInterturn(s, map);
  assert.ok(s.fortBreach.p14.pct > 0, 'brèche ouverte');
  assert.equal(Object.values(s.provinces.p14.wounds).reduce((a, b) => a + b, 0), 0, 'garnison intacte');
  const e = s.events.find(x => x.type === 'bombardment');
  assert.doesNotMatch(journalEntry(e, map, 'oroel').text, /Garnison/);
});

test('V16.0 : sans forteresse en face, rien à bombarder', () => {
  const s = island({ fort: 0 });
  assert.deepEqual(bombardTargets(map, s, 'p03', 'valmorne'), []);
  const st = bombardStatus(map, s, { nationId: 'valmorne', fromId: 'p03' });
  assert.equal(st.ok, false);
  assert.match(st.reason, /forteresse/);
});

test('V16.0 : toute alliance conclue est connue de toutes les nations', () => {
  const s = createGameState({ map, playerNationId: 'valmorne' });
  const ev = { turn: 3, type: 'diplomatic-action', nationId: 'aurel', target: 'oroel', action: 'alliance', accepted: true, amount: 0 };
  assert.equal(eventKnownToPlayer(s, map, ev), true);
  assert.equal(eventKnownToPlayer(s, map, { ...ev, viaTalk: true }), true);
  assert.match(journalEntry(ev, map, 'valmorne').text, /🤝 Alliance conclue entre Aurel|🤝 Alliance conclue entre .+ et .+\./);
  // Un refus entre deux autres nations reste privé.
  assert.equal(eventKnownToPlayer(s, map, { ...ev, accepted: false }), false);
});
