// Construit dist/ (le site publié) et tamponne la version : "version+commit".
// Elle s'affiche sur l'écran d'accueil du jeu et nomme le cache du service
// worker, ce qui force la mise à jour de la PWA installée à chaque déploiement.
//
// Usage : node scripts/build.js [commit]   (par défaut $GITHUB_SHA, sinon "local")
import { cpSync, readFileSync, writeFileSync, rmSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'dist');

// Seuls les fichiers du jeu sont publiés (pas les tests, docs, scripts).
const PUBLISHED = ['index.html', 'app.js', 'update-check.js', 'sw.js', 'manifest.webmanifest', 'styles.css', 'v5.css', 'icons', 'src', 'assets'];

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
writeFileSync(join(out, '.nojekyll'), '');
writeFileSync(join(out, 'version.txt'), `${version}\n`);
console.log(`dist/ prêt — version ${version}`);
