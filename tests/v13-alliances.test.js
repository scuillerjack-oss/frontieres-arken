// V13 — alliances (pas de guerre entre alliés, demandes d'aide, propositions Oui / Non), échanges publics
// (gradation des tons, conversation close, tension en %), récit d'introduction et prise de capitale.
// Voir docs/V13-alliances-echanges.md.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { arkenV9Map as map } from '../src/map/arken-v9-map.js';
import { createGameState } from '../src/state/create-game-state.js';
import { resolveInterturn, planAIOrders, queueDiplomaticOrder, queueMoveOrder, setRelation, journalEntry, buildTurnJournal, proposalsToAnswer, respondToProposal } from '../src/domain/game-engine.js';
import { RULES } from '../src/domain/constants.js';
import { tensionLevel, getTension, setTension, TALK_TENSION, recordAggression } from '../src/domain/leaders.js';
import { talkOptions, queueTalk, publishTalk, allTalkLines, ARCHETYPE_LINES } from '../src/domain/talk.js';
import { queueHelpRequest, helpDecision, helpPacts, HELP_TURNS, activeHelpPacts } from '../src/domain/alliances.js';
import { diplomacyActions } from '../src/presentation/v3-ux.js';
import { talkFeed, talkBadgeCount, tensionGauge } from '../src/presentation/v11-ux.js';
import { INTRO_STORY, capitalPopups, tensionText, helpChoices, helpPactsFor } from '../src/presentation/v13-ux.js';
import { map as landMap, freshState, assertInvariants } from './helpers/fixtures.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = p => readFileSync(join(root, p), 'utf8');
const NATIONS = map.nations.map(n => n.id);
/** Joueur Valmorne ; seules les nations listées dans `ai` sont des IA, avec l'archétype donné. */
function scenario(ai = {}, { seed = 'v13' } = {}) {
  const s = createGameState({ map, playerNationId: 'valmorne', seed });
  for (const id of NATIONS) s.controllers[id] = ai[id] ? 'ai' : 'human';
  s.controllers.valmorne = 'human';
  s.leaders = Object.fromEntries(Object.entries(ai).map(([id, archetype]) => [id, { archetype, revealed: false }]));
  return s;
}
const atWar = (s, a, b) => s.diplomacy.wars.some(w => w.participants.includes(a) && w.participants.includes(b));
const allied = (s, a, b) => s.diplomacy.treaties.some(t => t.type === 'alliance' && t.parties.includes(a) && t.parties.includes(b));
const ordersOf = (s, id) => s.orders.filter(o => o.nationId === id && o.status === 'pending');
const replan = s => { s.ai.plannedTurn = null; s.orders = s.orders.filter(o => o.nationId === s.playerNationId); planAIOrders(s, map); };
function arm(s, provinceId, ships = 4) { const p = s.provinces[provinceId]; p.buildings.port = 1; p.buildings.factory = 1; p.warships = ships; p.units.infantry += 200; p.units.armor += 4; }
/** Demande d'aide du joueur à `ally`, résolue à l'inter-tour ; renvoie l'événement de réponse. */
function ask(s, ally, kind, target = null, provinceId = null) {
  assert.equal(queueHelpRequest(s, { from: 'valmorne', to: ally, kind, target, provinceId }).ok, true);
  const start = s.events.length;
  resolveInterturn(s, map);
  return s.events.slice(start).find(e => e.type === 'help-answer');
}
/** Taux d'acceptation d'un archétype sur de nombreuses graines (décision pure, déterministe). */
function acceptRate(arch, kind, n = 60) {
  let yes = 0;
  for (let i = 0; i < n; i++) {
    const s = scenario({ 'roc-epine': arch }, { seed: `rate-${i}` });
    setRelation(s, { nationId: 'valmorne', target: 'roc-epine', type: 'alliance' });
    if (helpDecision(s, 'roc-epine', { from: 'valmorne', kind, target: 'aurel' }).accept) yes++;
  }
  return yes / n;
}

