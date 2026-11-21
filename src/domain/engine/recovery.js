// Moteur — convalescence des navires, guérison des troupes, nations éliminées.

import { healForce, legacyForce, provinceForce, writeProvinceForce } from '../combat.js';
import { RULES } from '../constants.js';
import { hasPassage, setStationedForce, stationedAt } from '../passage.js';

/**
 * V14.2 (retour de Jack) — navires en convalescence (= navires blessés : ils ont perdu des PV et tirent moins fort).
 *  - Dans un PORT CONSTRUIT (le sien, ou celui d'un allié où ils stationnent), ils reviennent à 100 % des PV en
 *    3, 4 ou 5 tours selon les dégâts (SHIP_REPAIR_TURNS : jusqu'à 15 % des PV max perdus → 3 tours, jusqu'à 30 % →
 *    4 tours, au-delà → 5 tours ; une pile ne perd jamais plus de 50 % sans que des navires coulent).
 *  - Ailleurs (point de port sans port construit, province sans port) : réparations de fortune, SHIP_FIELD_REPAIR des
 *    PV max par tour (5 %), soit jusqu'à 10 tours.
 *  - En mer : pas de réparation. Nouveaux dégâts (combat, navires blessés qui arrivent) : le délai est recalculé.
 * Plans mémorisés dans state.shipRepairs[`${nation}@${province}`] = { turnsLeft, wounds } (absent des anciennes
 * sauvegardes : recréé au besoin).
 */
export const SHIP_REPAIR_TURNS = Object.freeze([{ upTo: .15, turns: 3 }, { upTo: .3, turns: 4 }, { upTo: 1, turns: 5 }]);
export const SHIP_FIELD_REPAIR = .05;
export const shipRepairTurnsFor = (wounds, ships, table = SHIP_REPAIR_TURNS) => {
  const max = ships * RULES.combat.units.warship.hp, share = max > 0 ? wounds / max : 0;
  return wounds > 0 ? table.find(r => share <= r.upTo + 1e-9).turns : 0;
};
/**
 * V17.2 — Rythme de convalescence en temps réel (cahier V17 §2.2) : versée tous les 10 jours (RULES.realtime.recovery).
 * Troupes : 10 % des PV max par 30 jours → 10/3 % tous les 10 jours (arrondi au supérieur, comme au tour par tour).
 * Navires au port : 100 % en 90 / 120 / 150 jours → 9 / 12 / 15 versements. Réparation de fortune : 5 % par 30 jours.
 * Le plan d'un navire (`turnsLeft`) compte alors des versements de 10 jours.
 */
export function realtimeRecovery() {
  const R = RULES.realtime.recovery, per = R.healEveryDays / 30;
  return { rate: R.healPctPer30 / 100 * per, fieldRepair: R.fieldRepairPctPer30 / 100 * per, everyDays: R.healEveryDays,
    table: SHIP_REPAIR_TURNS.map((r, i) => ({ upTo: r.upTo, turns: Math.round(R.shipRepairDays[i] / R.healEveryDays) })) };
}
const recoveryOf = state => state?.mode === 'realtime' ? realtimeRecovery() : null;
const repairKey = (nationId, provinceId) => `${nationId}@${provinceId}`;
function repairShips(state, force, nationId, provinceId, inPort, rt = null) {
  const field = rt ? rt.fieldRepair : SHIP_FIELD_REPAIR, table = rt ? rt.table : SHIP_REPAIR_TURNS;
  state.shipRepairs = state.shipRepairs && typeof state.shipRepairs === 'object' ? state.shipRepairs : {};
  const key = repairKey(nationId, provinceId), ships = force.units.warship, wounds = force.wounds.warship;
  if (!ships || !wounds) { delete state.shipRepairs[key]; return force; }
  if (!inPort) {
    delete state.shipRepairs[key];
    force.wounds.warship = Math.max(0, wounds - Math.ceil(Math.round(field * ships * RULES.combat.units.warship.hp * 1000) / 1000));
    return force;
  }
  let plan = state.shipRepairs[key];
  if (!plan || !(plan.turnsLeft > 0) || wounds > plan.wounds) plan = { turnsLeft: shipRepairTurnsFor(wounds, ships, table), wounds };
  const healed = Math.ceil(wounds / plan.turnsLeft);
  force.wounds.warship = Math.max(0, wounds - healed);
  plan = { turnsLeft: plan.turnsLeft - 1, wounds: force.wounds.warship };
  if (plan.turnsLeft > 0 && plan.wounds > 0) state.shipRepairs[key] = plan; else delete state.shipRepairs[key];
  return force;
}
/** Guérison des troupes (healForce) + réparation des navires (repairShips). */
function healWithShips(state, force, nationId, provinceId, inPort, rt = null) {
  const ships = { units: force.units.warship, wounds: force.wounds.warship };
  const healed = rt ? healForce(force, rt.rate) : healForce(force);
  healed.units.warship = ships.units; healed.wounds.warship = ships.wounds; // les navires suivent leur propre règle
  return repairShips(state, healed, nationId, provinceId, inPort, rt);
}
/**
 * État de convalescence des navires de `nationId` dans `provinceId` (affichage) :
 * { ships, hp, maxHp, wounded, inPort, turnsLeft } ; turnsLeft = tours avant 100 % (estimation au rythme actuel).
 */
