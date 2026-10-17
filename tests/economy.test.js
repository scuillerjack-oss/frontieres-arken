import { test } from 'node:test';
import assert from 'node:assert/strict';
import { incomeFor, resolveInterturn, queueConstruction, queueRecruitment, spendableTreasury } from '../src/domain/game-engine.js';
import { RULES } from '../src/domain/constants.js';
import { map, NATIONS, freshState } from './helpers/fixtures.js';

test('règles économiques figées', () => {
  assert.equal(RULES.baseIncome, 4);
  assert.equal(RULES.bankIncome, 3);
  assert.equal(RULES.factoryIncome, 3);
  // V10 : plafonds par province (`max`) ajoutés ; coûts et durées inchangés.
  assert.deepEqual(RULES.buildings, { bank: { cost: 30, turns: 3, max: 1 }, factory: { cost: 40, turns: 3, max: 1 }, fort: { costs: [20, 35, 50], turns: 2, max: 3 }, port: { cost: 40, turns: 3, max: 1 } });
  assert.equal(RULES.warChestAmount, 30);
});

test('coûts des unités figés', () => {
  const u = RULES.units;
  assert.deepEqual(Object.fromEntries(Object.entries(u).map(([k, r]) => [k, [r.amount, r.cost, r.turns, r.power]])), {
    infantry: [20, 20, 1, 1], cavalry: [5, 20, 1, 3], armor: [1, 30, 2, 12], artillery: [1, 25, 2, 8], warship: [1, 65, 3, 30] // V13 : ballon supprimé
  });
});

test('revenu d\'un tour : 4 provinces × 4 = 16 or, crédité à l\'inter-tour', () => {
  const s = freshState({ allHuman: true });
  for (const id of NATIONS) assert.equal(incomeFor(s, id), 16);
  resolveInterturn(s, map);
  assert.equal(s.turn, 2);
  for (const id of NATIONS) assert.equal(s.nations[id].treasury, 136);
});

test('banque : payée tout de suite, livrée après 3 inter-tours, +3 de revenu', () => {
  const s = freshState({ allHuman: true });
  const r = queueConstruction(s, { nationId: 'valmorne', provinceId: 'p02', type: 'bank' });
  assert.deepEqual(r, { ok: true, orderId: 'o1', cost: 30 });
  assert.equal(s.nations.valmorne.treasury, 90);
  resolveInterturn(s, map); resolveInterturn(s, map);
  assert.equal(s.provinces.p02.buildings.bank, 0);
  resolveInterturn(s, map);
  assert.equal(s.provinces.p02.buildings.bank, 1);
  assert.equal(incomeFor(s, 'valmorne'), 19);
  // La production est résolue AVANT le revenu : la banque rapporte dès son inter-tour de livraison.
  assert.equal(s.nations.valmorne.treasury, 90 + 16 + 16 + 19);
});

test('forts : coûts 20/35/50, maximum 3', () => {
  const s = freshState({ allHuman: true });
  s.nations.valmorne.treasury = 1000;
  assert.equal(queueConstruction(s, { nationId: 'valmorne', provinceId: 'p01', type: 'fort' }).cost, 20);
  assert.equal(queueConstruction(s, { nationId: 'valmorne', provinceId: 'p01', type: 'fort' }).cost, 35);
  assert.equal(queueConstruction(s, { nationId: 'valmorne', provinceId: 'p01', type: 'fort' }).cost, 50);
  assert.equal(queueConstruction(s, { nationId: 'valmorne', provinceId: 'p01', type: 'fort' }).ok, false);
});

test('port : seulement sur un site portuaire, un seul', () => {
  const s = freshState({ allHuman: true, player: 'roc-epine' });
  assert.equal(queueConstruction(s, { nationId: 'roc-epine', provinceId: 'p05', type: 'port' }).ok, false);
  assert.equal(queueConstruction(s, { nationId: 'roc-epine', provinceId: 'p07', type: 'port' }).ok, true);
  assert.equal(queueConstruction(s, { nationId: 'roc-epine', provinceId: 'p07', type: 'port' }).ok, false);
});

test('recrutement : par lots, usine requise pour les blindés, unités livrées après la durée', () => {
  const s = freshState({ allHuman: true });
  assert.deepEqual(queueRecruitment(s, { nationId: 'valmorne', provinceId: 'p02', type: 'armor' }), { ok: false, error: 'Usine requise' });
  const r = queueRecruitment(s, { nationId: 'valmorne', provinceId: 'p02', type: 'infantry', lots: 2 });
  assert.equal(r.ok, true); assert.equal(r.cost, 40); assert.equal(r.amount, 40);
  assert.equal(s.nations.valmorne.treasury, 80);
  resolveInterturn(s, map); // infanterie : 1 tour -> livrée dès cet inter-tour
  assert.equal(s.provinces.p02.units.infantry, 80);
});

test('trésor insuffisant refusé ; province étrangère refusée', () => {
  const s = freshState({ allHuman: true });
  s.nations.valmorne.treasury = 10;
  assert.equal(queueRecruitment(s, { nationId: 'valmorne', provinceId: 'p01', type: 'infantry' }).ok, false);
  assert.equal(queueConstruction(s, { nationId: 'valmorne', provinceId: 'p05', type: 'bank' }).ok, false);
  assert.equal(spendableTreasury(s, 'valmorne'), 10);
});

// B4 CORRIGÉ en V10 (test inversé) : une production dans une province conquise est annulée et remboursée
// à la nation qui l'a payée ; le conquérant ne reçoit rien.
test('B4 corrigé : recrutement annulé et remboursé si la province tombe le même tour', () => {
  const s = freshState({ allHuman: true });
  queueRecruitment(s, { nationId: 'valmorne', provinceId: 'p04', type: 'infantry', lots: 1 });
  s.provinces.p06.units.infantry = 300;
  s.orders.push({ id: 'x1', kind: 'move', nationId: 'roc-epine', fromId: 'p06', toId: 'p04', units: { infantry: 300, cavalry: 0, armor: 0, artillery: 0 }, warships: 0, routeType: 'land', status: 'pending', turn: 1 });
  resolveInterturn(s, map);
  assert.equal(s.provinces.p04.ownerId, 'roc-epine');
  const conquest = s.events.find(e => e.type === 'conquest' && e.provinceId === 'p04');
  assert.ok(conquest);
  assert.equal(s.provinces.p04.units.infantry, 300 - conquest.attackerLosses, 'aucun renfort offert au conquérant');
  const lost = s.events.find(e => e.type === 'production-lost');
  assert.equal(lost.refund, 20);
  // Valmorne : 120 − 20 (commande) + 20 (remboursement) + 3 provinces × 4.
  assert.equal(s.nations.valmorne.treasury, 120 + 12);
});
