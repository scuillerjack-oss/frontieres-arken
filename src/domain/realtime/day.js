// V17.1 — Un jour de jeu (docs/V17-cahier-des-charges.md §12) : `advanceDay(state, map)`. Module pur, déterministe (même
// graine → même partie), sans DOM, sans Math.random ni Date. Il réutilise les modules du tour par tour au lieu de les recopier.
//
// Ordre fixe des étapes d'un jour :
//  1) ordres du jour : la nation IA du jour décide (planAIOrders, une nation tous les 10 jours, décalées de 2 jours), puis
//     tous les ordres en attente (IA et joueur) partent tout de suite (executePendingOrders) ;
//  2) avancée des armées en marche, rencontres en chemin ;
//  3) arrivées → combats (immédiats, 3 passes : provisoire jusqu'à la V17.2) ; convois : avancée d'un jour, rencontres et
//     interception à J−30, débarquements ;
//  4) (assauts du jour : V17.2) ;
//  5) chantiers et recrutements livrés ;
//  6) revenus du jour (report exact en 1/60 : goldCarry) ; 6 bis) nourriture (V17.4, food.js) ;
//  7) tous les 10 jours : coalition ; tous les 30 jours (fin de période) : guérison, forteresses qui se referment, ballons,
//     paroles des IA et dérive de la tension, récapitulatif des revenus, histoire de la partie, journal ;
//  8) fin de partie (vérifiée chaque jour), alertes de fin ;
//  9) jour suivant (state.day++, state.turn = période).
//
// `executePendingOrders` est aussi appelé par l'interface juste après un ordre du joueur : l'armée part le jour même, même
// en pause (« les ordres partent aujourd'hui et avancent dès que le temps repart », §1.1).

import { expireHelpPacts, resolveHelpRequests } from '../alliances.js';
import { goldBonus } from '../boosts.js';
import { RULES } from '../constants.js';
import { hostilityWars, driftTension, observeLeaders } from '../leaders.js';
import { settleStationed as settlePassage } from '../passage.js';
import { settleMysteryIsland } from '../mystery-island.js';
import { recordStory } from '../story.js';
import { aiTalk, pruneTalkPending } from '../talk.js';
import { planAIOrders } from '../engine/ai.js';
import { advanceBalloonsDay, balloonPeriodReports, resolveBalloonShots, sendBalloonsNow } from '../engine/balloons.js';
import { bombardTick, registerBombardOrders, repairForts, resolveBombardments } from '../engine/bombard.js';
import { updateCoalition } from '../engine/coalition.js';
import { resolveTransports, stampConvoy } from '../engine/convoys.js';
import { hostilityWar, proposalAlive, resolveAllianceBreaks, resolveDiplomacy } from '../engine/diplomacy.js';
import { incomeBreakdown, incomeFor } from '../engine/income.js';
import { buildPermanentJournal, buildTurnJournal } from '../engine/journal.js';
import { progressProjects, startProjects } from '../engine/production.js';
import { healProvinces, updateEliminations } from '../engine/recovery.js';
import { legalDestinations } from '../engine/sea-routes.js';
import { checkGameOver, publishTalkOrders, seededRandom } from '../engine/turn.js';
import { aiNationOfDay, endAlertDays, isPeriodEnd, isRealtime, nextAiDays, periodOfDay } from './clock.js';
import { dailyFood } from './food.js';
import { departMoves, marchArrivals, marchEncounters } from './marches.js';
import { joinBattle, resolveBattles } from './battles.js';
import { aiReact, deferAnswers, releaseAnswers } from './ai-schedule.js';

