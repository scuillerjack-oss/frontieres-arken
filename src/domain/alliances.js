// V13 — demandes d'aide entre alliés (docs/V13-alliances-echanges.md).
// Module pur (aucun DOM, aucun Math.random) : les réponses dépendent de la personnalité de l'allié et de la graine.
//
// Le joueur demande à un allié IA : « Défends-moi » (contre une nation, sur une province, ou contre quiconque
// m'attaque) ou « Attaque X avec moi ». La demande est un ORDRE { kind:'help' } résolu à l'inter-tour : l'allié
// répond dans les Échanges (message sans bouton « Répondre ») et dans le journal (AIDE). Une acceptation crée un
// engagement `state.diplomacy.help[]` de HELP_TURNS tours que l'IA de l'allié applique dans ses ordres
// (game-engine.js, aiPlan) : guerre déclarée + attaques contre X, ou renforts vers sa base navale et guerre à
// l'agresseur. Le Traître accepte toujours… et ne vient jamais (engagement `fake`), ce qui se voit à l'échéance.
import { chance, pickFrom, archetypeOf, allied, atWar, aliveNations, getTension, addTension, recentAggressions, reputation } from './leaders.js';
import { publishTalk } from './talk.js';

export const HELP_KINDS = Object.freeze(['defend', 'attack']);
export const HELP_TURNS = 5;
const nameOf = (map, id) => map?.nations?.find(n => n.id === id)?.short || 'cette nation';
const provinceName = (map, id) => map?.provinces?.find(p => p.id === id)?.name || 'votre province';

// Réponses des alliés, selon leur personnalité. {to} = demandeur, {x} = nation visée, {p} = province.
const HELP_LINES = {
  heros: {
    defend: { yes: ['{to}, nos armées marchent. Personne ne vous touchera sans nous trouver en travers du chemin.', 'Comptez sur nous, {to}. Un allié menacé est une cause sacrée.'],
      no: ['{to}, nous ne pouvons pas vous suivre sur ce terrain.'] },
    attack: { yes: ['Si {x} l’a mérité, {to}, nous serons à vos côtés.', '{x} a trop longtemps abusé de sa force. Nous marchons avec vous, {to}.'],
      no: ['{to}, nous défendons, nous n’envahissons pas. {x} ne nous a rien fait.', 'Une guerre injuste reste injuste, {to}, même entre alliés.'] }
  },
  conquerant: {
    defend: { yes: ['Soit, {to}. Nos troupes iront là où l’on se bat : c’est là que nous aimons être.'],
      no: ['Vous défendre, {to} ? Nous avons nos propres conquêtes à mener.', 'Défendez-vous vous-mêmes, {to}. Nous, nous attaquons.'] },
    attack: { yes: ['{x} ? Avec plaisir, {to}. Nous avions justement faim de nouvelles terres.', 'Enfin une idée qui nous plaît, {to}. Sus à {x} !'],
      no: ['Pas maintenant, {to}. Nous choisissons nos proies nous-mêmes.'] }
  },
  batisseur: {
    defend: { yes: ['Nos remparts sont aussi les vôtres, {to}. Nous tiendrons la frontière.', 'Nous viendrons, {to}. On ne laisse pas un voisin seul quand l’incendie approche.'],
      no: ['Nous sommes navrés, {to} : nos armées gardent nos chantiers.'] },
    attack: { yes: ['Puisqu’il le faut, {to}… Nous viendrons contre {x}, mais à contrecœur.'],
      no: ['{to}, nous bâtissons des ponts, pas des sièges. Sans nous.', 'Une guerre de plus ? Nos maçons ont mieux à faire, {to}.', 'Attaquer {x} ? Nos chantiers n’y survivraient pas, {to}. C’est non.'] }
  },
  traitre: {
    defend: { yes: ['Mais bien sûr, {to} ! Nos armées sont déjà en route.', 'Pour vous, {to}, tout ce que vous voudrez. Nous serons là.'], no: ['Hélas, {to}, pas cette fois.'] },
    attack: { yes: ['Considérez que c’est fait, {to}. {x} ne verra rien venir.', 'Avec joie, {to} ! Nous frapperons {x} ensemble.'], no: ['Hélas, {to}, pas cette fois.'] }
  },
  allyOfTarget: ['{x} est aussi notre allié, {to}. Nous ne lèverons pas la main sur lui.']
};

