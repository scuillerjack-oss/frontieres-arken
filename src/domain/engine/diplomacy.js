// Moteur — diplomatie : ordres, guerres, trêves, alliances, propositions et leur résolution.

import {
  acceptsAlliance, addTension, archetypeOf, ceasefireBias, getTension, recordAggression, reputation, reveal,
  setTension, strengthOf
} from '../leaders.js';
import { settleStationed } from '../passage.js';
import { aiOfferTalk } from '../talk.js';
import { queuedOrder } from './orders.js';
import { pairTreaty, pairWar, spendableTreasury } from './shared.js';


/**
 * V13.2 — cessez-le-feu au montant choisi : `pay` = or que l'on verse à l'adversaire, `demand` = or qu'on exige de
 * lui (le dominant impose ses conditions). Probabilité d'acceptation estimée selon le rapport de forces et la
 * somme ; la personnalité du dirigeant visé la déplace encore à la résolution (ceasefireBias), en secret.
 */
export function ceasefireChance(state, from, target, { pay = 0, demand = 0 } = {}) {
  const sf = strengthOf(state, from), st = strengthOf(state, target), d = sf + st > 0 ? sf / (sf + st) : .5;
  const tT = Math.max(0, state.nations[target]?.treasury || 0);
  let p = Math.max(.05, Math.min(.7, .1 + (d - .4)));
  if (pay > 0) p += .6 * Math.min(1, pay / Math.max(30, tT * .5 + 20));
  if (demand > 0) p -= (demand / Math.max(20, tT)) * Math.max(.2, 1.1 - d);
  return Math.round(Math.max(0, Math.min(.95, p)) * 100) / 100;
}
export const CEASEFIRE_PROPOSAL_BONUS = .4;
/** V13.2 (relecture) : on exige au plus la moitié du trésor adverse — pas de « racket » d'un trésor entier. */
export const maxCeasefireDemand = (state, target) => Math.floor(Math.max(0, state.nations[target]?.treasury || 0) / 2);
export function queueDiplomaticOrder(state, { nationId, target, action, offerLevel = .5, pay, demand }) {
  if(action==='ultimatum')action='ceasefire';
  if (!state.nations[target] || nationId === target) return { ok: false, error: 'Cible invalide' };
  if (!['war', 'alliance', 'ceasefire', 'break'].includes(action)) return { ok: false, error: 'Action indisponible en V5' };
  if ((state.orders || []).some(o => o.kind === 'diplomacy' && o.nationId === nationId && o.target === target && o.status === 'pending')) return { ok: false, error: 'Une action envers ce pays est déjà prévue pour l’inter-tour' };
  const atWar = pairWar(state, nationId, target), relation = (state.diplomacy.treaties || []).find(t => t.active !== false && t.parties.includes(nationId) && t.parties.includes(target))?.type || 'neutral';
  if (action === 'ceasefire' && !atWar) return { ok: false, error: 'Aucune guerre active' };
  if (action === 'alliance' && (atWar || relation === 'alliance')) return { ok: false, error: 'Un cessez-le-feu est requis et une alliance existe déjà' };
  if (action === 'war' && atWar) return { ok: false, error: 'Déjà en guerre' };
  // V13 : pas de guerre entre alliés — il faut d'abord rompre l'alliance (action 'break', résolue en tout début
  // d'inter-tour ; rompre ET attaquer dans le même tour est une TRAHISON publique).
  if (action === 'war' && relation === 'alliance') return { ok: false, error: 'Vous êtes alliés : rompez d’abord l’alliance' };
  if (action === 'break' && relation !== 'alliance') return { ok: false, error: 'Aucune alliance à rompre' };
  let offer = {};
  if (action === 'ceasefire' && (pay !== undefined || demand !== undefined)) {
    const give = Math.max(0, Math.floor(Number(pay) || 0)), ask = Math.max(0, Math.floor(Number(demand) || 0));
    if (give && ask) return { ok: false, error: 'Choisissez : payer ou exiger, pas les deux' };
    if (ask > Math.max(0, state.nations[target].treasury)) return { ok: false, error: 'Vous exigez plus que son trésor' };
    if (ask > maxCeasefireDemand(state, target)) return { ok: false, error: 'On ne peut exiger plus de la moitié de son trésor' };
    if (spendableTreasury(state, nationId) < give) return { ok: false, error: 'Trésor insuffisant après les sommes déjà réservées' };
    offer = { custom: true, amount: give, demand: ask, acceptanceProbability: ceasefireChance(state, nationId, target, { pay: give, demand: ask }) };
  } else if (action === 'ceasefire') {
    const level = Number(offerLevel);
    if (![.25,.5,.75].includes(level)) return { ok:false,error:'Niveau d’offre invalide' };
    const amount = Math.floor(Math.max(0,state.nations[target].treasury) * level);
    const acceptanceProbability = 1 - level;
    if (spendableTreasury(state,nationId) < amount) return { ok:false,error:'Trésor insuffisant après les sommes déjà réservées' };
    offer = { offerLevel:level, acceptanceProbability, amount };
  }
  return queuedOrder(state, { kind: 'diplomacy', nationId, target, action, ...offer });
}

