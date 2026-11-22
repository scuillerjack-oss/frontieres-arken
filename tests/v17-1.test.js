// V17.1 — Moteur en jours (docs/V17-cahier-des-charges.md §12) : horloge et dates, revenus quotidiens et report exact, durées
// des productions et des trajets, départ immédiat, rappel, rencontre en chemin, interception à J−30, IA rythmée, fin de partie,
// sauvegarde 13 et refus des anciennes parties, déterminisme, tour par tour inchangé.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { arkenV9Map as map } from '../src/map/arken-v9-map.js';
import { RULES, REALTIME_SCHEMA_VERSION } from '../src/domain/constants.js';
import * as E from '../src/domain/game-engine.js';
import { gameLengthOf, scaleTurn } from '../src/domain/game-length.js';
import { nextAiDays } from '../src/domain/realtime/clock.js';
import { createGameState } from '../src/state/create-game-state.js';
import { decodeRealtimeSave, decodeSave, encodeSave, isRealtimeSave, TURN_BASED_SAVE_REFUSAL } from '../src/persistence/save-codec.js';
import { createDayClock, dueDays, setClockPaused, syncClockHolds } from '../src/presentation/realtime-clock.js';
import { readSource, realtimeFiles, root } from './helpers/sources.js';

const R = RULES.realtime;
const NATIONS = map.nations.map(n => n.id);
/** Partie temps réel calme : les autres nations ne décident pas (contrôlées « à la main »), sauf `ai: true`. */
function game({ seed = 'v171', ai = false, gameLength, player = 'valmorne' } = {}) {
  const s = E.createRealtimeGame({ map, playerNationId: player, seed, gameLength });
  if (!ai) for (const id of NATIONS) if (id !== player) s.controllers[id] = 'human';
  return s;
}
const war = (s, a, b) => s.diplomacy.wars.push({ participants: [a, b], active: true, started: s.turn });
const until = (s, cond, max = 400) => { let n = 0; while (!cond() && n < max) { E.advanceDay(s, map); n++; } return n; };

// --- RULES.realtime ---------------------------------------------------------------------------------------------------
test('V17.1 : RULES.realtime porte les valeurs du cahier (lecture seule)', () => {
  assert.equal(R.clock.msPerDay, 2000); assert.equal(R.clock.fastMsPerDay, 1000); assert.equal(R.clock.maxDaysPerTick, 4);
  assert.deepEqual(R.startDate, { year: 2027, month: 1, day: 1 });
  assert.deepEqual(R.gameDays, { normal: 5479, short: 2557 }); assert.deepEqual(R.gamePeriods, { normal: 183, short: 86 });
  assert.equal(R.daysPerPeriod, 30); assert.equal(R.incomeDays, 50); // V17.9b : 50 jours (avant 60), +20 % de revenus
  assert.deepEqual(R.durations.units, { infantry: 30, cavalry: 30, armor: 60, artillery: 60, warship: 90 });
  assert.deepEqual(R.durations.buildings, { bank: 90, factory: 90, port: 90, fort: 60, farm: 60 });
  // V17.5b : trajets raccourcis d'un tiers (décision de l'équipe d'équilibrage, demande de Jack), terre selon la distance.
  assert.equal(R.durations.land, 20); assert.equal(R.durations.cavalryLand, 13); assert.equal(R.durations.sea, 40); assert.equal(R.durations.islandSea, 80);
  assert.equal(R.durations.sea, 2 * R.durations.landPerSeaTurn); assert.equal(R.durations.islandSea, RULES.mysteryIsland.routeTurns * R.durations.landPerSeaTurn);
  assert.equal(R.durations.interceptDaysLeft, 20); assert.equal(R.durations.balloon, 60); assert.equal(R.durations.balloonHop, 60);
  assert.equal(R.food.provinceDaily, 8); assert.equal(R.food.farmDaily, 10); assert.deepEqual(R.food.farmCosts, [20, 25, 30, 35, 40]); assert.equal(R.food.startReserve, 900);
  assert.equal(R.battle.assaults, 3); assert.equal(R.battle.assaultEveryDays, 3);
  assert.equal(R.ai.decisionEveryDays, 10); assert.equal(R.ai.offsetDays, 2);
  assert.deepEqual(R.ranking, { province: 100, capital: 150, troopGoldPerPoint: 20, treasuryGoldPerPoint: 20, noFamineDaysPerPoint: 50, refreshEveryDays: 10 });
  assert.deepEqual(R.end, { peaceDays: 90, reofferDays: 180 });
  assert.equal(R.save.schema, 13); assert.equal(REALTIME_SCHEMA_VERSION, 13);
  assert.ok(Object.isFrozen(R) && Object.isFrozen(R.durations.units), 'les équipes suivantes ne font que lire');
});

