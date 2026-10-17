import { test } from 'node:test';
import assert from 'node:assert/strict';
import { queueDiplomaticOrder, setRelation, resolveInterturn, spendableTreasury, queueRecruitment, queueMoveOrder } from '../src/domain/game-engine.js';
import { diplomacyActions, relationWithPlayer } from '../src/presentation/v3-ux.js';
import { ceasefireOffers } from '../src/presentation/v5-ux.js';
import { map, freshState } from './helpers/fixtures.js';

const atWar = (s, a, b) => s.diplomacy.wars.some(w => w.participants.includes(a) && w.participants.includes(b));

test('déclaration de guerre : appliquée à l\'inter-tour', () => {
  const s = freshState({ allHuman: true });
  assert.equal(queueDiplomaticOrder(s, { nationId: 'valmorne', target: 'aurel', action: 'war' }).ok, true);
  assert.equal(atWar(s, 'valmorne', 'aurel'), false);
  resolveInterturn(s, map);
  assert.equal(atWar(s, 'valmorne', 'aurel'), true);
  assert.equal(queueDiplomaticOrder(s, { nationId: 'valmorne', target: 'aurel', action: 'war' }).error, 'Déjà en guerre');
});

test('alliance impossible en guerre', () => {
  const s = freshState({ allHuman: true });
  setRelation(s, { nationId: 'valmorne', target: 'aurel', type: 'war' });
  assert.equal(queueDiplomaticOrder(s, { nationId: 'valmorne', target: 'aurel', action: 'alliance' }).ok, false);
  assert.deepEqual(setRelation(s, { nationId: 'valmorne', target: 'aurel', type: 'alliance' }), { ok: false, error: 'Un cessez-le-feu est requis avant une alliance' });
  assert.equal(diplomacyActions(s, 'aurel').find(a => a.id === 'alliance').enabled, false);
});

test('alliance proposée hors guerre : acceptée automatiquement à l\'inter-tour (pas de réponse de l\'IA)', () => {
  const s = freshState({ allHuman: true });
  queueDiplomaticOrder(s, { nationId: 'valmorne', target: 'aurel', action: 'alliance' });
  resolveInterturn(s, map);
  assert.equal(relationWithPlayer(s, 'aurel'), 'alliance');
  assert.equal(queueDiplomaticOrder(s, { nationId: 'valmorne', target: 'aurel', action: 'alliance' }).ok, false);
});

test('une seule action diplomatique en attente par cible ; pas envers soi-même', () => {
  const s = freshState({ allHuman: true });
  queueDiplomaticOrder(s, { nationId: 'valmorne', target: 'oroel', action: 'war' });
  assert.equal(queueDiplomaticOrder(s, { nationId: 'valmorne', target: 'oroel', action: 'alliance' }).ok, false);
  assert.equal(queueDiplomaticOrder(s, { nationId: 'valmorne', target: 'valmorne', action: 'war' }).error, 'Cible invalide');
});

test('cessez-le-feu : seulement en guerre, offres 25/50/75 % du trésor adverse', () => {
  const s = freshState({ allHuman: true });
  assert.equal(queueDiplomaticOrder(s, { nationId: 'valmorne', target: 'oroel', action: 'ceasefire' }).error, 'Aucune guerre active');
  assert.deepEqual(ceasefireOffers(120), [{ offerLevel: .75, amount: 90, acceptanceProbability: .25 }, { offerLevel: .5, amount: 60, acceptanceProbability: .5 }, { offerLevel: .25, amount: 30, acceptanceProbability: .75 }]);
  setRelation(s, { nationId: 'valmorne', target: 'oroel', type: 'war' });
  assert.equal(queueDiplomaticOrder(s, { nationId: 'valmorne', target: 'oroel', action: 'ceasefire', offerLevel: .3 }).ok, false);
  const r = queueDiplomaticOrder(s, { nationId: 'valmorne', target: 'oroel', action: 'ultimatum', offerLevel: .75 });
  assert.equal(r.ok, true);
  assert.equal(s.orders[0].action, 'ceasefire');
  assert.equal(s.orders[0].amount, 90);
  // Somme réservée : ni débitée, ni dépensable.
  assert.equal(s.nations.valmorne.treasury, 120);
  assert.equal(spendableTreasury(s, 'valmorne'), 30);
  assert.equal(queueRecruitment(s, { nationId: 'valmorne', provinceId: 'p01', type: 'infantry', lots: 2 }).ok, false);
});

