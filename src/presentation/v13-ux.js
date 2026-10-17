import { neighbors } from '../domain/talk.js';
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
    .map(p => ({ kind: p.kind, against: p.against ?? null, provinceId: p.provinceId ?? null, turnsLeft: Math.max(0, p.until - state.turn + 1) }));
}