// --- Horloge et dates -------------------------------------------------------------------------------------------------
test('V17.1 : jour 1 = 1er janvier 2027, fin le 31 décembre 2041 (jour 5 479), partie courte le 31 décembre 2033 (2 557)', () => {
  assert.deepEqual(E.dateOfDay(1), { year: 2027, month: 1, day: 1 });
  assert.equal(E.formatDate(1), '1er janvier 2027'); assert.equal(E.formatShortDate(1), '01/01/2027');
  assert.equal(E.dayOfDate(2041, 12, 31), 5479); assert.equal(E.formatDate(5479), '31 décembre 2041');
  assert.equal(E.dayOfDate(2033, 12, 31), 2557);
  assert.equal(E.gameDaysOf(game()), 5479); assert.equal(E.gameDaysOf(game({ gameLength: 40 })), 2557);
  assert.equal(E.formatDate(E.dayOfDate(2029, 3, 14)), '14 mars 2029'); assert.equal(E.formatShortDate(E.dayOfDate(2029, 3, 14)), '14/03/2029');
});
test('V17.1 : calendrier réel, années bissextiles comprises (2028, 2032, 2036, 2040), aller-retour jour ↔ date sur toute la partie', () => {
  for (const y of [2028, 2032, 2036, 2040]) assert.equal(E.dayOfDate(y, 3, 1) - E.dayOfDate(y, 2, 28), 2, `29 février ${y}`);
  for (const y of [2027, 2029, 2030, 2031, 2041]) assert.equal(E.dayOfDate(y, 3, 1) - E.dayOfDate(y, 2, 28), 1, `pas de 29 février ${y}`);
  assert.equal(E.dayOfDate(2028, 1, 1) - E.dayOfDate(2027, 1, 1), 365); assert.equal(E.dayOfDate(2029, 1, 1) - E.dayOfDate(2028, 1, 1), 366);
  for (let d = 1; d <= 5479; d++) { const x = E.dateOfDay(d); assert.equal(E.dayOfDate(x.year, x.month, x.day), d); }
});
test('V17.1 : période de 30 jours = state.turn ; longueur 183 / 86 périodes ; seuils de phase étirés', () => {
  assert.equal(E.periodOfDay(1), 1); assert.equal(E.periodOfDay(30), 1); assert.equal(E.periodOfDay(31), 2); assert.equal(E.periodOfDay(5479), 183);
  assert.equal(E.periodOfDay(2557), 86);
  assert.equal(gameLengthOf(game()), 183); assert.equal(gameLengthOf(game({ gameLength: 40 })), 86);
  assert.equal(scaleTurn(game(), 45), 103, 'IA « fin de partie » : période 103 ≈ jour 3 081');
  const s = game(); E.advanceDays(s, map, 30); assert.equal(s.day, 31); assert.equal(s.turn, 2);
});
test('V17.1 : alertes de fin (« Il reste 1 an » le 1er janvier 2041, « Dernier mois » le 2 décembre 2041 ; partie courte : 6 mois)', () => {
  assert.deepEqual(E.endAlertDays(game()), [{ id: 'year', day: 5115 }, { id: 'month', day: 5450 }]);
  assert.equal(E.formatDate(5115), '1er janvier 2041'); assert.equal(E.formatDate(5450), '2 décembre 2041');
  const short = E.endAlertDays(game({ gameLength: 40 }));
  assert.equal(E.formatDate(short[0].day), '1er juillet 2033'); assert.equal(short[1].day, 2557 - 29);
});
test('V17.1 : horloge de l\'interface — 2 s par jour, en pause par défaut, au plus 4 jours rattrapés', () => {
  const c = createDayClock({ now: 0 });
  assert.equal(dueDays(c, 10000), 0, 'nouvelle horloge en pause');
  setClockPaused(c, false, 10000);
  assert.equal(dueDays(c, 11999), 0); assert.equal(dueDays(c, 12000), 1); assert.equal(dueDays(c, 16000), 2);
  assert.equal(dueDays(c, 60000), 4, 'téléphone gelé : 4 jours au plus');
  syncClockHolds(c, { hidden: true }, 60000); assert.equal(dueDays(c, 70000), 0, 'page cachée : le temps s\'arrête');
  syncClockHolds(c, { hidden: false }, 70000); assert.equal(dueDays(c, 72000), 1);
  const fast = createDayClock({ now: 0, paused: false, speed: 2 }); assert.equal(dueDays(fast, 3000), 3, '×2 : 1 s par jour');
});

