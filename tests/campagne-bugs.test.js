// V16 — Bugs trouvés par la campagne de tests (docs/CAMPAGNE-TESTS-V16.md). Corrigés en V15.6 (11/11/2026) :
// chaque test reproduisait le bug ; il passe désormais tel quel et empêche le bug de revenir.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { arkenV9Map as map } from '../src/map/arken-v9-map.js';
import { createGameState } from '../src/state/create-game-state.js';
import * as E from '../src/domain/game-engine.js';
import { queueTalk } from '../src/domain/talk.js';
import { campaignPlan, playGame } from '../scripts/campagne-lib.js';

const fresh = (seed = 'bug') => createGameState({ map, playerNationId: 'valmorne', seed });
const cleanPrototype = () => { for (const k of Object.keys(Object.prototype)) delete Object.prototype[k]; };

test('BUG CAMPAGNE n° 1 (gênant) : un nom hérité (« toString », « __proto__ ») est refusé comme nation cible', () => {
  // Reproduction : queueDiplomaticOrder vérifie `state.nations[target]`, qui existe pour « toString » (Object.prototype).
  for (const target of ['toString', 'valueOf', '__proto__', 'constructor', 'hasOwnProperty']) {
    const s = fresh(`bug1-${target}`);
    const r = E.queueDiplomaticOrder(s, { nationId: 'valmorne', target, action: 'war' });
    assert.equal(r.ok, false, `guerre contre « ${target} » acceptée`);
    assert.equal(queueTalk(s, map, { from: 'valmorne', to: target, tone: 'amical' }).ok, false, `message à « ${target} » accepté`);
  }
});

test('BUG CAMPAGNE n° 1 (gênant), effet : déclarer la guerre à « __proto__ » pollue Object.prototype puis fait planter l\'inter-tour', () => {
  const s = fresh('bug1-proto');
  try {
    E.queueDiplomaticOrder(s, { nationId: 'valmorne', target: '__proto__', action: 'war' });
    assert.doesNotThrow(() => E.resolveInterturn(s, map));
    assert.deepEqual(Object.keys(Object.prototype), []);
  } finally { cleanPrototype(); }
});

test('BUG CAMPAGNE n° 1 (gênant), effet : un message public à « toString » casse la publication des messages suivants', () => {
  // Reproduction exacte de la partie campagne-long-43 (avant le filtre) : `state.talkPending.toString` est la fonction héritée.
  const s = fresh('bug1-talk');
  // Depuis la correction, le message est refusé dès la saisie : rien n'entre dans la file, l'inter-tour passe.
  assert.equal(queueTalk(s, map, { from: 'valmorne', to: 'toString', tone: 'amical' }).ok, false);
  assert.equal(queueTalk(s, map, { from: 'toString', to: 'valmorne', tone: 'amical' }).ok, false);
  assert.doesNotThrow(() => E.resolveInterturn(s, map));
  assert.ok(!(s.talk || []).some(m => m.to === 'toString' || m.from === 'toString'));
});

test('BUG CAMPAGNE n° 1 (gênant), effet : un cessez-le-feu « payé » à « toString » rend le trésor NaN', () => {
  // Reproduction de la partie campagne-long-275 (avant le filtre) : or du joueur = NaN au tour 70, partie continuée avec NaN.
  // Le montant exigé vaut NaN (`state.nations.toString.treasury` n'existe pas) ; acceptée (80 % de chances), la trêve
  // retire NaN au trésor. On réessaie jusqu'à 10 tours pour tomber sur une acceptation.
  const s = fresh('bug1-nan');
  E.queueDiplomaticOrder(s, { nationId: 'valmorne', target: 'toString', action: 'war' });
  E.resolveInterturn(s, map);
  for (let i = 0; i < 10; i++) {
    E.queueDiplomaticOrder(s, { nationId: 'valmorne', target: 'toString', action: 'ceasefire', pay: 5, demand: 0 });
    E.resolveInterturn(s, map);
    assert.ok(Number.isFinite(s.nations.valmorne.treasury), `trésor ${s.nations.valmorne.treasury} au tour ${s.turn - 1}`);
  }
});

