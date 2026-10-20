import { LAND_UNIT_TYPES } from '../domain/constants.js';
import { troopsKnownTo } from '../domain/vision.js';
export function clampMapTransform({scale,x,y,viewportWidth,viewportHeight,mapWidth,mapHeight,minVisible=.6,maxScale=2.5,minScale=1}){
  const safeScale=Math.max(minScale,Math.min(maxScale,Number(scale)||1)),w=mapWidth*safeScale,h=mapHeight*safeScale;
  const bound=(position,content,viewport)=>content<=viewport?0:Math.max(-(content-viewport)/2,Math.min((content-viewport)/2,Number(position)||0));
  return{scale:safeScale,x:bound(Number(x)||0,w,viewportWidth),y:bound(Number(y)||0,h,viewportHeight)};
}
export function totalArmy(state,nationId){const out=Object.fromEntries([...LAND_UNIT_TYPES,'warship'].map(k=>[k,0]));for(const p of Object.values(state.provinces))if(p.ownerId===nationId){for(const k of LAND_UNIT_TYPES)out[k]+=p.units[k]||0;out.warship+=p.warships||0}for(const t of state.transports||[])if(t.nationId===nationId){for(const k of LAND_UNIT_TYPES)out[k]+=t.units[k]||0;out.warship+=t.warships||0}for(const t of state.stationed||[])if(t.nationId===nationId){for(const k of LAND_UNIT_TYPES)out[k]+=t.units?.[k]||0;out.warship+=t.warships||0}return{byType:out,total:Object.values(out).reduce((a,b)=>a+b,0)}}
export function relationWithPlayer(state,nationId){if(nationId===state.playerNationId)return'own';if(state.diplomacy.wars.some(w=>w.active!==false&&w.participants.includes(nationId)&&w.participants.includes(state.playerNationId)))return'war';if(state.diplomacy.treaties.some(t=>t.active!==false&&t.type==='alliance'&&t.parties.includes(nationId)&&t.parties.includes(state.playerNationId)))return'alliance';if(state.diplomacy.treaties.some(t=>t.active!==false&&t.type==='ceasefire'&&t.parties.includes(nationId)&&t.parties.includes(state.playerNationId)))return'ceasefire';return'neutral'}
// V13 : pas de guerre entre alliés — « Déclarer la guerre » est bloqué tant que l'alliance tient ; « Rompre l'alliance »
// n'apparaît qu'avec un allié.
export function diplomacyActions(state,target){const r=relationWithPlayer(state,target);return[
 {id:'war',label:'Déclarer la guerre',enabled:r!=='war'&&r!=='own'&&r!=='alliance',reason:r==='war'?'Déjà en guerre':r==='alliance'?'Vous êtes alliés : rompez d’abord l’alliance':''},
 ...(r==='alliance'?[{id:'break',label:'Rompre l’alliance',enabled:true,reason:''}]:[]),
 {id:'alliance',label:'Proposer une alliance',enabled:r==='neutral'||r==='ceasefire',reason:r==='war'?'Concluez d’abord un cessez-le-feu':r==='alliance'?'Alliance déjà active':''},
 {id:'ultimatum',label:'Cessez-le-feu (payer ou exiger de l’or)',enabled:r==='war',reason:r!=='war'?'Seulement en temps de guerre':''}];}
// V13 : la règle « ballon » est remplacée par la vision (src/domain/vision.js, docs/V13-vision.md).
export function canKnowProvinceForces(state,map,provinceId){return troopsKnownTo(state,map,state.playerNationId,provinceId);}
export function compactForces(state,map,provinceId){const p=state.provinces[provinceId];if(!canKnowProvinceForces(state,map,provinceId))return[{label:'Renseignement',value:'Forces inconnues'}];const labels={infantry:'Infanterie',cavalry:'Cavalerie',armor:'Blindés',artillery:'Artillerie',warship:'Navires'};const rows=LAND_UNIT_TYPES.filter(k=>(p.units[k]||0)>0).map(k=>({label:labels[k],value:p.units[k]}));if(p.warships)rows.push({label:labels.warship,value:p.warships});return rows.length?rows:[{label:'Forces',value:'Aucune'}]}
export function markTutorialSeen(state,id){if(!state.tutorial.seen.includes(id))state.tutorial.seen.push(id);return state.tutorial.seen}
