// V16 — garde-fou de la deuxième langue (anglais). Le plus important pour Jack : à chaque version, le français et
// l'anglais restent cohérents. Ce test échoue si :
//  1. une clé existe dans une langue et pas dans l'autre (fr.js / en.js et chacune de leurs parties) ;
//  2. les variables {x} d'un texte diffèrent entre le français et l'anglais (ou les formes d'un pluriel) ;
//  3. une liste de répliques n'a pas le même nombre de variantes dans les deux langues ;
//  4. une chaîne française écrite en dur réapparaît dans le code du jeu (hors src/i18n/) ou dans index.html ;
//  5. le moteur de traduction ou un dictionnaire touche au DOM (src/i18n/ doit rester pur, testable sous Node).
// Règle (CLAUDE.md) : tout texte ajouté ou modifié l'est dans src/i18n/fr/… ET src/i18n/en/…, dans la même version.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import FR, { PARTS as FR_PARTS } from '../src/i18n/fr.js';
import EN, { PARTS as EN_PARTS } from '../src/i18n/en.js';
import { t, tl, setLanguage, withLanguage, detectLanguage, pluralForm, format, num, LANGUAGES } from '../src/i18n/i18n.js';
import { frenchStrings } from './helpers/french-scan.js';
import { I18N_MODULES, root } from './helpers/sources.js';

const tokens = s => (String(s).match(/\{\w+(?:\|\w+)?\}/g) || []).map(x => x.replace(/\|\w+\}/, '}')).sort();
const forms = v => Array.isArray(v) ? v : v && typeof v === 'object' ? Object.values(v) : [v];

test('i18n : mêmes parties et mêmes clés en français et en anglais', () => {
  assert.deepEqual(Object.keys(EN_PARTS), Object.keys(FR_PARTS));
  for (const part of Object.keys(FR_PARTS)) {
    const fr = Object.keys(FR_PARTS[part]), en = Object.keys(EN_PARTS[part]);
    assert.deepEqual(fr.filter(k => !en.includes(k)), [], `${part} : clés absentes en anglais`);
    assert.deepEqual(en.filter(k => !fr.includes(k)), [], `${part} : clés absentes en français`);
  }
  assert.equal(Object.keys(EN).length, Object.keys(FR).length);
  // Une clé n'est définie que dans une seule partie (sinon l'une écraserait l'autre en silence).
  const seen = new Map();
  for (const [part, dict] of Object.entries(FR_PARTS)) for (const k of Object.keys(dict)) { assert.ok(!seen.has(k), `${k} : dans ${seen.get(k)} et ${part}`); seen.set(k, part); }
});

test('i18n : mêmes variables {x}, même forme (texte, pluriel ou liste) et même nombre de variantes', () => {
  for (const [k, fr] of Object.entries(FR)) {
    const en = EN[k];
    assert.equal(Array.isArray(en), Array.isArray(fr), `${k} : liste dans une seule langue`);
    assert.equal(typeof en, typeof fr, `${k} : forme différente`);
    if (Array.isArray(fr)) {
      assert.equal(en.length, fr.length, `${k} : ${fr.length} variantes en français, ${en.length} en anglais`);
      fr.forEach((line, i) => assert.deepEqual(tokens(en[i]), tokens(line), `${k}[${i}] : variables différentes`));
      assert.equal(new Set(en).size, en.length, `${k} : variante anglaise en double`);
    } else if (fr && typeof fr === 'object') {
      assert.deepEqual(Object.keys(en).sort(), Object.keys(fr).sort(), `${k} : formes du pluriel`);
      const all = new Set(forms(fr).flatMap(tokens));
      for (const f of forms(en)) for (const x of tokens(f)) assert.ok(all.has(x), `${k} : variable ${x} inconnue en français`);
      for (const x of all) assert.ok(forms(en).some(f => tokens(f).includes(x)) || x === '{n}', `${k} : variable ${x} absente en anglais`);
    } else assert.deepEqual(tokens(en), tokens(fr), `${k} : variables différentes (« ${fr} » / « ${en} »)`);
  }
});

test('i18n : aucun texte vide, aucun texte anglais resté en français (accents hors noms propres)', () => {
  const PROPER = /FRONTIÈRES|Roc-Épine|Oroël|Grèsrouge|Cornérive|Nordhème|Îlebrume|Tréfond|Valdoré|Lunémont|Français|Langue|LANGUE/g;
  for (const [k, v] of Object.entries(EN)) for (const f of forms(v)) {
    assert.ok(String(f).trim(), `${k} : texte vide`);
    assert.doesNotMatch(String(f).replace(PROPER, ''), /[àâçéèêëîïôûùœ«»]|\s[?!:;](\s|$)/, `${k} : « ${f} »`);
  }
  for (const [k, v] of Object.entries(FR)) for (const f of forms(v)) assert.ok(String(f).trim(), `${k} : texte vide`);
});

// Fichiers du jeu inspectés : tout le JavaScript servi, hors traductions. Liste blanche raisonnable : les identifiants
// écrits en français se marquent d'un commentaire « i18n-id » sur leur ligne (rangés dans les sauvegardes, jamais affichés).
const walk = dir => readdirSync(join(root, dir)).flatMap(f => { const p = `${dir}/${f}`; return statSync(join(root, p)).isDirectory() ? walk(p) : [p]; });
const GAME_FILES = ['app.js', 'update-check.js', 'sw.js', ...walk('src').filter(f => f.endsWith('.js') && !f.startsWith('src/i18n/'))];
// Carte : noms propres et identifiants (données générées), et ancienne carte V6 (jamais affichée, sauvegardes refusées).
const NOT_TEXT = new Set(['src/map/arken-v9-data.js', 'src/map/arken-v1-map.js']);

