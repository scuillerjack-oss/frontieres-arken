// V17.8 — Fin de partie et classement du temps réel (docs/V17-cahier-des-charges.md §9, §12 « V17.8 ») : formule du
// classement à points, photo tous les 10 jours, chaque fin (conquête, dernière nation, défaite, dernier jour, partie courte,
// paix générale proposée au joueur seul : offre à 90 jours, refus → relance à 180 jours, acceptation → vainqueur au
// classement), palmarès et titres en jours, écran de fin, écran 🏆, nouvelle partie.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { arkenV9Map as map } from '../src/map/arken-v9-map.js';
import { RULES } from '../src/domain/constants.js';
import * as E from '../src/domain/game-engine.js';
import { endOfferOf } from '../src/domain/realtime/end.js';
import { foodPointsCap } from '../src/domain/realtime/ranking.js';
import { emptyPalmares, recordFinishedGame, TITLES } from '../src/domain/palmares.js';
import { buildEndStory } from '../src/domain/story.js';
import { endStoryHtml } from '../src/presentation/end-view.js';
import { palmaresHtml } from '../src/presentation/palmares-view.js';
import {
  elapsedText, endDurationHtml, finalRankingHtml, peaceOfferHtml, periodLabel, playTimeText, rankingHtml, realtimeEndKicker,
  realtimeEndWhy, realtimeLengthLabel, realtimeLengthText, revealedCharactersHtml
} from '../src/presentation/ranking-view.js';
import { decodeRealtimeSave, encodeSave } from '../src/persistence/save-codec.js';
import { readSource, flatSource } from './helpers/sources.js';

const R = RULES.realtime, K = R.ranking;
const NATIONS = map.nations.map(n => n.id);
const ME = 'valmorne';
/** Partie de test : par défaut, aucune IA (contrôleurs humains) pour que rien ne bouge tout seul. */
function game({ seed = 'arken-v178', ais = [], gameLength } = {}) {
  const s = E.createRealtimeGame({ map, playerNationId: ME, seed, gameLength });
  for (const id of NATIONS) s.controllers[id] = id === ME ? 'human' : ais.includes(id) ? 'ai' : 'human';
  s.diplomacy.wars = [];
  return s;
}
const ally = (s, a, b) => s.diplomacy.treaties.push({ type: 'alliance', parties: [a, b], active: true, started: s.turn });
const allyAll = (s, ids = NATIONS.filter(id => !s.nations[id].eliminated)) => { for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) ally(s, ids[i], ids[j]); };
const untilDay = (s, day) => { while (s.day < day && !s.gameOver) E.advanceDay(s, map); };
const give = (s, ids, owner) => { for (const id of ids) s.provinces[id].ownerId = owner; };
/** Valeur en or des troupes calculée à la main (coût de recrutement ÷ nombre d'unités livrées). */
function goldByHand(s, id) {
  const per = k => RULES.units[k].cost / RULES.units[k].amount;
  let g = 0;
  for (const p of Object.values(s.provinces)) if (p.ownerId === id) { for (const [k, n] of Object.entries(p.units)) g += n * per(k); g += (p.warships || 0) * per('warship'); }
  for (const m of s.marches || []) if (m.nationId === id) { for (const [k, n] of Object.entries(m.units || {})) g += n * per(k); g += (m.warships || 0) * per('warship'); }
  return g;
}

