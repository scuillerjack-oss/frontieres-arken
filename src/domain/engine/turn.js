// Moteur — résolution d'un tour complet et fin de partie (docs/V10-marine.md §5).

import { expireHelpPacts, resolveHelpRequests } from '../alliances.js';
import { goldBonus } from '../boosts.js';
import { RULES } from '../constants.js';
import { driftTension, hostilityWars, observeLeaders } from '../leaders.js';
import { settleStationed } from '../passage.js';
import { aiTalk, pruneTalkPending, publishTalk } from '../talk.js';
import { planAIOrders } from './ai.js';
import { aggregateMoves } from './battles.js';
import { repairForts, resolveBombardments } from './bombard.js';
import { resolveTransports } from './convoys.js';
import {
  PROPOSAL_TURNS, answerProposals, hostilityWar, resolveAllianceBreaks, resolveDiplomacy
} from './diplomacy.js';
import { incomeBreakdown, incomeFor } from './income.js';
import { buildPermanentJournal, buildTurnJournal } from './journal.js';
import { resolveProjects } from './production.js';
import { healProvinces, updateEliminations } from './recovery.js';
import { legalDestinations } from './sea-routes.js';

function seededRandom(state) {
  let h=2166136261;for(const char of String(state.seed||'arken-v5'))h=Math.imul(h^char.charCodeAt(0),16777619);
  const counter=(Number(state.randomCounter)||0)+1;state.randomCounter=counter;
  let x=(h^Math.imul(counter,0x9e3779b9))>>>0;x^=x<<13;x^=x>>>17;x^=x<<5;
  return (x>>>0)/4294967296;
}
// --- V10 : fin de partie (docs/V10-marine.md §5) -----------------------------------------------------------
const capitalIds = state => [...new Set(Object.values(state.nations).map(n => n.capitalId).filter(Boolean))];
/** Classement : provinces, puis capitales tenues, puis trésor (égalité : identifiant de nation). */
export function gameRanking(state) {
  const caps = capitalIds(state);
  return Object.keys(state.nations).map(id => ({
    nationId: id,
    provinces: Object.values(state.provinces).filter(p => p.ownerId === id).length,
    capitals: caps.filter(c => state.provinces[c]?.ownerId === id).length,
    treasury: Math.max(0, Math.floor(state.nations[id].treasury || 0)),
    eliminated: Boolean(state.nations[id].eliminated)
  })).sort((a, b) => b.provinces - a.provinces || b.capitals - a.capitals || b.treasury - a.treasury || a.nationId.localeCompare(b.nationId))
    .map((r, i) => ({ ...r, rank: i + 1 }));
}
/** Nation qui tient toutes les capitales (victoire anticipée), sinon null. */
export function capitalsVictor(state) {
  const caps = capitalIds(state);
  const owners = new Set(caps.map(c => state.provinces[c]?.ownerId));
  return caps.length && owners.size === 1 ? [...owners][0] : null;
}
/**
 * Fin de partie, vérifiée à la fin de chaque inter-tour, enregistrée UNE fois dans state.gameOver :
 *  - 'capitals' : une nation tient les 5 capitales (victoire anticipée) ;
 *  - 'player-eliminated' : le joueur humain n'a plus rien (défaite) ;
 *  - 'turn-limit' : fin du tour RULES.gameLength (80 depuis V13.2) ou d'un tour suivant pour une ancienne sauvegarde.
 * Le moteur ne bloque rien (les simulations IA continuent) ; c'est l'interface qui arrête la partie.
 */