export function ensureWar(state, attacker, defender) {
  if (pairWar(state, attacker, defender)) return;
  // V10 : attaquer = guerre automatique, dans les deux sens (une guerre lie les deux participants), traités rompus.
  openWar(state, attacker, defender, 'combat');
}
/**
 * Ouverture d'une guerre (attaque ou déclaration). V11 : attaquer un allié est une TRAHISON (événement public ;
 * le Traître est alors révélé) ; l'agression est mémorisée et fait monter la tension (leaders.js).
 */
function openWar(state, attacker, defender, reason) {
  const wasAllied = pairTreaty(state, attacker, defender, 'alliance');
  // V14.0 : rompre une trêve signée depuis moins de TRUCE_BETRAYAL_TURNS tours est aussi une trahison.
  const truce = !wasAllied && recentTruce(state, attacker, defender);
  state.diplomacy.treaties = state.diplomacy.treaties.filter(t => !(t.parties?.includes(attacker) && t.parties?.includes(defender)));
  state.diplomacy.wars = state.diplomacy.wars.filter(w => !(w.participants.includes(attacker) && w.participants.includes(defender)));
  state.diplomacy.wars.push({ active: true, participants: [attacker, defender], started: state.turn });
  dropProposals(state, attacker, defender);
  if (reason === 'combat') state.events.push({ turn: state.turn, type: 'diplomacy', nationId: attacker, target: defender, relation: 'war', reason: 'combat' });
  if (wasAllied) {
    state.events.push({ turn: state.turn, type: 'betrayal', nationId: attacker, target: defender });
    reputation(state, attacker).betrayals++;
    if (state.controllers?.[attacker] === 'ai' && archetypeOf(state, attacker) === 'traitre') reveal(state, attacker, 'betrayal');
  } else if (truce) {
    // Même effet de réputation qu'une alliance trahie : événement public TRAHISON, compteur, Traître révélé.
    state.events.push({ turn: state.turn, type: 'betrayal', nationId: attacker, target: defender, truce: true, truceTurns: state.turn - truce.started });
    reputation(state, attacker).betrayals++;
    if (state.controllers?.[attacker] === 'ai' && archetypeOf(state, attacker) === 'traitre') reveal(state, attacker, 'betrayal');
  }
  recordAggression(state, attacker, defender, reason);
}
/**
 * V14.1 — guerre automatique (décision de Jack, 20/10/2026 : « si mes troupes affrontent qui que ce soit, même pour
 * défendre un allié, ça me met donc en guerre avec, au joueur de gérer ses choix politiques après »).
 * `nationId` (dont les troupes ont combattu, en défense) entre en guerre avec `enemy`. Une trêve (ou un traité) avec
 * lui est rompu de fait, SANS trahison : on se défendait (pas d'événement TRAHISON, pas de compteur, pas d'agression
 * mémorisée). Jamais entre alliés (les appelants les écartent du combat), jamais avec une nation éliminée.
 */
