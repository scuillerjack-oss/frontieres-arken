// V17.0 — Calibrage de la nourriture (fermes, consommation, famine) avec le moteur ACTUEL, sans le modifier.
//
//   node tools/v17/nourriture-v17.mjs [parties=60] [tours=90] [préfixe=v17n] [--sans]   (--sans : partie témoin sans nourriture)
//   FERME=8 node tools/v17/nourriture-v17.mjs …   (variante : vivres par niveau de ferme)
//
// Modèle (celui proposé dans docs/V17-cahier-des-charges.md §4), joué « par-dessus » le moteur : 1 tour du moteur = 60 jours
// d'économie (conversion retenue au §2). Avant chaque inter-tour, chaque nation IA applique la règle de ferme prévue pour
// l'IA V17.5 et PAIE ses fermes avec son vrai trésor (l'IA a donc moins d'or pour recruter : effet réel mesuré). Après
// l'inter-tour, on compte les 60 jours de vivres : production, consommation, réserve, jours de famine et désertion
// (1 % de l'armée par jour de famine, appliqué à toutes les piles). Le malus de dégâts −30 % n'est PAS simulé (le moteur
// tour par tour ne le connaît pas) : la famine mesurée ici est donc un peu moins punitive que la vraie.
import { arkenV9Map as map } from '../../src/map/arken-v9-map.js';
import { createGameState } from '../../src/state/create-game-state.js';
import * as engine from '../../src/domain/game-engine.js';
import { RULES } from '../../src/domain/constants.js';
import { armies, armyGold, UNIT_GOLD } from './mesures-v17.mjs';

// CYCLE = jours de jeu représentés par UN inter-tour du moteur (60 par défaut : 1 tour = 1 tour d'économie).
// CYCLE=30 : modèle du temps réel retenu (§2) joué « au pas de 30 jours » : délais d'un tour = 30 jours (recrutement,
// trajet terrestre, guérison…), revenus réduits à 30/60 = la moitié par inter-tour, seuils de phase de partie (fin de partie de
// l'IA, coalition, estimation des garnisons) étirés à la longueur de la partie. Lancer alors 182 tours (5 478 jours ÷ 30).
const CYCLE = Number(process.env.CYCLE || 60), INCOME_FACTOR = CYCLE / 60;
if (CYCLE !== 60) {
  const stretch = 5478 / CYCLE / 80; // tours de la partie ÷ 80
  RULES.ai.lateTurn = Math.round(RULES.ai.lateTurn * stretch); RULES.ai.builderLateTurn = Math.round(RULES.ai.builderLateTurn * stretch);
  RULES.coalition.minTurn = Math.round(RULES.coalition.minTurn * stretch); RULES.vision.growthPerTurn = RULES.vision.growthPerTurn / stretch;
}

export const FOOD = Object.freeze({
  daysPerTurn: CYCLE,       // jours de vivres comptés par inter-tour du moteur (60 = 1 tour d'économie, §2)
  baseIncome: 8,            // vivres / jour d'une province possédée (sans ferme)
  farmIncome: Number(process.env.FERME || 10), // vivres / jour par niveau de ferme (variante : FERME=8 node …)
  farmMax: 5,               // niveaux de ferme par province
  farmCosts: [20, 25, 30, 35, 40], // or, niveau 1 à 5 (un niveau à la fois, comme la forteresse)
  goldPerRation: 20,        // 1 vivre / jour pour 20 or de valeur d'armée (fantassin 0,05 ; blindé 1,5 ; navire 3,25)
  startReserve: 900,        // ≈ 30 jours de l'armée de départ
  reserveDays: 180,         // grenier : au plus 180 jours de production
  desertPerDay: .01,        // famine : 1 % de l'armée déserte chaque jour
  aiTargetMargin: 1.10,     // IA : production visée ≥ 110 % de la consommation
  aiGoldReserve: 10         // IA : or gardé après avoir payé la ferme
});
const NATIONS = map.nations.map(n => n.id), TYPES = Object.keys(UNIT_GOLD);
const median = a => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor((s.length - 1) / 2)] : 0; };
const pct = (a, p) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(p * (s.length - 1)))] : 0; };
const owned = (s, id) => Object.entries(s.provinces).filter(([pid, p]) => p.ownerId === id && pid !== 'p21');

