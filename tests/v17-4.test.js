// V17.4 — Fermes et nourriture (docs/V17-cahier-des-charges.md §4 et §12) : départ à l'équilibre, ferme +10, plafond et coûts,
// grenier, alerte à 10 jours, famine (désertion exacte de 1 % par jour, fin de famine, dégâts × 0,7 transmis au combat),
// IA qui construit des fermes, sauvegarde, pureté du module, interface (barre du haut, fiche, Construction).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { arkenV9Map as map } from '../src/map/arken-v9-map.js';
import { RULES } from '../src/domain/constants.js';
import * as E from '../src/domain/game-engine.js';
import { normalizeForce, provinceForce, resolveBattle, totalHp } from '../src/domain/combat.js';
import { fight } from '../src/domain/engine/battles.js';
import { aiFarmOrders, plannedConsumption } from '../src/domain/realtime/food.js';
import { createGameState } from '../src/state/create-game-state.js';
import { decodeRealtimeSave, encodeSave } from '../src/persistence/save-codec.js';
import { farmCardText, foodEventText, foodHud, perDayText, provinceFoodLine, vivres } from '../src/presentation/food-view.js';
import { PRESENTATION_MODULES_V17_4, readSource, root } from './helpers/sources.js';

const F = RULES.realtime.food;
const NATIONS = map.nations.map(n => n.id);
const ME = 'valmorne';
/** Partie temps réel calme : aucune IA ne décide (les autres nations sont « à la main »). */
function game({ seed = 'v174', ai = false } = {}) {
  const s = E.createRealtimeGame({ map, playerNationId: ME, seed });
  if (!ai) for (const id of NATIONS) if (id !== ME) s.controllers[id] = 'human';
  return s;
}
const day = (s, n = 1) => E.advanceDays(s, map, n);
const owned = (s, id) => Object.keys(s.provinces).filter(p => s.provinces[p].ownerId === id).sort();
const capital = s => s.nations[ME].capitalId;
const totals = (s, id) => {
  const t = { infantry: 0, cavalry: 0, armor: 0, artillery: 0, warship: 0 };
  for (const p of Object.values(s.provinces)) if (p.ownerId === id) { for (const k of ['infantry', 'cavalry', 'armor', 'artillery']) t[k] += p.units[k] || 0; t.warship += p.warships || 0; }
  for (const x of [...(s.stationed || []), ...(s.marches || []), ...(s.transports || [])]) if (x.nationId === id) { for (const k of ['infantry', 'cavalry', 'armor', 'artillery']) t[k] += x.units?.[k] || 0; t.warship += x.warships || 0; }
  return t;
};

// --- Règles -----------------------------------------------------------------------------------------------------------
test('V17.4 : règles de la nourriture lues dans RULES.realtime.food, ferme dans RULES.buildings (temps réel seulement)', () => {
  assert.equal(F.hundredths, 100); assert.equal(F.provinceDaily, 8); assert.equal(F.farmDaily, 10); assert.equal(F.farmMax, 5);
  assert.deepEqual(F.farmCosts, [20, 25, 30, 35, 40]); assert.equal(F.farmDays, 60); assert.equal(F.startReserve, 900); assert.equal(F.granaryDays, 180);
  assert.equal(F.alertDays, 10); assert.equal(F.famineFireFactor, .7); assert.equal(F.famineDesertPct, 1); assert.equal(F.aiReserveDays, 15);
  assert.deepEqual(RULES.buildings.farm, { costs: [20, 25, 30, 35, 40], turns: 2, max: 5, realtimeOnly: true });
  assert.equal(RULES.realtime.durations.buildings.farm, 60);
  // 1 vivre par jour pour 20 or de troupes : fantassin 0,05, cavalier 0,2, blindé 1,5, canon 1,25, navire 3,25 (en centièmes).
  assert.deepEqual(['infantry', 'cavalry', 'armor', 'artillery', 'warship'].map(E.rationOf), [5, 20, 150, 125, 325]);
});

