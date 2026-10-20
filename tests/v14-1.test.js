// V14.1 — cahier docs/V14-cahier-des-charges.md : décision de Jack (section 2), section 3 points 3 à 6, « À surveiller » V14.0.
//  1. Guerre automatique : des troupes qui combattent (même pour défendre un allié) mettent leur nation en guerre.
//  2. Bases navales face à face : l'IA attaque quand elle a l'avantage, ou cesse d'empiler.
//  3. L'IA prend un peu plus la mer, sans débarquement suicide (mémoire des garnisons, marge des capitales).
//  4. Anti-répétition des répliques entre dirigeants au même tour.
//  5. Carte centrée sur la capitale au lancement, bouton « Voir toute la carte ».
//  6. Trêve signée pendant le départ d'un convoi : demi-tour ; plus de va-et-vient des troupes en escale.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { queueMoveOrder, queueDiplomaticOrder, setRelation, resolveInterturn, journalEntry, planAIOrders, buildTurnJournal,
  stationedAt, eventKnownToPlayer, rememberedGarrison, GARRISON_MEMORY_TURNS, NAVAL_IDLE_CAP, STATION_MIN_TURNS, visibleProvinces } from '../src/domain/game-engine.js';
import { reputation, ensureLeaders } from '../src/domain/leaders.js';
import { pickLine, publishTalk, talkLineLists, allTalkLines, sameTurnTexts } from '../src/domain/talk.js';
import { RULES } from '../src/domain/constants.js';
import { launchView, wholeMapView, showsWholeMap, screenPoint, WHOLE_MAP_LABEL, LAUNCH_MAX_ZOOM } from '../src/presentation/v14-1-ux.js';
import { journalCategoryClass } from '../src/presentation/v5-ux.js';
import { arkenV9Map as map } from '../src/map/arken-v9-map.js';
import { createGameState } from '../src/state/create-game-state.js';
import { assertInvariants } from './helpers/fixtures.js';

const read = f => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
const NATIONS = map.nations.map(n => n.id);
const allied = (s, a, b) => s.diplomacy.treaties.some(t => t.active !== false && t.type === 'alliance' && t.parties.includes(a) && t.parties.includes(b));
const truce = (s, a, b) => s.diplomacy.treaties.some(t => t.active !== false && t.type === 'ceasefire' && t.parties.includes(a) && t.parties.includes(b));
const atWar = (s, a, b) => s.diplomacy.wars.some(w => w.active !== false && w.participants.includes(a) && w.participants.includes(b));
const units = (infantry = 0) => ({ infantry, cavalry: 0, armor: 0, artillery: 0 });
/** Partie V9 où toutes les nations sont « humaines » (aucune IA ne planifie), sauf celles listées. */
function game({ ai = [], player = 'aurel', seed = 'v14-1' } = {}) {
  const s = createGameState({ map, playerNationId: player, seed });
  for (const id of NATIONS) s.controllers[id] = ai.includes(id) ? 'ai' : 'human';
  ensureLeaders(s);
  return s;
}
/** Province p05 (Roc-Épine, alliée de Valmorne) défendue par des troupes de `guest`, attaquée par Noireflamme depuis p07. */
function defenseScenario(guest = 'valmorne', { attackers = 150, guests = 200 } = {}) {
  const s = game({ player: 'valmorne' });
  setRelation(s, { nationId: guest, target: 'roc-epine', type: 'alliance' });
  s.provinces.p05.units = units(100); s.provinces.p05.buildings.fort = 0;
  s.stationed = [{ nationId: guest, provinceId: 'p05', units: units(guests), warships: 0, wounds: {} }];
  s.provinces.p07.ownerId = 'noireflamme'; s.provinces.p07.units = units(attackers);
  s.orders.push({ id: 'x1', kind: 'move', nationId: 'noireflamme', fromId: 'p07', toId: 'p05', units: units(attackers), warships: 0, routeType: 'land', status: 'pending', turn: s.turn });
  return s;
}

