// V17.10.2 — corrections bêta (retours de Jack du 22/11/2026, v17.10.1+947c86f, téléphone couché ~860 × 390).
//  R1 : tension — un dirigeant ne cite plus de pourcentage (niveau en mots, celui qui résulte du message) ;
//  R2 : bandeau du haut lisible (2 lignes, texte de pause court, toucher = message complet ou Journal) ;
//  R3 : vivres entiers (tests/v17-4.test.js) ;
//  R4 : noms de nations sous les drapeaux / étoiles / pastilles / « ? », boutons au-dessus de la carte ;
//  R6 / R12 : dézoom jusqu'au monde entier, océan entre deux répétitions (tests/v17-6.test.js et ci-dessous).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { arkenV9Map as map } from '../src/map/arken-v9-map.js';
import { createGameState } from '../src/state/create-game-state.js';
import { resolveInterturn } from '../src/domain/game-engine.js';
import { createRealtimeGame } from '../src/domain/realtime/create.js';
import { publishTalk, talkOptions, allTalkLines } from '../src/domain/talk.js';
import { tensionLevel, tensionRank, setTension, getTension } from '../src/domain/leaders.js';
import { contextFragments, composeLine, composeFragmentLists, talkedTension, TENSION_WORDS } from '../src/domain/talk-compose.js';
import { tickerText } from '../src/presentation/realtime-view.js';
import { vivres, foodHud } from '../src/presentation/food-view.js';
import { WRAP_OCEAN, wrapPeriod, wrapMinZoom } from '../src/presentation/map-am3-view.js';
import { root, readSource } from './helpers/sources.js';

const read = f => readFileSync(join(root, f), 'utf8');
const NATIONS = map.nations.map(n => n.id);
function game({ seed = 'v17-10-2', ai = {} } = {}) {
  const s = createGameState({ map, playerNationId: 'valmorne', seed });
  for (const id of NATIONS) s.controllers[id] = ai[id] ? 'ai' : 'human';
  s.leaders = Object.fromEntries(Object.entries(ai).map(([id, archetype]) => [id, { archetype, revealed: false }]));
  return s;
}
const tensionFragment = (s, from, to, tone) => contextFragments(s, map, { from, to, tone }).find(c => c.id === 'tension');

// --- R1 -----------------------------------------------------------------------------------------------------------------
test('R1 : la tension citée par un dirigeant est en MOTS (jamais de « % »), un niveau par palier et par ton', () => {
  assert.equal(TENSION_WORDS.length, 4, 'calme, tendu, hostile, au bord de la guerre');
  for (const byTone of TENSION_WORDS) for (const tone of ['hostile', 'neutre', 'amical']) {
    assert.ok(byTone[tone], tone);
    assert.doesNotMatch(byTone[tone], /%|\d/, byTone[tone]);
    assert.match(byTone[tone], /[.!?]$/);
    assert.doesNotMatch(byTone[tone], /'/, 'apostrophe typographique');
  }
  // Aucune réplique ni fragment de dirigeant ne contient de pourcentage.
  for (const l of allTalkLines()) assert.doesNotMatch(l, /%/, l);
  for (const [path, list] of Object.entries(composeFragmentLists())) for (const l of list) assert.doesNotMatch(l, /%/, `${path} : ${l}`);
  const src = read('src/domain/talk-compose.js').replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.doesNotMatch(src, /\$\{[^}]*\} ?%/, 'aucun « ${…} % » dans les répliques composées');
});

test('R1 (capture de Jack) : message hostile d’Oroël à 10 % → le texte dit le palier APRÈS le message, celui de l’en-tête', () => {
  const s = game({ ai: { oroel: 'batisseur' } });
  s.controllers.oroel = 'ai'; s.leaders.oroel.archetype = 'heros'; // un hostile du Héros : +20 (effet habituel)
  setTension(s, 'oroel', 'valmorne', 10);
  assert.equal(tensionLevel(s, 'valmorne', 'oroel').label, 'calme');
  const frag = tensionFragment(s, 'oroel', 'valmorne', 'hostile');
  assert.equal(frag.text, TENSION_WORDS[1].hostile, '10 % + 20 = 30 % : « tendu », pas « 10 % »');
  assert.doesNotMatch(frag.text, /%/);
  const msg = publishTalk(s, { from: 'oroel', to: 'valmorne', tone: 'hostile', text: frag.text, ai: true });
  const level = tensionLevel(s, 'valmorne', 'oroel');
  assert.equal(level.value, 30); assert.equal(level.label, 'tendu', 'en-tête « TENSION 30 % (TENDU) »');
  assert.equal(TENSION_WORDS[tensionRank(level.value)].hostile, frag.text, 'mots du message = palier affiché');
  assert.equal(msg.tension, 30, 'tension au moment du message, gardée pour l’en-tête de la réponse');
  // Symétrique : vue de l'un ou de l'autre, même valeur.
  assert.equal(getTension(s, 'oroel', 'valmorne'), getTension(s, 'valmorne', 'oroel'));
});

