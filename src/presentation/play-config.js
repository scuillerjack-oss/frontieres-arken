// V14.4 — Configuration du build Google Play. Dans le dépôt, la valeur est celle de la PWA et de l'APK de bêta :
// AUCUNE publicité réelle, AUCUN achat, aucun SDK. Seul `scripts/build.js` (avec ARKEN_PLAY_BUILD défini, workflow
// android-aab.yml) réécrit ce bloc DANS dist/ (jamais dans la source). Identifiants de TEST Google tant que
// ARKEN_ADS_PRODUCTION n'est pas défini (voir scripts/play-config.js).
// ARKEN_PLAY_CONFIG_BEGIN
export const PLAY_CONFIG = Object.freeze({"play":false,"ads":false,"billing":false,"testing":true,"appId":null,"interstitial":null,"rewarded":null});
// ARKEN_PLAY_CONFIG_END
