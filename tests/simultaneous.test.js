// Résolution « simultanée » de la V6 : tous les ordres sont verrouillés puis résolus dans le MÊME inter-tour,
// mais pas réellement en parallèle (voir AUDIT-V6.md) : transferts amicaux d'abord, puis les attaques
// une à une, triées par identifiant de province cible, puis de nation. Ces tests figent ce comportement.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { queueMoveOrder, resolveInterturn } from '../src/domain/game-engine.js';
import { map, freshState, assertInvariants } from './helpers/fixtures.js';

const battles = s => s.events.filter(e => e.type === 'battle' || e.type === 'conquest').map(e => ({ type: e.type, attacker: e.attacker, provinceId: e.provinceId, from: e.originIds }));

test('A attaque X→Y pendant que B attaque X depuis Z : les deux ordres sont résolus dans le même tour', () => {
  // A = valmorne attaque de p04 (X) vers p05 (Y) ; B = roc-epine attaque p04 (X) depuis p06 (Z).
  const s = freshState({ allHuman: true });
  s.provinces.p04.units.infantry = 100;
  s.provinces.p06.units.infantry = 300;
  assert.equal(queueMoveOrder(s, map, { nationId: 'valmorne', fromId: 'p04', toId: 'p05', units: { infantry: 100 } }).ok, true);
  assert.equal(queueMoveOrder(s, map, { nationId: 'roc-epine', fromId: 'p06', toId: 'p04', units: { infantry: 300 } }).ok, true);
  resolveInterturn(s, map);
  assert.equal(s.turn, 2);
  assert.equal(s.orders.length, 0, 'tous les ordres consommés');
  const fights = battles(s);
  assert.equal(fights.length, 2, 'deux combats dans le même inter-tour');
  // Ordre réel : la cible p04 est traitée avant p05 (tri alphabétique). B prend X d'abord...
  assert.deepEqual(fights[0], { type: 'conquest', attacker: 'roc-epine', provinceId: 'p04', from: ['p06'] });
  assert.equal(s.provinces.p04.ownerId, 'roc-epine');
  // ...puis l'ordre de A n'a plus de troupes (sa province d'origine a changé de main) : combat « fantôme » à 0 contre la cible.
  assert.deepEqual(fights[1], { type: 'battle', attacker: 'valmorne', provinceId: 'p05', from: ['p04'] });
  const phantom = s.events.find(e => e.type === 'battle' && e.provinceId === 'p05');
  assert.equal(phantom.attackerLosses, 0);
  assert.equal(phantom.defenderLosses, 0);
  // Les 100 fantassins de A sont détruits avec la garnison de X (ils ne sont jamais partis).
  assert.equal(s.provinces.p05.ownerId, 'roc-epine');
  assert.equal(s.provinces.p04.units.infantry + s.events.find(e => e.type === 'conquest').attackerLosses, 300);
  assertInvariants(s, 'simultané');
});

test('le résultat dépend de l\'identifiant des provinces : scénario miroir (cible traitée en premier = attaque de A)', () => {
  // A = roc-epine attaque de p07 (X) vers p03 (Y) ; B = noireflamme (qui reçoit p06 pour le test) attaque p07 (X) depuis p06 (Z).
  const s = freshState({ allHuman: true });
  s.provinces.p06.ownerId = 'noireflamme';
  s.provinces.p07.units.infantry = 300;
  s.provinces.p06.units.infantry = 300;
  queueMoveOrder(s, map, { nationId: 'roc-epine', fromId: 'p07', toId: 'p03', units: { infantry: 300 } });
  queueMoveOrder(s, map, { nationId: 'noireflamme', fromId: 'p06', toId: 'p07', units: { infantry: 300 } });
  resolveInterturn(s, map);
  const fights = battles(s);
  // p03 < p07 : l'attaque de A part AVANT que X soit attaquée ; X est ensuite prise presque à vide.
  assert.deepEqual(fights.map(f => [f.type, f.attacker, f.provinceId]), [['conquest', 'roc-epine', 'p03'], ['conquest', 'noireflamme', 'p07']]);
  assert.equal(s.provinces.p03.ownerId, 'roc-epine');
  assert.equal(s.provinces.p07.ownerId, 'noireflamme');
  assertInvariants(s, 'miroir');
});

