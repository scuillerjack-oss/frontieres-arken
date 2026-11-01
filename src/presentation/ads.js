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
// Règles (CLAUDE.md, « règles du studio ») :
//   - jamais de pub pendant qu'on joue ni dans le tutoriel (showGameStartAd n'est appelé qu'AVANT le début d'une
//     nouvelle partie, et refuse si `inTutorial`) ;
//   - Pack débutant = plus de pub de début de partie ;
//   - si le joueur ferme une pub proposée sans la mériter (refus), plus AUCUNE pub imposée jusqu'au prochain lancement ;
//   - pas de pub disponible = le jeu continue.
import { PLAY_CONFIG } from './play-config.js';

export const ADS_ENABLED = PLAY_CONFIG.play === true && PLAY_CONFIG.ads === true;
export const AD_PLACEHOLDER_MS = 3000;

/** Faut-il une publicité au début de la nouvelle partie ? Jamais avec le Pack débutant (sans pub). */
export const shouldShowGameStartAd = profile => !profile?.adsRemoved;

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

function placeholder(doc, { kind, ms }) {
  return new Promise(resolve => {
    if (!doc?.body) return resolve({ shown: false, rewarded: false });
    // <dialog> modal : passe au-dessus de tout, y compris d'un autre dialogue ouvert (écran Atouts & missions).
    const overlay = doc.createElement('dialog');
    overlay.id = 'adOverlay';
    overlay.className = 'ad-overlay';
    overlay.setAttribute('aria-label', 'Publicité (emplacement de test)');
    overlay.addEventListener('cancel', event => event.preventDefault()); // le bouton retour ne la ferme pas : elle se ferme seule
    overlay.innerHTML = `<div class="ad-card"><p class="ad-tag">EMPLACEMENT DE TEST · AUCUNE VRAIE PUBLICITÉ</p><h2>Publicité</h2><p>${kind === 'rewarded' ? 'Publicité de mission (récompensée)' : 'Publicité de début de partie'}</p><p class="ad-note">Ici s’affichera une publicité dans la version Google Play. Le Pack débutant les supprime.</p><div class="ad-bar"><i></i></div><small class="ad-count">Fermeture automatique dans <b>${Math.ceil(ms / 1000)}</b> s</small></div>`;
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
 * Publicité récompensée (mission publicité), déclenchée par le joueur. Résout { shown, rewarded, dismissed? }.
 * Facultative, même avec le Pack. Fermée sans récompense = refus : plus aucune pub de début de partie pour la session.
 */
export async function showRewardedAd({ doc = globalThis.document, ms = AD_PLACEHOLDER_MS, enabled = ADS_ENABLED, native = nativeAds } = {}) {
  try {
    if (enabled) {
      if (!native?.showRewarded) return { shown: false, rewarded: false };
      const r = await native.showRewarded();
      const earned = r?.status === 'earned' || (r?.status === undefined && r?.rewarded === true);
      if (earned) return { shown: true, rewarded: true };
      if (r?.status === 'dismissed') { session.refused = true; return { shown: true, rewarded: false, dismissed: true }; }
      return { shown: false, rewarded: false };
    }
    return await placeholder(doc, { kind: 'rewarded', ms });
  } catch { return { shown: false, rewarded: false, error: true }; }
}
