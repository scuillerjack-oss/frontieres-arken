// V10 — Combats à points de vie (inspiration Supremacy 1914, adaptée au tour par tour).
// Module PUR : aucune dépendance au DOM ni à l'état de partie, aucun hasard. Toutes les valeurs sont dans
// RULES.combat (constants.js). Documentation complète et API : docs/V10-moteur.md.
//
// Une « force » = { units: { infantry, cavalry, armor, artillery, warship }, wounds: { mêmes clés } }.
//   units[k]  = nombre d'unités du type k (l'infanterie se compte par soldats, 20 par lot, comme depuis la V6) ;
//   wounds[k] = PV perdus (blessures) portés par la pile du type k.
// Réserve de PV d'un type : pool = units × pv − wounds. La puissance de feu est proportionnelle à cette réserve :
// des unités blessées tirent moins fort.
import { RULES, LAND_UNIT_TYPES } from './constants.js';

export const COMBAT_TYPES = Object.freeze([...LAND_UNIT_TYPES, 'warship']);
const C = () => RULES.combat;
const stat = k => C().units[k];
const mult = (s, t) => C().multipliers[s]?.[t] ?? 1;
const isLand = k => k !== 'warship';
const int = n => Math.max(0, Math.floor(Number(n) || 0));

export const emptyCounts = () => Object.fromEntries(COMBAT_TYPES.map(k => [k, 0]));
export const emptyForce = () => ({ units: emptyCounts(), wounds: emptyCounts() });
/** Plafond de blessures d'une pile : au-delà, les unités les plus touchées meurent. */
export const maxWoundsFor = (k, n) => Math.floor(int(n) * stat(k).hp * C().maxWoundShare);

/** Normalise une force (entiers >= 0, blessures bornées par le plafond). */
export function normalizeForce(force = {}) {
  const out = emptyForce();
  for (const k of COMBAT_TYPES) {
    const n = int(force.units?.[k]);
    out.units[k] = n;
    out.wounds[k] = Math.min(int(force.wounds?.[k]), maxWoundsFor(k, n));
  }
  return out;
}
export const poolOf = (force, k) => Math.max(0, (force.units?.[k] || 0) * stat(k).hp - (force.wounds?.[k] || 0));
export const totalHp = force => COMBAT_TYPES.reduce((n, k) => n + poolOf(force, k), 0);
export const maxHp = force => COMBAT_TYPES.reduce((n, k) => n + (force.units?.[k] || 0) * stat(k).hp, 0);
export const unitCount = force => COMBAT_TYPES.reduce((n, k) => n + (force.units?.[k] || 0), 0);
/** Au moins une unité qui fait des dégâts (landOnly : unité terrestre, seule capable d'occuper une province). */
export const hasCombatUnits = (force, landOnly = false) => COMBAT_TYPES.some(k => (!landOnly || isLand(k)) && stat(k).damage > 0 && poolOf(force, k) > 0);

/** Fusionne b dans a (renforts) : les blessures s'additionnent. */
export function mergeForce(a, b) {
  const out = normalizeForce(a);
  for (const k of COMBAT_TYPES) { out.units[k] += int(b?.units?.[k]); out.wounds[k] += int(b?.wounds?.[k]); }
  return normalizeForce(out);
}

/** Prélève `counts` unités de `force` ; les blessures suivent au prorata (arrondi déterministe). */
export function splitForce(force, counts = {}) {
  const f = normalizeForce(force), taken = emptyForce(), rest = emptyForce();
  for (const k of COMBAT_TYPES) {
    const n = f.units[k], k1 = Math.min(n, int(counts[k])), w = f.wounds[k];
    let moved = n ? Math.floor(w * k1 / n) : 0;
    moved = Math.max(moved, w - maxWoundsFor(k, n - k1));
    moved = Math.min(moved, maxWoundsFor(k, k1));
    taken.units[k] = k1; taken.wounds[k] = moved;
    rest.units[k] = n - k1; rest.wounds[k] = w - moved;
  }
  return { taken: normalizeForce(taken), rest: normalizeForce(rest) };
}

