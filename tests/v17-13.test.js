// V17.13 — Déplacements longs en un seul ordre (itinéraires) et vitesse ×2 gratuite en bêta interne (demandes de Jack du
// 26/11/2026). docs/V17-cahier-des-charges.md « V17.13 ».
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { arkenV9Map as map } from '../src/map/arken-v9-map.js';
import * as E from '../src/domain/game-engine.js';
import { isPortPoint } from '../src/domain/engine/sea-routes.js';
import { pairWar } from '../src/domain/engine/shared.js';
import { decodeRealtimeSave, encodeSave } from '../src/persistence/save-codec.js';
import { JOURNEY_TEXTS, journeyBanners, planSummary, stepsText } from '../src/presentation/journey-view.js';
import { BETA_X2_GRATUIT, fastSpeedUnlocked } from '../src/presentation/beta-flags.js';
import { premiumScreenHtml } from '../src/presentation/premium-view.js';
import { PRESENTATION_MODULES_V17_13, readSource, root } from './helpers/sources.js';

const ME = 'valmorne';
const read = p => readFileSync(join(root, p), 'utf8');
const names = { province: id => map.provinces.find(p => p.id === id)?.name || id, nation: id => id };
function game() {
  const s = E.createRealtimeGame({ map, playerNationId: ME, seed: 'v17-13' });
  for (const id of Object.keys(s.nations)) s.controllers[id] = 'human'; // aucune IA : scénarios contrôlés
  return s;
}
const run = (s, days) => { for (let i = 0; i < days && !s.gameOver; i++) E.advanceDay(s, map); };
const start = (s, o) => { const r = E.startJourney(s, map, { nationId: ME, ...o }); assert.ok(r.ok, r.error); E.executePendingOrders(s, map); return r; };
const ofType = (s, type) => s.events.filter(e => e.type === type && e.nationId === ME);
const truce = (s, other) => s.diplomacy.treaties.push({ type: 'ceasefire', parties: [ME, other], active: true, started: s.turn });

test('V17.13 : itinéraire calculé — plus court en jours, par ses propres provinces, sans passer par une voisine directe', () => {
  const s = game();
  assert.ok(!E.legalDestinations(map, s, 'p01').some(x => x.id === 'p04'), 'Haut-Bois n’est pas voisine de Valmorne');
  const p = E.planItinerary(map, s, { nationId: ME, fromId: 'p01', toId: 'p04', units: { infantry: 10 } });
  assert.ok(p.ok && p.safe);
  assert.equal(p.legs.length, 2);
  assert.equal(p.days, p.legs.reduce((n, l) => n + l.days, 0));
  for (const l of p.legs) assert.equal(l.days, E.landTravelDays({ infantry: 10 }, map, l.fromId, l.toId));
  // Plus court : aucun autre chemin à 2 étapes par la terre n'est plus rapide.
  const other = ['p02', 'p03'].map(v => E.landTravelDays({ infantry: 10 }, map, 'p01', v) + E.landTravelDays({ infantry: 10 }, map, v, 'p04'));
  assert.equal(p.days, Math.min(...other));
  assert.equal(stepsText('p01', p.legs, names), 'Valmorne → ' + p.legs.map(l => names.province(l.toId)).join(' → '));
});

test('V17.13 : vers une autre île, on n’embarque que depuis un point de port ; la traversée d’une nation est signalée', () => {
  const s = game();
  const p = E.planItinerary(map, s, { nationId: ME, fromId: 'p01', toId: 'p16', units: { infantry: 10 } });
  assert.ok(p.ok);
  assert.ok(p.legs.some(l => l.type === 'sea'));
  for (const l of p.legs.filter(x => x.type === 'sea')) assert.ok(isPortPoint(map, l.fromId), `embarquement depuis ${l.fromId}`);
  for (const l of p.legs) assert.ok(E.legalDestinations(map, s, l.fromId).some(x => x.id === l.toId && x.type === l.type), 'chaque étape est un déplacement légal');
  assert.equal(p.safe, false);
  assert.deepEqual(p.crossings.map(c => [c.nationId, c.war]), [['oroel', false]]);
  const sum = planSummary(p, { fromId: 'p01', day: s.day, names });
  assert.match(sum.warnings[0], /GUERRE/);
  assert.equal(sum.arriveDay, s.day + p.days);
});