// --- Revenus -----------------------------------------------------------------------------------------------------------
test('V17.1 : revenus quotidiens — en incomeDays jours (V17.9b : 50), exactement un tour de revenus ; trésor entier, report < incomeDays', () => {
  const s = game(), me = 'valmorne', income = E.incomeFor(s, me), t0 = s.nations[me].treasury, D = R.incomeDays;
  for (let d = 0; d < D; d++) {
    E.advanceDay(s, map);
    assert.ok(Number.isInteger(s.nations[me].treasury) && Number.isInteger(s.nations[me].goldCarry) && s.nations[me].goldCarry < D);
  }
  assert.equal(s.nations[me].treasury - t0, income); assert.equal(s.nations[me].goldCarry, 0);
  E.advanceDays(s, map, 15); assert.equal(s.nations[me].treasury - t0, income + Math.floor(income * 15 / D));
  assert.equal(s.nations[me].goldCarry, (income * 15) % D);
});
test('V17.1 : bonus d\'or (Aurel +4 %) versé au même taux qu\'au tour par tour, sans rien perdre', () => {
  const s = game({ player: 'aurel' }), id = 'aurel', base = E.incomeFor(s, id), t0 = s.nations[id].treasury;
  E.advanceDays(s, map, 10 * R.incomeDays); // 10 « tours d'économie »
  const got = s.nations[id].treasury - t0, expected = base * 10 * 1.04;
  assert.ok(got > base * 10 && Math.abs(got - expected) <= 1, `${got} ≈ ${expected}`);
});

// --- Productions -------------------------------------------------------------------------------------------------------
test('V17.1 : chaque production dure ses jours (fantassins 30, blindés 60, navire 90, banque 90, forteresse 60) et démarre tout de suite', () => {
  const s = game(), me = 'valmorne';
  s.nations[me].treasury = 2000;
  const p = 'p02'; s.provinces[p].buildings.factory = 1; s.provinces[p].buildings.port = 1;
  const cases = [
    ['unit', 'infantry', () => E.queueRecruitment(s, { nationId: me, provinceId: p, type: 'infantry' }), () => s.provinces[p].units.infantry],
    ['unit', 'cavalry', () => E.queueRecruitment(s, { nationId: me, provinceId: p, type: 'cavalry' }), () => s.provinces[p].units.cavalry],
    ['unit', 'armor', () => E.queueRecruitment(s, { nationId: me, provinceId: p, type: 'armor' }), () => s.provinces[p].units.armor],
    ['unit', 'artillery', () => E.queueRecruitment(s, { nationId: me, provinceId: p, type: 'artillery' }), () => s.provinces[p].units.artillery],
    ['unit', 'warship', () => E.queueRecruitment(s, { nationId: me, provinceId: p, type: 'warship' }), () => s.provinces[p].warships],
    ['building', 'bank', () => E.queueConstruction(s, { nationId: me, provinceId: 'p03', type: 'bank' }), () => s.provinces.p03.buildings.bank],
    ['building', 'fort', () => E.queueConstruction(s, { nationId: me, provinceId: 'p04', type: 'fort' }), () => s.provinces.p04.buildings.fort],
    ['building', 'factory', () => E.queueConstruction(s, { nationId: me, provinceId: 'p01', type: 'factory' }), () => s.provinces.p01.buildings.factory]
  ];
  for (const [kind, type, order, read] of cases) {
    const before = read(), cost0 = s.nations[me].treasury;
    assert.ok(order().ok, type); assert.ok(s.nations[me].treasury < cost0, 'payé au moment de l\'ordre');
    E.executePendingOrders(s, map);
    const q = s.productionQueue.find(x => x.type === type && x.kind === kind);
    const days = kind === 'unit' ? R.durations.units[type] : R.durations.buildings[type];
    assert.equal(q.remaining, days, `${type} : ${days} jours`); assert.equal(q.startDay, s.day);
    const start = s.day, n = until(s, () => read() !== before);
    assert.equal(n, days, `${type} livré après ${days} jours`); assert.equal(s.day, start + days);
  }
});

