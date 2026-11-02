// V14.4 (retour de Jack, 29/10 : « moins de phrases préécrites répétées ») — répliques COMPOSÉES.
// Module PUR : aucun DOM, aucun réseau, aucun LLM (règle « 0 € de fonctionnement »), aucun hasard non graine.
//
// Une réplique = OUVERTURE (selon le trait du dirigeant et le ton) + FOND (la réplique de situation de talk.js, déjà
// remplie) + CONTEXTE RÉEL (tour, relation, provinces qui se font face, troupes visibles, nombre de provinces) +
// parfois une CHUTE (selon le trait). Le tirage est déterministe (graine de la partie + clés, comme pickFrom).
//
// Mémoire anti-répétition, par dirigeant et par partie : state.talkMemory[nation] = { said: [empreintes des textes
// publiés], cores: [[empreinte du fond, tour], …] }. Un texte déjà publié par ce dirigeant n'est JAMAIS redit tant qu'il
// existe une autre combinaison. Absente d'une ancienne sauvegarde : créée au premier message (rien d'autre ne change).
//
// Brouillard de guerre respecté : un nombre de troupes n'est cité que pour une province que l'auteur ET le destinataire
// voient (vision.js) ; provinces, nombre de provinces, tour, guerre, alliance, trêve et tension sont publics entre eux.
import { gameLengthOf, scaleTurn } from './game-length.js';
import { chance, archetypeOf, atWar, treatyOf, getTension } from './leaders.js';
import { visibleProvinces } from './vision.js';
import { hashString } from './profile.js';

export const SAID_MEMORY = 400;     // textes retenus par dirigeant (une partie de 80 tours en publie bien moins)
export const CORE_MEMORY = 40;      // fonds retenus par dirigeant (anti-répétition du fond, en plus des 6 derniers messages)
export const COMPOSED_MAX = 250;    // longueur maximale (téléphone) : la chute saute si le message serait trop long

