// V13 — Affichage de la vision (brouillard de guerre) et des PV lisibles. Règles : docs/V13-vision.md.
import { provinceIntel, visibleProvinces } from '../domain/vision.js';
import { regimentText } from '../domain/combat.js';

const SHORT = { infantry: ['fantassin', 'fantassins'], cavalry: ['cavalier', 'cavaliers'], armor: ['blindé', 'blindés'], artillery: ['artilleur', 'artilleurs'], warship: ['navire', 'navires'] };

/**
 * Ce que la fiche de province affiche des troupes, du point de vue du joueur.
 * @returns {{ known:boolean, entrenched:boolean, visible:boolean, empty:boolean, wounded:boolean,
 *             text:string, composition:string, note:string }}
 *   text        : une seule ligne « Régiment : 344 PV · 52 dégâts par assaut » ou « Régiment : effectif inconnu » ;
 *   composition : effectifs en chiffres (« 200 fantassins · 6 blindés »), vide si inconnu ;
 *   note        : raison de l'inconnu (forteresse ou hors de vue).
 */
export function provinceTroopView(state, map, provinceId, nationId = state.playerNationId) {
  const intel = provinceIntel(state, map, nationId, provinceId);
  if (!intel) return { known: false, entrenched: false, visible: false, empty: false, wounded: false, text: regimentText(null), composition: '', note: '' };
  if (!intel.troopsKnown) return {
    known: false, entrenched: intel.entrenched, visible: intel.visible, empty: false, wounded: false, text: regimentText(null), composition: '',
    note: intel.entrenched ? 'Troupes retranchées dans la forteresse : effectif inconnu' : 'Hors de vue : aucune de vos troupes (ou de vos alliés) dans une province voisine par la terre'
  };
  const counts = { ...intel.units, warship: intel.warships };
  const composition = Object.keys(SHORT).filter(k => counts[k] > 0).map(k => `${counts[k]} ${SHORT[k][counts[k] > 1 ? 1 : 0]}`).join(' · ');
  const empty = !composition;
  return { known: true, entrenched: false, visible: true, empty, wounded: intel.regiment.wounded, text: empty ? 'Régiment : aucune troupe' : regimentText(intel.regiment), composition, note: '' };
}

/** Ensemble des provinces dont le joueur voit les troupes (pour les icônes de la carte). */
export function knownTroopProvinces(state, map, nationId = state.playerNationId) {
  const seen = visibleProvinces(state, map, nationId);
  return new Set(map.provinces.map(d => d.id).filter(id => provinceIntel(state, map, nationId, id, seen)?.troopsKnown));
}