test('V17.13 : les troupes enchaînent les étapes seules et arrivent à la date estimée', () => {
  const s = game(), before = s.provinces.p04.units.infantry;
  const r = start(s, { fromId: 'p01', toId: 'p04', units: { infantry: 30 } });
  assert.equal(s.journeys.length, 1);
  assert.ok(s.marches.some(m => m.journeyId === r.journeyId), 'la première étape est une marche ordinaire');
  run(s, r.plan.days + 1);
  assert.equal(s.provinces.p04.units.infantry, before + 30);
  assert.equal(s.journeys.length, 0);
  const done = ofType(s, 'journey-arrived');
  assert.equal(done.length, 1);
  assert.equal(done[0].day + 1, r.arriveDay, 'sur place le jour estimé');
  assert.equal(journeyBanners(s.events, ME, names)[0].tone, 'good');
});

test('V17.13 : règles de combat inchangées à chaque province traversée — entrer chez une nation = guerre, conquêtes', () => {
  const s = game();
  s.provinces.p01.units.infantry = 3000; s.provinces.p01.units.armor = 300;
  assert.ok(!pairWar(s, ME, 'oroel'));
  const r = start(s, { fromId: 'p01', toId: 'p16', units: { infantry: 3000, armor: 300 } });
  run(s, r.plan.days + 20);
  assert.ok(pairWar(s, ME, 'oroel'), 'la guerre est déclarée par l’étape qui entre chez Oroel');
  for (const id of r.plan.path.slice(1)) assert.equal(s.provinces[id].ownerId, ME, `${id} prise en chemin`);
  assert.ok(s.events.filter(e => e.type === 'conquest').length >= 2);
  assert.equal(ofType(s, 'journey-arrived').length, 1);
});

test('V17.13 : territoire interdit (trêve) — jamais traversé ; plus aucun chemin = refus clair', () => {
  const s = game();
  truce(s, 'oroel');
  const p = E.planItinerary(map, s, { nationId: ME, fromId: 'p01', toId: 'p16', units: { infantry: 10 } });
  assert.equal(p.ok, false);
  assert.match(p.error, /Aucun itinéraire/);
  assert.equal(E.startJourney(s, map, { nationId: ME, fromId: 'p01', toId: 'p16', units: { infantry: 10 } }).ok, false);
});

test('V17.13 : étape devenue impossible en cours de route → arrêt propre à l’étape, avec avis', () => {
  const s = game();
  const r = start(s, { fromId: 'p01', toId: 'p16', units: { infantry: 50 } });
  truce(s, 'oroel'); // signée pendant la première étape : la suite passe par Oroel
  const first = r.plan.legs[0];
  run(s, first.days + 2);
  assert.equal(s.journeys.length, 0);
  const stop = ofType(s, 'journey-stopped').at(-1);
  assert.equal(stop.reason, 'blocked');
  assert.equal(stop.provinceId, first.toId);
  assert.ok(s.provinces[first.toId].units.infantry >= 50, 'les troupes restent à l’étape');
  assert.ok(!s.marches.length && !(s.transports || []).length);
  const b = journeyBanners(s.events, ME, names).at(-1);
  assert.equal(b.tone, 'warn'); assert.match(b.text, /plus aucun chemin/);
});

test('V17.13 : chemin bloqué en route → recalcul par un autre chemin, avis « nouvel itinéraire »', () => {
  const s = game();
  const r = start(s, { fromId: 'p01', toId: 'p16', units: { infantry: 50 } });
  assert.deepEqual(r.plan.path, ['p01', 'p03', 'p14', 'p13', 'p16']);
  // Pendant la 1re étape, Nordhème passe à Aurel, en trêve avec nous : territoire interdit sur le chemin prévu.
  s.provinces.p14.ownerId = 'aurel'; truce(s, 'aurel');
  run(s, r.plan.legs[0].days + 1);
  const re = ofType(s, 'journey-rerouted').at(-1);
  assert.ok(re, 'avis de recalcul');
  assert.equal(re.provinceId, 'p03');
  const j = s.journeys[0];
  assert.ok(j && !j.legs.some(l => l.toId === 'p14'), 'le nouvel itinéraire évite Nordhème');
  assert.match(journeyBanners(s.events, ME, names).at(-1).text, /nouvel itinéraire/);
});

