// V14.2 — retours de bêta de Jack (25/10/2026), docs/V14-cahier-des-charges.md section 2 :
//  1. aide d'alliance : 5 tours UNE FOIS ARRIVÉ, trajet en plus, message sans ambiguïté ;
//  2. hostilité : avertissement à 70 %, guerre automatique à 85 % (joueur et IA) ;
//  3. traits des dirigeants plus marqués (Conquérant provoqué, Héros naïf, Bâtisseur indifférent, Traître multiple) ;
//  4. débarquement : assaillant à 85 % (au lieu de 70 %) ;
//  5. recrutement : détail PV / dégâts, par lot ou par unité ;
//  6. navires en convalescence : 3 à 5 tours dans un port construit ;
//  7. phrases deux fois plus variées ;
//  8. rapport de conquête : saut de ligne avant les pertes totales avec blessés.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { arkenV9Map as map } from '../src/map/arken-v9-map.js';
import { createGameState } from '../src/state/create-game-state.js';
import { resolveInterturn, planAIOrders, setRelation, journalEntry, buildTurnJournal, queueMoveOrder, queueDiplomaticOrder, legalDestinations,
  shipRepairInfo, shipRepairTurnsFor, SHIP_REPAIR_TURNS, eventKnownToPlayer } from '../src/domain/game-engine.js';
import { RULES } from '../src/domain/constants.js';
import { getTension, setTension, HOSTILITY_WARNING, HOSTILITY_WAR, tensionLevel, talkTensionDelta, charmOf, provokers, acceptsAlliance, TALK_TENSION, ensureLeaders } from '../src/domain/leaders.js';
import { queueTalk, talkOptions, talkLineLists, allTalkLines } from '../src/domain/talk.js';
import { MORE_LINES } from '../src/domain/talk-v14-2.js';
import { MORE_HELP_LINES } from '../src/domain/alliances-v14-2.js';
import { helpLineLists, queueHelpRequest, helpPacts, HELP_TURNS, helpTravelTurns, helpJournalText, activeHelpPacts, helpDecision } from '../src/domain/alliances.js';
import { helpPactsFor, helpPactStatus } from '../src/presentation/v13-ux.js';
import { recruitUnitDetail, recruitDetailHtml, shipRepairChip, SHIP_REPAIR_TEXT } from '../src/presentation/v14-2-ux.js';
import { sanitizeJournalEntry, TUTORIAL_GUIDE } from '../src/presentation/v4-ux.js';
import { journalCategoryClass } from '../src/presentation/v5-ux.js';
import { resolveCombat, normalizeForce } from '../src/domain/combat.js';
import { assertInvariants } from './helpers/fixtures.js';

const read = f => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
const NATIONS = map.nations.map(n => n.id);
const atWar = (s, a, b) => s.diplomacy.wars.some(w => w.active !== false && w.participants.includes(a) && w.participants.includes(b));
const allied = (s, a, b) => s.diplomacy.treaties.some(t => t.active !== false && t.type === 'alliance' && t.parties.includes(a) && t.parties.includes(b));
/** Joueur Valmorne ; seules les nations listées dans `ai` sont des IA, avec l'archétype donné. */
function game(ai = {}, { seed = 'v14-2', player = 'valmorne' } = {}) {
  const s = createGameState({ map, playerNationId: player, seed });
  for (const id of NATIONS) s.controllers[id] = ai[id] ? 'ai' : 'human';
  s.leaders = Object.fromEntries(Object.entries(ai).map(([id, archetype]) => [id, { archetype, revealed: false }]));
  return s;
}
const turn = s => { const start = s.events.length; resolveInterturn(s, map); return s.events.slice(start); };
const replan = s => { s.ai.plannedTurn = null; s.orders = s.orders.filter(o => o.nationId === s.playerNationId); planAIOrders(s, map); };

// --- 1. Aide d'alliance ----------------------------------------------------------------------------------------------
test('aide d\'alliance : 5 tours une fois arrivé — le trajet s\'ajoute, le journal le dit sans ambiguïté', () => {
  const s = game({ 'roc-epine': 'heros' });
  setRelation(s, { nationId: 'valmorne', target: 'roc-epine', type: 'alliance' });
  assert.equal(queueHelpRequest(s, { from: 'valmorne', to: 'roc-epine', kind: 'defend' }).ok, true);
  const answer = turn(s).find(e => e.type === 'help-answer');
  assert.equal(answer.accepted, true);
  const pact = helpPacts(s)[0];
  // Roc-Épine → Valmorne : une route maritime p05 → p02 de 2 tours.
  assert.equal(pact.travel, 2);
  assert.equal(pact.until, pact.turn + 2 + HELP_TURNS, 'trajet + 5 tours d\'aide sur place');
  const text = journalEntry(answer, map, 'valmorne').text;
  assert.match(text, /Roc-Épine accepte de vous défendre : ses troupes partent maintenant, arrivée estimée dans 2 tours, puis elles vous aident pendant 5 tours \(engagement jusqu’au tour 8\)\./);
  assert.doesNotMatch(text, /\(5 tours\)/, 'fini l\'ancien « (5 tours) » ambigu');
  // Fenêtre « Aide de X » : en route, puis sur place.
  // Le joueur lit la réponse au tour suivant (tour 2) : troupes sur place au début du tour 4, aide des tours 4 à 8.
  const [p] = helpPactsFor(s, 'roc-epine');
  assert.equal(helpPactStatus(p), 'en route : arrivée estimée dans 2 tours, puis aide pendant 5 tours');
  s.turn = pact.turn + 3;
  assert.equal(helpPactStatus(helpPactsFor(s, 'roc-epine')[0]), 'aide sur place : encore 5 tours');
  s.turn = pact.until;
  assert.equal(helpPactStatus(helpPactsFor(s, 'roc-epine')[0]), 'aide sur place : encore 1 tour');
  // Interface : la règle est écrite dans la fenêtre de demande.
  assert.match(read('app.js'), /dure \$\{HELP_TURNS\} tours <b>une fois ses troupes arrivées<\/b>/);
});

