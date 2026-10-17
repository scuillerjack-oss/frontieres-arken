// V10 marine (docs/V10-marine.md) : embarquement, durée par étapes, interception, escorte, débarquement, renfort,
// migration des transports V10 lot 2, fin de partie. Carte V9 « Leonardo ».
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { arkenV9Map as map } from '../src/map/arken-v9-map.js';
import { createGameState } from '../src/state/create-game-state.js';
import { RULES } from '../src/domain/constants.js';
import { legalDestinations, queueMoveOrder, resolveInterturn, seaTravelTurns, landingCoast, journalEntry, checkGameOver, gameRanking, capitalsVictor, setRelation } from '../src/domain/game-engine.js';
import { migrateSave, encodeSave, decodeSave } from '../src/persistence/save-codec.js';
import { assertInvariants } from './helpers/fixtures.js';

const NATIONS = map.nations.map(n => n.id);
const fresh = (player = 'valmorne') => { const s = createGameState({ map, playerNationId: player }); for (const id of NATIONS) s.controllers[id] = 'human'; return s; };
const sea = (s, id) => legalDestinations(map, s, id).filter(d => d.type === 'sea');
const lane = (a, b) => map.seaLanes.find(l => (l.from === a && l.to === b) || (l.from === b && l.to === a));
const war = (s, a, b) => s.diplomacy.wars.push({ active: true, participants: [a, b], started: s.turn });
// Les invariants de la carte V6 ne s'appliquent pas tels quels (identifiants identiques) : on les réutilise.
const check = (s, label) => assertInvariants(s, label);

// --- Embarquement -----------------------------------------------------------------------------------------------
// V13 : les règles d'embarquement / débarquement de la V10 (port CONSTRUIT au départ, débarquement sur les voisines
// côtières) sont remplacées par les points de port de l'anneau : voir tests/marine-v13.test.js.
test('embarquement : aucun port à l\'arrivée n\'est nécessaire (V13 : ni au départ)', () => {
  const s = fresh();
  for (const id of ['p03', 'p14']) assert.equal(s.provinces[id].buildings.port, 0);
  assert.deepEqual(sea(s, 'p03').map(d => d.id), ['p14']);
  assert.equal(queueMoveOrder(s, map, { nationId: 'valmorne', fromId: 'p03', toId: 'p14', units: { infantry: 20 } }).ok, true);
  const o = s.orders[0];
  assert.deepEqual([o.routeType, o.via, o.turns], ['sea', 'p14', 2]);
  // Jamais par mer vers sa propre île.
  assert.ok(sea(s, 'p02').every(d => map.provinces.find(p => p.id === d.id).landmassId !== 'ile-nord-ouest'));
  assert.deepEqual(landingCoast(map, 'p14'), ['p14']);
});

test('les navires de guerre ne se déplacent que par mer', () => {
  const s = fresh(); s.provinces.p03.warships = 2;
  assert.match(queueMoveOrder(s, map, { nationId: 'valmorne', fromId: 'p03', toId: 'p04', warships: 1 }).error, /que par mer/);
});

// --- Durée --------------------------------------------------------------------------------------------------------
test('durée : max(2, ⌈longueur / 150⌉) tours, calculée depuis la longueur des routes', () => {
  assert.deepEqual(RULES.naval, { stageLength: 150, minTurns: 2 });
  assert.deepEqual([50, 99, 201, 236, 306, 366, 447, 543, 625].map(seaTravelTurns), [2, 2, 2, 2, 3, 3, 3, 4, 5]);
  // V13 : l'anneau n'a que des routes courtes (2 tours) ; la durée reste calculée depuis la longueur.
  const s = fresh();
  for (const [a, b] of map.maritimeRoutes) {
    const d = sea(s, a).find(x => x.id === b);
    assert.equal(d.turns, seaTravelTurns(lane(a, b).length), `${a}-${b}`);
    assert.equal(d.turns, 2, `${a}-${b} : 2 tours`);
  }
});

