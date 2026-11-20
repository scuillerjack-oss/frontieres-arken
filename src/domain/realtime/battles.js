// V17.2 — Batailles terrestres en temps réel (docs/V17-cahier-des-charges.md §5.2, §5.5) : 3 assauts (le jour de l'arrivée,
// J+3, J+6), renforts qui rejoignent entre les assauts, retraite volontaire, prise à n'importe quel assaut, plusieurs nations
// (B2), débarquement repoussé qui rembarque. Module pur, déterministe, sans DOM.
//
// Chaque assaut = fightAssault(…, { passes: 1 }) du moteur actuel (engine/battles.js : mêmes PV, forteresse, brèche, navires
// qui ne tirent que sur des navires à terre, île mystérieuse neutre et co-propriété, alliés stationnés en défense). Une
// bataille de 3 assauts d'une passe sans renfort donne exactement le combat de 3 passes du tour par tour (§13.5, test V17.2).
//
// Une bataille (sauvegardée, JSON) :
//   { id, provinceId, defenderId, startDay, assaults, nextAssaultDay, lastAssaultDay,
//     attackers: [{ nationId, mode:'land'|'landing', units, warships, wounds, originIds, retreatTo, convoy?, fresh?, joinedDay }],
//     totals: { attackers, originIds, naval, lossesByNation, hpLostByNation, engagedByNation, defenderLosses, defenderHpLost,
//               passes, guests, guestLosses, after } }
// Défense : la garnison de la province + les troupes alliées stationnées, lues à CHAQUE assaut (troupes du propriétaire
// arrivées entre-temps, recrues livrées, alliés venus stationner : tout le monde défend). Le défenseur ne peut pas quitter
// la province tant que la bataille dure (marches.js : ordre annulé, raison 'besieged').

import { COMBAT_TYPES, fortReductionPct, legacyForce, mergeForce, normalizeForce, provinceForce, resolveBattle, toLegacy, totalHp } from '../combat.js';
import { fortBonusFactor } from '../boosts.js';
import { RULES } from '../constants.js';
import { hasPassage, guestsAt, stationedForce } from '../passage.js';
import { isMysteryIsland, NEUTRAL_KEY } from '../mystery-island.js';
import { fightAssault, fightEvent, lossCount, onCapture, unitCount } from '../engine/battles.js';
import { fortBreach } from '../engine/bombard.js';
import { dockEscort, stampConvoy, turnBack } from '../engine/convoys.js';
import { pairWar, treatiesKey } from '../engine/shared.js';
import { createMarch } from './marches.js';
import { fireFactorFor } from './food.js';

const B = RULES.realtime.battle;
const isEmpty = f => COMBAT_TYPES.every(k => !f.units[k]);
const addCounts = (a = {}, b = {}) => { const out = { ...a }; for (const k of COMBAT_TYPES) if (b[k]) out[k] = (out[k] || 0) + b[k]; for (const k of COMBAT_TYPES) out[k] = out[k] || 0; return out; };
const entryForce = e => legacyForce(e);
const writeEntry = (e, force) => Object.assign(e, toLegacy(force));

/** Facteur de tir d'une nation (famine de la V17.4 : 0,7), appelé pour chaque camp à chaque assaut. */
export { fireFactorFor };

/** Bataille en cours dans une province (ou null). */
export const battleAt = (state, provinceId) => (state.battles || []).find(b => b.provinceId === provinceId) || null;
/** Batailles où une nation est engagée (en attaque ou en défense). */
export const battlesOf = (state, nationId) => (state.battles || []).filter(b => b.defenderId === nationId || b.attackers.some(e => e.nationId === nationId)
  || state.provinces[b.provinceId]?.ownerId === nationId);
/** La province `provinceId` est-elle assiégée pour `nationId` (ses troupes, ou celles qu'elle y a stationnées, sont bloquées) ? */
export function besieged(state, provinceId, nationId) {
  const b = battleAt(state, provinceId);
  return Boolean(b) && !b.attackers.some(e => e.nationId === nationId);
}

