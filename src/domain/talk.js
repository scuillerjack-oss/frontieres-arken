// V11 — échanges publics entre dirigeants (retours bêta V9, points 17 et 18 ; docs/V11-contrat.md).
// Module pur : textes pré-écrits, choix déterministe (graine de la partie), aucun DOM, aucun Math.random.
import { chance, pickFrom, atWar, allied, treatyOf, archetypeOf, getTension, addTension, tensionLevel, leaderHint,
  reputation, recentAggressions, aliveNations, strengthOf, TALK_TENSION, talkTensionDelta, talkTensionWorst, noteTalkEffect, charmOf, tensionCap, HOSTILITY_WAR, HOSTILITY_WARNING } from './leaders.js';
export { tensionLevel, leaderHint } from './leaders.js';
import { t, tl, withLanguage, format, getLanguage } from '../i18n/i18n.js';
// V14.4 : répliques composées (ouverture + fond + contexte réel + chute) et mémoire anti-répétition par dirigeant.
import { composeLine, composeLineRef, contextText, rememberTalk, coreUsed } from './talk-compose.js';

export const TONES = Object.freeze(['hostile', 'neutre', 'amical']);
export const TALK_LIMIT = 60;          // fil public : 60 derniers échanges (B8, taille de la sauvegarde)
export const PENDING_LIMIT = 5;        // messages en attente de réponse par nation
export const PENDING_TURNS = 6;        // au-delà, un message sans réponse n'attend plus
export const AI_TALK_PER_TURN = 3;     // au plus 3 messages des dirigeants IA par tour (pas de spam)

// --- Textes pré-écrits : situation -> ton -> variantes. {to} = destinataire, {from} = auteur. -----------------
// V13 : hostile = provocation et humour piquant (jamais d'insulte ni de grossièreté) ; neutre = mesuré ;
// amical = chaleureux. Plusieurs variantes par ton, choisies selon la graine de la partie.
// V13.3 (retours bêta) : au moins neuf variantes par liste et plus aucun commerce (le jeu n'en a pas) ; un dirigeant
// ne reprend pas une réplique de ses RECENT_LINES derniers messages (pickLine). V14.1 : ni une réplique déjà envoyée
// au même tour par un autre dirigeant. V14.2 : le nombre de variantes double (talk-more-lines.js).
// V16 : les répliques vivent dans src/i18n/{fr,en}/talk-*.js, clé « talk.<chemin> » (talk.war.hostile,
// talk.archetype.heros.amical, talk.ai.betrayal…). Le moteur tire dans la liste FRANÇAISE (mêmes tirages qu'avant) ;
// lineRef retrouve la clé et le numéro de la réplique pour la réafficher dans la langue du joueur.
const SITUATIONS = ['war', 'afterAttack', 'aggressor', 'ally', 'ceasefire', 'neighbor', 'default'];
const AI_KEYS = ['coalitionCall', 'coalitionJoin', 'coalitionEnd', 'betrayal', 'betrayed', 'truceBreaker', 'truceBroken', 'heroWarn', 'heroSupport', 'heroAllySupport',
  'conquerorThreat', 'traitorCharm', 'builderPeace', 'ceasefireOffer', 'ceasefireAgain', 'ceasefireGold', 'ceasefireGoldAgain'];
const byTone = prefix => Object.fromEntries(TONES.map(tone => [tone, [...tl(`${prefix}.${tone}`, 'fr')]]));
const LINES = { ...Object.fromEntries(SITUATIONS.map(k => [k, byTone(`talk.${k}`)])), reply: Object.fromEntries(TONES.map(tone => [tone, byTone(`talk.reply.${tone}`)])) };
export const ARCHETYPE_LINES = Object.freeze(Object.fromEntries(['conquerant', 'heros', 'traitre', 'batisseur'].map(a => [a, byTone(`talk.archetype.${a}`)])));
const AI_LINES = Object.fromEntries(AI_KEYS.map(k => [k, [...tl(`talk.ai.${k}`, 'fr')]]));
// Index inverse (listes de talk.js et des demandes d'aide, alliances.js) : réplique française -> [clé, numéro].
const LINE_INDEX = new Map(), LIST_PATH = new WeakMap();
export function indexLines(prefix, tree) {
  const walk = (v, path) => { if (Array.isArray(v)) { LIST_PATH.set(v, path); } if (Array.isArray(v)) v.forEach((line, i) => { if (!LINE_INDEX.has(`${path}|${line}`)) LINE_INDEX.set(`${path}|${line}`, [path, i]); if (!LINE_INDEX.has(line)) LINE_INDEX.set(line, [path, i]); }); else for (const [k, x] of Object.entries(v)) walk(x, `${path}.${k}`); };
  walk(tree, prefix);
}
indexLines('talk', LINES); indexLines('talk.archetype', ARCHETYPE_LINES); indexLines('talk.ai', AI_LINES);
/** Clé et numéro d'une réplique française (gabarit, avant remplissage), ou null. */
export const lastPickedList = line => lastPick?.line === line ? lastPick.list : null;
export const lineRef = (line, list = null) => { const path = list && LIST_PATH.get(list); const i = path ? list.indexOf(line) : -1;
  return i >= 0 ? [path, i] : LINE_INDEX.get(line) || null; };
