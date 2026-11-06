// V16 — traduction (français, anglais). Module PUR : ni DOM, ni stockage ; la langue courante est une simple variable,
// choisie par l'interface au démarrage (src/presentation/language.js). Sous Node (tests), la langue reste le français.
//
// Textes : src/i18n/fr.js et src/i18n/en.js (mêmes clés, vérifié par tests/i18n.test.js).
//  - t('cle', { n: 3, nom: 'Oroël' }) : remplace {nom} ; une valeur { one, other } est un PLURIEL choisi selon `n`
//    (français : 0 et 1 au singulier ; anglais : 1 seul au singulier) ;
//  - {x|de} : « de X » / « d’X » en français (élision), simple « X » ailleurs ; {n|num} : nombre avec séparateur de milliers ;
//  - tl('cle') : une LISTE de variantes (répliques des dirigeants) ;
//  - clé absente dans la langue : le français sert de secours ; absente partout : la clé elle-même (repérable).
import FR from './fr.js';
import EN from './en.js';

export const LANGUAGES = Object.freeze(['fr', 'en']);
export const DEFAULT_LANGUAGE = 'fr';
export const LANGUAGE_NAMES = Object.freeze({ fr: 'Français', en: 'English' });
const DICTS = { fr: FR, en: EN };
let current = DEFAULT_LANGUAGE;

export const getLanguage = () => current;
export const sanitizeLanguage = lang => LANGUAGES.includes(lang) ? lang : DEFAULT_LANGUAGE;
export function setLanguage(lang) { current = sanitizeLanguage(lang); return current; }
/** Exécute `fn` dans une langue donnée, puis revient à la langue courante (tests, rendu ponctuel). */
export function withLanguage(lang, fn) { const before = current; current = sanitizeLanguage(lang); try { return fn(); } finally { current = before; } }
/** Langue du téléphone : français si sa langue préférée est le français, anglais sinon. */
export function detectLanguage(preferred = []) {
  const first = (Array.isArray(preferred) ? preferred : [preferred]).find(x => typeof x === 'string' && x);
  return first ? (/^fr\b/i.test(first) ? 'fr' : 'en') : DEFAULT_LANGUAGE;
}

const raw = (key, lang = current) => { const d = DICTS[lang]; return d && Object.prototype.hasOwnProperty.call(d, key) ? d[key] : undefined; };
export const hasKey = (key, lang = current) => raw(key, lang) !== undefined;
const lookup = key => { const v = raw(key); return v !== undefined ? v : raw(key, DEFAULT_LANGUAGE); };

const VOWEL = /^[AEIOUYÉÈÊÎÏÔÖÛÜÀÂaeiouyéèêîïôöûüàâ]/;
/** Élision française : « de Valmorne », « d’Oroël », « d’Îlebrume » (pas d’élision devant un h : « de Haut-Bois »). */
export const deFr = name => VOWEL.test(String(name)) ? `d’${name}` : `de ${name}`;
/** Nombre lisible : « 2 100 » en français, « 2,100 » en anglais. */
export function num(n, lang = current) {
  const v = Number(n); if (!Number.isFinite(v)) return String(n ?? '');
  const s = String(Math.round(v) === v ? v : Math.round(v * 10) / 10).split('.');
  s[0] = s[0].replace(/\B(?=(\d{3})+(?!\d))/g, lang === 'fr' ? ' ' : ',');
  return s.join(lang === 'fr' ? ',' : '.');
}
const FILTERS = { de: v => current === 'fr' ? deFr(v) : String(v), num: v => num(v), lower: v => String(v).toLowerCase(), upper: v => String(v).toUpperCase() };
/** Choix du pluriel. */
export function pluralForm(n, lang = current) { const v = Math.abs(Number(n)); return (lang === 'fr' ? v < 2 : v === 1) ? 'one' : 'other'; }
/** Remplit un gabarit « … {nom} … {n|num} … » avec les paramètres. Un paramètre absent laisse le jeton visible. */
export function format(text, params = {}) {
  return String(text).replace(/\{(\w+)(?:\|(\w+))?\}/g, (m, name, filter) => {
    if (!(name in params) || params[name] === undefined || params[name] === null) return m;
    const v = params[name];
    return filter && FILTERS[filter] ? FILTERS[filter](v) : String(v);
  });
}
/** Texte traduit. */
export function t(key, params = {}) {
  let v = lookup(key);
  if (v === undefined) return key;
  if (v && typeof v === 'object' && !Array.isArray(v)) v = v[pluralForm(params.n ?? params.count ?? 2)] ?? v.other;
  if (Array.isArray(v)) v = v[0];
  return format(v, params);
}
/** Liste de variantes (répliques). Toujours un tableau (vide si la clé n'existe pas). */
export function tl(key, lang = current) {
  const v = raw(key, lang) ?? raw(key, DEFAULT_LANGUAGE);
  return Array.isArray(v) ? v : [];
}
/** Dictionnaires (tests). */
export const dictionaries = () => DICTS;
