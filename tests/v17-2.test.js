// V17.2 — Combats en temps réel (docs/V17-cahier-des-charges.md §5, §12 « V17.2 ») : bataille en 3 assauts (J, J+3, J+6),
// équivalence avec le combat du tour par tour sans renfort, renforts (attaquant et défenseur), retraite volontaire, prise au
// 2e assaut, plusieurs nations (B2), débarquement repoussé qui rentre, défenseur bloqué, bombardement permanent et brèche,
// guérison et réparations en jours (bloquée 10 jours après un combat), fireFactor, sauvegarde en pleine bataille.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { arkenV9Map as map } from '../src/map/arken-v9-map.js';
import { RULES } from '../src/domain/constants.js';
import * as E from '../src/domain/game-engine.js';
import { legacyForce, normalizeForce, resolveBattle, resolveCombat, firePower, totalHp } from '../src/domain/combat.js';
import { fight } from '../src/domain/engine/battles.js';
import { healProvinces } from '../src/domain/engine/recovery.js';
import { MYSTERY_ISLAND_ID } from '../src/domain/mystery-island.js';
import { decodeRealtimeSave, encodeSave } from '../src/persistence/save-codec.js';
import { readSource } from './helpers/sources.js';

const R = RULES.realtime;
const NATIONS = map.nations.map(n => n.id);
const ME = 'valmorne';
function game({ seed = 'v172' } = {}) {
  const s = E.createRealtimeGame({ map, playerNationId: ME, seed });
  for (const id of NATIONS) if (id !== ME) s.controllers[id] = 'human';
  return s;
}
const war = (s, a, b) => s.diplomacy.wars.push({ participants: [a, b], active: true, started: s.turn });
const inf = n => ({ infantry: n, cavalry: 0, armor: 0, artillery: 0 });
/** Province ennemie p04 (Aurel, en guerre) avec `def` fantassins et une forteresse de niveau `fort` ; p02 (à nous) avec `atk`. */
function siege({ def = 300, atk = 300, fort = 0, seed } = {}) {
  const s = game({ seed });
  s.provinces.p04.ownerId = 'aurel'; s.provinces.p04.units = inf(def); s.provinces.p04.warships = 0; s.provinces.p04.wounds = {}; s.provinces.p04.buildings.fort = fort;
  s.provinces.p02.units = inf(atk + 40); s.provinces.p02.wounds = {};
  war(s, ME, 'aurel');
  return s;
}
const send = (s, from, to, units, nationId = ME) => { const r = E.queueMoveOrder(s, map, { nationId, fromId: from, toId: to, units }); assert.ok(r.ok, r.error); E.executePendingOrders(s, map); return s.marches.at(-1); };
const evs = (s, from, type) => s.events.slice(from).filter(e => e.type === type);
const untilDay = (s, day) => { while (s.day < day && !s.gameOver) E.advanceDay(s, map); };

test('V17.2 : RULES.realtime.battle — 3 assauts tous les 3 jours, 6 jours au plus, pas de guérison 10 jours après', () => {
  assert.deepEqual([R.battle.assaults, R.battle.assaultEveryDays, R.battle.maxDays, R.battle.noHealDays], [3, 3, 6, 10]);
  assert.deepEqual([R.bombard.everyDays, R.bombard.breachPerShip, R.bombard.maxPerTick, R.bombard.repairEveryDays, R.bombard.repairAmount], [10, 4, 10, 30, 10]);
});