test('aide d\'alliance : avant la V14.2, le trajet mangeait l\'aide ; maintenant l\'allié aide vraiment 5 tours sur place', () => {
  const s = game({ 'roc-epine': 'heros', oroel: 'conquerant' });
  setRelation(s, { nationId: 'valmorne', target: 'roc-epine', type: 'alliance' });
  setRelation(s, { nationId: 'oroel', target: 'valmorne', type: 'war' });
  s.provinces.p05.units.infantry = 600; s.provinces.p06.units.infantry = 600;
  queueHelpRequest(s, { from: 'valmorne', to: 'roc-epine', kind: 'defend' });
  turn(s);
  const pact = helpPacts(s)[0];
  let arrived = null, activeAfter = 0;
  for (let i = 0; i < 12; i++) {
    if (arrived === null && (s.stationed || []).some(e => e.nationId === 'roc-epine' && s.provinces[e.provinceId].ownerId === 'valmorne')) arrived = s.turn;
    if (arrived !== null && activeHelpPacts(s, 'roc-epine').length) activeAfter++;
    turn(s);
  }
  assert.ok(arrived !== null, 'les troupes de Roc-Épine arrivent chez Valmorne');
  assert.equal(arrived, pact.turn + 1 + pact.travel, `arrivée au tour ${arrived} (estimée ${pact.turn + 1 + pact.travel})`);
  assert.ok(activeAfter >= HELP_TURNS, `engagement encore actif ${activeAfter} tours après l'arrivée`);
});

test('aide d\'alliance : trajet estimé selon la géographie, plafonné ; anciennes sauvegardes lisibles', () => {
  const s = game();
  const routes = id => legalDestinations(map, s, id);
  assert.equal(helpTravelTurns(s, 'roc-epine', { requester: 'valmorne', kind: 'defend' }, routes), 2);
  assert.equal(helpTravelTurns(s, 'roc-epine', { requester: 'valmorne', kind: 'attack', target: 'aurel' }, routes), 2);
  assert.ok(helpTravelTurns(s, 'noireflamme', { requester: 'valmorne', kind: 'defend' }, routes) <= 4, 'plafond');
  assert.equal(helpTravelTurns(s, 'roc-epine', { requester: 'valmorne', kind: 'defend' }), 1, 'sans carte : 1 tour');
  // Solmara n'a aucune route vers Valmorne (il faudrait traverser Roc-Épine) : pas de fausse estimation.
  assert.equal(helpTravelTurns(s, 'aurel', { requester: 'valmorne', kind: 'defend' }, routes), null);
  assert.match(helpJournalText({ type: 'help-answer', nationId: 'aurel', target: 'valmorne', help: 'defend', accepted: true, turns: 5, travel: 4, until: 10, noRoute: true }, map, 'valmorne'),
    /Solmara accepte de vous défendre, mais aucune route directe ne mène ses troupes jusque-là : elles risquent de ne pas venir\./);
  assert.match(helpPactStatus({ noRoute: true, helpLeft: 9 }), /aucune route directe/);
  // Événement d'une sauvegarde V14.1 (sans `travel`) : texte clair quand même.
  const old = { type: 'help-answer', nationId: 'roc-epine', target: 'valmorne', help: 'defend', accepted: true, turns: 5 };
  assert.equal(helpJournalText(old, map, 'valmorne'), 'Roc-Épine accepte de vous défendre : son engagement dure 5 tours à partir de maintenant, trajet compris.');
  const atk = { ...old, help: 'attack', against: 'aurel', travel: 3, until: 12 };
  assert.match(helpJournalText(atk, map, 'valmorne'), /arrivée estimée dans 3 tours, puis elles combattent Solmara à vos côtés pendant 5 tours/);
  assert.equal(helpJournalText({ ...old, travel: 2, until: 8 }, map, 'oroel'), 'Roc-Épine accepte une demande d’aide.');
});

