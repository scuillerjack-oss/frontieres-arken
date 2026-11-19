// V16.3 — format paysage : le jeu se lance couché (manifeste + appli Android) et la mise en page s'adapte à un écran
// large et bas (~844 × 390). Cahier : docs/V16-cahier-des-charges.md (section V16.3).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, cpSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { root } from './helpers/sources.js';
import { setLandscape, configureOrientation, ORIENTATION } from '../scripts/android-orientation.js';

const read = p => readFileSync(join(root, p), 'utf8');

// Manifeste tel que le génère `npx cap add android` (Capacitor 8).
const CAP_MANIFEST = `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
    <application
        android:allowBackup="true"
        android:icon="@mipmap/ic_launcher"
        android:label="@string/app_name"
        android:theme="@style/AppTheme">
        <activity
            android:configChanges="orientation|keyboardHidden|keyboard|screenSize|locale|smallestScreenSize|screenLayout|uiMode|navigation|density"
            android:name=".MainActivity"
            android:label="@string/title_activity_main"
            android:theme="@style/AppTheme.NoActionBarLaunch"
            android:launchMode="singleTask"
            android:exported="true">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity>
        <provider android:name="androidx.core.content.FileProvider" android:authorities="\${applicationId}.fileprovider" android:exported="false" android:grantUriPermissions="true">
        </provider>
    </application>
    <uses-permission android:name="android.permission.INTERNET" />
</manifest>
`;
const activityTag = m => m.match(/<activity\b[^>]*>/)[0];

test('V16.3 : le manifeste de la PWA demande le paysage', () => {
  const manifest = JSON.parse(read('manifest.webmanifest'));
  assert.equal(manifest.orientation, 'landscape');
  assert.equal(manifest.display, 'standalone');
});

test('V16.3 : activité principale Android verrouillée en paysage dans les deux sens (sensorLandscape), patch idempotent', () => {
  assert.equal(ORIENTATION, 'sensorLandscape');
  const once = setLandscape(CAP_MANIFEST), twice = setLandscape(once);
  assert.equal(twice, once, 'deux passages = même manifeste');
  assert.equal(once.split('android:screenOrientation=').length, 2, 'une seule orientation');
  assert.match(activityTag(once), /android:screenOrientation="sensorLandscape"/);
  assert.match(activityTag(once), /android:name="\.MainActivity"/);
  assert.match(once, /<provider android:name="androidx\.core\.content\.FileProvider"/, 'le reste du manifeste ne bouge pas');
  // Une orientation déjà présente (portrait) est remplacée, pas doublée.
  const portrait = CAP_MANIFEST.replace('android:launchMode="singleTask"', 'android:screenOrientation="portrait"\n            android:launchMode="singleTask"');
  const fixed = setLandscape(portrait);
  assert.equal(fixed.split('android:screenOrientation=').length, 2);
  assert.match(activityTag(fixed), /screenOrientation="sensorLandscape"/);
  assert.throws(() => setLandscape('<manifest><application></application></manifest>'), /MainActivity introuvable/);
});

test('V16.3 : scripts/android-prepare.js applique l\'orientation, pour l\'APK de bêta comme pour l\'AAB Google Play', () => {
  const src = read('scripts/android-prepare.js');
  assert.match(src, /import \{ configureOrientation \} from '\.\/android-orientation\.js'/);
  assert.match(src, /\nconfigureOrientation\(root\);/, 'appel sans condition (pas réservé au build Play)');
  for (const wf of ['android-apk.yml', 'android-aab.yml']) assert.match(read('.github/workflows/' + wf), /node scripts\/android-prepare\.js/, wf);
});

test('V16.3 : android-prepare.js lancé sur un projet Capacitor factice → MainActivity en sensorLandscape (bêta et Play)', () => {
  for (const env of [{}, { ARKEN_PLAY_BUILD: '1' }]) {
    const dir = mkdtempSync(join(tmpdir(), 'arken-orient-'));
    try {
      mkdirSync(join(dir, 'scripts'));
      for (const f of ['android-prepare.js', 'android-orientation.js', 'play-config.js']) cpSync(join(root, 'scripts', f), join(dir, 'scripts', f));
      writeFileSync(join(dir, 'package.json'), '{"type":"module"}');
      cpSync(join(root, 'android-res'), join(dir, 'android-res'), { recursive: true });
      const main = join(dir, 'android', 'app', 'src', 'main');
      mkdirSync(join(main, 'res', 'drawable'), { recursive: true });
      writeFileSync(join(dir, 'android', 'app', 'build.gradle'), 'android {\n    defaultConfig {\n        versionCode 1\n        versionName "1.0"\n    }\n}\n');
      writeFileSync(join(main, 'AndroidManifest.xml'), CAP_MANIFEST);
      const clean = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('ARKEN_')));
      execFileSync(process.execPath, [join(dir, 'scripts', 'android-prepare.js')], { env: { ...clean, ...env }, stdio: 'pipe' });
      const m = readFileSync(join(main, 'AndroidManifest.xml'), 'utf8');
      assert.match(activityTag(m), /android:screenOrientation="sensorLandscape"/, JSON.stringify(env));
      assert.deepEqual(configureOrientation(dir), { changed: false }, 'déjà en paysage : rien à réécrire');
    } finally { rmSync(dir, { recursive: true, force: true }); }
  }
});

