// Interface — dessin de la carte (provinces, routes, convois, flèches), cadrage et zoom.

import { RULES } from '../../domain/constants.js';
import { guestsAt, legalDestinations } from '../../domain/game-engine.js';
import { arkenV9Map as map } from '../../map/arken-v9-map.js';
import { allyBlockedTarget } from '../ceasefire-view.js';
import { BACK_TO_CAPITAL_LABEL, WHOLE_MAP_LABEL, launchView, showsWholeMap } from '../launch-view.js';
import { convoyTokenPosition, tensionBorderGroups } from '../leaders-view.js';
import {
  convoyMarkers, mapFrameTransform, nationsAtWarWith, orderPath, outlinePath, playerOrderArrows, territoryBorders,
  territoryOutline, trimPolyline
} from '../map-orders-view.js';
import { relationWithPlayer, totalArmy } from '../overview-view.js';
import { tensionLevel } from '../talk-facade.js';
import { knownTroopProvinces } from '../vision-view.js';
import { $, E, icons, nation, province, toast } from './base.js';
import { openPendingOrder, selectProvince } from './province-sheet.js';
import { moveSource, save, selected, state } from './session.js';
import { safeEngine, updateTalkBadge } from './talk-screen.js';
import { refreshTuto, tutoStep } from './tutorials.js';