// --- 1. Guerre automatique -----------------------------------------------------------------------------------------
test('guerre automatique : vos troupes défendent un allié → vous êtes en guerre avec l\'assaillant, ligne claire au journal', () => {
  const s = defenseScenario('valmorne');
  assert.ok(!atWar(s, 'valmorne', 'noireflamme'));
  resolveInterturn(s, map);
  assert.ok(atWar(s, 'valmorne', 'noireflamme'), 'Valmorne en guerre avec Noireflamme');
  assert.ok(atWar(s, 'roc-epine', 'noireflamme'));
  const ev = s.events.find(e => e.type === 'auto-war');
  assert.deepEqual([ev.nationId, ev.target, ev.provinceId, ev.host], ['valmorne', 'noireflamme', 'p05', 'roc-epine']);
  const mine = journalEntry(ev, map, 'valmorne');
  assert.match(mine.text, /^⚔ Vos troupes ont combattu Noireflamme : vous êtes désormais en guerre avec Noireflamme\./);
  assert.match(mine.text, /à Roc-Épine \(en défendant Roc-Épine\)/);
  assert.equal(mine.public, true);
  assert.equal(journalCategoryClass(mine.type), 'combat');
  // L'assaillant et les autres nations le lisent aussi.
  assert.match(journalEntry(ev, map, 'noireflamme').text, /^⚔ Les troupes de Valmorne ont combattu les vôtres à Roc-Épine.*Valmorne est désormais en guerre avec vous\./);
  assert.match(journalEntry(ev, map, 'oroel').text, /^⚔ Les troupes de Valmorne ont combattu Noireflamme à Roc-Épine.*Valmorne est désormais en guerre avec Noireflamme\./);
  // Au journal du tour du joueur.
  assert.ok(s.turnJournal.some(e => e.type === 'GUERRE' && /Vos troupes ont combattu Noireflamme/.test(e.text)));
  // Pas une agression de Valmorne (elle se défendait) : ni trahison ni attaque comptée.
  assert.equal(reputation(s, 'valmorne').betrayals, 0);
  assert.ok(!(s.ai?.aggressions || []).some(a => a.attacker === 'valmorne'));
  assertInvariants(s, 'guerre auto');
});

test('guerre automatique : même règle pour les IA (troupes d\'Oroël stationnées chez Roc-Épine)', () => {
  const s = defenseScenario('oroel');
  s.controllers.oroel = 'ai'; ensureLeaders(s);
  s.ai.plannedTurn = s.turn; // on garde seulement l'attaque préparée
  resolveInterturn(s, map);
  assert.ok(atWar(s, 'oroel', 'noireflamme'));
  const ev = s.events.find(e => e.type === 'auto-war');
  assert.equal(ev.nationId, 'oroel');
  assert.match(journalEntry(ev, map, 'valmorne').text, /⚔ Les troupes d’Oroël ont combattu Noireflamme à Roc-Épine.*Oroël est désormais en guerre avec Noireflamme/);
  assert.ok(eventKnownToPlayer(s, map, ev), 'connu de tous (public)');
  // Une seule ligne par paire, et rien si la guerre existait déjà.
  const t = defenseScenario('oroel');
  setRelation(t, { nationId: 'oroel', target: 'noireflamme', type: 'war' });
  t.ai.plannedTurn = t.turn;
  resolveInterturn(t, map);
  assert.ok(!t.events.some(e => e.type === 'auto-war'));
});

test('guerre automatique : une trêve avec l\'assaillant est rompue de fait, SANS trahison', () => {
  const s = defenseScenario('valmorne');
  setRelation(s, { nationId: 'valmorne', target: 'noireflamme', type: 'war' });
  setRelation(s, { nationId: 'valmorne', target: 'noireflamme', type: 'ceasefire' }); // trêve de ce tour : rompre = trahison d'habitude
  resolveInterturn(s, map);
  assert.ok(!truce(s, 'valmorne', 'noireflamme'), 'trêve rompue');
  assert.ok(atWar(s, 'valmorne', 'noireflamme'));
  assert.ok(!s.events.some(e => e.type === 'betrayal' && e.nationId === 'valmorne'), 'pas de trahison de Valmorne');
  assert.equal(reputation(s, 'valmorne').betrayals, 0);
  const ev = s.events.find(e => e.type === 'auto-war');
  assert.equal(ev.brokeTruce, true);
  assert.match(journalEntry(ev, map, 'valmorne').text, /La trêve avec Noireflamme est rompue, sans trahison : vous vous défendiez\./);
});