export function shipRepairInfo(state, provinceId, nationId = state.provinces?.[provinceId]?.ownerId) {
  const p = state.provinces?.[provinceId];
  if (!p) return null;
  const own = nationId === p.ownerId, e = own ? null : stationedAt(state, provinceId, nationId);
  const ships = own ? p.warships || 0 : e?.warships || 0, wounds = Math.max(0, own ? p.wounds?.warship || 0 : e?.wounds?.warship || 0);
  if (!ships) return null;
  const maxHpShips = ships * RULES.combat.units.warship.hp, inPort = Boolean(p.buildings?.port) && (own || hasPassage(state, nationId, p.ownerId));
  const plan = state.shipRepairs?.[repairKey(nationId, provinceId)], rt = recoveryOf(state);
  const turnsLeft = !wounds ? 0 : inPort ? (plan && plan.wounds === wounds && plan.turnsLeft > 0 ? plan.turnsLeft : shipRepairTurnsFor(wounds, ships, rt ? rt.table : SHIP_REPAIR_TURNS))
    : Math.ceil(wounds / Math.ceil(Math.round((rt ? rt.fieldRepair : SHIP_FIELD_REPAIR) * maxHpShips * 1000) / 1000));
  // V17.2 : en temps réel, turnsLeft compte des versements de 10 jours ; daysLeft = jours avant 100 %.
  return { ships, hp: maxHpShips - wounds, maxHp: maxHpShips, wounded: wounds > 0, inPort, turnsLeft, ...(rt ? { daysLeft: turnsLeft * rt.everyDays } : {}) };
}
/** Guérison : dans chaque province qui n'a pas combattu ce tour, RULES.combat.healRate des PV max par type (navires : voir repairShips). */
/** V17.2 : en temps réel (versement tous les 10 jours), `fought` = provinces en bataille ou qui ont combattu depuis moins de 10 jours. */
export function healProvinces(state, fought) {
  const rt = recoveryOf(state);
  for (const [id, p] of Object.entries(state.provinces)) {
    if (fought.has(id)) continue;
    writeProvinceForce(p, healWithShips(state, provinceForce(p), p.ownerId, id, Boolean(p.buildings?.port), rt));
  }
  for (const e of [...(state.stationed || [])]) if (!fought.has(e.provinceId)) {
    const host = state.provinces[e.provinceId];
    setStationedForce(state, e.nationId, e.provinceId, healWithShips(state, legacyForce(e), e.nationId, e.provinceId, Boolean(host?.buildings?.port), rt));
  }
}
/** B6 : une nation sans province (ni troupes en mer) est éliminée ; elle ne revient pas. */
export function updateEliminations(state) {
  for (const [id, n] of Object.entries(state.nations)) {
    if (n.eliminated) continue;
    const owns = Object.values(state.provinces).some(p => p.ownerId === id);
    const atSea = (state.transports || []).some(t => t.nationId === id);
    const marching = (state.marches || []).some(m => m.nationId === id); // V17.1 : armées en marche (temps réel)
    const fighting = (state.battles || []).some(b => (b.attackers || []).some(e => e.nationId === id)); // V17.2 : à l'assaut
    if (!owns && !atSea && !marching && !fighting) {
      n.eliminated = true; n.eliminatedTurn = state.turn;
      state.orders = (state.orders || []).filter(o => o.nationId !== id);
      state.diplomacy.wars = state.diplomacy.wars.filter(w => !w.participants.includes(id));
      state.diplomacy.treaties = state.diplomacy.treaties.filter(t => !t.parties?.includes(id));
      state.events.push({ turn: state.turn, type: 'elimination', nationId: id });
    }
  }
}

