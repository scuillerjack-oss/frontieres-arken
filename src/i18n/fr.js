// V16 — dictionnaire FRANÇAIS (langue de référence et de secours). Assemblé à partir des parties de src/i18n/fr/.
// Règle (CLAUDE.md) : tout texte ajouté ou modifié l'est dans fr ET en, dans la même version ; tests/i18n.test.js le vérifie.
import core from './fr/core.js';
import engine from './fr/engine.js';
import domain from './fr/domain.js';
import uiA from './fr/ui-a.js';
import uiB from './fr/ui-b.js';
import views from './fr/views.js';
import talkA from './fr/talk-a.js';
import talkB from './fr/talk-b.js';
import talkC from './fr/talk-c.js';
import talkD from './fr/talk-d.js';
import talkE from './fr/talk-e.js';
import talkF from './fr/talk-f.js';

export const PARTS = Object.freeze({ core, engine, domain, uiA, uiB, views, talkA, talkB, talkC, talkD, talkE, talkF });
export default Object.freeze(Object.assign({}, ...Object.values(PARTS)));
