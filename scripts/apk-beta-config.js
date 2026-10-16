// APK de BÊTA uniquement : l'appli charge le jeu depuis le site GitHub Pages au lieu de l'embarquer.
// Résultat : chaque fusion dans main met à jour l'appli déjà installée, sans retélécharger l'APK.
// Hors ligne, le service worker du site sert la dernière version mise en cache ; si rien n'est
// encore en cache, Capacitor affiche offline.html (embarqué).
// La version Google Play (AAB) n'utilise PAS ce script : elle garde le jeu embarqué.
import { readFileSync, writeFileSync } from 'node:fs';

export const BETA_URL = 'https://scuillerjack-oss.github.io/frontieres-arken/';

const path = 'capacitor.config.json';
const cfg = JSON.parse(readFileSync(path, 'utf8'));
cfg.server = { ...(cfg.server || {}), url: BETA_URL, errorPath: 'offline.html', cleartext: false };
writeFileSync(path, JSON.stringify(cfg, null, 2) + '\n');
console.log(`APK de bêta : le jeu sera chargé depuis ${BETA_URL}`);