/** V13.3 : chaque liste de répliques, par chemin (« war.hostile », « ai.betrayal »…) — tests de taille et de contenu. */
export function talkLineLists() {
  const out = {};
  const walk = (v, path) => { if (Array.isArray(v)) out[path] = v; else for (const [k, x] of Object.entries(v)) walk(x, path ? `${path}.${k}` : k); };
  walk(LINES, ''); walk(ARCHETYPE_LINES, 'archetype'); walk(AI_LINES, 'ai');
  return out;
}
/** V13 : toutes les lignes pré-écrites (tests : français soigné, aucune insulte). */
export function allTalkLines() {
  const out = [];
  const walk = v => { if (typeof v === 'string') out.push(v); else if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v === 'object') Object.values(v).forEach(walk); };
  walk(LINES); walk(ARCHETYPE_LINES); walk(AI_LINES);
  return out;
}

// --- V13.3 : anti-répétition ------------------------------------------------------------------------------------
export const RECENT_LINES = 6;         // une réplique ne revient pas parmi les 6 derniers messages d'un dirigeant
const TOKEN = /\{(?:to|from|gold|x|p)\}/g;
const patternCache = new Map();
/** Expression qui reconnaît un message publié à partir de sa réplique (jetons = texte quelconque). */
function linePattern(line) {
  let re = patternCache.get(line);
  if (!re) {
    re = new RegExp(`^${line.split(TOKEN).map(part => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.+?')}$`);
    patternCache.set(line, re);
  }
  return re;
}
/** Textes des RECENT_LINES derniers messages publiés par `from` (lus dans state.talk). */
export function recentTexts(state, from) {
  const out = [];
  for (let i = (state.talk || []).length - 1; i >= 0 && out.length < RECENT_LINES; i--) if (state.talk[i].from === from) out.push(state.talk[i].text);
  return out;
}
/** `line` a-t-elle servi dans les derniers messages de `from` ? */
export const usedRecently = (state, from, line) => { const re = linePattern(line); return recentTexts(state, from).some(t => re.test(t)); };
/**
 * Tirage déterministe (graine + clés, comme pickFrom) puis, à partir de l'index tiré, première réplique que `from`
 * n'a pas utilisée récemment. Si toutes ont servi, la réplique tirée.
 */
let lastPick = null; // V16 : liste de la dernière réplique tirée (pour retrouver sa clé sans ambiguïté)
export function pickLine(state, list, from, ...keys) {
  const line = pickLineRaw(state, list, from, ...keys); lastPick = { line, list }; return line;
}
function pickLineRaw(state, list, from, ...keys) {
  const start = Math.floor(chance(state, ...keys) * list.length) % list.length;
  const recent = recentTexts(state, from), others = sameTurnTexts(state, from);
  if (!recent.length && !others.length && !state.talkMemory) return list[start];
  const free = (line, texts) => { const re = linePattern(line); return !texts.some(t => re.test(t)); };
  // 1. ni parmi ses derniers messages, ni déjà dite ce tour par un autre dirigeant ; 2. au moins pas déjà dite ce tour.
  // V14.4 : les messages publiés sont composés (le fond n'est plus le texte entier) : la mémoire des fonds compte aussi.
  for (const [texts, recentCores] of [[[...recent, ...others], RECENT_LINES], [others, 0]]) for (let i = 0; i < list.length; i++) {
    const line = list[(start + i) % list.length];
    if (free(line, texts) && !coreUsed(state, from, line, { recent: recentCores })) return line;
  }
  return list[start];
}
/** V14.1 (cahier V14 §3 point 5) : textes publiés CE tour par les autres dirigeants (anti-répétition entre nations). */
export function sameTurnTexts(state, from) {
  return (state.talk || []).filter(m => m.turn === state.turn && m.from !== from).map(m => m.text);
}

