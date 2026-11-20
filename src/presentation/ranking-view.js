// V17.8 — Classement à points, offre de paix générale et fin de partie du temps réel, en HTML / texte. Module pur (sans
// DOM), testable sous Node. Données : domain/realtime/ranking.js et end.js. Règles : docs/V17-cahier-des-charges.md §9.
import { RULES } from '../domain/constants.js';
import { dateOfDay, daysInMonth, formatDate } from '../domain/realtime/clock.js';

const R = RULES.realtime, K = R.ranking;
const esc = text => String(text).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const num = n => Math.max(0, Math.floor(Number(n) || 0)).toLocaleString('fr-FR').replace(/ | /g, ' ');
const plural = (n, one, many) => `${n} ${n > 1 ? many : one}`;
export const rankText = n => n === 1 ? '1re' : `${n}e`;
export const pointsText = n => `${num(n)} point${Math.floor(Number(n) || 0) > 1 ? 's' : ''}`;

/** Durée écoulée du 1er jour jusqu'à la fin du jour `day` : « 4 ans, 2 mois et 13 jours » (calendrier réel). */
export function elapsedText(day) {
  const d = Math.max(1, Math.floor(Number(day) || 1)), end = dateOfDay(d + 1), s = R.startDate;
  let years = end.year - s.year, months = end.month - s.month, days = end.day - s.day;
  if (days < 0) { months--; const pm = end.month === 1 ? 12 : end.month - 1; days += daysInMonth(end.month === 1 ? end.year - 1 : end.year, pm); }
  if (months < 0) { years--; months += 12; }
  const parts = [years && plural(years, 'an', 'ans'), months && `${months} mois`, days && plural(days, 'jour', 'jours')].filter(Boolean);
  return parts.length ? parts.length > 1 ? `${parts.slice(0, -1).join(', ')} et ${parts.at(-1)}` : parts[0] : '1 jour';
}
/** Temps réellement passé à jouer (horloge qui tourne) : « 52 min », « 2 h 05 ». */
export function playTimeText(ms) {
  const min = Math.round(Math.max(0, Number(ms) || 0) / 60000);
  if (min < 1) return 'moins d’une minute';
  return min < 60 ? `${min} min` : `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')}`;
}
/** Longueurs proposées à la création d'une partie en temps réel (au lieu de « 80 tours / 40 tours »). */
export const realtimeLengthLabel = short => short ? 'Courte · 7 ans' : '15 ans';
export function realtimeLengthText(short) {
  return short
    ? `Partie courte : 7 ans, fin le ${formatDate(R.gameDays.short)} (environ 1 h 25 de jeu). Les dirigeants se pressent plus tôt.`
    : `Partie complète : 15 ans, du ${formatDate(1)} au ${formatDate(R.gameDays.normal)} (environ 3 h de jeu).`;
}
/** Comment les points sont comptés (écran 🏆 et écran de fin). */
export const RANKING_RULE = `${K.province} points par province, +${K.capital} par capitale tenue, 1 point par ${K.troopGoldPerPoint} or de troupes, 1 par ${K.treasuryGoldPerPoint} or de trésor, 1 par ${K.noFamineDaysPerPoint} jours sans famine.`;
const PART_LABELS = [['provinces', 'Provinces'], ['capitals', 'Capitales'], ['troops', 'Troupes'], ['treasury', 'Trésor'], ['food', 'Jours sans famine']];
function detailHtml(r) {
  const hint = { provinces: `${r.provinces} × ${K.province}`, capitals: `${r.capitals} × ${K.capital}`, troops: `${num(r.troopGold)} or`, treasury: `${num(r.treasury)} or`, food: `${num(r.noFamineDays)} jours` };
  return `<dl class="rank-detail">${PART_LABELS.map(([k, label]) => `<div><dt>${label} <small>${hint[k]}</small></dt><dd>${num(r.parts?.[k])}</dd></div>`).join('')}</dl>`;
}
/**
 * Écran 🏆 « Classement » : rang et total de chaque nation (public) ; détail des cinq lignes pour soi et ses alliés
 * (`detailFor(nationId)`), « détail secret » pour les autres. `snapshot` = rankingSnapshot(state).
 */