export function autoWar(state, nationId, enemy, provinceId, host = null) {
  if (!nationId || !enemy || nationId === enemy || !state.nations[nationId] || !state.nations[enemy]) return false;
  if (state.nations[nationId].eliminated || state.nations[enemy].eliminated || pairWar(state, nationId, enemy)) return false;
  if (pairTreaty(state, nationId, enemy, 'alliance')) return false; // filet de sécurité : deux alliés ne se combattent pas
  const brokeTruce = pairTreaty(state, nationId, enemy, 'ceasefire');
  state.diplomacy.treaties = state.diplomacy.treaties.filter(t => !(t.parties?.includes(nationId) && t.parties?.includes(enemy)));
  state.diplomacy.wars.push({ active: true, participants: [nationId, enemy], started: state.turn, auto: true });
  dropProposals(state, nationId, enemy);
  state.events.push({ turn: state.turn, type: 'auto-war', nationId, target: enemy, provinceId, host, ...(brokeTruce ? { brokeTruce: true } : {}) });
  return true;
}
/**
 * V14.2 — guerre déclarée par l'hostilité (tension ≥ 85 %), entre deux nations sans alliance ni trêve. Pas une
 * agression : ni trahison, ni réputation, ni indignation des Héros. Événement public « hostility-war » au journal.
 */
export function hostilityWar(state, a, b, value) {
  if (pairWar(state, a, b) || state.nations[a]?.eliminated || state.nations[b]?.eliminated) return false;
  state.diplomacy.wars.push({ active: true, participants: [a, b], started: state.turn, hostility: true });
  dropProposals(state, a, b);
  state.events.push({ turn: state.turn, type: 'hostility-war', nationId: a, target: b, value: Math.round(value) });
  return true;
}
/** V14.0 : en dessous de ce nombre de tours, rompre une trêve est une trahison (Jack, cahier V14 §3 point 2). */
export const TRUCE_BETRAYAL_TURNS = 10;
/** Trêve en cours entre a et b signée depuis moins de TRUCE_BETRAYAL_TURNS tours, ou null (ancienne sauvegarde sans date : null). */
export function recentTruce(state, a, b) {
  const t = (state.diplomacy?.treaties || []).find(x => x.active !== false && x.type === 'ceasefire' && x.parties?.includes(a) && x.parties?.includes(b));
  return t && Number.isFinite(t.started) && state.turn - t.started < TRUCE_BETRAYAL_TURNS ? t : null;
}
/** V14.0 : rompre la trêve avec `target` maintenant serait-il une trahison ? { betrayal, since, left } (pour la fenêtre de confirmation). */
export function truceBreakStatus(state, nationId, target) {
  const t = recentTruce(state, nationId, target);
  if (!t) return { betrayal: false, since: null, left: 0 };
  const since = state.turn - t.started;
  return { betrayal: true, since, left: TRUCE_BETRAYAL_TURNS - since };
}
// Propositions des IA au joueur (alliance, cessez-le-feu) : il répond par un échange (amical = accepte).
export const PROPOSAL_TURNS = 6;
function dropProposals(state, a, b) {
  state.diplomacy.proposals = (state.diplomacy.proposals || []).filter(p => !([p.from, p.to].includes(a) && [p.from, p.to].includes(b)));
}
export function activeProposal(state, from, to, action) {
  return (state.diplomacy.proposals || []).find(p => p.from === from && p.to === to && (!action || p.action === action) && p.turn > state.turn - PROPOSAL_TURNS) || null;
}
/** V13.2 : une proposition d'IA rendue caduque dans le même inter-tour (trêve déjà conclue) ne s'affiche plus au journal. */
function supersedeProposalEvents(state, a, b) {
  for (let i = (state.events || []).length - 1; i >= 0 && state.events[i].turn === state.turn; i--) {
    const e = state.events[i];
    if (e.type === 'diplomatic-action' && e.proposal && [e.nationId, e.target].includes(a) && [e.nationId, e.target].includes(b)) e.superseded = true;
  }
}
function makeAlliance(state, a, b) {
  state.diplomacy.wars = state.diplomacy.wars.filter(w => !(w.participants.includes(a) && w.participants.includes(b)));
  state.diplomacy.treaties = state.diplomacy.treaties.filter(t => !(t.parties?.includes(a) && t.parties?.includes(b)));
  state.diplomacy.treaties.push({ active: true, type: 'alliance', parties: [a, b], started: state.turn });
  setTension(state, a, b, Math.min(getTension(state, a, b), 5), 'alliance');
  dropProposals(state, a, b); supersedeProposalEvents(state, a, b); clearRefusals(state, a, b);
}
function makeCeasefire(state, a, b) {
  state.diplomacy.wars = state.diplomacy.wars.filter(w => !(w.participants.includes(a) && w.participants.includes(b)));
  state.diplomacy.treaties = state.diplomacy.treaties.filter(t => !(t.parties?.includes(a) && t.parties?.includes(b)));
  state.diplomacy.treaties.push({ active: true, type: 'ceasefire', parties: [a, b], started: state.turn });
  setTension(state, a, b, Math.min(getTension(state, a, b), 40), 'ceasefire');
  dropProposals(state, a, b); supersedeProposalEvents(state, a, b); clearRefusals(state, a, b);
}


