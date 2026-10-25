// V11 — personnalités des dirigeants, diplomatie IA, tension et échanges publics (docs/V11-contrat.md).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { arkenV9Map as map } from '../src/map/arken-v9-map.js';
import { createGameState } from '../src/state/create-game-state.js';
import { resolveInterturn, planAIOrders, queueDiplomaticOrder, setRelation, journalEntry, eventKnownToPlayer, buildTurnJournal, gameRanking } from '../src/domain/game-engine.js';
import { encodeSave, decodeSave, migrateSave } from '../src/persistence/save-codec.js';
import { ARCHETYPES, assignLeaders, tensionLevel, leaderHint, getTension, setTension, acceptsAlliance, recordAggression } from '../src/domain/leaders.js';
import { talkOptions, queueTalk, TALK_LIMIT } from '../src/domain/talk.js';
import { talkOptions as uiTalkOptions, queueTalk as uiQueueTalk, tensionLevel as uiTension, leaderHint as uiHint } from '../src/presentation/v11-talk-ui.js';
import { seededRandom, assertInvariants } from './helpers/fixtures.js';

const NATIONS = map.nations.map(n => n.id);
const OTHERS = NATIONS.filter(id => id !== 'valmorne');
/** Partie de test : joueur Valmorne ; seules les nations listées dans `ai` sont pilotées par l'IA, avec l'archétype donné. */
function scenario(ai = {}, { seed = 'scenario' } = {}) {
  const s = createGameState({ map, playerNationId: 'valmorne', seed });
  for (const id of NATIONS) s.controllers[id] = ai[id] ? 'ai' : 'human';
  s.controllers.valmorne = 'human';
  s.leaders = Object.fromEntries(Object.entries(ai).map(([id, archetype]) => [id, { archetype, revealed: false }]));
  return s;
}
const ordersOf = (s, id) => s.orders.filter(o => o.nationId === id && o.status === 'pending');
const replan = s => { s.ai.plannedTurn = null; s.orders = []; planAIOrders(s, map); };
const atWar = (s, a, b) => s.diplomacy.wars.some(w => w.participants.includes(a) && w.participants.includes(b));
const allied = (s, a, b) => s.diplomacy.treaties.some(t => t.type === 'alliance' && t.parties.includes(a) && t.parties.includes(b));
/** Donne un port, une usine et une flotte à une nation (prête à débarquer). */
// V13 : sous le brouillard, l'IA ne voit pas la côte d'en face (estimation prudente, capitale incluse) : la flotte
// de test est assez forte pour oser débarquer sur une capitale estimée.
function arm(s, provinceId, ships = 4) { const p = s.provinces[provinceId]; p.buildings.port = 1; p.buildings.factory = 1; p.warships = ships; p.units.infantry += 600; p.units.armor += 12; }

// --- Attribution des personnalités ---------------------------------------------------------------------------
test('V11 : 4 archétypes distincts, cachés, attribués aux 4 nations IA ; déterministes par graine, redistribués entre parties', () => {
  const a = createGameState({ map, playerNationId: 'valmorne', seed: 'partie-A' });
  const b = createGameState({ map, playerNationId: 'valmorne', seed: 'partie-A' });
  assert.deepEqual(a.leaders, b.leaders, 'même graine, mêmes dirigeants');
  assert.deepEqual(Object.values(a.leaders).map(l => l.archetype).sort(), [...ARCHETYPES].sort());
  assert.ok(Object.values(a.leaders).every(l => !l.revealed));
  assert.equal(a.leaders.valmorne, undefined, 'le joueur n\'a pas de dirigeant IA');
  // Sur 40 graines, chaque nation reçoit plusieurs archétypes différents (mélange réel).
  const seen = Object.fromEntries(OTHERS.map(id => [id, new Set()]));
  for (let i = 0; i < 40; i++) { const l = assignLeaders(`g${i}`, OTHERS); for (const id of OTHERS) seen[id].add(l[id].archetype); }
  for (const id of OTHERS) assert.ok(seen[id].size >= 3, `${id} : ${[...seen[id]]}`);
});

