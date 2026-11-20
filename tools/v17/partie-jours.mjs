// V17.1 — Parties IA complètes JOUR PAR JOUR sur le vrai moteur temps réel (src/domain/realtime/), sans navigateur.
// Refait les mesures du cahier V17 (§13.3 : modèle au pas de 30 jours) pour comparer.
//
//   node tools/v17/partie-jours.mjs [parties=20] [préfixe=v17j] [--courte] [--json]
//
// Pour chaque partie (5 IA, graine fixe) : conquêtes (total et par quart de partie), nations éliminées, plus grande armée
// finale en or (provinces, troupes stationnées, convois ET armées en marche), victoires par les capitales, combats,
// rencontres en chemin, interceptions, rappels, temps de calcul d'un jour (médiane, p99, max) et d'une décision d'IA.
// V17.4 : nourriture (§4.6) — niveaux de ferme par nation et par province en fin de partie, part de l'or des chantiers et
// recrutements dépensé en fermes, nations ayant connu la famine, jours de famine, déserteurs.
// V17.5 : ballons construits / abattus, prises de l'île mystérieuse, retraites volontaires de l'IA, rappels, renforts
// envoyés à une province menacée, recrues d'urgence, délai des réponses de l'IA (jours), attaques terrestres par 30 jours.
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
  for (const b of s.battles || []) for (const e of b.attackers || []) add(e.nationId, e.units, e.warships); // V17.2 : à l'assaut
  return out;
}