function nextBattleId(state) {
  state.battleSequence = Math.max(1, Number(state.battleSequence) || 1);
  return `b${state.battleSequence++}`;
}
const emptyTotals = () => ({ attackers: [], originIds: [], naval: false, lossesByNation: {}, hpLostByNation: {}, engagedByNation: {}, defenderLosses: 0, defenderHpLost: 0, passes: 0, guests: [], guestLosses: {}, after: {} });

/**
 * Des armées hostiles arrivent dans `toId` (marches par la terre, débarquements). Elles ouvrent la bataille (premier assaut
 * aujourd'hui) ou rejoignent celle en cours : elles combattront au prochain assaut, le compteur ne repart pas à zéro.
 * groups : [{ nationId, force, originIds, retreatTo, mode:'land'|'landing', convoys? }] (comme pour fight).
 */
export function joinBattle(state, toId, groups, day = state.day) {
  const target = state.provinces[toId];
  if (!target) return null;
  groups = groups.filter(g => g.nationId !== target.ownerId && !isEmpty(normalizeForce(g.force)));
  if (!groups.length) return null;
  let b = battleAt(state, toId);
  const fresh = !b;
  if (!b) {
    b = { id: nextBattleId(state), provinceId: toId, defenderId: target.ownerId ?? null, startDay: day, assaults: 0, nextAssaultDay: day, lastAssaultDay: null, attackers: [], totals: emptyTotals() };
    (state.battles ||= []).push(b);
  }
  for (const g of [...groups].sort((x, y) => x.nationId.localeCompare(y.nationId))) {
    let e = b.attackers.find(x => x.nationId === g.nationId);
    const c = (g.convoys || [])[0];
    if (!e) {
      // État diplomatique au DÉPART de l'armée (marche ou convoi ; à défaut, à l'arrivée) : une trêve, une paix ou une alliance
      // avec ce défenseur signée depuis renvoie l'arrivant chez lui avant son premier assaut.
      const def = b.defenderId, src = (g.marches || g.convoys || [])[0];
      const known = src && typeof src.warAtDeparture === 'boolean';
      e = { nationId: g.nationId, mode: g.mode || 'land', ...toLegacy(normalizeForce({})), originIds: [], retreatTo: [], fresh: true, joinedDay: day,
        ...(def ? { warAtDeparture: known ? src.warAtDeparture : pairWar(state, g.nationId, def), treatiesAtDeparture: known ? (src.treatiesAtDeparture || '') : treatiesKey(state, g.nationId, def) } : {}) };
      b.attackers.push(e);
      b.attackers.sort((x, y) => x.nationId.localeCompare(y.nationId));
    }
    writeEntry(e, mergeForce(entryForce(e), g.force));
    for (const id of g.originIds || []) if (!e.originIds.includes(id)) e.originIds.push(id);
    for (const id of g.retreatTo || g.originIds || []) if (!e.retreatTo.includes(id)) e.retreatTo.push(id);
    if (c && !e.convoy) e.convoy = { id: c.id, nationId: c.nationId, fromId: c.fromId, toId: c.toId, via: c.via, lane: c.lane, turns: c.turns, ...(c.allyPort ? { allyPort: c.allyPort } : {}) };
    const t = b.totals;
    if (!t.attackers.includes(g.nationId)) { t.attackers.push(g.nationId); t.attackers.sort(); }
    for (const id of g.originIds || []) if (!t.originIds.includes(id)) t.originIds.push(id);
    if ((g.mode || 'land') === 'landing') t.naval = true;
    t.engagedByNation[g.nationId] = addCounts(t.engagedByNation[g.nationId], normalizeForce(g.force).units);
    if (!fresh) state.events.push({ turn: state.turn, type: 'battle-reinforced', nationId: g.nationId, attacker: g.nationId, defender: b.defenderId, provinceId: toId, battleId: b.id,
      amount: unitCount(normalizeForce(g.force)), assault: b.assaults + 1, assaults: B.assaults, nextAssaultDay: b.nextAssaultDay, naval: (g.mode || 'land') === 'landing' });
  }
  return b;
}

/** Province où se replier : la 1re origine encore à soi, sinon chez un allié, sinon la 1re (l'armée y sera perdue). */
function homeOf(state, e) {
  const list = e.retreatTo?.length ? e.retreatTo : e.originIds;
  return list.find(id => state.provinces[id]?.ownerId === e.nationId) || list.find(id => hasPassage(state, e.nationId, state.provinces[id]?.ownerId)) || list[0];
}
/**
 * Les survivants d'un attaquant quittent la bataille : par la terre, une marche de retour (30 jours, 20 pour la cavalerie
 * seule) ; venus par la mer, ils rembarquent et le convoi rentre (même durée que l'aller). `startDay` : jour du départ.
 */
