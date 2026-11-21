// V17.7 — Monétisation du temps réel (docs/V17-cahier-des-charges.md §10 et §12 « V17.7 ») : compteur de minutes de jeu,
// pub récompensée 🎁, pub imposée aux moments calmes, Premium (×2 + plus de pub imposée), Pack = Premium + 3 jetons.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  CALM_MOMENTS, FORCED_EVERY_MS, MINUTE_MS, REWARDED_MAX_MS, REWARDED_MIN_MS, adTimerSnapshot, applyGiftReward, createAdTimer,
  forcedAdCheck, forcedShown, giftAvailable, giftDelayMs, giftInMs, giftUsed, playMinutes, restoreAdTimer, rewardGold, tickAdTimer
} from '../src/presentation/ad-timer.js';
import { showForcedAd, showRewardedAd, registerNativeAds, resetAdsSession, adsRefusedThisSession, forcedAdsAllowed } from '../src/presentation/ads.js';
import { premiumScreenHtml } from '../src/presentation/premium-view.js';
import { boostScreenHtml } from '../src/presentation/boosts-screen.js';
import { BILLING_ENABLED, purchase, restorePurchases, storeItems } from '../src/presentation/store.js';
import { createProfile, sanitizeProfile, applyPurchase, canPurchase, PRODUCTS, ALLOWED_GRANTS } from '../src/domain/profile.js';
import { RULES } from '../src/domain/constants.js';
import { readSource, root } from './helpers/sources.js';

const read = f => readFileSync(join(root, f), 'utf8');
const MIN = MINUTE_MS;
/** Joue `minutes` de jeu horloge en marche (battements de 250 ms simulés par paquets d'une seconde). */
function play(t, minutes, start = t.lastNow) {
  let now = start;
  tickAdTimer(t, { now, running: true });
  for (let i = 0; i < minutes * 60; i++) { now += 1000; tickAdTimer(t, { now, running: true }); }
  return now;
}
const calm = { moment: 'pause', premium: false, tutorial: false, refused: false, action: false };

test('V17.7 compteur : minutes de jeu = horloge qui tourne ; pauses, menus et gel du téléphone exclus', () => {
  const t = createAdTimer({ seed: 's', now: 0 });
  tickAdTimer(t, { now: 0, running: true });
  tickAdTimer(t, { now: 60000, running: false }); // l'horloge tournait pendant cette minute (battements regroupés : plafond 5 s)
  assert.equal(t.playMs, 5000, 'un gel du téléphone ne fait pas gagner de minutes (5 s au plus par battement)');
  const t2 = createAdTimer({ seed: 's', now: 0 });
  let now = play(t2, 3, 0);
  assert.equal(playMinutes(t2), 3);
  // En pause : le temps réel passe, les minutes de jeu non.
  tickAdTimer(t2, { now, running: false });
  for (let i = 0; i < 120; i++) { now += 1000; tickAdTimer(t2, { now, running: false }); }
  assert.equal(playMinutes(t2), 3, 'pause / menu / pub : rien ne compte');
  now = play(t2, 2, now);
  assert.equal(playMinutes(t2), 5);
  // ×2 (Premium) : une minute reste une minute (rien ne dépend de la vitesse des jours).
  assert.doesNotMatch(read('src/presentation/ad-timer.js'), /speed\b|msPerDay/);
});

test('V17.7 🎁 : apparaît 5 à 10 min de jeu après la précédente (tirage à graine), reste tant qu’on ne l’a pas touchée', () => {
  const delays = Array.from({ length: 200 }, (_, n) => giftDelayMs('graine', n));
  for (const d of delays) assert.ok(d >= REWARDED_MIN_MS && d <= REWARDED_MAX_MS, String(d));
  assert.equal(REWARDED_MIN_MS, 5 * MIN); assert.equal(REWARDED_MAX_MS, 10 * MIN);
  assert.ok(new Set(delays).size > 50, 'les délais varient');
  assert.deepEqual(delays, Array.from({ length: 200 }, (_, n) => giftDelayMs('graine', n)), 'déterministe');
  assert.doesNotMatch(read('src/presentation/ad-timer.js'), /Math\.random|Date\.now|new Date/);
  const t = createAdTimer({ seed: 'graine', now: 0 });
  assert.equal(giftAvailable(t), false, 'pas d’icône au début');
  play(t, 4.9, 0);
  assert.equal(giftAvailable(t), false, 'jamais avant 5 min');
  play(t, 10.2 - 4.9);
  assert.equal(giftAvailable(t), true, 'toujours là après 10 min');
  play(t, 30);
  assert.equal(giftAvailable(t), true, 'elle reste tant qu’on ne l’a pas touchée');
  assert.equal(giftInMs(t), 0);
  assert.equal(giftAvailable(t, { tutorial: true }), false, 'jamais dans le tutoriel');
  assert.equal(giftAvailable(t, { gameOver: true }), false);
  // Fermée avant la fin : elle reste. Vue en entier : elle disparaît et revient 5 à 10 min de jeu plus tard.
  giftUsed(t, { rewarded: false });
  assert.equal(giftAvailable(t), true, 'pub fermée avant la fin : l’icône reste');
  giftUsed(t, { rewarded: true });
  assert.equal(giftAvailable(t), false);
  assert.ok(giftInMs(t) >= 5 * MIN && giftInMs(t) <= 10 * MIN);
  play(t, 10.1);
  assert.equal(giftAvailable(t), true);
});