test('R1 : chaque palier a ses mots (amical qui apaise, neutre, hostile au bord de la guerre) ; plafond d’alliance respecté', () => {
  const s = game({ ai: { oroel: 'heros' } });
  for (const [start, tone, rank] of [[30, 'amical', 0], [27, 'neutre', 1], [55, 'neutre', 2], [60, 'hostile', 3], [5, 'hostile', 1], [0, 'neutre', 0]]) {
    setTension(s, 'oroel', 'valmorne', start);
    const after = talkedTension(s, 'oroel', 'valmorne', tone);
    assert.equal(tensionRank(after), rank, `${start} % ${tone} → ${after} %`);
    assert.equal(tensionFragment(s, 'oroel', 'valmorne', tone).text, TENSION_WORDS[rank][tone]);
  }
  // Message sans effet (réponse à une demande d'aide) : le palier actuel.
  setTension(s, 'oroel', 'valmorne', 20);
  assert.equal(talkedTension(s, 'oroel', 'valmorne', 'hostile', { tensionEffect: false }), 20);
});

test('R1 : un message du joueur ne dévoile pas le caractère caché du destinataire (effet habituel tant qu’il n’est pas révélé)', () => {
  const s = game({ ai: { oroel: 'conquerant' } });
  setTension(s, 'valmorne', 'oroel', 10);
  assert.equal(talkedTension(s, 'valmorne', 'oroel', 'hostile'), 30, '+20 affiché, pas +35 (Conquérant caché)');
  s.leaders.oroel.revealed = true;
  assert.equal(talkedTension(s, 'valmorne', 'oroel', 'hostile'), 45, 'révélé : effet réel');
  for (const o of talkOptions(s, map, { from: 'valmorne', to: 'oroel' })) assert.doesNotMatch(o.text, /%/, o.text);
});

test('R1 : 30 tours IA contre IA — aucun message de dirigeant avec un pourcentage, mots toujours fidèles au palier publié', () => {
  const ai = Object.fromEntries(NATIONS.map((id, i) => [id, ['conquerant', 'heros', 'batisseur', 'traitre', 'heros'][i]]));
  const s = game({ seed: 'v17-10-2-ia', ai });
  for (let t = 0; t < 30 && !s.gameOver; t++) resolveInterturn(s, map);
  const said = (s.talk || []).filter(m => m.text);
  assert.ok(said.length > 10, `${said.length} messages`);
  for (const m of said) assert.doesNotMatch(m.text, /%/, m.text);
  for (const m of said.filter(m => m.to && Number.isFinite(m.tension))) {
    const words = TENSION_WORDS.flatMap(Object.values).filter(w => m.text.includes(w));
    for (const w of words) assert.ok(Object.values(TENSION_WORDS[tensionRank(m.tension)]).includes(w), `« ${w} » pour ${m.tension} %`);
  }
});

test('R1 : interface — en-tête de la réponse avec la tension actuelle, et le palier du message s’il a changé depuis', () => {
  const ui = readSource('app.js');
  assert.match(ui, /export function replyTension\(original,t\)/);
  assert.match(ui, /\$\{replyTension\(original,t\)\}/);
  assert.match(ui, /LORS DU MESSAGE/);
});

