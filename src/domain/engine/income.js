// Moteur — revenus des provinces et des bâtiments, puissance de combat de base.

import { LAND_UNIT_TYPES, RULES } from '../constants.js';

/** V13.1 : détail du revenu par tour (provinces, banques, usines, ports construits). */
export function incomeBreakdown(state, nationId) {
  const owned = Object.values(state.provinces).filter(p => p.ownerId === nationId);
  const count = key => owned.reduce((n, p) => n + (p.buildings?.[key] > 0 ? 1 : 0), 0);
  const provinces = owned.length, banks = count('bank'), factories = count('factory'), ports = count('port');
  const total = provinces * RULES.baseIncome + banks * RULES.bankIncome + factories * RULES.factoryIncome + ports * (RULES.portIncome || 0);
  return { provinces, banks, factories, ports, total };
}
export const incomeFor = (state, nationId) => incomeBreakdown(state, nationId).total;
/** V13.1 : or rapporté chaque tour par un bâtiment (0 pour la forteresse). */
export const buildingIncome = type => ({ bank: RULES.bankIncome, factory: RULES.factoryIncome, port: RULES.portIncome || 0 })[type] || 0;
// Puissances « V6 » conservées pour compatibilité (plus utilisées par les combats depuis la V10 : voir combat.js).
export const landPower = (u, defense = false) => LAND_UNIT_TYPES.reduce((n, k) => n + (u[k] || 0) * (defense && k === 'artillery' ? RULES.units[k].defensePower : RULES.units[k].power), 0);
export const navalPower = ({ units = {}, warships = 0, transport = false }) => warships * RULES.units.warship.power + landPower(units) * (transport ? RULES.navalTransportPowerFactor : 0);

