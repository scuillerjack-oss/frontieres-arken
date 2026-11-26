// V17.7 — Écran Premium (rendu HTML pur, testable sous Node ; branché par ui/premium-ui.js).
// Premium = 1,99 €, achat unique, à vie : vitesse ×2 et plus aucune pub imposée. Pack débutant (2,99 €) = Premium + 3 jetons.
// En bêta (BILLING_ENABLED=false) : « Achat de test (gratuit) », rien n'est payant, comme les autres achats.
import { RULES } from '../domain/constants.js';
import { STARTER_PACK_TOKENS } from '../domain/profile.js';

const P = RULES.realtime.premium;
const esc = t => String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export const euros = v => `${String(Number(v).toFixed(2)).replace('.', ',')} €`;

/** Texte du bouton d'achat : prix lu chez Google Play (build Play) ou achat de test gratuit (bêta). */
export function buyLabel({ billing = false, price = null, fallback = '' } = {}) {
  return billing ? `Acheter · ${esc(price || fallback)}` : 'Achat de test (gratuit)';
}

/**
 * Contenu de l'écran. `billing` : vrais achats (build Play) ; `prices` : prix localisés ; `from` : 'fast' quand on vient du ⏩.
 */
export function premiumScreenHtml(profile, { billing = false, prices = {}, from = '', betaFast = false } = {}) {
  // V17.13 : bêta interne (BETA_X2_GRATUIT, beta-flags.js) : ⏩ est gratuit pendant les tests ; on le dit sur l'écran.
  const beta = betaFast ? '<p class="premium-why beta-fast">Bêta interne : la vitesse ×2 est gratuite pendant les tests (elle redeviendra Premium à la sortie).</p>' : '';
  const perks = `<ul class="premium-perks">
<li><b aria-hidden="true">⏩</b><span><strong>Vitesse ×2</strong><small>Un jour de jeu par seconde au lieu de deux. ▶ reste disponible pour revenir en ×1.</small></span></li>
<li><b aria-hidden="true">🚫</b><span><strong>Plus aucune pub imposée</strong><small>Les pubs 🎁 restent là si vous voulez leur bonus : c’est vous qui choisissez.</small></span></li>
<li><b aria-hidden="true">∞</b><span><strong>Achat unique, à vie</strong><small>Pas d’abonnement. Jamais d’or ni de troupes à vendre : seulement du confort.</small></span></li></ul>`;
  if (profile?.premium) {
    return `<p class="kicker">PREMIUM · ACTIF</p><h2 id="premiumTitle">✔ Premium actif</h2>${perks}\
<p class="help-intro">${profile.starterPack ? 'Inclus dans votre Pack débutant. ' : ''}Touchez ⏩ en bas à droite pour passer en ×2.</p>\
<button class="primary" id="premiumDone">${from === 'fast' ? 'Passer en ×2' : 'Fermer'}</button>`;
  }
  return `<p class="kicker">PREMIUM · ${euros(P.priceEur)} · ACHAT UNIQUE${billing ? '' : ' <span class="test-badge">BÊTA · AUCUN PAIEMENT</span>'}</p>\
<h2 id="premiumTitle">Premium</h2>${from === 'fast' && !betaFast ? '<p class="premium-why">La vitesse ×2 fait partie de Premium.</p>' : ''}${beta}${perks}\
<button class="primary premium-buy" data-premium-buy="premium">${buyLabel({ billing, price: prices.premium, fallback: euros(P.priceEur) })}<small>Premium · ${euros(P.priceEur)}</small></button>\
<div class="premium-pack"><span><b>Ou le Pack débutant</b><small>Premium + ${STARTER_PACK_TOKENS} jetons d’atouts · ${euros(P.starterPackEur)}</small></span>\
<button class="buy-test" data-premium-buy="pack_debutant">${billing ? `Acheter · ${esc(prices.pack_debutant || euros(P.starterPackEur))}` : 'Achat de test (gratuit)'}</button></div>\
<p class="v12-note">${billing ? 'Paiement par Google Play. Déjà acheté sur un autre appareil ? Il revient tout seul au lancement.' : 'Version bêta : aucun paiement, l’achat est simulé et gratuit.'} Le temps du jeu est arrêté pendant cet écran.</p>`;
}
