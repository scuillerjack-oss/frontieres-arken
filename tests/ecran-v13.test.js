// V13 — écran : la carte était coupée à droite sur un téléphone de 393 px (la barre du haut élargissait la
// grille du jeu de 11 px). Garde-fous CSS ; le contrôle réel est fait dans Chromium mobile (Playwright).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../v5.css', import.meta.url), 'utf8');

test('V13 : la grille du jeu ne peut pas dépasser la largeur de l\'écran', () => {
  assert.match(css, /#gameScreen:not\(\[hidden\]\)\{grid-template-columns:minmax\(0,1fr\)\}/);
  assert.match(css, /\.hud,nav\.bottom-bar,\.map-shell\{min-width:0;max-width:100vw\}/);
});

test('V13 : sous 420 px, le bouton d\'accueil (avec la version) reste visible mais se compacte', () => {
  const rule = css.match(/@media\(max-width:420px\)\{(.*)\}\s*$/m)?.[1] || '';
  assert.ok(rule.includes('.brand{flex:1 1 0;min-width:0;overflow:hidden}'));
  assert.ok(!/\.brand\{display:none\}/.test(rule), 'la version ne doit pas disparaître sur un écran de 393 px');
});

test('V13 : le liseré bleu de mon territoire est plus épais (28 px au lieu de 16)', () => {
  const rules = [...css.matchAll(/\.territory\.player\{([^}]*)\}/g)].map(m => m[1]);
  assert.match(rules.at(-1), /stroke-width:calc\(28px \* var\(--line,1\)\)/);
});

test('V13 : les boutons de la fiche (Déplacer, Recruter, Construire) tiennent dans 393 px sans être coupés', () => {
  // Bêta V13 vérifiée dans Chrome mobile : « Construire » dépassait de 3 px et apparaissait tronqué à droite.
  assert.ok(css.includes('#sheetActions button{flex:1 1 auto;min-width:0;padding:10px 8px}'));
});
