// V16 — Campagne de tests : parties entières jouées sans écran, avec vérification d'invariants à CHAQUE tour.
// Aucun fichier du jeu n'est modifié : ce module appelle le moteur (src/domain) et les modules d'affichage purs
// (src/presentation/*-view.js) exactement comme l'interface, et relève tout ce qui sort des règles.
//
// Utilisé par scripts/campagne.js (version longue, `npm run campagne`) et tests/campagne.test.js (version courte, `npm test`).
//
// Reproductibilité : chaque partie a une graine texte (`campagne-<préfixe>-<n>`) qui fixe la partie du moteur ET les
// choix du joueur scripté (générateur mulberry32 local, jamais Math.random). Math.random est piégé : s'il est appelé
// pendant une partie, c'est une erreur relevée (le moteur doit être déterministe, docs/V15-cahier-des-charges.md).
import { createHash } from 'node:crypto';
import { arkenV9Map as map } from '../src/map/arken-v9-map.js';
import { createGameState } from '../src/state/create-game-state.js';
import { encodeSave, decodeSave } from '../src/persistence/save-codec.js';
import { RULES, LAND_UNIT_TYPES, SAVE_SCHEMA_VERSION, SHORT_GAME_SCHEMA_VERSION } from '../src/domain/constants.js';
import * as E from '../src/domain/game-engine.js';
import { maxWoundsFor, COMBAT_TYPES } from '../src/domain/combat.js';
import { setPlayerBonuses, BOOST_KEYS } from '../src/domain/boosts.js';
import { talkOptions, queueTalk, TALK_LIMIT, TONES } from '../src/domain/talk.js';
import { queueHelpRequest } from '../src/domain/alliances.js';
import { aiAttackSlice } from '../src/domain/engine/ai.js';
import { navalBase } from '../src/domain/engine/ai-naval.js';
import { isPortPoint } from '../src/domain/engine/sea-routes.js';
import { gameLengthOf } from '../src/domain/game-length.js';
import { DIFFICULTY_IDS } from '../src/domain/difficulty.js';
import { buildEndStory } from '../src/domain/story.js';
import {
  createProfile, sanitizeProfile, recordGameStarted, missionDeltas, addMissionProgress, PRODUCTS, ALLOWED_GRANTS
} from '../src/domain/profile.js';
import { recordFinishedGame, sanitizePalmares, TITLES } from '../src/domain/palmares.js';
import { endStoryHtml } from '../src/presentation/end-view.js';
import { palmaresHtml, endTitlesHtml } from '../src/presentation/palmares-view.js';
import { planTurnAnimation, MAX_ANIMATION_MS } from '../src/presentation/turn-animation.js';
import { capitalPopups, seaFatePopups, helpChoices } from '../src/presentation/alliances-view.js';
import { coalitionPopups, coalitionBanner, coalitionDetails } from '../src/presentation/coalition-view.js';
import { talkFeed, talkBadgeCount } from '../src/presentation/leaders-view.js';
import { provinceTroopView } from '../src/presentation/vision-view.js';
import { compactForces, diplomacyActions, totalArmy } from '../src/presentation/overview-view.js';
import { fortInfo } from '../src/presentation/passage-fort-view.js';
import { cancelPendingOrder, playerOrderArrows, convoyMarkers } from '../src/presentation/map-orders-view.js';
import { ceasefireRange } from '../src/presentation/ceasefire-view.js';
import { truceWarning } from '../src/presentation/truce-warning.js';
import { shouldShowGameStartAd, showGameStartAd } from '../src/presentation/ads.js';

export { map };
export const NATIONS = map.nations.map(n => n.id);
export const PROVINCES = map.provinces.map(p => p.id);
export const STRATEGIES = Object.freeze(['passif', 'agressif', 'aleatoire', 'diplomate', 'ia']);
export const LENGTHS = Object.freeze([40, 80]);
export { DIFFICULTY_IDS };
const sha = text => createHash('sha256').update(text).digest('hex');
const names = { nation: id => map.nations.find(n => n.id === id)?.short || id, province: id => map.provinces.find(p => p.id === id)?.name || id };
const MAX_TURN_SAFETY = 200; // garde-fou : une partie qui dépasserait ce nombre de tours serait bloquée

