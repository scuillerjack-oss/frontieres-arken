import { test } from 'node:test';
import assert from 'node:assert/strict';
import { legalDestinations, queueMoveOrder, availableForces, resolveInterturn } from '../src/domain/game-engine.js';
import { cancelPendingOrder, playerOrderArrows } from '../src/presentation/v5-ux.js';
import { map, freshState } from './helpers/fixtures.js';

test('destinations légales = voisins terrestres ; mer seulement si les deux ports sont construits', () => {
  const s = freshState({ allHuman: true });
  assert.deepEqual(legalDestinations(map, s, 'p07'), [{ id: 'p03', type: 'land' }, { id: 'p06', type: 'land' }, { id: 'p08', type: 'land' }]);
  s.provinces.p07.buildings.port = 1;
  assert.equal(legalDestinations(map, s, 'p07').some(d => d.type === 'sea'), false);
  s.provinces.p13.buildings.port = 1;
  assert.deepEqual(legalDestinations(map, s, 'p07').filter(d => d.type === 'sea'), [{ id: 'p13', type: 'sea' }]);
});

test('déplacement légal vers une province voisine possédée', () => {
  const s = freshState({ allHuman: true });
  const r = queueMoveOrder(s, map, { nationId: 'valmorne', fromId: 'p01', toId: 'p02', units: { infantry: 50 } });
  assert.deepEqual(r, { ok: true, orderId: 'o1' });
  assert.equal(s.provinces.p01.units.infantry, 200, 'les forces ne bougent pas avant l\'inter-tour');
  resolveInterturn(s, map);
  assert.equal(s.provinces.p01.units.infantry, 150);
  assert.equal(s.provinces.p02.units.infantry, 90);
});

test('déplacements illégaux refusés', () => {
  const s = freshState({ allHuman: true });
  assert.equal(queueMoveOrder(s, map, { nationId: 'valmorne', fromId: 'p01', toId: 'p05', units: { infantry: 1 } }).error, 'Aucune route visible ou aucun port opérationnel');
  assert.equal(queueMoveOrder(s, map, { nationId: 'valmorne', fromId: 'p05', toId: 'p04', units: { infantry: 1 } }).error, 'Origine non contrôlée');
  assert.equal(queueMoveOrder(s, map, { nationId: 'valmorne', fromId: 'p01', toId: 'p02', units: {} }).error, 'Aucune force sélectionnée');
  assert.equal(queueMoveOrder(s, map, { nationId: 'valmorne', fromId: 'p01', toId: 'p02', units: { infantry: 201 } }).ok, false);
  assert.equal(queueMoveOrder(s, map, { nationId: 'valmorne', fromId: 'p07', toId: 'p13', units: { infantry: 1 } }).ok, false);
  assert.equal(s.orders.length, 0);
});

test('réservation des forces : un second ordre ne peut pas réutiliser les mêmes unités', () => {
  const s = freshState({ allHuman: true });
  assert.equal(queueMoveOrder(s, map, { nationId: 'valmorne', fromId: 'p01', toId: 'p02', units: { infantry: 150, armor: 6 } }).ok, true);
  assert.deepEqual(availableForces(s, 'p01'), { infantry: 50, cavalry: 10, armor: 0, artillery: 2, balloon: 1, warships: 0 });
  assert.equal(queueMoveOrder(s, map, { nationId: 'valmorne', fromId: 'p01', toId: 'p04', units: { infantry: 51 } }).error, 'Ces unités sont déjà réservées dans un autre ordre');
  assert.equal(queueMoveOrder(s, map, { nationId: 'valmorne', fromId: 'p01', toId: 'p04', units: { infantry: 50 } }).ok, true);
  assert.equal(availableForces(s, 'p01').infantry, 0);
});

test('annulation d\'un ordre : forces de nouveau disponibles', () => {
  const s = freshState({ allHuman: true });
  const { orderId } = queueMoveOrder(s, map, { nationId: 'valmorne', fromId: 'p01', toId: 'p02', units: { infantry: 100 } });
  assert.equal(cancelPendingOrder(s, orderId).ok, true);
  assert.equal(availableForces(s, 'p01').infantry, 200);
  assert.equal(cancelPendingOrder(s, orderId).ok, false);
});

test('flèches d\'ordre du joueur : vert = déplacement, rouge = attaque, ancrées sur markerAnchor', () => {
  const s = freshState({ allHuman: true });
  queueMoveOrder(s, map, { nationId: 'valmorne', fromId: 'p04', toId: 'p02', units: { infantry: 1 } });
  queueMoveOrder(s, map, { nationId: 'valmorne', fromId: 'p04', toId: 'p05', units: { infantry: 1 } });
  const arrows = playerOrderArrows(s, map);
  assert.deepEqual(arrows.map(a => [a.kind, a.color, a.fromId, a.toId]), [['move', 'green', 'p04', 'p02'], ['attack', 'red', 'p04', 'p05']]);
  assert.deepEqual(arrows[0].start, { x: 89, y: 78 });
});

test('attaque simple : guerre déclarée automatiquement, conquête si ratio > 1,08', () => {
  const s = freshState({ allHuman: true });
  s.provinces.p04.units.infantry = 500;
  queueMoveOrder(s, map, { nationId: 'valmorne', fromId: 'p04', toId: 'p05', units: { infantry: 500 } });
  resolveInterturn(s, map);
  assert.equal(s.provinces.p05.ownerId, 'valmorne');
  assert.equal(s.nations.valmorne.treasury, 120 + 30 + 20, 'trésor de guerre (capitale) + revenu de 5 provinces');
  assert.ok(s.diplomacy.wars.some(w => w.participants.includes('valmorne') && w.participants.includes('roc-epine')));
});
