// V13.4 — retours de bêta de Jack (20/10/2026), mot pour mot :
//  « Passage dans territoire allié nécessaire pour aider si guerre. Et automatiquement affecté lors de la signature
//    de l'alliance. »
//  « C'est pas marqué le/les bonus en pourcentage offert par la forteresse. »
//  « Il faudrait également un genre de mini tuto lors de la première game. »
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { RULES } from '../src/domain/constants.js';
import { queueMoveOrder, queueDiplomaticOrder, setRelation, resolveInterturn, respondToProposal, legalDestinations, availableForces, journalEntry,
  hasPassage, stationedAt, PASSAGE_TEXT, planAIOrders } from '../src/domain/game-engine.js';
import { resolveBattle, fortReductionPct } from '../src/domain/combat.js';
import { visibleProvinces } from '../src/domain/vision.js';
import { setPlayerBonuses } from '../src/domain/boosts.js';
import { passageChip, fortInfo, fortBuildText, fortAttackWarning, MINI_TUTO_KEY, MINI_TUTO_STEPS, shouldStartMiniTuto, markMiniTutoSeen, resetMiniTuto, miniTutoAdvance } from '../src/presentation/v13-4-ux.js';
import { SAVE_KEY, TUTORIAL_GUIDE } from '../src/presentation/v4-ux.js';
import { playerOrderArrows } from '../src/presentation/v5-ux.js';
import { provinceTroopView } from '../src/presentation/v13-vision-ui.js';
import { COMBAT_TYPES } from '../src/domain/combat.js';
import { arkenV9Map } from '../src/map/arken-v9-map.js';
import { map, freshState } from './helpers/fixtures.js';

const read = f => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
const allied = (s, a, b) => s.diplomacy.treaties.some(t => t.active !== false && t.type === 'alliance' && t.parties.includes(a) && t.parties.includes(b));
const memoryStorage = () => { const m = new Map(); return { getItem: k => m.has(k) ? m.get(k) : null, setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), keys: () => [...m.keys()] }; };

// --- 1. Alliance = droit de passage automatique et réciproque ----------------------------------------------------
test('alliance signée → passage automatique dans les deux sens ; sans alliance, pas de passage', () => {
  const s = freshState({ allHuman: true });
  assert.equal(hasPassage(s, 'valmorne', 'roc-epine'), false);
  setRelation(s, { nationId: 'valmorne', target: 'roc-epine', type: 'alliance' });
  assert.equal(hasPassage(s, 'valmorne', 'roc-epine'), true);
  assert.equal(hasPassage(s, 'roc-epine', 'valmorne'), true, 'réciproque');
  assert.equal(hasPassage(s, 'valmorne', 'oroel'), false);
  assert.equal(PASSAGE_TEXT, 'Alliance : passage libre dans vos territoires');
  assert.match(passageChip(s, 'valmorne', 'roc-epine'), /passage libre/);
  assert.equal(passageChip(s, 'valmorne', 'oroel'), '');
});

test('alliance acceptée par la fenêtre Oui / Non : le passage est donné aussitôt', () => {
  const s = freshState({ allHuman: true });
  s.controllers.oroel = 'ai';
  s.diplomacy.proposals = [{ from: 'oroel', to: 'valmorne', action: 'alliance', turn: s.turn }];
  assert.equal(respondToProposal(s, { from: 'oroel', accept: true }).ok, true);
  assert.equal(hasPassage(s, 'valmorne', 'oroel'), true);
});

