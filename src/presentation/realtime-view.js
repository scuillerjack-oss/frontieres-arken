// V17.3 — Interface temps réel : ce qu'on montre, calculé sans DOM (docs/V17-cahier-des-charges.md §1, §6, §8, §12).
// Module pur, testé sous Node : position des icônes des troupes en route (char, navire) jour par jour, textes de date et de
// durée, bandeaux d'alerte, message d'événement. L'interface (src/presentation/ui/realtime-ui.js, ui/map-units-layer.js)
// ne fait que dessiner ce qui sort d'ici.
//
// Vision (§8) : une armée en marche est vue de la nation qui voit sa province de départ OU d'arrivée (on voit toujours ce
// qui vient chez soi) ; sa composition seulement si la province de départ est visible (ou si c'est soi / un allié).
// Les convois sont vus de tous en mer ; composition pour soi, ses alliés, ou si l'une de leurs provinces est visible.

import { LAND_UNIT_TYPES, RULES } from '../domain/constants.js';
import { formatDate, formatShortDate } from '../domain/realtime/clock.js';
import { visionSharers } from '../domain/vision.js';
import { convoySeaPath, pointAlong } from './map-orders-view.js';
import { foodEventText } from './food-view.js';

const R = RULES.realtime;
const clamp01 = x => Math.max(0, Math.min(1, x));
const num = x => Number(x) || 0;

// --- Dates et durées -----------------------------------------------------------------------------------------------
/** « 12 mars 2027 » (date affichée en bas à droite). */
export const dateText = day => formatDate(day);
/** « 12/03/2027 » (journal, fiches). */
export const shortDateText = day => formatShortDate(day);
/** Jours restants avant `targetDay` : « aujourd’hui », « demain », « dans 18 jours ». */
export function daysLeftText(targetDay, day) {
  const n = Math.max(0, Math.round(num(targetDay) - num(day)));
  return n === 0 ? 'aujourd’hui' : n === 1 ? 'demain' : `dans ${n} jours`;
}
/** Durée en jours, lisible : « 30 jours », « 1 jour ». */
export const durationText = days => { const n = Math.max(0, Math.round(num(days))); return `${n} jour${n > 1 ? 's' : ''}`; };
/** Durée d'une production en jours (cahier §2.2) ; `turns` = durée au tour par tour (repli : 30 jours par tour). */
export function productionDays(kind, type, turns = 1) {
  const d = R.durations;
  if (kind === 'unit') return d.units[type] ?? num(turns) * R.daysPerPeriod;
  if (kind === 'building') return d.buildings[type] ?? num(turns) * R.daysPerPeriod;
  if (kind === 'balloon') return d.balloon;
  return num(turns) * R.daysPerPeriod;
}
/** Durée d'un trajet par mer en jours : la carte la donne « en tours » (2 = 60 j, 4 = 120 j). */
export const seaDays = turns => Math.max(1, num(turns)) * R.durations.landPerSeaTurn;
/** Revenu affiché par mois (§3.1) : le revenu « par tour » vaut 60 jours, donc deux mois. « +8 or / mois », « +2,5 or / mois ». */
export function monthlyIncomeText(perTurn) {
  const v = Math.round(num(perTurn) / 2 * 10) / 10;
  return `${v >= 0 ? '+' : '−'}${String(Math.abs(v)).replace('.', ',')} or / mois`;
}

// --- Icônes des troupes en route --------------------------------------------------------------------------------
/** Avancement d'un trajet le jour `day` : 0 au départ, 1 à l'arrivée ; il ne change qu'une fois par jour (à-coups). */
export function routeFraction(startDay, arriveDay, day) {
  const span = num(arriveDay) - num(startDay);
  if (span <= 0) return 1;
  return clamp01((Math.floor(num(day)) - num(startDay)) / span);
}
/**
 * Point d'une icône sur un trajet `points` à l'avancement `f`. Les extrémités sont raccourcies (`trim` unités de carte
 * de chaque côté) pour que l'icône ne cache pas la ville de départ ni celle d'arrivée.
 */