/**
 * V13 : ruptures d'alliance, résolues AVANT les déplacements. Une rupture accompagnée d'une attaque contre l'ancien
 * allié dans le même inter-tour (ou d'une déclaration : `war`) est une TRAHISON : guerre ouverte, événement public,
 * Traître révélé (comportement V11 conservé). Sinon, simple rupture publique (tension +15).
 */
export function resolveAllianceBreaks(state, orders) {
  for (const o of orders.filter(x => x.kind === 'diplomacy' && x.action === 'break').sort((a, b) => a.nationId.localeCompare(b.nationId) || a.target.localeCompare(b.target))) {
    if (state.nations[o.nationId]?.eliminated || state.nations[o.target]?.eliminated || !pairTreaty(state, o.nationId, o.target, 'alliance')) continue;
    const strikes = o.war || orders.some(m => m.kind === 'move' && !m.passage && m.nationId === o.nationId && state.provinces[m.toId]?.ownerId === o.target);
    if (strikes) { openWar(state, o.nationId, o.target, 'betrayal'); continue; }
    state.diplomacy.treaties = state.diplomacy.treaties.filter(t => !(t.type === 'alliance' && t.parties?.includes(o.nationId) && t.parties?.includes(o.target)));
    addTension(state, o.nationId, o.target, 15, 'alliance-broken');
    state.events.push({ turn: state.turn, type: 'alliance-broken', nationId: o.nationId, target: o.target });
  }
}
export function resolveDiplomacy(state, orders, random, map = null) {
  for (const o of orders.filter(x => x.kind === 'diplomacy' && x.action !== 'break').sort((a,b)=>a.nationId.localeCompare(b.nationId)||a.target.localeCompare(b.target)||a.action.localeCompare(b.action))) {
    if (state.nations[o.nationId]?.eliminated || state.nations[o.target]?.eliminated) continue;
    const atWar = pairWar(state, o.nationId, o.target);
    if(o.action==='tribute'){
      // Complete an already-confirmed V4 transfer; new V5 orders cannot create one.
      state.nations[o.target].treasury+=Math.max(0,o.amount||0);
      state.events.push({turn:state.turn,type:'diplomatic-action',nationId:o.nationId,target:o.target,action:'tribute',amount:o.amount||0});
      state.messages.push({turn:state.turn,nationId:o.nationId,target:o.target,action:'tribute',amount:o.amount||0,status:'resolved'});
      continue;
    }
    // V11 (B9) : une IA qui propose une alliance ou une trêve au joueur humain attend sa réponse (échange public :
    // amical = accepte, hostile = refuse ; ou action diplomatique du joueur).
    if (state.controllers?.[o.nationId] === 'ai' && state.controllers?.[o.target] === 'human' && (o.action === 'alliance' || o.action === 'ceasefire')) {
      if ((o.action === 'ceasefire') !== atWar || pairTreaty(state, o.nationId, o.target, 'alliance')) continue;
      dropProposals(state, o.nationId, o.target);
      // V13.2 : une trêve reproposée après un refus le dit ; une IA qui perd ou qui a été repoussée offre de l'or.
      const refused = refusalsOf(state, o.nationId, o.target, o.action);
      const gold = o.action === 'ceasefire' ? aiCeasefireGold(state, o.nationId, o.target, refused.count) : 0;
      const msg = aiOfferTalk(state, map, o.nationId, o.target, o.action, { again: refused.count > 0, gold });
      state.diplomacy.proposals ||= [];
      state.diplomacy.proposals.push({ from: o.nationId, to: o.target, action: o.action, turn: state.turn, talkId: msg.id, amount: gold, ...(refused.count ? { refusedBefore: refused.count, lastRefusedTurn: refused.turn } : {}) });
      state.events.push({ turn: state.turn, type: 'diplomatic-action', nationId: o.nationId, target: o.target, action: o.action, proposal: true, amount: gold });
      continue;
    }
    if (o.action === 'ceasefire' && o.custom) {
      // V13.2 : montant choisi (payer ou exiger). Une IA qui a elle-même proposé la trêve signe une paix sans
      // exigence, et se montre plus conciliante face à une exigence.
      const proposed = activeProposal(state, o.target, o.nationId, 'ceasefire'), demand = Math.min(o.demand || 0, Math.max(0, state.nations[o.target].treasury));
      const bias = Math.min(ceasefireBias(state, o.target, o.nationId), demand > 0 ? .3 : 1);
      const p = Math.max(0, Math.min(.97, (o.acceptanceProbability ?? 0) + bias + (proposed ? CEASEFIRE_PROPOSAL_BONUS : 0)));
      const accepted = atWar && state.nations[o.nationId].treasury >= (o.amount || 0) && ((proposed && !demand) || random() < p);
      // L'IA proposait déjà la trêve : le joueur n'a rien à payer, et l'or qu'elle offrait lui revient.
      const owed = proposed ? 0 : (o.amount || 0);
      if (accepted && proposed) payProposalGold(state, proposed);
      if (accepted) {
        state.nations[o.nationId].treasury -= owed; state.nations[o.target].treasury += owed;
        state.nations[o.target].treasury -= demand; state.nations[o.nationId].treasury += demand;
        makeCeasefire(state, o.nationId, o.target);
      }
      state.events.push({ turn: state.turn, type: 'ceasefire-offer', nationId: o.nationId, target: o.target, amount: owed, demand, custom: true, acceptanceProbability: o.acceptanceProbability, accepted });
      state.messages.push({ turn: state.turn, nationId: o.nationId, target: o.target, action: 'ceasefire', amount: owed, demand, status: accepted ? 'accepted' : 'refused' });
      continue;
    }
    if (o.action === 'ceasefire') {
      // V11 : la personnalité de la nation qui reçoit l'offre déplace la probabilité d'accepter (leaders.js).
      // Une trêve proposée par l'IA elle-même au joueur ne passe pas ici ; une IA qui a déjà proposé la trêve accepte.
      const proposed = activeProposal(state, o.target, o.nationId, 'ceasefire');
      const p = Math.max(0, Math.min(1, (o.acceptanceProbability ?? 0) + ceasefireBias(state, o.target, o.nationId)));
      const accepted = atWar && (o.legacyFree || proposed || random() < p) && state.nations[o.nationId].treasury >= o.amount;
      if (accepted) {
        state.nations[o.nationId].treasury -= o.amount;
        state.nations[o.target].treasury += o.amount; // B3 corrigé : la somme est versée à la nation qui accepte
        makeCeasefire(state, o.nationId, o.target);
      }
      state.events.push({turn:state.turn,type:'ceasefire-offer',nationId:o.nationId,target:o.target,amount:o.amount||0,offerLevel:o.offerLevel,acceptanceProbability:o.acceptanceProbability,accepted});
      state.messages.push({turn:state.turn,nationId:o.nationId,target:o.target,action:'ceasefire',amount:o.amount||0,status:accepted?'accepted':'refused'});
      continue;
    }
    let accepted = true;
    if (o.action === 'war' && !atWar) openWar(state, o.nationId, o.target, 'declaration');
    else if (o.action === 'alliance' && !atWar) {
      // V11 (B9) : l'IA accepte ou refuse selon sa personnalité et la tension (le Traître accepte tout).
      accepted = Boolean(activeProposal(state, o.target, o.nationId, 'alliance')) || acceptsAlliance(state, o.target, o.nationId);
      if (accepted) makeAlliance(state, o.nationId, o.target);
      else addTension(state, o.nationId, o.target, 5, 'refusal');
    } else accepted = false;
    state.events.push({ turn: state.turn, type: 'diplomatic-action', nationId: o.nationId, target: o.target, action: o.action, amount: o.amount || 0, accepted });
    state.messages.push({ turn: state.turn, nationId: o.nationId, target: o.target, action: o.action, amount: o.amount || 0, status: o.action === 'alliance' ? (accepted ? 'accepted' : 'refused') : 'resolved' });
  }
}
/**
 * V13 : propositions d'IA auxquelles `nationId` peut encore répondre (fenêtre Oui / Non après le journal).
 * Jamais d'alliance proposée par une nation déjà alliée, jamais de trêve hors guerre. `fresh` : seulement celles
 * reçues à l'inter-tour qui vient d'être résolu.
 */