test('i18n : aucune chaîne française écrite en dur dans le code du jeu (tout passe par src/i18n/)', () => {
  const found = [];
  for (const f of GAME_FILES.filter(f => !NOT_TEXT.has(f))) for (const s of frenchStrings(readFileSync(join(root, f), 'utf8'))) found.push(`${f}:${s.line} « ${s.text.slice(0, 80)} »`);
  assert.deepEqual(found, [], `${found.length} chaînes françaises en dur :\n${found.join('\n')}`);
});

test('i18n : index.html et offline.html sans texte français en dur (attributs data-i18n)', () => {
  for (const f of ['index.html', 'offline.html']) {
    // Le texte français reste dans la page (affiché avant le démarrage du script) : seul compte qu'il porte sa clé.
    const html = readFileSync(join(root, f), 'utf8').replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '')
      .replace(/(<(\w+)[^>]*\sdata-i18n(?:-html)?="[^"]+"[^>]*>)[\s\S]*?<\/\2>/g, '$1</$2>')
      .replace(/\saria-label="[^"]*"(?=[^>]*data-i18n-aria=)/g, '').replace(/(data-i18n-aria="[^"]*"[^>]*?)\saria-label="[^"]*"/g, '$1');
    const texts = [...html.matchAll(/>([^<>]+)</g)].map(m => m[1].trim()).filter(x => /[A-Za-zÀ-ÿ]{3,}/.test(x));
    const attrs = [...html.matchAll(/\s(?:aria-label|content|title|alt|placeholder)="([^"]+)"/g)].map(m => m[1]).filter(x => /[A-Za-zÀ-ÿ]{3,}\s/.test(x) || /[À-ÿ]/.test(x));
    const PROPER = /^(FRONTIÈRES|ARKEN|FRONTIÈRES: ARKEN|Valmorne|ARKEN · |__VERSION__)$/;
    // Traduits par id (balisage figé par des tests plus anciens et par le build Google Play) : src/presentation/language.js (BY_ID).
    const BY_ID_FR = ['🗺 Voir toute la carte', '🎓 Jouer le tutoriel', 'Choix de confidentialité des publicités', 'Relancer le mini tuto', 'Passer', 'VERSION BÊTA'];
    const left = [...texts, ...attrs].filter(x => !BY_ID_FR.includes(x)).filter(x => !PROPER.test(x) && !/^[\s✦×?⚙☷✉»−◎+🗺🎓_A-Z0-9.:·v]+$/.test(x));
    assert.deepEqual(left, [], `${f} : textes à traduire (data-i18n) : ${left.join(' | ')}`);
  }
});

test('i18n : moteur et dictionnaires purs (ni DOM, ni stockage, ni hasard), présents hors ligne', () => {
  const sw = readFileSync(join(root, 'sw.js'), 'utf8');
  const present = walk('src/i18n').filter(f => f.endsWith('.js')).sort();
  assert.deepEqual([...I18N_MODULES].sort(), present, 'tests/helpers/sources.js : I18N_MODULES à tenir à jour');
  for (const f of I18N_MODULES) {
    const code = readFileSync(join(root, f), 'utf8').replace(/\/\/.*$/gm, '');
    assert.doesNotMatch(code, /\bdocument\b|\bwindow\b|localStorage|navigator|Math\.random|Date\.now/, f);
    assert.ok(sw.includes(`'./${f}'`), `${f} absent de ASSETS (sw.js)`);
  }
});

test('i18n : t() — variables, pluriels, secours en français, clé inconnue visible', () => {
  assert.deepEqual(LANGUAGES, ['fr', 'en']);
  withLanguage('fr', () => {
    assert.equal(t('common.turns', { n: 1 }), '1 tour'); assert.equal(t('common.turns', { n: 0 }), '0 tour'); assert.equal(t('common.turns', { n: 3 }), '3 tours');
    assert.equal(t('common.gold', { n: 2100 }), '2 100 or');
  });
  withLanguage('en', () => {
    assert.equal(t('common.turns', { n: 1 }), '1 turn'); assert.equal(t('common.turns', { n: 0 }), '0 turns');
    assert.equal(t('common.gold', { n: 2100 }), '2,100 gold');
    assert.equal(t('cle.inconnue.v16'), 'cle.inconnue.v16');
  });
  assert.equal(pluralForm(1, 'fr'), 'one'); assert.equal(pluralForm(0, 'en'), 'other');
  assert.equal(format('{a} et {b}', { a: 1 }), '1 et {b}', 'une variable oubliée reste visible');
  assert.equal(num(1234567, 'fr'), '1 234 567'); assert.equal(num(1234567, 'en'), '1,234,567');
  assert.equal(withLanguage('fr', () => format('{p|de}', { p: 'Oroël' })), 'd’Oroël');
  assert.equal(withLanguage('en', () => format('{p|de}', { p: 'Oroël' })), 'Oroël');
  assert.ok(tl('talk.war.hostile', 'en').length >= 18);
});

test('i18n : langue du téléphone au premier lancement (français si le téléphone est en français, anglais sinon)', () => {
  assert.equal(detectLanguage(['fr-FR', 'en-US']), 'fr');
  assert.equal(detectLanguage(['fr-CA']), 'fr');
  assert.equal(detectLanguage(['en-GB']), 'en');
  assert.equal(detectLanguage(['de-DE', 'fr-FR']), 'en', 'la langue préférée compte');
  assert.equal(detectLanguage([]), 'fr', 'langue inconnue : français (langue de référence)');
  setLanguage('fr');
});