test('V17.13 : annuler en cours de route — les troupes finissent l’étape et s’y arrêtent', () => {
  const s = game();
  const r = start(s, { fromId: 'p01', toId: 'p04', units: { infantry: 30 } });
  run(s, 3);
  const stopAt = r.plan.legs[0].toId, before = s.provinces[stopAt].units.infantry;
  const c = E.cancelJourney(s, { nationId: ME, journeyId: r.journeyId });
  assert.ok(c.ok); assert.equal(c.stopAt, stopAt);
  assert.equal(s.journeys.length, 0);
  run(s, 60);
  assert.equal(s.provinces[stopAt].units.infantry, before + 30);
  assert.equal(s.provinces.p04.units.infantry, game().provinces.p04.units.infantry, 'pas de départ vers la suite');
  assert.equal(journeyBanners(s.events, ME, names).filter(b => b.key.includes('stopped')).length, 0, 'annulé par le joueur : pas de bandeau');
});

test('V17.13 : rediriger en cours de route — nouvelle destination prise à la prochaine étape', () => {
  const s = game();
  const r = start(s, { fromId: 'p01', toId: 'p04', units: { infantry: 30 } });
  run(s, 2);
  const back = E.redirectJourney(s, map, { nationId: ME, journeyId: r.journeyId, toId: 'p05' });
  assert.ok(back.ok, back.error);
  assert.equal(s.journeys[0].toId, 'p05');
  assert.ok(back.arriveDay > s.day);
  const bad = E.redirectJourney(s, map, { nationId: 'oroel', journeyId: r.journeyId, toId: 'p03' });
  assert.equal(bad.ok, false, 'seul le propriétaire redirige');
  const other = r.plan.legs[0].toId === 'p02' ? 'p03' : 'p02';
  assert.ok(E.redirectJourney(s, map, { nationId: ME, journeyId: r.journeyId, toId: other }).ok);
  run(s, 80);
  assert.equal(ofType(s, 'journey-arrived').at(-1).provinceId, other);
  assert.equal(s.journeys.length, 0);
});

test('V17.13 : « Rappeler » une étape arrête l’itinéraire (demi-tour, pas de nouveau départ)', () => {
  const s = game();
  const r = start(s, { fromId: 'p01', toId: 'p04', units: { infantry: 30 } });
  run(s, 4);
  const m = s.marches.find(x => x.journeyId === r.journeyId);
  assert.ok(E.recallMarch(s, { nationId: ME, marchId: m.id }).ok);
  assert.equal(s.journeys.length, 0);
  assert.equal(ofType(s, 'journey-stopped').at(-1).reason, 'recalled');
  const start01 = game().provinces.p01.units.infantry;
  run(s, 30);
  assert.equal(s.provinces.p01.units.infantry, start01);
});

test('V17.13 : avec des navires de guerre, l’itinéraire passe uniquement par la mer', () => {
  const s = game();
  const p = E.planItinerary(map, s, { nationId: ME, fromId: 'p03', toId: 'p13', units: { infantry: 10 }, warships: 2 });
  assert.ok(p.ok);
  assert.ok(p.legs.every(l => l.type === 'sea'));
  const land = E.planItinerary(map, s, { nationId: ME, fromId: 'p03', toId: 'p13', units: { infantry: 10 } });
  assert.ok(land.legs.some(l => l.type === 'land'));
  assert.equal(E.planItinerary(map, s, { nationId: ME, fromId: 'p03', toId: 'p04', warships: 1 }).ok, false);
});

test('V17.13 : déplacement vers une voisine inchangé (pas d’itinéraire), et itinéraire sauvegardé / relu', () => {
  const s = game();
  assert.ok(E.queueMoveOrder(s, map, { nationId: ME, fromId: 'p01', toId: 'p02', units: { infantry: 5 } }).ok);
  E.executePendingOrders(s, map);
  assert.equal((s.journeys || []).length, 0);
  assert.ok(s.marches.every(m => !m.journeyId));
  const r = start(s, { fromId: 'p01', toId: 'p04', units: { infantry: 30 } });
  const back = decodeRealtimeSave(encodeSave(s)).state;
  assert.deepEqual(back.journeys, s.journeys);
  run(back, r.plan.days + 1);
  assert.equal(ofType(back, 'journey-arrived').length, 1);
  // Ancienne sauvegarde (V17.12) sans itinéraire : liste vide.
  const old = JSON.parse(encodeSave(game()));
  assert.ok(!('journeys' in old), 'partie sans itinéraire : aucun champ ajouté (état identique à la V17.12)');
  assert.deepEqual(E.playerJourneys(decodeRealtimeSave(JSON.stringify(old)).state, ME), []);
  const broken = JSON.parse(encodeSave(s)); broken.journeys.push({ id: 'jx', legs: [] }, null);
  assert.equal(decodeRealtimeSave(JSON.stringify(broken)).state.journeys.length, s.journeys.length, 'itinéraire illisible écarté');
});

