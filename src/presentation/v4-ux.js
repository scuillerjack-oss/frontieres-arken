import { LAND_UNIT_TYPES, RULES } from '../domain/constants.js';
import { fortReductionPct } from '../domain/combat.js';

export const SAVE_KEY = 'frontieres-arken-v2-save';
// V13.2 : textes raccourcis (Jack : « parfois pas très clairs, parfois trop longs ») — 1 à 3 phrases courtes.
export const TUTORIAL_GUIDE = Object.freeze([
  { id:'identity', title:'Votre royaume', text:'Vous dirigez {nation}. Préparez vos ordres pendant le tour : tout se joue quand vous touchez « Fin du tour ».' },
  { id:'map', title:'Carte et zoom', text:'Touchez une province pour la voir. Zoom : deux doigts ou + / −. Recentrer : ◎.' },
  { id:'move', title:'Donner un ordre', text:'« Déplacer / Attaquer », puis touchez une province verte. Vos troupes partent à la fin du tour.' },
  { id:'recruit', title:'Recruter', text:'Chaque + ajoute un lot : 20 fantassins ou 5 cavaliers. Le prix total s’affiche avant de valider.' },
  { id:'build', title:'Construire', text:`Banque et usine : +3 or par tour. Port : +2 or et navires de guerre. Forteresse : −${fortReductionPct(1)} / −${fortReductionPct(2)} / −${fortReductionPct(3)} % de dégâts reçus en défense (niveaux 1 à 3).` },
  { id:'attack', title:'Attaque et guerre', text:'Attaquer une nation, c’est entrer en guerre avec elle. Le combat a lieu à la fin du tour. On n’attaque jamais un allié : alliance = passage libre chez lui, pour l’aider.' },
  { id:'diplomacy', title:'Diplomatie', text:'En guerre, proposez un cessez-le-feu : payez pour l’obtenir, ou exigez de l’or si vous dominez. S’il refuse, aucun or ne bouge.' },
  { id:'history', title:'Journaux', text:'Le journal du tour résume l’essentiel. Le bouton Journal garde tout l’historique.' },
  { id:'orders', title:'Ordres en attente', text:'Flèche verte : déplacement. Flèche rouge : attaque. Touchez une flèche pour revoir ou annuler l’ordre.' },
  { id:'maritime', title:'Routes maritimes', text:`Les 5 îles forment un anneau. Embarquez depuis un point de port ⚓ que vous possédez : la traversée vers l’île voisine dure 2 tours. Sans navires de guerre (port + usine) pour escorter, l’ennemi peut intercepter le convoi. Débarquer chez l’ennemi : combat à ${Math.round(RULES.combat.landingPenalty * 100)} %.` },
  { id:'endgame', title:'Fin de partie', text:`La partie dure ${RULES.gameLength} tours. Classement : provinces, puis capitales, puis trésor. Tenir les 5 capitales : victoire immédiate.` },
  { id:'intelligence', title:'Renseignement', text:'Vous voyez les troupes près des vôtres et chez vos alliés. Ailleurs : « ? ». Une forteresse ennemie cache ses troupes.' }
]);

export function forceSelection(available, mode = '50') {
  return Object.fromEntries(LAND_UNIT_TYPES.map(k => [k, mode === '100' ? (available[k] || 0) : mode === '50' ? Math.floor((available[k] || 0) / 2) : 0]));
}
export function pinchScale(startScale, startDistance, currentDistance) {
  if (!(startDistance > 0) || !(currentDistance > 0)) return Math.max(1, Math.min(2.5, startScale));
  return Math.max(1, Math.min(2.5, startScale * currentDistance / startDistance));
}
export function pointInPolygon(point, points) {
  let inside=false;
  for(let i=0,j=points.length-1;i<points.length;j=i++){
    const a=points[i],b=points[j];
    if(((a[1]>point.y)!==(b[1]>point.y))&&(point.x<(b[0]-a[0])*(point.y-a[1])/(b[1]-a[1])+a[0]))inside=!inside;
  }
  return inside;
}
export function provinceBorderPoint(definition, toward) {
  const origin=definition.markerAnchor,dx=toward.x-origin.x,dy=toward.y-origin.y,points=definition.geometry.points;
  let low=0,high=1;
  for(let i=0;i<18;i++){const mid=(low+high)/2;if(pointInPolygon({x:origin.x+dx*mid,y:origin.y+dy*mid},points))low=mid;else high=mid;}
  const distance=Math.hypot(dx,dy)||1,pad=2/distance,t=Math.min(1,low+pad);
  return{x:origin.x+dx*t,y:origin.y+dy*t};
}
export function sanitizeJournalEntry(entry) {
  // V14.2 : les sauts de ligne voulus (rapport de combat) sont gardés ; le reste des blancs est resserré.
  const text = String(entry?.text ?? '').replace(/\b(undefined|null)\b/gi, '').replace(/[\/|]+/g, ' ').split('\n').map(l => l.replace(/\s+/g, ' ').trim()).filter(Boolean).join('\n');
  return text ? { ...entry, text } : null;
}
export function resetActiveSave(storage, key = SAVE_KEY) {
  storage.removeItem(key);
  return !storage.getItem(key);
}
