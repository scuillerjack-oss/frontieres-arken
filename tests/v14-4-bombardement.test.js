// V14.4 — équipe gameplay, points A3 (bombardement des forteresses côtières) et A4 (parties limitées à 80 tours).
// Règles et chiffres : docs/V14.4-cahier-des-charges.md, Réalisé, Équipe gameplay.
import { test } from 'node:test';
import { readSource } from './helpers/sources.js';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { arkenV9Map as map } from '../src/map/arken-v9-map.js';
import { createGameState } from '../src/state/create-game-state.js';
import { resolveInterturn, setRelation, queueMoveOrder, queueBombard, bombardStatus, bombardPreview, bombardTargets, fortBreach,
  availableForces, journalEntry, eventKnownToPlayer, checkGameOver } from '../src/domain/game-engine.js';
import { RULES } from '../src/domain/constants.js';
import { fortReductionPct, resolveBattle, normalizeForce, breachedFactor } from '../src/domain/combat.js';
import { encodeSave, decodeSave } from '../src/persistence/save-codec.js';

const read = f => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
const NATIONS = map.nations.map(n => n.id);
/** Valmorne (Branvale p03, port) face à Oroël (Nordhème p14, forteresse 3, garnison solide). Tout le monde humain. */
function island({ ships = 4, garrison = { infantry: 300, cavalry: 20, armor: 4, artillery: 3 }, fort = 3, war = true } = {}) {
  const s = createGameState({ map, playerNationId: 'valmorne', seed: 'v14-4-bombard' });
  for (const id of NATIONS) s.controllers[id] = 'human';
  if (war) setRelation(s, { nationId: 'valmorne', target: 'oroel', type: 'war' });
  Object.assign(s.provinces.p14, { units: { ...garrison } }); s.provinces.p14.buildings.fort = fort;
  s.provinces.p03.buildings.port = 1; s.provinces.p03.warships = ships;
  return s;
}
/** Bombarde `turns` tours, avec un débarquement qui arrive au dernier de ces tours (2 tours de mer). */
function campaign({ ships = 4, turns, infantry, armor = 6 }) {
  const s = island({ ships });
  s.provinces.p03.units = { infantry, cavalry: 0, armor, artillery: 0 };
  const depart = Math.max(1, turns - 1);
  for (let t = 1; t <= Math.max(turns, depart + 1); t++) {
    if (t === depart) assert.equal(queueMoveOrder(s, map, { nationId: 'valmorne', fromId: 'p03', toId: 'p14', units: { infantry, armor } }).ok, true);
    if (t <= turns) assert.equal(queueBombard(s, map, { nationId: 'valmorne', fromId: 'p03', toId: 'p14', warships: ships }).ok, true);
    resolveInterturn(s, map);
  }
  return s;
}

test('bombardement : ordre seulement depuis un point de port à soi, vers le port au bout de la route, en guerre', () => {
  const peace = island({ war: false });
  assert.equal(bombardStatus(map, peace, { nationId: 'valmorne', fromId: 'p03' }).ok, false, 'pas en guerre');
  assert.match(queueBombard(peace, map, { nationId: 'valmorne', fromId: 'p03', toId: 'p14', warships: 2 }).error, /en guerre/);
  const s = island();
  assert.deepEqual(bombardTargets(map, s, 'p03', 'valmorne'), ['p14']);
  assert.equal(queueBombard(s, map, { nationId: 'valmorne', fromId: 'p01', toId: 'p14', warships: 1 }).ok, false, 'Valmorne (capitale) : pas de point de port');
  assert.equal(queueBombard(s, map, { nationId: 'valmorne', fromId: 'p03', toId: 'p13', warships: 1 }).ok, false, 'Glacenoire n’est pas au bout de la route');
  assert.equal(queueBombard(s, map, { nationId: 'valmorne', fromId: 'p03', toId: 'p14', warships: 9 }).ok, false, 'pas plus de navires qu’à quai');
  assert.equal(queueBombard(s, map, { nationId: 'oroel', fromId: 'p03', toId: 'p14', warships: 1 }).ok, false, 'province d’un autre');
  const r = queueBombard(s, map, { nationId: 'valmorne', fromId: 'p03', toId: 'p14', warships: 3 });
  assert.equal(r.ok, true);
  // Les navires sont réservés pour le tour : plus d'escorte possible avec eux.
  assert.equal(availableForces(s, 'p03', 'valmorne').warships, 1);
  assert.equal(queueMoveOrder(s, map, { nationId: 'valmorne', fromId: 'p03', toId: 'p14', units: { infantry: 10 }, warships: 2 }).ok, false);
});