test('V17.7 🎁 : récompense = un mois de revenus (revenu par tour × 30 ÷ 50, arrondi au multiple de 5 supérieur), 10 or minimum', () => {
  assert.equal(rewardGold(0), 10); assert.equal(rewardGold(-30), 10); assert.equal(rewardGold(undefined), 10);
  // V17.9b : un mois = revenu par tour × 30 ÷ 50.
  assert.equal(rewardGold(16), 10, '+9,6 / mois → 10 (minimum)');
  assert.equal(rewardGold(24), 15, '14,4 / mois → 15');
  assert.equal(rewardGold(40), 25); assert.equal(rewardGold(33), 20); assert.equal(rewardGold(100), 60);
  assert.equal(RULES.realtime.ads.rewardMinGold, 10); assert.equal(RULES.realtime.ads.rewardRoundTo, 5);
  // Versée au trésor seulement si la pub est vue en entier.
  const state = { nations: { valmorne: { treasury: 100 }, oroel: { treasury: 50, eliminated: true } } };
  assert.equal(applyGiftReward(state, 'valmorne', 20, { rewarded: false }), 0); assert.equal(state.nations.valmorne.treasury, 100);
  assert.equal(applyGiftReward(state, 'valmorne', 20, { rewarded: true }), 20); assert.equal(state.nations.valmorne.treasury, 120);
  assert.equal(applyGiftReward(state, 'oroel', 20, { rewarded: true }), 0, 'nation éliminée : rien');
});

test('V17.7 pub imposée : au plus une par 10 min de jeu, seulement à un moment calme', () => {
  const t = createAdTimer({ seed: 'x', now: 0 });
  assert.equal(FORCED_EVERY_MS, 10 * MIN);
  let now = play(t, 9.9, 0);
  assert.deepEqual(forcedAdCheck(t, calm), { ok: false, reason: 'too-soon' });
  now = play(t, 0.2, now);
  for (const moment of CALM_MOMENTS) assert.equal(forcedAdCheck(t, { ...calm, moment }).ok, true, moment);
  assert.deepEqual(CALM_MOMENTS, ['pause', 'menu', 'home', 'return']);
  for (const moment of [null, 'day', 'battle', 'order', 'alert']) assert.equal(forcedAdCheck(t, { ...calm, moment }).reason, 'not-calm', String(moment));
  forcedShown(t);
  assert.equal(forcedAdCheck(t, { ...calm, moment: 'menu' }).reason, 'too-soon', 'une seule par fenêtre de 10 min');
  // Sur 60 min de jeu avec un moment calme à chaque minute : au plus 6 pubs imposées.
  let shown = 1;
  for (let m = 0; m < 60; m++) { now = play(t, 1, now); if (forcedAdCheck(t, calm).ok) { forcedShown(t); shown++; } }
  assert.ok(shown <= 7, String(shown)); // 1 + 6
  assert.equal(t.forced, shown);
});

