// V17.5 — IA et diplomatie en temps réel (docs/V17-cahier-des-charges.md §7, §2.2, §4.5, §12 « V17.5 ») : calendrier des
// décisions, réponses de l'IA en 1 à 10 jours, propositions valables 180 jours, ferme avant recrutement, retraite d'une
// bataille perdue, réaction à une armée visible (et rien face à une armée invisible), ballons reconstruits et vols en jours,
// Facile : une attaque terrestre par 30 jours, rythme des recrutements, paroles à la décision, déterminisme.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { arkenV9Map as map } from '../src/map/arken-v9-map.js';
import { RULES } from '../src/domain/constants.js';
import * as E from '../src/domain/game-engine.js';
import {
  aiDefend, aiRecalls, aiRetreats, attacksInPace, decisionCalendar, incomingThreat, marchEstimate, nextDecisionDay, paceReady,
  visibleMarchesFor
} from '../src/domain/realtime/ai-schedule.js';
import { battleForecast } from '../src/domain/realtime/battles.js';
import { balloonPath } from '../src/domain/engine/balloons.js';
import { landThreatForce } from '../src/domain/engine/ai-naval.js';
import { combatValue } from '../src/domain/combat.js';
import { proposalsToAnswer } from '../src/domain/engine/diplomacy.js';
import { visibleProvinces } from '../src/domain/vision.js';
import { queueTalk } from '../src/domain/talk.js';
import { strengthOf } from '../src/domain/leaders.js';
import { aiAttackSlice } from '../src/domain/engine/ai.js';
import { queueHelpRequest } from '../src/domain/alliances.js';
import { readSource } from './helpers/sources.js';

const R = RULES.realtime;
const NATIONS = map.nations.map(n => n.id);
const ME = 'valmorne', AI = 'roc-epine';
const inf = n => ({ infantry: n, cavalry: 0, armor: 0, artillery: 0 });
function game({ seed = 'v175', ais = NATIONS.filter(id => id !== ME), difficulty } = {}) {
  const s = E.createRealtimeGame({ map, playerNationId: ME, seed, difficulty });
  for (const id of NATIONS) s.controllers[id] = ais.includes(id) ? 'ai' : 'human';
  return s;
}
const war = (s, a, b) => s.diplomacy.wars.push({ participants: [a, b], active: true, started: s.turn });
const untilDay = (s, day) => { while (s.day < day && !s.gameOver) E.advanceDay(s, map); };
const evs = (s, from, type) => s.events.slice(from).filter(e => e.type === type);
/** L'île de Valmorne partagée : Valmorne (joueur) tient p02 et p04, l'IA Roc-Épine tient p01 et p03, en guerre. */
function island({ seed, ais = [AI] } = {}) {
  const s = game({ seed, ais });
  for (const id of ['p01', 'p03']) s.provinces[id].ownerId = AI;
  for (const id of ['p01', 'p02', 'p03', 'p04']) { const p = s.provinces[id]; p.units = inf(0); p.warships = 0; p.wounds = {}; p.buildings.fort = 0; }
  for (const id of NATIONS) s.nations[id].food = { reserve: 1e12 };
  war(s, ME, AI);
  return s;
}
const sendAs = (s, nationId, from, to, units) => { const r = E.queueMoveOrder(s, map, { nationId, fromId: from, toId: to, units }); assert.ok(r.ok, r.error); E.executePendingOrders(s, map); return s.marches.at(-1); };

test('V17.5 : RULES.realtime.ai — rythme des règles « par tour » en jours, réserve du ballon, marges', () => {
  assert.deepEqual({ ...R.ai.pace }, { recruit: 30, ship: 30, landing: 30, attack: 30 });
  assert.equal(R.ai.decisionEveryDays, 10); assert.equal(R.ai.offsetDays, 2);
  assert.ok(R.ai.balloonReserve < RULES.balloon.aiReserve, 'épargne du ballon plus courte qu\'au tour par tour');
  assert.equal(R.diplomacy.easyAttackEveryDays, 30); assert.equal(R.diplomacy.proposalDays, 180); assert.equal(R.diplomacy.aiAnswerMaxDays, 10);
});

