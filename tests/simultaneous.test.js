// Résolution simultanée V10 (corrige B1 et B2, voir docs/V10-moteur.md §3) :
//  0. transferts amicaux et embarquements ;
//  1. « défense d'abord » : une province attaquée qui devait elle-même attaquer se défend avec toute sa garnison ;
//  2. toutes les autres attaques partent en même temps ; une attaque dont l'origine est tombée en 1 est annulée
//     (sans combat ni guerre) ; toutes les nations qui visent une même province combattent ensemble ;
//     deux armées qui se croisent sur une frontière se heurtent d'abord en rase campagne.
// Les tests V6 qui figeaient l'ordre alphabétique ont été réécrits (comportement changé volontairement).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { queueMoveOrder, resolveInterturn } from '../src/domain/game-engine.js';
import { map, freshState, assertInvariants } from './helpers/fixtures.js';

const battles = s => s.events.filter(e => e.type === 'battle' || e.type === 'conquest').map(e => ({ type: e.type, attacker: e.attacker, provinceId: e.provinceId, from: e.originIds }));
const atWar = (s, a, b) => s.diplomacy.wars.some(w => w.participants.includes(a) && w.participants.includes(b));

test('B1 corrigé : A attaque X→Y pendant que B prend X : l\'attaque de A est annulée, sans combat fantôme ni guerre', () => {
  // A = valmorne attaque de p04 (X) vers p05 (Y) ; B = roc-epine attaque p04 (X) depuis p06 (Z).
  const s = freshState({ allHuman: true });
  s.provinces.p04.units.infantry = 100;
  s.provinces.p06.units.infantry = 300;
  assert.equal(queueMoveOrder(s, map, { nationId: 'valmorne', fromId: 'p04', toId: 'p05', units: { infantry: 100 } }).ok, true);
  assert.equal(queueMoveOrder(s, map, { nationId: 'roc-epine', fromId: 'p06', toId: 'p04', units: { infantry: 300 } }).ok, true);
  resolveInterturn(s, map);
  assert.equal(s.orders.length, 0);
  // X se défend avec TOUTE sa garnison (les 100 de A n'étaient pas partis) et tombe.
  assert.deepEqual(battles(s), [{ type: 'conquest', attacker: 'roc-epine', provinceId: 'p04', from: ['p06'] }]);
  assert.equal(s.events.find(e => e.type === 'conquest').defenderLosses, 100);
  assert.ok(s.events.some(e => e.type === 'attack-cancelled' && e.nationId === 'valmorne' && e.provinceId === 'p05' && e.reason === 'origin-lost'));
  assert.equal(s.provinces.p05.ownerId, 'roc-epine');
  assert.equal(s.provinces.p05.units.infantry, 200, 'aucun combat en p05');
  assertInvariants(s, 'B1');
});

test('B1 : l\'attaque annulée ne déclare pas de guerre à la cible d\'une autre nation', () => {
  // valmorne attaque p05 (roc-epine) depuis p04 ; noireflamme prend p04 avant le départ.
  const s = freshState({ allHuman: true });
  s.provinces.p03.ownerId = 'noireflamme'; s.provinces.p03.units.infantry = 600;
  s.provinces.p04.units.infantry = 60;
  queueMoveOrder(s, map, { nationId: 'valmorne', fromId: 'p04', toId: 'p05', units: { infantry: 60 } });
  queueMoveOrder(s, map, { nationId: 'noireflamme', fromId: 'p03', toId: 'p04', units: { infantry: 600 } });
  resolveInterturn(s, map);
  assert.equal(s.provinces.p04.ownerId, 'noireflamme');
  assert.equal(atWar(s, 'valmorne', 'roc-epine'), false, 'pas de guerre déclarée par une attaque annulée');
  assert.equal(atWar(s, 'valmorne', 'noireflamme'), true);
});

