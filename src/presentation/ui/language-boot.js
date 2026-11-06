// Interface — V16 : premier module chargé par app.js. Choisit la langue (préférence enregistrée, sinon celle du
// téléphone) et traduit les textes fixes de la page avant que le moindre écran ne soit construit.
import { initLanguage } from '../language.js';

initLanguage(globalThis.localStorage, globalThis.navigator, globalThis.document);
