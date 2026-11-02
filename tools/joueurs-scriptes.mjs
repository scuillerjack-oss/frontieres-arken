// V15.1 — joueurs humains scriptés, pour contrôler que la coalition ne punit pas automatiquement celui qui gagne, et que
// la fin de partie reste jouable pour un joueur prudent. Ils passent par les mêmes ordres que le vrai joueur : aucune triche.
import { RULES } from '../src/domain/constants.js';
import { aiAttackSlice } from '../src/domain/engine/ai.js';
import { navalBase } from '../src/domain/engine/ai-naval.js';
import { isPortPoint } from '../src/domain/engine/sea-routes.js';

const LAND = ['infantry', 'cavalry', 'armor', 'artillery'];
const ownedDefs = (s, map, me) => map.provinces.filter(p => s.provinces[p.id].ownerId === me);
const atWar = (s, a, b) => s.diplomacy.wars.some(w => w.active !== false && w.participants.includes(a) && w.participants.includes(b));
const allied = (s, a, b) => s.diplomacy.treaties.some(t => t.active !== false && t.type === 'alliance' && t.parties.includes(a) && t.parties.includes(b));

/** Bâtit, se fortifie, ne déclare jamais la guerre, accepte toute trêve ou alliance, et demande la paix dès qu'on l'attaque. */
export function joueurPrudent(s, map, E) {
  const me = s.playerNationId, mine = ownedDefs(s, map, me);
  if (!mine.length) return;
  for (const p of E.proposalsToAnswer(s, me)) E.respondToProposal(s, { nationId: me, from: p.from, accept: true });
  const capital = mine.find(p => p.id === s.nations[me].capitalId) || mine[0];
  const gold = () => E.spendableTreasury(s, me);
  for (const p of mine) if (gold() >= RULES.buildings.bank.cost + 20) E.queueConstruction(s, { nationId: me, provinceId: p.id, type: 'bank' });
  if (gold() >= RULES.buildings.factory.cost + 20) E.queueConstruction(s, { nationId: me, provinceId: capital.id, type: 'factory' });
  for (const p of mine.filter(x => isPortPoint(map, x.id))) {
    const lvl = s.provinces[p.id].buildings.fort || 0;
    if (lvl < 3 && gold() >= RULES.buildings.fort.costs[lvl] + 20) E.queueConstruction(s, { nationId: me, provinceId: p.id, type: 'fort' });
    if (gold() >= RULES.units.infantry.cost) E.queueRecruitment(s, { nationId: me, provinceId: p.id, type: 'infantry', lots: Math.min(3, Math.floor(gold() / RULES.units.infantry.cost)) });
  }
  for (const n of Object.keys(s.nations)) if (n !== me && atWar(s, me, n) && !s.nations[n].eliminated) E.queueDiplomaticOrder(s, { nationId: me, target: n, action: 'ceasefire', pay: Math.min(gold(), 15), demand: 0 });
}

/** Cherche à tout prendre : base navale, flotte, blindés, attaque partout où la simulation du combat le permet. */
export function joueurDominant(s, map, E) {
  const me = s.playerNationId, mine = ownedDefs(s, map, me);
  if (!mine.length) return;
  // Une proie à la fois : la nation à portée qui a le moins de provinces (déjà en guerre d'abord). Les autres : la paix.
  const reach = mine.flatMap(p => E.legalDestinations(map, s, p.id).map(d => s.provinces[d.id].ownerId)).filter(o => o !== me);
  const count = n => Object.values(s.provinces).filter(p => p.ownerId === n).length;
  const prey = [...new Set(reach)].filter(n => !allied(s, me, n)).sort((a, b) => Number(atWar(s, me, b)) - Number(atWar(s, me, a)) || count(a) - count(b) || a.localeCompare(b))[0];
  for (const p of E.proposalsToAnswer(s, me)) E.respondToProposal(s, { nationId: me, from: p.from, accept: p.from !== prey });
  const gold = () => E.spendableTreasury(s, me), base = navalBase(map, s, mine);
  if (base) {
    if (!s.provinces[base.id].buildings.port) E.queueConstruction(s, { nationId: me, provinceId: base.id, type: 'port' });
    if (!s.provinces[base.id].buildings.factory) E.queueConstruction(s, { nationId: me, provinceId: base.id, type: 'factory' });
  }
  for (const p of mine) if (gold() >= RULES.buildings.bank.cost + 60 && p.id !== base?.id) E.queueConstruction(s, { nationId: me, provinceId: p.id, type: 'bank' });
  const b = base && s.provinces[base.id];
  if (b?.buildings.port && b.buildings.factory) {
    const fleet = mine.reduce((n, p) => n + (s.provinces[p.id].warships || 0), 0);
    if (fleet < 3 + Math.floor(s.turn / 8) && gold() >= RULES.units.warship.cost) E.queueRecruitment(s, { nationId: me, provinceId: base.id, type: 'warship', lots: 1 });
    while (gold() >= RULES.units.armor.cost) if (!E.queueRecruitment(s, { nationId: me, provinceId: base.id, type: 'armor', lots: 1 }).ok) break;
  } else if (base && gold() >= RULES.units.infantry.cost) E.queueRecruitment(s, { nationId: me, provinceId: base.id, type: 'infantry', lots: Math.floor(gold() / RULES.units.infantry.cost) });

  const launched = new Set();
  const dests = mine.flatMap(p => E.legalDestinations(map, s, p.id).map(d => ({ from: p.id, d })))
    .filter(x => { const o = s.provinces[x.d.id].ownerId; return o === prey; })
    .sort((a, b) => Number(atWar(s, me, s.provinces[b.d.id].ownerId)) - Number(atWar(s, me, s.provinces[a.d.id].ownerId)) || a.d.id.localeCompare(b.d.id) || a.from.localeCompare(b.from));
  for (const { from, d } of dests) {
    if (launched.has(from) || launched.has(d.id)) continue;
    if ((s.transports || []).some(t => t.nationId === me && t.toId === d.id)) continue;
    const sea = d.type === 'sea', ships = sea ? E.availableForces(s, from).warships || 0 : 0;
    const units = aiAttackSlice(s, map, me, from, d.id, sea ? 1.15 : 1, sea ? 'landing' : 'land', ships, sea ? d.via : null);
    if (!units) continue;
    if (E.queueMoveOrder(s, map, { nationId: me, fromId: from, toId: d.id, units, warships: ships }).ok) { launched.add(from); launched.add(d.id); }
  }
  // Ce qui n'attaque pas rejoint la province voisine qui fait face à la proie.
  const faces = id => E.legalDestinations(map, s, id).some(d => s.provinces[d.id].ownerId === prey);
  for (const p of mine) {
    if (launched.has(p.id) || faces(p.id)) continue;
    const to = (p.landConnections || []).find(id => s.provinces[id]?.ownerId === me && faces(id)) || (isPortPoint(map, p.id) ? null : (p.landConnections || []).find(id => s.provinces[id]?.ownerId === me && isPortPoint(map, id)));
    if (!to) continue;
    const av = E.availableForces(s, p.id), units = Object.fromEntries(LAND.map(k => [k, Math.floor((av[k] || 0) * .8)]));
    if (LAND.some(k => units[k])) E.queueMoveOrder(s, map, { nationId: me, fromId: p.id, toId: to, units });
  }
}
