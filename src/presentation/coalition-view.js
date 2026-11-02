// V15.1 — coalition à l'écran : bandeau sur la carte et fenêtres. Module pur : du texte, à partir des règles et de ce qui est public.
import { RULES } from '../domain/constants.js';

const list = names => names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} et ${names.at(-1)}`;
const verb = (n, one, many) => n > 1 ? many : one;

/** Bandeau de la carte, ou null s'il n'y a pas de coalition. */
export function coalitionBanner(state, nation) {
  const c = state?.coalition;
  if (!c || state.gameOver) return null;
  const me = state.playerNationId, mine = c.target === me;
  return { mine, text: mine ? `⚔ Coalition contre vous · ${c.members.length} ${verb(c.members.length, 'nation', 'nations')}` : `⚔ Coalition contre ${nation(c.target)}` };
}
/** Détail affiché quand on touche le bandeau : qui, depuis quand, et la règle. Ne dit jamais quoi faire. */
export function coalitionDetails(state, nation) {
  const c = state?.coalition;
  if (!c) return null;
  const me = state.playerNationId, mine = c.target === me, names = c.members.map(nation);
  const count = Object.values(state.provinces).filter(p => p.ownerId === c.target).length;
  return {
    kicker: `COALITION · DEPUIS LE TOUR ${c.since}`,
    title: mine ? 'Arken se ligue contre vous' : `Arken se ligue contre ${nation(c.target)}`,
    lead: `${list(names)} ${verb(names.length, 'fait', 'font')} front contre ${mine ? 'vous' : nation(c.target)}, qui ${mine ? 'tenez' : 'tient'} ${count} provinces.`,
    rule: coalitionRule(mine, nation(c.target)),
    note: 'Chaque dirigeant décide selon son caractère. Personne ne reçoit d’or ni de troupes : la coalition suit les mêmes règles que tout le monde.'
  };
}
const coalitionRule = (mine, name) => `Elle se forme quand une nation tient ${RULES.coalition.formProvinces} provinces et ${RULES.coalition.formLead} de plus que la deuxième. Elle se dissout quand ${mine ? 'vous retombez' : `${name} retombe`} à ${RULES.coalition.dissolveProvinces} provinces ou moins.`;
/** Fenêtres à montrer après un tour : formation et dissolution (les ralliements restent au journal). */
export function coalitionPopups(events, state, nation) {
  const out = [], me = state.playerNationId;
  for (const e of events || []) {
    const mine = e.nationId === me;
    if (e.type === 'coalition-formed') out.push({ kind: mine ? 'against' : 'other', kicker: 'COALITION', title: mine ? 'Arken se ligue contre vous' : `Arken se ligue contre ${nation(e.nationId)}`,
      lead: `${list((e.members || []).map(nation))} ${verb((e.members || []).length, 'se dresse', 'se dressent')} contre ${mine ? 'vous' : nation(e.nationId)}.`, text: coalitionRule(mine, nation(e.nationId)) });
    if (e.type === 'coalition-dissolved') out.push({ kind: 'ended', kicker: 'COALITION', title: 'La coalition est dissoute',
      lead: e.reason === 'eliminated' ? `${nation(e.nationId)} a disparu de la carte.` : `${mine ? 'Vous ne tenez' : `${nation(e.nationId)} ne tient`} plus que ${e.provinces} provinces.`, text: 'Les guerres déjà ouvertes ne s’arrêtent pas d’elles-mêmes.' });
  }
  return out;
}
