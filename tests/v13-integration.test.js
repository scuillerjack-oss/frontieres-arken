// V13 — corrections issues de la relecture indépendante (intégration des lots mer / vision / alliances).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { arkenV9Map as map } from '../src/map/arken-v9-map.js';
import { createGameState } from '../src/state/create-game-state.js';
import { resolveInterturn, respondToProposal, planAIOrders, journalEntry } from '../src/domain/game-engine.js';
import { helpDecision, queueHelpRequest, helpEnemies } from '../src/domain/alliances.js';
import { helpChoices } from '../src/presentation/v13-ux.js';
import { LAND_UNIT_TYPES } from '../src/domain/constants.js';

const NATIONS = map.nations.map(n => n.id);
function fresh(ai = {}) {
  const s = createGameState({ map, playerNationId: 'valmorne', seed: 'integration' });
  for (const id of NATIONS) s.controllers[id] = ai[id] ? 'ai' : 'human';
  s.controllers.valmorne = 'human';
  s.leaders = Object.fromEntries(Object.entries(ai).map(([id, archetype]) => [id, { archetype, revealed: false }]));
  return s;
}
const war = (s, a, b) => s.diplomacy.wars.push({ active: true, participants: [a, b], started: s.turn });
const ally = (s, a, b) => s.diplomacy.treaties.push({ active: true, type: 'alliance', parties: [a, b], started: s.turn });
const convoy = (s, extra = {}) => s.transports.push({ id: 'c99', nationId: 'oroel', fromId: 'p14', toId: 'p03', via: 'p03', lane: 'p03|p14', stage: 1, turns: 2,
  units: { infantry: 900, cavalry: 0, armor: 20, artillery: 0 }, warships: 0, wounds: { infantry: 0, cavalry: 0, armor: 0, artillery: 0, warship: 0 }, ...extra });

test('Bug relecture 1 : un cessez-le-feu accepté (Oui) arrête un débarquement déjà en mer — le convoi rentre', () => {
  const s = fresh();
  s.turn = 4; war(s, 'oroel', 'valmorne');
  convoy(s, { departed: 3 });
  s.diplomacy.proposals = [{ from: 'oroel', to: 'valmorne', action: 'ceasefire', turn: 4 }];
  assert.equal(respondToProposal(s, { from: 'oroel', accept: true }).ok, true);
  const start = s.events.length;
  resolveInterturn(s, map);
  const evs = s.events.slice(start);
  assert.equal(s.provinces.p03.ownerId, 'valmorne', 'Branvale n\'est pas prise');
  assert.ok(!evs.some(e => e.type === 'diplomacy' && e.action === 'war'), 'pas de guerre rouverte');
  assert.ok(!s.diplomacy.wars.some(w => w.active !== false && w.participants.includes('oroel') && w.participants.includes('valmorne')));
  const cancel = evs.find(e => e.type === 'attack-cancelled' && e.reason === 'ceasefire');
  assert.ok(cancel, 'débarquement annulé');
  assert.match(journalEntry(cancel, map, 'valmorne').text, /cessez-le-feu/);
  assert.ok(s.transports.some(t => t.nationId === 'oroel' && t.toId === 'p14' && t.returning), 'le convoi rentre à Nordhème');
});

test('Bug relecture 1 (suite) : un convoi parti PENDANT une trêve est une violation délibérée — il débarque', () => {
  const s = fresh();
  s.turn = 6;
  s.diplomacy.treaties.push({ active: true, type: 'ceasefire', parties: ['oroel', 'valmorne'], started: 3 });
  convoy(s, { departed: 5 });
  resolveInterturn(s, map);
  assert.equal(s.provinces.p03.ownerId, 'oroel', 'débarquement mené malgré la trêve');
});

test('Bug relecture 2 : « Attaque X avec moi » seulement contre une nation que l\'allié peut atteindre par l\'anneau', () => {
  const s = fresh({ oroel: 'conquerant' });
  ally(s, 'valmorne', 'oroel');
  // Oroël (nord-est) touche Valmorne et Noireflamme par la mer, jamais Aurel ni Roc-Épine.
  assert.deepEqual(helpChoices(s, map, 'oroel').attackTargets.map(n => n.id).sort(), ['noireflamme']);
  assert.equal(helpDecision(s, 'oroel', { from: 'valmorne', kind: 'attack', target: 'aurel' }, map).reason, 'out-of-reach');
  assert.equal(queueHelpRequest(s, { from: 'valmorne', to: 'oroel', kind: 'attack', target: 'aurel' }).ok, true);
  resolveInterturn(s, map);
  const answer = s.events.find(e => e.type === 'help-answer');
  assert.equal(answer.accepted, false, 'refus : hors de portée');
  assert.ok(!s.diplomacy.wars.some(w => w.participants.includes('oroel') && w.participants.includes('aurel')), 'aucune guerre stérile');
  assert.match((s.talk || []).find(m => m.id === answer.talkId)?.text || '', /hors de notre portée/);
  // Défense « contre quiconque » : seuls les ennemis atteignables sont des cibles.
  war(s, 'aurel', 'valmorne'); war(s, 'noireflamme', 'valmorne');
  assert.deepEqual(helpEnemies(s, map, { ally: 'oroel', requester: 'valmorne', kind: 'defend' }).sort(), ['noireflamme']);
});

test('Bug relecture 3 : l\'IA marine ne lit pas les navires réels d\'un port ennemi qu\'elle ne voit pas', () => {
  const build = ships => {
    const s = fresh({ oroel: 'conquerant' });
    s.turn = 8; war(s, 'oroel', 'valmorne');
    const n = s.provinces.p14; n.units.infantry += 900; n.units.armor += 20; n.buildings.port = 1; n.buildings.factory = 1;
    s.provinces.p03.buildings.port = 1; s.provinces.p03.warships = ships;   // port d'en face, hors de vue d'Oroël
    for (const k of LAND_UNIT_TYPES) s.provinces.p03.units[k] = k === 'infantry' ? 30 : 0;
    planAIOrders(s, map);
    return s.orders.filter(o => o.nationId === 'oroel').map(({ id, ...o }) => o);
  };
  assert.deepEqual(build(0), build(40), 'mêmes ordres que le port caché ait 0 ou 40 navires');
});
