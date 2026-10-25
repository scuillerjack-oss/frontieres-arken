// V10 — moteur : règles issues de la bêta V9 (points 10 à 13), combats à points de vie, blessures, B1–B6.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RULES } from '../src/domain/constants.js';
import { resolveCombat, resolveBattle, healForce, splitForce, mergeForce, normalizeForce, totalHp, maxHp, maxWoundsFor, combatValue } from '../src/domain/combat.js';
import { queueConstruction, queueMoveOrder, queueRecruitment, resolveInterturn, journalEntry, eventKnownToPlayer, buildingCount, planAIOrders } from '../src/domain/game-engine.js';
import { encodeSave, decodeSave, migrateSave } from '../src/persistence/save-codec.js';
import { arkenV9Map } from '../src/map/arken-v9-map.js';
import { createGameState } from '../src/state/create-game-state.js';
import { map, freshState, assertInvariants } from './helpers/fixtures.js';

const F = units => ({ units });
const atWar = (s, a, b) => s.diplomacy.wars.some(w => w.participants.includes(a) && w.participants.includes(b));
const attack = (s, nationId, fromId, toId, units) => s.orders.push({ id: `t${s.orders.length}`, kind: 'move', nationId, fromId, toId, units: { infantry: 0, cavalry: 0, armor: 0, artillery: 0, ...units }, warships: 0, routeType: 'land', status: 'pending', turn: s.turn });

// --- A1. Plafonds de construction ---------------------------------------------------------------------------
test('A1 : une seule banque par province, file de construction comprise, message clair', () => {
  const s = freshState({ allHuman: true });
  assert.equal(queueConstruction(s, { nationId: 'valmorne', provinceId: 'p02', type: 'bank' }).ok, true);
  const r = queueConstruction(s, { nationId: 'valmorne', provinceId: 'p02', type: 'bank' });
  assert.deepEqual(r, { ok: false, error: 'Une seule banque par province (déjà construite ou en construction)' });
  resolveInterturn(s, map); // la commande passe dans la file de production
  assert.equal(buildingCount(s, 'p02', 'bank'), 1);
  assert.equal(queueConstruction(s, { nationId: 'valmorne', provinceId: 'p02', type: 'bank' }).ok, false);
  assert.equal(queueConstruction(s, { nationId: 'valmorne', provinceId: 'p03', type: 'bank' }).ok, true, 'autre province : permis');
});

test('A1 : une seule usine par province, même une fois construite', () => {
  const s = freshState({ allHuman: true });
  s.provinces.p01.buildings.factory = 1;
  assert.match(queueConstruction(s, { nationId: 'valmorne', provinceId: 'p01', type: 'factory' }).error, /Une seule usine par province/);
  assert.equal(s.nations.valmorne.treasury, 120, 'rien n\'est débité');
});

test('A1 : forteresse niveaux 1 à 3 maximum (20/35/50), en comptant les niveaux en construction', () => {
  const s = freshState({ allHuman: true });
  s.nations.valmorne.treasury = 500;
  assert.equal(queueConstruction(s, { nationId: 'valmorne', provinceId: 'p01', type: 'fort' }).cost, 20);
  resolveInterturn(s, map);
  // V13.3 (Jack) : un niveau à la fois — le suivant ne se lance qu'une fois le précédent terminé.
  const next = () => { for (let i = 0; i < 6 && s.provinces.p01.buildings.fort < buildingCount(s, 'p01', 'fort'); i++) resolveInterturn(s, map); };
  next();
  assert.equal(queueConstruction(s, { nationId: 'valmorne', provinceId: 'p01', type: 'fort' }).cost, 35);
  assert.equal(queueConstruction(s, { nationId: 'valmorne', provinceId: 'p01', type: 'fort' }).ok, false, 'niveau 2 en cours : pas de niveau 3');
  next();
  assert.equal(queueConstruction(s, { nationId: 'valmorne', provinceId: 'p01', type: 'fort' }).cost, 50);
  next();
  assert.match(queueConstruction(s, { nationId: 'valmorne', provinceId: 'p01', type: 'fort' }).error, /niveau 3 \(maximum\)/);
  assert.equal(s.provinces.p01.buildings.fort, 3);
  assert.deepEqual(RULES.fortDefense, [1, 1 / .9, 1 / .8, 1 / .7]); // V13.3 : −10/−20/−30 % de dégâts reçus
});

