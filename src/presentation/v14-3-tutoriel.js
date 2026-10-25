// V14.3 — Tutoriel facultatif et rejouable (docs/V14-cahier-des-charges.md, section 2 point 9). Fonctions pures, sans DOM.
//
// Principe : une PARTIE D'ENTRAÎNEMENT à part, au scénario fixe (graine, carte et forces réglées à l'avance), jouée
// avec le vrai moteur (src/domain/). Chaque étape avance quand le joueur fait VRAIMENT le geste demandé.
//  - Sauvegarde DISTINCTE : `frontieres-arken-tutoriel-save`. La clé de la vraie partie
//    (SAVE_KEY) n'est jamais lue ni écrite par le tutoriel.
//  - Proposé une fois au premier lancement (Jouer le tutoriel / Passer) ; rejouable depuis l'accueil et ⚙ Paramètres.
//  - Il prolonge le mini tuto de la V13.4 (5 gestes de base) : même bulle, mêmes gestes, puis la suite du jeu
//    (journal, constructions, tension, alliance et aide, mer, rapports, classement). Tutoriel terminé = mini tuto vu.
import { createGameState } from '../state/create-game-state.js';
import { setTension } from '../domain/leaders.js';
import { RULES } from '../domain/constants.js';
import { HELP_TURNS } from '../domain/alliances.js';
import { HOSTILITY_WARNING, HOSTILITY_WAR, TALK_TENSION } from '../domain/leaders.js';
import { SAVE_KEY } from './v4-ux.js';

export const TUTO_SAVE_KEY = 'frontieres-arken-tutoriel-save';
export const TUTO_OFFER_KEY = 'frontieres-arken-tutoriel-propose';
export const TUTO_SEED = 'tutoriel-v14-3';
export const TUTO_NATION = 'valmorne';
/** Seule nation dirigée par l'IA dans le tutoriel : le futur allié (il répond vraiment, selon son caractère). */
export const TUTO_ALLY = 'roc-epine';
/** Nation qu'on provoque, puis qu'on attaque par la mer. Elle reste passive (aucun ordre) : le tutoriel reste jouable. */
export const TUTO_RIVAL = 'oroel';
export const TUTO_START_TENSION = 60;
/** Débarquement « réussi à coup sûr » dans ce scénario (vérifié par les tests) : escorte et troupes minimales. */
export const TUTO_LANDING = Object.freeze({ from: 'p03', to: 'p14', minWarships: 2, minTroops: 60 });

const inc = RULES.baseIncome, bank = RULES.bankIncome, hostile = TALK_TENSION.hostile, landingPct = Math.round(RULES.combat.landingPenalty * 100);

/**
 * Partie d'entraînement : Valmorne (joueur) ; Roc-Épine dirigé par l'IA ; les trois autres nations restent passives.
 * Réglages : tension de départ avec Oroël à 60 % (« hostile ») ; à Branvale (p03) un port construit, 3 navires de guerre
 * et 160 fantassins + 10 cavaliers prêts à embarquer ; en face, Nordhème (p14, Oroël) a un port et 1 navire.
 */
export function createTutorialState({ map }) {
  const s = createGameState({ map, playerNationId: TUTO_NATION, seed: TUTO_SEED });
  for (const id of Object.keys(s.nations)) s.controllers[id] = id === TUTO_NATION ? 'human' : id === TUTO_ALLY ? 'ai' : 'human';
  // Caractère du futur allié fixé (graine fixe : chaque étape doit être réalisable) ; il reste caché au joueur.
  s.leaders = { [TUTO_ALLY]: { archetype: 'heros', revealed: false } };
  s.ai.traits = { [TUTO_ALLY]: 'fidele' };
  setTension(s, TUTO_NATION, TUTO_RIVAL, TUTO_START_TENSION);
  const br = s.provinces.p03; br.buildings.port = 1; br.warships = 3; br.units.infantry = 160; br.units.cavalry = 10;
  const no = s.provinces.p14; no.buildings.port = 1; no.warships = 1;
  s.events = []; // l'installation du scénario n'apparaît pas au journal
  s.settings.hints = false; // pas de bulles contextuelles par-dessus le tutoriel
  s.tutorialMode = true;
  s.tutorialRun = { step: 0, startedTurn: 1 };
  return s;
}
export const isTutorial = state => Boolean(state?.tutorialMode);
/** Clé de sauvegarde à utiliser pour cette partie : jamais celle de la vraie partie pour le tutoriel. */
export const saveKeyFor = state => isTutorial(state) ? TUTO_SAVE_KEY : SAVE_KEY;

