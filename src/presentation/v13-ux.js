import { neighbors } from '../domain/talk.js';
import { RULES } from '../domain/constants.js';
// V13 — interface des alliances et des échanges (docs/V13-alliances-echanges.md).
// Fonctions pures, sans DOM : testables sous Node.

/** Récit d'introduction, affiché une fois au début d'une nouvelle partie. */
export const INTRO_STORY = Object.freeze({
  kicker: 'ARKEN · AN I DU NOUVEL ÂGE',
  title: 'Quatre masques',
  paragraphs: Object.freeze([
    'Les cinq couronnes d’Arken se regardent par-dessus la mer. Vous portez l’une d’elles.',
    'Parmi les 4 dirigeants qui vous font face se cachent un Héros, un Conquérant, un Traître et un Bâtisseur. Aucun ne porte son masque à découvert.',
    'Leurs paroles peuvent mentir ; leurs actes, jamais. Observez qui attaque, qui défend, qui bâtit… et qui sourit un peu trop.',
    'Démasquez-les avant qu’il ne soit trop tard.'
  ]),
  button: 'Prendre la couronne'
});

/**
 * Fenêtres de prise de capitale pour le joueur, à partir des événements de l'inter-tour qui vient d'être résolu :
 *  - il prend une capitale : « 👑 Capitale conquise ! Vous pillez X or » (pillage + trésor de guerre éventuel) ;
 *  - il perd la sienne : « Votre capitale est tombée ».
 * names = { nation(id) → nom court, province(id) → nom }.
 */
const deName = name => /^[AEIOUYÉÈÊÎÏÔÖÛÜÀÂaeiouyéèêîïôöûüàâ]/.test(name) ? `d’${name}` : `de ${name}`;
export function capitalPopups(events, playerId, names) {
  const out = [];
  for (const e of events || []) {
    if (e.type !== 'capital-plunder') continue;
    const where = names.province(e.provinceId), amount = Math.max(0, Math.floor(Number(e.amount) || 0)), chest = Math.max(0, Math.floor(Number(e.warChest) || 0));
    if (e.attacker === playerId) out.push({
      kind: 'won', provinceId: e.provinceId, amount, warChest: chest, total: amount + chest,
      kicker: `${names.nation(e.defender).toUpperCase()} · CAPITALE`, title: '👑 Capitale conquise !',
      lead: `Vous pillez ${amount} or`,
      text: `${where} est à vous. Le trésor ${deName(names.nation(e.defender))} est pillé${e.loot > 0 ? ` (minimum garanti : ${e.loot} or de butin pris dans la ville)` : ''}${chest ? `, et vous saisissez son trésor de guerre : +${chest} or` : ''}.`
    });
    else if (e.defender === playerId) out.push({
      kind: 'lost', provinceId: e.provinceId, amount: Math.max(0, Math.floor(Number(e.fromTreasury ?? e.amount) || 0)),
      kicker: `${names.nation(e.attacker).toUpperCase()} · INVASION`, title: 'Votre capitale est tombée',
      lead: `${names.nation(e.attacker)} s’empare de ${where}`,
      text: `Les pillards emportent ${Math.max(0, Math.floor(Number(e.fromTreasury ?? e.amount) || 0))} or de votre trésor. Reprenez ${where} pour la venger… et récupérer votre butin.`
    });
  }
  return out;
}

/** Texte de tension affiché partout : « 42 % · tendu », ou « En guerre » (avec la valeur en %). */
export function tensionText(level) {
  const value = Math.max(0, Math.min(100, Math.round(Number(level?.value) || 0)));
  if (level?.label === 'en guerre') return { value, short: 'En guerre', long: `En guerre · ${value} %`, war: true };
  return { value, short: `${value} %`, long: `${value} % · ${level?.label || 'calme'}`, war: false };
}

/**
 * Choix proposés au joueur pour demander de l'aide à `allyId` :
 *  - attackTargets : nations que l'on peut viser (ni soi, ni l'allié, ni un de ses propres alliés, ni éliminées) ;
 *  - defendAgainst : mêmes nations (défense contre une nation précise) ;
 *  - provinces : provinces du joueur (défense d'une province).
 */