test('V17.5 : calendrier — chaque IA décide 3 fois par période de 30 jours, jamais deux le même jour, (jour + 2 i) % 10 = 0', () => {
  const s = game();
  const cal = decisionCalendar(s, 1, 300);
  assert.equal(new Set(cal.map(x => x.day)).size, cal.length, 'une nation au plus par jour');
  const ids = Object.keys(s.nations);
  for (const { day, nationId } of cal) assert.equal((day + 2 * ids.indexOf(nationId)) % 10, 0);
  for (const id of NATIONS.filter(x => x !== ME)) {
    const days = cal.filter(x => x.nationId === id).map(x => x.day);
    assert.equal(days.length, 30, `${id} : 30 décisions en 300 jours`);
    for (let i = 1; i < days.length; i++) assert.equal(days[i] - days[i - 1], 10);
  }
  assert.ok(!cal.some(x => x.nationId === ME), 'le joueur ne « décide » pas à la place de l\'IA');
  for (let d = 1; d < 40; d++) for (const id of NATIONS.filter(x => x !== ME)) { const n = nextDecisionDay(s, id, d); assert.ok(n > d && n <= d + 10); }
});

test('V17.5 : une proposition d\'alliance à une IA reçoit sa réponse à sa prochaine décision, 1 à 10 jours plus tard', () => {
  const seen = new Set();
  for (let start = 1; start <= 10; start++) {
    const s = game({ seed: `ans-${start}` });
    untilDay(s, start);
    const r = E.queueDiplomaticOrder(s, { nationId: ME, target: AI, action: 'alliance' });
    assert.ok(r.ok, r.error);
    E.executePendingOrders(s, map);
    const o = s.orders.find(x => x.id === r.orderId);
    assert.equal(o.status, 'awaiting', 'en attente de réponse, pas instantanée');
    assert.equal(o.answerDay, nextDecisionDay(s, AI, start)); assert.equal(o.askedDay, start);
    const delay = o.answerDay - start; seen.add(delay);
    assert.ok(delay >= 1 && delay <= R.diplomacy.aiAnswerMaxDays);
    const ev = s.events.length;
    assert.ok(!E.queueDiplomaticOrder(s, { nationId: ME, target: AI, action: 'alliance' }).ok, 'pas de seconde demande pendant l\'attente');
    untilDay(s, o.answerDay);
    assert.ok(!evs(s, ev, 'diplomatic-action').some(e => e.nationId === ME && e.target === AI), 'rien avant le jour de la réponse');
    E.advanceDay(s, map);
    const a = evs(s, ev, 'diplomatic-action').find(e => e.nationId === ME && e.target === AI && e.action === 'alliance');
    assert.ok(a, 'réponse le jour de sa décision'); assert.equal(a.day, o.answerDay);
    assert.ok(!s.orders.some(x => x.id === r.orderId));
  }
  assert.ok(seen.size >= 5, `délais variés selon le jour de la demande : ${[...seen]}`);
});

test('V17.5 : une demande d\'aide et une trêve payée attendent aussi la décision de l\'IA (or réservé pendant l\'attente)', () => {
  const s = game({ seed: 'help' });
  s.diplomacy.treaties.push({ active: true, type: 'alliance', parties: [ME, AI], started: s.turn });
  const h = queueHelpRequest(s, { from: ME, to: AI, kind: 'defend' });
  assert.ok(h.ok, h.error);
  E.executePendingOrders(s, map);
  const o = s.orders.find(x => x.id === h.orderId);
  assert.equal(o.status, 'awaiting');
  untilDay(s, o.answerDay);
  const ev = s.events.length;
  E.advanceDay(s, map);
  const ans = evs(s, ev, 'help-answer').find(e => e.nationId === AI && e.target === ME);
  assert.ok(ans, 'réponse de l\'allié'); assert.equal(ans.day, o.answerDay);
  // Trêve proposée avec de l'or : l'or reste réservé tant que l'IA n'a pas répondu.
  const t = game({ seed: 'truce' });
  war(t, ME, 'aurel'); t.nations[ME].treasury = 100;
  const c = E.queueDiplomaticOrder(t, { nationId: ME, target: 'aurel', action: 'ceasefire', offerLevel: .5 });
  assert.ok(c.ok, c.error);
  const amount = t.orders.find(x => x.id === c.orderId).amount || 0;
  E.executePendingOrders(t, map);
  assert.equal(t.orders.find(x => x.id === c.orderId).status, 'awaiting');
  assert.equal(E.spendableTreasury(t, ME), 100 - amount);
});

