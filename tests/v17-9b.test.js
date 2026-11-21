// V17.9b — Batterie finale et rééquilibrage (docs/V17-cahier-des-charges.md, « Réalisé V17.9b ») : invariants vérifiés
// chaque jour sur quelques parties complètes (version rapide de tools/v17/batterie-v17.9b.mjs), et les corrections d'IA.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { arkenV9Map as map } from '../src/map/arken-v9-map.js';
import { RULES, START_UNITS } from '../src/domain/constants.js';
import * as E from '../src/domain/game-engine.js';
import { combatValue } from '../src/domain/combat.js';
import { createGameState } from '../src/state/create-game-state.js';
import { navalBase } from '../src/domain/engine/ai-naval.js';
import { playBattery } from '../tools/v17/batterie-v17.9b.mjs';
import { readSource } from './helpers/sources.js';

const R = RULES.realtime;
const NATIONS = map.nations.map(n => n.id);
const allAi = (seed, nation = 'valmorne') => { const s = E.createRealtimeGame({ map, playerNationId: nation, seed }); for (const id of NATIONS) s.controllers[id] = 'ai'; return s; };

test('V17.9b : parties courtes complètes — aucune exception, aucun invariant violé, troupes conservées, sauvegarde/reprise identique', () => {
  const random = Math.random;
  Math.random = () => { throw new Error('Math.random appelé pendant une simulation'); };
  try {
    for (const [i, player] of [[0, false], [1, false], [2, true]]) {
      const g = playBattery(`v179b-test-${i}`, { short: true, nation: NATIONS[i], player, saveChecks: 1 });
      assert.equal(g.error, null, g.error);
      assert.deepEqual(g.violations, [], g.violations.join(' ; '));
      assert.equal(g.troopDriftDays, 0, 'troupes créées ou perdues sans raison');
      assert.equal(g.saveChecks, 1);
      assert.deepEqual(g.saveMismatch, []);
      assert.ok(['turn-limit', 'capitals', 'last-nation', 'player-eliminated', 'peace'].includes(g.reason));
      assert.ok(g.conquests > 0, 'la carte bouge');
    }
  } finally { Math.random = random; }
});

test('V17.9b : troupes de départ du temps réel (RULES.realtime.start) — sans complément, identiques au tour par tour ; île inchangée', () => {
  const rt = E.createRealtimeGame({ map, playerNationId: 'valmorne', seed: 'start' }), tb = createGameState({ map, playerNationId: 'valmorne', seed: 'start' });
  for (const [id, p] of Object.entries(rt.provinces)) {
    const capital = Object.values(rt.nations).some(n => n.capitalId === id);
    if (id === 'p21') { assert.deepEqual(p.units, tb.provinces[id].units); continue; }
    const want = { ...(capital ? R.start.capital || START_UNITS.capital : R.start.province || START_UNITS.province) };
    for (const [k, v] of Object.entries(R.start.nation?.[p.ownerId]?.[id] || {})) want[k] = (want[k] || 0) + v;
    for (const k of ['infantry', 'cavalry', 'armor', 'artillery']) assert.equal(p.units[k], want[k] || 0, `${id} ${k}`);
  }
});

test('V17.9b : base navale entre deux ports équivalents tirée à la graine (Solmara ne fait plus toujours face à Roc-Épine)', () => {
  assert.equal(R.ai.baseTieBreak, true);
  const picks = new Set();
  for (let i = 0; i < 20; i++) {
    const s = allAi(`tie-${i}`);
    const owned = map.provinces.filter(p => s.provinces[p.id].ownerId === 'aurel');
    picks.add(navalBase(map, s, owned).id);
  }
  assert.deepEqual([...picks].sort(), ['p17', 'p19']);
  // Toujours stable dans une même partie, et un port déjà construit reste la base.
  const s = allAi('tie-stable'), owned = map.provinces.filter(p => s.provinces[p.id].ownerId === 'aurel');
  const a = navalBase(map, s, owned).id;
  assert.equal(navalBase(map, s, owned).id, a);
  const other = a === 'p17' ? 'p19' : 'p17';
  s.provinces[other].buildings.port = 1;
  assert.equal(navalBase(map, s, owned).id, other);
});

test('V17.9b : Valmorne ne vide plus sa capitale (sans port) au redéploiement de l\'IA', () => {
  assert.ok(R.ai.capitalGuard > 0);
  const s = allAi('guard', 'roc-epine');
  E.advanceDays(s, map, 12);
  const left = combatValue({ units: s.provinces.p01.units }), guard = combatValue({ units: { infantry: R.ai.capitalGuard } });
  assert.ok(left >= guard * .95, `capitale de Valmorne : ${JSON.stringify(s.provinces.p01.units)}`);
  assert.ok(s.marches.some(m => m.nationId === 'valmorne' && m.fromId === 'p01'), 'le reste de l\'armée part quand même vers un port');
});

test('V17.9b : branchements (moteur pur, règles lues dans RULES.realtime)', () => {
  const ai = readSource('src/domain/engine/ai.js'), naval = readSource('src/domain/engine/ai-naval.js'), create = readSource('src/domain/realtime/create.js');
  assert.match(ai, /RULES\.realtime\.ai\.capitalGuard/);
  assert.match(ai, /RULES\.realtime\.ai\.threatExceptTarget/);
  assert.match(naval, /baseTieBreak/);
  assert.match(create, /applyRealtimeStart/);
  assert.equal(R.ai.threatExceptTarget, true);
});
