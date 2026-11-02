// Moteur — V15.1 : coalition contre la nation dominante (docs/V15-cahier-des-charges.md).
//
// Règle publique, la même pour le joueur et les IA : une nation qui tient au moins RULES.coalition.formProvinces provinces,
// avec RULES.coalition.formLead provinces d'avance sur la deuxième, déclenche une coalition. Elle se dissout quand cette
// nation retombe à RULES.coalition.dissolveProvinces provinces ou moins. La décision ne lit que ce qui est public (qui
// possède quelle province) : ni trésor, ni troupes cachées. Aucune aide : pas d'or offert, pas de troupes offertes, seuls
// changent les choix des dirigeants IA, selon leur caractère. Le joueur n'est jamais enrôlé d'office.
import { RULES } from '../constants.js';
import { aliveNations, allied, archetypeOf, charmOf } from '../leaders.js';
import { neighbors } from '../talk.js';
import { aiMemory } from './ai.js';
import { recentTruce } from './diplomacy.js';

const provinceCount = (state, id) => Object.values(state.provinces).filter(p => p.ownerId === id).length;

/** Nation qui remplit les conditions de domination (public), sinon null. */
export function dominantNation(state) {
  const rows = Object.keys(state.nations).filter(id => !state.nations[id].eliminated).map(id => [id, provinceCount(state, id)]).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  if (rows.length < 2) return null;
  const { formProvinces, formLead } = RULES.coalition;
  return rows[0][1] >= formProvinces && rows[0][1] - rows[1][1] >= formLead ? rows[0][0] : null;
}
/**
 * Un dirigeant IA rejoint-il la coalition ? Selon son caractère :
 *  Héros : par principe, sauf allié de la cible ou charmé par elle. Conquérant : pour ne pas laisser un rival devenir
 *  maître d'Arken, sauf allié. Traître : dès qu'un autre a ouvert le bal, même allié de la cible (il la trahit).
 *  Bâtisseur : seulement si la domination est écrasante, ou s'il est déjà en guerre avec elle.
 * Une trêve récente est toujours respectée.
 */
export function joinsCoalition(state, id, target, others = 0) {
  if (id === target || state.controllers?.[id] !== 'ai' || state.nations[id]?.eliminated || recentTruce(state, id, target)) return false;
  const isAllied = allied(state, id, target), war = (state.diplomacy?.wars || []).some(w => w.active !== false && w.participants.includes(id) && w.participants.includes(target));
  switch (archetypeOf(state, id)) {
    case 'heros': return !isAllied && charmOf(state, id, target) < 3;
    case 'conquerant': return !isAllied;
    case 'traitre': return others > 0;
    case 'batisseur': return !isAllied && (war || provinceCount(state, target) >= RULES.coalition.formProvinces + RULES.coalition.builderExtra);
    default: return false;
  }
}
function refreshMembers(state, c) {
  const order = ['heros', 'conquerant', 'batisseur', 'traitre'], ids = aliveNations(state).sort((a, b) => order.indexOf(archetypeOf(state, a)) - order.indexOf(archetypeOf(state, b)) || a.localeCompare(b));
  const members = [];
  for (const id of ids) if (joinsCoalition(state, id, c.target, members.length)) members.push(id);
  return members.sort();
}
/** Fin de chaque inter-tour : formation, ralliements, départs, dissolution. Événements publics. */
export function updateCoalition(state) {
  if (state.turn < RULES.coalition.minTurn || state.tutorialMode) return state.coalition ?? null;
  let c = state.coalition || null;
  if (c) {
    const out = state.nations[c.target]?.eliminated, low = provinceCount(state, c.target) <= RULES.coalition.dissolveProvinces;
    if (out || low) {
      state.events.push({ turn: state.turn, type: 'coalition-dissolved', nationId: c.target, reason: out ? 'eliminated' : 'receded', provinces: provinceCount(state, c.target), since: c.since });
      state.coalition = c = null;
    }
  }
  if (!c) {
    const target = dominantNation(state);
    if (!target) return (state.coalition = null);
    const members = refreshMembers(state, { target });
    if (!members.length) return (state.coalition = null);
    state.coalition = c = { target, since: state.turn, members };
    state.events.push({ turn: state.turn, type: 'coalition-formed', nationId: target, members: [...members], provinces: provinceCount(state, target) });
    armTraitors(state, c);
    return c;
  }
  const next = refreshMembers(state, c);
  for (const id of next) if (!c.members.includes(id)) state.events.push({ turn: state.turn, type: 'coalition-joined', nationId: id, target: c.target });
  for (const id of c.members) if (!next.includes(id) && !state.nations[id]?.eliminated) state.events.push({ turn: state.turn, type: 'coalition-left', nationId: id, target: c.target });
  c.members = next;
  armTraitors(state, c);
  return c;
}
/** Un Traître allié de la cible en fait sa marque : la rupture passe par son coup habituel, publique, sans passe-droit. */
function armTraitors(state, c) {
  for (const id of c.members) if (archetypeOf(state, id) === 'traitre' && allied(state, id, c.target)) {
    const mem = aiMemory(state, id);
    if (mem.mark !== c.target) { mem.mark = c.target; mem.strikeTurn = state.turn + 1; }
  }
}
/** Cible que ce dirigeant doit viser au titre de la coalition (membre, et à portée terrestre ou maritime), sinon null. */
export function coalitionTargetFor(state, map, id) {
  const c = state.coalition;
  return c && c.members.includes(id) && neighbors(state, map, id, c.target) ? c.target : null;
}
/** Autre membre de la coalition : les membres n'ouvrent pas de nouvelle guerre entre eux. */
export const coalitionPartners = (state, a, b) => Boolean(state.coalition?.members?.includes(a) && state.coalition.members.includes(b));