// --- 2. Hostilité -------------------------------------------------------------------------------------------------------
test('hostilité — diagnostic V14.1 : à 100 % rien ne se passait (aucune règle), maintenant avertissement puis guerre', () => {
  assert.equal(HOSTILITY_WARNING, 70); assert.equal(HOSTILITY_WAR, 85);
  const s = game();
  setTension(s, 'valmorne', 'oroel', 100);
  const first = turn(s);
  const warn = first.find(e => e.type === 'hostility-warning');
  assert.ok(warn, 'avertissement');
  assert.equal(atWar(s, 'valmorne', 'oroel'), false, 'jamais de guerre le tour même de l\'avertissement');
  const w = journalEntry(warn, map, 'valmorne');
  assert.equal(w.type, '⚠ HOSTILITÉ');
  assert.match(w.text, /Tension avec Oroël : \d+ %\. Attention : dès 85 % \(à partir du prochain tour\), la guerre sera déclarée automatiquement\./);
  assert.notEqual(journalCategoryClass(w.type), 'neutral');
  const second = turn(s);
  const war = second.find(e => e.type === 'hostility-war');
  assert.ok(war && atWar(s, 'valmorne', 'oroel'), 'guerre déclarée');
  const t = journalEntry(war, map, 'valmorne');
  assert.equal(t.type, '⚔ GUERRE DÉCLARÉE');
  assert.match(t.text, /L’hostilité avec Oroël a atteint \d+ % \(seuil : 85 %\) : la guerre est déclarée entre vous et Oroël\./);
  assert.ok(buildTurnJournal(s, map, 0).some(e => e.type === '⚔ GUERRE DÉCLARÉE'), 'dans le récapitulatif inter-tour');
  // Pas une agression : ni trahison, ni réputation.
  assert.ok(!s.events.some(e => e.type === 'betrayal'));
  assert.equal(s.ai?.reputation?.valmorne?.attacks || 0, 0);
  // Après la déclaration : la jauge dit « en guerre » et ne retombe pas sous 70 %.
  for (let i = 0; i < 5; i++) turn(s);
  assert.equal(tensionLevel(s, 'valmorne', 'oroel').label, 'en guerre');
  assert.ok(getTension(s, 'valmorne', 'oroel') >= 70);
});

test('hostilité : cas limites — 69 % rien, 70 % avertissement seul, 84 % pas de guerre, 85 % guerre', () => {
  for (const [v, warn, war] of [[69, false, false], [70, true, false], [84, true, false], [85, true, true]]) {
    const s = game();
    s.hostilityWarned = { 'oroel|valmorne': 0 }; // déjà averti lors d'un tour précédent (sauf à 69 %, oublié)
    setTension(s, 'valmorne', 'oroel', v); // contrôlée après les échanges du tour, avant la retombée de fin de tour
    const ev = turn(s);
    assert.equal(atWar(s, 'valmorne', 'oroel'), war, `${v} % : guerre ${war}`);
    if (v < 70) assert.ok(!ev.some(e => e.type === 'hostility-warning'), `${v} % : aucun avertissement`);
    if (warn && !war) assert.ok(s.hostilityWarned['oroel|valmorne'] !== undefined, `${v} % : averti`);
  }
});

test('hostilité : une alliance ou une trêve protège (plafond 84 %) ; retombée sous 70 % = avertissement oublié', () => {
  const s = game();
  setRelation(s, { nationId: 'valmorne', target: 'oroel', type: 'alliance' });
  setTension(s, 'valmorne', 'oroel', 100);
  assert.equal(getTension(s, 'valmorne', 'oroel'), HOSTILITY_WAR - 1);
  turn(s); turn(s);
  assert.equal(atWar(s, 'valmorne', 'oroel'), false);
  assert.ok(!s.events.some(e => e.type === 'hostility-warning'), 'pas d\'avertissement entre alliés');
  const t = game();
  setRelation(t, { nationId: 'valmorne', target: 'oroel', type: 'war' });
  queueDiplomaticOrder(t, { nationId: 'valmorne', target: 'oroel', action: 'ceasefire', offerLevel: .5 });
  t.diplomacy.wars = []; t.diplomacy.treaties.push({ active: true, type: 'ceasefire', parties: ['valmorne', 'oroel'], started: t.turn });
  setTension(t, 'valmorne', 'oroel', 99);
  assert.equal(getTension(t, 'valmorne', 'oroel'), 84);
  turn(t); turn(t);
  assert.equal(atWar(t, 'valmorne', 'oroel'), false, 'la trêve tient');
  // Avertissement oublié quand la tension retombe.
  const u = game();
  setTension(u, 'valmorne', 'oroel', 75); turn(u);
  assert.ok(u.hostilityWarned['oroel|valmorne'] !== undefined);
  setTension(u, 'valmorne', 'oroel', 40); turn(u);
  assert.equal(u.hostilityWarned['oroel|valmorne'], undefined);
});

test('hostilité : même règle entre IA (événement public, journal lisible par les autres)', () => {
  const s = game({ oroel: 'heros', noireflamme: 'batisseur' });
  setTension(s, 'oroel', 'noireflamme', 95);
  turn(s);
  const ev = turn(s).find(e => e.type === 'hostility-war');
  assert.ok(ev && atWar(s, 'oroel', 'noireflamme'));
  assert.ok(eventKnownToPlayer(s, map, ev));
  assert.match(journalEntry(ev, map, 'valmorne').text, /L’hostilité entre Noireflamme et Oroël a atteint \d+ % : les deux nations sont désormais en guerre\./);
  assert.ok(!eventKnownToPlayer(s, map, { type: 'hostility-warning', nationId: 'noireflamme', target: 'oroel' }), 'avertissement privé');
});

