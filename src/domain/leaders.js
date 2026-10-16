// V11 — personnalités des dirigeants IA, tension entre nations, impression laissée au joueur.
// Module pur (aucun DOM, aucun Math.random) : tout aléa est dérivé de state.seed (docs/V11-contrat.md).
import { combatValue, provinceForce, legacyForce } from './combat.js';

export const ARCHETYPES = Object.freeze(['heros', 'conquerant', 'traitre', 'batisseur']);
export const ARCHETYPE_LABELS = Object.freeze({ heros: 'Le Héros', conquerant: 'Le Conquérant', traitre: 'Le Traître', batisseur: 'Le Bâtisseur' });
export const ARCHETYPE_DESCRIPTIONS = Object.freeze({
  heros: 'défend les nations attaquées et punit les agresseurs',
  conquerant: 'veut dominer le monde et frappe les plus faibles',
  traitre: 'cherche des alliés… pour mieux les poignarder',
  batisseur: 'développe son pays et ne se bat que menacé'
});
// Compatibilité des sauvegardes V10 (state.ai.traits) : ancien trait -> archétype, et inversement.
export const LEGACY_TRAIT_TO_ARCHETYPE = Object.freeze({ offensif: 'conquerant', fidele: 'heros', prudent: 'batisseur', impulsif: 'traitre' });
export const ARCHETYPE_TO_LEGACY_TRAIT = Object.freeze({ conquerant: 'offensif', heros: 'fidele', batisseur: 'prudent', traitre: 'impulsif' });

// --- Aléa déterministe ------------------------------------------------------------------------------------
export function hashString(text) {
  let h = 2166136261;
  for (const c of String(text)) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
}
/** Nombre dans [0, 1) qui ne dépend que de la graine de la partie et des clés (ne consomme pas randomCounter). */
export function chance(state, ...keys) {
  let x = hashString(`${state?.seed ?? 'arken'}|${keys.join('|')}`) || 1;
  x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0;
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b) >>> 0; x = (x ^ (x >>> 16)) >>> 0;
  return x / 4294967296;
}
export const pickFrom = (state, list, ...keys) => list[Math.floor(chance(state, ...keys) * list.length) % list.length];