test('bombardement : brèche proportionnelle à la puissance de feu, plafonnée par tour ; garnison blessée sans mort', () => {
  const s = island({ ships: 2 });
  const before = { ...s.provinces.p14.units };
  const preview = bombardPreview(s, { nationId: 'valmorne', fromId: 'p03', toId: 'p14', warships: 2 });
  assert.equal(preview.breachAfter, 2 * RULES.bombard.breachPerShip);
  assert.equal(preview.protectionAfter, 100 - 2 * RULES.bombard.breachPerShip);
  queueBombard(s, map, { nationId: 'valmorne', fromId: 'p03', toId: 'p14', warships: 2 });
  resolveInterturn(s, map);
  assert.equal(fortBreach(s, 'p14'), preview.breachAfter, 'l’aperçu dit vrai');
  assert.deepEqual(s.provinces.p14.units, before, 'aucun mort : dégâts limités');
  const wounds = Object.values(s.provinces.p14.wounds).reduce((a, b) => a + b, 0);
  const hp = 300 * 10 + 20 * 35 + 4 * 240 + 3 * 60;
  assert.ok(wounds > 0 && wounds <= Math.floor(hp * RULES.bombard.garrisonMaxShare), `${wounds} PV de blessures`);
  // Une énorme flotte ne fait jamais plus que le plafond par tour.
  const big = island({ ships: 30 });
  queueBombard(big, map, { nationId: 'valmorne', fromId: 'p03', toId: 'p14', warships: 30 });
  resolveInterturn(big, map);
  assert.equal(fortBreach(big, 'p14'), RULES.bombard.maxPerTurn);
  // Navires blessés : ils tirent moins fort (puissance de feu réelle).
  const hurt = island({ ships: 2 }); hurt.provinces.p03.wounds.warship = 700;
  assert.ok(bombardPreview(hurt, { nationId: 'valmorne', fromId: 'p03', toId: 'p14', warships: 2 }).breachAfter < preview.breachAfter);
});

test('bombardement : la forteresse affaiblie compte dans le combat, et se répare lentement quand on arrête', () => {
  assert.equal(fortReductionPct(3), 30);
  assert.equal(fortReductionPct(3, 1, 50), 15);
  assert.equal(fortReductionPct(3, 1, 100), 0);
  assert.equal(breachedFactor(1 / .7, 0), 1 / .7);
  const def = normalizeForce({ units: { infantry: 200 } }), atk = [{ id: 'a', force: normalizeForce({ units: { infantry: 200 } }) }];
  const full = resolveBattle({ defender: def, attackers: atk, fortLevel: 3 }), open = resolveBattle({ defender: def, attackers: atk, fortLevel: 3, fortBreach: 100 });
  assert.ok(open.defenderHpLost > full.defenderHpLost, 'brèche totale : plus de protection');
  const s = island();
  for (let i = 0; i < 2; i++) { queueBombard(s, map, { nationId: 'valmorne', fromId: 'p03', toId: 'p14', warships: 4 }); resolveInterturn(s, map); }
  const top = fortBreach(s, 'p14');
  assert.equal(top, 2 * RULES.bombard.maxPerTurn);
  resolveInterturn(s, map);
  assert.equal(fortBreach(s, 'p14'), top - RULES.bombard.repairPerTurn, 'un tour sans bombardement : −10 points');
  for (let i = 0; i < 10; i++) resolveInterturn(s, map);
  assert.equal(fortBreach(s, 'p14'), 0);
  assert.equal(s.fortBreach.p14, undefined, 'réparée : oubliée');
});

test('bombardement + débarquement le même tour : la brèche profite au débarquement (rapport de combat)', () => {
  const s = campaign({ turns: 2, infantry: 200 });
  const battle = s.events.find(e => (e.type === 'battle' || e.type === 'conquest') && e.provinceId === 'p14');
  assert.ok(battle, 'le débarquement a eu lieu');
  assert.equal(battle.fortBreach, 2 * RULES.bombard.maxPerTurn);
  assert.equal(battle.fortPct, fortReductionPct(3, 1, 2 * RULES.bombard.maxPerTurn));
  assert.match(journalEntry(battle, map, 'valmorne').text, /bombardée : protection 40 %/);
});

test('île bien défendue : prenable en quelques tours avec une flotte, jamais en un seul tour', () => {
  // Sans bombardement, 400 fantassins + 6 blindés sont repoussés ; une flotte de 4 navires ouvre la voie en 3 tours.
  const force = { infantry: 400, armor: 6 };
  assert.equal(campaign({ turns: 0, ...force }).provinces.p14.ownerId, 'oroel', 'sans bombardement : repoussé');
  assert.equal(campaign({ turns: 1, ...force }).provinces.p14.ownerId, 'oroel', 'un seul tour de bombardement : repoussé');
  assert.equal(campaign({ turns: 3, ...force }).provinces.p14.ownerId, 'valmorne', 'trois tours : la forteresse cède');
  // Même avec une flotte énorme, un seul tour ne suffit pas (plafond par tour).
  const s = island({ ships: 30 }); s.provinces.p03.units = { infantry: 400, cavalry: 0, armor: 6, artillery: 0 };
  assert.equal(queueMoveOrder(s, map, { nationId: 'valmorne', fromId: 'p03', toId: 'p14', units: { infantry: 400, armor: 6 } }).ok, true);
  resolveInterturn(s, map);
  queueBombard(s, map, { nationId: 'valmorne', fromId: 'p03', toId: 'p14', warships: 30 });
  resolveInterturn(s, map);
  assert.equal(s.provinces.p14.ownerId, 'oroel', '30 navires, un tour : la forteresse tient encore');
});

