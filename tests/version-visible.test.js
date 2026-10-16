// V12.1 : Jack doit toujours voir quelle version tourne, et l'APK doit signaler une nouvelle bêta.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

test('la version est affichée dans l\'en-tête et sur l\'accueil, tamponnée au build', () => {
  assert.match(read('index.html'), /id="hud-version">v__VERSION__</);
  execFileSync('node', [join(root, 'scripts/build.js'), '1234567abc'], { cwd: root });
  const html = readFileSync(join(root, 'dist/index.html'), 'utf8');
  const { version } = JSON.parse(read('package.json'));
  assert.ok(html.includes(`id="hud-version">v${version}+1234567<`), 'version dans l\'en-tête');
  assert.ok(html.includes(`id="app-version">${version}+1234567<`), 'version sur l\'accueil');
  assert.ok(readFileSync(join(root, 'dist/update-check.js'), 'utf8').length > 100, 'update-check.js publié');
  rmSync(join(root, 'dist'), { recursive: true, force: true });
});

test('le contrôle de mise à jour ne tourne que dans l\'APK et pointe vers le bon APK', () => {
  const js = read('update-check.js');
  assert.match(js, /isNativePlatform/);
  assert.match(js, /frontieres-arken\/version\.txt/);
  assert.match(read('index.html'), /releases\/download\/beta\/frontieres-arken-beta\.apk/);
  assert.ok(read('sw.js').includes("'./update-check.js'"));
});
