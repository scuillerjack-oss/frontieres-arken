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
  for (const e of state.stationed || []) if (e.nationId === nationId) n += combatValue(legacyForce(e)); // V13.4 : troupes chez un allié
  return n;
}

// --- Tension 0..100, symétrique --------------------------------------------------------------------------
export const TENSION_START = 10;
export const TENSION_THRESHOLDS = Object.freeze([
  Object.freeze({ min: 0, label: 'calme' }), Object.freeze({ min: 25, label: 'tendu' }),
  Object.freeze({ min: 50, label: 'hostile' }), Object.freeze({ min: 70, label: 'au bord de la guerre' })
]);
/**
 * V14.2 (retour de Jack : « même à 100 % la guerre n'est pas déclarée ») :
 *  - à HOSTILITY_WARNING (70 %), avertissement clair (journal) : « à 85 %, la guerre sera déclarée » ;
 *  - à HOSTILITY_WAR (85 %), la guerre est déclarée automatiquement, pour le joueur comme pour les IA.
 * Une alliance ou une trêve protège : tant qu'elle tient, la tension entre les deux nations est plafonnée juste sous
 * le seuil (84 %). Après la déclaration, la jauge affiche « en guerre » et ne redescend pas sous 70 % tant que dure la
 * guerre (règle V13) ; une trêve la ramène à 40 % au plus.
 */
export const HOSTILITY_WARNING = 70;
export const HOSTILITY_WAR = 85;
// Effet d'un message public sur la tension entre l'émetteur et le destinataire.
// V13 : une menace ou une provocation fait nettement bondir la tension (+20 au lieu de +12 en V11).
export const TALK_TENSION = Object.freeze({ hostile: 20, neutre: -2, amical: -7 });
/**
 * V14.2 (retour de Jack : traits plus marqués) — effet d'un message selon la personnalité du dirigeant IA qui le REÇOIT :
 *  - Conquérant : une provocation (message hostile) le pique au vif : +35 au lieu de +20, et il s'en souvient (il
 *    attaquera l'insolent, voir game-engine.js warTargets) ;
 *  - Héros (naïf) : un message amical le touche deux fois plus : −14 au lieu de −7, et il s'en souvient (« charme ») ;
 *  - Bâtisseur : se fiche des querelles : une provocation ne fait que +8.
 * `known` = ne tenir compte de la personnalité que si elle est révélée (aperçu montré au joueur, sans rien dévoiler).
 */
export const TRAIT_TALK_TENSION = Object.freeze({ conquerant: { hostile: 35 }, heros: { amical: -14 }, batisseur: { hostile: 8 } });
export function talkTensionDelta(state, from, to, tone, { known = false } = {}) {
  const base = TALK_TENSION[tone] ?? 0;
  if (!to || state.controllers?.[to] !== 'ai' || (known && !state.leaders?.[to]?.revealed)) return base;
  return TRAIT_TALK_TENSION[archetypeOf(state, to)]?.[tone] ?? base;
}
/** Mémoire des provocations (Conquérant) et des amabilités (Héros) : state.ai.provoked / state.ai.charm[ia][émetteur]. */
export const PROVOCATION_TURNS = 8;
export const CHARM_TURNS = 12;
export function noteTalkEffect(state, from, to, tone) {
  if (!to || state.controllers?.[to] !== 'ai') return;
  const arch = archetypeOf(state, to);
  state.ai ||= {};
  if (arch === 'conquerant' && tone === 'hostile') ((state.ai.provoked ||= {})[to] ||= {})[from] = state.turn;
  if (arch === 'heros') {
    const c = ((state.ai.charm ||= {})[to] ||= {});
    const cur = c[from] && state.turn - c[from].turn <= CHARM_TURNS ? c[from].count : 0;
    if (tone === 'amical') c[from] = { count: Math.min(5, cur + 1), turn: state.turn };
    else if (tone === 'hostile') delete c[from];
  }
}
/** Nations qui ont provoqué ce Conquérant récemment (moins de PROVOCATION_TURNS tours). */
export const provokers = (state, id) => Object.entries(state.ai?.provoked?.[id] || {}).filter(([n, t]) => state.turn - t <= PROVOCATION_TURNS && !state.nations?.[n]?.eliminated).map(([n]) => n).sort();
/** Charme exercé sur un Héros par `from` (0 à 5 messages amicaux récents). */
export const charmOf = (state, hero, from) => { const c = state.ai?.charm?.[hero]?.[from]; return c && state.turn - c.turn <= CHARM_TURNS ? c.count : 0; };
/** V13 : libellé affiché à la place du palier quand les deux nations sont en guerre. */
export const WAR_LABEL = 'en guerre';
export const tensionRank = value => TENSION_THRESHOLDS.reduce((r, t, i) => value >= t.min ? i : r, 0);
export const tensionLabel = value => TENSION_THRESHOLDS[tensionRank(value)].label;
export function getTension(state, a, b) {
  if (!a || !b || a === b) return 0;
  const v = state.tension?.[a]?.[b];
  return Number.isFinite(v) ? v : TENSION_START;
}
/**
 * { value, label } — value en % (0..100) ; label parmi 'calme' | 'tendu' | 'hostile' | 'au bord de la guerre',
 * ou 'en guerre' (V13) dès que les deux nations sont en guerre : jamais « au bord de la guerre » après un combat.
 */
