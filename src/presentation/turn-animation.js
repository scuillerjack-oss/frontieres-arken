// V15.2 — Plan de l'animation entre deux tours. Module pur : aucune horloge, aucun DOM. Il lit des événements déjà produits
// par le moteur et ne le modifie jamais, donc le résultat de la partie ne dépend pas de ce qui s'affiche.
//
// Brouillard : on ne montre que ce que le journal aurait le droit de dire (eventKnownToPlayer). L'origine d'une attaque
// étrangère n'est dessinée que si le joueur voit la province d'où elle part.
import { eventKnownToPlayer } from '../domain/game-engine.js';
import { visibleProvinces } from '../domain/vision.js';
import { convoyMarkers, orderPath, pointAlong } from './map-orders-view.js';

/** Durée totale maximale de l'animation entre deux tours, quel que soit le nombre d'événements. */
export const MAX_ANIMATION_MS = 2400;
export const MAX_ROUTES = 6, MAX_EFFECTS = 8;
const ROUTE_MS = 800, EFFECT_MS = 650, EFFECT_STAGGER_MS = 380;

const EFFECTS = {
  conquest: { rank: 0, sound: 'conquest' }, betrayal: { rank: 1, sound: 'betrayal' }, battle: { rank: 2, sound: 'battle' },
  'field-battle': { rank: 2, sound: 'battle' }, interception: { rank: 3, sound: 'battle' }, bombardment: { rank: 3, sound: 'battle' }
};
const involves = (e, me) => [e.attacker, e.defender, e.nationId, e.target, e.newOwnerId].includes(me) || (e.attackers || []).includes(me);

function caption(e, names) {
  const { nation, province, me } = names, who = id => id === me ? 'Vous' : nation(id);
  switch (e.type) {
    case 'conquest': return e.newOwnerId === me || e.attacker === me ? `Vous prenez ${province(e.provinceId)}` : `${nation(e.newOwnerId || e.attacker)} prend ${province(e.provinceId)}`;
    case 'betrayal': return e.nationId === me ? `Vous trahissez ${nation(e.target)}` : `${nation(e.nationId)} trahit ${e.target === me ? 'votre alliance' : nation(e.target)}`;
    case 'bombardment': return `${who(e.nationId)} ${e.nationId === me ? 'bombardez' : 'bombarde'} ${province(e.provinceId)}`;
    case 'interception': return `Combat en mer devant ${province(e.provinceId)}`;
    default: return `Bataille à ${province(e.provinceId)}`;
  }
}

/** Trajets du tour : troupes du joueur, attaques dont l'origine se voit, convois (déjà publics sur la carte). */
function routesOf(known, state, map, me, visible) {
  const out = [], seen = new Set(), add = (nationId, points, mine) => {
    const key = JSON.stringify(points);
    if (points.length > 1 && !seen.has(key)) { seen.add(key); out.push({ kind: 'route', nationId, points, mine }); }
  };
  for (const e of known) {
    if (e.type === 'movement' && e.nationId === me) add(me, orderPath(map, { fromId: e.fromId, toId: e.toId, routeType: 'land' }), true);
    if ((e.type === 'conquest' || e.type === 'battle') && !e.naval) {
      const attacker = e.attacker;
      for (const from of (e.originIds || []).slice(0, 2)) if (attacker === me || visible.has(from)) add(attacker, orderPath(map, { fromId: from, toId: e.provinceId, routeType: 'land' }), attacker === me);
    }
  }
  for (const m of convoyMarkers(state, map)) {
    const from = pointAlong(m.path, Math.max(0, m.stage - 1) / m.turns), start = m.stage > 0 ? from : map.provinces.find(p => p.id === m.fromId)?.markerAnchor;
    if (start) add(m.nationId, [start, m.position], m.own);
  }
  return out.sort((a, b) => Number(b.mine) - Number(a.mine)).slice(0, MAX_ROUTES);
}

/**
 * Plan : `routes` (partent ensemble), puis `effects` (l'un après l'autre). `total` ne dépasse jamais MAX_ANIMATION_MS.
 * `sounds` : un son par sorte au plus, dans l'ordre d'importance. Rien à montrer : total = 0.
 */
export function planTurnAnimation(events, state, map, names) {
  const me = state.playerNationId, known = (events || []).filter(e => eventKnownToPlayer(state, map, e)), visible = visibleProvinces(state, map, me);
  const routes = routesOf(known, state, map, me, visible);
  const effects = known.filter(e => EFFECTS[e.type] && (e.type === 'betrayal' || e.provinceId))
    .map((e, order) => ({ e, order, mine: involves(e, me) }))
    .sort((a, b) => Number(b.mine) - Number(a.mine) || EFFECTS[a.e.type].rank - EFFECTS[b.e.type].rank || a.order - b.order)
    .slice(0, MAX_EFFECTS);
  const start = routes.length ? ROUTE_MS : 0, room = MAX_ANIMATION_MS - start - EFFECT_MS;
  const stagger = effects.length > 1 ? Math.min(EFFECT_STAGGER_MS, Math.floor(room / (effects.length - 1))) : 0;
  const steps = effects.map(({ e, mine }, i) => ({
    kind: e.type === 'conquest' ? 'conquest' : e.type === 'betrayal' ? 'betrayal' : 'clash', provinceId: e.provinceId || null,
    nationId: e.newOwnerId || e.attacker || e.nationId, mine, at: start + i * stagger, duration: EFFECT_MS, sound: EFFECTS[e.type].sound,
    text: caption(e, { ...names, me })
  }));
  const total = steps.length ? start + (steps.length - 1) * stagger + EFFECT_MS : routes.length ? ROUTE_MS : 0;
  const heard = new Set();
  return { routes, steps, total, routeMs: ROUTE_MS, sounds: steps.filter(s => !heard.has(s.sound) && heard.add(s.sound)).map(s => s.sound) };
}

/** Sons de chaque étape : la première de chaque sorte sonne seule, pour ne pas faire de cacophonie. */
export function soundCues(plan) {
  const heard = new Set();
  return plan.steps.filter(s => !heard.has(s.sound) && heard.add(s.sound)).map(s => ({ at: s.at, sound: s.sound }));
}

/** Son de l'écran de fin. */
export const endSound = (gameOver, me) => gameOver?.winnerId === me && gameOver.reason !== 'player-eliminated' ? 'victory' : 'defeat';
