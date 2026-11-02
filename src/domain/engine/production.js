// Moteur — chantiers et recrutements en cours.

import { buildTurnsGained, nationBonusPct, recruitAmount } from '../boosts.js';
import { RULES } from '../constants.js';
import { refundProduction } from './battles.js';

export function resolveProjects(state, orders) {
  for (const o of orders.filter(x => x.kind === 'construction' || x.kind === 'recruitment')) {
    // B4 : une commande passée dans une province perdue pendant cet inter-tour est annulée et remboursée.
    if (state.provinces[o.provinceId]?.ownerId !== o.nationId) { refundProduction(state, { ...o, kind: o.kind === 'construction' ? 'building' : 'unit' }, o.provinceId); continue; }
    state.productionQueue.push({ kind: o.kind === 'construction' ? 'building' : 'unit', type: o.type, provinceId: o.provinceId, nationId: o.nationId, amount: o.amount || 1, remaining: o.duration, cost: o.cost || 0 });
    state.events.push({ turn: state.turn, type: 'project-started', kind: o.kind, productionType: o.type, provinceId: o.provinceId, nationId: o.nationId, amount: o.amount || 1 });
  }
  for (const q of state.productionQueue) q.remaining--;
  // V12 : atout « construction » (+N % de vitesse), V15.3 : et bonus de nation — la nation gagne un tour de chantier supplémentaire chaque fois
  // que le crédit cumulé (N % par chantier actif et par tour) atteint un tour entier ; le chantier le plus avancé d'abord.
  for (const nationId of Object.keys(state.nations)) {
    const sites = state.productionQueue.filter(q => q.kind === 'building' && q.nationId === nationId && q.remaining > 0)
      .sort((a, b) => a.remaining - b.remaining || String(a.provinceId).localeCompare(String(b.provinceId)) || String(a.type).localeCompare(String(b.type)));
    let gained = buildTurnsGained(state, nationId, sites.length);
    for (const q of sites) { if (!gained) break; q.remaining--; q.boosted = (q.boosted || 0) + 1; gained--; }
  }
  for (const q of state.productionQueue.filter(x => x.remaining <= 0)) {
    const p = state.provinces[q.provinceId];
    // B4 (filet de sécurité) : jamais de livraison à un autre propriétaire que celui qui a payé.
    if (p && p.ownerId !== q.nationId) { refundProduction(state, q, q.provinceId); continue; }
    if (p) {
      if (q.kind === 'building') p.buildings[q.type] = Math.min((p.buildings[q.type] || 0) + 1, RULES.buildings[q.type]?.max ?? Infinity);
      else if (q.type === 'warship') p.warships = (p.warships || 0) + q.amount;
      else {
        // V12 : atout « recrutement » (+N % d'infanterie livrée, joueur humain seulement).
        const delivered = q.kind === 'unit' ? recruitAmount(state, q.nationId, q.type, q.amount) : q.amount;
        p.units[q.type] = (p.units[q.type] || 0) + delivered;
        if (delivered !== q.amount) { q.bonus = delivered - q.amount; q.amount = delivered; q.nationBonus = nationBonusPct(state, q.nationId, 'recruit') > 0; }
      }
      state.events.push({ turn: state.turn, type: 'production-complete', kind: q.kind, productionType: q.type, provinceId: q.provinceId, nationId: q.nationId, amount: q.amount || 1, ...(q.bonus ? { bonus: q.bonus, ...(q.nationBonus ? { nationBonus: true } : {}) } : {}) });
    }
  }
  state.productionQueue = state.productionQueue.filter(q => q.remaining > 0);
}