const R = RULES.realtime;
const settleStationed = (state, map) => { settlePassage(state, map); settleMysteryIsland(state); };
/** Registre du temps réel (sauvegardé) : repères de la période en cours. */
export function realtimeLedger(state) {
  const rt = (state.rt && typeof state.rt === 'object') ? state.rt : (state.rt = {});
  rt.periodEventStart = Number.isFinite(rt.periodEventStart) ? rt.periodEventStart : 0;
  rt.chronicleIndex = Number.isFinite(rt.chronicleIndex) ? rt.chronicleIndex : 0;
  rt.fought = rt.fought && typeof rt.fought === 'object' ? rt.fought : {};        // province → dernier jour de combat
  rt.bombarded = rt.bombarded && typeof rt.bombarded === 'object' ? rt.bombarded : {}; // province → dernier jour de bombardement
  rt.periodTalk = Array.isArray(rt.periodTalk) ? rt.periodTalk : [];             // messages commandés de la période (ids)
  rt.periodOrders = Array.isArray(rt.periodOrders) ? rt.periodOrders : [];       // ordres de la période lus par les ballons
  rt.periodIncome = rt.periodIncome && typeof rt.periodIncome === 'object' ? rt.periodIncome : {};
  rt.talkInbox = Array.isArray(rt.talkInbox) ? rt.talkInbox : [];                // V17.5 : messages adressés à une IA, en attente de sa décision
  rt.talkEvents = rt.talkEvents && typeof rt.talkEvents === 'object' ? rt.talkEvents : {}; // V17.5 : nation → index des événements déjà lus pour ses paroles
  rt.talkDay = rt.talkDay && typeof rt.talkDay === 'object' ? rt.talkDay : {};    // V17.5 : nation → jour de sa dernière initiative possible
  return rt;
}
const stampDay = (state, from) => { for (let i = from; i < state.events.length; i++) if (!Number.isFinite(state.events[i].day)) state.events[i].day = state.day; };
const markDays = (bag, ids, day) => { for (const id of ids) bag[id] = day; };
const recentSet = (bag, day, within) => new Set(Object.entries(bag).filter(([, d]) => day - d < within).map(([id]) => id));
const BALLOON_REPORT_KINDS = new Set(['recruitment', 'move']);

/**
 * Ordres en attente (joueur et IA) exécutés maintenant, dans l'ordre de l'inter-tour : ballons abattus, ruptures
 * d'alliance, bombardements, départs (marches et convois), diplomatie, chantiers, messages et demandes d'aide.
 * Renvoie les ordres exécutés. V17.5 : une proposition ou une demande d'aide adressée à une IA attend sa prochaine
 * décision (1 à 10 jours, ai-schedule.js) ; un envoi de ballon part le jour même (le ballon vole en jours).
 */
export function executePendingOrders(state, map, { random = () => seededRandom(state) } = {}) {
  if (!isRealtime(state)) return [];
  deferAnswers(state);
  const pending = (state.orders || []).filter(o => o.status === 'pending');
  if (!pending.length) return [];
  const rt = realtimeLedger(state), eventStart = state.events.length;
  const locked = pending.map(o => ({ ...o, units: o.units ? { ...o.units } : undefined }));
  const fought = new Set();
  resolveBalloonShots(state, map, locked);
  sendBalloonsNow(state, map, locked);
  resolveAllianceBreaks(state, locked);
  settleStationed(state, map);
  // V17.2 : « Bombarder » devient un ordre permanent, qui tire tous les 10 jours (bombardTick).
  registerBombardOrders(state, locked);
  const bombarded = resolveBombardments(state, map, [], fought);
  departMoves(state, map, locked);
  settleStationed(state, map);
  resolveDiplomacy(state, locked, random, map);
  startProjects(state, locked);
  const published = publishTalkOrders(state, locked);
  rt.periodTalk.push(...published.map(m => m.id));
  // V17.5 : un message adressé à une IA reçoit (peut-être) sa réponse à la prochaine décision de cette IA (1 à 10 jours).
  rt.talkInbox.push(...published.filter(m => m.to && !m.replyTo && state.controllers?.[m.to] === 'ai').map(m => m.id));
  resolveHelpRequests(state, map, locked, id => legalDestinations(map, state, id));
  rt.periodOrders.push(...locked.filter(o => BALLOON_REPORT_KINDS.has(o.kind)));
  markDays(rt.fought, fought, state.day); markDays(rt.bombarded, bombarded || [], state.day);
  const done = new Set(pending.map(o => o.id));
  state.orders = (state.orders || []).filter(o => !done.has(o.id));
  stampDay(state, eventStart);
  return locked;
}
/** Revenus du jour : un « tour » de revenus en 60 jours, report exact (le trésor reste un entier, rien ne se perd). */
function dailyIncome(state) {
  const rt = realtimeLedger(state);
  for (const id of Object.keys(state.nations)) {
    const n = state.nations[id];
    const base = incomeFor(state, id), extra = goldBonus(state, id, base);
    n.goldCarry = (Number(n.goldCarry) || 0) + base + extra;
    const whole = Math.floor(n.goldCarry / R.incomeDays);
    n.goldCarry -= whole * R.incomeDays;
    n.treasury += whole;
    if (id === state.playerNationId) rt.periodIncome[id] = (rt.periodIncome[id] || 0) + whole;
  }
}
/**
 * V17.5 : paroles de l'IA du jour, à sa décision : réponses aux messages reçus depuis sa décision précédente (1 à 10 jours),
 * réactions aux événements (trahison, attaque, coalition) depuis sa dernière prise de parole, et au plus une initiative
 * par RULES.realtime.ai.talkEveryDays jours. Le plafond de messages IA par période reste celui du tour par tour.
 */