test('V11 : façade de l\'interface (v11-talk-ui.js) branchée sur le moteur', () => {
  const s = createGameState({ map, playerNationId: 'valmorne' });
  assert.equal(uiTalkOptions(s, map, { from: 'valmorne', to: 'aurel' }).length, 3);
  assert.equal(uiTension(s, 'valmorne', 'aurel').label, 'calme');
  assert.equal(typeof uiHint(s, 'aurel'), 'string');
  assert.equal(uiQueueTalk(s, map, { from: 'valmorne', to: 'aurel', tone: 'amical' }).ok, true);
});

// --- Comportements par archétype (scénarios fixés) ----------------------------------------------------------
test('Conquérant : attaque tôt le plus faible qu\'il peut atteindre, sans attendre la tension', () => {
  const s = scenario({ 'roc-epine': 'conquerant' });
  arm(s, 'p07'); // port de Belrivage : route vers Aurorelle (Aurel)
  // Aurel (côte de Belrivage, p07) affaibli : la proie la plus faible atteignable.
  for (const id of ['p17', 'p18', 'p19', 'p20']) { s.provinces[id].units = { infantry: 20, cavalry: 0, armor: 0, artillery: 0 }; }
  s.turn = 5;
  assert.equal(tensionLevel(s, 'roc-epine', 'aurel').label, 'calme');
  planAIOrders(s, map);
  const attack = ordersOf(s, 'roc-epine').find(o => o.kind === 'move' && s.provinces[o.toId].ownerId !== 'roc-epine');
  assert.ok(attack, 'une offensive est lancée');
  assert.equal(s.provinces[attack.toId].ownerId, 'aurel');
  assert.equal(attack.routeType, 'sea', 'offensive maritime');
  assert.ok(attack.warships > 0, 'escortée');
});

test('Bâtisseur : construit, ne se bat pas sans menace même avec une flotte et une cible faible', () => {
  const s = scenario({ 'roc-epine': 'batisseur' });
  arm(s, 'p07');
  for (const id of ['p17', 'p18', 'p19', 'p20']) s.provinces[id].units = { infantry: 20, cavalry: 0, armor: 0, artillery: 0 };
  s.nations['roc-epine'].treasury = 300;
  s.turn = 2; replan(s);
  assert.ok(ordersOf(s, 'roc-epine').some(o => o.kind === 'construction'), 'il construit');
  for (let t = 2; t < 30; t++) { s.turn = t; s.nations['roc-epine'].treasury = 300; replan(s); assert.ok(!ordersOf(s, 'roc-epine').some(o => o.kind === 'move' && s.provinces[o.toId].ownerId !== 'roc-epine'), `tour ${t} : pas d'attaque`); }
  // Menacé (en guerre), il riposte… et propose vite la paix.
  setRelation(s, { nationId: 'aurel', target: 'roc-epine', type: 'war' });
  s.diplomacy.wars[0].started = 1; s.turn = 6; replan(s);
  assert.ok(ordersOf(s, 'roc-epine').some(o => o.kind === 'move' && s.provinces[o.toId].ownerId === 'aurel'), 'riposte');
  assert.ok(ordersOf(s, 'roc-epine').some(o => o.kind === 'diplomacy' && o.action === 'ceasefire'), 'propose un cessez-le-feu');
});