// --- Formule (§9.2) -------------------------------------------------------------------------------------------------
test('V17.8 : formule du classement — 100 / province, +150 / capitale, 1 / 20 or de troupes, 1 / 20 or de trésor, 1 / 50 jours sans famine', () => {
  assert.deepEqual({ ...K }, { province: 100, capital: 150, troopGoldPerPoint: 20, treasuryGoldPerPoint: 20, noFamineDaysPerPoint: 50, refreshEveryDays: 10 });
  const s = game();
  s.day = 251; s.nations[ME].treasury = 419;
  give(s, ['p05', 'p21'], ME); // une capitale étrangère et l'île mystérieuse
  const sc = E.nationScore(s, ME), gold = goldByHand(s, ME);
  assert.equal(sc.provinces, 6); assert.equal(sc.capitals, 2);
  assert.equal(sc.troopGold, Math.floor(gold));
  assert.deepEqual(sc.parts, { provinces: 600, capitals: 300, troops: Math.floor(Math.floor(gold) / 20), treasury: 20, food: 5 });
  assert.equal(sc.score, 600 + 300 + Math.floor(Math.floor(gold) / 20) + 20 + 5);
  // Troupes en marche et blessés comptent ; famine retirée des jours sans famine.
  s.rt.famineTotal = { [ME]: 60 };
  assert.equal(E.nationScore(s, ME).parts.food, Math.floor((251 - 60) / 50));
  // Plafond : 109 en partie normale, 51 en partie courte.
  assert.equal(foodPointsCap(s), 109); assert.equal(foodPointsCap(game({ gameLength: 40 })), 51);
  s.day = 99999; assert.equal(E.nationScore(s, ME).parts.food, 109 - 1); // 5 479 − 60 jours de famine
  // Nation éliminée : 0 point.
  s.nations.aurel.eliminated = true; give(s, ['p17', 'p18', 'p19', 'p20'], 'oroel');
  assert.equal(E.nationScore(s, 'aurel').score, 0);
});
test('V17.8 : ordre du classement — points, puis provinces, capitales, identifiant ; éliminées après, la plus tardive devant', () => {
  const s = game();
  // Départ symétrique (mêmes troupes, même trésor) : égalité parfaite → identifiant.
  for (const n of Object.values(s.nations)) n.treasury = 0;
  const base = E.realtimeRanking(s);
  assert.deepEqual(base.map(r => r.rank), [1, 2, 3, 4, 5]);
  s.nations.oroel.treasury = 400; // +20 points
  assert.equal(E.realtimeRanking(s)[0].nationId, 'oroel');
  give(s, ['p13', 'p14', 'p15', 'p16'], 'aurel'); s.nations.oroel.eliminated = true; s.nations.oroel.eliminatedDay = 300;
  give(s, ['p09', 'p10', 'p11', 'p12'], 'aurel'); s.nations.noireflamme.eliminated = true; s.nations.noireflamme.eliminatedDay = 500;
  const r = E.realtimeRanking(s);
  assert.equal(r[0].nationId, 'aurel');
  assert.deepEqual(r.slice(-2).map(x => x.nationId), ['noireflamme', 'oroel']); // éliminée le jour 500 devant celle du jour 300
  assert.ok(r.slice(-2).every(x => x.score === 0 && x.eliminated));
});
test('V17.8 : photo du classement tous les 10 jours, jours de famine comptés chaque jour', () => {
  const s = game();
  const first = E.rankingSnapshot(s);
  assert.equal(first.day, 1);
  untilDay(s, 9); s.nations[ME].treasury += 2000;
  assert.equal(E.rankingSnapshot(s).day, 1, 'pas de mise à jour avant le 10e jour');
  untilDay(s, 11);
  assert.equal(E.rankingSnapshot(s).day, 10);
  assert.equal(E.nextRankingDay(10), 20);
  assert.ok(E.rankingSnapshot(s).rows.find(r => r.nationId === ME).parts.treasury >= 100);
  s.nations[ME].food.reserve = 0; s.nations[ME].food.famine = true;
  for (const p of Object.values(s.provinces)) if (p.ownerId === ME) p.units.infantry += 4000; // consommation > production
  untilDay(s, 16);
  assert.equal(E.famineTotal(s, ME), 5);
  assert.equal(E.noFamineDays(s, ME), 16 - 5);
});