// --- Fragments ------------------------------------------------------------------------------------------------
// Trait : conquerant, heros, batisseur, traitre ; « joueur » = la nation humaine (pas de trait). Aucun nom propre
// (le fond nomme déjà le destinataire), apostrophes typographiques, espace avant « ? ! : ».
const OPENINGS = Object.freeze({
  conquerant: {
    hostile: ['Écoutez bien.', 'Soyons brefs.', 'Je ne le répéterai pas.', 'Assez de mots.', 'Voici ma réponse.', 'Retenez ceci.'],
    neutre: ['Soit.', 'Je vous écoute.', 'Parlons franchement.', 'Allons droit au but.', 'Je prends note.', 'Bien.'],
    amical: ['Pour une fois, soit.', 'Je vous accorde ceci.', 'Voilà qui est sage.', 'Vous me plaisez, aujourd’hui.', 'Cela me convient.', 'Bien parlé.']
  },
  heros: {
    hostile: ['Je ne me tairai pas.', 'L’honneur m’oblige à parler.', 'Ceci est un avertissement.', 'La justice ne dort jamais.', 'Je vous le dis en face.', 'Écoutez la voix de l’honneur.'],
    neutre: ['Avec franchise.', 'Je vous réponds loyalement.', 'Parlons avec honneur.', 'Je vous écoute, comme toujours.', 'Voici ma parole.', 'En toute sincérité.'],
    amical: ['Mon ami.', 'Quelle joie de vous lire !', 'Avec tout mon cœur.', 'Votre parole me touche.', 'C’est un honneur.', 'Je vous salue chaleureusement.']
  },
  batisseur: {
    hostile: ['À regret.', 'Je préférerais bâtir que me fâcher.', 'Calmement, mais fermement.', 'Ce n’est pas ma manière, pourtant.', 'Mes chantiers attendront un instant.', 'Sans colère, mais sans détour.'],
    neutre: ['Posément.', 'Prenons le temps.', 'Pierre après pierre.', 'Avec mesure.', 'Réfléchissons ensemble.', 'Pesons nos mots.'],
    amical: ['Avec plaisir.', 'Bâtissons ensemble.', 'Que nos chantiers prospèrent !', 'Voilà une bonne nouvelle.', 'La paix nous va bien.', 'Volontiers.']
  },
  traitre: {
    hostile: ['Le masque tombe.', 'Assez de sourires.', 'Vous l’avez cherché.', 'Plus besoin de feindre.', 'Voici la vérité.', 'Fini les politesses.'],
    neutre: ['Intéressant.', 'Voyons cela.', 'Tout se négocie.', 'Restons discrets.', 'Je réfléchis.', 'Peut-être.'],
    amical: ['Très cher ami.', 'Comme vous êtes avisé !', 'Vous avez toute ma confiance.', 'Quel plaisir sincère !', 'Entre nous, en toute amitié.', 'Mon fidèle ami.']
  },
  joueur: {
    hostile: ['Écoutez-moi bien.', 'Soyons clairs.', 'Je serai direct.', 'Prenez garde.', 'Voici notre position.', 'Assez tergiversé.'],
    neutre: ['Parlons franchement.', 'Une remarque.', 'Restons calmes.', 'Pour mémoire.', 'Simplement ceci.', 'Mettons les choses au point.'],
    amical: ['Avec respect.', 'Salutations amicales.', 'En toute amitié.', 'Avec estime.', 'Recevez notre salut.', 'Bonne nouvelle.']
  }
});
const CLOSINGS = Object.freeze({
  conquerant: { hostile: ['La force tranchera.', 'Mes armées sont prêtes.', 'Vous voilà prévenus.'], neutre: ['Je jugerai sur les actes.', 'Le temps dira qui a raison.', 'Nous verrons bien.'], amical: ['Ne me décevez pas.', 'Restez de mon côté.', 'Cela vous honore.'] },
  heros: { hostile: ['Les peuples d’Arken nous regardent.', 'L’honneur sera vengé.', 'Je défendrai les faibles.'], neutre: ['Ma parole est donnée.', 'Je reste vigilant.', 'Que la justice nous guide.'], amical: ['Comptez sur moi.', 'Mon épée est à vos côtés.', 'Que la paix vous garde.'] },
  batisseur: { hostile: ['Ne m’obligez pas à poser l’outil.', 'Mes murs sont solides.', 'La patience a ses limites.'], neutre: ['Chaque chose en son temps.', 'La sagesse commande d’attendre.',
    'Rien ne presse.'], amical: ['Que nos peuples prospèrent.', 'Construisons l’avenir.', 'Vous serez toujours le bienvenu.'] },
  traitre: { hostile: ['Vous auriez dû vous méfier.', 'Chacun ses intérêts.', 'Le jeu ne fait que commencer.'], neutre: ['Tout dépendra de vous.', 'Nous en reparlerons.', 'Rien n’est figé.'], amical: ['Vous pouvez me croire.', 'Je ne l’oublierai pas.', 'Ensemble, rien ne nous arrête.'] },
  joueur: { hostile: ['Vous voilà prévenus.', 'Nous ne reculerons pas.', 'Méditez cela.'], neutre: ['À vous de voir.', 'Nous restons attentifs.', 'Le reste suivra.'], amical: ['Au plaisir de vous lire.', 'Nos portes vous restent accueillantes.', 'Gardons ce cap.'] }
});

// --- Français : élisions, pluriels ------------------------------------------------------------------------------
const VOWEL = /^[AEIOUYÉÈÊÎÏÔÖÛÜÀÂHaeiouyéèêîïôöûüàâh]/;
const H_ASPIRE = /^(Haut|Hau)/; // « de Haut-Bois », pas « d’Haut-Bois »
/** « de Branvale », « d’Îlebrume », « de Haut-Bois ». */
export const deName = name => VOWEL.test(name) && !H_ASPIRE.test(name) ? `d’${name}` : `de ${name}`;
const plural = (n, one, many = `${one}s`) => `${n} ${n > 1 ? many : one}`;
const roundDown = n => n >= 100 ? Math.floor(n / 50) * 50 : Math.floor(n / 10) * 10;