export function rankingHtml(snapshot, { me, nations, detailFor = id => id === me, nextDay = null, gameDays = null } = {}) {
  const nat = id => nations.find(n => n.id === id) || { short: id, color: '#888' };
  const rows = (snapshot?.rows || []).map(r => {
    const n = nat(r.nationId), mine = r.nationId === me, open = !r.eliminated && detailFor(r.nationId);
    return `<li class="rank-row${mine ? ' me' : ''}${r.eliminated ? ' out' : ''}" data-rank-nation="${esc(r.nationId)}"><div class="rank-line"><span class="rank-pos">${r.rank}</span>\
<b class="rank-name"><i style="--nation:${esc(n.color)}"></i>${esc(n.short)}${mine ? ' <small>(vous)</small>' : ''}</b><span class="rank-score">${r.eliminated ? 'éliminée' : pointsText(r.score)}</span></div>\
${r.eliminated ? '' : open ? detailHtml(r) : '<p class="rank-secret">Détail connu de cette nation et de ses alliés seulement.</p>'}</li>`;
  }).join('');
  const when = snapshot ? `Classement du ${formatDate(snapshot.day)} · mis à jour tous les ${K.refreshEveryDays} jours${nextDay ? ` (prochain : ${formatDate(nextDay)})` : ''}.` : '';
  return `<p class="rank-when">${esc(when)}</p><ol class="rank-list">${rows}</ol><p class="rank-rule">${esc(RANKING_RULE)} Égalité : provinces, puis capitales. Une nation éliminée a 0 point.</p>\
<p class="rank-rule">${gameDays ? `Au ${formatDate(gameDays)}, le premier du classement gagne la partie` : 'À la fin du temps, le premier du classement gagne la partie'} (sauf conquête du monde avant : les cinq capitales, ou la dernière nation debout).</p>`;
}
/** Fenêtre de paix générale (§9.1, fin n° 4) : le classement actuel et ce que donnerait « Terminer ». */
export function peaceOfferHtml(snapshot, { me, nations, peaceDays = R.end.peaceDays }) {
  const nat = id => nations.find(n => n.id === id)?.short || id, rows = snapshot?.rows || [], mine = rows.find(r => r.nationId === me), first = rows[0];
  const verdict = !mine ? '' : mine.rank === 1 ? `Vous êtes en tête avec ${pointsText(mine.score)} : terminer maintenant, c’est la victoire.`
    : `Vous êtes ${rankText(mine.rank)} avec ${pointsText(mine.score)} ; ${esc(nat(first.nationId))} est en tête avec ${pointsText(first.score)} et gagnerait la partie.`;
  return `<p>Toutes les nations sont en paix : alliées deux à deux, sans combat depuis ${peaceDays} jours.</p><p><b>Terminer la partie maintenant, au classement actuel ?</b></p>\
<p class="peace-verdict">${verdict}</p><ol class="rank-list compact">${rows.filter(r => !r.eliminated).map(r => `<li class="rank-row${r.nationId === me ? ' me' : ''}"><div class="rank-line"><span class="rank-pos">${r.rank}</span><b class="rank-name">${esc(nat(r.nationId))}</b><span class="rank-score">${pointsText(r.score)}</span></div></li>`).join('')}</ol>\
<p class="rank-rule">Continuer : la partie reprend, et la question reviendra dans ${R.end.reofferDays} jours si la paix dure.</p>`;
}
/** Raison de la fin, en clair (écran de fin du temps réel). */
export function realtimeEndWhy(go, { me, name }) {
  const w = name(go.winnerId);
  switch (go.reason) {
    case 'capitals': return `${w} tient les cinq capitales : conquête du monde.`;
    case 'last-nation': return `${w} est la dernière nation debout : conquête du monde.`;
    case 'player-eliminated': return `${name(me)} n’a plus aucune province.`;
    case 'peace': return `Paix générale : toutes les nations se sont alliées et la partie s’arrête au classement à points.`;
    default: return `Le temps est écoulé : nous sommes le ${formatDate(go.day)}. Le classement à points désigne le vainqueur.`;
  }
}
export const realtimeEndKicker = go => `${formatDate(go.day).toUpperCase()} · ${({ capitals: 'CONQUÊTE DU MONDE', 'last-nation': 'CONQUÊTE DU MONDE', 'player-eliminated': 'NATION ÉLIMINÉE', peace: 'PAIX GÉNÉRALE' })[go.reason] || 'FIN DE LA PARTIE'}`;
/** Bloc « durée » de l'écran de fin : dates, durée en jeu, temps réellement joué. */
export function endDurationHtml(go, playMs) {
  return `<p class="end-duration">Du ${formatDate(1)} au ${formatDate(go.day)} : <b>${elapsedText(go.day)}</b> de jeu (${num(go.day)} jours)${Number(playMs) > 0 ? ` · ${playTimeText(playMs)} passées à jouer` : ''}.</p>`;
}
/** Classement final (à la fin, tout est révélé : détail de chaque nation). */
export function finalRankingHtml(go, { me, nations }) {
  return `<section class="end-section end-ranking"><h3>Classement final</h3>${rankingHtml({ day: go.day, rows: go.ranking }, { me, nations, detailFor: () => true }).replace(/<p class="rank-when">.*?<\/p>/, '').replace(/<p class="rank-rule">À la fin.*?<\/p>|<p class="rank-rule">Au .*?<\/p>/, '')}</section>`;
}
/** Caractères des dirigeants, révélés à la fin seulement (story.nations : trait / traitText de buildEndStory). */
export function revealedCharactersHtml(storyNations) {
  const list = (storyNations || []).filter(n => !n.human);
  return list.length ? `<section class="end-section end-characters"><h3>Caractères révélés</h3><ul>${list.map(n => `<li><b>${esc(n.name)}</b> : ${esc(n.trait)}${n.traitText ? `. <small>${esc(n.traitText)}</small>` : ''}</li>`).join('')}</ul></section>` : '';
}
/** Libellé d'un moment du récit en temps réel : la période n° p (30 jours) → « mars 2029 ». */
export const periodLabel = p => formatDate(Math.max(1, Math.floor(Number(p) || 1)) * R.daysPerPeriod).replace(/^\S+ /, '');