/** Générateur à graine (mulberry32), pour les choix du joueur scripté uniquement. */
export function rng(seedText) {
  let a = 0;
  for (const c of String(seedText)) a = (Math.imul(a ^ c.charCodeAt(0), 2654435761) + 1) >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const pick = (r, list) => list[Math.floor(r() * list.length) % Math.max(1, list.length)];

// --- Plan de campagne -------------------------------------------------------------------------------------------
/**
 * Plan croisé : nation × longueur × difficulté × stratégie (5 × 2 × 3 × 5 = 150 combinaisons). La partie n vise la
 * combinaison n modulo 150, en faisant varier les 4 axes à des rythmes premiers entre eux, pour qu'un petit échantillon
 * (les 20 premières parties) couvre déjà chaque nation, chaque longueur, chaque niveau et chaque stratégie.
 */
export function campaignPlan(count, prefix = 'c') {
  const out = [];
  for (let n = 0; n < count; n++) {
    out.push({
      index: n, seed: `campagne-${prefix}-${n}`,
      nation: NATIONS[n % 5], length: LENGTHS[Math.floor(n / 5) % 2], difficulty: DIFFICULTY_IDS[n % 3], strategy: STRATEGIES[(n + Math.floor(n / 10)) % 5],
      // Sauvegarde/rechargement en milieu de partie sur une partie sur trois ; atouts du profil sur une sur quatre.
      saveCheck: n % 3 === 0, boosts: n % 4 === 1 ? { gold: 10, recruit: 10, build: 10, fort: 10, naval: 10 } : n % 4 === 3 ? { gold: 3, naval: 7 } : null
    });
  }
  return out;
}

// --- Joueurs scriptés -------------------------------------------------------------------------------------------
const owned = (s, id) => map.provinces.filter(p => s.provinces[p.id].ownerId === id);
const atWar = (s, a, b) => s.diplomacy.wars.some(w => w.active !== false && w.participants.includes(a) && w.participants.includes(b));
const allied = (s, a, b) => s.diplomacy.treaties.some(t => t.active !== false && t.type === 'alliance' && t.parties.includes(a) && t.parties.includes(b));
const count = (s, id) => Object.values(s.provinces).filter(p => p.ownerId === id).length;

/** Passif : ne donne aucun ordre, ne répond à rien (le joueur qui pose son téléphone). */
function joueurPassif() {}

/** Agressif : base navale, blindés, flotte, attaque partout où le combat simulé le permet ; bombarde ; refuse les trêves. */
function joueurAgressif(s, ctx) {
  const me = s.playerNationId, mine = owned(s, me);
  if (!mine.length) return;
  const note = ctx.note;
  const reach = mine.flatMap(p => E.legalDestinations(map, s, p.id).map(d => s.provinces[d.id].ownerId)).filter(o => o !== me);
  const prey = [...new Set(reach)].filter(n => !allied(s, me, n)).sort((a, b) => Number(atWar(s, me, b)) - Number(atWar(s, me, a)) || count(s, a) - count(s, b) || a.localeCompare(b))[0];
  for (const p of E.proposalsToAnswer(s, me)) note('reponse', E.respondToProposal(s, { nationId: me, from: p.from, accept: p.from !== prey }));
  if (prey && !atWar(s, me, prey)) note('guerre', E.queueDiplomaticOrder(s, { nationId: me, target: prey, action: 'war' }));
  const gold = () => E.spendableTreasury(s, me), base = navalBase(map, s, mine);
  if (base) {
    if (!s.provinces[base.id].buildings.port) note('port', E.queueConstruction(s, { nationId: me, provinceId: base.id, type: 'port' }));
    if (!s.provinces[base.id].buildings.factory) note('usine', E.queueConstruction(s, { nationId: me, provinceId: base.id, type: 'factory' }));
    const b = s.provinces[base.id];
    if (b.buildings.port && b.buildings.factory) {
      const fleet = mine.reduce((n, p) => n + (s.provinces[p.id].warships || 0), 0);
      if (fleet < 3 + Math.floor(s.turn / 8) && gold() >= RULES.units.warship.cost) note('navire', E.queueRecruitment(s, { nationId: me, provinceId: base.id, type: 'warship', lots: 1 }));
      let guard = 0;
      while (gold() >= RULES.units.armor.cost && guard++ < 20) if (!note('blinde', E.queueRecruitment(s, { nationId: me, provinceId: base.id, type: 'armor', lots: 1 })).ok) break;
    } else if (gold() >= RULES.units.infantry.cost) note('infanterie', E.queueRecruitment(s, { nationId: me, provinceId: base.id, type: 'infantry', lots: Math.floor(gold() / RULES.units.infantry.cost) }));
  }
  // Bombardement d'abord : les navires réservés ne partent plus en mer.
  for (const p of mine) {
    const st = E.bombardStatus(map, s, { nationId: me, fromId: p.id });
    if (st.ok && st.targets.length && (s.provinces[st.targets[0]].buildings.fort || 0) > 0) note('bombarde', E.queueBombard(s, map, { nationId: me, fromId: p.id, toId: st.targets[0], warships: Math.max(1, Math.floor(st.warships / 2)) }));
  }
  const launched = new Set();
  const dests = mine.flatMap(p => E.legalDestinations(map, s, p.id).map(d => ({ from: p.id, d }))).filter(x => s.provinces[x.d.id].ownerId === prey)
    .sort((a, b) => a.d.id.localeCompare(b.d.id) || a.from.localeCompare(b.from));
  for (const { from, d } of dests) {
    if (launched.has(from) || launched.has(d.id)) continue;
    const sea = d.type === 'sea', ships = sea ? E.availableForces(s, from).warships || 0 : 0;
    const units = aiAttackSlice(s, map, me, from, d.id, sea ? 1.15 : 1, sea ? 'landing' : 'land', ships, sea ? d.via : null);
    if (!units) continue;
    if (note(sea ? 'debarquement' : 'attaque', E.queueMoveOrder(s, map, { nationId: me, fromId: from, toId: d.id, units, warships: ships })).ok) { launched.add(from); launched.add(d.id); }
  }
  for (const p of mine) {
    if (launched.has(p.id)) continue;
    const to = (p.landConnections || []).find(id => s.provinces[id]?.ownerId === me && isPortPoint(map, id));
    if (!to || isPortPoint(map, p.id)) continue;
    const av = E.availableForces(s, p.id), units = Object.fromEntries(LAND_UNIT_TYPES.map(k => [k, Math.floor((av[k] || 0) * .8)]));
    if (LAND_UNIT_TYPES.some(k => units[k])) note('rassemble', E.queueMoveOrder(s, map, { nationId: me, fromId: p.id, toId: to, units }));
  }
}

/** Diplomate : alliances, demandes d'aide, échanges, trahison planifiée (rupture + attaque), trêves payées ou exigées. */
function joueurDiplomate(s, ctx) {
  const me = s.playerNationId, mine = owned(s, me), r = ctx.r, note = ctx.note;
  if (!mine.length) return;
  const others = NATIONS.filter(id => id !== me && !s.nations[id].eliminated);
  for (const p of E.proposalsToAnswer(s, me)) note('reponse', E.respondToProposal(s, { nationId: me, from: p.from, accept: r() < .7 }));
  const friend = others.find(id => allied(s, me, id));
  if (!friend && others.length && s.turn % 3 === 1) note('alliance', E.queueDiplomaticOrder(s, { nationId: me, target: pick(r, others), action: 'alliance' }));
  for (const enemy of others.filter(id => atWar(s, me, id))) {
    const range = ceasefireRange(s, me, enemy), mode = r() < .5 ? 'pay' : 'demand';
    const amount = mode === 'pay' ? Math.min(range.maxPay, 10 + Math.floor(r() * 30)) : Math.min(range.maxDemand, Math.floor(r() * 20));
    note('treve', E.queueDiplomaticOrder(s, { nationId: me, target: enemy, action: 'ceasefire', pay: mode === 'pay' ? amount : 0, demand: mode === 'demand' ? amount : 0 }));
  }
  if (friend) {
    const ch = helpChoices(s, map, friend);
    if (ch.attackTargets.length && r() < .5) note('aide-attaque', queueHelpRequest(s, { from: me, to: friend, kind: 'attack', target: pick(r, ch.attackTargets).id }));
    else if (ch.defendAgainst.length) note('aide-defense', queueHelpRequest(s, { from: me, to: friend, kind: 'defend', target: r() < .5 ? pick(r, ch.defendAgainst).id : null, provinceId: r() < .3 ? pick(r, mine).id : null }));
    // Trahison : tous les 12 tours, rompre l'alliance ET attaquer l'ancien allié dans le même tour.
    if (s.turn % 12 === 0) {
      note('rupture', E.queueDiplomaticOrder(s, { nationId: me, target: friend, action: 'break' }));
      for (const p of mine) for (const d of E.legalDestinations(map, s, p.id)) if (s.provinces[d.id].ownerId === friend) {
        const av = E.availableForces(s, p.id, me), units = Object.fromEntries(LAND_UNIT_TYPES.map(k => [k, Math.floor((av[k] || 0) * .7)]));
        note('trahison', E.queueMoveOrder(s, map, { nationId: me, fromId: p.id, toId: d.id, units, warships: d.type === 'sea' ? av.warships : 0 }));
      }
    }
    // Passage : envoyer des troupes stationner chez l'allié.
    for (const p of mine) for (const d of E.legalDestinations(map, s, p.id)) if (s.provinces[d.id].ownerId === friend && r() < .15) {
      const av = E.availableForces(s, p.id, me);
      note('passage', E.queueMoveOrder(s, map, { nationId: me, fromId: p.id, toId: d.id, units: { infantry: Math.floor(av.infantry / 4) }, warships: d.type === 'sea' ? Math.min(1, av.warships) : 0 }));
    }
    // Troupes stationnées : les faire repartir parfois.
    for (const e of (s.stationed || []).filter(x => x.nationId === me)) if (r() < .3) {
      const d = pick(r, E.legalDestinations(map, s, e.provinceId));
      if (d) note('stationnees', E.queueMoveOrder(s, map, { nationId: me, fromId: e.provinceId, toId: d.id, units: { ...e.units }, warships: d.type === 'sea' ? e.warships : 0 }));
    }
  }
  // Échanges : un message, parfois une réponse à un message reçu.
  const target = pick(r, others);
  if (target) { const tone = pick(r, TONES); note('parole', queueTalk(s, map, { from: me, to: target, tone })); }
  const toAnswer = (s.talk || []).filter(m => m.to === me && !(s.talk || []).some(x => x.replyTo === m.id && x.from === me)).at(-1);
  if (toAnswer && !s.nations[toAnswer.from]?.eliminated) note('reponse-parole', queueTalk(s, map, { from: me, to: toAnswer.from, tone: pick(r, TONES), replyTo: toAnswer.id }));
  // Économie raisonnable.
  const gold = () => E.spendableTreasury(s, me);
  for (const p of mine) if (gold() > 60) note('banque', E.queueConstruction(s, { nationId: me, provinceId: p.id, type: 'bank' }));
  for (const p of mine.filter(x => isPortPoint(map, x.id))) if (gold() > 40) note('fort', E.queueConstruction(s, { nationId: me, provinceId: p.id, type: 'fort' }));
  if (gold() >= 40) note('infanterie', E.queueRecruitment(s, { nationId: me, provinceId: pick(r, mine).id, type: 'infantry', lots: 2 }));
}

// « __proto__ » et « constructor » sont exclus ici : ils polluent Object.prototype (BUG CAMPAGNE n° 1, tests/campagne-bugs.test.js)
// et feraient planter toutes les parties suivantes du même processus.
// « toString », « valueOf »… (noms hérités de Object.prototype) sont acceptés comme nation : BUG CAMPAGNE n° 1. Ils sont exclus
// du joueur aléatoire pour que la campagne mesure le reste ; le bug a son propre test (tests/campagne-bugs.test.js).
const BAD_IDS = ['p00', 'p21', 'P01', '', null, undefined, 'valmorne', 'Valmorne', 'p1', 42, NaN];
const BAD_NUMBERS = [-5, -1, 0, 0.5, 1e9, NaN, Infinity, -Infinity, '3', 'beaucoup', null, undefined, {}, []];
/**
 * Aléatoire : ordres variés tirés au sort, valides ou non (provinces inconnues, nombres négatifs ou absurdes, cibles
 * éliminées, actions inconnues, ordres annulés). Chaque refus doit être un { ok:false, error } propre, jamais une exception.
 */
function joueurAleatoire(s, ctx) {
  const me = s.playerNationId, r = ctx.r, note = ctx.note, mine = owned(s, me);
  const anyProv = () => r() < .2 ? pick(r, BAD_IDS) : pick(r, PROVINCES), anyNation = () => r() < .2 ? pick(r, BAD_IDS) : pick(r, NATIONS);
  const anyNum = () => r() < .3 ? pick(r, BAD_NUMBERS) : Math.floor(r() * 8);
  const n = 3 + Math.floor(r() * 12);
  for (let i = 0; i < n; i++) {
    const from = r() < .7 && mine.length ? pick(r, mine).id : anyProv();
    switch (Math.floor(r() * 12)) {
      case 0: note('recrue?', E.queueRecruitment(s, { nationId: r() < .9 ? me : anyNation(), provinceId: from, type: pick(r, ['infantry', 'cavalry', 'armor', 'artillery', 'warship', 'balloon', 'dragon']), lots: anyNum() })); break;
      case 1: note('batiment?', E.queueConstruction(s, { nationId: me, provinceId: from, type: pick(r, ['bank', 'factory', 'fort', 'port', 'chateau']) })); break;
      case 2: case 3: {
        const dests = typeof from === 'string' && s.provinces[from] ? E.legalDestinations(map, s, from) : [];
        const to = r() < .8 && dests.length ? pick(r, dests).id : anyProv();
        const av = typeof from === 'string' && s.provinces[from] ? E.availableForces(s, from, me) : {};
        const units = r() < .7 ? Object.fromEntries(LAND_UNIT_TYPES.map(k => [k, Math.floor((av[k] || 0) * r())])) : Object.fromEntries(LAND_UNIT_TYPES.map(k => [k, anyNum()]));
        note('deplace?', E.queueMoveOrder(s, map, { nationId: me, fromId: from, toId: to, units, warships: r() < .5 ? Math.floor((av.warships || 0) * r()) : anyNum() }));
        break;
      }
      case 4: note('diplo?', E.queueDiplomaticOrder(s, { nationId: me, target: anyNation(), action: pick(r, ['war', 'alliance', 'ceasefire', 'break', 'ultimatum', 'tribute', 'prisoners', 'paix']),
        ...(r() < .5 ? { pay: anyNum(), demand: r() < .3 ? anyNum() : undefined } : { offerLevel: pick(r, [.25, .5, .75, 2, -1, NaN]) }) })); break;
      case 5: note('relation?', E.recordDiplomaticAction(s, { nationId: me, target: anyNation(), action: pick(r, ['prisoners', 'tribute', 'ceasefire', 'ultimatum', 'war']) })); break;
      case 6: note('parole?', queueTalk(s, map, { from: r() < .9 ? me : anyNation(), to: r() < .2 ? null : anyNation(), tone: pick(r, [...TONES, 'furieux', '']), replyTo: r() < .3 ? pick(r, (s.talk || []).map(m => m.id).concat(['t0', 'zzz'])) : null })); break;
      case 7: note('aide?', queueHelpRequest(s, { from: me, to: anyNation(), kind: pick(r, ['attack', 'defend', 'surrender']), target: r() < .5 ? anyNation() : null, provinceId: r() < .3 ? anyProv() : null })); break;
      case 8: note('bombarde?', E.queueBombard(s, map, { nationId: me, fromId: from, toId: anyProv(), warships: anyNum() })); break;
      case 9: for (const p of E.proposalsToAnswer(s, me)) note('reponse?', E.respondToProposal(s, { nationId: me, from: p.from, accept: r() < .5 }));
        note('reponse-fantome?', E.respondToProposal(s, { nationId: me, from: anyNation(), accept: true })); break;
      case 10: { const o = pick(r, (s.orders || []).filter(x => x.nationId === me && x.status === 'pending')); if (o) note('annule', cancelPendingOrder(s, o.id)); note('annule-fantome?', cancelPendingOrder(s, 'o999999')); break; }
      case 11: note('aide-defense?', queueHelpRequest(s, { from: me, to: anyNation(), kind: 'defend' })); break;
    }
  }
}

/** Joueur « IA » : le siège du joueur est confié à l'IA (contrôle de référence, tools/equilibre.mjs). */
const STRATEGY_FN = { passif: joueurPassif, agressif: joueurAgressif, aleatoire: joueurAleatoire, diplomate: joueurDiplomate, ia: joueurPassif };

// --- Invariants -------------------------------------------------------------------------------------------------
/** Une violation : { inv, msg }. Les invariants ne lèvent pas d'exception : ils renvoient la liste de ce qui est faux. */
export function checkInvariants(s, { length, maxTurnsSeen = 0, prevTreasury = null } = {}) {
  const out = [], bad = (inv, msg) => out.push({ inv, msg });
  const isInt = n => Number.isInteger(n) && n >= 0;
  if (!s || typeof s !== 'object') return [{ inv: 'etat', msg: 'état absent' }];
  if (s.turnPhase !== 'planning') bad('phase', `turnPhase=${s.turnPhase}`);
  if (!isInt(s.turn) || s.turn < 1) bad('tour', `tour=${s.turn}`);
  if (s.turn > length + 1) bad('tour', `tour ${s.turn} au-delà de ${length} + 1`);
  if (s.gameOver && s.gameOver.turn > length) bad('fin', `fin au tour ${s.gameOver.turn} > ${length}`);
  if (!s.gameOver && s.turn > length) bad('fin', `tour ${s.turn} sans fin de partie (longueur ${length})`);
  if (gameLengthOf(s) !== length) bad('longueur', `gameLengthOf=${gameLengthOf(s)} attendu ${length}`);
  if (Object.keys(s.provinces).length !== 20) bad('provinces', `${Object.keys(s.provinces).length} provinces`);
  for (const id of PROVINCES) {
    const p = s.provinces[id];
    if (!p) { bad('provinces', `${id} absente`); continue; }
    if (!NATIONS.includes(p.ownerId)) bad('proprietaire', `${id}=${p.ownerId}`);
    for (const k of LAND_UNIT_TYPES) if (!isInt(p.units?.[k])) bad('unites', `${id}.${k}=${p.units?.[k]}`);
    if (Object.keys(p.units || {}).some(k => !LAND_UNIT_TYPES.includes(k))) bad('unites', `${id} type inconnu ${Object.keys(p.units)}`);
    if (!isInt(p.warships)) bad('navires', `${id}=${p.warships}`);
    for (const [b, n] of Object.entries(p.buildings || {})) if (!isInt(n)) bad('batiments', `${id}.${b}=${n}`);
    if ((p.buildings.fort || 0) > 3) bad('batiments', `fort ${p.buildings.fort} en ${id}`);
    for (const b of ['bank', 'factory', 'port']) if ((p.buildings[b] || 0) > 1) bad('batiments', `${b}=${p.buildings[b]} en ${id}`);
    const def = map.provinces.find(d => d.id === id);
    if (p.buildings.port && !def.port) bad('case-impossible', `port construit en ${id} sans emplacement`);
    if (p.portSite !== Boolean(def.port)) bad('case-impossible', `portSite ${id}=${p.portSite}`);
    for (const k of COMBAT_TYPES) {
      const w = p.wounds?.[k] ?? 0, n = k === 'warship' ? p.warships : p.units[k];
      if (!isInt(w)) bad('pv', `blessures ${id}.${k}=${w}`);
      else if (w > maxWoundsFor(k, n || 0)) bad('pv', `${id}.${k} ${w} PV perdus pour ${n} unités`);
    }
  }
  for (const id of NATIONS) {
    const n = s.nations[id];
    if (!n) { bad('nations', `${id} absente`); continue; }
    if (!Number.isFinite(n.treasury) || n.treasury < 0) bad('or', `trésor ${id}=${n.treasury}`);
    if (!Number.isInteger(n.treasury)) bad('or', `trésor non entier ${id}=${n.treasury}`);
    const owns = Object.values(s.provinces).some(p => p.ownerId === id), atSea = (s.transports || []).some(t => t.nationId === id);
    if (n.eliminated && owns) bad('elimination', `${id} éliminée mais possède une province`);
    if (!n.eliminated && !owns && !atSea) bad('elimination', `${id} sans province ni convoi mais pas éliminée`);
    if (n.capitalId !== map.provinces.find(p => p.initialOwner === id).id) bad('capitale', `${id} capitale=${n.capitalId}`);
  }
  if (Object.keys(s.nations).length !== 5) bad('nations', `${Object.keys(s.nations).length} nations`);
  for (const t of s.transports || []) {
    if (!NATIONS.includes(t.nationId)) bad('convoi', `nation ${t.nationId}`);
    if (!PROVINCES.includes(t.fromId) || !PROVINCES.includes(t.toId)) bad('convoi', `trajet ${t.fromId}→${t.toId}`);
    for (const k of LAND_UNIT_TYPES) if (!isInt(t.units?.[k] ?? 0)) bad('convoi', `${t.id}.${k}=${t.units?.[k]}`);
    if (!isInt(t.warships ?? 0)) bad('convoi', `${t.id} navires=${t.warships}`);
    if (!(t.stage >= 0 && t.stage < t.turns)) bad('convoi', `${t.id} étape ${t.stage}/${t.turns}`);
    const units = LAND_UNIT_TYPES.reduce((a, k) => a + (t.units?.[k] || 0), 0) + (t.warships || 0);
    if (units <= 0) bad('convoi', `${t.id} vide`);
    if (s.nations[t.nationId]?.eliminated) bad('convoi', `${t.id} d'une nation éliminée`);
    // Une route maritime existe vraiment entre le départ et l'arrivée (ou c'est un retour par la même voie).
    const lanes = (map.maritimeRoutes || []).map(([a, b]) => [a, b].sort().join('|'));
    if (t.lane && !lanes.includes(t.lane)) bad('case-impossible', `convoi ${t.id} sur une route inexistante ${t.lane}`);
  }
  for (const e of s.stationed || []) {
    const owner = s.provinces[e.provinceId]?.ownerId;
    if (!PROVINCES.includes(e.provinceId)) bad('stationnees', `province ${e.provinceId}`);
    if (owner === e.nationId) bad('stationnees', `${e.nationId} stationnée chez elle en ${e.provinceId}`);
    else if (!allied(s, e.nationId, owner)) bad('case-impossible', `${e.nationId} stationnée en ${e.provinceId} chez ${owner} sans alliance`);
    for (const k of LAND_UNIT_TYPES) if (!isInt(e.units?.[k] ?? 0)) bad('stationnees', `${e.nationId}@${e.provinceId}.${k}=${e.units?.[k]}`);
  }
  for (const w of s.diplomacy.wars) {
    if (!w.participants.every(x => NATIONS.includes(x)) || w.participants[0] === w.participants[1]) bad('diplomatie', `guerre ${w.participants}`);
    if (w.participants.some(x => s.nations[x]?.eliminated)) bad('diplomatie', `guerre avec une nation éliminée ${w.participants}`);
  }
  const pairs = new Map();
  for (const t of s.diplomacy.treaties) {
    if (!t.parties.every(x => NATIONS.includes(x)) || t.parties[0] === t.parties[1]) bad('diplomatie', `traité ${t.parties}`);
    if (t.active === false) continue;
    const key = [...t.parties].sort().join('|');
    if (atWar(s, t.parties[0], t.parties[1])) bad('diplomatie', `${t.type} et guerre en même temps entre ${key}`);
    if (pairs.has(key)) bad('diplomatie', `deux traités actifs entre ${key} (${pairs.get(key)} et ${t.type})`);
    pairs.set(key, t.type);
  }
  const warKeys = s.diplomacy.wars.filter(w => w.active !== false).map(w => [...w.participants].sort().join('|'));
  if (new Set(warKeys).size !== warKeys.length) bad('diplomatie', `guerre en double ${warKeys}`);
  if ((s.orders || []).length) bad('ordres', `${s.orders.length} ordres restés après l'inter-tour`);
  for (const q of s.productionQueue || []) {
    if (s.provinces[q.provinceId]?.ownerId !== q.nationId) bad('production', `chantier de ${q.nationId} en ${q.provinceId} (à ${s.provinces[q.provinceId]?.ownerId})`);
    if (!(q.remaining > 0)) bad('production', `chantier fini resté en file ${JSON.stringify(q)}`);
  }
  if ((s.talk || []).length > TALK_LIMIT) bad('taille', `${s.talk.length} échanges > ${TALK_LIMIT}`);
  if (s.coalition) {
    const c = s.coalition;
    if (!NATIONS.includes(c.target) || s.nations[c.target]?.eliminated) bad('coalition', `cible ${c.target}`);
    if ((c.members || []).includes(c.target)) bad('coalition', 'la cible est membre');
    if ((c.members || []).includes(s.playerNationId) && s.controllers[s.playerNationId] === 'human') bad('coalition', 'le joueur humain enrôlé d’office');
  }
  if (s.controllers[s.playerNationId] === 'human' && NATIONS.some(id => id !== s.playerNationId && s.controllers[id] !== 'ai')) bad('controleurs', JSON.stringify(s.controllers));
  const proto = Object.keys(Object.prototype);
  if (proto.length) bad('prototype', `Object.prototype pollué : ${proto.join(',')}`);
  return out;
}

/**
 * Or : variation du trésor de chaque nation pendant l'inter-tour = revenus + pillage + trésor de guerre + remboursements
 * + or de trêve reçu − or versé. Tout or qui apparaît sans raison (achat direct, bug) est relevé.
 * Les dépenses d'ordres sont faites AVANT l'inter-tour (au moment de l'ordre), donc hors de cette fenêtre.
 */
export function auditGold(before, after, events, s, offered = {}) {
  const out = [];
  for (const id of NATIONS) {
    const delta = after[id] - before[id];
    // Les entrées légitimes sont bornées par : revenu maximal possible (toutes provinces, tous bâtiments, bonus) + or
    // des événements du tour. Hors combat et trêve, une nation ne peut pas gagner plus.
    const gains = events.reduce((n, e) => {
      if ((e.type === 'war-chest' || e.type === 'capital-plunder') && e.attacker === id) return n + (e.amount || 0);
      if (e.type === 'production-lost' && e.nationId === id) return n + (e.refund || 0);
      if (e.type === 'ceasefire-offer') return n + (e.target === id ? e.amount || 0 : 0) + (e.nationId === id ? e.demand || 0 : 0);
      if (e.type === 'diplomatic-action' && e.nationId === id && e.amount) return n + e.amount;
      if (e.type === 'diplomatic-action' && e.action === 'tribute' && e.target === id) return n + (e.amount || 0);
      return n;
    }, 0);
    // Or offert par une IA avec sa proposition de trêve, versé quand on signe (V13.2) : pas toujours écrit dans l'événement (BUG n° 4).
    const proposal = events.some(e => e.type === 'ceasefire-offer' && e.accepted && e.nationId === id) || events.some(e => e.type === 'diplomatic-action' && e.viaTalk && e.accepted && e.nationId === id) ? (offered[id] || 0) + events.filter(e => e.type === 'diplomatic-action' && e.proposal && e.target === id).reduce((n, e) => n + (e.amount || 0), 0) : 0;
    const provinces = Object.values(s.provinces).filter(p => p.ownerId === id);
    const maxIncome = provinces.reduce((n, p) => n + RULES.baseIncome + (p.buildings.bank ? RULES.bankIncome : 0) + (p.buildings.factory ? RULES.factoryIncome : 0) + (p.buildings.port ? RULES.portIncome : 0), 0);
    // Bonus d'or : atouts (10 % au plus) + nation (4 % au plus) + Difficile (15 %) ; crédit à virgule reporté : +1.
    const cap = Math.ceil(maxIncome * 1.3) + 2 + gains + proposal + 20; // +20 : provinces conquises pendant le tour comptent au revenu
    if (delta > cap) out.push({ inv: 'or-sans-raison', msg: `${id} +${delta} or en un tour (au plus ${cap} attendu)` });
  }
  return out;
}

// --- Audits de fin de partie --------------------------------------------------------------------------------------
function auditEnd(s, profile, plan) {
  const out = [], bad = (inv, msg) => out.push({ inv, msg });
  const go = s.gameOver;
  if (!go) { bad('fin', 'partie sans gameOver'); return out; }
  if (!['capitals', 'player-eliminated', 'turn-limit'].includes(go.reason)) bad('fin', `raison ${go.reason}`);
  if (!NATIONS.includes(go.winnerId)) bad('fin', `vainqueur ${go.winnerId}`);
  if (go.ranking?.length !== 5) bad('fin', `classement de ${go.ranking?.length}`);
  const ranks = (go.ranking || []).map(r => r.rank).join();
  if (ranks !== '1,2,3,4,5') bad('fin', `rangs ${ranks}`);
  if (go.reason === 'turn-limit' && go.turn !== plan.length) bad('fin', `fin par la limite au tour ${go.turn} (longueur ${plan.length})`);
  if (go.reason === 'capitals' && E.capitalsVictor(s) !== go.winnerId) bad('fin', 'victoire des capitales sans les 5 capitales');
  if (go.reason === 'player-eliminated' && !s.nations[s.playerNationId].eliminated) bad('fin', 'joueur éliminé mais encore en vie');
  if (go.reason === 'turn-limit' && go.ranking[0].nationId !== go.winnerId) bad('fin', 'vainqueur différent du premier du classement');
  const sum = (go.ranking || []).reduce((n, r) => n + r.provinces, 0);
  if (sum !== 20) bad('fin', `classement : ${sum} provinces au total`);
  if (s.events.filter(e => e.type === 'game-over').length !== 1) bad('fin', `${s.events.filter(e => e.type === 'game-over').length} événements de fin`);
  // Écran de fin : récit et HTML sans erreur, sans « undefined », « NaN » ni « [object ».
  try {
    const story = buildEndStory(s, map), html = endStoryHtml(story);
    if (!story) bad('ecran-fin', 'récit absent');
    if (/undefined|NaN|\[object/.test(html)) bad('ecran-fin', `texte cassé : ${html.match(/.{0,40}(undefined|NaN|\[object).{0,40}/)?.[0]}`);
    if (/\b1 provinces\b|\b1 navires\b|\b0 province\b(?!s)/.test(html)) bad('cosmetique', `accord : ${html.match(/.{0,30}\b(1 provinces|1 navires)\b.{0,10}/)?.[0]}`);
  } catch (err) { bad('exception', `écran de fin : ${err.message}`); }
  // Palmarès : compté une fois, jamais deux, cohérent ; rien dans la sauvegarde.
  if (s.controllers[s.playerNationId] === 'human') {
    const before = JSON.stringify(profile.palmares);
    const r1 = recordFinishedGame(profile, s), mid = JSON.stringify(profile.palmares);
    const r2 = recordFinishedGame(profile, decodeSave(encodeSave(s)));
    if (!r1.counted) bad('palmares', 'partie finie non comptée');
    if (r2.counted || JSON.stringify(profile.palmares) !== mid) bad('palmares', 'partie comptée deux fois');
    if (before === mid) bad('palmares', 'palmarès inchangé');
    const p = profile.palmares, won = go.winnerId === s.playerNationId && go.reason !== 'player-eliminated';
    if (won && !p.titles.includes('premiere-couronne')) bad('palmares', 'victoire sans le titre Première couronne');
    if (!p.titles.includes('premiere-page')) bad('palmares', 'partie finie sans le titre Première page');
    if (p.wins > p.games) bad('palmares', `${p.wins} victoires pour ${p.games} parties`);
    if (Object.values(p.winsByNation).reduce((a, b) => a + b, 0) !== p.wins) bad('palmares', 'victoires par nation ≠ victoires');
    if (Object.values(p.winsByDifficulty).reduce((a, b) => a + b, 0) !== p.wins) bad('palmares', 'victoires par niveau ≠ victoires');
    if (Object.values(p.gamesByLength).reduce((a, b) => a + b, 0) !== p.games) bad('palmares', 'parties par longueur ≠ parties');
    if (JSON.stringify(sanitizePalmares(p)) !== JSON.stringify(p)) bad('palmares', 'palmarès non stable au nettoyage');
    if (p.titles.some(t => !TITLES.some(x => x.id === t))) bad('palmares', 'titre inconnu');
    if (encodeSave(s).includes('"palmares"')) bad('palmares', 'le palmarès est entré dans la sauvegarde');
    const html = palmaresHtml(p, map.nations) + endTitlesHtml(r1.titles);
    if (/undefined|NaN|\[object/.test(html)) bad('ecran-fin', 'palmarès : texte cassé');
  }
  return out;
}

/** Ce que l'interface calcule à chaque tour à partir de l'état : rien ne doit lever d'exception ni afficher « undefined ». */
function auditViews(s, turnEvents) {
  const out = [], me = s.playerNationId;
  const texts = [];
  try {
    const plan = planTurnAnimation(turnEvents, s, map, names);
    if (plan.total > MAX_ANIMATION_MS) out.push({ inv: 'animation', msg: `animation de ${plan.total} ms > ${MAX_ANIMATION_MS}` });
    texts.push(...(plan.steps || []).map(x => x.text));
    for (const c of [...capitalPopups(turnEvents, me, names), ...seaFatePopups(turnEvents, me, names), ...coalitionPopups(turnEvents, s, names.nation)]) texts.push(c.title, c.lead, c.text);
    const banner = coalitionBanner(s, names.nation), details = coalitionDetails(s, names.nation);
    if (banner) texts.push(banner.text); if (details) texts.push(details.lead, details.rule);
    for (const m of talkFeed(s)) texts.push(m.text);
    talkBadgeCount(s);
    for (const e of s.turnJournal || []) texts.push(e.text);
    for (const id of PROVINCES) { const v = provinceTroopView(s, map, id); texts.push(v.text, v.note, v.composition); compactForces(s, map, id); fortInfo(s, id); }
    for (const id of NATIONS) if (id !== me) { diplomacyActions(s, id); texts.push(truceWarning(s, me, id, names.nation(id))); }
    totalArmy(s, me); playerOrderArrows(s, map); convoyMarkers(s, map);
  } catch (err) { out.push({ inv: 'exception', msg: `affichage : ${err.message} @ ${String(err.stack).split('\n')[1]?.trim()}` }); }
  for (const t of texts.filter(x => typeof x === 'string')) {
    if (/undefined|NaN|\[object|null\b/.test(t)) { out.push({ inv: 'texte-casse', msg: t.slice(0, 160) }); break; }
  }
  for (const t of texts.filter(x => typeof x === 'string')) {
    const m = t.match(/(?<![\d,.])1 (provinces|navires|tours|soldats|fantassins|cavaliers|blindés|unités|batailles)\b/);
    if (m) { out.push({ inv: 'cosmetique', msg: `accord « ${m[0]} » : ${t.slice(0, 140)}` }); break; }
  }
  return out;
}

// --- Bugs connus ---------------------------------------------------------------------------------------------------
/** Une violation qui correspond à un bug connu et pas encore corrigé est marquée `known` ; les autres font échouer.
 *  Les bugs n° 1 à 4 de docs/CAMPAGNE-TESTS-V16.md sont corrigés (V15.6) : la liste est vide, tout écart fait échouer. */
export const KNOWN_BUGS = Object.freeze([]);
const knownBug = v => KNOWN_BUGS.find(b => b.inv === v.inv && b.re.test(v.msg))?.id || null;

// --- Une partie -----------------------------------------------------------------------------------------------------
/**
 * Joue une partie entière. Renvoie un résumé ; `violations` liste chaque invariant faux (au plus 50 gardés, avec le tour).
 * Ne lève jamais : une exception du moteur est elle-même une violation (« exception »).
 */
export function playGame(plan, { profile = createProfile(), keepState = false, views = true, trace = null, stopAt = null } = {}) {
  const r = rng(plan.seed + '|joueur'), started = Date.now();
  const violations = [], seen = new Map();
  const add = (turn, list) => { for (const v0 of list) { const v = { ...v0, known: knownBug(v0) }; const k = v.inv + '|' + v.msg.replace(/\d+/g, '#'); if (!seen.has(k)) seen.set(k, 0); seen.set(k, seen.get(k) + 1); if (seen.get(k) <= 2 && violations.length < 50) violations.push({ turn, ...v }); } };
  const refusals = {}, accepted = {};
  const note = (what, res) => {
    if (trace) trace.push(`t${s?.turn} ${what} ${JSON.stringify(res)?.slice(0, 160)} or=${s?.nations?.[s.playerNationId]?.treasury}`);
    if (res === undefined || res === null) { add(s?.turn, [{ inv: 'reponse-ordre', msg: `${what} : réponse ${res}` }]); return { ok: false }; }
    if (typeof res !== 'object' || typeof res.ok !== 'boolean') { add(s?.turn, [{ inv: 'reponse-ordre', msg: `${what} : réponse ${JSON.stringify(res)}` }]); return { ok: false }; }
    if (res.ok) accepted[what] = (accepted[what] || 0) + 1;
    else { refusals[what] = (refusals[what] || 0) + 1; if (typeof res.error !== 'string' || !res.error) add(s?.turn, [{ inv: 'reponse-ordre', msg: `${what} : refus sans message` }]); }
    return res;
  };
  let s;
  const realRandom = Math.random;
  let randomCalls = 0;
  Math.random = () => { randomCalls++; return realRandom(); };
  try {
    s = createGameState({ map, playerNationId: plan.nation, seed: plan.seed, difficulty: plan.difficulty, gameLength: plan.length });
    if (plan.strategy === 'ia') for (const id of NATIONS) s.controllers[id] = 'ai';
    else recordGameStarted(profile);
    if (plan.boosts) setPlayerBonuses(s, plan.boosts);
    // Pub de début de partie : décision seulement (le jeu n'en impose jamais dans le tutoriel, et jamais avec le Pack).
    if (s.schemaVersion !== (plan.length === 40 ? SHORT_GAME_SCHEMA_VERSION : SAVE_SCHEMA_VERSION)) add(1, [{ inv: 'schema', msg: `schéma ${s.schemaVersion}` }]);
    add(0, checkInvariants(s, { length: plan.length }));
    const fn = STRATEGY_FN[plan.strategy];
    const saveAt = plan.saveCheck ? Math.max(2, Math.floor(plan.length / 2) - 1) : -1;
    let turns = 0;
    while (!s.gameOver) {
      if (turns++ > MAX_TURN_SAFETY) { add(s.turn, [{ inv: 'blocage', msg: `plus de ${MAX_TURN_SAFETY} tours sans fin de partie` }]); break; }
      if (s.turn === saveAt) {
        // Sauvegarde / rechargement : l'état relu doit être identique, et la suite de la partie aussi (vérifiée plus bas).
        const text = encodeSave(s), back = decodeSave(text);
        if (JSON.stringify(back) !== JSON.stringify(s)) add(s.turn, [{ inv: 'sauvegarde', msg: 'état relu différent de l’état sauvegardé' }]);
        const twinA = structuredClone(s), twinB = decodeSave(text);
        for (let i = 0; i < 5 && !twinA.gameOver; i++) { E.resolveInterturn(twinA, map); E.resolveInterturn(twinB, map); }
        if (sha(JSON.stringify(twinA)) !== sha(JSON.stringify(twinB))) add(s.turn, [{ inv: 'sauvegarde', msg: 'la partie rechargée ne se poursuit pas à l’identique (5 tours)' }]);
        s = back;
      }
      if (stopAt && s.turn >= stopAt) break;
      const ctx = { r, note };
      try { fn(s, ctx); } catch (err) { add(s.turn, [{ inv: 'exception', msg: `ordre du joueur (${plan.strategy}) : ${err.message} @ ${String(err.stack).split('\n')[1]?.trim()}` }]); }
      // Les ordres du joueur ne mettent jamais l'or en négatif ni en NaN.
      const t = s.nations[s.playerNationId].treasury;
      if (!Number.isFinite(t) || t < 0) add(s.turn, [{ inv: 'or', msg: `après les ordres du joueur : trésor ${t}` }]);
      const before = Object.fromEntries(NATIONS.map(id => [id, s.nations[id].treasury])), evStart = s.events.length;
      const offered = {};
      for (const p of s.diplomacy.proposals || []) offered[p.to] = (offered[p.to] || 0) + (p.amount || 0);
      try { E.resolveInterturn(s, map); }
      catch (err) { add(s.turn, [{ inv: 'exception', msg: `inter-tour : ${err.message} @ ${String(err.stack).split('\n')[1]?.trim()}` }]); break; }
      const events = s.events.slice(evStart);
      add(s.turn - 1, checkInvariants(s, { length: plan.length }));
      add(s.turn - 1, auditGold(before, Object.fromEntries(NATIONS.map(id => [id, s.nations[id].treasury])), events, s, offered));
      if (views) add(s.turn - 1, auditViews(s, events));
      // Missions du profil : nourries par les événements, comme dans le jeu.
      try { addMissionProgress(profile, '2026-11-06', missionDeltas(events, s.playerNationId)); } catch (err) { add(s.turn, [{ inv: 'exception', msg: `missions : ${err.message}` }]); }
    }
    if (randomCalls) add(s.turn, [{ inv: 'determinisme', msg: `Math.random appelé ${randomCalls} fois` }]);
    if (s.gameOver && plan.strategy !== 'ia') add(s.turn, auditEnd(s, profile, plan));
    if (s.gameOver && plan.strategy === 'ia') { const tmp = auditEnd(s, createProfile(), plan).filter(v => v.inv !== 'palmares'); add(s.turn, tmp); }
  } catch (err) {
    add(s?.turn, [{ inv: 'exception', msg: `partie : ${err.message} @ ${String(err.stack).split('\n')[1]?.trim()}` }]);
  } finally { Math.random = realRandom; }
  const go = s?.gameOver, rank = go?.ranking?.find(x => x.nationId === plan.nation);
  return {
    ...plan, boosts: Boolean(plan.boosts), ms: Date.now() - started,
    finished: Boolean(go), reason: go?.reason || null, endTurn: go?.turn || null, winner: go?.winnerId || null,
    won: Boolean(go) && go.winnerId === plan.nation && go.reason !== 'player-eliminated', rank: rank?.rank || null, provinces: rank?.provinces ?? null,
    eliminated: Boolean(s?.nations?.[plan.nation]?.eliminated),
    coalition: Boolean(s?.events?.some(e => e.type === 'coalition-formed')), coalitionAgainstPlayer: Boolean(s?.events?.some(e => e.type === 'coalition-formed' && e.nationId === plan.nation)),
    betrayals: s?.events?.filter(e => e.type === 'betrayal').length || 0, landings: s?.events?.filter(e => (e.type === 'conquest' || e.type === 'battle') && e.naval).length || 0,
    bombardments: s?.events?.filter(e => e.type === 'bombardment').length || 0, convoys: s?.events?.filter(e => e.type === 'convoy-departed').length || 0,
    alliances: s?.events?.filter(e => e.type === 'diplomatic-action' && e.action === 'alliance' && e.accepted).length || 0,
    ceasefires: s?.events?.filter(e => e.type === 'ceasefire-offer' && e.accepted).length || 0,
    helps: s?.events?.filter(e => e.type === 'help-answer').length || 0, stationed: s?.events?.filter(e => e.type === 'convoy-arrived' && e.passage).length || 0,
    eliminatedNations: NATIONS.filter(id => s?.nations?.[id]?.eliminated),
    saveSize: s ? encodeSave(s).length : 0, refusals, accepted,
    violations, newViolations: violations.filter(v => !v.known), violationCounts: Object.fromEntries([...seen.entries()]),
    ...(keepState ? { state: s } : {})
  };
}

// --- Contrôles économiques (indépendants des parties) ---------------------------------------------------------------
/** Règles d'argent : jamais de pub imposée, aucun achat direct d'or ou de troupes. */
export async function economyChecks() {
  const out = [], bad = (inv, msg) => out.push({ inv, msg });
  for (const p of PRODUCTS) for (const k of Object.keys(p.grants)) if (!ALLOWED_GRANTS.includes(k)) bad('achat', `${p.id} donne ${k}`);
  if (PRODUCTS.some(p => /or\b|gold|troupe|soldat|unit/i.test(JSON.stringify(p.grants)))) bad('achat', 'un produit donne de l’or ou des troupes');
  // Les atouts : au plus +10 % chacun, uniquement pour le joueur humain.
  const s = createGameState({ map, playerNationId: 'valmorne', seed: 'eco' });
  setPlayerBonuses(s, Object.fromEntries(BOOST_KEYS.map(k => [k, 999])));
  if (Object.values(s.bonuses.valmorne).some(v => v > 10)) bad('atouts', 'atout au-delà de +10 %');
  const fake = { querySelector: () => null, createElement: () => ({}) };
  const tuto = await showGameStartAd({ profile: createProfile(), inTutorial: true, doc: { body: null }, ms: 1 });
  if (tuto.shown) bad('pub', 'pub dans le tutoriel');
  const pack = await showGameStartAd({ profile: { ...createProfile(), adsRemoved: true }, doc: { body: null }, ms: 1 });
  if (pack.shown || shouldShowGameStartAd({ adsRemoved: true })) bad('pub', 'pub malgré le Pack débutant');
  // Refus d'une pub récompensée (build Play simulé) : plus aucune pub imposée dans la session.
  const { showRewardedAd, adsRefusedThisSession, resetAdsSession } = await import('../src/presentation/ads.js');
  resetAdsSession();
  await showRewardedAd({ enabled: true, native: { showRewarded: async () => ({ status: 'dismissed' }) } });
  const after = await showGameStartAd({ profile: createProfile(), enabled: true, native: { showInterstitial: async () => ({ status: 'shown' }) } });
  if (!adsRefusedThisSession() || after.shown) bad('pub', 'pub imposée après un refus');
  // Pub indisponible : le jeu continue sans attendre.
  const none = await showGameStartAd({ profile: createProfile(), enabled: true, native: null });
  if (none.shown) bad('pub', 'pub annoncée sans régie');
  const broken = await showGameStartAd({ profile: createProfile(), enabled: true, native: { showInterstitial: async () => { throw new Error('régie cassée'); } } });
  if (broken.shown) bad('pub', 'régie cassée : pub annoncée');
  resetAdsSession();
  void fake;
  // Profil abîmé : relu sans planter, sans jetons inventés.
  for (const raw of [null, 'x', [], { tokens: -5 }, { tokens: 'NaN', palmares: { games: -1, wins: 99 } }, { tokens: 1e12 }]) {
    try { const p = sanitizeProfile(raw); if (!(p.tokens >= 0 && p.tokens <= 100000)) bad('profil', `jetons ${p.tokens} pour ${JSON.stringify(raw)}`); }
    catch (err) { bad('exception', `profil ${JSON.stringify(raw)} : ${err.message}`); }
  }
  return out;
}

// --- Statistiques ----------------------------------------------------------------------------------------------------
const pct = (a, b) => b ? Math.round(1000 * a / b) / 10 : 0;
export function summarize(results) {
  const by = (key, vals) => Object.fromEntries(vals.map(v => {
    const g = results.filter(x => x[key] === v), human = g.filter(x => x.strategy !== 'ia');
    return [v, { parties: g.length, victoires: g.filter(x => x.won).length, tauxVictoire: pct(g.filter(x => x.won).length, g.length), eliminations: human.filter(x => x.eliminated).length,
      rangMoyen: g.length ? Math.round(100 * g.reduce((n, x) => n + (x.rank || 0), 0) / g.length) / 100 : 0 }];
  }));
  const raisons = {};
  for (const x of results) raisons[x.reason || 'non terminée'] = (raisons[x.reason || 'non terminée'] || 0) + 1;
  const cross = {};
  for (const n of NATIONS) for (const l of LENGTHS) { const g = results.filter(x => x.nation === n && x.length === l); cross[`${n}/${l}`] = `${g.filter(x => x.won).length}/${g.length}`; }
  const winnersAll = {};
  for (const l of LENGTHS) { winnersAll[l] = Object.fromEntries(NATIONS.map(n => [n, 0])); for (const x of results.filter(y => y.length === l && y.winner)) winnersAll[l][x.winner]++; }
  const inv = {};
  for (const x of results) for (const [k, n] of Object.entries(x.violationCounts)) { const t = k.split('|')[0]; inv[t] = (inv[t] || 0) + n; }
  return {
    parties: results.length, terminees: results.filter(x => x.finished).length,
    toursJoues: results.reduce((n, x) => n + (x.endTurn || 0), 0),
    dureeMoyenneTours: Object.fromEntries(LENGTHS.map(l => { const g = results.filter(x => x.length === l && x.endTurn); return [l, g.length ? Math.round(10 * g.reduce((n, x) => n + x.endTurn, 0) / g.length) / 10 : 0]; })),
    dureeMoyenneMs: results.length ? Math.round(results.reduce((n, x) => n + x.ms, 0) / results.length) : 0,
    causesDeFin: raisons, parNation: by('nation', NATIONS), parDifficulte: by('difficulty', DIFFICULTY_IDS), parStrategie: by('strategy', STRATEGIES), parLongueur: by('length', LENGTHS),
    victoiresJoueurNationLongueur: cross, vainqueursToutesNations: winnersAll,
    evenements: Object.fromEntries(['convoys', 'landings', 'bombardments', 'betrayals', 'alliances', 'ceasefires', 'helps', 'stationed'].map(k => [k, results.reduce((n, x) => n + x[k], 0)])),
    partiesAvecCoalition: results.filter(x => x.coalition).length, coalitionContreJoueur: results.filter(x => x.coalitionAgainstPlayer).length,
    partiesAvecElimination: results.filter(x => x.eliminatedNations.length).length,
    tailleSauvegardeMax: Math.max(0, ...results.map(x => x.saveSize)),
    violationsParInvariant: inv, partiesAvecViolation: results.filter(x => x.violations.length).length,
    partiesAvecViolationNouvelle: results.filter(x => x.newViolations.length).length,
    bugsConnusVus: Object.fromEntries(KNOWN_BUGS.map(b => [`n° ${b.id}`, results.filter(x => x.violations.some(v => v.known === b.id)).length]))
  };
}
