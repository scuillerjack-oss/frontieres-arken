// V16.3 — Le jeu se lance COUCHÉ sur le téléphone (demande de Jack du 19/11/2026).
// Ajoute android:screenOrientation="sensorLandscape" (paysage dans les deux sens, selon la façon dont on tient le
// téléphone) sur l'activité principale du projet Capacitor généré par `npx cap add android`.
// Appelé par scripts/android-prepare.js : donc pour l'APK de bêta (android-apk.yml) ET l'AAB Google Play (android-aab.yml).
// Patch idempotent : relancé deux fois, le manifeste ne change plus.
import fs from 'node:fs';
import path from 'node:path';

export const ORIENTATION = 'sensorLandscape';

/** Réécrit le texte d'un AndroidManifest.xml : l'activité .MainActivity reçoit screenOrientation="sensorLandscape". */
export function setLandscape(manifest) {
  const re = /<activity\b[^>]*android:name="(?:[\w.]*\.)?MainActivity"[^>]*>/;
  const tag = manifest.match(re)?.[0];
  if (!tag) throw new Error('AndroidManifest.xml : activité MainActivity introuvable (gabarit Capacitor modifié ?)');
  const clean = tag.replace(/\s+android:screenOrientation="[^"]*"/, '');
  const patched = clean.replace(/<activity\b/, `<activity\n            android:screenOrientation="${ORIENTATION}"`);
  return manifest.replace(tag, patched);
}

/** Applique le patch au projet android/ de `root`. Renvoie { changed }. */
export function configureOrientation(root = process.cwd()) {
  const file = path.join(root, 'android', 'app', 'src', 'main', 'AndroidManifest.xml');
  if (!fs.existsSync(file)) throw new Error('AndroidManifest.xml absent : lancer d\'abord `npx cap add android`');
  const before = fs.readFileSync(file, 'utf8'), after = setLandscape(before);
  if (after !== before) fs.writeFileSync(file, after);
  return { changed: after !== before };
}
