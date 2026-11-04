// V15.1 — histoire de la partie : données compactes tenues à jour tour par tour, et récit de l'écran de fin.
// Module pur (aucun DOM, aucun hasard). Rien n'est inventé : tout vient des événements réels et du décompte des provinces.
//
// state.story = {
//   from:    tour de la première mesure (0 = début de la partie) ;
//   partial: true si la sauvegarde vient d'une version sans historique ;
//   prov:    { nation: "44556…" } : provinces à la fin de chaque tour, un chiffre en base 36 par tour (1 octet par mesure) ;
//   marks:   [[tour, code, a, b, province], …] : c capitale prise, t trahison, e élimination, f coalition formée, d dissoute ;
//   battles: [[tour, province, attaquant, défenseur, PV perdus, prise 0/1], …] : les STORY_BATTLES plus meurtrières.
// }
import { ARCHETYPE_DESCRIPTIONS, ARCHETYPE_LABELS } from './leaders.js';

export const STORY_BATTLES = 6;
export const STORY_MARKS = 60;
/** « 1 province », « 3 provinces » : accord du nom pour les phrases de l'écran de fin. */
export const provincesText = n => `${n} province${Math.abs(n) > 1 ? 's' : ''}`;
const countsOf = state => {
  const out = Object.fromEntries(Object.keys(state.nations || {}).map(id => [id, 0]));
  for (const p of Object.values(state.provinces || {})) if (p.ownerId in out) out[p.ownerId]++;
  return out;
};
const digit = n => Math.max(0, Math.min(35, n)).toString(36);
export function emptyStory(state, { from = 0, partial = false } = {}) {
  return { from, partial, prov: Object.fromEntries(Object.entries(countsOf(state)).map(([id, n]) => [id, digit(n)])), marks: [], battles: [] };
}
function markOf(e) {
  switch (e.type) {
    case 'capital-plunder': return [e.turn, 'c', e.attacker, e.defender, e.provinceId];
    case 'betrayal': return [e.turn, 't', e.nationId, e.target, e.truce ? 1 : 0];
    case 'elimination': return [e.turn, 'e', e.nationId];
    case 'coalition-formed': return [e.turn, 'f', e.nationId, (e.members || []).join('+')];
    case 'coalition-dissolved': return [e.turn, 'd', e.nationId];
    default: return null;
  }
}
const battleOf = e => (e.type === 'battle' || e.type === 'conquest') && e.defender
  ? [e.turn, e.provinceId, e.attacker, e.defender, Math.round((e.attackerHpLost || 0) + (e.defenderHpLost || 0)), e.type === 'conquest' ? 1 : 0] : null;
function absorb(story, events) {
  for (const e of events) {
    const m = markOf(e);
    if (m && story.marks.length < STORY_MARKS) story.marks.push(m);
    const b = battleOf(e);
    if (b && b[4] > 0) {
      story.battles.push(b);
      story.battles.sort((x, y) => y[4] - x[4] || x[0] - y[0]);
      story.battles.length = Math.min(story.battles.length, STORY_BATTLES);
    }
  }
}
/** Fin de chaque inter-tour : une mesure de provinces, plus les faits marquants du tour. */
export function recordStory(state, eventStart = 0) {
  const s = state.story && typeof state.story === 'object' ? state.story : (state.story = emptyStory(state, { from: state.turn, partial: true }));
  const counts = countsOf(state);
  for (const [id, n] of Object.entries(counts)) s.prov[id] = (s.prov[id] || '') + digit(n);
  absorb(s, (state.events || []).slice(eventStart));
}
/** Sauvegarde sans historique : on ne garde que le vrai : situation actuelle, et faits encore lisibles dans ses événements. */
export function storyFromOldSave(state) {
  const s = emptyStory(state, { from: Math.max(0, (Number(state.turn) || 1) - 1), partial: true });
  absorb(s, Array.isArray(state.events) ? state.events : []);
  return s;
}
const series = (story, id) => [...(story?.prov?.[id] || '')].map(c => parseInt(c, 36)).filter(Number.isFinite);
/** Tour où le vainqueur passe en tête pour de bon, avec le fait qui l'explique ; sinon la plus forte bascule ; sinon null. */
export function turningPoint(story, ids, winnerId) {
  const curves = Object.fromEntries(ids.map(id => [id, series(story, id)])), w = curves[winnerId] || [], at = i => (story.from || 0) + i;
  if (w.length < 2) return null;
  const leading = i => ids.every(id => id === winnerId || (curves[id][i] ?? 0) < w[i]);
  let i = w.length - 1;
  if (!leading(i)) i = -1;
  else while (i > 0 && leading(i - 1)) i--;
  if (i > 0) return { turn: at(i), kind: 'lead', nationId: winnerId, provinces: w[i] };
  // Toujours en tête (ou à égalité à la fin) : la plus forte variation sur 5 tours.
  let best = null;
  for (const id of ids) for (let k = 5; k < curves[id].length; k++) {
    const d = curves[id][k] - curves[id][k - 5];
    if (d !== 0 && (!best || Math.abs(d) > Math.abs(best.delta))) best = { turn: at(k), kind: 'swing', nationId: id, delta: d, provinces: curves[id][k] };
  }
  return best;
}
/**
 * Récit de la partie pour l'écran de fin. `map` donne les noms. Les caractères sont révélés ici, et seulement ici : cette
 * fonction n'est appelée qu'une fois la partie terminée (elle renvoie null sinon).
 */
