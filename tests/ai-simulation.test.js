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

// B11 CORRIGÉ en V9 (test inversé) : l'IA construit des ports, des navires et traverse la mer.
test('B11 corrigé : l\'IA construit des ports et des navires et lance des opérations maritimes', () => {
  const s = simulate('valmorne', 200);
  assert.ok(Object.values(s.provinces).filter(p => p.buildings.port).length > 0, 'ports construits');
  assert.ok(Object.values(s.provinces).some(p => p.warships > 0) || s.events.some(e => e.naval), 'flotte ou combat naval');
  assert.ok(s.events.some(e => e.naval), 'au moins un combat naval');
});

// B5 CORRIGÉ en V10 (test inversé) : une banque et une usine au plus par province, file comprise ; l'IA les respecte.
test('B5 corrigé : l\'IA n\'empile plus usines ni banques sur une même province', () => {
  const s = simulate('valmorne', 60);
  assert.ok(Object.values(s.provinces).every(p => p.buildings.factory <= 1 && p.buildings.bank <= 1));
  assert.ok(Object.values(s.provinces).some(p => p.buildings.factory === 1), 'des usines sont construites');
});

// B6 CORRIGÉ en V10 (au minimum) : une nation sans province est marquée éliminée (voir combat-v10.test.js) ;
// la condition de victoire reste à définir (point ouvert).
test('B6 : `eliminated` reste cohérent avec les provinces possédées pendant toute la partie', () => {
  const s = simulate('valmorne', 200);
  for (const [id, n] of Object.entries(s.nations)) assert.equal(n.eliminated, !Object.values(s.provinces).some(p => p.ownerId === id) && !(s.transports || []).some(t => t.nationId === id));
});