// --- Fins (§9.1) ----------------------------------------------------------------------------------------------------
test('V17.8 : conquête — les cinq capitales = victoire immédiate, au jour même ; écran de fin daté', () => {
  const s = game();
  untilDay(s, 40);
  give(s, ['p05', 'p09', 'p13', 'p17'], ME);
  E.advanceDay(s, map);
  assert.equal(s.gameOver.reason, 'capitals'); assert.equal(s.gameOver.winnerId, ME); assert.equal(s.gameOver.day, 40);
  assert.equal(s.gameOver.scoring, 'points'); assert.equal(s.gameOver.ranking[0].nationId, ME);
  const day = s.day; E.advanceDay(s, map); assert.equal(s.day, day, 'le temps s’arrête : plus rien ne bouge');
  assert.match(realtimeEndKicker(s.gameOver), /^9 FÉVRIER 2027 · CONQUÊTE DU MONDE$/);
  assert.ok(s.events.some(e => e.type === 'game-over' && e.reason === 'capitals' && e.day === 40));
});
test('V17.8 : dernière nation debout = conquête du monde ; défaite du joueur ; une IA seule ne finit pas par la paix', () => {
  const s = game();
  // Toutes les autres nations éliminées sans tenir toutes les capitales (une capitale neutre, cas d'école).
  for (const id of NATIONS.filter(x => x !== ME)) { s.nations[id].eliminated = true; }
  give(s, ['p05', 'p06', 'p07', 'p08', 'p09', 'p10', 'p11', 'p12', 'p13', 'p14', 'p15', 'p16', 'p17', 'p18', 'p19', 'p20'], ME);
  s.provinces.p17.ownerId = null;
  E.advanceDay(s, map);
  assert.equal(s.gameOver.reason, 'last-nation'); assert.equal(s.gameOver.winnerId, ME);
  // Défaite : le joueur n'a plus de province.
  const d = game();
  give(d, ['p01', 'p02', 'p03', 'p04'], 'roc-epine');
  untilDay(d, 3);
  assert.equal(d.gameOver.reason, 'player-eliminated'); assert.notEqual(d.gameOver.winnerId, ME);
  assert.equal(d.gameOver.ranking.at(-1).nationId, ME);
  // Partie d'IA (personne d'humain) toutes alliées : jamais d'offre de paix.
  const ai = game({ ais: NATIONS }); ai.controllers[ME] = 'ai'; allyAll(ai);
  for (let i = 0; i < 120; i++) E.dailyEnd(ai, []), ai.day++;
  assert.equal(E.peaceOfferPending(ai), false); assert.equal(ai.gameOver, undefined);
});
test('V17.8 : fin au dernier jour (31 décembre 2041) et partie courte (31 décembre 2033) : le classement à points désigne le vainqueur', () => {
  for (const [length, last, date] of [[undefined, 5479, '31 DÉCEMBRE 2041'], [40, 2557, '31 DÉCEMBRE 2033']]) {
    const s = game({ gameLength: length });
    s.day = last - 2; s.turn = Math.ceil(s.day / 30);
    s.nations.aurel.treasury = 9000; // 450 points de trésor : Aurel passe devant tout le monde
    untilDay(s, last + 5);
    assert.equal(s.gameOver.reason, 'turn-limit'); assert.equal(s.gameOver.day, last); assert.equal(s.day, last);
    assert.equal(s.gameOver.winnerId, 'aurel'); assert.equal(s.gameOver.ranking[0].nationId, 'aurel');
    assert.ok(realtimeEndKicker(s.gameOver).startsWith(date));
    assert.match(realtimeEndWhy(s.gameOver, { me: ME, name: id => id }), /classement à points/);
  }
});
test('V17.8 : paix générale — offre au joueur seul après 90 jours ; refus → relance à 180 jours ; acceptation → fin au classement', () => {
  const s = game();
  allyAll(s);
  untilDay(s, 90); // jours 1 à 89 joués
  assert.equal(E.peaceOfferPending(s), false, 'pas avant 90 jours de paix');
  assert.equal(E.peaceDays(s), 89);
  E.advanceDay(s, map); // jour 90 : 90e jour de paix
  assert.equal(E.peaceOfferPending(s), true);
  assert.equal(s.endOffer.offerDay, 90);
  // Refus : reproposée 180 jours plus tard, pas avant, tant que la paix dure.
  const r = E.answerPeaceOffer(s, false);
  assert.deepEqual(r, { ok: true, ended: false, nextOfferDay: 90 + 180 });
  untilDay(s, 270);
  assert.equal(E.peaceOfferPending(s), false);
  E.advanceDay(s, map);
  assert.equal(E.peaceOfferPending(s), true, 'relance à 180 jours');
  // Une offre en attente ne fait pas avancer la partie toute seule vers la fin ; acceptation : vainqueur = premier au classement.
  s.nations.oroel.treasury = 9000;
  const a = E.answerPeaceOffer(s, true);
  assert.deepEqual(a, { ok: true, ended: true });
  assert.equal(s.gameOver.reason, 'peace'); assert.equal(s.gameOver.winnerId, 'oroel'); assert.equal(s.gameOver.day, 271); // le jour affiché quand le joueur répond
  assert.equal(E.answerPeaceOffer(s, true).ok, false);
  assert.match(realtimeEndKicker(s.gameOver), /PAIX GÉNÉRALE/);
});
test('V17.8 : paix générale — une alliance rompue ou un combat remet le compteur à zéro ; il faut toutes les nations restantes', () => {
  const s = game();
  allyAll(s);
  untilDay(s, 60);
  s.diplomacy.treaties = s.diplomacy.treaties.filter(t => !(t.parties.includes('aurel') && t.parties.includes('oroel')));
  E.advanceDay(s, map);
  assert.equal(s.endOffer.peaceSince, null);
  ally(s, 'aurel', 'oroel');
  untilDay(s, 140);
  assert.equal(E.peaceOfferPending(s), false, 'compteur reparti du jour 62');
  untilDay(s, 152);
  assert.equal(E.peaceOfferPending(s), true);
  // Combat entre deux nations vivantes : remise à zéro (offre retirée).
  E.dailyEnd(s, [{ type: 'battle', nationId: 'aurel', defenderId: 'oroel', provinceId: 'p13' }]);
  assert.equal(E.peaceOfferPending(s), false); assert.equal(s.endOffer.peaceSince, null);
  assert.equal(E.combatBetweenAlive(s, [{ type: 'income', nationId: ME }]), false);
  // Une nation éliminée ne compte plus : les restantes alliées suffisent.
  const t = game();
  t.nations.aurel.eliminated = true; give(t, ['p17', 'p18', 'p19', 'p20'], 'oroel');
  allyAll(t, NATIONS.filter(id => id !== 'aurel'));
  assert.equal(E.allAllied(t), true);
  const u = game(); ally(u, ME, 'aurel');
  assert.equal(E.allAllied(u), false);
});
test('V17.8 : offre de paix et fin sauvegardées (schéma 13) ; ancienne sauvegarde sans endOffer complet', () => {
  const s = game();
  allyAll(s); untilDay(s, 91);
  assert.ok(E.peaceOfferPending(s));
  const back = decodeRealtimeSave(encodeSave(s)).state;
  assert.equal(E.peaceOfferPending(back), true);
  assert.deepEqual(back.rt.ranking, s.rt.ranking);
  const old = game(); old.endOffer = { peaceSince: null, nextOfferDay: null }; delete old.rt.famineTotal; delete old.rt.ranking;
  assert.deepEqual(endOfferOf(old), { peaceSince: null, nextOfferDay: null, offerDay: null });
  assert.equal(E.rankingSnapshot(old).rows.length, 5);
  E.advanceDays(old, map, 3); assert.equal(old.gameOver, undefined);
});

