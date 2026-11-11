// V16 — Campagne courte, jouée à chaque `npm test` : 20 parties entières (les 5 nations, 40 et 80 tours, 3 niveaux,
// joueur passif / agressif / aléatoire / diplomate / IA), invariants vérifiés à chaque tour, plus la reprise de vraies
// sauvegardes faites par les versions V14.4, V15.3 et V15.4. Version longue : `npm run campagne` (300 parties).
// Les bugs déjà connus (docs/CAMPAGNE-TESTS-V16.md, tests/campagne-bugs.test.js) ne font pas échouer ; tout autre écart, si.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { campaignPlan, playGame, summarize, economyChecks, checkInvariants, map, NATIONS, STRATEGIES, LENGTHS, DIFFICULTY_IDS } from '../scripts/campagne-lib.js';
import { decodeSave, encodeSave } from '../src/persistence/save-codec.js';
import { resolveInterturn } from '../src/domain/game-engine.js';
import { gameLengthOf } from '../src/domain/game-length.js';
import { buildEndStory } from '../src/domain/story.js';
import { endStoryHtml } from '../src/presentation/end-view.js';
import { createProfile, sanitizeProfile } from '../src/domain/profile.js';
import { recordFinishedGame } from '../src/domain/palmares.js';

const plans = campaignPlan(20, 'npm');
const profile = createProfile();
const results = plans.map(p => playGame(p, { profile }));
const show = r => `${r.seed} (${r.nation}, ${r.length} tours, ${r.difficulty}, ${r.strategy}) : ${r.newViolations.slice(0, 5).map(v => `[t${v.turn}] ${v.inv} : ${v.msg}`).join(' | ')}`;

test('campagne courte : le plan couvre les 5 nations, les 2 longueurs, les 3 niveaux et les 5 joueurs', () => {
  for (const [key, vals] of [['nation', NATIONS], ['length', LENGTHS], ['difficulty', DIFFICULTY_IDS], ['strategy', STRATEGIES]])
    for (const v of vals) assert.ok(plans.some(p => p[key] === v), `${key}=${v} absent`);
  assert.ok(plans.some(p => p.saveCheck) && plans.some(p => p.boosts));
});

for (const r of results) {
  test(`partie ${r.seed} — ${r.nation}, ${r.length} tours, ${r.difficulty}, joueur ${r.strategy}${r.saveCheck ? ', sauvegarde en cours' : ''} : jusqu'à l'écran de fin, invariants à chaque tour`, () => {
    assert.equal(r.newViolations.length, 0, show(r));
    assert.ok(r.finished, 'la partie se termine');
    assert.ok(r.endTurn <= r.length, `fin au tour ${r.endTurn}`);
    if (r.reason === 'turn-limit') assert.equal(r.endTurn, r.length);
  });
}

test('campagne courte : la partie s\'est vraiment jouée (guerres, convois, débarquements, alliances, trahisons)', () => {
  const sum = summarize(results);
  for (const k of ['convoys', 'landings', 'alliances', 'ceasefires', 'betrayals', 'helps']) assert.ok(sum.evenements[k] > 0, `${k} : ${sum.evenements[k]}`);
  assert.ok(sum.toursJoues >= 20 * 35, `${sum.toursJoues} tours joués`);
  // Le joueur aléatoire a bien envoyé des ordres refusés (absurdes) ET acceptés.
  const alea = results.filter(r => r.strategy === 'aleatoire');
  assert.ok(alea.every(r => Object.values(r.refusals).reduce((a, b) => a + b, 0) > 20 && Object.values(r.accepted).reduce((a, b) => a + b, 0) > 5));
});

test('campagne courte : palmarès du profil cohérent après 20 parties (16 humaines), jamais compté deux fois', () => {
  const human = results.filter(r => r.strategy !== 'ia');
  assert.equal(profile.palmares.games, human.length);
  assert.equal(profile.palmares.wins, human.filter(r => r.won).length);
  assert.equal(profile.gamesStarted, human.length);
  assert.deepEqual(sanitizeProfile(JSON.parse(JSON.stringify(profile))).palmares, profile.palmares);
});

test('règles d\'argent : aucun achat d\'or ou de troupes, jamais de pub dans le tutoriel, avec le Pack ou après un refus', async () => {
  assert.deepEqual(await economyChecks(), []);
});

test('le moteur reste déterministe : même graine, même partie (empreinte de fin identique)', () => {
  const a = playGame(plans[3], { keepState: true, views: false }), b = playGame(plans[3], { keepState: true, views: false });
  assert.equal(JSON.stringify(a.state), JSON.stringify(b.state));
});

// --- Vraies sauvegardes d'anciennes versions (fabriquées avec le code de ces versions, extrait de l'historique git) ---
const FIXTURES = [
  { file: 'sauvegarde-v14.4-tour31', from: 9, turn: 31, length: 80, partial: true },
  { file: 'sauvegarde-v14.4-finie', from: 9, turn: 81, length: 80, partial: true, finished: true },
  { file: 'sauvegarde-v15.3-tour51', from: 11, turn: 51, length: 80, partial: false },
  { file: 'sauvegarde-v15.4-courte-tour21', from: 12, turn: 21, length: 40, partial: false }
];
for (const f of FIXTURES) {
  test(`reprise d'une vraie sauvegarde ${f.file} (schéma ${f.from}) : migrée, jouée jusqu'à la fin, invariants à chaque tour`, () => {
    const text = gunzipSync(readFileSync(new URL(`./fixtures/${f.file}.json.gz`, import.meta.url))).toString();
    const raw = JSON.parse(text);
    assert.equal(raw.schemaVersion, f.from); assert.equal(raw.turn, f.turn);
    const s = decodeSave(text);
    assert.equal(gameLengthOf(s), f.length);
    assert.equal(s.difficulty, 'normal');
    assert.deepEqual(Object.keys(s.provinces).sort(), Object.keys(raw.provinces).sort());
    for (const id of Object.keys(raw.provinces)) assert.equal(s.provinces[id].ownerId, raw.provinces[id].ownerId, `propriétaire ${id} perdu`);
    for (const id of NATIONS) assert.equal(s.nations[id].treasury, raw.nations[id].treasury, `trésor ${id} perdu`);
    assert.equal(s.orders.length, raw.orders.length, 'ordres en attente gardés');
    let n = 0;
    while (!s.gameOver && n++ < 100) { resolveInterturn(s, map); assert.deepEqual(checkInvariants(s, { length: f.length }), [], `tour ${s.turn - 1}`); }
    assert.ok(s.gameOver);
    const story = buildEndStory(s, map);
    assert.equal(Boolean(story.partial), f.partial);
    assert.doesNotMatch(endStoryHtml(story), /undefined|NaN|\[object/);
    // Le palmarès compte la partie une fois (sa graine est propre), et pas une seconde fois après une nouvelle reprise.
    const p = createProfile();
    assert.equal(recordFinishedGame(p, s).counted, true);
    assert.equal(recordFinishedGame(p, decodeSave(encodeSave(s))).counted, false);
    assert.equal(p.palmares.games, 1);
  });
}
