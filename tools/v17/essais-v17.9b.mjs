// V17.9b — Essais de rééquilibrage (RULES.realtime : troupes de départ, base navale, IA, vision…) sur des parties IA complètes.
// Comme essais-v17.5b.mjs : chaque essai joue sur une COPIE de src/ (réglages fusionnés dans rules.js), le dépôt n'est pas
// touché ; parties jouées par batterie-v17.9b.mjs (sans invariants, plus rapide), 2 essais à la fois.
//
//   node tools/v17/essais-v17.9b.mjs [parties=100] [préfixe=v179e] [essai1,essai2,…] [--courte]
//
// Résultats : tools/v17/resultats-v17.9b-essais.json (résumé de la batterie par essai).
import { spawn } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const PASSIVE = process.argv.includes('--passif');
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const tie = { ai: { baseTieBreak: true } };
const merge = (a, b) => { for (const [k, v] of Object.entries(b)) a[k] = v && typeof v === 'object' && !Array.isArray(v) && a[k] && typeof a[k] === 'object' ? merge({ ...a[k] }, v) : v; return a; };
const m = (...xs) => xs.reduce((a, b) => merge(a, b), {});
const prov = n => ({ start: { province: { infantry: n, cavalry: 0, armor: 0, artillery: 0 } } });
const cap = (inf, cav = 10, arm = 6, art = 2) => ({ start: { capital: { infantry: inf, cavalry: cav, armor: arm, artillery: art } } });
export const ESSAIS = {
  'base': {},
  'base-graine': tie,
  'graine-prov25': m(tie, prov(25)),
  'graine-prov20': m(tie, prov(20)),
  'graine-prov25-cap150': m(tie, prov(25), cap(150)),
  'graine-prov20-cap120': m(tie, prov(20), cap(120, 6, 4, 2)),
  'graine-marge-0.2': m(tie, { ai: { marginAdd: -.2 } }),
  'graine-rappel-0.8': m(tie, { ai: { recallMargin: .8 } }),
  'graine-estimation-0.5': m(tie, { vision: { growthAtEnd: .5 } }),
  'graine-attaques-2': m(tie, { ai: { attacksPerPace: 2 } }),
  'graine-sans-renfort-urgence': m(tie, { ai: { emergencyRecruit: false } }),
  // Round 2 : corrections de l'IA trouvées par le diagnostic (capitale vidée par Valmorne ; cible comptée comme menace).
  'g-garde100': m(tie, { ai: { capitalGuard: 100 } }),
  'g-menace': m(tie, { ai: { threatExceptTarget: true } }),
  'g-garde-menace': m(tie, { ai: { capitalGuard: 100, threatExceptTarget: true } }),
  // Round 3 : base navale tirée entre tous les points de port (chaque partie, une autre pression) ; économie plus généreuse.
  'g-uniforme': m(tie, { ai: { baseTieSpread: 100, capitalGuard: 100, threatExceptTarget: true } }),
  'g-uniforme-revenu50': m(tie, { incomeDays: 50, ai: { baseTieSpread: 100, capitalGuard: 100, threatExceptTarget: true } }),
  'g-uniforme-revenu45': m(tie, { incomeDays: 45, ai: { baseTieSpread: 100, capitalGuard: 100, threatExceptTarget: true } }),
  'g-uniforme-marge': m(tie, { ai: { baseTieSpread: 100, capitalGuard: 100, threatExceptTarget: true, marginAdd: -.25 } }),
  // Round 4 (Jack : le Conquérant gagne le plus souvent, ~30-35 % avec un joueur passif) : Conquérant plus fort.
  'u50-conq': m(tie, { incomeDays: 50, ai: { baseTieSpread: 100, capitalGuard: 100, threatExceptTarget: true, personality: { conquerant: { margin: .85, warMargin: .72, extraLots: 2, attacks: 4 } } } }),
  'u50-conq2': m(tie, { incomeDays: 50, ai: { baseTieSpread: 100, capitalGuard: 100, threatExceptTarget: true, personality: { conquerant: { margin: .8, warMargin: .68, extraLots: 3, attacks: 4, recruitPace: 10, landingPace: 10, landingWarFloor: .85 } } } }),
  // Round 5 : Valmorne (seule capitale sans port, deux côtes faibles) : ses deux points de port un peu mieux gardés au départ.
  'u50-valm': m(tie, { incomeDays: 50, start: { nation: { valmorne: { p02: { infantry: 40 }, p03: { infantry: 40 } } } }, ai: { baseTieSpread: 100, capitalGuard: 100, threatExceptTarget: true } }),
  'u45-valm': m(tie, { incomeDays: 45, start: { nation: { valmorne: { p02: { infantry: 40 }, p03: { infantry: 40 } } } }, ai: { baseTieSpread: 100, capitalGuard: 100, threatExceptTarget: true } }),
  'g-garde-menace-marge': m(tie, { ai: { capitalGuard: 100, threatExceptTarget: true, marginAdd: -.2 } })
};
export function prepare(name, override, base = join(tmpdir(), 'arken-essais-v179b')) {
  const dir = join(base, name);
  if (existsSync(dir)) rmSync(dir, { recursive: true });
  mkdirSync(join(dir, 'tools', 'v17'), { recursive: true });
  cpSync(join(ROOT, 'src'), join(dir, 'src'), { recursive: true });
  for (const f of ['partie-jours.mjs', 'batterie-v17.9b.mjs']) cpSync(join(ROOT, 'tools', 'v17', f), join(dir, 'tools', 'v17', f));
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
    const out = join(dir, 'brut.json');
    const args = [join(dir, 'tools', 'v17', 'batterie-v17.9b.mjs'), '0', prefixe, `--brut=0:${parties}`, `--sortie=${out}`, '--sans-invariants', ...(short ? ['--courte'] : []), ...(PASSIVE ? ['--passif'] : [])];
    const p = spawn(process.execPath, ['--max-old-space-size=3000', ...args], { stdio: ['ignore', 'inherit', 'inherit'] });
    p.on('close', async code => {
      if (code) return reject(new Error(`${name} : code ${code}`));
      const { summarizeBattery } = await import(join(dir, 'tools', 'v17', 'batterie-v17.9b.mjs'));
      resolve(summarizeBattery(JSON.parse(readFileSync(out, 'utf8'))));
    });
  });
}
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2), plain = args.filter(a => !a.startsWith('--')), short = args.includes('--courte');
  const [parties = 100, prefixe = 'v179e', list] = plain;
  const names = list ? list.split(',') : Object.keys(ESSAIS);
  for (const n of names) if (!ESSAIS[n]) throw new Error(`essai inconnu : ${n}`);
  const outFile = join(ROOT, 'tools', 'v17', `resultats-v17.9b-essais${short ? '-courtes' : ''}${PASSIVE ? '-passif' : ''}.json`);
  const dirs = Object.fromEntries(names.map(n => [n, prepare(n, ESSAIS[n])]));
  const queue = [...names];
  const worker = async () => { for (let n = queue.shift(); n; n = queue.shift()) {
    const t0 = Date.now(), r = await play(n, dirs[n], Number(parties), prefixe, short);
    const results = existsSync(outFile) ? JSON.parse(readFileSync(outFile, 'utf8')) : {};
    results[n] = { reglages: ESSAIS[n], parties: Number(parties), ...r };
    writeFileSync(outFile, JSON.stringify(results, null, 1));
    const v = r.vainqueurParNationPct, c = r.tauxDeVictoireParCaractereTenu;
    console.log(`${n} : ${r.conquetesParPartie} conquêtes (${r.conquetesParQuart.join(' / ')}), ${r.nationsElimineesParPartie} élim., chaîne ${r.partiesAvecEliminationsEnChaineAvant2Ans}, élim<2ans ${r.partiesAvecEliminationAvant2Ans}, famine ${r.famine.taux} %, fins ${JSON.stringify(r.fins)} | nations ${Object.values(v).join('/')} | ${r.vainqueurIAParCaracterePct ? 'IA vainqueur (part des parties) ' + JSON.stringify(r.vainqueurIAParCaracterePct) + ' joueur ' + r.victoiresDuJoueur + ' | ' : ''}caractères (part des victoires) ${JSON.stringify(r.vainqueurParCaracterePct)} tenus ${Object.entries(c).map(([k, x]) => k.slice(0, 4) + ' ' + x).join(', ')} | variété ${JSON.stringify(r.variete)} | ${Math.round((Date.now() - t0) / 1000)} s`);
  } };
  await Promise.all([worker(), worker()]);
}