/** Applique `dmg` PV de dégâts à une pile : killShare des dégâts tue des unités entières, le reste blesse ;
 *  si les blessures dépassent le plafond, des unités supplémentaires meurent. */
function damagePile(k, n, wounds, dmg) {
  const hp = stat(k).hp, pool = Math.max(0, n * hp - wounds - Math.round(dmg));
  if (pool <= 0) return [0, 0];
  let alive = Math.max(1, n - Math.floor(Math.round(dmg) * C().killShare / hp));
  if (alive * hp - pool > maxWoundsFor(k, alive)) alive = Math.min(n, Math.ceil(pool / (hp * (1 - C().maxWoundShare))));
  return [alive, Math.min(alive * hp - pool, maxWoundsFor(k, alive))];
}

/** Valeur de combat d'une force (pour l'IA et l'affichage) : PV restants × dégâts, en racine. */
export function combatValue(force, { naval = false } = {}) {
  const f = normalizeForce(force);
  return COMBAT_TYPES.reduce((n, k) => {
    if (naval && isLand(k)) return n;
    const units = poolOf(f, k) / stat(k).hp;
    return n + units * Math.sqrt(stat(k).hp * Math.max(stat(k).damage, stat(k).hp * .05));
  }, 0);
}

/**
 * Feu d'une pile pendant UNE passe (avant répartition entre cibles, multiplicateurs et forteresse adverse).
 * mode 'naval' : seuls les navires tirent ; 'landing' : troupes à RULES.combat.landingPenalty.
 * warshipFactor (V12, atout « marine » du joueur) : multiplie les dégâts des navires de guerre de ce camp.
 * C'est EXACTEMENT la valeur utilisée par resolveBattle.
 */
function typeFire(force, k, mode = 'land', warshipFactor = 1) {
  if ((mode === 'naval' && isLand(k)) || !stat(k).damage) return 0;
  let dmg = poolOf(force, k) / stat(k).hp * stat(k).damage;
  if (k === 'warship') dmg *= warshipFactor;
  if (mode === 'landing' && isLand(k)) dmg *= C().landingPenalty;
  return dmg;
}
/** Feu total d'une force pendant une passe (un « assaut »), mêmes règles que resolveBattle. */
export const firePower = (force, { mode = 'land', warshipFactor = 1 } = {}) => { const f = normalizeForce(force); return COMBAT_TYPES.reduce((n, k) => n + typeFire(f, k, mode, warshipFactor), 0); };
/**
 * V13 — PV lisibles : le « régiment » d'une province = toutes ses unités (navires à quai compris, ils défendent).
 *   hp     = PV restants (blessures déduites) = totalHp ;
 *   damage = dégâts infligés par assaut (une passe de combat, en défense ou en attaque terrestre), arrondis,
 *            avant multiplicateurs contre la cible et avant la forteresse de l'adversaire.
 * Affichage : « Régiment : {hp} PV · {damage} dégâts par assaut ».
 */
export function regimentStats(force, { warshipFactor = 1 } = {}) {
  const f = normalizeForce(force);
  return { hp: totalHp(f), maxHp: maxHp(f), damage: Math.round(firePower(f, { warshipFactor })), wounded: totalHp(f) < maxHp(f) };
}
export const regimentText = stats => stats ? `Régiment : ${stats.hp} PV · ${stats.damage} dégâts par assaut` : 'Régiment : effectif inconnu';

/**
 * Bataille générale, en RULES.combat.passes passes (3). À chaque passe, tout le monde tire EN MÊME TEMPS.
 *   - chaque attaquant tire sur le défenseur (les attaquants ne se battent pas entre eux) ;
 *   - le défenseur répartit son feu entre les attaquants au prorata de leurs PV (pondérés par targetWeight) ;
 *   - à l'intérieur d'une force, les dégâts se répartissent entre types au prorata des PV, × multiplicateur.
 * @param {object} p
 * @param {object} p.defender   force qui tient la province (garnison + navires à quai) ou flotte interceptée
 * @param {Array<{id:string, force:object, mode?:'land'|'landing'}>} p.attackers
 *        mode 'landing' : assaut depuis la mer, troupes à RULES.combat.landingPenalty (navires en appui à 100 %).
 * @param {number} [p.fortLevel=0]  forteresse (0 à 3) : divise les dégâts reçus par le DÉFENSEUR seulement.
 * @param {boolean} [p.naval=false] bataille en mer : seuls les navires tirent, aucune forteresse,
 *        les troupes embarquées sont une cargaison (dégâts reçus × convoyVulnerability), pas de prise.
 * @returns {{defender, attackers:Array<{id,force,lossesByType,hpLost}>, passes, captured, winnerId,
 *            defenderLossesByType, defenderHpLost}}
 */