function leave(state, map, b, e, force, { startDay, reason }) {
  if (isEmpty(force)) return;
  const amount = unitCount(force);
  if (e.mode === 'landing' && e.convoy) {
    const before = new Set((state.transports || []).map(t => t.id));
    turnBack(state, e.convoy, force, reason === 'retreat' ? 'retreat' : 'repelled', map);
    const back = (state.transports || []).find(t => !before.has(t.id));
    if (back) stampConvoy(state, back, startDay);
    state.events.push({ turn: state.turn, type: 'battle-retreat', nationId: e.nationId, attacker: e.nationId, defender: b.defenderId, provinceId: b.provinceId, battleId: b.id, reason,
      toId: e.convoy.fromId, amount, naval: true, ...(back ? { arriveDay: back.arriveDay } : {}) });
    return;
  }
  const home = homeOf(state, e);
  const m = createMarch(state, { nationId: e.nationId, fromId: b.provinceId, toId: home, force, startDay, returning: true });
  state.events.push({ turn: state.turn, type: 'battle-retreat', nationId: e.nationId, attacker: e.nationId, defender: b.defenderId, provinceId: b.provinceId, battleId: b.id, reason,
    toId: home, amount, arriveDay: m.arriveDay, marchId: m.id });
}
const endBattle = (state, b) => { state.battles = (state.battles || []).filter(x => x !== b); };

/** Chiffres de toute la bataille (remplacent ceux du dernier assaut dans le récit 'battle' / 'conquest'). */
function totalsOf(state, b, winnerId) {
  const t = b.totals, def = b.defenderId ?? NEUTRAL_KEY, atk = t.attackers;
  const hp = id => { const e = b.attackers.find(x => x.nationId === id); return e ? totalHp(entryForce(e)) : 0; };
  const primary = winnerId || [...atk].sort((x, y) => hp(y) - hp(x) || x.localeCompare(y))[0];
  const zero = () => Object.fromEntries(COMBAT_TYPES.map(k => [k, 0]));
  const guests = t.guests.filter(id => id !== def);
  return {
    attacker: primary, attackers: [...atk], originIds: [...t.originIds], naval: t.naval,
    attackerLosses: atk.reduce((n, id) => n + lossCount(t.lossesByNation[id]), 0), defenderLosses: t.defenderLosses,
    attackerHpLost: atk.reduce((n, id) => n + (t.hpLostByNation[id] || 0), 0), defenderHpLost: t.defenderHpLost,
    lossesByNation: Object.fromEntries([...atk.map(id => [id, t.lossesByNation[id] || zero()]), [def, t.lossesByNation[def] || zero()], ...guests.map(id => [id, t.lossesByNation[id] || zero()])]),
    engagedByNation: Object.fromEntries([...atk.map(id => [id, t.engagedByNation[id] || zero()]), [def, t.engagedByNation[def] || zero()], ...guests.map(id => [id, t.engagedByNation[id] || zero()])]),
    hpLostByNation: Object.fromEntries([...atk.map(id => [id, t.hpLostByNation[id] || 0]), [def, t.hpLostByNation[def] || 0], ...guests.map(id => [id, t.hpLostByNation[id] || 0])]),
    passes: t.passes, ...(guests.length ? { guests, guestLosses: Object.fromEntries(guests.map(id => [id, t.guestLosses[id] || zero()])) } : {}),
    battleId: b.id, assaults: b.assaults, startDay: b.startDay
  };
}
/** Récit d'une bataille terminée sans assaut ce jour-là (retraite de tous les attaquants, paix) : la défense a tenu. */
function summaryEvent(state, b) {
  const target = state.provinces[b.provinceId], level = target?.buildings?.fort || 0, breach = fortBreach(state, b.provinceId);
  return { turn: state.turn, type: 'battle', attacker: null, attackers: [], defender: b.defenderId, provinceId: b.provinceId, originIds: [], naval: false,
    ...totalsOf(state, b, null), fortLevel: level, ...(b.totals.naval ? { landingPct: Math.round(RULES.combat.landingPenalty * 100) } : {}),
    fortPct: fortReductionPct(level, fortBonusFactor(state, b.defenderId), breach), ...(breach && level ? { fortBreach: breach } : {}), ended: 'retreat' };
}

