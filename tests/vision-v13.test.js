// V13 — Vision (brouillard de guerre), suppression du ballon, PV lisibles. Règles : docs/V13-vision.md.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { arkenV9Map as map } from '../src/map/arken-v9-map.js';
import { createGameState } from '../src/state/create-game-state.js';
import { RULES, LAND_UNIT_TYPES, SAVE_SCHEMA_VERSION } from '../src/domain/constants.js';
import { visibleProvinces, provinceIntel, perceivedForce, prudentEstimate, visionSharers } from '../src/domain/vision.js';
import { regimentStats, regimentText, firePower, resolveCombat, normalizeForce, provinceForce } from '../src/domain/combat.js';
import { planAIOrders, queueRecruitment, resolveInterturn, eventKnownToPlayer } from '../src/domain/game-engine.js';
import { migrateSave, encodeSave, decodeSave } from '../src/persistence/save-codec.js';
import { provinceTroopView, knownTroopProvinces } from '../src/presentation/v13-vision-ui.js';
import { canKnowProvinceForces } from '../src/presentation/v3-ux.js';
import { assertInvariants } from './helpers/fixtures.js';

const NATIONS = map.nations.map(n => n.id);
/** Partie neuve sur la carte du jeu (V9), toutes nations « humaines » sauf celles listées dans `ai`. */
function fresh({ player = 'valmorne', ai = {} } = {}) {
  const s = createGameState({ map, playerNationId: player, seed: 'vision' });
  for (const id of NATIONS) s.controllers[id] = ai[id] ? 'ai' : 'human';
  for (const [id, archetype] of Object.entries(ai)) s.leaders[id] = { archetype, revealed: false };
  return s;
}
const give = (s, id, owner, units = { infantry: 40 }) => { const p = s.provinces[id]; p.ownerId = owner; p.units = { ...Object.fromEntries(LAND_UNIT_TYPES.map(k => [k, 0])), ...units }; p.warships = 0; };
const ally = (s, a, b) => s.diplomacy.treaties.push({ active: true, type: 'alliance', parties: [a, b], started: s.turn });
const war = (s, a, b) => s.diplomacy.wars.push({ active: true, participants: [a, b], started: s.turn });
const sorted = set => [...set].sort();

// --- Visibilité terrestre ------------------------------------------------------------------------------------
test('vision : au départ Valmorne ne voit que ses 4 provinces — rien par la mer (route p02-p05)', () => {
  const s = fresh();
  assert.ok((map.maritimeRoutes || []).some(([a, b]) => [a, b].includes('p02') && [a, b].includes('p05')), 'route maritime p02-p05');
  assert.ok(s.provinces.p02.units.infantry > 0, 'des troupes à Sylvaren');
  assert.deepEqual(sorted(visibleProvinces(s, map, 'valmorne')), ['p01', 'p02', 'p03', 'p04']);
  const intel = provinceIntel(s, map, 'valmorne', 'p05');
  assert.equal(intel.visible, false);
  assert.equal(intel.troopsKnown, false);
  assert.equal(intel.units, null, 'effectif réel jamais exposé');
  assert.equal(intel.ownerId, 'roc-epine', 'la carte politique reste connue');
  assert.deepEqual(intel.buildings, s.provinces.p05.buildings, 'bâtiments connus');
});

test('vision : une troupe révèle les voisines PAR LA TERRE, pas au-delà d\'une province, pas par la mer', () => {
  const s = fresh();
  give(s, 'p17', 'valmorne', { infantry: 20 }); // Aurorelle : voisines terrestres p19, p20 ; p18 est à 2 pas
  const seen = visibleProvinces(s, map, 'valmorne');
  assert.ok(seen.has('p19') && seen.has('p20'), 'voisines terrestres visibles');
  assert.equal(seen.has('p18'), false, 'pas au-delà d\'une province');
  // p17 n'a pas de route maritime, mais p07 (relié par mer à p17) ne doit pas être révélé par la mer.
  assert.equal(seen.has('p07'), false, 'jamais par la mer');
  assert.equal(seen.has('p11'), false);
  const intel = provinceIntel(s, map, 'valmorne', 'p19');
  assert.equal(intel.troopsKnown, true);
  assert.equal(intel.units.infantry, s.provinces.p19.units.infantry);
});

