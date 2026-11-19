// V16.1 — retour du ballon d'observation. Cahier : docs/V16-cahier-des-charges.md (« V16.1 », Règles précises retenues).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { arkenV9Map as map } from '../src/map/arken-v9-map.js';
import { createGameState } from '../src/state/create-game-state.js';
import { RULES } from '../src/domain/constants.js';
import { encodeSave, decodeSave } from '../src/persistence/save-codec.js';
import {
  resolveInterturn, setRelation, eventKnownToPlayer, journalEntry, visibleProvinces, provinceIntel, perceivedForce,
  provinceForce, balloonBuildStatus, queueBalloonBuild, queueBalloonSend, queueBalloonShoot, balloonPath, balloonMax,
  balloonsOf, visibleBalloons, islandNeighbors, cancelBalloonOrder, balloonDestinations, queueRecruitment, queueConstruction,
  queueMoveOrder
} from '../src/domain/game-engine.js';
import { aiBalloonOrders, aiBalloonTargets, resolveBalloonFlights } from '../src/domain/engine/balloons.js';
import { getTension, recordAggression } from '../src/domain/leaders.js';
import { balloonMarkers, balloonOrderText, balloonStatusText } from '../src/presentation/balloon-view.js';
import { TUTORIAL_GUIDE } from '../src/presentation/guide-input.js';
import { flatSource, readSource } from './helpers/sources.js';

const NATIONS = map.nations.map(n => n.id);
const short = id => map.nations.find(n => n.id === id).short;
/** Partie sans IA (tout le monde « humain ») : seuls les ordres du test jouent. Usine à Valmorne (p01). */
function game(seed = 'v16-1') {
  const s = createGameState({ map, playerNationId: 'valmorne', seed });
  for (const id of NATIONS) s.controllers[id] = 'human';
  s.provinces.p01.buildings.factory = 1;
  s.nations.valmorne.treasury = 200;
  return s;
}
const turns = (s, n) => { for (let i = 0; i < n; i++) resolveInterturn(s, map); };
/** Ballon de Valmorne déjà livré, au-dessus de son île. */
function withBalloon(seed) {
  const s = game(seed);
  assert.ok(queueBalloonBuild(s, { nationId: 'valmorne', provinceId: 'p01' }).ok);
  turns(s, RULES.balloon.turns);
  assert.equal(balloonsOf(s, 'valmorne').length, 1);
  return s;
}
const journalOf = (s, nationId, from) => s.events.slice(from).filter(e => eventKnownToPlayer({ ...s, playerNationId: nationId }, map, e))
  .map(e => journalEntry(e, map, nationId)).filter(Boolean).map(e => e.text);

test('règles : 30 or, 2 tours, 2 tours par saut, 1 ballon (2 avec p21)', () => {
  assert.deepEqual({ ...RULES.balloon }, { cost: 30, turns: 2, hopTurns: 2, max: 1, bonusMax: 2, bonusProvince: 'p21', aiReserve: 60 });
  assert.equal(RULES.units.balloon, undefined, 'ce n’est pas une unité (l’ancien ballon reste supprimé)');
});

test('construction : usine requise, payée tout de suite, livrée en 2 tours au-dessus de sa nation', () => {
  const s = game();
  assert.equal(balloonBuildStatus(s, { nationId: 'valmorne', provinceId: 'p02' }).reason, 'Il faut une usine dans cette province');
  assert.equal(balloonBuildStatus(s, { nationId: 'valmorne', provinceId: 'p05' }).reason, 'Province non contrôlée');
  const r = queueBalloonBuild(s, { nationId: 'valmorne', provinceId: 'p01' });
  assert.ok(r.ok);
  assert.equal(s.nations.valmorne.treasury, 170);
  assert.equal(queueBalloonBuild(s, { nationId: 'valmorne', provinceId: 'p01' }).error, 'Un ballon est déjà en construction');
  turns(s, 1);
  assert.equal(balloonsOf(s, 'valmorne').length, 0, 'pas encore livré après 1 tour');
  assert.equal(balloonBuildStatus(s, { nationId: 'valmorne', provinceId: 'p01' }).reason, 'Un ballon est déjà en construction');
  turns(s, 1);
  const [b] = balloonsOf(s, 'valmorne');
  assert.equal(b.over, 'valmorne');
  assert.equal(b.to, null);
  assert.equal(queueBalloonBuild(s, { nationId: 'valmorne', provinceId: 'p01' }).error, 'Vous avez déjà un ballon (1 au maximum)');
});