test('hostilité : des messages hostiles répétés mènent à la guerre, toujours avec un avertissement avant', () => {
  const s = game({ oroel: 'heros' });
  let warned = null, war = null;
  for (let i = 0; i < 8 && !war; i++) {
    queueTalk(s, map, { from: 'valmorne', to: 'oroel', tone: 'hostile' });
    for (const e of turn(s)) { if (e.type === 'hostility-warning' && warned === null) warned = e.turn; if (e.type === 'hostility-war') war = e.turn; }
  }
  assert.ok(warned !== null && war !== null, `averti au tour ${warned}, guerre au tour ${war}`);
  assert.ok(war > warned, 'la guerre vient APRÈS l\'avertissement');
});

// --- 3. Traits des dirigeants -------------------------------------------------------------------------------------------
test('traits — scénario Conquérant : une provocation le pique (+35) et il prend l\'insolent pour cible', () => {
  const s = game({ oroel: 'conquerant' }, { seed: 'conq-prov' });
  assert.equal(talkTensionDelta(s, 'valmorne', 'oroel', 'hostile'), 35);
  // Proie « naturelle » d'Oroël : la plus faible qu'il atteint. On rend Valmorne fort pour qu'il ne soit pas la proie.
  for (const id of ['p01', 'p02', 'p03', 'p04']) s.provinces[id].units.infantry = 900;
  s.turn = 6; replan(s);
  const before = s.orders.some(o => o.kind === 'diplomacy' && o.nationId === 'oroel' && o.target === 'valmorne' && o.action === 'war') || atWar(s, 'oroel', 'valmorne');
  assert.equal(before, false, 'sans provocation, il laisse Valmorne tranquille');
  queueTalk(s, map, { from: 'valmorne', to: 'oroel', tone: 'hostile' });
  turn(s);
  assert.deepEqual(provokers(s, 'oroel'), ['valmorne']);
  assert.ok(getTension(s, 'valmorne', 'oroel') >= 10 + 35 - 1);
  // Il attaque l'insolent : débarquement préparé vers Valmorne (ou au moins flotte armée contre lui) au plus tard
  // dans les tours qui suivent, et la provocation est rappelée par une guerre ouverte.
  let attacked = false;
  for (let i = 0; i < 8 && !attacked; i++) { turn(s); attacked = atWar(s, 'oroel', 'valmorne'); }
  assert.ok(attacked, 'le Conquérant provoqué entre en guerre contre Valmorne');
});

test('traits — scénario Héros naïf : l\'amitié le manipule (tension −14, alliance malgré une agression, suit une attaque)', () => {
  const s = game({ 'roc-epine': 'heros' }, { seed: 'hero-charm' });
  assert.equal(talkTensionDelta(s, 'valmorne', 'roc-epine', 'amical'), -14);
  // Valmorne vient d'agresser Oroël : sans charme, le Héros refuse son alliance.
  s.ai = { aggressions: [{ turn: s.turn, attacker: 'valmorne', victim: 'oroel', reason: 'combat' }] };
  setTension(s, 'valmorne', 'roc-epine', 30);
  assert.equal(acceptsAlliance(s, 'roc-epine', 'valmorne'), false);
  for (let i = 0; i < 3; i++) { queueTalk(s, map, { from: 'valmorne', to: 'roc-epine', tone: 'amical' }); turn(s); s.ai.aggressions.push({ turn: s.turn, attacker: 'valmorne', victim: 'oroel', reason: 'combat' }); }
  assert.equal(charmOf(s, 'roc-epine', 'valmorne'), 3);
  setTension(s, 'valmorne', 'roc-epine', 45);
  assert.equal(acceptsAlliance(s, 'roc-epine', 'valmorne'), true, 'trois amabilités lui font oublier l\'agression');
  // Allié flatté : il accepte d'attaquer une nation qui ne lui a rien fait.
  setRelation(s, { nationId: 'valmorne', target: 'roc-epine', type: 'alliance' });
  let yes = 0;
  for (let i = 0; i < 20; i++) { s.turn = 100 + i; s.ai.charm['roc-epine'].valmorne.turn = s.turn; if (helpDecision(s, 'roc-epine', { from: 'valmorne', kind: 'attack', target: 'aurel' }).accept) yes++; }
  assert.equal(yes, 20);
  // Un message hostile rompt le charme.
  queueTalk(s, map, { from: 'valmorne', to: 'roc-epine', tone: 'hostile' }); turn(s);
  assert.equal(charmOf(s, 'roc-epine', 'valmorne'), 0);
});

test('traits — scénario Bâtisseur : se fiche des querelles (provocation +8, retombée deux fois plus rapide, jamais agressif)', () => {
  const s = game({ noireflamme: 'batisseur' }, { seed: 'build' });
  assert.equal(talkTensionDelta(s, 'valmorne', 'noireflamme', 'hostile'), 8);
  assert.equal(TALK_TENSION.hostile, 20, 'règle générale inchangée');
  for (let i = 0; i < 4; i++) { queueTalk(s, map, { from: 'valmorne', to: 'noireflamme', tone: 'hostile' }); turn(s); }
  assert.ok(getTension(s, 'valmorne', 'noireflamme') < HOSTILITY_WARNING, `4 provocations : ${getTension(s, 'valmorne', 'noireflamme')} %`);
  assert.equal(atWar(s, 'valmorne', 'noireflamme'), false);
  setTension(s, 'valmorne', 'noireflamme', 60); turn(s);
  assert.equal(getTension(s, 'valmorne', 'noireflamme'), 58, 'retombée de 2 par tour');
  // Querelle d'un allié : à peine +5.
  setRelation(s, { nationId: 'noireflamme', target: 'oroel', type: 'alliance' });
  const t0 = getTension(s, 'noireflamme', 'aurel');
  queueDiplomaticOrder(s, { nationId: 'aurel', target: 'oroel', action: 'war' }); turn(s);
  assert.ok(getTension(s, 'noireflamme', 'aurel') - t0 <= 5);
});

