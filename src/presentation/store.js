// V12 — Achats intégrés : point d'extension unique (docs/V12-branchements.md).
//
// EN BÊTA : AUCUN paiement. Le bouton « Achat de test (gratuit) » simule un achat confirmé et applique le produit
// au profil (jetons, suppression des pubs). Règle d'or : aucun produit ne donne d'or ni de troupes.
//
// BRANCHER GOOGLE PLAY BILLING PLUS TARD (version Google Play uniquement) :
//   1. Jack crée le profil marchand Play Console et les produits intégrés avec EXACTEMENT ces identifiants :
//      pack_debutant (non consommable), jetons_1, jetons_5, jetons_12 (consommables). Les prix se fixent là-bas.
//   2. Ajouter un plugin Capacitor de facturation Google Play au build Android.
//   3. Passer BILLING_ENABLED à true UNIQUEMENT dans le build Play et fournir `nativeBilling` :
//        buy(productId) → { ok, orderId }   (achat confirmé ET acquitté par Google Play)
//        restore()      → [{ productId, orderId }]   (achats non consommables : Pack débutant)
//      Le jeu appelle ensuite applyPurchase(profile, …) (src/domain/profile.js), idempotent sur orderId.
import { PRODUCTS, applyPurchase, canPurchase } from '../domain/profile.js';

export const BILLING_ENABLED = false;
export { PRODUCTS };

let nativeBilling = null;
export function registerNativeBilling(impl) { nativeBilling = impl; }

/** Produits affichés dans la boutique, avec leur état pour ce profil. */
export function storeItems(profile) {
  return PRODUCTS.map(p => {
    const check = canPurchase(profile, p.id);
    return { ...p, available: check.ok, reason: check.ok ? '' : check.error, price: BILLING_ENABLED ? null : 'Gratuit (test)', test: !BILLING_ENABLED };
  });
}

let testSequence = 0;
/**
 * Achète un produit. En bêta : achat de TEST, gratuit, simulé immédiatement.
 * Renvoie le résultat de applyPurchase ({ ok, tokens, adsRemoved }) ou { ok:false, error }.
 */
export async function purchase(profile, productId, { date = null } = {}) {
  const check = canPurchase(profile, productId);
  if (!check.ok) return check;
  if (BILLING_ENABLED && nativeBilling?.buy) {
    try {
      const r = await nativeBilling.buy(productId);
      if (!r?.ok) return { ok: false, error: r?.error || 'Achat annulé' };
      return applyPurchase(profile, { productId, orderId: r.orderId, date, test: false });
    } catch { return { ok: false, error: 'Achat impossible pour le moment' }; }
  }
  testSequence++;
  return applyPurchase(profile, { productId, orderId: `TEST-${productId}-${Date.now().toString(36)}-${testSequence}`, date, test: true });
}

/** Restauration des achats (Google Play). En bêta : rien à restaurer côté magasin (utiliser l'export du profil). */
export async function restorePurchases(profile) {
  if (!(BILLING_ENABLED && nativeBilling?.restore)) return { ok: true, restored: 0 };
  try {
    let restored = 0;
    for (const r of await nativeBilling.restore()) if (applyPurchase(profile, { ...r, test: false }).ok) restored++;
    return { ok: true, restored };
  } catch { return { ok: false, error: 'Restauration impossible pour le moment' }; }
}
