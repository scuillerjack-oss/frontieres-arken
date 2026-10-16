/*
 * Bêta Android (APK) : contrairement au site, l'APK ne se met pas à jour tout seul.
 * Au lancement, on compare la version embarquée à celle publiée sur GitHub Pages ;
 * si elle est plus récente, un bandeau propose de télécharger le nouvel APK.
 * Silencieux hors ligne ou en cas d'erreur. Désactivé dans le navigateur (le site se met à jour seul).
 */
(function () {
  var isApp = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
  var el = document.getElementById('app-version');
  var current = el ? el.textContent.trim() : '';
  if (!isApp || !current || current.indexOf('__VERSION__') >= 0) return;
  var num = function (v) { return String(v).split('+')[0].split('.').map(function (n) { return parseInt(n, 10) || 0; }); };
  var newer = function (a, b) { a = num(a); b = num(b); for (var i = 0; i < 3; i++) { if (a[i] !== b[i]) return a[i] > b[i]; } return false; };
  var showBanner = function (latest) {
    var banner = document.getElementById('updateBanner');
    if (!banner) return;
    document.getElementById('updateVersion').textContent = latest;
    banner.hidden = false;
    document.getElementById('updateClose').addEventListener('click', function () { banner.hidden = true; });
  };
  try {
    fetch('https://scuillerjack-oss.github.io/frontieres-arken/version.txt', { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.text() : ''; })
      .then(function (t) { var latest = t.trim(); if (latest && newer(latest, current)) showBanner(latest); })
      .catch(function () {});
  } catch (e) { /* hors ligne : rien */ }
})();