test('guerre automatique : deux alliés ne se combattent jamais (le contingent allié de l\'assaillant reste à l\'écart)', () => {
  const s = defenseScenario('valmorne');
  setRelation(s, { nationId: 'valmorne', target: 'noireflamme', type: 'alliance' });
  const before = JSON.stringify(stationedAt(s, 'p05', 'valmorne').units);
  resolveInterturn(s, map);
  assert.ok(allied(s, 'valmorne', 'noireflamme') && allied(s, 'valmorne', 'roc-epine'), 'alliances intactes');
  assert.ok(!atWar(s, 'valmorne', 'noireflamme'));
  assert.ok(!s.events.some(e => e.type === 'auto-war'));
  const b = s.events.find(e => (e.type === 'battle' || e.type === 'conquest') && e.provinceId === 'p05');
  assert.ok(!(b.guests || []).includes('valmorne'), 'Valmorne n\'a pas combattu');
  // Ses troupes n'ont rien perdu (province tenue) ou restent chez Noireflamme, son alliée (province prise).
  const e = stationedAt(s, 'p05', 'valmorne');
  assert.ok(e, 'toujours stationnées (allié des deux camps)');
  assert.equal(JSON.stringify(e.units), before);
  assertInvariants(s, 'alliés');
});

test('guerre automatique : une nation éliminée ne fait pas planter le jeu (ancienne sauvegarde)', () => {
  const s = defenseScenario('oroel');
  s.nations.oroel.eliminated = true;
  for (const p of Object.values(s.provinces)) if (p.ownerId === 'oroel') p.ownerId = 'noireflamme';
  assert.doesNotThrow(() => resolveInterturn(s, map));
  assert.ok(!s.events.some(e => e.type === 'auto-war'));
  assert.ok(!s.diplomacy.wars.some(w => w.participants.includes('oroel')));
  assert.ok(!stationedAt(s, 'p05', 'oroel'), 'contingent dispersé');
  assert.doesNotThrow(() => buildTurnJournal(s, map, 0));
  // Et une partie où la nation défendue est éliminée pendant le combat : rien ne plante non plus.
  const t = defenseScenario('valmorne', { attackers: 3000, guests: 5 });
  for (const id of ['p06', 'p07', 'p08']) t.provinces[id].ownerId = 'noireflamme';
  assert.doesNotThrow(() => { resolveInterturn(t, map); resolveInterturn(t, map); });
  assert.ok(t.nations['roc-epine'].eliminated);
  assert.ok(atWar(t, 'valmorne', 'noireflamme'));
  assertInvariants(t, 'éliminée');
});