test('bombardement : une flotte ennemie à quai combat d’abord ; journal public lisible', () => {
  const s = island({ ships: 2 }); s.provinces.p14.buildings.port = 1; s.provinces.p14.warships = 4;
  queueBombard(s, map, { nationId: 'valmorne', fromId: 'p03', toId: 'p14', warships: 2 });
  resolveInterturn(s, map);
  const e = s.events.find(x => x.type === 'bombardment');
  assert.ok(e.harbor, 'bataille devant le port');
  assert.ok(s.provinces.p03.warships < 2 || e.harbor.attackerLost >= 0);
  const ok = island({ ships: 4 });
  queueBombard(ok, map, { nationId: 'valmorne', fromId: 'p03', toId: 'p14', warships: 4 });
  resolveInterturn(ok, map);
  const ev = ok.events.find(x => x.type === 'bombardment');
  const text = journalEntry(ev, map, 'oroel');
  assert.equal(text.type, '⚠ BOMBARDEMENT');
  assert.match(text.text, /Valmorne bombarde Nordhème depuis Branvale \(4 navires\)\. Forteresse niveau 3 : protection 70 % \(−21 % de dégâts reçus au lieu de −30 %\)/);
  assert.match(text.text, /Garnison : \d+ PV perdus \(blessés\)\./);
  assert.ok(eventKnownToPlayer(ok, map, { ...ev, attacker: 'aurel', nationId: 'aurel', defender: 'roc-epine', target: 'roc-epine' }), 'public');
});

test('bombardement : l’IA bombarde aussi, avec les mêmes règles (simulation IA contre IA)', () => {
  let bombards = 0, illegal = 0;
  for (const seed of ['b1', 'b2', 'b3', 'b4']) {
    const s = createGameState({ map, playerNationId: 'valmorne', seed: `v144-${seed}` });
    for (const id of NATIONS) s.controllers[id] = 'ai';
    for (let i = 0; i < 80 && !s.gameOver; i++) {
      resolveInterturn(s, map);
      for (const [id, b] of Object.entries(s.fortBreach || {})) if (b.pct < 0 || b.pct > 100 || !(s.provinces[id].buildings.fort > 0)) illegal++;
    }
    for (const e of s.events.filter(x => x.type === 'bombardment')) {
      bombards++;
      if (e.breachAfter - e.breachBefore > RULES.bombard.maxPerTurn) illegal++;
    }
  }
  assert.ok(bombards > 0, 'les IA bombardent');
  assert.equal(illegal, 0);
});

test('bombardement : ancienne sauvegarde sans brèche, et brèche conservée par la sauvegarde', () => {
  const s = island();
  delete s.fortBreach;
  const old = decodeSave(encodeSave(s));
  assert.equal(fortBreach(old, 'p14'), 0);
  resolveInterturn(old, map); // aucune erreur sans le champ
  queueBombard(old, map, { nationId: 'valmorne', fromId: 'p03', toId: 'p14', warships: 4 });
  resolveInterturn(old, map);
  const back = decodeSave(encodeSave(old));
  assert.equal(fortBreach(back, 'p14'), RULES.bombard.maxPerTurn);
});

test('interface : bouton « Bombarder » sur la fiche, avec la protection restante affichée', () => {
  const app = readSource('app.js');
  assert.match(app, /\['bombard','💥 Bombarder'\]/);
  assert.match(app, /protection restante/i);
  assert.match(app, /queueBombard\(state,map,/);
});

// --- A4 : la partie s'arrête toujours à 80 tours ------------------------------------------------------------------
test('80 tours : fin de partie au tour 80 (IA contre IA), jamais au-delà ; ancienne partie au-delà : finie tout de suite', () => {
  assert.equal(RULES.gameLength, 80);
  for (const seed of ['fin-1', 'fin-2']) {
    const s = createGameState({ map, playerNationId: 'valmorne', seed });
    for (const id of NATIONS) s.controllers[id] = 'ai';
    let turns = 0;
    while (!s.gameOver && turns < 200) { resolveInterturn(s, map); turns++; }
    assert.ok(s.gameOver.turn <= 80, `${seed} : fin au tour ${s.gameOver.turn}`);
    if (s.gameOver.reason === 'turn-limit') assert.equal(s.gameOver.turn, 80);
  }
  const old = createGameState({ map, playerNationId: 'valmorne', seed: 'vieille' });
  old.turn = 95;
  assert.equal(checkGameOver(old).reason, 'turn-limit');
  // L'interface refuse de résoudre un tour après la fin (écran de fin à la place) ; le compteur ne dépasse jamais 80.
  const app = readSource('app.js');
  assert.match(app, /function resolveTurn\(\)\{\s*if\(showEndScreen\(\)\)return;/);
  assert.match(app, /Math\.min\(state\.turn,RULES\.gameLength\)/);
});