const nameOf = (map, id) => map?.nations?.find(n => n.id === id)?.short || t('talk.thisNation');
const fill = (text, map, from, to) => withLanguage('fr', () => format(text, { to: to ? nameOf(map, to) : t('talk.public'), from: nameOf(map, from) }));
/** V16 : référence d'un fond (réplique de liste) : clé, numéro, et identifiants de ses jetons. */
const coreRefOf = (line, v) => { const r = lineRef(line, lastPick?.line === line ? lastPick.list : null); return r ? { c: r[0], i: r[1], v } : null; };
/**
 * V16 : texte d'un message (fil, journal, fenêtres) dans la langue courante. Le message garde son texte français
 * (`text`, référence) et, depuis la V16, sa composition (`ref`) : en anglais, il est réécrit à partir de la référence.
 * Sans référence (message d'avant la V16) ou si la référence est illisible : le texte d'origine, tel quel.
 */
export function talkText(msg, map, { force = false } = {}) {
  const text = String(msg?.text ?? '');
  const ref = msg?.ref;
  if (!ref) return text;
  try {
    if (getLanguage() === 'fr' && !force) return text;
    const line = tl(ref.c)[ref.i];
    if (typeof line !== 'string') return text;
    const v = ref.v || {}, nation = id => map?.nations?.find(n => n.id === id)?.short;
    const core = format(line, { to: v.to ? nation(v.to) || t('talk.thisNation') : t('talk.public'), from: nation(v.from) || '', x: v.x ? nation(v.x) || t('talk.thisNation') : t('talk.aggressor'),
      p: v.p ? map?.provinces?.find(p => p.id === v.p)?.name || t('talk.yourProvince') : t('talk.yourProvince'), gold: v.gold ?? '' });
    if (!ref.o) return core;
    const open = tl(`compose.open.${ref.o[0]}.${ref.o[1]}`)[ref.o[2]], close = ref.k >= 0 ? tl(`compose.close.${ref.o[0]}.${ref.o[1]}`)[ref.k] : null;
    const ctx = ref.x ? contextText(ref.x[0], ref.x[1] || {}) : null;
    return [open, core, ctx, close].filter(Boolean).join(' ');
  } catch { return text; }
}
const ownedIds = (state, id) => Object.keys(state.provinces || {}).filter(p => state.provinces[p].ownerId === id);
/** Deux nations voisines : frontière terrestre ou route maritime entre leurs provinces. */
export function neighbors(state, map, a, b) {
  const A = new Set(ownedIds(state, a)), B = new Set(ownedIds(state, b));
  for (const d of map?.provinces || []) if (A.has(d.id) && (d.landConnections || []).some(x => B.has(x))) return true;
  return (map?.maritimeRoutes || []).some(([x, y]) => (A.has(x) && B.has(y)) || (A.has(y) && B.has(x)));
}
/** Situation qui oriente les textes proposés, du point de vue de `from` qui s'adresse à `to`. */
export function talkSituation(state, map, { from, to, replyTo = null }) {
  const original = replyTo ? (state.talk || []).find(m => m.id === replyTo) : null;
  if (original) return { kind: 'reply', original };
  if (!to) return { kind: 'default' };
  if (atWar(state, from, to)) return { kind: 'war' };
  const recent = recentAggressions(state, 8);
  if (recent.some(a => a.attacker === to && a.victim === from)) return { kind: 'afterAttack' };
  if (recent.some(a => a.attacker === to)) return { kind: 'aggressor' };
  if (allied(state, from, to)) return { kind: 'ally' };
  if (treatyOf(state, from, to, 'ceasefire')) return { kind: 'ceasefire' };
  if (neighbors(state, map, from, to)) return { kind: 'neighbor' };
  return { kind: 'default' };
}
function previewOf(state, from, to, tone) {
  if (!to) return tone === 'hostile' ? 'Message à tous : inquiète les autres dirigeants' : 'Message à tous';
  const now = getTension(state, from, to), cap = tensionCap(state, from, to);
  // V14.2 : effet réel selon la personnalité du destinataire, s'il est révélé ; sinon effet habituel… et, pour un
  // message hostile ou amical, la mention que le caractère peut le renforcer (rien n'est dévoilé). Plafond d'alliance
  // ou de trêve appliqué ; avertissement si la tension peut atteindre le seuil de guerre automatique.
  const d = talkTensionDelta(state, from, to, tone, { known: true }), worst = talkTensionWorst(state, from, to, tone);
  const next = Math.max(0, Math.min(cap, now + d)), worstNext = Math.max(0, Math.min(cap, now + worst));
  const effect = tone === 'hostile' ? 'le risque de guerre bondit' : tone === 'amical' ? 'apaise les relations' : 'relations stables';
  // V13 : tension en % ; en guerre, le message ne change pas l'état de guerre.
  if (atWar(state, from, to)) return `En guerre · tension ${now} % → ${next} %`;
  const unsure = worstNext !== next ? `, jusqu’à ${worstNext} % selon son caractère` : '';
  const capped = cap < 100 && now + d > cap ? ` · plafonnée à ${cap} % par ${allied(state, from, to) ? 'votre alliance' : 'la trêve'}` : '';
  const war = cap === 100 && Math.max(next, worstNext) >= HOSTILITY_WAR ? ` · ⚠ dès ${HOSTILITY_WAR} %, guerre déclarée automatiquement` : cap === 100 && Math.max(next,
    worstNext) >= HOSTILITY_WARNING && now < HOSTILITY_WARNING ? ` · ⚠ au bord de la guerre (guerre automatique à ${HOSTILITY_WAR} %)` : '';
  return `Tension ${now} % → ${next} % (${d > 0 ? '+' : '−'}${Math.abs(d)}${unsure}) · ${effect}${capped}${war}`;
}
/** Exactement 3 propositions [{ tone, text, preview }] (hostile, neutre, amical), adaptées à la situation. */
export function talkOptions(state, map, { from, to = null, replyTo = null } = {}) {
  const sit = talkSituation(state, map, { from, to, replyTo });
  const table = sit.kind === 'reply' ? LINES.reply[sit.original.tone] || LINES.reply.neutre : LINES[sit.kind];
  return TONES.map(tone => {
    const core = pickLine(state, table[tone], from, 'talk', state.turn, from, to ?? '*', tone, sit.kind, replyTo ?? '');
    // V14.4 : réplique composée (ouverture + fond + contexte réel).
    const { text, ref } = composeLineRef(state, map, { from, to, tone, core: fill(core, map, from, to), keys: ['talk', state.turn, sit.kind, replyTo ?? ''], coreRef: coreRefOf(core, { from, to }) });
    return { tone, situation: sit.kind, text, core, ref, preview: previewOf(state, from, to, tone) };
  });
}