// --- 1. Pas de guerre entre alliés ------------------------------------------------------------------------------
test('V13 : pas de guerre entre alliés — ni déclaration, ni attaque, tant que l\'alliance tient', () => {
  const s = scenario({ oroel: 'heros' });
  arm(s, 'p03');
  setRelation(s, { nationId: 'valmorne', target: 'oroel', type: 'alliance' });
  assert.equal(queueDiplomaticOrder(s, { nationId: 'valmorne', target: 'oroel', action: 'war' }).error, 'Vous êtes alliés : rompez d’abord l’alliance');
  // V13.4 (changement voulu, retour de Jack) : vers un allié, l'ordre est un PASSAGE (stationnement), pas une attaque.
  const landing = queueMoveOrder(s, map, { nationId: 'valmorne', fromId: 'p03', toId: 'p14', units: { infantry: 50 }, warships: 2 });
  assert.equal(landing.ok, true, 'passage par mer vers un allié');
  assert.equal(s.orders.find(o => o.id === landing.orderId).passage, true);
  s.orders = s.orders.filter(o => o.id !== landing.orderId);
  const actions = diplomacyActions(s, 'oroel');
  assert.equal(actions.find(a => a.id === 'war').enabled, false);
  assert.match(actions.find(a => a.id === 'war').reason, /rompez d’abord/);
  assert.ok(actions.find(a => a.id === 'break')?.enabled, 'rompre l\'alliance est proposé');
  assert.equal(diplomacyActions(s, 'aurel').some(a => a.id === 'break'), false, 'pas de rupture sans alliance');
  // Rompre sans attaquer : alliance rompue, publique, pas de guerre ; ensuite la guerre redevient possible.
  assert.equal(queueDiplomaticOrder(s, { nationId: 'valmorne', target: 'oroel', action: 'break' }).ok, true);
  resolveInterturn(s, map);
  assert.equal(allied(s, 'valmorne', 'oroel'), false);
  assert.equal(atWar(s, 'valmorne', 'oroel'), false);
  const ev = s.events.find(e => e.type === 'alliance-broken');
  assert.ok(ev);
  assert.match(journalEntry(ev, map, 'valmorne').text, /Valmorne rompt son alliance avec Oroël/);
  assert.equal(queueDiplomaticOrder(s, { nationId: 'valmorne', target: 'oroel', action: 'war' }).ok, true);
});

test('V13 : en simulation IA contre IA, jamais deux nations à la fois alliées et en guerre ; le Traître trahit toujours', () => {
  let betrayals = 0;
  for (const seed of ['allies-1', 'allies-2', 'allies-3']) {
    const s = createGameState({ map, playerNationId: 'valmorne', seed });
    for (const id of NATIONS) s.controllers[id] = 'ai';
    for (let t = 0; t < 40; t++) {
      resolveInterturn(s, map);
      assertInvariants(s, seed);
      for (const w of s.diplomacy.wars) assert.ok(!allied(s, w.participants[0], w.participants[1]), `${seed} tour ${s.turn} : alliés en guerre`);
    }
    betrayals += s.events.filter(e => e.type === 'betrayal').length;
  }
  assert.ok(betrayals >= 1, 'la trahison (rupture + attaque) existe toujours');
});