test('passage : on traverse vers une province alliée, on y stationne sans combat, on en repart, on la défend', () => {
  const s = freshState({ allHuman: true });
  setRelation(s, { nationId: 'valmorne', target: 'roc-epine', type: 'alliance' });
  s.provinces.p04.units.infantry = 200;
  assert.ok(legalDestinations(map, s, 'p04').some(d => d.id === 'p05'));
  const r = queueMoveOrder(s, map, { nationId: 'valmorne', fromId: 'p04', toId: 'p05', units: { infantry: 120 } });
  assert.equal(r.ok, true);
  assert.equal(playerOrderArrows(s, map).find(a => a.id === r.orderId).kind, 'move', 'flèche verte, pas une attaque');
  resolveInterturn(s, map);
  assert.equal(s.provinces.p05.ownerId, 'roc-epine');
  assert.equal(stationedAt(s, 'p05', 'valmorne').units.infantry, 120);
  assert.equal(allied(s, 'valmorne', 'roc-epine'), true, 'aucune guerre');
  assert.ok(s.turnJournal.some(e => e.type === 'PASSAGE'), 'journal : PASSAGE');
  // Repartir de chez l'allié (traverser) : vers une autre de ses provinces.
  assert.equal(availableForces(s, 'p05', 'valmorne').infantry, 120);
  assert.equal(queueMoveOrder(s, map, { nationId: 'valmorne', fromId: 'p05', toId: 'p06', units: { infantry: 50 } }).ok, true);
  resolveInterturn(s, map);
  assert.equal(stationedAt(s, 'p06', 'valmorne').units.infantry, 50);
  assert.equal(stationedAt(s, 'p05', 'valmorne').units.infantry, 70);
  // Défendre : un ennemi attaque p05, nos troupes stationnées combattent avec la garnison.
  s.provinces.p05.units = { infantry: 0, cavalry: 0, armor: 0, artillery: 0 };
  s.provinces.p05.buildings.fort = 0;
  s.provinces.p07.ownerId = 'noireflamme'; s.provinces.p07.units.infantry = 60;
  s.orders.push({ id: 'x1', kind: 'move', nationId: 'noireflamme', fromId: 'p07', toId: 'p05', units: { infantry: 60, cavalry: 0, armor: 0, artillery: 0 }, warships: 0, routeType: 'land', status: 'pending', turn: s.turn });
  resolveInterturn(s, map);
  assert.equal(s.provinces.p05.ownerId, 'roc-epine', 'sans nos troupes, la province vide serait tombée');
  const battle = s.events.find(e => e.type === 'battle' && e.provinceId === 'p05');
  assert.deepEqual(battle.guests, ['valmorne']);
  assert.ok(battle.lossesByNation.valmorne, 'nos pertes comptées à part');
  assert.match(journalEntry(battle, arkenV9Map, 'valmorne').text, /renforts alliés en défense : Valmorne/);
});

test('rompre l\'alliance retire le passage : les troupes stationnées rentrent, un passage prévu est annulé', () => {
  const s = freshState({ allHuman: true });
  setRelation(s, { nationId: 'valmorne', target: 'roc-epine', type: 'alliance' });
  s.provinces.p04.units.infantry = 200;
  queueMoveOrder(s, map, { nationId: 'valmorne', fromId: 'p04', toId: 'p05', units: { infantry: 100 } });
  resolveInterturn(s, map);
  const before = s.provinces.p04.units.infantry;
  queueMoveOrder(s, map, { nationId: 'valmorne', fromId: 'p04', toId: 'p05', units: { infantry: 20 } });
  assert.equal(queueDiplomaticOrder(s, { nationId: 'roc-epine', target: 'valmorne', action: 'break' }).ok, true);
  resolveInterturn(s, map);
  assert.equal(allied(s, 'valmorne', 'roc-epine'), false);
  assert.equal(hasPassage(s, 'valmorne', 'roc-epine'), false);
  assert.equal(stationedAt(s, 'p05', 'valmorne'), null);
  assert.equal(s.provinces.p04.units.infantry, before + 100, 'rapatriées à Haut-Bois, voisine ; le 2e passage n\'est pas parti');
  assert.ok(s.events.some(e => e.type === 'stationed-recalled'));
  assert.ok(s.events.some(e => e.type === 'attack-cancelled' && e.reason === 'passage-lost'));
  assert.ok(!s.events.some(e => e.type === 'betrayal' || e.type === 'battle'), 'pas de guerre involontaire');
});

test('vision : des troupes stationnées chez l\'allié révèlent les provinces voisines', () => {
  const s = freshState({ allHuman: true });
  setRelation(s, { nationId: 'valmorne', target: 'roc-epine', type: 'alliance' });
  s.stationed = [{ nationId: 'valmorne', provinceId: 'p05', units: { infantry: 10, cavalry: 0, armor: 0, artillery: 0 }, warships: 0, wounds: {} }];
  assert.ok(visibleProvinces(s, map, 'valmorne').has('p06'));
});