test('cessez-le-feu accepté (offre 25 %, aléa forcé à 0) : guerre terminée, trêve, paiement débité', () => {
  const s = freshState({ allHuman: true });
  setRelation(s, { nationId: 'valmorne', target: 'oroel', type: 'war' });
  queueDiplomaticOrder(s, { nationId: 'valmorne', target: 'oroel', action: 'ceasefire', offerLevel: .25 });
  resolveInterturn(s, map, { random: () => 0 });
  assert.equal(atWar(s, 'valmorne', 'oroel'), false);
  assert.equal(relationWithPlayer(s, 'oroel'), 'ceasefire');
  assert.equal(s.nations.valmorne.treasury, 120 - 30 + 16);
  // B3 CORRIGÉ en V10 (test inversé) : le paiement est versé à la nation qui accepte.
  assert.equal(s.nations.oroel.treasury, 120 + 30 + 16);
  // Après une trêve, l'alliance redevient possible.
  assert.equal(diplomacyActions(s, 'oroel').find(a => a.id === 'alliance').enabled, true);
});

test('cessez-le-feu refusé : aucun débit, guerre maintenue', () => {
  const s = freshState({ allHuman: true });
  setRelation(s, { nationId: 'valmorne', target: 'oroel', type: 'war' });
  queueDiplomaticOrder(s, { nationId: 'valmorne', target: 'oroel', action: 'ceasefire', offerLevel: .75 });
  resolveInterturn(s, map, { random: () => 0.99 });
  assert.equal(atWar(s, 'valmorne', 'oroel'), true);
  assert.equal(s.nations.valmorne.treasury, 136);
  assert.equal(s.events.find(e => e.type === 'ceasefire-offer').accepted, false);
});

test('aléa de la diplomatie déterministe : seededRandom dépend de state.seed + randomCounter', () => {
  const run = () => { const s = freshState({ allHuman: true }); setRelation(s, { nationId: 'valmorne', target: 'oroel', type: 'war' }); queueDiplomaticOrder(s, { nationId: 'valmorne', target: 'oroel', action: 'ceasefire', offerLevel: .5 }); resolveInterturn(s, map); return [s.randomCounter, s.events.find(e => e.type === 'ceasefire-offer').accepted]; };
  assert.deepEqual(run(), run());
  assert.equal(run()[0], 1);
});

// V13 (changement voulu, décision de Jack) : pas de guerre entre alliés. Une attaque contre un allié est annulée
// sans combat ; pour attaquer, il faut rompre l'alliance (rompre + attaquer dans le même tour = trahison).
test('V13 : attaquer une nation alliée est impossible ; rompre puis attaquer = trahison et guerre', () => {
  const s = freshState({ allHuman: true });
  setRelation(s, { nationId: 'valmorne', target: 'roc-epine', type: 'alliance' });
  s.orders.push({ id: 'z', kind: 'move', nationId: 'valmorne', fromId: 'p04', toId: 'p05', units: { infantry: 10, cavalry: 0, armor: 0, artillery: 0 }, warships: 0, routeType: 'land', status: 'pending', turn: 1 });
  resolveInterturn(s, map);
  assert.equal(relationWithPlayer(s, 'roc-epine'), 'alliance', 'l\'alliance tient');
  assert.ok(s.events.some(e => e.type === 'attack-cancelled' && e.reason === 'ally-land'));
  assert.equal(queueDiplomaticOrder(s, { nationId: 'valmorne', target: 'roc-epine', action: 'break' }).ok, true);
  assert.equal(queueMoveOrder(s, map, { nationId: 'valmorne', fromId: 'p04', toId: 'p05', units: { infantry: 10 } }).ok, true, 'rupture ordonnée : l\'attaque devient possible');
  resolveInterturn(s, map);
  assert.equal(relationWithPlayer(s, 'roc-epine'), 'war');
  assert.ok(s.events.some(e => e.type === 'betrayal' && e.nationId === 'valmorne'));
});

test('B3 corrigé : le journal indique à qui la somme du cessez-le-feu est versée', async () => {
  const { journalEntry } = await import('../src/domain/game-engine.js');
  const e = journalEntry({ type: 'ceasefire-offer', nationId: 'valmorne', target: 'oroel', amount: 30, accepted: true }, map, 'valmorne');
  assert.match(e.text, /30 or, versés à/);
});