/** Redistribution des 4 archétypes entre les nations IA (ordre de la carte), selon la graine. */
export function assignLeaders(seed, aiNationIds) {
  const pool = [...ARCHETYPES], st = { seed };
  for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(chance(st, 'leaders', i) * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  return Object.fromEntries(aiNationIds.map((id, i) => [id, { archetype: i < pool.length ? pool[i] : pool[Math.floor(chance(st, 'leaders-extra', id) * pool.length)], revealed: false }]));
}
/** Toute nation pilotée par l'IA a un dirigeant (simulations IA contre IA, anciennes sauvegardes). */
export function ensureLeaders(state) {
  state.leaders ||= {};
  for (const id of Object.keys(state.nations || {}).sort()) {
    if (state.controllers?.[id] !== 'ai' || state.leaders[id]) continue;
    const legacy = LEGACY_TRAIT_TO_ARCHETYPE[state.ai?.traits?.[id]];
    const used = new Set(Object.values(state.leaders).map(l => l.archetype));
    const free = ARCHETYPES.filter(a => !used.has(a));
    state.leaders[id] = { archetype: legacy || (free.length ? free[Math.floor(chance(state, 'leader-fill', id) * free.length)] : ARCHETYPES[Math.floor(chance(state, 'leader-dup', id) * 4)]), revealed: false };
  }
  return state.leaders;
}
export const archetypeOf = (state, id) => state.leaders?.[id]?.archetype || LEGACY_TRAIT_TO_ARCHETYPE[state.ai?.traits?.[id]] || null;

// --- Relations (copie locale, pour rester indépendant de game-engine.js) ------------------------------------
export const atWar = (state, a, b) => (state.diplomacy?.wars || []).some(w => w.active !== false && w.participants.includes(a) && w.participants.includes(b));
export const treatyOf = (state, a, b, type) => (state.diplomacy?.treaties || []).find(t => t.active !== false && t.type === type && t.parties.includes(a) && t.parties.includes(b)) || null;
export const allied = (state, a, b) => Boolean(treatyOf(state, a, b, 'alliance'));
export const aliveNations = state => Object.keys(state.nations || {}).filter(id => !state.nations[id].eliminated).sort();
/** Puissance militaire d'une nation (provinces + convois en mer). */
export function strengthOf(state, nationId) {
  let n = 0;
  for (const p of Object.values(state.provinces || {})) if (p.ownerId === nationId) n += combatValue(provinceForce(p));
  for (const t of state.transports || []) if (t.nationId === nationId) n += combatValue(legacyForce(t));
  return n;
}

// --- Tension 0..100, symétrique --------------------------------------------------------------------------
export const TENSION_START = 10;
export const TENSION_THRESHOLDS = Object.freeze([
  Object.freeze({ min: 0, label: 'calme' }), Object.freeze({ min: 25, label: 'tendu' }),
  Object.freeze({ min: 50, label: 'hostile' }), Object.freeze({ min: 75, label: 'au bord de la guerre' })
]);
// Effet d'un message public sur la tension entre l'émetteur et le destinataire.
export const TALK_TENSION = Object.freeze({ hostile: 12, neutre: -2, amical: -7 });
export const tensionRank = value => TENSION_THRESHOLDS.reduce((r, t, i) => value >= t.min ? i : r, 0);
export const tensionLabel = value => TENSION_THRESHOLDS[tensionRank(value)].label;
export function getTension(state, a, b) {
  if (!a || !b || a === b) return 0;
  const v = state.tension?.[a]?.[b];
  return Number.isFinite(v) ? v : TENSION_START;
}
/** { value, label } — label parmi 'calme' | 'tendu' | 'hostile' | 'au bord de la guerre'. */
export function tensionLevel(state, a, b) {
  const value = getTension(state, a, b);
  return { value, label: tensionLabel(value) };
}
/** Écrit la tension (bornée, entière, symétrique) ; un changement de palier crée un événement TENSION. */
export function setTension(state, a, b, value, reason = null) {
  if (!a || !b || a === b || !state.nations?.[a] || !state.nations?.[b]) return 0;
  const before = getTension(state, a, b), v = Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
  state.tension ||= {};
  (state.tension[a] ||= {})[b] = v; (state.tension[b] ||= {})[a] = v;
  const r0 = tensionRank(before), r1 = tensionRank(v);
  if (r0 !== r1) state.events?.push({ turn: state.turn, type: 'tension', nationId: a, target: b, value: v, label: TENSION_THRESHOLDS[r1].label, previous: TENSION_THRESHOLDS[r0].label, rising: r1 > r0, reason });
  return v;
}
export const addTension = (state, a, b, delta, reason = null) => setTension(state, a, b, getTension(state, a, b) + delta, reason);
/** Matrice initiale : 10 partout, ajustée aux guerres et traités existants (migration). */
export function initialTension(state) {
  const ids = Object.keys(state.nations || {}), out = {};
  for (const a of ids) { out[a] = {}; for (const b of ids) if (a !== b) out[a][b] = atWar(state, a, b) ? 80 : allied(state, a, b) ? 5 : treatyOf(state, a, b, 'ceasefire') ? 30 : TENSION_START; }
  return out;
}

// --- Mémoire publique (réputation) et révélation --------------------------------------------------------------
export function reputation(state, id) {
  state.ai ||= {};
  state.ai.reputation ||= {};
  return state.ai.reputation[id] ||= { attacks: 0, victims: [], defended: 0, hostile: 0, friendly: 0, offers: 0, builds: 0, betrayals: 0 };
}
export function reveal(state, id, reason) {
  const l = state.leaders?.[id];
  if (!l || l.revealed) return false;
  l.revealed = true; l.revealedTurn = state.turn; l.revealedBy = reason;
  state.events?.push({ turn: state.turn, type: 'reveal', nationId: id, archetype: l.archetype, reason });
  return true;
}
/** Une agression (attaque ou déclaration de guerre) : mémoire, tension, indignation des alliés et des héros. */
/**
 * Une nouvelle guerre ouverte par `attacker` (attaque ou déclaration). Riposte contre un agresseur récent :
 * « justifiée » (tension seulement ; un Héros qui défend ainsi une victime est révélé). Sinon : agression mémorisée,
 * tension, indignation des alliés de la victime et des Héros ; un Conquérant qui frappe deux nations est révélé.
 */
export function recordAggression(state, attacker, victim, reason = 'combat') {
  if (!attacker || !victim || attacker === victim) return { justified: false };
  state.ai ||= {};
  state.ai.aggressions ||= [];
  setTension(state, attacker, victim, Math.max(getTension(state, attacker, victim), 85), reason);
  const rep = reputation(state, attacker), isAI = state.controllers?.[attacker] === 'ai';
  if (recentAggressions(state, 10).some(a => a.attacker === victim)) {
    if (archetypeOf(state, attacker) === 'heros' && isAI) { rep.defended++; reveal(state, attacker, 'defense'); }
    return { justified: true };
  }
  state.ai.aggressions.push({ turn: state.turn, attacker, victim, reason });
  if (state.ai.aggressions.length > 40) state.ai.aggressions.splice(0, state.ai.aggressions.length - 40);
  rep.attacks++;
  if (!rep.victims.includes(victim)) rep.victims.push(victim);
  for (const n of aliveNations(state)) {
    if (n === attacker || n === victim) continue;
    if (allied(state, n, victim)) addTension(state, n, attacker, 20, 'ally-attacked');
    if (archetypeOf(state, n) === 'heros' && state.controllers?.[n] === 'ai') addTension(state, n, attacker, 30, 'aggression');
  }
  if (isAI && archetypeOf(state, attacker) === 'conquerant' && rep.victims.length >= 2) reveal(state, attacker, 'conquest');
  return { justified: false };
}
/** Fin de tour : un Bâtisseur qui n'a jamais attaqué et a beaucoup construit finit par être reconnu. */
export function observeLeaders(state) {
  for (const [id, l] of Object.entries(state.leaders || {})) {
    if (l.revealed || state.controllers?.[id] !== 'ai' || state.nations?.[id]?.eliminated) continue;
    const r = state.ai?.reputation?.[id];
    if (l.archetype === 'batisseur' && state.turn >= 20 && r && !r.attacks && r.builds >= 8) reveal(state, id, 'builder');
  }
}
/** Dérive naturelle de la tension, une fois par tour : la guerre la maintient haute, la paix l'apaise. */
export function driftTension(state) {
  const ids = aliveNations(state);
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
    const a = ids[i], b = ids[j], t = getTension(state, a, b);
    if (atWar(state, a, b)) { if (t < 70) setTension(state, a, b, 70, 'war'); }
    else if (allied(state, a, b)) { if (t > 5) setTension(state, a, b, t - 2, 'peace'); }
    else if (t > TENSION_START) setTension(state, a, b, t - 1, 'peace');
  }
}
export const recentAggressions = (state, turns = 8) => (state.ai?.aggressions || []).filter(a => a.turn >= state.turn - turns);

