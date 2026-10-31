// V14.4 — Dépendances natives du build Google Play UNIQUEMENT (AdMob + Play Billing).
// Elles ne sont PAS dans package.json « dependencies » : la PWA, les tests et l'APK de bêta (npm ci) n'ont donc aucun SDK.
// android-aab.yml lance ce script après `npm ci` : il les installe dans le runner (package.json modifié sur le runner
// seulement, rien n'est commité), pour que `npx cap sync android` les détecte.
// Usage : node scripts/play-deps.js [--dry-run]
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
export function playDependencies() {
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  return Object.entries(pkg.arkenPlayDependencies || {}).map(([name, range]) => `${name}@${range}`);
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const specs = playDependencies();
  if (!specs.length) throw new Error('arkenPlayDependencies vide dans package.json');
  if (process.argv.includes('--dry-run')) console.log('npm install ' + specs.join(' '));
  else {
    const r = spawnSync('npm', ['install', '--no-audit', '--no-fund', ...specs], { cwd: root, stdio: 'inherit' });
    if (r.status !== 0) throw new Error('Installation des plugins natifs impossible');
  }
}