test('Héros : punit l\'agresseur d\'une autre nation, est révélé en défendant, refuse l\'alliance d\'un agresseur', () => {
  const s = scenario({ 'roc-epine': 'heros', aurel: 'conquerant' });
  arm(s, 'p07');
  for (const id of ['p17', 'p18', 'p19', 'p20']) s.provinces[id].units = { infantry: 20, cavalry: 0, armor: 0, artillery: 0 };
  s.turn = 4; replan(s);
  assert.ok(!ordersOf(s, 'roc-epine').some(o => o.kind === 'move' && s.provinces[o.toId].ownerId === 'aurel'), 'pas d\'attaque gratuite');
  // Aurel agresse Noireflamme : le Héros la prend pour cible.
  s.turn = 5; setRelation(s, { nationId: 'aurel', target: 'noireflamme', type: 'war' }); recordAggression(s, 'aurel', 'noireflamme');
  assert.ok(getTension(s, 'roc-epine', 'aurel') >= 40, 'indignation du Héros');
  assert.equal(acceptsAlliance(s, 'roc-epine', 'aurel'), false, 'pas d\'alliance avec un agresseur');
  replan(s);
  const strike = ordersOf(s, 'roc-epine').find(o => o.kind === 'move' && s.provinces[o.toId].ownerId === 'aurel');
  assert.ok(strike, 'le Héros punit l\'agresseur');
  // Le débarquement arrive après la traversée : la guerre s'ouvre alors, le Héros est révélé.
  for (let i = 0; i < 6 && !s.leaders['roc-epine'].revealed; i++) resolveInterturn(s, map);
  assert.ok(atWar(s, 'roc-epine', 'aurel'));
  assert.equal(s.leaders['roc-epine'].revealed, true, 'révélé en défendant une nation attaquée');
  assert.ok(s.events.some(e => e.type === 'reveal' && e.nationId === 'roc-epine' && e.archetype === 'heros'));
  assert.match(leaderHint(s, 'roc-epine'), /Héros/);
});

test('Héros : fidèle à ses alliances (n\'attaque jamais son allié, même à tension maximale)', () => {
  const s = scenario({ 'roc-epine': 'heros' });
  arm(s, 'p07');
  setRelation(s, { nationId: 'roc-epine', target: 'aurel', type: 'alliance' });
  setTension(s, 'roc-epine', 'aurel', 100);
  for (const id of ['p17', 'p18', 'p19', 'p20']) s.provinces[id].units = { infantry: 20, cavalry: 0, armor: 0, artillery: 0 };
  for (let t = 2; t < 40; t++) { s.turn = t; replan(s); assert.ok(!ordersOf(s, 'roc-epine').some(o => (o.kind === 'move' && s.provinces[o.toId].ownerId === 'aurel') || (o.kind === 'diplomacy' && o.action === 'war')), `tour ${t}`); }
});

test('Traître : propose une alliance, l\'obtient, puis attaque son allié dans le dos ; TRAHISON publique et RÉVÉLATION', () => {
  const s = scenario({ 'roc-epine': 'traitre', aurel: 'batisseur' }, { seed: 'traitre-1' });
  arm(s, 'p05', 6);
  // Pour un scénario fixé, Aurel est la cible désignée.
  s.ai.plans = { 'roc-epine': { mark: 'aurel', strikeTurn: 8 } };
  s.turn = 2;
  let allianceTurn = null, betrayalTurn = null;
  for (let i = 0; i < 25 && betrayalTurn === null; i++) {
    resolveInterturn(s, map);
    if (allianceTurn === null && allied(s, 'roc-epine', 'aurel')) allianceTurn = s.turn - 1;
    if (s.events.some(e => e.type === 'betrayal')) betrayalTurn = s.turn - 1;
    assertInvariants(s, 'traître');
  }
  assert.ok(allianceTurn !== null && allianceTurn < 8, `alliance conclue (tour ${allianceTurn})`);
  assert.ok(betrayalTurn !== null && betrayalTurn >= 8, `trahison au moment opportun (tour ${betrayalTurn})`);
  const e = s.events.find(x => x.type === 'betrayal');
  assert.deepEqual([e.nationId, e.target], ['roc-epine', 'aurel']);
  assert.ok(atWar(s, 'roc-epine', 'aurel'));
  assert.equal(s.leaders['roc-epine'].revealed, true);
  assert.match(leaderHint(s, 'roc-epine'), /Traître/);
  const j = journalEntry(e, map, 'valmorne');
  assert.equal(j.type, 'TRAHISON'); assert.ok(eventKnownToPlayer(s, map, e), 'trahison publique');
  assert.equal(journalEntry(s.events.find(x => x.type === 'reveal'), map, 'valmorne').type, 'RÉVÉLATION');
});