test('A1 / B5 : l\'IA respecte les plafonds (jamais deux usines ou deux banques, même en file)', () => {
  const s = createGameState({ map: arkenV9Map, playerNationId: 'valmorne' });
  for (const id in s.controllers) s.controllers[id] = 'ai';
  for (const n of Object.values(s.nations)) n.treasury = 5000;
  for (let i = 0; i < 30; i++) {
    planAIOrders(s, arkenV9Map);
    for (const id of Object.keys(s.provinces)) for (const b of ['bank', 'factory', 'port']) assert.ok(buildingCount(s, id, b) <= 1, `${b} ${id} tour ${s.turn}`);
    resolveInterturn(s, arkenV9Map);
  }
});

// --- A1. Forteresse : +10 %/niveau en défense uniquement ---------------------------------------------------
test('A1 : forteresse = défense seulement : les dégâts reçus par le défenseur sont divisés par 1,1 / 1,2 / 1,3', () => {
  const lost = lvl => resolveCombat({ attacker: F({ infantry: 100 }), defender: F({ infantry: 300 }), fortLevel: lvl, passes: 1 }).defenderHpLost;
  const base = lost(0);
  for (const lvl of [1, 2, 3]) assert.ok(Math.abs(lost(lvl) - base / RULES.fortDefense[lvl]) <= 2, `niveau ${lvl}`);
  // Les dégâts infligés par la garnison (donc reçus par l'attaquant) ne changent pas.
  const atk = lvl => resolveCombat({ attacker: F({ infantry: 100 }), defender: F({ infantry: 300 }), fortLevel: lvl, passes: 1 }).attackerHpLost;
  assert.equal(atk(3), atk(0));
});

test('A1 : la forteresse ne sert pas à l\'attaque (une armée qui part d\'une province fortifiée n\'a aucun bonus)', () => {
  const plain = freshState({ allHuman: true }), fortified = freshState({ allHuman: true });
  fortified.provinces.p04.buildings.fort = 3;
  for (const s of [plain, fortified]) { s.provinces.p04.units.infantry = 300; attack(s, 'valmorne', 'p04', 'p08', { infantry: 300 }); resolveInterturn(s, map); }
  const ev = s => s.events.find(e => e.provinceId === 'p08' && (e.type === 'battle' || e.type === 'conquest'));
  assert.deepEqual([ev(plain).type, ev(plain).attackerLosses, ev(plain).defenderLosses], [ev(fortified).type, ev(fortified).attackerLosses, ev(fortified).defenderLosses]);
});

test('A1 : une forteresse niveau 3 peut faire tenir une province qui tomberait sans elle', () => {
  const r0 = resolveCombat({ attacker: F({ infantry: 100 }), defender: F({ infantry: 80 }), fortLevel: 0 });
  const r3 = resolveCombat({ attacker: F({ infantry: 100 }), defender: F({ infantry: 80 }), fortLevel: 3 });
  assert.equal(r0.captured, true);
  assert.equal(r3.captured, false);
});

