// V16 — Campagne de tests longue : N parties complètes sans écran, invariants vérifiés à chaque tour.
//
//   npm run campagne                     300 parties (préfixe « long »)
//   node scripts/campagne.js 100 essai   100 parties, graines campagne-essai-0 … 99
//   node scripts/campagne.js 20 c --json=resultats.json   écrit aussi le détail de chaque partie
//
// Sortie : statistiques (taux de victoire par nation, difficulté, stratégie ; durée ; causes de fin) et la liste des
// invariants violés, avec la graine pour rejouer la partie. Code de sortie 1 si un invariant est violé.
import { writeFileSync } from 'node:fs';
import { campaignPlan, playGame, summarize, economyChecks } from './campagne-lib.js';
import { createProfile } from '../src/domain/profile.js';

const args = process.argv.slice(2), option = n => args.find(a => a.startsWith(`--${n}=`))?.split('=')[1];
const [count = 300, prefix = 'long'] = args.filter(a => !a.startsWith('--'));
const plans = campaignPlan(Number(count), prefix), profile = createProfile(), results = [];
const t0 = Date.now();
for (const plan of plans) {
  const r = playGame(plan, { profile });
  results.push(r);
  if (r.violations.length) console.error(`${r.newViolations.length ? '!' : '~'} ${plan.seed} (${plan.nation}, ${plan.length} tours, ${plan.difficulty}, ${plan.strategy}) : ${r.violations.slice(0, 3).map(v => `[t${v.turn}]${v.known ? ` (bug connu n° ${v.known})` : ''} ${v.inv} : ${v.msg}`).join(' | ')}`);
  if ((plan.index + 1) % 25 === 0) console.error(`… ${plan.index + 1}/${plans.length} parties (${Math.round((Date.now() - t0) / 1000)} s)`);
}
const eco = await economyChecks();
const summary = summarize(results);
summary.economie = eco.length ? eco : 'aucune violation';
summary.palmaresProfil = { parties: profile.palmares.games, victoires: profile.palmares.wins, titres: profile.palmares.titles };
summary.dureeTotaleS = Math.round((Date.now() - t0) / 1000);
console.log(JSON.stringify(summary, null, 1));
if (option('json')) writeFileSync(option('json'), JSON.stringify(results.map(({ state, ...x }) => x), null, 1));
process.exit(summary.partiesAvecViolationNouvelle || eco.length ? 1 : 0);
