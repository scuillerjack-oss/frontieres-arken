// V17.9b — Batterie finale : centaines de parties complètes sur le vrai moteur temps réel, avec contrôle des invariants.
//
//   node tools/v17/batterie-v17.9b.mjs [parties=500] [préfixe=v179b] [--courte] [--joueur] [--processus=2] [--cle=nom]
//
// --courte : parties de 7 ans. --joueur : la nation du joueur reste « humaine » (fins réservées au joueur : paix générale,
// défaite) mais elle est jouée par une IA de niveau Normal (son plan est fait les jours où elle déciderait) ; elle accepte
// la paix générale si elle est première du classement, sinon elle refuse.
// Résumé dans tools/v17/resultats-v17.9b.json (clé « --cle » ou « <parties> parties[ courtes][ joueur] »).
//
// Mesures : tout ce que donne partie-jours.mjs (summarize), plus : type de fin, durée des parties finies par conquête,
// îles prises (jour, preneur, ancien maître), éliminations (jour, par qui), victoires par nation et par caractère,
// conquêtes / pertes par nation, débarquements reçus par nation, trahisons et cibles, alliances, exceptions.
// Invariants (chaque jour) : aucune valeur négative ni fractionnaire (troupes, navires, trésor), report d'or dans [0, 60[,
// vivres dans [0, grenier], aucune bataille plus longue que RULES.realtime.battle.maxDays (+ marge), aucune marche ou
// traversée en retard sur son jour d'arrivée, troupes conservées (tout écart expliqué par une livraison, une perte
// déclarée par un combat, une désertion), sauvegarde / reprise identique (2 jours tirés à la graine par partie : la
// partie relue et l'originale jouent 30 jours, les sauvegardes doivent être identiques), Math.random jamais appelé.
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { arkenV9Map as map } from '../../src/map/arken-v9-map.js';
import { RULES } from '../../src/domain/constants.js';
import { advanceDay, aiNationOfDay, answerPeaceOffer, createRealtimeGame, gameDaysOf, peaceOfferPending, realtimeRanking } from '../../src/domain/game-engine.js';
import { archetypeOf } from '../../src/domain/leaders.js';
import { granaryOf } from '../../src/domain/realtime/food.js';
import { decodeRealtimeSave, encodeSave } from '../../src/persistence/save-codec.js';
import { armyGoldByNation } from './partie-jours.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const NATIONS = map.nations.map(n => n.id);
const TYPES = ['infantry', 'cavalry', 'armor', 'artillery'];
const mean = a => a.length ? a.reduce((n, x) => n + x, 0) / a.length : 0;
const median = a => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor((s.length - 1) / 2)] : 0; };
const round = (x, d = 1) => Math.round(x * 10 ** d) / 10 ** d;
const hash = str => { let h = 2166136261; for (const c of String(str)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };

/** Toutes les piles de troupes (où qu'elles soient), pour les invariants. */
function* piles(s) {
  for (const [id, p] of Object.entries(s.provinces)) yield { where: id, nationId: p.ownerId, units: p.units, warships: p.warships };
  for (const e of s.stationed || []) yield { where: 'stationed', nationId: e.nationId, units: e.units, warships: e.warships };
  for (const t of s.transports || []) yield { where: 'convoy', nationId: t.nationId, units: t.units, warships: t.warships };
  for (const m of s.marches || []) yield { where: 'march', nationId: m.nationId, units: m.units, warships: m.warships };
  for (const b of s.battles || []) for (const e of b.attackers || []) yield { where: 'battle', nationId: e.nationId, units: e.units, warships: e.warships };
}
const totalTroops = s => { let n = 0; for (const p of piles(s)) { for (const k of TYPES) n += p.units?.[k] || 0; n += p.warships || 0; } return n; };
const sumLosses = l => Object.values(l || {}).reduce((n, x) => n + Object.values(x || {}).reduce((a, b) => a + (Number(b) || 0), 0), 0);

/** Contrôle des invariants du jour ; renvoie la liste des violations (texte court). */
function checkDay(s, ctx) {
  const bad = [];
  const isNat = x => Number.isInteger(x) && x >= 0;
  for (const p of piles(s)) {
    for (const k of TYPES) if (p.units && p.units[k] !== undefined && !isNat(p.units[k])) bad.push(`troupes ${p.where} ${k}=${p.units[k]}`);
    if (p.warships !== undefined && !isNat(p.warships || 0)) bad.push(`navires ${p.where}=${p.warships}`);
  }
  for (const [id, n] of Object.entries(s.nations)) {
    if (!isNat(n.treasury)) bad.push(`trésor ${id}=${n.treasury}`);
    if (!(n.goldCarry >= 0 && n.goldCarry < RULES.realtime.incomeDays)) bad.push(`report ${id}=${n.goldCarry}`);
    if (!n.eliminated && n.food) {
      const g = granaryOf(s, id);
      if (!(n.food.reserve >= 0) || !Number.isInteger(n.food.reserve)) bad.push(`vivres ${id}=${n.food.reserve}`);
      else if (n.food.reserve > Math.max(g, ctx.lastGranary[id] ?? g)) bad.push(`vivres ${id} ${n.food.reserve} > grenier ${g}`);
      ctx.lastGranary[id] = g;
    }
  }
  const maxB = RULES.realtime.battle.maxDays + RULES.realtime.battle.assaultEveryDays + 1;
  for (const b of s.battles || []) {
    const start = ctx.battleStart.get(b.id) ?? (ctx.battleStart.set(b.id, s.day), s.day);
    if (s.day - start > maxB) bad.push(`bataille ${b.id} en ${b.provinceId} depuis ${s.day - start} j`);
  }
  for (const id of [...ctx.battleStart.keys()]) if (!(s.battles || []).some(b => b.id === id)) ctx.battleStart.delete(id);
  for (const m of s.marches || []) if (Number.isFinite(m.arriveDay) && m.arriveDay < s.day) bad.push(`marche ${m.id} en retard (arrivée ${m.arriveDay}, jour ${s.day})`);
  for (const t of s.transports || []) if (Number.isFinite(t.arriveDay) && t.arriveDay < s.day) bad.push(`convoi ${t.id} en retard (arrivée ${t.arriveDay}, jour ${s.day})`);
  return bad;
}

export function playBattery(seed, { short = false, nation = NATIONS[0], player = false, passive = false, saveChecks = 2, invariants = true } = {}) {
  if (passive) player = true;
  const s = createRealtimeGame({ map, playerNationId: nation, seed, gameLength: short ? 40 : undefined });
  for (const id of NATIONS) s.controllers[id] = player && id === nation ? 'human' : 'ai';
  const days = gameDaysOf(s), quarter = Math.ceil(days / 4);
  const saveDays = Array.from({ length: saveChecks }, (_, i) => 30 + hash(`${seed}-save-${i}`) % (days - 90));
  const ctx = { battleStart: new Map(), lastGranary: {} };
  const g = { seed, player: player ? nation : null, passive, conquestsByQuarter: [0, 0, 0, 0], island: [], eliminations: [], betrayals: [], alliances: 0, landingsBy: {}, landingsOn: {},
    conquestsBy: Object.fromEntries(NATIONS.map(id => [id, 0])), lostBy: Object.fromEntries(NATIONS.map(id => [id, 0])), conqMatrix: {},
    violations: [], violationCount: 0, troopDrift: 0, troopDriftDays: 0, saveChecks: 0, saveMismatch: [], error: null, peaceOffers: 0, peaceRefused: 0,
    battles: 0, assaults: 0, fieldBattles: 0, interceptions: 0, landings: 0, balloonsBuilt: 0, balloonsShot: 0, famine: Object.fromEntries(NATIONS.map(id => [id, { days: 0, longest: 0, run: 0, deserted: 0 }])) };
  const note = v => { g.violationCount++; if (g.violations.length < 20) g.violations.push(`j${s.day} ${v}`); };
  let ledger = totalTroops(s);
  try {
    while (!s.gameOver) {
      const day = s.day, before = Object.fromEntries(Object.entries(s.provinces).map(([id, p]) => [id, p.ownerId])), ev = s.events.length;
      if (player && peaceOfferPending(s)) {
        g.peaceOffers++;
        const first = realtimeRanking(s)[0]?.nationId;
        if (first === nation && !passive) answerPeaceOffer(s, true); else { answerPeaceOffer(s, false); g.peaceRefused++; }
        if (s.gameOver) break;
      }
      if (saveDays.includes(day)) {
        const copy = decodeRealtimeSave(encodeSave(s)).state, twin = structuredClone(s);
        if (!copy) g.saveMismatch.push(`j${day} relecture impossible`);
        else {
          for (let i = 0; i < 30 && !copy.gameOver; i++) advanceDayAs(copy, copy.day, passive);
          for (let i = 0; i < 30 && !twin.gameOver; i++) advanceDayAs(twin, twin.day, passive);
          g.saveChecks++;
          if (encodeSave(copy) !== encodeSave(twin)) g.saveMismatch.push(`j${day}`);
        }
      }
      advanceDayAs(s, day, passive);
      // Comptes de la partie
      for (const [id, p] of Object.entries(s.provinces)) if (p.ownerId !== before[id]) {
        g.conquestsByQuarter[Math.min(3, Math.floor((day - 1) / quarter))]++;
        if (g.conquestsBy[p.ownerId] !== undefined) g.conquestsBy[p.ownerId]++;
        if (g.lostBy[before[id]] !== undefined) g.lostBy[before[id]]++;
        const k = `${p.ownerId}>${before[id] || 'neutre'}`; g.conqMatrix[k] = (g.conqMatrix[k] || 0) + 1;
        if (id === 'p21') g.island.push({ day, by: p.ownerId, from: before[id] || null, byArch: archetypeOf(s, p.ownerId) });
      }
      let explained = 0;
      for (const e of s.events.slice(ev)) {
        if ((e.type === 'battle' || e.type === 'conquest') && e.defender && !g.firstWar) g.firstWar = { day, pair: `${e.attacker}>${e.defender}`, arch: `${archetypeOf(s, e.attacker)}>${archetypeOf(s, e.defender) || 'joueur'}` };
        if (e.type === 'diplomatic-action' && e.action === 'alliance' && e.accepted === true && !g.firstAlliance) g.firstAlliance = [e.nationId, e.target].sort().join('+');
        if (e.type === 'battle' || e.type === 'conquest') { g.battles++; if (e.naval) { g.landings++; g.landingsBy[e.attacker] = (g.landingsBy[e.attacker] || 0) + 1; g.landingsOn[e.defender || 'neutre'] = (g.landingsOn[e.defender || 'neutre'] || 0) + 1; } }
        else if (e.type === 'assault') g.assaults++;
        else if (e.type === 'field-battle') g.fieldBattles++;
        else if (e.type === 'interception') g.interceptions++;
        else if (e.type === 'production-complete' && e.kind === 'balloon') g.balloonsBuilt++;
        else if (e.type === 'balloon-shot') g.balloonsShot++;
        else if (e.type === 'betrayal') g.betrayals.push({ day, by: e.nationId, byArch: archetypeOf(s, e.nationId), target: e.target, targetArch: archetypeOf(s, e.target) });
        else if (e.type === 'diplomatic-action' && e.action === 'alliance' && e.accepted === true) g.alliances++;
        else if (e.type === 'elimination') g.eliminations.push({ day, id: e.nationId, arch: archetypeOf(s, e.nationId) });
        else if (e.type === 'famine-desertion') g.famine[e.nationId].deserted += Object.values(e.deserted || {}).reduce((a, b) => a + b, 0);
        if (e.lossesByNation) explained -= sumLosses(e.lossesByNation);
        if (e.type === 'production-complete' && e.kind === 'unit') explained += e.amount || 0;
        if (e.type === 'retreat-lost' || e.type === 'stationed-lost') explained -= e.amount || 0;
        if (e.type === 'bombardment' && e.harbor) explained -= (e.harbor.attackerLost || 0) + (e.harbor.defenderLost || 0);
        if (e.type === 'famine-desertion') explained -= Object.values(e.deserted || {}).reduce((a, b) => a + b, 0);
      }
      for (const id of NATIONS) { const f = g.famine[id]; if (!s.nations[id].eliminated && s.nations[id].food?.famine) { f.days++; f.run++; f.longest = Math.max(f.longest, f.run); } else f.run = 0; }
      if (invariants) {
        for (const v of checkDay(s, ctx)) note(v);
        ledger += explained;
        if (!(s.battles || []).length) {
          const actual = totalTroops(s);
          if (actual !== ledger) { g.troopDriftDays++; g.troopDrift += actual - ledger; if (g.violations.length < 20) g.violations.push(`j${day} troupes ${actual} au lieu de ${ledger}`); ledger = actual; }
        }
      }
    }
  } catch (err) { g.error = `j${s.day} ${err?.stack?.split('\n').slice(0, 3).join(' | ') || err}`; }
  const gold = armyGoldByNation(s), alive = NATIONS.filter(id => !s.nations[id].eliminated);
  const provincesOf = id => Object.values(s.provinces).filter(p => p.ownerId === id).length;
  Object.assign(g, {
    endDay: s.day, reason: s.gameOver?.reason || 'erreur', winnerId: s.gameOver?.winnerId || null, winnerArch: s.gameOver ? archetypeOf(s, s.gameOver.winnerId) : null,
    leaders: Object.fromEntries(NATIONS.map(id => [id, archetypeOf(s, id)])), conquests: g.conquestsByQuarter.reduce((a, b) => a + b, 0),
    eliminated: NATIONS.length - alive.length, biggestArmyGold: Math.round(Math.max(0, ...alive.map(id => gold[id]))),
    provinces: Object.fromEntries(NATIONS.map(id => [id, provincesOf(id)])),
    playerRank: player ? (s.gameOver?.ranking || []).findIndex(r => r.nationId === nation) + 1 : null
  });
  for (const f of Object.values(g.famine)) delete f.run;
  return g;
}
/** Un jour, la nation du joueur simulé décidant comme une IA Normale les jours où elle déciderait. */
function advanceDayAs(s, day, passive = false) {
  const me = s.playerNationId, human = s.controllers[me] === 'human' && !passive;
  if (human) { s.controllers[me] = 'ai'; if (aiNationOfDay(s, day) !== me) s.controllers[me] = 'human'; }
  try { advanceDay(s, map); } finally { if (human) s.controllers[me] = 'human'; }
}

/** Résumé de la batterie (en plus de summarize de partie-jours.mjs, qui lit les champs communs). */
export function summarizeBattery(games) {
  const ok = games.filter(x => !x.error), n = ok.length || 1;
  const conquestEnds = ok.filter(x => x.reason === 'capitals' || x.reason === 'last-nation');
  const archOf = (x, id) => x.leaders[id];
  const winByArch = {}, heldByArch = {};
  for (const x of ok) { for (const id of NATIONS) heldByArch[archOf(x, id)] = (heldByArch[archOf(x, id)] || 0) + 1; if (x.winnerArch) winByArch[x.winnerArch] = (winByArch[x.winnerArch] || 0) + 1; }
  const isl = ok.flatMap(x => x.island), elim = ok.flatMap(x => x.eliminations), bet = ok.flatMap(x => x.betrayals);
  const count = (a, f) => a.reduce((o, x) => { const k = f(x); o[k] = (o[k] || 0) + 1; return o; }, {});
  const matrix = {};
  for (const x of ok) for (const [k, v] of Object.entries(x.conqMatrix)) matrix[k] = (matrix[k] || 0) + v;
  return {
    parties: games.length, erreurs: games.filter(x => x.error).length, premieresErreurs: games.filter(x => x.error).slice(0, 5).map(x => `${x.seed} : ${x.error}`),
    conquetesParPartie: round(mean(ok.map(x => x.conquests))), conquetesParQuart: [0, 1, 2, 3].map(q => round(mean(ok.map(x => x.conquestsByQuarter[q])))),
    conquetesMinMediane: [Math.min(...ok.map(x => x.conquests)), median(ok.map(x => x.conquests)), Math.max(...ok.map(x => x.conquests))],
    nationsElimineesParPartie: round(mean(ok.map(x => x.eliminated)), 2),
    partiesAvecEliminationAvant2Ans: ok.filter(x => x.eliminations.some(e => e.day <= 730)).length,
    partiesAvecEliminationsEnChaineAvant2Ans: ok.filter(x => x.eliminations.filter(e => e.day <= 730).length >= 2).length,
    eliminationsParNation: count(elim, e => e.id), eliminationsParCaractere: count(elim, e => e.arch), jourEliminationMediane: median(elim.map(e => e.day)),
    plusGrandeArmeeFinaleOr: { mediane: median(ok.map(x => x.biggestArmyGold)), max: Math.max(...ok.map(x => x.biggestArmyGold)) },
    famine: (() => { const f = ok.flatMap(x => Object.values(x.famine)), hit = f.filter(z => z.days > 0); return { taux: round(100 * hit.length / Math.max(1, f.length), 1), nations: `${hit.length} sur ${f.length}`, joursMediane: median(hit.map(z => z.days)), plusLongue: Math.max(0, ...hit.map(z => z.longest)) }; })(),
    ballonsConstruits: round(mean(ok.map(x => x.balloonsBuilt)), 1), ballonsAbattus: round(mean(ok.map(x => x.balloonsShot)), 1),
    ile: { prisesParPartie: round(mean(ok.map(x => x.island.length)), 2), partiesAvecPrise: ok.filter(x => x.island.length).length, premierePriseJourMediane: median(ok.filter(x => x.island.length).map(x => x.island[0].day)),
      preneurs: count(isl, i => i.by), preneursParCaractere: count(isl, i => i.byArch), reprisesAUneNation: isl.filter(i => i.from).length },
    fins: count(ok, x => x.reason), dureeDesConquetesJours: conquestEnds.map(x => x.endDay).sort((a, b) => a - b), conquetesDuMondeAvant5Ans: conquestEnds.filter(x => x.endDay < 1826).length,
    vainqueurParNation: Object.fromEntries(NATIONS.map(id => [id, ok.filter(x => x.winnerId === id).length])),
    vainqueurParNationPct: Object.fromEntries(NATIONS.map(id => [id, round(100 * ok.filter(x => x.winnerId === id).length / n)])),
    vainqueurParCaractere: winByArch, vainqueurParCaracterePct: Object.fromEntries(Object.entries(winByArch).map(([k, v]) => [k, round(100 * v / n)])),
    tauxDeVictoireParCaractereTenu: Object.fromEntries(Object.entries(heldByArch).map(([k, v]) => [k, round(100 * (winByArch[k] || 0) / v)])),
    conquetesParNation: Object.fromEntries(NATIONS.map(id => [id, round(mean(ok.map(x => x.conquestsBy[id])))])),
    pertesParNation: Object.fromEntries(NATIONS.map(id => [id, round(mean(ok.map(x => x.lostBy[id])))])),
    provincesFinalesParNation: Object.fromEntries(NATIONS.map(id => [id, round(mean(ok.map(x => x.provinces[id])))])),
    debarquementsLancesParNation: Object.fromEntries(NATIONS.map(id => [id, round(mean(ok.map(x => x.landingsBy[id] || 0)))])),
    debarquementsRecusParNation: Object.fromEntries(NATIONS.map(id => [id, round(mean(ok.map(x => x.landingsOn[id] || 0)))])),
    matriceDesConquetes: Object.fromEntries(Object.entries(matrix).sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, round(v / n, 2)])),
    batailles: round(mean(ok.map(x => x.battles))), debarquements: round(mean(ok.map(x => x.landings))), assauts: round(mean(ok.map(x => x.assaults))),
    rencontresEnChemin: round(mean(ok.map(x => x.fieldBattles)), 2), interceptions: round(mean(ok.map(x => x.interceptions)), 2),
    trahisonsParPartie: round(mean(ok.map(x => x.betrayals.length)), 2), trahisonsParCaractere: count(bet, b => b.byArch), ciblesDesTrahisons: count(bet, b => b.targetArch),
    alliancesParPartie: round(mean(ok.map(x => x.alliances)), 2),
    victoiresDuJoueur: ok[0]?.player ? ok.filter(x => x.winnerId === x.player).length : null,
    vainqueurIAParCaracterePct: ok[0]?.player ? (() => { const w = ok.filter(x => x.winnerId !== x.player); const c = {}; for (const x of w) c[x.winnerArch] = (c[x.winnerArch] || 0) + 1; return Object.fromEntries(Object.entries(c).map(([k, v]) => [k, round(100 * v / Math.max(1, ok.length))])); })() : null,
    variete: (() => {
      const top = (a) => { const c = count(a.filter(Boolean), x => x); const e = Object.entries(c).sort((x, y) => y[1] - x[1]); return { differents: e.length, plusFrequent: e[0] ? `${e[0][0]} (${round(100 * e[0][1] / n)} %)` : null }; };
      return { premiereGuerre: top(ok.map(x => x.firstWar?.pair)), premiereGuerreJourMediane: median(ok.filter(x => x.firstWar).map(x => x.firstWar.day)), premiereGuerreCaracteres: top(ok.map(x => x.firstWar?.arch)),
        premiereAlliance: top(ok.map(x => x.firstAlliance)), premiereEliminee: top(ok.map(x => x.eliminations[0]?.id)), vainqueur: top(ok.map(x => x.winnerId)),
        cibleDePremiereTrahison: top(ok.map(x => x.betrayals[0] ? `${x.betrayals[0].by}>${x.betrayals[0].target}` : null)),
        conquetesEcartType: round(Math.sqrt(mean(ok.map(x => (x.conquests - mean(ok.map(y => y.conquests))) ** 2))), 1),
        partiesIdentiques: ok.length - new Set(ok.map(x => JSON.stringify([x.winnerId, x.conquests, x.provinces, x.eliminations]))).size };
    })(),
    joueur: ok[0]?.player ? { rangMoyen: round(mean(ok.map(x => x.playerRank)), 2), rangs: count(ok, x => x.playerRank), offresDePaix: ok.reduce((a, x) => a + x.peaceOffers, 0), refus: ok.reduce((a, x) => a + x.peaceRefused, 0) } : null,
    invariants: { violations: ok.reduce((a, x) => a + x.violationCount, 0), partiesTouchees: ok.filter(x => x.violationCount).length, exemples: ok.flatMap(x => x.violations.map(v => `${x.seed} ${v}`)).slice(0, 15),
      joursAvecEcartDeTroupes: ok.reduce((a, x) => a + x.troopDriftDays, 0), ecartDeTroupesTotal: ok.reduce((a, x) => a + x.troopDrift, 0),
      sauvegardesVerifiees: ok.reduce((a, x) => a + x.saveChecks, 0), sauvegardesDifferentes: ok.flatMap(x => x.saveMismatch.map(m => `${x.seed} ${m}`)) }
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  Math.random = () => { throw new Error('Math.random appelé pendant une simulation'); };
  const args = process.argv.slice(2), plain = args.filter(a => !a.startsWith('--')), opt = k => args.find(a => a.startsWith(`--${k}=`))?.split('=')[1];
  const short = args.includes('--courte'), passive = args.includes('--passif'), player = args.includes('--joueur') || passive, noInv = args.includes('--sans-invariants');
  const raw = opt('brut');
  if (raw) {
    const [from, to] = raw.split(':').map(Number), out = [];
    for (let i = from; i < to; i++) out.push(playBattery(`${plain[1] || 'v179b'}-${i}`, { short, player, passive, nation: NATIONS[i % 5], invariants: !noInv, saveChecks: noInv ? 0 : 2 }));
    writeFileSync(opt('sortie'), JSON.stringify(out));
  } else {
    const [parties = 500, prefixe = 'v179b'] = plain, n = Number(parties), w = Number(opt('processus') || 2), t0 = performance.now();
    const step = Math.ceil(n / w);
    const part = (from, to) => new Promise((resolve, reject) => {
      const out = join(tmpdir(), `arken-v179b-${prefixe}-${from}-${to}${short ? '-c' : ''}${player ? '-j' : ''}.json`);
      const p = spawn(process.execPath, ['--max-old-space-size=3000', fileURLToPath(import.meta.url), '0', prefixe, `--brut=${from}:${to}`, `--sortie=${out}`, ...args.filter(a => ['--courte', '--joueur', '--passif', '--sans-invariants'].includes(a))], { stdio: ['ignore', 'inherit', 'inherit'] });
      p.on('close', code => code ? reject(new Error(`parties ${from}-${to} : code ${code}`)) : resolve(JSON.parse(readFileSync(out, 'utf8'))));
    });
    const games = (await Promise.all(Array.from({ length: w }, (_, i) => part(i * step, Math.min(n, (i + 1) * step))).filter((_, i) => i * step < n))).flat();
    const summary = { prefixe, courte: short, joueur: passive ? 'passif' : player, secondes: round((performance.now() - t0) / 1000), ...summarizeBattery(games),
      jourDeFin: { min: Math.min(...games.map(x => x.endDay)), mediane: median(games.map(x => x.endDay)), max: Math.max(...games.map(x => x.endDay)) } };
    const key = opt('cle') || `${n} parties${short ? ' courtes' : ''}${passive ? ' joueur passif' : player ? ' joueur' : ''}`;
    const file = join(HERE, 'resultats-v17.9b.json'), all = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {};
    all[key] = summary;
    writeFileSync(file, JSON.stringify(all, null, 1));
    writeFileSync(join(tmpdir(), `arken-v179b-brut-${key.replace(/\W+/g, '_')}.json`), JSON.stringify(games));
    console.log(JSON.stringify(summary, null, 1));
  }
}