// --- A2. Guerre automatique ------------------------------------------------------------------------------
test('A2 : attaquer une nation en paix déclare la guerre, dans les deux sens, avec une entrée de journal pour les deux', () => {
  const s = freshState({ allHuman: true });
  attack(s, 'valmorne', 'p04', 'p05', { infantry: 10 });
  resolveInterturn(s, map);
  assert.ok(atWar(s, 'valmorne', 'roc-epine'));
  const ev = s.events.find(e => e.type === 'diplomacy' && e.relation === 'war');
  assert.equal(ev.reason, 'combat');
  for (const reader of ['valmorne', 'roc-epine']) {
    assert.ok(eventKnownToPlayer({ ...s, playerNationId: reader }, map, ev));
    assert.match(journalEntry(ev, map, reader).text, /Valmorne attaque Roc-Épine : les deux nations sont désormais en guerre/);
  }
  // Le défenseur peut riposter sans nouvelle déclaration : une seule guerre active.
  attack(s, 'roc-epine', 'p05', 'p04', { infantry: 10 });
  resolveInterturn(s, map);
  assert.equal(s.diplomacy.wars.filter(w => w.participants.includes('valmorne') && w.participants.includes('roc-epine')).length, 1);
});

// --- A3. Pillage de capitale et élimination (B6) -------------------------------------------------------------
test('A3 : prise d\'une capitale (nation non éliminée) : 50 % du trésor actuel du vaincu, journal explicite', () => {
  const s = freshState({ allHuman: true });
  s.nations['roc-epine'].treasury = 301;
  s.provinces.p04.units.infantry = 1000;
  attack(s, 'valmorne', 'p04', 'p05', { infantry: 1000 });
  resolveInterturn(s, map);
  assert.equal(RULES.capitalPlunderRate, .5);
  assert.equal(s.provinces.p05.ownerId, 'valmorne');
  const ev = s.events.find(e => e.type === 'capital-plunder');
  assert.equal(ev.amount, 150);
  assert.equal(s.nations['roc-epine'].treasury, 301 - 150 + 12, 'reste + revenu de 3 provinces');
  assert.equal(s.nations.valmorne.treasury, 120 + 30 + 150 + 20);
  assert.equal(s.nations['roc-epine'].eliminated, false, 'non éliminée : il lui reste 3 provinces');
  assert.match(journalEntry(ev, map, 'aurel').text, /Capitale prise : Valmorne s’empare de .* et pille 150 or du trésor de Roc-Épine \(50 %\)/);
});

test('A3 : le pillage se répète à chaque reprise de capitale ; le trésor de guerre (+30) une seule fois', () => {
  const s = freshState({ allHuman: true });
  s.provinces.p04.units.infantry = 1000;
  attack(s, 'valmorne', 'p04', 'p05', { infantry: 1000 });
  resolveInterturn(s, map);
  s.provinces.p06.units.infantry = 3000;
  attack(s, 'roc-epine', 'p06', 'p05', { infantry: 3000 });
  resolveInterturn(s, map);
  assert.equal(s.provinces.p05.ownerId, 'roc-epine');
  // p05 n'est plus la capitale de valmorne : reprendre sa propre capitale ne rapporte rien.
  assert.equal(s.events.filter(e => e.type === 'capital-plunder').length, 1);
});

test('B6 corrigé : une nation sans province est marquée éliminée, ses ordres et guerres sont retirés', () => {
  const s = freshState({ allHuman: true });
  for (const id of ['p05', 'p06', 'p07']) s.provinces[id].ownerId = 'valmorne';
  s.provinces.p04.units.infantry = 1000;
  attack(s, 'valmorne', 'p04', 'p08', { infantry: 1000 });
  resolveInterturn(s, map);
  assert.equal(s.provinces.p08.ownerId, 'valmorne');
  assert.equal(s.nations['roc-epine'].eliminated, true);
  assert.ok(s.events.some(e => e.type === 'elimination' && e.nationId === 'roc-epine'));
  assert.equal(s.diplomacy.wars.some(w => w.participants.includes('roc-epine')), false);
  assertInvariants(s, 'élimination');
});

