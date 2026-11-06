// V16 — dictionnaire ANGLAIS. Assemblé à partir des parties de src/i18n/en/.
// Règle (CLAUDE.md) : tout texte ajouté ou modifié l'est dans fr ET en, dans la même version ; tests/i18n.test.js le vérifie.
import core from './en/core.js';
import engine from './en/engine.js';
import domain from './en/domain.js';
import uiA from './en/ui-a.js';
import uiB from './en/ui-b.js';
import journal from './en/journal.js';
import sheet from './en/sheet.js';
import diplo from './en/diplo.js';
import tuto from './en/tuto.js';
import talkA from './en/talk-a.js';
import talkB from './en/talk-b.js';
import talkC from './en/talk-c.js';
import talkD from './en/talk-d.js';
import talkE from './en/talk-e.js';
import talkF from './en/talk-f.js';

export const PARTS = Object.freeze({ core, engine, domain, journal, uiA, uiB, sheet, diplo, tuto, talkA, talkB, talkC, talkD, talkE, talkF });
export default Object.freeze(Object.assign({}, ...Object.values(PARTS)));