// --- Stockage (tolérant : navigation privée, stockage plein) ------------------------------------------------------
const safeGet = (storage, key) => { try { return storage?.getItem(key) ?? null; } catch { return null; } };
const safeSet = (storage, key, value) => { try { storage?.setItem(key, value); return true; } catch { return false; } };
const safeDel = (storage, key) => { try { storage?.removeItem(key); } catch { /* stockage indisponible */ } };
/** Écrit la partie sous SA clé (tutoriel ou vraie partie). `encode` = encodeSave. */
export function storeGame(state, encode, storage = globalThis.localStorage) { return state ? safeSet(storage, saveKeyFor(state), encode(state)) : false; }
/** Partie de tutoriel en cours (ou null). `decode` = decodeSave. */
export function loadTutorial(decode, storage = globalThis.localStorage) {
  const raw = safeGet(storage, TUTO_SAVE_KEY);
  if (!raw) return null;
  try { const s = decode(raw); return isTutorial(s) ? s : null; } catch { return null; }
}
export const clearTutorial = (storage = globalThis.localStorage) => safeDel(storage, TUTO_SAVE_KEY);
/** Proposé une seule fois au premier lancement (« Jouer le tutoriel » ou « Passer »). */
export const tutorialOffered = (storage = globalThis.localStorage) => safeGet(storage, TUTO_OFFER_KEY) !== null;
export const markTutorialOffered = (storage = globalThis.localStorage, value = 'propose') => safeSet(storage, TUTO_OFFER_KEY, value);
export const tutorialCompleted = (storage = globalThis.localStorage) => safeGet(storage, TUTO_OFFER_KEY) === 'termine';