test('le convoi avance d\'une étape par tour et arrive au bout de turns inter-tours (renfort chez soi)', () => {
  const s = fresh();
  s.provinces.p03.units.infantry = 100;
  s.provinces.p14.ownerId = 'valmorne'; // tête de pont déjà tenue
  const before = s.provinces.p14.units.infantry;
  assert.equal(queueMoveOrder(s, map, { nationId: 'valmorne', fromId: 'p03', toId: 'p14', units: { infantry: 60 } }).ok, true);
  const turns = seaTravelTurns(lane('p03', 'p14').length);
  assert.equal(turns, 2);
  resolveInterturn(s, map);
  assert.equal(s.provinces.p03.units.infantry, 40, 'troupes embarquées');
  assert.deepEqual(s.transports.map(t => [t.stage, t.turns, t.via]), [[1, 2, 'p14']]);
  assert.equal(s.provinces.p14.units.infantry, before);
  resolveInterturn(s, map);
  assert.equal(s.transports.length, 0);
  assert.equal(s.provinces.p14.units.infantry, before + 60, 'renfort à l\'arrivée');
  assert.ok(s.events.some(e => e.type === 'convoy-arrived' && e.provinceId === 'p14'));
  check(s, 'renfort');
});

test('îles proches : 2 tours minimum (embarquement + traversée, puis débarquement)', () => {
  const s = fresh();
  s.provinces.p02.buildings.port = 1; s.provinces.p02.units.infantry = 500;
  queueMoveOrder(s, map, { nationId: 'valmorne', fromId: 'p02', toId: 'p05', units: { infantry: 500 } });
  resolveInterturn(s, map);
  assert.equal(s.provinces.p05.ownerId, 'roc-epine', 'pas encore arrivé après 1 inter-tour');
  assert.equal(s.transports.length, 1);
  resolveInterturn(s, map);
  // V13 : sans le +15 % du ballon de la capitale, des survivants peuvent rembarquer (convoi de retour) : seul compte
  // qu'aucun convoi ne soit encore en route VERS p05 après le 2e inter-tour.
  assert.equal(s.transports.filter(t => !t.returning).length, 0);
  assert.ok(s.events.some(e => e.naval && e.provinceId === 'p05' && (e.type === 'conquest' || e.type === 'battle')));
});

// --- Débarquement --------------------------------------------------------------------------------------------------
test('débarquement sur un point de port NON construit : combat en mode landing, guerre automatique, prise', () => {
  const s = fresh();
  s.provinces.p03.buildings.port = 1; s.provinces.p03.units.infantry = 600; s.provinces.p03.warships = 2;
  s.provinces.p14.units.infantry = 60;
  assert.equal(s.provinces.p14.buildings.port, 0);
  queueMoveOrder(s, map, { nationId: 'valmorne', fromId: 'p03', toId: 'p14', units: { infantry: 600 }, warships: 2 });
  resolveInterturn(s, map); resolveInterturn(s, map);
  const ev = s.events.find(e => e.naval && e.provinceId === 'p14');
  assert.equal(ev.type, 'conquest');
  assert.equal(s.provinces.p14.ownerId, 'valmorne');
  assert.ok(s.diplomacy.wars.some(w => w.participants.includes('valmorne') && w.participants.includes('oroel')));
  assert.equal(journalEntry(ev, map, 'valmorne').type, 'CONQUÊTE');
  // Pas de port construit à Nordhème : l'escorte repart vers Branvale (même route, même durée).
  const back = s.transports.find(t => t.returning);
  assert.ok(back && back.toId === 'p03' && back.warships > 0 && back.units.infantry === 0);
  assert.equal(s.provinces.p14.warships, 0);
  check(s, 'débarquement');
});

test('débarquement repoussé : les survivants rembarquent et rentrent par la même route', () => {
  const s = fresh();
  s.provinces.p03.buildings.port = 1; s.provinces.p03.units.infantry = 300; s.provinces.p03.warships = 3;
  Object.assign(s.provinces.p14.units, { infantry: 200, cavalry: 10, armor: 6, artillery: 2 }); // garnison solide
  queueMoveOrder(s, map, { nationId: 'valmorne', fromId: 'p03', toId: 'p14', units: { infantry: 300 }, warships: 3 });
  resolveInterturn(s, map); resolveInterturn(s, map);
  assert.equal(s.provinces.p14.ownerId, 'oroel');
  const back = s.transports.find(t => t.returning);
  assert.ok(back, 'convoi de retour');
  assert.equal(back.toId, 'p03');
  assert.ok(back.units.infantry > 0 && back.warships === 3);
  assert.match(journalEntry(s.events.find(e => e.type === 'convoy-returning'), map, 'valmorne').text, /Débarquement repoussé à Nordhème/);
  const survivors = back.units.infantry;
  resolveInterturn(s, map); resolveInterturn(s, map);
  assert.equal(s.transports.length, 0);
  assert.equal(s.provinces.p03.warships, 3, 'navires rentrés au port');
  assert.ok(s.provinces.p03.units.infantry >= survivors);
  check(s, 'repli par mer');
});

