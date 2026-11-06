// V15.4 — Palmarès et titres du joueur. Module pur (ni DOM, ni horloge, ni hasard). Tout vit dans le PROFIL, jamais dans la
// sauvegarde de partie. Les titres sont des souvenirs : rien ici n'est lu par le moteur, ils ne changent rien au jeu.
//
// Une partie est reconnue par sa graine (`arken-` + instant de création, unique), déjà présente dans les sauvegardes : `counted`
// retient les dernières comptées. Comme il n'existe qu'une seule sauvegarde à la fois, cette mémoire bornée suffit.
// Sans graine utilisable, la partie n'est pas comptée du tout : mieux vaut un oubli qu'un compte faux.
import { DIFFICULTY_IDS, difficultyOf } from './difficulty.js';
import { DEFAULT_GAME_LENGTH, gameLengthOf } from './game-length.js';

export const COUNTED_MEMORY = 200;
const DEFAULT_SEED = 'arken-v0'; // graine par défaut de createGameState : elle ne désigne aucune partie en particulier
const NATION_IDS = Object.freeze(['valmorne', 'roc-epine', 'noireflamme', 'oroel', 'aurel']);
const int = v => { const n = Math.floor(Number(v)); return Number.isFinite(n) && n > 0 ? Math.min(n, 1000000) : 0; };
const counts = (raw, ids) => Object.fromEntries(ids.map(id => [id, int(raw?.[id])]));

/** Titres : découverts en jouant. Les conditions restent cachées tant que le titre n'est pas obtenu. */
export const TITLES = Object.freeze([
  { id: 'premiere-page', name: 'Première page', text: 'Terminer une partie.', earned: f => true },
  { id: 'premiere-couronne', name: 'Première couronne', text: 'Gagner une partie.', earned: f => f.won },
  { id: 'longue-marche', name: 'Longue marche', text: `Aller au bout des ${DEFAULT_GAME_LENGTH} tours.`, earned: f => f.reason === 'turn-limit' && f.length === DEFAULT_GAME_LENGTH },
  { id: 'vif-eclair', name: 'Vif comme l’éclair', text: 'Gagner une partie courte.', earned: f => f.won && f.length !== DEFAULT_GAME_LENGTH },
  { id: 'maitre-arken', name: 'Maître d’Arken', text: 'Tenir les cinq capitales.', earned: f => f.won && f.reason === 'capitals' },
  { id: 'cinq-bannieres', name: 'Cinq bannières', text: 'Gagner avec chacune des cinq nations.', earned: (f, p) => NATION_IDS.every(id => p.winsByNation[id] > 0) },
  { id: 'contre-vents', name: 'Contre vents et marées', text: 'Gagner au niveau Difficile.', earned: f => f.won && f.difficulty === 'difficile' },
  { id: 'seul-contre-tous', name: 'Seul contre tous', text: 'Gagner malgré une coalition formée contre vous.', earned: f => f.won && f.coalitionAgainst },
  { id: 'retour-de-loin', name: 'Retour de loin', text: 'Gagner après avoir perdu sa capitale.', earned: f => f.won && f.lostCapital },
  { id: 'cendres', name: 'Cendres', text: 'Voir sa nation rayée de la carte.', earned: f => f.reason === 'player-eliminated' },
  { id: 'chroniqueur', name: 'Chroniqueur', text: 'Terminer dix parties.', earned: (f, p) => p.games >= 10 }
].map(t => Object.freeze(t)));
export const titleById = id => TITLES.find(t => t.id === id) || null;