// --- Déplacements ------------------------------------------------------------------------------------------------------
// V17.5b : durées terrestres = RULES.realtime.durations.land (20) × la distance (p01 → p02 : 17 jours), cavalerie seule plus rapide.
test('V17.1 : départ immédiat (même en pause) ; RULES.realtime.durations.land par la terre (selon la distance), moins pour une armée de cavalerie seule', () => {
  const d12 = E.landTravelDays({ infantry: 1 }, map, 'p01', 'p02'), c13 = E.landTravelDays({ cavalry: 1 }, map, 'p01', 'p03');
  const s = game(), me = 'valmorne';
  const inf0 = s.provinces.p01.units.infantry;
  assert.ok(E.queueMoveOrder(s, map, { nationId: me, fromId: 'p01', toId: 'p02', units: { infantry: 50 } }).ok);
  E.executePendingOrders(s, map); // ce que fait l'interface juste après l'ordre, sans attendre le jour suivant
  assert.equal(s.provinces.p01.units.infantry, inf0 - 50, 'les troupes ont quitté la province le jour de l\'ordre');
  assert.equal(s.orders.length, 0); assert.equal(s.marches.length, 1);
  assert.deepEqual([s.marches[0].startDay, s.marches[0].arriveDay], [1, 1 + d12]);
  const inf2 = s.provinces.p02.units.infantry;
  assert.equal(until(s, () => s.provinces.p02.units.infantry !== inf2), d12); assert.equal(s.provinces.p02.units.infantry, inf2 + 50);
  assert.ok(E.queueMoveOrder(s, map, { nationId: me, fromId: 'p01', toId: 'p03', units: { cavalry: 5 } }).ok);
  E.executePendingOrders(s, map);
  assert.equal(s.marches[0].arriveDay - s.marches[0].startDay, c13);
  assert.ok(c13 < E.landTravelDays({ infantry: 1 }, map, 'p01', 'p03'));
  assert.equal(E.landTravelDays({ cavalry: 5, infantry: 1 }), R.durations.land); assert.equal(E.landTravelDays({ cavalry: 5 }), R.durations.cavalryLand);
});
test('V17.1 : par la mer, RULES.realtime.durations.sea entre deux nations, islandSea vers l\'île mystérieuse (convoi daté)', () => {
  const SEA = R.durations.sea, ISLE = R.durations.islandSea; // V17.5b : 40 et 80 jours (60 et 120 avant)
  const s = game(), me = 'valmorne';
  s.provinces.p03.units.infantry = 100;
  assert.ok(E.queueMoveOrder(s, map, { nationId: me, fromId: 'p03', toId: 'p21', units: { infantry: 60 } }).ok);
  assert.ok(E.queueMoveOrder(s, map, { nationId: me, fromId: 'p02', toId: 'p05', units: { infantry: 20 } }).ok);
  E.executePendingOrders(s, map);
  const isle = s.transports.find(t => t.toId === 'p21'), ring = s.transports.find(t => t.toId === 'p05');
  assert.equal(isle.turns, ISLE); assert.deepEqual([isle.departDay, isle.arriveDay], [1, 1 + ISLE]);
  assert.equal(ring.turns, SEA); assert.deepEqual([ring.departDay, ring.arriveDay], [1, 1 + SEA]);
  assert.equal(until(s, () => !s.transports.some(t => t.id === ring.id)), SEA, `débarquement le jour ${1 + SEA}`);
});
test('V17.1 : rappel en route — demi-tour, le retour dure le temps déjà parcouru ; rappel le jour même = retour immédiat', () => {
  const s = game(), me = 'valmorne', inf0 = s.provinces.p01.units.infantry;
  E.queueMoveOrder(s, map, { nationId: me, fromId: 'p01', toId: 'p02', units: { infantry: 40 } }); E.executePendingOrders(s, map);
  E.advanceDays(s, map, 12);
  const r = E.recallMarch(s, { nationId: me, marchId: s.marches[0].id });
  assert.ok(r.ok); assert.equal(r.arriveDay, s.day + 12);
  assert.equal(E.recallMarch(s, { nationId: me, marchId: s.marches[0].id }).ok, false, 'une armée qui rentre ne se rappelle pas');
  assert.equal(until(s, () => s.provinces.p01.units.infantry === inf0), 12);
  E.queueMoveOrder(s, map, { nationId: me, fromId: 'p01', toId: 'p02', units: { infantry: 40 } }); E.executePendingOrders(s, map);
  assert.ok(E.recallMarch(s, { nationId: me, marchId: s.marches[0].id }).ok);
  assert.equal(s.marches.length, 0); assert.equal(s.provinces.p01.units.infantry, inf0);
  assert.equal(E.recallMarch(s, { nationId: 'aurel', marchId: 'm1' }).ok, false);
});
test('V17.1 : rappel d\'un convoi en mer — il rentre au port de départ en autant de jours qu\'il en a passé en mer', () => {
  const s = game(), me = 'valmorne', inf0 = s.provinces.p02.units.infantry;
  E.queueMoveOrder(s, map, { nationId: me, fromId: 'p02', toId: 'p05', units: { infantry: 20 } }); E.executePendingOrders(s, map);
  E.advanceDays(s, map, 25);
  const r = E.recallConvoy(s, { nationId: me, convoyId: s.transports[0].id });
  assert.ok(r.ok); assert.equal(r.arriveDay, s.day + 25);
  assert.equal(until(s, () => s.provinces.p02.units.infantry === inf0), 25);
  assert.equal(s.transports.length, 0);
});
test('V17.1 : rencontre en chemin — deux armées ennemies en sens opposés sur la même frontière se battent une fois, au milieu', () => {
  const s = game(), me = 'valmorne';
  s.provinces.p04.ownerId = 'aurel'; s.provinces.p04.units = { infantry: 200, cavalry: 0, armor: 0, artillery: 0 };
  war(s, me, 'aurel');
  s.provinces.p02.units.infantry = 200;
  assert.ok(E.queueMoveOrder(s, map, { nationId: me, fromId: 'p02', toId: 'p04', units: { infantry: 100 } }).ok);
  assert.ok(E.queueMoveOrder(s, map, { nationId: 'aurel', fromId: 'p04', toId: 'p02', units: { infantry: 100 } }).ok);
  E.executePendingOrders(s, map);
  assert.equal(s.marches.length, 2);
  // V17.5b : au milieu du trajet (durée selon la distance p02 – p04, la même dans les deux sens).
  const half = Math.ceil(E.landTravelDays({ infantry: 1 }, map, 'p02', 'p04') / 2);
  const ev = s.events.length; E.advanceDays(s, map, half - 1);
  assert.equal(s.events.slice(ev).filter(e => e.type === 'field-battle').length, 0, 'pas encore croisées');
  E.advanceDay(s, map);
  const battles = s.events.slice(ev).filter(e => e.type === 'field-battle');
  assert.equal(battles.length, 1, 'rencontre à mi-chemin'); assert.equal(battles[0].day, half);
  E.advanceDays(s, map, 5); assert.equal(s.events.slice(ev).filter(e => e.type === 'field-battle').length, 1, 'une seule fois');
});
test('V17.1 : interception par le port d\'arrivée quand il reste 30 jours de traversée', () => {
  const s = game(), me = 'valmorne';
  s.provinces.p05.buildings.port = 1; s.provinces.p05.warships = 3; war(s, me, 'roc-epine');
  E.queueMoveOrder(s, map, { nationId: me, fromId: 'p02', toId: 'p05', units: { infantry: 20 } }); E.executePendingOrders(s, map);
  const c = s.transports[0], ev = s.events.length;
  until(s, () => s.events.slice(ev).some(e => e.type === 'interception'), 70);
  const hit = s.events.slice(ev).find(e => e.type === 'interception');
  assert.equal(hit.kind, 'port'); assert.equal(hit.day, c.departDay + c.turns - R.durations.interceptDaysLeft - 1, 'après ce jour, il reste 30 jours de mer');
});
test('V17.1 : arrivée revérifiée — trêve signée après le départ : pas d\'attaque, l\'armée rentre', () => {
  const s = game(), me = 'valmorne';
  s.provinces.p04.ownerId = 'aurel'; war(s, me, 'aurel');
  E.queueMoveOrder(s, map, { nationId: me, fromId: 'p02', toId: 'p04', units: { infantry: 30 } }); E.executePendingOrders(s, map);
  E.advanceDays(s, map, 5);
  s.diplomacy.wars = []; s.diplomacy.treaties.push({ type: 'ceasefire', parties: [me, 'aurel'], active: true, started: s.turn });
  const ev = s.events.length; E.advanceDays(s, map, 25);
  assert.ok(s.events.slice(ev).some(e => e.type === 'attack-cancelled' && e.reason === 'ceasefire'));
  assert.ok(!s.events.slice(ev).some(e => e.type === 'battle' || e.type === 'conquest'));
  assert.equal(s.marches[0].returning, true); assert.equal(s.marches[0].toId, 'p02');
});
test('V17.1 : attaque à l\'arrivée — combat immédiat en 3 passes ; repoussés, les survivants rentrent par la route (même durée qu\'à l\'aller)', () => {
  const s = game(), me = 'valmorne', d = E.landTravelDays({ infantry: 1 }, map, 'p02', 'p04'); // V17.5b : selon la distance
  s.provinces.p04.ownerId = 'aurel'; s.provinces.p04.units = { infantry: 400, cavalry: 0, armor: 0, artillery: 0 }; war(s, me, 'aurel');
  E.queueMoveOrder(s, map, { nationId: me, fromId: 'p02', toId: 'p04', units: { infantry: 30 } }); E.executePendingOrders(s, map);
  const ev = s.events.length; E.advanceDays(s, map, d);
  const b = s.events.slice(ev).find(e => e.type === 'battle');
  assert.ok(b); assert.equal(b.day, d); assert.equal(s.provinces.p04.ownerId, 'aurel');
  const back = s.marches.find(m => m.returning);
  if (back) assert.equal(back.arriveDay - back.startDay, d);
});