test('V17.4 : départ à l’équilibre — production 32, consommation 29,5, réserve 900, grenier 5 760 (chaque nation)', () => {
  const s = game();
  for (const id of NATIONS) {
    const f = E.foodStatus(s, id);
    assert.equal(f.production, 3200, id); assert.equal(f.consumption, 2950, id); assert.equal(f.perDay, 250, id);
    assert.equal(f.reserve, 90000, id); assert.equal(f.granary, 576000, id); assert.equal(f.famine, false); assert.equal(f.alert, false);
  }
  day(s);
  assert.equal(E.foodStatus(s, ME).reserve, 90250, '+2,5 vivres le premier jour, compté en centièmes');
  day(s, 9);
  assert.equal(E.foodStatus(s, ME).reserve, 92500, 'exactement +25 en 10 jours, sans arrondi');
});

// --- Ferme ------------------------------------------------------------------------------------------------------------
test('V17.4 : ferme — payée tout de suite, livrée en 60 jours, +10 vivres / jour', () => {
  const s = game(), cap = capital(s);
  const before = E.foodStatus(s, ME).production, gold = s.nations[ME].treasury;
  assert.equal(E.provinceFoodHundredths(s, cap), 800);
  const r = E.queueConstruction(s, { nationId: ME, provinceId: cap, type: 'farm' });
  assert.ok(r.ok, r.error); assert.equal(r.cost, 20); assert.equal(s.nations[ME].treasury, gold - 20);
  E.executePendingOrders(s, map);
  const site = s.productionQueue.find(q => q.type === 'farm');
  assert.equal(site.remaining, 60, '60 jours de chantier');
  day(s, 59);
  assert.equal(s.provinces[cap].buildings.farm || 0, 0, 'pas encore livrée au 59e jour');
  day(s);
  assert.equal(s.provinces[cap].buildings.farm, 1, 'livrée au 60e jour');
  assert.equal(E.foodStatus(s, ME).production, before + 1000);
  assert.equal(E.provinceFoodHundredths(s, cap), 1800);
});

test('V17.4 : ferme — 5 niveaux au plus, un à la fois, coûts 20 / 25 / 30 / 35 / 40 ; ni sur l’île ni au tour par tour', () => {
  const s = game(), cap = capital(s);
  s.nations[ME].treasury = 1000;
  const paid = [];
  for (let level = 0; level < 5; level++) {
    const r = E.queueConstruction(s, { nationId: ME, provinceId: cap, type: 'farm' });
    assert.ok(r.ok, r.error); paid.push(r.cost);
    const again = E.queueConstruction(s, { nationId: ME, provinceId: cap, type: 'farm' });
    assert.equal(again.ok, false); if (level < 4) assert.equal(again.error, E.FARM_IN_PROGRESS, 'un niveau à la fois');
    E.executePendingOrders(s, map); day(s, 60);
    assert.equal(s.provinces[cap].buildings.farm, level + 1);
  }
  assert.deepEqual(paid, [20, 25, 30, 35, 40]);
  const capped = E.queueConstruction(s, { nationId: ME, provinceId: cap, type: 'farm' });
  assert.equal(capped.ok, false); assert.match(capped.error, /niveau 5/);
  assert.equal(E.provinceFoodHundredths(s, cap), (8 + 50) * 100, 'plafond d’une province : 58 vivres / jour');
  // Île mystérieuse : rien ne s'y construit.
  const island = RULES.mysteryIsland.provinceId;
  s.provinces[island].ownerId = ME;
  assert.equal(E.queueConstruction(s, { nationId: ME, provinceId: island, type: 'farm' }).ok, false);
  assert.equal(E.provinceFoodHundredths(s, island), 0, 'l’île ne produit rien');
  // Tour par tour : pas de ferme.
  const t = createGameState({ map, playerNationId: ME, seed: 'tpt' });
  const refused = E.queueConstruction(t, { nationId: ME, provinceId: t.nations[ME].capitalId, type: 'farm' });
  assert.equal(refused.ok, false); assert.equal(refused.error, E.FARM_REALTIME_ONLY);
});