test('V17.2 : une bataille = 3 assauts, le jour de l\'arrivée (J), J+3 et J+6 ; la défense tient, les survivants rentrent', () => {
  const s = siege({ def: 300, atk: 300, fort: 3 });
  const m = send(s, 'p02', 'p04', { infantry: 300 }), ev = s.events.length;
  untilDay(s, m.arriveDay - 1); // le jour où l'armée arrive (elle est sur place le jour arriveDay)
  const J = s.day;
  E.advanceDay(s, map);
  assert.equal(s.battles.length, 1, 'la bataille est ouverte'); assert.equal(s.battles[0].assaults, 1); assert.equal(s.battles[0].nextAssaultDay, J + 3);
  assert.ok(!evs(s, ev, 'battle').length, 'pas de récit final avant la fin de la bataille');
  untilDay(s, J + 10);
  const a = evs(s, ev, 'assault');
  assert.deepEqual(a.map(x => x.day), [J, J + 3, J + 6]); assert.deepEqual(a.map(x => `${x.assault}/${x.assaults}`), ['1/3', '2/3', '3/3']);
  assert.equal(a[2].over, true);
  const b = evs(s, ev, 'battle');
  assert.equal(b.length, 1); assert.equal(b[0].day, J + 6); assert.equal(b[0].passes, 3); assert.equal(b[0].assaults, 3);
  assert.equal(s.provinces.p04.ownerId, 'aurel'); assert.equal(s.battles.length, 0);
  const back = s.marches.find(x => x.returning && x.nationId === ME);
  assert.ok(back, 'repli par la route'); assert.equal(back.startDay, J + 7); assert.equal(back.arriveDay - back.startDay, 30); assert.equal(back.toId, 'p02');
  assert.ok(evs(s, ev, 'battle-retreat').some(x => x.reason === 'repelled'));
});

/** Rejoue la même attaque des deux façons : bataille temps réel, et `fight` en 3 passes du tour par tour sur une copie. */
function compareWithTurnBased({ def, atk, fort, cav = 0, armor = 0, art = 0, defArmor = 0, wounds = 0 }) {
  const s = siege({ def, atk, fort, seed: `eq-${def}-${atk}-${fort}` });
  s.provinces.p04.units.armor = defArmor; s.provinces.p04.wounds = { infantry: wounds };
  Object.assign(s.provinces.p02.units, { cavalry: cav, armor, artillery: art });
  const m = send(s, 'p02', 'p04', { infantry: atk, cavalry: cav, armor, artillery: art });
  untilDay(s, m.arriveDay - 1);
  const copy = structuredClone(s), ev = s.events.length;
  // Tour par tour : la même armée, la même garnison, une bataille de 3 passes.
  const cm = copy.marches.find(x => x.id === m.id);
  copy.marches = copy.marches.filter(x => x !== cm);
  const cev = copy.events.length;
  const retreats = fight(copy, 'p04', [{ nationId: ME, force: legacyForce(cm), originIds: ['p02'], retreatTo: ['p02'], mode: 'land' }], new Set());
  const whole = copy.events.slice(cev).find(e => e.type === 'battle' || e.type === 'conquest');
  // Temps réel : 3 assauts sur 6 jours.
  untilDay(s, s.day + 8);
  const rt = evs(s, ev, 'battle').concat(evs(s, ev, 'conquest'))[0];
  const back = s.marches.find(x => x.returning && x.nationId === ME);
  const survivors = back ? legacyForce(back) : normalizeForce({});
  return { s, copy, whole, rt, retreats, survivors };
}
test('V17.2 : équivalence — sans renfort, le résultat est identique au combat actuel (forces, prise, pertes, PV, survivants)', () => {
  const cases = [];
  for (const def of [60, 200, 300, 450]) for (const atk of [150, 300, 520]) for (const fort of [0, 1, 3]) cases.push({ def, atk, fort });
  cases.push({ def: 200, atk: 260, fort: 2, cav: 12, armor: 6, art: 3, defArmor: 4, wounds: 300 });
  cases.push({ def: 120, atk: 100, fort: 0, armor: 10, defArmor: 8 });
  let captures = 0, held = 0;
  for (const c of cases) {
    const { s, copy, whole, rt, retreats, survivors } = compareWithTurnBased(c);
    const tag = JSON.stringify(c);
    assert.ok(rt && whole, tag);
    assert.equal(rt.type, whole.type, tag); assert.equal(s.provinces.p04.ownerId, copy.provinces.p04.ownerId, tag);
    assert.deepEqual(legacyForce({ units: s.provinces.p04.units, warships: s.provinces.p04.warships, wounds: s.provinces.p04.wounds }),
      legacyForce({ units: copy.provinces.p04.units, warships: copy.provinces.p04.warships, wounds: copy.provinces.p04.wounds }), `garnison ${tag}`);
    for (const k of ['attacker', 'attackers', 'defender', 'newOwnerId', 'attackerLosses', 'defenderLosses', 'attackerHpLost', 'defenderHpLost', 'lossesByNation', 'hpLostByNation', 'engagedByNation', 'passes', 'fortLevel', 'fortPct', 'naval', 'originIds'])
      assert.deepEqual(rt[k], whole[k], `${k} ${tag}`);
    const expected = retreats[0]?.force || normalizeForce({});
    assert.deepEqual(survivors, normalizeForce(expected), `survivants ${tag}`);
    if (rt.type === 'conquest') captures++; else held++;
  }
  assert.ok(captures >= 5 && held >= 5, `cas variés (${captures} prises, ${held} défenses)`);
});

