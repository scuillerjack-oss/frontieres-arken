import { LAND_UNIT_TYPES, RULES } from '../domain/constants.js';
import { fortReductionPct } from '../domain/combat.js';
import { MYSTERY_HELP } from './mystery-island-view.js';

export const SAVE_KEY = 'frontieres-arken-v2-save';
// V13.2 : textes raccourcis (Jack : « parfois pas très clairs, parfois trop longs ») — 1 à 3 phrases courtes.
// V17.9 : réécrits pour le TEMPS RÉEL (plus aucun « tour ») ; chiffres lus dans RULES / RULES.realtime. Ils servent à l'Aide (?)
// et aux bulles d'explication des 2 premières parties (HINT_GAMES). Aucun conseil de stratégie : on dit ce que font les choses.
const RT = RULES.realtime, DUR = RT.durations, MONTH = RT.income.perMonth;
const or = n => `${String(n).replace('.', ',')} or / mois`;
export const TUTORIAL_GUIDE = Object.freeze([
  { id:'identity', title:'Votre royaume', text:`Vous dirigez {nation}. Le temps avance tout seul : 1 jour = ${RT.clock.msPerDay / 1000} secondes. ▶ / ⏸ en bas à droite ; en pause, vous pouvez tout faire.` },
  { id:'map', title:'Carte et zoom', text:'Faites glisser la carte : elle fait le tour du monde. Zoom : deux doigts ou + / −. Recentrer : ◎. Touchez une province pour voir sa fiche.' },
  { id:'time', title:'Le temps', text:`La partie commence le 1er janvier 2027, en pause. ▶ : 1 jour toutes les ${RT.clock.msPerDay / 1000} secondes ; ⏩ ×2 avec Premium. Il ne s’arrête qu’en pause, dans les menus (⚙, ?, Atouts, Palmarès) et appli fermée.` },
  { id:'move', title:'Donner un ordre', text:`« Déplacer / Attaquer », puis une province verte. Les troupes partent tout de suite : ${DUR.land * DUR.landDistance.min} à ${DUR.land * DUR.landDistance.max} jours vers une province voisine selon la distance, moins en cavalerie seule.` },
  { id:'recruit', title:'Recruter', text:`Chaque + ajoute un lot : ${RULES.units.infantry.amount} fantassins ou ${RULES.units.cavalry.amount} cavaliers en ${DUR.units.infantry} jours ; blindés et artillerie en ${DUR.units.armor} jours (usine). Payé tout de suite.` },
  { id:'build', title:'Construire', text:`Banque : +${or(MONTH.bank)}. Usine : +${or(MONTH.factory)}. Port : +${or(MONTH.port)} et navires. Ferme : +${RT.food.farmDaily} vivres / jour par niveau. Forteresse : −${fortReductionPct(1)} / −${fortReductionPct(2)} / −${fortReductionPct(3)} % de dégâts reçus en défense (niveaux 1 à 3).` },
  { id:'food', title:'Vivres et famine', text:`Chaque province produit ${RT.food.provinceDaily} vivres par jour ; les troupes mangent 1 vivre par jour pour ${RT.food.goldPerRation} or de troupes. Réserve à 0 : famine, −${100 - Math.round(RT.food.famineFireFactor * 100)} % de dégâts et ${RT.food.famineDesertPct} % de l’armée déserte chaque jour.` },
  { id:'attack', title:'Attaque et guerre', text:'Attaquer une nation, c’est entrer en guerre avec elle. On n’attaque jamais un allié : alliance = passage libre chez lui, pour l’aider.' },
  { id:'battle', title:'Batailles', text:`Une bataille commence à l’arrivée : ${RT.battle.assaults} assauts, un tous les ${RT.battle.assaultEveryDays} jours. Les renforts rejoignent le prochain assaut. « Retraite » sur la fiche ⚔. Sans prise au dernier assaut, l’attaquant se replie.` },
  { id:'diplomacy', title:'Diplomatie', text:`Une IA répond à une proposition en quelques jours (${RT.diplomacy.aiAnswerMaxDays} au plus). En guerre, proposez un cessez-le-feu : payez pour l’obtenir, ou exigez de l’or si vous dominez. S’il refuse, aucun or ne bouge.` },
  { id:'history', title:'Alertes et journal', text:'Les bandeaux annoncent les faits importants sans arrêter le temps ; touchez-les pour agir. Le Journal garde les alertes, les propositions à décider et tout l’historique.' },
  { id:'orders', title:'Troupes en route', text:'Touchez une armée ou un navire sur la carte : arrivée prévue, composition, « Rappeler ». Toucher la date en bas à droite les liste toutes.' },
  { id:'maritime', title:'Routes maritimes',
    text:`Les 5 îles forment un anneau. Embarquez depuis un point de port ⚓ que vous possédez : environ ${DUR.sea} jours de mer vers l’île voisine. Sans navires de guerre (port + usine) pour escorter, un convoi intercepté ne se défend pas. Débarquement : combat à ${Math.round(RULES.combat.landingPenalty * 100)} %.` }
    ,
  { id:'endgame', title:'Fin de partie', text:`Une partie dure 15 ans (fin le 31 décembre 2041) ; la courte, 7 ans. Tenir les 5 capitales : victoire immédiate. Sinon, le classement 🏆 à points désigne le vainqueur ; toutes les nations en paix : fin proposée.` },
  { id:'ranking', title:'Classement 🏆', text:`${RT.ranking.province} points par province, +${RT.ranking.capital} par capitale, 1 point par ${RT.ranking.troopGoldPerPoint} or de troupes et de trésor, 1 par ${RT.ranking.noFamineDaysPerPoint} jours sans famine. Mis à jour tous les ${RT.ranking.refreshEveryDays} jours.` },
  { id:'coalition', title:'Coalition', text:`Une nation qui tient ${RULES.coalition.formProvinces} provinces, avec ${RULES.coalition.formLead} d’avance sur la deuxième, déclenche une coalition : selon leur caractère, les dirigeants IA se liguent contre elle, vous compris si c’est vous. Elle prend fin à ${RULES.coalition.dissolveProvinces} provinces ou moins.` },
  { id:'balloon', title:'Ballon d’observation', text:`Construit dans une province avec usine (${RULES.balloon.cost} or, ${DUR.balloon} jours), un seul à la fois. Touchez 🎈 pour l’envoyer : ${DUR.balloonHop} jours par île, il montre tout de l’île survolée. La nation survolée le voit et peut l’abattre, sans guerre.` },
  MYSTERY_HELP, // V16.2
  { id:'intelligence', title:'Renseignement', text:'Vous voyez les troupes près des vôtres et chez vos alliés. Ailleurs : « ? ». Une forteresse ennemie cache ses troupes ; une armée en marche se voit depuis sa province de départ ou d’arrivée.' },
  { id:'gift', title:'La 🎁', text:`Une 🎁 apparaît parfois à gauche de la carte : une courte pub facultative, contre un mois de revenus (${RT.ads.rewardMinGold} or au moins). Elle reste tant que vous ne l’avez pas regardée.` }
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
  // V17.3 : « assaut 2/3 » garde sa barre (chiffre/chiffre) ; les autres « / » et « | » restent retirés.
  // V14.2 : les sauts de ligne voulus (rapport de combat) sont gardés ; le reste des blancs est resserré.
  const text = String(entry?.text ?? '').replace(/\b(undefined|null)\b/gi, '').replace(/(\d)\/(\d)/g, '$1\u2044$2').replace(/[\/|]+/g, ' ').replace(/\u2044/g, '/').split('\n').map(l => l.replace(/\s+/g, ' ').trim()).filter(Boolean).join('\n');
  return text ? { ...entry, text } : null;
}
export function resetActiveSave(storage, key = SAVE_KEY) {
  storage.removeItem(key);
  return !storage.getItem(key);
}