test('construction : trésor insuffisant refusé ; commande annulée = remboursée', () => {
  const s = game();
  s.nations.valmorne.treasury = 29;
  assert.match(queueBalloonBuild(s, { nationId: 'valmorne', provinceId: 'p01' }).error, /Trésor insuffisant/);
  s.nations.valmorne.treasury = 100;
  const r = queueBalloonBuild(s, { nationId: 'valmorne', provinceId: 'p01' });
  assert.deepEqual(cancelBalloonOrder(s, r.orderId, 'valmorne').refund, 30);
  assert.equal(s.nations.valmorne.treasury, 100);
  assert.ok(balloonBuildStatus(s, { nationId: 'valmorne', provinceId: 'p01' }).ok);
});

test('maximum : 2 ballons seulement pour qui possède l’île mystérieuse (p21, V16.2)', () => {
  const s = withBalloon('v16-1-max');
  assert.equal(balloonMax(s, 'valmorne'), 1);
  s.provinces.p21 = { ownerId: 'valmorne', units: {}, buildings: {} }; // l'île n'existe qu'à partir de la V16.2
  assert.equal(balloonMax(s, 'valmorne'), 2);
  assert.ok(balloonBuildStatus(s, { nationId: 'valmorne', provinceId: 'p01' }).ok);
  assert.ok(queueBalloonBuild(s, { nationId: 'valmorne', provinceId: 'p01' }).ok);
  assert.equal(balloonBuildStatus(s, { nationId: 'valmorne', provinceId: 'p01' }).reason, 'Un ballon est déjà en construction');
});

test('voyage : anneau des routes maritimes, chemin le plus court, 2 tours par saut', () => {
  assert.deepEqual(islandNeighbors(map, 'valmorne'), ['oroel', 'roc-epine']);
  assert.deepEqual(balloonPath(map, 'valmorne', 'noireflamme'), ['oroel', 'noireflamme']);
  assert.deepEqual(balloonPath(map, 'valmorne', 'aurel'), ['roc-epine', 'aurel']);
  assert.deepEqual(balloonPath(map, 'valmorne', 'valmorne'), []);
  const s = withBalloon('v16-1-voyage'), [b] = balloonsOf(s, 'valmorne');
  assert.deepEqual(balloonDestinations(s, map, b.id).map(d => [d.id, d.turns]), [['roc-epine', 2], ['noireflamme', 4], ['oroel', 2], ['aurel', 4]]);
  assert.equal(queueBalloonSend(s, map, { nationId: 'valmorne', balloonId: b.id, to: 'valmorne' }).error, 'Le ballon est déjà au-dessus de cette nation');
  assert.equal(queueBalloonSend(s, map, { nationId: 'oroel', balloonId: b.id, to: 'aurel' }).error, 'Ballon introuvable');
  assert.ok(queueBalloonSend(s, map, { nationId: 'valmorne', balloonId: b.id, to: 'noireflamme' }).ok);
  turns(s, 1); assert.equal(b.over, 'valmorne');
  turns(s, 1); assert.equal(b.over, 'oroel', 'premier saut après 2 tours');
  turns(s, 1); assert.equal(b.over, 'oroel', 'au-dessus de la nation survolée pendant au moins un inter-tour');
  turns(s, 1); assert.equal(b.over, 'noireflamme'); assert.equal(b.to, null, 'arrivé');
  turns(s, 3); assert.equal(b.over, 'noireflamme', 'il reste jusqu’à un nouvel ordre');
});

test('voyage : les navires de guerre ne l’arrêtent pas (aucun combat en mer)', () => {
  const s = withBalloon('v16-1-navires'), [b] = balloonsOf(s, 'valmorne');
  assert.ok(setRelation(s, { nationId: 'valmorne', target: 'oroel', type: 'war' }).ok);
  for (const id of ['p13', 'p14']) { s.provinces[id].buildings.port = 1; s.provinces[id].warships = 5; }
  queueBalloonSend(s, map, { nationId: 'valmorne', balloonId: b.id, to: 'oroel' });
  turns(s, 2);
  assert.equal(b.over, 'oroel');
});

