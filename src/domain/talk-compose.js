// V14.4 (retour de Jack, 29/10 : « moins de phrases préécrites répétées ») — répliques COMPOSÉES.
// Module PUR : aucun DOM, aucun réseau, aucun LLM (règle « 0 € de fonctionnement »), aucun hasard non graine.
//
// Une réplique = OUVERTURE (selon le trait du dirigeant et le ton) + FOND (la réplique de situation de talk.js, déjà
// remplie) + CONTEXTE RÉEL (tour, relation, provinces qui se font face, troupes visibles, nombre de provinces) +
// parfois une CHUTE (selon le trait). Le tirage est déterministe (graine de la partie + clés, comme pickFrom).
//
// Mémoire anti-répétition, par dirigeant et par partie : state.talkMemory[nation] = { said: [empreintes des textes
// publiés], cores: [[empreinte du fond, tour], …] }. Un texte déjà publié par ce dirigeant n'est JAMAIS redit tant qu'il
// existe une autre combinaison. Absente d'une ancienne sauvegarde : créée au premier message (rien d'autre ne change).
//
// Brouillard de guerre respecté : un nombre de troupes n'est cité que pour une province que l'auteur ET le destinataire
// voient (vision.js) ; provinces, nombre de provinces, tour, guerre, alliance, trêve et tension sont publics entre eux.
import { gameLengthOf, scaleTurn } from './game-length.js';
import { chance, archetypeOf, atWar, treatyOf, getTension } from './leaders.js';
import { visibleProvinces } from './vision.js';
import { hashString } from './profile.js';
import { deFr, t, tl, withLanguage } from '../i18n/i18n.js';

export const SAID_MEMORY = 400;     // textes retenus par dirigeant (une partie de 80 tours en publie bien moins)
export const CORE_MEMORY = 40;      // fonds retenus par dirigeant (anti-répétition du fond, en plus des 6 derniers messages)
export const COMPOSED_MAX = 250;    // longueur maximale (téléphone) : la chute saute si le message serait trop long

// --- Fragments ------------------------------------------------------------------------------------------------
// V16 : les ouvertures et les chutes vivent dans src/i18n/{fr,en}/talk-f.js (« compose.open.<trait>.<ton> »,
// « compose.close.<trait>.<ton> »). Le moteur compose en FRANÇAIS (texte de référence rangé dans la sauvegarde) et
// retient les numéros de variantes (`ref`) pour réafficher le message dans la langue du joueur (talkText).
// Trait : conquerant, heros, batisseur, traitre ; « joueur » = la nation humaine (pas de trait).
const TRAITS = ['conquerant', 'heros', 'batisseur', 'traitre', 'joueur'], TONE_IDS = ['hostile', 'neutre', 'amical'];
const fragments = (kind, lang = 'fr') => Object.freeze(Object.fromEntries(TRAITS.map(tr => [tr, Object.freeze(Object.fromEntries(TONE_IDS.map(to => [to, tl(`compose.${kind}.${tr}.${to}`, lang)])))])));
const OPENINGS = fragments('open');
const CLOSINGS = fragments('close');

// --- Français : élisions ------------------------------------------------------------------------------------------
/** « de Branvale », « d’Îlebrume », « de Haut-Bois » (V16 : règle commune, src/i18n/i18n.js). */
export const deName = deFr;
const roundDown = n => n >= 100 ? Math.floor(n / 50) * 50 : Math.floor(n / 10) * 10;

// --- Contexte réel ------------------------------------------------------------------------------------------------
const provName = (map, id) => map?.provinces?.find(p => p.id === id)?.name || id;
const ownedBy = (state, id) => Object.keys(state.provinces || {}).filter(p => state.provinces[p].ownerId === id).sort();
const soldiersAt = p => (Number(p?.units?.infantry) || 0) + (Number(p?.units?.cavalry) || 0);
const since = (state, started) => Math.max(0, (state.turn || 1) - (Number(started) || state.turn || 1));
/** Provinces qui se font face (frontière ou route maritime) : [[province de from, province de to], …], ordre stable. */
function facing(state, map, from, to) {
  const mine = new Set(ownedBy(state, from)), theirs = new Set(ownedBy(state, to)), out = [];
  for (const d of map?.provinces || []) if (mine.has(d.id)) for (const x of d.landConnections || []) if (theirs.has(x)) out.push([d.id, x]);
  for (const [a, b] of map?.maritimeRoutes || []) { if (mine.has(a) && theirs.has(b)) out.push([a, b]); if (mine.has(b) && theirs.has(a)) out.push([b, a]); }
  return out.sort((x, y) => x.join().localeCompare(y.join()));
}
/**
 * Éléments de contexte disponibles (vrais) pour `from` → `to` au ton `tone` : [{ id, text }]. Au moins un (le tour).
 * Exporté pour les tests.
 */