/** Ajoute l'issue d'un assaut aux chiffres de la bataille. */
function accumulate(state, b, ctx) {
  const t = b.totals, { res, defender, guests, own, guestLosses, guestHpLost, ownLosses } = ctx, def = defender ?? NEUTRAL_KEY;
  res.attackers.forEach(a => { t.lossesByNation[a.id] = addCounts(t.lossesByNation[a.id], a.lossesByType); t.hpLostByNation[a.id] = (t.hpLostByNation[a.id] || 0) + a.hpLost; });
  t.lossesByNation[def] = addCounts(t.lossesByNation[def], ownLosses);
  for (const [id, l] of Object.entries(guestLosses)) { t.lossesByNation[id] = addCounts(t.lossesByNation[id], l); t.guestLosses[id] = addCounts(t.guestLosses[id], l); }
  const guestHp = Object.values(guestHpLost).reduce((n, v) => n + v, 0);
  t.hpLostByNation[def] = (t.hpLostByNation[def] || 0) + Math.max(0, res.defenderHpLost - guestHp);
  for (const [id, v] of Object.entries(guestHpLost)) t.hpLostByNation[id] = (t.hpLostByNation[id] || 0) + v;
  t.defenderLosses += lossCount(res.defenderLossesByType); t.defenderHpLost += res.defenderHpLost; t.passes += res.passes.length;
  // Forces engagées en défense : la garnison du premier assaut, puis tout ce qui est arrivé depuis l'assaut précédent.
  const engage = (id, units) => { const prev = t.after[id]; const add = prev ? Object.fromEntries(COMBAT_TYPES.map(k => [k, Math.max(0, (units[k] || 0) - (prev[k] || 0))])) : units;
    t.engagedByNation[id] = addCounts(t.engagedByNation[id], add); };
  engage(def, own.units);
  for (const e of guests) { engage(e.nationId, legacyForce(e).units); if (!t.guests.includes(e.nationId)) t.guests.push(e.nationId); }
  const target = state.provinces[b.provinceId];
  t.after = { [def]: res.captured ? Object.fromEntries(COMBAT_TYPES.map(k => [k, 0])) : { ...provinceForce(target).units } };
  if (!res.captured) for (const e of guests) t.after[e.nationId] = { ...stationedForce(state, b.provinceId, e.nationId).units };
}

/**
 * Un assaut de la bataille `b` (jour `day`). Arrêt : prise (la province change de main le jour de l'assaut gagnant, les
 * autres attaquants rentrent), plus aucun attaquant ou plus personne qui puisse tirer, ou 3e assaut sans prise (tous les
 * survivants se replient). Sinon, prochain assaut dans 3 jours.
 */
