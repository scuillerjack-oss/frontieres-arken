// V15.2 : corrections héritées de la V15.1 (coalition) ; plan d'animation entre les tours ; moteur de sons.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { arkenV9Map as map } from '../src/map/arken-v9-map.js';
import { createGameState } from '../src/state/create-game-state.js';
import { journalEntry, proposalsToAnswer, resolveInterturn } from '../src/domain/game-engine.js';
import { updateCoalition } from '../src/domain/engine/coalition.js';
import { coalitionBanner, coalitionDetails, coalitionPopups } from '../src/presentation/coalition-view.js';
import { MAX_ANIMATION_MS, MAX_EFFECTS, endSound, planTurnAnimation, soundCues } from '../src/presentation/turn-animation.js';
import { MELODY, SOUNDS, createSoundEngine } from '../src/presentation/sound-engine.js';
import { visibleProvinces } from '../src/domain/vision.js';
import { readSource, root } from './helpers/sources.js';

const NATIONS = map.nations.map(n => n.id);
const game = (player = 'valmorne') => { const s = createGameState({ map, playerNationId: player, seed: 'v152' }); s.turn = 20; return s; };
const setArch = (s, id, arch) => { s.leaders[id].archetype = arch; };
const give = (s, id, list) => { for (const p of list) s.provinces[p].ownerId = id; };
const name = id => id;
/** Valmorne (le joueur) tient 8 provinces : la coalition se forme contre lui. */
const dominate = s => { const others = Object.keys(s.provinces).filter(p => s.provinces[p].ownerId !== 'valmorne').slice(0, 4); give(s, 'valmorne', others); };

// --- Coalition vide ---------------------------------------------------------------------------------------------------
test('coalition : dissoute (raison « deserted ») quand elle perd son dernier membre, sans phrase sans sujet', () => {
  const s = game(); dominate(s);
  for (const id of NATIONS.slice(1)) setArch(s, id, 'heros');
  updateCoalition(s); assert.ok(s.coalition?.members.length);
  for (const id of s.coalition.members) s.diplomacy.treaties.push({ type: 'ceasefire', parties: [id, 'valmorne'], active: true, started: s.turn });
  updateCoalition(s);
  assert.equal(s.coalition, null);
  const e = s.events.find(x => x.type === 'coalition-dissolved');
  assert.equal(e.reason, 'deserted');
  assert.match(journalEntry(e, map, 'valmorne').text, /Plus personne ne fait front contre vous/);
  assert.match(coalitionPopups([e], s, name)[0].lead, /Plus personne/);
  assert.equal(coalitionBanner(s, name), null);
});
test('coalition vide d’une sauvegarde V15.1 : ni bandeau ni détail, et dissoute au tour suivant', () => {
  const s = game(); dominate(s);
  for (const id of NATIONS.slice(1)) { setArch(s, id, 'batisseur'); s.diplomacy.treaties.push({ type: 'ceasefire', parties: [id, 'valmorne'], active: true, started: s.turn }); }
  s.coalition = { target: 'valmorne', since: 15, members: [] };
  assert.equal(coalitionBanner(s, name), null); assert.equal(coalitionDetails(s, name), null);
  updateCoalition(s);
  assert.equal(s.coalition, null);
});
test('en jeu réel, aucune coalition ne reste jamais à 0 membre', () => {
  for (let g = 0; g < 8; g++) {
    const s = createGameState({ map, playerNationId: NATIONS[g % 5], seed: `fin-${g}` });
    for (const id of NATIONS) s.controllers[id] = 'ai';
    for (let i = 0; i < 80 && !s.gameOver; i++) { resolveInterturn(s, map); if (s.coalition) assert.ok(s.coalition.members.length > 0, `tour ${s.turn}`); }
  }
});