// --- Étapes ---------------------------------------------------------------------------------------------------------
// `on` : événement(s) de l'interface qui font avancer l'étape (geste réel) ; 'ok' = bouton de la bulle.
// `targets` : ce qu'il faut toucher, du plus précis au plus général : la bulle surligne le PREMIER élément visible.
// Événements émis par app.js : select:<province>, move-land, landing-escorted, landing-weak, unit-info, recruit, build,
// end-turn, journal-closed, diplomacy:<nation>, talk-hostile:<nation>, alliance:<nation>, help, ok.
const P = id => `[data-id="${id}"]`;
/** Province proposée en vert pendant un déplacement (destination légale). */
const DEST = id => `.province.destination[data-id="${id}"]`;
/** Bouton de la fiche ouverte sur CETTE province (la fiche porte data-province). */
const SHEET = (id, action) => `#provinceSheet[data-province="${id}"] [data-sheet-action="${action}"]`;
const CONFIRM = '#acceptConfirmation';
/** Un bouton déjà touché pendant l'étape reçoit .tuto-done : on surligne alors le suivant. */
const ONCE = sel => `${sel}:not(.tuto-done)`;
export const TUTORIAL_STEPS = Object.freeze([
  // Tour 1 — carte, provinces, déplacement, fin du tour, journal
  { id: 'bienvenue', theme: 'carte', title: 'Bienvenue dans le tutoriel', on: 'ok', next: 'C’est parti ›', targets: [],
    text: 'Une partie d’entraînement de 8 tours : vous apprenez en jouant. Votre vraie partie n’est pas touchée. « Quitter » à tout moment.' },
  { id: 'carte', theme: 'carte', title: 'La carte et vos provinces', on: 'select:p01', targets: [P('p01')],
    text: `Arken : 5 nations sur 5 îles. Vous êtes Valmorne, au nord-ouest (liseré bleu). Chaque province rapporte ${inc} or par tour.`,
    goal: 'Touchez Valmorne, votre capitale (★).' },
  { id: 'deplacer', theme: 'deplacer', title: 'Déplacer des troupes', on: 'move-land', targets: [CONFIRM, '#confirmMove', DEST('p02'), SHEET('p01', 'move'), P('p01')],
    text: 'Sur la fiche : « Déplacer / Attaquer », puis une province verte (Sylvaren), puis « Ajouter cet ordre » et « Confirmer ».',
    goal: 'Envoyez des troupes de Valmorne à Sylvaren.' },
  { id: 'fin-tour', theme: 'tour', title: 'La fin du tour', on: 'end-turn', targets: ['#confirmEndTurn', '#nextTurn'],
    text: 'Rien ne bouge avant la fin du tour : vos ordres et ceux des autres nations se jouent alors tous en même temps.',
    goal: 'Touchez « Fin du tour », puis « Verrouiller et résoudre ».' },
  { id: 'journal', theme: 'tour', title: 'Le journal', on: 'journal-closed', targets: ['#journalDialog .primary'],
    text: 'Le journal résume le tour : vos revenus (+18 or), les messages, les combats. L’onglet « Historique » garde tout.',
    goal: 'Lisez-le, puis « Retour à la carte ».' },
  // Tour 2 — recrutement (ⓘ PV et dégâts), constructions et revenus
  { id: 'recruter-info', theme: 'recruter', title: 'Recruter : PV et dégâts', on: 'unit-info', targets: ['[data-unit-info="infantry"]', SHEET('p01', 'recruit'), P('p01')],
    text: 'Sur la fiche de Valmorne : « Recruter ». Chaque troupe a ses points de vie (PV) et ses dégâts par assaut.',
    goal: 'Touchez « Infanterie ⓘ PV et dégâts ».' },
  { id: 'recruter', theme: 'recruter', title: 'Recruter par lots', on: 'recruit', targets: [CONFIRM, ONCE('[data-lot-plus="infantry"]'), '#confirmRecruit', '[data-unit-info="infantry"]', SHEET('p01', 'recruit'), P('p01')],
    text: `Un lot d’infanterie = ${RULES.units.infantry.amount} fantassins pour ${RULES.units.infantry.cost} or, livrés au tour suivant. Ouvrir le détail ne recrute jamais.`,
    goal: 'Ajoutez 1 lot avec +, puis « Vérifier la commande » et « Confirmer ».' },
  { id: 'construire', theme: 'construire', title: 'Construire pour gagner plus', on: 'build', targets: [CONFIRM, '[data-build="bank"]', SHEET('p01', 'build'), P('p01')],
    text: `Une banque coûte ${RULES.buildings.bank.cost} or, est livrée en ${RULES.buildings.bank.turns} tours, puis rapporte +${bank} or par tour (l’usine aussi, et elle permet blindés et artillerie).`,
    goal: 'Fiche de Valmorne : « Construire » → Banque « Vérifier » → « Confirmer ».' },
  { id: 'fin-tour-2', theme: 'tour', title: 'Payé maintenant, livré plus tard', on: 'end-turn', targets: ['#confirmEndTurn', '#nextTurn'],
    text: 'L’or est payé tout de suite ; le lot arrive au prochain tour, la banque dans 3 tours.',
    goal: 'Terminez le tour.' },
  // Tour 3 — diplomatie : messages, tension, avertissement à 70 %
  { id: 'diplomatie', theme: 'diplomatie', title: 'Diplomatie et tension', on: 'diplomacy:oroel', targets: [SHEET('p14', 'diplo'), P('p14')],
    text: `La tension avec Oroël est déjà à ${TUTO_START_TENSION} % (« hostile »). Dès ${HOSTILITY_WARNING} % : avertissement. À ${HOSTILITY_WAR} % : guerre déclarée automatiquement.`,
    goal: 'Touchez Nordhème (Oroël, île du nord-est), puis « Diplomatie ».' },
  { id: 'message', theme: 'diplomatie', title: 'Un message public', on: 'talk-hostile:oroel', targets: ['#talkSend:not(:disabled)', '[data-tone="hostile"]', '#nationTalk', SHEET('p14', 'diplo'), P('p14')],
    text: `Vous choisissez un ton, le texte est écrit pour vous. Amical : la tension baisse. Hostile : elle monte (+${hostile} % en général).`,
    goal: '« ✉ Échanger publiquement » → ton Hostile → « Envoyer ».' },
  { id: 'fin-tour-3', theme: 'diplomatie', title: 'L’avertissement', on: 'end-turn', targets: ['#confirmEndTurn', '#nextTurn'],
    text: `Le message part à la fin du tour. Au-delà de ${HOSTILITY_WARNING} %, le journal affiche « ⚠ HOSTILITÉ » : c’est le dernier avertissement.`,
    goal: 'Terminez le tour et lisez le journal.' },
  // Tour 4 — alliance, guerre automatique à 85 %
  { id: 'alliance', theme: 'alliance', title: 'Proposer une alliance', on: ['alliance:roc-epine'], targets: [CONFIRM, '[data-diplo="alliance"]:not(:disabled)', SHEET('p05', 'diplo'), P('p05')],
    text: 'Un allié ne vous attaque pas, vous laisse passer chez lui (passage libre) et peut venir vous aider. Il accepte selon son caractère.',
    goal: 'Touchez Roc-Épine (île du sud-ouest) → « Diplomatie » → « Proposer une alliance ».' },
  { id: 'guerre', theme: 'diplomatie', title: 'La guerre automatique', on: 'talk-hostile:oroel', targets: ['#talkSend:not(:disabled)', '[data-tone="hostile"]', '[data-talk-nation="oroel"]', '#talkBtn'],
    text: `Après l’avertissement, si la tension atteint ${HOSTILITY_WAR} %, la guerre est déclarée à la fin du tour, pour vous comme pour les IA.`,
    goal: 'Bouton « Échanges » → Oroël → ton Hostile → « Envoyer ».' },
  { id: 'fin-tour-4', theme: 'diplomatie', title: 'Alliance et guerre', on: 'end-turn', targets: ['#confirmEndTurn', '#nextTurn'],
    text: 'Le journal dira si Roc-Épine accepte l’alliance, et « ⚔ GUERRE DÉCLARÉE » avec Oroël. Une alliance ou une trêve protège de la guerre automatique.',
    goal: 'Terminez le tour.' },
  // Tour 5 — aide d'un allié, la mer (port, transport, débarquement)
  { id: 'aide', theme: 'alliance', title: 'Demander de l’aide', on: 'help', targets: ['[data-help="defend"][data-target="oroel"]', '#askHelp', SHEET('p05', 'diplo'), P('p05')],
    text: `Gratuit. L’allié répond à la fin du tour. S’il accepte, ses troupes font la route, puis vous aident ${HELP_TURNS} tours sur place.`,
    goal: 'Diplomatie de Roc-Épine → « 🤝 Demander de l’aide » → « Contre Oroël ».' },
  { id: 'port', theme: 'mer', title: 'Les ports', on: 'select:p03', targets: [P('p03')],
    text: 'Une ancre ⚓ = un point de port : on y embarque. Un port construit (ancre cerclée d’or) permet aussi d’avoir des navires de guerre.',
    goal: 'Touchez Branvale : port construit, 3 navires à quai.' },
  { id: 'debarquer', theme: 'mer', title: 'Transport et débarquement', on: 'landing-escorted', targets: [CONFIRM, ONCE('[data-preset="100"]'), '#confirmMove', DEST('p14'), SHEET('p03', 'move'), P('p03')],
    text: `Par la mer : ${2} tours de traversée, puis débarquement (vos troupes frappent à ${landingPct} %). Sans navires d’escorte, un convoi intercepté ne se défend pas.`,
    goal: '« Déplacer / Attaquer » → Nordhème → « 100 % » (troupes et navires) → « Ajouter cet ordre » → « Confirmer ».',
    hints: { 'landing-weak': `Pour ce tutoriel, il faut au moins ${TUTO_LANDING.minWarships} navires et ${TUTO_LANDING.minTroops} soldats : touchez la flèche de l’ordre pour l’annuler, puis recommencez avec « 100 % ».` } },
  { id: 'fin-tour-5', theme: 'mer', title: 'En mer', on: 'end-turn', targets: ['#confirmEndTurn', '#nextTurn'],
    text: 'Le convoi ⛵ part (le chiffre = tours restants). La flotte du port de Nordhème peut l’intercepter : votre escorte le protège.',
    goal: 'Terminez le tour.' },
  { id: 'fin-tour-6', theme: 'mer', title: 'Le débarquement', on: 'end-turn', targets: ['#confirmEndTurn', '#nextTurn'],
    text: 'Deuxième tour en mer : le convoi arrive et débarque à Nordhème à la fin de ce tour.',
    goal: 'Terminez encore le tour.' },
  // Tour 7 — rapport de conquête, navires blessés
  { id: 'rapport', theme: 'rapport', title: 'Le rapport de conquête', on: 'journal-closed', targets: ['#journalDialog .primary'],
    text: 'Le rapport donne les forces engagées, les pertes, puis (après un saut de ligne) les PV perdus, blessés compris. Il rappelle le débarquement à 85 %.',
    textIfFailed: 'Le débarquement a été repoussé : le rapport donne les forces engagées et les pertes. Les survivants rentrent par la mer.',
    goal: 'Lisez le rapport, puis « Retour à la carte ».' },
  { id: 'reparation', theme: 'mer', title: 'Navires blessés', on: 'select:p14', targets: [P('p14')],
    text: 'Des navires blessés sont « en convalescence ». Dans un port construit, ils retrouvent 100 % des PV en 3 à 5 tours ; ailleurs, 5 % par tour.',
    textIfFailed: 'Vos navires sont rentrés à Branvale. Blessés, ils retrouvent 100 % des PV en 3 à 5 tours dans ce port construit.',
    targetsIfFailed: [P('p03')], onIfFailed: 'select:p03',
    goal: 'Touchez Nordhème : la fiche montre leurs PV et les tours restants.' },
  { id: 'fin-tour-7', theme: 'alliance', title: 'Les renforts arrivent', on: 'end-turn', targets: ['#confirmEndTurn', '#nextTurn'],
    text: 'Roc-Épine a accepté de vous aider : ses troupes sont en route. Le journal annoncera leur arrivée (« 🤝 PASSAGE »).',
    goal: 'Terminez le tour.' },
  // Tour 8 — aide sur place, fin de partie et classement
  { id: 'renforts', theme: 'alliance', title: 'L’aide sur place', on: 'select:p02', targets: [P('p02')], dynamic: 'ally-guests',
    text: `Les renforts alliés stationnent chez vous et défendent la province pendant ${HELP_TURNS} tours, puis rentrent chez eux.`,
    textIfAbsent: `Les renforts de Roc-Épine ne sont pas encore chez vous (le trajet est une estimation). Arrivés, ils défendent votre province ${HELP_TURNS} tours.`,
    goal: 'Touchez {p} : « Renforts Roc-Épine stationnés ici ».' },
  { id: 'fin', theme: 'fin', title: 'Fin de partie et classement', on: 'ok', next: 'Voir le classement ›', action: 'ranking', targets: [],
    text: `Une partie dure ${RULES.gameLength} tours. Victoire immédiate : tenir les 5 capitales. Sinon, classement : provinces, puis capitales, puis or.` },
  { id: 'bravo', theme: 'fin', title: 'Tutoriel terminé !', on: 'ok', next: 'Terminer', action: 'finish', targets: [],
    text: 'Bravo ! Vous connaissez l’essentiel. « Terminer » vous ramène à l’accueil : votre vraie partie vous attend, intacte.' }
]);
/** Ordre pédagogique demandé (cahier V14.3) : chaque thème apparaît dans cet ordre, sans retour en arrière sauf le « tour ». */
export const TUTORIAL_THEMES = Object.freeze(['carte', 'deplacer', 'tour', 'recruter', 'construire', 'diplomatie', 'alliance', 'mer', 'rapport', 'fin']);