test('IA alliée : engagée à défendre, elle vient stationner chez le demandeur grâce au passage', () => {
  const s = freshState({ allHuman: true });
  s.controllers['roc-epine'] = 'ai';
  s.leaders['roc-epine'].archetype = 'heros';
  setRelation(s, { nationId: 'valmorne', target: 'roc-epine', type: 'alliance' });
  setRelation(s, { nationId: 'valmorne', target: 'oroel', type: 'war' });
  for (const id of ['p05', 'p06', 'p07', 'p08']) s.provinces[id].units.infantry = 300;
  s.diplomacy.help = [{ ally: 'roc-epine', requester: 'valmorne', kind: 'defend', against: null, provinceId: 'p04', turn: s.turn, until: s.turn + 5 }];
  planAIOrders(s, map);
  const o = s.orders.find(x => x.kind === 'move' && x.nationId === 'roc-epine' && x.toId === 'p04');
  assert.ok(o, 'ordre de passage vers Haut-Bois');
  assert.equal(o.passage, true);
});

// --- 2. Forteresse : bonus en % lus dans le moteur -----------------------------------------------------------
test('forteresse : le % affiché est celui du moteur (RULES.fortDefense + atout), partout', () => {
  assert.deepEqual([0, 1, 2, 3].map(l => fortReductionPct(l)), [0, 10, 20, 30]);
  // Le pourcentage affiché correspond aux dégâts réellement retirés par resolveBattle.
  for (const lvl of [1, 2, 3]) {
    const lost = l => resolveBattle({ defender: { units: { infantry: 400 } }, attackers: [{ id: 'a', force: { units: { infantry: 400 } } }], fortLevel: l, passes: 1 }).defenderHpLost;
    assert.equal(Math.round((1 - lost(lvl) / lost(0)) * 100), fortReductionPct(lvl));
  }
  const s = freshState({ allHuman: true });
  assert.equal(fortInfo(s, 'p01').text, '', 'pas de forteresse : rien');
  assert.match(fortBuildText(s, 'p01'), /niveau 1 : −10 % de dégâts reçus en défense/);
  s.provinces.p01.buildings.fort = 2;
  assert.equal(fortInfo(s, 'p01').text, '▣ Forteresse niveau 2 : −20 % de dégâts reçus par la garnison en défense');
  assert.match(fortBuildText(s, 'p01'), /niveau 3 : −30 %.*aujourd’hui −20 %/);
  assert.equal(fortAttackWarning(s, 'p01'), '▣ Forteresse niveau 2 : ses défenseurs reçoivent −20 % de dégâts.');
  s.provinces.p01.buildings.fort = 3;
  assert.match(fortBuildText(s, 'p01'), /−30 % .*niveau maximal/);
  // Atout « fort » du joueur : le % affiché le prend en compte, comme le combat.
  setPlayerBonuses(s, { fort: 10 });
  assert.equal(fortInfo(s, 'p01').pct, fortReductionPct(3, 1.1));
  assert.equal(fortInfo(s, 'p01').pct, 36);
  // Si la règle change, l'affichage suit (pas de valeur recopiée à la main).
  const saved = RULES.fortDefense;
  assert.throws(() => { RULES.fortDefense = [1, 2, 3, 4]; }, 'règles gelées');
  assert.equal(RULES.fortDefense, saved);
});

test('forteresse : affichée sur la fiche, le menu Construction, l\'attaque, le journal de combat et l\'aide', () => {
  const app = read('app.js');
  assert.match(app, /fortInfo\(state,selected\)/, 'fiche de province');
  assert.match(app, /fortBuildText\(state,selected\)/, 'menu Construction');
  assert.match(app, /fortAttackWarning\(state,toId\)/, 'préparation d\'une attaque');
  assert.doesNotMatch(app, /\(x\.built\+1\)\*10/, 'plus de % recopié à la main');
  const ev = { type: 'battle', attacker: 'oroel', attackers: ['oroel'], defender: 'valmorne', provinceId: 'p03', fortLevel: 2, fortPct: 20,
    lossesByNation: { oroel: { infantry: 1 }, valmorne: { infantry: 1 } }, hpLostByNation: { oroel: 10, valmorne: 10 } };
  assert.match(journalEntry(ev, arkenV9Map, 'valmorne').text, /forteresse niveau 2 : −20 % de dégâts reçus/);
  assert.match(TUTORIAL_GUIDE.find(x => x.id === 'build').text, /−10 \/ −20 \/ −30 %/);
});