export function emptyPalmares() {
  return { games: 0, wins: 0, winsByNation: counts({}, NATION_IDS), winsByDifficulty: counts({}, DIFFICULTY_IDS),
    gamesByLength: {}, bestRank: null, fastestWin: null, titles: [], counted: [], last: null };
}
/** Palmarès lu (profil ancien sans palmarès, ou abîmé) : tout champ invalide est remplacé, rien ne fait planter le jeu. */
export function sanitizePalmares(raw) {
  const base = emptyPalmares();
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return base;
  const fast = raw.fastestWin, rank = int(raw.bestRank), last = raw.last;
  return {
    games: int(raw.games), wins: int(raw.wins),
    winsByNation: counts(raw.winsByNation, NATION_IDS), winsByDifficulty: counts(raw.winsByDifficulty, DIFFICULTY_IDS),
    gamesByLength: Object.fromEntries(Object.entries(raw.gamesByLength && typeof raw.gamesByLength === 'object' ? raw.gamesByLength : {}).filter(([k]) => /^\d+$/.test(k)).map(([k, v]) => [k, int(v)])),
    bestRank: rank || null,
    fastestWin: fast && int(fast.turn) ? { turn: int(fast.turn), nationId: NATION_IDS.includes(fast.nationId) ? fast.nationId : null, length: int(fast.length) || DEFAULT_GAME_LENGTH } : null,
    titles: [...new Set((Array.isArray(raw.titles) ? raw.titles : []).filter(titleById))],
    counted: (Array.isArray(raw.counted) ? raw.counted : []).filter(x => typeof x === 'string' && x).slice(-COUNTED_MEMORY),
    last: last && typeof last.id === 'string' && Array.isArray(last.titles) ? { id: last.id, titles: last.titles.filter(titleById) } : null
  };
}
/** Identifiant de la partie, ou null : pas de graine propre à cette partie, donc rien pour la reconnaître. */
export function gameRecordId(state) {
  const seed = state?.seed;
  return typeof seed === 'string' && seed && seed !== DEFAULT_SEED ? seed : null;
}
/**
 * V15.5.1 : après l'import d'un profil, la partie finie déjà sauvegardée sur cet appareil ne doit pas être comptée une seconde
 * fois en rouvrant l'écran de fin. On la note comme déjà comptée, sans toucher aux chiffres du palmarès importé.
 */
export function markGameCounted(profile, state) {
  if (!profile || !state?.gameOver) return;
  const id = gameRecordId(state);
  if (!id) return;
  const p = profile.palmares = sanitizePalmares(profile.palmares);
  if (!p.counted.includes(id)) p.counted = [...p.counted, id].slice(-COUNTED_MEMORY);
}
/** Faits de fin de partie, lus dans l'état (rien n'est écrit dans l'état). */
function factsOf(state) {
  const go = state.gameOver, me = state.playerNationId, marks = Array.isArray(state.story?.marks) ? state.story.marks : [];
  const mine = (go.ranking || []).find(r => r.nationId === me);
  return { won: go.winnerId === me && go.reason !== 'player-eliminated', reason: go.reason, turn: int(go.turn), rank: int(mine?.rank), nationId: me,
    difficulty: difficultyOf(state), length: gameLengthOf(state),
    coalitionAgainst: marks.some(m => m[1] === 'f' && m[2] === me), lostCapital: marks.some(m => m[1] === 'c' && m[3] === me) };
}
/**
 * Compte une partie finie dans le palmarès du profil, une seule fois. Renvoie { counted, titles } : `titles` = titres obtenus
 * par CETTE partie, aussi quand on rouvre l'écran de fin. Ne modifie jamais `state`.
 */
export function recordFinishedGame(profile, state) {
  const none = { counted: false, titles: [] };
  if (!state?.gameOver || state.tutorialMode || state.controllers?.[state.playerNationId] !== 'human') return none;
  const id = gameRecordId(state);
  if (!id) return none;
  const p = profile.palmares = sanitizePalmares(profile.palmares);
  if (p.counted.includes(id)) return { counted: false, titles: p.last?.id === id ? p.last.titles : [] };
  const f = factsOf(state);
  p.games = int(p.games + 1);
  p.gamesByLength[f.length] = int((p.gamesByLength[f.length] || 0) + 1);
  if (f.rank && (!p.bestRank || f.rank < p.bestRank)) p.bestRank = f.rank;
  if (f.won) {
    p.wins = int(p.wins + 1);
    if (f.nationId in p.winsByNation) p.winsByNation[f.nationId]++;
    p.winsByDifficulty[f.difficulty]++;
    if (f.turn && (!p.fastestWin || f.turn < p.fastestWin.turn)) p.fastestWin = { turn: f.turn, nationId: f.nationId, length: f.length };
  }
  const fresh = TITLES.filter(t => !p.titles.includes(t.id) && t.earned(f, p)).map(t => t.id);
  p.titles.push(...fresh);
  p.counted = [...p.counted, id].slice(-COUNTED_MEMORY);
  p.last = { id, titles: fresh };
  return { counted: true, titles: fresh };
}