const pendingHelp = (state, from, to) => (state.orders || []).find(o => o.kind === 'help' && o.status === 'pending' && o.nationId === from && o.to === to) || null;
export const helpPacts = state => (state.diplomacy && Array.isArray(state.diplomacy.help)) ? state.diplomacy.help : [];

/** Une demande d'aide est-elle possible ? { ok, error } — messages clairs pour l'interface. */
export function helpRequestStatus(state, { from, to, kind, target = null, provinceId = null } = {}) {
  if (!HELP_KINDS.includes(kind)) return { ok: false, error: 'Demande inconnue' };
  if (!state.nations?.[from] || !state.nations?.[to] || from === to) return { ok: false, error: 'Allié invalide' };
  if (state.nations[from].eliminated || state.nations[to].eliminated) return { ok: false, error: 'Cette nation a été éliminée' };
  if (!allied(state, from, to)) return { ok: false, error: 'Seul un allié peut vous venir en aide' };
  if (state.controllers?.[to] !== 'ai') return { ok: false, error: 'Cet allié est dirigé par un joueur' };
  if (target !== null) {
    if (!state.nations[target] || target === from || target === to) return { ok: false, error: 'Nation visée invalide' };
    if (state.nations[target].eliminated) return { ok: false, error: 'Cette nation a été éliminée' };
    if (allied(state, from, target)) return { ok: false, error: 'Cette nation est votre alliée' };
  }
  if (kind === 'attack' && target === null) return { ok: false, error: 'Choisissez la nation à attaquer' };
  if (provinceId !== null && state.provinces?.[provinceId]?.ownerId !== from) return { ok: false, error: 'Cette province n’est pas à vous' };
  return { ok: true };
}
function nextOrderId(state) {
  state.orders ||= [];
  state.orderSequence = Math.max(1, Number(state.orderSequence) || 1);
  while (state.orders.some(o => o.id === `o${state.orderSequence}`)) state.orderSequence++;
  return `o${state.orderSequence++}`;
}
/**
 * Prépare une demande d'aide (ordre `help`, résolu à l'inter-tour). Une seule demande par allié et par tour :
 * une nouvelle demande remplace la précédente. Gratuite (aucun paiement).
 */
export function queueHelpRequest(state, { from, to, kind, target = null, provinceId = null } = {}) {
  const st = helpRequestStatus(state, { from, to, kind, target, provinceId });
  if (!st.ok) return st;
  const old = pendingHelp(state, from, to);
  if (old) state.orders.splice(state.orders.indexOf(old), 1);
  const order = { id: nextOrderId(state), kind: 'help', nationId: from, to, help: kind, target, provinceId, turn: state.turn, status: 'pending' };
  state.orders.push(order);
  return { ok: true, orderId: order.id, replaced: Boolean(old) };
}

/**
 * Décision de l'allié, selon sa personnalité (déterministe) : { accept, fake, reason }.
 *  - Héros : vient toujours défendre ; attaque un agresseur ou une nation qu'il déteste, rarement sinon (35 %).
 *  - Conquérant : attaque volontiers (90 %) ; défend s'il est déjà en guerre contre l'agresseur, sinon 40 %.
 *  - Bâtisseur : refuse souvent d'attaquer (15 %, 60 % s'il est déjà en guerre contre X) ; défend à 75 %.
 *  - Traître : accepte tout… et ne vient pas (`fake`).
 * Jamais contre un allié de l'allié.
 */