// --- 2. Demandes d'aide selon le caractère ------------------------------------------------------------------------
test('V13 : Héros — « Défends-moi » accepté ; il masse des renforts et déclare la guerre à l\'agresseur', () => {
  const s = scenario({ 'roc-epine': 'heros', aurel: 'conquerant' });
  setRelation(s, { nationId: 'valmorne', target: 'roc-epine', type: 'alliance' });
  s.provinces.p05.buildings.port = 1;
  setRelation(s, { nationId: 'aurel', target: 'valmorne', type: 'war' });
  const answer = ask(s, 'roc-epine', 'defend');
  assert.equal(answer.accepted, true);
  const pact = helpPacts(s).find(p => p.ally === 'roc-epine');
  assert.ok(pact && !pact.fake);
  // V14.2 : durée = trajet estimé + HELP_TURNS tours d'aide sur place.
  assert.equal(pact.until - pact.turn, pact.travel + HELP_TURNS);
  assert.ok(pact.travel >= 1);
  // Réponse dans les échanges (sans bouton Répondre) et dans le journal (AIDE).
  const msg = s.talk.find(m => m.id === answer.talkId);
  assert.equal(msg.from, 'roc-epine'); assert.equal(msg.to, 'valmorne');
  assert.ok(!(s.talkPending.valmorne || []).includes(msg.id), 'la réponse n\'appelle pas de réponse');
  const entry = journalEntry(answer, map, 'valmorne');
  assert.equal(entry.type, 'AIDE'); assert.match(entry.text, /Roc-Épine accepte de vous défendre/);
  assert.ok(buildTurnJournal(s, map, 0).some(e => e.type === 'AIDE'));
  // Effet réel dans les ordres de l'IA.
  replan(s);
  const mine = ordersOf(s, 'roc-epine');
  assert.ok(mine.some(o => o.kind === 'diplomacy' && o.action === 'war' && o.target === 'aurel'), 'guerre déclarée à l\'agresseur');
  assert.ok(mine.some(o => o.kind === 'move' && o.help && o.toId === 'p05'), 'renforts vers sa base navale');
  // Sans demande, aucun de ces ordres.
  const ref = scenario({ 'roc-epine': 'heros', aurel: 'conquerant' });
  setRelation(ref, { nationId: 'valmorne', target: 'roc-epine', type: 'alliance' });
  ref.provinces.p05.buildings.port = 1;
  setRelation(ref, { nationId: 'aurel', target: 'valmorne', type: 'war' });
  resolveInterturn(ref, map); replan(ref);
  assert.ok(!ordersOf(ref, 'roc-epine').some(o => (o.kind === 'diplomacy' && o.action === 'war') || o.help));
});

test('V13 : Héros — attaque un agresseur avec le joueur ; Conquérant — accepte volontiers d\'attaquer et attaque', () => {
  const h = scenario({ 'roc-epine': 'heros' });
  setRelation(h, { nationId: 'valmorne', target: 'roc-epine', type: 'alliance' });
  recordAggression(h, 'aurel', 'oroel');
  assert.equal(helpDecision(h, 'roc-epine', { from: 'valmorne', kind: 'attack', target: 'aurel' }).accept, true, 'Aurel est un agresseur');
  assert.ok(acceptRate('conquerant', 'attack') >= .75, `Conquérant : ${acceptRate('conquerant', 'attack')}`);
  // Effet : le Conquérant déclare la guerre à X et l'attaque (débarquement escorté depuis Belrivage).
  let s, answer;
  for (let i = 0; i < 20 && !answer?.accepted; i++) {
    s = scenario({ 'roc-epine': 'conquerant' }, { seed: `conq-${i}` });
    setRelation(s, { nationId: 'valmorne', target: 'roc-epine', type: 'alliance' });
    arm(s, 'p07', 6); s.provinces.p07.units.infantry += 400; s.provinces.p07.units.armor += 8; // V13 : anneau p07↔p17, capitale d'Aurel estimée sous le brouillard
    s.turn = 3;
    answer = ask(s, 'roc-epine', 'attack', 'aurel');
  }
  assert.equal(answer.accepted, true);
  replan(s);
  assert.ok(ordersOf(s, 'roc-epine').some(o => o.kind === 'diplomacy' && o.action === 'war' && o.target === 'aurel'), 'guerre déclarée à Aurel');
  // L'aide promise passe avant sa propre proie : le débarquement vise Aurel (V13 : seule voisine maritime hostile visée).
  const strike = ordersOf(s, 'roc-epine').find(o => o.kind === 'move' && s.provinces[o.toId].ownerId !== 'roc-epine');
  assert.ok(strike, 'une attaque part');
  assert.equal(s.provinces[strike.toId].ownerId, 'aurel', 'contre Aurel');
  resolveInterturn(s, map);
  assert.ok(atWar(s, 'roc-epine', 'aurel'), 'la guerre est réelle');
});

