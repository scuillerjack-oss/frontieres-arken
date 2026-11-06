// Interface — V16 : fenêtre « Langue / Language » (accueil et Paramètres). Changer de langue réécrit les textes fixes,
// puis redessine l'écran en cours. La partie en cours n'est ni modifiée ni réenregistrée : elle ne range que des
// identifiants et des textes de référence ; le journal et les échanges se réaffichent dans la nouvelle langue.
import { LANGUAGES, LANGUAGE_NAMES, getLanguage } from '../../i18n/i18n.js';
import { changeLanguage } from '../language.js';
import { $ } from './base.js';

const listeners = [];
/** Un écran qui doit se redessiner après un changement de langue s'inscrit ici. */
export const onLanguageChange = fn => listeners.push(fn);
export function openLanguage() {
  const paint = () => {
    $('#languageChoices').innerHTML = LANGUAGES.map(l => `<button type="button" data-lang="${l}" aria-pressed="${l === getLanguage()}" lang="${l}">${LANGUAGE_NAMES[l]}</button>`).join('');
    document.querySelectorAll('[data-lang]').forEach(b => b.onclick = () => { changeLanguage(b.dataset.lang); paint(); for (const fn of listeners) try { fn(); } catch { /* un écran fermé */ } });
  };
  paint();
  $('#languageDialog').showModal();
}