export function helpDecision(state, ally, { from, kind, target = null, provinceId = null }) {
  if (target && allied(state, ally, target)) return { accept: false, fake: false, reason: 'ally-of-target' };
  const arch = archetypeOf(state, ally) || 'batisseur';
  const r = chance(state, 'help', state.turn, ally, from, kind, target ?? provinceId ?? '*');
  const aggressor = target && recentAggressions(state, 10).some(a => a.attacker === target);
  let accept;
  switch (arch) {
    case 'traitre': return { accept: true, fake: true, reason: 'traitor' };
    case 'heros': accept = kind === 'defend' ? true : Boolean(aggressor || getTension(state, ally, target) >= 50 || r < .35); break;
    case 'conquerant': accept = kind === 'attack' ? r < .9 : Boolean((target && atWar(state, ally, target)) || r < .4); break;
    case 'batisseur': accept = kind === 'attack' ? r < (atWar(state, ally, target) ? .6 : .15) : r < .75; break;
    default: accept = r < .5;
  }
  return { accept, fake: false, reason: arch };
}
const fillHelp = (text, map, to, target, provinceId) => text.replaceAll('{to}', nameOf(map, to)).replaceAll('{x}', target ? nameOf(map, target) : 'l’agresseur').replaceAll('{p}', provinceName(map, provinceId));

/** Inter-tour : chaque demande reçoit sa réponse (Échanges + journal) ; une acceptation crée un engagement. */
export function resolveHelpRequests(state, map, locked) {
  const orders = locked.filter(o => o.kind === 'help').sort((a, b) => a.nationId.localeCompare(b.nationId) || a.to.localeCompare(b.to) || String(a.id).localeCompare(String(b.id)));
  for (const o of orders) {
    const req = { from: o.nationId, to: o.to, kind: o.help, target: o.target ?? null, provinceId: o.provinceId ?? null };
    if (!helpRequestStatus(state, req).ok) continue; // alliance rompue ou nation éliminée entre-temps
    const d = helpDecision(state, o.to, req);
    const arch = archetypeOf(state, o.to) || 'batisseur';
    const pool = d.reason === 'ally-of-target' ? HELP_LINES.allyOfTarget : HELP_LINES[arch]?.[req.kind]?.[d.accept ? 'yes' : 'no'] || HELP_LINES.batisseur.defend.no;
    const text = fillHelp(pickFrom(state, pool, 'help-line', state.turn, o.to, o.nationId, req.kind), map, o.nationId, req.target, req.provinceId);
    const msg = publishTalk(state, { from: o.to, to: o.nationId, tone: d.accept ? 'amical' : 'neutre', text, ai: true, awaitReply: false, tension: false });
    if (d.accept) {
      state.diplomacy.help = helpPacts(state).filter(p => !(p.ally === o.to && p.requester === o.nationId && p.kind === req.kind));
      state.diplomacy.help.push({ ally: o.to, requester: o.nationId, kind: req.kind, against: req.target, provinceId: req.provinceId, turn: state.turn, until: state.turn + HELP_TURNS, ...(d.fake ? { fake: true } : {}) });
      if (!d.fake && req.target) addTension(state, o.to, req.target, req.kind === 'attack' ? 20 : 10, 'help');
      reputation(state, o.to).friendly++;
    }
    state.events.push({ turn: state.turn, type: 'help-answer', nationId: o.to, target: o.nationId, help: req.kind, against: req.target, provinceId: req.provinceId, accepted: d.accept, turns: HELP_TURNS, talkId: msg.id });
  }
}
/** Engagements réellement tenus par `ally` ce tour-ci (le Traître n'en tient aucun). */
export function activeHelpPacts(state, ally) {
  return helpPacts(state).filter(p => p.ally === ally && !p.fake && p.until >= state.turn && allied(state, p.ally, p.requester) && !state.nations?.[p.requester]?.eliminated);
}
/**
 * Nations que l'allié doit combattre au titre d'un engagement :
 *  - attaque : la nation visée ;
 *  - défense contre X : X s'il est en guerre contre le demandeur (sinon renforts seulement) ;
 *  - défense d'une province / générale : toute nation en guerre contre le demandeur, ou qui l'a attaqué récemment
 *    (de préférence celles qui touchent la province).
 * Jamais un allié de l'allié, jamais une nation éliminée.
 */