test('vision : pendant le survol et à l’arrivée, toutes les provinces de l’île (forteresse comprise), pour le propriétaire seulement', () => {
  const s = withBalloon('v16-1-vision'), [b] = balloonsOf(s, 'valmorne');
  s.provinces.p15.buildings.fort = 2;
  assert.equal(visibleProvinces(s, map, 'valmorne').has('p15'), false, 'avant : hors de vue');
  assert.equal(provinceIntel(s, map, 'valmorne', 'p15').troopsKnown, false);
  queueBalloonSend(s, map, { nationId: 'valmorne', balloonId: b.id, to: 'noireflamme' });
  turns(s, 2);
  assert.equal(b.over, 'oroel');
  for (const id of ['p13', 'p14', 'p15', 'p16']) assert.ok(visibleProvinces(s, map, 'valmorne').has(id), `survol : ${id} visible`);
  const intel = provinceIntel(s, map, 'valmorne', 'p15');
  assert.equal(intel.troopsKnown, true, 'la forteresse ne cache rien vu du ciel');
  assert.equal(intel.entrenched, false);
  assert.deepEqual(perceivedForce(s, map, 'valmorne', 'p15'), provinceForce(s.provinces.p15), 'l’IA lit la même force réelle');
  assert.ok(setRelation(s, { nationId: 'valmorne', target: 'aurel', type: 'alliance' }).ok);
  assert.equal(visibleProvinces(s, map, 'aurel').has('p15'), false, 'pas partagé avec les alliés');
  turns(s, 2);
  assert.equal(b.over, 'noireflamme');
  for (const id of ['p09', 'p10', 'p11', 'p12']) assert.ok(visibleProvinces(s, map, 'valmorne').has(id), `arrivée : ${id} visible`);
  assert.equal(visibleProvinces(s, map, 'valmorne').has('p15'), false, 'l’île quittée redevient cachée');
});

test('rapport privé chaque inter-tour : chantiers, recrutements, troupes en mouvement', () => {
  const s = withBalloon('v16-1-rapport'), [b] = balloonsOf(s, 'valmorne');
  queueBalloonSend(s, map, { nationId: 'valmorne', balloonId: b.id, to: 'oroel' });
  turns(s, 2);
  s.nations.oroel.treasury = 500;
  assert.ok(queueConstruction(s, { nationId: 'oroel', provinceId: 'p14', type: 'bank' }).ok);
  assert.ok(queueRecruitment(s, { nationId: 'oroel', provinceId: 'p13', type: 'infantry', lots: 2 }).ok);
  s.provinces.p15.units.infantry = 100;
  assert.ok(queueMoveOrder(s, map, { nationId: 'oroel', fromId: 'p15', toId: 'p13', units: { infantry: 50 } }).ok);
  const from = s.events.length;
  turns(s, 1);
  const report = s.events.slice(from).find(e => e.type === 'balloon-report');
  assert.equal(report.nationId, 'valmorne');
  assert.equal(report.over, 'oroel');
  assert.deepEqual(report.sites.map(x => [x.provinceId, x.type]), [['p14', 'bank']]);
  assert.deepEqual(report.recruits, [{ provinceId: 'p13', type: 'infantry', amount: 40 }]);
  assert.deepEqual(report.moves, [{ fromId: 'p15', toId: 'p13', amount: 50, sea: false }]);
  const text = journalEntry(report, map, 'valmorne').text;
  assert.equal(text, '🎈 Ballon au-dessus d’Oroël : chantiers en cours (banque à Nordhème), recrutements (40 fantassins à Glacenoire), troupes en mouvement (50 unités Îlebrume → Glacenoire).');
  assert.ok(s.turnJournal.some(e => e.text === text), 'dans le journal du tour du propriétaire');
  assert.equal(eventKnownToPlayer({ ...s, playerNationId: 'oroel' }, map, report), false, 'privé');
  assert.equal(eventKnownToPlayer({ ...s, playerNationId: 'aurel' }, map, report), false, 'privé');
  const quiet = s.events.length; turns(s, 1);
  assert.match(journalEntry(s.events.slice(quiet).find(e => e.type === 'balloon-report'), map, 'valmorne').text, /chantiers en cours \(banque à Nordhème\), recrutements \(aucun\), troupes en mouvement \(aucune\)/);
});

