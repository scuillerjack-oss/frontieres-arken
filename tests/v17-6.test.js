// V17.6 — carte « façon AM 3 » : défilement horizontal sans fin, niveaux de détail, pastilles de troupes selon la vision,
// grands noms de nations, plein écran en paysage. Spécification : docs/V17-plan-temps-reel.md (ligne V17.6).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { root, readSource, PRESENTATION_MODULES_V17_6 } from './helpers/sources.js';
import { arkenV9Map as map } from '../src/map/arken-v9-map.js';
import { createGameState } from '../src/state/create-game-state.js';
import { provinceIntel, visibleProvinces } from '../src/domain/vision.js';
import {
  DETAIL_THRESHOLDS, badgeTone, copyShift, detailLevel, formatTroops, iconScale, nationLabels, troopBadge, troopBadges,
  wrapCopyCount, wrapMapX, wrapMinZoom, wrapTransform, wrapX
} from '../src/presentation/map-am3-view.js';

const read = p => readFileSync(join(root, p), 'utf8');
const fresh = (playerNationId = 'valmorne') => createGameState({ map, playerNationId, seed: 7 });
const ally = (s, a, b) => s.diplomacy.treaties.push({ type: 'alliance', parties: [a, b], active: true, startedTurn: s.turn });

// --- Bouclage horizontal ---------------------------------------------------------------------------------------------
test('V17.6 : wrapX ramène la translation dans [-W/2, W/2[ — sortir à droite = revenir par la gauche, sans saut', () => {
  const W = 400;
  for (const x of [-1e5, -850, -200, -199.5, 0, 150, 199.9, 200, 601, 12345]) {
    const r = wrapX(x, W);
    assert.ok(r >= -W / 2 && r < W / 2, `${x} → ${r}`);
    assert.ok(Math.abs(((x - r) / W) - Math.round((x - r) / W)) < 1e-9, 'décalage = nombre entier de copies (invisible)');
  }
  assert.equal(wrapX(200, W), -200, 'pile au bord droit : bascule à gauche');
  assert.equal(wrapX(0, W), 0);
  // Un glissement continu reste continu modulo W : deux positions voisines ne diffèrent que de 0 ou de ±W.
  let prev = wrapX(0, W);
  for (let x = 7; x <= 3 * W; x += 7) { const r = wrapX(x, W), d = r - prev; assert.ok(Math.abs(d - 7) < 1e-6 || Math.abs(Math.abs(d - 7) - W) < 1e-6, `${x}`); prev = r; }
  assert.equal(wrapX(123, 0), 123, 'largeur inconnue : rien ne change');
});

test('V17.6 : nombre de copies de chaque côté = assez pour couvrir l’écran au zoom minimal (paysage 2, portrait 1)', () => {
  // 844 × 390 : carte « cover » 844 px, zoom minimal 390/844 → copie de 390 px : il en faut 2 de chaque côté.
  assert.equal(wrapCopyCount(844, 390), 2);
  assert.equal(wrapCopyCount(390, 390), 1);
  assert.equal(wrapCopyCount(780, 390), 1, 'exactement la moitié : une suffit');
  assert.equal(wrapCopyCount(0, 390), 1);
  // Propriété : pour tout x dans [-W/2, W/2[, les copies couvrent [0, largeur écran].
  for (const [vw, w] of [[844, 390], [915, 412], [390, 390], [1280, 300]]) {
    const n = wrapCopyCount(vw, w);
    for (let x = -w / 2; x < w / 2; x += w / 16) {
      const left = vw / 2 + x - w / 2 - n * w, right = vw / 2 + x + w / 2 + n * w;
      assert.ok(left <= 0 && right >= vw, `${vw}/${w} x=${x}`);
    }
  }
});

test('V17.6 : wrapTransform — zoom borné, vertical borné comme avant, horizontal bouclé', () => {
  const viewport = { width: 844, height: 390 }, content = { width: 844, height: 844 }, minZoom = 390 / 844;
  const t = wrapTransform({ scale: 9, x: 5000, y: -1e6 }, viewport, content, 3, minZoom, .22);
  assert.equal(t.scale, 3);
  assert.ok(Math.abs(t.x) <= content.width * 3 / 2);
  assert.ok(t.y > -1e6 && t.y < 0, 'vertical borné');
  const low = wrapTransform({ scale: .01, x: 1e4, y: 0 }, viewport, content, 3, minZoom, .22);
  assert.equal(low.scale, minZoom);
  assert.ok(Math.abs(low.x) <= 195 + 1e-9);
});

