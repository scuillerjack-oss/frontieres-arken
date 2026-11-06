// V14.2 (retour de Jack : « plus de phrases variées ») — chaque liste de réponses aux demandes d'aide a reçu autant de
// nouvelles variantes qu'elle en avait : la seconde moitié de chaque liste. V16 : les réponses vivent dans
// src/i18n/{fr,en}/talk-*.js ; ce module n'est plus qu'une VUE (seconde moitié des listes françaises), pour le test V14.2.
// Clé = chemin dans HELP_LINES (alliances.js) : « heros.defend.yes », « allyOfTarget »…
import { dictionaries } from '../i18n/i18n.js';

export const MORE_HELP_LINES = Object.freeze(Object.fromEntries(Object.entries(dictionaries().fr)
  .filter(([k, v]) => k.startsWith('help.') && Array.isArray(v)).map(([k, v]) => [k.slice(5), Object.freeze(v.slice(v.length / 2))])));