test('Traître : accepte toutes les alliances et toutes les trêves', () => {
  const s = scenario({ aurel: 'traitre' });
  setTension(s, 'valmorne', 'aurel', 95);
  assert.equal(acceptsAlliance(s, 'aurel', 'valmorne'), true);
  setRelation(s, { nationId: 'valmorne', target: 'aurel', type: 'war' });
  queueDiplomaticOrder(s, { nationId: 'valmorne', target: 'aurel', action: 'ceasefire', offerLevel: .75 });
  resolveInterturn(s, map, { random: () => .99 });
  assert.equal(atWar(s, 'valmorne', 'aurel'), false, 'trêve acceptée même avec la plus petite chance');
});

test('Diplomatie IA (B9) : le Conquérant refuse l\'alliance d\'un plus faible ; le Bâtisseur accepte dans le calme', () => {
  const s = scenario({ aurel: 'conquerant', oroel: 'batisseur' });
  for (const id of ['p01', 'p02', 'p03', 'p04']) s.provinces[id].units.infantry = 10;
  queueDiplomaticOrder(s, { nationId: 'valmorne', target: 'aurel', action: 'alliance' });
  queueDiplomaticOrder(s, { nationId: 'valmorne', target: 'oroel', action: 'alliance' });
  resolveInterturn(s, map);
  assert.equal(allied(s, 'valmorne', 'aurel'), false);
  assert.equal(allied(s, 'valmorne', 'oroel'), true);
  const refused = s.events.find(e => e.type === 'diplomatic-action' && e.target === 'aurel');
  assert.equal(refused.accepted, false);
  assert.match(journalEntry(refused, map, 'valmorne').text, /refuse l’alliance/);
});

test('Diplomatie IA : une IA propose au joueur ; réponse amicale = accord, hostile = refus', () => {
  const s = scenario({ aurel: 'traitre' }, { seed: 'propose' });
  s.ai.plans = { aurel: { mark: 'valmorne', strikeTurn: 30 } };
  for (let i = 0; i < 4 && !(s.diplomacy.proposals || []).length; i++) resolveInterturn(s, map);
  const p = s.diplomacy.proposals[0];
  assert.ok(p, 'proposition d\'alliance au joueur');
  assert.equal(p.action, 'alliance');
  assert.ok(s.talkPending.valmorne.includes(p.talkId), 'message en attente de réponse');
  assert.equal(queueTalk(s, map, { from: 'valmorne', to: 'aurel', tone: 'amical', replyTo: p.talkId }).ok, true);
  resolveInterturn(s, map);
  assert.ok(allied(s, 'valmorne', 'aurel'), 'alliance conclue par la réponse amicale');
  assert.ok(!s.talkPending.valmorne.includes(p.talkId), 'plus en attente');
  // Refus.
  const r = scenario({ aurel: 'traitre' }, { seed: 'propose' });
  r.ai.plans = { aurel: { mark: 'valmorne', strikeTurn: 30 } };
  for (let i = 0; i < 4 && !(r.diplomacy.proposals || []).length; i++) resolveInterturn(r, map);
  queueTalk(r, map, { from: 'valmorne', to: 'aurel', tone: 'hostile', replyTo: r.diplomacy.proposals[0].talkId });
  resolveInterturn(r, map);
  assert.equal(allied(r, 'valmorne', 'aurel'), false);
  assert.equal(r.diplomacy.proposals.length, 0);
});