function nextOrderId(state) {
  state.orders ||= [];
  state.orderSequence = Math.max(1, Number(state.orderSequence) || 1);
  while (state.orders.some(o => o.id === `o${state.orderSequence}`)) state.orderSequence++;
  return `o${state.orderSequence++}`;
}
/**
 * Prépare un message public : un ORDRE { kind:'talk' } publié à la résolution du tour (comme tous les ordres).
 * Un seul message par destinataire et par tour : un nouveau choix remplace le précédent.
 */
export function queueTalk(state, map, { from, to = null, tone, replyTo = null } = {}) {
  if (!TONES.includes(tone)) return { ok: false, error: 'Ton inconnu' };
  if (!state.nations?.[from] || state.nations[from].eliminated) return { ok: false, error: 'Nation inconnue' };
  if (to !== null && (!state.nations[to] || to === from)) return { ok: false, error: 'Destinataire invalide' };
  if (to !== null && state.nations[to].eliminated) return { ok: false, error: 'Cette nation a été éliminée' };
  if (replyTo && !(state.talk || []).some(m => m.id === replyTo)) return { ok: false, error: 'Message introuvable' };
  // V13 : une conversation se termine — on ne répond qu'une fois à un message.
  if (replyTo && alreadyAnswered(state, from, replyTo)) return { ok: false, error: 'Vous avez déjà répondu à ce message' };
  const option = talkOptions(state, map, { from, to, replyTo }).find(o => o.tone === tone);
  state.orders ||= [];
  const old = state.orders.findIndex(o => o.kind === 'talk' && o.status === 'pending' && o.nationId === from && (o.to ?? null) === to);
  if (old >= 0) state.orders.splice(old, 1);
  const order = { id: nextOrderId(state), kind: 'talk', nationId: from, to, tone, text: option.text, core: option.core, ...(option.ref ? { ref: option.ref } : {}), replyTo, turn: state.turn, status: 'pending' };
  state.orders.push(order);
  return { ok: true, orderId: order.id, text: order.text, replaced: old >= 0 };
}