// --- IA rythmée -------------------------------------------------------------------------------------------------------
test('V17.1 : une décision d\'IA tous les 10 jours par nation, décalées de 2 jours, une seule nation par jour', () => {
  const s = game({ ai: true });
  const byNation = {};
  for (let d = 1; d <= 100; d++) { const id = E.aiNationOfDay(s, d); if (id) (byNation[id] ||= []).push(d); }
  const ais = NATIONS.filter(id => s.controllers[id] === 'ai');
  assert.deepEqual(Object.keys(byNation).sort(), [...ais].sort());
  for (const days of Object.values(byNation)) { assert.equal(days.length, 10); for (let i = 1; i < days.length; i++) assert.equal(days[i] - days[i - 1], 10); }
  for (let d = 1; d <= 99; d += 2) assert.equal(E.aiNationOfDay(s, d), null, 'jours impairs : personne');
  const starts = Object.values(byNation).map(d => d[0] % 10).sort(); assert.equal(new Set(starts).size, starts.length, 'décalées');
  assert.deepEqual(nextAiDays(s, 1), Object.fromEntries(NATIONS.map((id, i) => [id, [10, 8, 6, 4, 2][i]])));
});
test('V17.1 : l\'IA ne donne d\'ordres que le jour où elle décide (même logique, rythmée en jours) ; ses ordres partent tout de suite', () => {
  const s = game({ ai: true });
  for (let d = 1; d <= 120; d++) {
    const decider = E.aiNationOfDay(s, d), ev = s.events.length, before = s.orderSequence;
    E.advanceDay(s, map);
    const fresh = s.events.slice(ev).filter(e => e.type === 'project-started' || e.type === 'march-departed' || (e.type === 'convoy-departed' && !e.returning));
    for (const e of fresh) assert.equal(e.nationId, decider, `jour ${d} : ${e.type} de ${e.nationId}, décideur ${decider}`);
    if (!decider) assert.equal(s.orderSequence, before, `jour ${d} : aucun ordre`);
    assert.equal(s.orders.filter(o => o.status === 'pending').length, 0, 'aucun ordre ne reste en attente');
  }
  assert.ok(s.events.some(e => e.type === 'project-started' && s.controllers[e.nationId] === 'ai'));
});

