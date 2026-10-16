// V12 — Profil du joueur, HORS partie (docs/V12-cahier-des-charges.md, docs/V12-branchements.md).
// Module PUR : aucun DOM, aucun localStorage, aucune horloge. La date du jour (AAAA-MM-JJ, heure locale) est
// toujours FOURNIE par l'interface. Le stockage (clé `frontieres-arken-profil`) est dans
// src/presentation/profile-storage.js.
//
// Contenu : jetons, niveaux d'atouts, missions du jour (progression cumulée sur toutes les parties du jour),
// Pack débutant (sans pub + 3 jetons), historique des achats (simulés en bêta).
//
// RÈGLE D'OR : aucun achat ne donne d'or ni de troupes. Un achat ne peut donner que des JETONS et la suppression
// des publicités ; les jetons ne servent qu'aux atouts (pourcentages plafonnés à +10 %).
import { BOOST_KEYS, BOOST_MAX_LEVEL, BOOST_COST_TOKENS, sanitizeLevels } from './boosts.js';

export const PROFILE_VERSION = 1;
export const PROFILE_EXPORT_PREFIX = 'ARKEN-PROFIL-1:';
export const DAILY_MISSION_COUNT = 5;
export const DAILY_REWARD_TOKENS = 1;
export const STARTER_PACK_TOKENS = 3;
export const AD_DAY_RATE = 7; // sur 10 : la 5e mission est une publicité environ 7 jours sur 10

/** Catalogue des achats intégrés. `grants` ne peut contenir QUE `tokens` et `adsRemoved` (règle d'or, testé). */
export const PRODUCTS = Object.freeze([
  Object.freeze({ id: 'pack_debutant', label: 'Pack débutant', description: 'Plus aucune publicité + 3 jetons', oneTime: true, grants: Object.freeze({ tokens: STARTER_PACK_TOKENS, adsRemoved: true }) }),
  Object.freeze({ id: 'jetons_1', label: '1 jeton', description: 'Un niveau d’atout', oneTime: false, grants: Object.freeze({ tokens: 1 }) }),
  Object.freeze({ id: 'jetons_5', label: 'Lot de 5 jetons', description: 'Cinq niveaux d’atouts', oneTime: false, grants: Object.freeze({ tokens: 5 }) }),
  Object.freeze({ id: 'jetons_12', label: 'Lot de 12 jetons', description: 'Douze niveaux d’atouts', oneTime: false, grants: Object.freeze({ tokens: 12 }) })
]);
export const ALLOWED_GRANTS = Object.freeze(['tokens', 'adsRemoved']);

export const BOOST_INFO = Object.freeze({
  gold:    { label: 'Or', icon: '◉', text: 'Gains d’or de chaque tour' },
  recruit: { label: 'Recrutement', icon: '⚔', text: 'Infanterie recrutée (100 → 110 au niveau 10)' },
  build:   { label: 'Construction', icon: '⚒', text: 'Vitesse de construction' },
  fort:    { label: 'Défense', icon: '▣', text: 'Effet de défense des forts' },
  naval:   { label: 'Marine', icon: '⚓', text: 'Puissance des navires de guerre' }
});

/**
 * Missions possibles. `metric` = compteur alimenté par le moteur (événements du tour, `missionDeltas`) ;
 * `group` : deux missions du même groupe ne tombent jamais le même jour.
 */
