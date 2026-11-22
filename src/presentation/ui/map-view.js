// Interface — dessin de la carte (provinces, routes, convois, flèches), cadrage et zoom.

import { gameLengthOf } from '../../domain/game-length.js';
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
import { coalitionBanner } from '../coalition-view.js';
import { playSfx, syncMusic } from './audio.js';
import { relationWithPlayer, totalArmy } from '../overview-view.js';
import { tensionLevel } from '../talk-facade.js';
import { MYSTERY_ISLAND_ID, islandMapBadge } from '../mystery-island-view.js';
import { copyShift, detailLevel, wrapMinZoom, iconScale, nationLabels, troopBadges, wrapCopyCount, wrapPeriod, wrapTransform } from '../map-am3-view.js';
import { crestGlyph } from '../leaders-view.js';
import { $, E, icons, nation, province, toast } from './base.js';
import { balloonLayer } from './balloon-ui.js';
import { unitsLayer } from './map-units-layer.js';
import { battlesLayer } from './realtime-battles-ui.js';
import { openPendingOrder, selectProvince } from './province-sheet.js';
import { moveSource, save, selected, state } from './session.js';
import { safeEngine, updateTalkBadge } from './talk-screen.js';
import { refreshTuto, tutoStep } from './tutorials.js';

export let scale = 1, tx = 0, ty = 0, drag = null;
export let pointers = new Map(), pinching = false, pinchStart = null, ignoreClickUntil = 0;
export let frameSize={width:0,height:0}, mapContentSize={width:0,height:0}, transformFrame=0;
// V9 : repère de la carte Leonardo (1536 × 1536). Zoom max plus grand que la V6 (2,5) pour viser 20 provinces sur téléphone.
export const FRAME = map.frame, MAX_ZOOM = 3, PAN_SLACK = .22;
// V17.10.2 : période du défilement sans fin = largeur de la carte + océan (WRAP_OCEAN, map-am3-view.js).
export const PERIOD = wrapPeriod(FRAME);
// Zoom 1 = la carte remplit le cadre (« cover ») ; le zoom minimal montre le monde entier (« contain »).
export let minZoom = 1;
// V17.6 : copies de la carte de chaque côté (défilement horizontal sans fin) et niveau de détail courant.
export let wrapCopies = 1;
let detail = -1;
let backgroundImage = null;
// V17.6 : bleu commun des bords de la carte Leonardo (moyenne des bords) : jointures et marges invisibles.
const SEA_EDGE = '#114464';
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
// V17.6 : pastille sombre du nombre de troupes (vert = soi, bleu = allié, rouge = ennemi, gris = neutre ; « ? » hors de vue)
// au-dessus de la ville, drapeau-emblème sur les capitales.
const TONE_TEXT={own:'vos troupes',ally:'troupes alliées',enemy:'troupes étrangères',neutral:'garnison neutre'};
function provinceLabel(d,p,badge){
  const g=E('g',{class:'province-label',transform:`translate(${d.markerAnchor.x} ${d.markerAnchor.y})`}),inner=E('g',{class:'ui-scale'});
  const owner=nation(p.ownerId);inner.style.setProperty('--owner',owner.color);
  const capitalOf=Object.entries(state.nations).find(([,n])=>n.capitalId===d.id)?.[0];
  // V10 : le « point » de la province (sa ville) est sur l'ancre ; c'est lui que visent les flèches.
  if(capitalOf){
    // Drapeau à gauche de l'étoile (la pastille est au-dessus) : hampe, tissu aux couleurs de la nation, emblème.
    const flag=E('g',{class:'capital-flag'});flag.style.setProperty('--flag',nation(capitalOf).color);
    const crest=E('text',{x:-57,y:-21,class:'flag-crest'});crest.textContent=crestGlyph(nation(capitalOf).crest);
    flag.append(E('path',{d:'M-82 20 V-38',class:'flag-pole'}),E('path',{d:'M-80 -37 H-32 L-41 -21 L-32 -5 H-80 Z',class:'flag-cloth'}),crest);inner.append(flag);
    const star=E('text',{y:3,class:'capital','aria-label':'Capitale nationale'});star.textContent='★';inner.append(star);
  }
  else inner.append(E('circle',{r:13,class:'city'}));
  if(badge){const w=Math.max(44,22+badge.text.length*19),pill=E('g',{class:`troop-badge ${badge.tone}${badge.known?'':' unknown'}`,transform:'translate(0 -52)',
      'aria-label':badge.known?`${badge.text} — ${TONE_TEXT[badge.tone]}`:'Troupes inconnues'});
    const t=E('text',{y:2});t.textContent=badge.text;pill.append(E('rect',{x:-w/2,y:-21,width:w,height:42,rx:21}),t);inner.append(pill);}
  const name=E('text',{class:'name',y:46});name.textContent=d.name;inner.append(name);
  const built=Object.entries(p.buildings||{}).filter(([key,count])=>count&&key!=='port');
  built.forEach(([key,count],i)=>{const symbol=E('text',{x:(i-(built.length-1)/2)*40,y:86,class:'building'});symbol.textContent=`${icons[key]||'•'}${key==='fort'&&count>1?count:''}`;inner.append(symbol);});
  // V16.2 : l'île mystérieuse affiche sa super banque (et 🤝 quand elle a un co-propriétaire).
  if(d.id===MYSTERY_ISLAND_ID){g.classList.add('mystery-island');const badge=E('text',{y:86,class:'building island-badge'});badge.textContent=islandMapBadge(state);inner.append(badge);}
  g.append(inner);return g;
}
// V17.6 : grands noms de nations en travers de leur île (repère de la carte : la taille suit le zoom).
function nationNameLayer(){
  const layer=E('g',{class:'nation-names','aria-hidden':'true'});
  for(const l of safeEngine(()=>nationLabels(map,state,id=>nation(id).short),[])){
    const t=E('text',{class:'nation-name',transform:`translate(${l.x} ${l.y}) rotate(${l.angle})`,'font-size':l.size,'data-nation':l.nationId});
    t.style.setProperty('--owner',nation(l.nationId).color);t.textContent=l.text;layer.append(t);
  }
  return layer;
}
// V13.2 : une province alliée n'est plus proposée en vert (on ne peut pas l'attaquer) ; elle est marquée « alliée ».
// V13.4 : l'alliance donne le passage libre — une province alliée redevient une destination verte (on y stationne).
function destinations(){return new Set(moveSource?legalDestinations(map,state,moveSource).map(x=>x.id):[]);}
// V15.2 : un seul point pour le son « ordre donné » : le nombre d'ordres en attente vient de monter, dans la même partie.
let orderCount=0,orderGame=null;
function announceOrder(){const count=state.orders.filter(o=>o.status==='pending').length;if(orderGame===state&&count>orderCount)playSfx('order');orderGame=state;orderCount=count;}
export function render(){
  const svg=$('#map'),allowed=destinations(),routeLayer=[],defs=E('defs'),badges=safeEngine(()=>troopBadges(state,map),null);
  // V17.6 : tout le dessin va dans #mapWorld ; des copies (<use>) le répètent à gauche et à droite (défilement sans fin).
  // V17.10.2 : deux étages, répétés chacun par ses copies — #mapBase (fond, provinces, liserés, grands noms de nations)
  // puis #mapWorld (routes, drapeaux, étoiles, pastilles, « ? », icônes) : un nom, même celui d'une copie voisine,
  // ne passe jamais devant un drapeau, une capitale, un chiffre ou un marqueur.
  const base=E('g',{id:'mapBase',class:`detail-${Math.max(0,detail)}`}),world=E('g',{id:'mapWorld',class:`detail-${Math.max(0,detail)}`});
  for(const [id,color] of [['arrow-green','#62ed99'],['arrow-red','#ff625b']]){const marker=E('marker',{id,viewBox:'0 0 10 10',refX:'8',refY:'5',markerUnits:'strokeWidth',markerWidth:'3.4',
    markerHeight:'3.4',orient:'auto-start-reverse'});marker.append(E('path',{d:'M 0 0 L 10 5 L 0 10 z',fill:color}));defs.append(marker)}
  backgroundImage ||= E('image',{href:map.image.href,x:0,y:0,width:map.image.width,height:map.image.height,preserveAspectRatio:'none',class:'map-image'});
  const provinceLayer=E('g',{class:'provinces'}),highlightLayer=E('g',{class:'highlights'}),borderLayer=E('g',{class:'territory-borders'}),labelLayer=E('g',{class:'labels'});
  // V17.6 : fondu des bords de l'image vers un même bleu : la jointure entre deux copies (bord droit / bord gauche de
  // l'image, de teintes un peu différentes) et la marge verticale ne se voient pas.
  for(const [id,x1,y1,x2,y2] of [['fade-l',0,0,1,0],['fade-r',1,0,0,0],['fade-t',0,0,0,1],['fade-b',0,1,0,0]]){const g=E('linearGradient',{id,x1,y1,x2,y2});
    g.append(E('stop',{offset:0,'stop-color':SEA_EDGE,'stop-opacity':1}),E('stop',{offset:1,'stop-color':SEA_EDGE,'stop-opacity':0}));defs.append(g);}
  const fade=(x,y,width,height,id)=>E('rect',{x,y,width,height,fill:`url(#${id})`,class:'edge-fade'}),W=FRAME.width,H=FRAME.height,B=70;
  base.append(backgroundImage,fade(-1,0,B,H,'fade-l'),fade(W-B,0,B+1,H,'fade-r'),fade(-1,-1,W+2,B,'fade-t'),fade(-1,H-B,W+2,B+1,'fade-b'),provinceLayer,highlightLayer,borderLayer);
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
  // V17.11 : les 10 routes arrivent au centre de l'île mystérieuse (rien ne s'y construit) : pas de pastille de port sur l'île.
  map.provinces.filter(d=>d.port&&!d.neutral).forEach(d=>routeLayer.push(portMarker(d)));
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
    labelLayer.append(provinceLabel(d,p,badges?.[d.id]));
    group.addEventListener('click',()=>{if(Date.now()<ignoreClickUntil)return;selectProvince(d.id);});
    group.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();selectProvince(d.id);}});provinceLayer.append(group);
  }
  // V17.3 : en temps réel, convois et armées en marche sont des icônes qui avancent chaque jour (map-units-layer.js) ;
  // l'ancien jeton de convoi « tours restants » reste pour le tour par tour.
  const rt=state.mode==='realtime',convoyLayer=E('g',{class:'convoys'});if(!rt)for(const m of convoyMarkers(state,map))convoyLayer.append(convoyMarker(m));
  base.append(nationNameLayer());world.append(...routeLayer,labelLayer,convoyLayer);
  world.append(safeEngine(()=>balloonLayer(),E('g',{class:'balloons'}))); // V16.1 : ballons d'observation (les siens, et les étrangers au-dessus de chez soi)
  if(rt)world.append(safeEngine(()=>unitsLayer(),E('g',{id:'rtUnits'})));
  if(rt)world.append(safeEngine(()=>battlesLayer(),E('g',{id:'rtBattles'}))); // V17.2 / V17.3 : ⚔ « n/3 » des batailles en cours // dans #mapWorld : les copies <use> du défilement sans fin la répètent
  for(const order of playerOrderArrows(state,map)){
    const arrow=E('path',{d:pathData(arrowPoints(order)),class:`order-arrow ${order.kind}${order.routeType==='sea'?' sea':''}`,'data-order-id':order.id,tabindex:'0',role:'button',
      'aria-label':`${order.kind==='bombard'?'Bombardement':order.kind==='attack'?'Attaque':'Déplacement'}${order.routeType==='sea'?` par mer (${order.turns||2} tours)`:''} : ${order.fromName} vers ${order.toName}`}
      );
    arrow.addEventListener('click',event=>{event.stopPropagation();openPendingOrder(order.id)});arrow.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();openPendingOrder(order.id)}});world.append(arrow);
  }
  svg.replaceChildren(defs,base,...wrapUses('#mapBase'),world,...wrapUses('#mapWorld'));
  const coalition=coalitionBanner(state,id=>nation(id).short),chip=$('#coalitionBtn');chip.hidden=!coalition;if(coalition){chip.textContent=coalition.text;chip.dataset.mine=coalition.mine?'1':'0';}
  const army=totalArmy(state,state.playerNationId);if(!rt)$('#turn').innerHTML=`${Math.min(state.turn,gameLengthOf(state))}<span class="turn-max">/${gameLengthOf(state)}</span>`;
    $('#turn').closest('.hud-stat')?.classList.toggle('turn-final',!state.gameOver&&state.turn>gameLengthOf(state)-5);$('#gold').textContent=state.nations[state.playerNationId].treasury;
    $('#armyTotal').textContent=army.total;
  $('#pendingCount').textContent=state.orders.filter(o=>o.status==='pending').length;updateTalkBadge(); if(!rt)save(); /* V17.3 : en temps réel, sauvegarde espacée (realtime-ui.js) */announceOrder();syncMusic();if(tutoStep!==null)queueMicrotask(refreshTuto);
  if(tutoStep===null)$('#miniTuto').classList.toggle('bottom',Boolean(moveSource)); // V13.4 : ne cache pas le bandeau de déplacement (V14.3 : le tutoriel place sa bulle lui-même)
}
// V17.6 : copies de #mapWorld de chaque côté. Elles ne reçoivent pas les touchers eux-mêmes : un toucher sur une copie
// décale la carte d'une largeur (invisible) puis est rejoué sur la carte d'origine (voir onCopyClick).
// V17.10.2 : copies espacées d'une PÉRIODE (carte + océan), plus d'une largeur de carte.
function wrapUses(href){const out=[];for(let k=-wrapCopies;k<=wrapCopies;k++)if(k)out.push(E('use',{href,x:k*PERIOD,y:0,class:'wrap-copy','data-copy':k}));return out;}
const periodPx=()=>mapContentSize.width*PERIOD/FRAME.width;
// La carte est un SVG large de (2 × copies + 1) cartes ; l'origine de la transformation est le centre de la carte d'origine,
// qui reste au centre du cadre : les calculs d'avant (zoom, centrage, vue de lancement) ne changent pas.
export function measureFrame(){const viewport=$('#viewport'),svg=$('#map');frameSize={width:viewport.clientWidth,height:viewport.clientHeight};if(!frameSize.width||!frameSize.height)return;
  const cover=Math.max(frameSize.width/FRAME.width,frameSize.height/FRAME.height);
  mapContentSize={width:FRAME.width*cover,height:FRAME.height*cover};minZoom=wrapMinZoom(frameSize,FRAME,PERIOD); // V17.10.2 : le monde entier, jamais deux fois le même point
  const copies=wrapCopyCount(frameSize.width,periodPx()*minZoom),changed=copies!==wrapCopies;wrapCopies=copies;
  // SVG large de 2 × copies périodes + une carte ; la carte d'origine reste au centre (origine de la transformation).
  const side=wrapCopies*PERIOD,sidePx=wrapCopies*periodPx();svg.setAttribute('viewBox',`${-side} 0 ${FRAME.width+2*side} ${FRAME.height}`);
  Object.assign(svg.style,{position:'absolute',width:`${mapContentSize.width+2*sidePx}px`,height:`${mapContentSize.height}px`,left:`${(frameSize.width-mapContentSize.width)/2-sidePx}px`,
    top:`${(frameSize.height-mapContentSize.height)/2}px`,transformOrigin:`${sidePx+mapContentSize.width/2}px 50%`});
  if(changed&&svg.querySelector('#mapWorld')){const keep=[...svg.children].filter(c=>!c.classList.contains('wrap-copy')),[d,b,w]=['defs','#mapBase','#mapWorld'].map(q=>keep.find(c=>c.matches(q)));
    svg.replaceChildren(d,b,...wrapUses('#mapBase'),w,...wrapUses('#mapWorld'));}
  clampTransform();updateLabelScale();}