export function tokenPoint(points, f, trim = 70) {
  if (!points?.length) return null;
  if (points.length === 1) return { ...points[0] };
  const total = points.slice(1).reduce((n, p, i) => n + Math.hypot(p.x - points[i].x, p.y - points[i].y), 0);
  if (!total) return { ...points[0] };
  const t = Math.min(trim, total * .3) / total, g = t + (1 - 2 * t) * clamp01(f);
  const at = pointAlong(points, g);
  return { x: Math.round(at.x), y: Math.round(at.y), g };
}
/** Trajet restant devant l'icône : sa position, puis les étapes encore à venir jusqu'à l'arrivée. */
export function pointsAhead(points, g, here) {
  const total = points.slice(1).reduce((n, p, i) => n + Math.hypot(p.x - points[i].x, p.y - points[i].y), 0);
  let run = 0; const out = [here];
  for (let i = 1; i < points.length; i++) {
    run += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
    if (total && run / total > g + 1e-9) out.push({ x: Math.round(points[i].x), y: Math.round(points[i].y) });
  }
  if (out.length < 2) out.push({ ...points.at(-1) });
  return out;
}
/** Cap (degrés) du segment où se trouve l'icône, pour orienter le char ou le navire. */
export function headingAt(points, f) {
  if (!points || points.length < 2) return 0;
  const total = points.slice(1).reduce((n, p, i) => n + Math.hypot(p.x - points[i].x, p.y - points[i].y), 0);
  let left = clamp01(f) * total;
  for (let i = 1; i < points.length; i++) {
    const d = Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
    if (left <= d || i === points.length - 1) return Math.round(Math.atan2(points[i].y - points[i - 1].y, points[i].x - points[i - 1].x) * 180 / Math.PI);
    left -= d;
  }
  return 0;
}
const anchorOf = (map, id) => map.provinces.find(p => p.id === id)?.markerAnchor || null;
const unitsTotal = x => LAND_UNIT_TYPES.reduce((n, k) => n + num(x.units?.[k]), 0);
const UNIT_WORDS = { infantry: ['fantassin', 'fantassins'], cavalry: ['cavalier', 'cavaliers'], armor: ['blindé', 'blindés'], artillery: ['artilleur', 'artilleurs'] };
/** « 100 fantassins · 5 cavaliers · 2 navires » (composition connue). */
export function compositionText(x) {
  const parts = LAND_UNIT_TYPES.filter(k => num(x.units?.[k]) > 0).map(k => `${x.units[k]} ${UNIT_WORDS[k][x.units[k] > 1 ? 1 : 0]}`);
  if (num(x.warships) > 0) parts.push(`${x.warships} navire${x.warships > 1 ? 's' : ''} de guerre`);
  return parts.join(' · ') || 'aucune troupe';
}
const relationOf = (state, me, nationId) => nationId === me ? 'own' : visionSharers(state, me).has(nationId) ? 'ally' : 'foreign';

/**
 * Armées en marche que le joueur voit, avec leur position du jour. `visible` = provinces visibles du joueur
 * (visibleProvinces). Une marche cachée n'apparaît pas du tout (aucune fuite).
 */
