// V17.3 — interface temps réel : icônes des troupes en route jour par jour (vision comprise), textes de date et de durée,
// bandeaux d'alerte (sans pause), horloge (jours par seconde, ×2, rattrapage plafonné, pause, reprise en pause),
// sauvegarde espacée, branchement de l'interface. Spécification : docs/V17-cahier-des-charges.md §1, §6, §8, §11, §12.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { arkenV9Map as map } from '../src/map/arken-v9-map.js';
import * as E from '../src/domain/game-engine.js';
import { createRealtimeGame } from '../src/domain/realtime/create.js';
import { visibleProvinces } from '../src/domain/vision.js';
import {
  SAVE_EVERY_DAYS, createDayClock, createSaveGate, daysPerSecond, dueDays, setClockPaused, setClockSpeed, syncClockHolds, wantSave
} from '../src/presentation/realtime-clock.js';
import {
  BANNER_MS, FAMINE_REMINDER_DAYS, balloonHopFraction, famineReminder, compositionText, convoyTokens, dateText, daysLeftText, durationText, eventBanners, headingAt,
  incomingBanners, marchTokens, monthlyIncomeText, pointsAhead, productionDays, proposalBanners, realtimeText, routeFraction,
  seaDays, tickerText, tokenPoint, tokenSheet, tokenTag, unitTokens, visibleBanners
} from '../src/presentation/realtime-view.js';
import { PRESENTATION_MODULES_V17_3, readSource, root } from './helpers/sources.js';

const read = p => readFileSync(join(root, p), 'utf8');
const names = { nation: id => ({ valmorne: 'Valmorne', 'roc-epine': 'Roc-Épine', noireflamme: 'Noireflamme', oroel: 'Oroël', aurel: 'Aurel' })[id] || id, province: id => map.provinces.find(p => p.id === id)?.name || id };
const game = (seed = 'v173') => createRealtimeGame({ map, playerNationId: 'valmorne', seed });
const vis = (s, me = 'valmorne') => visibleProvinces(s, map, me);
const anchor = id => map.provinces.find(p => p.id === id).markerAnchor;
/** Le joueur envoie la moitié de sa capitale vers une province voisine : la marche part tout de suite. */
function sendHalf(s) {
  const cap = s.nations.valmorne.capitalId, to = map.provinces.find(p => p.id === cap).landConnections[0], u = s.provinces[cap].units;
  const r = E.queueMoveOrder(s, map, { nationId: 'valmorne', fromId: cap, toId: to, units: { infantry: Math.floor(u.infantry / 2), cavalry: 0, armor: 0, artillery: 0 }, warships: 0 });
  assert.ok(r.ok, r.error);
  E.executePendingOrders(s, map);
  return s.marches.find(m => m.nationId === 'valmorne');
}

// --- Dates et durées ---------------------------------------------------------------------------------------------------
test('V17.3 : date « 12 mars 2027 », jours restants, durées en jours, revenus par mois', () => {
  assert.equal(dateText(1), '1er janvier 2027');
  assert.equal(dateText(71), '12 mars 2027');
  assert.equal(dateText(5479), '31 décembre 2041');
  assert.equal(daysLeftText(10, 10), 'aujourd’hui'); assert.equal(daysLeftText(11, 10), 'demain'); assert.equal(daysLeftText(28, 10), 'dans 18 jours');
  assert.equal(durationText(1), '1 jour'); assert.equal(durationText(30), '30 jours');
  assert.equal(productionDays('unit', 'infantry'), 30); assert.equal(productionDays('unit', 'warship'), 90);
  assert.equal(productionDays('building', 'bank'), 90); assert.equal(productionDays('building', 'fort'), 60); assert.equal(productionDays('balloon'), 60);
  assert.equal(seaDays(2), 60); assert.equal(seaDays(4), 120);
  assert.equal(monthlyIncomeText(16), '+8 or / mois'); assert.equal(monthlyIncomeText(5), '+2,5 or / mois');
  assert.equal(realtimeText('💰 Revenus du tour : +8 or'), '💰 Revenus du mois : +8 or');
  assert.equal(realtimeText('Convoi : 60 tours en mer.'), 'Convoi : 60 jours en mer.');
  assert.equal(realtimeText('il y a 2 tours'), 'il y a environ 60 jours');
  assert.equal(realtimeText('les navires font demi-tour'), 'les navires font demi-tour');
  assert.equal(realtimeText('Nous sommes au tour 3 : rien n’est joué.'), 'Nous sommes en mars 2027 : rien n’est joué.');
  assert.equal(realtimeText('Au tour 2, accordons-nous avant le prochain tour.'), 'En janvier 2027, accordons-nous avant le mois prochain.');
});

