// V13.2 — retours de bêta de Jack (18/10/2026, partie gagnée au tour 60) :
//  1. « Ils m'ont déjà frappé deux fois » alors que la fiche disait « A déjà frappé une fois » → compteur d'assauts réels.
//  2. « J'ai déjà refusé le cessez-le-feu une première fois » → la proposition suivante le dit, attend, offre de l'or.
//  3. « Proposer un montant lors du cessez-le-feu (pour le dominant) » → payer OU exiger un montant choisi.
//  4. Oroël / Aurel trop proches à l'oreille → Aurel s'appelle Solmara (identifiant `aurel` inchangé).
//  5. 60 tours → 80, affichés « 26/80 » ; alerte à 5 tours de la fin.
//  6. « Je ne peux pas attaquer un allié, mais j'ai mis trop de temps à comprendre » → signalé avant la saisie.
//  7. Descriptions parfois trop longues → textes d'aide raccourcis.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { RULES } from '../src/domain/constants.js';
import { queueDiplomaticOrder, setRelation, resolveInterturn, spendableTreasury, respondToProposal, proposalsToAnswer, refusalsOf,
  aiCeasefireGold, ceasefireChance, journalEntry, legalDestinations } from '../src/domain/game-engine.js';
import { leaderHint, recordStrike, strengthOf } from '../src/domain/leaders.js';
import { ceasefireRange, clampCeasefireAmount, ceasefireEstimate, ceasefireOrder, allyBlockedTarget } from '../src/presentation/v13-2-ux.js';
import { diplomacyActions } from '../src/presentation/v3-ux.js';
import { TUTORIAL_GUIDE } from '../src/presentation/v4-ux.js';
import { map, freshState } from './helpers/fixtures.js';
import { arkenV9Map } from '../src/map/arken-v9-map.js';

const app = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const atWar = (s, a, b) => s.diplomacy.wars.some(w => w.participants.includes(a) && w.participants.includes(b));
const nation = id => arkenV9Map.nations.find(n => n.id === id);

// --- 1. Frappes réellement comptées ---------------------------------------------------------------------------
test('impression : deux assauts sur le joueur → « Vous a frappé deux fois : méfiance »', () => {
  const s = freshState({ allHuman: true });
  s.controllers.oroel = 'ai';
  recordStrike(s, 'oroel', 'valmorne');
  assert.equal(leaderHint(s, 'oroel'), 'Vous a déjà frappé une fois : à surveiller');
  recordStrike(s, 'oroel', 'valmorne');
  assert.equal(leaderHint(s, 'oroel'), 'Vous a frappé deux fois : méfiance');
  recordStrike(s, 'oroel', 'valmorne');
  assert.equal(leaderHint(s, 'oroel'), 'Vous a frappé trois fois : méfiance');
});

test('impression : assauts contre une autre nation comptés aussi (« A déjà frappé deux fois »)', () => {
  const s = freshState({ allHuman: true });
  s.controllers.noireflamme = 'ai';
  recordStrike(s, 'noireflamme', 'aurel'); recordStrike(s, 'noireflamme', 'aurel');
  assert.equal(leaderHint(s, 'noireflamme'), 'A déjà frappé deux fois : à surveiller');
});

test('chaque combat réel (même guerre, deux tours) incrémente le compteur', () => {
  const s = freshState({ allHuman: true });
  s.provinces.p04.units.infantry = 400;
  for (let i = 0; i < 2; i++) {
    s.orders.push({ id: `a${i}`, kind: 'move', nationId: 'valmorne', fromId: 'p04', toId: 'p05', units: { infantry: 20, cavalry: 0, armor: 0, artillery: 0 }, warships: 0, routeType: 'land', status: 'pending', turn: s.turn });
    resolveInterturn(s, map);
  }
  assert.equal(s.ai.reputation.valmorne.strikesOn['roc-epine'], 2);
  assert.equal(s.ai.reputation.valmorne.attacks, 1, 'une seule guerre ouverte');
});

// --- 2. Propositions d'IA cohérentes après un refus ---------------------------------------------------------
function proposalSetup() {
  const s = freshState({ allHuman: true });
  s.controllers.oroel = 'ai';
  setRelation(s, { nationId: 'valmorne', target: 'oroel', type: 'war' });
  return s;
}
const aiProposes = s => { s.orders.push({ id: `p${s.turn}`, kind: 'diplomacy', nationId: 'oroel', target: 'valmorne', action: 'ceasefire', status: 'pending', turn: s.turn, amount: 0 }); resolveInterturn(s, map); return proposalsToAnswer(s, 'valmorne').find(p => p.from === 'oroel'); };