// Centre la vue sur une province (capitale du joueur au lancement).
export function focusProvince(id){const d=province(id);if(!mapContentSize.width)return;const k=mapContentSize.width/FRAME.width;tx=(FRAME.width/2-d.markerAnchor.x)*k*scale;ty=(FRAME.height/2-d.markerAnchor.y)*k*scale;clampTransform(0);}
// Les icônes et noms rétrécissent un peu quand on zoome (sinon ils deviendraient énormes) : appliqué en fin de geste.
// V14.1 : vue de lancement = capitale du joueur au centre de l'écran (zoom juste suffisant), et bouton qui bascule
// entre « Voir toute la carte » et « Revenir à ma capitale ».
// V17.6 : la carte boucle horizontalement : seul le vertical décide du zoom de lancement, et la capitale est toujours centrée.
export function applyLaunchView(){if(!state||!mapContentSize.width)return;const anchor=province(state.nations[state.playerNationId]?.capitalId||'p01').markerAnchor;
  const v=launchView({anchor:{x:FRAME.width/2,y:anchor.y},frame:FRAME,viewport:frameSize,content:mapContentSize}),k=mapContentSize.width/FRAME.width;
  scale=v.scale;tx=(FRAME.width/2-anchor.x)*k*scale;ty=v.y;clampTransform();updateLabelScale();}
