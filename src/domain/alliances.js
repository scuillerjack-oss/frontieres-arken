// V13 — demandes d'aide entre alliés (docs/V13-alliances-echanges.md).
// Module pur (aucun DOM, aucun Math.random) : les réponses dépendent de la personnalité de l'allié et de la graine.
//
// Le joueur demande à un allié IA : « Défends-moi » (contre une nation, sur une province, ou contre quiconque
// m'attaque) ou « Attaque X avec moi ». La demande est un ORDRE { kind:'help' } résolu à l'inter-tour : l'allié
// répond dans les Échanges (message sans bouton « Répondre ») et dans le journal (AIDE). Une acceptation crée un
// engagement `state.diplomacy.help[]` de HELP_TURNS tours que l'IA de l'allié applique dans ses ordres
// (game-engine.js, aiPlan) : guerre déclarée + attaques contre X, ou renforts vers sa base navale et guerre à
// l'agresseur. Le Traître accepte toujours… et ne vient jamais (engagement `fake`), ce qui se voit à l'échéance.
import { chance, archetypeOf, allied, atWar, aliveNations, getTension, addTension, recentAggressions, reputation, charmOf } from './leaders.js';
import { publishTalk, neighbors, pickLine, indexLines, lineRef, lastPickedList } from './talk.js';
import { t, tl, withLanguage, format } from '../i18n/i18n.js';
import { composeLineRef } from './talk-compose.js'; // V14.4 : réponses d'aide composées (ouverture + fond + contexte réel)

export const HELP_KINDS = Object.freeze(['defend', 'attack']);
/**
 * V14.2 (retour de Jack : « 5 tours : pendant ? dans ? trajet compris ? ») : durée de l'aide UNE FOIS LES TROUPES
 * ARRIVÉES. L'engagement dure donc trajet + HELP_TURNS tours (avant la V14.2, le trajet était pris sur les 5 tours :
 * un allié à 2 ou 3 tours de mer n'aidait vraiment que 2 ou 3 tours).
 */
export const HELP_TURNS = 5;
/** Trajet le plus long envisagé pour une aide (au-delà, on garde ce plafond : l'estimation reste lisible). */
export const HELP_MAX_TRAVEL = 4;
/**
 * V14.2 : trajet estimé (en tours) des troupes de `ally` jusqu'au lieu de l'aide : provinces du demandeur (défense ;
 * la province demandée si elle est précisée) ou de la nation visée (attaque). 1 tour par la terre, la durée de la
 * traversée par la mer ; une escale chez le demandeur ajoute 1 tour. `routes(id)` = destinations légales depuis une
 * province ([{ id, type, turns }]) — fournie par le moteur pour garder ce module sans géométrie.
 * Compté depuis le tour où le joueur lit la réponse (les troupes partent pendant ce tour) : un trajet de 2 tours =
 * troupes sur place au début du 2e tour suivant. Aucune route : null (l'allié promet, mais ne pourra peut-être pas venir).
 */
export function helpTravelTurns(state, ally, { requester, kind, target = null, provinceId = null }, routes) {
  if (typeof routes !== 'function') return 1;
  const goal = kind === 'attack' ? target : requester;
  const owned = Object.keys(state.provinces || {}).filter(id => state.provinces[id].ownerId === ally).sort();
  const wanted = new Set(provinceId && kind !== 'attack' ? [provinceId] : Object.keys(state.provinces || {}).filter(id => state.provinces[id].ownerId === goal));
  const step = r => r.type === 'sea' ? Math.max(1, Number(r.turns) || 2) : 1;
  let best = Infinity;
  for (const from of owned) for (const r of routes(from) || []) {
    if (wanted.has(r.id)) best = Math.min(best, step(r));
    else if (state.provinces[r.id]?.ownerId === requester) for (const r2 of routes(r.id) || []) if (wanted.has(r2.id) && r2.type === 'land') best = Math.min(best, step(r) + 1);
  }
  return Number.isFinite(best) ? Math.min(HELP_MAX_TRAVEL, best) : null;
}
const nameOf = (map, id) => map?.nations?.find(n => n.id === id)?.short || t('talk.thisNation');
const provinceName = (map, id) => map?.provinces?.find(p => p.id === id)?.name || t('talk.yourProvince');