test('V16.3 : feuille paysage.css chargée après v5.css, publiée et mise en cache hors ligne', () => {
  const html = read('index.html');
  const v5 = html.indexOf('href="v5.css"'), land = html.indexOf('href="paysage.css"');
  assert.ok(v5 > 0 && land > v5, 'paysage.css après v5.css (dernier mot sur les mêmes sélecteurs)');
  assert.match(read('sw.js'), /'\.\/paysage\.css',/);
  assert.match(read('scripts/build.js'), /'paysage\.css'/);
});

test('V16.3 : règles paysage — écran couché ET bas seulement ; le portrait garde sa mise en page', () => {
  const css = read('paysage.css');
  const blocks = [...css.matchAll(/@media\s*\(([^{]*)\)\s*\{/g)].map(m => m[1]);
  assert.ok(blocks.length >= 1);
  for (const q of blocks) assert.match(q, /orientation:landscape\) and \(max-height:\d+px/, 'jamais de règle hors paysage : ' + q);
  // Rien en dehors des @media : le fichier ne change pas le portrait.
  const outside = css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/@media[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, '').trim();
  assert.equal(outside, '', 'aucune règle hors @media paysage');
});

test('V16.3 : gabarit paysage — carte à gauche, colonne à droite (infos + boutons), fiche latérale, fenêtres bornées', () => {
  const css = read('paysage.css');
  assert.match(css, /#gameScreen:not\(\[hidden\]\)\{[^}]*grid-template-columns:minmax\(0,1fr\) var\(--side\)/);
  assert.match(css, /#gameScreen \.map-shell\{grid-column:1;grid-row:1\/-1/);
  assert.match(css, /\.hud\{grid-column:2;grid-row:1\/3/);
  assert.match(css, /nav\.bottom-bar\{grid-column:2;grid-row:3/);
  assert.match(css, /#provinceSheet\{[^}]*right:calc\(var\(--side\) \+ 8px\)[^}]*width:var\(--sheet-w\)/);
  assert.match(css, /dialog\{[^}]*max-height:calc\(100dvh/);
  assert.match(css, /dialog section\{max-height:calc\(100dvh/);
  // Zones sûres (encoche), quel que soit le côté où est tourné le téléphone.
  for (const side of ['left', 'right', 'top', 'bottom']) assert.match(css, new RegExp(`env\\(safe-area-inset-${side}`), side);
});

test('V16.3 : bulles (aide, mini tuto, tutoriel), animation de tour et bandeau de mise à jour restent hors de la colonne de droite', () => {
  const css = read('paysage.css');
  assert.match(css, /#tutorialBubble\{[^}]*right:calc\(var\(--side\) \+ 12px\)/);
  assert.match(css, /--beside-sheet:min\(calc\(var\(--side\) \+ var\(--sheet-w\) \+ 20px\),calc\(100vw - 230px/, 'à gauche de la fiche, jamais moins de 230 px de large');
  assert.match(css, /#tutorialBubble\.top\{[^}]*right:var\(--beside-sheet\)/, 'fiche ouverte : à gauche de la fiche');
  assert.match(css, /#miniTuto,#miniTuto\.tuto-full\{inset:[^}]*var\(--side\)/);
  assert.match(css, /body:has\(#provinceSheet:not\(\[hidden\]\)\) > #miniTuto\{right:var\(--beside-sheet\)/);
  assert.match(css, /dialog\[open\]:has\(> #miniTuto:not\(\[hidden\]\)\)\{margin-left/, 'fenêtre à gauche, bulle à droite');
  assert.match(css, /#turnAnim\{padding:[^}]*var\(--side\)/);
  assert.match(css, /#updateBanner\{[^}]*right:calc\(var\(--side\)/);
  assert.match(css, /\.welcome-card\{[^}]*grid-template-columns:minmax\(0,1fr\) minmax\(0,1fr\)/, 'accueil sur deux colonnes');
});