test('V17.5 : une proposition d\'une IA au joueur reste valable 180 jours exactement', () => {
  // Aucune IA ne joue pendant l'essai (rien d'autre ne change la guerre) ; Roc-Épine l'est le temps de proposer.
  const s = game({ seed: 'prop', ais: [] });
  war(s, ME, AI);
  untilDay(s, 13);
  s.controllers[AI] = 'ai';
  const q = E.queueDiplomaticOrder(s, { nationId: AI, target: ME, action: 'ceasefire', offerLevel: .25 });
  assert.ok(q.ok, q.error);
  E.executePendingOrders(s, map);
  s.controllers[AI] = 'human';
  const p = s.diplomacy.proposals.find(x => x.from === AI);
  assert.ok(p, 'proposition publiée tout de suite (le joueur répond quand il veut)'); assert.equal(p.day, 13);
  untilDay(s, 13 + 179);
  assert.ok(proposalsToAnswer(s, ME).some(x => x.from === AI), 'encore valable au 179e jour');
  untilDay(s, 13 + 180);
  assert.ok(!proposalsToAnswer(s, ME).some(x => x.from === AI), 'expirée au 180e jour');
});

test('V17.5 : la ferme passe avant le recrutement (§4.5) ; sans or pour la ferme, l\'IA ne recrute pas', () => {
  const s = game({ seed: 'farm' });
  s.provinces.p05.units.infantry = 2500; // consommation ≫ production
  s.nations[AI].treasury = 200;
  E.planAIOrders(s, map, { only: AI });
  const mine = s.orders.filter(o => o.nationId === AI);
  const farm = mine.findIndex(o => o.kind === 'construction' && o.type === 'farm'), recruit = mine.findIndex(o => o.kind === 'recruitment');
  assert.ok(farm >= 0, 'un niveau de ferme commandé');
  if (recruit >= 0) assert.ok(farm < recruit, 'la ferme est commandée avant tout recrutement');
  const poor = game({ seed: 'farm2' });
  poor.provinces.p05.units.infantry = 2500; poor.nations[AI].treasury = 25; // 20 or de ferme + 10 de réserve : pas assez
  E.planAIOrders(poor, map, { only: AI });
  assert.ok(!poor.orders.some(o => o.nationId === AI && o.kind === 'recruitment'), 'elle épargne pour la ferme');
});

test('V17.5 : recrutements rythmés — au plus une décision qui recrute par 30 jours et par nation', () => {
  const s = game({ seed: 'pace' });
  for (const id of NATIONS) s.nations[id].food = { reserve: 1e12 };
  const days = {};
  for (let i = 0; i < 720; i++) {
    const before = new Set(s.productionQueue.filter(q => q.kind === 'unit' && q.type !== 'warship').map(q => q));
    E.advanceDay(s, map);
    for (const q of s.productionQueue) if (q.kind === 'unit' && q.type !== 'warship' && !before.has(q) && s.controllers[q.nationId] === 'ai') (days[q.nationId] ||= new Set()).add(s.day - 1);
  }
  const emergencies = s.ai.rtStats?.emergencyRecruits || 0;
  let tight = 0;
  // V17.5b : le Conquérant recrute plus souvent (RULES.realtime.ai.personality.conquerant.recruitPace).
  const paceOf = id => s.leaders?.[id]?.archetype === 'conquerant' ? R.ai.personality.conquerant.recruitPace : R.ai.pace.recruit;
  for (const [id, set] of Object.entries(days)) { const d = [...set].sort((a, b) => a - b); for (let i = 1; i < d.length; i++) if (d[i] - d[i - 1] < paceOf(id)) tight++; }
  assert.ok(Object.keys(days).length >= 3, 'les IA recrutent');
  assert.ok(tight <= emergencies, `recrutements à moins de 30 jours d'intervalle (${tight}) seulement pour une province menacée (${emergencies})`);
  assert.equal(paceReady({ mode: 'tour' }, AI, 'recruit'), true, 'tour par tour : aucune limite');
});