test('être survolé : la nation survolée voit le ballon et est prévenue ; personne d’autre', () => {
  const s = withBalloon('v16-1-survol'), [b] = balloonsOf(s, 'valmorne');
  assert.deepEqual(visibleBalloons(s, map, 'oroel'), []);
  queueBalloonSend(s, map, { nationId: 'valmorne', balloonId: b.id, to: 'noireflamme' });
  const from = s.events.length;
  turns(s, 2);
  const spotted = s.events.slice(from).filter(e => e.type === 'balloon-spotted');
  assert.deepEqual(spotted.map(e => [e.nationId, e.owner, e.over, e.passing]), [['oroel', 'valmorne', 'oroel', true]]);
  assert.equal(eventKnownToPlayer({ ...s, playerNationId: 'aurel' }, map, spotted[0]), false);
  assert.match(journalEntry(spotted[0], map, 'oroel').text, /ballon d’observation de Valmorne est au-dessus de chez vous, de passage/);
  assert.deepEqual(visibleBalloons(s, map, 'oroel').map(x => x.id), [b.id]);
  assert.deepEqual(visibleBalloons(s, map, 'valmorne').map(x => x.id), [b.id]);
  assert.deepEqual(visibleBalloons(s, map, 'aurel'), []);
  const m = balloonMarkers(s, map, 'oroel');
  assert.equal(m.length, 1); assert.equal(m[0].own, false); assert.equal(m[0].over, 'oroel');
  assert.equal(balloonStatusText(map, b, short), 'Au-dessus d’Oroël, en route vers Noireflamme : arrivée dans 2 tours.');
});

test('abattre : résolu avant le saut, événements privés, aucune guerre ni tension, reconstructible', () => {
  const base = withBalloon('v16-1-abattre'), [b0] = balloonsOf(base, 'valmorne');
  queueBalloonSend(base, map, { nationId: 'valmorne', balloonId: b0.id, to: 'noireflamme' });
  turns(base, 3); // au-dessus d'Oroël, il repart au prochain inter-tour
  assert.equal(b0.over, 'oroel'); assert.equal(b0.legTurns, 1);
  const shot = structuredClone(base), spared = structuredClone(base);
  assert.equal(queueBalloonShoot(shot, map, { nationId: 'aurel', balloonId: b0.id }).error, 'Ce ballon n’est pas au-dessus de chez vous');
  assert.equal(queueBalloonShoot(shot, map, { nationId: 'valmorne', balloonId: b0.id }).error, 'C’est votre ballon');
  assert.ok(queueBalloonShoot(shot, map, { nationId: 'oroel', balloonId: b0.id }).ok);
  const from = shot.events.length;
  turns(shot, 1); turns(spared, 1);
  assert.equal(balloonsOf(spared, 'valmorne')[0].over, 'noireflamme', 'sans tir, il serait passé');
  assert.deepEqual(balloonsOf(shot, 'valmorne'), [], 'abattu avant d’aller plus loin');
  const ev = shot.events.slice(from).find(e => e.type === 'balloon-shot');
  assert.equal(ev.nationId, 'valmorne'); assert.equal(ev.target, 'oroel');
  assert.equal(shot.events.slice(from).some(e => e.type === 'balloon-report'), false, 'plus de rapport');
  assert.equal(journalEntry(ev, map, 'valmorne').text, '⚠ Oroël a abattu notre ballon d’observation au-dessus de son territoire. Un nouveau ballon peut être construit (usine requise).');
  assert.equal(journalEntry(ev, map, 'oroel').text, 'Ballon de Valmorne abattu.');
  assert.equal(eventKnownToPlayer({ ...shot, playerNationId: 'aurel' }, map, ev), false, 'privé');
  assert.deepEqual(shot.diplomacy.wars, spared.diplomacy.wars, 'aucune guerre');
  assert.equal(shot.diplomacy.wars.some(w => w.participants.includes('valmorne') && w.participants.includes('oroel')), false);
  assert.deepEqual(shot.tension, spared.tension, 'aucune tension');
  assert.equal(getTension(shot, 'valmorne', 'oroel'), getTension(spared, 'valmorne', 'oroel'));
  assert.ok(balloonBuildStatus(shot, { nationId: 'valmorne', provinceId: 'p01' }).ok, 'de nouveau constructible');
});

