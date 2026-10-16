// V11 — échanges publics entre dirigeants (retours bêta V9, points 17 et 18 ; docs/V11-contrat.md).
// Module pur : textes pré-écrits, choix déterministe (graine de la partie), aucun DOM, aucun Math.random.
import { chance, pickFrom, atWar, allied, treatyOf, archetypeOf, getTension, addTension, tensionLevel, leaderHint,
  reputation, recentAggressions, aliveNations, strengthOf, TALK_TENSION } from './leaders.js';
export { tensionLevel, leaderHint } from './leaders.js';

export const TONES = Object.freeze(['hostile', 'neutre', 'amical']);
export const TALK_LIMIT = 60;          // fil public : 60 derniers échanges (B8, taille de la sauvegarde)
export const PENDING_LIMIT = 5;        // messages en attente de réponse par nation
export const PENDING_TURNS = 6;        // au-delà, un message sans réponse n'attend plus
export const AI_TALK_PER_TURN = 3;     // au plus 3 messages des dirigeants IA par tour (pas de spam)

// --- Textes pré-écrits : situation -> ton -> variantes. {to} = destinataire, {from} = auteur. -----------------
const LINES = {
  war: {
    hostile: ['{to}, chaque province que vous perdrez portera notre nom.', 'Rendez les armes, {to}, ou nous les prendrons sur vos morts.', 'Cette guerre, {to} l’a voulue. Nous la finirons.'],
    neutre: ['La guerre entre nous coûte cher, {to}. Réfléchissez à la suite.', '{to}, nos armées se parlent déjà. Nos dirigeants le peuvent aussi.', 'Nous tenons nos positions, {to}. La suite dépend de vous.'],
    amical: ['{to}, assez de sang versé. Parlons d’une trêve.', 'Nos peuples n’ont rien à gagner à cette guerre, {to}. Cherchons la paix.', '{to}, je tends la main malgré la guerre. Saisissez-la.']
  },
  afterAttack: {
    hostile: ['{to} nous a frappés sans honneur. La réponse viendra.', 'Vous avez attaqué nos terres, {to}. Nous n’oublierons pas.', '{to}, votre agression sera payée au centuple.'],
    neutre: ['{to}, expliquez cette attaque avant qu’elle ne devienne une guerre sans fin.', 'Nous avons noté votre attaque, {to}. Nos prochains gestes en dépendront.', 'Un coup a été porté, {to}. Il peut encore être le dernier.'],
    amical: ['{to}, malgré votre attaque, la paix reste possible.', 'Oublions cet affront, {to}, si vous retirez vos troupes.', '{to}, nous préférons un accord à une revanche.']
  },
  aggressor: {
    hostile: ['{to}, vos conquêtes inquiètent tout Arken. Arrêtez-vous là.', 'Celui qui attaque ses voisins, {to}, finit seul face à tous.', '{to}, une agression de plus et nous entrerons dans la danse.'],
    neutre: ['{to}, toutes les nations observent vos campagnes.', 'Vos armées avancent vite, {to}. Où comptez-vous vous arrêter ?', '{to}, nous restons à l’écart, pour l’instant.'],
    amical: ['{to}, nous n’avons aucun différend avec vous. Gardons-le ainsi.', 'Vos guerres ne nous regardent pas, {to}. Restons en paix.', '{to}, que nos frontières restent calmes quoi qu’il arrive ailleurs.']
  },
  ally: {
    hostile: ['{to}, une alliance se mérite. Vous la méritez de moins en moins.', 'Notre pacte n’est pas un chèque en blanc, {to}.', '{to}, un allié qui nous déçoit n’en est plus un.'],
    neutre: ['{to}, notre alliance tient. Tenons-la ensemble.', 'Allié {to}, tenez-nous informés de vos mouvements.', '{to}, nos armées sont prêtes si l’alliance l’exige.'],
    amical: ['{to}, votre amitié est notre meilleure forteresse.', 'Ensemble, {to}, personne n’osera nous défier.', '{to}, notre alliance est solide. Que tout Arken le sache.']
  },
  ceasefire: {
    hostile: ['{to}, la trêve est fragile. Ne la mettez pas à l’épreuve.', 'Cette trêve ne fait pas de nous des amis, {to}.', '{to}, un faux pas et la trêve est finie.'],
    neutre: ['{to}, la trêve tient. Respectons-la.', 'Le calme est revenu entre nous, {to}. Pour combien de temps ?', '{to}, profitons de la trêve pour reconstruire.'],
    amical: ['{to}, faisons de cette trêve une vraie paix.', 'La trêve nous réussit, {to}. Allons plus loin.', '{to}, la paix vaut mieux que toutes les conquêtes.']
  },
  neighbor: {
    hostile: ['{to}, vos navires s’approchent trop de nos côtes.', 'Nos côtes sont gardées, {to}. Ne tentez rien.', '{to}, la mer qui nous sépare ne vous protégera pas toujours.'],
    neutre: ['{to}, la mer entre nous peut porter des marchands ou des soldats.', 'Bon voisinage, {to}, tant que chacun reste chez soi.', '{to}, nous surveillons nos routes maritimes, comme vous.'],
    amical: ['{to}, ouvrons nos ports au commerce plutôt qu’aux armées.', 'Voisins et amis, {to} ? Nous le souhaitons.', '{to}, nos côtes sont proches : que nos peuples le soient aussi.']
  },
  default: {
    hostile: ['{to}, ne vous croyez pas à l’abri de notre colère.', 'Nous n’avons pas oublié votre arrogance, {to}.', '{to}, votre heure viendra.'],
    neutre: ['{to}, nous suivons vos choix avec attention.', 'Rien ne nous oppose encore, {to}.', '{to}, que chacun garde ses frontières.'],
    amical: ['{to}, recevez le salut de notre peuple.', 'Nous souhaitons de bonnes relations avec {to}.', '{to}, l’amitié entre nos nations serait utile à tous.']
  },
  // Réponse : ton du message reçu -> ton de la réponse.
  reply: {
    hostile: {
      hostile: ['Vos menaces ne nous effraient pas, {to}.', 'Nous répondrons à la force par la force, {to}.', 'Des mots durs, {to} ? Nous avons aussi des armées.'],
      neutre: ['Nous prenons acte, {to}. Inutile d’élever le ton.', 'Vos paroles sont notées, {to}. Nos actes parleront.', 'Calmez-vous, {to}. Personne n’y gagnerait.'],
      amical: ['Nous ne cherchons pas la querelle, {to}. Apaisons les esprits.', 'Pourquoi tant de colère, {to} ? Parlons plutôt.', 'Nous préférons la paix, {to}, même après de tels mots.']
    },
    neutre: {
      hostile: ['Votre prudence ne vous sauvera pas, {to}.', 'Nous n’avons rien à vous dire, {to}, sinon : méfiez-vous.', 'Gardez vos conseils, {to}.'],
      neutre: ['Entendu, {to}.', 'Message reçu, {to}. Nous verrons.', 'Soit, {to}. Chacun chez soi.'],
      amical: ['Merci de ces mots mesurés, {to}. Gardons ce ton.', 'Volontiers, {to}. Le dialogue nous convient.', 'Sage parole, {to}. Nous la partageons.']
    },
    amical: {
      hostile: ['Vos sourires ne nous trompent pas, {to}.', 'Gardez vos politesses, {to}. Nous voyons clair.', 'Des mots doux, {to} ? Nous jugerons sur les actes.'],
      neutre: ['Nous verrons ce que valent ces paroles, {to}.', 'Belles paroles, {to}. Attendons les actes.', 'Bien reçu, {to}. Nous restons prudents.'],
      amical: ['Avec plaisir, {to}. Notre amitié vous est acquise.', 'Nous partageons ce souhait, {to}.', 'Que cette entente dure, {to}.']
    }
  }
};
// Répliques propres aux personnalités des dirigeants IA (initiatives).
const AI_LINES = {
  betrayal: ['{to}, une alliance n’est qu’un outil. Le vôtre est usé.', 'Vous nous faisiez confiance, {to} ? C’était votre erreur.', 'Les traités sont faits pour les naïfs, {to}.'],
  betrayed: ['{to} nous a trahis. Que tout Arken le sache : on ne peut se fier à sa parole.', 'Trahison ! {to} a planté sa lame dans le dos de son allié.', '{to} rompt notre alliance par les armes. Nous n’oublierons jamais.'],
  heroWarn: ['{to}, attaquer les plus faibles est indigne. Cessez, ou nous interviendrons.', 'Nous ne laisserons pas {to} écraser ses voisins.', '{to}, chaque agression de plus vous rapproche de notre colère.'],
  heroSupport: ['{to}, vous n’êtes pas seuls face à l’agresseur.', 'Courage, {to}. Nos armées sont prêtes à vous défendre.', '{to}, notre alliance vous est offerte contre l’envahisseur.'],
  conquerorThreat: ['{to}, vos terres seront bientôt les nôtres.', 'Soumettez-vous, {to}, et vous garderez peut-être votre trône.', '{to}, Arken n’aura qu’un seul maître.'],
  traitorCharm: ['{to}, une alliance entre nous ferait trembler Arken. Qu’en dites-vous ?', 'Nous n’avons que de l’estime pour {to}. Unissons-nous.', '{to}, soyons alliés : vos ennemis seront les nôtres.'],
  builderPeace: ['{to}, nos chantiers ont besoin de paix. Commerçons.', 'Nous bâtissons, {to}, nous ne conquérons pas.', '{to}, nos ports sont ouverts à vos marchands.'],
  ceasefireOffer: ['{to}, cessons ce combat. Une trêve servirait nos deux peuples.', 'Assez, {to}. Nous proposons de déposer les armes.', '{to}, nous sommes prêts à signer une trêve.']
};