test('V17.4 : ferme perdue avec la province pendant le chantier — remboursée (B4)', () => {
  const s = game(), p = owned(s, ME).find(id => id !== capital(s));
  const gold = s.nations[ME].treasury;
  assert.ok(E.queueConstruction(s, { nationId: ME, provinceId: p, type: 'farm' }).ok);
  E.executePendingOrders(s, map);
  s.provinces[p].ownerId = 'roc-epine';
  day(s, 60);
  assert.equal(s.provinces[p].buildings.farm || 0, 0, 'jamais livrée à un autre propriétaire');
  assert.ok(s.nations[ME].treasury >= gold, 'les 20 or sont rendus');
});

// --- Réserve, grenier, alerte -----------------------------------------------------------------------------------------
test('V17.4 : grenier plafonné à 180 jours de production, surplus perdu (« grenier plein »)', () => {
  const s = game(), f = E.foodOf(s, ME);
  f.reserve = 576000 - 100;
  day(s);
  assert.equal(E.foodStatus(s, ME).reserve, 576000, 'bornée au grenier');
  assert.equal(E.foodStatus(s, ME).full, true);
  assert.equal(foodHud(s, ME).tone, 'full');
  day(s, 5);
  assert.equal(E.foodStatus(s, ME).reserve, 576000);
  // Perdre une province réduit le grenier : la réserve redescend au nouveau plafond.
  s.provinces[owned(s, ME).find(id => id !== capital(s))].ownerId = 'roc-epine';
  day(s);
  assert.equal(E.foodStatus(s, ME).reserve, 2400 * 180);
});

test('V17.4 : alerte quand la réserve tiendra moins de 10 jours (une fois, puis tous les 30 jours), rien si la production suffit', () => {
  const s = game(), cap = capital(s);
  s.provinces[cap].units.infantry += 850;            // + 42,5 / jour → consommation 72, production 32 : −40 / jour
  const f = E.foodOf(s, ME);
  assert.equal(E.foodStatus(s, ME).perDay, -4000);
  f.reserve = 4000 * 11;                             // 11 jours
  const alerts = () => s.events.filter(e => e.type === 'food-alert' && e.nationId === ME);
  day(s);                                           // reste 10 jours : pas encore
  assert.equal(alerts().length, 0);
  day(s);                                           // reste 9 jours : alerte
  assert.equal(alerts().length, 1); assert.equal(alerts()[0].daysLeft, 9);
  assert.equal(foodHud(s, ME).tone, 'alert');
  day(s, 5);
  assert.equal(alerts().length, 1, 'une seule fois');
  // Rappel tous les 30 jours tant que la réserve reste basse (on la remet à 9 jours chaque jour).
  for (let i = 0; i < 30; i++) { f.reserve = 4000 * 10; day(s); }
  assert.equal(alerts().length, 2, 'rappel 30 jours après');
  // Production suffisante : aucune alerte, même réserve vide.
  const t = game(); E.foodOf(t, ME).reserve = 0; day(t, 40);
  assert.equal(t.events.filter(e => e.type === 'food-alert').length, 0);
  assert.equal(E.foodStatus(t, ME).famine, false);
});

