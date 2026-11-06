// V16 — choix de la langue (interface). Préférence rangée dans SA clé localStorage `frontieres-arken-langue`, séparée de
// la sauvegarde de partie (`frontieres-arken-v2-save`) et du profil : changer de langue ne touche jamais à la partie.
// Premier lancement : langue du téléphone (français si le téléphone est en français, anglais sinon).
// Textes fixes de index.html : attributs data-i18n (texte), data-i18n-html (texte avec balises <b>…), data-i18n-aria
// (aria-label), data-i18n-title (title) ; ils sont réécrits par applyStaticTexts à chaque changement de langue.
import { LANGUAGES, detectLanguage, getLanguage, sanitizeLanguage, setLanguage, t } from '../i18n/i18n.js';

export const LANGUAGE_KEY = 'frontieres-arken-langue';

/** Langue enregistrée, sinon celle du téléphone. Stockage illisible ou bloqué : langue du téléphone (rien ne casse). */
export function loadLanguage(storage = globalThis.localStorage, nav = globalThis.navigator) {
  try { const saved = storage?.getItem(LANGUAGE_KEY); if (LANGUAGES.includes(saved)) return saved; } catch { /* navigation privée */ }
  return detectLanguage(nav?.languages?.length ? [...nav.languages] : [nav?.language].filter(Boolean));
}
export function saveLanguage(lang, storage = globalThis.localStorage) {
  try { storage?.setItem(LANGUAGE_KEY, sanitizeLanguage(lang)); return true; } catch { return false; }
}
// Éléments dont le balisage d'origine est figé (tests des versions précédentes, build Google Play) : traduits par id.
// `icon` = préfixe gardé devant le texte. La mention bêta : « VERSION BÊTA » (PWA, APK) ou « VERSION » (Google Play).
export const BY_ID = Object.freeze({ wholeMapBtn: ['map.whole', '🗺 '], replayTutorial: ['settings.tutorial', '🎓 '], adsPrivacy: ['settings.adsPrivacy', ''],
  replayMiniTuto: ['settings.miniTuto', ''], miniTutoSkip: ['common.skip', ''] });
function translateVersionTag(doc) {
  const tag = doc.querySelector('.version-tag'), first = tag?.firstChild;
  if (!first || first.nodeType !== 3) return;
  tag.dataset.beta ??= String(/BÊTA|BETA/.test(first.nodeValue));
  first.nodeValue = `${t(tag.dataset.beta === 'true' ? 'welcome.beta' : 'welcome.version')} `;
}
/** Réécrit les textes fixes de la page dans la langue courante. */
export function applyStaticTexts(doc = globalThis.document) {
  if (!doc) return;
  doc.documentElement.lang = getLanguage();
  for (const [id, [key, icon]] of Object.entries(BY_ID)) { const el = doc.getElementById(id); if (el) el.textContent = `${icon}${t(key)}`; }
  translateVersionTag(doc);
  for (const el of doc.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);
  for (const el of doc.querySelectorAll('[data-i18n-html]')) el.innerHTML = t(el.dataset.i18nHtml);
  for (const el of doc.querySelectorAll('[data-i18n-aria]')) el.setAttribute('aria-label', t(el.dataset.i18nAria));
  for (const el of doc.querySelectorAll('[data-i18n-title]')) el.setAttribute('title', t(el.dataset.i18nTitle));
  if (doc.title !== undefined) doc.title = t('page.title');
  doc.querySelector('meta[name="description"]')?.setAttribute('content', t('page.description'));
}
/** Démarrage : choisit la langue et l'applique à la page. */
export function initLanguage(storage, nav, doc) {
  setLanguage(loadLanguage(storage, nav));
  applyStaticTexts(doc);
  return getLanguage();
}
/** Changement par le joueur : enregistre, applique. La partie en cours n'est pas modifiée (elle ne range que des identifiants). */
export function changeLanguage(lang, storage, doc) {
  setLanguage(lang); saveLanguage(getLanguage(), storage); applyStaticTexts(doc);
  return getLanguage();
}