test('l\'issue ne dépend plus de l\'identifiant des provinces : scénario miroir', () => {
  // A = roc-epine attaque de p07 (X) vers p03 (Y) ; B = noireflamme (qui reçoit p06) attaque p07 (X) depuis p06 (Z).
  const s = freshState({ allHuman: true });
  s.provinces.p06.ownerId = 'noireflamme';
  s.provinces.p07.units.infantry = 300;
  s.provinces.p06.units.infantry = 300;
  queueMoveOrder(s, map, { nationId: 'roc-epine', fromId: 'p07', toId: 'p03', units: { infantry: 300 } });
  queueMoveOrder(s, map, { nationId: 'noireflamme', fromId: 'p06', toId: 'p07', units: { infantry: 300 } });
  resolveInterturn(s, map);
  // V6 : p03 était traitée avant p07 (ordre alphabétique) et X partait avant d'être attaquée. V10 : X se défend d'abord.
  const first = battles(s)[0];
  assert.deepEqual([first.attacker, first.provinceId], ['noireflamme', 'p07']);
  assert.equal(s.provinces.p07.ownerId, 'roc-epine', '300 contre 300 : la défense tient');
  assertInvariants(s, 'miroir');
});

test('croisement : A attaque B pendant que B attaque A (p03 ↔ p07) : choc en rase campagne puis survivants', () => {
  const s = freshState({ allHuman: true });
  s.provinces.p03.units.infantry = 100; s.provinces.p07.units.infantry = 100;
  queueMoveOrder(s, map, { nationId: 'valmorne', fromId: 'p03', toId: 'p07', units: { infantry: 100 } });
  queueMoveOrder(s, map, { nationId: 'roc-epine', fromId: 'p07', toId: 'p03', units: { infantry: 100 } });
  resolveInterturn(s, map);
  const field = s.events.filter(e => e.type === 'field-battle');
  assert.equal(field.length, 1, 'un seul choc frontal');
  // Forces égales : résultat symétrique, chaque camp prend la province vide de l'autre.
  assert.equal(s.provinces.p03.ownerId, 'roc-epine');
  assert.equal(s.provinces.p07.ownerId, 'valmorne');
  assert.equal(s.provinces.p03.units.infantry, s.provinces.p07.units.infantry, 'symétrique : indépendant de l\'ordre');
  assertInvariants(s, 'croisement');
});

test('B2 corrigé : deux nations attaquent la même cible : tous les attaquants combattent', () => {
  const s = freshState({ allHuman: true });
  s.provinces.p04.units.infantry = 500;
  queueMoveOrder(s, map, { nationId: 'valmorne', fromId: 'p04', toId: 'p05', units: { infantry: 500 } });
  queueMoveOrder(s, map, { nationId: 'noireflamme', fromId: 'p09', toId: 'p05', units: { infantry: 100 } });
  resolveInterturn(s, map);
  const onP05 = s.events.filter(e => (e.type === 'battle' || e.type === 'conquest') && e.provinceId === 'p05');
  assert.equal(onP05.length, 1, 'un seul affrontement, à trois');
  assert.deepEqual(onP05[0].attackers, ['noireflamme', 'valmorne']);
  // Les deux ordres sont consommés ; tous deux sont en guerre contre roc-epine.
  assert.equal(s.provinces.p04.units.infantry, 0);
  assert.ok(atWar(s, 'valmorne', 'roc-epine') && atWar(s, 'noireflamme', 'roc-epine'));
  assert.equal(atWar(s, 'valmorne', 'noireflamme'), false, 'les attaquants ne se battent pas entre eux');
  // Le plus fort survivant (valmorne) prend la province ; les survivants de noireflamme rentrent en p09.
  assert.equal(s.provinces.p05.ownerId, 'valmorne');
  assert.ok(onP05[0].lossesByNation.noireflamme.infantry > 0, 'noireflamme a combattu');
  assertInvariants(s, 'même cible');
});

test('B2 : l\'ordre de saisie et les identifiants n\'influencent pas l\'issue', () => {
  const run = flip => {
    const s = freshState({ allHuman: true });
    s.provinces.p04.units.infantry = 500;
    const a = { nationId: 'valmorne', fromId: 'p04', toId: 'p05', units: { infantry: 500 } }, b = { nationId: 'noireflamme', fromId: 'p09', toId: 'p05', units: { infantry: 100 } };
    for (const o of flip ? [b, a] : [a, b]) queueMoveOrder(s, map, o);
    resolveInterturn(s, map);
    return [s.provinces.p05, s.provinces.p04, s.provinces.p09];
  };
  assert.deepEqual(run(false), run(true));
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
  assert.equal(s.events.find(e => e.type === 'battle').defender, 'valmorne');
});