// --- Tension ---------------------------------------------------------------------------------------------------
test('Tension : 0..100, symétrique, seuils et libellés du contrat', () => {
  const s = scenario();
  assert.deepEqual(tensionLevel(s, 'valmorne', 'aurel'), { value: 10, label: 'calme' });
  for (const [v, label] of [[0, 'calme'], [24, 'calme'], [25, 'tendu'], [49, 'tendu'], [50, 'hostile'], [69, 'hostile'], [70, 'au bord de la guerre'], [100, 'au bord de la guerre']] /* V14.2 : avertissement dès 70 % */) {
    setTension(s, 'valmorne', 'aurel', v);
    assert.equal(tensionLevel(s, 'aurel', 'valmorne').label, label, `${v}`);
  }
  setTension(s, 'valmorne', 'aurel', 140); assert.equal(getTension(s, 'aurel', 'valmorne'), 100);
  setTension(s, 'valmorne', 'aurel', -3); assert.equal(getTension(s, 'aurel', 'valmorne'), 0);
  assert.equal(tensionLevel(s, 'aurel', 'aurel').value, 0);
});

test('Tension : monte avec les messages hostiles (événement TENSION au seuil), descend avec les amicaux et la paix', () => {
  const s = scenario();
  const start = getTension(s, 'valmorne', 'oroel');
  for (let i = 0; i < 3; i++) { queueTalk(s, map, { from: 'valmorne', to: 'oroel', tone: 'hostile' }); resolveInterturn(s, map); }
  const high = getTension(s, 'oroel', 'valmorne');
  assert.ok(high >= start + 30, `${start} -> ${high}`);
  const ev = s.events.find(e => e.type === 'tension' && e.rising);
  assert.ok(ev, 'franchissement de seuil');
  const entry = journalEntry(ev, map, 'valmorne');
  assert.equal(entry.type, 'TENSION'); assert.match(entry.text, /Oroël/);
  assert.ok(buildTurnJournal(s, map, 0).some(e => e.type === 'TENSION'));
  queueTalk(s, map, { from: 'valmorne', to: 'oroel', tone: 'amical' }); resolveInterturn(s, map);
  const after = getTension(s, 'valmorne', 'oroel');
  assert.ok(after < high, 'apaisement');
  for (let i = 0; i < 40; i++) resolveInterturn(s, map);
  assert.equal(tensionLevel(s, 'valmorne', 'oroel').label, 'calme', 'la paix fait retomber la tension');
  // Une attaque porte la tension « au bord de la guerre » ; la guerre la maintient haute.
  setRelation(s, { nationId: 'valmorne', target: 'oroel', type: 'war' }); resolveInterturn(s, map);
  assert.ok(getTension(s, 'valmorne', 'oroel') >= 70);
});

test('Tension : au bord de la guerre, un Héros finit par déclarer la guerre ; jamais à tension calme', () => {
  const calm = scenario({ 'roc-epine': 'heros' }); arm(calm, 'p05');
  const hot = scenario({ 'roc-epine': 'heros' }); arm(hot, 'p05');
  let warTurn = null;
  for (let t = 2; t < 60; t++) {
    calm.turn = t; replan(calm);
    assert.ok(!ordersOf(calm, 'roc-epine').some(o => o.kind === 'move' && calm.provinces[o.toId].ownerId === 'valmorne'), 'pas de guerre dans le calme');
    hot.turn = t; setTension(hot, 'roc-epine', 'valmorne', 95); replan(hot);
    if (warTurn === null && hot.ai.plans['roc-epine'].grudges?.includes('valmorne')) warTurn = t;
  }
  assert.ok(warTurn !== null, 'la tension finit par déclencher la guerre');
});