test('V17.2 : prise au 2e assaut — la province change de main le jour de l\'assaut gagnant, plus d\'assaut ensuite', () => {
  const s = siege({ def: 200, atk: 300, fort: 0 });
  s.productionQueue.push({ kind: 'unit', type: 'infantry', amount: 20, nationId: 'aurel', provinceId: 'p04', remaining: 200, cost: 10 });
  const m = send(s, 'p02', 'p04', { infantry: 300 }), ev = s.events.length;
  untilDay(s, m.arriveDay - 1); const J = s.day; const aurel0 = s.nations.aurel.treasury;
  untilDay(s, J + 8);
  const a = evs(s, ev, 'assault');
  assert.equal(a.length, 2); assert.equal(a[1].captured, true); assert.equal(a[1].day, J + 3);
  const c = evs(s, ev, 'conquest')[0];
  assert.equal(c.day, J + 3); assert.equal(c.newOwnerId, ME); assert.equal(c.assaults, 2);
  assert.equal(s.provinces.p04.ownerId, ME); assert.ok(s.provinces.p04.units.infantry > 0, 'les survivants du vainqueur restent');
  assert.ok(evs(s, ev, 'production-lost').some(e => e.provinceId === 'p04'), 'B4 : production perdue remboursée'); assert.ok(s.nations.aurel.treasury >= aurel0 + 10);
});

test('V17.2 : renfort attaquant — une armée qui arrive pendant la bataille rejoint le prochain assaut (compteur conservé)', () => {
  const s = siege({ def: 300, atk: 300, fort: 3 });
  s.provinces.p02.units.infantry = 700;
  const m1 = send(s, 'p02', 'p04', { infantry: 300 }), ev = s.events.length;
  untilDay(s, s.day + 2);
  send(s, 'p02', 'p04', { infantry: 300 }); // part 2 jours plus tard : arrive entre l'assaut 1 et l'assaut 2
  untilDay(s, m1.arriveDay); // l'assaut 1 est joué
  const J = evs(s, ev, 'assault')[0].day;
  untilDay(s, J + 3);
  const r = evs(s, ev, 'battle-reinforced');
  assert.equal(r.length, 1); assert.equal(r[0].assault, 2); assert.equal(r[0].nationId, ME); assert.equal(r[0].amount, 300);
  assert.equal(s.battles[0].assaults, 1, 'le compteur ne repart pas à zéro');
  untilDay(s, J + 10);
  const done = [...evs(s, ev, 'battle'), ...evs(s, ev, 'conquest')][0];
  assert.equal(done.engagedByNation[ME].infantry, 600, 'forces engagées : les deux armées');
  assert.ok(evs(s, ev, 'assault').length <= 3);
});