// --- A4. Journal public -----------------------------------------------------------------------------------
test('A4 : chaque affrontement est visible par TOUS ; les pertes seulement pour les nations impliquées', () => {
  const s = freshState({ allHuman: true, player: 'aurel' });
  attack(s, 'valmorne', 'p04', 'p05', { infantry: 10 });
  resolveInterturn(s, map);
  const ev = s.events.find(e => e.type === 'battle');
  assert.ok(ev);
  assert.equal(eventKnownToPlayer(s, map, ev), true, 'Aurel, sans vision sur la province, est informé');
  const pub = journalEntry(ev, map, 'aurel'), own = journalEntry(ev, map, 'valmorne');
  assert.match(pub.text, /^Affrontement à .* entre Valmorne et Roc-Épine : Roc-Épine tient la province\.$/);
  assert.doesNotMatch(pub.text, /Pertes/);
  assert.match(own.text, /Pertes : Valmorne \d+ fantassins/);
  assert.ok(s.turnJournal.some(e => e.text === pub.text), 'dans le journal du tour d\'Aurel');
});

test('A4 : une prise de province annonce « prend la province »', () => {
  const s = freshState({ allHuman: true, player: 'oroel' });
  s.provinces.p04.units.infantry = 500;
  attack(s, 'valmorne', 'p04', 'p08', { infantry: 500 });
  resolveInterturn(s, map);
  const entry = journalEntry(s.events.find(e => e.type === 'conquest'), map, 'oroel');
  assert.match(entry.text, /^Affrontement à .* entre Valmorne et Roc-Épine : Valmorne prend la province\.$/);
});

// --- B1. Table des unités et matchups ---------------------------------------------------------------------------
test('B1 : chaque type a des PV et des dégâts dans RULES.combat, multiplicateurs complets', () => {
  for (const k of ['infantry', 'cavalry', 'armor', 'artillery', 'warship']) {
    assert.ok(RULES.combat.units[k].hp > 0, k);
    assert.ok(RULES.combat.units[k].damage >= 0, k);
    assert.ok(RULES.combat.multipliers[k], k);
  }
  // V13 : le ballon d'observation est supprimé (remplacé par la vision : tests/vision-v13.test.js).
  assert.equal(RULES.combat.units.balloon, undefined, 'plus de ballon');
  assert.equal(RULES.combat.balloonAccuracyBonus, undefined, 'plus de bonus de précision');
  assert.equal(RULES.combat.passes, 3);
});