test('nation éliminée : ses ballons disparaissent ; un ballon au-dessus d’une île conquise y reste', () => {
  const s = game('v16-1-elim');
  s.balloons = [{ id: 'b1', nationId: 'oroel', over: 'valmorne', to: null, legTurns: 0 }, { id: 'b2', nationId: 'valmorne', over: 'aurel', to: null, legTurns: 0 }];
  s.nations.oroel.eliminated = true; s.nations.aurel.eliminated = true;
  resolveBalloonFlights(s, map, []);
  assert.deepEqual(s.balloons.map(b => [b.id, b.over]), [['b2', 'aurel']]);
});

test('IA : construit avec une usine et 60 or d’avance, envoie vers la guerre, sinon la plus forte tension', () => {
  const s = game('v16-1-ia');
  s.nations.oroel.treasury = 89;
  aiBalloonOrders(s, map, 'oroel');
  assert.equal(s.orders.some(o => o.kind === 'balloon-build'), false, 'sans usine : rien');
  s.provinces.p13.buildings.factory = 1;
  aiBalloonOrders(s, map, 'oroel');
  assert.equal(s.orders.some(o => o.kind === 'balloon-build'), false, '89 or : pas assez d’avance');
  s.nations.oroel.treasury = 90;
  aiBalloonOrders(s, map, 'oroel');
  assert.deepEqual(s.orders.filter(o => o.kind === 'balloon-build').map(o => o.provinceId), ['p13']);
  s.tension.oroel.aurel = 70;
  assert.deepEqual(aiBalloonTargets(s, 'oroel'), ['aurel'], 'plus forte tension');
  assert.ok(setRelation(s, { nationId: 'oroel', target: 'roc-epine', type: 'war' }).ok);
  assert.deepEqual(aiBalloonTargets(s, 'oroel'), ['roc-epine'], 'la guerre d’abord');
  s.orders = [];
  s.balloons = [{ id: 'b-oroel', nationId: 'oroel', over: 'oroel', to: null, legTurns: 0 }];
  aiBalloonOrders(s, map, 'oroel');
  assert.deepEqual(s.orders.filter(o => o.kind === 'balloon-send').map(o => o.to), ['roc-epine']);
});

test('IA : abat selon le caractère — Conquérant et Traître toujours, Bâtisseur jamais, Héros si agresseur récent', () => {
  const run = (arch, aggressor = false) => {
    const s = game(`v16-1-tir-${arch}`);
    s.leaders.oroel.archetype = arch;
    if (aggressor) recordAggression(s, 'valmorne', 'aurel');
    s.balloons = [{ id: 'b-v', nationId: 'valmorne', over: 'oroel', to: null, legTurns: 0 }];
    aiBalloonOrders(s, map, 'oroel');
    return s.orders.some(o => o.kind === 'balloon-shoot' && o.nationId === 'oroel' && o.balloonId === 'b-v');
  };
  assert.equal(run('conquerant'), true);
  assert.equal(run('traitre'), true);
  assert.equal(run('batisseur'), false);
  assert.equal(run('batisseur', true), false);
  assert.equal(run('heros'), false);
  assert.equal(run('heros', true), true);
});

test('IA en partie : des ballons construits, envoyés, abattus ; la partie va au bout', () => {
  let built = 0, sent = 0, shot = 0;
  for (const seed of ['v16-1-a', 'v16-1-b', 'v16-1-c']) {
    const s = createGameState({ map, playerNationId: 'valmorne', seed });
    for (const id of NATIONS) s.controllers[id] = 'ai';
    for (let i = 0; i < 40 && !s.gameOver; i++) resolveInterturn(s, map);
    built += s.events.filter(e => e.type === 'production-complete' && e.productionType === 'balloon').length;
    sent += s.events.filter(e => e.type === 'balloon-moved').length;
    shot += s.events.filter(e => e.type === 'balloon-shot').length;
    for (const b of s.balloons || []) assert.ok(!s.nations[b.nationId].eliminated);
  }
  assert.ok(built > 0 && sent > 0 && shot > 0, JSON.stringify({ built, sent, shot }));
});