test('V17.2 : renfort défenseur — les troupes du propriétaire qui arrivent et les alliés stationnés défendent au prochain assaut', () => {
  const s = siege({ def: 300, atk: 400, fort: 3 });
  s.provinces.p03 && (s.provinces.p03.ownerId = 'aurel');
  // Le défenseur reçoit 200 fantassins (marche venue d'une de ses provinces) entre l'assaut 1 et l'assaut 2.
  const m = send(s, 'p02', 'p04', { infantry: 400 }), ev = s.events.length;
  untilDay(s, m.arriveDay); const J = evs(s, ev, 'assault')[0].day;
  const hp1 = totalHp(legacyForce({ units: s.provinces.p04.units, wounds: s.provinces.p04.wounds }));
  s.provinces.p04.units.infantry += 200; // recrues livrées / armée arrivée : elle est dans la province
  (s.stationed ||= []).push({ nationId: 'oroel', provinceId: 'p04', units: inf(100), warships: 0, wounds: {} });
  s.diplomacy.treaties.push({ type: 'alliance', parties: ['aurel', 'oroel'], active: true, started: s.turn });
  untilDay(s, J + 10);
  const done = [...evs(s, ev, 'battle'), ...evs(s, ev, 'conquest')][0];
  assert.ok(done.engagedByNation.aurel.infantry >= 300 + 200, 'garnison + renfort comptés dans les forces engagées');
  assert.ok(done.guests?.includes('oroel'), 'l\'allié stationné a défendu'); assert.ok(hp1 > 0);
  assert.ok(s.diplomacy.wars.some(w => w.participants.includes('oroel') && w.participants.includes(ME)), 'V14.1 : l\'allié qui défend entre en guerre');
});

test('V17.2 : retraite volontaire — les survivants repartent tout de suite par le même trajet ; la défense a tenu', () => {
  const s = siege({ def: 300, atk: 300, fort: 3 });
  const m = send(s, 'p02', 'p04', { infantry: 300 }), ev = s.events.length;
  untilDay(s, m.arriveDay);
  const b = s.battles[0];
  assert.equal(E.retreatFromBattle(s, map, { nationId: 'aurel', battleId: b.id }).ok, false, 'le défenseur ne peut pas battre en retraite');
  const r = E.retreatFromBattle(s, map, { nationId: ME, battleId: b.id });
  assert.ok(r.ok); assert.equal(s.battles.length, 0);
  const back = s.marches.find(x => x.returning);
  assert.equal(back.startDay, s.day); assert.equal(r.arriveDay, s.day + 30); assert.equal(back.toId, 'p02');
  assert.ok(evs(s, ev, 'battle-retreat').some(e => e.reason === 'retreat'));
  const fin = evs(s, ev, 'battle'); assert.equal(fin.length, 1); assert.equal(fin[0].assaults, 1);
  untilDay(s, s.day + 8); assert.equal(evs(s, ev, 'assault').length, 1, 'plus aucun assaut');
});

test('V17.2 : défenseur bloqué — ses troupes ne peuvent pas quitter la province assiégée tant que la bataille dure', () => {
  const s = siege({ def: 300, atk: 300, fort: 3 });
  const m = send(s, 'p02', 'p04', { infantry: 300 });
  untilDay(s, m.arriveDay);
  assert.equal(E.besieged(s, 'p04', 'aurel'), true); assert.equal(E.besieged(s, 'p04', ME), false);
  const ev = s.events.length, before = s.provinces.p04.units.infantry;
  const to = map.provinces.find(p => p.id === 'p04').landConnections.find(id => id !== 'p02');
  s.provinces[to].ownerId = 'aurel';
  assert.ok(E.queueMoveOrder(s, map, { nationId: 'aurel', fromId: 'p04', toId: to, units: { infantry: 50 } }).ok);
  E.executePendingOrders(s, map);
  assert.equal(s.provinces.p04.units.infantry, before, 'les troupes restent');
  assert.ok(evs(s, ev, 'attack-cancelled').some(e => e.reason === 'besieged'));
  assert.match(E.journalEntry(evs(s, ev, 'attack-cancelled')[0], map, 'aurel').text, /assiégée/);
});

