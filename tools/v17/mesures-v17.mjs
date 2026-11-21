// V17.0 — Mesures de calibrage du temps réel, avec le moteur ACTUEL (tour par tour, V16.4.1). Rien n'est modifié dans le jeu.
//
//   node tools/v17/mesures-v17.mjs [parties=40] [tours=80] [préfixe=v17]
//
// Pour chaque partie IA contre IA : armées (toutes les unités d'une nation : provinces, troupes stationnées, convois),
// valeur des armées en or (coût de recrutement), revenus, trésor, aux tours 10, 20, … ; combats (nombre de passes) ;
// temps de calcul de l'IA (planAIOrders sur une copie de l'état) et d'un inter-tour complet ; issue de la partie.
// Au-delà de 80 tours, la fin « dernier tour » du moteur est ignorée (la partie continue) : sert à voir une partie plus longue.
import { performance } from 'node:perf_hooks';
import { arkenV9Map as map } from '../../src/map/arken-v9-map.js';
import { createGameState } from '../../src/state/create-game-state.js';
import { RULES } from '../../src/domain/constants.js';
import * as engine from '../../src/domain/game-engine.js';
import { planAIOrders } from '../../src/domain/engine/ai.js';

const { resolveInterturn, gameRanking, incomeFor } = engine;
const NATIONS = map.nations.map(n => n.id);
const TYPES = ['infantry', 'cavalry', 'armor', 'artillery', 'warship'];
// Valeur en or d'une unité = coût d'un lot ÷ unités par lot (fantassin 1, cavalier 4, blindé 30, canon 25, navire 65).
export const UNIT_GOLD = Object.fromEntries(TYPES.map(k => [k, RULES.units[k].cost / RULES.units[k].amount]));
const median = a => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor((s.length - 1) / 2)] : 0; };
const pct = (a, p) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(p * (s.length - 1)))] : 0; };

/** Toutes les unités de chaque nation (provinces possédées, stationnées chez un allié, en mer). */
export function armies(s) {
  const out = Object.fromEntries(NATIONS.map(id => [id, Object.fromEntries(TYPES.map(k => [k, 0]))]));
  const add = (id, units = {}, ships = 0) => { if (!out[id]) return; for (const k of TYPES.slice(0, 4)) out[id][k] += units[k] || 0; out[id].warship += ships || 0; };
  for (const p of Object.values(s.provinces)) if (p.ownerId) add(p.ownerId, p.units, p.warships);
  for (const e of s.stationed || []) add(e.nationId, e.units, e.warships);
  for (const t of s.transports || []) add(t.nationId, t.units, t.warships);
  return out;
}
export const armyGold = a => TYPES.reduce((n, k) => n + (a[k] || 0) * UNIT_GOLD[k], 0);

export function run(parties, tours, prefixe) {
  const checkpoints = {}, passes = {}, aiMs = [], turnMs = [], outcome = { capitals: 0, eliminatedNations: [], netWinner: 0, lastConquestTurn: [] };
  const conquestsBySlice = new Array(Math.ceil(tours / 20)).fill(0);
  for (let g = 0; g < parties; g++) {
    const s = createGameState({ map, playerNationId: NATIONS[g % 5], seed: `${prefixe}-${g}` });
    for (const id of NATIONS) s.controllers[id] = 'ai';
    let lastConquest = 0;
    for (let i = 0; i < tours && !s.gameOver; i++) {
      const turn = s.turn, before = Object.fromEntries(Object.entries(s.provinces).map(([id, p]) => [id, p.ownerId])), ev0 = s.events.length;
      if (i % 5 === 0) { const copy = structuredClone(s); const t0 = performance.now(); planAIOrders(copy, map); aiMs.push(performance.now() - t0); }
      const t1 = performance.now(); resolveInterturn(s, map); turnMs.push(performance.now() - t1);
      if (s.gameOver?.reason === 'turn-limit' && s.turn <= tours) { s.gameOver = null; }
      for (const [id, p] of Object.entries(s.provinces)) if (p.ownerId !== before[id]) { conquestsBySlice[Math.floor((turn - 1) / 20)]++; lastConquest = turn; }
      for (const e of s.events.slice(ev0)) if (e.type === 'battle' || e.type === 'field-battle') passes[e.passes] = (passes[e.passes] || 0) + 1;
      if (turn % 10 === 0) {
        const a = armies(s), alive = NATIONS.filter(id => !s.nations[id].eliminated);
        const row = checkpoints[turn] ||= { biggestGold: [], meanGold: [], biggestUnits: [], provincesOfBiggest: [], income: [], treasury: [], composition: Object.fromEntries(TYPES.map(k => [k, 0])), samples: 0 };
        const big = alive.sort((x, y) => armyGold(a[y]) - armyGold(a[x]))[0];
        row.biggestGold.push(Math.round(armyGold(a[big])));
        row.meanGold.push(Math.round(alive.reduce((n, id) => n + armyGold(a[id]), 0) / alive.length));
        row.biggestUnits.push({ ...a[big] });
        row.provincesOfBiggest.push(Object.values(s.provinces).filter(p => p.ownerId === big).length);
        for (const id of alive) { row.income.push(incomeFor(s, id)); row.treasury.push(Math.floor(s.nations[id].treasury)); for (const k of TYPES) row.composition[k] += a[id][k]; row.samples++; }
      }
    }
    const rank = gameRanking(s);
    if (s.gameOver?.reason === 'capitals') outcome.capitals++;
    if (rank[0].provinces > (rank[1]?.provinces || 0)) outcome.netWinner++;
    outcome.eliminatedNations.push(NATIONS.filter(id => s.nations[id].eliminated).length);
    outcome.lastConquestTurn.push(lastConquest);
  }
  const cp = Object.fromEntries(Object.entries(checkpoints).map(([t, r]) => [t, {
    plusGrandeArmeeOr: { mediane: median(r.biggestGold), p90: pct(r.biggestGold, .9), max: Math.max(...r.biggestGold) },
    armeeMoyenneOr: median(r.meanGold),
    provincesDuPlusGrand: median(r.provincesOfBiggest),
    revenuParTourMediane: median(r.income), revenuParTourP90: pct(r.income, .9), tresorMediane: median(r.treasury),
    compositionMoyenneParNation: Object.fromEntries(TYPES.map(k => [k, Math.round(r.composition[k] / r.samples)])),
    exemplePlusGrandeArmee: r.biggestUnits[Math.floor(r.biggestUnits.length / 2)]
  }]));
  return { parties, tours, prefixe, valeurUnitaireOr: UNIT_GOLD, points: cp, passesParCombat: passes,
    iaMsParAppel: { mediane: +median(aiMs).toFixed(1), p90: +pct(aiMs, .9).toFixed(1), max: +Math.max(...aiMs).toFixed(1) },
    interTourMs: { mediane: +median(turnMs).toFixed(1), p90: +pct(turnMs, .9).toFixed(1) },
    conquetesParTranche20: conquestsBySlice, victoiresParCapitales: outcome.capitals, partiesAvecVainqueurNet: outcome.netWinner,
    nationsElimineesMediane: median(outcome.eliminatedNations), partiesAvecElimination: outcome.eliminatedNations.filter(x => x > 0).length,
    derniereConqueteMediane: median(outcome.lastConquestTurn) };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  Math.random = () => { throw new Error('Math.random appelé pendant une simulation'); };
  const [parties = 40, tours = 80, prefixe = 'v17'] = process.argv.slice(2);
  console.log(JSON.stringify(run(Number(parties), Number(tours), prefixe), null, 1));
}