export function helpChoices(state, map, allyId, playerId = state.playerNationId) {
  const allied = (a, b) => (state.diplomacy?.treaties || []).some(t => t.active !== false && t.type === 'alliance' && t.parties.includes(a) && t.parties.includes(b));
  const atWar = (a, b) => (state.diplomacy?.wars || []).some(w => w.active !== false && w.participants.includes(a) && w.participants.includes(b));
  const nations = map.nations.filter(n => n.id !== playerId && n.id !== allyId && !state.nations[n.id]?.eliminated && !allied(playerId, n.id))
    .map(n => ({ id: n.id, name: n.short, color: n.color, atWar: atWar(playerId, n.id), allyOfAlly: allied(allyId, n.id) }));
  const provinces = map.provinces.filter(p => state.provinces[p.id]?.ownerId === playerId).map(p => ({ id: p.id, name: p.name }));
  // V13 (mer en anneau) : « Attaque X avec moi » seulement contre une nation que l'allié peut atteindre.
  return { attackTargets: nations.filter(n => neighbors(state, map, allyId, n.id)), defendAgainst: nations, provinces };
}
/** Engagements en cours d'un allié envers le joueur (affichage), tolérant à l'absence du champ. */
export function helpPactsFor(state, allyId, playerId = state.playerNationId) {
  return (Array.isArray(state.diplomacy?.help) ? state.diplomacy.help : []).filter(p => p.ally === allyId && p.requester === playerId && p.until >= state.turn)
    .map(p => {
      if (p.noRoute) return { kind: p.kind, against: p.against ?? null, provinceId: p.provinceId ?? null, turnsLeft: Math.max(0, p.until - state.turn + 1), travelLeft: 0, helpLeft: Math.max(0, p.until - state.turn + 1), noRoute: true };
      // V14.2 : trajet (en route) puis aide sur place ; anciennes sauvegardes sans `travel` : tout est « sur place ».
      // Réponse publiée à l'inter-tour du tour p.turn : le joueur la lit au tour p.turn + 1, les troupes partent alors.
      const travelLeft = Math.max(0, (Number(p.turn) || 0) + 1 + (Number(p.travel) || 0) - state.turn);
      return { kind: p.kind, against: p.against ?? null, provinceId: p.provinceId ?? null, turnsLeft: Math.max(0, p.until - state.turn + 1), travelLeft, helpLeft: Math.max(0, p.until - state.turn + 1 - travelLeft) };
    });
}
const toursFr = n => `${n} tour${n > 1 ? 's' : ''}`;
/** V14.2 : où en est un engagement d'aide (fenêtre « Aide de X ») : en route ou sur place, sans ambiguïté. */
export function helpPactStatus(pact) {
  if (pact.noRoute) return `aucune route directe : ses troupes risquent de ne pas venir (encore ${toursFr(pact.helpLeft)})`;
  if (pact.travelLeft > 0) return `en route : arrivée estimée dans ${toursFr(pact.travelLeft)}, puis aide pendant ${toursFr(pact.helpLeft)}`;
  return `aide sur place : encore ${toursFr(pact.helpLeft)}`;
}

/**
 * V13.1 — sort des convois du joueur, en fenêtre impossible à rater (bêta du 18/10 : « mes troupes ont disparu »).
 *  - débarquement repoussé (combat naval perdu par le joueur attaquant) : pertes, survivants qui rentrent ou aucun ;
 *  - convoi coulé en mer ou devant un port ennemi ;
 *  - convoi perdu faute de port où rentrer.
 * names = { nation(id) → nom court, province(id) → nom }.
 */
