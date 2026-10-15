// Simulation IA contre IA : toutes les nations sont pilotées par l'IA.
// Le moteur V6 n'appelle pas Math.random (aléa interne : seededRandom(state)). Par sécurité, Math.random est
// remplacé ici par un générateur à graine pour que toute la simulation reste reproductible.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { resolveInterturn, planAIOrders } from '../src/domain/game-engine.js';
import { encodeSave, decodeSave } from '../src/persistence/save-codec.js';
import { map, NATIONS, freshState, seededRandom, assertInvariants } from './helpers/fixtures.js';

const TURNS = 250;
let originalRandom, randomCalls = 0;
before(() => { originalRandom = Math.random; const r = seededRandom(1234); Math.random = () => { randomCalls++; return r(); }; });
after(() => { Math.random = originalRandom; });

function simulate(player, turns = TURNS) {
  const s = freshState({ player, allAI: true });
  for (let i = 0; i < turns; i++) {
    resolveInterturn(s, map);
    assertInvariants(s, `IA(${player})`);
  }
  return s;
}

for (const player of NATIONS) {
  test(`IA contre IA (${player} en « joueur ») : ${TURNS} tours sans exception, invariants à chaque tour`, () => {
    const s = simulate(player);
    assert.equal(s.turn, TURNS + 1);
    assert.ok(s.events.some(e => e.type === 'conquest'), 'des conquêtes ont lieu');
  });
}

test('simulation reproductible : deux parties identiques donnent le même état', () => {
  const a = simulate('valmorne', 60), b = simulate('valmorne', 60);
  assert.deepEqual(a, b);
});

test('le moteur n\'utilise pas Math.random', () => {
  simulate('oroel', 30);
  assert.equal(randomCalls, 0);
});

test('sauvegarde/reprise au milieu d\'une partie IA : même suite', () => {
  const a = simulate('aurel', 40);
  const b = decodeSave(encodeSave(a));
  for (let i = 0; i < 20; i++) { resolveInterturn(a, map); resolveInterturn(b, map); }
  assert.deepEqual(b, a);
});

test('planAIOrders est idempotent dans un même tour', () => {
  const s = freshState({ player: 'valmorne' });
  const first = planAIOrders(s, map).length;
  assert.ok(first > 0);
  assert.equal(planAIOrders(s, map).length, first);
  assert.equal(s.orders.length, first);
});

test('constat V6 : l\'IA ne construit jamais de port ni d\'ordre maritime ; trésors qui s\'accumulent', () => {
  const s = simulate('valmorne', 200);
  assert.equal(Object.values(s.provinces).filter(p => p.buildings.port).length, 0);
  assert.equal(s.transports.length, 0);
  assert.ok(Object.values(s.nations).some(n => n.treasury > 5000), 'IA thésaurise (dépense max ~1 recrutement par tour)');
});

// BUG CONNU (game-engine.js:244-246) : l'IA ne tient pas compte des constructions en file ; elle relance usine ou
// banque sur la même province chaque tour où elle a l'argent -> plusieurs usines / banques par province.
test('BUG CONNU : l\'IA empile plusieurs usines ou banques sur une même province', () => {
  const s = simulate('valmorne', 10);
  assert.ok(Object.values(s.provinces).some(p => p.buildings.factory > 1 || p.buildings.bank > 1));
});

// BUG CONNU : aucune nation n'est jamais éliminée ni victorieuse (champ `eliminated` jamais mis à jour, aucune
// condition de fin de partie).
test('BUG CONNU : pas de fin de partie, `eliminated` jamais modifié', () => {
  const s = simulate('valmorne', 200);
  assert.ok(Object.values(s.nations).every(n => n.eliminated === false));
});