// --- Fin de partie --------------------------------------------------------------------------------------------------
test('V17.1 : partie IA de 5 479 jours sans erreur ni Math.random, fin le 31 décembre 2041 ; partie courte le 31 décembre 2033', () => {
  const random = Math.random;
  Math.random = () => { throw new Error('Math.random interdit dans le moteur'); };
  try {
    for (const [gameLength, end] of [[undefined, 5479], [40, 2557]]) {
      const s = game({ ai: true, seed: `fin-${end}`, gameLength });
      s.controllers.valmorne = 'ai';
      let n = 0; while (!s.gameOver && n < 6000) { E.advanceDay(s, map); n++; }
      assert.ok(s.gameOver);
      if (s.gameOver.reason === 'turn-limit') { assert.equal(s.gameOver.day, end); assert.equal(s.day, end); }
      else assert.ok(s.gameOver.day < end);
      assert.equal(E.advanceDay(s, map).day, s.day, 'une partie finie n\'avance plus');
      assert.ok(s.events.every(e => Number.isFinite(e.day)), 'chaque événement est daté');
      assert.ok(s.chronicle.length > 0);
    }
  } finally { Math.random = random; }
});

// --- Sauvegarde ----------------------------------------------------------------------------------------------------
test('V17.1 : sauvegarde schéma 13, aller-retour sans perte au milieu d\'une marche (suite identique jour par jour)', () => {
  const s = game({ ai: true, seed: 'sauve' });
  E.advanceDays(s, map, 95);
  E.queueMoveOrder(s, map, { nationId: 'valmorne', fromId: 'p01', toId: 'p02', units: { infantry: 30 } }); E.executePendingOrders(s, map);
  E.advanceDays(s, map, 7);
  assert.ok(s.marches.length > 0, 'au moins une armée en route');
  const text = encodeSave(s);
  assert.equal(JSON.parse(text).schemaVersion, 13); assert.equal(JSON.parse(text).mode, 'realtime');
  const r = decodeRealtimeSave(text);
  assert.ok(r.state && !r.refused);
  const copy = r.state;
  assert.equal(JSON.stringify({ ...copy, schemaVersion: 0 }), JSON.stringify({ ...structuredClone(s), schemaVersion: 0 }));
  for (let d = 0; d < 200; d++) { E.advanceDay(s, map); E.advanceDay(copy, map); }
  assert.equal(JSON.stringify(copy), JSON.stringify(s));
  assert.equal(decodeSave(text).mode, 'realtime');
});
test('V17.1 : une partie tour par tour (schéma ≤ 12) est refusée proprement, avec le message du cahier ; rien n\'est effacé', () => {
  const tb = createGameState({ map, playerNationId: 'valmorne', seed: 'vieux' });
  for (const text of [encodeSave(tb), encodeSave(createGameState({ map, playerNationId: 'aurel', seed: 'court', gameLength: 40 })), JSON.stringify({ ...tb, schemaVersion: 8 })]) {
    const r = decodeRealtimeSave(text);
    assert.equal(r.state, null); assert.equal(r.refused, 'turn-based'); assert.equal(r.message, TURN_BASED_SAVE_REFUSAL);
    assert.equal(isRealtimeSave(JSON.parse(text)), false);
  }
  assert.match(TURN_BASED_SAVE_REFUSAL, /jouée au tour par tour.*temps réel.*ne peut pas être reprise/);
  assert.equal(decodeRealtimeSave('pas du json').state, null);
  assert.equal(JSON.parse(encodeSave(tb)).schemaVersion, 11, 'le tour par tour garde son schéma');
  // L'interface : refus au chargement, message sur l'accueil, la clé n'est jamais effacée (remplacée seulement par une nouvelle partie).
  const ui = readSource('app.js');
  assert.match(ui, /decodeRealtimeSave\(raw\)/); assert.match(ui, /refusedSave=r\.message|refusedSave = r\.message/);
  assert.match(ui, /Touchez « Nouvelle partie »/);
  assert.doesNotMatch(ui, /removeItem\(SAVE_KEY\)/);
});

