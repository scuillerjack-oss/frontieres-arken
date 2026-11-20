// V17.5b — Essais de réglages de RULES.realtime (durées de trajet, forteresse, recrutements) sur des parties IA complètes.
// RULES.realtime est figé (rules.js) : pour chaque essai, on copie src/ et partie-jours.mjs dans un dossier temporaire, on
// y fusionne les valeurs de l'essai dans rules.js, puis on joue les parties (2 essais à la fois). Le dépôt n'est pas touché.
//
//   node tools/v17/essais-v17.5b.mjs [parties=100] [préfixe=v175b] [essai1,essai2,…] [--courte]
//
// Résultats : tools/v17/resultats-v17.5b-essais.json (un résumé par essai, même format que partie-jours.mjs).
import { spawn } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const slower = { buildings: { fort: 90 }, units: { armor: 80, artillery: 80, warship: 120 } }; // forteresse +50 %, blindés / artillerie / navires +33 %
const trip = (land, cav, perSea) => ({ land, cavalryLand: cav, landPerSeaTurn: perSea, interceptDaysLeft: perSea });
const rythme15 = { recruit: 30, ship: 30, landing: 15, attack: 15 };
const combo = { traitre: { restPeriods: [12, 30] }, batisseur: { allyChance: .2 } };
const dist = { landDistance: { reference: 245, min: .75, max: 1.5 } }; // « plus c'est loin, plus c'est long » (distance des repères)
export const ESSAIS = {
  'base-30j': {},
  'voisin-20j': { durations: trip(20, 13, 20) },
  'voisin-15j': { durations: trip(15, 10, 15) },
  'voisin-20j-lent': { durations: { ...trip(20, 13, 20), ...slower } },
  'voisin-15j-lent': { durations: { ...trip(15, 10, 15), ...slower } },
  'voisin-20j-lent-distance': { durations: { ...trip(20, 13, 20), ...slower, ...dist } },
  'voisin-15j-lent-distance': { durations: { ...trip(15, 10, 15), ...slower, ...dist } },
  'voisin-20j-distance': { durations: { ...trip(20, 13, 20), ...dist } },
  'voisin-15j-distance': { durations: { ...trip(15, 10, 15), ...dist } },
  // Rythme de l'IA : débarquements et attaques terrestres tous les 15 jours (au lieu de 30) ; marge d'attaque plus basse.
  'voisin-15j-rythme15': { durations: trip(15, 10, 15), ai: { pace: rythme15 } },
  'voisin-20j-rythme15': { durations: trip(20, 13, 20), ai: { pace: rythme15 } },
  'voisin-20j-rythme15-lent': { durations: { ...trip(20, 13, 20), ...slower }, ai: { pace: rythme15 } },
  'voisin-15j-rythme15-marge': { durations: trip(15, 10, 15), ai: { pace: rythme15, marginAdd: -.2 } },
  // Diagnostic (30 parties) : quelle part des nouvelles personnalités freine les conquêtes ?
  'diag-20j': { durations: trip(20, 13, 20) },
  'diag-20j-sans-alliances-batisseur': { durations: trip(20, 13, 20), ai: { personality: { batisseur: { allyChance: 0 } } } },
  'diag-20j-sans-coalition-heros': { durations: trip(20, 13, 20), ai: { personality: { heros: { coalitionChance: 0 } } } },
  'diag-20j-traitre-sans-repos': { durations: trip(20, 13, 20), ai: { personality: { traitre: { restPeriods: [0, 0] } } } },
  'diag-20j-estimation-1': { durations: trip(20, 13, 20), vision: { growthAtEnd: 1 } },
  'diag-20j-estimation-0.5': { durations: trip(20, 13, 20), vision: { growthAtEnd: .5 } },
  'diag-20j-sans-variations': { durations: trip(20, 13, 20), ai: { personality: { jitter: 0 } } },
  // Combinaisons retenues après le diagnostic : Traître qui se repose moins (12 à 30 périodes), Bâtisseur un peu moins
  // allié (0,2), estimation prudente d'une garnison invisible moins gonflée en fin de partie (× 2 ou × 1,5 au lieu de × 3,37).
  'combo-20j-est1': { durations: trip(20, 13, 20), vision: { growthAtEnd: 1 }, ai: { personality: combo } },
  'combo-15j-est1': { durations: trip(15, 10, 15), vision: { growthAtEnd: 1 }, ai: { personality: combo } },
  'combo-20j-est05': { durations: trip(20, 13, 20), vision: { growthAtEnd: .5 }, ai: { personality: combo } },
  // Pour information (changerait une règle du cahier, décision de Jack) : 2 assauts au lieu de 3.
  'voisin-15j-2assauts': { durations: trip(15, 10, 15), battle: { assaults: 2, maxDays: 3 } }
};