test('V17.5 : l\'IA bat en retraite quand la simulation (battleForecast) dit qu\'elle perd, et reste quand elle gagne', () => {
  const lose = island({ seed: 'ret1', ais: [] }); // l'IA ne joue pas pendant la marche (sinon elle la rappellerait : elle voit Haut-Bois)
  lose.provinces.p03.units = inf(540); lose.provinces.p04.units = inf(700); lose.provinces.p04.buildings.fort = 1;
  const m = sendAs(lose, AI, 'p03', 'p04', inf(500));
  untilDay(lose, m.arriveDay);
  const b = lose.battles[0];
  assert.ok(b && b.assaults === 1, 'bataille ouverte, un assaut joué');
  const f = battleForecast(lose, b.id);
  assert.ok(!f.captured, 'la simulation dit qu\'elle perd');
  const ev = lose.events.length;
  lose.controllers[AI] = 'ai';
  assert.equal(aiRetreats(lose, map, AI), 1);
  const r = evs(lose, ev, 'battle-retreat')[0];
  assert.equal(r.reason, 'retreat'); assert.equal(r.nationId, AI);
  assert.equal(lose.battles.length, 0, 'plus d\'attaquant : la bataille s\'arrête');
  assert.ok(lose.marches.some(x => x.nationId === AI && x.returning && x.toId === 'p03'), 'les survivants rentrent');

  const win = island({ seed: 'ret2', ais: [] });
  win.provinces.p03.units = inf(1500); win.provinces.p04.units = inf(400); win.provinces.p04.buildings.fort = 3;
  const w = sendAs(win, AI, 'p03', 'p04', inf(1400));
  untilDay(win, w.arriveDay);
  if (win.battles.length) {
    assert.ok(battleForecast(win, win.battles[0].id).captured);
    assert.equal(aiRetreats(win, map, AI), 0, 'elle gagne : elle reste');
  }
  // Par le vrai calendrier : la retraite tombe à la décision de l'IA (au plus 10 jours après l'arrivée). Toute l'armée part :
  // l'IA ne voit plus Haut-Bois pendant la marche (pas de rappel), elle découvre la garnison au premier assaut.
  const cal = island({ seed: 'ret3' });
  cal.provinces.p03.units = inf(500); cal.provinces.p04.units = inf(700); cal.provinces.p04.buildings.fort = 1;
  untilDay(cal, 8); // arrivée traitée le jour 37 (1er assaut) ; Roc-Épine décide le jour 38, avant le 2e assaut (jour 40)
  const c = sendAs(cal, AI, 'p03', 'p04', inf(500)), ev2 = cal.events.length;
  untilDay(cal, c.arriveDay + 10);
  const vol = evs(cal, ev2, 'battle-retreat').find(e => e.reason === 'retreat' && e.nationId === AI);
  assert.ok(vol, 'retraite volontaire');
  assert.ok(decisionCalendar(cal, vol.day, vol.day).some(x => x.nationId === AI), 'le jour de sa décision');
  assert.ok(evs(cal, ev2, 'assault').length < 3, 'avant le 3e assaut');
});

