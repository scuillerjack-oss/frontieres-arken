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
const dist = { landDistance: { reference: 245, min: .75, max: 1.5 } }; // « plus c'est loin, plus c'est long » (distance des repères)
export const ESSAIS = {
  'base-30j': {},
  'voisin-20j': { durations: trip(20, 13, 20) },
  'voisin-15j': { durations: trip(15, 10, 15) },
  'voisin-20j-lent': { durations: { ...trip(20, 13, 20), ...slower } },
  'voisin-15j-lent': { durations: { ...trip(15, 10, 15), ...slower } },
  'voisin-20j-lent-distance': { durations: { ...trip(20, 13, 20), ...slower, ...dist } },
  'voisin-15j-lent-distance': { durations: { ...trip(15, 10, 15), ...slower, ...dist } },
  'voisin-20j-distance': { durations: { ...trip(20, 13, 20), ...dist } }
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
  const outFile = join(ROOT, 'tools', 'v17', `resultats-v17.5b-essais${short ? '-courtes' : ''}.json`);
  const results = existsSync(outFile) ? JSON.parse(readFileSync(outFile, 'utf8')) : {};
  const queue = [...names];
  const worker = async () => { for (let n = queue.shift(); n; n = queue.shift()) {
    const t0 = Date.now(), r = await play(n, prepare(n, ESSAIS[n]), Number(parties), prefixe, short);
    results[n] = { reglages: ESSAIS[n], ...r };
    writeFileSync(outFile, JSON.stringify(results, null, 1));
    console.log(`${n} : ${r.conquetesParPartie} conquêtes, ${r.nationsElimineesParPartie} éliminées, armée ${r.plusGrandeArmeeFinaleOr.mediane}, famine ${r.nourriture.tauxFamine} %, chaîne<2 ans ${r.partiesAvecEliminationsEnChaineAvant2Ans}, ${Math.round((Date.now() - t0) / 1000)} s`);
  } };
  await Promise.all([worker(), worker()]);
}