// Réponses des alliés, selon leur personnalité. {to} = demandeur, {x} = nation visée, {p} = province.
// V16 : les réponses vivent dans src/i18n/{fr,en}/talk-*.js, clé « help.<chemin> » (help.heros.defend.yes…).
const helpList = path => [...tl(`help.${path}`, 'fr')];
const HELP_LINES = {
  ...Object.fromEntries(['heros', 'conquerant', 'batisseur', 'traitre'].map(a => [a, Object.fromEntries(HELP_KINDS.map(k => [k, { yes: helpList(`${a}.${k}.yes`), no: helpList(`${a}.${k}.no`) }]))])),
  allyOfTarget: helpList('allyOfTarget'), outOfReach: helpList('outOfReach')
};
indexLines('help', HELP_LINES);

/** V14.2 : listes de réponses d'aide, par chemin (tests). */
export function helpLineLists() {
  const out = {};
  const walk = (v, path) => { if (Array.isArray(v)) out[path] = v; else for (const [k, x] of Object.entries(v)) walk(x, path ? `${path}.${k}` : k); };
  walk(HELP_LINES, '');
  return out;
}
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
export function helpDecision(state, ally, { from, kind, target = null, provinceId = null }, map = null) {
  if (target && allied(state, ally, target)) return { accept: false, fake: false, reason: 'ally-of-target' };
  // V13 (mer en anneau) : on n'attaque qu'une nation qu'on peut atteindre (frontière ou route maritime directe).
  if (map && kind === 'attack' && target && !neighbors(state, map, ally, target)) return { accept: false, fake: false, reason: 'out-of-reach' };
  const arch = archetypeOf(state, ally) || 'batisseur';
  const r = chance(state, 'help', state.turn, ally, from, kind, target ?? provinceId ?? '*');
  const aggressor = target && recentAggressions(state, 10).some(a => a.attacker === target);
  let accept;
  switch (arch) {
    case 'traitre': return { accept: true, fake: true, reason: 'traitor' };
    // V14.2 : naïf, le Héros se laisse entraîner par un allié qui l'a flatté (2 messages amicaux récents ou plus).
    case 'heros': accept = kind === 'defend' ? true : Boolean(aggressor || getTension(state, ally, target) >= 50 || charmOf(state, ally, from) >= 2 || r < .35); break;
    case 'conquerant': accept = kind === 'attack' ? r < .9 : Boolean((target && atWar(state, ally, target)) || r < .4); break;
    case 'batisseur': accept = kind === 'attack' ? r < (atWar(state, ally, target) ? .6 : .15) : r < .75; break;
    default: accept = r < .5;
  }
  return { accept, fake: false, reason: arch };
}
const fillHelp = (text, map, to, target, provinceId) => withLanguage('fr', () => format(text, { to: nameOf(map, to), x: target ? nameOf(map, target) : t('talk.aggressor'), p: provinceName(map, provinceId) }));

