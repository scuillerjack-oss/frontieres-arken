// V17.13 (relecture) — Garde-fou de publication : un build Google Play de PRODUCTION ne doit jamais partir avec la
// vitesse ×2 gratuite des bêtas internes (BETA_X2_GRATUIT = true dans src/presentation/beta-flags.js).
// Appelé uniquement par .github/workflows/android-aab.yml (jamais par l'APK de bêta, android-apk.yml).
// « Production » = variable ARKEN_ADS_PRODUCTION (vraies pubs AdMob) ou ARKEN_PRODUCTION définie et vraie.
// Sans elles (test interne Google Play, cas actuel), le contrôle passe : ×2 reste gratuit pour les testeurs.
// À la main : `ARKEN_PRODUCTION=1 node scripts/check-release-flags.js` (sortie en erreur tant que le drapeau vaut true).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { truthy } from './play-config.js';

export const isProductionBuild = (env = process.env) => truthy(env.ARKEN_ADS_PRODUCTION) || truthy(env.ARKEN_PRODUCTION);
/** Valeur du drapeau lue dans le source (true / false), ou null si la ligne est introuvable. */
export function betaX2Flag(source) {
  const m = String(source).match(/^export const BETA_X2_GRATUIT = (true|false);$/m);
  return m ? m[1] === 'true' : null;
}
/** { ok, message } : refus si production et drapeau à true (ou illisible). */
export function checkReleaseFlags(source, env = process.env) {
  const flag = betaX2Flag(source), prod = isProductionBuild(env);
  if (flag === null) return { ok: false, message: 'BETA_X2_GRATUIT introuvable dans src/presentation/beta-flags.js' };
  if (prod && flag) return { ok: false, message: 'Build de PRODUCTION avec BETA_X2_GRATUIT = true : passer le drapeau à false (src/presentation/beta-flags.js, docs/SORTIE-ARKEN.md)' };
  return { ok: true, message: `BETA_X2_GRATUIT = ${flag} (${prod ? 'production' : 'test interne / bêta'}) : OK` };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const r = checkReleaseFlags(fs.readFileSync(path.join(root, 'src/presentation/beta-flags.js'), 'utf8'));
  if (!r.ok) { console.error(`::error title=Garde-fou de publication::${r.message}`); process.exit(1); }
  console.log(r.message);
}