const plural = (n, word) => `${n} ${word}${n > 1 ? 's' : ''}`;
export function seaFatePopups(events, playerId, names) {
  const out = [], list = events || [], merged = new Set();
  const num = n => Math.max(0, Math.floor(Number(n) || 0));
  const lossOf = (e, id) => { const l = e.lossesByNation?.[id]; return l ? Object.values(l).reduce((a, b) => a + num(b), 0) : null; };
  for (const e of list) {
    if (e.type === 'battle' && e.naval && (e.attackers || [e.attacker]).includes(playerId) && e.defender !== playerId) {
      const lost = lossOf(e, playerId) ?? num(e.attackerLosses), killed = lossOf(e, e.defender) ?? num(e.defenderLosses);
      const back = list.find(x => x.type === 'convoy-returning' && x.nationId === playerId && x.provinceId === e.provinceId && x.reason === 'repelled');
      const home = back ? names.province(back.toId) : null;
      // Port de départ tombé entre-temps : les survivants n'ont nulle part où rentrer (une seule fenêtre, exacte).
      const stranded = back ? null : list.find(x => x.type === 'retreat-lost' && x.naval && x.nationId === playerId && (e.originIds || []).includes(x.provinceId) && !merged.has(x));
      if (stranded) merged.add(stranded);
      out.push({
        kind: back ? 'repelled' : 'wiped', provinceId: e.provinceId, lost, killed, survivors: back ? num(back.amount) : 0,
        kicker: `${names.nation(e.defender).toUpperCase()} · DÉBARQUEMENT`, title: '⚓ Débarquement repoussé',
        lead: back || stranded ? `${plural(lost, 'unité')} perdue${lost > 1 ? 's' : ''} à ${names.province(e.provinceId)}` : `Tout le convoi a péri à ${names.province(e.provinceId)}`,
        text: `${names.nation(e.defender)} tient la province et perd ${plural(killed, 'unité')}. ` +
          (stranded ? `${plural(num(stranded.amount), 'survivant')} n’${num(stranded.amount) > 1 ? 'ont' : 'a'} plus de port où rentrer (${names.province(stranded.provinceId)} est tombée) : perdu${num(stranded.amount) > 1 ? 's' : ''} en mer.` : back ? `${plural(num(back.amount), 'survivant')} rembarque${num(back.amount) > 1 ? 'nt' : ''} et rentre${num(back.amount) > 1 ? 'nt' : ''} à ${home} (${plural(num(back.turns) || 2, 'tour')}).`
                : 'Aucun survivant : tes troupes sont tombées sur la plage.'),
        tip: `Un débarquement se bat à ${Math.round(RULES.combat.landingPenalty * 100)} % de sa force, souvent sans voir la garnison d’en face. Débarque en nombre, escorté de navires de guerre, ou envoie d’abord une troupe voisine pour voir.`
      });
    } else if (e.type === 'interception' && e.defender === playerId && e.convoyDestroyed) {
      const lost = lossOf(e, playerId) ?? num(e.defenderLosses);
      out.push({
        kind: 'sunk', provinceId: e.provinceId, lost,
        kicker: `${names.nation(e.attacker).toUpperCase()} · INTERCEPTION`, title: '⚓ Convoi coulé',
        lead: `${names.province(e.fromId)} → ${names.province(e.toId)} : ${plural(lost, 'unité')} perdue${lost > 1 ? 's' : ''}`,
        text: e.kind === 'port' ? `La flotte du port de ${names.province(e.provinceId)} a coulé ton convoi juste avant l’arrivée.` : `Des navires de ${names.nation(e.attacker)} ont coulé ton convoi en pleine mer.`,
        tip: 'Sans navires de guerre, un convoi ne peut pas se défendre. Construis un port et une usine pour l’escorter.'
      });
    } else if (e.type === 'retreat-lost' && e.naval && e.nationId === playerId && !merged.has(e)) {
      const lost = num(e.amount);
      out.push({
        kind: 'stranded', provinceId: e.provinceId, lost, kicker: 'MARINE', title: '⚓ Convoi perdu en mer',
        lead: `${plural(lost, 'unité')} perdue${lost > 1 ? 's' : ''}`,
        text: `Le port de ${names.province(e.provinceId)} est tombé : tes troupes n’avaient plus où accoster.`, tip: ''
      });
    }
  }
  return out;
}