export function resolveBattle({ defender, attackers, fortLevel = 0, naval = false, passes = C().passes, fortBonus = 1, defenderWarshipFactor = 1 }) {
  let d = normalizeForce(defender);
  let atk = attackers.map(a => ({ id: a.id, mode: naval ? 'naval' : (a.mode || 'land'), force: normalizeForce(a.force), warshipFactor: Number(a.warshipFactor) > 0 ? Number(a.warshipFactor) : 1 }));
  const start = { d: normalizeForce(d), atk: atk.map(a => normalizeForce(a.force)) };
  const level = Math.max(0, Math.min(3, int(fortLevel)));
  // V12 : atout « défense des forts » du joueur (fortBonus = 1 + N %) : multiplie l'effet d'un fort construit.
  const fort = naval ? 1 : (RULES.fortDefense[level] || 1) * (level > 0 && Number(fortBonus) > 0 ? Number(fortBonus) : 1);
  const dWarship = Number(defenderWarshipFactor) > 0 ? Number(defenderWarshipFactor) : 1;
  const output = (force, k, mode, warshipFactor = 1) => typeFire(force, k, naval ? 'naval' : mode, warshipFactor);
  const canFight = (force, mode) => COMBAT_TYPES.some(k => output(force, k, mode) > 0);
  // Feu d'une force vers une liste de forces cibles ; renvoie, pour chaque cible, les dégâts par type.
  const fire = (shooter, mode, targets, defenderTargets, warshipFactor = 1) => {
    const out = targets.map(() => emptyCounts());
    const weights = targets.map(t => Object.fromEntries(COMBAT_TYPES.map(k => [k, poolOf(t, k) * (stat(k).targetWeight ?? 1)])));
    const total = weights.reduce((n, w) => n + Object.values(w).reduce((a, b) => a + b, 0), 0);
    if (!total) return out;
    for (const s of COMBAT_TYPES) {
      const shot = output(shooter, s, mode, warshipFactor);
      if (!shot) continue;
      targets.forEach((_, i) => { for (const t of COMBAT_TYPES) if (weights[i][t]) out[i][t] += shot * weights[i][t] / total * mult(s, t); });
    }
    for (const o of out) for (const t of COMBAT_TYPES) {
      if (defenderTargets) o[t] /= fort;
      if (naval && isLand(t)) o[t] *= C().convoyVulnerability;
    }
    return out;
  };
  const apply = (force, dmg) => {
    const next = emptyForce();
    for (const k of COMBAT_TYPES) [next.units[k], next.wounds[k]] = dmg[k] > 0 ? damagePile(k, force.units[k], force.wounds[k], dmg[k]) : [force.units[k], force.wounds[k]];
    return next;
  };
  const log = [];
  for (let i = 0; i < passes; i++) {
    const alive = atk.filter(a => totalHp(a.force) > 0);
    if (!alive.length || totalHp(d) <= 0) break;
    if (!canFight(d, naval ? 'naval' : 'land') && !alive.some(a => canFight(a.force, a.mode))) break;
    const toD = emptyCounts();
    for (const a of alive) { const [x] = fire(a.force, a.mode, [d], true, a.warshipFactor); for (const k of COMBAT_TYPES) toD[k] += x[k]; }
    const toA = fire(d, naval ? 'naval' : 'land', alive.map(a => a.force), false, dWarship);
    alive.forEach((a, j) => { a.force = apply(a.force, toA[j]); });
    d = apply(d, toD);
    log.push({ pass: i + 1, defenderHp: totalHp(d), attackersHp: atk.map(a => totalHp(a.force)) });
  }
  // Prise : plus aucun défenseur combattant et au moins un attaquant terrestre
  // combattant. Plusieurs attaquants survivants : celui qui garde le plus de PV prend la province (égalité :
  // identifiant de nation le plus petit). Les autres ne prennent rien.
  let winnerId = null;
  if (!naval && !hasCombatUnits(d)) {
    const candidates = atk.filter(a => hasCombatUnits(a.force, true)).sort((x, y) => totalHp(y.force) - totalHp(x.force) || String(x.id).localeCompare(String(y.id)));
    winnerId = candidates[0]?.id ?? null;
  }
  const captured = winnerId !== null;
  if (captured) d = emptyForce();
  const lossesByType = (from, to) => Object.fromEntries(COMBAT_TYPES.map(k => [k, from.units[k] - to.units[k]]));
  return {
    defender: d, captured, winnerId, passes: log,
    defenderLossesByType: lossesByType(start.d, d), defenderHpLost: totalHp(start.d) - totalHp(d),
    attackers: atk.map((a, i) => ({ id: a.id, force: a.force, lossesByType: lossesByType(start.atk[i], a.force), hpLost: totalHp(start.atk[i]) - totalHp(a.force) }))
  };
}