export let scale = 1, tx = 0, ty = 0, drag = null;
export let pointers = new Map(), pinching = false, pinchStart = null, ignoreClickUntil = 0;
export let frameSize={width:0,height:0}, mapContentSize={width:0,height:0}, transformFrame=0;
// V9 : repère de la carte Leonardo (1536 × 1536). Zoom max plus grand que la V6 (2,5) pour viser 20 provinces sur téléphone.
export const FRAME = map.frame, MAX_ZOOM = 3, PAN_SLACK = .22;
// Zoom 1 = la carte remplit le cadre (« cover ») ; le zoom minimal montre le monde entier (« contain »).
export let minZoom = 1;
let backgroundImage = null;
const pathData = points => points.map((pt,i)=>`${i?'L':'M'}${Math.round(pt.x)} ${Math.round(pt.y)}`).join(' ');
// Route maritime : liseré sombre + pointillés clairs, épaisseur adaptée au zoom (--line).
// V13 : routes neutres, une seule couleur (plus d'état jaune « open » hérité de la V9).
function seaLane(lane){
  const a=province(lane.from),b=province(lane.to);
  const d=pathData([a.port?.anchor||a.markerAnchor,...lane.waypoints,b.port?.anchor||b.markerAnchor]),g=E('g',{class:'route maritime','data-lane':`${lane.from}-${lane.to}`});
  g.append(E('path',{d,class:'casing'}),E('path',{d,class:'dash'}));return g;
}
// Port : ancre aux couleurs de la nation propriétaire de la province (V13 : construit ou non).
// Non construit = « point d'embarquement » (pastille en pointillés) ; construit = pastille pleine cerclée d'or.
function portMarker(d){
  const p=state.provinces[d.id],built=Boolean(p.buildings.port),color=nation(p.ownerId).color;
  const g=E('g',{class:`port-marker${built?' built':' site'}`,'data-port':d.id,'data-owner':p.ownerId,transform:`translate(${d.port.anchor.x} ${d.port.anchor.y})`,'aria-label':`${built?'Port':'Point d’embarquement'} de ${d.name} (${nation(p.ownerId).short})`}),inner=E('g',{class:'ui-scale'});
  inner.style.setProperty('--port',color);
  const icon=E('text',{y:1});icon.textContent='⚓';inner.append(E('circle',{r:built?25:21}),icon);g.append(inner);return g;
}
// Convoi en mer (V10 marine) : points d'étape sur la route, jeton aux couleurs de la nation avec les tours restants.
function convoyMarker(m){
  const color=nation(m.nationId).color,g=E('g',{class:`convoy${m.own?' own':''}${m.returning?' returning':''}`,'data-convoy':m.id,role:'button',tabindex:'0',
    'aria-label':`Convoi de ${nation(m.nationId).short} vers ${province(m.toId).name}, ${m.remaining} tour${m.remaining>1?'s':''} restant${m.remaining>1?'s':''}`});
  g.style.setProperty('--nation',color);
  if(m.own){g.append(E('path',{d:pathData([m.position,...m.path.filter((_,i,a)=>i>0&&pathProgress(a,i)>m.stage/m.turns)]),class:'convoy-wake'}));}
  for(const p of m.stages)g.append(E('circle',{cx:p.x,cy:p.y,r:9,class:'convoy-stage'}));
  // V11 (testeur V10) : au départ, le jeton glisse le long de la route pour ne pas masquer les ancres de port voisines ;
  // un petit repère relié au jeton garde la position réelle du convoi.
  const at=convoyTokenPosition(m,map);
  if(at.shifted){g.append(E('line',{x1:m.position.x,y1:m.position.y,x2:at.x,y2:at.y,class:'convoy-tether'}),E('circle',{cx:m.position.x,cy:m.position.y,r:7,class:'convoy-origin'}));}
  const token=E('g',{transform:`translate(${Math.round(at.x)} ${Math.round(at.y)})`}),inner=E('g',{class:'ui-scale'});
  const ship=E('text',{y:-4,class:'convoy-ship'});ship.textContent='⛵';
  const left=E('text',{y:30,class:'convoy-turns'});left.textContent=`${m.remaining}`;
  inner.append(E('rect',{x:-30,y:-34,width:60,height:78,rx:16,class:'convoy-body'}),ship,left);token.append(inner);g.append(token);
  g.addEventListener('click',event=>{event.stopPropagation();showConvoy(m);});
  return g;
}
function pathProgress(points,i){let total=0,upto=0;for(let k=1;k<points.length;k++){const d=Math.hypot(points[k].x-points[k-1].x,points[k].y-points[k-1].y);total+=d;if(k<=i)upto+=d;}return total?upto/total:1;}
function showConvoy(m){
  const what=m.own?[m.troops?`${m.troops} unités terrestres`:'',m.warships?`${m.warships} navire${m.warships>1?'s':''} de guerre`:'sans escorte'].filter(Boolean).join(' · '):'composition inconnue';
  toast(`${m.returning?'Retour':'Convoi'} de ${nation(m.nationId).short} → ${province(m.toId).name} : ${m.remaining} tour${m.remaining>1?'s':''} restant${m.remaining>1?'s':''} (${what})`);
}
// Flèche d'ordre (V10) : part du point de la province de départ et vise le point de la province d'arrivée ;
// par mer, elle suit la route (port, étapes) puis termine sur le point.
function arrowPoints(order){return trimPolyline(orderPath(map,order),26,22);}
// Icônes d'une province, en coordonnées locales autour de son centre ; « ui-scale » les garde lisibles quel que soit le zoom.
function provinceLabel(d,p,troopsKnown=true){
  const g=E('g',{class:'province-label',transform:`translate(${d.markerAnchor.x} ${d.markerAnchor.y})`}),inner=E('g',{class:'ui-scale'});
  inner.style.setProperty('--owner',nation(p.ownerId).color);
  const capital=Object.values(state.nations).some(n=>n.capitalId===d.id),troops=Object.values(p.units).some(Boolean)||p.warships||guestsAt(state,d.id).length>0;
  // V10 : le « point » de la province (sa ville) est sur l'ancre ; c'est lui que visent les flèches.
  if(capital){const star=E('text',{y:3,class:'capital','aria-label':'Capitale nationale'});star.textContent='★';inner.append(star);}
  else inner.append(E('circle',{r:13,class:'city'}));
  if(!troopsKnown){const t=E('text',{x:30,y:-22,class:'troops unknown','aria-label':'Troupes inconnues'});t.textContent='?';inner.append(t);}
  else if(troops){const t=E('text',{x:30,y:-22,class:'troops','aria-label':'Troupes présentes'});t.textContent='⚔';inner.append(t);}
  const name=E('text',{class:'name',y:46});name.textContent=d.name;inner.append(name);
  const built=Object.entries(p.buildings||{}).filter(([key,count])=>count&&key!=='port');
  built.forEach(([key,count],i)=>{const symbol=E('text',{x:(i-(built.length-1)/2)*40,y:86,class:'building'});symbol.textContent=`${icons[key]||'•'}${key==='fort'&&count>1?count:''}`;inner.append(symbol);});
  g.append(inner);return g;
}
// V13.2 : une province alliée n'est plus proposée en vert (on ne peut pas l'attaquer) ; elle est marquée « alliée ».
// V13.4 : l'alliance donne le passage libre — une province alliée redevient une destination verte (on y stationne).
function destinations(){return new Set(moveSource?legalDestinations(map,state,moveSource).map(x=>x.id):[]);}
export function render(){
  const svg=$('#map'),allowed=destinations(),routeLayer=[],defs=E('defs'),known=safeEngine(()=>knownTroopProvinces(state,map),null);
  for(const [id,color] of [['arrow-green','#62ed99'],['arrow-red','#ff625b']]){const marker=E('marker',{id,viewBox:'0 0 10 10',refX:'8',refY:'5',markerUnits:'strokeWidth',markerWidth:'3.4',
    markerHeight:'3.4',orient:'auto-start-reverse'});marker.append(E('path',{d:'M 0 0 L 10 5 L 0 10 z',fill:color}));defs.append(marker)}
  backgroundImage ||= E('image',{href:map.image.href,x:0,y:0,width:map.image.width,height:map.image.height,preserveAspectRatio:'none',class:'map-image'});
  const provinceLayer=E('g',{class:'provinces'}),highlightLayer=E('g',{class:'highlights'}),borderLayer=E('g',{class:'territory-borders'}),labelLayer=E('g',{class:'labels'});
  svg.replaceChildren(defs,backgroundImage,provinceLayer,highlightLayer,borderLayer);
  // V10 : liseré bleu = mon territoire, liseré rouge = nations en guerre contre moi (au-dessus du voile et de la sélection).
  // Chaque liseré est découpé à l'intérieur de son territoire : bleu et rouge ne se recouvrent jamais à une frontière commune.
  const polygonPoints=id=>province(id).geometry.points.map(x=>x.join(',')).join(' ');
  // V11 : liseré orange discret = nation « au bord de la guerre » avec moi (pas encore en guerre : sinon liseré rouge).
  const brink=safeEngine(()=>tensionBorderGroups(state,map,id=>tensionLevel(state,state.playerNationId,id),nationsAtWarWith(state)),[]);
  for(const border of [...brink.map(g=>({...g,segments:territoryOutline(map,g.provinceIds)}
    )),...territoryBorders(state,map)]){const clipId=`clip-${border.kind}-${border.nationId}`,clip=E('clipPath',{id:clipId});
    border.provinceIds.forEach(id=>clip.append(E('polygon',{points:polygonPoints(id)})));defs.append(clip);
    const d=outlinePath(border.segments);borderLayer.append(E('path',{d,class:`territory ${border.kind}`,'data-nation':border.nationId,'clip-path':`url(#${clipId})`}));}
  if(selected&&!moveSource){const clip=E('clipPath',{id:'clip-selected'});clip.append(E('polygon',{points:polygonPoints(selected)}));defs.append(clip);}
  map.seaLanes.forEach(lane=>routeLayer.push(seaLane(lane)));
  map.provinces.filter(d=>d.port).forEach(d=>routeLayer.push(portMarker(d)));
  for(const d of map.provinces){
    const p=state.provinces[d.id],diploState=relationWithPlayer(state,p.ownerId),classes=['province'];
    if(selected===d.id)classes.push('selected');
    if(p.ownerId===state.playerNationId&&!moveSource)classes.push('player-province');
    if(moveSource)classes.push(d.id===moveSource?'source':allowed.has(d.id)?`destination${allyBlockedTarget(state,state.playerNationId,d.id)?' ally-passage':''}`:'blocked');
    const group=E('g',{class:classes.join(' '),'data-id':d.id,role:'button',tabindex:'0','aria-label':`${d.name}, ${nation(p.ownerId).short}`});
    group.style.setProperty('--owner',nation(p.ownerId).color);group.style.setProperty('--diplo',diploState==='war'?'#e45c56':diploState==='alliance'?'#3fcf74':'#f3f1e9');
    // Le polygone est à la fois le dessin et la zone tactile (plus de chevauchement : B7).
    const points=d.geometry.points.map(x=>x.join(',')).join(' ');group.append(E('polygon',{points,class:'area'}));
    if((selected===d.id&&!moveSource)||d.id===moveSource||(moveSource&&allowed.has(d.id))){const kind=moveSource&&allowed.has(d.id)?'destination':'selected',attrs={points,class:`outline ${kind}`};
      if(kind==='selected'&&selected===d.id&&!moveSource)attrs['clip-path']='url(#clip-selected)';highlightLayer.append(E('polygon',attrs));}
    labelLayer.append(provinceLabel(d,p,!known||known.has(d.id)));
    group.addEventListener('click',()=>{if(Date.now()<ignoreClickUntil)return;selectProvince(d.id);});
    group.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();selectProvince(d.id);}});provinceLayer.append(group);
  }
  const convoyLayer=E('g',{class:'convoys'});for(const m of convoyMarkers(state,map))convoyLayer.append(convoyMarker(m));
  svg.append(...routeLayer,labelLayer,convoyLayer);
  for(const order of playerOrderArrows(state,map)){
    const arrow=E('path',{d:pathData(arrowPoints(order)),class:`order-arrow ${order.kind}${order.routeType==='sea'?' sea':''}`,'data-order-id':order.id,tabindex:'0',role:'button',
      'aria-label':`${order.kind==='bombard'?'Bombardement':order.kind==='attack'?'Attaque':'Déplacement'}${order.routeType==='sea'?` par mer (${order.turns||2} tours)`:''} : ${order.fromName} vers ${order.toName}`}
      );
    arrow.addEventListener('click',event=>{event.stopPropagation();openPendingOrder(order.id)});arrow.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();openPendingOrder(order.id)}});svg.append(arrow);
  }
  const army=totalArmy(state,state.playerNationId);$('#turn').innerHTML=`${Math.min(state.turn,RULES.gameLength)}<span class="turn-max">/${RULES.gameLength}</span>`;
    $('#turn').closest('.hud-stat')?.classList.toggle('turn-final',!state.gameOver&&state.turn>RULES.gameLength-5);$('#gold').textContent=state.nations[state.playerNationId].treasury;
    $('#armyTotal').textContent=army.total;
  $('#pendingCount').textContent=state.orders.filter(o=>o.status==='pending').length;updateTalkBadge(); save();if(tutoStep!==null)queueMicrotask(refreshTuto);
  if(tutoStep===null)$('#miniTuto').classList.toggle('bottom',Boolean(moveSource)); // V13.4 : ne cache pas le bandeau de déplacement (V14.3 : le tutoriel place sa bulle lui-même)
}
export function measureFrame(){const viewport=$('#viewport'),svg=$('#map');frameSize={width:viewport.clientWidth,height:viewport.clientHeight};if(!frameSize.width||!frameSize.height)return;
  const cover=Math.max(frameSize.width/FRAME.width,frameSize.height/FRAME.height),contain=Math.min(frameSize.width/FRAME.width,frameSize.height/FRAME.height);
  mapContentSize={width:FRAME.width*cover,height:FRAME.height*cover};minZoom=Math.min(1,contain/cover);
  Object.assign(svg.style,{position:'absolute',width:`${mapContentSize.width}px`,height:`${mapContentSize.height}px`,left:`${(frameSize.width-mapContentSize.width)/2}px`,top:`${(frameSize.height-mapContentSize.height)/2}px`});clampTransform();}