test('V17.2 : plusieurs nations (B2) — une 2e nation en guerre rejoint la bataille ; le plus fort survivant prend, l\'autre rentre', () => {
  const s = siege({ def: 150, atk: 200, fort: 1 });
  // Noireflamme attaque aussi p04 depuis une province voisine, un jour après nous.
  const near = map.provinces.find(p => p.id === 'p04').landConnections.find(id => id !== 'p02');
  s.provinces[near].ownerId = 'noireflamme'; s.provinces[near].units = inf(600);
  war(s, 'noireflamme', 'aurel');
  const m = send(s, 'p02', 'p04', { infantry: 200 }), ev = s.events.length;
  untilDay(s, s.day + 1);
  send(s, near, 'p04', { infantry: 500 }, 'noireflamme');
  untilDay(s, m.arriveDay + 12);
  const c = evs(s, ev, 'conquest')[0];
  assert.ok(c, 'province prise'); assert.deepEqual(c.attackers, ['noireflamme', ME].sort());
  assert.equal(s.provinces.p04.ownerId, c.newOwnerId);
  const loser = c.newOwnerId === ME ? 'noireflamme' : ME;
  assert.ok(evs(s, ev, 'battle-retreat').some(e => e.nationId === loser && e.reason === 'captured') || !s.marches.some(x => x.nationId === loser && !x.returning), 'l\'autre attaquant rentre');
  assert.ok(evs(s, ev, 'battle-reinforced').some(e => e.nationId === 'noireflamme'), 'arrivée pendant la bataille');
});

test('V17.2 : débarquement — bataille en 3 assauts à 85 % ; repoussé, le convoi rembarque et rentre (même durée que l\'aller)', () => {
  const s = game();
  s.provinces.p05.units = inf(250); s.provinces.p05.buildings.fort = 3; s.provinces.p05.buildings.port = 0; s.provinces.p05.warships = 0;
  s.provinces.p02.units.infantry = 300; war(s, ME, 'roc-epine');
  const r = E.queueMoveOrder(s, map, { nationId: ME, fromId: 'p02', toId: 'p05', units: { infantry: 300 } }); assert.ok(r.ok, r.error);
  E.executePendingOrders(s, map);
  const c = s.transports[0], ev = s.events.length;
  untilDay(s, c.arriveDay + 8);
  const a = evs(s, ev, 'assault');
  assert.equal(a.length, 3); assert.equal(a[0].naval, true); assert.deepEqual(a.map(x => x.day - a[0].day), [0, 3, 6]);
  const b = evs(s, ev, 'battle')[0]; assert.equal(b.naval, true); assert.equal(b.landingPct, Math.round(RULES.combat.landingPenalty * 100));
  const back = s.transports.find(t => t.returning && t.nationId === ME);
  assert.ok(back, 'le convoi rentre'); assert.equal(back.toId, 'p02'); assert.equal(back.turns, c.turns); assert.equal(back.arriveDay - back.departDay, c.turns);
  assert.ok(evs(s, ev, 'battle-retreat').some(e => e.naval && e.reason === 'repelled'));
});

test('V17.2 : île mystérieuse — neutre (pas de guerre), bataille en assauts publique', () => {
  const s = game(), island = s.provinces[MYSTERY_ISLAND_ID];
  assert.equal(island.ownerId, null);
  const ev = s.events.length;
  const { joinBattle } = awaitImport;
  joinBattle(s, MYSTERY_ISLAND_ID, [{ nationId: ME, force: legacyForce({ units: inf(2000) }), originIds: ['p02'], retreatTo: ['p02'], mode: 'landing', convoys: [{ id: 'cx', nationId: ME, fromId: 'p02', toId: MYSTERY_ISLAND_ID, via: MYSTERY_ISLAND_ID, lane: 'x', turns: 120 }] }], s.day);
  untilDay(s, s.day + 8);
  const a = evs(s, ev, 'assault');
  assert.ok(a.length >= 1); assert.equal(a[0].defender, null);
  assert.ok(!s.diplomacy.wars.some(w => w.participants.includes(null)), 'aucune guerre contre personne');
  const fin = [...evs(s, ev, 'battle'), ...evs(s, ev, 'conquest')][0];
  assert.ok(fin.mystery, 'récit public de l\'île (V16.2)');
  assert.ok(E.eventKnownToPlayer(s, map, { ...a[0], attackers: ['aurel'], attacker: 'aurel' }), 'un assaut est public');
});
const awaitImport = await import('../src/domain/realtime/battles.js');

