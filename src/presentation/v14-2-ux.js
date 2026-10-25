// V14.2 — fonctions pures (sans DOM) de l'interface, testables sous Node (retours de bêta de Jack du 25/10/2026).
//  5. Recrutement : chaque type de troupe s'ouvre sur un panneau PV / dégâts (par lot ou par unité, c'est écrit).
//  6. Navires en convalescence : ce que ça veut dire, PV actuels et tours restants.
import { RULES } from '../domain/constants.js';
import { SHIP_REPAIR_TURNS } from '../domain/game-engine.js';

const fr = n => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
const tours = n => `${n} tour${n > 1 ? 's' : ''}`;
const NAMES = { infantry: ['fantassin', 'fantassins'], cavalry: ['cavalier', 'cavaliers'], armor: ['blindé', 'blindés'], artillery: ['artilleur', 'artilleurs'], warship: ['navire de guerre', 'navires de guerre'] };
// Points forts lus dans RULES.combat.multipliers (dégâts × 1,5 ou plus contre une cible).
const TARGETS = { infantry: 'fantassins', cavalry: 'cavaliers', armor: 'blindés', artillery: 'artillerie', warship: 'navires' };

/**
 * Détail d'un type de troupe pour la fenêtre de recrutement :
 *  { key, label, perLot, lotLabel, unit:{hp,damage}, lot:{hp,damage}, strong, weak, notes[] } ;
 *  `perLot` = le lot contient plusieurs unités (fantassins : 20, cavaliers : 5) → on affiche PV et dégâts PAR LOT,
 *  puis par unité ; sinon (blindé, artilleur, navire : 1 par lot) PAR UNITÉ.
 */
export function recruitUnitDetail(key) {
  const r = RULES.units[key], c = RULES.combat.units[key];
  if (!r || !c) return null;
  const n = Math.max(1, r.amount || 1), perLot = n > 1;
  const mult = RULES.combat.multipliers[key] || {};
  const strong = Object.entries(mult).filter(([, m]) => m >= 1.5).map(([t, m]) => `${TARGETS[t]} (×${String(m).replace('.', ',')})`);
  const weak = Object.entries(mult).filter(([, m]) => m <= .5).map(([t, m]) => `${TARGETS[t]} (×${String(m).replace('.', ',')})`);
  const notes = [];
  if (key === 'warship') notes.push('Escorte les convois et défend son port. Blessé, il se répare dans un port construit en 3 à 5 tours.');
  if (key === 'infantry' || key === 'cavalry') notes.push(`Un lot = ${n} ${NAMES[key][1]}. Les PV et les dégâts du lot sont ceux des ${n} réunis.`);
  if (key !== 'warship') notes.push(`En débarquement, les dégâts tombent à ${Math.round(RULES.combat.landingPenalty * 100)} %.`);
  return {
    key, label: r.label, perLot, lotSize: n,
    lotLabel: perLot ? `par lot de ${n} ${NAMES[key][1]}` : `par unité (1 ${NAMES[key][0]} par lot)`,
    unit: { hp: c.hp, damage: c.damage }, lot: { hp: c.hp * n, damage: c.damage * n },
    cost: r.cost, turns: r.turns, strong, weak, notes
  };
}
/** Panneau HTML du détail (ouvert par un bouton « ⓘ », jamais par les boutons + / − : aucun recrutement par accident). */
export function recruitDetailHtml(key) {
  const d = recruitUnitDetail(key);
  if (!d) return '';
  const main = d.perLot
    ? `<div class="unit-stat"><b>${fr(d.lot.hp)} PV</b> · <b>${fr(d.lot.damage)} dégâts par assaut</b> <small>${d.lotLabel}</small></div><div class="unit-stat sub">soit ${fr(d.unit.hp)} PV et ${fr(d.unit.damage)} dégâts par ${NAMES[d.key][0]}</div>`
    : `<div class="unit-stat"><b>${fr(d.unit.hp)} PV</b> · <b>${fr(d.unit.damage)} dégâts par assaut</b> <small>${d.lotLabel}</small></div>`;
  return `<div class="unit-detail" data-unit-detail="${d.key}">${main}`
    + `<div class="unit-stat sub">${d.cost} or · ${tours(d.turns)} de recrutement</div>`
    + (d.strong.length ? `<div class="unit-stat good">Fort contre : ${d.strong.join(', ')}</div>` : '')
    + (d.weak.length ? `<div class="unit-stat bad">Faible contre : ${d.weak.join(', ')}</div>` : '')
    + d.notes.map(t => `<p>${t}</p>`).join('')
    + '<p class="unit-help">Un assaut = une passe de combat ; une bataille en compte 3. Les PV perdus deviennent des blessés qui guérissent au repos.</p></div>';
}

/** Explication de la convalescence (règle du moteur, lue dans SHIP_REPAIR_TURNS). */
export const SHIP_REPAIR_TEXT = `En convalescence = navires blessés : ils ont perdu des PV et tirent moins fort. Dans un port construit, ils reviennent à 100 % en ${SHIP_REPAIR_TURNS.map(r => r.turns).join(', ').replace(/, (\d)$/, ' ou $1')} tours selon les dégâts ; sans port construit, ils se réparent lentement (5 % par tour) ; en mer, pas du tout.`;
/**
 * Pastille de la fiche de province pour MES navires (info = shipRepairInfo du moteur) : '' si aucun navire.
 * Navires en bon état : PV seulement ; blessés : PV actuels / max, % et tours restants, et l'explication.
 */
export function shipRepairChip(info) {
  if (!info || !info.ships) return '';
  const pct = Math.round(100 * info.hp / Math.max(1, info.maxHp)), what = `${info.ships} ${NAMES.warship[info.ships > 1 ? 1 : 0]}`;
  if (!info.wounded) return `<span class="info-chip ship-chip">⚓ ${what} : ${fr(info.hp)} PV (100 %)</span>`;
  const where = info.inPort ? `réparés au port : 100 % dans ${tours(info.turnsLeft)}` : `pas de port construit ici : 100 % dans ${tours(info.turnsLeft)} environ (port construit : 3 à 5 tours)`;
  return `<span class="info-chip ship-chip wounded">⚓ ${what} en convalescence : ${fr(info.hp)} / ${fr(info.maxHp)} PV (${pct} %) · ${where}<small>${SHIP_REPAIR_TEXT}</small></span>`;
}