function assault(state, map, b, fought, day) {
  const target = state.provinces[b.provinceId];
  const groups = b.attackers.filter(e => !isEmpty(entryForce(e))).map(e => ({ nationId: e.nationId, force: entryForce(e), originIds: e.originIds, retreatTo: e.retreatTo, mode: e.mode,
    fireFactor: fireFactorFor(state, e.nationId), fresh: e.fresh !== false, entry: e }));
  const ctx = fightAssault(state, b.provinceId, groups, fought, { passes: 1, strike: g => g.fresh, defenderFireFactor: target.ownerId ? fireFactorFor(state, target.ownerId) : 1 });
  if (!ctx) { endBattle(state, b); return; }
  for (const e of b.attackers) e.fresh = false;
  ctx.res.attackers.forEach((a, i) => writeEntry(ctx.groups[i].entry, a.force));
  b.assaults++; b.lastAssaultDay = day;
  accumulate(state, b, ctx);
  const { res } = ctx;
  const over = res.captured || !b.attackers.some(e => totalHp(entryForce(e)) > 0) || !res.passes.length || b.assaults >= B.assaults;
  if (!over) b.nextAssaultDay = day + B.assaultEveryDays;
  state.events.push({ turn: state.turn, type: 'assault', battleId: b.id, provinceId: b.provinceId, attacker: ctx.groups[0].nationId, attackers: ctx.groups.map(g => g.nationId), defender: b.defenderId,
    assault: b.assaults, assaults: B.assaults, captured: res.captured, ...(res.captured ? { newOwnerId: res.winnerId } : {}), over, ...(over ? {} : { nextAssaultDay: b.nextAssaultDay }),
    attackerHpLost: res.attackers.reduce((n, a) => n + a.hpLost, 0), defenderHpLost: res.defenderHpLost, naval: b.totals.naval });
  if (!over) return;
  // Fin de la bataille : récit complet (chiffres de toute la bataille), prise, replis.
  state.events.push(fightEvent(state, b.provinceId, ctx, { totals: totalsOf(state, b, res.winnerId) }));
  if (res.captured) {
    onCapture(state, b.provinceId, res.winnerId, ctx.defender);
    const winner = b.attackers.find(e => e.nationId === res.winnerId);
    if (winner?.mode === 'landing' && winner.convoy) dockEscort(state, map, b.provinceId, winner.nationId, winner.convoy.fromId, winner.convoy.lane || [winner.convoy.fromId, winner.convoy.via].sort().join('|'), winner.convoy.turns);
  }
  const staying = new Set([res.winnerId, ctx.partner?.id].filter(Boolean));
  endBattle(state, b);
  for (const e of b.attackers) if (!staying.has(e.nationId)) leave(state, map, b, e, entryForce(e), { startDay: day + 1, reason: res.captured ? 'captured' : 'repelled' });
}

/**
 * Étape 4 du jour : assauts dus aujourd'hui (ordre fixe : identifiant de bataille). Avant chaque assaut : un attaquant qui
 * n'est plus en guerre avec le défenseur (paix, trêve signée pendant la bataille) rentre sans combattre ; province passée
 * à une autre nation : la bataille s'arrête, les troupes de cette nation entrent, les autres rentrent.
 */
export function resolveBattles(state, map, fought, day = state.day) {
  for (const b of [...(state.battles || [])].sort((x, y) => String(x.id).localeCompare(String(y.id)))) {
    if (!(state.battles || []).includes(b)) continue;
    const target = state.provinces[b.provinceId];
    if (!target) { endBattle(state, b); continue; }
    if ((target.ownerId ?? null) !== b.defenderId) {
      endBattle(state, b);
      for (const e of b.attackers) {
        const f = entryForce(e);
        if (target.ownerId === e.nationId) writeProvinceUnits(target, f);
        else leave(state, map, b, e, f, { startDay: day + 1, reason: 'owner-changed' });
      }
      continue;
    }
    if (b.defenderId) for (const e of [...b.attackers]) {
      if (pairWar(state, e.nationId, b.defenderId) || isEmpty(entryForce(e))) continue;
      // Plus en guerre avec le défenseur. Un arrivant (pas encore au combat) qui était déjà sans guerre à son DÉPART et n'a
      // signé aucun traité avec lui depuis attaque : il déclare la guerre à son premier assaut (règle V10 : attaquer = guerre),
      // même en renfort d'une bataille en cours. Font demi-tour, sans trahison : un attaquant qui a déjà combattu, ou un arrivant
      // dont la guerre a pris fin (paix) ou qui a signé une trêve / une alliance depuis son départ.
      const aggression = e.fresh !== false && e.warAtDeparture === false && treatiesKey(state, e.nationId, b.defenderId) === (e.treatiesAtDeparture || '');
      if (aggression) continue;
      b.attackers = b.attackers.filter(x => x !== e);
      leave(state, map, b, e, entryForce(e), { startDay: day + 1, reason: 'peace' });
    }
    b.attackers = b.attackers.filter(e => !isEmpty(entryForce(e)));
    if (!b.attackers.length) { if (b.assaults) state.events.push(summaryEvent(state, b)); endBattle(state, b); continue; }
    if (b.nextAssaultDay <= day) assault(state, map, b, fought, day);
  }
}
const writeProvinceUnits = (p, force) => { const merged = mergeForce(provinceForce(p), force); for (const k of ['infantry', 'cavalry', 'armor', 'artillery']) p.units[k] = merged.units[k]; p.warships = merged.units.warship; p.wounds = { ...merged.wounds }; };