function aiTalkOfDay(state, map, nationId) {
  const rt = realtimeLedger(state);
  const inbox = new Set(rt.talkInbox);
  const published = (state.talk || []).filter(m => inbox.has(m.id) && m.to === nationId);
  rt.talkInbox = rt.talkInbox.filter(id => !published.some(m => m.id === id) && (state.talk || []).some(m => m.id === id && !state.nations[m.to]?.eliminated));
  const from = Math.min(state.events.length, Number.isFinite(rt.talkEvents[nationId]) ? rt.talkEvents[nationId] : rt.periodEventStart);
  const initiatives = !Number.isFinite(rt.talkDay[nationId]) || state.day - rt.talkDay[nationId] >= R.ai.talkEveryDays;
  aiTalk(state, map, { published, turnEvents: state.events.slice(from), only: nationId, initiatives });
  if (initiatives) rt.talkDay[nationId] = state.day;
  rt.talkEvents[nationId] = state.events.length;
}
/** Fin de période (tous les 30 jours) : ce que le tour par tour faisait une fois par tour, hors ordres et combats. */
function periodEnd(state, map) {
  const rt = realtimeLedger(state), day = state.day;
  repairForts(state, recentSet(rt.bombarded, day, R.daysPerPeriod));
  settleStationed(state, map);
  // V17.5 : les ballons volent en jours (advanceDay) ; seul le rapport privé reste tous les 30 jours.
  // Ancienne sauvegarde V17.1-V17.4 : un envoi « programmé » pour la fin de période part maintenant.
  const scheduled = (state.orders || []).filter(o => o.kind === 'balloon-send' && o.status === 'scheduled');
  if (scheduled.length) { sendBalloonsNow(state, map, scheduled); state.orders = state.orders.filter(o => !scheduled.includes(o)); }
  balloonPeriodReports(state, map, rt.periodOrders);
  // Récapitulatif des revenus de la période (sans bandeau) : ce qui est réellement entré au trésor.
  const me = state.playerNationId;
  if (me && state.nations[me] && !state.nations[me].eliminated) state.events.push({ turn: state.turn, type: 'income', nationId: me, amount: rt.periodIncome[me] || 0, days: R.daysPerPeriod, ...incomeBreakdown(state, me) });
  // Engagements d'aide, guerres d'hostilité, propositions expirées (180 jours), dérive de la tension (cahier §2.2 : 30 j).
  // V17.5 : les paroles des IA passent à leur décision (aiTalkOfDay), plus en fin de période.
  expireHelpPacts(state);
  hostilityWars(state, (a, b, value) => hostilityWar(state, a, b, value));
  state.diplomacy.proposals = (state.diplomacy.proposals || []).filter(p => proposalAlive(state, p) && !state.nations[p.from]?.eliminated);
  driftTension(state);
  observeLeaders(state);
  pruneTalkPending(state);
  recordStory(state, rt.periodEventStart);
  buildTurnJournal(state, map, rt.periodEventStart);
  // Mémoires bornées : on ne garde que les 30 derniers jours de combats / bombardements.
  for (const bag of [rt.fought, rt.bombarded]) for (const [id, d] of Object.entries(bag)) if (day - d >= R.daysPerPeriod) delete bag[id];
  rt.periodTalk = []; rt.periodOrders = []; rt.periodIncome = {};
  rt.periodEventStart = state.events.length;
}
/**
 * Un jour de plus. Ne fait rien sur une partie tour par tour ou terminée. Renvoie l'état.
 * `random` : tirages de la diplomatie (graine de la partie par défaut).
 */