const merge = (a, b) => { for (const [k, v] of Object.entries(b)) a[k] = v && typeof v === 'object' && !Array.isArray(v) && a[k] && typeof a[k] === 'object' ? merge({ ...a[k] }, v) : v; return a; };
/** Copie de travail de src/ avec les réglages de l'essai fusionnés dans RULES.realtime. */
export function prepare(name, override, base = '/tmp/arken-essais-v175b') {
  const dir = join(base, name);
  if (existsSync(dir)) rmSync(dir, { recursive: true });
  mkdirSync(join(dir, 'tools', 'v17'), { recursive: true });
  cpSync(join(ROOT, 'src'), join(dir, 'src'), { recursive: true });
  cpSync(join(ROOT, 'tools', 'v17', 'partie-jours.mjs'), join(dir, 'tools', 'v17', 'partie-jours.mjs'));
  const file = join(dir, 'src', 'domain', 'realtime', 'rules.js');
  let text = readFileSync(file, 'utf8');
  const head = 'export const REALTIME_RULES = freezeDeep({', end = text.lastIndexOf('\n});');
  if (!text.includes(head) || end < 0) throw new Error('rules.js : forme inattendue');
  text = text.slice(0, end) + `\n}, ${JSON.stringify(override)}));` + text.slice(end + 4);
  text = text.replace(head, `const merge = ${merge.toString()};\nexport const REALTIME_RULES = freezeDeep(merge({`);
  writeFileSync(file, text);
  return dir;
}
function play(name, dir, parties, prefixe, short) {
  return new Promise((resolve, reject) => {
    const args = [join(dir, 'tools', 'v17', 'partie-jours.mjs'), String(parties), prefixe, ...(short ? ['--courte'] : [])];
    const p = spawn(process.execPath, args, { stdio: ['ignore', 'pipe', 'inherit'] });
    let out = '';
    p.stdout.on('data', d => { out += d; });
    p.on('close', code => code ? reject(new Error(`${name} : code ${code}`)) : resolve(JSON.parse(out)));
  });
}
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2), plain = args.filter(a => !a.startsWith('--')), short = args.includes('--courte');
  const [parties = 100, prefixe = 'v175b', list] = plain;
  const names = list ? list.split(',') : Object.keys(ESSAIS);
  for (const n of names) if (!ESSAIS[n]) throw new Error(`essai inconnu : ${n}`);
  const outFile = join(ROOT, 'tools', 'v17', `resultats-v17.5b-essais${short ? '-courtes' : ''}.json`);
  const results = existsSync(outFile) ? JSON.parse(readFileSync(outFile, 'utf8')) : {};
  const dirs = Object.fromEntries(names.map(n => [n, prepare(n, ESSAIS[n])])); // copies faites d'abord : le code peut changer pendant les essais
  const queue = [...names];
  const worker = async () => { for (let n = queue.shift(); n; n = queue.shift()) {
    const t0 = Date.now(), r = await play(n, dirs[n], Number(parties), prefixe, short);
    results[n] = { reglages: ESSAIS[n], ...r };
    writeFileSync(outFile, JSON.stringify(results, null, 1));
    console.log(`${n} : ${r.conquetesParPartie} conquêtes, ${r.nationsElimineesParPartie} éliminées, armée ${r.plusGrandeArmeeFinaleOr.mediane}, famine ${r.nourriture.tauxFamine} %, chaîne<2 ans ${r.partiesAvecEliminationsEnChaineAvant2Ans}, ${Math.round((Date.now() - t0) / 1000)} s`);
  } };
  await Promise.all([worker(), worker()]);
}