/**
 * Retraite volontaire (bouton « Retraite » du joueur, IA en V17.5) : les survivants de `nationId` quittent tout de suite la
 * bataille (même trajet de retour qu'un repli). Plus aucun attaquant : la défense a tenu. { ok, error?, arriveDay? }
 */
export function retreatFromBattle(state, map, { nationId, battleId }) {
  const b = (state.battles || []).find(x => x.id === battleId);
  if (!b) return { ok: false, error: 'Bataille introuvable' };
  const e = b.attackers.find(x => x.nationId === nationId);
  if (!e) return { ok: false, error: b.defenderId === nationId ? 'Le défenseur ne peut pas quitter une province assiégée' : 'Vous ne participez pas à cette bataille' };
  b.attackers = b.attackers.filter(x => x !== e);
  const before = state.events.length;
  leave(state, map, b, e, entryForce(e), { startDay: state.day, reason: 'retreat' });
  const ev = state.events.slice(before).find(x => x.type === 'battle-retreat');
  if (!b.attackers.some(x => !isEmpty(entryForce(x)))) { if (b.assaults) state.events.push(summaryEvent(state, b)); endBattle(state, b); }
  for (let i = before; i < state.events.length; i++) if (!Number.isFinite(state.events[i].day)) state.events[i].day = state.day;
  return { ok: true, arriveDay: ev?.arriveDay ?? state.day };
}

/**
 * Pronostic (affichage, IA V17.5) : les assauts restants joués avec les forces présentes, sans renfort. `nationId` gagne-t-il ?
 * { assaultsLeft, captured, winnerId, attackerHp, defenderHp } — pur, ne modifie rien.
 */
export function battleForecast(state, battleId) {
  const b = (state.battles || []).find(x => x.id === battleId);
  if (!b) return null;
  const target = state.provinces[b.provinceId], left = Math.max(0, B.assaults - b.assaults);
  const defender = guestsAt(state, b.provinceId).reduce((f, e) => mergeForce(f, legacyForce(e)), provinceForce(target));
  const r = resolveBattle({ defender, attackers: b.attackers.map(e => ({ id: e.nationId, force: entryForce(e), mode: e.mode })), fortLevel: target.buildings?.fort || 0,
    fortBonus: fortBonusFactor(state, target.ownerId), fortBreach: fortBreach(state, b.provinceId), passes: left });
  return { assaultsLeft: left, captured: r.captured, winnerId: r.winnerId, attackerHp: r.attackers.reduce((n, a) => n + totalHp(a.force), 0), defenderHp: totalHp(r.defender) };
}
/**
 * Résumé lisible d'une bataille pour l'interface : assaut n / 3, prochain assaut, camps, PV.
 * Dates affichées (`startDate`, `nextAssaultDate`) : comme pour les marches (« sur place le jour arriveDay »), un assaut joué
 * pendant le traitement du jour D se voit à la date D + 1 ; `startDay` / `nextAssaultDay` restent les jours du moteur.
 */
export function battleSummary(state, b) {
  const target = state.provinces[b.provinceId];
  const defenderHp = totalHp(guestsAt(state, b.provinceId).reduce((f, e) => mergeForce(f, legacyForce(e)), provinceForce(target)));
  return { id: b.id, provinceId: b.provinceId, defenderId: b.defenderId, assaultsDone: b.assaults, assaults: B.assaults, nextAssault: Math.min(B.assaults, b.assaults + 1),
    nextAssaultDay: b.nextAssaultDay, startDay: b.startDay, nextAssaultDate: b.nextAssaultDay + 1, startDate: b.startDay + 1, attackers: b.attackers.map(e => ({ nationId: e.nationId, mode: e.mode, units: unitCount(entryForce(e)), hp: totalHp(entryForce(e)) })),
    defenderHp, island: isMysteryIsland(b.provinceId) };
}
/** Toutes les unités d'une nation engagées en attaque dans une bataille (comptées dans son armée, et pour l'élimination). */
export const battleForcesOf = (state, nationId) => (state.battles || []).flatMap(b => b.attackers.filter(e => e.nationId === nationId));