test('refus mémorisé : la proposition suivante le rappelle (texte + fenêtre) et offre de l\'or', () => {
  const s = proposalSetup();
  const first = aiProposes(s);
  assert.ok(first, 'première proposition');
  assert.equal(first.refusedBefore, undefined);
  assert.equal(respondToProposal(s, { from: 'oroel', accept: false }).ok, true);
  s.nations.oroel.treasury = 5000; // l'IA dépense son or : on lui en laisse pour l'offre
  assert.deepEqual(refusalsOf(s, 'oroel', 'valmorne', 'ceasefire').count, 1);
  const second = aiProposes(s);
  assert.equal(second.refusedBefore, 1);
  assert.ok(second.amount > 0, 'or offert après un refus');
  const msg = s.talk.find(m => m.id === second.talkId).text;
  assert.match(msg, /refus|rejetée|repoussé/);
  assert.match(msg, new RegExp(`${second.amount} or`));
  assert.match(app, /Vous avez déjà refusé/);
});

test('accepter une trêve offerte avec de l\'or : l\'or est versé (jamais plus que le trésor)', () => {
  const s = proposalSetup();
  aiProposes(s); respondToProposal(s, { from: 'oroel', accept: false });
  const p = aiProposes(s), mine = s.nations.valmorne.treasury, theirs = s.nations.oroel.treasury;
  const r = respondToProposal(s, { from: 'oroel', accept: true });
  assert.equal(r.gold, Math.min(p.amount, theirs));
  assert.equal(s.nations.valmorne.treasury, mine + r.gold);
  assert.equal(s.nations.oroel.treasury, theirs - r.gold);
  assert.equal(atWar(s, 'valmorne', 'oroel'), false);
});

test('or offert : rien d\'ordinaire, 20 % si elle perd, +15 % par refus, 50 % au plus', () => {
  const s = freshState({ allHuman: true });
  s.nations.oroel.treasury = 100;
  assert.equal(aiCeasefireGold(s, 'oroel', 'valmorne', 0), strengthOf(s, 'oroel') < .8 * strengthOf(s, 'valmorne') ? 20 : 0);
  s.provinces.p01.units.infantry = 5000; // Valmorne écrase Oroël
  assert.equal(aiCeasefireGold(s, 'oroel', 'valmorne', 0), 20);
  assert.equal(aiCeasefireGold(s, 'oroel', 'valmorne', 1), 35);
  assert.equal(aiCeasefireGold(s, 'oroel', 'valmorne', 5), 50);
});

test('l\'IA n\'insiste plus : 6 tours d\'attente après un refus, plus rien après deux refus (sauf effondrement)', () => {
  const s = proposalSetup();
  s.diplomacy.refusals = { 'oroel>valmorne>ceasefire': { count: 1, turn: s.turn } };
  s.leaders.oroel.archetype = 'batisseur'; // le Bâtisseur demande la paix dès 2 tours de guerre
  s.diplomacy.wars[0].started = s.turn - 10;
  resolveInterturn(s, map);
  assert.equal(proposalsToAnswer(s, 'valmorne').length, 0, 'pas de nouvelle offre juste après un refus');
  s.diplomacy.refusals['oroel>valmorne>ceasefire'] = { count: 2, turn: s.turn - 20 };
  for (let i = 0; i < 3; i++) resolveInterturn(s, map);
  assert.equal(proposalsToAnswer(s, 'valmorne').length, 0, 'deux refus : il n\'insiste plus');
});