test('BUG CAMPAGNE n° 2 (cosmétique) : le journal écrit « 1 unités » (retour au port, passage, stationnement)', () => {
  const where = { provinceId: 'p02', fromId: 'p02', toId: 'p05', turn: 1 };
  const texts = [
    E.journalEntry({ ...where, type: 'convoy-arrived', nationId: 'valmorne', amount: 1, returning: true }, map, 'valmorne'),
    E.journalEntry({ ...where, type: 'convoy-arrived', nationId: 'valmorne', amount: 1, passage: true, target: 'roc-epine' }, map, 'valmorne'),
    E.journalEntry({ ...where, type: 'stationed-recalled', nationId: 'valmorne', amount: 1, target: 'roc-epine' }, map, 'valmorne')
  ].map(e => e?.text || '');
  for (const t of texts) assert.doesNotMatch(t, /\b1 unités\b/, t);
});

test('BUG CAMPAGNE n° 3 (gênant) : un convoi dérouté vers un port ami prend un trajet qui n\'est pas une route maritime', () => {
  // Partie campagne-long-267 (Noireflamme, 80 tours, Facile, diplomate) : au tour 72, convoi c31 dérouté de p07 vers p11
  // (« lane » p07|p11, 5 tours) alors que les seules routes sont p02-p05, p03-p14, p07-p17, p09-p13, p11-p19.
  // friendlyPortRoute (engine/convoys.js) calcule un chemin à plusieurs étapes, mais le convoi l'enregistre comme une route
  // directe : sur la carte, il est dessiné hors des routes, et il ne peut croiser aucune flotte sur les routes empruntées.
  const plan = campaignPlan(268, 'long')[267];
  const r = playGame(plan, { views: false });
  assert.ok(!r.violations.some(v => v.inv === 'case-impossible'), JSON.stringify(r.violations.filter(v => v.inv === 'case-impossible')));
});

test('BUG CAMPAGNE n° 4 (cosmétique) : l\'or offert par l\'IA avec sa trêve est versé mais le journal dit « sans paiement »', () => {
  // Partie campagne-long-25 (Valmorne, 80 tours) : au tour 76, Roc-Épine propose la trêve avec 70 or ; le joueur demande
  // lui-même une trêve à 0 or ; elle est signée, les 70 or sont bien versés (payProposalGold), mais l'événement
  // `ceasefire-offer` dit amount 0, et le journal affiche « Cessez-le-feu sans paiement accepté par Roc-Épine ».
  const plan = campaignPlan(26, 'long')[25];
  const s = playGame(plan, { keepState: true, stopAt: 77, views: false }).state;
  const proposal = s.events.find(e => e.turn === 76 && e.type === 'diplomatic-action' && e.proposal && e.target === 'valmorne');
  assert.ok(proposal?.amount > 0, 'scénario de départ : l\'IA offre de l\'or avec sa trêve');
  const offer = s.events.find(e => e.turn === 76 && e.type === 'ceasefire-offer' && e.nationId === 'valmorne' && e.accepted);
  assert.ok(offer, 'scénario de départ : le joueur demande la trêve le même tour');
  const text = E.journalEntry(offer, map, 'valmorne')?.text || '';
  assert.doesNotMatch(text, /sans paiement/, `${text} (or reçu : ${proposal.amount})`);
});

test('V15.6 (relecture) : un convoi dérouté est dessiné sur une vraie route mais ne croise toujours personne en mer (règle inchangée)', () => {
  const plan = campaignPlan(268, 'long')[267];
  const s = playGame(plan, { keepState: true, stopAt: 73, views: false }).state;
  const ev = s.events.find(e => e.type === 'convoy-rerouted' && e.convoyId);
  assert.ok(ev, 'scénario de départ : un convoi est dérouté');
  const t = s.transports.find(x => x.id === ev.convoyId);
  if (t) { assert.equal(t.rerouted, true); assert.ok((map.maritimeRoutes || []).some(([a, b]) => [a, b].sort().join('|') === t.lane), t.lane); }
});
