// V12 — Publicités : point d'extension unique (docs/V12-branchements.md).
//
// EN BÊTA (PWA et APK de bêta) : AUCUNE vraie publicité, aucun SDK, aucun réseau. À la place, un écran
// « Publicité (emplacement de test) » clairement marqué, affiché AD_PLACEHOLDER_MS millisecondes, qui se ferme seul.
//
// BRANCHER ADMOB PLUS TARD (version Google Play uniquement) :
//   1. Jack crée le compte AdMob, l'application et deux blocs d'annonces : « interstitiel » (début de partie) et
//      « avec récompense » (mission publicité). Les identifiants vont dans les secrets GitHub, pas dans le code.
//   2. Ajouter le plugin Capacitor AdMob (ex. @capacitor-community/admob) au build Android, plus le formulaire de
//      consentement RGPD (UMP) de Google, affiché AVANT la première annonce.
//   3. Passer ADS_ENABLED à true UNIQUEMENT dans le build Play (variable de build) et implémenter `nativeAds`
//      ci-dessous : showInterstitial() pour showGameStartAd, showRewarded() → { rewarded:true } pour showRewardedAd.
//   Le reste du jeu n'a pas à changer : il appelle seulement showGameStartAd() et showRewardedAd().

export const ADS_ENABLED = false;
export const AD_PLACEHOLDER_MS = 3000;

/** Faut-il une publicité au début de la nouvelle partie ? Jamais avec le Pack débutant (sans pub). */
export const shouldShowGameStartAd = profile => !profile?.adsRemoved;

/** Implémentation native (AdMob), à fournir dans la version Google Play. Null en bêta. */
let nativeAds = null;
export function registerNativeAds(impl) { nativeAds = impl; }

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

/** Publicité de début de partie. Résout { shown, rewarded:false }. Ne bloque jamais le jeu en cas d'erreur. */
export async function showGameStartAd({ profile, doc = globalThis.document, ms = AD_PLACEHOLDER_MS } = {}) {
  if (!shouldShowGameStartAd(profile)) return { shown: false, skipped: 'pack' };
  try {
    if (ADS_ENABLED && nativeAds?.showInterstitial) { await nativeAds.showInterstitial(); return { shown: true }; }
    return await placeholder(doc, { kind: 'start', ms });
  } catch { return { shown: false, error: true }; }
}

/** Publicité récompensée (mission publicité). Résout { shown, rewarded }. Facultative, même avec le Pack. */
export async function showRewardedAd({ doc = globalThis.document, ms = AD_PLACEHOLDER_MS } = {}) {
  try {
    if (ADS_ENABLED && nativeAds?.showRewarded) { const r = await nativeAds.showRewarded(); return { shown: true, rewarded: Boolean(r?.rewarded) }; }
    return await placeholder(doc, { kind: 'rewarded', ms });
  } catch { return { shown: false, rewarded: false, error: true }; }
}