// --- 3. Cessez-le-feu au montant choisi -------------------------------------------------------------------------
test('exiger de l\'or : accepté → l\'adversaire paie ; refusé → rien ne bouge', () => {
  const s = freshState({ allHuman: true });
  s.provinces.p02.units.infantry = 3000; // Valmorne domine : ses conditions ont une vraie chance
  setRelation(s, { nationId: 'valmorne', target: 'oroel', type: 'war' });
  const r = queueDiplomaticOrder(s, { nationId: 'valmorne', target: 'oroel', action: 'ceasefire', demand: 60 });
  assert.equal(r.ok, true);
  assert.equal(spendableTreasury(s, 'valmorne'), s.nations.valmorne.treasury, 'exiger ne réserve rien');
  const [me, them] = [s.nations.valmorne.treasury, s.nations.oroel.treasury];
  resolveInterturn(s, map, { random: () => 0 });
  assert.equal(atWar(s, 'valmorne', 'oroel'), false);
  assert.equal(s.nations.valmorne.treasury, me + 60 + 16);
  assert.equal(s.nations.oroel.treasury, them - 60 + 16);
  const ev = s.events.find(e => e.type === 'ceasefire-offer');
  assert.match(journalEntry(ev, map, 'valmorne').text, /accepte vos conditions et verse 60 or/);

  const t = freshState({ allHuman: true });
  t.provinces.p02.units.infantry = 3000;
  setRelation(t, { nationId: 'valmorne', target: 'oroel', type: 'war' });
  queueDiplomaticOrder(t, { nationId: 'valmorne', target: 'oroel', action: 'ceasefire', demand: 60 });
  resolveInterturn(t, map, { random: () => .99 });
  assert.equal(atWar(t, 'valmorne', 'oroel'), true);
  assert.equal(t.nations.valmorne.treasury, 136);
  assert.match(journalEntry(t.events.find(e => e.type === 'ceasefire-offer'), map, 'valmorne').text, /refuse le cessez-le-feu.*aucun or/);
});

test('payer un montant choisi : réservé, versé seulement si accepté', () => {
  const s = freshState({ allHuman: true });
  setRelation(s, { nationId: 'valmorne', target: 'oroel', type: 'war' });
  assert.equal(queueDiplomaticOrder(s, { nationId: 'valmorne', target: 'oroel', action: 'ceasefire', pay: 40 }).ok, true);
  assert.equal(spendableTreasury(s, 'valmorne'), 80);
  resolveInterturn(s, map, { random: () => 0 });
  assert.equal(s.nations.valmorne.treasury, 120 - 40 + 16);
  assert.equal(s.nations.oroel.treasury, 120 + 40 + 16);
});

test('montant choisi : refus clairs (payer ET exiger, exiger plus que son trésor, payer plus que le disponible)', () => {
  const s = freshState({ allHuman: true });
  setRelation(s, { nationId: 'valmorne', target: 'oroel', type: 'war' });
  assert.equal(queueDiplomaticOrder(s, { nationId: 'valmorne', target: 'oroel', action: 'ceasefire', pay: 10, demand: 10 }).ok, false);
  assert.equal(queueDiplomaticOrder(s, { nationId: 'valmorne', target: 'oroel', action: 'ceasefire', demand: 121 }).error, 'Vous exigez plus que son trésor');
  assert.equal(queueDiplomaticOrder(s, { nationId: 'valmorne', target: 'oroel', action: 'ceasefire', pay: 121 }).ok, false);
});

test('chance estimée : plus on exige, moins il accepte ; plus on paie, plus il accepte ; dominer aide', () => {
  const s = freshState({ allHuman: true });
  const c = o => ceasefireChance(s, 'valmorne', 'oroel', o);
  assert.ok(c({ demand: 60 }) < c({ demand: 20 }) && c({ demand: 20 }) < c({}));
  assert.ok(c({ pay: 60 }) > c({ pay: 20 }) && c({ pay: 20 }) > c({}));
  const before = c({ demand: 40 });
  s.provinces.p01.units.infantry = 3000;
  assert.ok(c({ demand: 40 }) > before, 'le dominant obtient plus facilement ses conditions');
  for (const v of [c({}), c({ pay: 999 }), c({ demand: 999 })]) assert.ok(v >= 0 && v <= .95);
});

test('écran : bornes, mode suggéré au dominant, ordre transmis', () => {
  const s = freshState({ allHuman: true });
  s.provinces.p01.units.infantry = 3000;
  const range = ceasefireRange(s, 'valmorne', 'oroel');
  assert.equal(range.maxDemand, 120);
  assert.equal(range.maxPay, 120);
  assert.equal(range.suggested.mode, 'demand');
  assert.equal(clampCeasefireAmount(range, 'demand', 500), 120);
  assert.equal(clampCeasefireAmount(range, 'none', 50), 0);
  assert.deepEqual(ceasefireOrder('demand', 30), { pay: 0, demand: 30 });
  assert.match(ceasefireEstimate(s, 'valmorne', 'oroel', 'demand', 30).label, /probable|possible/);
  assert.equal(diplomacyActions(s, 'oroel').find(a => a.id === 'ultimatum').label, 'Cessez-le-feu (payer ou exiger de l’or)');
  assert.match(app, /J’exige/); assert.match(app, /Je paie/);
});