/** V16 : texte d'un fragment de contexte dans la langue courante (« 3 tours », « 1 province » accordés ici). */
export const contextText = (key, params = {}) => t(key, { ...params, ...(params.n !== undefined ? { turns: t('common.turns', { n: params.n }), provinces: t('common.provinces', { n: params.n }) } : {}) });
export function contextFragments(state, map, { from, to = null, tone }) {
  const T = state.turn || 1, out = [];
  // V16 : chaque fragment = clé de traduction + paramètres ; `text` = texte français (référence).
  const add = (id, key, params = {}) => { const k = `ctx.${key}.${TONE_IDS.includes(tone) ? tone : 'neutre'}`; out.push({ id, key: k, params, text: withLanguage('fr', () => contextText(k, params)) }); };
  const left = gameLengthOf(state) - T;
  if (left > 0 && left <= scaleTurn(state, 10)) add('fin', 'fin', { n: left });
  else add('tour', 'tour', { n: T });
  if (to) {
    const war = (state.diplomacy?.wars || []).find(w => w.active !== false && w.participants?.includes(from) && w.participants?.includes(to));
    const ally = treatyOf(state, from, to, 'alliance'), truce = treatyOf(state, from, to, 'ceasefire');
    if (war && atWar(state, from, to)) { const k = since(state, war.started); add('guerre', k ? 'guerre' : 'guerre0', { n: k }); }
    else if (ally) { const k = since(state, ally.started); add('alliance', k ? 'alliance' : 'alliance0', { n: k }); }
    else if (truce) { const k = since(state, truce.started); add('treve', k ? 'treve' : 'treve0', { n: k }); }
    else add('tension', 'tension', { n: getTension(state, from, to) });
    const face = facing(state, map, from, to);
    if (face.length) {
      const [a, b] = face[Math.floor(chance(state, 'compose-face', T, from, to) * face.length) % face.length];
      add('face', 'face', { A: provName(map, a), B: provName(map, b) });
    }
    // Troupes : seulement dans une province que les deux voient.
    const seenTo = visibleProvinces(state, map, to), seenFrom = visibleProvinces(state, map, from);
    const mine = ownedBy(state, from).filter(id => seenTo.has(id) && soldiersAt(state.provinces[id]) >= 20).sort((x, y) => soldiersAt(state.provinces[y]) - soldiersAt(state.provinces[x]) || x.localeCompare(y))[0];
    if (mine) add('nos-troupes', 'ours', { n: roundDown(soldiersAt(state.provinces[mine])), P: provName(map, mine) });
    const yours = ownedBy(state, to).filter(id => seenFrom.has(id) && soldiersAt(state.provinces[id]) >= 20).sort((x, y) => soldiersAt(state.provinces[y]) - soldiersAt(state.provinces[x]) || x.localeCompare(y))[0];
    if (yours) add('vos-troupes', 'yours', { n: roundDown(soldiersAt(state.provinces[yours])), P: provName(map, yours) });
    const a = ownedBy(state, from).length, b = ownedBy(state, to).length;
    if (a && b) add('provinces', 'provinces', { n: b, a });
  } else {
    const a = ownedBy(state, from).length;
    if (a) add('provinces', 'provincesAll', { n: a });
  }
  return out;
}

// --- Mémoire ------------------------------------------------------------------------------------------------------
const fp = text => hashString(String(text)).toString(36);
/** Mémoire d'un dirigeant (créée au besoin : ancienne sauvegarde). */
export function talkMemoryOf(state, from) {
  state.talkMemory = state.talkMemory && typeof state.talkMemory === 'object' ? state.talkMemory : {};
  const m = state.talkMemory[from];
  if (!m || typeof m !== 'object' || !Array.isArray(m.said) || !Array.isArray(m.cores)) state.talkMemory[from] = { said: Array.isArray(m?.said) ? m.said : [], cores: Array.isArray(m?.cores) ? m.cores : [] };
  return state.talkMemory[from];
}
/** Lecture seule (n'écrit rien dans l'état). */
const peekMemory = (state, from) => state.talkMemory?.[from] && Array.isArray(state.talkMemory[from].said) ? state.talkMemory[from] : { said: [], cores: [] };
/** Texte déjà publié par `from` dans cette partie ? */
export const alreadySaid = (state, from, text) => peekMemory(state, from).said.includes(fp(text));
/** Fond (réplique de talk.js) utilisé récemment par `from`, ou ce tour-ci par un autre dirigeant ? */
export function coreUsed(state, from, template, { recent = 6 } = {}) {
  const h = fp(template);
  if (peekMemory(state, from).cores.slice(-recent).some(([x]) => x === h)) return true;
  return Object.entries(state.talkMemory || {}).some(([id, m]) => id !== from && Array.isArray(m?.cores) && m.cores.some(([x, t]) => x === h && t === state.turn));
}
/** À la publication : retient le texte et son fond. */
export function rememberTalk(state, from, text, core = null) {
  if (!from) return;
  const m = talkMemoryOf(state, from);
  m.said.push(fp(text)); if (m.said.length > SAID_MEMORY) m.said.splice(0, m.said.length - SAID_MEMORY);
  if (core) { m.cores.push([fp(core), state.turn || 1]); if (m.cores.length > CORE_MEMORY) m.cores.splice(0, m.cores.length - CORE_MEMORY); }
}