// --- Famine -----------------------------------------------------------------------------------------------------------
test('V17.4 : famine — désertion exacte de 1 % par jour (report en centièmes) pendant 100 jours, depuis la plus grosse pile', () => {
  const s = game(), cap = capital(s);
  s.provinces[cap].units.infantry = 20000; s.provinces[cap].units.cavalry = 300; s.provinces[cap].units.armor = 37; s.provinces[cap].units.artillery = 12;
  E.foodOf(s, ME).reserve = 0;
  const others = owned(s, ME).filter(id => id !== cap).map(id => s.provinces[id].units.infantry);
  const expected = totals(s, ME), carry = { infantry: 0, cavalry: 0, armor: 0, artillery: 0, warship: 0 };
  for (let d = 1; d <= 100; d++) {
    for (const k of Object.keys(expected)) { carry[k] += expected[k]; const gone = Math.floor(carry[k] / 100); carry[k] -= gone * 100; expected[k] -= gone; }
    day(s);
    assert.deepEqual(totals(s, ME), expected, `jour ${d}`);
    assert.equal(E.foodStatus(s, ME).famine, true);
  }
  assert.equal(expected.infantry, totals(s, ME).infantry);
  assert.ok(expected.infantry < 20000 * .37 && expected.infantry > 20000 * .36, '≈ 0,99^100 de l’effectif');
  assert.deepEqual(owned(s, ME).filter(id => id !== cap).map(id => s.provinces[id].units.infantry), others, 'toujours la plus grosse pile (la capitale)');
  const ev = s.events.filter(e => e.type === 'famine-desertion' && e.nationId === ME);
  assert.equal(ev.length, 100);
  assert.equal(ev[0].deserted.infantry, 201, '20 120 fantassins → 201 le premier jour');
  assert.equal(s.events.filter(e => e.type === 'famine-start' && e.nationId === ME).length, 1);
  assert.match(foodEventText(ev[0]), /^🌾 Famine : 201 fantassins, 3 cavaliers ont déserté$/);
  assert.equal(foodHud(s, ME).tone, 'famine');
});

test('V17.4 : désertion — égalité entre piles : identifiant de province, puis troupes chez soi avant troupes stationnées', () => {
  const s = game(), [a, b] = owned(s, ME);
  for (const id of owned(s, ME)) { const p = s.provinces[id]; p.units = { infantry: 0, cavalry: 0, armor: 0, artillery: 0 }; p.warships = 0; }
  s.provinces[a].units.infantry = 50; s.provinces[b].units.infantry = 50;
  s.stationed = [{ nationId: ME, provinceId: a, units: { infantry: 50, cavalry: 0, armor: 0, artillery: 0 }, warships: 0, wounds: {} }];
    for (const id of owned(s, ME)) if (id !== a && id !== b) s.provinces[id].ownerId = 'roc-epine';
  s.provinces[a].units.armor = 20;                    // + 30 / jour : consommation 37,5 > production 16
  E.foodOf(s, ME).reserve = 0;
  E.foodOf(s, ME).desert = { infantry: 50 };          // 50 + 150 = 200 → 2 fantassins partent
  assert.deepEqual(E.desertion(s, ME), { infantry: 2 });
  assert.equal(s.provinces[a].units.infantry, 49, '1er : province a (identifiant le plus petit), chez soi');
  assert.equal(s.stationed[0].units.infantry, 49, '2e : à égalité (49 contre 50 restants), les stationnées en a passent avant b');
  assert.equal(s.provinces[b].units.infantry, 50);
});

test('V17.4 : fin de famine — les désertions et les fermes ramènent les vivres, « Les vivres sont revenus »', () => {
  const s = game(), cap = capital(s);
  s.provinces[cap].units.infantry = 760;              // consommation 29,5 + 28 = 57,5 > 32
  E.foodOf(s, ME).reserve = 0;
  day(s);
  assert.equal(E.foodStatus(s, ME).famine, true);
  assert.equal(E.fireFactorFor(s, ME), .7);
  // Trois niveaux de ferme livrés d'un coup (+30) : la production couvre la consommation.
  s.provinces[cap].buildings.farm = 3;
  day(s);
  const f = E.foodStatus(s, ME);
  assert.equal(f.famine, false); assert.ok(f.perDay > 0);
  assert.equal(E.fireFactorFor(s, ME), 1, 'les dégâts reviennent à 100 %');
  const end = s.events.filter(e => e.type === 'famine-end' && e.nationId === ME);
  assert.equal(end.length, 1); assert.equal(foodEventText(end[0]), '🌾 Les vivres sont revenus.');
  assert.deepEqual(E.foodOf(s, ME).desert, {}, 'report de désertion remis à zéro');
  // Sans ferme, la famine s'arrête d'elle-même : les désertions baissent la consommation jusqu'à la production.
  const t = game(), c2 = capital(t);
  t.provinces[c2].units.infantry = 1400; E.foodOf(t, ME).reserve = 0;
  let n = 0; while (E.foodStatus(t, ME).famine || n === 0) { day(t); n++; if (n > 400) break; }
  assert.ok(n < 400, `famine terminée en ${n} jours`);
  assert.ok(E.foodStatus(t, ME).consumption <= E.foodStatus(t, ME).production);
});