const nameOf = (map, id) => map?.nations?.find(n => n.id === id)?.short || 'tous';
const fill = (text, map, from, to) => text.replaceAll('{to}', to ? nameOf(map, to) : 'peuples d’Arken').replaceAll('{from}', nameOf(map, from));
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
  const d = TALK_TENSION[tone], now = getTension(state, from, to), next = Math.max(0, Math.min(100, now + d));
  const effect = tone === 'hostile' ? 'le risque de guerre augmente' : tone === 'amical' ? 'apaise les relations' : 'relations stables';
  return `Tension ${now} → ${next} (${d > 0 ? '+' : '−'}${Math.abs(d)}) · ${effect}`;
}
/** Exactement 3 propositions [{ tone, text, preview }] (hostile, neutre, amical), adaptées à la situation. */
export function talkOptions(state, map, { from, to = null, replyTo = null } = {}) {
  const sit = talkSituation(state, map, { from, to, replyTo });
  const table = sit.kind === 'reply' ? LINES.reply[sit.original.tone] || LINES.reply.neutre : LINES[sit.kind];
  return TONES.map(tone => ({
    tone, situation: sit.kind,
    text: fill(pickFrom(state, table[tone], 'talk', state.turn, from, to ?? '*', tone, sit.kind, replyTo ?? ''), map, from, to),
    preview: previewOf(state, from, to, tone)
  }));
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
  const option = talkOptions(state, map, { from, to, replyTo }).find(o => o.tone === tone);
  state.orders ||= [];
  const old = state.orders.findIndex(o => o.kind === 'talk' && o.status === 'pending' && o.nationId === from && (o.to ?? null) === to);
  if (old >= 0) state.orders.splice(old, 1);
  const order = { id: nextOrderId(state), kind: 'talk', nationId: from, to, tone, text: option.text, replyTo, turn: state.turn, status: 'pending' };
  state.orders.push(order);
  return { ok: true, orderId: order.id, text: order.text, replaced: old >= 0 };
}

