// V17.9 — Tutoriel du TEMPS RÉEL, refait de zéro (demande de Jack : le jeu est plus complexe, il faut être précis ;
// rejouable depuis ⚙ et depuis l'accueil ; proposé au premier lancement). Fonctions pures, sans DOM.
//
// Principe : une PARTIE D'ENTRAÎNEMENT à part, en temps réel, au scénario fixe (graine, forces réglées à l'avance), jouée
// avec le vrai moteur (src/domain/). Chaque étape avance quand le joueur fait VRAIMENT le geste demandé, ou, pour les étapes
// « regarder » (`clock: 'run'`), quand ce qu'on attend est arrivé dans la partie (armée qui avance, bataille finie, réponse).
//  - Le temps est EN PAUSE pendant les explications : l'interface l'arrête à chaque nouvelle étape et ▶ n'est accepté que
//    pendant les étapes « regarder » (et l'étape qui apprend ▶ / ⏸). Il avance alors à 1 jour par seconde (entraînement).
//  - Bulles courtes, une idée par étape, jamais de conseil de stratégie : on dit ce que fait chaque chose, pas quoi faire.
//  - Aucune pub, aucune offre Premium, aucune icône 🎁 pendant le tutoriel (ad-ui.js, realtime-ui.js).
//  - Sauvegarde DISTINCTE : `frontieres-arken-tutoriel-save`. La clé de la vraie partie (SAVE_KEY) n'est jamais lue ni
//    écrite par le tutoriel. Une ancienne partie de tutoriel au tour par tour (V14.3) n'est pas reprise (`TUTO_VERSION`).
//  - Remplace le tutoriel au tour par tour de la V14.3 et le mini tuto de la V13.4.
import { RULES } from '../domain/constants.js';
import { createRealtimeGame } from '../domain/realtime/create.js';
import { landTravelDays } from '../domain/realtime/marches.js';
import { foodOf } from '../domain/realtime/food.js';
import { fortReductionPct } from '../domain/combat.js';
import { MYSTERY_ISLAND_ID } from '../domain/mystery-island.js';
import { SAVE_KEY } from './guide-input.js';

export const TUTO_SAVE_KEY = 'frontieres-arken-tutoriel-save';
export const TUTO_OFFER_KEY = 'frontieres-arken-tutoriel-propose';
export const TUTO_SEED = 'tutoriel-v17-9';
/** Version du scénario : une partie de tutoriel d'une autre version (tour par tour V14.3) n'est jamais reprise. */
export const TUTO_VERSION = 179;
export const TUTO_NATION = 'valmorne';
/** Seule nation dirigée par l'IA : le futur allié (il répond vraiment à la proposition, à sa prochaine décision). */
export const TUTO_ALLY = 'roc-epine';
/** Nation qui occupe Haut-Bois (province attaquée) et Nordhème (but du convoi). Passive : elle ne donne aucun ordre. */
export const TUTO_RIVAL = 'oroel';
/** Province occupée par la nation rivale, sur l'île du joueur : la bataille du tutoriel. Garnison réglée (tests) pour que
 *  l'attaque à 50 % tienne 2 assauts et que le renfort parti de Sylvaren rejoigne le 3e. */
export const TUTO_BATTLE = Object.freeze({ province: 'p04', garrison: 90, fort: 1, attackFrom: 'p03', reinforceFrom: 'p02' });
/** Armée qu'on envoie puis qu'on rappelle. */
export const TUTO_MARCH = Object.freeze({ from: 'p01', to: 'p02', watchDays: 4 });
export const TUTO_SEA = Object.freeze({ from: 'p03', to: 'p14' });
export const TUTO_TREASURY = 220;
/** Réserve de vivres du tutoriel (en vivres) : de quoi tenir bien plus longtemps que l'entraînement. */
export const TUTO_FOOD_RESERVE = 4000;
/** Pendant les étapes « regarder », le temps du tutoriel va à 1 jour par seconde (vraie partie : 2 s, ou 1 s en Premium). */
export const TUTO_SPEED = 2;