test('V17.2 : bombardement en ordre permanent — tous les 10 jours, +4 par navire, +10 au plus ; s\'arrête à la paix ; brèche qui se referme', () => {
  const s = game();
  const from = 'p02', to = 'p05';
  s.provinces[to].buildings.fort = 2; s.provinces[to].buildings.port = 0; s.provinces[from].warships = 3; war(s, ME, 'roc-epine');
  const st = E.bombardStatus(map, s, { nationId: ME, fromId: from });
  assert.ok(st.ok, st.reason);
  assert.ok(E.queueBombard(s, map, { nationId: ME, fromId: from, toId: to, warships: 3 }).ok);
  E.executePendingOrders(s, map);
  assert.equal(s.bombardOrders.length, 1, 'ordre permanent');
  const ev = s.events.length;
  untilDay(s, 31);
  const shots = evs(s, ev, 'bombardment');
  assert.deepEqual(shots.map(e => e.day), [10, 20, 30], 'un tir tous les 10 jours');
  assert.deepEqual(shots.map(e => e.breachAfter), [10, 20, 30], '3 navires × 4 = 12, plafonné à +10 par tranche');
  assert.equal(shots[0].everyDays, 10);
  assert.match(E.journalEntry(shots[0], map, ME).text, /tous les 10 jours/);
  // Une attaque profite de la brèche (forteresse moins protectrice).
  assert.ok(E.fortBreach(s, to) === 30);
  // Paix : l'ordre s'arrête de lui-même au tir suivant ; sans bombardement pendant 30 jours, la brèche se referme de 10.
  s.diplomacy.wars = [];
  untilDay(s, 41);
  assert.ok(evs(s, ev, 'bombard-stopped').some(e => e.reason === 'peace')); assert.equal(s.bombardOrders.length, 0);
  untilDay(s, 91);
  assert.ok(E.fortBreach(s, to) < 30, 'la brèche se referme');
  // Annulation par le joueur.
  war(s, ME, 'roc-epine');
  E.queueBombard(s, map, { nationId: ME, fromId: from, toId: to, warships: 1 }); E.executePendingOrders(s, map);
  const id = s.bombardOrders[0].id;
  assert.ok(E.cancelBombardOrder(s, { nationId: ME, orderId: id }).ok); assert.equal(s.bombardOrders.length, 0);
});

test('V17.2 : guérison en jours — 10/3 % des PV max tous les 10 jours ; bloquée pendant la bataille et 10 jours après', () => {
  const s = game();
  const p = s.provinces.p01; p.units = inf(300); p.wounds = { infantry: 1000 };
  const hpInf = RULES.combat.units.infantry.hp, per = Math.ceil(R.recovery.healPctPer30 / 100 * R.recovery.healEveryDays / 30 * 300 * hpInf);
  untilDay(s, 10); assert.equal(p.wounds.infantry, 1000, 'pas avant le 10e jour');
  E.advanceDay(s, map); assert.equal(p.wounds.infantry, 1000 - per, 'versement du 10e jour');
  untilDay(s, 30); E.advanceDay(s, map); assert.equal(p.wounds.infantry, 1000 - 3 * per, 'en 30 jours, 10 % des PV max (arrondi au supérieur)');
  // Combat le jour 31 dans p01 : pas de guérison les jours 40 ; reprise le jour 50 (10 jours après le dernier combat, 40 - 31 < 10).
  s.rt.fought.p01 = 31;
  untilDay(s, 41); assert.equal(p.wounds.infantry, 1000 - 3 * per, 'bloquée 10 jours après un combat');
  untilDay(s, 51); assert.equal(p.wounds.infantry, 1000 - 4 * per, 'reprend ensuite');
  // Province en bataille : jamais de guérison.
  s.battles.push({ id: 'bx', provinceId: 'p01', defenderId: ME, startDay: s.day, assaults: 1, nextAssaultDay: 1e9, attackers: [], totals: {} });
  const blocked = new Set(['p01']), w = p.wounds.infantry; healProvinces(s, blocked); assert.equal(p.wounds.infantry, w);
});

