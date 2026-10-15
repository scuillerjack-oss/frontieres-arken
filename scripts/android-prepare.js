// Personnalise le projet Android généré par `npx cap add android` (dossier android/,
// NON committé : il est régénéré à chaque build dans GitHub Actions).
//
//  1. icônes et écran de lancement FRONTIÈRES: ARKEN (android-res/ → android/app/src/main/res/) ;
//  2. versionCode / versionName lus dans l'environnement au moment du build Gradle ;
//  3. signature STABLE avec la clé de bêta android-debug/arken-debug.keystore, pour que
//     chaque nouvel APK s'installe PAR-DESSUS le précédent (les parties sont conservées).
//
// Usage : node scripts/android-prepare.js   (après `npx cap add android`)
import { cpSync, readFileSync, writeFileSync, readdirSync, rmSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const app = join(root, 'android', 'app');
const res = join(app, 'src', 'main', 'res');
const gradleFile = join(app, 'build.gradle');
if (!existsSync(gradleFile)) throw new Error('android/ absent : lancer d\'abord `npx cap add android`');

// 1. Ressources : on retire le logo Capacitor des écrans de lancement, puis on copie les nôtres.
for (const dir of readdirSync(res)) {
  if (dir.startsWith('drawable')) rmSync(join(res, dir, 'splash.png'), { force: true });
}
cpSync(join(root, 'android-res', 'res'), res, { recursive: true });

// 2 et 3. build.gradle : version + signature.
let gradle = readFileSync(gradleFile, 'utf8');
const MARK = '// FRONTIERES-ARKEN';
if (!gradle.includes(MARK)) {
  const replace = (re, by, what) => {
    if (!re.test(gradle)) throw new Error(`build.gradle : ${what} introuvable (gabarit Capacitor modifié ?)`);
    gradle = gradle.replace(re, by);
  };
  replace(/versionCode \d+/, 'versionCode((System.getenv("ARKEN_VERSION_CODE") ?: "1").toInteger())', 'versionCode');
  replace(/versionName "[^"]*"/, 'versionName(System.getenv("ARKEN_VERSION_NAME") ?: "local")', 'versionName');
  gradle += `
${MARK} : signature de BÊTA stable (clé publique de débogage, voir android-debug/README.md).
// La vraie clé Google Play (V12) viendra des secrets GitHub, jamais du dépôt.
android {
    signingConfigs {
        arkenBeta {
            storeFile rootProject.file('../android-debug/arken-debug.keystore')
            storeType 'pkcs12'
            storePassword 'android'
            keyAlias 'arkendebug'
            keyPassword 'android'
        }
    }
    buildTypes {
        debug { signingConfig signingConfigs.arkenBeta }
        release { signingConfig signingConfigs.arkenBeta }
    }
}
`;
  writeFileSync(gradleFile, gradle);
}
console.log('android/ personnalisé : icônes, version, signature de bêta');