export function marchTokens(state, map, me, visible) {
  const out = [];
  for (const m of state.marches || []) {
    const rel = relationOf(state, me, m.nationId), seesFrom = visible.has(m.fromId), seesTo = visible.has(m.toId);
    if (rel === 'foreign' && !seesFrom && !seesTo) continue;
    const a = anchorOf(map, m.fromId), b = anchorOf(map, m.toId);
    if (!a || !b) continue;
    const path = [a, b], f = routeFraction(m.startDay, m.arriveDay, state.day), at = tokenPoint(path, f);
    const known = rel !== 'foreign' || seesFrom;
    out.push({
      id: m.id, kind: 'march', nationId: m.nationId, relation: rel, own: rel === 'own', fromId: m.fromId, toId: m.toId, path, x: at.x, y: at.y, ahead: pointsAhead(path, at.g, { x: at.x, y: at.y }),
      heading: headingAt(path, f), fraction: f, startDay: m.startDay, arriveDay: m.arriveDay, returning: Boolean(m.returning),
      hostile: Boolean(m.hostile), known, composition: known ? compositionText(m) : null, units: known ? unitsTotal(m) + num(m.warships) : null,
      recallable: rel === 'own' && !m.returning
    });
  }
  return out;
}
/** Convois en mer : vus de tous (§8) ; position sur leur route maritime selon les jours passés en mer. */
export function convoyTokens(state, map, me, visible) {
  const out = [];
  for (const t of state.transports || []) {
    const path = convoySeaPath(map, t);
    if (!path.length) continue;
    const turns = Math.max(1, num(t.turns)), start = Number.isFinite(t.departDay) ? t.departDay : state.day - num(t.stage);
    const arrive = Number.isFinite(t.arriveDay) ? t.arriveDay : start + turns;
    const f = Number.isFinite(t.departDay) && Number.isFinite(t.arriveDay) ? routeFraction(start, arrive, state.day) : clamp01(num(t.stage) / turns);
    const rel = relationOf(state, me, t.nationId), known = rel !== 'foreign' || visible.has(t.fromId) || visible.has(t.via);
    const at = tokenPoint(path, f, 30);
    out.push({
      id: t.id, kind: 'convoy', nationId: t.nationId, relation: rel, own: rel === 'own', fromId: t.fromId, toId: t.toId, path, x: at.x, y: at.y, ahead: pointsAhead(path, at.g, { x: at.x, y: at.y }),
      heading: headingAt(path, f), fraction: f, startDay: start, arriveDay: arrive, returning: Boolean(t.returning), known,
      hostile: state.provinces[t.toId]?.ownerId !== t.nationId && !t.passage && !t.returning,
      composition: known ? compositionText(t) : null, units: known ? unitsTotal(t) + num(t.warships) : null, recallable: rel === 'own' && !t.returning
    });
  }
  return out;
}
/**
 * Ballon en vol (V16.1, sauts de 60 jours comptés par périodes de 30 jours en V17.1) : avancement sur le saut en cours,
 * jour par jour (périodes déjà passées + jours écoulés dans la période en cours).
 */
export function balloonHopFraction(legTurns, day, hopTurns = RULES.balloon.hopTurns) {
  const into = (Math.max(1, Math.floor(num(day))) - 1) % R.daysPerPeriod;
  return clamp01((num(legTurns) * R.daysPerPeriod + into) / (Math.max(1, hopTurns) * R.daysPerPeriod));
}
/** Toutes les icônes du jour (marches puis convois). */
export const unitTokens = (state, map, me, visible) => [...marchTokens(state, map, me, visible), ...convoyTokens(state, map, me, visible)];
/** Petite étiquette sous l'icône : jours restants (« 18 j »), « ↩ 6 j » au retour. */
export const tokenTag = (token, day) => `${token.returning ? '↩ ' : ''}${Math.max(0, Math.round(token.arriveDay - day))} j`;
/** Fiche d'une icône touchée : lignes de texte (la fenêtre ajoute « Rappeler » si `recallable`). */
export function tokenSheet(token, day, names) {
  const what = token.kind === 'convoy' ? (token.returning ? 'Convoi qui rentre' : 'Convoi en mer') : (token.returning ? 'Armée qui rentre' : 'Armée en marche');
  const who = token.own ? 'Vos troupes' : token.relation === 'ally' ? `Troupes alliées · ${names.nation(token.nationId)}` : `Troupes de ${names.nation(token.nationId)}`;
  return {
    title: what, kicker: who,
    route: `${names.province(token.fromId)} → ${names.province(token.toId)}`,
    arrival: `Arrivée prévue le ${dateText(token.arriveDay)} (${daysLeftText(token.arriveDay, day)})`,
    composition: token.known ? token.composition : 'Composition inconnue : leur province de départ est hors de vue.'
  };
}

// --- Bandeaux d'alerte (ils n'arrêtent JAMAIS le temps, §1.1) ------------------------------------------------------
/**
 * Bandeaux tirés des événements d'un ou plusieurs jours. Chaque bandeau : { key, kind, tone, icon, text, action } ;
 * `action` dit à l'interface quelle fenêtre ouvrir quand on touche le bandeau.
 * kinds : conquest (prise / perte), capital, sea, balloon, famine, final.
 */