test('débarquement vers un allié : annulé, le convoi rentre', () => {
  const s = fresh();
  s.provinces.p03.buildings.port = 1;
  queueMoveOrder(s, map, { nationId: 'valmorne', fromId: 'p03', toId: 'p14', units: { infantry: 20 } });
  setRelation(s, { nationId: 'valmorne', target: 'oroel', type: 'alliance' });
  resolveInterturn(s, map); resolveInterturn(s, map);
  assert.ok(s.events.some(e => e.type === 'attack-cancelled' && e.reason === 'ally'));
  assert.equal(s.provinces.p14.ownerId, 'oroel');
  assert.ok(s.transports.some(t => t.returning && t.toId === 'p03'));
});

// --- Interception et escorte -------------------------------------------------------------------------------------
function interceptionScenario(escort) {
  const s = fresh();
  s.provinces.p03.buildings.port = 1; s.provinces.p03.units.infantry = 200; s.provinces.p03.warships = escort;
  s.provinces.p14.buildings.port = 1; s.provinces.p14.warships = 2; // flotte d'Oroël au bout de la route
  war(s, 'valmorne', 'oroel');
  queueMoveOrder(s, map, { nationId: 'valmorne', fromId: 'p03', toId: 'p14', units: { infantry: 200 }, warships: escort });
  resolveInterturn(s, map);
  return s;
}
test('interception : un convoi sans escorte est attaqué par la flotte du port ennemi au bout de la route', () => {
  const s = interceptionScenario(0);
  const ev = s.events.find(e => e.type === 'interception');
  assert.ok(ev, 'interception');
  assert.deepEqual([ev.kind, ev.attacker, ev.defender, ev.provinceId, ev.escorted], ['port', 'oroel', 'valmorne', 'p14', false]);
  assert.ok(ev.defenderLosses > 0, 'le convoi subit des pertes');
  assert.equal(ev.attackerLosses, 0, 'un convoi sans escorte ne riposte pas');
  const entry = journalEntry(ev, map, 'valmorne');
  assert.equal(entry.type, 'INTERCEPTION');
  assert.match(entry.text, /Interception par la flotte du port de Nordhème : Oroël attaque un convoi de Valmorne/);
  assert.equal(journalEntry(ev, map, 'aurel').public, true);
  check(s, 'interception');
});
test('escorte : les navires du convoi ripostent et protègent les troupes', () => {
  const bare = interceptionScenario(0), escorted = interceptionScenario(4);
  const e1 = bare.events.find(e => e.type === 'interception'), e2 = escorted.events.find(e => e.type === 'interception');
  assert.equal(e2.escorted, true);
  assert.ok(e2.attackerLosses > 0, 'la flotte d\'interception perd des navires');
  const troops = s => s.transports.reduce((n, t) => n + t.units.infantry, 0) + (s.provinces.p14.ownerId === 'valmorne' ? s.provinces.p14.units.infantry : 0);
  assert.ok(troops(escorted) > troops(bare), `${troops(escorted)} > ${troops(bare)}`);
  assert.match(journalEntry(e2, map, 'valmorne').text, /l’escorte a protégé le convoi/);
});
test('pas d\'interception sans guerre, ni par un port sans navires', () => {
  const s = fresh();
  s.provinces.p03.buildings.port = 1; s.provinces.p14.buildings.port = 1; s.provinces.p14.warships = 3;
  queueMoveOrder(s, map, { nationId: 'valmorne', fromId: 'p03', toId: 'p14', units: { infantry: 20 } });
  resolveInterturn(s, map);
  assert.equal(s.events.some(e => e.type === 'interception'), false, 'en paix : pas d\'interception (la guerre vient du débarquement)');
});
test('rencontre en mer : deux convois de nations en guerre sur la même route se battent', () => {
  const s = fresh();
  war(s, 'valmorne', 'oroel');
  s.provinces.p03.buildings.port = 1; s.provinces.p03.warships = 3;
  s.provinces.p14.buildings.port = 1; s.provinces.p14.units.infantry = 100;
  queueMoveOrder(s, map, { nationId: 'valmorne', fromId: 'p03', toId: 'p14', units: { infantry: 20 }, warships: 3 });
  queueMoveOrder(s, map, { nationId: 'oroel', fromId: 'p14', toId: 'p03', units: { infantry: 100 } });
  resolveInterturn(s, map);
  const ev = s.events.find(e => e.type === 'interception' && e.kind === 'sea');
  assert.ok(ev);
  assert.equal(ev.attacker, 'valmorne');
  assert.ok(ev.defenderLosses > 0);
  check(s, 'rencontre en mer');
});

