// V14.0 — cahier docs/V14-cahier-des-charges.md (section 3, points 1 et 2) et « À surveiller » de la V13.4.
//  1. Trêve rompue puis rejouée : rompre un cessez-le-feu signé depuis moins de 10 tours = trahison (joueur et IA).
//  2. L'IA rappelle ses troupes stationnées chez un allié (danger passé, ou besoin chez elle).
//  3. Convoi parti du port d'un allié pendant une rupture d'alliance : il n'est plus perdu.
//  4. Journal de combat : PV perdus par les troupes stationnées comptés à part.
//  5. Point 1 de la section 3 (« l'allié vient vraiment défendre ») : vérifié par simulation.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { queueMoveOrder, queueDiplomaticOrder, setRelation, resolveInterturn, respondToProposal, journalEntry, planAIOrders,
  stationedAt, stationedOf, TRUCE_BETRAYAL_TURNS, recentTruce, truceBreakStatus } from '../src/domain/game-engine.js';
import { reputation } from '../src/domain/leaders.js';
import { talkLineLists } from '../src/domain/talk.js';
import { truceWarning } from '../src/presentation/v14-ux.js';
import { COMBAT_TYPES, totalHp, legacyForce } from '../src/domain/combat.js';
import { arkenV9Map } from '../src/map/arken-v9-map.js';
import { createGameState } from '../src/state/create-game-state.js';
import { map, freshState, assertInvariants } from './helpers/fixtures.js';

const read = f => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
const allied = (s, a, b) => s.diplomacy.treaties.some(t => t.active !== false && t.type === 'alliance' && t.parties.includes(a) && t.parties.includes(b));
const atWar = (s, a, b) => s.diplomacy.wars.some(w => w.active !== false && w.participants.includes(a) && w.participants.includes(b));
const units = (infantry = 0) => ({ infantry, cavalry: 0, armor: 0, artillery: 0 });
const v9State = () => { const s = createGameState({ map: arkenV9Map, playerNationId: 'valmorne', seed: 'v14' }); for (const id of Object.keys(s.nations)) s.controllers[id] = 'human'; return s; };

// --- 1. Trêve rompue puis rejouée ------------------------------------------------------------------------------
test('trêve rompue moins de 10 tours après sa signature : trahison (même réputation qu\'une alliance trahie)', () => {
  const s = freshState({ allHuman: true });
  setRelation(s, { nationId: 'valmorne', target: 'roc-epine', type: 'ceasefire' }); // pas de guerre : refus
  setRelation(s, { nationId: 'valmorne', target: 'roc-epine', type: 'war' });
  setRelation(s, { nationId: 'valmorne', target: 'roc-epine', type: 'ceasefire' });
  assert.equal(TRUCE_BETRAYAL_TURNS, 10);
  assert.ok(recentTruce(s, 'valmorne', 'roc-epine'));
  assert.deepEqual(truceBreakStatus(s, 'valmorne', 'roc-epine'), { betrayal: true, since: 0, left: 10 });
  const before = reputation(s, 'valmorne').betrayals;
  assert.equal(queueDiplomaticOrder(s, { nationId: 'valmorne', target: 'roc-epine', action: 'war' }).ok, true);
  resolveInterturn(s, map);
  assert.ok(atWar(s, 'valmorne', 'roc-epine'));
  const ev = s.events.find(e => e.type === 'betrayal');
  assert.ok(ev, 'événement TRAHISON');
  assert.equal(ev.truce, true);
  assert.equal(reputation(s, 'valmorne').betrayals, before + 1, 'compteur de trahisons, comme pour une alliance');
  const entry = journalEntry(ev, arkenV9Map, 'roc-epine');
  assert.equal(entry.type, 'TRAHISON');
  assert.equal(entry.public, true);
  assert.match(entry.text, /rompt la trêve signée ce tour-ci et attaque votre nation/);
  assert.match(journalEntry({ ...ev, truceTurns: 3 }, arkenV9Map, 'roc-epine').text, /il y a 3 tours/);
});

