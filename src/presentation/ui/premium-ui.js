// Interface — V17.7 : écran Premium (#premiumDialog). Premium = 1,99 €, achat unique : vitesse ×2 (débloque ⏩) et plus
// aucune pub imposée. En bêta : achat de TEST gratuit (store.js, BILLING_ENABLED=false), comme les autres achats.
// Le temps du jeu est arrêté pendant cet écran (#premiumDialog fait partie des menus hors jeu de realtime-ui.js).

import { productById } from '../../domain/profile.js';
import { premiumScreenHtml } from '../premium-view.js';
import { BILLING_ENABLED, loadStorePrices, purchase } from '../store.js';
import { todayLocal } from '../profile-storage.js';
import { $, toast } from './base.js';
import { profile, saveMyProfile } from './session.js';

let onFast = null; // fourni par realtime-ui.js (évite une dépendance circulaire) : passe en ×2 après l'achat
export const setPremiumFastHandler = fn => { onFast = fn; };
let prices = {};

/** Ouvre (ou redessine) l'écran Premium. `from` : 'fast' quand le joueur vient de toucher ⏩ sans Premium. */
export function openPremium({ from = '' } = {}) {
  const dialog = $('#premiumDialog'), body = $('#premiumBody');
  if (!dialog || !body) return;
  body.innerHTML = premiumScreenHtml(profile, { billing: BILLING_ENABLED, prices, from });
  body.querySelectorAll('[data-premium-buy]').forEach(b => b.onclick = async () => {
    body.querySelectorAll('[data-premium-buy]').forEach(x => { x.disabled = true; });
    const id = b.dataset.premiumBuy, r = await purchase(profile, id, { date: todayLocal(), save: saveMyProfile });
    if (!r.ok) { openPremium({ from }); return toast(r.error); }
    saveMyProfile();
    toast(`${r.test ? 'Achat de test' : 'Achat confirmé'} : ${productById(id).label}${r.tokens ? ` · +${r.tokens} jetons` : ''} · Premium actif`);
    openPremium({ from });
  });
  const done = $('#premiumDone');
  if (done) done.onclick = () => { dialog.close(); if (from === 'fast' && profile.premium) onFast?.(); };
  if (!dialog.open) dialog.showModal();
  if (BILLING_ENABLED && !Object.keys(prices).length) loadStorePrices().then(p => { prices = p || {}; if (dialog.open && !profile.premium) openPremium({ from }); });
}