const R = RULES.realtime, D = R.durations, B = RULES.buildings, U = RULES.units;
const perMonth = n => `${String(n).replace('.', ',')} or / mois`;
/**
 * Partie d'entraînement en temps réel (1er janvier 2027, en pause) : Valmorne (joueur) ; Roc-Épine dirigé par l'IA
 * (Bâtisseur : il accepte une alliance si la tension reste sous 50 %, même après une guerre ailleurs) ; les trois autres nations restent passives. Réglages : trésor 220 or ;
 * Oroël occupe Haut-Bois (90 fantassins, forteresse 1) ; Sylvaren 120 fantassins ; Branvale : port construit, 3 navires de
 * guerre, 160 fantassins et 10 cavaliers ; un ballon d'observation prêt au-dessus de Valmorne.
 */
export function createTutorialState({ map }) {
  const s = createRealtimeGame({ map, playerNationId: TUTO_NATION, seed: TUTO_SEED });
  for (const id of Object.keys(s.nations)) s.controllers[id] = id === TUTO_NATION ? 'human' : id === TUTO_ALLY ? 'ai' : 'human';
  // Caractère du futur allié fixé (chaque étape doit être réalisable) ; il reste caché au joueur.
  s.leaders = { ...s.leaders, [TUTO_ALLY]: { ...(s.leaders?.[TUTO_ALLY] || {}), archetype: 'batisseur', revealed: false } };
  s.ai.traits = { ...(s.ai.traits || {}), [TUTO_ALLY]: 'fidele' };
  s.nations[TUTO_NATION].treasury = TUTO_TREASURY;
  const hb = s.provinces[TUTO_BATTLE.province];
  hb.ownerId = TUTO_RIVAL; hb.units = { infantry: TUTO_BATTLE.garrison, cavalry: 0, armor: 0, artillery: 0 }; hb.buildings.fort = TUTO_BATTLE.fort;
  s.provinces.p02.units.infantry = 120;
  const br = s.provinces.p03; br.buildings.port = 1; br.warships = 3; br.units.infantry = 160; br.units.cavalry = 10;
  // Grande réserve de vivres : pas de famine pendant l'entraînement (l'étape « famine » l'explique sans la provoquer).
  foodOf(s, TUTO_NATION).reserve = TUTO_FOOD_RESERVE * R.food.hundredths;
  s.balloons = [{ id: 'b-valmorne-tuto', nationId: TUTO_NATION, over: TUTO_NATION, to: null, legTurns: 0, legDays: 0 }];
  s.events = []; s.chronicle = []; // l'installation du scénario n'apparaît pas au journal
  s.settings.hints = false; // pas de bulles contextuelles par-dessus le tutoriel
  s.tutorialMode = true;
  s.tutorialRun = { step: 0, version: TUTO_VERSION };
  return s;
}
export const isTutorial = state => Boolean(state?.tutorialMode);
/** Partie de tutoriel du temps réel, de cette version (une ancienne au tour par tour ne se reprend pas). */
export const isCurrentTutorial = state => isTutorial(state) && state.mode === 'realtime' && state.tutorialRun?.version === TUTO_VERSION;
/** Clé de sauvegarde à utiliser pour cette partie : jamais celle de la vraie partie pour le tutoriel. */
export const saveKeyFor = state => isTutorial(state) ? TUTO_SAVE_KEY : SAVE_KEY;

// --- Stockage (tolérant : navigation privée, stockage plein) ------------------------------------------------------
const safeGet = (storage, key) => { try { return storage?.getItem(key) ?? null; } catch { return null; } };
const safeSet = (storage, key, value) => { try { storage?.setItem(key, value); return true; } catch { return false; } };
const safeDel = (storage, key) => { try { storage?.removeItem(key); } catch { /* stockage indisponible */ } };
/** Écrit la partie sous SA clé (tutoriel ou vraie partie). `encode` = encodeSave. */
export function storeGame(state, encode, storage = globalThis.localStorage) { return state ? safeSet(storage, saveKeyFor(state), encode(state)) : false; }
/** Partie de tutoriel en cours (ou null). `decode` = texte → partie (decodeRealtimeSave(...).state). */
export function loadTutorial(decode, storage = globalThis.localStorage) {
  const raw = safeGet(storage, TUTO_SAVE_KEY);
  if (!raw) return null;
  try { const s = decode(raw); return isCurrentTutorial(s) ? s : null; } catch { return null; }
}
export const clearTutorial = (storage = globalThis.localStorage) => safeDel(storage, TUTO_SAVE_KEY);
/** Proposé une seule fois au premier lancement (« Jouer le tutoriel » ou « Passer »). */
export const tutorialOffered = (storage = globalThis.localStorage) => safeGet(storage, TUTO_OFFER_KEY) !== null;
export const markTutorialOffered = (storage = globalThis.localStorage, value = 'propose') => safeSet(storage, TUTO_OFFER_KEY, value);
export const tutorialCompleted = (storage = globalThis.localStorage) => safeGet(storage, TUTO_OFFER_KEY) === 'termine';