// --- 4. Solmara ------------------------------------------------------------------------------------------------
test('Aurel s\'appelle désormais Solmara (identifiant, couleur et blason inchangés)', () => {
  assert.deepEqual(nation('aurel'), { id: 'aurel', name: 'Alliance de Solmara', short: 'Solmara', color: '#2aa99b', crest: 'sun' });
  assert.ok(!arkenV9Map.nations.some(n => /Aurel\b/.test(n.name)));
});

// --- 5. 80 tours -----------------------------------------------------------------------------------------------
test('partie en 80 tours, affichée « tour/80 », alerte à 5 tours de la fin', () => {
  assert.equal(RULES.gameLength, 80);
  assert.match(app, /turn-max/);
  const s = freshState({ allHuman: true });
  s.turn = RULES.gameLength - 5; resolveInterturn(s, map); // le tour 76 commence : 76, 77, 78, 79, 80
  const ev = s.events.find(e => e.type === 'final-turns');
  assert.ok(ev, 'alerte émise');
  assert.match(journalEntry(ev, map, 'valmorne').text, /Plus que 5 tours/);
  assert.ok(s.turnJournal.some(e => /Plus que 5 tours/.test(e.text)), 'visible dans le journal du tour');
  resolveInterturn(s, map);
  assert.equal(s.events.filter(e => e.type === 'final-turns').length, 1);
  assert.match(TUTORIAL_GUIDE.find(x => x.id === 'endgame').text, /80 tours/);
});

// --- 6. Alliés ------------------------------------------------------------------------------------------------
test('province alliée : signalée avant la saisie des troupes, plus proposée en vert ; rupture ordonnée → possible', () => {
  const s = freshState({ allHuman: true });
  setRelation(s, { nationId: 'valmorne', target: 'roc-epine', type: 'alliance' });
  assert.ok(legalDestinations(map, s, 'p04').some(d => d.id === 'p05'), 'p05 voisine de p04');
  assert.equal(allyBlockedTarget(s, 'valmorne', 'p05'), 'roc-epine');
  assert.equal(allyBlockedTarget(s, 'valmorne', 'p04'), null);
  queueDiplomaticOrder(s, { nationId: 'valmorne', target: 'roc-epine', action: 'break' });
  assert.equal(allyBlockedTarget(s, 'valmorne', 'p05'), null);
  assert.match(app, /ALLIÉ · ATTAQUE IMPOSSIBLE/);
  assert.match(app, /Votre allié : vous ne pouvez pas l’attaquer/);
});

// --- 7. Textes ------------------------------------------------------------------------------------------------
test('textes d\'aide courts (280 caractères au plus)', () => {
  for (const x of TUTORIAL_GUIDE) assert.ok(x.text.length <= 280, x.id);
  assert.match(TUTORIAL_GUIDE.find(x => x.id === 'diplomacy').text, /exigez de l’or/);
});

test('trêve conclue le tour même où l\'IA la proposait : plus de « répondez Oui ou Non » caduc au journal', () => {
  const s = freshState({ allHuman: true });
  s.controllers.oroel = 'ai';
  s.provinces.p02.units.infantry = 3000;
  setRelation(s, { nationId: 'valmorne', target: 'oroel', type: 'war' });
  s.orders.push({ id: 'ia', kind: 'diplomacy', nationId: 'oroel', target: 'valmorne', action: 'ceasefire', status: 'pending', turn: s.turn, amount: 0 });
  queueDiplomaticOrder(s, { nationId: 'valmorne', target: 'oroel', action: 'ceasefire', demand: 0, pay: 0 });
  resolveInterturn(s, map, { random: () => .99 });
  assert.equal(atWar(s, 'valmorne', 'oroel'), false, 'paix sans or : l\'IA qui la proposait signe');
  assert.equal(proposalsToAnswer(s, 'valmorne').length, 0);
  assert.ok(!s.turnJournal.some(e => /répondez Oui ou Non/.test(e.text)));
});