// --- Sauvegarde ------------------------------------------------------------------------------------------------------
test('migration 6 -> 7 : un transport V10 lot 2 en mer devient un convoi qui arrive au même inter-tour', () => {
  const s = fresh();
  s.provinces.p19.ownerId = 'valmorne';
  const old = structuredClone(s); old.schemaVersion = 6; delete old.transportSequence;
  old.transports = [{ nationId: 'valmorne', fromId: 'p03', toId: 'p19', units: { infantry: 40, cavalry: 0, armor: 0, artillery: 0 }, warships: 1, wounds: { infantry: 0, cavalry: 0, armor: 0, artillery: 0, balloon: 0, warship: 0 }, status: 'at-sea', remaining: 1 }];
  const m = migrateSave(old);
  assert.equal(m.schemaVersion, 9, '6 -> 7 -> 8 (V11) -> 9 (V13)');
  assert.deepEqual([m.transports[0].id, m.transports[0].via, m.transports[0].stage, m.transports[0].turns], ['c1', 'p19', 1, 2]);
  assert.equal(m.transports[0].status, undefined);
  const before = m.provinces.p19.units.infantry;
  resolveInterturn(m, map);
  assert.equal(m.provinces.p19.units.infantry, before + 40, 'arrivé au prochain inter-tour, comme en V9');
  const back = decodeSave(encodeSave(m));
  assert.deepEqual(back, m);
});

// --- Fin de partie -------------------------------------------------------------------------------------------------
test('fin de partie au tour 60 : classement provinces, puis capitales, puis trésor', () => {
  assert.equal(RULES.gameLength, 60);
  const s = fresh();
  s.turn = 59; resolveInterturn(s, map);
  assert.equal(s.gameOver, undefined, 'pas de fin avant la fin du tour 60');
  assert.equal(s.turn, 60);
  s.provinces.p05.ownerId = 'valmorne';                  // Valmorne : 5 provinces, 2 capitales
  s.provinces.p10.ownerId = 'oroel';                     // Oroël : 5 provinces, 1 capitale
  s.nations.aurel.treasury = 9999;                       // Aurel 4 provinces, très riche : 3e ou mieux parmi les 4
  resolveInterturn(s, map);
  assert.equal(s.gameOver.reason, 'turn-limit');
  assert.equal(s.gameOver.turn, 60);
  const r = s.gameOver.ranking.map(x => x.nationId);
  assert.deepEqual(r.slice(0, 3), ['valmorne', 'oroel', 'aurel']);
  assert.equal(s.gameOver.winnerId, 'valmorne');
  assert.ok(s.events.some(e => e.type === 'game-over'));
  assert.match(journalEntry(s.events.find(e => e.type === 'game-over'), map, 'valmorne').text, /Fin de la partie au tour 60/);
  // La partie peut continuer (sauvegarde reprise) : la fin n'est enregistrée qu'une fois.
  resolveInterturn(s, map);
  assert.equal(s.events.filter(e => e.type === 'game-over').length, 1);
  assert.equal(s.turn, 62);
});
test('victoire anticipée : une nation tient les 5 capitales', () => {
  const s = fresh();
  for (const c of ['p05', 'p09', 'p13', 'p17']) s.provinces[c].ownerId = 'valmorne';
  assert.equal(capitalsVictor(s), 'valmorne');
  resolveInterturn(s, map);
  assert.deepEqual([s.gameOver.reason, s.gameOver.winnerId, s.gameOver.turn], ['capitals', 'valmorne', 1]);
  assert.equal(gameRanking(s)[0].capitals, 5);
});
test('défaite : le joueur éliminé voit la fin de partie', () => {
  const s = fresh('aurel');
  for (const id of ['p17', 'p18', 'p19', 'p20']) s.provinces[id].ownerId = 'noireflamme';
  resolveInterturn(s, map);
  assert.equal(s.nations.aurel.eliminated, true);
  assert.equal(s.gameOver.reason, 'player-eliminated');
  assert.match(journalEntry(s.events.find(e => e.type === 'game-over'), map, 'aurel').text, /Votre nation est éliminée/);
  assert.equal(checkGameOver(s), s.gameOver, 'idempotent');
});
