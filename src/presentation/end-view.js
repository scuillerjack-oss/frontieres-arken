// V15.1 — écran de fin : le récit de la partie en HTML. Module pur (texte), testable sous Node. Données : domain/story.js.
const esc = text => String(text).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const W = 150, H = 34;

/** Courbe d'une nation : même échelle pour toutes (0 à `top` provinces, tours communs), lue par son rang, son nom et ses chiffres : jamais par la couleur seule. */
export function sparkline(points, { top, length, color, mark = null }) {
  if (points.length < 2) return '<span class="end-spark none">—</span>';
  const x = i => +(2 + i * (W - 4) / Math.max(1, length - 1)).toFixed(1), y = v => +(H - 3 - v * (H - 6) / Math.max(1, top)).toFixed(1);
  const d = points.map((v, i) => `${i ? 'L' : 'M'}${x(i)} ${y(v)}`).join('');
  const last = points.length - 1;
  return `<svg class="end-spark" viewBox="0 0 ${W} ${H}" aria-hidden="true"><line x1="2" x2="${W - 2}" y1="${H - 3}" y2="${H - 3}" class="base"/>${mark !== null && mark <= length ? `<line x1="${x(mark)}" x2="${x(mark)}" y1="2" y2="${H - 3}" class="turn-mark"/>` : ''}<path d="${d}" style="stroke:${color}"/><circle cx="${x(last)}" cy="${y(points[last])}" r="3" style="fill:${color}"/></svg>`;
}
export const SECTION_ITEMS = 4; // un seul écran fluide : on garde les premiers faits, et on dit combien d'autres existent
const section = (title, items, when = t => `T${t}`) => items.length ? `<section class="end-section"><h3>${title}</h3><ul>${items.slice(0, SECTION_ITEMS).map(i => `<li><b>${esc(when(i.turn))}</b> ${esc(i.text)}</li>`).join('')}${items.length > SECTION_ITEMS ? `<li class="more">et ${items.length - SECTION_ITEMS} de plus</li>` : ''}</ul></section>` : '';

/**
 * HTML du récit. `story` = buildEndStory(state, map). V17.8, temps réel : `when(période)` donne le mois (« mars 2029 ») au
 * lieu de « T12 », `realtime` montre les points du classement et la règle du classement à points.
 */
export function endStoryHtml(story, { when = null, realtime = false, rule = null } = {}) {
  if (!story) return '';
  const length = Math.max(...story.nations.map(n => n.points.length), 2), top = Math.max(...story.nations.flatMap(n => n.points), 1);
  const curves = story.nations.some(n => n.points.length >= 2);
  const mark = story.turning ? story.turning.turn - story.from : null;
  const rows = story.nations.map(n => `<li class="end-nation${n.human ? ' me' : ''}${n.eliminated ? ' out' : ''}"><span class="end-rank">${n.rank}</span><div class="end-who"><b><i style="--nation:${n.color}"></i>${esc(n.name)}</b><small class="end-trait">${esc(n.trait)}</small></div>${curves ? sparkline(n.points, { top, length, color: n.color, mark }) : ''}<div class="end-num"><b>${realtime && !n.eliminated ? n.score : n.provinces}</b><small>${n.eliminated ? 'éliminée' : realtime ? `points<br>${n.provinces} prov. · ${n.capitals} cap.` : `${n.provinces > 1 ? 'provinces' : 'province'}<br>${n.capitals} cap. · ${n.treasury} or`}</small></div></li>`).join('');
  const at = when || (t => `tour ${t}`), tag = when || (t => `T${t}`);
  const axis = curves ? `<p class="end-axis">Provinces de chaque nation, ${when ? `de ${when(Math.max(1, story.from))} à ${when(story.lastTurn)}` : `du tour ${story.from} au tour ${story.lastTurn}`}, même échelle (0 à ${top})${mark !== null ? ' · trait vertical : le tournant' : ''}.</p>` : '';
  const partial = story.partial ? `<p class="end-partial">Partie commencée avant la version qui garde l’histoire : le récit ne couvre que ${curves ? `la suite, depuis ${when ? when(story.from) : `le tour ${story.from}`}` : 'ce que la sauvegarde avait retenu'}.</p>` : '';
  const turning = story.turning ? `<section class="end-section end-turning"><h3>Le tournant · ${esc(at(story.turning.turn))}</h3><p>${esc(story.turning.text)}</p></section>` : '';
  const battles = story.battles.map(b => ({ turn: b.turn, text: `${b.text} (${b.hp} PV perdus)` }));
  return `${partial}<ol class="end-nations">${rows}</ol>${axis}${turning}${section('Capitales prises', story.capitals, tag)}${section('Trahisons', story.betrayals, tag)}${section('Grandes batailles', battles, tag)}${section('Coalitions', story.coalitions, tag)}${section('Île mystérieuse', story.islands || [], tag)}${section('Nations éliminées', story.eliminations, tag)}<p class="end-rule">${esc(rule || 'Classement : provinces, puis capitales tenues, puis trésor.')}</p>`;
}