test('V17.13 : modules purs (sans DOM), en cache hors ligne ; textes FR et EN cohérents', () => {
  const sw = read('sw.js');
  for (const p of ['src/domain/realtime/itinerary.js', ...PRESENTATION_MODULES_V17_13, 'src/presentation/ui/journey-ui.js']) assert.ok(sw.includes(`'./${p}'`), p);
  for (const p of ['src/domain/realtime/itinerary.js', ...PRESENTATION_MODULES_V17_13]) assert.doesNotMatch(read(p), /document\.|window\.|localStorage|Math\.random|Date\.now/, p);
  const fr = JOURNEY_TEXTS.fr, en = JOURNEY_TEXTS.en;
  assert.deepEqual(Object.keys(fr).sort(), Object.keys(en).sort());
  assert.deepEqual(Object.keys(fr.why).sort(), Object.keys(en.why).sort());
  for (const k of Object.keys(fr)) assert.equal(typeof fr[k], typeof en[k], k);
  assert.match(fr.crossing('Oroel', false), /GUERRE/); assert.match(en.crossing('Oroel', false), /WAR/);
  const s = game(), p = E.planItinerary(map, s, { nationId: ME, fromId: 'p01', toId: 'p16' });
  assert.match(planSummary(p, { fromId: 'p01', day: 1, names, lang: 'en' }).arrival, /^Estimated arrival on [A-Z][a-z]+ \d+, 2027/);
  assert.match(planSummary(p, { fromId: 'p01', day: 1, names }).arrival, /^Arrivée estimée le /);
  // L'interface passe par l'itinéraire pour une province non voisine (temps réel), et dessine les itinéraires.
  const ui = readSource('app.js');
  assert.match(ui, /journeyTap\(id,near\)/);
  assert.match(ui, /journeysLayer\(\)/);
});

test('V17.13 : drapeau BETA_X2_GRATUIT — ×2 gratuit en bêta interne, Premium inchangé, documenté « à remettre à false »', () => {
  const src = read('src/presentation/beta-flags.js');
  assert.equal(BETA_X2_GRATUIT, true, 'bêta interne : ×2 gratuit');
  assert.equal((src.match(/export const BETA_X2_GRATUIT = (true|false);/g) || []).length, 1, 'un seul drapeau');
  assert.match(src, /À REMETTRE À false AVANT LA PRODUCTION/);
  // Production (drapeau à false) : ⏩ redevient Premium.
  assert.equal(fastSpeedUnlocked({ premium: false }, false), false);
  assert.equal(fastSpeedUnlocked(null, false), false);
  assert.equal(fastSpeedUnlocked({ premium: true }, false), true);
  assert.equal(fastSpeedUnlocked({ premium: false }, true), true);
  assert.equal(fastSpeedUnlocked({ premium: false }), BETA_X2_GRATUIT);
  // Le ⏩ de l'interface passe par ce drapeau ; la logique Premium (écran, achat de test) reste.
  const rt = read('src/presentation/ui/realtime-ui.js');
  assert.match(rt, /fastSpeedUnlocked\(profile\)/);
  assert.match(rt, /mode === 'fast' && !fastUnlocked\(\)\) \{ openPremium/);
  assert.doesNotMatch(rt, /mode === 'fast' && !isPremium\(\)/);
  assert.match(premiumScreenHtml({}, { betaFast: true, from: 'fast' }), /Bêta interne : la vitesse ×2 est gratuite/);
  assert.doesNotMatch(premiumScreenHtml({}, { betaFast: false }), /Bêta interne/);
  assert.match(premiumScreenHtml({}, { betaFast: false, from: 'fast' }), /La vitesse ×2 fait partie de Premium/);
  // Aucun paiement activé.
  assert.match(read('src/presentation/play-config.js'), /"billing":false/);
  // Documenté dans la checklist de publication et le guide Google Play.
  for (const d of ['docs/SORTIE-ARKEN.md', 'docs/GUIDE-GOOGLE-PLAY-TEST-INTERNE.md']) {
    const t = read(d);
    assert.match(t, /BETA_X2_GRATUIT/, d); assert.match(t, /à remettre à false avant la production/i, d);
  }
});

