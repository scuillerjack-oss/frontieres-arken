// Garde-fous de publication : le jeu doit fonctionner sous le sous-dossier
// GitHub Pages /frontieres-arken/ et se mettre à jour à chaque déploiement.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, rmSync } from 'node:fs';
import { join, dirname, normalize, relative } from 'node:path';
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

test('B12 corrigé : le service worker ne met en cache que les réponses valides, clonées avant usage', () => {
  const sw = read('sw.js');
  assert.match(sw, /response\.ok/);
  const fetchHandler = sw.slice(sw.indexOf("addEventListener('fetch'"));
  assert.ok(fetchHandler.indexOf('response.clone()') < fetchHandler.indexOf('caches.open'), 'clone avant caches.open');
});

test('V9 : la carte Leonardo et les modules de la carte V9 sont mis en cache hors ligne', () => {
  const sw = read('sw.js');
  for (const p of ['./assets/carte-leonardo.jpg', './src/map/arken-v9-map.js', './src/map/arken-v9-data.js']) assert.ok(sw.includes(`'${p}'`), p);
  // Tout module importé par le jeu est dans la liste du service worker.
  const imports = [...read('app.js').matchAll(/from '\.\/([^']+)'/g)].map(m => m[1]);
  for (const p of imports) assert.ok(sw.includes(`'./${p}'`), `module non mis en cache : ${p}`);
});

// V10 : TOUS les modules du jeu, y compris ceux importés indirectement (ex. src/domain/combat.js), sont mis en
// cache hors ligne : graphe d'imports parcouru récursivement depuis app.js.
function importGraph(entry) {
  const seen = new Set(), todo = [entry];
  while (todo.length) {
    const file = todo.pop();
    if (seen.has(file)) continue;
    seen.add(file);
    const src = read(file);
    for (const [, spec] of src.matchAll(/(?:import|export)\s[^'"]*?from\s*['"](\.{1,2}\/[^'"]+)['"]/g)) todo.push(relative(root, normalize(join(root, dirname(file), spec))).split('\\').join('/'));
    for (const [, spec] of src.matchAll(/import\(\s*['"](\.{1,2}\/[^'"]+)['"]\s*\)/g)) todo.push(relative(root, normalize(join(root, dirname(file), spec))).split('\\').join('/'));
  }
  return [...seen].sort();
}
test('V10 : chaque module du graphe d\'imports depuis app.js est dans ASSETS du service worker', () => {
  const list = read('sw.js').match(/const ASSETS=\[([^\]]*)\]/)[1];
  const assets = new Set([...list.matchAll(/'\.\/([^']*)'/g)].map(m => m[1]));
  const graph = importGraph('app.js');
  assert.ok(graph.includes('src/domain/combat.js'), 'combat.js est bien importé indirectement');
  assert.ok(graph.length >= 14, `${graph.length} modules`);
  for (const p of graph) {
    assert.ok(existsSync(join(root, p)), `module importé absent : ${p}`);
    assert.ok(assets.has(p), `module non mis en cache hors ligne : ${p}`);
  }
});
