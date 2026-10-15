import { clampMapTransform } from './v3-ux.js';

export function playerOrderArrows(state,map,playerNationId=state.playerNationId){
  const byId=new Map(map.provinces.map(p=>[p.id,p]));
  return (state.orders||[]).filter(o=>o.kind==='move'&&o.status==='pending'&&o.nationId===playerNationId).flatMap(order=>{
    const from=byId.get(order.fromId),to=byId.get(order.toId),target=state.provinces[order.toId];
    if(!from||!to||!target)return[];
    const attack=target.ownerId!==playerNationId;
    return [{id:order.id,kind:attack?'attack':'move',color:attack?'red':'green',fromId:order.fromId,toId:order.toId,fromName:from.name,toName:to.name,start:from.markerAnchor,end:to.markerAnchor}];
  });
}

export function cancelPendingOrder(state,orderId,nationId=state.playerNationId){
  const index=(state.orders||[]).findIndex(order=>order.id===orderId&&order.nationId===nationId&&order.status==='pending');
  if(index<0)return{ok:false,error:'Ordre en attente introuvable'};
  const [order]=state.orders.splice(index,1);
  return{ok:true,order};
}

export function pinchTransform({scale,x,y,startMidX,startMidY,midX,midY,centerX,centerY,startDistance,currentDistance}){
  const nextScale=!(startDistance>0&&currentDistance>0)?scale:Math.max(1,Math.min(2.5,scale*currentDistance/startDistance));
  const ratio=nextScale/scale;
  return{scale:nextScale,x:midX-centerX-(startMidX-centerX-x)*ratio,y:midY-centerY-(startMidY-centerY-y)*ratio};
}

export function mapFrameTransform(transform,viewport,mapSize){
  return clampMapTransform({...transform,viewportWidth:viewport.width,viewportHeight:viewport.height,mapWidth:mapSize.width,mapHeight:mapSize.height});
}

export function ceasefireOffers(targetTreasury){
  const treasury=Math.max(0,Math.floor(Number(targetTreasury)||0));
  return [.75,.5,.25].map(offerLevel=>({offerLevel,amount:Math.floor(treasury*offerLevel),acceptanceProbability:1-offerLevel}));
}

export function journalCategoryClass(type){
  return ({'CONQUÊTE':'conquest','TERRITOIRE PERDU':'lost','CONFLIT ÉTRANGER':'foreign-conflict','COMBAT':'combat'})[type]||'neutral';
}
