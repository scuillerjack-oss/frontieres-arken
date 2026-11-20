// V17.5b — Équilibrage et personnalités (docs/V17-cahier-des-charges.md, « Réalisé V17.5b ») : province attaquée (ni
// construction ni recrutement, chantier suspendu), phare de l'île mystérieuse, personnalités tirées à la graine et moins
// prévisibles, comportement mesurable de chaque caractère.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { arkenV9Map as map } from '../src/map/arken-v9-map.js';
import { RULES } from '../src/domain/constants.js';
import * as E from '../src/domain/game-engine.js';
import { ARCHETYPES, leaderHint } from '../src/domain/leaders.js';
import { lighthouseFleets } from '../src/domain/vision.js';
import { between, publicMenace, temper, weightedPick } from '../src/domain/realtime/personalities.js';
import { landDistanceFactor, landTravelDays } from '../src/domain/realtime/marches.js';
import { seaDuration } from '../src/domain/engine/convoys.js';
import { eventBanners } from '../src/presentation/realtime-view.js';
import { islandSheetView } from '../src/presentation/mystery-island-view.js';
import { playGame, byArchetype } from '../tools/v17/partie-jours.mjs';
import { readSource } from './helpers/sources.js';

const R = RULES.realtime;
const NATIONS = map.nations.map(n => n.id);
const ME = 'valmorne', AI = 'roc-epine';
const inf = n => ({ infantry: n, cavalry: 0, armor: 0, artillery: 0 });
function game({ seed = 'v175b', ais = NATIONS.filter(id => id !== ME) } = {}) {
  const s = E.createRealtimeGame({ map, playerNationId: ME, seed });
  for (const id of NATIONS) s.controllers[id] = ais.includes(id) ? 'ai' : 'human';
  return s;
}
const untilDay = (s, day) => { while (s.day < day && !s.gameOver) E.advanceDay(s, map); };
/** L'île de Valmorne partagée : Valmorne (joueur) tient p02 et p04, Roc-Épine tient p01 et p03, en guerre ; personne ne joue l'IA. */
function island(seed) {
  const s = game({ seed, ais: [] });
  for (const id of ['p01', 'p03']) s.provinces[id].ownerId = AI;
  for (const id of ['p01', 'p02', 'p03', 'p04']) { const p = s.provinces[id]; p.units = inf(0); p.warships = 0; p.wounds = {}; p.buildings.fort = 0; }
  for (const id of NATIONS) s.nations[id].food = { reserve: 1e12 };
  s.diplomacy.wars.push({ participants: [ME, AI], active: true, started: s.turn });
  return s;
}
const sendAs = (s, nationId, from, to, units) => { const r = E.queueMoveOrder(s, map, { nationId, fromId: from, toId: to, units }); assert.ok(r.ok, r.error); E.executePendingOrders(s, map); return s.marches.at(-1); };
const names = { nation: id => id, province: id => id };

test('V17.5b : province attaquée — ni construction (forteresse et ballon compris) ni recrutement, message clair', () => {
  const s = island('attaquee');
  s.provinces.p03.units = inf(540); s.provinces.p04.units = inf(400); s.provinces.p04.buildings.fort = 3; s.provinces.p04.buildings.factory = 1;
  s.nations[ME].treasury = 900;
  const m = sendAs(s, AI, 'p03', 'p04', inf(500));
  untilDay(s, m.arriveDay + 1);
  assert.ok(s.battles.some(b => b.provinceId === 'p04'), 'bataille en cours');
  for (const type of ['fort', 'bank', 'farm']) {
    const r = E.queueConstruction(s, { nationId: ME, provinceId: 'p04', type });
    assert.equal(r.ok, false, type); assert.match(r.error, /Province attaquée : impossible de construire pendant la bataille/);
  }
  const b = E.queueBalloonBuild(s, { nationId: ME, provinceId: 'p04' });
  assert.equal(b.ok, false); assert.match(b.error, /Province attaquée/);
  const r = E.queueRecruitment(s, { nationId: ME, provinceId: 'p04', type: 'infantry' });
  assert.equal(r.ok, false); assert.match(r.error, /attaquée/);
  // Ailleurs, on construit normalement.
  assert.ok(E.queueConstruction(s, { nationId: ME, provinceId: 'p02', type: 'bank' }).ok);
});

