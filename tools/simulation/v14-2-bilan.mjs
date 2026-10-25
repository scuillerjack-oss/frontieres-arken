// V14.2 — bilan de parties IA contre IA (graines fixes) : sert à comparer avant / après un réglage.
// Usage : node tools/simulation/v14-2-bilan.mjs [nombreDeParties=30] [tours=80] [préfixeDeGraine=v142]
import { arkenV9Map as map } from '../../src/map/arken-v9-map.js';
import { createGameState } from '../../src/state/create-game-state.js';
import { resolveInterturn, gameRanking } from '../../src/domain/game-engine.js';
import { getTension, atWar } from '../../src/domain/leaders.js';

import { RULES } from '../../src/domain/constants.js';
const [games = 30, turns = 80, prefix = 'v142', landing] = process.argv.slice(2);
// 4e argument facultatif : malus de débarquement à essayer (ex. 0.85) — RULES.combat n'est pas gelé.
if (landing) RULES.combat.landingPenalty = Number(landing);
const NATIONS = map.nations.map(n => n.id);
const by = () => ({ heros: 0, conquerant: 0, traitre: 0, batisseur: 0 });
const m = { landings: 0, landingWins: 0, landAttacks: 0, attacksBy: by(), warsOpenedBy: by(), betrayalsBy: by(), betrayalVictims: {}, autoHostility: 0,
  hostilityWarnings: 0, highTensionNoWar: 0, provincesBy: by(), firstBy: by(), gamesBy: by(), eliminatedBy: by() };
for (let g = 0; g < Number(games); g++) {
  const s = createGameState({ map, playerNationId: NATIONS[g % 5], seed: `${prefix}-${g}` });
  for (const id of NATIONS) s.controllers[id] = 'ai';
  for (let i = 0; i < Number(turns) && !s.gameOver; i++) {
    resolveInterturn(s, map);
    for (const a of NATIONS) for (const b of NATIONS) if (a < b && !s.nations[a].eliminated && !s.nations[b].eliminated && getTension(s, a, b) >= 85 && !atWar(s, a, b)) m.highTensionNoWar++;
  }
  const arch = id => s.leaders?.[id]?.archetype || 'batisseur';
  for (const e of s.events) {
    if ((e.type === 'battle' || e.type === 'conquest') && e.naval) { m.landings++; if (e.type === 'conquest') m.landingWins++; }
    if ((e.type === 'battle' || e.type === 'conquest') && !e.naval) m.landAttacks++;
    if (e.type === 'battle' || e.type === 'conquest') for (const a of new Set(e.attackers || [e.attacker])) m.attacksBy[arch(a)]++;
    if (e.type === 'diplomacy' && e.relation === 'war') m.warsOpenedBy[arch(e.nationId)]++;
    if (e.type === 'diplomatic-action' && e.action === 'war') m.warsOpenedBy[arch(e.nationId)]++;
    if (e.type === 'betrayal') { m.betrayalsBy[arch(e.nationId)]++; if (arch(e.nationId) === 'traitre') (m.betrayalVictims[`${g}`] ||= new Set()).add(e.target); }
    if (e.type === 'hostility-war') m.autoHostility++;
    if (e.type === 'hostility-warning') m.hostilityWarnings++;
  }
  const rank = gameRanking(s);
  m.firstBy[arch(rank[0].nationId)]++;
  for (const id of NATIONS) { m.gamesBy[arch(id)]++; m.provincesBy[arch(id)] += Object.values(s.provinces).filter(p => p.ownerId === id).length; if (s.nations[id].eliminated) m.eliminatedBy[arch(id)]++; }
}
const avg = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, +(v / Math.max(1, m.gamesBy[k])).toFixed(2)]));
console.log(JSON.stringify({
  parties: Number(games), tours: Number(turns), malusDebarquement: RULES.combat.landingPenalty,
  debarquements: m.landings, debarquementsReussis: `${Math.round(100 * m.landingWins / Math.max(1, m.landings))} %`, attaquesTerrestres: m.landAttacks,
  assautsParPartieEtNation: avg(m.attacksBy), guerresOuvertesParPartieEtNation: avg(m.warsOpenedBy), trahisonsParPartieEtNation: avg(m.betrayalsBy),
  traitreVictimesDifferentesMax: Math.max(0, ...Object.values(m.betrayalVictims).map(x => x.size)),
  guerresParHostilite: m.autoHostility, avertissementsHostilite: m.hostilityWarnings, toursPaire85SansGuerre: m.highTensionNoWar,
  provincesFinalesMoyennes: avg(m.provincesBy), premiers: m.firstBy, eliminations: m.eliminatedBy
}, null, 1));