// --- Palmarès et titres en jours --------------------------------------------------------------------------------------
test('V17.8 : palmarès — record en jours, meilleur score, longueurs 15 / 7 ans, titres adaptés (Longue marche, Vif comme l’éclair, Paix d’Arken)', () => {
  const finish = (opts, reason, day) => { const s = game(opts); s.day = day; s.turn = Math.ceil(day / 30); E.endRealtimeGame(s, reason, reason === 'capitals' ? ME : null); return s; };
  const profile = { palmares: emptyPalmares() };
  const win = finish({ seed: 'arken-a' }, 'capitals', 1500);
  assert.deepEqual(recordFinishedGame(profile, win).titles.sort(), ['maitre-arken', 'premiere-couronne', 'premiere-page'].sort());
  assert.deepEqual(profile.palmares.fastestWinDays, { day: 1500, nationId: ME, length: 5479 });
  assert.equal(profile.palmares.fastestWin, null, 'le record au tour par tour n’est pas mélangé aux jours');
  assert.equal(profile.palmares.gamesByLength[5479], 1);
  assert.ok(profile.palmares.bestScore > 0);
  const long = finish({ seed: 'arken-b' }, 'turn-limit', 5479);
  assert.ok(recordFinishedGame(profile, long).titles.includes('longue-marche'));
  const shortWin = finish({ seed: 'arken-c', gameLength: 40 }, 'capitals', 900);
  assert.ok(recordFinishedGame(profile, shortWin).titles.includes('vif-eclair'));
  assert.deepEqual(profile.palmares.fastestWinDays, { day: 900, nationId: ME, length: 2557 });
  const peace = finish({ seed: 'arken-d' }, 'peace', 2000);
  assert.ok(recordFinishedGame(profile, peace).titles.includes('paix-arken'));
  // Une partie de 15 ans gagnée n'est PAS une « partie courte ».
  const p2 = { palmares: emptyPalmares() };
  assert.ok(!recordFinishedGame(p2, finish({ seed: 'arken-e' }, 'capitals', 3000)).titles.includes('vif-eclair'));
  // Une partie abandonnée (sans fin) ne compte pas.
  assert.equal(recordFinishedGame(p2, game({ seed: 'arken-f' })).counted, false);
  const html = palmaresHtml(profile.palmares, map.nations);
  assert.match(html, /2 ans, 5 mois et 18 jours · Valmorne/); // jour 900 = 18 juin 2029, fini
  assert.match(html, /en 15 ans/); assert.match(html, /en 7 ans/); assert.match(html, /Meilleur score/);
  assert.doesNotMatch(html, /Tour \d/);
  assert.ok(TITLES.some(t => t.id === 'paix-arken'));
});