export function playGame(seed, { short = false, nation = NATIONS[0] } = {}) {
  const s = createRealtimeGame({ map, playerNationId: nation, seed, gameLength: short ? 40 : undefined });
  for (const id of NATIONS) s.controllers[id] = 'ai';
  const days = gameDaysOf(s), quarter = Math.ceil(days / 4);
  const seen = new Set(), spent = Object.fromEntries(NATIONS.map(id => [id, { all: 0, farm: 0 }])), famine = Object.fromEntries(NATIONS.map(id => [id, { days: 0, longest: 0, run: 0, deserted: 0 }]));
  const r = { conquestsByQuarter: [0, 0, 0, 0], battles: 0, assaults: 0, reinforced: 0, retreats: 0, bombardTicks: 0, assaultsByBattle: [0, 0, 0], fieldBattles: 0, interceptions: 0, landings: 0, marches: 0, convoys: 0, dayMs: [], aiMs: [],
    balloonsBuilt: 0, balloonsShot: 0, islandTaken: 0, voluntaryRetreats: 0, recalls: 0, answerDelays: [], maxAttacksPer30: 0 };
  const attackDays = Object.fromEntries(NATIONS.map(id => [id, []])), awaiting = new Map();
  while (!s.gameOver) {
    const day = s.day, before = Object.fromEntries(Object.entries(s.provinces).map(([id, p]) => [id, p.ownerId])), ev = s.events.length;
    const decider = aiNationOfDay(s, day);
    const t0 = performance.now();
    advanceDay(s, map);
    const ms = performance.now() - t0;
    for (const o of s.orders || []) if (o.status === 'awaiting' && !awaiting.has(o.id)) awaiting.set(o.id, o.askedDay);
    for (const [id, asked] of [...awaiting]) if (!(s.orders || []).some(o => o.id === id && o.status === 'awaiting')) { r.answerDelays.push(day - asked); awaiting.delete(id); }
    if (before.p21 !== s.provinces.p21?.ownerId && s.provinces.p21?.ownerId) r.islandTaken++;
    r.dayMs.push(ms); if (decider) r.aiMs.push(ms);
    for (const [id, p] of Object.entries(s.provinces)) if (p.ownerId !== before[id]) r.conquestsByQuarter[Math.min(3, Math.floor((day - 1) / quarter))]++;
    for (const e of s.events.slice(ev)) {
      if (e.type === 'battle' || e.type === 'conquest') { r.battles++; if (e.naval) r.landings++; }
      else if (e.type === 'field-battle') r.fieldBattles++;
      else if (e.type === 'assault') { r.assaults++; if (e.over) r.assaultsByBattle[Math.min(2, e.assault - 1)]++; }
      else if (e.type === 'battle-reinforced') r.reinforced++;
      else if (e.type === 'battle-retreat') { r.retreats++; if (e.reason === 'retreat') r.voluntaryRetreats++; }
      else if (e.type === 'bombardment') r.bombardTicks++;
      else if (e.type === 'interception') r.interceptions++;
      else if (e.type === 'march-departed') { r.marches++; if (e.hostile && s.controllers[e.nationId] === 'ai') { const a = attackDays[e.nationId]; a.push(day); r.maxAttacksPer30 = Math.max(r.maxAttacksPer30, a.filter(d => day - d < 30).length); } }
      else if (e.type === 'production-complete' && e.kind === 'balloon') r.balloonsBuilt++;
      else if (e.type === 'balloon-shot') r.balloonsShot++;
      else if (e.type === 'march-recalled') r.recalls++;
      else if (e.type === 'convoy-departed' && !e.returning) r.convoys++;
      else if (e.type === 'famine-desertion') famine[e.nationId].deserted += Object.values(e.deserted).reduce((a, b) => a + b, 0);
    }
    for (const q of s.productionQueue) if (!seen.has(q)) { seen.add(q); if (spent[q.nationId]) { spent[q.nationId].all += q.cost || 0; if (q.type === 'farm') spent[q.nationId].farm += q.cost || 0; } }
    for (const id of NATIONS) { const f = famine[id]; if (!s.nations[id].eliminated && s.nations[id].food?.famine) { f.days++; f.run++; f.longest = Math.max(f.longest, f.run); } else f.run = 0; }
  }
  const gold = armyGoldByNation(s);
  const alive = NATIONS.filter(id => !s.nations[id].eliminated);
  const farmsOf = id => Object.values(s.provinces).filter(p => p.ownerId === id).reduce((n, p) => n + (p.buildings.farm || 0), 0);
  const provincesOf = id => Object.values(s.provinces).filter(p => p.ownerId === id).length;
  const food = alive.map(id => ({ farms: farmsOf(id), perProvince: farmsOf(id) / Math.max(1, provincesOf(id)), goldShare: spent[id].all ? spent[id].farm / spent[id].all : 0 }))
    .concat(NATIONS.filter(id => s.nations[id].eliminated).map(() => null));
  return { seed, endDay: s.day, reason: s.gameOver.reason, conquests: r.conquestsByQuarter.reduce((a, b) => a + b, 0), ...r,
    eliminated: NATIONS.filter(id => s.nations[id].eliminated).length, biggestArmyGold: Math.round(Math.max(...NATIONS.filter(id => !s.nations[id].eliminated).map(id => gold[id]))),
    reinforcements: s.ai?.rtStats?.reinforcements || 0, emergencyRecruits: s.ai?.rtStats?.emergencyRecruits || 0,
    treasury: NATIONS.map(id => s.nations[id].treasury), food: food.filter(Boolean), famine: NATIONS.map(id => famine[id]) };
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
    // V17.2 : assauts, renforts pendant une bataille, replis, batailles terminées au 1er / 2e / 3e assaut, tirs de bombardement.
    assautsParPartie: round(mean(all('assaults'))), renfortsEnBatailleParPartie: round(mean(all('reinforced')), 2), replisParPartie: round(mean(all('retreats')), 1),
    batailleFinieAuAssaut: [0, 1, 2].map(i => round(mean(games.map(x => x.assaultsByBattle[i])), 1)), bombardementsParPartie: round(mean(all('bombardTicks')), 2),
    interceptionsParPartie: round(mean(all('interceptions')), 2), marchesParPartie: round(mean(all('marches'))), convoisParPartie: round(mean(all('convoys'))),
    msParJour: { mediane: round(median(dayMs), 2), p99: round(pct(dayMs, .99), 2), max: round(dayMs.reduce((a, b) => Math.max(a, b), 0), 1) },
    msJourAvecDecisionIA: { mediane: round(median(aiMs), 2), p90: round(pct(aiMs, .9), 2), max: round(aiMs.reduce((a, b) => Math.max(a, b), 0), 1) },
    nourriture: (() => { const f = games.flatMap(x => x.food), fam = games.flatMap(x => x.famine), hit = fam.filter(x => x.days > 0);
      const q = (a, k) => ({ mediane: round(median(a.map(x => x[k])), 2), p90: round(pct(a.map(x => x[k]), .9), 2), max: round(Math.max(...a.map(x => x[k])), 2) });
      return { fermesParNation: q(f, 'farms'), fermesParProvince: q(f, 'perProvince'), partOrFermes: { mediane: round(100 * median(f.map(x => x.goldShare))), p90: round(100 * pct(f.map(x => x.goldShare), .9)) },
        nationsAvecFamine: `${hit.length} sur ${fam.length}`, tauxFamine: round(100 * hit.length / Math.max(1, fam.length), 1), joursDeFamine: hit.length ? q(hit, 'days') : null,
        plusLongueFamine: hit.length ? Math.max(...hit.map(x => x.longest)) : 0, deserteursParNationAffamee: hit.length ? round(mean(hit.map(x => x.deserted))) : 0 }; })(),
    // V17.5
    ballonsConstruitsParPartie: round(mean(all('balloonsBuilt')), 2), ballonsAbattusParPartie: round(mean(all('balloonsShot')), 2),
    prisesDeLIleParPartie: round(mean(all('islandTaken')), 2), partiesAvecIlePrise: games.filter(x => x.islandTaken > 0).length,
    retraitesVolontairesParPartie: round(mean(all('voluntaryRetreats')), 2), rappelsParPartie: round(mean(all('recalls')), 2),
    renfortsDefensifsParPartie: round(mean(all('reinforcements')), 2), recruesDUrgenceParPartie: round(mean(all('emergencyRecruits')), 2),
    delaiReponsesIAJours: (() => { const d = games.flatMap(x => x.answerDelays); return d.length ? { min: Math.min(...d), mediane: median(d), max: Math.max(...d), nombre: d.length } : null; })(),
    plusDAttaquesTerrestresEn30Jours: Math.max(...all('maxAttacksPer30')),
    fins: Object.fromEntries([...new Set(all('reason'))].map(k => [k, games.filter(x => x.reason === k).length]))
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  Math.random = () => { throw new Error('Math.random appelé pendant une simulation'); };
  const args = process.argv.slice(2), plain = args.filter(a => !a.startsWith('--'));
  const [parties = 20, prefixe = 'v17j'] = plain;
  console.log(JSON.stringify(run(Number(parties), prefixe, { short: args.includes('--courte') }), null, 1));
}