test('traits — scénario Traître : il trahit n\'importe quel allié, plusieurs fois, quand c\'est payant', () => {
  const s = game({ noireflamme: 'traitre' }, { seed: 'traitor-any' });
  ensureLeaders(s);
  // Deux alliés : Valmorne (sa marque initiale ou non) et Oroël, faible et en guerre contre Solmara.
  setRelation(s, { nationId: 'noireflamme', target: 'oroel', type: 'alliance' });
  setRelation(s, { nationId: 'oroel', target: 'aurel', type: 'war' });
  s.diplomacy.treaties.find(t => t.type === 'alliance').started = 1;
  s.turn = 10;
  for (const id of ['p13', 'p14', 'p15', 'p16']) s.provinces[id].units = { infantry: 20, cavalry: 0, armor: 0, artillery: 0 };
  for (const id of ['p09', 'p10', 'p11', 'p12']) { s.provinces[id].units.infantry = 500; s.provinces[id].units.armor = 6; }
  s.provinces.p09.buildings.port = 1; s.provinces.p09.buildings.factory = 1; s.provinces.p09.warships = 4;
  s.ai = { plans: { noireflamme: { mark: 'aurel', strikeTurn: 40 } } }; // sa marque « prévue » est une autre nation
  let betrayed = null;
  for (let i = 0; i < 6 && !betrayed; i++) betrayed = turn(s).find(e => e.type === 'betrayal' && e.nationId === 'noireflamme');
  assert.ok(betrayed, 'il trahit');
  assert.equal(betrayed.target, 'oroel', 'l\'allié faible et occupé, pas la marque prévue');
  // Une ancienne victime peut être retrahie : nouvelle alliance, nouvelle occasion → nouvelle trahison.
  s.diplomacy.wars = s.diplomacy.wars.filter(w => !(w.participants.includes('noireflamme') && w.participants.includes('oroel')));
  setRelation(s, { nationId: 'noireflamme', target: 'oroel', type: 'alliance' });
  s.diplomacy.treaties.find(t => t.type === 'alliance' && t.parties.includes('oroel')).started = s.turn - 6;
  if (!atWar(s, 'oroel', 'aurel')) setRelation(s, { nationId: 'oroel', target: 'aurel', type: 'war' });
  s.ai.plans.noireflamme.mark = null; s.ai.plans.noireflamme.strikeTurn = 0;
  let again = null;
  for (let i = 0; i < 8 && !again; i++) again = turn(s).find(e => e.type === 'betrayal' && e.nationId === 'noireflamme' && e.target === 'oroel');
  assert.ok(again, 'deuxième trahison de la même nation');
});

test('traits : aperçu du joueur — honnête sans rien dévoiler (pire cas, plafond d\'alliance, seuil de guerre)', () => {
  const s = game({ oroel: 'conquerant', 'roc-epine': 'heros' });
  const preview = (to, tone = 'hostile') => talkOptions(s, map, { from: 'valmorne', to }).find(o => o.tone === tone).preview;
  setTension(s, 'valmorne', 'oroel', 55);
  // Caractère inconnu : effet habituel (+20), mais « jusqu'à 90 % selon son caractère » et l'alerte de guerre automatique.
  assert.equal(preview('oroel'), 'Tension 55 % → 75 % (+20, jusqu’à 90 % selon son caractère) · le risque de guerre bondit · ⚠ dès 85 %, guerre déclarée automatiquement');
  s.leaders.oroel.revealed = true;
  assert.equal(preview('oroel'), 'Tension 55 % → 90 % (+35) · le risque de guerre bondit · ⚠ dès 85 %, guerre déclarée automatiquement');
  // Allié : plafond de 84 % annoncé, jamais d'alerte de guerre.
  setRelation(s, { nationId: 'valmorne', target: 'roc-epine', type: 'alliance' });
  setTension(s, 'valmorne', 'roc-epine', 75);
  assert.equal(preview('roc-epine'), 'Tension 75 % → 84 % (+20) · le risque de guerre bondit · plafonnée à 84 % par votre alliance');
  // Franchir 70 % : rappel du seuil.
  setTension(s, 'valmorne', 'aurel', 55);
  assert.match(preview('aurel'), /⚠ au bord de la guerre \(guerre automatique à 85 %\)/);
});

test('relecture : le passage à « au bord de la guerre » ne double plus l\'avertissement d\'hostilité au journal', () => {
  const ev = { type: 'tension', nationId: 'valmorne', target: 'oroel', value: 72, label: 'au bord de la guerre', previous: 'hostile', rising: true };
  assert.equal(journalEntry(ev, map, 'valmorne'), null);
  assert.ok(journalEntry({ ...ev, label: 'hostile', previous: 'tendu', value: 55 }, map, 'valmorne'));
  assert.match(journalEntry({ ...ev, rising: false, label: 'hostile', value: 60 }, map, 'valmorne').text, /retombe/);
});