test('V17.7 pub imposée : jamais en tutoriel, jamais pour un Premium, jamais pendant une action, jamais après un refus', () => {
  const t = createAdTimer({ seed: 'x', now: 0 });
  play(t, 30, 0);
  assert.equal(forcedAdCheck(t, calm).ok, true);
  assert.equal(forcedAdCheck(t, { ...calm, tutorial: true }).reason, 'tutorial');
  assert.equal(forcedAdCheck(t, { ...calm, premium: true }).reason, 'premium');
  assert.equal(forcedAdCheck(t, { ...calm, action: true }).reason, 'action');
  assert.equal(forcedAdCheck(t, { ...calm, refused: true }).reason, 'refused');
  for (const moment of CALM_MOMENTS) {
    assert.equal(forcedAdCheck(t, { ...calm, moment, premium: true }).ok, false);
    assert.equal(forcedAdCheck(t, { ...calm, moment, tutorial: true }).ok, false);
    assert.equal(forcedAdCheck(t, { ...calm, moment, refused: true }).ok, false);
  }
  // Regarder une pub 🎁 en entier remet le compteur à zéro ; fermée avant la fin, non (mais c'est un refus).
  giftUsed(t, { rewarded: true });
  assert.equal(forcedAdCheck(t, calm).reason, 'too-soon');
  const u = createAdTimer({ seed: 'y', now: 0 }); play(u, 30, 0); giftUsed(u, { rewarded: false });
  assert.equal(forcedAdCheck(u, calm).ok, true);
  // Demande de Jack : une 🎁 refusée (« Plus tard ») ou fermée avant la fin NE DISPARAÎT PAS, pas de nouveau délai.
  assert.equal(giftAvailable(u), true); assert.equal(u.gifts, 0); assert.equal(giftInMs(u), 0);
});

test('V17.7 ads.js : showForcedAd refuse Premium / Pack / tutoriel / refus ; rien de vrai en bêta ; refus = plus de pub imposée', async () => {
  const shown = [];
  const native = { showInterstitial: async () => { shown.push('i'); return { status: 'shown' }; }, showRewarded: async () => ({ status: 'dismissed' }) };
  resetAdsSession();
  const premium = createProfile(); applyPurchase(premium, { productId: 'premium', orderId: 'p' });
  const pack = sanitizeProfile({ starterPack: true, adsRemoved: true, purchases: [{ orderId: 'old', productId: 'pack_debutant' }] });
  assert.deepEqual(await showForcedAd({ profile: premium, enabled: true, native }), { shown: false, skipped: 'premium' });
  assert.deepEqual(await showForcedAd({ profile: pack, enabled: true, native }), { shown: false, skipped: 'premium' });
  assert.deepEqual(await showForcedAd({ profile: createProfile(), enabled: true, native, inTutorial: true }), { shown: false, skipped: 'tutorial' });
  assert.equal(forcedAdsAllowed(premium), false); assert.equal(forcedAdsAllowed(createProfile()), true);
  assert.deepEqual(shown, []);
  assert.deepEqual(await showForcedAd({ profile: createProfile(), enabled: true, native }), { shown: true });
  // Pub 🎁 fermée avant la fin : refus → plus aucune pub imposée jusqu'au prochain lancement.
  const r = await showRewardedAd({ enabled: true, native });
  assert.equal(r.dismissed, true); assert.equal(adsRefusedThisSession(), true);
  assert.deepEqual(await showForcedAd({ profile: createProfile(), enabled: true, native }), { shown: false, skipped: 'refused' });
  resetAdsSession();
  // Bêta : aucun SDK, emplacement de test seulement (sans document : rien ne bloque).
  assert.deepEqual(await showForcedAd({ profile: createProfile(), doc: null }), { shown: false, rewarded: false });
  registerNativeAds(null);
});

test('V17.7 compteur gardé sur le téléphone (jamais dans la partie) : relu sans perte, champs invalides remplacés', () => {
  const t = createAdTimer({ seed: 'z', now: 0 }); play(t, 12, 0); forcedShown(t); giftUsed(t, { rewarded: true });
  const back = restoreAdTimer(JSON.parse(JSON.stringify(adTimerSnapshot(t))), { now: 5000 });
  assert.equal(back.playMs, t.playMs); assert.equal(back.giftAtMs, t.giftAtMs); assert.equal(back.lastForcedMs, t.lastForcedMs);
  assert.equal(back.gifts, 1); assert.equal(back.forced, 1); assert.equal(back.lastNow, 5000); assert.equal(back.running, false);
  const bad = restoreAdTimer({ playMs: 'x', lastForcedMs: 1e12, giftAtMs: null }, { now: 0 });
  assert.equal(bad.playMs, 0); assert.ok(bad.lastForcedMs <= bad.playMs);
  assert.deepEqual(restoreAdTimer(null, { seed: 'q', now: 0 }).giftAtMs, giftDelayMs('q', 0));
  const ui = readSource('src/presentation/ui/ad-ui.js');
  assert.match(ui, /const KEY = 'frontieres-arken-pub'/);
  assert.doesNotMatch(read('src/persistence/save-codec.js'), /adTimer|frontieres-arken-pub/);
});