test('V13 : Bâtisseur — refuse souvent d\'attaquer, accepte plus volontiers de défendre ; refus clair dans le journal', () => {
  const attack = acceptRate('batisseur', 'attack'), defend = acceptRate('batisseur', 'defend');
  assert.ok(attack <= .3, `attaque acceptée ${attack}`);
  assert.ok(defend >= .5, `défense acceptée ${defend}`);
  assert.ok(acceptRate('heros', 'defend') === 1, 'le Héros vient toujours défendre');
  // Un refus : message neutre, journal « refuse », aucun engagement, aucun ordre de guerre.
  let s, answer;
  for (let i = 0; i < 20 && answer?.accepted !== false; i++) {
    s = scenario({ 'roc-epine': 'batisseur' }, { seed: `bat-${i}` });
    setRelation(s, { nationId: 'valmorne', target: 'roc-epine', type: 'alliance' });
    answer = ask(s, 'roc-epine', 'attack', 'aurel');
  }
  assert.equal(answer.accepted, false);
  assert.match(journalEntry(answer, map, 'valmorne').text, /Roc-Épine refuse d’attaquer Solmara avec vous/);
  assert.equal(helpPacts(s).length, 0);
  replan(s);
  assert.ok(!ordersOf(s, 'roc-epine').some(o => o.kind === 'diplomacy' && o.action === 'war'));
});

test('V13 : Traître — accepte tout… et ne vient pas ; la promesse non tenue apparaît à l\'échéance', () => {
  const s = scenario({ 'roc-epine': 'traitre', aurel: 'conquerant' });
  setRelation(s, { nationId: 'valmorne', target: 'roc-epine', type: 'alliance' });
  s.ai.plans = { 'roc-epine': { mark: 'oroel', strikeTurn: 60 } }; // il ne vise pas le joueur dans ce scénario
  s.provinces.p05.buildings.port = 1;
  arm(s, 'p07', 6);
  setRelation(s, { nationId: 'aurel', target: 'valmorne', type: 'war' });
  const answer = ask(s, 'roc-epine', 'attack', 'aurel');
  assert.equal(answer.accepted, true, 'il accepte');
  assert.match(journalEntry(answer, map, 'valmorne').text, /accepte d’attaquer Solmara avec vous/);
  assert.equal(helpPacts(s)[0].fake, true);
  assert.equal(activeHelpPacts(s, 'roc-epine').length, 0, 'aucun engagement tenu');
  assert.equal(helpPactsFor(s, 'roc-epine')[0].kind, 'attack', 'le joueur voit une promesse comme une autre');
  assert.equal('fake' in helpPactsFor(s, 'roc-epine')[0], false, 'sans savoir qu\'elle est fausse');
  let broken = null;
  for (let i = 0; i < HELP_TURNS + 6 && !broken; i++) { // V14.2 : trajet + 5 tours
    replan(s);
    assert.ok(!ordersOf(s, 'roc-epine').some(o => (o.kind === 'diplomacy' && o.action === 'war' && o.target === 'aurel') || (o.kind === 'move' && s.provinces[o.toId].ownerId === 'aurel') || o.help), 'il ne vient pas');
    s.orders = s.orders.filter(o => o.nationId === 'valmorne');
    const start = s.events.length; resolveInterturn(s, map);
    broken = s.events.slice(start).find(e => e.type === 'help-broken');
  }
  assert.ok(broken, 'promesse non tenue');
  assert.equal(atWar(s, 'roc-epine', 'aurel'), false);
  assert.match(journalEntry(broken, map, 'valmorne').text, /avait promis d’attaquer Solmara avec vous… et n’est jamais venu/);
  assert.equal(helpPacts(s).length, 0);
});