/** V13 : `from` a-t-il déjà répondu (message publié) à `talkId` ? Une réponse ne se donne qu'une fois. */
export function alreadyAnswered(state, from, talkId) {
  return (state.talk || []).some(m => m.from === from && m.replyTo === talkId);
}
/**
 * Publie un message dans le fil : tension, attente de réponse, événement de journal ÉCHANGE.
 * V13 : `awaitReply: false` = message qui n'appelle pas de réponse (réponse à une demande d'aide, par exemple) ;
 * une réponse (replyTo) n'appelle jamais de réponse : la conversation est close.
 */
export function publishTalk(state, { from, to = null, tone, text, replyTo = null, ai = false, awaitReply = true, tension = true, core = null, ref = null }) {
  state.talk ||= []; state.talkPending ||= {};
  state.talkSequence = Math.max(1, Number(state.talkSequence) || 1);
  while (state.talk.some(m => m.id === `t${state.talkSequence}`)) state.talkSequence++;
  const msg = { id: `t${state.talkSequence++}`, turn: state.turn, from, to, tone, text, replyTo, ...(ref ? { ref } : {}) };
  state.talk.push(msg);
  rememberTalk(state, from, text, core); // V14.4 : mémoire anti-répétition (par dirigeant, toute la partie)
  if (state.talk.length > TALK_LIMIT) state.talk.splice(0, state.talk.length - TALK_LIMIT);
  // Répondre à un message le retire de la liste d'attente.
  if (replyTo && state.talkPending[from]) state.talkPending[from] = state.talkPending[from].filter(id => id !== replyTo);
  if (to) {
    // V14.2 : la personnalité du destinataire change l'effet (Conquérant provoqué, Héros charmé, Bâtisseur indifférent).
    if (tension) { addTension(state, from, to, talkTensionDelta(state, from, to, tone), 'talk'); noteTalkEffect(state, from, to, tone); }
    if (state.controllers?.[to] === 'human' && awaitReply && !replyTo) {
      const list = (state.talkPending[to] ||= []);
      list.push(msg.id);
      if (list.length > PENDING_LIMIT) list.splice(0, list.length - PENDING_LIMIT);
    }
  } else if (tone === 'hostile') for (const n of aliveNations(state)) if (n !== from) addTension(state, from, n, 4, 'talk');
  const rep = reputation(state, from);
  if (tone === 'hostile') rep.hostile++; else if (tone === 'amical') rep.friendly++;
  state.events?.push({ turn: state.turn, type: 'talk', nationId: from, target: to, tone, text, talkId: msg.id, replyTo, ai, ...(ref ? { ref } : {}) });
  return msg;
}
/** Nettoie les attentes : ids disparus du fil (limite des 60) ou messages trop anciens. */
export function pruneTalkPending(state) {
  const byId = new Map((state.talk || []).map(m => [m.id, m]));
  for (const [id, list] of Object.entries(state.talkPending || {})) state.talkPending[id] = (list || []).filter(x => byId.has(x) && byId.get(x).turn > state.turn - PENDING_TURNS);
}