// Centre la vue sur une province (capitale du joueur au lancement).
export function focusProvince(id){const d=province(id);if(!mapContentSize.width)return;const k=mapContentSize.width/FRAME.width;tx=(FRAME.width/2-d.markerAnchor.x)*k*scale;ty=(FRAME.height/2-d.markerAnchor.y)*k*scale;clampTransform(0);}
// Les icônes et noms rétrécissent un peu quand on zoome (sinon ils deviendraient énormes) : appliqué en fin de geste.
// V14.1 : vue de lancement = capitale du joueur au centre de l'écran (zoom juste suffisant), et bouton qui bascule
// entre « Voir toute la carte » et « Revenir à ma capitale ».
export function applyLaunchView(){if(!state||!mapContentSize.width)return;const v=launchView({anchor:province(state.nations[state.playerNationId]?.capitalId||'p01').markerAnchor,frame:FRAME,viewport:frameSize,content:mapContentSize});scale=v.scale;tx=v.x;ty=v.y;clampTransform();updateLabelScale();}
function updateWholeMapButton(){const b=$('#wholeMapBtn');if(!b)return;b.hidden=minZoom>=.999;// écran presque carré : la carte entière tient déjà
  const whole=showsWholeMap(scale,minZoom);b.textContent=whole?`◎ ${BACK_TO_CAPITAL_LABEL}`:`🗺 ${WHOLE_MAP_LABEL}`;b.dataset.whole=whole?'1':'0';}