// --- Échanges ----------------------------------------------------------------------------------------------------
test('talkOptions : exactement 3 propositions (hostile, neutre, amical), textes non vides, adaptés à la situation', () => {
  const s = scenario({ aurel: 'heros' });
  const base = talkOptions(s, map, { from: 'valmorne', to: 'aurel' });
  assert.deepEqual(base.map(o => o.tone), ['hostile', 'neutre', 'amical']);
  for (const o of base) { assert.ok(o.text.length > 10); assert.match(o.text, /Solmara/); /* V13.2 : Aurel renommée Solmara */ assert.ok(o.preview); }
  assert.notEqual(new Set(base.map(o => o.text)).size, 1);
  const situation = () => talkOptions(s, map, { from: 'valmorne', to: 'aurel' })[0].situation;
  // V13 (anneau maritime) : Valmorne est voisine d'Oroël (route Branvale–Nordhème), plus d'Aurel.
  assert.equal(talkOptions(s, map, { from: 'valmorne', to: 'oroel' })[0].situation, 'neighbor', 'route maritime Branvale–Nordhème');
  assert.equal(situation(), 'default', 'Aurel : pas de route directe');
  assert.equal(talkOptions(s, map, { from: 'valmorne', to: null })[0].situation, 'default', 'message à tous');
  assert.match(talkOptions(s, map, { from: 'valmorne', to: null })[2].text, /peuples d’Arken/);
  setRelation(s, { nationId: 'valmorne', target: 'aurel', type: 'alliance' }); assert.equal(situation(), 'ally');
  setRelation(s, { nationId: 'valmorne', target: 'aurel', type: 'war' }); assert.equal(situation(), 'war');
  setRelation(s, { nationId: 'valmorne', target: 'aurel', type: 'ceasefire' }); assert.equal(situation(), 'ceasefire');
  recordAggression(s, 'aurel', 'valmorne'); assert.equal(situation(), 'afterAttack');
  // Réponse : textes de réponse, selon le ton reçu.
  s.talk = [{ id: 't9', turn: 1, from: 'aurel', to: 'valmorne', tone: 'hostile', text: '…', replyTo: null }];
  const reply = talkOptions(s, map, { from: 'valmorne', to: 'aurel', replyTo: 't9' });
  assert.equal(reply[0].situation, 'reply'); assert.equal(reply.length, 3);
  // Variété : sur plusieurs tours, des textes différents.
  const texts = new Set();
  for (let t = 1; t < 12; t++) { s.turn = t; texts.add(talkOptions(s, map, { from: 'valmorne', to: 'oroel' })[1].text); }
  assert.ok(texts.size >= 2);
  assert.deepEqual(talkOptions(s, map, { from: 'valmorne', to: 'oroel' }), talkOptions(s, map, { from: 'valmorne', to: 'oroel' }), 'déterministe');
});

test('queueTalk : un ordre par destinataire et par tour (remplaçable), publié à la résolution ; erreurs claires', () => {
  const s = scenario();
  assert.equal(queueTalk(s, map, { from: 'valmorne', to: 'aurel', tone: 'colere' }).ok, false);
  assert.equal(queueTalk(s, map, { from: 'valmorne', to: 'valmorne', tone: 'neutre' }).ok, false);
  assert.equal(queueTalk(s, map, { from: 'valmorne', to: 'aurel', tone: 'neutre', replyTo: 'inconnu' }).ok, false);
  assert.equal(queueTalk(s, map, { from: 'valmorne', to: 'aurel', tone: 'hostile' }).ok, true);
  const r = queueTalk(s, map, { from: 'valmorne', to: 'aurel', tone: 'amical' });
  assert.equal(r.replaced, true);
  assert.equal(queueTalk(s, map, { from: 'valmorne', to: 'oroel', tone: 'neutre' }).ok, true);
  const talks = s.orders.filter(o => o.kind === 'talk');
  assert.deepEqual(talks.map(o => [o.to, o.tone]), [['aurel', 'amical'], ['oroel', 'neutre']]);
  assert.equal((s.talk || []).length, 0, 'rien de publié avant la fin du tour');
  resolveInterturn(s, map);
  const mine = s.talk.filter(m => m.from === 'valmorne');
  assert.deepEqual(mine.map(m => [m.to, m.tone, m.turn]), [['aurel', 'amical', 1], ['oroel', 'neutre', 1]]);
  assert.equal(mine[0].text, talks[0].text);
  assert.ok(s.events.some(e => e.type === 'talk' && e.nationId === 'valmorne'));
  assert.equal(journalEntry(s.events.find(e => e.type === 'talk'), map, 'valmorne').type, 'ÉCHANGE');
  assert.equal(s.orders.length, 0);
});