// --- 3. Mini tutoriel ----------------------------------------------------------------------------------------
test('mini tuto : 5 à 7 étapes courtes qui suivent les vrais gestes (province, recruter, déplacer, diplomatie, fin du tour)', () => {
  assert.ok(MINI_TUTO_STEPS.length >= 5 && MINI_TUTO_STEPS.length <= 7);
  for (const st of MINI_TUTO_STEPS) assert.ok(st.text.length <= 160, st.id);
  assert.deepEqual(MINI_TUTO_STEPS.map(x => x.on), ['own-province', 'recruit', 'move', 'diplomacy', 'end-turn', 'ok']);
  assert.equal(miniTutoAdvance(0, 'move'), 0, 'un autre geste ne fait pas avancer');
  let i = 0; for (const ev of ['own-province', 'recruit', 'move', 'diplomacy', 'end-turn']) i = miniTutoAdvance(i, ev);
  assert.equal(i, 5);
  assert.equal(miniTutoAdvance(5, 'ok'), null, 'terminé');
});

test('mini tuto : affiché une seule fois (clé séparée), jamais la clé de sauvegarde ; relançable', () => {
  const store = memoryStorage();
  store.setItem(SAVE_KEY, '{"partie":1}');
  assert.equal(shouldStartMiniTuto(store), true, 'première partie');
  markMiniTutoSeen(store);
  assert.equal(shouldStartMiniTuto(store), false, 'ne se réaffiche plus');
  assert.equal(MINI_TUTO_KEY, 'frontieres-arken-mini-tuto');
  assert.notEqual(MINI_TUTO_KEY, SAVE_KEY);
  assert.equal(store.getItem(SAVE_KEY), '{"partie":1}', 'sauvegarde intacte');
  resetMiniTuto(store);
  assert.equal(shouldStartMiniTuto(store), true, 'relancé depuis les réglages');
  assert.equal(store.getItem(SAVE_KEY), '{"partie":1}', 'sauvegarde toujours intacte');
  // Stockage indisponible (navigation privée) : pas de plantage.
  const broken = { getItem() { throw new Error('x'); }, setItem() { throw new Error('x'); }, removeItem() { throw new Error('x'); } };
  assert.equal(shouldStartMiniTuto(broken), true);
  assert.equal(markMiniTutoSeen(broken), false);
});

test('mini tuto : bouton « Passer », lancement à la première partie seulement, relance dans les Paramètres', () => {
  const html = read('index.html'), app = read('app.js');
  assert.match(html, /id="miniTutoSkip"[^>]*>Passer</);
  assert.match(html, /id="replayMiniTuto">Relancer le mini tuto</);
  assert.match(app, /\$\('#miniTutoSkip'\)\.onclick=endMiniTuto/);
  assert.match(app, /if\(shouldStartMiniTuto\(\)\)\{startMiniTuto\(\);return;\}/);
  assert.doesNotMatch(app.match(/function continueSavedGame[^\n]*/)[0], /MiniTuto/, 'pas en reprenant une partie');
  assert.doesNotMatch(read('src/presentation/v13-4-ux.js'), /frontieres-arken-v2-save/);
});

