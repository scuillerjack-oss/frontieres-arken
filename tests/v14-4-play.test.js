// V14.4 — Équipe Google Play : publicités AdMob et achats Play Billing UNIQUEMENT dans le build Play, règles du studio
// (jamais de pub en jeu ni dans le tutoriel, refus = rien d'imposé, jetons jamais perdus), build, fiche, secrets.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';
import { createProfile, PRODUCTS, ALLOWED_GRANTS } from '../src/domain/profile.js';
import { ADS_ENABLED, showGameStartAd, showRewardedAd, registerNativeAds, resetAdsSession, adsRefusedThisSession } from '../src/presentation/ads.js';
import { BILLING_ENABLED, purchase, restorePurchases, registerNativeBilling, storeItems } from '../src/presentation/store.js';
import { PLAY_CONFIG } from '../src/presentation/play-config.js';
import { initPlay } from '../src/presentation/play.js';
import { createNativePlay, orderIdOf } from '../src/presentation/native-play.js';
import { adsConfig, injectPlayConfig, configureManifest, ADMOB_TEST_IDS } from '../scripts/play-config.js';
import { playDependencies } from '../scripts/play-deps.js';
import { boostScreenHtml } from '../src/presentation/v12-ux.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = p => readFileSync(join(root, p), 'utf8');
const never = () => { throw new Error('ne doit pas être appelé'); };
const spyAds = (over = {}) => { const calls = []; return { calls, showInterstitial: async () => { calls.push('interstitial'); return { status: 'shown' }; }, showRewarded: async () => { calls.push('rewarded'); return { status: 'earned' }; }, ...over }; };

// --- Pubs : désactivées hors build Play -----------------------------------------------------------------------
test('V14.4 pubs : désactivées hors build Play (PWA, APK de bêta) — aucun SDK appelé, valeurs du dépôt à false', async () => {
  assert.equal(ADS_ENABLED, false); assert.equal(BILLING_ENABLED, false);
  assert.deepEqual({ ...PLAY_CONFIG }, { play: false, ads: false, billing: false, testing: true, appId: null, interstitial: null, rewarded: null });
  const native = spyAds(); registerNativeAds(native);
  assert.deepEqual(await showGameStartAd({ profile: createProfile(), doc: null }), { shown: false, rewarded: false }, 'emplacement de test seulement (pas de document ici)');
  assert.deepEqual(await showRewardedAd({ doc: null }), { shown: false, rewarded: false });
  assert.deepEqual(native.calls, [], 'le SDK n\'est jamais appelé hors build Play');
  registerNativeAds(null);
  const off = await initPlay({ cap: { isNativePlatform: () => true }, importer: never });
  assert.equal(off.active, false, 'initPlay ne charge rien hors build Play (importer jamais appelé)');
});