// --- Ce qu'on lit dans la partie (jamais supposé) ------------------------------------------------------------------
const mine = s => s?.playerNationId;
const ownMarches = (s, toId) => (s?.marches || []).filter(m => m.nationId === mine(s) && !m.returning && (!toId || m.toId === toId));
const watchedMarch = s => ownMarches(s, TUTO_MARCH.to).find(m => m.fromId === TUTO_MARCH.from) || null;
/** Ordre de déplacement du joueur pas encore parti (l'interface l'exécute dans le quart de seconde qui suit). */
const pendingMove = (s, from, to) => (s?.orders || []).some(o => o.kind === 'move' && o.status === 'pending' && o.nationId === mine(s) && (!from || o.fromId === from) && o.toId === to);
/** L'armée de l'étape « rappel » : encore en route, ou déjà rappelée (elle rentre). */
const recalledOrWatched = s => watchedMarch(s) || pendingMove(s, TUTO_MARCH.from, TUTO_MARCH.to) || (s?.marches || []).find(m => m.nationId === mine(s) && m.returning && m.recalled && m.toId === TUTO_MARCH.from) || null;
const battleAt = (s, id = TUTO_BATTLE.province) => (s?.battles || []).find(b => b.provinceId === id) || null;
const takenBattle = s => s?.provinces?.[TUTO_BATTLE.province]?.ownerId === mine(s);
const awaitingAlly = s => (s?.orders || []).some(o => o.kind === 'diplomacy' && o.nationId === mine(s) && o.target === TUTO_ALLY && ['pending', 'awaiting'].includes(o.status));
const alliedWithAlly = s => (s?.diplomacy?.treaties || []).some(t => t.active !== false && t.type === 'alliance' && t.parties.includes(mine(s)) && t.parties.includes(TUTO_ALLY));
const alliancePlanned = s => (s?.orders || []).some(o => o.kind === 'diplomacy' && o.nationId === mine(s) && o.target === TUTO_ALLY && o.action === 'alliance');
/** Le tutoriel pourrait-il encore montrer la bataille ? (armée en route vers Haut-Bois, ou bataille en cours) */
export const battleComing = s => Boolean(battleAt(s) || ownMarches(s, TUTO_BATTLE.province).length || pendingMove(s, null, TUTO_BATTLE.province));

// --- Étapes ---------------------------------------------------------------------------------------------------------
// `on` : événement(s) de l'interface qui font avancer l'étape (geste réel) ; 'ok' = bouton de la bulle.
// `clock: 'run'` : étape « regarder » — le temps tourne (▶), l'étape avance quand `until(state)` est vrai, puis le temps
//   s'arrête de lui-même. Toutes les autres étapes se jouent EN PAUSE.
// `targets` : ce qu'il faut toucher, du plus précis au plus général : la bulle surligne le PREMIER élément visible.
// `dynamic(state)` : texte, cibles ou événements adaptés à ce qui s'est VRAIMENT passé dans la partie.
// Événements émis par l'interface : pan, select:<province>, play, pause, fast, food, build:<type>, recruit, unit-info,
// move-land, move-sea, move:<de>-<vers>, unit-open, recall, battle-open, journal-closed, diplomacy:<nation>,
// alliance:<nation>, balloon-open, balloon-send, ranking, ok.
const P = id => `[data-id="${id}"]`;
/** Province proposée en vert pendant un déplacement (destination légale). */
const DEST = id => `.province.destination[data-id="${id}"]`;
/** Bouton de la fiche ouverte sur CETTE province (la fiche porte data-province). */
const SHEET = (id, action) => `#provinceSheet[data-province="${id}"] [data-sheet-action="${action}"]`;
const CONFIRM = '#acceptConfirmation';
/** Un bouton déjà touché pendant l'étape reçoit .tuto-done : on surligne alors le suivant. */
const ONCE = sel => `${sel}:not(.tuto-done)`;
const BUILD = (id, type) => [CONFIRM, `[data-build="${type}"]:not(:disabled)`, SHEET(id, 'build'), P(id)];
const MOVE = (from, to) => [CONFIRM, '#confirmMove', DEST(to), SHEET(from, 'move'), P(from)];
const fortPct = fortReductionPct(1);
const attackDays = map => landTravelDays({ infantry: 1 }, map, TUTO_BATTLE.attackFrom, TUTO_BATTLE.province);

