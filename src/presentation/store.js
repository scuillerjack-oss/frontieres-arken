// V12/V14.4 — Achats intégrés : point d'extension unique.
//
// PWA et APK DE BÊTA : AUCUN paiement (BILLING_ENABLED=false, lu dans play-config.js, que seul le build Google Play
// réécrit). Le bouton « Achat de test (gratuit) » simule un achat confirmé. Règle d'or : aucun produit ne donne d'or
// ni de troupes (PRODUCTS[].grants : seulement `tokens` et `adsRemoved`).
//
// BUILD GOOGLE PLAY (AAB) : BILLING_ENABLED=true, play.js enregistre l'implémentation Play Billing (native-play.js) :
//   buy(productId)           -> { ok:true, orderId, token } | { ok:false, pending:true } | { ok:false, cancelled:true } | { ok:false, error }
//   restore()                -> [{ productId, orderId, token, acknowledged }]   (achats PAYÉS, pas encore consommés)
//   finalize({productId, token, ...}) -> boolean   (consomme un lot de jetons / acquitte le Pack débutant)
//   prices()                 -> { [productId]: '2,99 €' }   (prix localisés, lus chez Google Play)
//
// SÉCURITÉ DES JETONS : l'achat n'est finalisé (consommé/acquitté) qu'APRÈS que le jeu a crédité ET sauvegardé le profil.
// Si l'appli est tuée entre le paiement et le crédit, l'achat reste non consommé chez Google : il est rendu au lancement
// suivant (restorePurchases). applyPurchase est idempotent sur orderId : jamais de double crédit. Un achat « en attente »
// (paiement différé) ne crédite RIEN tant que Google ne l'a pas confirmé.
//
// Identifiants produits (Play Console > Monétiser > Produits intégrés) : pack_debutant (non consommable),
// jetons_1, jetons_5, jetons_12 (consommables). Prix conseillés : 2,99 / 0,49 / 1,99 / 3,99 €.
import { PRODUCTS, applyPurchase, canPurchase } from '../domain/profile.js';
import { PLAY_CONFIG } from './play-config.js';

export const BILLING_ENABLED = PLAY_CONFIG.play === true && PLAY_CONFIG.billing === true;
export { PRODUCTS };

let nativeBilling = null;
export function registerNativeBilling(impl) { nativeBilling = impl; }

let storePrices = {};
export const setStorePrices = prices => { storePrices = prices && typeof prices === 'object' ? { ...prices } : {}; };
/** Charge les prix localisés de Google Play (build Play). Silencieux en cas d'échec. */
export async function loadStorePrices({ enabled = BILLING_ENABLED, native = nativeBilling } = {}) {
  if (!(enabled && native?.prices)) return storePrices;
  try { setStorePrices(await native.prices()); } catch { /* prix inconnus : le bouton dit simplement « Acheter » */ }
  return storePrices;
}

/** Produits affichés dans la boutique, avec leur état pour ce profil. */
export function storeItems(profile, { enabled = BILLING_ENABLED } = {}) {
  return PRODUCTS.map(p => {
    const check = canPurchase(profile, p.id);
    return { ...p, available: check.ok, reason: check.ok ? '' : check.error, price: enabled ? (storePrices[p.id] || null) : 'Gratuit (test)', test: !enabled };
  });
}

const okForFinalize = r => r?.ok === true || r?.error === 'Déjà acheté';
async function finalizeSafely(native, entry) {
  try { return Boolean(await native.finalize?.(entry)); } catch { return false; }
}

let testSequence = 0;
/**
 * Achète un produit. Bêta : achat de TEST, gratuit, simulé. Build Play : paiement Google Play.
 * `save` (facultatif) : appelé APRÈS le crédit ; l'achat n'est finalisé chez Google que si elle ne renvoie pas false.
 * Renvoie le résultat de applyPurchase ({ ok, tokens, adsRemoved, test }) ou { ok:false, error, pending?, cancelled? }.
 */
export async function purchase(profile, productId, { date = null, save = null, enabled = BILLING_ENABLED, native = nativeBilling } = {}) {
  const check = canPurchase(profile, productId);
  if (!check.ok) return check;
  if (enabled) {
    if (!native?.buy) return { ok: false, error: 'Achats indisponibles pour le moment' };
    try {
      const r = await native.buy(productId);
      if (r?.pending) return { ok: false, pending: true, error: 'Paiement en attente de confirmation : les jetons arriveront dès que Google Play l’aura validé.' };
      if (r?.cancelled) return { ok: false, cancelled: true, error: 'Achat annulé' };
      if (!r?.ok || !r.orderId) return { ok: false, error: r?.error || 'Achat non confirmé : rien n’a été débité ou il sera rendu au prochain lancement' };
      const applied = applyPurchase(profile, { productId, orderId: r.orderId, date, test: false });
      if (okForFinalize(applied)) {
        const saved = typeof save === 'function' ? await save() : true;
        if (saved !== false) await finalizeSafely(native, { productId, token: r.token, orderId: r.orderId });
      }
      return { ...applied, test: false };
    } catch { return { ok: false, error: 'Achat impossible pour le moment' }; }
  }
  testSequence++;
  return { ...applyPurchase(profile, { productId, orderId: `TEST-${productId}-${Date.now().toString(36)}-${testSequence}`, date, test: true }), test: true };
}

/**
 * Récupère les achats Google Play déjà payés mais pas encore finalisés (appli fermée pendant l'achat, paiement différé
 * enfin confirmé, réinstallation : Pack débutant). À appeler au lancement et au retour dans l'appli.
 * Renvoie { ok, restored, tokens } ; `restored` = nombre d'achats réellement ajoutés au profil.
 */
export async function restorePurchases(profile, { save = null, date = null, enabled = BILLING_ENABLED, native = nativeBilling } = {}) {
  if (!(enabled && native?.restore)) return { ok: true, restored: 0, tokens: 0 };
  try {
    let restored = 0, tokens = 0;
    for (const entry of await native.restore()) {
      if (!entry?.productId || !entry.orderId) continue;
      const r = applyPurchase(profile, { productId: entry.productId, orderId: entry.orderId, date, test: false });
      if (r.ok && !r.duplicate) { restored++; tokens += r.tokens || 0; }
      if (okForFinalize(r)) {
        const saved = typeof save === 'function' ? await save() : true;
        if (saved !== false) await finalizeSafely(native, entry);
      }
    }
    return { ok: true, restored, tokens };
  } catch { return { ok: false, error: 'Restauration impossible pour le moment' }; }
}