export function eventBanners(events, me, names) {
  const out = [];
  for (const e of events || []) {
    if (e.type === 'conquest' && (e.defender === me || (e.newOwnerId || e.attacker) === me)) {
      const won = (e.newOwnerId || e.attacker) === me;
      out.push({ key: `conquest:${e.provinceId}:${e.day ?? e.turn}`, kind: 'conquest', tone: won ? 'good' : 'bad', icon: won ? '🏴' : '⚠',
        text: won ? `${names.province(e.provinceId)} est à vous !` : `${names.province(e.provinceId)} est tombée aux mains de ${names.nation(e.newOwnerId || e.attacker)}`,
        action: { type: 'province', provinceId: e.provinceId } });
    } else if (e.type === 'capital-plunder' && (e.attacker === me || e.defender === me)) {
      out.push({ key: `capital:${e.provinceId}:${e.day ?? e.turn}`, kind: 'capital', tone: e.attacker === me ? 'good' : 'bad', icon: '👑',
        text: e.attacker === me ? `Capitale prise : ${names.province(e.provinceId)} · touchez pour le butin` : `Notre capitale ${names.province(e.provinceId)} est tombée · touchez pour voir`,
        action: { type: 'capital', event: e } });
    } else if (e.type === 'balloon-spotted' && e.nationId === me) {
      out.push({ key: `balloon:${e.balloonId}:${e.over}:${e.turn}`, kind: 'balloon', tone: 'warn', icon: '🎈',
        text: `Ballon ${names.nation(e.owner)} au-dessus de chez vous · Détruire ou laisser passer ?`, action: { type: 'balloon', balloonId: e.balloonId } });
    } else if (e.type === 'food-alert' && e.nationId === me) {
      out.push({ key: `food:${e.day ?? e.turn}`, kind: 'famine', tone: 'warn', icon: '🌾',
        text: `Famine à venir : vivres pour ${Math.max(0, num(e.daysLeft))} jour${num(e.daysLeft) > 1 ? 's' : ''}`, action: { type: 'food' } });
    } else if (e.type === 'famine-start' && e.nationId === me) {
      out.push({ key: `famine:${e.day ?? e.turn}`, kind: 'famine', tone: 'bad', icon: '🌾', text: 'Famine ! Vos troupes se battent moins bien et désertent', action: { type: 'food' } });
    } else if (e.type === 'famine-end' && e.nationId === me) {
      out.push({ key: `famine-end:${e.day ?? e.turn}`, kind: 'famine', tone: 'good', icon: '🌾', text: 'Les vivres sont revenus', action: { type: 'food' } });
    } else if (e.type === 'final-days') {
      const text = e.alert === 'year' ? 'Il reste 1 an avant la fin de la partie' : e.alert === 'half-year' ? 'Il reste 6 mois avant la fin de la partie' : 'Dernier mois de la partie';
      out.push({ key: `final:${e.alert}`, kind: 'final', tone: 'warn', icon: '⏳', text, action: { type: 'journal' } });
    }
  }
  return out;
}
/**
 * Famine qui dure (V17.4 : des désertions chaque jour) : un seul bandeau au début (famine-start, eventBanners), puis au plus
 * un rappel tous les 30 jours, pour ne pas masquer les bandeaux de conquête. `lastDay` = jour du dernier bandeau de famine.
 */