export const TUTORIAL_STEPS = Object.freeze([
  // 1. La carte
  { id: 'bienvenue', theme: 'carte', title: 'Bienvenue', on: 'ok', next: 'C’est parti ›', targets: [],
    text: 'Une petite partie d’entraînement, en temps réel. Le temps reste en pause pendant les explications. Votre vraie partie n’est pas touchée. « Quitter » à tout moment.' },
  { id: 'defiler', theme: 'carte', title: 'La carte', on: 'pan', targets: [],
    text: 'Arken : 5 nations sur 5 îles. La carte n’a pas de bord : on sort à droite, on revient par la gauche. Deux doigts (ou + / −) pour zoomer.',
    goal: 'Faites glisser la carte du doigt.' },
  { id: 'capitale', theme: 'carte', title: 'Votre capitale', on: 'select:p01', targets: [P('p01')],
    text: 'Vous êtes Valmorne, au nord-ouest. Le chiffre au-dessus d’une ville = les PV de ses troupes ; « ? » = inconnu.',
    goal: 'Touchez Valmorne, votre capitale (★).' },
  // 2. Le temps
  { id: 'date', theme: 'temps', title: 'La date et le temps', on: 'play', targets: ['#rtPlay'],
    text: `En bas à droite : la date. ▶ fait avancer le temps : 1 jour = ${R.clock.msPerDay / 1000} secondes (ici, pour l’entraînement, 1 seconde). ⏩ ×2 est réservé au Premium.`,
    goal: 'Touchez ▶ et regardez la date.' },
  { id: 'pause', theme: 'temps', title: 'La pause', on: 'pause', targets: ['#rtPause'], clock: 'free',
    text: 'Tout se passe en même temps pour toutes les nations. ⏸ arrête le temps ; en pause, vous pouvez tout faire : les ordres partent aussitôt.',
    goal: 'Touchez ⏸.' },
  { id: 'or-vivres', theme: 'temps', title: 'Or et vivres', on: 'food', targets: ['#foodStat'],
    text: `En haut : le trésor et ce qu’il gagne par mois (une province : ${perMonth(R.income.perMonth.province)}). 🌾 Vivres : vos provinces en produisent chaque jour, vos troupes en mangent chaque jour.`,
    goal: 'Touchez la case 🌾 VIVRES.' },
  // 3. Construire
  { id: 'banque', theme: 'construire', title: 'Construire une banque', on: 'build:bank', targets: BUILD('p01', 'bank'),
    text: `Banque : ${B.bank.cost} or, ${D.buildings.bank} jours de chantier, puis +${perMonth(R.income.perMonth.bank)}. Payée tout de suite, le chantier démarre aussitôt.`,
    goal: 'Valmorne → « Construire » → Banque « Vérifier » → « Confirmer ».' },
  { id: 'ferme', theme: 'construire', title: 'La ferme', on: 'build:farm', targets: BUILD('p01', 'farm'),
    text: `Ferme : +${R.food.farmDaily} vivres par jour et par niveau (${R.food.farmMax} niveaux, ${R.food.farmCosts[0]} à ${R.food.farmCosts.at(-1)} or, ${R.food.farmDays} jours chacun).`,
    goal: 'Valmorne → « Construire » → Ferme → « Confirmer ».' },
  { id: 'forteresse', theme: 'construire', title: 'La forteresse', on: 'build:fort', targets: BUILD('p01', 'fort'),
    text: `Forteresse : ses défenseurs reçoivent moins de dégâts (−${fortPct} % au niveau 1, ${D.buildings.fort} jours par niveau). Elle cache aussi vos troupes à l’ennemi.`,
    goal: 'Valmorne → « Construire » → Forteresse → « Confirmer ».' },
  { id: 'usine', theme: 'construire', title: 'L’usine', on: 'build:factory', targets: BUILD('p01', 'factory'),
    text: `Usine : ${B.factory.cost} or, +${perMonth(R.income.perMonth.factory)}. Elle permet de recruter blindés et artillerie, et de construire un ballon.`,
    goal: 'Valmorne → « Construire » → Usine → « Confirmer ».' },
  { id: 'port', theme: 'construire', title: 'Le port', on: 'select:p03', targets: [P('p03')],
    text: `Branvale a un port construit (ancre cerclée d’or) : +${perMonth(R.income.perMonth.port)}, navires de guerre, embarquement. Une ancre seule ⚓ = un point de port où le construire.`,
    goal: 'Touchez Branvale.' },
  // 4. Recruter, envoyer une armée, rappel
  { id: 'recruter', theme: 'armee', title: 'Recruter', on: 'recruit', targets: [CONFIRM, ONCE('[data-lot-plus="infantry"]'), '#confirmRecruit', SHEET('p01', 'recruit'), P('p01')],
    text: `Un lot = ${U.infantry.amount} fantassins pour ${U.infantry.cost} or, prêts en ${D.units.infantry} jours. « ⓘ PV et dégâts » montre la force de chaque troupe.`,
    goal: 'Valmorne → « Recruter » → + sur Infanterie → « Vérifier la commande » → « Confirmer ».' },
  { id: 'envoyer', theme: 'armee', title: 'Envoyer une armée', on: `move:${TUTO_MARCH.from}-${TUTO_MARCH.to}`, targets: MOVE(TUTO_MARCH.from, TUTO_MARCH.to),
    text: 'Les troupes partent tout de suite. Plus la province est loin, plus le trajet est long.',
    goal: 'Valmorne → « Déplacer / Attaquer » → Sylvaren (en vert) → « Envoyer maintenant » → « Confirmer ».' },
  { id: 'avancer', theme: 'armee', title: 'L’armée avance', on: [], clock: 'run', targets: ['#rtPlay'],
    until: s => { const m = watchedMarch(s); return m ? s.day - m.startDay >= TUTO_MARCH.watchDays : !pendingMove(s, TUTO_MARCH.from, TUTO_MARCH.to); },
    text: 'L’icône de char avance d’un pas par jour sur sa flèche. Le chiffre = les jours avant l’arrivée.',
    goal: 'Touchez ▶ et regardez-la avancer.' },
  { id: 'rappel', theme: 'armee', title: 'Le rappel', on: 'recall', targets: ['#rtRecall', '.unit-token.own', P(TUTO_MARCH.to)],
    dynamic: s => recalledOrWatched(s) ? null : { text: 'Votre armée est déjà arrivée. « Rappeler » existe tant qu’une armée est en route : elle fait demi-tour sur place.', targets: [], on: ['ok'], goal: '', next: 'Suivant ›' },
    text: 'Une armée en route peut faire demi-tour : le retour dure le temps déjà parcouru.',
    goal: 'Touchez l’armée sur la carte, puis « Rappeler ».' },
  // 5. Une bataille en 3 assauts
  { id: 'attaquer', theme: 'bataille', title: 'Attaquer', on: `move:${TUTO_BATTLE.attackFrom}-${TUTO_BATTLE.province}`, targets: MOVE(TUTO_BATTLE.attackFrom, TUTO_BATTLE.province),
    text: 'Oroël occupe Haut-Bois. Attaquer une nation, c’est lui déclarer la guerre. La bataille commence à l’arrivée de l’armée.',
    goal: 'Branvale → « Déplacer / Attaquer » → Haut-Bois → « Envoyer maintenant » → « Confirmer ».' },
  { id: 'renfort', theme: 'bataille', title: 'Un renfort', on: `move:${TUTO_BATTLE.reinforceFrom}-${TUTO_BATTLE.province}`, targets: MOVE(TUTO_BATTLE.reinforceFrom, TUTO_BATTLE.province),
    text: 'Une armée qui arrive pendant une bataille la rejoint au prochain assaut. Sylvaren est plus loin : elle arrivera après.',
    goal: 'Sylvaren → « Déplacer / Attaquer » → Haut-Bois → « Envoyer maintenant » → « Confirmer ».' },
  { id: 'marche', theme: 'bataille', title: 'En marche', on: [], clock: 'run', targets: ['#rtPlay'],
    until: s => Boolean(battleAt(s)) || takenBattle(s) || (!ownMarches(s, TUTO_BATTLE.province).length && !pendingMove(s, null, TUTO_BATTLE.province)),
    text: 'Vos armées marchent vers Haut-Bois. Oroël les voit venir : une armée en marche est visible depuis sa province d’arrivée.',
    goal: 'Touchez ▶ jusqu’au premier assaut.' },
  { id: 'bataille', theme: 'bataille', title: 'La bataille', on: 'battle-open', targets: ['.rt-battle.mine', P(TUTO_BATTLE.province)],
    dynamic: s => battleAt(s) ? null : { text: 'Pas de bataille en cours à Haut-Bois. Une bataille dure au plus 3 assauts ; la fiche ⚔ montre chaque assaut et le bouton « Retraite ».', targets: [], on: ['ok'], goal: '', next: 'Suivant ›' },
    text: `Une bataille = ${R.battle.assaults} assauts, un tous les ${R.battle.assaultEveryDays} jours. « Retraite » ramène vos troupes tout de suite. Le défenseur, lui, ne peut pas quitter la province.`,
    goal: 'Touchez ⚔ sur Haut-Bois.' },
  { id: 'assauts', theme: 'bataille', title: 'Les assauts', on: [], clock: 'run', targets: ['#rtPlay'],
    until: s => !battleAt(s),
    text: `Après le ${R.battle.assaults}e assaut sans prise, l’attaquant se replie. Prise = la province change de main tout de suite.`,
    goal: 'Fermez la fiche (×), puis touchez ▶ et suivez la bataille jusqu’au bout.' },
  { id: 'issue', theme: 'bataille', title: 'Fin de la bataille', on: 'ok', next: 'Suivant ›', targets: [P(TUTO_BATTLE.province)],
    dynamic: s => takenBattle(s) ? { text: 'Haut-Bois est à vous : la province change de main dès l’assaut gagnant. Ses bâtiments sont gardés ; une production qui y était en cours est perdue (remboursée).' }
      : { text: 'La défense a tenu : vos survivants rentrent par la route. Le Journal garde le récit de chaque assaut.' },
    text: '' },
  { id: 'journal', theme: 'bataille', title: 'Alertes et journal', on: 'journal-closed', targets: ['#journalDialog .primary', '#journalBtn'],
    text: 'Les bandeaux en haut annoncent ce qui arrive (attaque, prise, proposition) : le temps ne s’arrête pas pour eux. Le Journal garde tout.',
    goal: 'Touchez « Journal », lisez, puis « Retour à la carte ».' },
  { id: 'famine', theme: 'vivres', title: 'La famine', on: 'ok', next: 'Suivant ›', targets: ['#foodStat'],
    text: `Vivres à 0 : famine. Vos troupes font ${100 - Math.round(R.food.famineFireFactor * 100)} % de dégâts en moins et ${R.food.famineDesertPct} % de l’armée déserte chaque jour. Un bandeau prévient ${R.food.alertDays} jours avant.` },
  // 6. La mer, le ballon
  { id: 'mer', theme: 'mer', title: 'La mer et les convois', on: 'move-sea', targets: [CONFIRM, '#confirmMove', DEST(TUTO_SEA.to), SHEET(TUTO_SEA.from, 'move'), P(TUTO_SEA.from)],
    text: `Depuis un point de port, on embarque : ${D.sea} jours de mer environ vers l’île voisine (${D.islandSea} vers l’île mystérieuse). Les navires de guerre escortent ; un convoi peut être intercepté.`,
    goal: 'Branvale → « Déplacer / Attaquer » → Nordhème (de l’autre côté de la mer, à l’est) → « Envoyer maintenant » → « Confirmer ».' },
  { id: 'ballon', theme: 'mer', title: 'Le ballon d’observation', on: 'balloon-send', targets: [ONCE('[data-balloon-to]:not(:disabled)'), '[data-balloon].own', P('p01')],
    text: `Le ballon 🎈 (usine, ${RULES.balloon.cost} or) vole d’île en île (${D.balloonHop} jours) et montre tout de l’île survolée. La nation survolée peut l’abattre.`,
    goal: 'Touchez 🎈 sur la carte, puis « Envoyer » vers une nation.' },
  // 7. Diplomatie
  { id: 'diplomatie', theme: 'diplomatie', title: 'Proposer une alliance', on: `alliance:${TUTO_ALLY}`, targets: [CONFIRM, '[data-diplo="alliance"]:not(:disabled)', SHEET('p05', 'diplo'), P('p05')],
    dynamic: s => alliancePlanned(s) || alliedWithAlly(s) ? { text: 'Proposition déjà envoyée à Roc-Épine.', targets: [], on: ['ok'], goal: '', next: 'Suivant ›' } : null,
    text: 'Un allié ne vous attaque pas et vous laisse passer chez lui. Il répond selon son caractère, à sa prochaine décision.',
    goal: 'Touchez Roc-Épine (île du sud-ouest) → « Diplomatie » → « Proposer une alliance ».' },
  { id: 'reponse', theme: 'diplomatie', title: 'La réponse', on: [], clock: 'run', targets: ['#rtPlay'],
    until: s => !awaitingAlly(s),
    text: `Une IA répond en quelques jours (${R.diplomacy.aiAnswerMaxDays} au plus) : « ⏳ En attente de réponse » d’ici là.`,
    goal: 'Touchez ▶ et attendez la réponse.' },
  { id: 'reponse-lue', theme: 'diplomatie', title: 'Roc-Épine a répondu', on: 'ok', next: 'Suivant ›', targets: [],
    dynamic: s => alliedWithAlly(s) ? { text: 'Roc-Épine accepte : vous êtes alliés. Passage libre chez lui, et vous pouvez lui demander de l’aide (Diplomatie).' }
      : { text: 'Roc-Épine refuse pour l’instant. Un refus se retient : redemander trop tôt agace.' },
    text: '' },
  // 8. L'île mystérieuse
  { id: 'ile', theme: 'ile', title: 'L’île mystérieuse', on: `select:${MYSTERY_ISLAND_ID}`, targets: [P(MYSTERY_ISLAND_ID)],
    text: 'Au centre, une garnison neutre garde une super banque. Qui la prend gagne aussi un 2e ballon, et son phare 🗼 lui montre toute flotte qui s’approche de l’île.',
    goal: 'Touchez l’île mystérieuse, au centre.' },
  // 9. Classement, fin de partie, 🎁
  { id: 'classement', theme: 'fin', title: 'Le classement 🏆', on: 'ranking', targets: ['#rankBtn'],
    text: `Points : ${R.ranking.province} par province, +${R.ranking.capital} par capitale, et des points pour les troupes, le trésor et les jours sans famine. Mis à jour tous les ${R.ranking.refreshEveryDays} jours.`,
    goal: 'Touchez 🏆 Classement.' },
  { id: 'fin', theme: 'fin', title: 'La fin de la partie', on: 'ok', next: 'Suivant ›', targets: [],
    text: `15 ans de jeu (environ 3 h) : le 31 décembre 2041, le classement 🏆 désigne le vainqueur. Avant : qui tient les 5 capitales (ou reste seul) gagne ; toutes les nations alliées et en paix ${R.end.peaceDays} jours : la fin vous est proposée.` },
  { id: 'cadeau', theme: 'fin', title: 'La 🎁', on: 'ok', next: 'Suivant ›', targets: [],
    text: `Dans une vraie partie, une 🎁 apparaît parfois à gauche de la carte : une courte pub, si vous voulez, contre un mois de revenus (${R.ads.rewardMinGold} or au moins). Jamais dans ce tutoriel.` },
  { id: 'bravo', theme: 'fin', title: 'Tutoriel terminé !', on: 'ok', next: 'Terminer', action: 'finish', targets: [],
    text: 'Vous connaissez les règles. Les stratégies, c’est à vous de les trouver ! « Terminer » vous ramène à l’accueil : votre vraie partie vous attend, intacte.' }
]);
/** Ordre pédagogique : chaque thème apparaît dans cet ordre, sans retour en arrière. */
export const TUTORIAL_THEMES = Object.freeze(['carte', 'temps', 'construire', 'armee', 'bataille', 'vivres', 'mer', 'diplomatie', 'ile', 'fin']);
/** Étapes « regarder » (le temps tourne). */
export const isRunStep = index => TUTORIAL_STEPS[index]?.clock === 'run';
/** ▶ est-il accepté à cette étape ? (étapes « regarder », celle qui apprend ▶ et la suivante, qui apprend ⏸) */
export const tutorialAllowsPlay = index => ['run', 'free'].includes(TUTORIAL_STEPS[index]?.clock) || TUTORIAL_STEPS[index]?.on === 'play';
/** Le temps doit-il être arrêté en arrivant sur cette étape ? (toutes, sauf la pause qui suit ▶) */
export const tutorialPausesAt = index => TUTORIAL_STEPS[index]?.clock !== 'free';