export function updateLabelScale(){updateWholeMapButton();const svg=$('#map');svg.style.setProperty('--ui',(1/Math.sqrt(Math.max(1,scale))).toFixed(3));svg.style.setProperty('--line',(1/Math.pow(scale,.7)).toFixed(3));}
// edgeSlack : marge de glisse au-delà du bord (0 = la carte reste calée sur le cadre, utilisé pour recentrer).
export function clampTransform(edgeSlack=PAN_SLACK){
  if(!frameSize.width||!frameSize.height)return;
  const next=mapFrameTransform({scale,x:tx,y:ty},frameSize,mapContentSize,MAX_ZOOM,minZoom,edgeSlack);
  scale=next.scale;tx=next.x;ty=next.y;
  if(!transformFrame)transformFrame=requestAnimationFrame(()=>{transformFrame=0;$('#map').style.transform=`translate3d(${tx}px,${ty}px,0) scale(${scale})`;});
}
export function pointerDistance(a,b){return Math.hypot(a.x-b.x,a.y-b.y);}
export const viewport=$('#viewport');
export function zoomBy(factor){const next=Math.max(minZoom,Math.min(MAX_ZOOM,scale*factor)),ratio=next/scale;scale=next;tx*=ratio;ty*=ratio;clampTransform();updateLabelScale();}
export const setScale = value => { scale = value; };
export const setTx = value => { tx = value; };
export const setTy = value => { ty = value; };
export const setPinching = value => { pinching = value; };
export const setDrag = value => { drag = value; };
export const setPinchStart = value => { pinchStart = value; };
export const setIgnoreClickUntil = value => { ignoreClickUntil = value; };