// --- Contexte réel ------------------------------------------------------------------------------------------------
const provName = (map, id) => map?.provinces?.find(p => p.id === id)?.name || id;
const ownedBy = (state, id) => Object.keys(state.provinces || {}).filter(p => state.provinces[p].ownerId === id).sort();
const soldiersAt = p => (Number(p?.units?.infantry) || 0) + (Number(p?.units?.cavalry) || 0);
const since = (state, started) => Math.max(0, (state.turn || 1) - (Number(started) || state.turn || 1));
/** Provinces qui se font face (frontière ou route maritime) : [[province de from, province de to], …], ordre stable. */
function facing(state, map, from, to) {
  const mine = new Set(ownedBy(state, from)), theirs = new Set(ownedBy(state, to)), out = [];
  for (const d of map?.provinces || []) if (mine.has(d.id)) for (const x of d.landConnections || []) if (theirs.has(x)) out.push([d.id, x]);
  for (const [a, b] of map?.maritimeRoutes || []) { if (mine.has(a) && theirs.has(b)) out.push([a, b]); if (mine.has(b) && theirs.has(a)) out.push([b, a]); }
  return out.sort((x, y) => x.join().localeCompare(y.join()));
}
/**
 * Éléments de contexte disponibles (vrais) pour `from` → `to` au ton `tone` : [{ id, text }]. Au moins un (le tour).
 * Exporté pour les tests.
 */