test('V17.13 : départ d’étape retiré avant de partir → itinéraire arrêté, troupes restées sur place (avis « annulé »)', () => {
  const s = game();
  const r = E.startJourney(s, map, { nationId: ME, fromId: 'p01', toId: 'p04', units: { infantry: 30 } });
  assert.ok(r.ok);
  s.orders = s.orders.filter(o => o.journeyId !== r.journeyId); // ordre retiré (fenêtre « Annuler cet ordre »)
  run(s, 2);
  assert.equal(s.journeys.length, 0);
  const stop = ofType(s, 'journey-stopped').at(-1);
  assert.equal(stop.reason, 'cancelled'); assert.equal(stop.provinceId, 'p01');
});

// --- Relecture V17.13 -------------------------------------------------------------------------------------------------
import { ensureWar } from '../src/domain/engine/diplomacy.js';
import { journeyPreset } from '../src/presentation/journey-view.js';
import { checkReleaseFlags, betaX2Flag, isProductionBuild } from '../scripts/check-release-flags.js';

test('V17.13 relecture : à l’étape, on ne repart qu’avec les survivants de l’armée (jamais la garnison ni une autre armée)', () => {
  const s = game();
  const r = start(s, { fromId: 'p01', toId: 'p04', units: { infantry: 10 } });
  const mid = r.plan.legs[0].toId;
  const m = s.marches.find(x => x.journeyId === r.journeyId);
  m.units.infantry = 6; // 4 morts en chemin
  s.provinces[mid].units = { ...s.provinces[mid].units, infantry: 5 }; // garnison de l'étape
  // Une autre armée à soi arrive le même jour à l'étape : elle n'est pas « adoptée » par l'itinéraire.
  assert.ok(E.queueMoveOrder(s, map, { nationId: ME, fromId: 'p01', toId: mid, units: { infantry: 40 } }).ok);
  E.executePendingOrders(s, map);
  s.marches.at(-1).arriveDay = m.arriveDay;
  run(s, r.plan.legs[0].days);
  const next = s.marches.find(x => x.journeyId === r.journeyId) || s.orders.find(o => o.journeyId === r.journeyId);
  if (!s.marches.some(x => x.journeyId === r.journeyId)) run(s, 1);
  const leg2 = s.marches.find(x => x.journeyId === r.journeyId);
  assert.ok(leg2 || next, 'l’itinéraire continue');
  assert.equal((leg2 || next).units.infantry, 6, 'repart avec les 6 survivants');
  assert.equal(s.journeys[0].carried.units.infantry, 6);
  assert.equal(s.provinces[mid].units.infantry, 5 + 40, 'garnison et autre armée restent à l’étape');
  run(s, 60);
  assert.equal(ofType(s, 'journey-arrived').at(-1)?.provinceId, 'p04');
});

test('V17.13 relecture : étape vers sa province prise par l’ennemi en chemin, bataille gagnée → l’itinéraire continue', () => {
  const s = game();
  s.provinces.p01.units.infantry = 2000; s.provinces.p01.units.armor = 200;
  const r = start(s, { fromId: 'p01', toId: 'p04', units: { infantry: 2000, armor: 200 } });
  const mid = r.plan.legs[0].toId;
  assert.equal(s.journeys[0].hostileLeg, false, 'étape vers chez soi au départ');
  ensureWar(s, ME, 'oroel');
  s.provinces[mid].ownerId = 'oroel';
  s.provinces[mid].units = Object.fromEntries(Object.keys(s.provinces[mid].units).map(k => [k, 0]));
  s.provinces[mid].units.infantry = 5;
  run(s, r.plan.legs[0].days + 15);
  assert.equal(s.provinces[mid].ownerId, ME, 'province reprise');
  assert.ok(!ofType(s, 'journey-stopped').some(e => e.reason === 'lost'), 'pas de « troupes perdues en chemin »');
  run(s, 60);
  assert.equal(ofType(s, 'journey-arrived').at(-1)?.provinceId, 'p04');
});

