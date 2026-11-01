// V14.4 — Branchement du build Google Play : relie la couche native (native-play.js) à ads.js et store.js.
// Hors build Play (PWA, APK de bêta) : ne fait RIEN et ne charge rien (aucun SDK, aucun réseau).
import { PLAY_CONFIG } from './play-config.js';
import { registerNativeAds } from './ads.js';
import { registerNativeBilling, loadStorePrices } from './store.js';

export const isNativeApp = (cap = globalThis.Capacitor) => Boolean(cap?.isNativePlatform?.());

/**
 * Initialise AdMob (consentement UMP), Play Billing et les prix. Ne lève jamais d'exception.
 * Renvoie { active, privacyOptionsRequired, showPrivacyOptions }.
 */
export async function initPlay({ config = PLAY_CONFIG, cap = globalThis.Capacitor, importer = () => import('./native-play.js') } = {}) {
  const off = { active: false, privacyOptionsRequired: false, showPrivacyOptions: async () => ({ status: 'unavailable' }) };
  if (!(config?.play === true) || !isNativeApp(cap)) return off;
  try {
    const native = await (await importer()).createNativePlay(cap, { config });
    if (!native) return off;
    if (config.ads) registerNativeAds(native.ads);
    if (config.billing) { registerNativeBilling(native.billing); loadStorePrices({ enabled: true, native: native.billing }); }
    // Consentement demandé dès le lancement (avant toute annonce) ; ne bloque pas le jeu.
    const consent = await native.consent.request();
    return { active: true, privacyOptionsRequired: consent.privacyOptionsRequired === true, showPrivacyOptions: () => native.consent.showPrivacyOptions() };
  } catch { return off; }
}
