// V17.0 — Essai de la formule de classement à points (docs/V17-cahier-des-charges.md §9) sur des fins de parties IA du moteur actuel.
//   node tools/v17/classement-v17.mjs [parties=100] [tours=90] [préfixe=v17c]
// Compare le premier du classement à points avec le premier du classement actuel (provinces, capitales, trésor) et donne
// l'ordre de grandeur des points. La famine n'existe pas dans le moteur actuel : bonus « jours sans famine » plein pour tous.
import { arkenV9Map as map } from '../../src/map/arken-v9-map.js';
import { createGameState } from '../../src/state/create-game-state.js';
import * as engine from '../../src/domain/game-engine.js';
import { armies, armyGold } from './mesures-v17.mjs';

export const SCORE = Object.freeze({ province: 100, capital: 150, armyGoldPerPoint: 20, treasuryGoldPerPoint: 20, daysWithoutFaminePerPoint: 50 });
const NATIONS = map.nations.map(n => n.id);
const median = a => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor((s.length - 1) / 2)] : 0; };

/** Points d'une nation (formule du §9). `days` = jours écoulés, `famineDays` = jours de famine de la nation. */
export function scoreOf(s, id, { days, famineDays = 0, army }) {
  if (s.nations[id].eliminated) return { total: 0 };
  const caps = new Set(Object.values(s.nations).map(n => n.capitalId));
  const provinces = Object.values(s.provinces).filter(p => p.ownerId === id).length;
  const capitals = Object.entries(s.provinces).filter(([pid, p]) => p.ownerId === id && caps.has(pid)).length;
  const parts = { provinces: provinces * SCORE.province, capitals: capitals * SCORE.capital, army: Math.floor(armyGold(army) / SCORE.armyGoldPerPoint),
    treasury: Math.floor(Math.max(0, s.nations[id].treasury) / SCORE.treasuryGoldPerPoint), food: Math.floor(Math.max(0, days - famineDays) / SCORE.daysWithoutFaminePerPoint) };
  return { ...parts, total: Object.values(parts).reduce((a, b) => a + b, 0) };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  Math.random = () => { throw new Error('Math.random appelé pendant une simulation'); };
  const [parties = 100, tours = 90, prefixe = 'v17c'] = process.argv.slice(2).map((x, i) => i < 2 ? Number(x) : x);
  let same = 0, net = 0, sameWhenNet = 0; const top = [], second = [], parts = { provinces: [], capitals: [], army: [], treasury: [], food: [] };
  for (let g = 0; g < parties; g++) {
    const s = createGameState({ map, playerNationId: NATIONS[g % 5], seed: `${prefixe}-${g}` });
    for (const id of NATIONS) s.controllers[id] = 'ai';
    for (let i = 0; i < tours && !s.gameOver; i++) { engine.resolveInterturn(s, map); if (s.gameOver?.reason === 'turn-limit' && s.turn <= tours) s.gameOver = null; }
    const a = armies(s), days = tours * 60;
    const scored = NATIONS.map(id => ({ id, ...scoreOf(s, id, { days, army: a[id] }) })).sort((x, y) => y.total - x.total || x.id.localeCompare(y.id));
    const old = engine.gameRanking(s);
    if (scored[0].id === old[0].nationId) same++;
    if (old[0].provinces > old[1].provinces) { net++; if (scored[0].id === old[0].nationId) sameWhenNet++; }
    top.push(scored[0].total); second.push(scored[1].total);
    for (const k of Object.keys(parts)) parts[k].push(scored[0][k]);
  }
  console.log(JSON.stringify({ parties, tours, regles: SCORE, memePremierQueLeClassementActuel: same, partiesAvecVainqueurNet: net, memePremierQuandVainqueurNet: sameWhenNet,
    pointsDuPremierMediane: median(top), pointsDuSecondMediane: median(second), detailDuPremierMediane: Object.fromEntries(Object.entries(parts).map(([k, v]) => [k, median(v)])) }, null, 1));
}