/** Étape à afficher : textes, cibles et événements adaptés à ce qui s'est vraiment passé dans la partie. */
export function tutorialStepView(index, state = null) {
  const step = TUTORIAL_STEPS[index];
  if (!step) return null;
  const base = { ...step, index, total: TUTORIAL_STEPS.length, on: [].concat(step.on), progress: `Étape ${index + 1}/${TUTORIAL_STEPS.length}` };
  const extra = state && step.dynamic ? step.dynamic(state) || {} : {};
  return { ...base, ...extra, on: extra.on ? [].concat(extra.on) : base.on };
}
/** Index suivant après l'événement `event` (inchangé s'il ne concerne pas l'étape ; null = tutoriel terminé). */
export function tutorialAdvance(index, event, state = null) {
  const step = TUTORIAL_STEPS[index];
  if (!step) return null;
  // Le geste de l'étape est toujours accepté (même si la partie a changé entre-temps), ainsi que celui de sa variante.
  if (![].concat(step.on).includes(event) && !tutorialStepView(index, state).on.includes(event)) return index;
  return index + 1 < TUTORIAL_STEPS.length ? index + 1 : null;
}
/** Étape « regarder » terminée ? (ce qu'on attendait est arrivé dans la partie) */
export const tutorialWaitDone = (index, state) => Boolean(isRunStep(index) && state && TUTORIAL_STEPS[index].until(state));
/** Conseil (toast) quand le geste est presque le bon, sinon ''. */
export function tutorialHint(index, event) {
  const step = TUTORIAL_STEPS[index];
  if (!step || event === 'ok') return '';
  if (event === 'play' && !tutorialAllowsPlay(index)) return 'Tutoriel : le temps reste en pause pendant cette explication.';
  if (event === 'fast') return 'Dans une vraie partie, ⏩ ×2 est réservé au Premium. Ici, le temps va déjà à 1 jour par seconde.';
  if (/^move:/.test(event) && /^move:/.test([].concat(step.on)[0] || '') && event !== step.on) return 'Ce n’est pas le trajet demandé : regardez l’objectif de la bulle.';
  return '';
}
/** Événement(s) d'un ordre de déplacement confirmé (pour le tutoriel) : type de route, puis trajet exact. */
export function moveEvents({ routeType, fromId, toId }) {
  return [routeType === 'sea' ? 'move-sea' : 'move-land', `move:${fromId}-${toId}`];
}
/** Durée de la marche d'attaque du scénario (affichée dans les tests). */
export const tutorialAttackDays = attackDays;
/** Premier sélecteur dont l'élément est visible (fonction `isVisible(selector)` fournie par l'interface). */
export const firstVisibleTarget = (targets, isVisible) => (targets || []).find(sel => { try { return isVisible(sel); } catch { return false; } }) || null;
/** Bulle en haut ou en bas : jamais sur la cible (centre de la cible dans la moitié basse → bulle en haut). */
export const bubblePlacement = (rect, viewportHeight) => rect && rect.height > 0 && (rect.top + rect.height / 2) > viewportHeight * .5 ? 'top' : 'bottom';
