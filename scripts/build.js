// Construit dist/ (le site publié) et tamponne la version : "version+commit".
// Elle s'affiche sur l'écran d'accueil du jeu et nomme le cache du service
// worker, ce qui force la mise à jour de la PWA installée à chaque déploiement.
//
// Usage : node scripts/build.js [commit]   (par défaut $GITHUB_SHA, sinon "local")
import { cpSync, readFileSync, writeFileSync, rmSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { adsConfig, injectPlayConfig, isPlayBuild } from './play-config.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'dist');

// Seuls les fichiers du jeu sont publiés (pas les tests, docs, scripts).
const PUBLISHED = ['index.html', 'offline.html', 'app.js', 'update-check.js', 'sw.js', 'manifest.webmanifest', 'styles.css', 'v5.css', 'icons', 'src', 'assets'];

// Validé AVANT de toucher à dist/ : un identifiant AdMob manquant ou de test en production fait échouer le build sans rien casser.
const playConfig = adsConfig(process.env);

const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const commit = (process.argv[2] || process.env.GITHUB_SHA || 'local').slice(0, 7);
const version = `${pkg.version}+${commit}`;

if (existsSync(out)) rmSync(out, { recursive: true, force: true });
mkdirSync(out);
for (const entry of PUBLISHED) {
  if (existsSync(join(root, entry))) cpSync(join(root, entry), join(out, entry), { recursive: true });
}

for (const file of ['index.html', 'sw.js']) {
  const path = join(out, file);
  const before = readFileSync(path, 'utf8');
  if (!before.includes('__VERSION__')) throw new Error(`${file} ne contient pas __VERSION__`);
  writeFileSync(path, before.replaceAll('__VERSION__', version));
}
// V14.4 : build Google Play seulement (ARKEN_PLAY_BUILD) : active pubs + achats dans la COPIE dist/ ; échoue si la
// production est demandée avec un identifiant AdMob manquant ou de test. PWA et APK de bêta : bloc inchangé (tout à false).
const configFile = join(out, 'src', 'presentation', 'play-config.js');
writeFileSync(configFile, injectPlayConfig(readFileSync(configFile, 'utf8'), playConfig));
if (isPlayBuild(process.env)) console.log(`Build Google Play : publicités ${playConfig.testing ? 'TEST' : 'PRODUCTION'}, achats Play Billing actifs`);
writeFileSync(join(out, '.nojekyll'), '');
writeFileSync(join(out, 'version.txt'), `${version}\n`);
console.log(`dist/ prêt — version ${version}`);
