import { clampMapTransform } from './v3-ux.js';

export function playerOrderArrows(state,map,playerNationId=state.playerNationId){
  const byId=new Map(map.provinces.map(p=>[p.id,p]));
  return (state.orders||[]).filter(o=>o.kind==='move'&&o.status==='pending'&&o.nationId===playerNationId).flatMap(order=>{
    const from=byId.get(order.fromId),to=byId.get(order.toId),target=state.provinces[order.toId];
    if(!from||!to||!target)return[];
    const attack=target.ownerId!==playerNationId;
    return [{id:order.id,kind:attack?'attack':'move',color:attack?'red':'green',fromId:order.fromId,toId:order.toId,fromName:from.name,toName:to.name,start:from.markerAnchor,end:to.markerAnchor,routeType:order.routeType||'land'}];
  });
}

// Tracé d'un ordre : par mer, il suit la route maritime (centre → ancre du port → waypoints → ancre → centre) ;
// par terre, segment direct entre les centres. Les points sont dans le repère de la carte.
export function orderPath(map,{fromId,toId,routeType}){
  const byId=id=>map.provinces.find(p=>p.id===id),from=byId(fromId),to=byId(toId);
  if(!from||!to)return[];
  if(routeType==='sea'&&from.port&&to.port){
    const lane=(map.seaLanes||[]).find(l=>(l.from===fromId&&l.to===toId)||(l.from===toId&&l.to===fromId));
    const waypoints=lane?(lane.from===fromId?lane.waypoints:[...lane.waypoints].reverse()):[];
    return[from.markerAnchor,from.port.anchor,...waypoints,to.port.anchor,to.markerAnchor];
  }
  return[from.markerAnchor,to.markerAnchor];
}

export function cancelPendingOrder(state,orderId,nationId=state.playerNationId){
  const index=(state.orders||[]).findIndex(order=>order.id===orderId&&order.nationId===nationId&&order.status==='pending');
  if(index<0)return{ok:false,error:'Ordre en attente introuvable'};
  const [order]=state.orders.splice(index,1);
  return{ok:true,order};
}

export function pinchTransform({scale,x,y,startMidX,startMidY,midX,midY,centerX,centerY,startDistance,currentDistance,maxScale=2.5,minScale=1}){
  const nextScale=!(startDistance>0&&currentDistance>0)?scale:Math.max(minScale,Math.min(maxScale,scale*currentDistance/startDistance));
  const ratio=nextScale/scale;
  return{scale:nextScale,x:midX-centerX-(startMidX-centerX-x)*ratio,y:midY-centerY-(startMidY-centerY-y)*ratio};
}

export function mapFrameTransform(transform,viewport,mapSize,maxScale=2.5,minScale=1){
  return clampMapTransform({...transform,viewportWidth:viewport.width,viewportHeight:viewport.height,mapWidth:mapSize.width,mapHeight:mapSize.height,maxScale,minScale});
}

export function ceasefireOffers(targetTreasury){
  const treasury=Math.max(0,Math.floor(Number(targetTreasury)||0));
  return [.75,.5,.25].map(offerLevel=>({offerLevel,amount:Math.floor(treasury*offerLevel),acceptanceProbability:1-offerLevel}));
}

export function journalCategoryClass(type){
  return ({'CONQUÊTE':'conquest','TERRITOIRE PERDU':'lost','CONFLIT ÉTRANGER':'foreign-conflict','COMBAT':'combat'})[type]||'neutral';
}