test('V17.13 relecture : date annoncée après recalcul = date réelle (départ le lendemain de l’arrivée à l’étape)', () => {
  const s = game();
  const r = start(s, { fromId: 'p01', toId: 'p16', units: { infantry: 50 } });
  s.provinces.p14.ownerId = 'aurel'; truce(s, 'aurel');
  run(s, r.plan.legs[0].days);
  const re = ofType(s, 'journey-rerouted').at(-1), j = s.journeys[0];
  assert.ok(re && j);
  assert.equal(E.journeyStatus(s, j).arriveDay, re.arriveDay, 'fiche (ordre en attente) = avis');
  E.executePendingOrders(s, map); // comme l'interface (realtime-ui.js) au tic suivant : state.day est déjà le lendemain
  const st = E.journeyStatus(s, j), tr = st.transport;
  assert.ok(tr, 'l’étape suivante est partie');
  assert.equal(st.arriveDay, re.arriveDay, 'date annoncée = date réelle du convoi + étapes restantes');
  assert.equal(tr.arriveDay, re.day + 1 + j.legs[0].days, 'départ le lendemain de l’arrivée');
});

test('V17.13 relecture : province qui n’a que des navires → navires présélectionnés dans la fenêtre d’itinéraire', () => {
  const none = { infantry: 0, cavalry: 0, archers: 0, armor: 0, artillery: 0 };
  assert.deepEqual(journeyPreset({ ...none, warships: 3 }, '50', { port: true }).warships, 2);
  assert.deepEqual(journeyPreset({ ...none, warships: 1 }, '50', { port: true }).warships, 1);
  assert.deepEqual(journeyPreset({ ...none, warships: 3 }, '100', { port: true }).warships, 3);
  assert.equal(journeyPreset({ ...none, infantry: 10, warships: 3 }, '50', { port: true }).warships, 0, 'avec des terrestres : escorte au choix');
  assert.equal(journeyPreset({ ...none, infantry: 10, warships: 3 }, '50', { port: true }).units.infantry, 5);
  assert.equal(journeyPreset({ ...none, warships: 3 }, '50', { port: false }).warships, 0, 'pas de route maritime : pas de navires');
  const ui = read('src/presentation/ui/journey-ui.js');
  assert.match(ui, /journeyPreset\(available, mode, \{ port \}\)/);
  assert.match(ui, /key === 'warships' \? first\.warships/);
});

test('V17.13 relecture : garde-fou de publication — AAB de production refusé tant que BETA_X2_GRATUIT vaut true', () => {
  const src = read('src/presentation/beta-flags.js');
  assert.equal(betaX2Flag(src), BETA_X2_GRATUIT);
  assert.equal(isProductionBuild({}), false);
  assert.equal(isProductionBuild({ ARKEN_ADS_PRODUCTION: 'true' }), true);
  assert.equal(isProductionBuild({ ARKEN_PRODUCTION: '1' }), true);
  assert.equal(isProductionBuild({ ARKEN_PRODUCTION: 'false' }), false);
  const on = 'export const BETA_X2_GRATUIT = true;', off = 'export const BETA_X2_GRATUIT = false;';
  assert.equal(checkReleaseFlags(on, {}).ok, true, 'test interne : ×2 gratuit autorisé');
  assert.equal(checkReleaseFlags(on, { ARKEN_ADS_PRODUCTION: 'true' }).ok, false);
  assert.equal(checkReleaseFlags(on, { ARKEN_PRODUCTION: '1' }).ok, false);
  assert.equal(checkReleaseFlags(off, { ARKEN_PRODUCTION: '1' }).ok, true);
  assert.equal(checkReleaseFlags('rien', {}).ok, false, 'drapeau introuvable = refus');
  // Branché sur l'AAB Google Play seulement, avant la construction ; l'APK de bêta n'y touche pas.
  const aab = read('.github/workflows/android-aab.yml'), apk = read('.github/workflows/android-apk.yml');
  assert.ok(aab.indexOf('node scripts/check-release-flags.js') > 0 && aab.indexOf('node scripts/check-release-flags.js') < aab.indexOf('node scripts/build.js'));
  assert.doesNotMatch(apk, /check-release-flags/);
  assert.match(read('docs/SORTIE-ARKEN.md'), /check-release-flags\.js/);
});