// --- Simulations avant / après (graines fixes) -------------------------------------------------------------------------
function simulate(games = 12, prefix = 'v142') {
  const by = () => ({ heros: 0, conquerant: 0, traitre: 0, batisseur: 0 });
  const m = { attacks: by(), betrayals: by(), victims: [], hostility: 0, warnings: 0, landings: 0, landingWins: 0 };
  for (let g = 0; g < games; g++) {
    const s = createGameState({ map, playerNationId: NATIONS[g % 5], seed: `${prefix}-${g}` });
    for (const id of NATIONS) s.controllers[id] = 'ai';
    for (let i = 0; i < 80 && !s.gameOver; i++) {
      resolveInterturn(s, map);
      assertInvariants(s, `V14.2 ${g}`);
      for (const a of NATIONS) for (const b of NATIONS) if (a < b) assert.ok(!(atWar(s, a, b) && allied(s, a, b)), 'alliés et en guerre');
    }
    const arch = id => s.leaders[id]?.archetype || 'batisseur';
    const tv = new Set();
    for (const e of s.events) {
      if (e.type === 'battle' || e.type === 'conquest') for (const a of new Set(e.attackers || [e.attacker])) m.attacks[arch(a)]++;
      if ((e.type === 'battle' || e.type === 'conquest') && e.naval) { m.landings++; if (e.type === 'conquest') m.landingWins++; }
      if (e.type === 'betrayal') { m.betrayals[arch(e.nationId)]++; if (arch(e.nationId) === 'traitre') tv.add(e.target); }
      if (e.type === 'hostility-war') m.hostility++;
      if (e.type === 'hostility-warning') m.warnings++;
      assert.doesNotThrow(() => journalEntry(e, map, s.playerNationId));
    }
    m.victims.push(tv.size);
  }
  return m;
}
test('simulation (12 parties × 80 tours, graines fixes) : traits bien distincts, hostilité active, débarquements raisonnables', () => {
  const m = simulate();
  console.log(`# info V14.2 simulation : assauts ${JSON.stringify(m.attacks)}, trahisons ${JSON.stringify(m.betrayals)}, guerres par hostilité ${m.hostility}, avertissements ${m.warnings}, débarquements ${m.landings} (${Math.round(100 * m.landingWins / m.landings)} % réussis)`);
  assert.ok(m.attacks.conquerant > 2 * m.attacks.heros, 'le Conquérant attaque bien plus que le Héros');
  assert.ok(m.attacks.batisseur < m.attacks.heros, 'le Bâtisseur est le moins agressif');
  assert.equal(m.betrayals.heros + m.betrayals.batisseur, 0, 'seul le Traître trahit (le Conquérant attend la fin des trêves)');
  assert.ok(m.betrayals.traitre >= 12, `le Traître trahit souvent (${m.betrayals.traitre})`);
  assert.ok(m.victims.filter(v => v >= 2).length >= 4, `il trahit plusieurs nations dans une même partie (${m.victims.join(',')})`);
  assert.ok(m.hostility > 0 && m.warnings >= m.hostility, 'toujours un avertissement avant une guerre par hostilité');
  assert.ok(m.landingWins / m.landings <= .75, 'les débarquements ne deviennent pas une formalité');
});

// --- 4. Débarquement -----------------------------------------------------------------------------------------------------
test('débarquement : assaillant à 85 % (au lieu de 70 %), affiché partout avec le vrai chiffre', () => {
  assert.equal(RULES.combat.landingPenalty, .85);
  const F = u => normalizeForce({ units: u });
  const land = resolveCombat({ attacker: F({ infantry: 100 }), defender: F({ infantry: 400 }), passes: 1 }).defenderHpLost;
  const landing = resolveCombat({ attacker: F({ infantry: 100 }), defender: F({ infantry: 400 }), mode: 'landing', passes: 1 }).defenderHpLost;
  assert.ok(Math.abs(landing - land * .85) <= 2);
  const e = { type: 'conquest', attacker: 'valmorne', attackers: ['valmorne'], defender: 'oroel', newOwnerId: 'valmorne', provinceId: 'p14', naval: true, landingPct: 85,
    lossesByNation: { valmorne: { infantry: 3 }, oroel: { infantry: 30 } }, engagedByNation: { valmorne: { infantry: 200 }, oroel: { infantry: 30 } }, hpLostByNation: { valmorne: 40, oroel: 300 } };
  assert.match(journalEntry(e, map, 'valmorne').text, /débarquement : assaillant à 85 %/);
  assert.match(journalEntry({ ...e, landingPct: undefined }, map, 'valmorne').text, /assaillant à 70 %/, 'ancien rapport : chiffre de l\'époque');
  assert.match(TUTORIAL_GUIDE.find(x => x.id === 'maritime').text, /combat à 85 %/);
  assert.doesNotMatch(read('app.js'), /troupes à 70 %/);
});

