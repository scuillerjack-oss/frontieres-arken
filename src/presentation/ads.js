// V12/V14.4 — Publicités : point d'extension unique.
//
// PWA et APK DE BÊTA : AUCUNE vraie publicité, aucun SDK, aucun réseau (ADS_ENABLED=false, lu dans play-config.js, que
// seul le build Google Play réécrit). À la place, un écran « Publicité (emplacement de test) » clairement marqué,
// affiché AD_PLACEHOLDER_MS millisecondes, qui se ferme seul.
//
// BUILD GOOGLE PLAY (AAB) : ADS_ENABLED=true. src/presentation/play.js enregistre l'implémentation AdMob
// (native-play.js) via registerNativeAds({ showInterstitial, showRewarded }). Dans ce build, l'emplacement de test
// n'apparaît JAMAIS : si AdMob n'est pas prêt (pas de consentement, pas de réseau, pas de pub), le jeu continue sans pub.
//
// Règles (CLAUDE.md, « règles du studio », V17) :
//   - V17.7 : la pub de début de partie est SUPPRIMÉE (showGameStartAd n'est plus appelé, gardé pour le tour par tour
//     testé). Pub imposée = showForcedAd, au plus une toutes les 10 min de jeu et seulement à un moment calme : la
//     décision (moment calme, action en cours, tutoriel, Premium, refus, 10 min) est prise par ad-timer.js (pur) ;
//   - jamais de pub imposée dans le tutoriel ni pour un Premium (Pack débutant compris) ;
//   - si le joueur ferme une pub proposée sans la mériter (refus), plus AUCUNE pub imposée jusqu'au prochain lancement ;
//   - pas de pub disponible = le jeu continue.
import { PLAY_CONFIG } from './play-config.js';

export const ADS_ENABLED = PLAY_CONFIG.play === true && PLAY_CONFIG.ads === true;
export const AD_PLACEHOLDER_MS = 3000;

/** Faut-il une publicité imposée pour ce profil ? Jamais pour un Premium (V17.7 ; ancien Pack débutant = Premium). */
export const shouldShowGameStartAd = profile => !(profile?.premium || profile?.adsRemoved);
export const forcedAdsAllowed = shouldShowGameStartAd;

/**
 * Implémentation native (AdMob), fournie par play.js dans le build Google Play. Null en bêta.
 * Contrat : showInterstitial() -> { status:'shown'|'unavailable'|'error' } ;
 *           showRewarded()     -> { status:'earned'|'dismissed'|'unavailable'|'error' } (ou { rewarded:boolean }).
 */
let nativeAds = null;
export function registerNativeAds(impl) { nativeAds = impl; }

/** Refus de la session : une pub proposée a été fermée sans récompense => plus aucune pub imposée. */
const session = { refused: false };
export const adsRefusedThisSession = () => session.refused;
export function resetAdsSession() { session.refused = false; }

const PLACEHOLDER_TEXT = { rewarded: 'Publicité récompensée', start: 'Publicité de début de partie', forced: 'Publicité (moment calme)' };
function placeholder(doc, { kind, ms, label = '' }) {
  return new Promise(resolve => {
    if (!doc?.body) return resolve({ shown: false, rewarded: false });
    // <dialog> modal : passe au-dessus de tout, y compris d'un autre dialogue ouvert (écran Atouts & missions).
    const overlay = doc.createElement('dialog');
    overlay.id = 'adOverlay';
    overlay.className = 'ad-overlay';
    overlay.setAttribute('aria-label', 'Publicité (emplacement de test)');
    overlay.addEventListener('cancel', event => event.preventDefault()); // le bouton retour ne la ferme pas : elle se ferme seule
    overlay.innerHTML = `<div class="ad-card"><p class="ad-tag">EMPLACEMENT DE TEST · AUCUNE VRAIE PUBLICITÉ</p><h2>Publicité</h2><p>${label || PLACEHOLDER_TEXT[kind] || 'Publicité'}</p>\
<p class="ad-note">Ici s’affichera une publicité dans la version Google Play.${kind === 'rewarded' ? ' Le jeu est en pause pendant la pub.' : ' Premium supprime les publicités imposées.'}</p><div class="ad-bar"><i></i></div><small class="ad-count">Fermeture automatique dans <b>${Math.ceil(ms / 1000)}</b> s</small></div>`;
    overlay.style.setProperty('--ad-ms', `${ms}ms`);
    doc.body.append(overlay);
    try { overlay.showModal(); } catch { overlay.setAttribute('open', ''); }
    const count = overlay.querySelector('.ad-count b');
    let left = Math.ceil(ms / 1000);
    const tick = setInterval(() => { left = Math.max(0, left - 1); if (count) count.textContent = String(left); }, 1000);
    setTimeout(() => { clearInterval(tick); try { overlay.close(); } catch {} overlay.remove(); resolve({ shown: true, rewarded: kind === 'rewarded', test: true }); }, ms);
  });
}

