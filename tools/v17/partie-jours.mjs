// V17.1 — Parties IA complètes JOUR PAR JOUR sur le vrai moteur temps réel (src/domain/realtime/), sans navigateur.
// Refait les mesures du cahier V17 (§13.3 : modèle au pas de 30 jours) pour comparer.
//
//   node tools/v17/partie-jours.mjs [parties=20] [préfixe=v17j] [--courte] [--json]
//
// Pour chaque partie (5 IA, graine fixe) : conquêtes (total et par quart de partie), nations éliminées, plus grande armée
// finale en or (provinces, troupes stationnées, convois ET armées en marche), victoires par les capitales, combats,
// rencontres en chemin, interceptions, rappels, temps de calcul d'un jour (médiane, p99, max) et d'une décision d'IA.
// Math.random est interdit pendant la simulation (le moteur doit être déterministe).
import { performance } from 'node:perf_hooks';
import { arkenV9Map as map } from '../../src/map/arken-v9-map.js';
import { RULES } from '../../src/domain/constants.js';
import { advanceDay, aiNationOfDay, createRealtimeGame, gameDaysOf } from '../../src/domain/game-engine.js';

const NATIONS = map.nations.map(n => n.id);
const TYPES = ['infantry', 'cavalry', 'armor', 'artillery', 'warship'];
const UNIT_GOLD = Object.fromEntries(TYPES.map(k => [k, RULES.units[k].cost / RULES.units[k].amount]));
const median = a => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor((s.length - 1) / 2)] : 0; };
const pct = (a, p) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(p * (s.length - 1)))] : 0; };
const mean = a => a.length ? a.reduce((n, x) => n + x, 0) / a.length : 0;
const round = (x, d = 1) => Math.round(x * 10 ** d) / 10 ** d;

/** Valeur en or des troupes de chaque nation, où qu'elles soient (y compris en marche). */
export function armyGoldByNation(s) {
  const out = Object.fromEntries(NATIONS.map(id => [id, 0]));
  const add = (id, units = {}, ships = 0) => { if (out[id] === undefined) return; for (const k of TYPES.slice(0, 4)) out[id] += (units[k] || 0) * UNIT_GOLD[k]; out[id] += (ships || 0) * UNIT_GOLD.warship; };
  for (const p of Object.values(s.provinces)) if (p.ownerId) add(p.ownerId, p.units, p.warships);
  for (const e of s.stationed || []) add(e.nationId, e.units, e.warships);
  for (const t of s.transports || []) add(t.nationId, t.units, t.warships);
  for (const m of s.marches || []) add(m.nationId, m.units, m.warships);
  return out;
}

export function playGame(seed, { short = false, nation = NATIONS[0] } = {}) {
  const s = createRealtimeGame({ map, playerNationId: nation, seed, gameLength: short ? 40 : undefined });
  for (const id of NATIONS) s.controllers[id] = 'ai';
  const days = gameDaysOf(s), quarter = Math.ceil(days / 4);
  const r = { conquestsByQuarter: [0, 0, 0, 0], battles: 0, fieldBattles: 0, interceptions: 0, landings: 0, marches: 0, convoys: 0, dayMs: [], aiMs: [] };
  while (!s.gameOver) {
    const day = s.day, before = Object.fromEntries(Object.entries(s.provinces).map(([id, p]) => [id, p.ownerId])), ev = s.events.length;
    const decider = aiNationOfDay(s, day);
    const t0 = performance.now();
    advanceDay(s, map);
    const ms = performance.now() - t0;
    r.dayMs.push(ms); if (decider) r.aiMs.push(ms);
    for (const [id, p] of Object.entries(s.provinces)) if (p.ownerId !== before[id]) r.conquestsByQuarter[Math.min(3, Math.floor((day - 1) / quarter))]++;
    for (const e of s.events.slice(ev)) {
      if (e.type === 'battle' || e.type === 'conquest') { r.battles++; if (e.naval) r.landings++; }
      else if (e.type === 'field-battle') r.fieldBattles++;
      else if (e.type === 'interception') r.interceptions++;
      else if (e.type === 'march-departed') r.marches++;
      else if (e.type === 'convoy-departed' && !e.returning) r.convoys++;
    }
  }
  const gold = armyGoldByNation(s);
  return { seed, endDay: s.day, reason: s.gameOver.reason, conquests: r.conquestsByQuarter.reduce((a, b) => a + b, 0), ...r,
    eliminated: NATIONS.filter(id => s.nations[id].eliminated).length, biggestArmyGold: Math.round(Math.max(...NATIONS.filter(id => !s.nations[id].eliminated).map(id => gold[id]))),
    treasury: NATIONS.map(id => s.nations[id].treasury) };
}

export function run(parties, prefixe, { short = false } = {}) {
  const games = [];
  const t0 = performance.now();
  for (let g = 0; g < parties; g++) games.push(playGame(`${prefixe}-${g}`, { short, nation: NATIONS[g % 5] }));
  const all = k => games.map(x => x[k]), dayMs = games.flatMap(x => x.dayMs), aiMs = games.flatMap(x => x.aiMs);
  return {
    parties, prefixe, courte: short, jours: games[0]?.endDay, dureeTotaleS: round((performance.now() - t0) / 1000),
    conquetesParPartie: round(mean(all('conquests'))),
    conquetesParQuart: [0, 1, 2, 3].map(q => round(mean(games.map(x => x.conquestsByQuarter[q])))),
    nationsElimineesParPartie: round(mean(all('eliminated')), 2),
    plusGrandeArmeeFinaleOr: { mediane: median(all('biggestArmyGold')), p90: pct(all('biggestArmyGold'), .9), max: Math.max(...all('biggestArmyGold')) },
    victoiresParCapitales: games.filter(x => x.reason === 'capitals').length,
    combatsParPartie: round(mean(all('battles'))), debarquementsParPartie: round(mean(all('landings'))), rencontresEnCheminParPartie: round(mean(all('fieldBattles')), 2),
    interceptionsParPartie: round(mean(all('interceptions')), 2), marchesParPartie: round(mean(all('marches'))), convoisParPartie: round(mean(all('convoys'))),
    msParJour: { mediane: round(median(dayMs), 2), p99: round(pct(dayMs, .99), 2), max: round(dayMs.reduce((a, b) => Math.max(a, b), 0), 1) },
    msJourAvecDecisionIA: { mediane: round(median(aiMs), 2), p90: round(pct(aiMs, .9), 2), max: round(aiMs.reduce((a, b) => Math.max(a, b), 0), 1) },
    fins: Object.fromEntries([...new Set(all('reason'))].map(k => [k, games.filter(x => x.reason === k).length]))
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  Math.random = () => { throw new Error('Math.random appelé pendant une simulation'); };
  const args = process.argv.slice(2), plain = args.filter(a => !a.startsWith('--'));
  const [parties = 20, prefixe = 'v17j'] = plain;
  console.log(JSON.stringify(run(Number(parties), prefixe, { short: args.includes('--courte') }), null, 1));
}
