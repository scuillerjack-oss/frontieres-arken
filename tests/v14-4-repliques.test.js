// V14.4 — équipe gameplay, point A2 : répliques des dirigeants COMPOSÉES (ouverture + fond + ton du trait + contexte
// réel), mémoire anti-répétition par dirigeant et par partie, déterministes, sans LLM ni réseau, en français correct.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { arkenV9Map as map } from '../src/map/arken-v9-map.js';
import { createGameState } from '../src/state/create-game-state.js';
import { resolveInterturn, setRelation } from '../src/domain/game-engine.js';
import { publishTalk, talkOptions, queueTalk } from '../src/domain/talk.js';
import { composeLine, contextFragments, composeFragmentLists, deName, alreadySaid, talkMemoryOf } from '../src/domain/talk-compose.js';
import { encodeSave, decodeSave } from '../src/persistence/save-codec.js';

const read = f => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
const NATIONS = map.nations.map(n => n.id);
function game({ seed = 'v14-4-paroles', ai = {} } = {}) {
  const s = createGameState({ map, playerNationId: 'valmorne', seed });
  for (const id of NATIONS) s.controllers[id] = ai[id] ? 'ai' : 'human';
  s.leaders = Object.fromEntries(Object.entries(ai).map(([id, archetype]) => [id, { archetype, revealed: false }]));
  return s;
}
const lists = composeFragmentLists();

test('répliques : ouverture (trait + ton) + fond + contexte réel, chute facultative', () => {
  const s = game({ ai: { oroel: 'conquerant' } });
  setRelation(s, { nationId: 'oroel', target: 'valmorne', type: 'war' });
  s.turn = 9; s.diplomacy.wars[0].started = 4;
  const core = 'Valmorne, vos frontières tremblent.';
  const text = composeLine(s, map, { from: 'oroel', to: 'valmorne', tone: 'hostile', core, keys: ['k'] });
  const opening = lists['ouverture.conquerant.hostile'].find(o => text.startsWith(`${o} `));
  assert.ok(opening, `ouverture du Conquérant : ${text}`);
  assert.ok(text.includes(` ${core} `), 'le fond est gardé tel quel');
  const ctx = contextFragments(s, map, { from: 'oroel', to: 'valmorne', tone: 'hostile' });
  assert.ok(ctx.some(c => text.includes(c.text)), `au moins un élément de contexte : ${text}`);
  assert.ok(ctx.some(c => c.id === 'guerre' && /5 tours que nos nations sont en guerre/.test(c.text)), 'durée réelle de la guerre');
  assert.ok(ctx.some(c => c.id === 'tour' && /tour 9/.test(c.text)));
  assert.ok(ctx.some(c => c.id === 'face'), 'provinces qui se font face (Nordhème ↔ Branvale)');
  assert.ok(ctx.some(c => c.id === 'provinces' && /Vous tenez 4 provinces, nous 4/.test(c.text)));
  // Le joueur (sans trait) a ses propres ouvertures ; un Héros parle autrement qu'un Conquérant.
  const mine = talkOptions(s, map, { from: 'valmorne', to: 'oroel' });
  for (const o of mine) assert.ok(lists[`ouverture.joueur.${o.tone}`].some(x => o.text.startsWith(x)), o.text);
  s.leaders.oroel.archetype = 'heros';
  assert.ok(lists['ouverture.heros.hostile'].some(x => composeLine(s, map, { from: 'oroel', to: 'valmorne', tone: 'hostile', core, keys: ['k'] }).startsWith(x)));
});

test('répliques : contexte vrai et brouillard respecté (troupes citées seulement si les deux les voient)', () => {
  const s = game({ ai: { oroel: 'batisseur', aurel: 'heros' } });
  // Solmara et Valmorne ne se voient pas : aucun nombre de troupes.
  const far = contextFragments(s, map, { from: 'aurel', to: 'valmorne', tone: 'neutre' });
  assert.ok(!far.some(c => c.id === 'nos-troupes' || c.id === 'vos-troupes'));
  // Valmorne stationne des troupes à Branvale (p03), voisine de rien chez Oroël par la terre : Nordhème n'est pas vue.
  assert.ok(!contextFragments(s, map, { from: 'valmorne', to: 'oroel', tone: 'neutre' }).some(c => c.id === 'vos-troupes'));
  // Alliance : vision partagée → troupes citées, arrondies.
  setRelation(s, { nationId: 'valmorne', target: 'oroel', type: 'alliance' });
  s.provinces.p14.units.infantry = 137; s.turn = 6; s.diplomacy.treaties[0].started = 5;
  const ctx = contextFragments(s, map, { from: 'oroel', to: 'valmorne', tone: 'neutre' });
  assert.ok(ctx.some(c => c.id === 'alliance' && c.text === 'Notre alliance tient depuis 1 tour.'), 'singulier');
  const troops = ctx.find(c => c.id === 'nos-troupes');
  assert.ok(troops, 'vision partagée par l’alliance : troupes citées');
  const n = Number(troops.text.match(/gardée par (\d+) de nos soldats/)[1]);
  assert.ok(n % 10 === 0 && n >= 130, `nombre arrondi : ${troops.text}`);
  s.diplomacy.treaties[0].started = 6;
  assert.ok(contextFragments(s, map, { from: 'oroel', to: 'valmorne', tone: 'amical' }).some(c => c.text === 'Notre alliance vient d’être conclue, c’est une fierté.'), 'jamais « 0 tour »');
  s.turn = 77;
  assert.ok(contextFragments(s, map, { from: 'oroel', to: null, tone: 'neutre' }).some(c => c.text === 'Plus que 3 tours avant la fin : chacun fait ses comptes.'));
});