test('V17.7 Premium : produit unique 1,99 € (×2 + plus de pub imposée), Pack = Premium + 3 jetons, anciens Packs → Premium', async () => {
  assert.deepEqual(ALLOWED_GRANTS, ['tokens', 'premium'], 'règle d’or : jamais d’or ni de troupes');
  const prem = PRODUCTS.find(p => p.id === 'premium'), pack = PRODUCTS.find(p => p.id === 'pack_debutant');
  assert.equal(prem.oneTime, true); assert.deepEqual({ ...prem.grants }, { premium: true });
  assert.deepEqual({ ...pack.grants }, { tokens: 3, premium: true });
  assert.equal(RULES.realtime.premium.priceEur, 1.99); assert.equal(RULES.realtime.premium.starterPackTokens, 3);
  // Achat de TEST (bêta : aucun paiement)
  assert.equal(BILLING_ENABLED, false);
  const p = createProfile();
  assert.equal(p.premium, false);
  const r = await purchase(p, 'premium', { date: '2026-11-20' });
  assert.equal(r.ok, true); assert.equal(r.test, true); assert.equal(r.premium, true);
  assert.equal(p.premium, true); assert.equal(p.adsRemoved, true); assert.equal(p.tokens, 0); assert.equal(p.starterPack, false);
  assert.equal((await purchase(p, 'premium')).ok, false, 'achat unique');
  assert.equal(canPurchase(p, 'pack_debutant').ok, false, 'déjà Premium : le Pack n’est plus proposé');
  assert.equal(storeItems(p).find(x => x.id === 'pack_debutant').available, false);
  assert.equal(canPurchase(p, 'jetons_5').ok, true);
  // Pack débutant = Premium + 3 jetons
  const q = createProfile(); const rq = await purchase(q, 'pack_debutant');
  assert.equal(rq.ok, true); assert.equal(q.premium, true); assert.equal(q.tokens, 3); assert.equal(q.starterPack, true);
  assert.equal(canPurchase(q, 'premium').ok, false);
  // Anciens acheteurs du Pack (« sans pub », sans champ premium) → Premium
  const old = sanitizeProfile({ version: 1, tokens: 2, adsRemoved: true, starterPack: true, purchases: [{ orderId: 'GPA.1', productId: 'pack_debutant', date: '2026-10-01', test: false }] });
  assert.equal(old.premium, true); assert.equal(old.tokens, 2);
  assert.equal(sanitizeProfile({ purchases: [{ orderId: 'a', productId: 'premium' }] }).premium, true);
  assert.equal(sanitizeProfile({}).premium, false); assert.equal(sanitizeProfile({ premium: 'oui' }).premium, false);
  // Restauration Google Play : un Pack PAYÉ alors qu'on est déjà Premium est quand même crédité (et finalisé).
  const finalized = [];
  const native = { restore: async () => [{ productId: 'pack_debutant', orderId: 'GPA.2', token: 't' }], finalize: async e => { finalized.push(e.orderId); return true; } };
  const res = await restorePurchases(p, { enabled: true, native });
  assert.deepEqual(res, { ok: true, restored: 1, tokens: 3 }); assert.deepEqual(finalized, ['GPA.2']); assert.equal(p.tokens, 3);
});

test('V17.7 écran Premium clair (mode test) et boutique', () => {
  const p = createProfile();
  const html = premiumScreenHtml(p, { from: 'fast' });
  for (const x of ['Vitesse ×2', 'Plus aucune pub imposée', 'Achat unique', '1,99 €', '2,99 €', 'Pack débutant', 'Achat de test (gratuit)', 'AUCUN PAIEMENT', 'data-premium-buy="premium"', 'data-premium-buy="pack_debutant"', 'La vitesse ×2 fait partie de Premium'])
    assert.ok(html.includes(x), x);
  assert.doesNotMatch(html, /or ou des troupes à acheter|bientôt/i);
  const play = premiumScreenHtml(p, { billing: true, prices: { premium: '1,99 €' } });
  assert.match(play, /Acheter · 1,99 €/); assert.doesNotMatch(play, /Achat de test/);
  applyPurchase(p, { productId: 'premium', orderId: 'x' });
  const active = premiumScreenHtml(p, { from: 'fast' });
  assert.match(active, /Premium actif/); assert.match(active, /Passer en ×2/); assert.doesNotMatch(active, /data-premium-buy/);
  const shop = boostScreenHtml(createProfile(), '2026-11-20');
  assert.match(shop, /data-buy="premium"/); assert.match(shop, /data-buy="pack_debutant"/);
  assert.match(boostScreenHtml(p, '2026-11-20'), /Premium actif/);
});