test('Fil public limité à 60 échanges ; attentes nettoyées', () => {
  const s = scenario();
  for (let i = 0; i < 70; i++) { queueTalk(s, map, { from: 'valmorne', to: OTHERS[i % 4], tone: 'neutre' }); resolveInterturn(s, map); }
  assert.ok(s.talk.length <= TALK_LIMIT);
  for (const list of Object.values(s.talkPending)) for (const id of list) assert.ok(s.talk.some(m => m.id === id));
});

test('Les dirigeants IA répondent parfois au joueur, selon leur personnalité, et lui adressent des messages', () => {
  const s = createGameState({ map, playerNationId: 'valmorne', seed: 'reponses' });
  let replies = 0;
  for (let t = 0; t < 12; t++) {
    for (const id of OTHERS) queueTalk(s, map, { from: 'valmorne', to: id, tone: t % 2 ? 'amical' : 'hostile' });
    resolveInterturn(s, map);
  }
  replies = s.talk.filter(m => m.from !== 'valmorne' && m.to === 'valmorne' && m.replyTo).length;
  assert.ok(replies >= 3, `${replies} réponses`);
  // Pas de spam : au plus 3 messages IA par tour.
  const perTurn = {};
  for (const m of s.talk.filter(m => m.from !== 'valmorne')) perTurn[m.turn] = (perTurn[m.turn] || 0) + 1;
  assert.ok(Object.values(perTurn).every(n => n <= 3), JSON.stringify(perTurn));
});

test('leaderHint : impression vague tant que le dirigeant n\'est pas révélé', () => {
  const s = createGameState({ map, playerNationId: 'valmorne', seed: 'hint' });
  for (const id of OTHERS) { const h = leaderHint(s, id); assert.ok(h.length > 5); assert.doesNotMatch(h, /Héros|Conquérant|Traître|Bâtisseur/); }
  s.leaders.aurel.revealed = true;
  assert.ok(leaderHint(s, 'aurel').length > 10);
  assert.match(leaderHint(s, 'aurel'), /Héros|Conquérant|Traître|Bâtisseur/);
});

// --- Sauvegarde --------------------------------------------------------------------------------------------------
test('Sauvegarde : migration 7 (V10) -> 8 (V11) -> 9 (V13) depuis les anciens traits, puis aller-retour sans perte', () => {
  const s = createGameState({ map, playerNationId: 'valmorne' });
  const old = structuredClone(s); old.schemaVersion = 7;
  delete old.leaders; delete old.tension; delete old.talk; delete old.talkPending; delete old.talkSequence;
  old.ai.traits = { 'roc-epine': 'prudent', noireflamme: 'offensif', oroel: 'fidele', aurel: 'impulsif' };
  old.diplomacy.wars.push({ active: true, participants: ['valmorne', 'aurel'], started: 1 });
  const m = migrateSave(old);
  assert.equal(m.schemaVersion, 9);
  assert.deepEqual(Object.fromEntries(Object.entries(m.leaders).map(([k, v]) => [k, v.archetype])), { 'roc-epine': 'batisseur', noireflamme: 'conquerant', oroel: 'heros', aurel: 'traitre' });
  assert.ok(Object.values(m.leaders).every(l => !l.revealed));
  // V13 : en guerre, le libellé est « en guerre » (la valeur reste celle de la migration : 80).
  assert.equal(tensionLevel(m, 'valmorne', 'aurel').label, 'en guerre', 'guerre en cours');
  assert.equal(tensionLevel(m, 'valmorne', 'aurel').value, 80);
  assert.equal(tensionLevel(m, 'valmorne', 'oroel').label, 'calme');
  assert.deepEqual(m.talk, []); assert.deepEqual(m.talkPending, {});
  for (let i = 0; i < 12; i++) { queueTalk(m, map, { from: 'valmorne', to: 'oroel', tone: 'hostile' }); resolveInterturn(m, map); }
  const back = decodeSave(encodeSave(m));
  assert.deepEqual(back, m, 'aller-retour sans perte');
  for (let i = 0; i < 8; i++) { resolveInterturn(m, map); resolveInterturn(back, map); }
  assert.deepEqual(back, m, 'même suite');
});