test('V17.5 : troupes en marche et à l\'assaut comptées dans la force de la nation', () => {
  const s = island({ seed: 'str', ais: [] });
  s.provinces.p03.units = inf(500); s.provinces.p04.units = inf(50);
  const before = strengthOf(s, AI);
  const m = sendAs(s, AI, 'p03', 'p04', inf(400));
  assert.ok(Math.abs(strengthOf(s, AI) - before) < 1e-6, 'en marche : toujours comptées');
  untilDay(s, m.arriveDay);
  if (s.battles.length) assert.ok(strengthOf(s, AI) > combatValue({ units: inf(100) }), 'à l\'assaut : comptées');
});

test('V17.5 : l\'IA renforce une province menacée par une armée VISIBLE qu\'elle ne tiendrait pas', () => {
  const s = island({ seed: 'def' });
  // V17.5b : le renfort doit arriver avant le dernier assaut — trajets selon la distance : le voisin proche (p04) aide,
  // le voisin lointain (p01, 30 jours) arriverait trop tard face à une armée partie de p02 (22 jours).
  s.provinces.p04.ownerId = AI;
  s.provinces.p03.units = inf(60); s.provinces.p04.units = inf(700); s.provinces.p01.units = inf(700); s.provinces.p02.units = inf(520);
  sendAs(s, ME, 'p02', 'p03', inf(500)); // 500 fantassins marchent sur Branvale (p03), qui n'en a que 60
  const seen = visibleProvinces(s, map, AI);
  const threat = incomingThreat(s, map, AI, 'p03', seen);
  assert.ok(threat, 'l\'armée qui vient chez soi est toujours visible');
  assert.equal(threat.force.units.infantry, 500, 'composition connue : la province de départ (p02) est visible');
  assert.ok(combatValue(landThreatForce(map, s, AI, 'p03')) >= combatValue(threat.force), 'la menace compte dans landThreatForce');
  assert.ok(aiDefend(s, map, AI) >= 1);
  const o = s.orders.find(x => x.nationId === AI && x.defend);
  assert.ok(o, 'renfort commandé'); assert.equal(o.fromId, 'p04'); assert.equal(o.toId, 'p03');
  // Elle ne vide pas pour autant une province qui doit tenir : ordre limité aux troupes disponibles.
  assert.ok(o.units.infantry <= 700);
  // Sans armée en route : aucun renfort.
  const calm = island({ seed: 'def2' });
  calm.provinces.p03.units = inf(60); calm.provinces.p01.units = inf(700);
  assert.equal(aiDefend(calm, map, AI), 0);
});

test('V17.5 : l\'IA rappelle une attaque perdue d\'avance si elle VOIT les renforts ennemis, et pas s\'ils sont invisibles', () => {
  const run = keepEyes => {
    const s = island({ seed: `rec-${keepEyes}` });
    s.provinces.p04.units = inf(100); s.provinces.p02.units = inf(640);
    s.provinces.p03.units = inf(keepEyes ? 330 : 300); s.provinces.p01.units = inf(0);
    sendAs(s, AI, 'p03', 'p04', inf(300)); // p03 garde 30 fantassins (yeux sur p02 et p04) ou plus rien
    sendAs(s, ME, 'p02', 'p04', inf(600)); // le joueur renforce Haut-Bois
    const seen = visibleProvinces(s, map, AI);
    const vis = visibleMarchesFor(s, map, AI, seen).filter(v => v.march.nationId === ME);
    return { s, vis, recalled: aiRecalls(s, map, AI) };
  };
  const eyes = run(true);
  assert.equal(eyes.vis.length, 1, 'renfort visible (départ et arrivée voisins de ses troupes)');
  assert.equal(eyes.recalled, 1, 'attaque rappelée');
  assert.ok(!eyes.s.marches.some(m => m.nationId === AI && !m.returning), 'plus aucune armée en route vers Haut-Bois');
  assert.equal(eyes.s.provinces.p03.units.infantry, 330, 'rappelée le jour même : déjà rentrée');
  const blind = run(false);
  assert.equal(blind.vis.length, 0, 'aucune troupe voisine : le renfort est invisible');
  assert.equal(blind.recalled, 0, 'elle ne réagit pas à ce qu\'elle ne voit pas');
  assert.ok(blind.s.marches.some(m => m.nationId === AI && !m.returning));
});