// --- Icônes des troupes en route -------------------------------------------------------------------------------------
test('V17.3 : avancement d’un trajet par jours entiers (à-coups), borné à [0, 1]', () => {
  assert.equal(routeFraction(10, 40, 10), 0);
  assert.equal(routeFraction(10, 40, 25), .5);
  assert.equal(routeFraction(10, 40, 25.9), .5, 'pas de mouvement entre deux jours');
  assert.equal(routeFraction(10, 40, 40), 1); assert.equal(routeFraction(10, 40, 99), 1); assert.equal(routeFraction(10, 40, 3), 0);
  assert.equal(routeFraction(10, 10, 10), 1, 'trajet nul : arrivé');
});
test('V17.3 : position de l’icône sur la flèche — extrémités en retrait des villes, cap, trajet restant', () => {
  const a = { x: 0, y: 0 }, b = { x: 1000, y: 0 };
  assert.deepEqual(tokenPoint([a, b], 0), { x: 70, y: 0, g: .07 });
  assert.equal(tokenPoint([a, b], 1).x, 930);
  assert.equal(tokenPoint([a, b], .5).x, 500);
  assert.equal(tokenPoint([a, { x: 100, y: 0 }], 0).x, 30, 'trajet court : retrait limité à 30 %');
  assert.equal(headingAt([a, b], .5), 0); assert.equal(headingAt([b, a], .5), 180); assert.equal(headingAt([a, { x: 0, y: 50 }], .2), 90);
  const ahead = pointsAhead([a, { x: 500, y: 0 }, { x: 500, y: 500 }], .6, { x: 500, y: 100 });
  assert.deepEqual(ahead, [{ x: 500, y: 100 }, { x: 500, y: 500 }], 'les étapes déjà passées disparaissent');
});
test('V17.3 : une armée envoyée part aussitôt et son icône avance chaque jour le long de sa flèche, jusqu’à l’arrivée', () => {
  const s = game(), m = sendHalf(s);
  assert.equal(m.arriveDay - m.startDay, 30);
  const a = anchor(m.fromId), b = anchor(m.toId), seen = [];
  for (let d = 0; d < 30; d++) {
    const [t] = marchTokens(s, map, 'valmorne', vis(s));
    assert.equal(t.id, m.id); assert.equal(t.own, true); assert.equal(t.known, true); assert.equal(t.recallable, true);
    assert.equal(t.fraction, d / 30, `jour ${d}`);
    seen.push(Math.hypot(t.x - a.x, t.y - a.y));
    // sur la droite départ → arrivée
    const cross = (b.x - a.x) * (t.y - a.y) - (b.y - a.y) * (t.x - a.x);
    assert.ok(Math.abs(cross) / Math.hypot(b.x - a.x, b.y - a.y) < 1.5, 'sur la flèche');
    assert.equal(tokenTag(t, s.day), `${30 - d} j`);
    E.advanceDay(s, map);
  }
  for (let i = 1; i < seen.length; i++) assert.ok(seen[i] > seen[i - 1], 'avance d’un pas chaque jour');
  E.advanceDay(s, map);
  assert.equal(marchTokens(s, map, 'valmorne', vis(s)).length, 0, 'arrivée : plus d’icône');
});
test('V17.3 : rappel — l’icône fait demi-tour (retour, plus de « Rappeler »)', () => {
  const s = game(), m = sendHalf(s);
  for (let i = 0; i < 12; i++) E.advanceDay(s, map);
  const r = E.recallMarch(s, { nationId: 'valmorne', marchId: m.id });
  assert.ok(r.ok);
  const [t] = marchTokens(s, map, 'valmorne', vis(s));
  assert.equal(t.returning, true); assert.equal(t.recallable, false); assert.equal(t.toId, m.fromId);
  assert.equal(tokenTag(t, s.day), '↩ 12 j');
  const sheet = tokenSheet(t, s.day, names);
  assert.equal(sheet.title, 'Armée qui rentre'); assert.match(sheet.arrival, /dans 12 jours/);
});
test('V17.3 : vision (§8) — armée ennemie invisible si départ et arrivée hors de vue ; visible quand elle vient chez soi, composition selon le départ', () => {
  const s = game(), me = 'valmorne';
  const far = map.provinces.filter(p => s.provinces[p.id].ownerId === 'aurel').map(p => p.id);
  const visible = vis(s);
  const hiddenFrom = far.find(id => !visible.has(id));
  assert.ok(hiddenFrom, 'une province d’Aurel hors de vue');
  const hiddenTo = map.provinces.find(p => p.id !== hiddenFrom && !visible.has(p.id))?.id;
  const base = { kind: 'land', nationId: 'aurel', units: { infantry: 40, cavalry: 0, armor: 0, artillery: 0 }, warships: 0, wounds: {}, startDay: s.day, arriveDay: s.day + 30, hostile: true, truces: [] };
  s.marches.push({ ...base, id: 'mx', fromId: hiddenFrom, toId: hiddenTo });
  assert.equal(marchTokens(s, map, me, vis(s)).length, 0, 'aucune fuite : marche lointaine cachée');
  const mine = map.provinces.find(p => s.provinces[p.id].ownerId === me).id;
  s.marches.push({ ...base, id: 'my', fromId: hiddenFrom, toId: mine });
  const [t] = marchTokens(s, map, me, vis(s));
  assert.equal(t.id, 'my'); assert.equal(t.known, false); assert.equal(t.composition, null); assert.equal(t.recallable, false);
  assert.match(tokenSheet(t, s.day, names).composition, /inconnue/);
  // Allié : vision partagée, composition connue.
  s.diplomacy.treaties.push({ type: 'alliance', parties: [me, 'aurel'], active: true, startedTurn: s.turn });
  const [ta] = marchTokens(s, map, me, vis(s)).filter(x => x.id === 'mx');
  assert.equal(ta.relation, 'ally'); assert.equal(ta.known, true); assert.equal(ta.composition, '40 fantassins'); assert.equal(compositionText({ units: { infantry: 1, armor: 2 }, warships: 3 }), '1 fantassin · 2 blindés · 3 navires de guerre');
});
test('V17.3 : convois visibles de tous, position selon les jours en mer, composition pour soi seulement', () => {
  const s = game('convois');
  for (let i = 0; i < 400 && !(s.transports || []).some(t => t.nationId !== 'valmorne'); i++) E.advanceDay(s, map);
  const foreign = s.transports.find(t => t.nationId !== 'valmorne');
  assert.ok(foreign, 'un convoi d’IA en mer');
  const tok = convoyTokens(s, map, 'valmorne', new Set()).find(t => t.id === foreign.id);
  assert.ok(tok); assert.equal(tok.kind, 'convoy'); assert.equal(tok.known, false);
  const before = tok.fraction; E.advanceDay(s, map);
  const after = convoyTokens(s, map, 'valmorne', new Set()).find(t => t.id === foreign.id);
  if (after) assert.ok(after.fraction > before, 'le navire avance d’un jour');
  assert.ok(unitTokens(s, map, 'valmorne', vis(s)).length >= 1);
});
test('V17.3 : ballon en vol — avance jour par jour sur son saut de 60 jours', () => {
  assert.equal(balloonHopFraction(0, 1), 0);
  assert.equal(balloonHopFraction(0, 16), 15 / 60);
  assert.equal(balloonHopFraction(1, 1), 30 / 60);
  assert.equal(balloonHopFraction(1, 30), 59 / 60);
});