test('V17.4 : famine — facteur de dégâts 0,7 transmis au combat (attaque et défense), 1 sinon, 1 au tour par tour', () => {
  const s = game();
  assert.equal(E.fireFactorFor(s, ME), 1);
  s.nations[ME].food.famine = true;
  assert.equal(E.fireFactorFor(s, ME), .7);
  assert.equal(E.fireFactorFor(s, null), 1, 'garnison neutre');
  const t = createGameState({ map, playerNationId: ME, seed: 'tpt' });
  t.nations[ME].food = { famine: true };
  assert.equal(E.fireFactorFor(t, ME), 1, 'tour par tour : aucune famine');
  // combat.js : paramètre facultatif, 1 par défaut (identique à l'absence du paramètre).
  const atk = normalizeForce({ units: { infantry: 200 } }), def = normalizeForce({ units: { infantry: 400 } });
  const plain = resolveBattle({ defender: def, attackers: [{ id: 'a', force: atk }] });
  assert.deepEqual(resolveBattle({ defender: def, attackers: [{ id: 'a', force: atk, fireFactor: 1 }], defenderFireFactor: 1 }), plain);
  const once = o => resolveBattle({ defender: def, attackers: [{ id: 'a', force: atk, ...(o.a || {}) }], passes: 1, ...(o.d || {}) });
  assert.ok(once({ a: { fireFactor: .7 } }).defenderHpLost < once({}).defenderHpLost, 'attaquant affamé : moins de dégâts infligés');
  assert.ok(once({ d: { defenderFireFactor: .7 } }).attackers[0].hpLost < once({}).attackers[0].hpLost, 'défenseur affamé : moins de dégâts infligés');
  const one = (o = {}) => resolveBattle({ defender: def, attackers: [{ id: 'a', force: atk, ...o }], passes: 1 }).defenderHpLost;
  assert.ok(Math.abs(one({ fireFactor: .7 }) / one() - .7) < .02, 'une passe : ≈ 70 % des dégâts');
  // Moteur : une vraie attaque (fight) d'une nation affamée utilise le facteur de sa nation, et celui du défenseur.
  const u = game(), target = owned(u, 'roc-epine')[0];
  u.diplomacy.wars.push({ participants: [ME, 'roc-epine'], active: true, started: u.turn });
  const force = normalizeForce({ units: { infantry: 600, armor: 6 } }), before = provinceForce(u.provinces[target]);
  const run = (famineA, famineD) => {
    const c = structuredClone(u);
    c.nations[ME].food.famine = famineA; c.nations['roc-epine'].food.famine = famineD;
    fight(c, target, [{ nationId: ME, force, originIds: [owned(c, ME)[0]], retreatTo: [owned(c, ME)[0]], mode: 'land' }], new Set());
    return c;
  };
  for (const [fa, fd] of [[true, false], [false, true], [true, true]]) {
    const c = run(fa, fd);
    const expected = resolveBattle({ defender: before, attackers: [{ id: ME, force, mode: 'land', fireFactor: fa ? .7 : 1 }], fortLevel: u.provinces[target].buildings.fort || 0, defenderFireFactor: fd ? .7 : 1 });
    const ev = c.events.findLast(e => e.provinceId === target && (e.type === 'battle' || e.type === 'conquest'));
    assert.ok(ev, 'combat enregistré');
    if (!expected.captured) assert.equal(totalHp(provinceForce(c.provinces[target])), totalHp(expected.defender), `famine ${fa}/${fd}`);
    else assert.equal(c.provinces[target].ownerId, ME);
  }
});