test('V17.5b : un chantier en cours dans une province attaquée est suspendu jusqu\'à la fin de la bataille (un seul avis)', () => {
  const s = island('suspendu');
  s.provinces.p03.units = inf(540); s.provinces.p04.units = inf(400); s.provinces.p04.buildings.fort = 3;
  s.nations[ME].treasury = 500;
  const m = sendAs(s, AI, 'p03', 'p04', inf(500));
  assert.ok(E.queueConstruction(s, { nationId: ME, provinceId: 'p04', type: 'bank' }).ok);
  E.executePendingOrders(s, map);
  const q = s.productionQueue.find(x => x.nationId === ME && x.provinceId === 'p04' && x.type === 'bank');
  assert.ok(q && q.remaining > m.arriveDay - s.day + 6, 'chantier plus long que le trajet et la bataille');
  untilDay(s, m.arriveDay + 1);
  assert.ok(s.battles.length, 'bataille');
  const ev = s.events.length, left = q.remaining;
  untilDay(s, s.day + 3);
  if (s.battles.length) assert.equal(q.remaining, left, 'le chantier n\'avance pas pendant la bataille');
  assert.ok(q.suspended || !s.battles.length);
  untilDay(s, m.arriveDay + 12);
  assert.ok(!s.battles.length, 'bataille terminée');
  const notes = s.events.filter(e => e.type === 'production-suspended');
  assert.equal(notes.length, 1, 'un seul avis');
  if (s.provinces.p04.ownerId === ME) {
    const before = q.remaining; untilDay(s, s.day + 2);
    assert.ok(q.remaining < before && !q.suspended, 'le chantier reprend');
    assert.match(E.journalEntry(notes[0], map, ME).text, /attaquée : chantier \(banque\) suspendu jusqu’à la fin de la bataille/);
    assert.ok(eventBanners(notes, ME, names).some(x => /chantier suspendu/.test(x.text)));
  }
  // Avis privé : une autre nation ne le voit pas.
  assert.equal(E.eventKnownToPlayer({ ...s, playerNationId: 'aurel' }, map, notes[0]), false);
});

test('V17.5b : phare de l\'île mystérieuse — le propriétaire et le co-propriétaire voient les flottes qui viennent, et seulement celles-là', () => {
  const s = game({ seed: 'phare', ais: [] });
  const isle = s.provinces.p21;
  isle.ownerId = ME; isle.coOwnerId = 'aurel';
  s.diplomacy.treaties.push({ type: 'alliance', parties: [ME, 'aurel'], active: true, started: s.turn });
  // Oroel embarque vers l'île depuis son point de port relié à l'île, et une autre flotte vers une autre côte.
  const from = map.provinces.find(d => s.provinces[d.id].ownerId === 'oroel' && E.legalDestinations(map, s, d.id).some(x => x.id === 'p21'));
  assert.ok(from, 'Oroel a une route vers l\'île');
  s.provinces[from.id].units = inf(300);
  assert.ok(E.queueMoveOrder(s, map, { nationId: 'oroel', fromId: from.id, toId: 'p21', units: inf(100) }).ok);
  const other = E.legalDestinations(map, s, from.id).find(x => x.type === 'sea' && x.id !== 'p21');
  if (other) assert.ok(E.queueMoveOrder(s, map, { nationId: 'oroel', fromId: from.id, toId: other.id, units: inf(50) }).ok);
  const ev = s.events.length;
  E.executePendingOrders(s, map);
  const fleets = lighthouseFleets(s, map, ME);
  assert.equal(fleets.length, 1, 'seulement la flotte qui va vers l\'île');
  const t = s.transports.find(x => x.toId === 'p21');
  assert.equal(fleets[0].nationId, 'oroel'); assert.equal(fleets[0].arriveDay, t.arriveDay);
  // Composition selon la vision : départ invisible → inconnue.
  const seen = E.visibleProvinces(s, map, ME);
  assert.equal(fleets[0].known, seen.has(from.id));
  if (!fleets[0].known) assert.equal(fleets[0].units, null);
  assert.equal(lighthouseFleets(s, map, 'aurel').length, 1, 'le co-propriétaire voit aussi');
  assert.deepEqual(lighthouseFleets(s, map, 'noireflamme'), [], 'qui ne tient pas l\'île ne voit rien par le phare');
  const alerts = s.events.slice(ev).filter(e => e.type === 'lighthouse');
  assert.deepEqual(alerts.map(e => e.nationId).sort(), ['aurel', ME].sort(), 'avis au propriétaire et au co-propriétaire');
  const text = E.journalEntry(alerts[0], map, ME).text;
  assert.match(text, /🗼 Flotte de .+ en route vers l’île mystérieuse, arrivée le \d+/);
  assert.equal(E.eventKnownToPlayer({ ...s, playerNationId: 'noireflamme' }, map, alerts[0]), false);
  assert.equal(E.eventKnownToPlayer({ ...s, playerNationId: 'oroel' }, map, alerts.find(e => e.nationId === ME)), false, 'la flotte ne sait pas qu\'on la voit');
  const banner = eventBanners(alerts, ME, names);
  assert.equal(banner.length, 1); assert.match(banner[0].text, /^Flotte de oroel en route vers l’île, arrivée le /); assert.equal(banner[0].icon, '🗼');
  assert.ok(islandSheetView(s, map, ME, id => id, id => id).chips.some(c => /^🗼 Flotte de oroel en route vers l’île, arrivée le /.test(c)));
  assert.ok(!islandSheetView(s, map, 'noireflamme', id => id, id => id).chips.some(c => c.startsWith('🗼')));
});

