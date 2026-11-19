// V16.4 — Tour « en direct » : ce que le bandeau annonce pour chaque nation. Module pur (aucun DOM).
// Brouillard : seulement les événements que le joueur connaît, avec les mêmes fonctions que le journal
// (eventKnownToPlayer / journalEntry). Rien n'est inventé ni deviné : une nation sans nouvelle = « Rien de connu ».
import { eventKnownToPlayer, journalEntry } from '../domain/game-engine.js';

/** Sortes d'événements annoncées (celles du récapitulatif inter-tour ; les lignes propres au joueur tombent d'elles-mêmes). */
export const NEWS_TYPES = Object.freeze(new Set(['bombardment', 'hostility-war', 'auto-war', 'battle', 'conquest', 'field-battle',
  'diplomacy', 'diplomatic-action', 'ceasefire-offer', 'capital-plunder', 'elimination', 'interception', 'convoy-arrived',
  'coalition-formed', 'coalition-joined', 'coalition-left', 'coalition-dissolved', 'convoy-departed', 'convoy-returning', 'talk',
  'betrayal', 'reveal', 'alliance-broken', 'help-answer', 'help-broken', 'help-ended', 'balloon-report', 'balloon-moved',
  'balloon-spotted', 'balloon-shot']));
export const MAX_NEWS_PER_NATION = 3;
export const NOTHING_KNOWN = 'Rien de connu';

/**
 * À quelle nation étrangère rattacher l'événement : celle qui agit ; si c'est le joueur, celle qu'il visait
 * (sa propre séquence sert au rappel de ses ordres). Aucune nation étrangère : l'événement n'est pas annoncé.
 */
export function actorOf(event, playerId, nationIds) {
  const known = new Set(nationIds);
  const candidates = [event.newOwnerId, event.attacker, ...(event.attackers || []), event.nationId, event.from, event.owner,
    event.target, event.defender, event.to];
  return candidates.find(id => id && id !== playerId && known.has(id)) || null;
}
/** Texte court pour le bandeau : la première ligne, sans le détail des pertes (le journal le garde). */
export function shortNews(text) {
  const first = String(text || '').split('\n')[0].split(' Pertes :')[0].replace(/\s+/g, ' ').trim();
  return first;
}

/**
 * Annonces du dernier tour résolu, par nation : { [nationId]: [{ type, text, provinceId, priority }] }, au plus
 * MAX_NEWS_PER_NATION chacune, les plus importantes d'abord. Toutes les nations de `nationIds` ont une entrée.
 */
export function nationAnnouncements(state, map, nationIds = map.nations.map(n => n.id)) {
  const me = state.playerNationId, last = state.turn - 1, out = Object.fromEntries(nationIds.map(id => [id, []]));
  const seen = new Set();
  (state.events || []).forEach((e, order) => {
    if (e.turn !== last || !NEWS_TYPES.has(e.type)) return;
    if (!eventKnownToPlayer(state, map, e)) return;
    const actor = actorOf(e, me, nationIds);
    if (!actor) return;
    const entry = journalEntry(e, map, me);
    const text = entry && shortNews(entry.text);
    if (!text || seen.has(`${actor}|${text}`)) return;
    seen.add(`${actor}|${text}`);
    out[actor].push({ type: entry.type || '', text, provinceId: e.provinceId || null, priority: Number(entry.priority) || 0, order });
  });
  for (const id of nationIds) out[id] = out[id].sort((a, b) => b.priority - a.priority || a.order - b.order).slice(0, MAX_NEWS_PER_NATION)
    .map(({ order, ...rest }) => rest);
  return out;
}

/** Ligne affichée à un instant de la séquence d'une nation (les annonces défilent pendant ses secondes). */
export function newsAt(list, segmentProgress) {
  if (!list?.length) return null;
  return list[Math.min(list.length - 1, Math.floor(Math.max(0, segmentProgress) * list.length))];
}