// --- IA ---------------------------------------------------------------------------------------------------------------
test('V17.4 : IA — une ferme quand la production prévue passe sous 110 % de la consommation (province qui en a le moins, 10 or gardés, une à la fois, épargne sans or)', () => {
  const s = game(), id = 'roc-epine', provinces = owned(s, id);
  // Production 32 < 1,1 × 29,5 = 32,45 : il faut une ferme.
  s.nations[id].treasury = 100;
  const r = aiFarmOrders(s, id);
  assert.ok(r && r.ok && r.needed);
  const order = s.orders.find(o => o.kind === 'construction' && o.type === 'farm' && o.nationId === id);
  assert.equal(order.provinceId, provinces[0], 'égalité : identifiant le plus petit');
  assert.equal(s.nations[id].treasury, 80);
  assert.equal(aiFarmOrders(s, id), null, 'une ferme en chantier à la fois');
  E.executePendingOrders(s, map); day(s, 60);
  assert.equal(s.provinces[provinces[0]].buildings.farm, 1);
  // Armée doublée : il en faut une autre, dans une province qui n'en a pas encore.
  s.provinces[s.nations[id].capitalId].units.infantry += 600;
  const r2 = aiFarmOrders(s, id);
  assert.ok(r2?.ok);
  assert.notEqual(s.orders.findLast(o => o.type === 'farm' && o.nationId === id).provinceId, provinces[0]);
  // Pas assez d'or pour garder 10 or : rien n'est commandé, l'IA épargne ({ needed, ok: false }).
  const t = game(); t.nations[id].treasury = 29;
  assert.deepEqual(aiFarmOrders(t, id), { needed: true, ok: false });
  t.nations[id].treasury = 30;
  assert.ok(aiFarmOrders(t, id)?.ok, '20 or payés, 10 gardés');
  // Recrutements commandés : comptés dans la consommation prévue.
  const u = game(), base = plannedConsumption(u, id);
  E.queueRecruitment(u, { nationId: id, provinceId: u.nations[id].capitalId, type: 'infantry' });
  assert.equal(plannedConsumption(u, id), base + 100);
  // Tour par tour : jamais.
  const tpt = createGameState({ map, playerNationId: ME, seed: 'tpt' });
  assert.equal(aiFarmOrders(tpt, id), null);
});

test('V17.4 : IA — sans or pour sa ferme, elle ne recrute pas ce jour-là (elle épargne)', () => {
  const s = game({ ai: true }), id = 'roc-epine';
  s.provinces[s.nations[id].capitalId].units.infantry += 2000;   // grosse armée affamée
  s.nations[id].treasury = 25;                                     // de quoi recruter, pas de quoi garder 10 or après la ferme
  const decisionDay = Array.from({ length: 20 }, (_, i) => i + 1).find(d => E.aiNationOfDay(s, d) === id);
  day(s, decisionDay - 1);
  s.nations[id].treasury = 25;
  E.planAIOrders(s, map, { only: id });
  assert.equal(s.orders.filter(o => o.nationId === id && o.kind === 'recruitment').length, 0, 'aucun recrutement');
  assert.equal(s.orders.filter(o => o.nationId === id && o.kind === 'construction' && o.type === 'farm').length, 0);
});

test('V17.4 : partie IA de 4 ans — chaque nation construit des fermes, presque aucune famine, déterministe', () => {
  const play = () => { const s = game({ ai: true, seed: 'v174-ia' }); for (const id of NATIONS) s.controllers[id] = 'ai'; day(s, 1460); return s; };
  const s = play();
  let famineNations = 0;
  for (const id of NATIONS) {
    if (s.nations[id].eliminated) continue;
    const farms = owned(s, id).reduce((n, p) => n + (s.provinces[p].buildings.farm || 0), 0);
    assert.ok(farms >= 1, `${id} : ${farms} ferme(s)`);
    if (s.events.some(e => e.type === 'famine-start' && e.nationId === id)) famineNations++;
  }
  assert.ok(famineNations <= 1, `${famineNations} nation(s) affamée(s)`);
  const again = play();
  assert.equal(JSON.stringify(again.nations), JSON.stringify(s.nations), 'même graine, même partie');
});