test('V17.6 : toucher une copie → décalage d’un nombre entier de copies ; repère ramené dans la carte d’origine', () => {
  const content = { width: 844, height: 844 };
  assert.equal(copyShift(1, content, 2), 1688);
  assert.equal(copyShift(-2, content, .5), -844);
  assert.equal(copyShift('1', content, 1), 844, 'data-copy est une chaîne');
  assert.equal(wrapMapX(1536 + 232, 1536), 232);
  assert.equal(wrapMapX(-1536 + 232, 1536), 232);
});

test('V17.6 : zoom minimal — jamais plus d’une largeur de carte à l’écran (jamais deux fois la même île)', () => {
  const frame = map.frame;
  for (const vp of [{ width: 844, height: 390 }, { width: 390, height: 844 }, { width: 667, height: 375 }, { width: 915, height: 412 }, { width: 1024, height: 1024 }, { width: 390, height: 640 }]) {
    const z = wrapMinZoom(vp, frame), cover = Math.max(vp.width / frame.width, vp.height / frame.height);
    assert.ok(z <= 1, JSON.stringify(vp));
    assert.ok(frame.width * cover * z >= vp.width - 1e-9, `une copie couvre au moins la largeur de l’écran ${JSON.stringify(vp)}`);
    // Avec ce zoom, une seule copie de chaque côté suffit toujours.
    assert.equal(wrapCopyCount(vp.width, frame.width * cover * z), 1, JSON.stringify(vp));
  }
  assert.equal(wrapMinZoom({ width: 844, height: 390 }, frame), 1, 'paysage : la carte remplit la largeur');
  assert.ok(Math.abs(wrapMinZoom({ width: 390, height: 844 }, frame) - 390 / 844) < 1e-9, 'portrait : toute la largeur de la carte, pas plus');
  assert.equal(wrapMinZoom({ width: 0, height: 0 }, frame), 1);
});

// --- Niveaux de détail -------------------------------------------------------------------------------------------------
test('V17.6 : niveaux de détail selon les pixels par unité de carte (monde → région → province)', () => {
  assert.equal(detailLevel(.2), 0);
  assert.equal(detailLevel(DETAIL_THRESHOLDS.region - 1e-6), 0);
  assert.equal(detailLevel(DETAIL_THRESHOLDS.region), 1);
  assert.equal(detailLevel(.8), 1);
  assert.equal(detailLevel(DETAIL_THRESHOLDS.province), 2);
  assert.equal(detailLevel(undefined), 0);
  // Téléphone couché 844 × 390 : 0,55 px par unité au zoom 1.
  const k = 844 / 1536;
  assert.equal(detailLevel(k * wrapMinZoom({ width: 844, height: 390 }, map.frame)), 0, 'paysage, zoom minimal (une largeur de carte) : vue du monde');
  assert.equal(detailLevel(k * wrapMinZoom({ width: 390, height: 844 }, map.frame)), 0, 'portrait, zoom minimal : vue du monde');
  assert.equal(detailLevel(k * 1.3), 1, 'vue de lancement : noms de provinces visibles');
  assert.equal(detailLevel(k * 3), 2, 'zoom maximal');
  // Les icônes grossissent dans le repère de la carte quand on dézoome, rétrécissent quand on zoome.
  assert.ok(iconScale(.46) > 1 && iconScale(1) === 1 && iconScale(3) < 1);
  assert.ok(iconScale(.46) * .46 < iconScale(1), 'mais restent plus petites à l’écran vue du monde');
});

