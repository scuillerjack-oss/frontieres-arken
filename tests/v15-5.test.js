import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { provincesText } from '../src/domain/story.js';

const read = p => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

test('V15.5 : « 1 province » au singulier, « 3 provinces » au pluriel', () => {
  assert.equal(provincesText(1), '1 province');
  assert.equal(provincesText(3), '3 provinces');
  const story = read('src/domain/story.js');
  assert.doesNotMatch(story, /\$\{-?tp\.(delta|provinces)\} provinces/);
});

test('V15.5 : « 1 navire » accordé dans les écrans de province et de vision', () => {
  for (const f of ['src/presentation/ui/province-sheet.js', 'src/presentation/vision-view.js']) {
    assert.doesNotMatch(read(f), /\$\{(e\.warships|order\.warships|ships|warships)\} navires/);
  }
});

test('V15.5 : fiche Play à jour et visuels présents', () => {
  for (const f of ['store/fiche-play-store.md', 'store/fiche-play-store-en.md']) assert.match(read(f), /40/);
  assert.ok(existsSync(new URL('../store/icone-512.png', import.meta.url)));
  assert.ok(existsSync(new URL('../store/banniere-1024x500.png', import.meta.url)));
});

test('V15.5 : le build Google Play retire la mention bêta de l\'accueil', () => {
  const build = read('scripts/build.js');
  assert.match(build, /isPlayBuild\(process\.env\)\) \{[\s\S]*VERSION BÊTA/);
  assert.match(read('index.html'), /VERSION BÊTA /);
});
