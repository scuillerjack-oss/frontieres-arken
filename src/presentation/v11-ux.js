// V11 — interface des personnalités : fil d'échanges, tension, impression sur les dirigeants.
// Fonctions pures, sans DOM ni dépendance au moteur : testables sous Node (docs/V11-contrat.md).
import { pointAlong } from './v5-ux.js';

// Tons proposés au joueur (jamais de texte libre) : icône + classe CSS discrète.
export const TONES = Object.freeze({
  hostile: Object.freeze({ id: 'hostile', label: 'Hostile', icon: '⚔', cls: 'tone-hostile' }),
  neutre: Object.freeze({ id: 'neutre', label: 'Neutre', icon: '◆', cls: 'tone-neutre' }),
  amical: Object.freeze({ id: 'amical', label: 'Amical', icon: '✿', cls: 'tone-amical' })
});
export const TONE_ORDER = Object.freeze(['hostile', 'neutre', 'amical']);
export function toneMeta(tone) { return TONES[tone] || TONES.neutre; }

// Blasons des nations (map.nations[].crest) en glyphes lisibles sur téléphone.
const CRESTS = Object.freeze({ stag: '🦌', lion: '🦁', serpent: '🐍', wolf: '🐺', sun: '☀' });
export function crestGlyph(crest) { return CRESTS[crest] || '✦'; }

/**
 * Ids des échanges adressés au joueur et en attente de réponse (state.talkPending, quelle que soit sa clé).
 * V13 : une conversation se termine — un message auquel le joueur a déjà répondu (réponse publiée ou réponse
 * prête à partir à la fin du tour) n'attend plus rien : plus de bouton « Répondre », badge effacé.
 */
export function pendingTalkIds(state, playerNationId = state.playerNationId) {
  const talk = state.talk || [], ids = new Set();
  for (const list of Object.values(state.talkPending || {})) for (const id of list || []) ids.add(id);
  const answered = new Set([
    ...talk.filter(m => m.from === playerNationId && m.replyTo).map(m => m.replyTo),
    ...(state.orders || []).filter(o => o.kind === 'talk' && o.status === 'pending' && o.nationId === playerNationId && o.replyTo).map(o => o.replyTo)
  ]);
  return new Set(talk.filter(m => ids.has(m.id) && !answered.has(m.id) && m.to === playerNationId && m.from !== playerNationId).map(m => m.id));
}
/** Nombre affiché sur le badge du bouton « Échanges ». */
export function talkBadgeCount(state, playerNationId = state.playerNationId) {
  return pendingTalkIds(state, playerNationId).size;
}

/**
 * Fil public, le plus récent en premier. Chaque ligne : expéditeur, destinataire (null = à tous), ton, tour, texte,
 * message auquel il répond, et drapeaux d'affichage (à moi, de moi, en attente de réponse).
 */
export function talkFeed(state, playerNationId = state.playerNationId, { limit = 60 } = {}) {
  const talk = state.talk || [], byId = new Map(talk.map(m => [m.id, m])), pending = pendingTalkIds(state, playerNationId);
  return talk.map((m, index) => ({ m, index })).sort((a, b) => (b.m.turn - a.m.turn) || (b.index - a.index)).slice(0, limit).map(({ m }) => ({
    id: m.id, turn: m.turn, from: m.from, to: m.to ?? null, tone: TONES[m.tone] ? m.tone : 'neutre', text: String(m.text ?? ''),
    replyTo: m.replyTo ?? null, replyToFrom: m.replyTo ? byId.get(m.replyTo)?.from ?? null : null,
    toMe: m.to === playerNationId, fromMe: m.from === playerNationId, awaitingReply: pending.has(m.id)
  }));
}

// Libellés de tension du contrat, du plus calme au plus dangereux.
// V13 : « en guerre » (rang 4) remplace le palier dès que les deux nations sont en guerre.
export const TENSION_LABELS = Object.freeze(['calme', 'tendu', 'hostile', 'au bord de la guerre', 'en guerre']);
/** Jauge 0–100 : pourcentage borné, rang du libellé (0..4) et classe CSS. */
export function tensionGauge(level) {
  const value = Math.max(0, Math.min(100, Math.round(Number(level?.value) || 0)));
  const rank = Math.max(0, TENSION_LABELS.indexOf(level?.label));
  return { value, pct: value, label: TENSION_LABELS[rank], rank, cls: `tension-${rank}` };
}

/**
 * Liserés orange : nations « au bord de la guerre » avec le joueur, sauf celles déjà en guerre (liseré rouge).
 * levelOf(nationId) → { value, label } (tensionLevel du moteur).
 */
export function tensionBorderGroups(state, map, levelOf, atWar = []) {
  const war = new Set(atWar), me = state.playerNationId;
  return map.nations.filter(n => n.id !== me && !war.has(n.id) && levelOf(n.id)?.label === 'au bord de la guerre')
    .map(n => ({ kind: 'brink', nationId: n.id, provinceIds: map.provinces.filter(d => state.provinces[d.id]?.ownerId === n.id).map(d => d.id) }))
    .filter(g => g.provinceIds.length);
}

// --- Correctif testeur V10 : le jeton d'un convoi au départ ne masque plus les ancres de port voisines ----------
/**
 * Position d'affichage du jeton : sa position réelle (étape atteinte) si aucune ancre de port n'est à moins de `clear`
 * unités ; sinon glissée le long de la route jusqu'au premier point dégagé ; si la route est trop courte, décalée
 * perpendiculairement à la route. Le point réel reste visible (petit repère relié au jeton).
 */
export function convoyTokenPosition(marker, map, clear = 62) {
  const anchors = (map.provinces || []).filter(p => p.port).map(p => p.port.anchor);
  const free = pt => anchors.every(a => Math.hypot(a.x - pt.x, a.y - pt.y) >= clear);
  const base = marker.position, path = marker.path || [];
  if (!base || free(base) || path.length < 2) return { ...base, shifted: false };
  const start = Math.max(0, Math.min(1, marker.stage / Math.max(1, marker.turns)));
  // On avance vers l'arrivée (on ne recule pas vers le port de départ), sans dépasser l'étape suivante si possible.
  for (let k = 1; k <= 40; k++) {
    const f = start + (1 - start) * k / 40, pt = pointAlong(path, f);
    if (free(pt) && f < 1) return { x: pt.x, y: pt.y, shifted: true };
  }
  const a = path[0], b = path.at(-1), len = Math.hypot(b.x - a.x, b.y - a.y) || 1, nx = -(b.y - a.y) / len, ny = (b.x - a.x) / len;
  const mid = pointAlong(path, .5);
  // Côté choisi : celui qui s'éloigne le plus des ancres.
  const candidates = [1, -1].map(s => ({ x: mid.x + nx * clear * 1.2 * s, y: mid.y + ny * clear * 1.2 * s }));
  const score = pt => Math.min(...anchors.map(an => Math.hypot(an.x - pt.x, an.y - pt.y)));
  const best = score(candidates[0]) >= score(candidates[1]) ? candidates[0] : candidates[1];
  return { x: best.x, y: best.y, shifted: true };
}