test('V17.7 branchements : 🎁 sur le bord de la carte, pubs aux moments calmes, temps arrêté pendant la pub, plus de pub de début de partie', () => {
  const html = read('index.html');
  assert.match(html, /<button id="giftBtn" class="gift-btn"[^>]*hidden>/);
  assert.match(html, /<div id="premiumBody">/);
  assert.doesNotMatch(html, /PREMIUM · BIENTÔT/);
  const css = read('v5.css') + read('paysage.css');
  assert.match(css, /\.gift-btn\{position:absolute;z-index:3;left:8px;top:104px/, 'bord gauche, pas au milieu');
  const flow = readSource('src/presentation/ui/game-flow.js');
  assert.doesNotMatch(flow, /showGameStartAd|showForcedAd|adPlaying/, 'plus de pub au début de la partie');
  const rt = readSource('src/presentation/ui/realtime-ui.js');
  assert.match(rt, /if \(pausing\) calmMoment\('pause'\)/);
  assert.match(rt, /if \(menuOpen && !menuWasOpen\) calmMoment\('menu'\)/);
  assert.match(rt, /CALM_MENUS = \['#settingsDialog', '#helpDialog', '#palmaresDialog'\]/, 'jamais à l’ouverture de l’écran Premium (V17.9 : ni des Atouts, une boutique)');
  assert.match(rt, /calmMoment\('return'\)/);
  assert.match(rt, /syncAds\(\{ now: t, onScreen: true, running: isClockRunning\(clock\) \}\)/);
  assert.match(rt, /openPremium\(\{ from: 'fast' \}\)/);
  assert.match(rt, /ad: document\.body\.dataset\.adPlaying === '1'/, 'le temps s’arrête pendant une pub');
  const ui = readSource('src/presentation/ui/ad-ui.js');
  assert.match(ui, /calmMoment\('home', \{ tutorial: leftTutorial \}\)/, 'retour à l’accueil depuis le tutoriel : pas de pub');
  assert.match(ui, /premium: profile\?\.premium === true, tutorial, refused: adsRefusedThisSession\(\), action: playerActing\(\)/);
  assert.match(ui, /isTutorial\(state\) \|\| tutoStep !== null;/); // V17.9 : plus de mini tuto
  assert.match(ui, /if \(moveSource\) return true;/);
  assert.match(ui, /battlesOf\(state, state\.playerNationId\)\.length/);
  assert.match(ui, /document\.body\.dataset\.adPlaying = '1'[\s\S]*showRewardedAd[\s\S]*finally \{ delete document\.body\.dataset\.adPlaying;/);
  assert.match(ui, /applyGiftReward\(game, me, gold, \{ rewarded: true \}\)/);
  assert.doesNotMatch(ui, /giftUsed\(timer, \{ rewarded: false \}\)/, 'refus : l’icône reste');
  assert.match(ui, /\$\('#giftLater'\)\.onclick = \(\) => \$\('#actionDialog'\)\.close\(\);/, '« Plus tard » : rien ne change');
  assert.match(rt, /if \(!isNewGame\(state\)\) calmMoment\('return'\)/, 'jamais de pub au début d’une nouvelle partie');
  assert.match(flow, /markNewGame\(state\);\$\('#nationDialog'\)\.close\(\);save\(\);/);
  assert.match(flow, /export function showWelcome\(\)\{\n  if\(state&&!\$\('#gameScreen'\)\.hidden\)save\(\);/, 'retour à l’accueil : la partie est écrite (bug trouvé en V17.7)');
  assert.match(read('app.js'), /installAds\(\)/);
  const sw = read('sw.js');
  for (const f of ['ad-timer.js', 'premium-view.js', 'ui/ad-ui.js', 'ui/premium-ui.js']) assert.ok(sw.includes(`'./src/presentation/${f}'`), f);
  for (const f of ['src/presentation/ad-timer.js', 'src/presentation/premium-view.js']) assert.doesNotMatch(read(f), /document\.|window\.|localStorage|setTimeout|setInterval/, `${f} pur`);
  // Rien de payant activé : configuration Play inchangée (bêta).
  assert.match(read('src/presentation/play-config.js'), /"play":false,"ads":false,"billing":false/);
});
