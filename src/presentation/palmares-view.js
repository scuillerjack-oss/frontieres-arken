// V15.4 — Écran du palmarès et des titres, en HTML. Module pur, testable sous Node. Données : domain/palmares.js.
import { DIFFICULTY_IDS, difficultyLabel } from '../domain/difficulty.js';
import { TITLES, titleById } from '../domain/palmares.js';

const esc = text => String(text).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const rankFr = n => n === 1 ? '1re place' : `${n}e place`;
const row = (label, value) => `<div class="unit-row"><span>${esc(label)}</span><b>${esc(value)}</b></div>`;

export function palmaresHtml(palmares, nations) {
  const p = palmares, short = id => nations.find(n => n.id === id)?.short || '';
  const owned = TITLES.filter(t => p.titles.includes(t.id)), hidden = TITLES.length - owned.length;
  const fast = p.fastestWin ? `Tour ${p.fastestWin.turn}${short(p.fastestWin.nationId) ? ` · ${short(p.fastestWin.nationId)}` : ''}` : '—';
  const lengths = Object.keys(p.gamesByLength).map(Number).sort((a, b) => b - a).filter(k => p.gamesByLength[k]).map(k => `${p.gamesByLength[k]} en ${k} tours`).join(' · ');
  return `<div class="palmares-block">${row('Parties terminées', p.games)}${lengths ? `<small class="palmares-note">${esc(lengths)}</small>` : ''}${row('Victoires', p.wins)}\
${row('Meilleur classement', p.bestRank ? rankFr(p.bestRank) : '—')}${row('Plus rapide victoire', fast)}</div>\
<h3 class="palmares-head">Victoires par nation</h3><div class="palmares-block">${nations.map(n => row(n.short, p.winsByNation[n.id] || 0)).join('')}</div>\
<h3 class="palmares-head">Victoires par niveau</h3><div class="palmares-block">${DIFFICULTY_IDS.map(id => row(difficultyLabel(id), p.winsByDifficulty[id] || 0)).join('')}</div>\
<h3 class="palmares-head">Titres</h3>${owned.length ? `<ul class="palmares-titles">${owned.map(t => `<li><b>${esc(t.name)}</b><small>${esc(t.text)}</small></li>`).join('')}</ul>` : '<p class="palmares-note">Aucun titre pour l’instant.</p>'}\
${hidden ? `<p class="palmares-note">${hidden} ${hidden > 1 ? 'titres restent' : 'titre reste'} à découvrir.</p>` : '<p class="palmares-note">Tous les titres sont découverts.</p>'}\
<p class="palmares-note">Les titres sont des souvenirs : ils ne changent rien au jeu.</p>`;
}
/** Titres obtenus par la partie qui vient de finir, pour l'écran de fin. */
export function endTitlesHtml(ids) {
  const list = (ids || []).map(titleById).filter(Boolean);
  return list.length ? `<section class="end-section end-titles"><h3>${list.length > 1 ? 'Titres obtenus' : 'Titre obtenu'}</h3><ul>${list.map(t => `<li><b>${esc(t.name)}</b> ${esc(t.text)}</li>`).join('')}</ul></section>` : '';
}