// --- 5. Recrutement ---------------------------------------------------------------------------------------------------------
test('recrutement : PV et dégâts par lot (fantassins, cavaliers) ou par unité (blindé, artilleur, navire)', () => {
  const inf = recruitUnitDetail('infantry');
  assert.equal(inf.perLot, true); assert.equal(inf.lotLabel, 'par lot de 20 fantassins');
  assert.deepEqual(inf.lot, { hp: 200, damage: 100 }); assert.deepEqual(inf.unit, { hp: 10, damage: 5 });
  const cav = recruitUnitDetail('cavalry');
  assert.equal(cav.lotLabel, 'par lot de 5 cavaliers'); assert.deepEqual(cav.lot, { hp: 175, damage: 100 });
  for (const k of ['armor', 'artillery', 'warship']) {
    const d = recruitUnitDetail(k);
    assert.equal(d.perLot, false, k); assert.match(d.lotLabel, /^par unité/);
    assert.deepEqual(d.unit, { hp: RULES.combat.units[k].hp, damage: RULES.combat.units[k].damage });
  }
  const html = recruitDetailHtml('infantry');
  assert.match(html, /200 PV<\/b> · <b>100 dégâts par assaut<\/b> <small>par lot de 20 fantassins<\/small>/);
  assert.match(html, /soit 10 PV et 5 dégâts par fantassin/);
  assert.match(recruitDetailHtml('armor'), /240 PV<\/b> · <b>120 dégâts par assaut<\/b> <small>par unité \(1 blindé par lot\)/);
  assert.match(recruitDetailHtml('cavalry'), /Fort contre : artillerie \(×2\)/);
  assert.equal(recruitUnitDetail('balloon'), null);
});

