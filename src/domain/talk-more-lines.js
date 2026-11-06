// V14.2 (retour de Jack : « plus de phrases variées ») — chaque liste de répliques a reçu autant de nouvelles variantes
// qu'elle en avait : la seconde moitié de chaque liste. V16 : les répliques vivent dans src/i18n/{fr,en}/talk-*.js ;
// ce module n'est plus qu'une VUE (seconde moitié des listes françaises), gardée pour le test de la V14.2.
// Clé = chemin de la liste dans talk.js (« war.hostile », « reply.amical.neutre », « archetype.heros.amical »…).
import { dictionaries } from '../i18n/i18n.js';

const half = (prefix, strip) => Object.freeze(Object.fromEntries(Object.entries(dictionaries().fr)
  .filter(([k, v]) => k.startsWith(prefix) && Array.isArray(v)).map(([k, v]) => [k.slice(strip.length), Object.freeze(v.slice(v.length / 2))])));
export const MORE_LINES = half('talk.', 'talk.');