test('V17.5b : règles de l\'île vérifiées — nomades immobiles, ni construction ni recrutement, super banque, 2e ballon', () => {
  const s = game({ seed: 'ile' });
  const before = JSON.stringify(s.provinces.p21.units);
  untilDay(s, 400);
  if (!s.provinces.p21.ownerId) assert.equal(JSON.stringify(s.provinces.p21.units), before, 'la garnison neutre ne bouge pas');
  s.provinces.p21.ownerId = ME; s.nations[ME].treasury = 999;
  for (const type of ['bank', 'fort', 'farm', 'factory', 'port']) assert.equal(E.queueConstruction(s, { nationId: ME, provinceId: 'p21', type }).ok, false, type);
  assert.equal(E.queueRecruitment(s, { nationId: ME, provinceId: 'p21', type: 'infantry' }).ok, false);
  assert.ok(RULES.mysteryIsland.bankIncome > 0);
  assert.equal(RULES.balloon.bonusProvince, 'p21');
});

test('V17.5b : durées de trajet — même durée pour l\'attaquant et le défenseur, plus c\'est loin plus c\'est long', () => {
  const D = R.durations;
  assert.ok(D.cavalryLand < D.land);
  assert.equal(landTravelDays(inf(10)), D.land);
  assert.equal(landTravelDays({ cavalry: 5 }), D.cavalryLand);
  if (D.landDistance) {
    const near = landDistanceFactor(map, 'p13', 'p14'), far = landDistanceFactor(map, 'p01', 'p03');
    assert.ok(near < far, 'voisin proche plus rapide que voisin lointain');
    assert.ok(landTravelDays(inf(1), map, 'p13', 'p14') < landTravelDays(inf(1), map, 'p01', 'p03'));
    assert.equal(landTravelDays(inf(1), map, 'p01', 'p03'), landTravelDays(inf(1), map, 'p03', 'p01'), 'aller = retour');
  }
  // Mer : la même conversion pour tous (une route plus longue compte plus de « tours » de carte).
  assert.equal(seaDuration({ mode: 'realtime' }, 2), 2 * D.landPerSeaTurn);
  assert.equal(D.interceptDaysLeft <= 2 * D.landPerSeaTurn, true);
  // Une armée en marche n'a pas de vitesse selon son camp : createMarch ne lit que les unités et la route.
  assert.ok(!/attacker|defender/.test(readSource('src/domain/realtime/marches.js').match(/export function landTravelDays[\s\S]*?\n}/)[0]));
});

test('V17.5b : caractères tirés à la graine — même graine = mêmes caractères ; graines différentes = répartitions différentes, rien de visible au départ', () => {
  const key = seed => { const s = game({ seed }); return NATIONS.filter(id => id !== ME).map(id => s.leaders[id].archetype).join(','); };
  assert.equal(key('graine-a'), key('graine-a'));
  const seen = new Set(Array.from({ length: 30 }, (_, i) => key(`graine-${i}`)));
  assert.ok(seen.size >= 15, `répartitions variées (${seen.size} sur 30)`);
  // Chaque nation a été au moins une fois chaque caractère.
  for (const id of NATIONS.filter(n => n !== ME)) {
    const arch = new Set(Array.from({ length: 30 }, (_, i) => game({ seed: `graine-${i}` }).leaders[id].archetype));
    assert.equal(arch.size, ARCHETYPES.length, id);
  }
  const s = game({ seed: 'graine-x' });
  for (const id of NATIONS.filter(n => n !== ME)) { assert.equal(s.leaders[id].revealed, false); assert.equal(leaderHint(s, id), 'Dirigeant encore mal connu'); }
  // L'interface tire une nouvelle graine à chaque partie.
  assert.match(readSource('src/presentation/ui/game-flow.js'), /seed:'arken-'\+Date\.now\(\)\.toString\(36\)/);
});