export function contextFragments(state, map, { from, to = null, tone }) {
  const T = state.turn || 1, out = [], add = (id, byTone) => out.push({ id, text: byTone[tone] || byTone.neutre });
  const left = gameLengthOf(state) - T;
  if (left > 0 && left <= scaleTurn(state, 10)) add('fin', { hostile: `Plus que ${plural(left, 'tour')} : le temps vous est compté.`, neutre: `Plus que ${plural(left, 'tour')} avant la fin : chacun fait ses comptes.`, amical: `Plus que ${plural(left, 'tour')} : finissons-les en bons termes.` });
  else add('tour', { hostile: `Nous voici au tour ${T}, et notre patience s’use.`, neutre: `Nous sommes au tour ${T} : rien n’est encore joué.`, amical: `Au tour ${T}, notre estime reste intacte.` });
  if (to) {
    const war = (state.diplomacy?.wars || []).find(w => w.active !== false && w.participants?.includes(from) && w.participants?.includes(to));
    const ally = treatyOf(state, from, to, 'alliance'), truce = treatyOf(state, from, to, 'ceasefire');
    if (war && atWar(state, from, to)) { const k = since(state, war.started); add('guerre', k
      ? { hostile: `Voilà ${plural(k, 'tour')} que nos nations sont en guerre, et nous tenons.`, neutre: `Notre guerre dure depuis ${plural(k, 'tour')}.`, amical: `Après ${plural(k, 'tour')} de guerre, parlons enfin.` }
      : { hostile: 'Notre guerre ne fait que commencer.', neutre: 'Notre guerre vient de commencer.', amical: 'Notre guerre vient de commencer ; elle peut encore s’arrêter.' }); }
    else if (ally) { const k = since(state, ally.started); add('alliance', k
      ? { hostile: `Notre alliance a ${plural(k, 'tour')} : ne la gâchez pas.`, neutre: `Notre alliance tient depuis ${plural(k, 'tour')}.`, amical: `Notre alliance tient depuis ${plural(k, 'tour')}, c’est une fierté.` }
      : { hostile: 'Notre alliance est toute neuve : ne la gâchez pas.', neutre: 'Notre alliance vient d’être conclue.', amical: 'Notre alliance vient d’être conclue, c’est une fierté.' }); }
    else if (truce) { const k = since(state, truce.started); add('treve', k
      ? { hostile: `Notre trêve n’a que ${plural(k, 'tour')} : elle reste fragile.`, neutre: `Notre trêve tient depuis ${plural(k, 'tour')}.`, amical: `Notre trêve tient depuis ${plural(k, 'tour')} : continuons.` }
      : { hostile: 'Notre trêve vient d’être signée : elle reste fragile.', neutre: 'Notre trêve vient d’être signée.', amical: 'Notre trêve vient d’être signée : faisons-la durer.' }); }
    else { const t = getTension(state, from, to); add('tension', { hostile: `La tension entre nous atteint ${t} %.`, neutre: `La tension entre nous est de ${t} %.`, amical: `La tension entre nous n’est que de ${t} %.` }); }
    const face = facing(state, map, from, to);
    if (face.length) {
      const [a, b] = face[Math.floor(chance(state, 'compose-face', T, from, to) * face.length) % face.length], A = provName(map, a), B = provName(map, b);
      add('face', { hostile: `${A} fait face à ${B}, et nos sentinelles veillent.`, neutre: `${A} et ${B} sont voisines : restons prudents.`, amical: `Entre ${A} et ${B}, la frontière reste paisible.` });
    }
    // Troupes : seulement dans une province que les deux voient.
    const seenTo = visibleProvinces(state, map, to), seenFrom = visibleProvinces(state, map, from);
    const mine = ownedBy(state, from).filter(id => seenTo.has(id) && soldiersAt(state.provinces[id]) >= 20).sort((x, y) => soldiersAt(state.provinces[y]) - soldiersAt(state.provinces[x]) || x.localeCompare(y))[0];
    if (mine) { const n = roundDown(soldiersAt(state.provinces[mine])), P = provName(map, mine);
      add('nos-troupes', { hostile: `Nos ${n} soldats tiennent ${P}, et ils ne reculeront pas.`, neutre: `${P} est gardée par ${n} de nos soldats.`, amical: `Nos ${n} soldats ${deName(P)} ne menacent personne.` }); }
    const yours = ownedBy(state, to).filter(id => seenFrom.has(id) && soldiersAt(state.provinces[id]) >= 20).sort((x, y) => soldiersAt(state.provinces[y]) - soldiersAt(state.provinces[x]) || x.localeCompare(y))[0];
    if (yours) { const n = roundDown(soldiersAt(state.provinces[yours])), P = provName(map, yours);
      add('vos-troupes', { hostile: `Vos ${n} soldats ${deName(P)} ne nous impressionnent pas.`, neutre: `Vous gardez ${n} soldats à ${P} ; nous l’avons remarqué.`, amical: `Vos ${n} soldats ${deName(P)} ne nous inquiètent pas.` }); }
    const a = ownedBy(state, from).length, b = ownedBy(state, to).length;
    if (a && b) add('provinces', { hostile: `Vous tenez ${plural(b, 'province')}, nous ${a} : faites le compte.`, neutre: `Vous tenez ${plural(b, 'province')}, nous ${a}.`, amical: `Vos ${plural(b, 'province')} et nos ${a} vivent côte à côte.` });
  } else {
    const a = ownedBy(state, from).length;
    if (a) add('provinces', { hostile: `Nos ${plural(a, 'province')} sont sur leurs gardes.`, neutre: `Nos ${plural(a, 'province')} vous saluent.`, amical: `Nos ${plural(a, 'province')} vous souhaitent la paix.` });
  }
  return out;
}