test('V13 : demandes d\'aide — seulement à un allié IA, gratuites, une par allié et par tour ; choix proposés cohérents', () => {
  const s = scenario({ 'roc-epine': 'heros', oroel: 'batisseur' });
  assert.match(queueHelpRequest(s, { from: 'valmorne', to: 'roc-epine', kind: 'defend' }).error, /allié/);
  setRelation(s, { nationId: 'valmorne', target: 'roc-epine', type: 'alliance' });
  setRelation(s, { nationId: 'valmorne', target: 'oroel', type: 'alliance' });
  assert.equal(queueHelpRequest(s, { from: 'valmorne', to: 'roc-epine', kind: 'attack' }).ok, false, 'cible obligatoire');
  assert.equal(queueHelpRequest(s, { from: 'valmorne', to: 'roc-epine', kind: 'attack', target: 'oroel' }).error, 'Cette nation est votre alliée');
  assert.equal(queueHelpRequest(s, { from: 'valmorne', to: 'roc-epine', kind: 'defend', provinceId: 'p05' }).ok, false, 'province d\'un autre');
  const gold = s.nations.valmorne.treasury;
  assert.equal(queueHelpRequest(s, { from: 'valmorne', to: 'roc-epine', kind: 'defend', provinceId: 'p03' }).ok, true);
  assert.equal(queueHelpRequest(s, { from: 'valmorne', to: 'roc-epine', kind: 'attack', target: 'aurel' }).replaced, true);
  assert.equal(s.orders.filter(o => o.kind === 'help').length, 1);
  assert.equal(s.nations.valmorne.treasury, gold, 'aucun paiement');
  const c = helpChoices(s, map, 'roc-epine');
  assert.deepEqual(c.attackTargets.map(n => n.id).sort(), ['aurel'], 'V13 : Roc-Épine n\'atteint qu\'Aurel (et Valmorne, le joueur) par l\'anneau');
  assert.deepEqual(c.provinces.map(p => p.id), ['p01', 'p02', 'p03', 'p04']);
  // Allié de la cible : refus motivé.
  setRelation(s, { nationId: 'roc-epine', target: 'aurel', type: 'alliance' });
  assert.equal(helpDecision(s, 'roc-epine', { from: 'valmorne', kind: 'attack', target: 'aurel' }).reason, 'ally-of-target');
});

// --- 3. Propositions d'alliance : fenêtre Oui / Non, jamais d'un allié ----------------------------------------------
test('V13 : propositions reçues — Oui = alliance immédiate, Non = refus ; jamais de proposition d\'une nation déjà alliée', () => {
  const s = scenario({ aurel: 'traitre' }, { seed: 'propose' });
  s.ai.plans = { aurel: { mark: 'valmorne', strikeTurn: 40 } };
  for (let i = 0; i < 4 && !proposalsToAnswer(s).length; i++) resolveInterturn(s, map);
  const [p] = proposalsToAnswer(s, 'valmorne', { fresh: true });
  assert.ok(p, 'proposition fraîche, à afficher après le journal');
  assert.equal(p.action, 'alliance');
  assert.equal(respondToProposal(s, { from: 'aurel', accept: true }).ok, true);
  assert.ok(allied(s, 'valmorne', 'aurel'), 'alliance conclue tout de suite');
  assert.ok(!(s.talkPending.valmorne || []).includes(p.talkId), 'le message n\'attend plus de réponse');
  // Allié : plus aucune proposition d'alliance, ni message qui en propose une, pendant 12 tours.
  const charm = /alliance entre nous|Unissons-nous|soyons alliés/;
  const before = s.talk.length;
  for (let i = 0; i < 12; i++) {
    resolveInterturn(s, map);
    assert.equal(proposalsToAnswer(s).length, 0, `tour ${s.turn}`);
    // V14.2 : le Traître peut courtiser d'AUTRES nations (plusieurs alliés à trahir) ; jamais à nouveau son allié.
    assert.ok(!(s.diplomacy.proposals || []).some(x => x.from === 'aurel' && x.to === 'valmorne'));
  }
  assert.ok(!s.talk.slice(before).some(m => m.from === 'aurel' && m.to === 'valmorne' && charm.test(m.text)), 'aucune offre d\'alliance d\'un allié');
  // Filet : une proposition injectée d'une nation alliée n'est jamais affichée.
  s.diplomacy.proposals.push({ from: 'aurel', to: 'valmorne', action: 'alliance', turn: s.turn - 1, talkId: null });
  assert.equal(proposalsToAnswer(s, 'valmorne', { fresh: true }).length, 0);
  // Refus.
  const r = scenario({ aurel: 'traitre' }, { seed: 'propose' });
  r.ai.plans = { aurel: { mark: 'valmorne', strikeTurn: 40 } };
  for (let i = 0; i < 4 && !proposalsToAnswer(r).length; i++) resolveInterturn(r, map);
  const t0 = getTension(r, 'valmorne', 'aurel');
  assert.equal(respondToProposal(r, { from: 'aurel', accept: false }).accepted, false);
  assert.equal(allied(r, 'valmorne', 'aurel'), false);
  assert.equal(proposalsToAnswer(r).length, 0);
  assert.ok(getTension(r, 'valmorne', 'aurel') > t0);
  assert.equal(respondToProposal(r, { from: 'aurel', accept: true }).ok, false, 'proposition close');
});

