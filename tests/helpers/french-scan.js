// V16 — repère les chaînes françaises écrites en dur dans le code de jeu (hors commentaires).
// Lexeur JavaScript minimal : commentaires, chaînes '…' "…", gabarits `…${…}…` et expressions régulières.
// Utilisé par tests/i18n.test.js : tout texte visible doit vivre dans src/i18n/fr.js et src/i18n/en.js.

const ACCENTS = /[àâçéèêëîïôûùüÿœæÀÂÇÉÈÊËÎÏÔÛÙÜŸŒÆ’«»]/;
// Mots français courants (mots entiers, insensible à la casse) : une phrase sans accent est aussi repérée.
const WORDS = /\b(le|la|les|des|du|une|est|sont|vous|votre|vos|nous|notre|nos|pour|avec|sans|dans|sur|pas|plus|tour|tours|partie|armée|province|provinces|nation|guerre|alliance|trêve|or|annuler|fermer|retour|suivant|oui|non|aucun|aucune|attaque|défense|unités|ici|chez|mais|ou|et|qui|que|quand|tout|tous|toute|cette|ces|ce|son|sa|ses|leur|leurs|il|elle|ils|elles|on|je|tu|ton|ta|tes|mon|ma|mes)\b/gi;

/** Découpe un source JS en jetons texte : [{ kind: 'string' | 'template', text, line }]. */
export function stringLiterals(src) {
  const out = []; let i = 0, line = 1; const n = src.length;
  let prev = ''; // dernier caractère significatif (pour distinguer division et expression régulière)
  const regexAllowed = () => !prev || /[(,=:[!&|?{};+\-*%<>~^]/.test(prev) || /\b(return|typeof|case|in|of|delete|void|throw|new|else|do)$/.test(src.slice(Math.max(0, i - 8), i).trimEnd());
  const stack = []; // profondeur d'accolades dans les gabarits
  function readTemplate() { // i pointe après le `
    let text = '', start = line;
    while (i < n) {
      const c = src[i];
      if (c === '\\') { text += src.slice(i, i + 2); i += 2; continue; }
      if (c === '`') { i++; out.push({ kind: 'template', text, line: start }); return; }
      if (c === '$' && src[i + 1] === '{') { out.push({ kind: 'template', text, line: start }); text = ''; i += 2; stack.push(0); readCode(true); continue; }
      if (c === '\n') line++;
      text += c; i++;
    }
  }
  function readCode(inTemplate) {
    while (i < n) {
      const c = src[i], d = src[i + 1];
      if (c === '\n') { line++; i++; continue; }
      if (/\s/.test(c)) { i++; continue; }
      if (c === '/' && d === '/') { while (i < n && src[i] !== '\n') i++; continue; }
      if (c === '/' && d === '*') { i += 2; while (i < n && !(src[i] === '*' && src[i + 1] === '/')) { if (src[i] === '\n') line++; i++; } i += 2; continue; }
      if (c === '\'' || c === '"') {
        let j = i + 1, text = '';
        while (j < n && src[j] !== c) { if (src[j] === '\\') { text += src.slice(j, j + 2); j += 2; continue; } if (src[j] === '\n') break; text += src[j]; j++; }
        out.push({ kind: 'string', text, line }); i = j + 1; prev = 'a'; continue;
      }
      if (c === '`') { i++; readTemplate(); prev = 'a'; continue; }
      if (c === '/' && regexAllowed()) { // expression régulière
        let j = i + 1, cls = false;
        while (j < n && src[j] !== '\n') { const x = src[j]; if (x === '\\') { j += 2; continue; } if (x === '[') cls = true; else if (x === ']') cls = false; else if (x === '/' && !cls) break; j++; }
        j++; while (/[a-z]/i.test(src[j] || '')) j++;
        i = j; prev = 'a'; continue;
      }
      if (inTemplate) {
        if (c === '{') stack[stack.length - 1]++;
        if (c === '}') { if (stack[stack.length - 1] === 0) { stack.pop(); i++; return; } stack[stack.length - 1]--; }
      }
      prev = c; i++;
    }
  }
  readCode(false);
  return out;
}

// Noms propres du jeu (identiques dans toutes les langues) : ils ne rendent pas une chaîne « française ».
export const PROPER_NOUNS = Object.freeze(['FRONTIÈRES', 'Roc-Épine', 'Oroël', 'Grèsrouge', 'Cornérive', 'Nordhème', 'Îlebrume', 'Tréfond', 'Valdoré', 'Lunémont']);
/** La chaîne ressemble-t-elle à du français visible ? (accent, ou au moins deux mots français courants). */
export function looksFrench(text) {
  let plain = text.replace(/<[^>]*>/g, ' ').replace(/\$\{[^}]*\}/g, ' ');
  for (const n of PROPER_NOUNS) plain = plain.split(n).join(' ');
  if (ACCENTS.test(plain)) return true;
  const words = plain.match(WORDS) || [];
  return words.length >= 2 && /\s/.test(plain.trim());
}

/**
 * Chaînes françaises d'un source : [{ line, text }]. Une ligne terminée par le commentaire « i18n-id » est exemptée :
 * elle porte un IDENTIFIANT écrit en français (rangé dans les sauvegardes ou comparé par le code, jamais affiché tel quel).
 */
export function frenchStrings(src) {
  const exempt = new Set(src.split('\n').map((l, i) => /\/\/.*\bi18n-id\b/.test(l) ? i + 1 : 0).filter(Boolean));
  return stringLiterals(src).filter(s => looksFrench(s.text) && !exempt.has(s.line)).map(s => ({ line: s.line, text: s.text }));
}