test('V17.2 : navires au port réparés en 90 / 120 / 150 jours (versés tous les 10 jours) ; réparation de fortune 5 % par 30 jours', () => {
  const s = game();
  const p = s.provinces.p02; p.buildings.port = 1; p.warships = 4; const max = 4 * RULES.combat.units.warship.hp;
  p.wounds = { ...p.wounds, warship: Math.floor(max * .1) };
  const info = E.shipRepairInfo(s, 'p02');
  assert.equal(info.daysLeft, 90); assert.equal(info.turnsLeft, 9);
  untilDay(s, 91); assert.equal(p.wounds.warship || 0, 0, 'réparés en 90 jours');
  p.wounds.warship = Math.floor(max * .4);
  assert.equal(E.shipRepairInfo(s, 'p02').daysLeft, 150);
  const q = s.provinces.p01; q.buildings.port = 0; q.warships = 2; q.wounds = { ...q.wounds, warship: 60 };
  const fieldPer = Math.ceil(Math.round(R.recovery.fieldRepairPctPer30 / 100 * R.recovery.healEveryDays / 30 * 2 * RULES.combat.units.warship.hp * 1000) / 1000);
  const w0 = q.wounds.warship; untilDay(s, s.day + 10 - (s.day % 10) + 1);
  assert.equal(q.wounds.warship, w0 - fieldPer);
});

test('V17.2 : fireFactor — 1 par défaut (rien ne change), 0,7 = 70 % des dégâts de toutes les unités du camp', () => {
  const att = normalizeForce({ units: { infantry: 200, cavalry: 10, armor: 5, artillery: 2 } }), def = normalizeForce({ units: inf(300) });
  const base = resolveBattle({ defender: def, attackers: [{ id: 'a', force: att }] });
  const one = resolveBattle({ defender: def, attackers: [{ id: 'a', force: att, fireFactor: 1 }], defenderFireFactor: 1 });
  assert.deepEqual(one, base);
  assert.ok(Math.abs(firePower(att, { fireFactor: .7 }) - .7 * firePower(att)) < 1e-9);
  const hungry = resolveBattle({ defender: def, attackers: [{ id: 'a', force: att, fireFactor: R.food.famineFireFactor }], passes: 1 });
  const fed = resolveBattle({ defender: def, attackers: [{ id: 'a', force: att }], passes: 1 });
  assert.ok(hungry.defenderHpLost < fed.defenderHpLost); assert.ok(Math.abs(hungry.defenderHpLost - .7 * fed.defenderHpLost) <= 2);
  const dh = resolveBattle({ defender: def, attackers: [{ id: 'a', force: att }], passes: 1, defenderFireFactor: .7 });
  assert.ok(dh.attackers[0].hpLost < fed.attackers[0].hpLost);
  const rc = resolveCombat({ attacker: att, defender: def, attackerFireFactor: .7, passes: 1 });
  assert.equal(rc.defenderHpLost, hungry.defenderHpLost);
  assert.equal(awaitImport.fireFactorOf(game(), ME), 1, 'point de branchement de la famine (V17.4)');
});