test('trêve rompue par une ATTAQUE (sans déclaration) : trahison aussi', () => {
  const s = freshState({ allHuman: true });
  setRelation(s, { nationId: 'valmorne', target: 'roc-epine', type: 'war' });
  setRelation(s, { nationId: 'valmorne', target: 'roc-epine', type: 'ceasefire' });
  s.provinces.p04.units.infantry = 400; s.provinces.p05.units = units(5); s.provinces.p05.buildings.fort = 0;
  assert.equal(queueMoveOrder(s, map, { nationId: 'valmorne', fromId: 'p04', toId: 'p05', units: { infantry: 300 } }).ok, true);
  resolveInterturn(s, map);
  assert.ok(s.events.some(e => e.type === 'betrayal' && e.truce && e.nationId === 'valmorne' && e.target === 'roc-epine'));
});

test('trêve signée depuis 10 tours ou plus : la rompre est une guerre ordinaire, sans trahison', () => {
  const s = freshState({ allHuman: true });
  setRelation(s, { nationId: 'valmorne', target: 'roc-epine', type: 'war' });
  setRelation(s, { nationId: 'valmorne', target: 'roc-epine', type: 'ceasefire' });
  s.diplomacy.treaties.find(t => t.type === 'ceasefire').started = s.turn - 10;
  assert.equal(truceBreakStatus(s, 'valmorne', 'roc-epine').betrayal, false);
  queueDiplomaticOrder(s, { nationId: 'valmorne', target: 'roc-epine', action: 'war' });
  resolveInterturn(s, map);
  assert.ok(atWar(s, 'valmorne', 'roc-epine'));
  assert.ok(!s.events.some(e => e.type === 'betrayal'));
  assert.equal(reputation(s, 'valmorne').betrayals, 0);
  // Ancienne sauvegarde : trêve sans date de signature → jamais une trahison.
  const t = freshState({ allHuman: true });
  t.diplomacy.treaties.push({ active: true, type: 'ceasefire', parties: ['valmorne', 'oroel'] });
  assert.equal(recentTruce(t, 'valmorne', 'oroel'), null);
});

test('le cas du dominant : guerre → trêve en exigeant de l\'or → guerre aussitôt = trahison publique', () => {
  const s = freshState({ allHuman: true });
  s.controllers.oroel = 'ai';
  setRelation(s, { nationId: 'valmorne', target: 'oroel', type: 'war' });
  // Oroël propose une trêve, le joueur accepte (fenêtre Oui / Non)…
  s.diplomacy.proposals = [{ from: 'oroel', to: 'valmorne', action: 'ceasefire', turn: s.turn, amount: 30 }];
  assert.equal(respondToProposal(s, { from: 'oroel', accept: true }).ok, true);
  // … puis redéclare la guerre au tour suivant pour recommencer.
  resolveInterturn(s, map);
  assert.equal(queueDiplomaticOrder(s, { nationId: 'valmorne', target: 'oroel', action: 'war' }).ok, true);
  resolveInterturn(s, map);
  assert.ok(s.events.some(e => e.type === 'betrayal' && e.truce && e.nationId === 'valmorne' && e.target === 'oroel'));
  // L'IA trahie le dit publiquement, avec une réplique propre à la trêve.
  const lists = talkLineLists();
  assert.ok(lists['ai.truceBroken'].length >= 9 && lists['ai.truceBreaker'].length >= 9);
  const said = s.talk.filter(m => m.from === 'oroel' && m.to === 'valmorne' && m.tone === 'hostile' && m.turn === s.turn - 1);
  assert.ok(said.length, 'Oroël réagit');
});

test('IA : un Conquérant attend 10 tours avant de rompre une trêve ; s\'il la rompt plus tôt, c\'est une trahison', () => {
  const src = read('src/domain/game-engine.js');
  assert.match(src, /state\.turn - t\.started >= TRUCE_BETRAYAL_TURNS/, 'le choix de la proie respecte la trêve 10 tours');
  // Une IA qui attaque pendant une trêve récente : même règle que le joueur (le moteur ne distingue pas).
  const s = freshState({ allHuman: true });
  s.controllers['roc-epine'] = 'ai';
  setRelation(s, { nationId: 'roc-epine', target: 'valmorne', type: 'war' });
  setRelation(s, { nationId: 'roc-epine', target: 'valmorne', type: 'ceasefire' });
  s.provinces.p05.units.infantry = 400; s.provinces.p04.units = units(5); s.provinces.p04.buildings.fort = 0;
  s.orders.push({ id: 'x1', kind: 'move', nationId: 'roc-epine', fromId: 'p05', toId: 'p04', units: units(300), warships: 0, routeType: 'land', status: 'pending', turn: s.turn });
  s.ai.plannedTurn = s.turn; // on garde l'ordre ci-dessus seul
  resolveInterturn(s, map);
  assert.ok(s.events.some(e => e.type === 'betrayal' && e.truce && e.nationId === 'roc-epine'));
  assert.equal(reputation(s, 'roc-epine').betrayals, 1);
});