test('vision : une province possédée SANS troupe ne révèle pas ses voisines (elle reste visible elle-même)', () => {
  const s = fresh();
  give(s, 'p17', 'valmorne', {});
  const seen = visibleProvinces(s, map, 'valmorne');
  assert.ok(seen.has('p17'));
  assert.equal(seen.has('p19'), false);
  assert.equal(seen.has('p20'), false);
});

// --- Forteresse ------------------------------------------------------------------------------------------------
test('forteresse : troupes ennemies cachées même si la province est visible ; bâtiments visibles', () => {
  const s = fresh();
  give(s, 'p17', 'valmorne', { infantry: 20 });
  s.provinces.p19.buildings.fort = 2; s.provinces.p19.buildings.bank = 1;
  const intel = provinceIntel(s, map, 'valmorne', 'p19');
  assert.equal(intel.visible, true);
  assert.equal(intel.entrenched, true);
  assert.equal(intel.troopsKnown, false);
  assert.equal(intel.units, null); assert.equal(intel.regiment, null);
  assert.equal(intel.buildings.fort, 2); assert.equal(intel.buildings.bank, 1);
  const view = provinceTroopView(s, map, 'p19');
  assert.equal(view.text, 'Régiment : effectif inconnu');
  assert.match(view.note, /retranchées/);
  // La forteresse ne cache pas ses propres troupes à leur propriétaire.
  assert.equal(provinceIntel(s, map, 'aurel', 'p19').troopsKnown, true);
  // Une province voisine sans fort reste lisible.
  assert.equal(provinceIntel(s, map, 'valmorne', 'p20').troopsKnown, true);
});

// --- Alliés -----------------------------------------------------------------------------------------------------
test('alliés : la vision est partagée (y compris derrière la forteresse d\'un allié)', () => {
  const s = fresh();
  give(s, 'p17', 'oroel', { infantry: 20 }); // Oroel a une tête de pont à Aurorelle
  assert.equal(visibleProvinces(s, map, 'valmorne').has('p19'), false, 'sans alliance : rien');
  ally(s, 'valmorne', 'oroel');
  assert.deepEqual(sorted(visionSharers(s, 'valmorne')), ['oroel', 'valmorne']);
  const seen = visibleProvinces(s, map, 'valmorne');
  for (const id of ['p13', 'p14', 'p15', 'p16', 'p17', 'p19', 'p20']) assert.ok(seen.has(id), `${id} vu grâce à l'allié`);
  assert.equal(seen.has('p18'), false);
  s.provinces.p13.buildings.fort = 3;
  assert.equal(provinceIntel(s, map, 'valmorne', 'p13').troopsKnown, true, 'le fort d\'un allié ne cache rien à son allié');
  // Une trêve n'est pas une alliance.
  const t = fresh(); give(t, 'p17', 'oroel', { infantry: 20 });
  t.diplomacy.treaties.push({ active: true, type: 'ceasefire', parties: ['valmorne', 'oroel'], started: 1 });
  assert.equal(visibleProvinces(t, map, 'valmorne').has('p19'), false);
});

// --- IA : même brouillard ------------------------------------------------------------------------------------------
test('IA : ses ordres ne dépendent PAS de l\'effectif réel d\'une province qu\'elle ne voit pas (forteresse ou mer)', () => {
  const build = hidden => {
    const s = fresh({ ai: { aurel: 'conquerant' } });
    s.turn = 6;
    give(s, 'p20', 'valmorne', { infantry: hidden });
    s.provinces.p20.buildings.fort = 1;                 // visible depuis p17/p18/p19 mais retranchée
    for (const id of ['p17', 'p18', 'p19']) s.provinces[id].units.infantry = 120;
    s.provinces.p01.units.infantry = hidden * 3;         // capitale de Valmorne, hors de vue (mer)
    war(s, 'aurel', 'valmorne');
    planAIOrders(s, map);
    return s.orders.filter(o => o.nationId === 'aurel').map(({ id, ...o }) => o);
  };
  assert.deepEqual(build(1), build(2000), 'mêmes décisions quel que soit l\'effectif caché');
  // Elle décide sur son estimation prudente (V12 : avec 2000 hommes réels cachés, elle aurait renoncé).
  assert.ok(build(2000).some(o => o.kind === 'move' && o.toId === 'p20'), 'attaque décidée sur estimation, pas sur le réel');
});