const stepOn = (step, failed) => [].concat(failed && step.onIfFailed ? step.onIfFailed : step.on);
/** Le débarquement du tutoriel a-t-il échoué (Nordhème pas prise) ? Change le texte de deux étapes, jamais la règle. */
export const landingFailed = state => Boolean(state && state.turn >= 7 && state.provinces?.[TUTO_LANDING.to]?.ownerId !== state.playerNationId);
/** Étape à afficher : textes et cibles adaptés à ce qui s'est vraiment passé dans la partie. */
/** Province du joueur où stationnent les renforts de l'allié (ou null) : lue dans la partie, jamais supposée. */
export function allyGuestProvince(state, map = null) {
  const e = (state?.stationed || []).find(x => x.nationId === TUTO_ALLY && state.provinces?.[x.provinceId]?.ownerId === state.playerNationId);
  return e ? { id: e.provinceId, name: map?.provinces?.find(p => p.id === e.provinceId)?.name || e.provinceId } : null;
}
function dynamicStep(step, state, map) {
  if (step.dynamic !== 'ally-guests') return null;
  const g = allyGuestProvince(state, map);
  if (!g) return { text: step.textIfAbsent, targets: [], on: ['ok'], goal: '', next: 'Suivant ›' };
  return { targets: [P(g.id)], on: [`select:${g.id}`], goal: step.goal.replace('{p}', g.name) };
}
export function tutorialStepView(index, state = null, map = null) {
  const step = TUTORIAL_STEPS[index];
  if (!step) return null;
  const failed = landingFailed(state);
  const base = { ...step, index, total: TUTORIAL_STEPS.length, text: failed && step.textIfFailed ? step.textIfFailed : step.text,
    targets: failed && step.targetsIfFailed ? step.targetsIfFailed : step.targets, on: stepOn(step, failed), progress: `Étape ${index + 1}/${TUTORIAL_STEPS.length}` };
  return { ...base, ...(state ? dynamicStep(step, state, map) || {} : {}) };
}
/** Index suivant après l'événement `event` (inchangé s'il ne concerne pas l'étape ; null = tutoriel terminé). */
export function tutorialAdvance(index, event, state = null, map = null) {
  const step = TUTORIAL_STEPS[index];
  if (!step) return null;
  if (!tutorialStepView(index, state, map).on.includes(event)) return index;
  return index + 1 < TUTORIAL_STEPS.length ? index + 1 : null;
}
/** Conseil (toast) quand le geste est presque le bon (ex. débarquement sans assez d'escorte), sinon ''. */
export const tutorialHint = (index, event) => TUTORIAL_STEPS[index]?.hints?.[event] || '';
/** Événement d'un ordre de déplacement confirmé (pour le tutoriel). */
export function moveEvent({ routeType, attack, toId, units = {}, warships = 0 }) {
  const troops = Object.values(units).reduce((n, v) => n + (Number(v) || 0), 0);
  if (routeType !== 'sea') return 'move-land';
  if (!attack || toId !== TUTO_LANDING.to) return 'move-sea';
  return warships >= TUTO_LANDING.minWarships && troops >= TUTO_LANDING.minTroops ? 'landing-escorted' : 'landing-weak';
}
/** Premier sélecteur dont l'élément est visible (fonction `isVisible(selector)` fournie par l'interface). */
export const firstVisibleTarget = (targets, isVisible) => (targets || []).find(sel => { try { return isVisible(sel); } catch { return false; } }) || null;
/** Bulle en haut ou en bas : jamais sur la cible (centre de la cible dans la moitié basse → bulle en haut). */
export const bubblePlacement = (rect, viewportHeight) => rect && rect.height > 0 && (rect.top + rect.height / 2) > viewportHeight * .5 ? 'top' : 'bottom';