test('V17.2 : sauvegarde en pleine bataille — reprise identique jour par jour', () => {
  const s = siege({ def: 300, atk: 300, fort: 3 });
  const m = send(s, 'p02', 'p04', { infantry: 300 });
  untilDay(s, m.arriveDay + 1);
  assert.equal(s.battles.length, 1);
  const r = decodeRealtimeSave(encodeSave(s));
  const t = r.state || r;
  assert.equal(t.battles.length, 1);
  for (let i = 0; i < 10; i++) { E.advanceDay(s, map); E.advanceDay(t, map); }
  assert.deepEqual(JSON.parse(JSON.stringify(t.provinces)), JSON.parse(JSON.stringify(s.provinces)));
  assert.deepEqual(t.marches, s.marches);
});

test('V17.2 : une nation dont toutes les troupes sont à l\'assaut n\'est pas éliminée', () => {
  const s = siege({ def: 300, atk: 300, fort: 3 });
  const m = send(s, 'p02', 'p04', { infantry: 300 });
  untilDay(s, m.arriveDay);
  for (const p of Object.values(s.provinces)) if (p.ownerId === ME) p.ownerId = 'oroel';
  E.advanceDay(s, map);
  assert.ok(!s.nations[ME].eliminated);
});

test('V17.2 : écran provisoire — ⚔ « n/3 » sur la province, fiche de bataille avec Retraite, bandeau, journal « assaut 2/3 »', () => {
  const ui = readSource('app.js');
  assert.match(ui, /drawBattles\(refresh\)/); assert.match(ui, /`\$\{s\.assaultsDone\}\/\$\{s\.assaults\}`/);
  assert.match(ui, /retreatFromBattle\(state, map/); assert.match(ui, /battleNews\(\)/); assert.match(ui, /cancelBombardOrder\(state/);
  const text = E.journalEntry({ type: 'assault', provinceId: 'p04', attackers: [ME], attacker: ME, defender: 'aurel', assault: 2, assaults: 3, nextAssaultDay: 40, attackerHpLost: 5, defenderHpLost: 9 }, map, ME);
  assert.match(text.type, /ASSAUT 2\/3/); assert.match(text.text, /assaut 2\/3/); assert.match(text.text, /Prochain assaut le/);
});

test('V17.2 : partie IA de 2 ans — batailles en assauts, aucune bataille éternelle, rien de perdu', () => {
  const s = E.createRealtimeGame({ map, playerNationId: ME, seed: 'v172-ia' });
  for (const id of NATIONS) s.controllers[id] = 'ai';
  const ev = s.events.length;
  untilDay(s, 730);
  for (const b of s.battles) { assert.ok(s.day - b.startDay <= R.battle.maxDays + 1, 'une bataille dure 6 jours au plus'); assert.ok(b.assaults <= 3); }
  assert.ok(evs(s, ev, 'assault').length > 0);
  for (const a of evs(s, ev, 'assault')) assert.ok(a.assault >= 1 && a.assault <= 3);
});

test('V17.2 : attaquer sans guerre déclarée la déclare (V10) et la bataille a lieu ; paix signée pendant la bataille : l\'attaquant rentre', () => {
  const s = siege({ def: 300, atk: 300, fort: 3 });
  s.diplomacy.wars = []; // pas en guerre au départ
  const m = send(s, 'p02', 'p04', { infantry: 300 }), ev = s.events.length;
  untilDay(s, m.arriveDay);
  assert.equal(evs(s, ev, 'assault').length, 1, 'le premier assaut a lieu');
  assert.ok(s.diplomacy.wars.some(w => w.participants.includes(ME) && w.participants.includes('aurel')), 'guerre automatique');
  // Trêve signée entre l'assaut 1 et l'assaut 2 : pas d'assaut 2, retour par la route.
  s.diplomacy.wars = []; s.diplomacy.treaties.push({ type: 'ceasefire', parties: [ME, 'aurel'], active: true, started: s.turn });
  untilDay(s, s.day + 6);
  assert.equal(evs(s, ev, 'assault').length, 1);
  assert.ok(evs(s, ev, 'battle-retreat').some(e => e.reason === 'peace')); assert.equal(s.battles.length, 0);
  assert.ok(s.marches.some(x => x.returning && x.nationId === ME));
});