// --- Écrans ---------------------------------------------------------------------------------------------------------
test('V17.8 : écran 🏆 — total et rang publics, détail des cinq lignes pour soi et ses alliés seulement', () => {
  const s = game(); ally(s, ME, 'aurel');
  const snap = E.rankingSnapshot(s);
  const html = rankingHtml(snap, { me: ME, nations: map.nations, detailFor: id => id === ME || id === 'aurel', nextDay: 10, gameDays: 5479 });
  assert.equal((html.match(/class="rank-row/g) || []).length, 5);
  assert.equal((html.match(/<dl class="rank-detail">/g) || []).length, 2);
  assert.equal((html.match(/rank-secret/g) || []).length, 3);
  assert.match(html, /Classement du 1er janvier 2027 · mis à jour tous les 10 jours \(prochain : 10 janvier 2027\)/);
  assert.match(html, /31 décembre 2041/); assert.match(html, /100 points par province/);
  for (const r of snap.rows) assert.ok(html.includes(`${r.score} points`), r.nationId);
  assert.doesNotMatch(html, /\btours?\b/);
  const peace = peaceOfferHtml(snap, { me: ME, nations: map.nations });
  assert.match(peace, /Terminer la partie maintenant, au classement actuel \?/); assert.match(peace, /180 jours/);
});
test('V17.8 : écran de fin du temps réel — date, durée de jeu, classement final, caractères révélés, récit au mois, sans « tour »', () => {
  const s = game({ ais: NATIONS.filter(id => id !== ME) });
  untilDay(s, 400);
  s.rt.playMs = 14 * 60000;
  E.endRealtimeGame(s, 'peace');
  const go = s.gameOver, story = buildEndStory(s, map);
  const html = endDurationHtml(go, s.rt.playMs) + finalRankingHtml(go, { me: ME, nations: map.nations }) + revealedCharactersHtml(story.nations)
    + endStoryHtml(story, { when: periodLabel, realtime: true, rule: 'Classement à points' });
  assert.match(html, /Du 1er janvier 2027 au 4 février 2028 : <b>1 an, 1 mois et 4 jours<\/b> de jeu \(400 jours\) · 14 min passées à jouer/);
  assert.equal((html.match(/<dl class="rank-detail">/g) || []).length, 5, 'à la fin, tout est révélé');
  assert.match(html, /Caractères révélés/);
  for (const n of story.nations.filter(n => !n.human)) assert.ok(html.includes(n.trait));
  assert.match(html, /Provinces de chaque nation, de (janvier|février) 2027 à/);
  assert.doesNotMatch(html, /\btours?\b|\bT\d+\b/);
  assert.equal(periodLabel(14), 'février 2028');
  assert.equal(elapsedText(5479), '15 ans'); assert.equal(playTimeText(125 * 60000), '2 h 05');
  assert.equal(realtimeLengthLabel(false), '15 ans'); assert.equal(realtimeLengthLabel(true), 'Courte · 7 ans');
  assert.match(realtimeLengthText(true), /31 décembre 2033/);
});
test('V17.8 : branchements — bouton 🏆 sur la carte, fenêtre de paix qui arrête le temps, nouvelle partie « vous perdrez tout »', () => {
  const html = readSource('index.html'), app = flatSource('app.js');
  assert.match(html, /<button id="rankBtn"[^>]*>.*🏆.*Classement/);
  assert.match(html, /<dialog id="rankDialog"/); assert.match(html, /<dialog id="peaceDialog"/);
  assert.match(html, /id="peaceEnd" class="primary">Terminer</); assert.match(html, /id="peaceContinue" class="cancel">Continuer</);
  assert.match(app, /const END_HOLDS = \['#peaceDialog', '#nationDialog', '#replaceSaveDialog'\]/);
  assert.match(app, /OUT_OF_GAME = \[[^\]]*\]\.concat\(END_HOLDS\)/);
  assert.doesNotMatch(app, /OUT_OF_GAME = \[[^\]]*#rankDialog/, 'le classement laisse le temps tourner');
  assert.match(app, /syncRanking\(\)/); assert.match(app, /installRanking\(\)/);
  assert.match(app, /Nouvelle partie : vous perdrez tout/); assert.match(app, /Une partie abandonnée ne compte pas au palmarès/);
  assert.match(app, /showRealtimeEnd\(go,record/);
  assert.match(app, /'#peaceDialog'\]; \/\/ V17\.8 : paix générale/, 'pas de pub imposée sur la fenêtre de paix');
  assert.match(readSource('sw.js'), /realtime\/ranking\.js[\s\S]*realtime\/end\.js/);
  assert.match(readSource('sw.js'), /ranking-view\.js[\s\S]*ui\/ranking-ui\.js/);
  // Moteur : la fin du temps réel passe par end.js, chaque jour.
  assert.match(readSource('src/domain/realtime/day.js'), /dailyEnd\(state, state\.events\.slice\(eventStart\)\)/);
});
test('V17.8 : partie IA de 2 ans déterministe, classement cohérent chaque 10 jours', () => {
  const run = () => { const s = game({ seed: 'arken-det', ais: NATIONS.filter(id => id !== ME) }); untilDay(s, 730); return s; };
  const a = run(), b = run();
  assert.equal(JSON.stringify(a.rt.ranking), JSON.stringify(b.rt.ranking));
  assert.equal(a.rt.ranking.day, 720); // dernière photo : jour multiple de 10
  const r = a.rt.ranking.rows;
  for (let i = 1; i < r.length; i++) if (!r[i].eliminated && !r[i - 1].eliminated) assert.ok(r[i - 1].score >= r[i].score);
});
