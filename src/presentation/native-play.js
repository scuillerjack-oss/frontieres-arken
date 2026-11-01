// V14.4 — Couche native du build Google Play (Capacitor). Chargée par play.js UNIQUEMENT dans l'appli Android du build
// Play (jamais dans la PWA ni l'APK de bêta : ils n'ont même pas les plugins). Adaptée d'ORBITA (qui fonctionne).
// Plugins (résolus sur le pont Capacitor, aucun import npm dans le WebView) :
//   AdMob            -> @capacitor-community/admob (interstitiel, récompensé, consentement UMP)
//   NativePurchases  -> @capgo/native-purchases (Google Play Billing)
// Aucune règle économique ici : ads.js / store.js décident QUAND appeler. Aucune méthode ne rejette.
import { PRODUCTS } from '../domain/profile.js';

const INAPP = 'inapp';
// Noms d'événements du plugin AdMob.
const EV = Object.freeze({ rewarded: 'onRewardedVideoAdReward', rewardedDismissed: 'onRewardedVideoAdDismissed', rewardedFailed: 'onRewardedVideoAdFailedToShow', interstitialDismissed: 'interstitialAdDismissed', interstitialFailed: 'interstitialAdFailedToShow' });
// Délais : le chargement d'une interstitielle ne doit pas retarder le début de partie (on préfère jouer sans pub).
export const NATIVE_TIMEOUTS = Object.freeze({ consent: 15000, loadInterstitial: 3500, loadRewarded: 10000, interstitial: 85000, rewarded: 170000, billing: 120000 });

const safe = async (fn, fallback) => { try { return await fn(); } catch (error) { return typeof fallback === 'function' ? fallback(error) : fallback; } };
function withTimeout(promise, ms) { let t; return Promise.race([promise, new Promise((_, reject) => { t = setTimeout(() => reject(new Error('timeout')), ms); t?.unref?.(); })]).finally(() => clearTimeout(t)); }
function plugin(cap, name) { try { return cap?.Plugins?.[name] ?? (typeof cap?.registerPlugin === 'function' ? cap.registerPlugin(name) : null) ?? null; } catch { return null; } }
const isCancel = e => /cancel/i.test(String(e?.code ?? '') + ' ' + String(e?.message ?? e ?? ''));
const isPendingError = e => /pending/i.test(String(e?.message ?? e ?? ''));
const state = p => String(p?.purchaseState ?? '').toUpperCase();
export const isPurchased = p => ['PURCHASED', '1'].includes(state(p));
export const isPending = p => ['PENDING', '2'].includes(state(p));
const known = new Map(PRODUCTS.map(p => [p.id, p]));
const hash = text => { let h = 2166136261; for (const c of String(text)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; } return h.toString(36); };
/** Identifiant de commande stable (idempotence du crédit) : orderId Play, sinon transactionId, sinon empreinte du jeton. */
export function orderIdOf(p) {
  if (p?.orderId) return String(p.orderId);
  if (p?.transactionId) return String(p.transactionId);
  return p?.purchaseToken ? `token-${hash(p.purchaseToken)}-${String(p.purchaseToken).length}` : '';
}