// --- Simulation IA contre IA ------------------------------------------------------------------------------------
let originalRandom, randomCalls = 0;
before(() => { originalRandom = Math.random; const r = seededRandom(11); Math.random = () => { randomCalls++; return r(); }; });
after(() => { Math.random = originalRandom; });
const SEEDS = ['sim-1', 'sim-2', 'sim-3', 'sim-4', 'sim-5'];
function simulate(seed, player, turns = 80) {
  const s = createGameState({ map, playerNationId: player, seed });
  for (const id of NATIONS) s.controllers[id] = 'ai';
  for (let i = 0; i < turns; i++) { resolveInterturn(s, map); assertInvariants(s, `V11 ${seed}`); }
  return s;
}
test('Simulation V11 : 5 parties × 80 tours — guerre tôt, trahisons, aucune personnalité gagnante systématique', () => {
  const firstWars = [], winners = [];
  let betrayals = 0, talks = 0, alliances = 0, ceasefires = 0;
  SEEDS.forEach((seed, i) => {
    const s = simulate(seed, NATIONS[i]);
    const first = s.events.find(e => (e.type === 'battle' || e.type === 'conquest'))?.turn ?? 99;
    firstWars.push(first);
    betrayals += s.events.filter(e => e.type === 'betrayal').length;
    talks += s.events.filter(e => e.type === 'talk').length;
    alliances += s.events.filter(e => e.type === 'diplomatic-action' && e.action === 'alliance' && e.accepted).length;
    ceasefires += s.events.filter(e => e.type === 'ceasefire-offer' && e.accepted).length;
    assert.ok(s.events.some(e => e.type === 'game-over'), 'fin de partie au tour 80');
    assert.ok(s.talk.length > 0 && s.talk.length <= 60);
    const w = gameRanking(s)[0].nationId;
    winners.push(s.leaders[w]?.archetype);
    for (const row of Object.values(s.tension)) for (const v of Object.values(row)) assert.ok(Number.isInteger(v) && v >= 0 && v <= 100);
  });
  const early = firstWars.filter(t => t < 15).length;
  console.log(`# info V11 : 1er combat aux tours ${firstWars.join(', ')} (moyenne ${(firstWars.reduce((a, b) => a + b, 0) / firstWars.length).toFixed(1)}) ; trahisons ${betrayals} ; alliances ${alliances} ; trêves ${ceasefires} ; échanges ${talks} ; vainqueurs ${winners.join(', ')}`);
  assert.ok(early >= 3, `guerre avant le tour 15 dans ${early}/5 parties`);
  assert.ok(betrayals >= 1, 'le Traître trahit');
  assert.ok(new Set(winners).size >= 2, `vainqueurs : ${winners}`);
  assert.ok(alliances >= 1 && ceasefires >= 1, 'diplomatie IA réelle');
});
test('Simulation V11 : déterministe, sans Math.random', () => {
  assert.deepEqual(simulate('det', 'oroel', 30), simulate('det', 'oroel', 30));
  assert.equal(randomCalls, 0);
});