// --- Pas d'alliance proposée par un membre ------------------------------------------------------------------------------
test('un membre de la coalition contre le joueur ne lui propose pas d’alliance ; une offre qui croise la formation est retirée', () => {
  const s = game(); dominate(s);
  for (const id of NATIONS.slice(1)) setArch(s, id, 'heros');
  s.talk = [{ id: 't1', from: 'oroel', to: 'valmorne', text: 'Alliés ?' }]; s.talkPending = { valmorne: ['t1'] };
  s.diplomacy.proposals = [{ from: 'oroel', to: 'valmorne', action: 'alliance', turn: s.turn, talkId: 't1' }];
  assert.equal(proposalsToAnswer(s, 'valmorne').length, 1, 'avant la coalition, l’offre est valable');
  updateCoalition(s);
  assert.ok(s.coalition.members.includes('oroel'));
  assert.equal(proposalsToAnswer(s, 'valmorne').length, 0);
  assert.equal(s.diplomacy.proposals.length, 0);
  assert.equal(s.talk.length, 0); assert.deepEqual(s.talkPending.valmorne, []);
});
test('proposalsToAnswer filtre aussi une offre encore stockée (sauvegarde) d’un membre, mais garde une trêve', () => {
  const s = game();
  s.coalition = { target: 'valmorne', since: 15, members: ['oroel'] };
  s.diplomacy.wars.push({ participants: ['oroel', 'valmorne'], active: true, started: 12 });
  s.diplomacy.proposals = [{ from: 'oroel', to: 'valmorne', action: 'alliance', turn: s.turn }, { from: 'oroel', to: 'valmorne', action: 'ceasefire', turn: s.turn }];
  assert.deepEqual(proposalsToAnswer(s, 'valmorne').map(p => p.action), ['ceasefire']);
});
test('sur de vraies parties : jamais d’offre d’alliance visible d’un membre vers le joueur', () => {
  for (let g = 0; g < 10; g++) {
    const s = createGameState({ map, playerNationId: NATIONS[g % 5], seed: `offre-${g}` }), me = s.playerNationId;
    give(s, me, Object.keys(s.provinces).filter(p => s.provinces[p].ownerId !== me).slice(0, 5));
    for (let i = 0; i < 40 && !s.gameOver; i++) {
      resolveInterturn(s, map);
      for (const p of proposalsToAnswer(s, me)) if (p.action === 'alliance') assert.ok(!s.coalition || s.coalition.target !== me || !s.coalition.members.includes(p.from));
    }
  }
});

