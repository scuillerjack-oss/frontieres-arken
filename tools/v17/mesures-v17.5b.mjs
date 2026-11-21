// V17.5b — Grande série de parties IA (réglages du dépôt), jouée en 2 processus, résumée comme partie-jours.mjs.
//
//   node tools/v17/mesures-v17.5b.mjs [parties=300] [préfixe=v175b-final] [--courte] [processus=2]
//
// Écrit le résumé dans tools/v17/resultats-v17.5b.json (clé « <parties> parties[ courtes] »). Les temps de calcul par
// jour ne sont pas mesurés ici (deux processus en même temps) : voir partie-jours.mjs au calme.
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { summarize } from './partie-jours.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2), plain = args.filter(a => !a.startsWith('--')), short = args.includes('--courte');
const [parties = 300, prefixe = 'v175b-final', workers = 2] = plain;
const n = Number(parties), w = Number(workers), t0 = Date.now();
const part = (from, to) => new Promise((resolve, reject) => {
  const out = join(tmpdir(), `arken-v175b-${prefixe}-${from}-${to}${short ? '-c' : ''}.json`);
  const p = spawn(process.execPath, ['--max-old-space-size=3000', join(HERE, 'partie-jours.mjs'), '0', prefixe, `--brut=${from}:${to}`, `--sortie=${out}`, ...(short ? ['--courte'] : [])], { stdio: ['ignore', 'inherit', 'inherit'] });
  p.on('close', code => code ? reject(new Error(`parties ${from}-${to} : code ${code}`)) : resolve(JSON.parse(readFileSync(out, 'utf8'))));
});
const step = Math.ceil(n / w);
const games = (await Promise.all(Array.from({ length: w }, (_, i) => part(i * step, Math.min(n, (i + 1) * step))))).flat();
const summary = summarize(games, { parties: n, prefixe, short, seconds: (Date.now() - t0) / 1000 });
delete summary.msParJour; delete summary.msJourAvecDecisionIA;
const file = join(HERE, 'resultats-v17.5b.json'), all = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {};
all[`${n} parties${short ? ' courtes' : ''}`] = summary;
writeFileSync(file, JSON.stringify(all, null, 1));
console.log(JSON.stringify(summary, null, 1));