export function tensionLevel(state, a, b) {
  const value = getTension(state, a, b);
  return { value, label: a && b && a !== b && atWar(state, a, b) ? WAR_LABEL : tensionLabel(value) };
}
/** Écrit la tension (bornée, entière, symétrique) ; un changement de palier crée un événement TENSION. */
export function setTension(state, a, b, value, reason = null) {
  if (!a || !b || a === b || !state.nations?.[a] || !state.nations?.[b]) return 0;
  const before = getTension(state, a, b);
  // V14.2 : alliance ou trêve en cours = plafond juste sous le seuil de guerre automatique.
  const cap = !atWar(state, a, b) && (allied(state, a, b) || treatyOf(state, a, b, 'ceasefire')) ? HOSTILITY_WAR - 1 : 100;
  const v = Math.max(0, Math.min(cap, Math.round(Number(value) || 0)));
  state.tension ||= {};
  (state.tension[a] ||= {})[b] = v; (state.tension[b] ||= {})[a] = v;
  const r0 = tensionRank(before), r1 = tensionRank(v);
  // V13 : en guerre, plus d'événement de palier (« au bord de la guerre » n'a plus de sens : le journal dit déjà la guerre).
  if (r0 !== r1 && !atWar(state, a, b)) state.events?.push({ turn: state.turn, type: 'tension', nationId: a, target: b, value: v, label: TENSION_THRESHOLDS[r1].label, previous: TENSION_THRESHOLDS[r0].label, rising: r1 > r0, reason });
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
    // V14.2 : le Bâtisseur se fiche des querelles, même celles de ses alliés (+5 au lieu de +20).
    if (allied(state, n, victim)) addTension(state, n, attacker, archetypeOf(state, n) === 'batisseur' && state.controllers?.[n] === 'ai' ? 5 : 20, 'ally-attacked');
    if (archetypeOf(state, n) === 'heros' && state.controllers?.[n] === 'ai') addTension(state, n, attacker, 30, 'aggression');
  }
  if (isAI && archetypeOf(state, attacker) === 'conquerant' && rep.victims.length >= 2) reveal(state, attacker, 'conquest');
  return { justified: false };
}
/**
 * V13.2 : chaque assaut réellement livré (combat dans une province) est compté, par victime. Avant, seule
 * l'ouverture d'une guerre comptait : une nation qui frappait deux fois restait « a déjà frappé une fois ».
 */
export function recordStrike(state, attacker, victim) {
  if (!attacker || !victim || attacker === victim) return;
  const rep = reputation(state, attacker);
  rep.strikes = (rep.strikes || 0) + 1;
  rep.strikesOn = rep.strikesOn && typeof rep.strikesOn === 'object' ? rep.strikesOn : {};
  rep.strikesOn[victim] = (rep.strikesOn[victim] || 0) + 1;
}
const timesFr = n => n === 1 ? 'une fois' : n === 2 ? 'deux fois' : n === 3 ? 'trois fois' : `${n} fois`;
/** Fin de tour : un Bâtisseur qui n'a jamais attaqué et a beaucoup construit finit par être reconnu. */
export function observeLeaders(state) {
  for (const [id, l] of Object.entries(state.leaders || {})) {
    if (l.revealed || state.controllers?.[id] !== 'ai' || state.nations?.[id]?.eliminated) continue;
    const r = state.ai?.reputation?.[id];
    if (l.archetype === 'batisseur' && state.turn >= 20 && r && !r.attacks && r.builds >= 8) reveal(state, id, 'builder');
  }
}
/**
 * V14.2 : hostilité, bilan de fin de tour (après tous les combats et échanges), pour chaque paire de nations vivantes,
 * pas en guerre, sans alliance ni trêve :
 *  - tension ≥ 70 % et pas encore avertie → avertissement (« hostility-warning », mémorisé dans state.hostilityWarned) ;
 *  - tension ≥ 85 % et avertie lors d'un tour PRÉCÉDENT → guerre déclarée (`declare(a, b, t)`, fournie par le moteur).
 *    L'avertissement arrive donc toujours au moins un tour avant la guerre (un message hostile fait +20 d'un coup) ;
 *  - tension retombée sous 70 % → l'avertissement est oublié (il reviendra si la tension remonte).
 * Retourne { warned: [[a, b]], wars: [[a, b]] }.
 */