test('V17.5 : armée vue sans sa composition (départ invisible) : estimation prudente, jamais l\'effectif réel', () => {
  const s = island({ seed: 'est' });
  s.provinces.p04.units = inf(5000); s.provinces.p03.units = inf(0); s.provinces.p01.units = inf(0);
  sendAs(s, ME, 'p04', 'p03', inf(4000));
  const v = visibleMarchesFor(s, map, AI).find(x => x.march.nationId === ME);
  assert.ok(v, 'elle voit l\'armée qui vient chez elle'); assert.equal(v.known, false);
  assert.ok(marchEstimate(s, v).units.infantry < 4000, 'estimation prudente');
  // Le pronostic n'attaque pas une province dont les renforts sont visibles en route (ne lance pas une attaque perdue).
  const t = island({ seed: 'slice' });
  t.provinces.p03.units = inf(800); t.provinces.p04.units = inf(100); t.provinces.p02.units = inf(500);
  // V17.9b : la cible ne compte plus comme menace sur la province de départ ; c'est le renfort visible, compté dans la
  // défense (100 + 480, marge 1,3), qui fait échouer la simulation.
  const alone = aiAttackSlice(t, map, AI, 'p03', 'p04', 1.3, 'land');
  assert.ok(alone, 'sans renfort ennemi : attaque possible');
  sendAs(t, ME, 'p02', 'p04', inf(480));
  assert.equal(aiAttackSlice(t, map, AI, 'p03', 'p04', 1.3, 'land'), null, 'renfort ennemi visible : pas d\'attaque');
});

test('V17.5 : l\'IA reconstruit son ballon (épargne raisonnable), même après l\'avoir perdu', () => {
  const s = game({ seed: 'bal' });
  s.provinces.p05.buildings.factory = 1; s.provinces.p05.buildings.farm = 2; s.nations[AI].treasury = RULES.balloon.cost + R.ai.balloonReserve;
  E.planAIOrders(s, map, { only: AI });
  const o = s.orders.find(x => x.nationId === AI && x.kind === 'balloon-build');
  assert.ok(o, 'ballon commandé avec 50 or (le tour par tour en exigeait 90)'); assert.equal(o.provinceId, 'p05');
  E.executePendingOrders(s, map);
  untilDay(s, s.day + R.durations.balloon + 1);
  assert.equal(E.balloonsOf(s, AI).length, 1, 'livré après 60 jours');
  // Abattu : il en reconstruit un à une décision suivante.
  s.balloons = s.balloons.filter(b => b.nationId !== AI); s.nations[AI].treasury = 200;
  const ev = s.events.length;
  untilDay(s, s.day + 11);
  assert.ok(s.productionQueue.some(q => q.kind === 'balloon' && q.nationId === AI) || E.balloonsOf(s, AI).length, 'nouveau ballon en chantier');
  assert.ok(ev <= s.events.length);
});

test('V17.5 : un ballon vole en jours — l\'envoi part le jour même, un saut = 60 jours', () => {
  const s = game({ seed: 'fly', ais: [] });
  untilDay(s, 7);
  s.balloons = [{ id: 'bx', nationId: ME, over: ME, to: null, legTurns: 0 }];
  const dest = NATIONS.find(id => id !== ME && balloonPath(map, ME, id)?.length === 1);
  assert.ok(E.queueBalloonSend(s, map, { nationId: ME, balloonId: 'bx', to: dest }).ok);
  E.executePendingOrders(s, map);
  assert.equal(s.balloons[0].to, dest, 'en route le jour même (plus d\'attente de fin de période)');
  assert.ok(!s.orders.some(o => o.kind === 'balloon-send'));
  const ev = s.events.length;
  untilDay(s, 7 + R.durations.balloonHop - 1);
  assert.equal(s.balloons[0].over, ME, 'pas encore');
  E.advanceDay(s, map);
  assert.equal(s.balloons[0].over, dest, 'arrivé au 60e jour');
  const moved = evs(s, ev, 'balloon-moved')[0];
  assert.equal(moved.day, 7 + R.durations.balloonHop - 1, 'parti le jour 7, au-dessus de sa destination le jour 67 (7 + 60)');
  assert.equal(s.day, 7 + R.durations.balloonHop);
});