export function checkGameOver(state) {
  if (state.gameOver) return state.gameOver;
  const victor = capitalsVictor(state), player = state.playerNationId;
  const playerOut = state.controllers?.[player] === 'human' && state.nations[player]?.eliminated;
  const reason = victor ? 'capitals' : playerOut ? 'player-eliminated' : state.turn >= RULES.gameLength ? 'turn-limit' : null;
  if (!reason) return null;
  const ranking = gameRanking(state);
  state.gameOver = { reason, turn: state.turn, winnerId: victor || ranking[0].nationId, ranking };
  state.events.push({ turn: state.turn, type: 'game-over', reason, winnerId: state.gameOver.winnerId, nationId: state.gameOver.winnerId });
  return state.gameOver;
}
export function resolveInterturn(state, map, { random = () => seededRandom(state) } = {}) {
  const fromIndex = state.lastJournalEventIndex || 0;
  // AI makes plans during the planning phase, before any order is resolved.
  planAIOrders(state,map);
  const locked = (state.orders || []).filter(o=>o.status==='pending').map(o=>({...o,units:o.units?{...o.units}:undefined}));
  state.turnPhase='locking-orders';
  state.lockedOrders = locked;
  state.turnPhase='resolving-inter-turn';
  const fought = new Set(); // provinces où un combat a eu lieu ce tour (pas de guérison)
  const eventStart = state.events.length;
  resolveAllianceBreaks(state,locked);
  settleStationed(state,map); // V13.4 : alliance rompue = plus de passage, les troupes stationnées rentrent
  const bombarded = resolveBombardments(state,map,locked,fought); // V14.4 : avant les attaques et les débarquements
  aggregateMoves(state,map,locked,fought);
  settleStationed(state,map);
  resolveDiplomacy(state,locked,random,map);
  resolveProjects(state,locked);
  resolveTransports(state,map,fought);
  healProvinces(state,fought);
  repairForts(state,bombarded);
  updateEliminations(state);
  settleStationed(state,map);
  for (const id of Object.keys(state.nations)) {
    const base = incomeFor(state,id), extra = goldBonus(state, id, base); // V12 : atout « or » (joueur humain seulement)
    state.nations[id].treasury += base + extra;
    if (extra) state.events.push({ turn: state.turn, type: 'boost-gold', nationId: id, amount: extra });
    // V13.1 : le joueur voit chaque tour ce que rapportent ses provinces et ses bâtiments.
    if (id === state.playerNationId && !state.nations[id].eliminated) state.events.push({ turn: state.turn, type: 'income', nationId: id, amount: base + extra, bonus: extra, ...incomeBreakdown(state, id) });
  }
  resolveTalk(state,map,locked,eventStart);
  checkGameOver(state);
  // V13.2 : prévenir quand il ne reste que 5 tours (le tour qui commence compris).
  if (!state.gameOver && state.turn + 1 === RULES.gameLength - 4) state.events.push({ turn: state.turn, type: 'final-turns', remaining: 5 });
  state.orders = []; state.lockedOrders = [];
  buildPermanentJournal(state,map,fromIndex);
  buildTurnJournal(state,map,fromIndex);
  state.turn++;
  state.events.push({ turn:state.turn,type:'turn-start' });
  state.turnPhase='planning';
  return state;
}
export const nextTurn = resolveInterturn;
/**
 * V11 : échanges publics à la fin de l'inter-tour. 1) messages commandés (ordres `talk`, joueur compris) publiés
 * dans l'ordre des nations ; une réponse amicale/hostile à une proposition d'IA l'accepte/la refuse ; 2) les
 * dirigeants IA répondent et parlent selon leur personnalité ; 3) dérive de la tension, observation des dirigeants.
 */
function resolveTalk(state, map, locked, eventStart) {
  state.talk ||= []; state.talkPending ||= {}; state.tension ||= {};
  const published = [];
  const talkOrders = locked.filter(o => o.kind === 'talk').sort((a, b) => a.nationId.localeCompare(b.nationId) || String(a.to ?? '').localeCompare(String(b.to ?? '')) || String(a.id).localeCompare(String(b.id)));
  for (const o of talkOrders) {
    if (state.nations[o.nationId]?.eliminated || (o.to && state.nations[o.to]?.eliminated)) continue;
    const msg = publishTalk(state, { from: o.nationId, to: o.to ?? null, tone: o.tone, text: o.text, replyTo: o.replyTo ?? null, core: o.core ?? null });
    answerProposals(state, msg);
    published.push(msg);
  }
  // V13 : réponses des alliés aux demandes d'aide (avant les paroles des IA : elles comptent dans le quota).
  resolveHelpRequests(state, map, locked, id => legalDestinations(map, state, id)); // V14.2 : trajet estimé de l'aide
  aiTalk(state, map, { published, turnEvents: state.events.slice(eventStart) });
  expireHelpPacts(state);
  // V14.2 : guerre automatique à 85 % d'hostilité (avant la dérive de fin de tour, après tous les échanges du tour).
  hostilityWars(state, (a, b, value) => hostilityWar(state, a, b, value));
  // Propositions des IA expirées.
  state.diplomacy.proposals = (state.diplomacy.proposals || []).filter(p => p.turn > state.turn - PROPOSAL_TURNS && !state.nations[p.from]?.eliminated);
  driftTension(state);
  observeLeaders(state);
  pruneTalkPending(state);
}
