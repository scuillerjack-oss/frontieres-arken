// V15.0 : app.js et game-engine.js sont découpés en modules. Les tests qui inspectent le code source lisent donc
// l'ENSEMBLE des morceaux, dans l'ordre logique : une règle vérifiée sur « app.js » reste vérifiée sur toute l'interface.
// Un nouveau fichier oublié dans ces listes fait échouer les tests : aucun morceau ne peut échapper à l'inspection.
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const UI = ['base', 'session', 'tutorials', 'map-view', 'province-sheet', 'diplomacy-screen', 'event-popups', 'talk-screen',
  'turn-flow', 'turn-anim', 'audio', 'boosts-ui', 'game-flow', 'balloon-ui', 'live-ui', 'realtime-ui', 'food-ui', 'realtime-battles-ui', 'map-units-layer', 'ad-ui', 'premium-ui'];
const ENGINE = ['shared', 'income', 'sea-routes', 'orders', 'diplomacy', 'battles', 'production', 'convoys', 'bombard', 'recovery',
  'ai-naval', 'ai', 'ai-help', 'coalition', 'journal', 'turn', 'balloons', 'ai-island'];
// V17.1 : moteur du temps réel (src/domain/realtime/), lu avec le moteur (mêmes règles de pureté).
export const REALTIME = Object.freeze(['rules', 'clock', 'marches', 'day', 'create', 'food', 'battles', 'ai-schedule']); // V17.2 : battles ; V17.5 : ai-schedule

/** V15.3 : modules du domaine ajoutés hors de engine/ (lus par tests/v15-3.test.js, qui vérifie qu'ils restent purs). */
export const DOMAIN_MODULES_V15_3 = Object.freeze(['src/domain/difficulty.js', 'src/domain/nations.js']);

/** V15.4 : nouveaux modules du domaine, lus par tests/v15-4.test.js (purs, sans date). */
export const DOMAIN_MODULES_V15_4 = Object.freeze(['src/domain/game-length.js', 'src/domain/palmares.js']);

/** V16.2 : nouveau module du domaine hors de engine/ (île mystérieuse), lu par tests/v16-2.test.js (pur). */
export const DOMAIN_MODULES_V16_2 = Object.freeze(['src/domain/mystery-island.js']);

/** V17.6 : module de présentation pur de la carte « façon AM 3 » (lu par tests/v17-6.test.js : sans DOM, en cache hors ligne). */
export const PRESENTATION_MODULES_V17_6 = Object.freeze(['src/presentation/map-am3-view.js']);

/** V17.4 : module de présentation pur de la nourriture (lu par tests/v17-4.test.js : sans DOM, en cache hors ligne). */
export const PRESENTATION_MODULES_V17_4 = Object.freeze(['src/presentation/food-view.js']);

/** V17.3 : module de présentation pur du temps réel (lu par tests/v17-3.test.js : sans DOM, en cache hors ligne). */
export const PRESENTATION_MODULES_V17_3 = Object.freeze(['src/presentation/realtime-view.js', 'src/presentation/realtime-clock.js']);

function group(dir, names, first) {
  const present = readdirSync(join(root, dir)).filter(f => f.endsWith('.js')).map(f => f.slice(0, -3)).sort();
  if (present.join() !== [...names].sort().join()) throw new Error(`${dir} : liste à tenir à jour dans tests/helpers/sources.js`);
  return [first, ...names.map(n => `${dir}/${n}.js`)];
}
export const appFiles = () => group('src/presentation/ui', UI, 'app.js');
export const engineFiles = () => [...group('src/domain/engine', ENGINE, 'src/domain/game-engine.js'), ...group('src/domain/realtime', REALTIME, null).slice(1)];
export const realtimeFiles = () => group('src/domain/realtime', REALTIME, null).slice(1);
const raw = p => readFileSync(join(root, p), 'utf8');

/** Comme lire le fichier, mais « app.js » et « game-engine.js » donnent tout le code de l'interface / du moteur. */
export function readSource(p) {
  const files = p === 'app.js' ? appFiles() : p === 'src/domain/game-engine.js' ? engineFiles() : [p];
  return files.map(raw).join('\n');
}

/** Même code, sans les retours à la ligne de mise en forme : pour vérifier un enchaînement exact quelle que soit la coupure. */
export const flatSource = p => readSource(p).replace(/\\\n/g, '').replace(/\n\s*/g, '');
