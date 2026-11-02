// Moteur — petits outils communs : lecture de la carte, relations, trésor disponible, conseils.

import { LAND_UNIT_TYPES } from '../constants.js';

export const sum = units => LAND_UNIT_TYPES.reduce((n, k) => n + (Number(units?.[k]) || 0), 0);
export const provinceDef = (map, id) => map.provinces.find(p => p.id === id);
export const safeNum = n => Number.isFinite(Number(n)) ? Number(n) : 0;
// V13 : élision (« d’Oroël », « de Solmara », « de Valmorne »).
export const deName = name => /^[AEIOUYÉÈÊÎÏÔÖÛÜÀÂaeiouyéèêîïôöûüàâ]/.test(name) ? `d’${name}` : `de ${name}`;
export const nationName = (map, id) => map.nations.find(n => n.id === id)?.short || 'Nation inconnue';
export const pairWar = (state, a, b) => state.diplomacy.wars.some(w => w.active !== false && w.participants.includes(a) && w.participants.includes(b));
export const pairTreaty = (state, a, b, type) => state.diplomacy.treaties.some(t => t.active !== false && t.type === type && t.parties.includes(a) && t.parties.includes(b));
const reservedDiplomaticFunds = (state, nationId) => (state.orders || []).filter(o => o.kind === 'diplomacy' && o.action === 'ceasefire' && o.nationId === nationId && o.status === 'pending').reduce((n,o)=>n+(o.amount||0),0);
export const spendableTreasury = (state, nationId) => Math.max(0,(state.nations[nationId]?.treasury||0)-reservedDiplomaticFunds(state,nationId));

export const adviserText = (state, role) => role==='finance' ? (state.nations[state.playerNationId].treasury<40?'Nos caisses sont basses.':'Le trésor reste disponible pour investir.') : 'Les frontières doivent être surveillées.';