test('recrutement : ouvrir le détail ne recrute jamais (bouton séparé des + / −, sans effet sur les lots)', () => {
  const app = read('app.js');
  const fn = app.slice(app.indexOf('function openRecruit()'), app.indexOf('function openBuild()'));
  assert.match(fn, /data-unit-info="\$\{key\}"/);
  assert.match(fn, /type="button" class="unit-info-btn"/);
  // Le gestionnaire du bouton détail ne touche qu'à l'affichage : ni `lots`, ni queueRecruitment, ni update().
  const handler = fn.slice(fn.indexOf("querySelectorAll('[data-unit-info]')"), fn.indexOf('for(const {key} of items)'));
  assert.ok(handler.length > 0);
  assert.doesNotMatch(handler, /lots\[|queueRecruitment|update\(\)/);
  assert.match(handler, /stopPropagation/);
  // Les boutons + / − gardent leurs propres attributs (data-lot-plus / data-lot-minus).
  assert.match(fn, /data-lot-plus="\$\{key\}"/);
});

// --- 6. Navires en convalescence -------------------------------------------------------------------------------------------
function shipGame({ wounds, port = true, ships = 3 }) {
  const s = game();
  const p = s.provinces.p02; p.buildings.port = port ? 1 : 0; p.warships = ships; p.wounds.warship = wounds;
  return s;
}
test('navires en convalescence : port construit → 100 % en 3, 4 ou 5 tours selon les dégâts', () => {
  assert.deepEqual(SHIP_REPAIR_TURNS.map(r => r.turns), [3, 4, 5]);
  const max = 3 * RULES.combat.units.warship.hp; // 2100 PV
  for (const [wounds, turns] of [[200, 3], [Math.floor(max * .15), 3], [500, 4], [Math.floor(max * .3), 4], [1000, 5], [1050, 5]]) {
    assert.equal(shipRepairTurnsFor(wounds, 3), turns, `${wounds} PV perdus`);
    const s = shipGame({ wounds });
    const info = shipRepairInfo(s, 'p02');
    assert.equal(info.turnsLeft, turns); assert.equal(info.hp, max - wounds); assert.equal(info.inPort, true);
    for (let i = 0; i < turns; i++) { assert.ok(s.provinces.p02.wounds.warship > 0, `encore blessés avant ${turns} tours`); turn(s); }
    assert.equal(s.provinces.p02.wounds.warship, 0, `${wounds} PV : 100 % après ${turns} tours`);
    assert.equal(s.provinces.p02.warships, 3);
  }
});

test('navires en convalescence : tours restants qui décroissent, départ avant la fin, port non construit', () => {
  const s = shipGame({ wounds: 1000 });
  assert.equal(shipRepairInfo(s, 'p02').turnsLeft, 5);
  turn(s);
  assert.equal(shipRepairInfo(s, 'p02').turnsLeft, 4);
  assert.equal(shipRepairInfo(s, 'p02').hp, 2100 - 800);
  // Départ avant la fin : les navires partent en mer avec leurs blessures (pas de réparation en mer).
  const w = s.provinces.p02.wounds.warship;
  assert.equal(queueMoveOrder(s, map, { nationId: 'valmorne', fromId: 'p02', toId: 'p05', units: {}, warships: 3 }).ok, true);
  turn(s);
  const convoy = s.transports.find(t => t.nationId === 'valmorne');
  assert.ok(convoy, 'en mer');
  assert.equal(convoy.wounds.warship, w, 'aucune réparation en mer');
  assert.equal(shipRepairInfo(s, 'p02'), null);
  // Port NON construit : réparations de fortune (5 % par tour), bien plus lentes.
  const u = shipGame({ wounds: 1000, port: false });
  const info = shipRepairInfo(u, 'p02');
  assert.equal(info.inPort, false); assert.equal(info.turnsLeft, 10);
  turn(u);
  assert.equal(u.provinces.p02.wounds.warship, 1000 - 105);
  // Peu abîmé dans un port : 3 tours.
  const v = shipGame({ wounds: 50 });
  assert.equal(shipRepairInfo(v, 'p02').turnsLeft, 3);
});

test('navires en convalescence : nouveaux dégâts pendant la réparation → délai recalculé ; ancienne sauvegarde sans plan', () => {
  const s = shipGame({ wounds: 200 });
  turn(s);
  s.provinces.p02.wounds.warship += 800; // un combat les abîme encore
  assert.equal(shipRepairInfo(s, 'p02').turnsLeft, shipRepairTurnsFor(s.provinces.p02.wounds.warship, 3));
  turn(s);
  delete s.shipRepairs; // sauvegarde V14.1
  assert.doesNotThrow(() => turn(s));
  for (let i = 0; i < 6; i++) turn(s);
  assert.equal(s.provinces.p02.wounds.warship, 0);
});

test('navires en convalescence : expliqué dans la fiche (PV actuels, tours restants, sens du mot)', () => {
  const s = shipGame({ wounds: 1000 });
  const chip = shipRepairChip(shipRepairInfo(s, 'p02'));
  assert.match(chip, /3 navires de guerre en convalescence : 1 100 \/ 2 100 PV \(52 %\) · réparation au port : 100 % dans 5 tours/);
  assert.match(chip, /En convalescence = navires blessés : ils ont perdu des PV et tirent moins fort/);
  assert.match(SHIP_REPAIR_TEXT, /3, 4 ou 5 tours/);
  assert.match(shipRepairChip(shipRepairInfo(shipGame({ wounds: 1000, port: false }), 'p02')), /pas de port construit ici : 100 % dans 10 tours environ \(port construit : 3 à 5 tours\)/);
  assert.match(shipRepairChip(shipRepairInfo(shipGame({ wounds: 0 }), 'p02')), /3 navires de guerre : 2 100 PV \(100 %\)/);
  assert.equal(shipRepairChip(null), '');
  assert.match(read('app.js'), /shipRepairChip\(safeEngine\(\(\)=>shipRepairInfo\(state,selected,state\.playerNationId\),null\)\)/);
});

// --- 7. Phrases ---------------------------------------------------------------------------------------------------------------
test('phrases : au moins le double des variantes (messages du joueur, réponses et voix des dirigeants)', () => {
  const lists = talkLineLists();
  // Avant la V14.2 : 9 à 15 répliques par liste (talk.js) ; MORE_LINES en ajoute autant que la liste en avait.
  for (const [path, extra] of Object.entries(MORE_LINES)) {
    const list = lists[path];
    assert.ok(list, path);
    assert.ok(list.length >= 2 * extra.length && extra.length >= 9, `${path} : ${list.length} répliques`);
    assert.equal(new Set(list).size, list.length, `${path} : doublon`);
  }
  for (const path of ['war.hostile', 'reply.amical.amical', 'archetype.conquerant.hostile', 'archetype.batisseur.neutre']) assert.ok(MORE_LINES[path], path);
  assert.equal(Object.keys(MORE_LINES).length, Object.keys(lists).length, 'toutes les listes, messages des IA (ai.*) compris');
  assert.ok(allTalkLines().length >= 1000, `${allTalkLines().length} répliques`);
  // Réponses des alliés aux demandes d'aide : doublées aussi.
  const help = helpLineLists();
  for (const [path, extra] of Object.entries(MORE_HELP_LINES)) {
    assert.ok(help[path] && help[path].length >= 2 * extra.length && extra.length >= 6, `help ${path} : ${help[path]?.length}`);
    assert.equal(new Set(help[path]).size, help[path].length, `help ${path} : doublon`);
  }
  assert.equal(Object.keys(MORE_HELP_LINES).length, Object.keys(help).length, 'toutes les listes d\'aide');
});

// --- 8. Rapports de conquête --------------------------------------------------------------------------------------------------
test('rapport de conquête : saut de ligne entre le récap et les pertes totales avec blessés, rien d\'autre ne change', () => {
  const e = { type: 'conquest', attacker: 'valmorne', attackers: ['valmorne'], defender: 'oroel', newOwnerId: 'valmorne', provinceId: 'p14', naval: true, landingPct: 85,
    lossesByNation: { valmorne: { infantry: 88, cavalry: 2 }, oroel: { infantry: 370 } }, engagedByNation: { valmorne: { infantry: 432 }, oroel: { infantry: 370 } }, hpLostByNation: { valmorne: 3522, oroel: 6025 } };
  const text = journalEntry(e, map, 'valmorne').text;
  assert.equal(text, 'Affrontement à Nordhème entre Valmorne et Oroël (débarquement) : Valmorne prend la province. Pertes : Valmorne 88 fantassins, 2 cavaliers ; Oroël 370 fantassins. Forces engagées : Valmorne 432 fantassins ; Oroël 370 fantassins.\nPV perdus, blessés compris : Valmorne 3522 ; Oroël 6025 (débarquement : assaillant à 85 %).');
  // Le nettoyage du journal garde ce saut de ligne (et un seul), l'affichage le respecte.
  assert.equal(sanitizeJournalEntry({ text: 'a  b\n\n  c   d ' }).text, 'a b\nc d');
  assert.match(sanitizeJournalEntry({ text }).text, /\.\nPV perdus, blessés compris/);
  assert.match(read('v5.css'), /\.journal-entry>div\{white-space:pre-line\}/);
});

// --- Version visible -----------------------------------------------------------------------------------------------------------
test('version 14.2.0', () => {
  assert.equal(JSON.parse(read('package.json')).version, '14.2.0');
});
