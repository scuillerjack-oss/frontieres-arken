// V15.0 : app.js et game-engine.js sont découpés en modules. Les tests qui inspectent le code source lisent donc
// l'ENSEMBLE des morceaux, dans l'ordre logique : une règle vérifiée sur « app.js » reste vérifiée sur toute l'interface.
// Un nouveau fichier oublié dans ces listes fait échouer les tests : aucun morceau ne peut échapper à l'inspection.
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const UI = ['base', 'language-boot', 'language-ui', 'session', 'tutorials', 'map-view', 'province-sheet', 'diplomacy-screen', 'event-popups', 'talk-screen',
  'turn-flow', 'turn-anim', 'audio', 'boosts-ui', 'game-flow'];
const ENGINE = ['shared', 'income', 'sea-routes', 'orders', 'diplomacy', 'battles', 'production', 'convoys', 'bombard', 'recovery',
  'ai-naval', 'ai', 'ai-help', 'coalition', 'journal', 'turn'];

/** V15.3 : modules du domaine ajoutés hors de engine/ (lus par tests/v15-3.test.js, qui vérifie qu'ils restent purs). */
export const DOMAIN_MODULES_V15_3 = Object.freeze(['src/domain/difficulty.js', 'src/domain/nations.js']);

/** V15.4 : nouveaux modules du domaine, lus par tests/v15-4.test.js (purs, sans date). */
export const DOMAIN_MODULES_V15_4 = Object.freeze(['src/domain/game-length.js', 'src/domain/palmares.js']);

/** V16 : modules de traduction (purs) : moteur, dictionnaires assemblés et leurs parties. Lus par tests/i18n.test.js. */
export const I18N_MODULES = Object.freeze(['src/i18n/i18n.js', 'src/i18n/fr.js', 'src/i18n/en.js',
  ...['core', 'engine', 'domain', 'ui-a', 'ui-b', 'views', 'tuto', 'talk-a', 'talk-b', 'talk-c', 'talk-d', 'talk-e', 'talk-f'].flatMap(p => [`src/i18n/fr/${p}.js`, `src/i18n/en/${p}.js`])]);

function group(dir, names, first) {
  const present = readdirSync(join(root, dir)).filter(f => f.endsWith('.js')).map(f => f.slice(0, -3)).sort();
  if (present.join() !== [...names].sort().join()) throw new Error(`${dir} : liste à tenir à jour dans tests/helpers/sources.js`);
  return [first, ...names.map(n => `${dir}/${n}.js`)];
}
export const appFiles = () => group('src/presentation/ui', UI, 'app.js');
export const engineFiles = () => group('src/domain/engine', ENGINE, 'src/domain/game-engine.js');
const raw = p => readFileSync(join(root, p), 'utf8');

// V16 : les textes affichés vivent dans src/i18n/fr/… (et en/…). Les tests plus anciens qui vérifient qu'un texte
// français est bien présent dans « app.js » ou dans le moteur lisent donc aussi les dictionnaires français.
const FR_TEXTS = ['core', 'engine', 'domain', 'ui-a', 'ui-b', 'views', 'tuto'].map(n => `src/i18n/fr/${n}.js`);
/** Comme lire le fichier, mais « app.js » et « game-engine.js » donnent tout le code de l'interface / du moteur (et leurs textes). */
export function readSource(p) {
  const files = p === 'app.js' ? [...appFiles(), ...FR_TEXTS] : p === 'src/domain/game-engine.js' ? [...engineFiles(), ...FR_TEXTS] : [p];
  return files.map(raw).join('\n');
}

/** Même code, sans les retours à la ligne de mise en forme : pour vérifier un enchaînement exact quelle que soit la coupure. */
export const flatSource = p => readSource(p).replace(/\\\n/g, '').replace(/\n\s*/g, '');