/** Texte affichable : archétype si révélé, sinon une impression tirée du comportement public observé. */
export function leaderHint(state, nationId) {
  if (nationId === state.playerNationId && state.controllers?.[nationId] === 'human') return 'Votre nation';
  if (state.nations?.[nationId]?.eliminated) return 'Nation éliminée';
  const l = state.leaders?.[nationId];
  if (!l) return 'Dirigeant encore mal connu';
  if (l.revealed) return `${ARCHETYPE_LABELS[l.archetype]} : ${ARCHETYPE_DESCRIPTIONS[l.archetype]}`;
  const r = state.ai?.reputation?.[nationId] || {};
  if ((r.victims?.length || 0) >= 2) return 'Dirigeant belliqueux, avide de terres';
  if (r.defended > 0) return 'Semble prendre la défense des nations attaquées';
  if (r.attacks > 0) return 'A déjà frappé une fois : à surveiller';
  if (r.offers >= 2 && !r.hostile) return 'Très avenant… peut-être trop';
  if (r.hostile >= 2 && r.hostile > r.friendly) return 'Ton menaçant dans les échanges';
  if (r.builds >= 6) return 'Semble pacifique, occupé à bâtir';
  if (r.friendly >= 2) return 'Ton cordial dans les échanges';
  if ((state.turn || 1) <= 3) return 'Dirigeant encore mal connu';
  return 'Dirigeant discret, intentions incertaines';
}

// --- Décisions diplomatiques selon la personnalité ----------------------------------------------------------
/** Une IA accepte-t-elle l'alliance proposée par `from` ? (le Traître accepte tout). */
export function acceptsAlliance(state, target, from) {
  const arch = archetypeOf(state, target);
  if (!arch || state.controllers?.[target] !== 'ai') return true;
  const t = getTension(state, target, from), fromRevealedTraitor = state.leaders?.[from]?.revealed && state.leaders[from].archetype === 'traitre';
  const aggressor = recentAggressions(state, 10).some(a => a.attacker === from);
  switch (arch) {
    case 'traitre': return true;
    case 'heros': return t < 40 && !aggressor && !fromRevealedTraitor;
    case 'batisseur': return t < 50 && !fromRevealedTraitor;
    case 'conquerant': return t < 25 && strengthOf(state, from) >= strengthOf(state, target);
    default: return true;
  }
}
/** Ajustement de la probabilité d'accepter un cessez-le-feu (ajouté à la probabilité de l'offre). */
export function ceasefireBias(state, target, from) {
  const arch = archetypeOf(state, target);
  if (!arch || state.controllers?.[target] !== 'ai') return 0;
  const losing = strengthOf(state, target) < strengthOf(state, from) * .8;
  switch (arch) {
    case 'traitre': return 1;
    case 'batisseur': return .35;
    case 'heros': return recentAggressions(state, 6).some(a => a.attacker === from && a.victim !== target) ? -.4 : .15;
    case 'conquerant': return losing ? .25 : -.35;
    default: return 0;
  }
}