// --- 4. Échanges : gradation, conversation close, pas d'écho -------------------------------------------------------
test('V13 : textes — vraie gradation, plusieurs variantes par ton et par personnalité, sans insulte', () => {
  const lines = allTalkLines();
  assert.ok(lines.length >= 150, `${lines.length} lignes`);
  for (const l of lines) {
    assert.doesNotMatch(l, /\b(idiot|imbécile|crétin|abruti|connard|salaud|merde|putain|con|minable|lâche|débile)s?\b/i, l);
    assert.ok(/[.!?…]$/.test(l), `ponctuation finale : ${l}`);
    assert.doesNotMatch(l, /'/, `apostrophe typographique : ${l}`);
  }
  for (const arch of ['heros', 'conquerant', 'traitre', 'batisseur']) for (const tone of ['hostile', 'neutre', 'amical'])
    assert.ok(ARCHETYPE_LINES[arch][tone].length >= 3, `${arch}/${tone}`);
  // Hostile : au moins 4 variantes par situation pour le joueur.
  const s = scenario({ aurel: 'heros' });
  const texts = new Set();
  for (let t = 1; t < 30; t++) { s.turn = t; texts.add(talkOptions(s, map, { from: 'valmorne', to: 'oroel' })[0].text); }
  assert.ok(texts.size >= 4, `${texts.size} variantes hostiles`);
});

test('V13 : une conversation se termine — plus de « Répondre » après réponse, badge effacé, pas d\'écho de l\'IA', () => {
  const s = scenario({ aurel: 'traitre' });
  const msg = publishTalk(s, { from: 'aurel', to: 'valmorne', tone: 'hostile', text: 'Aurel → Valmorne', ai: true });
  assert.equal(talkBadgeCount(s), 1);
  assert.equal(talkFeed(s).find(m => m.id === msg.id).awaitingReply, true);
  assert.equal(queueTalk(s, map, { from: 'valmorne', to: 'aurel', tone: 'hostile', replyTo: msg.id }).ok, true);
  assert.equal(talkBadgeCount(s), 0, 'badge effacé dès la réponse préparée');
  assert.equal(talkFeed(s).find(m => m.id === msg.id).awaitingReply, false, 'plus de bouton Répondre');
  resolveInterturn(s, map);
  assert.equal(talkBadgeCount(s), 0);
  assert.equal(queueTalk(s, map, { from: 'valmorne', to: 'aurel', tone: 'amical', replyTo: msg.id }).error, 'Vous avez déjà répondu à ce message');
  const reply = s.talk.find(m => m.from === 'valmorne' && m.replyTo === msg.id);
  assert.ok(reply);
  assert.ok(!s.talk.some(m => m.replyTo === reply.id), 'aucune réponse en écho à la réponse du joueur');
  // Sur de nombreuses parties : l'IA répond parfois à un message du joueur, jamais à une réponse ; et sa réponse clôt
  // l'échange (elle n'attend pas de réponse du joueur).
  let aiReplies = 0;
  for (let i = 0; i < 25; i++) {
    const g = createGameState({ map, playerNationId: 'valmorne', seed: `echo-${i}` });
    const m = publishTalk(g, { from: 'oroel', to: 'valmorne', tone: 'amical', text: '…', ai: true });
    queueTalk(g, map, { from: 'valmorne', to: 'oroel', tone: 'hostile', replyTo: m.id });
    queueTalk(g, map, { from: 'valmorne', to: 'aurel', tone: 'hostile' });
    resolveInterturn(g, map);
    const mine = g.talk.filter(x => x.from === 'valmorne');
    assert.ok(!g.talk.some(x => x.replyTo === mine.find(y => y.to === 'oroel').id), 'pas d\'écho');
    const back = g.talk.find(x => x.replyTo === mine.find(y => y.to === 'aurel').id);
    if (back) { aiReplies++; assert.ok(!(g.talkPending.valmorne || []).includes(back.id), 'réponse de l\'IA : échange clos'); }
  }
  assert.ok(aiReplies >= 3, `${aiReplies} réponses de l'IA à un message du joueur`);
});

// --- 5. Tension en %, cohérente avec les faits ---------------------------------------------------------------------
test('V13 : tension en % — une menace la fait bondir, l\'aperçu et le journal parlent en %', () => {
  // V14.2 : le Bâtisseur se fiche des provocations (+8) ; la règle générale (+20) se vérifie sur un Héros.
  const s = scenario({ oroel: 'heros' });
  assert.equal(TALK_TENSION.hostile, 20);
  const [hostile] = talkOptions(s, map, { from: 'valmorne', to: 'oroel' });
  assert.match(hostile.preview, /^Tension 10 % → 30 % \(\+20/); // V14.2 : « , jusqu'à 45 % selon son caractère » si non révélé
  queueTalk(s, map, { from: 'valmorne', to: 'oroel', tone: 'hostile' }); resolveInterturn(s, map);
  assert.ok(getTension(s, 'valmorne', 'oroel') >= 25, 'bond net après une menace (palier « tendu » dès le premier message)');
  const ev = s.events.find(e => e.type === 'tension' && e.target === 'oroel' || e.type === 'tension' && e.nationId === 'oroel');
  assert.ok(ev);
  assert.match(journalEntry(ev, map, 'valmorne').text, /\d+ %\)/);
  assert.deepEqual(tensionText({ value: 42, label: 'tendu' }), { value: 42, short: '42 %', long: '42 % · tendu', war: false });
  assert.deepEqual(tensionText({ value: 85, label: 'en guerre' }), { value: 85, short: 'En guerre', long: 'En guerre · 85 %', war: true });
  assert.equal(tensionGauge({ value: 85, label: 'en guerre' }).cls, 'tension-4');
  // Interface : % partout où la tension apparaît.
  const app = read('app.js');
  assert.match(app, /Tension \$\{t\.value\} % · \$\{t\.label\}/);
  assert.match(app, /En guerre/);
  assert.doesNotMatch(app, /\$\{t\.value\} \/ 100/);
});

test('V13 : une attaque déclare la guerre IMMÉDIATEMENT ; en guerre, l\'affichage dit « en guerre », jamais « au bord de la guerre »', () => {
  const s = freshState({ allHuman: true });
  s.provinces.p04.units.infantry = 300;
  assert.equal(queueMoveOrder(s, landMap, { nationId: 'valmorne', fromId: 'p04', toId: 'p05', units: { infantry: 100 } }).ok, true);
  const start = s.events.length;
  resolveInterturn(s, landMap);
  const turn = s.events.slice(start);
  assert.ok(turn.some(e => e.type === 'battle' || e.type === 'conquest'), 'un combat a eu lieu');
  assert.ok(atWar(s, 'valmorne', 'roc-epine'), 'guerre immédiate');
  assert.deepEqual(tensionLevel(s, 'valmorne', 'roc-epine').label, 'en guerre');
  assert.ok(!turn.some(e => e.type === 'tension' && [e.nationId, e.target].includes('roc-epine') && [e.nationId, e.target].includes('valmorne')), 'pas de « au bord de la guerre » après le combat');
  const j = buildTurnJournal(s, landMap, start);
  assert.ok(!j.some(e => /au bord de la guerre/.test(e.text)));
  setTension(s, 'valmorne', 'roc-epine', 100);
  assert.equal(tensionLevel(s, 'valmorne', 'roc-epine').label, 'en guerre');
});

// --- 6. Récit d'introduction et prise de capitale -------------------------------------------------------------------
test('V13 : récit d\'introduction — court, évocateur, les quatre masques et l\'appel à les démasquer', () => {
  const text = INTRO_STORY.paragraphs.join(' ');
  assert.match(text, /Parmi les 4 dirigeants .*un Héros, un Conquérant, un Traître et un Bâtisseur/);
  assert.match(text, /[Dd]émasquez-les/);
  assert.match(text, /actes/);
  assert.ok(text.length < 600, 'texte court');
  const app = read('app.js');
  // V13.4 : après le récit, le mini tuto (première partie) ou les bulles contextuelles.
  assert.match(app, /showGame\(\);await showIntro\(\);(if\(shouldStartMiniTuto\(\)\)\{startMiniTuto\(\);return;\})?tutorial\(/, 'une fois, au début d\'une nouvelle partie');
  assert.doesNotMatch(app.match(/function continueSavedGame[^\n]*/)[0], /showIntro/, 'pas en reprenant une partie');
  assert.match(read('index.html'), /<dialog id="eventDialog"/);
});

test('V13 : prise de capitale — minimum garanti payé même si la victime est pauvre ; fenêtres pour le joueur', () => {
  assert.equal(RULES.capitalPlunderMin, 60);
  const s = freshState({ allHuman: true });
  s.nations['roc-epine'].treasury = 10;
  s.provinces.p04.units.infantry = 1000;
  queueMoveOrder(s, landMap, { nationId: 'valmorne', fromId: 'p04', toId: 'p05', units: { infantry: 1000 } });
  const start = s.events.length;
  resolveInterturn(s, landMap);
  const ev = s.events.find(e => e.type === 'capital-plunder');
  assert.deepEqual([ev.amount, ev.fromTreasury, ev.loot, ev.warChest], [60, 10, 50, 30]);
  assert.equal(s.nations['roc-epine'].treasury, 0 + 12, 'la victime ne descend jamais sous zéro (revenu de 3 provinces)');
  assert.equal(s.nations.valmorne.treasury, 120 + 30 + 60 + 20);
  assert.match(journalEntry(ev, landMap, 'valmorne').text, /pille 60 or \(minimum garanti : 10 or du trésor de Roc-Épine, 50 or de butin\)/);
  const names = { nation: id => landMap.nations.find(n => n.id === id).short, province: id => landMap.provinces.find(p => p.id === id).name };
  const [won] = capitalPopups(s.events.slice(start), 'valmorne', names);
  assert.equal(won.kind, 'won'); assert.equal(won.title, '👑 Capitale conquise !');
  assert.equal(won.lead, 'Vous pillez 60 or'); assert.equal(won.total, 90);
  const [lost] = capitalPopups(s.events.slice(start), 'roc-epine', names);
  assert.equal(lost.kind, 'lost'); assert.equal(lost.title, 'Votre capitale est tombée'); assert.equal(lost.amount, 10);
  assert.deepEqual(capitalPopups(s.events.slice(start), 'aurel', names), [], 'rien pour un témoin');
  // Trésor vide : tout le minimum vient du butin ; élision correcte.
  const ev0 = { type: 'capital-plunder', attacker: 'valmorne', defender: 'oroel', provinceId: 'p13', amount: 60, fromTreasury: 0, loot: 60, warChest: 0 };
  assert.match(journalEntry(ev0, map, 'valmorne').text, /pille 60 or de butin \(trésor d’Oroël vide : minimum garanti\)/);
  assert.match(capitalPopups([ev0], 'valmorne', { nation: id => map.nations.find(n => n.id === id).short, province: () => 'Glacenoire' })[0].text, /Le trésor d’Oroël est pillé/);
  // Victime riche : 50 % de son trésor (au-dessus du minimum), comme en V10.
  const r = freshState({ allHuman: true });
  r.nations['roc-epine'].treasury = 400; r.provinces.p04.units.infantry = 1000;
  queueMoveOrder(r, landMap, { nationId: 'valmorne', fromId: 'p04', toId: 'p05', units: { infantry: 1000 } });
  resolveInterturn(r, landMap);
  const rich = r.events.find(e => e.type === 'capital-plunder');
  assert.deepEqual([rich.amount, rich.fromTreasury, rich.loot], [200, 200, 0]);
});

test('V13 : enchaînement à la fin du tour — capitale, puis journal, puis une fenêtre Oui / Non par proposition', () => {
  const app = read('app.js');
  const flow = app.match(/\$\('#confirmEndTurn'\)\.onclick=async\(\)=>\{[\s\S]*?\};/)[0];
  const i = k => flow.indexOf(k);
  assert.ok(i('showCapitalPopups') > 0 && i('showCapitalPopups') < i('renderJournal(false)'));
  assert.ok(i('dialogClosed($(\'#journalDialog\'))') > i('renderJournal(false)'));
  assert.ok(i('showProposalPopups') > i('dialogClosed'));
  assert.match(app, /buttons:\[\{label:'Non',value:false\},\{label:'Oui',value:true,primary:true\}\]/);
  assert.match(app, /proposalsToAnswer\(state,state\.playerNationId,\{fresh:true\}\)/);
});