export async function createNativePlay(Capacitor, { config, timeouts = NATIVE_TIMEOUTS } = {}) {
  if (!Capacitor?.isNativePlatform?.() || !config?.play) return null;
  const admob = config.ads ? plugin(Capacitor, 'AdMob') : null;
  const store = config.billing ? plugin(Capacitor, 'NativePurchases') : null;
  if (!admob && !store) return null;
  const adsOn = Boolean(admob && config.interstitial && config.rewarded);
  let canRequestAds = false, initialized = null, consentDone = null, privacyOptionsRequired = false;
  const loaded = { interstitial: null, rewarded: null };

  const init = () => (initialized ??= safe(async () => { await admob.initialize({ initializeForTesting: Boolean(config.testing) }); return true; }, () => { initialized = null; return false; }));
  function preload(kind) {
    if (!adsOn || !canRequestAds) return Promise.resolve(false);
    const opts = { adId: config[kind], isTesting: Boolean(config.testing) };
    loaded[kind] ??= safe(() => withTimeout(kind === 'rewarded' ? admob.prepareRewardVideoAd(opts) : admob.prepareInterstitial(opts), timeouts.loadRewarded).then(() => true), false).then(ok => { if (!ok) loaded[kind] = null; return ok; });
    return loaded[kind];
  }
  // Une pub n'est demandée QU'APRÈS le consentement RGPD (UMP) ; interstitielle : on n'attend pas longtemps le chargement.
  async function ready(kind) {
    if (!adsOn) return false;
    await consent.request();
    if (!canRequestAds || !await init()) return false;
    const loading = preload(kind);
    return kind === 'interstitial' ? await Promise.race([loading, new Promise(r => { const t = setTimeout(() => r(false), timeouts.loadInterstitial); t?.unref?.(); })]) : await loading;
  }

  async function display(show, dismissEvent, failEvent, ms, extra) {
    const listeners = []; let finish; const done = new Promise(r => { finish = r; });
    const t = setTimeout(() => finish('timeout'), ms); t?.unref?.();
    const on = async (name, cb) => { const l = await safe(() => admob.addListener?.(name, cb), null); if (l) listeners.push(l); };
    try {
      await on(dismissEvent, () => finish('dismissed'));
      await on(failEvent, () => finish('failed'));
      if (extra) await on(extra.name, extra.cb);
      let item = null;
      Promise.resolve().then(show).then(v => { item = v; }, () => finish('failed'));
      const end = await done; await Promise.resolve();
      return { end, item };
    } finally { clearTimeout(t); for (const l of listeners) await safe(() => l.remove?.(), null); }
  }

  const ads = {
    available: adsOn,
    async showInterstitial() {
      if (!await ready('interstitial')) return { status: 'unavailable' };
      loaded.interstitial = null;
      return safe(async () => {
        const r = await display(() => admob.showInterstitial(), EV.interstitialDismissed, EV.interstitialFailed, timeouts.interstitial);
        return { status: r.end === 'dismissed' ? 'shown' : 'unavailable' };
      }, { status: 'error' }).finally(() => { preload('interstitial'); });
    },
    async showRewarded() {
      if (!await ready('rewarded')) return { status: 'unavailable' };
      loaded.rewarded = null; let earned = false;
      return safe(async () => {
        const r = await display(() => admob.showRewardVideoAd(), EV.rewardedDismissed, EV.rewardedFailed, timeouts.rewarded, { name: EV.rewarded, cb: () => { earned = true; } });
        // Récompense uniquement si Google la confirme (événement ou objet récompense non nul).
        if (earned || Number(r.item?.amount) > 0) return { status: 'earned' };
        return { status: r.end === 'dismissed' ? 'dismissed' : 'unavailable' };
      }, () => ({ status: earned ? 'earned' : 'error' })).finally(() => { preload('rewarded'); });
    }
  };

  const consent = {
    /** UMP d'abord ; AdMob n'est initialisé qu'une fois les requêtes autorisées. Une seule fois par lancement. */
    request() {
      if (!adsOn) return Promise.resolve({ status: 'unavailable', canRequestAds: false, privacyOptionsRequired: false });
      consentDone ??= safe(async () => {
        let info = await safe(() => admob.requestConsentInfo({}), null);
        if (!info) { await init(); info = await admob.requestConsentInfo({}); }
        if (info?.status === 'REQUIRED' && info.isConsentFormAvailable !== false) info = await admob.showConsentForm();
        const status = String(info?.status ?? 'UNKNOWN');
        canRequestAds = typeof info?.canRequestAds === 'boolean' ? info.canRequestAds : ['OBTAINED', 'NOT_REQUIRED'].includes(status);
        privacyOptionsRequired = info?.privacyOptionsRequirementStatus === 'REQUIRED';
        if (canRequestAds && await init()) { preload('interstitial'); preload('rewarded'); }
        return { status: status.toLowerCase(), canRequestAds, privacyOptionsRequired };
      }, () => { consentDone = null; return { status: 'error', canRequestAds: false, privacyOptionsRequired: false }; });
      return consentDone;
    },
    async showPrivacyOptions() {
      if (!adsOn || typeof admob.showPrivacyOptionsForm !== 'function') return { status: 'unavailable' };
      return safe(async () => {
        await admob.showPrivacyOptionsForm();
        consentDone = null; loaded.interstitial = loaded.rewarded = null;
        const r = await consent.request();
        return { status: r.status };
      }, { status: 'error' });
    }
  };

  // --- Google Play Billing -------------------------------------------------------------------------------------
  const entryOf = p => ({ productId: p.productIdentifier, orderId: orderIdOf(p), token: p.purchaseToken, acknowledged: p.isAcknowledged === true });
  /** Achats PAYÉS (état PURCHASED) et connus du jeu, pas encore consommés. Un achat en attente n'y figure pas. */
  async function paid() {
    const res = await store.getPurchases({ productType: INAPP });
    return (res?.purchases ?? []).filter(p => isPurchased(p) && known.has(p?.productIdentifier) && p.purchaseToken && orderIdOf(p)).map(entryOf);
  }
  const billing = {
    available: Boolean(store),
    async buy(productId) {
      if (!store || !known.has(productId)) return { ok: false, error: 'Achats indisponibles pour le moment' };
      const supported = await safe(() => store.isBillingSupported?.(), null);
      if (supported?.isBillingSupported === false) return { ok: false, error: 'Google Play ne permet pas l’achat sur cet appareil' };
      try {
        // Ni acquittement ni consommation ici : c'est store.js qui finalise APRÈS avoir crédité et sauvegardé.
        const tx = await withTimeout(store.purchaseProduct({ productIdentifier: productId, productType: INAPP, quantity: 1, autoAcknowledgePurchases: false, isConsumable: false }), timeouts.billing);
        if (isPending(tx)) return { ok: false, pending: true };
        // Confirmation croisée : on ne crédite que si Google liste cet achat à l'état PURCHASED.
        const list = await safe(paid, null);
        const mine = list?.find(e => e.token === tx?.purchaseToken) ?? (list ? null : (isPurchased(tx) && tx?.purchaseToken ? entryOf({ ...tx, productIdentifier: productId }) : null));
        if (!mine) return { ok: false, error: 'Achat non confirmé par Google Play : si tu as été débité, les jetons arriveront au prochain lancement.' };
        return { ok: true, orderId: mine.orderId, token: mine.token };
      } catch (error) {
        if (isCancel(error)) return { ok: false, cancelled: true };
        if (isPendingError(error)) return { ok: false, pending: true };
        return { ok: false, error: 'Achat impossible pour le moment' };
      }
    },
    async restore() { return store ? safe(paid, []) : []; },
    /** Consomme un lot de jetons (rachetable) ou acquitte le Pack débutant. true = fait. */
    async finalize({ productId, token, acknowledged } = {}) {
      if (!store || !token) return false;
      const product = known.get(productId);
      if (!product) return false;
      if (!product.oneTime) return safe(async () => { await store.consumePurchase({ purchaseToken: token }); return true; }, false);
      if (acknowledged) return true;
      return safe(async () => { await store.acknowledgePurchase({ purchaseToken: token }); return true; }, false);
    },
    async prices() {
      if (!store) return {};
      return safe(async () => {
        const { products = [] } = await store.getProducts({ productIdentifiers: PRODUCTS.map(p => p.id), productType: INAPP }) ?? {};
        return Object.fromEntries(products.map(p => [p?.identifier ?? p?.productIdentifier, p?.priceString]).filter(([id, price]) => known.has(id) && typeof price === 'string'));
      }, {});
    }
  };

  return { kind: 'native', ads, billing, consent };
}