test('sauvegarde : un ballon en vol survit à la reprise, à l’identique ; pas de nouveau schéma', () => {
  const s = withBalloon('v16-1-save'), [b] = balloonsOf(s, 'valmorne');
  queueBalloonSend(s, map, { nationId: 'valmorne', balloonId: b.id, to: 'noireflamme' });
  turns(s, 3);
  const text = encodeSave(s), back = decodeSave(text);
  assert.equal(JSON.parse(text).schemaVersion, 11);
  assert.deepEqual(back.balloons, s.balloons);
  turns(s, 1); turns(back, 1);
  assert.equal(encodeSave(back), encodeSave(s), 'même suite de partie');
  assert.equal(back.balloons[0].over, 'noireflamme');
});

test('ancienne sauvegarde sans `balloons` : la partie continue, on peut construire ; nouvelle partie sans trace', () => {
  const fresh = createGameState({ map, playerNationId: 'valmorne', seed: 'v16-1-ancienne' });
  assert.equal('balloons' in fresh, false);
  assert.equal(JSON.stringify(fresh).includes('balloon'), false);
  const old = decodeSave(encodeSave(fresh));
  assert.equal(old.balloons, undefined);
  for (const id of NATIONS) old.controllers[id] = 'human';
  turns(old, 2);
  assert.equal(old.balloons, undefined, 'aucun ballon créé tout seul');
  old.provinces.p01.buildings.factory = 1; old.nations.valmorne.treasury = 100;
  assert.ok(queueBalloonBuild(old, { nationId: 'valmorne', provinceId: 'p01' }).ok);
  turns(old, 2);
  assert.equal(old.balloons.length, 1);
});

test('province prise pendant la construction : ballon annulé et remboursé', () => {
  const s = game('v16-1-prise');
  queueBalloonBuild(s, { nationId: 'valmorne', provinceId: 'p01' });
  turns(s, 1);
  const treasury = s.nations.valmorne.treasury;
  const from = s.events.length;
  s.provinces.p01.ownerId = 'roc-epine'; // prise simulée : la file de production ne livre jamais à un autre propriétaire
  turns(s, 1);
  assert.equal(balloonsOf(s, 'valmorne').length + balloonsOf(s, 'roc-epine').length, 0);
  const lost = s.events.slice(from).find(e => e.type === 'production-lost' && e.productionType === 'balloon');
  assert.equal(lost.refund, 30);
  assert.ok(s.nations.valmorne.treasury >= treasury + 30 - 1);
  assert.match(journalEntry(lost, map, 'valmorne').text, /ballon d’observation annulée, 30 or remboursés/);
});

test('interface : récapitulatif, fenêtre après le journal et avant les propositions, aide, fiche', () => {
  const names = { province: id => map.provinces.find(p => p.id === id).name, nation: short };
  assert.equal(balloonOrderText({ kind: 'balloon-build', provinceId: 'p01', cost: 30, duration: 2 }, names), 'Ballon d’observation : construction à Valmorne (30 or, 2 tours)');
  assert.equal(balloonOrderText({ kind: 'balloon-send', to: 'oroel' }, names), 'Ballon d’observation : envoi vers Oroël');
  assert.equal(balloonOrderText({ kind: 'balloon-shoot', owner: 'aurel' }, names), 'Abattre le ballon de Solmara');
  const flow = flatSource('src/presentation/ui/turn-flow.js');
  assert.ok(flow.indexOf('renderJournal(false);await dialogClosed') < flow.indexOf('await showBalloonPopups(events)'));
  assert.ok(flow.indexOf('await showBalloonPopups(events)') < flow.indexOf('await showProposalPopups()'));
  assert.match(flow, /balloonOrderText\(o/);
  const ui = readSource('src/presentation/ui/balloon-ui.js');
  for (const label of ['Détruire', 'Laisser passer', 'Annuler']) assert.ok(ui.includes(label), label);
  assert.match(readSource('src/presentation/ui/province-sheet.js'), /balloonBuildCard\(selected\)/);
  assert.match(readSource('src/presentation/ui/map-view.js'), /balloonLayer\(\)/);
  const help = TUTORIAL_GUIDE.find(x => x.id === 'balloon');
  assert.ok(help && help.text.length <= 280);
  assert.match(help.text, /usine/); assert.match(help.text, /sans guerre/);
});