test('répliques : mémoire — un dirigeant ne redit jamais la même phrase dans la partie', () => {
  const s = game({ ai: { oroel: 'traitre' } });
  const said = new Set();
  for (let i = 0; i < 60; i++) {
    const text = composeLine(s, map, { from: 'oroel', to: 'valmorne', tone: 'amical', core: 'Valmorne, toujours ravis.', keys: ['même'] });
    assert.ok(!said.has(text), `répétition au message ${i} : ${text}`);
    said.add(text);
    publishTalk(s, { from: 'oroel', to: 'valmorne', tone: 'amical', text, core: 'Valmorne, toujours ravis.', ai: true });
    assert.ok(alreadySaid(s, 'oroel', text));
  }
  // Un autre dirigeant n'est pas gêné par la mémoire d'Oroël.
  assert.equal(alreadySaid(s, 'aurel', [...said][0]), false);
});

test('répliques : 80 tours IA contre IA — aucune phrase redite par un même dirigeant, contexte toujours présent', () => {
  for (const seed of ['compo-1', 'compo-2', 'compo-3']) {
    const s = createGameState({ map, playerNationId: 'valmorne', seed });
    for (const id of NATIONS) s.controllers[id] = 'ai';
    const byLeader = {};
    let total = 0;
    for (let i = 0; i < 80 && !s.gameOver; i++) {
      const n = s.events.length;
      resolveInterturn(s, map);
      for (const e of s.events.slice(n).filter(x => x.type === 'talk')) {
        total++;
        const set = (byLeader[e.nationId] ||= new Set());
        assert.ok(!set.has(e.text), `${seed} : ${e.nationId} redit « ${e.text} »`);
        set.add(e.text);
        assert.doesNotMatch(e.text, /[{}]|undefined|NaN|\b0 tour\b|  /, e.text);
        assert.ok(e.text.length <= 250, `${e.text.length} caractères`);
        assert.match(e.text, /tour|guerre|alliance|trêve|tension|province|soldats|voisines|frontière|fait face/, `contexte : ${e.text}`);
      }
    }
    assert.ok(total > 20, `${seed} : ${total} messages`);
  }
});

test('répliques : déterministes (même graine, mêmes messages) ; ancienne sauvegarde sans mémoire', () => {
  const run = seed => { const s = createGameState({ map, playerNationId: 'valmorne', seed }); for (const id of NATIONS) s.controllers[id] = 'ai'; for (let i = 0; i < 25; i++) resolveInterturn(s, map); return s.talk.map(m => m.text); };
  assert.deepEqual(run('det-v144'), run('det-v144'));
  // Ancienne sauvegarde (V14.3) : pas de talkMemory → se charge, se joue, la mémoire se crée.
  const s = game({ ai: { oroel: 'conquerant', aurel: 'heros' } });
  for (let i = 0; i < 3; i++) resolveInterturn(s, map);
  delete s.talkMemory;
  const old = decodeSave(encodeSave(s));
  assert.equal(old.talkMemory, undefined);
  assert.equal(queueTalk(old, map, { from: 'valmorne', to: 'oroel', tone: 'hostile' }).ok, true);
  for (let i = 0; i < 3; i++) resolveInterturn(old, map);
  assert.ok(talkMemoryOf(old, 'valmorne').said.length >= 1, 'message du joueur retenu');
  assert.ok(decodeSave(encodeSave(old)).talkMemory.valmorne.said.length >= 1, 'mémoire sauvegardée');
  // Mémoire abîmée : réparée sans erreur.
  old.talkMemory = { oroel: 'n’importe quoi' };
  assert.deepEqual(talkMemoryOf(old, 'oroel'), { said: [], cores: [] });
});

test('répliques : français soigné (apostrophes, élisions, ponctuation) ; aucun LLM, aucun réseau', () => {
  for (const [path, list] of Object.entries(lists)) {
    assert.ok(list.length >= 3, path);
    assert.equal(new Set(list).size, list.length, `${path} : doublon`);
    for (const l of list) {
      assert.ok(l.length <= 45, `${path} : ${l}`);
      assert.match(l, /[.!?]$/, `${path} : ${l}`);
      assert.doesNotMatch(l, /'/, `${path} apostrophe droite : ${l}`);
      assert.doesNotMatch(l, /[^\s][?!:;]/, `${path} espace avant la ponctuation : ${l}`);
      assert.doesNotMatch(l, /marchand|commerc|idiot|imbécile|crétin|lâche/i, l);
    }
  }
  assert.equal(deName('Îlebrume'), 'd’Îlebrume');
  assert.equal(deName('Aurorelle'), 'd’Aurorelle');
  assert.equal(deName('Haut-Bois'), 'de Haut-Bois');
  assert.equal(deName('Branvale'), 'de Branvale');
  const src = read('src/domain/talk-compose.js');
  assert.doesNotMatch(src, /fetch\(|XMLHttpRequest|https?:\/\/|WebSocket|Math\.random/);
});
