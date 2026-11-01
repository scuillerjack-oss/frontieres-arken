// V14.4 — Configuration du build Google Play (côté Node, jamais chargé par le jeu).
// - adsConfig(env) : identifiants AdMob. Identifiants de TEST officiels Google par défaut ; les vrais ne sont lus
//   que si ARKEN_ADS_PRODUCTION est défini, depuis ARKEN_ADMOB_APP_ID / _INTERSTITIAL_ID / _REWARDED_ID.
//   Production + identifiant manquant, mal formé ou de test = ERREUR (le build échoue).
// - isPlayBuild(env) : ARKEN_PLAY_BUILD défini (uniquement android-aab.yml).
// - injectPlayConfig(source, config) : réécrit le bloc de src/presentation/play-config.js (copie dist/).
// - configureManifest(root, env) : APPLICATION_ID AdMob + permission BILLING dans AndroidManifest.xml (build Play seulement).
import fs from 'node:fs';
import path from 'node:path';

export const ADMOB_TEST_IDS = Object.freeze({
  appId: 'ca-app-pub-3940256099942544~3347511713',
  interstitial: 'ca-app-pub-3940256099942544/1033173712',
  rewarded: 'ca-app-pub-3940256099942544/5224354917'
});
export const TEST_PUBLISHER = '3940256099942544';

export const truthy = v => typeof v === 'string' && v.trim() !== '' && !['0', 'false', 'non', 'no'].includes(v.trim().toLowerCase());
export const isPlayBuild = (env = process.env) => truthy(env.ARKEN_PLAY_BUILD);

export function adsConfig(env = process.env) {
  if (!isPlayBuild(env)) return Object.freeze({ play: false, ads: false, billing: false, testing: true, appId: null, interstitial: null, rewarded: null });
  if (!truthy(env.ARKEN_ADS_PRODUCTION)) return Object.freeze({ play: true, ads: true, billing: true, testing: true, ...ADMOB_TEST_IDS });
  const real = { appId: env.ARKEN_ADMOB_APP_ID, interstitial: env.ARKEN_ADMOB_INTERSTITIAL_ID, rewarded: env.ARKEN_ADMOB_REWARDED_ID };
  const names = { appId: 'ARKEN_ADMOB_APP_ID', interstitial: 'ARKEN_ADMOB_INTERSTITIAL_ID', rewarded: 'ARKEN_ADMOB_REWARDED_ID' };
  const missing = Object.entries(real).filter(([, v]) => !v || !v.trim()).map(([k]) => names[k]);
  if (missing.length) throw new Error('ARKEN_ADS_PRODUCTION défini mais identifiants AdMob manquants : ' + missing.join(', '));
  if (Object.values(real).some(v => v.includes(TEST_PUBLISHER))) throw new Error('ARKEN_ADS_PRODUCTION défini avec un identifiant de TEST Google : utiliser les vrais identifiants AdMob');
  if (!/^ca-app-pub-\d+~\d+$/.test(real.appId.trim()) || !/^ca-app-pub-\d+\/\d+$/.test(real.interstitial.trim()) || !/^ca-app-pub-\d+\/\d+$/.test(real.rewarded.trim())) throw new Error('Format d\'identifiant AdMob invalide');
  return Object.freeze({ play: true, ads: true, billing: true, testing: false, ...Object.fromEntries(Object.entries(real).map(([k, v]) => [k, v.trim()])) });
}

export function injectPlayConfig(source, config) {
  const re = /\/\/ ARKEN_PLAY_CONFIG_BEGIN\n[\s\S]*?\/\/ ARKEN_PLAY_CONFIG_END/;
  if (!re.test(source)) throw new Error('Bloc ARKEN_PLAY_CONFIG introuvable dans play-config.js');
  return source.replace(re, () => '// ARKEN_PLAY_CONFIG_BEGIN\nexport const PLAY_CONFIG = Object.freeze(' + JSON.stringify(config) + ');\n// ARKEN_PLAY_CONFIG_END');
}

const MARK = '<!-- ARKEN-ADMOB -->', END = '<!-- /ARKEN-ADMOB -->';
/** Patch idempotent du manifeste généré par `npx cap add android`. Sans ARKEN_PLAY_BUILD : rien ne change. */
export function configureManifest(root = process.cwd(), env = process.env) {
  if (!isPlayBuild(env)) return { changed: false };
  const config = adsConfig(env);
  const manifestPath = path.join(root, 'android', 'app', 'src', 'main', 'AndroidManifest.xml');
  if (!fs.existsSync(manifestPath)) throw new Error('AndroidManifest.xml absent : lancer d\'abord `npx cap add android`');
  let manifest = fs.readFileSync(manifestPath, 'utf8');
  const old = new RegExp('\\s*' + MARK + '[\\s\\S]*?' + END);
  manifest = manifest.replace(old, '');
  if (!/<application[\s>]/.test(manifest)) throw new Error('AndroidManifest.xml sans <application>');
  manifest = manifest.replace(/(<application[^>]*>)/, `$1\n        ${MARK}\n        <meta-data android:name="com.google.android.gms.ads.APPLICATION_ID" android:value="${config.appId}"/>\n        ${END}`);
  if (!manifest.includes('android.permission.INTERNET')) manifest = manifest.replace(/(<\/manifest>)/, '    <uses-permission android:name="android.permission.INTERNET" />\n$1');
  if (!manifest.includes('com.android.vending.BILLING')) manifest = manifest.replace(/(<\/manifest>)/, '    <uses-permission android:name="com.android.vending.BILLING" />\n$1');
  fs.writeFileSync(manifestPath, manifest);
  return { changed: true, appId: config.appId, testing: config.testing };
}
