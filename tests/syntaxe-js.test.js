// Correctif 14.4.1 : une accolade manquante dans app.js empêchait le jeu de démarrer alors que tous les tests étaient
// au vert, car ils lisent app.js comme du texte. Ce test fait analyser chaque fichier JavaScript du jeu par Node.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, readdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const walk = dir => readdirSync(dir).flatMap(n => { const p = join(dir, n); return statSync(p).isDirectory() ? walk(p) : [p]; });
const files = ['app.js', 'update-check.js', 'sw.js', ...walk('src').filter(f => f.endsWith('.js'))];
const tmp = mkdtempSync(join(tmpdir(), 'syntaxe-'));

for (const file of files) {
  test(`syntaxe valide : ${file}`, () => {
    const copy = join(tmp, file.replaceAll(/[\\/]/g, '_') + '.mjs'); // .mjs : les fichiers du jeu utilisent import
    copyFileSync(file, copy);
    assert.doesNotThrow(() => execFileSync(process.execPath, ['--check', copy], { stdio: 'pipe' }));
  });
}