/** Inter-tour : chaque demande reçoit sa réponse (Échanges + journal) ; une acceptation crée un engagement. */
export function resolveHelpRequests(state, map, locked, routes = null) {
  const orders = locked.filter(o => o.kind === 'help').sort((a, b) => a.nationId.localeCompare(b.nationId) || a.to.localeCompare(b.to) || String(a.id).localeCompare(String(b.id)));
  for (const o of orders) {
    const req = { from: o.nationId, to: o.to, kind: o.help, target: o.target ?? null, provinceId: o.provinceId ?? null };
    if (!helpRequestStatus(state, req).ok) continue; // alliance rompue ou nation éliminée entre-temps
    const d = helpDecision(state, o.to, req, map);
    const arch = archetypeOf(state, o.to) || 'batisseur';
    const pool = d.reason === 'ally-of-target' ? HELP_LINES.allyOfTarget : d.reason === 'out-of-reach' ? HELP_LINES.outOfReach : HELP_LINES[arch]?.[req.kind]?.[d.accept ? 'yes' : 'no'] || HELP_LINES.batisseur.defend.no;
    const core = pickLine(state, pool, o.to, 'help-line', state.turn, o.to, o.nationId, req.kind), tone = d.accept ? 'amical' : 'neutre';
    const r = lineRef(core, lastPickedList(core)), coreRef = r ? { c: r[0], i: r[1], v: { from: o.to, to: o.nationId, x: req.target, p: req.provinceId } } : null;
    const { text, ref } = composeLineRef(state, map, { from: o.to, to: o.nationId, tone, core: fillHelp(core, map, o.nationId, req.target, req.provinceId), keys: ['help', state.turn, req.kind], coreRef });
    const msg = publishTalk(state, { from: o.to, to: o.nationId, tone, text, core, ai: true, awaitReply: false, tension: false, ref });
    // V14.2 : trajet estimé, puis HELP_TURNS tours d'aide sur place (le trajet ne « mange » plus l'aide).
    const reach = d.accept ? helpTravelTurns(state, o.to, { requester: o.nationId, kind: req.kind, target: req.target, provinceId: req.provinceId }, routes) : 0;
    const travel = reach ?? HELP_MAX_TRAVEL;
    if (d.accept) {
      state.diplomacy.help = helpPacts(state).filter(p => !(p.ally === o.to && p.requester === o.nationId && p.kind === req.kind));
      state.diplomacy.help.push({ ally: o.to, requester: o.nationId, kind: req.kind, against: req.target, provinceId: req.provinceId, turn: state.turn, travel, ...(reach === null ? { noRoute: true } : {}), until: state.turn + travel + HELP_TURNS, ...(d.fake ? { fake: true } : {}) });
      if (!d.fake && req.target) addTension(state, o.to, req.target, req.kind === 'attack' ? 20 : 10, 'help');
      reputation(state, o.to).friendly++;
    }
    state.events.push({ turn: state.turn, type: 'help-answer', nationId: o.to, target: o.nationId, help: req.kind, against: req.target, provinceId: req.provinceId, accepted: d.accept,
      turns: HELP_TURNS, ...(d.accept ? { travel, until: state.turn + travel + HELP_TURNS, ...(reach === null ? { noRoute: true } : {}) } : {}), talkId: msg.id });
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
  // V13 : seulement une nation que l'allié peut atteindre (sinon une guerre déclarée resterait sans effet).
  const ok = n => n && n !== pact.ally && n !== pact.requester && !state.nations?.[n]?.eliminated && !allied(state, pact.ally, n) && (!map || neighbors(state, map, pact.ally, n));
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
const toursFr = n => `${n} tour${n > 1 ? 's' : ''}`;
/**
 * Texte de journal (AIDE) d'un événement d'aide, vu par `reader`.
 * V14.2 : une acceptation dit clairement QUAND l'aide commence et combien de temps elle dure, trajet compris :
 * « Solmara accepte de vous défendre : ses troupes partent maintenant, arrivée estimée dans 2 tours, puis elles vous
 * aident pendant 5 tours (engagement jusqu'au tour 12). »
 */
export function helpJournalText(event, map, reader) {
  const ally = nameOf(map, event.nationId), x = event.against ? nameOf(map, event.against) : null;
  const what = event.help === 'attack' ? `d’attaquer ${x} avec vous` : x ? `de vous défendre contre ${x}` : event.provinceId ? `de défendre ${provinceName(map, event.provinceId)}` : 'de vous défendre';
  const you = event.target === reader;
  if (event.type === 'help-answer') {
    if (!event.accepted) return `${ally} refuse ${you ? what : 'une demande d’aide'}.`;
    if (!you) return `${ally} accepte une demande d’aide.`;
    const turns = event.turns ?? HELP_TURNS;
    if (!Number.isFinite(event.travel)) return `${ally} accepte ${what} : son engagement dure ${toursFr(turns)} à partir de maintenant, trajet compris.`; // ancienne sauvegarde
    const job = event.help === 'attack' ? `combattent ${x} à vos côtés` : 'vous aident';
    if (event.noRoute) return `${ally} accepte ${what}, mais aucune route directe ne mène ses troupes jusque-là : elles risquent de ne pas venir. Engagement jusqu’au tour ${event.until}.`;
    return `${ally} accepte ${what} : ses troupes partent maintenant, arrivée estimée dans ${toursFr(event.travel)}, puis elles ${job} pendant ${toursFr(turns)} (engagement jusqu’au tour ${event.until}).`;
  }
  if (event.type === 'help-broken') return `${ally} avait promis ${what}… et n’est jamais venu.`;
  return `Fin de l’engagement : ${ally} a tenu sa promesse ${what}.`;
}