// --- 2. Bases navales face à face -----------------------------------------------------------------------------------
/** Valmorne (IA) a une base navale à Branvale (p03), face à Nordhème (p14), base d'Oroël. */
function navalScenario({ ours = 8, theirs = 2, arch = 'conquerant', war = true } = {}) {
  const s = game({ ai: ['valmorne'] });
  s.leaders.valmorne.archetype = arch;
  if (war) setRelation(s, { nationId: 'valmorne', target: 'oroel', type: 'war' });
  Object.assign(s.provinces.p03.buildings, { port: 1, factory: 1 });
  s.provinces.p03.warships = ours; s.provinces.p03.units = units(10);
  Object.assign(s.provinces.p14.buildings, { port: 1 });
  s.provinces.p14.warships = theirs; s.provinces.p14.units = units(400);
  s.nations.valmorne.treasury = 0;
  // Valmorne connaît la garnison de Nordhème (assaut repoussé) : pas de débarquement, seulement la flotte.
  s.ai.seenGarrisons = { valmorne: { p14: { turn: s.turn, owner: 'oroel', units: { ...units(400), warship: theirs } } } };
  return s;
}
test('base navale ennemie face à face : avec l\'avantage, l\'IA l\'attaque (et rentre ensuite)', () => {
  const s = navalScenario();
  planAIOrders(s, map);
  const o = s.orders.find(x => x.kind === 'move' && x.nationId === 'valmorne' && x.navalStrike);
  assert.ok(o, 'attaque de la base navale');
  assert.deepEqual([o.fromId, o.toId, o.warships], ['p03', 'p14', 7], 'flotte libre, un navire reste au port');
  for (let i = 0; i < 2; i++) resolveInterturn(s, map);
  const ev = s.events.find(e => e.type === 'interception' && e.strike);
  assert.ok(ev, 'bataille navale devant le port');
  assert.equal(s.provinces.p14.warships, 0, 'flotte du port coulée');
  assert.match(journalEntry(ev, map, 'valmorne').text, /Bataille navale devant le port de Nordhème : la flotte de Valmorne attaque la base navale d’Oroël ; la flotte du port est détruite/);
  assert.ok(s.transports.some(t => t.nationId === 'valmorne' && t.toId === 'p03' && t.returning), 'la flotte rentre');
  assert.equal(s.provinces.p14.ownerId, 'oroel', 'pas de débarquement (pas de troupes)');
  assertInvariants(s, 'frappe navale');
});
test('base navale ennemie : sans l\'avantage, ou hors guerre, pas d\'attaque', () => {
  for (const opts of [{ ours: 4, theirs: 4 }, { ours: 8, theirs: 8 }, { ours: 2, theirs: 0 }, { war: false }]) {
    const s = navalScenario(opts);
    planAIOrders(s, map);
    assert.ok(!s.orders.some(x => x.kind === 'move' && x.navalStrike), JSON.stringify(opts));
  }
});
test('bases navales : sans côte à viser par la mer, l\'IA cesse d\'empiler les navires', () => {
  assert.equal(NAVAL_IDLE_CAP, 4);
  const recruits = (s) => s.orders.filter(o => o.kind === 'recruitment' && o.type === 'warship' && o.nationId === 'valmorne');
  for (const arch of ['heros', 'batisseur', 'conquerant']) {
    // En paix, aucune cible : flotte de 4 → plus de navires, même avec un trésor plein.
    const s = navalScenario({ ours: NAVAL_IDLE_CAP, theirs: 0, arch, war: false });
    s.nations.valmorne.treasury = 3000; s.turn = 40;
    s.leaders.valmorne.archetype = arch;
    if (arch === 'conquerant') for (const n of ['roc-epine', 'oroel']) setRelation(s, { nationId: 'valmorne', target: n, type: 'alliance' }); // aucune proie
    planAIOrders(s, map);
    assert.equal(recruits(s).length, 0, `${arch} : pas de navire de plus`);
  }
  // En guerre avec la nation d'en face : la flotte grandit encore (plafond selon le tour).
  const w = navalScenario({ ours: NAVAL_IDLE_CAP, theirs: 9 });
  w.nations.valmorne.treasury = 3000; w.turn = 40;
  planAIOrders(w, map);
  assert.ok(recruits(w).length > 0, 'en guerre : la flotte grandit');
});

