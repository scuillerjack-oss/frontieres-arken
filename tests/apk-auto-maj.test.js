// V12.2 : l'APK de bêta charge le jeu depuis le site pour se mettre à jour tout seul ;
// la version Google Play (AAB) garde le jeu embarqué.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, copyFileSync, rmSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

test('le script de bêta pointe l\'APK vers le site, avec une page hors ligne', () => {
  const dir = mkdtempSync(join(tmpdir(), 'arken-apk-'));
  copyFileSync(join(root, 'capacitor.config.json'), join(dir, 'capacitor.config.json'));
  execFileSync('node', [join(root, 'scripts/apk-beta-config.js')], { cwd: dir });
  const cfg = JSON.parse(readFileSync(join(dir, 'capacitor.config.json'), 'utf8'));
  assert.equal(cfg.server.url, 'https://scuillerjack-oss.github.io/frontieres-arken/');
  assert.equal(cfg.server.errorPath, 'offline.html');
  assert.equal(cfg.server.androidScheme, 'https');
  assert.equal(cfg.appId, 'io.github.scuillerjackoss.frontieresarken');
  rmSync(dir, { recursive: true, force: true });
});

test('la config du dépôt reste embarquée (pour Google Play) et seul le workflow APK la modifie', () => {
  assert.equal(JSON.parse(read('capacitor.config.json')).server.url, undefined);
  assert.match(read('.github/workflows/android-apk.yml'), /apk-beta-config\.js/);
  assert.doesNotMatch(read('.github/workflows/android-aab.yml'), /apk-beta-config\.js/);
});

test('offline.html est publiée avec le jeu', () => {
  execFileSync('node', [join(root, 'scripts/build.js'), 'test123'], { cwd: root });
  assert.ok(existsSync(join(root, 'dist/offline.html')));
  rmSync(join(root, 'dist'), { recursive: true, force: true });
});