// --- Sauvegarde, pureté, interface ------------------------------------------------------------------------------------
test('V17.4 : sauvegarde — réserve, famine et report de désertion gardés ; une sauvegarde V17.1 sans nourriture part avec 900', () => {
  const s = game(); day(s, 12);
  E.foodOf(s, ME).desert = { infantry: 37 };
  const back = decodeRealtimeSave(encodeSave(s)).state;
  assert.deepEqual(back.nations[ME].food, s.nations[ME].food);
  const old = JSON.parse(encodeSave(s)); for (const n of Object.values(old.nations)) delete n.food;
  const loaded = decodeRealtimeSave(JSON.stringify(old)).state;
  assert.equal(E.foodStatus(loaded, ME).reserve, 90000);
  day(loaded); assert.equal(E.foodStatus(loaded, ME).reserve, 90250);
});

test('V17.4 : food.js et food-view.js purs (ni DOM, ni hasard, ni date), modules en cache hors ligne', () => {
  const engine = readFileSync(join(root, 'src/domain/realtime/food.js'), 'utf8');
  for (const bad of ['document', 'window', 'Math.random', 'Date.now', 'new Date', 'localStorage']) assert.ok(!engine.includes(bad), `food.js : ${bad}`);
  for (const f of PRESENTATION_MODULES_V17_4) { const src = readFileSync(join(root, f), 'utf8'); for (const bad of ['document', 'window', 'Math.random']) assert.ok(!src.includes(bad), `${f} : ${bad}`); }
  const sw = readFileSync(join(root, 'sw.js'), 'utf8');
  for (const f of ['./src/domain/realtime/food.js', './src/presentation/food-view.js', './src/presentation/ui/food-ui.js']) assert.ok(sw.includes(`'${f}'`), f);
  // Le combat lit le facteur de famine dans toutes les batailles du moteur (province, en chemin, en mer, rade).
  const src = readSource('src/domain/game-engine.js');
  assert.ok((src.match(/fireFactorFor\(state,/g) || []).length >= 6);
});

test('V17.4 : textes — vivres au dixième, « +N / jour », ligne 🌾 de la fiche, carte Ferme', () => {
  assert.equal(vivres(2950), '29,5'); assert.equal(vivres(90000), '900'); assert.equal(vivres(109750), '1 097,5'); assert.equal(vivres(-250), '−2,5');
  assert.equal(perDayText(250), '+2,5 / jour'); assert.equal(perDayText(-4000), '−40 / jour'); assert.equal(perDayText(0), '±0 / jour');
  const s = game(), cap = capital(s);
  assert.deepEqual(foodHud(s, ME), { reserve: '900', perDay: '+2,5 / jour', tone: 'ok', note: 'Production 32 · consommation 29,5',
    label: 'Vivres : 900, +2,5 / jour. Production 32 · consommation 29,5' });
  assert.equal(provinceFoodLine(s, cap), '🌾 +8 vivres / jour');
  s.provinces[cap].buildings.farm = 2;
  assert.equal(provinceFoodLine(s, cap), '🌾 +28 vivres / jour · ferme niveau 2');
  assert.equal(provinceFoodLine(s, RULES.mysteryIsland.provinceId), '');
  assert.equal(provinceFoodLine(createGameState({ map, playerNationId: ME, seed: 'x' }), cap), '', 'rien au tour par tour');
  assert.deepEqual(farmCardText(0), { cost: 20, days: 60, gain: '+10 🌾/jour', max: 5, text: '20 or · 60 jours · +10 vivres / jour' });
  assert.equal(farmCardText(5).cost, null);
  // Interface : barre du haut, fiche et écran Construction branchés.
  const app = readSource('app.js');
  assert.ok(app.includes('drawFoodHud()') && app.includes('showFoodNews(events)'));
  assert.ok(app.includes("state.mode==='realtime'?['farm']:[]"), 'Ferme dans l’écran Construction en temps réel seulement');
  assert.ok(app.includes('provinceFoodLine(state,selected)'), 'ligne 🌾 dans la fiche');
});