/** Publie un message dans le fil : tension, attente de réponse, événement de journal ÉCHANGE. */
export function publishTalk(state, { from, to = null, tone, text, replyTo = null, ai = false }) {
  state.talk ||= []; state.talkPending ||= {};
  state.talkSequence = Math.max(1, Number(state.talkSequence) || 1);
  while (state.talk.some(m => m.id === `t${state.talkSequence}`)) state.talkSequence++;
  const msg = { id: `t${state.talkSequence++}`, turn: state.turn, from, to, tone, text, replyTo };
  state.talk.push(msg);
  if (state.talk.length > TALK_LIMIT) state.talk.splice(0, state.talk.length - TALK_LIMIT);
  // Répondre à un message le retire de la liste d'attente.
  if (replyTo && state.talkPending[from]) state.talkPending[from] = state.talkPending[from].filter(id => id !== replyTo);
  if (to) {
    addTension(state, from, to, TALK_TENSION[tone] ?? 0, 'talk');
    if (state.controllers?.[to] === 'human') {
      const list = (state.talkPending[to] ||= []);
      list.push(msg.id);
      if (list.length > PENDING_LIMIT) list.splice(0, list.length - PENDING_LIMIT);
    }
  } else if (tone === 'hostile') for (const n of aliveNations(state)) if (n !== from) addTension(state, from, n, 4, 'talk');
  const rep = reputation(state, from);
  if (tone === 'hostile') rep.hostile++; else if (tone === 'amical') rep.friendly++;
  state.events?.push({ turn: state.turn, type: 'talk', nationId: from, target: to, tone, text, talkId: msg.id, replyTo, ai });
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
    case 'heros': return incoming === 'hostile' ? (t >= 50 ? 'hostile' : 'neutre') : incoming === 'amical' ? 'amical' : 'neutre';
    case 'batisseur': return incoming === 'hostile' ? 'neutre' : 'amical';
    case 'traitre': return revealed ? (incoming === 'hostile' ? 'hostile' : 'neutre') : 'amical';
    default: return 'neutre';
  }
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
  const say = (from, to, tone, text, replyTo = null) => { if (budget <= 0) return false; budget--; publishTalk(state, { from, to, tone, text: fill(text, map, from, to), replyTo, ai: true }); return true; };
  // 1. Réponses.
  for (const m of published) {
    if (!m.to || state.controllers?.[m.to] !== 'ai' || state.nations[m.to]?.eliminated) continue;
    const arch = archetypeOf(state, m.to);
    if (chance(state, 'reply', state.turn, m.id) >= (REPLY_CHANCE[arch] ?? .5)) continue;
    const tone = replyTone(state, m.to, m.tone, m.from);
    say(m.to, m.from, tone, pickFrom(state, LINES.reply[m.tone][tone], 'reply-text', state.turn, m.id), m.id);
  }
  // 2. Initiatives.
  const spoke = new Set();
  const once = (from, to, tone, text) => { if (spoke.has(from) || !to || state.nations[to]?.eliminated) return; if (say(from, to, tone, text)) spoke.add(from); };
  const line = (key, ...k) => pickFrom(state, AI_LINES[key], key, state.turn, ...k);
  for (const e of turnEvents.filter(e => e.type === 'betrayal')) {
    if (state.controllers?.[e.nationId] === 'ai') once(e.nationId, e.target, 'hostile', line('betrayal', e.nationId, e.target));
    if (state.controllers?.[e.target] === 'ai') once(e.target, e.nationId, 'hostile', line('betrayed', e.target, e.nationId));
  }
  for (const e of turnEvents.filter(e => e.type === 'diplomacy' && e.relation === 'war' && e.reason === 'combat')) {
    if (state.controllers?.[e.target] === 'ai' && archetypeOf(state, e.target) !== 'traitre') once(e.target, e.nationId, 'hostile', pickFrom(state, LINES.afterAttack.hostile, 'attacked', state.turn, e.target));
  }
  for (const id of ais) {
    if (spoke.has(id) || budget <= 0) continue;
    const arch = archetypeOf(state, id), quiet = state.turn - lastSpoke(state, id) < 3;
    const others = aliveNations(state).filter(n => n !== id);
    const r = chance(state, 'initiative', state.turn, id);
    if (arch === 'heros') {
      const ag = recentAggressions(state, 2).filter(a => a.attacker !== id && a.victim !== id).at(-1);
      if (ag && !quiet) { once(id, ag.attacker, 'hostile', line('heroWarn', id)); continue; }
      if (ag && r < .3) { once(id, ag.victim, 'amical', line('heroSupport', id)); continue; }
    }
    if (quiet) continue;
    if (arch === 'conquerant' && r < .45) {
      const prey = others.filter(n => !allied(state, id, n)).sort((a, b) => strengthOf(state, a) - strengthOf(state, b) || a.localeCompare(b))[0];
      once(id, prey, 'hostile', line('conquerorThreat', id)); continue;
    }
    if (arch === 'traitre' && !state.leaders?.[id]?.revealed && r < .4) {
      const mark = state.ai?.traitorMark?.[id] || others[0];
      once(id, mark, 'amical', line('traitorCharm', id)); continue;
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
      once(id, to, tone, pickFrom(state, LINES[sit.kind][tone], 'idle', state.turn, id));
    }
  }
}
/** Message d'une IA qui propose une trêve ou une alliance (au joueur, qui répond via la diplomatie). */
export function aiOfferTalk(state, map, from, to, kind) {
  const text = kind === 'ceasefire' ? pickFrom(state, AI_LINES.ceasefireOffer, 'offer', state.turn, from, to) : pickFrom(state, AI_LINES.traitorCharm, 'offer', state.turn, from, to);
  return publishTalk(state, { from, to, tone: kind === 'ceasefire' ? 'neutre' : 'amical', text: fill(text, map, from, to), ai: true });
}