const sameCost = { infantry: 20, cavalry: 5, armor: 1, artillery: 1 }; // unités par lot (coûts 20/20/30/25)
test('B1 matchup : l\'artillerie fait mal à l\'infanterie (dégâts par unité de dégâts supérieurs aux autres)', () => {
  const vsInf = k => resolveCombat({ attacker: F({ [k]: 1 }), defender: F({ infantry: 500 }), passes: 1 }).defenderHpLost / RULES.combat.units[k].damage;
  assert.ok(vsInf('artillery') > vsInf('armor'));
  assert.ok(vsInf('artillery') > vsInf('cavalry'));
});
test('B1 matchup : l\'artillerie est fragile au contact (la cavalerie la détruit)', () => {
  const r = resolveCombat({ attacker: F({ cavalry: 10 }), defender: F({ artillery: 2 }) });
  assert.equal(r.captured, true);
  assert.ok(r.attacker.units.cavalry >= 5);
});
test('B1 matchup : les blindés écrasent la cavalerie (dans les deux sens)', () => {
  assert.equal(resolveCombat({ attacker: F({ armor: 3 }), defender: F({ cavalry: 15 }) }).captured, true);
  const r = resolveCombat({ attacker: F({ cavalry: 15 }), defender: F({ armor: 3 }) });
  assert.equal(r.captured, false);
  assert.equal(r.attacker.units.cavalry, 0);
});
test('B1 matchup : l\'infanterie en nombre tient tête aux blindés à coût égal', () => {
  const r = resolveCombat({ attacker: F({ armor: 4 }), defender: F({ infantry: 120 }) }); // 120 or contre 120 or
  assert.equal(r.captured, false);
});
// V13 (test remplacé) : le ballon est supprimé ; un « ballon » d'une vieille force est ignoré et ne donne plus +15 %.
test('V13 : plus de ballon ni de bonus de précision au combat', () => {
  const without = resolveCombat({ attacker: F({ infantry: 100 }), defender: F({ infantry: 300 }), passes: 1 }).defenderHpLost;
  const withBalloon = resolveCombat({ attacker: F({ infantry: 100, balloon: 1 }), defender: F({ infantry: 300 }), passes: 1 }).defenderHpLost;
  assert.equal(withBalloon, without, 'aucun bonus');
  assert.equal(resolveCombat({ attacker: F({ balloon: 3 }), defender: F({}) }).captured, false, 'un ballon n\'existe plus : pas de prise');
});
test('B1 matchup : navire contre navire en mer ; les troupes embarquées ne tirent pas et sont vulnérables', () => {
  const r = resolveCombat({ attacker: F({ warship: 1, infantry: 100 }), defender: F({ warship: 1 }), mode: 'naval' });
  assert.equal(r.captured, false, 'pas de prise en mer');
  assert.ok(r.attackerLossesByType.infantry > 0, 'les troupes embarquées subissent des pertes');
  const cargoOnly = resolveCombat({ attacker: F({ infantry: 200 }), defender: F({ warship: 1 }), mode: 'naval' });
  assert.equal(cargoOnly.defenderHpLost, 0, 'un convoi sans escorte ne riposte pas');
});
test('B1 : débarquement : troupes à RULES.combat.landingPenalty de leurs dégâts (V14.2 : 85 %), navires en appui', () => {
  const land = resolveCombat({ attacker: F({ infantry: 100 }), defender: F({ infantry: 400 }), passes: 1 }).defenderHpLost;
  const landing = resolveCombat({ attacker: F({ infantry: 100 }), defender: F({ infantry: 400 }), mode: 'landing', passes: 1 }).defenderHpLost;
  assert.ok(Math.abs(landing - land * RULES.combat.landingPenalty) <= 2);
  const supported = resolveCombat({ attacker: F({ infantry: 100, warship: 2 }), defender: F({ infantry: 400 }), mode: 'landing', passes: 1 }).defenderHpLost;
  assert.ok(supported > landing);
});

// --- B2. Trois passes, répartition, déterminisme ---------------------------------------------------------------
test('B2 : combat en 3 passes au plus, déterministe', () => {
  const args = { attacker: F({ infantry: 400, cavalry: 10, armor: 3 }), defender: F({ infantry: 400, artillery: 2 }), fortLevel: 1 };
  const a = resolveCombat(args), b = resolveCombat(args);
  assert.deepEqual(a, b);
  assert.equal(a.passes.length, 3);
  assert.ok(a.passes[0].defenderHp > a.passes[1].defenderHp && a.passes[1].defenderHp > a.passes[2].defenderHp);
});
test('B2 : un combat s\'arrête dès qu\'un camp est anéanti ; prise seulement s\'il reste des attaquants', () => {
  const r = resolveCombat({ attacker: F({ infantry: 500 }), defender: F({ infantry: 20 }) });
  assert.equal(r.passes.length, 1);
  assert.equal(r.captured, true);
  const mutual = resolveBattle({ defender: F({ infantry: 10 }), attackers: [{ id: 'a', force: F({ infantry: 10 }) }], passes: 30 });
  assert.equal(mutual.captured, mutual.attackers[0].force.units.infantry > 0 && mutual.defender.units.infantry === 0);
});
test('B2 : dégâts répartis au prorata des PV de chaque type ; unités détruites quand les PV tombent', () => {
  const r = resolveCombat({ attacker: F({ infantry: 150 }), defender: F({ infantry: 100, armor: 1 }), passes: 1 });
  assert.ok(r.defenderLossesByType.infantry > 0);
  const hp = RULES.combat.units;
  assert.ok(r.defender.wounds.armor > 0 && r.defender.wounds.armor <= maxWoundsFor('armor', 1), 'le blindé est touché sans être détruit');
  assert.equal(totalHp(r.defender), maxHp({ units: { infantry: 100, armor: 1 } }) - r.defenderHpLost);
  assert.ok(hp.armor.hp > 0);
});
test('B2 : plusieurs attaquants — le plus fort survivant prend la province, les autres repartent', () => {
  const r = resolveBattle({ defender: F({ infantry: 100 }), attackers: [{ id: 'b', force: F({ infantry: 100 }) }, { id: 'a', force: F({ infantry: 300 }) }] });
  assert.equal(r.winnerId, 'a');
  assert.ok(r.attackers.find(x => x.id === 'b').hpLost > 0, 'b a pris sa part du feu');
});