// --- Mémoire ------------------------------------------------------------------------------------------------------
const fp = text => hashString(String(text)).toString(36);
/** Mémoire d'un dirigeant (créée au besoin : ancienne sauvegarde). */
export function talkMemoryOf(state, from) {
  state.talkMemory = state.talkMemory && typeof state.talkMemory === 'object' ? state.talkMemory : {};
  const m = state.talkMemory[from];
  if (!m || typeof m !== 'object' || !Array.isArray(m.said) || !Array.isArray(m.cores)) state.talkMemory[from] = { said: Array.isArray(m?.said) ? m.said : [], cores: Array.isArray(m?.cores) ? m.cores : [] };
  return state.talkMemory[from];
}
/** Lecture seule (n'écrit rien dans l'état). */
const peekMemory = (state, from) => state.talkMemory?.[from] && Array.isArray(state.talkMemory[from].said) ? state.talkMemory[from] : { said: [], cores: [] };
/** Texte déjà publié par `from` dans cette partie ? */
export const alreadySaid = (state, from, text) => peekMemory(state, from).said.includes(fp(text));
/** Fond (réplique de talk.js) utilisé récemment par `from`, ou ce tour-ci par un autre dirigeant ? */
export function coreUsed(state, from, template, { recent = 6 } = {}) {
  const h = fp(template);
  if (peekMemory(state, from).cores.slice(-recent).some(([x]) => x === h)) return true;
  return Object.entries(state.talkMemory || {}).some(([id, m]) => id !== from && Array.isArray(m?.cores) && m.cores.some(([x, t]) => x === h && t === state.turn));
}
/** À la publication : retient le texte et son fond. */
export function rememberTalk(state, from, text, core = null) {
  if (!from) return;
  const m = talkMemoryOf(state, from);
  m.said.push(fp(text)); if (m.said.length > SAID_MEMORY) m.said.splice(0, m.said.length - SAID_MEMORY);
  if (core) { m.cores.push([fp(core), state.turn || 1]); if (m.cores.length > CORE_MEMORY) m.cores.splice(0, m.cores.length - CORE_MEMORY); }
}

// --- Composition --------------------------------------------------------------------------------------------------
const traitOf = (state, from) => state.controllers?.[from] === 'human' ? 'joueur' : (OPENINGS[archetypeOf(state, from)] ? archetypeOf(state, from) : 'joueur');
/**
 * Compose une réplique. `core` = fond déjà rempli (noms, or…). Déterministe : mêmes état, graine et clés → même texte.
 * Ne modifie pas l'état (la mémoire est mise à jour à la publication, rememberTalk).
 */
export function composeLine(state, map, { from, to = null, tone, core, keys = [] }) {
  const trait = traitOf(state, from), t = OPENINGS[trait][tone] ? tone : 'neutre';
  const opens = OPENINGS[trait][t], closes = CLOSINGS[trait][t], ctx = contextFragments(state, map, { from, to, tone: t });
  const r = k => chance(state, 'compose', k, from, to ?? '*', t, ...keys);
  const o0 = Math.floor(r('o') * opens.length), c0 = Math.floor(r('c') * ctx.length), k0 = Math.floor(r('k') * (closes.length + 2));
  const build = (o, c, k) => {
    const parts = [opens[o], core, ctx[c].text], closing = k < closes.length ? closes[k] : null; // k ≥ longueur : sans chute
    const base = parts.join(' ');
    return closing && base.length + closing.length + 1 <= COMPOSED_MAX ? `${base} ${closing}` : base;
  };
  const K = closes.length + 2;
  // Variété : d'abord une ouverture et un contexte absents de ses 3 derniers messages ; puis toute combinaison jamais dite.
  const last = [];
  for (let i = (state.talk || []).length - 1; i >= 0 && last.length < 3; i--) if (state.talk[i].from === from) last.push(state.talk[i].text);
  const fresh = (o, c) => !last.some(x => x.startsWith(opens[o]) || x.includes(ctx[c].text));
  let first = null;
  for (const strict of [true, false]) for (let i = 0; i < opens.length * ctx.length * K; i++) {
    const o = (o0 + i) % opens.length, c = (c0 + Math.floor(i / opens.length)) % ctx.length, k = (k0 + Math.floor(i / (opens.length * ctx.length))) % K;
    if (strict && !fresh(o, c)) continue;
    const text = build(o, c, k);
    first ??= text;
    if (!alreadySaid(state, from, text)) return text;
  }
  return first ?? build(o0, c0, k0); // toutes les combinaisons ont servi (n'arrive pas en 80 tours)
}
/** Toutes les listes de fragments (tests : français soigné). */
export function composeFragmentLists() {
  const out = {};
  for (const [trait, byTone] of Object.entries(OPENINGS)) for (const [tone, list] of Object.entries(byTone)) out[`ouverture.${trait}.${tone}`] = list;
  for (const [trait, byTone] of Object.entries(CLOSINGS)) for (const [tone, list] of Object.entries(byTone)) out[`chute.${trait}.${tone}`] = list;
  return out;
}