test('V14.4 pubs : PWA et APK de bêta n\'ont aucun plugin AdMob ni Play Billing, seul le workflow AAB les installe', () => {
  const pkg = JSON.parse(read('package.json'));
  const deps = JSON.stringify({ ...pkg.dependencies, ...pkg.devDependencies });
  assert.doesNotMatch(deps, /admob|native-purchases/);
  assert.deepEqual(Object.keys(pkg.arkenPlayDependencies).sort(), ['@capacitor-community/admob', '@capgo/native-purchases']);
  assert.deepEqual(playDependencies().length, 2);
  const apk = read('.github/workflows/android-apk.yml'), aab = read('.github/workflows/android-aab.yml');
  assert.doesNotMatch(apk, /ARKEN_PLAY_BUILD|play-deps|ARKEN_ADMOB|ARKEN_ADS_PRODUCTION/);
  assert.match(aab, /ARKEN_PLAY_BUILD: '1'/);
  assert.match(aab, /node scripts\/play-deps\.js/);
  for (const v of ['ARKEN_ADS_PRODUCTION', 'ARKEN_ADMOB_APP_ID', 'ARKEN_ADMOB_INTERSTITIAL_ID', 'ARKEN_ADMOB_REWARDED_ID']) assert.match(aab, new RegExp(`${v}: \\$\\{\\{ vars\\.${v} \\}\\}`));
  assert.match(aab, /Publicités : \$\{ADS\}/); assert.match(aab, /Publicités : PRODUCTION/); assert.match(aab, /Publicités : TEST/);
  assert.match(aab, /clé d'importation non configurée/, 'cas « clé non configurée » conservé (succès sans AAB)');
  assert.ok(existsSync(join(root, 'scripts/play-deps.js')));
  const r = spawnSync('node', [join(root, 'scripts/play-deps.js'), '--dry-run'], { encoding: 'utf8' });
  assert.equal(r.status, 0); assert.match(r.stdout, /@capacitor-community\/admob@.*@capgo\/native-purchases@/);
});

// --- Pubs : règles en build Play ------------------------------------------------------------------------------
test('V14.4 pubs Play : interstitiel au début de partie ; jamais dans le tutoriel ; jamais avec le Pack débutant', async () => {
  resetAdsSession();
  const native = spyAds();
  assert.deepEqual(await showGameStartAd({ profile: createProfile(), enabled: true, native }), { shown: true });
  assert.deepEqual(await showGameStartAd({ profile: createProfile(), enabled: true, native, inTutorial: true }), { shown: false, skipped: 'tutorial' });
  const pack = createProfile(); pack.adsRemoved = true;
  assert.deepEqual(await showGameStartAd({ profile: pack, enabled: true, native }), { shown: false, skipped: 'pack' });
  assert.deepEqual(native.calls, ['interstitial'], 'une seule pub : ni tutoriel ni Pack');
});

test('V14.4 pubs Play : pas de pub disponible ou erreur = le jeu continue, et l\'emplacement de test n\'apparaît jamais', async () => {
  resetAdsSession();
  const doc = { get body() { throw new Error('aucun écran de test dans le build Play'); } };
  for (const native of [spyAds({ showInterstitial: async () => ({ status: 'unavailable' }) }), spyAds({ showInterstitial: async () => { throw new Error('SDK'); } }), null, {}]) {
    const r = await showGameStartAd({ profile: createProfile(), enabled: true, native, doc });
    assert.equal(r.shown, false);
  }
  assert.deepEqual(await showRewardedAd({ enabled: true, native: spyAds({ showRewarded: async () => ({ status: 'unavailable' }) }), doc }), { shown: false, rewarded: false });
  assert.equal((await showRewardedAd({ enabled: true, native: spyAds({ showRewarded: async () => { throw new Error('x'); } }), doc })).rewarded, false);
});

test('V14.4 pubs Play : refus d\'une pub proposée = aucune pub imposée derrière (jusqu\'au prochain lancement)', async () => {
  resetAdsSession();
  const native = spyAds(); native.showRewarded = async () => { native.calls.push('rewarded'); return { status: 'dismissed' }; };
  const r = await showRewardedAd({ enabled: true, native });
  assert.deepEqual(r, { shown: true, rewarded: false, dismissed: true });
  assert.equal(adsRefusedThisSession(), true);
  assert.deepEqual(await showGameStartAd({ profile: createProfile(), enabled: true, native }), { shown: false, skipped: 'refused' });
  assert.deepEqual(native.calls, ['rewarded'], 'aucune interstitielle après le refus');
  resetAdsSession();
  assert.equal((await showRewardedAd({ enabled: true, native: spyAds() })).rewarded, true, 'pub regardée en entier = récompense');
  assert.equal(adsRefusedThisSession(), false);
  assert.equal((await showGameStartAd({ profile: createProfile(), enabled: true, native })).shown, true);
});

test('V14.4 pubs : app.js ne demande une pub qu\'avant une nouvelle partie (hors tutoriel) ou sur clic du joueur dans le menu', () => {
  const app = read('app.js');
  const starts = [...app.matchAll(/showGameStartAd\(/g)];
  assert.equal(starts.length, 1);
  assert.match(app, /showGameStartAd\(\{profile,inTutorial:isTutorial\(state\)\|\|shouldStartMiniTuto\(\)\}\)/);
  assert.equal([...app.matchAll(/showRewardedAd\(/g)].length, 1);
  assert.match(app, /data-watch-ad\]'\)\?\.addEventListener\('click',async\(\)=>\{if\(tutoStep!==null\)/, 'pas de pub récompensée pendant le tutoriel');
  for (const f of ['src/domain/game-engine.js', 'src/presentation/v14-3-tutoriel.js']) assert.doesNotMatch(read(f), /ads\.js|showGameStartAd|showRewardedAd/);
});

test('V14.4 consentement : bouton « Choix de confidentialité des publicités » dans les paramètres, masqué hors build Play', () => {
  assert.match(read('index.html'), /<button id="adsPrivacy" data-ads-privacy hidden>Choix de confidentialité des publicités<\/button>/);
  assert.match(boostScreenHtml(createProfile(), '2026-10-31'), /id="adsPrivacyBoost"[^>]*hidden/);
});

// --- Build : identifiants AdMob -------------------------------------------------------------------------------
const playEnv = extra => ({ ARKEN_PLAY_BUILD: '1', ...extra });
const realIds = { ARKEN_ADS_PRODUCTION: 'true', ARKEN_ADMOB_APP_ID: 'ca-app-pub-1234567890123456~1112223334', ARKEN_ADMOB_INTERSTITIAL_ID: 'ca-app-pub-1234567890123456/1112223335', ARKEN_ADMOB_REWARDED_ID: 'ca-app-pub-1234567890123456/1112223336' };
test('V14.4 build : identifiants de TEST Google par défaut, vrais identifiants seulement en production', () => {
  const t = adsConfig(playEnv({}));
  assert.equal(t.testing, true); assert.equal(t.appId, ADMOB_TEST_IDS.appId); assert.equal(t.play, true); assert.equal(t.billing, true);
  assert.equal(adsConfig(playEnv({ ARKEN_ADS_PRODUCTION: '', ARKEN_ADMOB_APP_ID: 'ca-app-pub-1~2' })).testing, true, 'variable vide = test');
  const p = adsConfig(playEnv(realIds));
  assert.equal(p.testing, false); assert.equal(p.interstitial, realIds.ARKEN_ADMOB_INTERSTITIAL_ID);
  assert.equal(adsConfig({ ...realIds }).play, false, 'sans ARKEN_PLAY_BUILD : build PWA, rien d\'actif');
});

test('V14.4 build : ÉCHEC si production demandée avec un identifiant manquant ou de test', () => {
  assert.throws(() => adsConfig(playEnv({ ARKEN_ADS_PRODUCTION: 'true' })), /manquants : ARKEN_ADMOB_APP_ID, ARKEN_ADMOB_INTERSTITIAL_ID, ARKEN_ADMOB_REWARDED_ID/);
  assert.throws(() => adsConfig(playEnv({ ...realIds, ARKEN_ADMOB_REWARDED_ID: '' })), /manquants : ARKEN_ADMOB_REWARDED_ID/);
  assert.throws(() => adsConfig(playEnv({ ...realIds, ARKEN_ADMOB_APP_ID: ADMOB_TEST_IDS.appId })), /identifiant de TEST/);
  assert.throws(() => adsConfig(playEnv({ ...realIds, ARKEN_ADMOB_INTERSTITIAL_ID: ADMOB_TEST_IDS.interstitial })), /identifiant de TEST/);
  assert.throws(() => adsConfig(playEnv({ ...realIds, ARKEN_ADMOB_APP_ID: 'pas-un-identifiant' })), /invalide/);
  // Et le vrai script de build sort en erreur (avant de toucher à dist/).
  const r = spawnSync('node', [join(root, 'scripts/build.js'), 'zzzzzzz'], { cwd: root, encoding: 'utf8', env: { ...process.env, ARKEN_PLAY_BUILD: '1', ARKEN_ADS_PRODUCTION: 'true', ARKEN_ADMOB_APP_ID: '', ARKEN_ADMOB_INTERSTITIAL_ID: '', ARKEN_ADMOB_REWARDED_ID: '' } });
  assert.notEqual(r.status, 0); assert.match(r.stderr, /identifiants AdMob manquants/);
  const r2 = spawnSync('node', [join(root, 'scripts/build.js'), 'zzzzzzz'], { cwd: root, encoding: 'utf8', env: { ...process.env, ...playEnv({ ...realIds, ARKEN_ADMOB_APP_ID: ADMOB_TEST_IDS.appId }) } });
  assert.notEqual(r2.status, 0); assert.match(r2.stderr, /identifiant de TEST/);
});

test('V14.4 build : le bloc de configuration est réécrit dans la copie dist/ seulement ; source jamais modifiée', () => {
  const src = read('src/presentation/play-config.js');
  const out = injectPlayConfig(src, adsConfig(playEnv({})));
  assert.match(out, /"play":true,"ads":true,"billing":true,"testing":true/);
  assert.match(src, /"play":false,"ads":false,"billing":false/);
  assert.match(read('scripts/build.js'), /injectPlayConfig/);
  assert.throws(() => injectPlayConfig('rien', {}), /introuvable/);
});

test('V14.4 build : manifeste Android — APPLICATION_ID AdMob + BILLING en build Play, rien sinon, idempotent', () => {
  const dir = mkdtempSync(join(tmpdir(), 'arken-manifest-'));
  const file = join(dir, 'android', 'app', 'src', 'main', 'AndroidManifest.xml');
  mkdirSync(dirname(file), { recursive: true });
  const base = '<manifest>\n    <application android:label="a">\n    </application>\n    <uses-permission android:name="android.permission.INTERNET" />\n</manifest>\n';
  writeFileSync(file, base);
  assert.deepEqual(configureManifest(dir, {}), { changed: false });
  assert.equal(readFileSync(file, 'utf8'), base, 'APK de bêta : manifeste intact');
  configureManifest(dir, playEnv({})); configureManifest(dir, playEnv({}));
  const m = readFileSync(file, 'utf8');
  assert.equal(m.split('com.google.android.gms.ads.APPLICATION_ID').length, 2, 'une seule balise malgré deux passages');
  assert.match(m, new RegExp(ADMOB_TEST_IDS.appId.replace(/[~]/g, '~')));
  assert.match(m, /com\.android\.vending\.BILLING/);
  rmSync(dir, { recursive: true, force: true });
  assert.match(read('scripts/android-prepare.js'), /configureManifest\(root, process\.env\)/);
});

// --- Achats ---------------------------------------------------------------------------------------------------
const fakeBilling = (log, over = {}) => ({
  buy: async id => { log.push('buy:' + id); return { ok: true, orderId: 'GPA.1', token: 'tok-1' }; },
  restore: async () => [], finalize: async e => { log.push('finalize:' + e.productId); return true; }, prices: async () => ({}), ...over
});

test('V14.4 achats : aucun achat hors build Play (même si un plugin est enregistré) ; bêta = achat de test gratuit', async () => {
  const log = []; registerNativeBilling(fakeBilling(log));
  const p = createProfile();
  const r = await purchase(p, 'jetons_5');
  assert.equal(r.test, true); assert.deepEqual(log, [], 'Play Billing jamais appelé');
  assert.ok(p.purchases.every(x => x.test === true));
  assert.deepEqual(await restorePurchases(p), { ok: true, restored: 0, tokens: 0 });
  assert.ok(storeItems(p).every(x => x.test && /test/i.test(x.price)));
  registerNativeBilling(null);
});

test('V14.4 achats Play : jetons crédités SEULEMENT après confirmation, puis sauvegarde, puis consommation', async () => {
  const log = [], p = createProfile();
  const r = await purchase(p, 'jetons_5', { enabled: true, native: fakeBilling(log), save: () => { log.push('save:' + p.tokens); return true; } });
  assert.equal(r.ok, true); assert.equal(r.tokens, 5); assert.equal(p.tokens, 5);
  assert.deepEqual(log, ['buy:jetons_5', 'save:5', 'finalize:jetons_5'], 'ordre : paiement, crédit sauvegardé, consommation');
  assert.equal(p.purchases[0].test, false);
});

test('V14.4 achats Play : annulé, en attente ou non confirmé = AUCUN jeton, rien de consommé', async () => {
  for (const [res, key] of [[{ ok: false, cancelled: true }, 'cancelled'], [{ ok: false, pending: true }, 'pending'], [{ ok: false, error: 'Achat non confirmé' }, 'error'], [{ ok: true }, 'error'], [null, 'error']]) {
    const log = [], p = createProfile();
    const r = await purchase(p, 'jetons_12', { enabled: true, native: fakeBilling(log, { buy: async () => res }) });
    assert.equal(r.ok, false); assert.equal(p.tokens, 0); assert.equal(p.purchases.length, 0); assert.ok(!log.some(l => l.startsWith('finalize')));
    if (key === 'pending') assert.equal(r.pending, true, 'achat en attente signalé');
  }
  const p = createProfile();
  assert.equal((await purchase(p, 'jetons_1', { enabled: true, native: fakeBilling([], { buy: async () => { throw new Error('boum'); } }) })).ok, false);
  assert.equal(p.tokens, 0);
  assert.equal((await purchase(p, 'or_1000', { enabled: true, native: fakeBilling([]) })).ok, false, 'jamais d\'or ni de troupes');
});

test('V14.4 achats Play : si la sauvegarde échoue, l\'achat n\'est PAS consommé (il sera rendu au prochain lancement)', async () => {
  const log = [], p = createProfile();
  await purchase(p, 'jetons_5', { enabled: true, native: fakeBilling(log), save: () => false });
  assert.ok(!log.some(l => l.startsWith('finalize')));
  // Nouveau lancement : profil rechargé sans le crédit, Google rend l'achat non consommé.
  const fresh = createProfile();
  const native = fakeBilling(log, { restore: async () => [{ productId: 'jetons_5', orderId: 'GPA.1', token: 'tok-1' }] });
  assert.deepEqual(await restorePurchases(fresh, { enabled: true, native, save: () => true }), { ok: true, restored: 1, tokens: 5 });
  assert.equal(fresh.tokens, 5); assert.ok(log.includes('finalize:jetons_5'));
});

test('V14.4 achats Play : restauration sans double crédit (même commande rendue deux fois), Pack débutant restauré', async () => {
  const p = createProfile(), log = [];
  const native = fakeBilling(log, { restore: async () => [{ productId: 'pack_debutant', orderId: 'GPA.P', token: 't-p' }, { productId: 'jetons_5', orderId: 'GPA.5', token: 't-5' }] });
  const a = await restorePurchases(p, { enabled: true, native, save: () => true });
  assert.deepEqual(a, { ok: true, restored: 2, tokens: 8 }); assert.equal(p.tokens, 8); assert.equal(p.adsRemoved, true); assert.equal(p.starterPack, true);
  const b = await restorePurchases(p, { enabled: true, native, save: () => true });
  assert.equal(b.restored, 0); assert.equal(p.tokens, 8, 'pas de double crédit');
  assert.equal((await restorePurchases(p, { enabled: true, native: fakeBilling([], { restore: async () => { throw new Error('x'); } }) })).ok, false);
});

test('V14.4 achats : identifiants produits fixés, jamais d\'or ni de troupes, Pack débutant non consommable', () => {
  assert.deepEqual(PRODUCTS.map(p => p.id), ['pack_debutant', 'jetons_1', 'jetons_5', 'jetons_12']);
  assert.deepEqual(PRODUCTS.map(p => p.oneTime), [true, false, false, false]);
  for (const p of PRODUCTS) for (const k of Object.keys(p.grants)) assert.ok(ALLOWED_GRANTS.includes(k));
  const sortie = read('docs/SORTIE-ARKEN.md');
  for (const id of ['pack_debutant', 'jetons_1', 'jetons_5', 'jetons_12']) assert.match(sortie, new RegExp('`' + id + '`'));
  for (const price of ['2,99', '0,49', '1,99', '3,99']) assert.ok(sortie.includes(price));
});

test('V14.4 boutique Play : prix localisés Google Play affichés, jamais « test » ni « gratuit »', async () => {
  const { setStorePrices } = await import('../src/presentation/store.js');
  setStorePrices({ pack_debutant: '2,99 €', jetons_5: '1,99 €' });
  const items = storeItems(createProfile(), { enabled: true });
  assert.equal(items.find(i => i.id === 'pack_debutant').price, '2,99 €'); assert.ok(items.every(i => !i.test));
  setStorePrices({});
});

// --- Couche native (faux plugins Capacitor) -------------------------------------------------------------------
function fakeCap({ consentStatus = 'OBTAINED', canRequestAds = true, purchases = [], purchaseResult, purchaseError, adEvents = {} } = {}) {
  const calls = [], listeners = {};
  const admob = {
    initialize: async () => { calls.push('admob.initialize'); },
    requestConsentInfo: async () => { calls.push('consent.info'); return { status: consentStatus, canRequestAds, privacyOptionsRequirementStatus: 'REQUIRED', isConsentFormAvailable: true }; },
    showConsentForm: async () => { calls.push('consent.form'); return { status: 'OBTAINED', canRequestAds: true, privacyOptionsRequirementStatus: 'REQUIRED' }; },
    showPrivacyOptionsForm: async () => { calls.push('privacy.form'); },
    prepareInterstitial: async () => { calls.push('prepare.interstitial'); }, prepareRewardVideoAd: async () => { calls.push('prepare.rewarded'); },
    addListener: async (name, cb) => { (listeners[name] ??= []).push(cb); return { remove: async () => {} }; },
    showInterstitial: async () => { calls.push('show.interstitial'); setTimeout(() => (listeners.interstitialAdDismissed || []).forEach(f => f()), 1); },
    showRewardVideoAd: async () => { calls.push('show.rewarded'); setTimeout(() => { if (adEvents.reward) (listeners.onRewardedVideoAdReward || []).forEach(f => f({ type: 'x', amount: 1 })); (listeners.onRewardedVideoAdDismissed || []).forEach(f => f()); }, 1); }
  };
  const store = {
    isBillingSupported: async () => ({ isBillingSupported: true }),
    purchaseProduct: async o => { calls.push('purchase:' + o.productIdentifier + ':ack=' + o.autoAcknowledgePurchases); if (purchaseError) throw purchaseError; return purchaseResult; },
    getPurchases: async () => ({ purchases }),
    consumePurchase: async o => { calls.push('consume:' + o.purchaseToken); }, acknowledgePurchase: async o => { calls.push('ack:' + o.purchaseToken); },
    getProducts: async () => ({ products: [{ identifier: 'jetons_5', priceString: '1,99 €' }, { identifier: 'inconnu', priceString: '9 €' }] })
  };
  return { calls, Capacitor: { isNativePlatform: () => true, Plugins: { AdMob: admob, NativePurchases: store } } };
}
const CFG = { play: true, ads: true, billing: true, testing: true, ...ADMOB_TEST_IDS };
const T = { consent: 500, loadInterstitial: 500, loadRewarded: 500, interstitial: 2000, rewarded: 2000, billing: 2000 };

test('V14.4 natif : jamais actif hors Capacitor natif ni sans configuration Play', async () => {
  assert.equal(await createNativePlay({ isNativePlatform: () => false }, { config: CFG }), null);
  assert.equal(await createNativePlay(fakeCap().Capacitor, { config: { ...CFG, play: false } }), null);
});

test('V14.4 natif : consentement UMP demandé AVANT la première annonce ; refus de consentement = aucune annonce', async () => {
  const ok = fakeCap({ consentStatus: 'REQUIRED' });
  const n = await createNativePlay(ok.Capacitor, { config: CFG, timeouts: T });
  assert.equal((await n.ads.showInterstitial()).status, 'shown');
  const order = ok.calls;
  assert.ok(order.indexOf('consent.info') < order.indexOf('consent.form') && order.indexOf('consent.form') < order.indexOf('admob.initialize') && order.indexOf('admob.initialize') < order.indexOf('prepare.interstitial') && order.indexOf('prepare.interstitial') < order.indexOf('show.interstitial'), order.join(' > '));
  const no = fakeCap({ consentStatus: 'REQUIRED', canRequestAds: false });
  no.Capacitor.Plugins.AdMob.showConsentForm = async () => ({ status: 'REQUIRED', canRequestAds: false });
  const n2 = await createNativePlay(no.Capacitor, { config: CFG, timeouts: T });
  assert.equal((await n2.ads.showInterstitial()).status, 'unavailable'); assert.equal((await n2.ads.showRewarded()).status, 'unavailable');
  assert.ok(!no.calls.some(c => c.startsWith('prepare') || c.startsWith('show.')), 'aucune annonce demandée sans consentement');
  const pv = await n.consent.showPrivacyOptions(); assert.ok(ok.calls.includes('privacy.form')); assert.ok(pv.status);
});

test('V14.4 natif : annonce récompensée — récompense seulement si Google la confirme, fermeture avant = dismissed', async () => {
  const a = await createNativePlay(fakeCap({ adEvents: { reward: true } }).Capacitor, { config: CFG, timeouts: T });
  assert.equal((await a.ads.showRewarded()).status, 'earned');
  const b = await createNativePlay(fakeCap().Capacitor, { config: CFG, timeouts: T });
  assert.equal((await b.ads.showRewarded()).status, 'dismissed');
});

test('V14.4 natif : jetons — l\'achat n\'est ni consommé ni acquitté par la couche native (c\'est store.js qui finalise)', async () => {
  const tx = { productIdentifier: 'jetons_5', purchaseToken: 'T5', orderId: 'GPA.5', purchaseState: '1', isAcknowledged: false };
  const f = fakeCap({ purchaseResult: tx, purchases: [tx] });
  const n = await createNativePlay(f.Capacitor, { config: CFG, timeouts: T });
  const r = await n.billing.buy('jetons_5');
  assert.deepEqual(r, { ok: true, orderId: 'GPA.5', token: 'T5' });
  assert.ok(f.calls.includes('purchase:jetons_5:ack=false')); assert.ok(!f.calls.some(c => c.startsWith('consume') || c.startsWith('ack')));
  assert.equal(await n.billing.finalize({ productId: 'jetons_5', token: 'T5' }), true);
  assert.ok(f.calls.includes('consume:T5'), 'lot de jetons = consommé (rachetable)');
  assert.equal(await n.billing.finalize({ productId: 'pack_debutant', token: 'TP' }), true);
  assert.ok(f.calls.includes('ack:TP') && !f.calls.includes('consume:TP'), 'Pack débutant = acquitté, jamais consommé');
  assert.equal(await n.billing.finalize({ productId: 'or_1000', token: 'X' }), false);
});

test('V14.4 natif : achat en attente, annulé, ou non listé PURCHASED par Google = aucun crédit', async () => {
  const pend = { productIdentifier: 'jetons_5', purchaseToken: 'T', orderId: 'O', purchaseState: '2' };
  assert.deepEqual(await (await createNativePlay(fakeCap({ purchaseResult: pend, purchases: [pend] }).Capacitor, { config: CFG, timeouts: T })).billing.buy('jetons_5'), { ok: false, pending: true });
  assert.deepEqual(await (await createNativePlay(fakeCap({ purchaseError: new Error('Purchase is pending') }).Capacitor, { config: CFG, timeouts: T })).billing.buy('jetons_5'), { ok: false, pending: true });
  assert.deepEqual(await (await createNativePlay(fakeCap({ purchaseError: Object.assign(new Error('User cancelled'), { code: 'USER_CANCELLED' }) }).Capacitor, { config: CFG, timeouts: T })).billing.buy('jetons_5'), { ok: false, cancelled: true });
  const ghost = { productIdentifier: 'jetons_5', purchaseToken: 'T9', orderId: 'O9', purchaseState: '1' };
  const r = await (await createNativePlay(fakeCap({ purchaseResult: ghost, purchases: [] }).Capacitor, { config: CFG, timeouts: T })).billing.buy('jetons_5');
  assert.equal(r.ok, false, 'Google ne liste pas l\'achat : pas de crédit');
  const n = await createNativePlay(fakeCap({ purchases: [pend, { ...ghost, productIdentifier: 'or_1000' }, { productIdentifier: 'jetons_1', purchaseToken: 'T1', orderId: 'O1', purchaseState: '1', isAcknowledged: false }] }).Capacitor, { config: CFG, timeouts: T });
  assert.deepEqual((await n.billing.restore()).map(e => e.productId), ['jetons_1'], 'restauration : payés et connus seulement');
  assert.deepEqual(await n.billing.prices(), { jetons_5: '1,99 €' });
});

test('V14.4 natif : identifiant de commande stable pour l\'idempotence', () => {
  assert.equal(orderIdOf({ orderId: 'GPA.1', purchaseToken: 'x' }), 'GPA.1');
  assert.equal(orderIdOf({ transactionId: 'TR' }), 'TR');
  assert.equal(orderIdOf({ purchaseToken: 'abc' }), orderIdOf({ purchaseToken: 'abc' }));
  assert.equal(orderIdOf({}), '');
});

test('V14.4 initPlay : branche pubs et achats seulement en build Play natif, jamais d\'exception', async () => {
  const f = fakeCap();
  const r = await initPlay({ config: CFG, cap: f.Capacitor, importer: async () => ({ createNativePlay: (c, o) => createNativePlay(c, { ...o, timeouts: T }) }) });
  assert.equal(r.active, true); assert.equal(r.privacyOptionsRequired, true);
  registerNativeAds(null); registerNativeBilling(null);
  assert.equal((await initPlay({ config: CFG, cap: f.Capacitor, importer: async () => { throw new Error('import'); } })).active, false);
  assert.equal((await initPlay({ config: CFG, cap: { isNativePlatform: () => false }, importer: never })).active, false);
});

// --- Dépôt public : aucun secret ------------------------------------------------------------------------------
test('V14.4 secrets : aucun keystore ni identifiant AdMob réel dans le dépôt (seule la clé de DÉBOGAGE publique est permise)', () => {
  const files = execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' }).split('\n').filter(Boolean).filter(f => existsSync(join(root, f)));
  const keys = files.filter(f => /\.(jks|keystore|p12|pfx|pem|key)$/i.test(f) || /secrets-a-copier|upload.*\.(jks|txt)$/i.test(f));
  assert.deepEqual(keys, ['android-debug/arken-debug.keystore']);
  const gitignore = read('.gitignore'); assert.match(gitignore, /\*\.jks/); assert.match(gitignore, /\*\.keystore/);
  for (const f of files.filter(f => /\.(js|json|md|yml|html|txt|xml)$/.test(f) && !f.endsWith('package-lock.json'))) {
    const text = read(f);
    // Les tests utilisent volontairement de faux identifiants « production » pour vérifier que le build les refuse.
    if (!f.startsWith('tests/')) for (const m of text.matchAll(/ca-app-pub-(\d+)/g)) assert.equal(m[1], '3940256099942544', `${f} : identifiant AdMob non-test (${m[0]})`);
    assert.doesNotMatch(text, /-----BEGIN (RSA |EC )?PRIVATE KEY-----/, f);
    assert.doesNotMatch(text, /PLAY_UPLOAD_KEYSTORE_BASE64\s*[=:]\s*['"]?[A-Za-z0-9+/]{60,}/, f);
  }
});

// --- Fiche Play Store -----------------------------------------------------------------------------------------
const section = (file, key) => { const m = read(file).match(new RegExp(`<!-- ${key} -->\\n([\\s\\S]*?)(?:\\n\\n## |$)`)); assert.ok(m, `${file} : ${key}`); return m[1].trim(); };
test('V14.4 fiche Play Store : longueurs FR (30 / 80 / 4000) et EN', () => {
  const fr = [section('store/fiche-play-store.md', 'titre'), section('store/fiche-play-store.md', 'description-courte'), section('store/fiche-play-store.md', 'description-longue')];
  const en = [section('store/fiche-play-store-en.md', 'title'), section('store/fiche-play-store-en.md', 'short-description'), section('store/fiche-play-store-en.md', 'full-description')];
  for (const [list, name] of [[fr, 'FR'], [en, 'EN']]) {
    const [t, s, l] = list.map(x => [...x].length);
    assert.ok(t > 0 && t <= 30, `${name} titre ${t}`); assert.ok(s > 0 && s <= 80, `${name} courte ${s}`); assert.ok(l > 200 && l <= 4000, `${name} longue ${l}`);
  }
  for (const text of [fr[2], en[2]]) { assert.match(text, /scuillerjack@gmail\.com/); assert.match(text, /JS GAMES/); assert.doesNotMatch(text, /€/, 'les prix se fixent dans la Play Console'); }
});

test('V14.4 fiche Play Store : classification et sécurité des données cohérentes avec les pubs et achats', () => {
  const c = read('store/classification.md'), d = read('store/securite-des-donnees.md');
  assert.match(c, /Achats numériques dans l'application \| \*\*Oui\*\*/); assert.match(c, /publicités \? \| \*\*Oui\*\*/);
  assert.match(d, /Google Mobile Ads/); assert.match(d, /Identifiant publicitaire/); assert.match(d, /politique-de-confidentialite-arken\.html/);
  assert.match(d, /13 ans et plus/);
});

test('V14.4 guide de sortie : un SEUL bloc de code, de type text, à la fin', () => {
  const doc = read('docs/SORTIE-ARKEN.md');
  const fences = doc.match(/^```.*$/gm);
  assert.deepEqual(fences, ['```text', '```']);
  assert.ok(doc.trimEnd().endsWith('```'));
  assert.match(doc, /io\.github\.scuillerjackoss\.frontieresarken/);
  assert.equal(JSON.parse(read('capacitor.config.json')).appId, 'io.github.scuillerjackoss.frontieresarken');
});