// --- B3. Blessures et guérison ---------------------------------------------------------------------------------
test('B3 : les PV perdus non mortels restent (state.provinces[id].wounds) et guérissent de 10 % des PV max par tour', () => {
  const s = freshState({ allHuman: true });
  assert.deepEqual(s.provinces.p05.wounds, { infantry: 0, cavalry: 0, armor: 0, artillery: 0, warship: 0 });
  attack(s, 'valmorne', 'p04', 'p05', { infantry: 40 }); // défense tenue, garnison blessée
  resolveInterturn(s, map);
  assert.equal(s.provinces.p05.ownerId, 'roc-epine');
  const w = { ...s.provinces.p05.wounds };
  assert.ok(Object.values(w).some(x => x > 0), 'des blessures restent');
  resolveInterturn(s, map); // province amie, pas attaquée : guérison
  for (const k of Object.keys(w)) {
    const n = k === 'warship' ? s.provinces.p05.warships : s.provinces.p05.units[k];
    const heal = Math.ceil(RULES.combat.healRate * n * RULES.combat.units[k].hp);
    assert.equal(s.provinces.p05.wounds[k], Math.max(0, w[k] - heal), k);
  }
});
test('B3 : pas de guérison dans une province attaquée ce tour-là', () => {
  const s = freshState({ allHuman: true });
  s.provinces.p05.wounds.infantry = 200;
  attack(s, 'valmorne', 'p04', 'p05', { infantry: 1 });
  resolveInterturn(s, map);
  assert.ok(s.provinces.p05.wounds.infantry >= 200 - 1, 'blessures non soignées pendant le combat');
  const t = freshState({ allHuman: true });
  t.provinces.p05.wounds.infantry = 200;
  resolveInterturn(t, map);
  assert.equal(t.provinces.p05.wounds.infantry, 0, '200 PV de blessures < 10 % de 2000 PV max');
});
test('B3 : les blessures suivent les troupes qui se déplacent (au prorata)', () => {
  const f = normalizeForce({ units: { infantry: 100 }, wounds: { infantry: 300 } });
  const { taken, rest } = splitForce(f, { infantry: 50 });
  assert.equal(taken.wounds.infantry + rest.wounds.infantry, 300);
  assert.equal(taken.wounds.infantry, 150);
  assert.deepEqual(mergeForce(taken, rest), f);
  assert.equal(healForce(f).wounds.infantry, 200);
});

// --- B4. B4 : production d'une province conquise --------------------------------------------------------------
test('B4 corrigé : une construction en cours dans une province conquise est annulée et remboursée', () => {
  const s = freshState({ allHuman: true });
  queueConstruction(s, { nationId: 'valmorne', provinceId: 'p04', type: 'factory' });
  resolveInterturn(s, map); // usine en file (3 tours)
  const before = s.nations.valmorne.treasury;
  s.provinces.p06.units.infantry = 600;
  attack(s, 'roc-epine', 'p06', 'p04', { infantry: 600 });
  resolveInterturn(s, map);
  assert.equal(s.provinces.p04.ownerId, 'roc-epine');
  assert.equal(s.productionQueue.some(q => q.provinceId === 'p04'), false);
  assert.equal(s.nations.valmorne.treasury, before + 40 + 12);
  for (let i = 0; i < 3; i++) resolveInterturn(s, map);
  assert.equal(s.provinces.p04.buildings.factory, 0, 'jamais livrée au conquérant');
  assert.match(journalEntry(s.events.find(e => e.type === 'production-lost'), map, 'valmorne').text, /40 or remboursés/);
});