// --- Bandeaux ------------------------------------------------------------------------------------------------------
test('V17.3 : bandeaux d’alerte — attaque en approche, conquête, capitale, ballon, famine à venir, fin ; une seule fois chacun', () => {
  const s = game(), me = 'valmorne', mine = map.provinces.find(p => s.provinces[p.id].ownerId === me).id;
  const from = map.provinces.find(p => s.provinces[p.id].ownerId === 'roc-epine').id;
  s.marches.push({ id: 'atk', kind: 'land', nationId: 'roc-epine', fromId: from, toId: mine, units: { infantry: 40 }, warships: 0, wounds: {}, startDay: 1, arriveDay: 31, hostile: true, truces: [] });
  const tokens = unitTokens(s, map, me, vis(s)), seen = new Set();
  const inc = incomingBanners(s, tokens, me, names, seen);
  assert.equal(inc.length, 1); assert.equal(inc[0].kind, 'attack'); assert.match(inc[0].text, /Roc-Épine en route vers .* arrivée le 31 janvier 2027/);
  assert.deepEqual(inc[0].action, { type: 'unit', kind: 'march', id: 'atk' });
  seen.add(inc[0].key);
  assert.equal(incomingBanners(s, tokens, me, names, seen).length, 0, 'une fois par trajet');
  const ev = eventBanners([
    { type: 'conquest', provinceId: 'p05', defender: 'roc-epine', newOwnerId: me, day: 40 },
    { type: 'conquest', provinceId: 'p02', defender: me, newOwnerId: 'aurel', day: 41 },
    { type: 'capital-plunder', provinceId: 'p05', attacker: me, defender: 'roc-epine', day: 40 },
    { type: 'balloon-spotted', nationId: me, owner: 'oroel', balloonId: 'b1', over: me, turn: 2 },
    { type: 'food-alert', nationId: me, daysLeft: 8, day: 50 }, { type: 'food-alert', nationId: 'aurel', daysLeft: 3, day: 50 },
    { type: 'famine-start', nationId: me, day: 58 }, { type: 'famine-end', nationId: me, day: 70 },
    { type: 'final-days', alert: 'year', day: 5115 },
    { type: 'conquest', provinceId: 'p09', defender: 'aurel', newOwnerId: 'oroel', day: 42 }
  ], me, names);
  assert.deepEqual(ev.map(b => b.kind), ['conquest', 'conquest', 'capital', 'balloon', 'famine', 'famine', 'famine', 'final'], 'rien pour les affaires des autres');
  assert.equal(ev[0].tone, 'good'); assert.equal(ev[1].tone, 'bad'); assert.match(ev[4].text, /Famine à venir : vivres pour 8 jours/);
  assert.match(ev[7].text, /Il reste 1 an/);
  const props = proposalBanners([{ from: 'oroel', to: me, action: 'alliance', turn: 3 }], names);
  assert.equal(props[0].kind, 'proposal'); assert.match(props[0].text, /Oroël vous propose une alliance/);
  assert.equal(proposalBanners([{ from: 'oroel', to: me, action: 'alliance', turn: 3 }], names, new Set([props[0].key])).length, 0);
  // Affichage : au plus 2, les plus récents, rangés après BANNER_MS ou fermés.
  const list = [{ key: 'a', at: 0 }, { key: 'b', at: 1000 }, { key: 'c', at: 2000, dismissed: true }, { key: 'd', at: 3000 }];
  assert.deepEqual(visibleBanners(list, 3500).map(b => b.key), ['b', 'd']);
  assert.deepEqual(visibleBanners(list, BANNER_MS + 1500).map(b => b.key), ['d']);
});
test('V17.3 + V17.4 : famine — un bandeau au début, puis au plus un rappel tous les 30 jours (pas un par désertion)', () => {
  const me = 'valmorne', des = day => ({ type: 'famine-desertion', nationId: me, day, deserted: { infantry: 2 } });
  assert.equal(FAMINE_REMINDER_DAYS, 30);
  const start = eventBanners([{ type: 'famine-start', nationId: me, day: 100 }, des(100)], me, names);
  assert.deepEqual(start.map(b => b.kind), ['famine'], 'la désertion du jour ne fait pas de bandeau');
  assert.equal(famineReminder([des(101)], me, 100), null);
  assert.equal(famineReminder([des(129)], me, 100), null);
  const r = famineReminder([des(130)], me, 100);
  assert.equal(r.kind, 'famine'); assert.equal(r.day, 130); assert.match(r.text, /Famine toujours en cours : 2 fantassins ont déserté/);
  assert.equal(famineReminder([{ ...des(200), nationId: 'aurel' }], me, 100), null, 'rien pour les autres nations');
  const ui = readSource('app.js');
  assert.doesNotMatch(ui, /showFoodNews/, 'plus de message à chaque désertion');
  assert.match(ui, /famineReminder\(events, me, famineDay\)/);
  assert.match(ui, /drawFoodHud\(\)/);
  assert.match(read('index.html'), /<button id="foodStat" type="button" class="hud-stat food-stat" hidden><small>🌾 VIVRES<\/small><b id="foodReserve">/);
  assert.match(ui, /export const sheetSlots=\{food:id=>\{const line=provinceFoodLine\(state,id\)/, 'ligne 🌾 dans l’emplacement de la fiche');
  assert.match(ui, /x\.type==='farm'\?`\$\{x\.cost\?\?'—'\} or · \$\{farmCardText\(x\.count\)\.days\} jours/, 'carte Ferme dans Construction');
});
test('V17.3 : message d’événement — pause, armées en approche, dernier fait du journal, troupes en route', () => {
  const s = game();
  assert.match(tickerText(s, 'valmorne', { paused: true }).text, /En pause — touchez ▶/);
  assert.match(tickerText(s, 'valmorne', { coming: 2 }).text, /2 armées étrangères en route/);
  s.turnJournal = [];
  assert.match(tickerText(s, 'valmorne', { mine: 1 }).text, /1 troupe en route/);
  s.turnJournal = [{ text: '💰 Revenus du tour : +8 or\nsuite' }];
  assert.equal(tickerText(s, 'valmorne').text, '💰 Revenus du mois : +8 or');
});

// --- Horloge -------------------------------------------------------------------------------------------------------
test('V17.3 : horloge — 0,5 jour par seconde, ×2 = 1 jour par seconde, rattrapage plafonné à 4, pause, arrêts hors jeu', () => {
  const c = createDayClock({ now: 0 });
  assert.equal(c.paused, true, 'nouvelle partie ou partie reprise : en pause (§1.4)');
  assert.equal(daysPerSecond(c), 0); assert.equal(dueDays(c, 60000), 0, 'en pause, rien ne passe');
  setClockPaused(c, false, 60000);
  assert.equal(daysPerSecond(c), .5);
  let days = 0; for (let t = 60250; t <= 120000; t += 250) days += dueDays(c, t);
  assert.equal(days, 30, 'une minute de jeu = 30 jours');
  setClockSpeed(c, 2, 120000); assert.equal(daysPerSecond(c), 1);
  days = 0; for (let t = 120250; t <= 130000; t += 250) days += dueDays(c, t);
  assert.equal(days, 10, '×2 : 10 jours en 10 s');
  assert.equal(dueDays(c, 190000), 4, 'téléphone gelé une minute : 4 jours au plus, le reste est oublié');
  assert.equal(dueDays(c, 190500), 0);
  syncClockHolds(c, { menu: true }, 191000); assert.equal(dueDays(c, 200000), 0, 'Réglages / Aide / Premium… ouverts : le temps s’arrête');
  syncClockHolds(c, { menu: false, hidden: true }, 200000); assert.equal(dueDays(c, 210000), 0, 'appli en arrière-plan');
  syncClockHolds(c, { hidden: false }, 210000); assert.equal(dueDays(c, 211000), 1);
  setClockPaused(c, true, 211000); assert.equal(dueDays(c, 300000), 0);
  // Changer de vitesse ne fait ni perdre ni gagner de jour entamé.
  const d = createDayClock({ now: 0, paused: false }); dueDays(d, 1500); setClockSpeed(d, 2, 1500);
  assert.equal(dueDays(d, 1500), 0); assert.equal(dueDays(d, 1750), 1, '¾ de jour en ×1 = ¾ de jour en ×2');
});
test('V17.3 : sauvegarde — tous les 10 jours, à chaque pause / ordre / arrière-plan, jamais plus d’une fois par seconde', () => {
  const g = createSaveGate({ day: 1, now: 0 });
  assert.equal(SAVE_EVERY_DAYS, 10);
  assert.equal(wantSave(g, 'day', 5, 5000), false, 'pas à chaque jour');
  assert.equal(wantSave(g, 'day', 11, 10000), true, '10 jours plus tard');
  assert.equal(wantSave(g, 'order', 11, 10500), false, 'moins d’une seconde après : reporté…');
  assert.equal(g.pending, true);
  assert.equal(wantSave(g, 'day', 12, 11600), true, '… au battement suivant');
  assert.equal(wantSave(g, 'pause', 12, 13000), true);
  assert.equal(wantSave(g, 'hidden', 12, 13100), true, 'arrière-plan : toujours (l’appli peut être coupée)');
  assert.equal(wantSave(g, 'day', 21, 20000), false); assert.equal(wantSave(g, 'day', 22, 21000), true);
});

// --- Branchement de l'interface -----------------------------------------------------------------------------------
test('V17.3 : modules purs (sans DOM ni minuterie) et en cache hors ligne', () => {
  const sw = read('sw.js');
  for (const f of PRESENTATION_MODULES_V17_3) {
    const code = read(f).replace(/\/\/.*$/gm, '');
    assert.doesNotMatch(code, /\bdocument\b|\bwindow\b|localStorage|setInterval|setTimeout|Math\.random/, f);
    assert.ok(sw.includes(`'./${f}'`), `${f} dans ASSETS`);
  }
  assert.ok(sw.includes("'./src/presentation/ui/map-units-layer.js'"));
});
test('V17.3 : interface — ▶ ⏸ ⏩ et date en bas à droite, cadenas Premium, bandeaux sans pause, icônes dans #mapWorld, plus de tour', () => {
  const html = read('index.html'), ui = readSource('app.js');
  for (const id of ['rtDock', 'rtDate', 'rtDateText', 'rtPlay', 'rtPause', 'rtFast', 'rtAlerts', 'premiumDialog', 'foodStat']) assert.match(html, new RegExp(`id="${id}"`), id);
  assert.match(html, /class="rt-lock"/);
  // Le temps ne s'arrête que hors du jeu (Réglages, Aide, Atouts, Palmarès, Premium, fin de partie), pub, arrière-plan.
  assert.match(ui, /OUT_OF_GAME = \['#settingsDialog', '#helpDialog', '#boostDialog', '#palmaresDialog', '#premiumDialog', '#endDialog'\]/);
  assert.doesNotMatch(ui.match(/const OUT_OF_GAME[^\n]*/)[0], /actionDialog|eventDialog|journalDialog|talkDialog/, 'fiches, alertes, journal, échanges : le temps tourne');
  assert.match(ui, /if \(mode === 'fast' && !isPremium\(\)\) \{ \$\('#premiumDialog'\)\?\.showModal\(\)/);
  assert.match(ui, /createDayClock\(\{ now: t, paused: true \}\)/, 'reprise toujours en pause');
  assert.match(ui, /if\(rt\)world\.append\(safeEngine\(\(\)=>unitsLayer\(\)/, 'icônes DANS #mapWorld (copies <use>)');
  assert.match(ui, /if\(!rt\)save\(\)/, 'plus de sauvegarde à chaque rendu en temps réel');
  assert.match(ui, /wantSave\(gate, reason, state\.day, now\(\)\)/);
  assert.match(ui, /saveFor\('hidden'\)/); assert.match(ui, /saveFor\('pause'\)/); assert.match(ui, /saveFor\('order'\)/); assert.match(ui, /saveFor\('day'\)/);
  const css = read('v5.css');
  assert.match(css, /body\.rt-on #nextTurn,body\.rt-on \.hud-stat:has\(#turn\)\{display:none\}/, 'ni « Fin du tour » ni « TOUR » en temps réel');
  assert.match(css, /body\.rt-on #livePause/);
});