test('IA : sans forteresse, la même garnison visible change sa décision (elle n\'attaque pas une armée qu\'elle voit trop forte)', () => {
  const attackOn = garrison => {
    const s = fresh({ ai: { aurel: 'conquerant' } });
    s.turn = 6;
    give(s, 'p20', 'valmorne', { infantry: garrison });
    for (const id of ['p17', 'p18', 'p19']) s.provinces[id].units.infantry = 120;
    war(s, 'aurel', 'valmorne');
    planAIOrders(s, map);
    return s.orders.some(o => o.nationId === 'aurel' && o.kind === 'move' && o.toId === 'p20');
  };
  assert.equal(attackOn(5), true, 'garnison visible et faible : attaque');
  assert.equal(attackOn(2000), false, 'garnison visible et énorme : pas d\'attaque');
});

test('IA : force perçue d\'une province invisible = estimation prudente publique (jamais l\'effectif réel)', () => {
  const s = fresh();
  s.turn = 11;
  s.provinces.p06.units.infantry = 1; // effectif réel ridicule, invisible pour Valmorne
  const est = perceivedForce(s, map, 'valmorne', 'p06');
  assert.deepEqual(est, prudentEstimate(s, 'p06'));
  const growth = 1 + RULES.vision.growthPerTurn * 10;
  assert.equal(est.units.infantry, Math.ceil(RULES.vision.provinceEstimate.infantry * growth));
  s.provinces.p06.units.infantry = 999;
  assert.deepEqual(perceivedForce(s, map, 'valmorne', 'p06'), est, 'indépendant du réel');
  assert.ok(prudentEstimate(s, 'p05').units.armor > 0, 'une capitale est supposée mieux défendue');
});

// --- Journal -------------------------------------------------------------------------------------------------------
test('journal : la règle « ballon » est remplacée par la vision', () => {
  const s = fresh();
  const ev = { turn: 1, type: 'production-lost', nationId: 'aurel', provinceId: 'p19' };
  assert.equal(eventKnownToPlayer(s, map, ev), false, 'province hors de vue');
  give(s, 'p17', 'valmorne', { infantry: 20 });
  assert.equal(eventKnownToPlayer(s, map, ev), true, 'province visible');
});

// --- Ballon supprimé ----------------------------------------------------------------------------------------------
test('ballon : absent des unités, du recrutement, du combat et des nouvelles parties', () => {
  assert.equal(LAND_UNIT_TYPES.includes('balloon'), false);
  assert.equal(RULES.units.balloon, undefined);
  assert.equal(RULES.combat.units.balloon, undefined);
  assert.equal(RULES.combat.balloonAccuracyBonus, undefined);
  const s = fresh();
  s.provinces.p01.buildings.factory = 1;
  const r = queueRecruitment(s, { nationId: 'valmorne', provinceId: 'p01', type: 'balloon' });
  assert.equal(r.ok, false);
  assert.equal(r.error, 'Unité inconnue');
  assert.equal(JSON.stringify(s).includes('balloon'), false, 'aucune trace dans une nouvelle partie');
  assert.equal(canKnowProvinceForces(s, map, 'p05'), false, 'l\'interface suit la vision');
});