export function advanceDay(state, map, { random = () => seededRandom(state) } = {}) {
  if (!isRealtime(state) || state.gameOver) return state;
  const rt = realtimeLedger(state), day = state.day, eventStart = state.events.length;
  state.turn = periodOfDay(day);
  // 1) Ordres du jour. V17.5 : réponses dues aujourd'hui, réactions de l'IA du jour (retraite, rappel, renfort), son
  // plan, ses paroles ; puis tous les ordres en attente partent.
  releaseAnswers(state, day);
  const decider = aiNationOfDay(state, day);
  if (decider) { aiReact(state, map, decider); planAIOrders(state, map, { only: decider }); aiTalkOfDay(state, map, decider); }
  executePendingOrders(state, map, { random });
  state.nextAiDay = nextAiDays(state, day + 1);
  // 2) et 3) Marches : avancée, rencontres, arrivées ; convois : un jour de mer, rencontres, débarquements.
  const fought = new Set();
  marchEncounters(state, day);
  marchArrivals(state, map, fought, day);
  settleStationed(state, map);
  const before = new Set((state.transports || []).map(t => t.id));
  resolveTransports(state, map, fought, { onLanding: (toId, groups) => joinBattle(state, toId, groups, day) });
  for (const t of state.transports || []) if (!before.has(t.id)) stampConvoy(state, t, day + 1);
  settleStationed(state, map);
  // 4) Assauts du jour (V17.2) : J, J+3, J+6 ; renforts arrivés entre-temps compris.
  resolveBattles(state, map, fought, day);
  settleStationed(state, map);
  // 7a) Tous les 10 jours : bombardements permanents, puis guérison (pas dans une province en bataille, ni 10 jours après).
  if (day % R.bombard.everyDays === 0) markDays(rt.bombarded, bombardTick(state, map, fought), day);
  markDays(rt.fought, fought, day);
  if (day % R.recovery.healEveryDays === 0) {
    const blocked = recentSet(rt.fought, day, R.battle.noHealDays);
    for (const b of state.battles || []) blocked.add(b.provinceId);
    healProvinces(state, blocked);
  }
  // 5) Chantiers et recrutements ; V17.5 : un jour de vol pour les ballons.
  progressProjects(state);
  advanceBalloonsDay(state, map);
  // 6) Revenus.
  dailyIncome(state);
  // 6 bis) Nourriture (V17.4) : réserve, alerte, famine et désertion.
  dailyFood(state);
  // Éliminations : chaque jour (une élimination du joueur est une fin de partie, vérifiée chaque jour, §9.1).
  updateEliminations(state);
  settleStationed(state, map);
  // 7) Rythmes du monde.
  if (day % R.world.coalitionEveryDays === 0) updateCoalition(state);
  if (isPeriodEnd(day)) periodEnd(state, map);
  // 8) Fin de partie, alertes.
  checkGameOver(state);
  if (!state.gameOver) for (const a of endAlertDays(state)) if (a.day === day + 1) state.events.push({ turn: state.turn, type: 'final-days', alert: a.id, day: day + 1, ...(state.gameLength ? { length: state.gameLength } : {}) });
  stampDay(state, eventStart);
  buildPermanentJournal(state, map, rt.chronicleIndex);
  rt.chronicleIndex = state.events.length;
  if (state.gameOver) { buildTurnJournal(state, map, rt.periodEventStart); return state; }
  // 9) Jour suivant.
  state.day = day + 1;
  state.turn = periodOfDay(state.day);
  return state;
}
/** Plusieurs jours d'affilée (outils, tests). */
export function advanceDays(state, map, count, options) {
  for (let i = 0; i < count && !state.gameOver; i++) advanceDay(state, map, options);
  return state;
}