test('V17.6 : CSS — détails masqués vue du monde (noms de provinces, bâtiments), sur #mapWorld pour que les copies suivent', () => {
  const css = read('v5.css');
  assert.match(css, /\.detail-0 \.province-label \.name,\.detail-0 \.province-label \.building/);
  assert.match(css, /\.detail-1 \.nation-name\{opacity:/);
  assert.match(css, /\.detail-2 \.nation-name\{opacity:/);
  assert.match(css, /\.troop-badge\.own\{--tone:#[0-9a-f]+\}\.troop-badge\.ally\{--tone:#[0-9a-f]+\}\.troop-badge\.enemy\{--tone:#[0-9a-f]+\}\.troop-badge\.neutral/);
  assert.match(css, /#map\{overflow:visible\}/);
  const app = readSource('app.js');
  assert.match(app, /setAttribute\('class',`detail-\$\{level\}`\)/, 'classe de détail posée sur #mapWorld');
  assert.match(app, /E\('use',\{href:'#mapWorld',x:k\*FRAME\.width/, 'copies <use> décalées d’une largeur de carte');
  assert.match(app, /addEventListener\('click',onCopyClick,true\)/, 'toucher sur une copie rejoué sur l’origine');
});

// --- Pastilles de troupes ----------------------------------------------------------------------------------------------
test('V17.6 : formatTroops — nombres courts', () => {
  assert.equal(formatTroops(0), '0');
  assert.equal(formatTroops(218), '218');
  assert.equal(formatTroops(999), '999');
  assert.equal(formatTroops(1000), '1k');
  assert.equal(formatTroops(1234), '1,2k');
  assert.equal(formatTroops(12500), '13k');
  assert.equal(formatTroops(-4), '0');
});

test('V17.6 : pastilles — nombre exact chez soi (vert), « ? » chez l’ennemi hors de vue (rouge), garnison neutre (gris)', () => {
  const s = fresh();
  const b = troopBadges(s, map);
  const own = s.provinces.p01, ownCount = Object.values(own.units).reduce((a, n) => a + n, 0) + (own.warships || 0);
  assert.deepEqual(b.p01, { text: formatTroops(ownCount), tone: 'own', known: true, count: ownCount });
  const seen = visibleProvinces(s, map, 'valmorne');
  for (const d of map.provinces) {
    const intel = provinceIntel(s, map, 'valmorne', d.id, seen);
    assert.equal(b[d.id].known, intel.troopsKnown, d.id);
    if (!intel.troopsKnown) assert.equal(b[d.id].text, '?', d.id);
  }
  assert.equal(b.p13.tone, 'enemy');
  assert.equal(b.p13.text, '?', 'Oroël hors de vue au départ');
  assert.equal(b.p21.tone, 'neutral', 'île mystérieuse : garnison neutre, toujours visible');
  assert.equal(b.p21.known, true);
  assert.equal(troopBadge(s, map, 'p01').text, b.p01.text, 'même résultat province par province');
});

test('V17.6 : pastilles — un allié montre ses effectifs exacts (bleu) ; une province ennemie visible aussi (rouge)', () => {
  const s = fresh();
  ally(s, 'valmorne', 'oroel');
  const b = troopBadge(s, map, 'p13');
  const p = s.provinces.p13, count = Object.values(p.units).reduce((a, n) => a + n, 0) + (p.warships || 0);
  assert.equal(b.tone, 'ally');
  assert.equal(b.known, true);
  assert.equal(b.count, count);
  assert.equal(badgeTone(s, 'oroel'), 'ally');
  assert.equal(badgeTone(s, 'valmorne'), 'own');
  assert.equal(badgeTone(s, 'noireflamme'), 'enemy');
  assert.equal(badgeTone(s, null), 'neutral');
  // Province ennemie voisine par la terre d'une province où l'on a des troupes : visible (sans forteresse) → exacte.
  const s2 = fresh();
  const target = map.provinces.find(d => s2.provinces[d.id].ownerId !== 'valmorne' && d.id !== 'p21' && d.landConnections.some(n => s2.provinces[n].ownerId === 'valmorne'));
  if (target) {
    const intel = provinceIntel(s2, map, 'valmorne', target.id);
    const tb = troopBadge(s2, map, target.id);
    assert.equal(tb.known, intel.troopsKnown);
    assert.equal(tb.tone, 'enemy');
  }
  // Forteresse ennemie : la pastille suit exactement la règle de la vision (troupes retranchées → « ? »).
  const s3 = fresh();
  s3.provinces.p13.buildings.fort = 1;
  assert.equal(troopBadge(s3, map, 'p13').known, provinceIntel(s3, map, 'valmorne', 'p13').troopsKnown);
});

// --- Noms de nations ---------------------------------------------------------------------------------------------------
test('V17.6 : grands noms de nations — un par île au départ, en majuscules, dans l’île, inclinaison bornée', () => {
  const s = fresh();
  const labels = nationLabels(map, s, id => map.nations.find(n => n.id === id).short);
  assert.deepEqual(labels.map(l => l.nationId).sort(), map.nations.map(n => n.id).sort());
  for (const l of labels) {
    assert.equal(l.text, map.nations.find(n => n.id === l.nationId).short.toLocaleUpperCase('fr'));
    assert.ok(Math.abs(l.angle) <= 22, `${l.nationId} ${l.angle}`);
    assert.ok(l.size >= 56 && l.size <= 120, `${l.nationId} ${l.size}`);
    const xs = l.provinceIds.flatMap(id => map.provinces.find(p => p.id === id).geometry.points.map(p => p[0]));
    const ys = l.provinceIds.flatMap(id => map.provinces.find(p => p.id === id).geometry.points.map(p => p[1]));
    assert.ok(l.x > Math.min(...xs) && l.x < Math.max(...xs) && l.y > Math.min(...ys) && l.y < Math.max(...ys), `${l.nationId} au-dessus de son île`);
  }
  assert.ok(!labels.some(l => l.provinceIds.includes('p21')), 'pas d’étiquette pour la garnison neutre');
});

test('V17.6 : noms de nations — suivent les conquêtes (île entière prise : deux étiquettes ; province isolée : aucune)', () => {
  const s = fresh();
  for (const id of ['p13', 'p14', 'p15', 'p16']) s.provinces[id].ownerId = 'valmorne';
  s.provinces.p05.ownerId = 'valmorne';
  const labels = nationLabels(map, s);
  const mine = labels.filter(l => l.nationId === 'valmorne');
  assert.equal(mine.length, 2, 'Valmorne + île d’Oroël conquise');
  assert.ok(!labels.some(l => l.nationId === 'oroel'), 'Oroël n’a plus de province');
  assert.ok(!mine.some(l => l.provinceIds.includes('p05')), 'une province isolée n’a pas son étiquette');
  // Nation réduite à une province : elle garde son nom.
  const s2 = fresh();
  for (const id of ['p14', 'p15', 'p16']) s2.provinces[id].ownerId = 'valmorne';
  assert.deepEqual(nationLabels(map, s2).find(l => l.nationId === 'oroel').provinceIds, ['p13']);
});

// --- Plein écran, module pur, cache hors ligne ------------------------------------------------------------------------
test('V17.6 : paysage — carte plein écran, barre d’infos et bande de boutons posées par-dessus, fiche latérale', () => {
  const css = read('paysage.css');
  assert.match(css, /#gameScreen \.map-frame\{inset:0;border:0;border-radius:0/);
  assert.match(css, /\.hud\{position:absolute;z-index:6;/);
  assert.match(css, /\.hud \.icon-btn\{position:fixed;[^}]*border-radius:50%/);
  assert.match(css, /nav\.bottom-bar\{position:absolute;[^}]*flex-direction:column/);
  assert.match(css, /--side:calc\(66px \+ env\(safe-area-inset-right,0px\)\)/);
  assert.match(css, /\.live-bar\{top:max\(6px,var\(--st\)\);left:calc\(var\(--hud-w\) \+ 14px/, 'message en haut au centre');
  assert.match(css, /body:has\(#provinceSheet:not\(\[hidden\]\)\) \.live-bar\{top:/, 'fiche ouverte : bandeau sous la barre d’infos');
});

test('V17.6 : module pur (sans DOM), en cache hors ligne, liste à jour', () => {
  for (const f of PRESENTATION_MODULES_V17_6) {
    const src = read(f);
    assert.doesNotMatch(src, /\b(document|window|localStorage|navigator)\b\./, `${f} sans DOM`);
    assert.doesNotMatch(src, /Math\.random|Date\.now/, `${f} déterministe`);
    assert.ok(read('sw.js').includes(`'./${f}'`), `${f} dans ASSETS de sw.js`);
  }
});