test('croisement : A attaque B pendant que B attaque A (p03 ↔ p07)', () => {
  const s = freshState({ allHuman: true });
  s.provinces.p03.units.infantry = 100; s.provinces.p07.units.infantry = 100;
  queueMoveOrder(s, map, { nationId: 'valmorne', fromId: 'p03', toId: 'p07', units: { infantry: 100 } });
  queueMoveOrder(s, map, { nationId: 'roc-epine', fromId: 'p07', toId: 'p03', units: { infantry: 100 } });
  resolveInterturn(s, map);
  // p03 traité d'abord : les 100 fantassins de valmorne n'ont pas encore quitté p03, ils défendent (ratio 1 -> échec
  // de roc-epine) ; puis les survivants partent et prennent p07, vidée. Comportement figé tel quel.
  assert.deepEqual(battles(s).map(f => [f.type, f.attacker, f.provinceId]), [['battle', 'roc-epine', 'p03'], ['conquest', 'valmorne', 'p07']]);
  assert.equal(s.provinces.p03.ownerId, 'valmorne');
  assert.equal(s.provinces.p07.ownerId, 'valmorne');
  assertInvariants(s, 'croisement');
});

test('deux nations attaquent la même cible : un seul combat par cible et par inter-tour', () => {
  const s = freshState({ allHuman: true });
  s.provinces.p04.units.infantry = 500;
  queueMoveOrder(s, map, { nationId: 'valmorne', fromId: 'p04', toId: 'p05', units: { infantry: 500 } });
  queueMoveOrder(s, map, { nationId: 'noireflamme', fromId: 'p09', toId: 'p05', units: { infantry: 100 } });
  resolveInterturn(s, map);
  const onP05 = battles(s).filter(f => f.provinceId === 'p05');
  assert.equal(onP05.length, 1);
  assert.equal(onP05[0].attacker, 'noireflamme', 'tri par nation : noireflamme < valmorne');
  // L'ordre de valmorne est ignoré, ses 500 fantassins restent en p04 (pas consommés).
  assert.equal(s.provinces.p04.units.infantry, 500);
  assert.equal(s.provinces.p05.ownerId, 'roc-epine');
  assertInvariants(s, 'même cible');
});

test('plusieurs attaques d\'une même nation contre une cible : forces combinées en un combat', () => {
  const s = freshState({ allHuman: true });
  queueMoveOrder(s, map, { nationId: 'roc-epine', fromId: 'p06', toId: 'p04', units: { infantry: 40 } });
  queueMoveOrder(s, map, { nationId: 'roc-epine', fromId: 'p05', toId: 'p04', units: { infantry: 200, armor: 6 } });
  resolveInterturn(s, map);
  const f = battles(s);
  assert.equal(f.length, 1);
  assert.deepEqual(f[0], { type: 'conquest', attacker: 'roc-epine', provinceId: 'p04', from: ['p05', 'p06'] });
});

test('transfert amical appliqué avant les attaques (renfort arrive à temps)', () => {
  const s = freshState({ allHuman: true });
  queueMoveOrder(s, map, { nationId: 'valmorne', fromId: 'p01', toId: 'p04', units: { infantry: 200, armor: 6 } });
  queueMoveOrder(s, map, { nationId: 'roc-epine', fromId: 'p05', toId: 'p04', units: { infantry: 200, armor: 6 } });
  resolveInterturn(s, map);
  assert.equal(s.provinces.p04.ownerId, 'valmorne');
  assert.equal(battles(s)[0].type, 'battle');
});