/**
 * Publicité de début de partie. Résout { shown, rewarded:false }. Ne bloque jamais le jeu en cas d'erreur.
 * `inTutorial` : jamais de pub (tutoriel ou explications de première partie). `enabled` / `native` : injectables (tests).
 */
export async function showGameStartAd({ profile, doc = globalThis.document, ms = AD_PLACEHOLDER_MS, inTutorial = false, enabled = ADS_ENABLED, native = nativeAds } = {}) {
  if (inTutorial) return { shown: false, skipped: 'tutorial' };
  if (!shouldShowGameStartAd(profile)) return { shown: false, skipped: 'pack' };
  try {
    if (enabled) {
      if (session.refused) return { shown: false, skipped: 'refused' };
      if (!native?.showInterstitial) return { shown: false, skipped: 'unavailable' };
      const r = await native.showInterstitial();
      return { shown: r?.status === 'shown' };
    }
    return await placeholder(doc, { kind: 'start', ms });
  } catch { return { shown: false, error: true }; }
}

/**
 * V17.7 — Publicité IMPOSÉE à un moment calme. L'appelant a déjà vérifié forcedAdCheck (ad-timer.js) ; cette fonction
 * revérifie ce qui ne dépend pas du moment : Premium, tutoriel, refus de la session. Ne bloque jamais le jeu.
 */
export async function showForcedAd({ profile, doc = globalThis.document, ms = AD_PLACEHOLDER_MS, inTutorial = false, enabled = ADS_ENABLED, native = nativeAds } = {}) {
  if (inTutorial) return { shown: false, skipped: 'tutorial' };
  if (!forcedAdsAllowed(profile)) return { shown: false, skipped: 'premium' };
  if (session.refused) return { shown: false, skipped: 'refused' };
  try {
    if (enabled) {
      if (!native?.showInterstitial) return { shown: false, skipped: 'unavailable' };
      const r = await native.showInterstitial();
      return { shown: r?.status === 'shown' };
    }
    return await placeholder(doc, { kind: 'forced', ms });
  } catch { return { shown: false, error: true }; }
}

/**
 * Publicité récompensée (mission publicité, V17.7 : icône 🎁 de la carte), déclenchée par le joueur. Résout { shown, rewarded, dismissed? }.
 * Facultative, même avec le Pack. Fermée sans récompense = refus : plus aucune pub de début de partie pour la session.
 */
export async function showRewardedAd({ doc = globalThis.document, ms = AD_PLACEHOLDER_MS, enabled = ADS_ENABLED, native = nativeAds, label = '' } = {}) {
  try {
    if (enabled) {
      if (!native?.showRewarded) return { shown: false, rewarded: false };
      const r = await native.showRewarded();
      const earned = r?.status === 'earned' || (r?.status === undefined && r?.rewarded === true);
      if (earned) return { shown: true, rewarded: true };
      if (r?.status === 'dismissed') { session.refused = true; return { shown: true, rewarded: false, dismissed: true }; }
      return { shown: false, rewarded: false };
    }
    return await placeholder(doc, { kind: 'rewarded', ms, label });
  } catch { return { shown: false, rewarded: false, error: true }; }
}