// --- 3. L'IA prend un peu plus la mer, sans débarquement suicide ------------------------------------------------------
test('marges de débarquement : plus basses qu\'en V14.0, sauf vers une capitale', () => {
  assert.equal(RULES.ai.landingExtraMargin, .1);
  assert.equal(RULES.ai.capitalLandingMargin, .35);
  assert.ok(RULES.ai.capitalLandingMargin > .25, 'capitales : plus prudent qu\'avant (0,25)');
  assert.equal(RULES.ai.stagingFactor, .5);
});
test('mémoire des garnisons : après un débarquement repoussé, l\'IA ne retente pas à l\'aveugle', () => {
  const s = game({ ai: [] });
  setRelation(s, { nationId: 'valmorne', target: 'oroel', type: 'war' });
  s.provinces.p03.units = units(300); s.provinces.p14.units = units(2000);
  assert.equal(queueMoveOrder(s, map, { nationId: 'valmorne', fromId: 'p03', toId: 'p14', units: { infantry: 250 } }).ok, true);
  for (let i = 0; i < 2; i++) resolveInterturn(s, map);
  assert.ok(s.events.some(e => e.type === 'battle' && e.provinceId === 'p14' && e.naval), 'débarquement repoussé');
  const mem = rememberedGarrison(s, 'valmorne', 'p14');
  assert.ok(mem && mem.units.infantry === 2000, 'garnison vue mémorisée');
  assert.ok(!visibleProvinces(s, map, 'valmorne').has('p14'), 'Nordhème reste invisible');
  // Une IA avec assez de troupes pour l'estimation prudente, mais pas pour la garnison vue : pas de nouveau débarquement.
  s.controllers.valmorne = 'ai'; ensureLeaders(s); s.leaders.valmorne.archetype = 'conquerant';
  s.provinces.p03.units = units(900); s.provinces.p03.warships = 2; s.provinces.p14.units = units(2000);
  s.ai.plannedTurn = null; planAIOrders(s, map);
  assert.ok(!s.orders.some(o => o.kind === 'move' && o.nationId === 'valmorne' && o.toId === 'p14'), 'pas de débarquement suicide');
  // Sans la mémoire, elle serait partie (preuve que c'est bien la mémoire qui la retient).
  const t = structuredClone(s); t.orders = []; delete t.ai.seenGarrisons; t.ai.plannedTurn = null;
  planAIOrders(t, map);
  assert.ok(t.orders.some(o => o.kind === 'move' && o.nationId === 'valmorne' && o.toId === 'p14'), 'sans mémoire : elle tenterait');
  // La mémoire s'oublie si la province change de main, ou après une partie entière.
  s.provinces.p14.ownerId = 'aurel';
  assert.equal(rememberedGarrison(s, 'valmorne', 'p14'), null);
  s.provinces.p14.ownerId = 'oroel'; s.turn += GARRISON_MEMORY_TURNS + 1;
  assert.equal(rememberedGarrison(s, 'valmorne', 'p14'), null);
});

// --- 4. Anti-répétition entre dirigeants ------------------------------------------------------------------------------
test('répliques : deux dirigeants n\'envoient pas la même réplique au même tour', () => {
  const s = game({ ai: ['oroel', 'aurel'] });
  const list = talkLineLists()['ai.conquerorThreat'];
  const first = pickLine(s, list, 'oroel', 'k', 7);
  publishTalk(s, { from: 'oroel', to: 'valmorne', tone: 'hostile', text: first.replaceAll('{to}', 'Valmorne'), ai: true });
  assert.equal(sameTurnTexts(s, 'aurel').length, 1);
  assert.notEqual(pickLine(s, list, 'aurel', 'k', 7), first, 'même tirage, autre réplique');
  // Toutes les répliques déjà dites ce tour par d'autres sauf une : c'est elle.
  const short = list.slice(0, 3);
  const t = game();
  for (const [i, l] of short.slice(0, 2).entries()) publishTalk(t, { from: ['oroel', 'noireflamme'][i], to: 'valmorne', tone: 'hostile', text: l.replaceAll('{to}', 'Valmorne'), ai: true });
  for (let k = 0; k < 10; k++) assert.equal(pickLine(t, short, 'aurel', 'k', k), short[2]);
});
test('simulation : jamais deux fois la même réplique au même tour entre deux nations', () => {
  const lines = allTalkLines().map(l => new RegExp(`^${l.split(/\{(?:to|from|gold|x|p)\}/g).map(p => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.+?')}$`));
  let dup = 0, said = 0;
  for (const seed of ['r1', 'r2', 'r3', 'r4']) {
    const s = createGameState({ map, playerNationId: 'valmorne', seed: `v141-${seed}` });
    for (const id of NATIONS) s.controllers[id] = 'ai';
    for (let i = 0; i < 40; i++) {
      resolveInterturn(s, map);
      const msgs = s.talk.filter(m => m.turn === s.turn - 1);
      said += msgs.length;
      for (let a = 0; a < msgs.length; a++) for (let b = a + 1; b < msgs.length; b++) {
        if (msgs[a].from === msgs[b].from) continue;
        const re = lines.find(r => r.test(msgs[a].text));
        if (re && re.test(msgs[b].text)) dup++;
      }
    }
  }
  assert.ok(said > 50, `${said} répliques`);
  assert.equal(dup, 0);
});