export function proposalsToAnswer(state, nationId = state.playerNationId, { fresh = false } = {}) {
  return (state.diplomacy?.proposals || []).filter(p => p.to === nationId && p.turn > state.turn - PROPOSAL_TURNS && (!fresh || p.turn === state.turn - 1)
    && !state.nations[p.from]?.eliminated
    && (p.action === 'alliance' ? !pairTreaty(state, p.from, nationId, 'alliance') && !pairWar(state, p.from, nationId) : pairWar(state, p.from, nationId)));
}
/** V13.2 : refus mémorisés d'une proposition (de `from` vers `to`), pour qu'une nouvelle offre en tienne compte. */
const REFUSAL_MEMORY = 20;
function clearRefusals(state, a, b) {
  const ref = state.diplomacy?.refusals; if (!ref) return;
  for (const k of Object.keys(ref)) { const [x, y] = k.split('>'); if ([a, b].includes(x) && [a, b].includes(y)) delete ref[k]; }
}
export function refusalsOf(state, from, to, action) {
  const r = state.diplomacy?.refusals?.[`${from}>${to}>${action}`];
  if (r && Number.isFinite(r.turn) && state.turn - r.turn > REFUSAL_MEMORY) return { count: 0, turn: null }; // V13.2 : oublié après 20 tours
  return { count: Math.max(0, Number(r?.count) || 0), turn: r?.turn ?? null };
}
function noteRefusal(state, from, to, action) {
  state.diplomacy.refusals = state.diplomacy.refusals && typeof state.diplomacy.refusals === 'object' ? state.diplomacy.refusals : {};
  const key = `${from}>${to}>${action}`, r = refusalsOf(state, from, to, action);
  state.diplomacy.refusals[key] = { count: r.count + 1, turn: state.turn };
}
/** Or offert par une IA avec sa trêve : rien d'ordinaire ; 20 % de son trésor si elle perd, +15 % par refus (max 50 %). */
export function aiCeasefireGold(state, from, to, refusedCount = 0) {
  const losing = strengthOf(state, from) < .8 * strengthOf(state, to), frac = Math.min(.5, (losing ? .2 : 0) + .15 * refusedCount);
  const gold = Math.floor(Math.max(0, state.nations[from]?.treasury || 0) * frac);
  return gold >= 5 ? gold : 0;
}
/** Or réellement versé quand le joueur accepte une trêve offerte avec de l'or (jamais plus que le trésor). */
function payProposalGold(state, p) {
  const gold = Math.min(Math.max(0, p.amount || 0), Math.max(0, state.nations[p.from]?.treasury || 0));
  if (gold > 0) { state.nations[p.from].treasury -= gold; state.nations[p.to].treasury += gold; }
  return gold;
}
/** V13 : réponse Oui / Non du joueur à une proposition (effet immédiat ; le message n'attend plus de réponse). */
export function respondToProposal(state, { nationId = state.playerNationId, from, accept } = {}) {
  const p = proposalsToAnswer(state, nationId).find(x => x.from === from);
  if (!p) { dropProposals(state, from, nationId); return { ok: false, error: 'Cette proposition n’est plus valable' }; }
  let gold = 0;
  if (accept) { gold = p.action === 'ceasefire' ? payProposalGold(state, p) : 0; (p.action === 'alliance' ? makeAlliance : makeCeasefire)(state, from, nationId); }
  else { dropProposals(state, from, nationId); addTension(state, nationId, from, 5, 'refusal'); noteRefusal(state, from, nationId, p.action); }
  if (p.talkId && state.talkPending?.[nationId]) state.talkPending[nationId] = state.talkPending[nationId].filter(id => id !== p.talkId);
  state.events.push({ turn: state.turn, type: 'diplomatic-action', nationId, target: from, action: p.action, accepted: Boolean(accept), amount: gold, viaTalk: true, ...(accept ? {} : { refusedProposal: true }) });
  return { ok: true, action: p.action, accepted: Boolean(accept), gold };
}
/** Réponse du joueur à une proposition d'une IA : amical = accepte, hostile = refuse. */
export function answerProposals(state, msg) {
  if (!msg.replyTo || !msg.to) return;
  const p = (state.diplomacy.proposals || []).find(x => x.talkId === msg.replyTo && x.from === msg.to && x.to === msg.from);
  if (!p) return;
  if (msg.tone === 'amical') {
    if (p.action === 'alliance' && !pairWar(state, p.from, p.to)) makeAlliance(state, p.from, p.to);
    else if (p.action === 'ceasefire' && pairWar(state, p.from, p.to)) { const gold = payProposalGold(state, p); makeCeasefire(state, p.from, p.to);
      state.events.push({ turn: state.turn, type: 'diplomatic-action', nationId: p.to, target: p.from, action: p.action, accepted: true, amount: gold, viaTalk: true }); return; }
    else return;
    state.events.push({ turn: state.turn, type: 'diplomatic-action', nationId: p.to, target: p.from, action: p.action, accepted: true, amount: 0, viaTalk: true });
  } else if (msg.tone === 'hostile') {
    dropProposals(state, p.from, p.to); noteRefusal(state, p.from, p.to, p.action);
    state.events.push({ turn: state.turn, type: 'diplomatic-action', nationId: p.to, target: p.from, action: p.action, accepted: false, refusedProposal: true, amount: 0, viaTalk: true });
  }
}

