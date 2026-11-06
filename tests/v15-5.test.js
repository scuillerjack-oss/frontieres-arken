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

// V15.5.1 — relecture indépendante : un profil importé ne recompte pas la partie finie déjà sauvegardée.
import { arkenV9Map as map } from '../src/map/arken-v9-map.js';
import { createGameState } from '../src/state/create-game-state.js';
import { markGameCounted, recordFinishedGame } from '../src/domain/palmares.js';
import { createProfile } from '../src/domain/profile.js';

function finishedGame(seed = 'arken-import') {
  const s = createGameState({ map, playerNationId: 'valmorne', seed });
  const ids = map.nations.map(n => n.id);
  s.gameOver = { reason: 'turn-limit', turn: 80, winnerId: 'valmorne', ranking: ids.map((nationId, i) => ({ nationId, rank: i + 1, provinces: 5 - i, capitals: 1, treasury: 0, eliminated: false })) };
  return s;
}

test('V15.5.1 : après import d’un profil, rouvrir une partie finie ne la compte pas une seconde fois', () => {
  const state = finishedGame();
  const local = createProfile();
  assert.equal(recordFinishedGame(local, state).counted, true);
  const imported = createProfile();
  imported.palmares = { games: 4, wins: 2 };
  markGameCounted(imported, state);
  assert.equal(imported.palmares.games, 4, 'les chiffres importés ne bougent pas');
  assert.equal(recordFinishedGame(imported, state).counted, false, 'pas de second comptage');
  assert.equal(imported.palmares.games, 4);
});

test('V15.5.1 : sans partie finie, l’import ne note rien', () => {
  const p = createProfile();
  markGameCounted(p, createGameState({ map, playerNationId: 'valmorne', seed: 'arken-encours' }));
  markGameCounted(p, null);
  assert.deepEqual(p.palmares?.counted ?? [], []);
  assert.match(read('src/presentation/ui/boosts-ui.js'), /markGameCounted\(r\.profile,state\|\|load\(\)\);setProfile\(r\.profile\)/);
});
