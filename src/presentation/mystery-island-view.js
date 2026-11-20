// V16.2 — L'île mystérieuse : textes de l'interface (fiche, aide, carte). Fonctions pures, sans DOM : testables sous Node.
import { LAND_UNIT_TYPES, RULES } from '../domain/constants.js';
import { formatDate } from '../domain/realtime/clock.js';
import { lighthouseFleets } from '../domain/vision.js';
import { MYSTERY_ISLAND_ID, MYSTERY_ISLAND_NAME, islandBankShare } from '../domain/mystery-island.js';
import { seaRoutesFrom } from '../domain/engine/sea-routes.js';
import { allied } from '../domain/leaders.js';

const MI = RULES.mysteryIsland;
export { MYSTERY_ISLAND_ID, MYSTERY_ISLAND_NAME };
/** Couleur de la garnison neutre sur la carte (gris pierre, comme l'île peinte). */
export const NEUTRAL_COLOR = '#a39d92';

/** Ligne de l'aide (« ? »). */
export const MYSTERY_HELP = Object.freeze({ id: 'mystery', title: 'Île mystérieuse',
  text: `Au centre, neutre au départ : garnison de ${MI.garrisonFactor} armées de nation, toujours visible. Super banque : +${MI.bankIncome} or par tour. Routes de ${MI.routeTurns} tours vers chaque nation. Rien ne s’y construit : gardez-y des troupes. Deux alliés qui débarquent ensemble la partagent. Attaques publiques.` });

/**
 * Ce que la fiche de l'île montre au joueur `playerId`. `name(id)` = nom court d'une nation, `provinceName(id)` = nom d'une province.
 * @returns {{ kicker:string, chips:string[], canMove:boolean, canDiplo:boolean }}
 */
export function islandSheetView(state, map, playerId, name, provinceName) {
  const p = state.provinces[MYSTERY_ISLAND_ID];
  const owner = p?.ownerId ?? null, co = p?.coOwnerId ?? null;
  const mine = owner === playerId, coMine = co === playerId;
  const status = !owner ? 'neutre' : mine ? (co ? `à vous, avec ${name(co)}` : 'à vous') : coMine ? `à ${name(owner)}, avec vous` : `à ${name(owner)}${co ? ` et ${name(co)}` : ''}`;
  const share = islandBankShare(state, playerId);
  const bank = `🏦 Super banque : +${MI.bankIncome} or par tour à son propriétaire (+${MI.bankIncome / 2} chacun avec un co-propriétaire)${share ? ` · vous touchez +${share} or par tour` : ''}`;
  const routes = seaRoutesFrom(map, MYSTERY_ISLAND_ID).map(r => r.via);
  const myPorts = routes.filter(id => state.provinces[id]?.ownerId === playerId).map(provinceName);
  const D = RULES.realtime.durations, rt = state.mode === 'realtime'; // V17.5b : en jours en temps réel
  const route = `⛵ Routes : ${rt ? `${MI.routeTurns * D.landPerSeaTurn} jours` : `${MI.routeTurns} tours`} vers chacune des 5 nations (contre ${rt ? `${RULES.naval.minTurns * D.landPerSeaTurn} jours` : '2'} entre deux nations) ; depuis l’île, débarquement chez n’importe quelle nation${myPorts.length ? `. Vous embarquez pour l’île depuis ${myPorts.join(', ')}` : ''}`;
  const chips = [
    `🏝 ${MYSTERY_ISLAND_NAME} : ${status}. Garnison toujours visible par tous`,
    bank, route,
    co ? `🤝 Co-propriétaire : ${name(co)} (base commune, super banque partagée ; s’il rompt l’alliance avec ${name(owner)}, il perd sa part)` : '',
    // V17.5b : phare — qui tient l'île voit les flottes qui s'y dirigent (de qui, arrivée ; composition selon la vision).
    ...(mine || coMine ? lighthouseFleets(state, map, playerId).map(f => `🗼 Flotte de ${name(f.nationId)} en route vers l’île${Number.isFinite(f.arriveDay) ? `, arrivée le ${formatDate(f.arriveDay)}` : ''}${f.known ? ` (${LAND_UNIT_TYPES.reduce((n, k) => n + (f.units[k] || 0), 0)} soldats, ${f.warships} navire${f.warships > 1 ? 's' : ''})` : ' (composition inconnue)'}`) : []),
    mine || coMine ? '🗼 Phare : vous voyez toute flotte qui fait route vers l’île' : '',
    `🚫 On n’y construit rien et on n’y recrute personne : pour la garder, il faut y laisser des troupes`,
    !owner ? `⚔ Garnison neutre : elle ne recrute jamais et ne bouge jamais. Deux alliés qui débarquent le même tour la prennent ensemble` : '',
    owner && !mine && !coMine && !allied(state, playerId, owner) ? '⚔ Toute attaque contre l’île est publique : toutes les nations voient les pertes et ce qu’il reste sur l’île' : ''
  ].filter(Boolean);
  return { kicker: `${MYSTERY_ISLAND_NAME} · ${status}`, chips, canMove: mine || coMine, canDiplo: Boolean(owner && !mine) };
}
/** Petit texte sous le nom de l'île sur la carte : super banque (et co-propriété). */
export const islandMapBadge = state => `🏦+${MI.bankIncome}${state.provinces[MYSTERY_ISLAND_ID]?.coOwnerId ? ' 🤝' : ''}`;