// --- Déterminisme et pureté -------------------------------------------------------------------------------------------
test('V17.1 : déterminisme — même graine, même partie ; autre graine, autre partie', () => {
  const play = seed => { const s = game({ ai: true, seed }); s.controllers.valmorne = 'ai'; E.advanceDays(s, map, 900); return JSON.stringify(s); };
  assert.equal(play('det-1'), play('det-1'));
  assert.notEqual(play('det-1'), play('det-2'));
});
test('V17.1 : moteur temps réel pur (src/domain/realtime/) : ni DOM, ni Math.random, ni Date ; modules en cache hors ligne', () => {
  const sw = readFileSync(join(root, 'sw.js'), 'utf8');
  for (const f of realtimeFiles()) {
    const code = readFileSync(join(root, f), 'utf8').replace(/\/\/.*$/gm, '');
    assert.doesNotMatch(code, /Math\.random|\bnew Date\b|Date\.now|\bdocument\b|\bwindow\b|localStorage|setInterval|setTimeout/, f);
    assert.ok(sw.includes(`'./${f}'`), `${f} dans ASSETS`);
  }
  assert.ok(sw.includes("'./src/presentation/ui/realtime-ui.js'") && sw.includes("'./src/presentation/realtime-clock.js'"));
});

// --- Tour par tour inchangé ----------------------------------------------------------------------------------------
// V17.11 : la carte change pour tous les modes (îles espacées, 10 routes vers l'île au lieu de 5) : les empreintes du tour
// par tour sont reprises à la V17.11 (celles de la V16.4.1 restent dans tools/v17 pour mémoire). Moteur du tour par tour inchangé.
test('V17.1 : le tour par tour est inchangé (empreintes de la V17.11, graine 0 : IA, joueur scripté, sauvegarde, atouts, tutoriel)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'arken-v171-'));
  for (const [ref, extra] of [['tools/v17/empreintes-tour-par-tour-v17.11.json', []], ['tools/v17/empreintes-tour-par-tour-v17.11-40-tours.json', ['--longueur=40']]]) {
    const out = join(dir, `${extra.length}.json`);
    const r = spawnSync(process.execPath, ['tools/equilibre.mjs', '--empreintes', '--graines=1', `--ecrire=${out}`, ...extra], { cwd: root, encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    const now = JSON.parse(readFileSync(out, 'utf8')).parties, old = JSON.parse(readFileSync(join(root, ref), 'utf8')).parties;
    assert.ok(Object.keys(now).length >= 12);
    for (const [k, v] of Object.entries(now)) assert.deepEqual(v, old[k], `${ref} : ${k}`);
  }
});
test('V17.1 : une partie tour par tour ne prend aucun champ du temps réel', () => {
  const s = createGameState({ map, playerNationId: 'valmorne', seed: 'tpt' });
  E.resolveInterturn(s, map); E.resolveInterturn(s, map);
  assert.equal(s.mode, undefined); assert.equal(s.day, undefined); assert.equal(s.marches, undefined);
  assert.equal(E.advanceDay(s, map).turn, 3, 'advanceDay ne touche pas une partie tour par tour');
  assert.equal(gameLengthOf(s), 80);
});

// --- Interface provisoire -----------------------------------------------------------------------------------------
test('V17.1 : écran provisoire — horloge ▶ / ⏸, date affichée, ordres partis tout de suite, plus de « Fin du tour », reprise en pause', () => {
  const ui = readSource('app.js');
  assert.match(ui, /installRealtime\(\)/);
  assert.match(ui, /executePendingOrders\(state, map\)/);
  assert.match(ui, /advanceDay\(state, map\)/);
  assert.match(ui, /formatDate\(state\.day\)/);
  assert.match(ui, /createDayClock\(\{ now: t, paused: true \}\)/, 'une partie chargée ou nouvelle commence en pause');
  assert.match(ui, /\$\('#rtPlay'\)\?\.addEventListener\('click', \(\) => setRealtimeSpeed\('play'\)\)/); // V17.3 : ▶ ⏸ ⏩ en bas à droite (remplace « ▶ Jouer / ⏸ Pause » du bandeau)
  assert.match(ui, /recallMarch\(state/); assert.match(ui, /recallConvoy\(state/);
  assert.match(ui, /if\(state\.mode==='realtime'\)return; \/\/ V17\.1 : pas de fin du tour en temps réel/);
  assert.match(ui, /setState\(applyBoosts\(createRealtimeGame\(\{map,/); // V17.9 : toujours en temps réel (?tour-par-tour retiré)
  assert.doesNotMatch(ui, /turnBasedTest|tour-par-tour/);
});