// --- Corrections après relecture indépendante ------------------------------------------------------------------
test('relecture : les renforts alliés stationnés chez une nation étrangère visible sont affichés (pas de surprise)', () => {
  const s = freshState({ allHuman: true });
  setRelation(s, { nationId: 'roc-epine', target: 'noireflamme', type: 'alliance' });
  s.provinces.p08.ownerId = 'noireflamme'; s.provinces.p08.buildings.fort = 0;
  s.provinces.p08.units = { infantry: 50, cavalry: 0, armor: 0, artillery: 0 };
  s.stationed = [{ nationId: 'roc-epine', provinceId: 'p08', units: { infantry: 150, cavalry: 0, armor: 0, artillery: 0 }, warships: 0, wounds: {} }];
  s.provinces.p06.ownerId = 'valmorne'; s.provinces.p06.units.infantry = 10; // vue sur p08
  const v = provinceTroopView(s, map, 'p08', 'valmorne');
  assert.equal(v.known, true);
  assert.match(v.composition, /200 fantassins/);
  assert.match(v.guestNote, /150 fantassins/);
});

test('relecture : défense avec renforts alliés — aucune troupe créée ni perdue en dehors des pertes du combat', () => {
  const s = freshState({ allHuman: true });
  setRelation(s, { nationId: 'valmorne', target: 'roc-epine', type: 'alliance' });
  s.provinces.p05.units = { infantry: 100, cavalry: 0, armor: 0, artillery: 0 }; s.provinces.p05.buildings.fort = 0;
  s.stationed = [{ nationId: 'valmorne', provinceId: 'p05', units: { infantry: 200, cavalry: 0, armor: 0, artillery: 0 }, warships: 0, wounds: {} }];
  s.provinces.p07.ownerId = 'noireflamme'; s.provinces.p07.units.infantry = 150;
  s.orders.push({ id: 'x1', kind: 'move', nationId: 'noireflamme', fromId: 'p07', toId: 'p05', units: { infantry: 150, cavalry: 0, armor: 0, artillery: 0 }, warships: 0, routeType: 'land', status: 'pending', turn: s.turn });
  resolveInterturn(s, map);
  const b = s.events.find(e => e.type === 'battle' && e.provinceId === 'p05');
  assert.ok(b, 'la province tient');
  const lost = id => COMBAT_TYPES.reduce((n, k) => n + (b.lossesByNation[id]?.[k] || 0), 0);
  assert.equal(s.provinces.p05.units.infantry + stationedAt(s, 'p05', 'valmorne').units.infantry, 300 - lost('valmorne') - lost('roc-epine'));
  assert.equal(stationedAt(s, 'p05', 'valmorne').units.infantry, 200 - lost('valmorne'));
});

test('relecture : attaque lancée depuis la province d\'un allié ; alliance rompue → « passage annulé », pas « province tombée »', () => {
  const s = freshState({ allHuman: true });
  setRelation(s, { nationId: 'valmorne', target: 'roc-epine', type: 'alliance' });
  s.stationed = [{ nationId: 'valmorne', provinceId: 'p05', units: { infantry: 200, cavalry: 0, armor: 0, artillery: 0 }, warships: 0, wounds: {} }];
  s.provinces.p08.ownerId = 'noireflamme'; s.provinces.p08.units = { infantry: 5, cavalry: 0, armor: 0, artillery: 0 }; s.provinces.p08.buildings.fort = 0;
  assert.equal(queueMoveOrder(s, map, { nationId: 'valmorne', fromId: 'p05', toId: 'p08', units: { infantry: 150 } }).ok, true, 'attaque depuis chez l\'allié');
  const t = structuredClone(s);
  resolveInterturn(s, map);
  assert.equal(s.provinces.p08.ownerId, 'valmorne', 'prise');
  queueDiplomaticOrder(t, { nationId: 'roc-epine', target: 'valmorne', action: 'break' });
  resolveInterturn(t, map);
  const ev = t.events.find(e => e.type === 'attack-cancelled');
  assert.equal(ev.reason, 'passage-lost');
  assert.match(journalEntry(ev, arkenV9Map, 'valmorne').text, /l’alliance a été rompue/);
  const before = s0 => Object.values(s0.provinces).filter(p => p.ownerId === 'valmorne').reduce((n, p) => n + p.units.infantry, 0);
  assert.equal(stationedAt(t, 'p05', 'valmorne'), null);
  assert.ok(t.events.some(e => e.type === 'stationed-recalled' && e.amount === 200), 'les 200 rentrent, pas perdues');
});