test('V17.5b : tempérament — petites variations tirées à la graine, stables dans la partie, différentes d\'une partie à l\'autre', () => {
  const a = { seed: 'A' }, b = { seed: 'B' };
  const j = R.ai.personality.jitter;
  assert.equal(temper(a, 'aurel', 'margin', 1), temper(a, 'aurel', 'margin', 1));
  const vals = Array.from({ length: 40 }, (_, i) => temper({ seed: `s${i}` }, 'aurel', 'margin', 1));
  assert.ok(vals.every(v => v >= 1 - j && v <= 1 + j));
  assert.ok(Math.max(...vals) - Math.min(...vals) > j, 'vraie variété');
  assert.notEqual(temper(a, 'aurel', 'margin', 1), temper(b, 'aurel', 'margin', 1));
  const d = Array.from({ length: 50 }, (_, i) => between({ seed: `t${i}` }, [3, 8], 'k'));
  assert.ok(Math.min(...d) === 3 && Math.max(...d) === 8);
  const picks = new Set(Array.from({ length: 40 }, (_, i) => weightedPick({ seed: `p${i}` }, [{ id: 'a', w: 5 }, { id: 'b', w: 3 }, { id: 'c', w: 1 }], 'x')));
  assert.equal(picks.size, 3, 'la plus faible n\'est pas choisie à coup sûr');
});

test('V17.5b : menace publique — un agresseur de plusieurs nations (jamais un caractère caché)', () => {
  const s = game({ seed: 'menace' });
  assert.equal(publicMenace(s, 'aurel'), null);
  s.ai.aggressions = [{ turn: s.turn, attacker: 'oroel', victim: 'aurel' }, { turn: s.turn, attacker: 'oroel', victim: ME }];
  assert.equal(publicMenace(s, 'roc-epine'), 'oroel');
  assert.equal(publicMenace(s, 'oroel'), null, 'jamais soi-même');
  assert.ok(!/archetype/.test(readSource('src/domain/realtime/personalities.js').replace(/leaders\[id\]\.archetype === 'conquerant'/, '')), 'seul un Conquérant démasqué est désigné par son caractère');
});

// Parties IA courtes (7 ans), graines fixes : comportement mesurable de chaque caractère.
const GAMES = Array.from({ length: 8 }, (_, i) => playGame(`v175b-test-${i}`, { short: true }));
const BY = byArchetype(GAMES);

test('V17.5b : même graine = même partie ; graines différentes = parties différentes', () => {
  const again = playGame('v175b-test-0', { short: true });
  assert.deepEqual(again.byNation, GAMES[0].byNation);
  assert.equal(again.conquests, GAMES[0].conquests);
  const sig = g => JSON.stringify(g.byNation.map(n => [n.arch, n.conquests, n.provinces]));
  assert.ok(new Set(GAMES.map(sig)).size >= 7, 'fins différentes');
});

test('V17.5b : le Conquérant attaque le plus, le Bâtisseur le moins et a le plus de bâtiments', () => {
  const att = Object.fromEntries(ARCHETYPES.map(a => [a, BY[a].assautsLances]));
  assert.ok(att.conquerant >= Math.max(att.heros, att.traitre, att.batisseur), JSON.stringify(att));
  assert.ok(att.batisseur <= Math.min(att.heros, att.traitre, att.conquerant), JSON.stringify(att));
  const bat = Object.fromEntries(ARCHETYPES.map(a => [a, BY[a].batimentsParProvince]));
  assert.ok(bat.batisseur >= Math.max(bat.heros, bat.traitre, bat.conquerant), JSON.stringify(bat));
});

test('V17.5b : le Traître trahit parfois, et pas toujours la même cible ; le Héros s\'allie contre le Conquérant plus que les autres', () => {
  const t = BY.traitre;
  assert.ok(t.trahisons > 0 && t.trahisons < 4, `trahisons par Traître : ${t.trahisons}`);
  assert.ok(Object.keys(t.ciblesDesTrahisons).length >= 2, JSON.stringify(t.ciblesDesTrahisons));
  const targets = new Set(GAMES.flatMap(g => g.byNation.filter(n => n.arch === 'traitre').flatMap(n => n.betrayals.map(b => b.target))));
  assert.ok(targets.size >= 3, 'cibles différentes d\'une partie à l\'autre');
  const vs = Object.fromEntries(ARCHETYPES.map(a => [a, BY[a].alliancesContreLeConquerant]));
  assert.ok(vs.heros >= Math.max(vs.traitre, vs.batisseur) && vs.heros > vs.conquerant, JSON.stringify(vs));
});

test('V17.5b : modules purs, sans Math.random ; personnalités réservées au temps réel', () => {
  const src = readSource('src/domain/realtime/personalities.js');
  assert.ok(!/Math\.random|Date\.now|new Date|document\.|window\./.test(src));
  assert.match(readSource('src/domain/engine/ai.js'), /if \(!isRealtime\(state\)\) return ARCH_MARGIN\[arch\];/);
});