// --- Les dirigeants IA prennent la parole --------------------------------------------------------------------
const REPLY_CHANCE = { heros: .6, conquerant: .5, traitre: .8, batisseur: .7 };
function replyTone(state, ai, incoming, sender) {
  const arch = archetypeOf(state, ai), t = getTension(state, ai, sender), revealed = state.leaders?.[ai]?.revealed;
  switch (arch) {
    case 'conquerant': return incoming === 'amical' && strengthOf(state, sender) > strengthOf(state, ai) ? 'neutre' : 'hostile';
    case 'heros': return incoming === 'hostile' ? (t >= 50 ? 'hostile' : 'neutre') : incoming === 'amical' || charmOf(state, ai, sender) >= 2 ? 'amical' : 'neutre';
    case 'batisseur': return incoming === 'hostile' ? 'neutre' : 'amical';
    case 'traitre': return revealed ? (incoming === 'hostile' ? 'hostile' : 'neutre') : 'amical';
    default: return 'neutre';
  }
}
/** V13 : une fois sur deux, le dirigeant parle avec la voix de sa personnalité plutôt qu'avec la ligne de situation. */
function voiced(state, from, arch, tone, situationLines, ...keys) {
  const own = ARCHETYPE_LINES[arch]?.[tone];
  return own && chance(state, 'voice', ...keys) < .5 ? pickLine(state, own, from, 'voice-line', ...keys) : pickLine(state, situationLines, from, ...keys);
}
const lastSpoke = (state, id) => { let last = -99; for (const m of state.talk || []) if (m.from === id && !m.replyTo && m.turn > last) last = m.turn; return last; };
/**
 * Paroles des IA pendant la résolution du tour (après les combats et la diplomatie) :
 *  1. réponses aux messages qui leur ont été adressés ce tour (selon la personnalité) ;
 *  2. une initiative au plus par dirigeant, déclenchée par un événement (trahison subie ou commise, agression,
 *     stratégie de la personnalité), avec un délai minimal de 3 tours hors événement grave.
 * Au plus AI_TALK_PER_TURN messages IA par tour.
 */