test('V17.5 : Facile — une seule attaque terrestre lancée par 30 jours et par IA', () => {
  const s = game({ seed: 'easy', difficulty: 'facile' });
  for (const id of NATIONS) s.controllers[id] = 'ai';
  const days = Object.fromEntries(NATIONS.map(id => [id, []]));
  let ev = s.events.length;
  for (let i = 0; i < 1500 && !s.gameOver; i++) {
    E.advanceDay(s, map);
    for (const e of s.events.slice(ev)) if (e.type === 'march-departed' && e.hostile) days[e.nationId].push(e.day);
    ev = s.events.length;
  }
  let total = 0;
  for (const [id, d] of Object.entries(days)) {
    total += d.length;
    for (let i = 1; i < d.length; i++) assert.ok(d[i] - d[i - 1] >= R.diplomacy.easyAttackEveryDays, `${id} : attaques les jours ${d[i - 1]} et ${d[i]}`);
  }
  assert.ok(total > 0, 'des attaques ont bien eu lieu');
  assert.equal(attacksInPace({ mode: 'tour' }, AI), 0);
});

test('V17.5 : paroles — un message à une IA reçoit sa réponse à sa décision (1 à 10 jours), plus en fin de période', () => {
  let replies = 0;
  for (let k = 0; k < 12 && replies < 2; k++) {
    const s = game({ seed: `talk-${k}` });
    untilDay(s, 3 + k);
    const q = queueTalk(s, map, { from: ME, to: AI, tone: 'hostile' });
    assert.ok(q.ok, q.error);
    E.executePendingOrders(s, map);
    const msg = s.talk.at(-1), sent = s.day;
    assert.ok(s.rt.talkInbox.includes(msg.id));
    const answer = nextDecisionDay(s, AI, sent);
    untilDay(s, answer + 1);
    assert.ok(!s.rt.talkInbox.includes(msg.id), 'lu à sa décision');
    const reply = s.talk.find(m => m.replyTo === msg.id);
    if (reply) { replies++; assert.equal(reply.turn, E.periodOfDay(answer)); }
  }
  assert.ok(replies >= 1, 'au moins une réponse observée');
});

test('V17.5 : déterministe, sans Math.random ; tour par tour non touché (pas de fenêtre, pas d\'attente)', () => {
  const rnd = Math.random;
  Math.random = () => { throw new Error('Math.random'); };
  try {
    const a = game({ seed: 'det' }), b = game({ seed: 'det' });
    for (const s of [a, b]) for (const id of NATIONS) s.controllers[id] = 'ai';
    E.advanceDays(a, map, 400); E.advanceDays(b, map, 400);
    assert.equal(JSON.stringify(a), JSON.stringify(b));
  } finally { Math.random = rnd; }
  const src = readSource('src/domain/realtime/ai-schedule.js');
  assert.ok(!/Math\.random|Date\.now|new Date|document\.|window\./.test(src));
  assert.match(readSource('src/domain/realtime/day.js'), /releaseAnswers\(state, day\);[\s\S]*aiReact\(state, map, decider\); planAIOrders\(state, map, \{ only: decider \}\)/);
});

