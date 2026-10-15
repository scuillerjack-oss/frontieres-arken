// Garde-fous de publication : le jeu doit fonctionner sous le sous-dossier
// GitHub Pages /frontieres-arken/ et se mettre à jour à chaque déploiement.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

test('aucun chemin absolu dans les fichiers servis', () => {
  assert.doesNotMatch(read('index.html'), /(href|src)="\/(?!\/)/);
  assert.doesNotMatch(read('app.js'), /from '\//);
  assert.doesNotMatch(read('app.js'), /register\('\//);
  assert.doesNotMatch(read('sw.js'), /'\/[^']*'/);
  const m = JSON.parse(read('manifest.webmanifest'));
  for (const k of ['id', 'start_url', 'scope']) assert.ok(!m[k].startsWith('/'), `${k} absolu`);
  for (const i of m.icons) assert.ok(!i.src.startsWith('/'), `icône absolue ${i.src}`);
});

test('plus aucun script Cloudflare hérité de l\'ancien hébergement', () => {
  assert.doesNotMatch(read('index.html'), /cdn-cgi|__CF\$cv\$params/);
});

test('tous les fichiers mis en cache par le service worker existent', () => {
  const list = read('sw.js').match(/const ASSETS=\[([^\]]*)\]/)[1];
  for (const [, p] of list.matchAll(/'\.\/([^']*)'/g)) {
    if (p) assert.ok(existsSync(join(root, p)), `absent : ${p}`);
  }
});

test('le build tamponne la version dans la page et le cache', () => {
  execFileSync('node', [join(root, 'scripts/build.js'), 'abcdef1234'], { cwd: root });
  const { version } = JSON.parse(read('package.json'));
  const expected = `${version}+abcdef1`;
  const dist = (p) => readFileSync(join(root, 'dist', p), 'utf8');
  assert.ok(dist('index.html').includes(expected));
  assert.ok(dist('sw.js').includes(`frontieres-arken-${expected}`));
  assert.ok(!dist('index.html').includes('__VERSION__'));
  assert.ok(!existsSync(join(root, 'dist', 'tests')), 'les tests ne sont pas publiés');
  rmSync(join(root, 'dist'), { recursive: true, force: true });
});