export const pairKey = (a, b) => [a, b].sort().join('|');
export function hostilityWars(state, declare) {
  const ids = aliveNations(state), out = { warned: [], wars: [] };
  state.hostilityWarned = state.hostilityWarned && typeof state.hostilityWarned === 'object' ? state.hostilityWarned : {};
  const warned = state.hostilityWarned;
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
    const a = ids[i], b = ids[j], key = pairKey(a, b), t = getTension(state, a, b);
    if (atWar(state, a, b) || allied(state, a, b) || treatyOf(state, a, b, 'ceasefire') || t < HOSTILITY_WARNING) { delete warned[key]; continue; }
    if (!Number.isFinite(warned[key])) {
      warned[key] = state.turn;
      state.events?.push({ turn: state.turn, type: 'hostility-warning', nationId: a, target: b, value: t });
      out.warned.push([a, b]);
      continue;
    }
    if (t >= HOSTILITY_WAR && warned[key] < state.turn) { delete warned[key]; declare(a, b, t); out.wars.push([a, b]); }
  }
  for (const key of Object.keys(warned)) if (key.split('|').some(id => !ids.includes(id))) delete warned[key];
  return out;
}
/** Dérive naturelle de la tension, une fois par tour : la guerre la maintient haute, la paix l'apaise. */
export function driftTension(state) {
  const ids = aliveNations(state);
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
    const a = ids[i], b = ids[j], t = getTension(state, a, b);
    if (atWar(state, a, b)) { if (t < 70) setTension(state, a, b, 70, 'war'); }
    else if (allied(state, a, b)) { if (t > 5) setTension(state, a, b, t - 2, 'peace'); }
    // V14.2 : le Bâtisseur se fiche des querelles — avec lui, la tension retombe deux fois plus vite.
    else if (t > TENSION_START) setTension(state, a, b, Math.max(TENSION_START, t - ([a, b].some(n => archetypeOf(state, n) === 'batisseur' && state.controllers?.[n] === 'ai') ? 2 : 1)), 'peace');
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
  if (r.brokenPromises > 0) return 'Promet volontiers son aide… sans jamais venir'; // V13 : aide promise non tenue
  // V13.2 : le nombre réel d'assauts, et d'abord ceux subis par le joueur.
  const viewer = state.playerNationId, onMe = r.strikesOn?.[viewer] || 0, strikes = Math.max(r.strikes || 0, r.attacks || 0);
  if (onMe >= 2) return `Vous a frappé ${timesFr(onMe)} : méfiance`;
  if (onMe === 1) return 'Vous a déjà frappé une fois : à surveiller';
  if (r.defended > 0) return 'Semble prendre la défense des nations attaquées';
  if (strikes >= 2) return `A déjà frappé ${timesFr(strikes)} : à surveiller`;
  if (strikes > 0) return 'A déjà frappé une fois : à surveiller';
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
    // V14.2 : le Héros est naïf — chaque message amical récent rend l'alliance plus facile (jusqu'à 65 % de tension),
    // et trois amabilités lui font oublier une agression, voire un Traître démasqué.
    case 'heros': { const c = charmOf(state, target, from); return t < 40 + 5 * c && (!aggressor || c >= 3) && (!fromRevealedTraitor || c >= 3); }
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
    case 'heros': return (recentAggressions(state, 6).some(a => a.attacker === from && a.victim !== target) ? -.4 : .15) + .1 * charmOf(state, target, from);
    case 'conquerant': return losing ? .25 : -.35;
    default: return 0;
  }
}
