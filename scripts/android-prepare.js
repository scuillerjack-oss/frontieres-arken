// Personnalise le projet Android généré par `npx cap add android` (dossier android/,
// NON committé : il est régénéré à chaque build dans GitHub Actions).
//
//  1. icônes et écran de lancement FRONTIÈRES: ARKEN (android-res/ → android/app/src/main/res/) ;
//  2. versionCode / versionName lus dans l'environnement au moment du build Gradle ;
//  3. signature STABLE avec la clé de bêta android-debug/arken-debug.keystore, pour que
//     chaque nouvel APK s'installe PAR-DESSUS le précédent (les parties sont conservées) ;
//  4. signature « play » avec la CLÉ D'IMPORTATION Google Play, choisie AU MOMENT DU BUILD
//     GRADLE si la variable ARKEN_PLAY_STORE_FILE est définie (workflow android-aab.yml, qui
//     décode la clé depuis les secrets GitHub dans $RUNNER_TEMP). Sans cette variable
//     (android-apk.yml, build local), rien ne change : la bêta reste signée avec android-debug.
//     Variables lues : ARKEN_PLAY_STORE_FILE, ARKEN_PLAY_STORE_PASSWORD, ARKEN_PLAY_KEY_ALIAS,
//     ARKEN_PLAY_KEY_PASSWORD. Aucun secret n'est écrit dans ce fichier ni dans android/.
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
// Clé d'importation Google Play : uniquement si le workflow android-aab.yml fournit les
// variables d'environnement (secrets GitHub). Jamais de secret dans ce fichier.
def arkenPlayStore = System.getenv("ARKEN_PLAY_STORE_FILE")
android {
    signingConfigs {
        arkenBeta {
            storeFile rootProject.file('../android-debug/arken-debug.keystore')
            storeType 'pkcs12'
            storePassword 'android'
            keyAlias 'arkendebug'
            keyPassword 'android'
        }
        if (arkenPlayStore) {
            arkenPlay {
                storeFile file(arkenPlayStore)
                storeType 'pkcs12'
                storePassword System.getenv("ARKEN_PLAY_STORE_PASSWORD")
                keyAlias System.getenv("ARKEN_PLAY_KEY_ALIAS")
                keyPassword System.getenv("ARKEN_PLAY_KEY_PASSWORD")
            }
        }
    }
    buildTypes {
        debug { signingConfig signingConfigs.arkenBeta }
        release { signingConfig(arkenPlayStore ? signingConfigs.arkenPlay : signingConfigs.arkenBeta) }
    }
}
`;
  writeFileSync(gradleFile, gradle);
}
console.log('android/ personnalisé : icônes, version, signature (bêta, ou « play » si ARKEN_PLAY_STORE_FILE est défini au build)');