export const FAMINE_REMINDER_DAYS = 30;
export function famineReminder(events, me, lastDay) {
  const e = (events || []).filter(x => x.type === 'famine-desertion' && x.nationId === me).at(-1);
  if (!e || (Number.isFinite(lastDay) && num(e.day) - lastDay < FAMINE_REMINDER_DAYS)) return null;
  return { key: `famine-reminder:${e.day}`, kind: 'famine', tone: 'bad', icon: '🌾', day: num(e.day),
    text: `Famine toujours en cours : ${foodEventText(e).replace(/^🌾 Famine : /, '')}`, action: { type: 'food' } };
}
/** Bandeaux « fenêtre mer » (convoi perdu, débarquement repoussé…) : un par fenêtre seaFatePopups. */
export const seaBanners = (popups, day) => (popups || []).map((c, i) => ({ key: `sea:${day}:${i}:${c.title}`, kind: 'sea', tone: 'bad', icon: '⚓', text: c.title, action: { type: 'sea', popup: c } }));
/** Armées et convois ennemis en route vers une de mes provinces (§6 : le défenseur les voit arriver). Une fois par trajet. */
export function incomingBanners(state, tokens, me, names, seen = new Set()) {
  const out = [];
  for (const t of tokens) {
    if (t.relation !== 'foreign' || t.returning || state.provinces[t.toId]?.ownerId !== me) continue;
    const key = `incoming:${t.kind}:${t.id}`;
    if (seen.has(key)) continue;
    out.push({ key, kind: 'attack', tone: 'bad', icon: t.kind === 'convoy' ? '⛵' : '⚔',
      text: `${t.kind === 'convoy' ? 'Flotte' : 'Armée'} de ${names.nation(t.nationId)} en route vers ${names.province(t.toId)} · arrivée le ${dateText(t.arriveDay)}`,
      action: { type: 'unit', kind: t.kind, id: t.id } });
  }
  return out;
}
/** Propositions reçues (alliance, cessez-le-feu) : un bandeau par proposition, une fois. */
export function proposalBanners(proposals, names, seen = new Set()) {
  return (proposals || []).map(p => ({ p, key: `proposal:${p.from}:${p.action}:${p.turn}` })).filter(x => !seen.has(x.key)).map(({ p, key }) => ({
    key, kind: 'proposal', tone: 'info', icon: p.action === 'alliance' ? '🤝' : '🕊',
    text: `${names.nation(p.from)} vous propose ${p.action === 'alliance' ? 'une alliance' : 'un cessez-le-feu'} · touchez pour répondre`,
    action: { type: 'proposal', from: p.from }
  }));
}
/** Durée d'affichage d'un bandeau (ms de temps réel) : ensuite il se range dans le Journal (« À décider » s'il faut répondre). */
export const BANNER_MS = 9000;
/** Au plus 2 bandeaux à l'écran : les plus récents. */
export const visibleBanners = (list, now, max = 2) => (list || []).filter(b => !b.dismissed && now - b.at < BANNER_MS).slice(-max);

/**
 * Textes du journal écrits pour le tour par tour (moteur, journal.js) relus en temps réel : les durées de convoi sont déjà en
 * jours dans le moteur (stage / turns), les délais « en tours » sont des périodes de 30 jours, les revenus un récapitulatif
 * mensuel. Rien n'est changé dans le moteur : seulement les mots affichés.
 */
export function realtimeText(text) {
  return String(text ?? '')
    .replace(/(\d+) tours? en mer/g, '$1 jours en mer')
    .replace(/\((\d+) tours?\)/g, '($1 jours)')
    .replace(/(\d+) unités, (\d+) tours\)/g, '$1 unités, $2 jours)')
    .replace(/Revenus du tour/g, 'Revenus du mois')
    .replace(/à chaque tour/g, 'sur leurs revenus')
    .replace(/\(à partir du prochain tour\)/g, '(dans les 30 prochains jours)')
    .replace(/pour ce tour/g, 'pour l’instant').replace(/ce tour-ci/g, 'aujourd’hui')
    .replace(/il y a (\d+) tours?/g, (_, n) => `il y a environ ${Number(n) * R.daysPerPeriod} jours`)
    .replace(/\b([Aa])u tour (\d+)/g, (_, a, n) => `${a === 'A' ? 'E' : 'e'}n ${formatDate((Number(n) - 1) * R.daysPerPeriod + 1).replace(/^\S+ /, '')}`)
    .replace(/prochain tour/g, 'mois prochain').replace(/\bce tour\b/g, 'ce mois-ci');
}

// --- Message d'événement (en haut au centre) ------------------------------------------------------------------------
/** Dernier fait marquant connu du joueur ; à défaut, une consigne. `paused` : rappel de la pause. */
export function tickerText(state, me, { paused = false, mine = 0, coming = 0 } = {}) {
  if (paused) return { icon: '⏸', text: 'En pause — touchez ▶ pour faire avancer le temps' };
  if (coming) return { icon: '⚠', text: `${coming} armée${coming > 1 ? 's' : ''} étrangère${coming > 1 ? 's' : ''} en route vers vos provinces` };
  const last = (state.turnJournal || [])[0];
  if (last?.text) return { icon: '📜', text: realtimeText(String(last.text).split('\n')[0]) };
  if (mine) return { icon: '⚔', text: `${mine} troupe${mine > 1 ? 's' : ''} en route · touchez la date pour les voir ou les rappeler` };
  return { icon: '🧭', text: 'Touchez une de vos provinces pour donner un ordre : il part tout de suite.' };
}