// --- B5. Sauvegarde ----------------------------------------------------------------------------------------------
test('B5 : migration d\'une sauvegarde V9 (schéma 5) : PV pleins, aucune blessure, coût de production mémorisé', () => {
  const s = freshState();
  const old = structuredClone(s); old.schemaVersion = 5;
  for (const p of Object.values(old.provinces)) delete p.wounds;
  old.productionQueue = [{ kind: 'unit', type: 'infantry', provinceId: 'p01', nationId: 'valmorne', amount: 40, remaining: 1 }, { kind: 'building', type: 'bank', provinceId: 'p02', nationId: 'valmorne', amount: 1, remaining: 2 }];
  old.transports = [{ nationId: 'valmorne', fromId: 'p03', toId: 'p13', units: { infantry: 20, cavalry: 0, armor: 0, artillery: 0 }, warships: 1, status: 'at-sea', remaining: 1 }];
  const m = migrateSave(old);
  assert.equal(m.schemaVersion, 9, 'V9 -> V10 lot 2 -> V10 marine -> V11 -> V13');
  for (const p of Object.values(m.provinces)) assert.deepEqual(p.wounds, { infantry: 0, cavalry: 0, armor: 0, artillery: 0, warship: 0 });
  assert.deepEqual(m.productionQueue.map(q => q.cost), [40, 30]);
  assert.equal(m.transports[0].wounds.infantry, 0);
  assertInvariants(m, 'migration');
});
test('B5 : aller-retour sans perte d\'une partie avec blessures, et suite identique', () => {
  const s = freshState({ allHuman: true });
  attack(s, 'valmorne', 'p04', 'p05', { infantry: 40 });
  resolveInterturn(s, map);
  assert.ok(Object.values(s.provinces).some(p => Object.values(p.wounds).some(w => w > 0)));
  const back = decodeSave(encodeSave(s));
  assert.deepEqual(back, s);
  resolveInterturn(s, map); resolveInterturn(back, map);
  assert.deepEqual(back, s);
});

// --- C. IA ------------------------------------------------------------------------------------------------------
test('C : l\'IA évalue ses attaques avec le vrai combat (n\'attaque pas une capitale imprenable)', () => {
  const s = freshState({ player: 'valmorne' });
  for (const id of Object.keys(s.controllers)) s.controllers[id] = 'ai';
  planAIOrders(s, map);
  const attacks = s.orders.filter(o => o.kind === 'move' && s.provinces[o.toId].ownerId !== o.nationId && o.routeType === 'land');
  for (const o of attacks) {
    const force = { units: { ...o.units } };
    assert.equal(resolveCombat({ attacker: force, defender: { units: { ...s.provinces[o.toId].units, warship: s.provinces[o.toId].warships } }, fortLevel: s.provinces[o.toId].buildings.fort }).captured, true, `${o.nationId} ${o.fromId}->${o.toId}`);
  }
  assert.ok(combatValue({ units: { armor: 1 } }) > combatValue({ units: { infantry: 1 } }));
});

test('recrutement inchangé : les unités recrutées arrivent sans blessure', () => {
  const s = freshState({ allHuman: true });
  queueRecruitment(s, { nationId: 'valmorne', provinceId: 'p02', type: 'infantry' });
  resolveInterturn(s, map);
  assert.equal(s.provinces.p02.units.infantry, 60);
  assert.equal(s.provinces.p02.wounds.infantry, 0);
});