/** Raccourci à un seul attaquant. mode : 'land' | 'landing' | 'naval'. */
export function resolveCombat({ attacker, defender, fortLevel = 0, mode = 'land', passes }) {
  const r = resolveBattle({ defender, attackers: [{ id: 'attacker', force: attacker, mode: mode === 'naval' ? 'land' : mode }], fortLevel, naval: mode === 'naval', passes });
  const a = r.attackers[0];
  return {
    attacker: a.force, defender: r.defender, passes: r.passes, captured: r.captured,
    attackerWins: mode === 'naval' ? hasCombatUnits(a.force) && !hasCombatUnits(r.defender) : r.captured,
    attackerLossesByType: a.lossesByType, defenderLossesByType: r.defenderLossesByType,
    attackerHpLost: a.hpLost, defenderHpLost: r.defenderHpLost
  };
}

/** Guérison d'une force au repos : RULES.combat.healRate des PV max de chaque pile, sans dépasser les blessures. */
export function healForce(force) {
  const f = normalizeForce(force);
  for (const k of COMBAT_TYPES) if (f.wounds[k]) f.wounds[k] = Math.max(0, f.wounds[k] - Math.ceil(C().healRate * f.units[k] * stat(k).hp));
  return f;
}

/** Multiplie une force (IA : marge de sécurité). */
export function scaleForce(force, factor) {
  const f = normalizeForce(force), out = emptyForce();
  for (const k of COMBAT_TYPES) { out.units[k] = Math.ceil(f.units[k] * factor); out.wounds[k] = Math.floor(f.wounds[k] * factor); }
  return normalizeForce(out);
}

// --- Passerelles avec l'état de partie (province / transport) ---------------------------------------------
/** Force d'une province : ses unités terrestres + ses navires, avec ses blessures. */
export const provinceForce = p => normalizeForce({ units: { ...(p?.units || {}), warship: p?.warships || 0 }, wounds: p?.wounds || {} });
/** Écrit une force dans une province (unités, navires, blessures). */
export function writeProvinceForce(p, force) {
  const f = normalizeForce(force);
  for (const k of LAND_UNIT_TYPES) p.units[k] = f.units[k];
  p.warships = f.units.warship;
  p.wounds = { ...f.wounds };
}
/** Force d'un ordre/transport au format V6 { units:{terrestres}, warships, wounds? }. */
export const legacyForce = ({ units = {}, warships = 0, wounds = {} } = {}) => normalizeForce({ units: { ...units, warship: warships }, wounds });
export const toLegacy = force => {
  const f = normalizeForce(force);
  return { units: Object.fromEntries(LAND_UNIT_TYPES.map(k => [k, f.units[k]])), warships: f.units.warship, wounds: { ...f.wounds } };
};