test('l’IA elle-même : un membre n’envoie aucune offre d’alliance à la cible de la coalition déjà formée', () => {
  let tours = 0;
  for (let g = 0; g < 12; g++) {
    const s = createGameState({ map, playerNationId: NATIONS[g % 5], seed: `membre-${g}` }), me = s.playerNationId;
    give(s, me, Object.keys(s.provinces).filter(p => s.provinces[p].ownerId !== me).slice(0, 5));
    for (const id of NATIONS) if (id !== me) setArch(s, id, 'heros');
    for (const id of NATIONS.filter(x => x !== me).slice(0, 2)) setArch(s, id, 'traitre'); // le Traître courtise volontiers
    for (let i = 0; i < 40 && !s.gameOver; i++) {
      const members = s.coalition?.target === me ? [...s.coalition.members] : [], from = s.events.length;
      if (members.length) tours++;
      resolveInterturn(s, map);
      const offers = s.events.slice(from).filter(e => e.type === 'diplomatic-action' && e.action === 'alliance' && e.proposal && e.target === me);
      for (const e of offers) assert.ok(!members.includes(e.nationId), `${e.nationId} au tour ${e.turn}`);
    }
  }
  assert.ok(tours > 0, 'le test a bien vu des coalitions');
});
test('quota d’attaques : hors quota réservé au Conquérant et au Traître, comme le dit le cahier', () => {
  assert.match(readSource('src/domain/engine/ai.js'), /launched >= \(ARCH_ATTACKS\[arch\] \|\| 1\) && !\(\(arch === 'conquerant' \|\| arch === 'traitre'\) && ambitionOf/);
});

// --- Plan d'animation -----------------------------------------------------------------------------------------------
const names = { nation: name, province: name };
test('plan : vide sans événement, et plafonné quel que soit le nombre d’événements', () => {
  const s = game();
  assert.equal(planTurnAnimation([], s, map, names).total, 0);
  const many = Array.from({ length: 200 }, (_, i) => ({ type: i % 2 ? 'conquest' : 'battle', provinceId: `p${String(i % 20 + 1).padStart(2, '0')}`, attacker: 'oroel', newOwnerId: 'oroel', defender: 'aurel', originIds: [] }));
  const p = planTurnAnimation(many, s, map, names);
  assert.ok(p.total > 0 && p.total <= MAX_ANIMATION_MS, `${p.total}`);
  assert.ok(p.steps.length <= MAX_EFFECTS);
  for (const x of p.steps) assert.ok(x.at + x.duration <= MAX_ANIMATION_MS);
});
test('plan : le brouillard tient : mouvement étranger jamais montré, origine invisible jamais dessinée', () => {
  const s = game('valmorne'), visible = visibleProvinces(s, map, 'valmorne');
  const hidden = map.provinces.find(p => !visible.has(p.id) && p.landConnections?.some(t => !visible.has(t)));
  assert.ok(hidden, 'une province hors de vue');
  const to = hidden.landConnections.find(t => !visible.has(t));
  const owner = s.provinces[hidden.id].ownerId;
  assert.equal(planTurnAnimation([{ type: 'movement', nationId: owner, fromId: hidden.id, toId: to, amount: 9 }], s, map, names).total, 0);
  const p = planTurnAnimation([{ type: 'conquest', attacker: owner, newOwnerId: owner, defender: s.provinces[to].ownerId, provinceId: to, originIds: [hidden.id] }], s, map, names);
  assert.equal(p.routes.length, 0, 'pas de trajet qui révèle d’où vient l’attaque');
  assert.equal(p.steps.length, 1, 'la conquête elle-même est publique');
});
test('plan : le joueur passe d’abord, un son par sorte, et son de fin selon le résultat', () => {
  const s = game();
  const evs = [
    ...Array.from({ length: 12 }, (_, i) => ({ type: 'battle', attacker: 'oroel', defender: 'aurel', provinceId: 'p19', originIds: [], i })),
    { type: 'conquest', attacker: 'valmorne', newOwnerId: 'valmorne', defender: 'oroel', provinceId: 'p13', originIds: ['p03'] },
    { type: 'betrayal', nationId: 'oroel', target: 'aurel' }
  ];
  const p = planTurnAnimation(evs, s, map, names);
  assert.equal(p.steps[0].text, 'Vous prenez p13');
  assert.ok(p.routes.some(r => r.mine));
  assert.deepEqual([...p.sounds].sort(), ['battle', 'betrayal', 'conquest']);
  assert.equal(soundCues(p).length, 3);
  assert.equal(endSound({ winnerId: 'valmorne', reason: 'turns' }, 'valmorne'), 'victory');
  assert.equal(endSound({ winnerId: 'oroel', reason: 'capitals' }, 'valmorne'), 'defeat');
  assert.equal(endSound({ winnerId: 'valmorne', reason: 'player-eliminated' }, 'valmorne'), 'defeat');
});
test('plan : ne modifie ni les événements ni la partie', () => {
  const s = createGameState({ map, playerNationId: 'valmorne', seed: 'pur' });
  for (let i = 0; i < 15; i++) resolveInterturn(s, map);
  const before = JSON.stringify(s);
  planTurnAnimation(s.events, s, map, names);
  assert.equal(JSON.stringify(s), before);
});
test('turn-flow : animation attendue avant les fenêtres, jamais en tutoriel ; une seule fin de tour à la fois ; moteur sans animation', () => {
  const flow = readSource('src/presentation/ui/turn-flow.js');
  assert.ok(flow.indexOf('playTurnAnimation(events)') < flow.indexOf('await showCapitalPopups(events)'));
  assert.match(flow, /!isTutorial\(state\)&&miniStep===null&&tutoStep===null/);
  assert.match(flow, /if\(turnAnimating\(\)\)return/);
  const anim = readSource('src/presentation/ui/turn-anim.js');
  assert.match(anim, /visibilitychange/); assert.match(anim, /pagehide/);
  assert.match(anim, /prefers-reduced-motion/);
  assert.doesNotMatch(anim, /requestAnimationFrame/, 'gelé en arrière-plan : la fin ne doit pas en dépendre');
  assert.doesNotMatch(anim, /addEventListener\('pointerdown', *\(\) => *\{? *finish/, 'un appui ne doit pas atteindre la fenêtre suivante');
  assert.doesNotMatch(readSource('src/domain/game-engine.js'), /playSfx|AudioContext|turn-anim/);
});
test('fichiers : nouveaux modules dans ASSETS, aucun fichier audio', () => {
  const sw = readFileSync(join(root, 'sw.js'), 'utf8');
  for (const f of ['src/presentation/turn-animation.js', 'src/presentation/sound-engine.js', 'src/presentation/ui/turn-anim.js']) assert.ok(sw.includes(`'./${f}'`), f);
  assert.doesNotMatch(sw, /\.(mp3|ogg|wav|m4a)/);
  assert.equal(JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version, '15.2.0');
});

// --- Moteur de sons, avec un faux Web Audio ---------------------------------------------------------------------------
function fakeAudio({ state = 'running', rejectResume = false, throwOnNode = false } = {}) {
  const made = [];
  class Param { setValueAtTime() {} linearRampToValueAtTime() {} exponentialRampToValueAtTime() {} }
  const node = () => { if (throwOnNode) throw new Error('nœud impossible'); return { connect: x => x, disconnect() {}, start() { made.at(-1).started++; }, stop() {}, gain: Object.assign(new Param(), { value: 0 }), frequency: Object.assign(new Param(), { value: 0 }) }; };
  class Fake {
    constructor() { this.state = state; this.currentTime = 0; this.sampleRate = 8000; this.destination = {}; this.started = 0; this.suspended = 0; this.resumed = 0; made.push(this); }
    createOscillator() { return node(); } createGain() { return node(); } createBiquadFilter() { return node(); } createBufferSource() { return node(); }
    createBuffer(c, n) { return { getChannelData: () => new Float32Array(n) }; }
    resume() { this.resumed++; if (rejectResume) return Promise.reject(new Error('non')); this.state = 'running'; return Promise.resolve(); }
    suspend() { this.suspended++; this.state = 'suspended'; return Promise.resolve(); }
  }
  return { Fake, made };
}
const engineWith = (Ctor, settings = { sfx: true, music: false }, extra = {}) => {
  const timers = new Set();
  return { timers, engine: createSoundEngine({ getContextClass: () => Ctor, settings: () => settings, setTimer: f => { timers.add(f); return f; }, clearTimer: f => timers.delete(f), ...extra }) };
};
test('son : rien n’est créé avant un geste du joueur', () => {
  const { Fake, made } = fakeAudio(), { engine } = engineWith(Fake, { sfx: true, music: true });
  assert.equal(engine.play('battle'), false); engine.syncMusic();
  assert.equal(made.length, 0);
  engine.unlock();
  assert.equal(made.length, 1);
  assert.equal(engine.play('battle'), true);
});
test('son : tous les sons se jouent, avec réglage respecté', () => {
  const { Fake, made } = fakeAudio();
  const settings = { sfx: false, music: false }, { engine } = engineWith(Fake, settings);
  engine.unlock();
  assert.equal(engine.play('conquest'), false, 'Effets sonores coupés'); assert.equal(made[0].started, 0);
  settings.sfx = true;
  for (const nameOf of ['button', 'order', 'battle', 'conquest', 'betrayal', 'victory', 'defeat', 'turn']) { assert.ok(SOUNDS[nameOf], nameOf); for (const p of SOUNDS[nameOf]) assert.ok(p.v <= .25 && p.at + p.d < 3); }
  assert.equal(engine.play('inconnu'), false);
});
test('son : Mélodie calme suit le réglage ; elle se coupe en arrière-plan et reprend au retour', () => {
  const { Fake, made } = fakeAudio(), settings = { sfx: true, music: true };
  let hidden = false;
  const { engine, timers } = engineWith(Fake, settings, { isHidden: () => hidden });
  engine.unlock();
  assert.ok(engine.status.music); assert.equal(timers.size, 1); assert.ok(made[0].started > 0, 'des notes partent');
  hidden = true; engine.background();
  assert.equal(engine.status.music, false); assert.equal(timers.size, 0); assert.equal(made[0].state, 'suspended');
  assert.equal(engine.play('battle'), false, 'aucun son en arrière-plan');
  hidden = false; engine.foreground();
  assert.equal(made[0].state, 'running'); assert.ok(engine.status.music); assert.equal(timers.size, 1);
  settings.music = false; engine.syncMusic();
  assert.equal(engine.status.music, false); assert.equal(timers.size, 0);
  assert.ok(MELODY.every(([f, b]) => f >= 0 && b > 0));
});
test('son : Web Audio absent, cassé ou suspendu ne lève jamais d’erreur', async () => {
  for (const Ctor of [undefined, null, class { constructor() { throw new Error('interdit'); } }]) {
    const { engine } = engineWith(Ctor, { sfx: true, music: true });
    engine.unlock(); assert.equal(engine.play('battle'), false); engine.syncMusic(); engine.background(); engine.foreground(); engine.hold(true); engine.hold(false);
  }
  const blocked = fakeAudio({ state: 'suspended', rejectResume: true }), a = engineWith(blocked.Fake, { sfx: true, music: true });
  a.engine.unlock(); assert.equal(a.engine.play('battle'), false, 'suspendu : abandonné, pas empilé');
  assert.equal(blocked.made[0].started, 0);
  await new Promise(r => setTimeout(r, 0)); // un rejet de resume() non attrapé ferait échouer le test
  const nodes = fakeAudio({ throwOnNode: true }), b = engineWith(nodes.Fake, { sfx: true, music: true });
  b.engine.unlock(); assert.equal(b.engine.play('battle'), false);
  const noSettings = createSoundEngine({ getContextClass: () => blocked.Fake, settings: () => { throw new Error('pas de partie'); } });
  noSettings.unlock(); assert.equal(noSettings.play('battle'), false);
});
test('son : silence pendant une publicité', () => {
  const { Fake, made } = fakeAudio(), { engine } = engineWith(Fake, { sfx: true, music: true });
  engine.unlock(); engine.hold(true);
  assert.equal(engine.status.music, false); assert.equal(engine.play('battle'), false); assert.equal(made[0].state, 'suspended');
  engine.hold(false);
  assert.ok(engine.status.music); assert.equal(made[0].state, 'running');
});
