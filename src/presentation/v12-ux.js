// V12 — Écran « Atouts & missions » (rendu HTML pur, testable sous Node ; branché dans app.js).
import { BOOST_KEYS, BOOST_MAX_LEVEL, BOOST_STEP_PCT } from '../domain/boosts.js';
import { BOOST_INFO, missionStatus, STARTER_PACK_TOKENS, DAILY_REWARD_TOKENS, canUpgradeBoost } from '../domain/profile.js';
import { storeItems, BILLING_ENABLED } from './store.js';

const esc = t => String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const pips = level => Array.from({ length: BOOST_MAX_LEVEL }, (_, i) => `<i class="${i < level ? 'on' : ''}"></i>`).join('');

/** Contenu complet de l'écran. `inGame` : rappel que les atouts s'appliquent à la partie en cours. */
export function boostScreenHtml(profile, date, { inGame = false } = {}) {
  const status = missionStatus(profile, date);
  const boosts = BOOST_KEYS.map(k => {
    const info = BOOST_INFO[k], level = profile.boosts[k] || 0, check = canUpgradeBoost(profile, k), max = level >= BOOST_MAX_LEVEL;
    return `<div class="boost-row" data-boost-row="${k}"><span class="boost-icon" aria-hidden="true">${info.icon}</span><span class="boost-main"><b>${info.label} <em>+${level * BOOST_STEP_PCT} %</em></b><small>${esc(info.text)}</small><span class="boost-pips" aria-label="Niveau ${level} sur ${BOOST_MAX_LEVEL}">${pips(level)}</span></span>
      <button class="boost-up" data-boost="${k}" ${check.ok ? '' : 'disabled'} aria-label="${max ? `${info.label} au maximum` : `Placer 1 jeton sur ${info.label}`}">${max ? 'MAX' : '+1 %<small>1 jeton</small>'}</button></div>`;
  }).join('');
  const missions = status.missions.map(m => `<div class="mission${m.done ? ' done' : ''}${m.ad ? ' ad' : ''}" data-mission="${m.id}"><span class="mission-check" aria-hidden="true">${m.done ? '✔' : m.ad ? '▶' : '○'}</span><span class="mission-main"><b>${esc(m.label)}</b><span class="mission-bar"><i style="width:${Math.round(100 * m.progress / m.target)}%"></i></span></span><span class="mission-count">${m.progress}/${m.target}</span>${m.ad && !m.done ? '<button class="mission-ad" data-watch-ad>Regarder</button>' : ''}</div>`).join('');
  const items = storeItems(profile);
  const pack = items.find(x => x.id === 'pack_debutant');
  const packHtml = profile.starterPack
    ? `<div class="pack owned"><b>✔ Pack débutant actif</b><small>Plus aucune publicité au début des parties.</small></div>`
    : `<div class="pack"><b>Pack débutant</b><small>Plus aucune publicité + ${STARTER_PACK_TOKENS} jetons immédiats. Achat unique.</small><button class="buy-test" data-buy="pack_debutant" ${pack?.available ? '' : 'disabled'}>${BILLING_ENABLED ? `Acheter${pack?.price ? ` · ${esc(pack.price)}` : ''}` : 'Achat de test (gratuit)'}</button></div>`;
  const tokenItems = items.filter(x => x.id !== 'pack_debutant').map(x => `<button class="token-buy" data-buy="${x.id}">${esc(x.label)}<small>${BILLING_ENABLED ? esc(x.price || '') : 'test gratuit'}</small></button>`).join('');
  return `<div class="tokens-head"><span class="token-coin" aria-hidden="true">✦</span><div><b id="tokenCount">${profile.tokens}</b><small>jeton${profile.tokens > 1 ? 's' : ''} à placer</small></div><p>1 jeton = +1 % sur un atout, jusqu’à +10 %. ${inGame ? 'Les atouts s’appliquent tout de suite à ta nation, jamais aux IA.' : 'Les atouts s’appliquent à ta nation, jamais aux IA.'}</p></div>
  <h3 class="v12-h">Atouts</h3><div class="boost-list">${boosts}</div>
  <h3 class="v12-h">Missions du jour <small>${status.done}/${status.total}${status.rewarded ? ' · jeton du jour reçu ✔' : ` · ${status.total}/${status.total} = +${DAILY_REWARD_TOKENS} jeton`}</small></h3>
  <div class="mission-list">${missions}</div><p class="v12-note">La progression compte sur toutes tes parties de la journée. Nouvelles missions à minuit.</p>
  <h3 class="v12-h">Boutique ${BILLING_ENABLED ? '' : '<span class="test-badge">BÊTA · AUCUN PAIEMENT</span>'}</h3>${packHtml}
  <div class="token-shop">${tokenItems}</div>
  <p class="v12-note">On n’achète jamais d’or ni de troupes : seulement des jetons d’atouts et la suppression des publicités.</p>
  <h3 class="v12-h">Sécurité du profil</h3><p class="v12-note">En attendant la sauvegarde Google Play Jeux, garde une copie de ton profil (jetons, atouts, achats) dans tes notes.</p>
  <div class="profile-tools"><button id="copyProfile" class="welcome-secondary">Copier mon profil</button><button id="restoreProfile" class="welcome-secondary">Restaurer</button></div>
  <button id="adsPrivacyBoost" class="welcome-secondary" data-ads-privacy hidden>Choix de confidentialité des publicités</button>`;
}