export const MISSION_CATALOG = Object.freeze([
  { id: 'tours-3', group: 'tours', metric: 'turns', target: 3, label: 'Jouer 3 tours' },
  { id: 'tours-5', group: 'tours', metric: 'turns', target: 5, label: 'Jouer 5 tours' },
  { id: 'infanterie-50', group: 'infanterie', metric: 'infantry', target: 50, label: 'Recruter 50 fantassins' },
  { id: 'infanterie-100', group: 'infanterie', metric: 'infantry', target: 100, label: 'Recruter 100 fantassins' },
  { id: 'cavalerie-10', group: 'cavalerie', metric: 'cavalry', target: 10, label: 'Recruter 10 cavaliers' },
  { id: 'construire-1', group: 'construire', metric: 'build', target: 1, label: 'Lancer 1 construction' },
  { id: 'construire-2', group: 'construire', metric: 'build', target: 2, label: 'Lancer 2 constructions' },
  { id: 'conquete-1', group: 'conquete', metric: 'conquer', target: 1, label: 'Conquérir 1 province' },
  { id: 'conquete-3', group: 'conquete', metric: 'conquer', target: 3, label: 'Conquérir 3 provinces' },
  { id: 'combat-1', group: 'combat', metric: 'win', target: 1, label: 'Gagner 1 combat' },
  { id: 'message-1', group: 'message', metric: 'message', target: 1, label: 'Envoyer 1 message diplomatique' }
].map(m => Object.freeze(m)));
export const AD_MISSION = Object.freeze({ id: 'publicite', group: 'publicite', metric: 'ad', target: 1, label: 'Regarder 1 publicité (facultatif)', ad: true });

const int = n => Math.max(0, Math.floor(Number(n) || 0));
const isDate = d => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d);
const METRICS = ['turns', 'infantry', 'cavalry', 'build', 'conquer', 'win', 'message', 'ad'];