// --- 5. Carte centrée sur la capitale au lancement ----------------------------------------------------------------------
test('carte au lancement : la capitale du joueur est au centre de l\'écran du téléphone', () => {
  const frame = map.frame, viewport = { width: 390, height: 660 };
  const cover = Math.max(viewport.width / frame.width, viewport.height / frame.height);
  const content = { width: frame.width * cover, height: frame.height * cover };
  for (const n of map.nations) {
    const capital = map.provinces.find(p => p.id === createGameState({ map, playerNationId: n.id }).nations[n.id].capitalId);
    const view = launchView({ anchor: capital.markerAnchor, frame, viewport, content });
    assert.ok(view.scale >= 1 && view.scale <= LAUNCH_MAX_ZOOM, `${n.id} zoom ${view.scale}`);
    const at = screenPoint({ point: capital.markerAnchor, frame, viewport, content, view });
    // Centrée ; une capitale collée au bord de la carte (Valmorne, Glacenoire : tout en haut) reste à moins de 15 % de la
    // hauteur du centre (zoom limité à 1,5 pour garder les voisins en vue, glisse limitée à la marge habituelle du doigt).
    assert.ok(Math.abs(at.x - viewport.width / 2) < 1, `${n.id} : x = ${Math.round(at.x)}`);
    assert.ok(Math.abs(at.y - viewport.height / 2) <= .15 * viewport.height, `${n.id} : y = ${Math.round(at.y)}`);
    if (!['valmorne', 'oroel'].includes(n.id)) assert.ok(Math.abs(at.y - viewport.height / 2) < 1, `${n.id} : exactement au centre`);
  }
  // Valmorne (à l'ouest) : avant la V14.1, le zoom 1 ne permettait pas de la centrer (la carte montrait l'ouest).
  const val = map.provinces.find(p => p.id === 'p01');
  assert.ok(launchView({ anchor: val.markerAnchor, frame, viewport, content }).scale > 1);
  // « Voir toute la carte » : zoom minimal, centré ; le bouton bascule ensuite vers la capitale.
  const minZoom = Math.min(viewport.width / frame.width, viewport.height / frame.height) / cover;
  assert.deepEqual(wholeMapView(minZoom), { scale: minZoom, x: 0, y: 0 });
  assert.equal(showsWholeMap(minZoom, minZoom), true);
  assert.equal(showsWholeMap(1.4, minZoom), false);
  assert.equal(WHOLE_MAP_LABEL, 'Voir toute la carte');
  const html = read('index.html'), app = read('app.js');
  assert.match(html, /<button id="wholeMapBtn" class="whole-map-btn">🗺 Voir toute la carte<\/button>/);
  assert.match(app, /requestAnimationFrame\(\(\)=>\{measureFrame\(\);render\(\);applyLaunchView\(\);/, 'au lancement (nouvelle partie et reprise)');
  assert.match(app, /\$\('#wholeMapBtn'\)\.onclick=/);
  assert.match(read('v5.css'), /\.whole-map-btn\{/);
  assert.match(read('sw.js'), /v14-1-ux\.js/);
});

// --- 6. « À surveiller » de la V14.0 ---------------------------------------------------------------------------------------
/** Valmorne en guerre avec Roc-Épine, un débarquement part de Sylvaren (p02) vers Roc-Épine (p05). */
function convoyScenario() {
  const s = game({ player: 'valmorne' });
  setRelation(s, { nationId: 'valmorne', target: 'roc-epine', type: 'war' });
  s.provinces.p02.units = units(600); s.provinces.p05.units = units(20); s.provinces.p05.buildings.fort = 0;
  s.nations['roc-epine'].treasury = 100;
  assert.equal(queueMoveOrder(s, map, { nationId: 'valmorne', fromId: 'p02', toId: 'p05', units: { infantry: 500 } }).ok, true);
  return s;
}
test('trêve signée dans le même inter-tour que le départ d\'un convoi : il fait demi-tour (pas de trahison)', () => {
  const s = convoyScenario();
  assert.equal(queueDiplomaticOrder(s, { nationId: 'valmorne', target: 'roc-epine', action: 'ceasefire', offerLevel: .25 }).ok, true);
  resolveInterturn(s, map, { random: () => 0 });
  assert.ok(truce(s, 'valmorne', 'roc-epine'), 'trêve signée');
  const c = s.transports.find(t => t.nationId === 'valmorne' && t.toId === 'p05');
  assert.ok(c && c.departed === s.turn - 1 && !c.truces.includes('roc-epine'), 'convoi parti avant la trêve, même tour');
  for (let i = 0; i < 2; i++) resolveInterturn(s, map);
  assert.ok(s.events.some(e => e.type === 'attack-cancelled' && e.reason === 'ceasefire' && e.provinceId === 'p05'), 'demi-tour');
  assert.ok(!s.events.some(e => e.type === 'betrayal'), 'avant la V14.1 : débarquement = trahison');
  assert.equal(s.provinces.p05.ownerId, 'roc-epine');
  assert.ok(truce(s, 'valmorne', 'roc-epine'), 'la trêve tient');
  // Convoi parti APRÈS la signature (trêve déjà connue) : violation délibérée, il débarque (trahison, règle V14.0).
  const t = game({ player: 'valmorne' });
  setRelation(t, { nationId: 'valmorne', target: 'roc-epine', type: 'war' });
  setRelation(t, { nationId: 'valmorne', target: 'roc-epine', type: 'ceasefire' });
  t.provinces.p02.units = units(600); t.provinces.p05.units = units(20); t.provinces.p05.buildings.fort = 0;
  assert.equal(queueMoveOrder(t, map, { nationId: 'valmorne', fromId: 'p02', toId: 'p05', units: { infantry: 500 } }).ok, true);
  for (let i = 0; i < 3; i++) resolveInterturn(t, map);
  assert.ok(t.events.some(e => e.type === 'betrayal' && e.truce && e.nationId === 'valmorne'));
});
test('simulation : avec les demi-tours de trêve, l\'IA réussit au moins 60 % de ses débarquements', () => {
  let landings = 0, wins = 0, turnBacks = 0;
  for (let g = 0; g < 30; g++) {
    const s = createGameState({ map, playerNationId: NATIONS[g % 5], seed: `v141-mer-${g}` });
    for (const id of NATIONS) s.controllers[id] = 'ai';
    for (let i = 0; i < 80; i++) resolveInterturn(s, map);
    for (const e of s.events) {
      if (e.naval && (e.type === 'battle' || e.type === 'conquest')) { landings++; if (e.type === 'conquest') wins++; }
      if (e.type === 'attack-cancelled' && e.reason === 'ceasefire') turnBacks++;
    }
  }
  console.log(`# info V14.1 mer : ${landings} débarquements, ${wins} réussis (${Math.round(100 * wins / landings)} %), ${turnBacks} demi-tours pour trêve, 30 parties × 80 tours`);
  assert.ok(turnBacks > 0);
  assert.ok(landings >= 200, `${landings} débarquements`);
  assert.ok(wins / landings >= .6, `${wins}/${landings}`);
});

test('plus de va-et-vient : des troupes envoyées en aide restent au moins 5 tours chez l\'allié (sauf besoin chez soi)', () => {
  const s = game({ ai: ['roc-epine'], player: 'valmorne' });
  s.leaders['roc-epine'].archetype = 'heros';
  setRelation(s, { nationId: 'valmorne', target: 'roc-epine', type: 'alliance' });
  s.stationed = [{ nationId: 'roc-epine', provinceId: 'p02', units: units(120), warships: 0, wounds: {} }];
  s.ai.plans = { 'roc-epine': { helpSent: { valmorne: s.turn - 1 } } }; // envoyées au tour précédent, aucun danger
  assert.equal(STATION_MIN_TURNS, 5);
  const recall = () => { s.orders = []; s.ai.plannedTurn = null; planAIOrders(s, map); return s.orders.find(o => o.kind === 'move' && o.nationId === 'roc-epine' && o.fromId === 'p02'); };
  assert.equal(recall(), undefined, 'pas rappelées le tour d\'après (avant : va-et-vient)');
  s.turn += STATION_MIN_TURNS;
  const o = recall();
  assert.ok(o && o.recall === 'safe', 'rappelées une fois le délai passé, danger écarté');
  // Besoin chez soi : rappel immédiat, délai ou pas.
  s.turn -= STATION_MIN_TURNS; s.ai.plans['roc-epine'].helpSent.valmorne = s.turn;
  setRelation(s, { nationId: 'roc-epine', target: 'aurel', type: 'war' });
  s.provinces.p07.units = units(1); s.provinces.p17.units = units(3000);
  const h = recall();
  assert.ok(h && h.recall === 'home', 'besoin chez soi');
  // Après un rappel « danger passé », le Héros ne revient que pour une NOUVELLE agression.
  const t = game({ ai: ['roc-epine'], player: 'valmorne' });
  t.leaders['roc-epine'].archetype = 'heros';
  setRelation(t, { nationId: 'valmorne', target: 'roc-epine', type: 'alliance' });
  t.ai.aggressions = [{ turn: t.turn - 1, attacker: 'oroel', victim: 'valmorne', reason: 'combat' }];
  t.ai.plans = { 'roc-epine': { recalled: { valmorne: t.turn } } };
  for (const id of ['p05', 'p06', 'p07', 'p08']) t.provinces[id].units.infantry = 300;
  planAIOrders(t, map);
  assert.ok(!t.orders.some(o => o.kind === 'move' && o.nationId === 'roc-epine' && o.passage), 'ancienne agression : il ne repart pas');
  t.ai.aggressions.push({ turn: t.turn, attacker: 'oroel', victim: 'valmorne', reason: 'combat' });
  t.orders = []; t.ai.plannedTurn = null; t.ai.plans['roc-epine'].recalled.valmorne = t.turn - 1;
  planAIOrders(t, map);
  assert.ok(t.orders.some(o => o.kind === 'move' && o.nationId === 'roc-epine' && o.passage), 'nouvelle agression : il revient');
});

// --- Simulation IA contre IA : aucune incohérence -------------------------------------------------------------------------
test('simulation IA contre IA (8 parties × 80 tours) : invariants, jamais alliés et en guerre, journaux lisibles', () => {
  let autoWars = 0, strikes = 0;
  for (let g = 0; g < 8; g++) {
    const s = createGameState({ map, playerNationId: NATIONS[g % 5], seed: `v141-sim-${g}` });
    for (const id of NATIONS) s.controllers[id] = 'ai';
    for (let i = 0; i < 80; i++) {
      resolveInterturn(s, map);
      assertInvariants(s, `V14.1 IA ${g}`);
      for (const a of NATIONS) for (const b of NATIONS) if (a < b) assert.ok(!(atWar(s, a, b) && (allied(s, a, b) || truce(s, a, b))), `tour ${s.turn} : ${a}/${b} en guerre et liés`);
      for (const e of s.stationed || []) assert.ok(allied(s, e.nationId, s.provinces[e.provinceId].ownerId), 'troupes chez un non-allié');
      for (const w of s.diplomacy.wars) assert.ok(w.participants.every(n => !s.nations[n].eliminated), 'guerre avec une nation éliminée');
    }
    for (const e of s.events) {
      assert.doesNotThrow(() => journalEntry(e, map, s.playerNationId));
      if (e.type === 'auto-war') autoWars++;
      if (e.type === 'interception' && e.strike) strikes++;
    }
  }
  console.log(`# info V14.1 simulation : ${autoWars} guerres automatiques, ${strikes} attaques de bases navales`);
});