// --- Composition --------------------------------------------------------------------------------------------------
const traitOf = (state, from) => state.controllers?.[from] === 'human' ? 'joueur' : (OPENINGS[archetypeOf(state, from)] ? archetypeOf(state, from) : 'joueur');
/**
 * Compose une réplique. `core` = fond déjà rempli (noms, or…). Déterministe : mêmes état, graine et clés → même texte.
 * Ne modifie pas l'état (la mémoire est mise à jour à la publication, rememberTalk).
 */
export function composeLine(state, map, args) { return composeLineRef(state, map, args).text; }
/**
 * Comme composeLine, avec la référence de la composition : { text, ref }. `coreRef` = { c: clé de la liste, i: numéro,
 * v: { to, x, p, gold } (identifiants) } décrit le fond ; ref = { ...coreRef, o: [trait, ton, n°], x: [clé, paramètres], k: n° de chute ou -1 }.
 */
export function composeLineRef(state, map, { from, to = null, tone, core, keys = [], coreRef = null }) {
  const trait = traitOf(state, from), t0 = OPENINGS[trait][tone] ? tone : 'neutre';
  const opens = OPENINGS[trait][t0], closes = CLOSINGS[trait][t0], ctx = contextFragments(state, map, { from, to, tone: t0 });
  const r = k => chance(state, 'compose', k, from, to ?? '*', t0, ...keys);
  const o0 = Math.floor(r('o') * opens.length), c0 = Math.floor(r('c') * ctx.length), k0 = Math.floor(r('k') * (closes.length + 2));
  const build = (o, c, k) => {
    const parts = [opens[o], core, ctx[c].text], closing = k < closes.length ? closes[k] : null; // k ≥ longueur : sans chute
    const base = parts.join(' ');
    const kept = closing && base.length + closing.length + 1 <= COMPOSED_MAX;
    return { text: kept ? `${base} ${closing}` : base, ref: coreRef ? { ...coreRef, o: [trait, t0, o], x: [ctx[c].key, ctx[c].params], k: kept ? k : -1 } : null };
  };
  const K = closes.length + 2;
  // Variété : d'abord une ouverture et un contexte absents de ses 3 derniers messages ; puis toute combinaison jamais dite.
  const last = [];
  for (let i = (state.talk || []).length - 1; i >= 0 && last.length < 3; i--) if (state.talk[i].from === from) last.push(state.talk[i].text);
  const fresh = (o, c) => !last.some(x => x.startsWith(opens[o]) || x.includes(ctx[c].text));
  let first = null;
  for (const strict of [true, false]) for (let i = 0; i < opens.length * ctx.length * K; i++) {
    const o = (o0 + i) % opens.length, c = (c0 + Math.floor(i / opens.length)) % ctx.length, k = (k0 + Math.floor(i / (opens.length * ctx.length))) % K;
    if (strict && !fresh(o, c)) continue;
    const built = build(o, c, k);
    first ??= built;
    if (!alreadySaid(state, from, built.text)) return built;
  }
  return first ?? build(o0, c0, k0); // toutes les combinaisons ont servi (n'arrive pas en 80 tours)
}
/** Toutes les listes de fragments (tests : français soigné). */
export function composeFragmentLists() {
  const out = {};
  for (const [trait, byTone] of Object.entries(OPENINGS)) for (const [tone, list] of Object.entries(byTone)) out[`ouverture.${trait}.${tone}`] = list;
  for (const [trait, byTone] of Object.entries(CLOSINGS)) for (const [tone, list] of Object.entries(byTone)) out[`chute.${trait}.${tone}`] = list;
  return out;
}