test('sauvegarde : migration 8 → 9, les ballons disparaissent sans remboursement, la partie continue', () => {
  const s = fresh();
  const old = structuredClone(s); old.schemaVersion = 8;
  old.provinces.p01.units.balloon = 2; old.provinces.p01.wounds.balloon = 10;
  old.provinces.p01.buildings.factory = 1;
  old.transports = [{ id: 'c1', nationId: 'valmorne', fromId: 'p02', toId: 'p05', via: 'p05', lane: 'p02|p05', stage: 1, turns: 2,
    units: { infantry: 40, cavalry: 0, armor: 0, artillery: 0, balloon: 1 }, warships: 0, wounds: { infantry: 0, cavalry: 0, armor: 0, artillery: 0, balloon: 0, warship: 0 } }];
  old.orders = [
    { id: 'o1', kind: 'move', nationId: 'valmorne', fromId: 'p01', toId: 'p02', units: { infantry: 20, cavalry: 0, armor: 0, artillery: 0, balloon: 1 }, warships: 0, routeType: 'land', status: 'pending', turn: 1 },
    { id: 'o2', kind: 'recruitment', nationId: 'valmorne', provinceId: 'p01', type: 'balloon', lots: 1, amount: 1, cost: 20, duration: 2, status: 'pending', turn: 1 },
    { id: 'o3', kind: 'recruitment', nationId: 'valmorne', provinceId: 'p01', type: 'infantry', lots: 1, amount: 20, cost: 20, duration: 1, status: 'pending', turn: 1 }
  ];
  old.productionQueue = [
    { kind: 'unit', type: 'balloon', provinceId: 'p01', nationId: 'valmorne', amount: 1, remaining: 1, cost: 20 },
    { kind: 'building', type: 'bank', provinceId: 'p02', nationId: 'valmorne', amount: 1, remaining: 2, cost: 30 }
  ];
  const treasury = old.nations.valmorne.treasury;
  const m = migrateSave(old);
  assert.equal(m.schemaVersion, 9);
  assert.equal(SAVE_SCHEMA_VERSION, 9);
  assert.equal(JSON.stringify(m).includes('balloon'), false, 'plus aucun ballon nulle part');
  assert.equal(m.nations.valmorne.treasury, treasury, 'pas de remboursement');
  assert.deepEqual(m.orders.map(o => o.id), ['o1', 'o3'], 'recrutement de ballon retiré, le reste gardé');
  assert.deepEqual(m.productionQueue.map(q => q.type), ['bank']);
  assert.equal(m.provinces.p01.units.infantry, s.provinces.p01.units.infantry, 'les autres troupes sont intactes');
  assert.equal(m.transports[0].units.infantry, 40);
  assertInvariants(m, 'migration 8 → 9');
  resolveInterturn(m, map);
  assertInvariants(m, 'après un inter-tour');
  // Aller-retour sans perte au nouveau schéma.
  assert.deepEqual(decodeSave(encodeSave(m)), m);
});

// --- PV lisibles ---------------------------------------------------------------------------------------------------
test('PV lisibles : « Régiment : X PV · Y dégâts par assaut » calculé comme le combat', () => {
  const capital = normalizeForce({ units: { infantry: 200, cavalry: 10, armor: 6, artillery: 2 } });
  // PV : 200×10 + 10×35 + 6×240 + 2×60 = 3910 ; dégâts : 200×5 + 10×20 + 6×120 + 2×90 = 2100.
  assert.deepEqual(regimentStats(capital), { hp: 3910, maxHp: 3910, damage: 2100, wounded: false });
  assert.equal(regimentText(regimentStats(capital)), 'Régiment : 3910 PV · 2100 dégâts par assaut');
  assert.equal(regimentText(null), 'Régiment : effectif inconnu');
  // Blessés : PV restants, et le feu baisse au prorata (comme dans resolveBattle).
  const hurt = normalizeForce({ units: { infantry: 100 }, wounds: { infantry: 200 } });
  assert.deepEqual(regimentStats(hurt), { hp: 800, maxHp: 1000, damage: 400, wounded: true });
  // Cohérence avec le combat réel : une passe d'infanterie contre de la cavalerie (multiplicateur 1, sans fort).
  const r = resolveCombat({ attacker: hurt, defender: normalizeForce({ units: { cavalry: 500 } }), passes: 1 });
  assert.equal(Math.round(r.defenderHpLost), regimentStats(hurt).damage);
  assert.equal(firePower(hurt, { mode: 'landing' }), 400 * RULES.combat.landingPenalty);
  // Navires à quai : comptés dans le régiment (ils défendent la province).
  const s = fresh();
  s.provinces.p03.warships = 1;
  const own = provinceTroopView(s, map, 'p03');
  const st = regimentStats(provinceForce(s.provinces.p03));
  assert.equal(own.text, `Régiment : ${st.hp} PV · ${st.damage} dégâts par assaut`);
  assert.equal(st.hp, 40 * 10 + 700);
  assert.match(own.composition, /^40 fantassins · 1 navire$/);
  assert.doesNotMatch(own.text + own.composition, /%/, 'plus de pourcentage');
});

test('fiche : province lointaine « effectif inconnu », icône « ? » sur la carte', () => {
  const s = fresh();
  const far = provinceTroopView(s, map, 'p13');
  assert.equal(far.known, false);
  assert.equal(far.text, 'Régiment : effectif inconnu');
  assert.match(far.note, /Hors de vue/);
  const known = knownTroopProvinces(s, map);
  assert.deepEqual(sorted(known), ['p01', 'p02', 'p03', 'p04']);
});