function updateWholeMapButton(){const b=$('#wholeMapBtn');if(!b)return;b.hidden=minZoom>=.999;// écran presque carré : la carte entière tient déjà
  const whole=showsWholeMap(scale,minZoom);b.textContent=whole?`◎ ${BACK_TO_CAPITAL_LABEL}`:`🗺 ${WHOLE_MAP_LABEL}`;b.dataset.whole=whole?'1':'0';}
// V17.6 : --ui = zoom^-0,75 (lisible dézoomé), niveau de détail (data-detail) changé seulement quand il change.
export function updateLabelScale(){updateWholeMapButton();const svg=$('#map');svg.style.setProperty('--ui',iconScale(scale).toFixed(3));svg.style.setProperty('--line',(1/Math.pow(scale,.7)).toFixed(3));
  const level=detailLevel(mapContentSize.width/FRAME.width*scale);if(level!==detail){detail=level;svg.dataset.detail=String(level);svg.querySelector('#mapWorld')?.setAttribute('class',`detail-${level}`);svg.querySelector('#mapBase')?.setAttribute('class',`detail-${level}`);}}
// (la classe est sur #mapWorld et #mapBase, pas sur #map : les copies <use> la reçoivent aussi)
// edgeSlack : marge de glisse au-delà du bord vertical (0 = la carte reste calée sur le cadre, utilisé pour recentrer).
// V17.6 : horizontalement, plus de bord : x est ramené modulo la largeur d'une copie.
export function clampTransform(edgeSlack=PAN_SLACK){
  if(!frameSize.width||!frameSize.height)return;
  const next=wrapTransform({scale,x:tx,y:ty},frameSize,mapContentSize,MAX_ZOOM,minZoom,edgeSlack,periodPx());
  scale=next.scale;tx=next.x;ty=next.y;
  if(!transformFrame)transformFrame=requestAnimationFrame(applyTransform);
}
function applyTransform(){if(transformFrame)cancelAnimationFrame(transformFrame);transformFrame=0;$('#map').style.transform=`translate3d(${tx}px,${ty}px,0) scale(${scale})`;}
// Toucher une copie : la carte d'origine est amenée sous le doigt (décalage d'une ou plusieurs largeurs, invisible), puis le
// même toucher est rejoué sur l'élément d'origine (province, convoi, ballon, flèche d'ordre).
function onCopyClick(event){
  const use=event.target?.closest?.('use.wrap-copy');if(!use)return;
  event.stopPropagation();event.preventDefault();if(Date.now()<ignoreClickUntil)return;
  tx+=copyShift(use.dataset.copy,mapContentSize,scale,periodPx());applyTransform();
  const hit=document.elementFromPoint(event.clientX,event.clientY);
  if(hit&&hit.closest('#mapWorld,#mapBase'))hit.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true,clientX:event.clientX,clientY:event.clientY}));
  clampTransform();
}
$('#viewport')?.addEventListener('click',onCopyClick,true);
export function pointerDistance(a,b){return Math.hypot(a.x-b.x,a.y-b.y);}
export const viewport=$('#viewport');
// V17.10.2 : arrivé au zoom minimal (boutons ou pincement), le monde est recentré : les 5 nations et l'île d'un coup,
// jamais coupées par le bord (on peut ensuite faire glisser la carte librement).
export function zoomBy(factor){const next=Math.max(minZoom,Math.min(MAX_ZOOM,scale*factor)),ratio=next/scale;scale=next;tx*=ratio;ty*=ratio;if(scale<=minZoom+1e-6){tx=0;ty=0;}clampTransform();updateLabelScale();}
export function centerIfWholeMap(){if(scale>minZoom+1e-6)return false;tx=0;ty=0;clampTransform(0);return true;}
export const setScale = value => { scale = value; };
export const setTx = value => { tx = value; };
export const setTy = value => { ty = value; };
export const setPinching = value => { pinching = value; };
export const setDrag = value => { drag = value; };
export const setPinchStart = value => { pinchStart = value; };
export const setIgnoreClickUntil = value => { ignoreClickUntil = value; };