export const production = (s, farms, id) => owned(s, id).reduce((n, [pid]) => n + FOOD.baseIncome + FOOD.farmIncome * (farms[pid] || 0), 0);
export const consumption = a => armyGold(a) / FOOD.goldPerRation;

function desert(s, id, factor) {
  const cut = o => { for (const k of TYPES.slice(0, 4)) if (o.units?.[k]) o.units[k] = Math.floor(o.units[k] * factor); if (o.warships) o.warships = Math.floor(o.warships * factor); };
  for (const p of Object.values(s.provinces)) if (p.ownerId === id) cut(p);
  for (const e of s.stationed || []) if (e.nationId === id) cut(e);
  for (const t of s.transports || []) if (t.nationId === id) cut(t);
}

export function run(parties, tours, prefixe, withFood = true) {
  const r = { parties, tours, nourriture: withFood, armeeFin: [], fermesFin: [], fermesParProvince: [], orFermesPart: [], joursFamine: [], partiesAvecFamine: 0,
    conquetes: 0, eliminations: 0, reserveJoursFin: [], couvertureFin: [], plusGrandeArmee: [], capitales: 0, quarts: [0, 0, 0, 0], derniere: [] };
  for (let g = 0; g < parties; g++) {
    const s = createGameState({ map, playerNationId: NATIONS[g % 5], seed: `${prefixe}-${g}` });
    for (const id of NATIONS) s.controllers[id] = 'ai';
    const farms = {}, reserve = Object.fromEntries(NATIONS.map(id => [id, FOOD.startReserve])), famine = Object.fromEntries(NATIONS.map(id => [id, 0]));
    const farmGold = Object.fromEntries(NATIONS.map(id => [id, 0])), spentGold = Object.fromEntries(NATIONS.map(id => [id, 0]));
    let pending = [], last = 0;
    for (let i = 0; i < tours && !s.gameOver; i++) {
      const before = Object.fromEntries(Object.entries(s.provinces).map(([pid, p]) => [pid, p.ownerId]));
      const tr0 = Object.fromEntries(NATIONS.map(id => [id, s.nations[id].treasury]));
      if (withFood) {
        const a = armies(s);
        for (const id of NATIONS) {
          if (s.nations[id].eliminated) continue;
          // Règle IA V17.5 : si la production (fermes en chantier comprises) est sous 110 % de la consommation, une ferme
          // de plus dans la province qui en a le moins (égalité : identifiant), si l'or le permet. Une ferme à la fois.
          const queued = pending.filter(q => q.id === id).length;
          if (queued) continue;
          const prod = production(s, farms, id), need = consumption(a[id]) * FOOD.aiTargetMargin;
          if (prod >= need) continue;
          const site = owned(s, id).map(([pid]) => pid).filter(pid => (farms[pid] || 0) < FOOD.farmMax).sort((x, y) => (farms[x] || 0) - (farms[y] || 0) || x.localeCompare(y))[0];
          if (!site) continue;
          const cost = FOOD.farmCosts[farms[site] || 0];
          if (s.nations[id].treasury < cost + FOOD.aiGoldReserve) continue;
          s.nations[id].treasury -= cost; farmGold[id] += cost; spentGold[id] += cost;
          pending.push({ id, pid: site }); // livrée à la fin de cet inter-tour (60 jours ≥ durée de chantier de 60 jours)
        }
      }
      engine.resolveInterturn(s, map);
      // Modèle CYCLE < 60 : le moteur verse un tour entier de revenus ; on retire la part en trop (même formule incomeFor).
      if (INCOME_FACTOR !== 1) for (const id of NATIONS) if (!s.nations[id].eliminated) s.nations[id].treasury -= (1 - INCOME_FACTOR) * engine.incomeFor(s, id);
      if (s.gameOver?.reason === 'turn-limit' && s.turn <= tours) s.gameOver = null;
      for (const id of NATIONS) spentGold[id] += Math.max(0, tr0[id] - s.nations[id].treasury + INCOME_FACTOR * engine.incomeFor(s, id)); // approximation des dépenses du tour
      for (const [pid, p] of Object.entries(s.provinces)) if (p.ownerId !== before[pid]) { r.conquetes++; r.quarts[Math.min(3, Math.floor(4 * i / tours))]++; last = i + 1; }
      if (!withFood) continue;
      for (const q of pending) if (s.provinces[q.pid]?.ownerId === q.id) farms[q.pid] = (farms[q.pid] || 0) + 1; // province perdue : chantier perdu (simplification)
      pending = [];
      const a = armies(s);
      for (const id of NATIONS) {
        if (s.nations[id].eliminated) continue;
        const prod = production(s, farms, id), cons = consumption(a[id]), cap = FOOD.reserveDays * prod;
        let days = 0, res = reserve[id];
        if (prod >= cons) res = Math.min(cap, res + FOOD.daysPerTurn * (prod - cons));
        else { const left = res / (cons - prod); if (left >= FOOD.daysPerTurn) res -= FOOD.daysPerTurn * (cons - prod); else { days = Math.ceil(FOOD.daysPerTurn - left); res = 0; } }
        reserve[id] = res;
        if (days) { famine[id] += days; desert(s, id, Math.pow(1 - FOOD.desertPerDay, days)); }
      }
    }
    const a = armies(s);
    r.derniere.push(last); if (s.gameOver?.reason === 'capitals') r.capitales++;
    r.plusGrandeArmee.push(Math.max(...NATIONS.filter(id => !s.nations[id].eliminated).map(id => Math.round(armyGold(a[id])))));
    for (const id of NATIONS) {
      if (s.nations[id].eliminated) continue;
      r.armeeFin.push(Math.round(armyGold(a[id])));
      const own = owned(s, id).length, f = owned(s, id).reduce((n, [pid]) => n + (farms[pid] || 0), 0);
      r.fermesFin.push(f); r.fermesParProvince.push(own ? +(f / own).toFixed(2) : 0);
      r.orFermesPart.push(spentGold[id] ? Math.round(100 * farmGold[id] / spentGold[id]) : 0);
      r.joursFamine.push(famine[id]);
      const prod = production(s, farms, id), cons = consumption(a[id]);
      r.couvertureFin.push(cons ? Math.round(100 * prod / cons) : 999);
    }
    if (NATIONS.some(id => famine[id] > 0)) r.partiesAvecFamine++;
    r.eliminations += NATIONS.filter(id => s.nations[id].eliminated).length;
  }
  const sum = a => ({ mediane: median(a), p90: pct(a, .9), max: a.length ? Math.max(...a) : 0 });
  return { parties, tours, nourriture: withFood, regles: FOOD, armeeFinOr: sum(r.armeeFin), fermesParNationFin: sum(r.fermesFin),
    fermesParProvinceFin: sum(r.fermesParProvince), partDeLOrDansLesFermesPct: sum(r.orFermesPart), joursDeFamineParNation: sum(r.joursFamine),
    nationsAvecFamine: r.joursFamine.filter(x => x > 0).length, nationsVivantes: r.joursFamine.length, partiesAvecFamine: r.partiesAvecFamine,
    productionSurConsommationFinPct: sum(r.couvertureFin), conquetesParPartie: +(r.conquetes / parties).toFixed(1), conquetesParQuartDePartie: r.quarts.map(x => +(x / parties).toFixed(1)),
    derniereConqueteMediane: median(r.derniere), victoiresParCapitales: r.capitales, plusGrandeArmeeFinOr: sum(r.plusGrandeArmee), cycleJours: CYCLE, eliminationsParPartie: +(r.eliminations / parties).toFixed(2) };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  Math.random = () => { throw new Error('Math.random appelé pendant une simulation'); };
  const args = process.argv.slice(2), pos = args.filter(a => !a.startsWith('--'));
  const [parties = 60, tours = 90, prefixe = 'v17n'] = pos;
  console.log(JSON.stringify(run(Number(parties), Number(tours), prefixe, !args.includes('--sans')), null, 1));
}