export function buildEndStory(state, map) {
  const go = state.gameOver;
  if (!go) return null;
  const story = state.story && typeof state.story === 'object' ? state.story : null;
  const name = id => map.nations.find(n => n.id === id)?.short || id, prov = id => map.provinces.find(p => p.id === id)?.name || id;
  const ids = map.nations.map(n => n.id), marks = story?.marks || [], from = story?.from || 0;
  const nations = go.ranking.map(r => {
    const leader = state.leaders?.[r.nationId], human = state.controllers?.[r.nationId] === 'human';
    return { ...r, name: name(r.nationId), color: map.nations.find(n => n.id === r.nationId)?.color, human, points: series(story, r.nationId),
      archetype: human ? null : leader?.archetype || null, trait: human ? 'Vous' : ARCHETYPE_LABELS[leader?.archetype] || 'Caractère inconnu',
      traitText: human ? '' : ARCHETYPE_DESCRIPTIONS[leader?.archetype] || '' };
  });
  const tp = story ? turningPoint(story, ids, go.winnerId) : null;
  let turning = null;
  if (tp) {
    const near = marks.filter(m => Math.abs(m[0] - tp.turn) <= 2 && ['c', 'e', 't'].includes(m[1])).sort((a, b) => Math.abs(a[0] - tp.turn) - Math.abs(b[0] - tp.turn))[0];
    const cause = !near ? '' : near[1] === 'c' ? `${name(near[2])} venait de prendre la capitale de ${name(near[3])}.`
      : near[1] === 'e' ? `${name(near[2])} venait de disparaître de la carte.` : `${name(near[2])} venait de trahir ${name(near[3])}.`;
    const head = tp.kind === 'lead' ? `${name(tp.nationId)} passe en tête pour de bon, avec ${provincesText(tp.provinces)}.`
      : tp.delta > 0 ? `${name(tp.nationId)} gagne ${provincesText(tp.delta)} en 5 tours, et en tient ${tp.provinces}.` : `${name(tp.nationId)} perd ${provincesText(-tp.delta)} en 5 tours, et n’en tient plus que ${tp.provinces}.`;
    turning = { turn: tp.turn, text: [head, cause].filter(Boolean).join(' ') };
  }
  return {
    partial: !story || Boolean(story.partial), from, lastTurn: go.turn, nations, turning,
    capitals: marks.filter(m => m[1] === 'c').map(m => ({ turn: m[0], text: `${name(m[2])} prend la capitale de ${name(m[3])}${prov(m[4]) === name(m[3]) ? '' : ` (${prov(m[4])})`}` })),
    betrayals: marks.filter(m => m[1] === 't').map(m => ({ turn: m[0], text: `${name(m[2])} ${m[4] ? 'rompt sa trêve avec' : 'trahit son allié,'} ${name(m[3])}` })),
    eliminations: marks.filter(m => m[1] === 'e').map(m => ({ turn: m[0], text: `${name(m[2])} est éliminée` })),
    coalitions: marks.filter(m => m[1] === 'f').map(m => ({ turn: m[0], text: `Coalition contre ${name(m[2])} : ${String(m[3] || '').split('+').filter(Boolean).map(name).join(', ')}` })),
    battles: (story?.battles || []).slice(0, 3).map(b => ({ turn: b[0], text: `${prov(b[1])} : ${name(b[2])} contre ${name(b[3])}, ${b[5] ? 'province prise' : 'assaut repoussé'}`, hp: b[4] }))
  };
}
