// V15.4 — Écran du palmarès et des titres, en HTML. Module pur, testable sous Node. Données : domain/palmares.js.
import { DIFFICULTY_IDS, difficultyLabel } from '../domain/difficulty.js';
import { TITLES, titleById } from '../domain/palmares.js';
import { RULES } from '../domain/constants.js';
import { elapsedText } from './ranking-view.js';

// V17.8 : longueurs en jours (temps réel) et en tours (anciennes parties) ; records du temps réel en années / mois / jours.
const LENGTH_NAMES = { [RULES.realtime.gameDays.normal]: '15 ans', [RULES.realtime.gameDays.short]: '7 ans (courtes)' };
const lengthName = k => LENGTH_NAMES[k] || `${k} tours`;

const esc = text => String(text).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const rankFr = n => n === 1 ? '1re place' : `${n}e place`;
const row = (label, value) => `<div class="unit-row"><span>${esc(label)}</span><b>${esc(value)}</b></div>`;

export function palmaresHtml(palmares, nations) {
  const p = palmares, short = id => nations.find(n => n.id === id)?.short || '';
  const owned = TITLES.filter(t => p.titles.includes(t.id)), hidden = TITLES.length - owned.length;
  const by = id => short(id) ? ` · ${short(id)}` : '';
  const fastDays = p.fastestWinDays ? `${elapsedText(p.fastestWinDays.day)}${by(p.fastestWinDays.nationId)}` : null;
  const fastTurns = p.fastestWin ? `Tour ${p.fastestWin.turn}${by(p.fastestWin.nationId)}` : null;
  const fast = fastDays || fastTurns || '—';
  const lengths = Object.keys(p.gamesByLength).map(Number).sort((a, b) => b - a).filter(k => p.gamesByLength[k]).map(k => `${p.gamesByLength[k]} en ${lengthName(k)}`).join(' · ');
  return `<div class="palmares-block">${row('Parties terminées', p.games)}${lengths ? `<small class="palmares-note">${esc(lengths)}</small>` : ''}${row('Victoires', p.wins)}\
${row('Meilleur classement', p.bestRank ? rankFr(p.bestRank) : '—')}${row('Plus rapide victoire', fast)}${fastDays && fastTurns ? row('Plus rapide au tour par tour', fastTurns) : ''}${p.bestScore ? row('Meilleur score', `${p.bestScore.toLocaleString('fr-FR').replace(/\u202f|\u00a0/g, ' ')} points`) : ''}</div>\
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
