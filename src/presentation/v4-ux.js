import { LAND_UNIT_TYPES } from '../domain/constants.js';

export const SAVE_KEY = 'frontieres-arken-v2-save';
export const TUTORIAL_GUIDE = Object.freeze([
  { id:'identity', title:'Votre royaume', text:'Vous dirigez {nation}. Ses provinces sont mises en évidence. Pendant le tour, vous préparez des ordres ; le monde les résout à l’inter-tour.' },
  { id:'map', title:'Carte et zoom', text:'Touchez une province pour l’inspecter. Zoomez avec deux doigts ou les boutons + et −, puis recentrez avec ◎.' },
  { id:'move', title:'Donner un ordre', text:'Choisissez Déplacer / Attaquer, puis une province de destination. Vos unités restent réservées jusqu’à la résolution de fin de tour.' },
  { id:'recruit', title:'Recruter', text:'Les boutons − et + comptent des lots : 20 fantassins ou 5 cavaliers par lot. Le coût total s’affiche avant validation.' },
  { id:'build', title:'Construire', text:'Banques, usines, forts et ports coûtent de l’or et arrivent après leur durée de production.' },
  { id:'attack', title:'Attaque et guerre', text:'Les attaques sont préparées avec les autres ordres. Le combat se résout à l’inter-tour et met automatiquement les deux nations en guerre.' },
  { id:'diplomacy', title:'Diplomatie', text:'Choisissez une action pour lire ses conséquences, puis confirmez. En guerre, le cessez-le-feu / ultimatum propose trois paiements avec des chances d’acceptation différentes ; aucun paiement n’est pris si l’offre est refusée.' },
  { id:'history', title:'Journaux', text:'Le journal inter-tour résume ce qui exige votre attention. Le journal permanent garde l’historique connu du monde.' },
  { id:'orders', title:'Ordres en attente', text:'Tes déplacements et attaques sont indiqués sur la carte par des flèches vertes et rouges. Touche une flèche avant Fin du tour pour consulter ou annuler l’ordre.' },
  { id:'maritime', title:'Routes maritimes', text:'Pour prendre la mer, il faut un port construit dans la province de départ ; aucun port n’est nécessaire en face. Depuis ce port, chaque route mène à la province au bout de la route et à ses voisines côtières. Traversée : 2 tours au minimum, 1 tour par étape sur les routes longues ; le convoi est visible sur la carte avec ses tours restants. Les convois ne se battent pas : des navires ennemis peuvent les intercepter en mer ou à l’approche de leur port. Ajoutez des navires de guerre pour les escorter. À l’arrivée : renfort chez vous, débarquement (combat à 70 %) chez l’ennemi.' },
  { id:'endgame', title:'Fin de partie', text:'La partie dure 60 tours. Classement final : nombre de provinces, puis capitales tenues, puis trésor. Une nation qui tient les cinq capitales gagne aussitôt.' },
  { id:'intelligence', title:'Renseignement', text:'Les effectifs ennemis ne sont visibles que si tes ballons permettent de les observer.' }
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
  const text = String(entry?.text ?? '').replace(/\b(undefined|null)\b/gi, '').replace(/[\/|]+/g, ' ').replace(/\s+/g, ' ').trim();
  return text ? { ...entry, text } : null;
}
export function resetActiveSave(storage, key = SAVE_KEY) {
  storage.removeItem(key);
  return !storage.getItem(key);
}