test('V17.5 (décidé par le chef de projet) : une province assiégée ne livre pas ses recrues pendant la bataille et n\'en commande pas', () => {
  const s = island({ seed: 'held', ais: [] });
  s.provinces.p03.units = inf(540); s.provinces.p04.units = inf(400); s.provinces.p04.buildings.fort = 3;
  s.nations[ME].treasury = 500;
  // Recrues commandées pour être livrées pendant la bataille (le lendemain du 1er assaut). V17.5b : trajet selon la distance,
  // plus court que la formation des recrues : l'armée part après la commande.
  assert.ok(E.queueRecruitment(s, { nationId: ME, provinceId: 'p04', type: 'infantry' }).ok);
  E.executePendingOrders(s, map);
  const q = s.productionQueue.find(x => x.nationId === ME && x.provinceId === 'p04');
  untilDay(s, s.day + q.remaining - 1 - E.landTravelDays(inf(1), map, 'p03', 'p04'));
  const m = sendAs(s, AI, 'p03', 'p04', inf(500));
  const ev = s.events.length;
  untilDay(s, m.arriveDay + 2);
  assert.ok(s.battles.length, 'bataille en cours après le 1er assaut');
  assert.ok(s.productionQueue.includes(q) && q.held, 'recrues retenues');
  assert.equal(s.events.slice(ev).filter(e => e.type === 'production-held').length, 1, 'un seul avis');
  const r = E.queueRecruitment(s, { nationId: ME, provinceId: 'p04', type: 'infantry' });
  assert.equal(r.ok, false); assert.match(r.error, /attaquée \(assiégée\)/);
  const before = s.provinces.p04.units.infantry;
  untilDay(s, m.arriveDay + 10);
  assert.ok(!s.battles.length, 'bataille terminée');
  if (s.provinces.p04.ownerId === ME) {
    assert.ok(!s.productionQueue.includes(q), 'livrées à la fin de la bataille');
    assert.ok(s.events.slice(ev).some(e => e.type === 'production-complete' && e.provinceId === 'p04' && e.nationId === ME));
  } else assert.ok(s.events.slice(ev).some(e => e.type === 'production-lost' && e.provinceId === 'p04'), 'province prise : remboursées');
  assert.ok(before >= 0);
});

test('V17.5 : interface — « en attente de réponse » (Diplomatie, aide) et ballon qui avance en jours', async () => {
  const V = await import('../src/presentation/realtime-view.js');
  const s = game({ seed: 'ui' });
  const r = E.queueDiplomaticOrder(s, { nationId: ME, target: AI, action: 'alliance' });
  E.executePendingOrders(s, map);
  const o = V.awaitingOrder(s, ME, AI);
  assert.equal(o?.id, r.orderId);
  assert.match(V.awaitingText(o), /^En attente de réponse — au plus tard le \d+ janvier 2027$/);
  assert.equal(V.awaitingOrder(s, ME, 'aurel'), null);
  assert.equal(V.balloonLegFraction({ legDays: 30 }, 99), .5);
  assert.equal(V.balloonLegFraction({ legDays: 90 }, 1), 1);
  assert.equal(V.balloonLegFraction({ legTurns: 1 }, 1), V.balloonHopFraction(1, 1), 'ancienne sauvegarde : par périodes');
  const ui = readSource('app.js');
  assert.match(ui, /awaitingOrder\(state,state\.playerNationId,target\)/);
  assert.match(ui, /balloonLegFraction\(balloonById\(state, m\.id\), state\.day\)/);
});

test('V17.5 (relecture) : départ visible mais fortifié → composition inconnue, estimation prudente (comme le joueur)', () => {
  const s = island({ seed: 'fort', ais: [] });
  s.provinces.p03.units = inf(50); s.provinces.p02.units = inf(3000); s.provinces.p02.buildings.fort = 1;
  sendAs(s, ME, 'p02', 'p03', inf(2500));
  const seen = visibleProvinces(s, map, AI);
  assert.ok(seen.has('p02'), 'la province de départ est visible');
  const v = visibleMarchesFor(s, map, AI, seen).find(x => x.march.nationId === ME);
  assert.equal(v.known, false, 'forteresse : troupes cachées, composition inconnue');
  assert.ok(marchEstimate(s, v).units.infantry < 2500, 'estimation prudente, pas l\'effectif réel');
  s.provinces.p02.buildings.fort = 0;
  assert.equal(visibleMarchesFor(s, map, AI).find(x => x.march.nationId === ME).known, true, 'sans forteresse : connue');
});