export function helpEnemies(state, map, pact) {
  const ok = n => n && n !== pact.ally && n !== pact.requester && !state.nations?.[n]?.eliminated && !allied(state, pact.ally, n);
  if (pact.kind === 'attack') return ok(pact.against) ? [pact.against] : [];
  if (pact.against) return ok(pact.against) && (atWar(state, pact.requester, pact.against) || recentAggressions(state, 3).some(a => a.attacker === pact.against && a.victim === pact.requester)) ? [pact.against] : [];
  const foes = aliveNations(state).filter(n => ok(n) && (atWar(state, pact.requester, n) || recentAggressions(state, 3).some(a => a.attacker === n && a.victim === pact.requester)));
  if (!pact.provinceId) return foes;
  const d = map?.provinces?.find(p => p.id === pact.provinceId);
  const near = n => (d?.landConnections || []).some(id => state.provinces?.[id]?.ownerId === n)
    || (map?.maritimeRoutes || []).some(([a, b]) => (a === pact.provinceId && state.provinces?.[b]?.ownerId === n) || (b === pact.provinceId && state.provinces?.[a]?.ownerId === n));
  const close = foes.filter(near);
  return close.length ? close : foes;
}
/** Toutes les nations à combattre pour `ally` (union de ses engagements tenus). */
export function helpWarTargets(state, map, ally) {
  const out = new Set();
  for (const p of activeHelpPacts(state, ally)) for (const n of helpEnemies(state, map, p)) out.add(n);
  return out;
}
/** Fin de tour : engagements échus retirés ; une promesse de Traître non tenue se remarque (journal). */
export function expireHelpPacts(state) {
  if (!Array.isArray(state.diplomacy?.help)) return;
  const keep = [];
  for (const p of state.diplomacy.help) {
    const broken = !allied(state, p.ally, p.requester) || state.nations?.[p.ally]?.eliminated || state.nations?.[p.requester]?.eliminated;
    if (p.until > state.turn && !broken) { keep.push(p); continue; }
    if (p.fake && !broken) {
      reputation(state, p.ally).brokenPromises = (reputation(state, p.ally).brokenPromises || 0) + 1;
      state.events.push({ turn: state.turn, type: 'help-broken', nationId: p.ally, target: p.requester, help: p.kind, against: p.against ?? null });
    } else if (!broken) state.events.push({ turn: state.turn, type: 'help-ended', nationId: p.ally, target: p.requester, help: p.kind, against: p.against ?? null });
  }
  state.diplomacy.help = keep;
}
/** Texte de journal (AIDE) d'un événement d'aide, vu par `reader`. */
export function helpJournalText(event, map, reader) {
  const ally = nameOf(map, event.nationId), x = event.against ? nameOf(map, event.against) : null;
  const what = event.help === 'attack' ? `d’attaquer ${x} avec vous` : x ? `de vous défendre contre ${x}` : event.provinceId ? `de défendre ${provinceName(map, event.provinceId)}` : 'de vous défendre';
  const you = event.target === reader;
  if (event.type === 'help-answer') return event.accepted
    ? `${ally} accepte ${you ? what : 'une demande d’aide'} (${event.turns ?? HELP_TURNS} tours).`
    : `${ally} refuse ${you ? what : 'une demande d’aide'}.`;
  if (event.type === 'help-broken') return `${ally} avait promis ${what}… et n’est jamais venu.`;
  return `Fin de l’engagement : ${ally} a tenu sa promesse ${what}.`;
}