/** FNV-1a 32 bits : hachage stable d'une chaîne. */
export function hashString(text) {
  let h = 0x811c9dc5;
  for (const ch of String(text)) { h ^= ch.codePointAt(0); h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
}
function seeded(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/** Le jour `date` a-t-il une mission publicité ? (≈ 7 jours sur 10, déterministe) */
export const isAdDay = date => hashString(`publicite|${date}`) % 10 < AD_DAY_RATE;

/** Les 5 missions du jour, tirées de façon déterministe à partir de la date (AAAA-MM-JJ). */
export function dailyMissions(date) {
  const random = seeded(hashString(`missions|${date}`));
  const pool = [...MISSION_CATALOG];
  for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  const chosen = [], groups = new Set();
  const want = isAdDay(date) ? DAILY_MISSION_COUNT - 1 : DAILY_MISSION_COUNT;
  for (const m of pool) { if (chosen.length >= want) break; if (groups.has(m.group)) continue; groups.add(m.group); chosen.push(m); }
  return isAdDay(date) ? [...chosen, AD_MISSION] : chosen;
}

const emptyProgress = () => Object.fromEntries(METRICS.map(k => [k, 0]));
const freshDaily = date => ({ date: isDate(date) ? date : null, progress: emptyProgress(), rewarded: false });

export function createProfile() {
  return {
    version: PROFILE_VERSION, tokens: 0, boosts: sanitizeLevels({}), adsRemoved: false, starterPack: false,
    purchases: [], daily: freshDaily(null), rewardedDates: [], earned: { missions: 0, purchases: 0 }
  };
}

/** Nettoie un profil lu (stockage ou import) : tout champ invalide est remplacé, rien ne fait planter le jeu. */
export function sanitizeProfile(raw) {
  const base = createProfile();
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return base;
  const purchases = (Array.isArray(raw.purchases) ? raw.purchases : [])
    .filter(p => p && typeof p === 'object' && PRODUCTS.some(x => x.id === p.productId))
    .map(p => ({ orderId: String(p.orderId || ''), productId: p.productId, date: isDate(p.date) ? p.date : null, test: p.test !== false }))
    .slice(-200);
  const starterPack = Boolean(raw.starterPack) || purchases.some(p => p.productId === 'pack_debutant');
  const daily = raw.daily && typeof raw.daily === 'object' ? {
    date: isDate(raw.daily.date) ? raw.daily.date : null,
    progress: Object.fromEntries(METRICS.map(k => [k, int(raw.daily.progress?.[k])])),
    rewarded: Boolean(raw.daily.rewarded)
  } : base.daily;
  return {
    version: PROFILE_VERSION,
    tokens: Math.min(int(raw.tokens), 100000),
    boosts: sanitizeLevels(raw.boosts),
    adsRemoved: Boolean(raw.adsRemoved) || starterPack,
    starterPack,
    purchases,
    daily,
    rewardedDates: (Array.isArray(raw.rewardedDates) ? raw.rewardedDates : []).filter(isDate).slice(-90),
    earned: { missions: int(raw.earned?.missions), purchases: int(raw.earned?.purchases) }
  };
}

export const encodeProfile = profile => JSON.stringify(sanitizeProfile(profile));
/** Décodage tolérant : texte absent ou corrompu → profil neuf (jamais d'exception). */
export function decodeProfile(text) {
  if (typeof text !== 'string' || !text) return createProfile();
  try { return sanitizeProfile(JSON.parse(text)); } catch { return createProfile(); }
}

/** Export « Copier mon profil » : texte collable (préfixe + base64 du JSON). */
export function exportProfile(profile) {
  const json = encodeProfile(profile);
  const b64 = typeof btoa === 'function' ? btoa(unescape(encodeURIComponent(json))) : Buffer.from(json, 'utf8').toString('base64');
  return PROFILE_EXPORT_PREFIX + b64;
}
/** Import « Restaurer » : { ok, profile } ou { ok:false, error }. */
export function importProfile(text) {
  const raw = String(text || '').trim();
  if (!raw.startsWith(PROFILE_EXPORT_PREFIX)) return { ok: false, error: 'Ce texte n’est pas un profil FRONTIÈRES: ARKEN' };
  try {
    const b64 = raw.slice(PROFILE_EXPORT_PREFIX.length).replace(/\s+/g, '');
    const json = typeof atob === 'function' ? decodeURIComponent(escape(atob(b64))) : Buffer.from(b64, 'base64').toString('utf8');
    const parsed = JSON.parse(json);
    if (!parsed || typeof parsed !== 'object' || parsed.version !== PROFILE_VERSION) return { ok: false, error: 'Profil illisible ou d’une autre version' };
    return { ok: true, profile: sanitizeProfile(parsed) };
  } catch { return { ok: false, error: 'Profil illisible (texte incomplet ?)' }; }
}

// --- Atouts ---------------------------------------------------------------------------------------------------
export const boostCost = () => BOOST_COST_TOKENS; // coût FIXE, quel que soit le niveau
export function canUpgradeBoost(profile, key) {
  if (!BOOST_KEYS.includes(key)) return { ok: false, error: 'Atout inconnu' };
  if ((profile.boosts[key] || 0) >= BOOST_MAX_LEVEL) return { ok: false, error: 'Niveau maximum atteint (+10 %)' };
  if (profile.tokens < BOOST_COST_TOKENS) return { ok: false, error: 'Pas assez de jetons' };
  return { ok: true };
}
/** Place 1 jeton sur un atout : +1 niveau (+1 %). Modifie le profil. */
export function upgradeBoost(profile, key) {
  const check = canUpgradeBoost(profile, key);
  if (!check.ok) return check;
  profile.tokens -= BOOST_COST_TOKENS;
  profile.boosts[key] = (profile.boosts[key] || 0) + 1;
  return { ok: true, level: profile.boosts[key], tokens: profile.tokens };
}

// --- Missions journalières -------------------------------------------------------------------------------------
/** Passe au jour `date` : nouvelle journée = progression remise à zéro. */
export function ensureDay(profile, date) {
  if (!isDate(date)) return profile;
  if (profile.daily?.date !== date) profile.daily = freshDaily(date);
  return profile;
}

/** État des missions du jour : [{ ...mission, progress, done }], + résumé. */
export function missionStatus(profile, date) {
  ensureDay(profile, date);
  const list = dailyMissions(date).map(m => {
    const progress = Math.min(m.target, int(profile.daily.progress[m.metric]));
    return { ...m, progress, done: progress >= m.target };
  });
  const done = list.filter(m => m.done).length;
  return { date, missions: list, done, total: list.length, rewarded: Boolean(profile.daily.rewarded) || profile.rewardedDates.includes(date) };
}

/** Accorde le jeton du jour si 5/5 et pas déjà accordé ce jour-là. Renvoie le nombre de jetons gagnés (0 ou 1). */
function settleDay(profile, date) {
  const s = missionStatus(profile, date);
  if (s.done < s.total || s.rewarded) return 0;
  profile.daily.rewarded = true;
  profile.rewardedDates = [...profile.rewardedDates.filter(d => d !== date), date].slice(-90);
  profile.tokens += DAILY_REWARD_TOKENS;
  profile.earned.missions += DAILY_REWARD_TOKENS;
  return DAILY_REWARD_TOKENS;
}

/**
 * Ajoute des compteurs (deltas par métrique) à la journée et renvoie
 * { completed: [missions qui viennent d'être accomplies], tokens: jetons gagnés }.
 */
export function addMissionProgress(profile, date, deltas = {}) {
  const before = new Set(missionStatus(profile, date).missions.filter(m => m.done).map(m => m.id));
  for (const k of METRICS) if (deltas[k]) profile.daily.progress[k] = int(profile.daily.progress[k]) + int(deltas[k]);
  const after = missionStatus(profile, date).missions.filter(m => m.done && !before.has(m.id));
  return { completed: after, tokens: settleDay(profile, date) };
}

/** Publicité de mission regardée (récompensée). */
export const recordAdWatched = (profile, date) => addMissionProgress(profile, date, { ad: 1 });

/**
 * Compteurs de missions à partir des événements d'un inter-tour (moteur), pour le joueur `nationId`.
 * Fonction pure : n'utilise que des événements déjà produits par le moteur.
 */
export function missionDeltas(events = [], nationId) {
  const d = emptyProgress();
  for (const e of events) {
    if (!e || typeof e !== 'object') continue;
    switch (e.type) {
      case 'turn-start': d.turns++; break;
      case 'production-complete':
        if (e.nationId === nationId && e.kind === 'unit' && e.productionType === 'infantry') d.infantry += int(e.amount);
        if (e.nationId === nationId && e.kind === 'unit' && e.productionType === 'cavalry') d.cavalry += int(e.amount);
        break;
      case 'project-started': if (e.nationId === nationId && e.kind === 'construction') d.build++; break;
      case 'conquest': if (e.newOwnerId === nationId) { d.conquer++; d.win++; } break;
      case 'battle': if (e.defender === nationId) d.win++; break; // défense tenue
      case 'interception': if (e.attacker === nationId && e.convoyDestroyed) d.win++; break;
      case 'talk': if (e.nationId === nationId && !e.ai) d.message++; break;
      case 'diplomatic-action': if (e.nationId === nationId && !e.viaTalk && !e.proposal && ['alliance', 'war'].includes(e.action)) d.message++; break;
      case 'ceasefire-offer': if (e.nationId === nationId) d.message++; break;
    }
  }
  return d;
}

// --- Achats (simulés en bêta) ---------------------------------------------------------------------------------
export const productById = id => PRODUCTS.find(p => p.id === id) || null;
export function canPurchase(profile, productId) {
  const product = productById(productId);
  if (!product) return { ok: false, error: 'Produit inconnu' };
  if (product.oneTime && profile.purchases.some(p => p.productId === productId)) return { ok: false, error: 'Déjà acheté' };
  return { ok: true, product };
}
/**
 * Applique un achat CONFIRMÉ (par Google Play plus tard, par le bouton « Achat de test » en bêta).
 * Ne donne que des jetons et/ou la suppression des pubs. Idempotent sur `orderId` (restauration Google Play).
 */
export function applyPurchase(profile, { productId, orderId, date = null, test = true }) {
  const check = canPurchase(profile, productId);
  if (orderId && profile.purchases.some(p => p.orderId === String(orderId))) return { ok: true, duplicate: true, tokens: 0 };
  if (!check.ok) return check;
  const { grants } = check.product;
  profile.purchases.push({ orderId: String(orderId || `${productId}-${profile.purchases.length + 1}`), productId, date: isDate(date) ? date : null, test: Boolean(test) });
  const tokens = int(grants.tokens);
  profile.tokens += tokens;
  profile.earned.purchases += tokens;
  if (grants.adsRemoved) { profile.adsRemoved = true; profile.starterPack = true; }
  return { ok: true, tokens, adsRemoved: Boolean(grants.adsRemoved) };
}