export function setRelation(state, { nationId, target, type }) {
  if (nationId === target) return { ok:false, error:'Cible invalide' };
  const atWar = pairWar(state, nationId, target);
  if (type === 'alliance' && atWar) return { ok:false, error:'Un cessez-le-feu est requis avant une alliance' };
  if (type === 'ceasefire' && !atWar) return { ok:false, error:'Aucune guerre active' };
  state.diplomacy.wars = state.diplomacy.wars.filter(w => !(w.participants.includes(nationId) && w.participants.includes(target)));
  state.diplomacy.treaties = state.diplomacy.treaties.filter(t => !(t.parties?.includes(nationId) && t.parties?.includes(target)));
  if (type === 'war') state.diplomacy.wars.push({ active:true, participants:[nationId,target], started:state.turn });
  if (type === 'alliance' || type === 'ceasefire') state.diplomacy.treaties.push({ active:true, type, parties:[nationId,target], started:state.turn });
  state.events.push({ turn:state.turn, type:'diplomacy', nationId, target, relation:type });
  settleStationed(state, null);
  return { ok:true };
}
export function recordDiplomaticAction(state, { nationId, target, action, offerLevel = .5 }) {
  if (action === 'prisoners') return { ok:false, error:'Action supprimée en V3' };
  if(action==='tribute')return{ok:false,error:'Le tribut séparé a été retiré en V5'};
  if(action==='ultimatum'||action==='ceasefire')return queueDiplomaticOrder(state,{nationId,target,action,offerLevel});
  const amount=0;
  state.messages.push({ turn:state.turn, nationId, target, action, amount, status:'recorded' });
  state.events.push({ turn:state.turn, type:'diplomatic-action', nationId, target, action, amount });
  return { ok:true };
}