// --- R2 -----------------------------------------------------------------------------------------------------------------
test('R2 : bandeau du haut — texte de pause court, toucher = fil des échanges (message) ou Journal, deux lignes', () => {
  const s = createRealtimeGame({ map, playerNationId: 'valmorne', seed: 'r2' });
  const p = tickerText(s, 'valmorne', { paused: true });
  assert.equal(p.text, 'En pause — touchez ▶ pour reprendre'); assert.equal(p.open, 'journal');
  s.chronicle = [{ text: 'Roc-Épine → vous : « Vous avez toute ma confiance, Valmorne. »', category: 'talk' }];
  assert.equal(tickerText(s, 'valmorne').open, 'talk', 'un message : le toucher l’ouvre en entier');
  s.chronicle = [{ text: 'Conquête de Branvale', category: 'conquest' }];
  assert.equal(tickerText(s, 'valmorne').open, 'journal');
  const ui = readSource('app.js');
  assert.match(ui, /if \(tickerOpen === 'talk'\) openTalk\(\); else renderJournal\(false\);/);
  assert.match(read('v5.css'), /body\.rt-on \.live-line\{font-size:\.74rem;line-height:1\.22;-webkit-line-clamp:2\}/);
  assert.match(read('paysage.css'), /body\.rt-on \.live-line\{font-size:\.72rem;line-height:1\.2;-webkit-line-clamp:2\}/);
});

// --- R3 -----------------------------------------------------------------------------------------------------------------
test('R3 : VIVRES entiers partout (922,5 → 922), moteur inchangé (centièmes)', () => {
  assert.equal(vivres(92250), '922');
  assert.equal(vivres(100750), '1 007');
  const s = createRealtimeGame({ map, playerNationId: 'valmorne', seed: 'r3' });
  s.nations.valmorne.food.reserve = 92250;
  const hud = foodHud(s, 'valmorne');
  assert.equal(hud.reserve, '922');
  assert.doesNotMatch(hud.perDay + hud.note + hud.label, /\d,\d/, 'aucun dixième');
  assert.equal(s.nations.valmorne.food.reserve, 92250, 'le moteur garde ses centièmes');
});

// --- R4 -----------------------------------------------------------------------------------------------------------------
test('R4 : noms de nations dans l’étage du fond (#mapBase) ; drapeaux, étoiles, pastilles, « ? » et icônes au-dessus, copies comprises', () => {
  const ui = readSource('app.js');
  assert.match(ui, /base\.append\(nationNameLayer\(\)\);world\.append\(\.\.\.routeLayer,labelLayer,convoyLayer\);/);
  assert.match(ui, /svg\.replaceChildren\(defs,base,\.\.\.wrapUses\('#mapBase'\),world,\.\.\.wrapUses\('#mapWorld'\)\);/, 'tous les fonds (et leurs noms) avant tous les dessus');
  assert.match(ui, /querySelector\('#mapBase'\)\?\.setAttribute\('class',`detail-\$\{level\}`\)/, 'niveaux de détail sur les deux étages');
  assert.match(ui, /hit\.closest\('#mapWorld,#mapBase'\)/, 'toucher une copie : rejoué sur la province');
  // Boutons d'interface au-dessus de la carte, fond opaque (un nom ne transparaît plus à travers ⚙).
  const css = read('v5.css'), land = read('paysage.css');
  assert.match(css, /\.map-shell\{z-index:0\}/);
  assert.match(css, /\.hud,nav\.bottom-bar\{z-index:7\}/);
  assert.match(land, /\.hud \.icon-btn\{background:#071722\}/);
  assert.match(css, /#map\{-webkit-user-select:none;user-select:none\}/);
});

// --- R6 / R12 -----------------------------------------------------------------------------------------------------------
test('R6 / R12 : zoom minimal recentré sur le monde (boutons et pincement), océan paramétrable entre deux répétitions', () => {
  const ui = readSource('app.js');
  assert.match(ui, /if\(scale<=minZoom\+1e-6\)\{tx=0;ty=0;\}/, 'bouton − : arrivé au zoom minimal, le monde est centré');
  assert.match(ui, /centerIfWholeMap\(\);updateLabelScale\(\);/, 'fin de pincement au zoom minimal : recentré');
  assert.match(ui, /minScale:minZoom/, 'le pincement va jusqu’au zoom minimal');
  assert.equal(wrapPeriod(map.frame), map.frame.width * (1 + WRAP_OCEAN));
  // Plus d'océan = même vue du monde au zoom minimal (la marge du monde décide), jamais moins dézoomé.
  const vp = { width: 860, height: 390 };
  assert.ok(wrapMinZoom(vp, map.frame, wrapPeriod(map.frame, WRAP_OCEAN + 1)) <= wrapMinZoom(vp, map.frame) + 1e-12);
});