test('fenêtre avant de rompre : la déclaration de guerre et l\'attaque le disent', () => {
  const s = freshState({ allHuman: true });
  setRelation(s, { nationId: 'valmorne', target: 'roc-epine', type: 'war' });
  setRelation(s, { nationId: 'valmorne', target: 'roc-epine', type: 'ceasefire' });
  s.turn += 3;
  assert.match(truceWarning(s, 'valmorne', 'roc-epine', 'Roc-Épine'), /Trêve signée avec Roc-Épine il y a 3 tours : la rompre maintenant est une TRAHISON.*Dans 7 tours, ce ne sera plus une trahison/);
  s.turn += 7;
  assert.match(truceWarning(s, 'valmorne', 'roc-epine', 'Roc-Épine'), /sans trahison/);
  assert.equal(truceWarning(s, 'valmorne', 'oroel', 'Oroël'), '', 'pas de trêve : rien');
  s.turn -= 10;
  assert.match(truceWarning(s, 'valmorne', 'roc-epine', 'Roc-Épine'), /signée avec Roc-Épine ce tour-ci/);
  const app = read('app.js');
  assert.match(app, /war:`Déclarer la guerre[^`]*\$\{truceWarning\(state,state\.playerNationId,target/, 'Diplomatie → Déclarer la guerre');
  assert.match(app, /const truceNote=attack&&truceWarning\(/, 'préparation d\'une attaque');
  assert.match(app, /Trésor après ordre[^\n]*truceNote\?/, 'confirmation de l\'attaque');
  assert.match(read('sw.js'), /v14-ux\.js/);
});

// --- 2. L'IA rappelle ses troupes stationnées ------------------------------------------------------------------
test('IA : danger passé chez l\'allié → elle rappelle ses troupes stationnées', () => {
  const s = freshState({ allHuman: true });
  s.controllers['roc-epine'] = 'ai'; s.leaders['roc-epine'].archetype = 'batisseur';
  setRelation(s, { nationId: 'valmorne', target: 'roc-epine', type: 'alliance' });
  s.stationed = [{ nationId: 'roc-epine', provinceId: 'p04', units: units(120), warships: 0, wounds: {} }];
  planAIOrders(s, map);
  const o = s.orders.find(x => x.kind === 'move' && x.nationId === 'roc-epine' && x.fromId === 'p04');
  assert.ok(o, 'ordre de rappel');
  assert.equal(o.recall, 'safe');
  assert.equal(s.provinces[o.toId].ownerId, 'roc-epine');
  assert.equal(o.units.infantry, 120);
  resolveInterturn(s, map);
  assert.equal(stationedAt(s, 'p04', 'roc-epine'), null, 'rentrées');
  assert.ok(allied(s, 'valmorne', 'roc-epine'), 'alliance intacte');
});

test('IA : l\'allié est encore en guerre, ou l\'engagement « Défends-moi » court → les troupes restent', () => {
  const s = freshState({ allHuman: true });
  s.controllers['roc-epine'] = 'ai'; s.leaders['roc-epine'].archetype = 'batisseur';
  setRelation(s, { nationId: 'valmorne', target: 'roc-epine', type: 'alliance' });
  setRelation(s, { nationId: 'valmorne', target: 'oroel', type: 'war' });
  s.stationed = [{ nationId: 'roc-epine', provinceId: 'p04', units: units(120), warships: 0, wounds: {} }];
  planAIOrders(s, map);
  assert.ok(!s.orders.some(x => x.kind === 'move' && x.nationId === 'roc-epine' && x.fromId === 'p04'), 'guerre en cours : elles restent');
  const t = freshState({ allHuman: true });
  t.controllers['roc-epine'] = 'ai'; t.leaders['roc-epine'].archetype = 'batisseur';
  setRelation(t, { nationId: 'valmorne', target: 'roc-epine', type: 'alliance' });
  t.stationed = [{ nationId: 'roc-epine', provinceId: 'p04', units: units(120), warships: 0, wounds: {} }];
  t.diplomacy.help = [{ ally: 'roc-epine', requester: 'valmorne', kind: 'defend', against: null, provinceId: 'p04', turn: t.turn, until: t.turn + 5 }];
  planAIOrders(t, map);
  assert.ok(!t.orders.some(x => x.kind === 'move' && x.nationId === 'roc-epine' && x.fromId === 'p04'), 'engagement en cours : elles restent');
});

test('IA : une de ses provinces est menacée → elle rappelle ses troupes, même si l\'allié est en guerre', () => {
  const s = freshState({ allHuman: true });
  s.controllers['roc-epine'] = 'ai'; s.leaders['roc-epine'].archetype = 'batisseur';
  setRelation(s, { nationId: 'valmorne', target: 'roc-epine', type: 'alliance' });
  setRelation(s, { nationId: 'valmorne', target: 'oroel', type: 'war' });
  setRelation(s, { nationId: 'roc-epine', target: 'noireflamme', type: 'war' });
  s.stationed = [{ nationId: 'roc-epine', provinceId: 'p04', units: units(200), warships: 0, wounds: {} }];
  // Noireflamme masse 500 fantassins à Pic-Noir (p09), voisine de p05 et p08 ; Roc-Épine est dégarnie.
  for (const id of ['p05', 'p06', 'p07', 'p08']) { s.provinces[id].units = units(10); s.provinces[id].buildings.fort = 0; }
  s.provinces.p09.units = units(500);
  planAIOrders(s, map);
  const o = s.orders.find(x => x.kind === 'move' && x.nationId === 'roc-epine' && x.fromId === 'p04');
  assert.ok(o, 'rappel');
  assert.equal(o.recall, 'home');
  assert.equal(o.toId, 'p05', 'vers la province menacée');
});

test('IA : troupes stationnées loin de chez elles → elles marchent vers un port de l\'allié puis rentrent par la mer', () => {
  const s = v9State();
  s.controllers.oroel = 'ai'; s.leaders.oroel.archetype = 'batisseur';
  setRelation(s, { nationId: 'valmorne', target: 'oroel', type: 'alliance' });
  // p01 (Valmorne, intérieur) : aucune route directe vers Oroël ; p03 (Branvale) mène à p14 (Nordhème, Oroël).
  s.stationed = [{ nationId: 'oroel', provinceId: 'p01', units: units(80), warships: 0, wounds: {} }];
  planAIOrders(s, arkenV9Map);
  const step = s.orders.find(x => x.kind === 'move' && x.nationId === 'oroel' && x.fromId === 'p01');
  assert.ok(step, 'première étape');
  assert.equal(step.toId, 'p03');
  resolveInterturn(s, arkenV9Map);
  assert.equal(stationedAt(s, 'p03', 'oroel').units.infantry, 80);
  planAIOrders(s, arkenV9Map);
  const sail = s.orders.find(x => x.kind === 'move' && x.nationId === 'oroel' && x.fromId === 'p03');
  assert.ok(sail && sail.routeType === 'sea' && sail.toId === 'p14', 'par la mer vers Nordhème');
  for (let i = 0; i < 4; i++) resolveInterturn(s, arkenV9Map);
  assert.equal(stationedOf(s, 'oroel').length, 0);
  assert.ok(s.events.some(e => e.type === 'convoy-arrived' && e.nationId === 'oroel' && e.toId === 'p14'));
});

// --- 3. Convoi parti du port d'un allié pendant une rupture d'alliance -----------------------------------------
function convoyFromAllyPort() {
  const s = v9State();
  setRelation(s, { nationId: 'valmorne', target: 'roc-epine', type: 'alliance' });
  // Troupes de Valmorne stationnées à Belrivage (p07, port de Roc-Épine) : elles embarquent vers Aurorelle (p17, Solmara).
  s.stationed = [{ nationId: 'valmorne', provinceId: 'p07', units: units(100), warships: 0, wounds: {} }];
  s.provinces.p17.units = units(80); s.provinces.p17.buildings.fort = 2;
  assert.equal(queueMoveOrder(s, arkenV9Map, { nationId: 'valmorne', fromId: 'p07', toId: 'p17', units: { infantry: 100 } }).ok, true);
  resolveInterturn(s, arkenV9Map);
  const t = s.transports.find(x => x.nationId === 'valmorne');
  assert.equal(t.allyPort, 'roc-epine', 'le convoi sait qu\'il part de chez un allié');
  // Roc-Épine rompt l'alliance pendant la traversée.
  queueDiplomaticOrder(s, { nationId: 'roc-epine', target: 'valmorne', action: 'break' });
  return s;
}
test('convoi parti de chez un allié, alliance rompue, débarquement repoussé : il rentre au port ami le plus proche', () => {
  const s = convoyFromAllyPort();
  for (let i = 0; i < 2; i++) resolveInterturn(s, arkenV9Map);
  assert.ok(s.events.some(e => e.type === 'battle' && e.provinceId === 'p17' && e.attacker === 'valmorne'), 'débarquement repoussé');
  assert.ok(!s.events.some(e => e.type === 'retreat-lost' && e.nationId === 'valmorne'), 'plus de troupes perdues faute de port');
  const ev = s.events.find(e => e.type === 'convoy-rerouted' && e.nationId === 'valmorne');
  assert.ok(ev, 'une ligne au journal');
  assert.equal(s.provinces[ev.toId].ownerId, 'valmorne', 'port de son camp');
  assert.match(journalEntry(ev, arkenV9Map, 'valmorne').text, /rentre au port ami le plus proche/);
  const back = s.transports.find(x => x.nationId === 'valmorne');
  assert.ok(back && back.returning && back.toId === ev.toId);
  const survivors = COMBAT_TYPES.reduce((n, k) => n + (k === 'warship' ? back.warships : back.units[k] || 0), 0);
  for (let i = 0; i < back.turns; i++) resolveInterturn(s, arkenV9Map);
  assert.ok(s.events.some(e => e.type === 'convoy-arrived' && e.nationId === 'valmorne' && e.toId === ev.toId && e.amount === survivors), 'arrivé, rien perdu');
  assertInvariants(s, 'v9');
});

test('convoi parti de chez un allié vers chez lui, alliance rompue, aucun port ami : il débarque au point de départ', () => {
  const s = v9State();
  setRelation(s, { nationId: 'valmorne', target: 'roc-epine', type: 'alliance' });
  // Cas limite : Valmorne n'a plus aucun point de port (Sylvaren et Branvale prises par Oroël, en paix avec elle).
  s.provinces.p02.ownerId = 'oroel'; s.provinces.p03.ownerId = 'oroel';
  s.stationed = [{ nationId: 'valmorne', provinceId: 'p05', units: units(60), warships: 0, wounds: {} }];
  // Convoi « de retour » vers Roc-Épine (p05) parti de chez l'allié : l'alliance tombe, plus de port où accoster.
  s.transports.push({ id: 'c90', nationId: 'valmorne', fromId: 'p02', toId: 'p05', via: 'p05', lane: 'p02|p05', stage: 1, turns: 2, returning: true, allyPort: 'roc-epine', units: units(40), warships: 0, wounds: {} });
  queueDiplomaticOrder(s, { nationId: 'roc-epine', target: 'valmorne', action: 'break' });
  resolveInterturn(s, arkenV9Map);
  const ev = s.events.find(e => e.type === 'convoy-rerouted' && e.nationId === 'valmorne');
  assert.ok(ev, 'une ligne au journal');
  assert.equal(ev.landed, true);
  assert.match(journalEntry(ev, arkenV9Map, 'valmorne').text, /débarque à Roc-Épine, son point de départ/);
  assert.ok(!s.events.some(e => e.type === 'retreat-lost'), 'jamais perdu en mer');
  assert.equal(s.events.filter(e => e.type === 'stationed-recalled' && e.nationId === 'valmorne').reduce((n, e) => n + e.amount, 0), 100, '60 stationnés + 40 du convoi rapatriés');
  assert.ok(!atWar(s, 'valmorne', 'roc-epine'), 'pas de guerre involontaire');
});

// --- 4. Journal de combat : PV des troupes stationnées ---------------------------------------------------------
test('journal de combat : les PV perdus par les troupes stationnées sont comptés à part', () => {
  const s = freshState({ allHuman: true });
  setRelation(s, { nationId: 'valmorne', target: 'roc-epine', type: 'alliance' });
  s.provinces.p05.units = units(100); s.provinces.p05.buildings.fort = 0;
  s.stationed = [{ nationId: 'valmorne', provinceId: 'p05', units: units(200), warships: 0, wounds: {} }];
  s.provinces.p07.ownerId = 'noireflamme'; s.provinces.p07.units = units(150);
  const hp0 = totalHp(legacyForce(s.stationed[0])), own0 = totalHp(legacyForce(s.provinces.p05));
  s.orders.push({ id: 'x1', kind: 'move', nationId: 'noireflamme', fromId: 'p07', toId: 'p05', units: units(150), warships: 0, routeType: 'land', status: 'pending', turn: s.turn });
  resolveInterturn(s, map);
  const b = s.events.find(e => e.type === 'battle' && e.provinceId === 'p05');
  assert.ok(b.hpLostByNation.valmorne > 0, 'PV des stationnés présents');
  assert.ok(b.hpLostByNation['roc-epine'] > 0);
  // Exact : PV avant − PV après (soins exclus : la province a combattu).
  assert.equal(b.hpLostByNation.valmorne, hp0 - totalHp(legacyForce(stationedAt(s, 'p05', 'valmorne'))));
  assert.equal(b.hpLostByNation['roc-epine'], own0 - totalHp(legacyForce(s.provinces.p05)));
  assert.match(journalEntry(b, arkenV9Map, 'valmorne').text, /PV perdus, blessés compris : [^.]*Valmorne \d+/);
  // Province prise : tous les PV des stationnés sont perdus.
  const t = freshState({ allHuman: true });
  setRelation(t, { nationId: 'valmorne', target: 'roc-epine', type: 'alliance' });
  t.provinces.p05.units = units(10); t.provinces.p05.buildings.fort = 0;
  t.stationed = [{ nationId: 'valmorne', provinceId: 'p05', units: units(10), warships: 0, wounds: {} }];
  t.provinces.p07.ownerId = 'noireflamme'; t.provinces.p07.units = units(600);
  t.orders.push({ id: 'x1', kind: 'move', nationId: 'noireflamme', fromId: 'p07', toId: 'p05', units: units(600), warships: 0, routeType: 'land', status: 'pending', turn: t.turn });
  const all = totalHp(legacyForce(t.stationed[0]));
  resolveInterturn(t, map);
  const c = t.events.find(e => e.type === 'conquest' && e.provinceId === 'p05');
  assert.equal(c.hpLostByNation.valmorne, all);
});

// --- 5. Section 3, point 1 : l'allié vient vraiment défendre (simulation) --------------------------------------
test('simulation : un allié IA à qui l\'on demande « Défends-moi » envoie des troupes dans les provinces menacées', () => {
  const report = [];
  for (const arch of ['heros', 'batisseur', 'conquerant']) {
    let came = 0, runs = 0;
    for (const seed of ['a', 'b', 'c', 'd']) {
      const s = createGameState({ map: arkenV9Map, playerNationId: 'valmorne', seed: `def-${arch}-${seed}` });
      for (const id of Object.keys(s.nations)) s.controllers[id] = id === 'valmorne' ? 'human' : 'ai';
      s.leaders['roc-epine'].archetype = arch;
      setRelation(s, { nationId: 'valmorne', target: 'roc-epine', type: 'alliance' });
      setRelation(s, { nationId: 'valmorne', target: 'oroel', type: 'war' });
      for (const id of ['p05', 'p06', 'p07', 'p08']) s.provinces[id].units.infantry = 200;
      s.diplomacy.help = [{ ally: 'roc-epine', requester: 'valmorne', kind: 'defend', against: null, provinceId: null, turn: s.turn, until: s.turn + 5 }];
      for (let i = 0; i < 5; i++) resolveInterturn(s, arkenV9Map);
      runs++;
      const menaced = new Set(['p02', 'p03']); // points de port de Valmorne face à Oroël et au sud-ouest
      if (s.events.some(e => (e.type === 'movement' || e.type === 'convoy-arrived') && e.passage && e.nationId === 'roc-epine' && e.target === 'valmorne' && (menaced.has(e.toId) || s.provinces[e.toId]?.ownerId === 'valmorne'))) came++;
    }
    report.push(`${arch} ${came}/${runs}`);
    assert.equal(came, runs, `${arch} : l'allié vient défendre (${came}/${runs})`);
  }
});

test('correctif (vérification du point 1) : province menacée hors de portée directe → l\'allié fait escale chez vous puis y avance', () => {
  const s = v9State();
  s.controllers['roc-epine'] = 'ai'; s.leaders['roc-epine'].archetype = 'heros';
  setRelation(s, { nationId: 'valmorne', target: 'roc-epine', type: 'alliance' });
  setRelation(s, { nationId: 'valmorne', target: 'oroel', type: 'war' });
  for (const id of ['p05', 'p06', 'p07', 'p08']) s.provinces[id].units.infantry = 200;
  // Seule Branvale (p03) fait face à Oroël ; Roc-Épine n'y va pas directement (sa route mène à Sylvaren, p02).
  s.diplomacy.help = [{ ally: 'roc-epine', requester: 'valmorne', kind: 'defend', against: null, provinceId: null, turn: s.turn, until: s.turn + 5 }];
  planAIOrders(s, arkenV9Map);
  const o = s.orders.find(x => x.kind === 'move' && x.nationId === 'roc-epine' && x.passage);
  assert.ok(o, 'avant la V14.0 : aucun envoi tant que Branvale tenait');
  assert.equal(o.toId, 'p02', 'escale à Sylvaren');
  for (let i = 0; i < 2; i++) resolveInterturn(s, arkenV9Map);
  assert.ok(stationedAt(s, 'p02', 'roc-epine'), 'arrivées à Sylvaren');
  s.ai.plannedTurn = null;
  planAIOrders(s, arkenV9Map);
  const next = s.orders.find(x => x.kind === 'move' && x.nationId === 'roc-epine' && x.fromId === 'p02');
  assert.ok(next && next.toId === 'p03', 'puis elles avancent vers Branvale, la province menacée');
});

test('relecture : un allié IA engagé à aider ne rompt pas une trêve récente (pas de trahison malgré lui)', () => {
  const s = freshState({ allHuman: true });
  s.controllers['roc-epine'] = 'ai'; s.leaders['roc-epine'].archetype = 'conquerant';
  setRelation(s, { nationId: 'valmorne', target: 'roc-epine', type: 'alliance' });
  setRelation(s, { nationId: 'valmorne', target: 'noireflamme', type: 'war' });
  setRelation(s, { nationId: 'roc-epine', target: 'noireflamme', type: 'war' });
  setRelation(s, { nationId: 'roc-epine', target: 'noireflamme', type: 'ceasefire' });
  for (const id of ['p05', 'p06', 'p07', 'p08']) s.provinces[id].units.infantry = 500;
  s.provinces.p09.units = units(5); s.provinces.p09.buildings.fort = 0;
  s.diplomacy.help = [{ ally: 'roc-epine', requester: 'valmorne', kind: 'attack', against: 'noireflamme', provinceId: null, turn: s.turn, until: s.turn + 5 }];
  planAIOrders(s, map);
  assert.ok(!s.orders.some(o => o.nationId === 'roc-epine' && o.kind === 'diplomacy' && o.action === 'war'), 'pas de déclaration');
  assert.ok(!s.orders.some(o => o.nationId === 'roc-epine' && o.kind === 'move' && s.provinces[o.toId].ownerId === 'noireflamme'), 'pas d\'attaque');
  resolveInterturn(s, map);
  assert.ok(!s.events.some(e => e.type === 'betrayal'));
  // Trêve de plus de 10 tours : l'engagement est tenu (guerre ordinaire, sans trahison).
  s.diplomacy.treaties.find(t => t.type === 'ceasefire').started = s.turn - 10;
  s.ai.plannedTurn = null;
  planAIOrders(s, map);
  assert.ok(s.orders.some(o => o.nationId === 'roc-epine' && o.kind === 'diplomacy' && o.action === 'war' && o.target === 'noireflamme'));
});