export function aiTalk(state, map, { published = [], turnEvents = [] } = {}) {
  // Les propositions diplomatiques publiées plus tôt dans ce tour comptent dans le quota.
  let budget = AI_TALK_PER_TURN - (state.talk || []).filter(m => m.turn === state.turn && state.controllers?.[m.from] === 'ai').length;
  const ais = aliveNations(state).filter(id => state.controllers?.[id] === 'ai');
  // V14.4 : `core` = réplique de situation (fond) ; le message publié est composé (ouverture, contexte réel, chute).
  const say = (from, to, tone, core, replyTo = null) => { if (budget <= 0) return false; budget--;
    const { text, ref } = composeLineRef(state, map, { from, to, tone, core: fill(core, map, from, to), keys: ['ai', state.turn, replyTo ?? ''], coreRef: coreRefOf(core, { from, to }) });
    publishTalk(state, { from, to, tone, text, core, replyTo, ai: true, ref }); return true; };
  // 1. Réponses.
  for (const m of published) {
    if (!m.to || state.controllers?.[m.to] !== 'ai' || state.nations[m.to]?.eliminated) continue;
    // V13 : une réponse clôt la conversation — l'IA ne répond pas « en écho » à une réponse.
    if (m.replyTo) continue;
    const arch = archetypeOf(state, m.to);
    if (chance(state, 'reply', state.turn, m.id) >= (REPLY_CHANCE[arch] ?? .5)) continue;
    const tone = replyTone(state, m.to, m.tone, m.from);
    say(m.to, m.from, tone, voiced(state, m.to, arch, tone, LINES.reply[m.tone][tone], 'reply-text', state.turn, m.id), m.id);
  }
  // 2. Initiatives.
  const spoke = new Set();
  const once = (from, to, tone, text) => { if (spoke.has(from) || !to || state.nations[to]?.eliminated) return; if (say(from, to, tone, text)) spoke.add(from); };
  const line = (key, from, ...k) => pickLine(state, AI_LINES[key], from, key, state.turn, from, ...k);
  for (const e of turnEvents.filter(e => e.type === 'betrayal')) {
    // V14.0 : une trêve rompue a ses propres répliques (les autres parlent d'alliance).
    if (state.controllers?.[e.nationId] === 'ai') once(e.nationId, e.target, 'hostile', line(e.truce ? 'truceBreaker' : 'betrayal', e.nationId, e.target));
    if (state.controllers?.[e.target] === 'ai') once(e.target, e.nationId, 'hostile', line(e.truce ? 'truceBroken' : 'betrayed', e.target, e.nationId));
  }
  for (const e of turnEvents.filter(e => e.type === 'diplomacy' && e.relation === 'war' && e.reason === 'combat')) {
    if (state.controllers?.[e.target] === 'ai' && archetypeOf(state, e.target) !== 'traitre') once(e.target, e.nationId, 'hostile', pickLine(state, LINES.afterAttack.hostile, e.target, 'attacked', state.turn, e.target));
  }
  // V15.1 : la coalition s'annonce par les dirigeants eux-mêmes, avant les paroles ordinaires.
  for (const e of turnEvents) {
    if (e.type === 'coalition-formed') { const voice = (e.members || []).find(m => state.controllers?.[m] === 'ai' && !spoke.has(m)); if (voice) once(voice, e.nationId, 'hostile', line('coalitionCall', voice, e.nationId)); }
    if (e.type === 'coalition-joined' && !spoke.has(e.nationId)) once(e.nationId, e.target, 'hostile', line('coalitionJoin', e.nationId, e.target));
    if (e.type === 'coalition-dissolved' && e.reason === 'receded') { const voice = ais.find(m => m !== e.nationId && !spoke.has(m)); if (voice) once(voice, e.nationId, 'neutre', line('coalitionEnd', voice, e.nationId)); }
  }
  for (const id of ais) {
    if (spoke.has(id) || budget <= 0) continue;
    const arch = archetypeOf(state, id), quiet = state.turn - lastSpoke(state, id) < 3;
    const others = aliveNations(state).filter(n => n !== id);
    const r = chance(state, 'initiative', state.turn, id);
    if (arch === 'heros') {
      const ag = recentAggressions(state, 2).filter(a => a.attacker !== id && a.victim !== id).at(-1);
      if (ag && !quiet) { once(id, ag.attacker, 'hostile', line('heroWarn', id)); continue; }
      if (ag && r < .3) { once(id, ag.victim, 'amical', line(allied(state, id, ag.victim) ? 'heroAllySupport' : 'heroSupport', id)); continue; }
    }
    if (quiet) continue;
    if (arch === 'conquerant' && r < .45) {
      const prey = others.filter(n => !allied(state, id, n)).sort((a, b) => strengthOf(state, a) - strengthOf(state, b) || a.localeCompare(b))[0];
      once(id, prey, 'hostile', line('conquerorThreat', id)); continue;
    }
    if (arch === 'traitre' && !state.leaders?.[id]?.revealed && r < .4) {
      const mark = state.ai?.traitorMark?.[id] || others[0];
      // V13 : jamais d'« offre d'alliance » à une nation déjà alliée : le Traître la flatte, simplement.
      once(id, mark, 'amical', allied(state, id, mark) ? pickLine(state, ARCHETYPE_LINES.traitre.amical, id, 'traitor-flatter', state.turn, id) : line('traitorCharm', id)); continue;
    }
    if (arch === 'batisseur' && r < .25) {
      const n = others.filter(x => neighbors(state, map, id, x) && !atWar(state, id, x));
      if (n.length) { once(id, pickFrom(state, n, 'builder-to', state.turn, id), 'amical', line('builderPeace', id)); continue; }
    }
    // Paroles ordinaires, rares : selon la situation et la personnalité.
    if (r > .9) {
      const to = pickFrom(state, others, 'idle-to', state.turn, id);
      const tone = arch === 'conquerant' ? 'hostile' : arch === 'batisseur' || arch === 'traitre' ? 'amical' : 'neutre';
      const sit = talkSituation(state, map, { from: id, to });
      once(id, to, tone, voiced(state, id, arch, tone, LINES[sit.kind][tone], 'idle', state.turn, id));
    }
  }
}
/** Message d'une IA qui propose une trêve ou une alliance (au joueur, qui répond via la diplomatie). */
export function aiOfferTalk(state, map, from, to, kind, { again = false, gold = 0 } = {}) {
  const set = kind !== 'ceasefire' ? AI_LINES.traitorCharm : gold > 0 ? (again ? AI_LINES.ceasefireGoldAgain : AI_LINES.ceasefireGold) : again ? AI_LINES.ceasefireAgain : AI_LINES.ceasefireOffer;
  const core = pickLine(state, set, from, 'offer', state.turn, from, to), tone = kind === 'ceasefire' ? 'neutre' : 'amical';
  const { text, ref } = composeLineRef(state, map, { from, to, tone, core: fill(core, map, from, to).replaceAll('{gold}', String(gold)), keys: ['offer', state.turn, kind], coreRef: coreRefOf(core, { from, to, gold }) });
  return publishTalk(state, { from, to, tone, text, core, ai: true, ref });
}
