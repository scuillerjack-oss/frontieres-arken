// V15.0 : la V14.4 a été publiée avec une accolade manquante dans app.js : page morte, alors que tous les tests passaient,
// car ils lisent app.js comme du texte sans jamais le charger. Ici, tout le graphe de modules du jeu est vraiment analysé
// et lié par le moteur JavaScript (syntaxe, imports nommés), sans exécuter le code (qui a besoin d'une page).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { root } from './helpers/sources.js';

const LIEUR = `
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
const cache = new Map();
const charge = url => {
  if (cache.has(url)) return cache.get(url);
  const m = new vm.SourceTextModule(readFileSync(new URL(url), 'utf8'), { identifier: url });
  cache.set(url, m);
  return m;
};
const racine = charge(pathToFileURL(process.argv[1] + '/app.js').href);
await racine.link((spec, ref) => charge(new URL(spec, ref.identifier).href));
console.log(cache.size);
`;

test('app.js et tous ses modules se chargent : syntaxe correcte, chaque import nommé existe', () => {
  const r = spawnSync(process.execPath, ['--experimental-vm-modules', '--no-warnings', '--input-type=module', '-e', LIEUR, root], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.ok(Number(r.stdout) >= 40, `${r.stdout} modules liés`);
});
