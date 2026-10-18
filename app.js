import { arkenV9Map as map } from './src/map/arken-v9-map.js';
import { createGameState } from './src/state/create-game-state.js';
import { encodeSave, decodeSave } from './src/persistence/save-codec.js';
import { eventKnownToPlayer, journalEntry, legalDestinations, nextTurn, queueConstruction, queueDiplomaticOrder, queueMoveOrder, queueRecruitment, availableForces, spendableTreasury, embarkStatus, seaRoutesFrom, gameRanking, incomeBreakdown, buildingIncome } from './src/domain/game-engine.js';
import { compactForces, diplomacyActions, relationWithPlayer, totalArmy } from './src/presentation/v3-ux.js';
import { forceSelection, SAVE_KEY, TUTORIAL_GUIDE, sanitizeJournalEntry } from './src/presentation/v4-ux.js';
import { cancelPendingOrder, ceasefireOffers, journalCategoryClass, mapFrameTransform, pinchTransform, playerOrderArrows, orderPath } from './src/presentation/v5-ux.js';
import { resolveNewGameRequest } from './src/presentation/start-flow.js';
import { setActiveScreen } from './src/presentation/screen-flow.js';
import { territoryBorders, outlinePath, trimPolyline, unitPrerequisiteText, buildingUnavailableReason, convoyMarkers, forceHealthRows } from './src/presentation/v5-ux.js';
import { RULES, LAND_UNIT_TYPES } from './src/domain/constants.js';
import { seaMoveRefusal, isPortPoint } from './src/domain/game-engine.js'; // V13 : mer en anneau, points de port
import { talkOptions, queueTalk, tensionLevel, leaderHint } from './src/presentation/v11-talk-ui.js';
import { TONE_ORDER, toneMeta, crestGlyph, talkFeed, talkBadgeCount, tensionGauge, tensionBorderGroups, convoyTokenPosition } from './src/presentation/v11-ux.js';
import { nationsAtWarWith, territoryOutline } from './src/presentation/v5-ux.js';
// V13 : vision (brouillard de guerre) et PV lisibles (« Régiment : 344 PV · 52 dégâts par assaut »).
import { provinceTroopView, knownTroopProvinces } from './src/presentation/v13-vision-ui.js';
// V12 : modèle économique (profil hors partie, atouts, missions, pubs et achats de TEST — aucun paiement en bêta).
import { setPlayerBonuses, recruitPreview } from './src/domain/boosts.js';
import { upgradeBoost, addMissionProgress, recordAdWatched, missionDeltas, exportProfile, importProfile, BOOST_INFO, productById } from './src/domain/profile.js';
import { loadProfile, saveProfile, todayLocal } from './src/presentation/profile-storage.js';
import { showGameStartAd, showRewardedAd } from './src/presentation/ads.js';
import { purchase } from './src/presentation/store.js';
import { boostScreenHtml } from './src/presentation/v12-ux.js';
// V13 : alliances (demandes d'aide, propositions Oui / Non), récit d'introduction, prise de capitale, tension en %.
import { proposalsToAnswer, respondToProposal } from './src/domain/game-engine.js';
import { queueHelpRequest, HELP_TURNS } from './src/domain/alliances.js';
import { ceasefireRange, clampCeasefireAmount, ceasefireEstimate, ceasefireOrder, allyBlockedTarget, CEASEFIRE_STEP } from './src/presentation/v13-2-ux.js';
import { INTRO_STORY, seaFatePopups, capitalPopups, tensionText, helpChoices, helpPactsFor } from './src/presentation/v13-ux.js';

const $ = selector => document.querySelector(selector), SVG = 'http://www.w3.org/2000/svg';
const unitKeys = { infantry:'Infanterie', cavalry:'Cavalerie', armor:'Blindés', artillery:'Artillerie', warship:'Navires' };
const buildingNames = { bank:'Banque', factory:'Usine', fort:'Forteresse', port:'Port' };
const icons = { bank:'▦', factory:'⚒', fort:'▣', port:'⚓' };
const nation = id => map.nations.find(n => n.id === id) || { short:'Nation inconnue', name:'Nation inconnue' };
const province = id => map.provinces.find(p => p.id === id) || { name:'Province inconnue', markerAnchor:{x:0,y:0}, geometry:{points:[]} };
let state, selected = null, moveSource = null, scale = 1, tx = 0, ty = 0, drag = null, toastTimer, tutorialShown = new Set();
let pointers = new Map(), pinching = false, pinchStart = null, ignoreClickUntil = 0, audioCtx, musicNodes = [], frameSize={width:0,height:0}, mapContentSize={width:0,height:0}, transformFrame=0;
// V9 : repère de la carte Leonardo (1536 × 1536). Zoom max plus grand que la V6 (2,5) pour viser 20 provinces sur téléphone.
const FRAME = map.frame, MAX_ZOOM = 3, PAN_SLACK = .22;
// Zoom 1 = la carte remplit le cadre (« cover ») ; le zoom minimal montre le monde entier (« contain »).
let minZoom = 1;
let backgroundImage = null;
// V12 : profil joueur (clé localStorage dédiée `frontieres-arken-profil`, distincte de la sauvegarde de partie).
let profile = loadProfile();
const saveMyProfile = () => saveProfile(profile);
/** Injecte les atouts du profil dans la partie (joueur humain seulement) : création, chargement, amélioration. */
const applyBoosts = game => game ? setPlayerBonuses(game, profile.boosts) : game;
const save = () => { if (state) localStorage.setItem(SAVE_KEY, encodeSave(state)); };
const load = () => { try { const raw=localStorage.getItem(SAVE_KEY); return raw ? decodeSave(raw) : null; } catch { return null; } };
const E = (tag, attrs={}) => { const node=document.createElementNS(SVG,tag); for(const [k,v] of Object.entries(attrs)) node.setAttribute(k,v); return node; };
function toast(message) { const node=$('#toast'); node.textContent=message; node.classList.add('show'); clearTimeout(toastTimer); toastTimer=setTimeout(()=>node.classList.remove('show'),4200); }
function tutorial(id,title,text) {
  if (!state.settings.hints || state.tutorial.seen.includes(id)) return;
  if(state.tutorial.turn!==state.turn){state.tutorial.turn=state.turn;state.tutorial.shown=[];}
  state.tutorial.shown||=[];if(state.tutorial.shown.length>=2)return;
  state.tutorial.shown.push(id);tutorialShown.add(id);state.tutorial.seen.push(id);state.tutorial.stage=(state.tutorial.stage||0)+1;save();
  $('#tutorialTitle').textContent=title; $('#tutorialText').textContent=text; $('#tutorialBubble').hidden=false;placeTutorial();
}
// V11 (testeur V10) : la bulle du tutoriel ne doit jamais couvrir les boutons de la fiche de province.
// Fiche ouverte → la bulle passe en haut de l'écran, sous la barre d'état du jeu ; sinon elle reste en bas.
function placeTutorial(){const bubble=$('#tutorialBubble');if(bubble)bubble.classList.toggle('top',!$('#provinceSheet').hidden);}
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
  const color=nation(m.nationId).color,g=E('g',{class:`convoy${m.own?' own':''}${m.returning?' returning':''}`,'data-convoy':m.id,role:'button',tabindex:'0','aria-label':`Convoi de ${nation(m.nationId).short} vers ${province(m.toId).name}, ${m.remaining} tour${m.remaining>1?'s':''} restant${m.remaining>1?'s':''}`});
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
  const capital=Object.values(state.nations).some(n=>n.capitalId===d.id),troops=Object.values(p.units).some(Boolean)||p.warships;
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
function destinations(){return new Set(moveSource?legalDestinations(map,state,moveSource).map(x=>x.id).filter(id=>!allyBlockedTarget(state,state.playerNationId,id)):[]);}
function render(){
  const svg=$('#map'),allowed=destinations(),routeLayer=[],defs=E('defs'),known=safeEngine(()=>knownTroopProvinces(state,map),null);
  for(const [id,color] of [['arrow-green','#62ed99'],['arrow-red','#ff625b']]){const marker=E('marker',{id,viewBox:'0 0 10 10',refX:'8',refY:'5',markerUnits:'strokeWidth',markerWidth:'3.4',markerHeight:'3.4',orient:'auto-start-reverse'});marker.append(E('path',{d:'M 0 0 L 10 5 L 0 10 z',fill:color}));defs.append(marker)}
  backgroundImage ||= E('image',{href:map.image.href,x:0,y:0,width:map.image.width,height:map.image.height,preserveAspectRatio:'none',class:'map-image'});
  const provinceLayer=E('g',{class:'provinces'}),highlightLayer=E('g',{class:'highlights'}),borderLayer=E('g',{class:'territory-borders'}),labelLayer=E('g',{class:'labels'});
  svg.replaceChildren(defs,backgroundImage,provinceLayer,highlightLayer,borderLayer);
  // V10 : liseré bleu = mon territoire, liseré rouge = nations en guerre contre moi (au-dessus du voile et de la sélection).
  // Chaque liseré est découpé à l'intérieur de son territoire : bleu et rouge ne se recouvrent jamais à une frontière commune.
  const polygonPoints=id=>province(id).geometry.points.map(x=>x.join(',')).join(' ');
  // V11 : liseré orange discret = nation « au bord de la guerre » avec moi (pas encore en guerre : sinon liseré rouge).
  const brink=safeEngine(()=>tensionBorderGroups(state,map,id=>tensionLevel(state,state.playerNationId,id),nationsAtWarWith(state)),[]);
  for(const border of [...brink.map(g=>({...g,segments:territoryOutline(map,g.provinceIds)})),...territoryBorders(state,map)]){const clipId=`clip-${border.kind}-${border.nationId}`,clip=E('clipPath',{id:clipId});border.provinceIds.forEach(id=>clip.append(E('polygon',{points:polygonPoints(id)})));defs.append(clip);
    const d=outlinePath(border.segments);borderLayer.append(E('path',{d,class:`territory ${border.kind}`,'data-nation':border.nationId,'clip-path':`url(#${clipId})`}));}
  if(selected&&!moveSource){const clip=E('clipPath',{id:'clip-selected'});clip.append(E('polygon',{points:polygonPoints(selected)}));defs.append(clip);}
  map.seaLanes.forEach(lane=>routeLayer.push(seaLane(lane)));
  map.provinces.filter(d=>d.port).forEach(d=>routeLayer.push(portMarker(d)));
  for(const d of map.provinces){
    const p=state.provinces[d.id],diploState=relationWithPlayer(state,p.ownerId),classes=['province'];
    if(selected===d.id)classes.push('selected');
    if(p.ownerId===state.playerNationId&&!moveSource)classes.push('player-province');
    if(moveSource)classes.push(d.id===moveSource?'source':allowed.has(d.id)?'destination':allyBlockedTarget(state,state.playerNationId,d.id)?'blocked ally-blocked':'blocked');
    const group=E('g',{class:classes.join(' '),'data-id':d.id,role:'button',tabindex:'0','aria-label':`${d.name}, ${nation(p.ownerId).short}`});
    group.style.setProperty('--owner',nation(p.ownerId).color);group.style.setProperty('--diplo',diploState==='war'?'#e45c56':diploState==='alliance'?'#5da9ff':'#f3f1e9');
    // Le polygone est à la fois le dessin et la zone tactile (plus de chevauchement : B7).
    const points=d.geometry.points.map(x=>x.join(',')).join(' ');group.append(E('polygon',{points,class:'area'}));
    if((selected===d.id&&!moveSource)||d.id===moveSource||(moveSource&&allowed.has(d.id))){const kind=moveSource&&allowed.has(d.id)?'destination':'selected',attrs={points,class:`outline ${kind}`};if(kind==='selected'&&selected===d.id&&!moveSource)attrs['clip-path']='url(#clip-selected)';highlightLayer.append(E('polygon',attrs));}
    labelLayer.append(provinceLabel(d,p,!known||known.has(d.id)));
    group.addEventListener('click',()=>{if(Date.now()<ignoreClickUntil)return;selectProvince(d.id);});
    group.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();selectProvince(d.id);}});provinceLayer.append(group);
  }
  const convoyLayer=E('g',{class:'convoys'});for(const m of convoyMarkers(state,map))convoyLayer.append(convoyMarker(m));
  svg.append(...routeLayer,labelLayer,convoyLayer);
  for(const order of playerOrderArrows(state,map)){
    const arrow=E('path',{d:pathData(arrowPoints(order)),class:`order-arrow ${order.kind}${order.routeType==='sea'?' sea':''}`,'data-order-id':order.id,tabindex:'0',role:'button','aria-label':`${order.kind==='attack'?'Attaque':'Déplacement'}${order.routeType==='sea'?` par mer (${order.turns||2} tours)`:''} : ${order.fromName} vers ${order.toName}`});
    arrow.addEventListener('click',event=>{event.stopPropagation();openPendingOrder(order.id)});arrow.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();openPendingOrder(order.id)}});svg.append(arrow);
  }
  const army=totalArmy(state,state.playerNationId);$('#turn').innerHTML=`${Math.min(state.turn,RULES.gameLength)}<span class="turn-max">/${RULES.gameLength}</span>`;$('#turn').closest('.hud-stat')?.classList.toggle('turn-final',!state.gameOver&&state.turn>RULES.gameLength-5);$('#gold').textContent=state.nations[state.playerNationId].treasury;$('#armyTotal').textContent=army.total;
  $('#pendingCount').textContent=state.orders.filter(o=>o.status==='pending').length;updateTalkBadge(); save();
}
function selectProvince(id){
  if(moveSource){const ally=id!==moveSource&&allyBlockedTarget(state,state.playerNationId,id);if(ally)return allyBlockedPopup(ally,id);if(legalDestinations(map,state,moveSource).some(x=>x.id===id))openForceSelection(moveSource,id);else if(id!==moveSource&&province(id).landmassId!==province(moveSource).landmassId)toast(seaMoveRefusal(map,state,moveSource,id));return;}
  selected=id;render();showProvinceSheet();
  tutorial('province-sheet','Inspecter une province','Propriétaire, bâtiments, troupes connues et actions possibles : tout est sur cette fiche.');
}
function showProvinceSheet(){
  if(!selected)return;const definition=province(selected),p=state.provinces[selected],mine=p.ownerId===state.playerNationId,relation=relationWithPlayer(state,p.ownerId),forces=compactForces(state,map,selected);
  $('#sheetKicker').textContent=`${nation(p.ownerId).name} · ${relation==='war'?'guerre':relation==='alliance'?'alliée':relation==='own'?'votre royaume':'neutre'}`;
  $('#sheetTitle').textContent=definition.name;
  const structures=Object.entries(p.buildings).filter(([,n])=>n).map(([key,n])=>`${icons[key]} ${buildingNames[key]}${key==='fort'?` ${n}`:''}`).join(' · ')||'Aucune construction';
  // V13 : une seule ligne en chiffres pour le régiment (« Régiment : 344 PV · 52 dégâts par assaut ») ; troupes hors de vue
  // ou retranchées dans une forteresse ennemie : « Régiment : effectif inconnu » (vision : docs/V13-vision.md).
  const troops=provinceTroopView(state,map,selected);
  const forcesHtml=troops.known?`<span class="info-chip regiment${troops.wounded?' wounded':''}"><b>${troops.text}</b>${troops.composition?`<small>${troops.composition}${troops.wounded?' · en convalescence':''}</small>`:''}</span>`
    :`<span class="info-chip regiment unknown"><b>${troops.text}</b><small>${troops.note}</small></span>`;
  // V13 : point de port (construit ou non) → destinations par mer ; sinon, rien (le refus s'explique au déplacement).
  const naval=mine&&isPortPoint(map,selected)?`<span class="info-chip note">⚓ Point de port : embarquement vers ${legalDestinations(map,state,selected).filter(x=>x.type==='sea').map(x=>province(x.id).name).join(', ')}${p.buildings.port?'':' (port à construire pour les navires de guerre)'}</span>`:'';
  const yieldGold=RULES.baseIncome+Object.entries(p.buildings).reduce((n,[k,v])=>n+(v>0?buildingIncome(k):0),0),yieldChip=mine?`<span class="info-chip income">💰 Rapporte +${yieldGold} or/tour</span>`:'';
  const allyChip=relation==='alliance'?`<span class="info-chip ally-chip">🤝 Votre allié : vous ne pouvez pas l’attaquer</span>`:'';
  $('#sheetInfo').innerHTML=`${allyChip}<span class="info-chip">${structures}</span>${yieldChip}${forcesHtml}${naval}${mine?'':nationChips(p.ownerId)}`;
  const actions=mine?[['move','Déplacer / Attaquer'],['recruit','Recruter'],['build','Construire']]:[['diplo','Diplomatie'],['talk','Échanger']];
  $('#sheetActions').innerHTML=actions.map(([id,label])=>`<button data-sheet-action="${id}" class="${id==='diplo'||id==='talk'?'secondary':''}">${label}</button>`).join('');$('#provinceSheet').hidden=false;placeTutorial();
  document.querySelectorAll('[data-sheet-action]').forEach(button=>button.onclick=()=>({move:startMove,recruit:openRecruit,build:openBuild,diplo:()=>openDiplomacy(p.ownerId),talk:()=>openTalkCompose(p.ownerId)})[button.dataset.sheetAction]());
  if(!mine&&troops.known)tutorial('intelligence','Renseignement',TUTORIAL_GUIDE.find(x=>x.id==='intelligence').text);
}
function startMove(){moveSource=selected;$('#provinceSheet').hidden=true;placeTutorial();$('#moveBanner').hidden=false;const st=embarkStatus(map,state,moveSource),noPort=seaRoutesFrom(map,moveSource).length&&!st.ok;$('#movePrompt').textContent=`Depuis ${province(moveSource).name} : touchez une destination verte${state.diplomacy.treaties.some(t=>t.active!==false&&t.type==='alliance'&&t.parties.includes(state.playerNationId))?' · en bleu : vos alliés':''}`;if(noPort)toast(st.reason);render();tutorial('move','Ordres de déplacement','Touchez une province verte. En bleu : un allié, qu’on ne peut pas attaquer.');}
function cancelMove(){moveSource=null;$('#moveBanner').hidden=true;render();if(selected)showProvinceSheet();}
function actionModal(title,kicker,html){const dialog=$('#actionDialog');if(dialog.open)dialog.close();$('#actionTitle').textContent=title;$('#actionKicker').textContent=kicker;$('#actionBody').innerHTML=html;dialog.showModal();}
function confirmationModal(title,details,onConfirm){actionModal(title,'VÉRIFIE TON ORDRE',`${details}<div class="confirm-actions"><button class="cancel" id="cancelConfirmation">Annuler</button><button class="primary" id="acceptConfirmation">Confirmer</button></div>`);$('#cancelConfirmation').onclick=()=>$('#actionDialog').close();$('#acceptConfirmation').onclick=onConfirm;}
function pendingFrom(id){return state.orders.filter(o=>o.status==='pending'&&o.fromId===id).length;}
function openPendingOrder(orderId){
  const order=state.orders.find(item=>item.id===orderId&&item.nationId===state.playerNationId&&item.status==='pending');if(!order)return;
  const amount=Object.entries(order.units||{}).filter(([,n])=>n).map(([key,n])=>`${n} ${unitKeys[key].toLowerCase()}`).concat(order.warships?[`${order.warships} navires`]:[]).join(', ')||'aucune force';
  const isAttack=state.provinces[order.toId].ownerId!==state.playerNationId;
  actionModal(isAttack?'Ordre d’attaque':'Ordre de déplacement',`${province(order.fromId).name} → ${province(order.toId).name}`,`<div class="order-detail"><b>${isAttack?'Attaque programmée':'Déplacement programmé'}</b><span>Forces : ${amount}</span><span>Coût : 0 or</span><span>Ordre non résolu avant Fin du tour.</span></div><div class="confirm-actions"><button class="cancel" data-close-order>Fermer</button><button id="cancelPendingOrder" class="primary">Annuler cet ordre</button></div>`);
  $('[data-close-order]').onclick=()=>$('#actionDialog').close();$('#cancelPendingOrder').onclick=()=>{const result=cancelPendingOrder(state,order.id);if(!result.ok)return toast(result.error);$('#actionDialog').close();render();toast('Ordre annulé ; les forces sont de nouveau disponibles.');tutorial('orders','Ordres en attente',TUTORIAL_GUIDE.find(x=>x.id==='orders').text);};
}
function openForceSelection(fromId,toId){
  const from=state.provinces[fromId],to=state.provinces[toId],attack=to.ownerId!==state.playerNationId,route=legalDestinations(map,state,fromId).find(x=>x.id===toId),available=availableForces(state,fromId);
  moveSource=null;$('#moveBanner').hidden=true;
  const row=(key,label)=>`<div class="unit-row"><span>${label}</span><b>${available[key]||0}</b><input data-force="${key}" type="number" min="0" max="${available[key]||0}" value="${forceSelection(available,'50')[key]||0}" ${available[key]?'':'disabled'}></div>`;
  const bySea=route?.type==='sea',rows=[...LAND_UNIT_TYPES.map(k=>row(k,unitKeys[k])),...(bySea?[row('warships','Navires (escorte)')]:[])].join('');
  const seaNote=bySea?`<p class="sea-note">⚓ Par mer depuis le point de port de ${province(fromId).name}, route vers ${province(route.via).name} : <b>${route.turns} tours</b> en mer (1 étape par tour)${attack?', puis débarquement (troupes à 70 %)':', puis renfort'}. Sans navires de guerre, le convoi ne peut pas se défendre s’il est intercepté.</p>${attack?(()=>{const v=provinceTroopView(state,map,toId),cap=Object.values(state.nations).some(n=>n.capitalId===toId);return `<p class="sea-warn">${v.known?`👁 En face : ${v.text}.`:'⚠ Garnison inconnue : la province est hors de vue.'}${cap?' C’est une capitale, souvent la mieux gardée.':''}</p>`;})():''}`:'';
  actionModal(attack?(bySea?'Préparer un débarquement':'Préparer une attaque'):'Préparer un déplacement',`${province(fromId).name} → ${province(toId).name}${bySea?` · par mer · ${route.turns} tours`:''}`,`${seaNote}<p>Choisis les forces à réserver. Elles ne bougent qu’à l’inter-tour.</p><div class="force-presets"><button data-preset="50">50 %</button><button data-preset="100">100 %</button><button data-preset="manual">Personnaliser</button></div>${rows}<div class="total-line"><span>Ordres déjà prévus depuis la province</span><b>${pendingFrom(fromId)}</b></div><p id="forceSummary"></p><button id="confirmMove" class="primary">Ajouter cet ordre</button>`);
  const updateSummary=()=>{const units=Object.fromEntries(LAND_UNIT_TYPES.map(k=>[k,Math.floor(Number(document.querySelector(`[data-force="${k}"]`)?.value)||0)])),ships=Math.floor(Number(document.querySelector('[data-force="warships"]')?.value)||0);$('#forceSummary').textContent=`${Object.entries(units).filter(([,n])=>n).map(([k,n])=>`${n} ${unitKeys[k].toLowerCase()}`).concat(ships?[`${ships} navires`]:[]).join(' · ')||'Aucune unité sélectionnée'}`;};
  document.querySelectorAll('[data-force]').forEach(i=>i.oninput=updateSummary);
  document.querySelectorAll('[data-preset]').forEach(b=>b.onclick=()=>{const mode=b.dataset.preset;if(mode==='manual'){document.querySelector('[data-force]')?.focus();return;}const chosen=forceSelection(available,mode);for(const k of LAND_UNIT_TYPES)document.querySelector(`[data-force="${k}"]`).value=chosen[k];const ws=document.querySelector('[data-force="warships"]');if(ws)ws.value=mode==='100'?available.warships:Math.floor(available.warships/2);updateSummary();});updateSummary();
  $('#confirmMove').onclick=()=>{const units=Object.fromEntries(LAND_UNIT_TYPES.map(k=>[k,Math.floor(Number(document.querySelector(`[data-force="${k}"]`)?.value)||0)])),warships=Math.floor(Number(document.querySelector('[data-force="warships"]')?.value)||0),quantity=Object.values(units).reduce((a,b)=>a+b,0)+warships,description=Object.entries(units).filter(([,n])=>n).map(([key,n])=>`${n} ${unitKeys[key].toLowerCase()}`).concat(warships?[`${warships} navires`]:[]).join(', ')||'Aucune force';
    if(!quantity)return toast('Sélectionne au moins une unité');
    confirmationModal(attack?'Confirmer l’attaque':'Confirmer le déplacement',`<div class="order-detail"><span>Action : ${attack?'attaquer':'déplacer les forces'}</span><span>Origine : ${province(fromId).name}</span><span>Province visée : ${province(toId).name}</span>${bySea?`<span>Trajet : par mer, ${route.turns} tours</span>`:''}<span>Quantité : ${description}</span><span>Coût : 0 or</span><span>Trésor après ordre : ${state.nations[state.playerNationId].treasury} or</span></div>`,()=>{const result=queueMoveOrder(state,map,{nationId:state.playerNationId,fromId,toId,units,warships});if(!result.ok)return toast(result.error);$('#actionDialog').close();selected=null;render();toast('Ordre ajouté à la planification');tutorial('orders','Ordres en attente',TUTORIAL_GUIDE.find(x=>x.id==='orders').text);});
  };
  tutorial(attack?'attack':'move-confirm',attack?'Préparer une attaque':'Préparer un déplacement','Envoyez 50 %, 100 % ou choisissez unité par unité. Le combat a lieu à la fin du tour.');
  if(route?.type==='sea')tutorial('maritime','Transport maritime',TUTORIAL_GUIDE.find(x=>x.id==='maritime').text);
}
function openRecruit(){
  const p=state.provinces[selected],pendingBuild=Object.fromEntries(state.productionQueue.filter(o=>o.kind==='building'&&o.provinceId===selected).map(o=>[o.type,o.remaining]));
  for(const o of state.orders)if(o.kind==='construction'&&o.provinceId===selected&&o.status==='pending')pendingBuild[o.type]??=RULES.buildings[o.type]?.turns||1;
  const items=Object.entries(RULES.units).map(([key,r])=>{const reason=unitPrerequisiteText(r,p.buildings,pendingBuild);return{key,r,reason,blocked:Boolean(reason)};});
  actionModal('Recrutement',province(selected).name,`<div class="treasury-context"><span>Trésor actuel</span><b>${state.nations[state.playerNationId].treasury} or</b></div><div class="treasury-context"><span>Disponible après réserves</span><b>${spendableTreasury(state,state.playerNationId)} or</b></div>${items.map(({key,r,blocked,reason})=>`<div class="action-card recruit-row${blocked?' blocked':''}"><span><b>${r.label}</b><small>${r.amount} par lot · ${r.cost} or · ${r.turns} tour(s)</small>${blocked?`<small class="prereq">⚠ ${reason}</small>`:''}</span><div class="lot-controls"><button data-lot-minus="${key}" ${blocked?'disabled':''}>−</button><b id="lot-count-${key}">0</b><button data-lot-plus="${key}" ${blocked?'disabled':''}>+</button><small id="lot-amount-${key}">0 unité</small></div></div>`).join('')}<div class="total-line"><span>Coût total</span><b id="recruitCost">0</b></div><p id="recruitWarning"></p><button id="confirmRecruit" class="primary">Vérifier la commande</button>`);
  const lots=Object.fromEntries(items.map(x=>[x.key,0]));
  const update=()=>{const total=Object.entries(lots).reduce((n,[k,v])=>n+v*RULES.units[k].cost,0),available=spendableTreasury(state,state.playerNationId);$('#recruitCost').textContent=`${total} or`;$('#recruitWarning').textContent=total>available?'Trésor insuffisant après les sommes réservées.':'';for(const {key,r,blocked} of items){$(`#lot-count-${key}`).textContent=lots[key];const extra=recruitPreview(state,state.playerNationId,key,lots[key]*r.amount)-lots[key]*r.amount;$(`#lot-amount-${key}`).innerHTML=`${lots[key]*r.amount} unité${lots[key]*r.amount===1?'':'s'}${extra>0?` <em class="boost-extra">+${extra} atout</em>`:''}`;const plus=document.querySelector(`[data-lot-plus="${key}"]`);if(plus)plus.disabled=blocked||total+r.cost>available;}};
  for(const {key} of items){document.querySelector(`[data-lot-minus="${key}"]`)?.addEventListener('click',()=>{lots[key]=Math.max(0,lots[key]-1);update();});document.querySelector(`[data-lot-plus="${key}"]`)?.addEventListener('click',()=>{lots[key]++;update();});}update();
  $('#confirmRecruit').onclick=()=>{const total=Object.entries(lots).reduce((n,[k,v])=>n+v*RULES.units[k].cost,0),quantity=Object.entries(lots).reduce((n,[k,v])=>n+v*RULES.units[k].amount,0);if(!quantity)return toast('Choisis au moins un lot');if(total>spendableTreasury(state,state.playerNationId))return toast('Trésor insuffisant après les sommes réservées');
    confirmationModal('Confirmer le recrutement',`<div class="order-detail"><span>Action : recrutement</span><span>Province : ${province(selected).name}</span><span>Quantité : ${quantity} unité(s) en ${Object.values(lots).filter(Boolean).reduce((n,v)=>n+v,0)} lot(s)</span>${(()=>{const extra=recruitPreview(state,state.playerNationId,'infantry',lots.infantry*RULES.units.infantry.amount)-lots.infantry*RULES.units.infantry.amount;return extra>0?`<span class="boost-extra">Atout Recrutement +${profile.boosts.recruit} % : +${extra} fantassins à la livraison</span>`:'';})()}<span>Coût total : ${total} or</span><span>Trésor après commande : ${state.nations[state.playerNationId].treasury-total} or</span><span>Disponible après réserves et commande : ${spendableTreasury(state,state.playerNationId)-total} or</span></div>`,()=>{for(const [type,count] of Object.entries(lots))if(count){const result=queueRecruitment(state,{nationId:state.playerNationId,provinceId:selected,type,lots:count});if(!result.ok)return toast(result.error);}$('#actionDialog').close();render();showProvinceSheet();toast('Ordre de recrutement ajouté à l’inter-tour');});
  };
  tutorial('recruit','Recruter par lots','Chaque + ajoute un lot : 20 fantassins ou 5 cavaliers. Le prix total s’affiche en bas.');
}
function openBuild(){
  const p=state.provinces[selected],orders=state.orders.filter(o=>o.kind==='construction'&&o.provinceId===selected&&o.status==='pending'),active=state.productionQueue.filter(o=>o.kind==='building'&&o.provinceId===selected);
  const types=['bank','factory','fort',...(p.portSite?['port']:[])],items=types.map(type=>{const rule=RULES.buildings[type],count=(p.buildings[type]||0)+orders.filter(o=>o.type===type).length+active.filter(o=>o.type===type).length,cost=type==='fort'?rule.costs[count]:rule.cost;const built=p.buildings[type]||0;return{type,rule,cost,turns:rule.turns,count,built,queued:count-built};}).map(x=>({...x,reason:buildingUnavailableReason({type:x.type,label:buildingNames[x.type],rule:x.rule,count:x.count,portSite:p.portSite,cost:x.cost??0,spendable:spendableTreasury(state,state.playerNationId)})}));
  actionModal('Construction',province(selected).name,`<div class="treasury-context"><span>Trésor actuel</span><b>${state.nations[state.playerNationId].treasury} or</b></div><div class="treasury-context"><span>Disponible après réserves</span><b>${spendableTreasury(state,state.playerNationId)} or</b></div><p>Les nouvelles constructions sont payées maintenant et livrées après leur durée.</p><div class="action-list">${items.map(x=>`<div class="action-card"><span><b>${icons[x.type]} ${buildingNames[x.type]}</b><small>${x.cost??'—'} or · ${x.turns} tour(s)${buildingIncome(x.type)?` · <b class="income-tag">rapporte +${buildingIncome(x.type)} or/tour</b>`:x.type==='fort'?' · protège la province (ne rapporte rien)':''}${x.built?` · ${x.type==='fort'?`niveau ${x.built} construit`:`${x.built} déjà construite${x.built>1?'s':''}`}`:''}${x.queued>0?` · ${x.queued} en construction`:''}</small>${x.reason?`<small class="prereq">⚠ ${x.reason}</small>`:''}</span><button data-build="${x.type}" ${x.reason?'disabled':''}>Vérifier</button></div>`).join('')}</div>`);
  document.querySelectorAll('[data-build]').forEach(button=>button.onclick=()=>{const type=button.dataset.build,item=items.find(x=>x.type===type);if(!item||item.reason)return;confirmationModal('Confirmer la construction',`<div class="order-detail"><span>Action : construire ${buildingNames[type]}</span><span>Province : ${province(selected).name}</span><span>Quantité : 1 bâtiment (${item.turns} tour(s))</span><span>Coût : ${item.cost} or</span><span>Trésor après commande : ${state.nations[state.playerNationId].treasury-item.cost} or</span><span>Disponible après réserves et commande : ${spendableTreasury(state,state.playerNationId)-item.cost} or</span></div>`,()=>{const result=queueConstruction(state,{nationId:state.playerNationId,provinceId:selected,type});if(!result.ok)return toast(result.error);$('#actionDialog').close();render();showProvinceSheet();toast('Ordre de construction ajouté à l’inter-tour');});});
  tutorial('build','Financer une construction','Payé tout de suite, livré après sa durée. Banque et usine rapportent +3 or par tour.');
}
function diplomaticExplanation(id,target){return({break:`Rompre l’alliance avec ${nation(target).short} à l’inter-tour. Rompre et attaquer dans le même tour est une trahison que tout Arken verra.`,war:`Déclarer la guerre à ${nation(target).short}. L’état de guerre s’appliquera à l’inter-tour.`,alliance:`Proposer une alliance à ${nation(target).short}. Elle commencera à l’inter-tour.`,ultimatum:`Proposer un cessez-le-feu à ${nation(target).short}, en payant ou en exigeant de l’or. S’il refuse, aucun or ne bouge.`})[id]||'Action diplomatique';}
async function allyBlockedPopup(ally,provinceId){
  const answer=await eventPopup({kicker:'ALLIÉ · ATTAQUE IMPOSSIBLE',title:`🤝 ${nation(ally).short} est votre allié`,cls:'proposal ally-blocked-popup',
    html:`<p class="capital-lead">${province(provinceId).name} : province alliée.</p><p>Entre alliés, on ne s’attaque pas. Pour l’attaquer, rompez d’abord l’alliance dans la Diplomatie.</p><p class="sea-tip">⚠ Rompre et attaquer le même tour, c’est une trahison : tout Arken le saura.</p>`,
    buttons:[{label:'Diplomatie',value:'diplo'},{label:'Compris',value:true,primary:true}]});
  if(answer==='diplo'){cancelMove();$('#provinceSheet').hidden=true;openDiplomacy(ally);}
}
// V13.2 : cessez-le-feu au montant choisi — payer pour obtenir la paix, ou exiger de l'or quand on domine.
function chooseCeasefireOffer(target){
  const range=ceasefireRange(state,state.playerNationId,target);let mode=range.suggested.mode,amount=range.suggested.amount;
  actionModal('Cessez-le-feu',`${nation(target).short.toUpperCase()} · TRÉSOR ${state.nations[target].treasury} OR`,`<p class="cf-intro">${range.dominant?'Vous dominez : vous pouvez <b>exiger</b> de l’or.':'Proposez la paix, avec ou sans or.'}</p>
   <div class="cf-modes"><button data-cf-mode="demand">J’exige</button><button data-cf-mode="none">Sans or</button><button data-cf-mode="pay">Je paie</button></div>
   <div class="cf-amount" id="cfAmountRow"><button data-cf-step="-1" aria-label="Moins">−</button><b id="cfAmount">0 or</b><button data-cf-step="1" aria-label="Plus">+</button></div>
   <p class="cf-limit" id="cfLimit"></p><div class="cf-chance"><span>Chance</span><b id="cfChance">—</b></div>
   <p class="cf-note">Son dirigeant décide selon son caractère. Refus : aucun or ne bouge.</p><button id="cfConfirm" class="primary">Vérifier l’offre</button>`);
  const update=()=>{amount=clampCeasefireAmount(range,mode,amount);document.querySelectorAll('[data-cf-mode]').forEach(b=>b.classList.toggle('active',b.dataset.cfMode===mode));
    $('#cfAmountRow').hidden=mode==='none';$('#cfAmount').textContent=`${amount} or`;
    $('#cfLimit').textContent=mode==='demand'?`Il versera cette somme s’il accepte (au plus la moitié de son trésor : ${range.maxDemand} or).`:mode==='pay'?`Vous verserez cette somme s’il accepte (disponible : ${range.maxPay} or).`:'Paix blanche : personne ne paie.';
    const e=ceasefireEstimate(state,state.playerNationId,target,mode,amount);$('#cfChance').textContent=`≈ ${e.pct} % · ${e.label}`;
    document.querySelector('[data-cf-step="-1"]').disabled=amount<=0;document.querySelector('[data-cf-step="1"]').disabled=amount>=(mode==='demand'?range.maxDemand:range.maxPay);
    $('#cfConfirm').disabled=mode!=='none'&&amount<=0;};
  document.querySelectorAll('[data-cf-mode]').forEach(b=>b.onclick=()=>{mode=b.dataset.cfMode;if(mode!=='none'&&amount<=0)amount=CEASEFIRE_STEP;update();});
  document.querySelectorAll('[data-cf-step]').forEach(b=>b.onclick=()=>{amount=amount+Number(b.dataset.cfStep)*CEASEFIRE_STEP;if(Number(b.dataset.cfStep)<0)amount=Math.ceil(amount/CEASEFIRE_STEP)*CEASEFIRE_STEP;update();});
  $('#cfConfirm').onclick=()=>confirmCeasefire(target,mode,amount);update();
}
function confirmCeasefire(target,mode,amount){
  const e=ceasefireEstimate(state,state.playerNationId,target,mode,amount),me=state.nations[state.playerNationId].treasury;
  const short=nation(target).short,deShort=/^[AEIOUYÉÈÊÎÏÔÖÛÜÀÂ]/i.test(short)?`d’${short}`:`de ${short}`;
  const terms=mode==='demand'?`Vous exigez ${amount} or ${deShort}`:mode==='pay'?`Vous versez ${amount} or à ${short}`:'Paix sans or';
  confirmationModal('Confirmer le cessez-le-feu',`<div class="order-detail"><span>Nation : ${nation(target).name}</span><span>Conditions : ${terms}</span><span>Chance estimée : ≈ ${e.pct} %</span><span>Votre trésor s’il accepte : ${me-e.pay+e.demand} or</span><span>S’il refuse : la guerre continue, aucun or ne bouge.</span></div>`,
    ()=>{const result=queueDiplomaticOrder(state,{nationId:state.playerNationId,target,action:'ceasefire',...ceasefireOrder(mode,amount)});if(!result.ok)return toast(result.error);$('#actionDialog').close();render();toast('Offre de cessez-le-feu ajoutée aux ordres du tour');});
}
function confirmDiplomacy(action,target,offerLevel=.5){
  const offer=action==='ultimatum'?ceasefireOffers(state.nations[target].treasury).find(o=>o.offerLevel===offerLevel):null;
  const details=offer?`<div class="order-detail"><span>Action : proposer un cessez-le-feu / ultimatum</span><span>Nation : ${nation(target).name}</span><span>Offre : ${Math.round(offer.offerLevel*100)} % de son trésor, soit ${offer.amount} or</span><span>Chance d’acceptation : ${Math.round(offer.acceptanceProbability*100)} %</span><span>Trésor actuel : ${state.nations[state.playerNationId].treasury} or</span><span>Trésor après acceptation : ${state.nations[state.playerNationId].treasury-offer.amount} or</span><span>Disponible après acceptation : ${spendableTreasury(state,state.playerNationId)-offer.amount} or</span><span>En cas de refus : aucun débit, aucune trêve.</span></div>`:`<div class="order-detail"><span>${diplomaticExplanation(action,target)}</span><span>Trésor actuel : ${state.nations[state.playerNationId].treasury} or</span><span>Coût : 0 or</span></div>`;
  confirmationModal('Confirmer l’action diplomatique',details,()=>{const result=queueDiplomaticOrder(state,{nationId:state.playerNationId,target,action,offerLevel});if(!result.ok)return toast(result.error);$('#actionDialog').close();render();toast('Action diplomatique ajoutée aux ordres du tour');});
}
function openDiplomacy(target=null){
  if(!target){actionModal('Diplomatie','CHOISISSEZ UN PAYS',`<div class="action-list">${map.nations.filter(n=>n.id!==state.playerNationId).map(n=>`<button class="nation" data-country="${n.id}" style="--nation:${n.color}"><i></i>${n.name}</button>`).join('')}</div>`);document.querySelectorAll('[data-country]').forEach(b=>b.onclick=()=>{const id=b.dataset.country;$('#actionDialog').close();openDiplomacy(id)});return;}
  const actions=diplomacyActions(state,target),pending=state.orders.some(o=>o.kind==='diplomacy'&&o.target===target&&o.nationId===state.playerNationId&&o.status==='pending');
  actionModal(nation(target).name,`RELATION : ${relationWithPlayer(state,target)==='war'?'GUERRE':relationWithPlayer(state,target)==='alliance'?'ALLIANCE':relationWithPlayer(state,target).toUpperCase()}`,`${nationPanel(target)}<p>${pending?'Une action envers ce pays attend déjà la résolution.':''}</p><div class="action-list">${actions.map(a=>`<div class="action-card"><span><b>${a.label}</b>${(!a.enabled||pending)&&a.reason?`<small>${a.reason}</small>`:''}</span><button data-diplo="${a.id}" ${a.enabled&&!pending?'':'disabled'}>Choisir</button></div>`).join('')}</div>${relationWithPlayer(state,target)==='alliance'?`<button id="askHelp" class="help-launch">🤝 Demander de l’aide à ${nation(target).short}</button>`:''}`);
  $('#askHelp')?.addEventListener('click',()=>openHelpRequest(target));
  document.querySelectorAll('[data-diplo]').forEach(b=>b.onclick=()=>{const id=b.dataset.diplo;if(id==='ultimatum')return chooseCeasefireOffer(target);$('#actionDialog').close();confirmDiplomacy(id,target);});
  $('#nationTalk')?.addEventListener('click',()=>{$('#actionDialog').close();openTalkCompose(target);});
  tutorial('diplomacy','Diplomatie en deux étapes','Choisissez une action : vous verrez ses conséquences avant de confirmer. Elle s’applique à la fin du tour.');
}
// --- V13 : demandes d'aide à un allié (« Défends-moi », « Attaque X avec moi ») ------------------------------------
function helpText(o){const x=o.target?nation(o.target).short:null;return o.help==='attack'?`attaquer ${x} avec vous`:x?`vous défendre contre ${x}`:o.provinceId?`défendre ${province(o.provinceId).name}`:'vous défendre contre quiconque vous attaque';}
function openHelpRequest(ally){
  const c=helpChoices(state,map,ally),pacts=helpPactsFor(state,ally),pending=state.orders.find(o=>o.kind==='help'&&o.status==='pending'&&o.nationId===state.playerNationId&&o.to===ally);
  const pactLine=p=>`<div class="help-pact">✔ ${nation(ally).short} s’est engagé à ${helpText({help:p.kind,target:p.against,provinceId:p.provinceId})} · encore ${p.turnsLeft} tour${p.turnsLeft>1?'s':''}</div>`;
  actionModal(`Aide de ${nation(ally).short}`,'ALLIÉ · DEMANDE GRATUITE',`${nationPanel(ally)}<p class="help-intro">Votre allié répond à la fin du tour, <b>selon son caractère</b>. Une aide acceptée dure ${HELP_TURNS} tours.</p>
   ${pacts.map(pactLine).join('')}${pending?`<div class="talk-planned">✉ Demande prête : ${escapeHtml(helpText(pending))} — réponse à la fin du tour</div>`:''}
   <h3 class="help-h">🛡 Défends-moi</h3><div class="help-grid"><button data-help="defend" data-target="">Contre quiconque m’attaque</button>${c.defendAgainst.map(n=>`<button data-help="defend" data-target="${n.id}" style="--nation:${n.color}">Contre ${n.name}${n.atWar?' ⚔':''}</button>`).join('')}</div>
   <small class="help-sub">Ou sur une province menacée :</small><div class="help-grid">${c.provinces.map(p=>`<button data-help="defend" data-province="${p.id}">${p.name}</button>`).join('')}</div>
   <h3 class="help-h">⚔ Attaque avec moi</h3><div class="help-grid">${c.attackTargets.length?c.attackTargets.map(n=>`<button data-help="attack" data-target="${n.id}" style="--nation:${n.color}">Attaquer ${n.name}${n.allyOfAlly?' <small>(son allié)</small>':''}</button>`).join(''):'<p class="help-none">Aucune nation à sa portée : votre allié ne peut atteindre que ses voisins (frontière ou route maritime).</p>'||'<p>Aucune nation à viser.</p>'}</div>`);
  $('#nationTalk')?.addEventListener('click',()=>{$('#actionDialog').close();openTalkCompose(ally);});
  document.querySelectorAll('[data-help]').forEach(b=>b.onclick=()=>{const req={from:state.playerNationId,to:ally,kind:b.dataset.help,target:b.dataset.target||null,provinceId:b.dataset.province||null};
    const r=safeEngine(()=>queueHelpRequest(state,req),{ok:false,error:'Demande impossible pour le moment'});if(!r.ok)return toast(r.error);
    $('#actionDialog').close();render();toast(`Demande envoyée à ${nation(ally).short} : ${helpText({help:req.kind,target:req.target,provinceId:req.provinceId})}. Réponse à la fin du tour.`);});
}
// --- V13 : fenêtres d'événements (récit, capitale, propositions) ----------------------------------------------------
function eventPopup({kicker='',title,html='',cls='',buttons=[{label:'Continuer',value:true,primary:true}]}){
  return new Promise(resolve=>{const d=$('#eventDialog');let value=null;d.className=cls;$('#eventKicker').textContent=kicker;$('#eventTitle').textContent=title;$('#eventBody').innerHTML=html;
    $('#eventActions').innerHTML=buttons.map((b,i)=>`<button data-event-btn="${i}" class="${b.primary?'primary':'cancel'}">${b.label}</button>`).join('');
    document.querySelectorAll('[data-event-btn]').forEach(btn=>btn.onclick=()=>{value=buttons[Number(btn.dataset.eventBtn)].value;d.close();});
    if(d.open)d.close();d.addEventListener('close',()=>resolve(value),{once:true});d.showModal();});
}
const dialogClosed=dialog=>new Promise(resolve=>{if(!dialog.open)return resolve();dialog.addEventListener('close',()=>resolve(),{once:true});});
function showIntro(){return eventPopup({kicker:INTRO_STORY.kicker,title:INTRO_STORY.title,cls:'intro',html:`<div class="intro-masks" aria-hidden="true"><span>🛡</span><span>⚔</span><span>🗡</span><span>⚒</span></div>${INTRO_STORY.paragraphs.map(p=>`<p>${p}</p>`).join('')}`,buttons:[{label:INTRO_STORY.button,value:true,primary:true}]});}
async function showCapitalPopups(events){
  for(const c of capitalPopups(events,state.playerNationId,{nation:id=>nation(id).short,province:id=>province(id).name}))
    await eventPopup({kicker:c.kicker,title:c.title,cls:`capital ${c.kind}`,html:`<p class="capital-lead">${c.lead}</p>${c.kind==='won'?`<p class="capital-gold">+${c.total} or</p>`:`<p class="capital-gold lost">−${c.amount} or</p>`}<p>${c.text}</p>`,buttons:[{label:c.kind==='won'?'Gloire à nous !':'Nous les reprendrons',value:true,primary:true}]});
}
async function showSeaPopups(events){
  for(const c of seaFatePopups(events,state.playerNationId,{nation:id=>nation(id).short,province:id=>province(id).name}))
    await eventPopup({kicker:c.kicker,title:c.title,cls:`capital lost sea ${c.kind}`,html:`<p class="capital-lead">${c.lead}</p><p>${c.text}</p>${c.tip?`<p class="sea-tip">💡 ${c.tip}</p>`:''}`,buttons:[{label:'Compris',value:true,primary:true}]});
}
async function showProposalPopups(){
  for(const p of safeEngine(()=>proposalsToAnswer(state,state.playerNationId,{fresh:true}),[])){
    const msg=(state.talk||[]).find(m=>m.id===p.talkId),alliance=p.action==='alliance';
    const answer=await eventPopup({kicker:`PROPOSITION · ${nation(p.from).name.toUpperCase()}`,title:alliance?`${nation(p.from).short} vous propose une alliance`:`${nation(p.from).short} propose un cessez-le-feu`,cls:'proposal',
      html:`${msg?`<blockquote class="talk-quote ${toneMeta(msg.tone).cls}">${nationBadge(p.from)} ${escapeHtml(msg.text)}</blockquote>`:''}<div class="proposal-facts">${nationChips(p.from)}</div>${p.refusedBefore?`<p class="proposal-memo">↺ Vous avez déjà refusé ${p.refusedBefore>1?`${p.refusedBefore} fois`:'une fois'}${p.lastRefusedTurn?` (dernier refus au tour ${p.lastRefusedTurn})`:''}.</p>`:''}${!alliance&&p.amount>0?`<p class="capital-gold">+${p.amount} or si vous acceptez</p>`:''}<p class="help-intro">${alliance?'Alliés, vous ne pourrez plus vous faire la guerre, et vous pourrez lui demander de l’aide. Mais un Traître se cache peut-être derrière ce sourire…':'La guerre s’arrête aussitôt : une trêve commence entre vos deux nations.'}</p>`,
      buttons:[{label:'Non',value:false},{label:'Oui',value:true,primary:true}]});
    if(answer===null)continue;
    const r=safeEngine(()=>respondToProposal(state,{from:p.from,accept:answer}),{ok:false,error:'Réponse impossible'});
    render();toast(r.ok?(answer?(alliance?`Alliance conclue avec ${nation(p.from).short}`:`Cessez-le-feu avec ${nation(p.from).short}${r.gold?` · +${r.gold} or`:''}`):`Proposition de ${nation(p.from).short} refusée`):r.error);
  }
}
// --- V11 : personnalités des dirigeants, fil d'échanges et tension ------------------------------------------
// Les appels au moteur V11 sont protégés : une erreur ne doit jamais bloquer la carte ni la fin du tour.
function safeEngine(fn,fallback){try{return fn();}catch(error){console.warn('V11',error);return fallback;}}
const escapeHtml=text=>String(text??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
function nationBadge(id){const n=nation(id);return`<span class="crest" style="--nation:${n.color||'#888'}" aria-hidden="true">${crestGlyph(n.crest)}</span>`;}
function tensionWith(id){const level=safeEngine(()=>tensionLevel(state,state.playerNationId,id),{value:0,label:'calme'});return{...tensionGauge(level),...tensionText(level),label:level?.label||'calme'};}
function hintFor(id){return safeEngine(()=>leaderHint(state,id),'')||'Dirigeant encore mal connu';}
function nationChips(id){const t=tensionWith(id);return`<span class="info-chip tension-chip ${t.cls}">${t.war?'⚔ En guerre':`Tension ${t.value} % · ${t.label}`}</span><span class="info-chip leader-chip">☉ ${escapeHtml(hintFor(id))}</span>`;}
function nationPanel(id){const t=tensionWith(id),revealed=Boolean(state.leaders?.[id]?.revealed);
  return`<div class="nation-panel" style="--nation:${nation(id).color}"><div class="nation-head">${nationBadge(id)}<div><b>${nation(id).name}</b><small>${revealed?'Personnalité révélée':'Impression sur son dirigeant'}</small><p class="leader-hint${revealed?' revealed':''}">${escapeHtml(hintFor(id))}</p></div></div>
  <div class="tension ${t.cls}" role="meter" aria-label="Tension avec ${nation(id).short}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${t.value}"><div class="tension-top"><span>Tension</span><b>${t.long}</b></div><div class="tension-track"><i style="width:${t.pct}%"></i></div><div class="tension-scale"><span>calme</span><span>tendu</span><span>hostile</span><span>guerre</span></div></div>
  <button id="nationTalk" class="talk-launch">✉ Échanger publiquement</button></div>`;}
function updateTalkBadge(){const n=safeEngine(()=>talkBadgeCount(state),0),badge=$('#talkBadge');badge.hidden=!n;badge.textContent=n;$('#talkBtn').classList.toggle('has-mail',n>0);}
function talkLine(item){const tone=toneMeta(item.tone),from=nation(item.from),to=item.to?nation(item.to):null;
  return`<article class="talk-msg ${tone.cls}${item.toMe?' to-me':''}${item.fromMe?' from-me':''}" style="--nation:${from.color||'#888'}" data-talk-id="${escapeHtml(item.id)}">
   <div class="talk-head">${nationBadge(item.from)}<b>${from.short}</b><span class="talk-to">${to?`→ ${item.toMe?'vous':to.short}`:'→ à tous'}</span><span class="talk-tone" title="Ton ${tone.label.toLowerCase()}" aria-label="Ton ${tone.label.toLowerCase()}">${tone.icon}</span><small>T${item.turn}</small></div>
   ${item.replyTo&&item.replyToFrom?`<small class="talk-reply">en réponse à ${item.replyToFrom===state.playerNationId?'vous':nation(item.replyToFrom).short}</small>`:''}
   <p>${escapeHtml(item.text)}</p>${item.awaitingReply?`<button class="talk-answer" data-reply="${escapeHtml(item.id)}" data-to="${item.from}">Répondre</button>`:''}</article>`;}
function plannedTalk(){return(state.orders||[]).filter(o=>o.kind==='talk'&&o.status==='pending'&&o.nationId===state.playerNationId);}
function openTalk(){
  const feed=safeEngine(()=>talkFeed(state),[]),planned=plannedTalk(),others=map.nations.filter(n=>n.id!==state.playerNationId);
  $('#talkKicker').textContent=`FIL PUBLIC DES DIRIGEANTS · TOUR ${state.turn}`;
  $('#talkBody').innerHTML=`<div class="talk-start"><small>Lancer un échange avec</small><div class="talk-nations">${others.map(n=>`<button data-talk-nation="${n.id}" style="--nation:${n.color}">${crestGlyph(n.crest)} ${n.short}</button>`).join('')}</div></div>
   ${planned.length?`<div class="talk-planned">${planned.map(o=>`<div>✉ ${toneMeta(o.tone).icon} Message à ${o.to?nation(o.to).short:'tous'} : part à la fin du tour</div>`).join('')}</div>`:''}
   <div class="talk-feed">${feed.length?feed.map(talkLine).join(''):'<p class="talk-empty">Aucun échange public pour l’instant. Les dirigeants prendront la parole au fil des tours.</p>'}</div>`;
  document.querySelectorAll('[data-talk-nation]').forEach(b=>b.onclick=()=>openTalkCompose(b.dataset.talkNation));
  document.querySelectorAll('[data-reply]').forEach(b=>b.onclick=()=>openTalkCompose(b.dataset.to,b.dataset.reply));
  if(!$('#talkDialog').open)$('#talkDialog').showModal();
  tutorial('talk','Échanges entre dirigeants','Les dirigeants se parlent en public. Tu n’écris pas : tu choisis un ton (hostile, neutre ou amical). Les messages hostiles font monter la tension et le risque de guerre.');
}
function openTalkCompose(to,replyTo=null){
  const options=safeEngine(()=>talkOptions(state,map,{from:state.playerNationId,to,replyTo}),[]),original=replyTo?(state.talk||[]).find(m=>m.id===replyTo):null,t=tensionWith(to);
  if($('#talkDialog').open)$('#talkDialog').close();
  const byTone=Object.fromEntries(options.map(o=>[o.tone,o])),ordered=TONE_ORDER.map(k=>byTone[k]).filter(Boolean);
  actionModal(replyTo?`Répondre à ${nation(to).short}`:`Échange avec ${nation(to).short}`,`MESSAGE PUBLIC · ${t.war?`EN GUERRE · TENSION ${t.value} %`:`TENSION ${t.value} % (${t.label.toUpperCase()})`}`,
   `${original?`<blockquote class="talk-quote ${toneMeta(original.tone).cls}">${nationBadge(original.from)} ${escapeHtml(original.text)}</blockquote>`:''}<p class="talk-help">Choisis un ton. Le texte est écrit pour toi ; tous les dirigeants le liront.</p>
   <div class="tone-list">${ordered.length?ordered.map(o=>{const tone=toneMeta(o.tone);return`<button class="tone-card ${tone.cls}" data-tone="${o.tone}" aria-pressed="false"><span class="tone-name">${tone.icon} ${tone.label}</span><span class="tone-text">« ${escapeHtml(o.text)} »</span>${o.preview&&o.preview!==o.text?`<small>${escapeHtml(o.preview)}</small>`:''}</button>`;}).join(''):'<p>Aucun message possible pour l’instant.</p>'}</div>
   <div class="confirm-actions"><button class="cancel" id="talkBack">Retour</button><button class="primary" id="talkSend" disabled>Envoyer</button></div>`);
  let chosen=null;
  document.querySelectorAll('[data-tone]').forEach(b=>b.onclick=()=>{chosen=b.dataset.tone;document.querySelectorAll('[data-tone]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));$('#talkSend').disabled=false;$('#talkSend').textContent=`Envoyer (${toneMeta(chosen).label.toLowerCase()})`;});
  $('#talkBack').onclick=()=>{$('#actionDialog').close();openTalk();};
  $('#talkSend').onclick=()=>{if(!chosen)return;const before=(state.talk||[]).length,result=safeEngine(()=>queueTalk(state,map,{from:state.playerNationId,to,tone:chosen,replyTo}),{ok:false,error:'Échange impossible pour le moment'});
    if(!result?.ok)return toast(result?.error||'Échange impossible');
    $('#actionDialog').close();render();toast((state.talk||[]).length>before?`Message ${toneMeta(chosen).label.toLowerCase()} publié`:`Message ${toneMeta(chosen).label.toLowerCase()} prêt : il partira à la fin du tour`);openTalk();};
}
function renderJournal(permanent=false){
  const entries=(permanent?state.chronicle:state.turnJournal||state.journal||[]).map(entry=>sanitizeJournalEntry(entry.text?entry:journalEntry(entry,map,state.playerNationId))).filter(Boolean);
  $('#journalDialog').dataset.permanent=permanent?'true':'false';$('#journalMode').textContent=permanent?'JOURNAL PERMANENT':'RÉCAPITULATIF INTER-TOUR';
  $('#journalTabs').innerHTML=`<button data-journal="recent" class="${permanent?'':'active'}">Inter-tour</button><button data-journal="history" class="${permanent?'active':''}">Historique</button>`;
  $('#journalBody').innerHTML=entries.length?entries.map(e=>`<div class="journal-entry ${journalCategoryClass(e.type)}"><small>${e.type||'Événement'}</small><div>${e.text}</div></div>`).join(''):'<div class="journal-entry neutral"><small>Calme</small><div>Aucun événement important à signaler.</div></div>';
  document.querySelectorAll('[data-journal]').forEach(b=>b.onclick=()=>renderJournal(b.dataset.journal==='history'));
  $('#journalDialog').showModal();if(!permanent)tutorial('history','Deux journaux','Le récapitulatif inter-tour montre les événements importants. L’historique garde le détail connu des productions et du monde.');
}
function openHelp(){const entries=TUTORIAL_GUIDE;$('#helpBody').innerHTML=entries.map(x=>`<article class="help-item"><b>${x.title}</b><p>${x.text.replace('{nation}',nation(state.playerNationId).name)}</p></article>`).join('');$('#helpDialog').showModal();}
function openArmy(){const army=totalArmy(state,state.playerNationId);actionModal('Armée totale',`TOUR ${state.turn}`,Object.entries(army.byType).map(([key,value])=>`<div class="unit-row"><span>${unitKeys[key]}</span><b>${value}</b></div>`).join(''));}
// --- V10 : fin de partie --------------------------------------------------------------------------------------
function showEndScreen(){
  const go=state.gameOver;if(!go)return false;
  const me=state.playerNationId,mine=go.ranking.find(r=>r.nationId===me),won=go.winnerId===me;
  const title=go.reason==='player-eliminated'?'Défaite':won?'Victoire !':'Fin de la partie';
  const why=go.reason==='capitals'?`${nation(go.winnerId).name} tient les cinq capitales.`:go.reason==='player-eliminated'?`${nation(me).name} n’a plus aucune province.`:`Les ${go.turn} tours sont écoulés.`;
  const rows=go.ranking.map(r=>`<tr class="${r.nationId===me?'me':''}${r.eliminated?' out':''}"><td>${r.rank}</td><td><i style="--nation:${nation(r.nationId).color}"></i>${nation(r.nationId).short}${r.eliminated?' <small>éliminée</small>':''}</td><td>${r.provinces}</td><td>${r.capitals}</td><td>${r.treasury}</td></tr>`).join('');
  $('#endKicker').textContent=`TOUR ${go.turn} · ${go.reason==='capitals'?'VICTOIRE ANTICIPÉE':go.reason==='player-eliminated'?'NATION ÉLIMINÉE':`FIN DES ${go.turn} TOURS`}`;
  $('#endTitle').textContent=title;$('#endDialog').dataset.result=go.reason==='player-eliminated'||!won&&go.reason==='capitals'?'defeat':won?'victory':'end';
  $('#endBody').innerHTML=`<p class="end-why">${why} ${go.reason==='player-eliminated'?'':won?'Votre nation termine première.':`Votre nation termine ${mine?.rank===1?'1re':`${mine?.rank}e`} sur ${go.ranking.length}.`}</p><table class="ranking"><thead><tr><th>#</th><th>Nation</th><th>Prov.</th><th>Cap.</th><th>Or</th></tr></thead><tbody>${rows}</tbody></table><p class="end-rule">Classement : provinces, puis capitales tenues, puis trésor.</p>`;
  $('#endDialog').showModal();return true;
}
function resolveTurn(){
  if(showEndScreen())return;
  const count=state.orders.filter(o=>o.status==='pending').length;
  const summary=count?state.orders.filter(o=>o.status==='pending').map(o=>o.kind==='move'?`${province(o.fromId).name} → ${province(o.toId).name} (${o.nationId===state.playerNationId?'mouvement':'ordre'})`:o.kind==='diplomacy'?`Diplomatie : ${({war:'déclaration de guerre',alliance:'proposition d’alliance',ceasefire:'cessez-le-feu',break:'rupture d’alliance'})[o.action]||o.action} (${nation(o.target).short})`:o.kind==='help'?`Demande d’aide à ${nation(o.to).short}`:o.kind==='construction'?`Construction : ${buildingNames[o.type]}`:o.kind==='talk'?`Message ${o.tone==='hostile'?'hostile':o.tone==='amical'?'amical':'neutre'} à ${o.to?nation(o.to).short:'tous'}`:`Production : ${RULES.units[o.type]?.label||o.type}`).join('\n'):'Aucun ordre en attente.';
  actionModal('Terminer le tour',`${count} ordre(s) en attente`,`<p>Les ordres deviennent définitifs pour cette résolution. Les IA verrouillent aussi les leurs.</p><pre class="order-summary">${summary}</pre><button id="confirmEndTurn" class="primary">Verrouiller et résoudre</button>`);
  // V13 : après la résolution — prise de capitale (fenêtre dédiée), journal, puis une fenêtre Oui / Non par proposition reçue.
  $('#confirmEndTurn').onclick=async()=>{ $('#actionDialog').close(); const eventStart=state.events.length; nextTurn(state,map);tutorialShown.clear();state.tutorial.turn=state.turn;state.tutorial.shown=[];render();playSfx();const events=state.events.slice(eventStart);trackMissions(events);
    await showCapitalPopups(events);
    await showSeaPopups(events);
    if(state.gameOver){showEndScreen();return;}
    renderJournal(false);await dialogClosed($('#journalDialog'));
    await showProposalPopups(); };
}
function playSfx(){if(!state.settings.sfx)return;audioCtx ||= new AudioContext();const o=audioCtx.createOscillator(),g=audioCtx.createGain();o.frequency.value=330;g.gain.setValueAtTime(.035,audioCtx.currentTime);g.gain.exponentialRampToValueAtTime(.001,audioCtx.currentTime+.12);o.connect(g).connect(audioCtx.destination);o.start();o.stop(audioCtx.currentTime+.12);}
function setMusic(on){if(!on){musicNodes.forEach(n=>n.stop?.());musicNodes=[];return;}audioCtx ||= new AudioContext();if(musicNodes.length)return;[110,146.8,164.8].forEach((f,i)=>{const o=audioCtx.createOscillator(),g=audioCtx.createGain();o.type='sine';o.frequency.value=f;g.gain.value=.009/(i+1);o.connect(g).connect(audioCtx.destination);o.start();musicNodes.push(o);});}
// Sauvegarde d'une autre carte (ex. V6 'arken-v1-original-map') : elle n'est plus ignorée en silence (B14).
function savedOnOtherMap(value){return Boolean(value&&value.mapId&&value.mapId!==map.id);}
function showSaveNotice(raw){const notice=$('#saveNotice');notice.hidden=!savedOnOtherMap(raw);}
function hydrateState(value){
  if(!value||value.mapId!==map.id)return null;
  value.turnJournal||=value.journal||[];value.chronicle||=[];value.orders||=[];value.tutorial||={seen:[],stage:0,turn:value.turn,shown:[]};value.tutorial.shown||=[];value.tutorial.turn??=value.turn;
  value.orderSequence=Math.max(Number(value.orderSequence)||1,1+value.orders.length);value.transports||=[];value.transportSequence=Math.max(1,Number(value.transportSequence)||1);value.randomCounter=Math.max(0,Number(value.randomCounter)||0);value.warChestsClaimed||={};
  for(const n of map.nations)if(value.nations[n.id])value.nations[n.id].capitalId||=map.provinces.find(p=>p.initialOwner===n.id)?.id;
  for(const d of map.provinces)if(value.provinces[d.id])value.provinces[d.id].portSite=Boolean(d.port);
  if(!value.chronicle.length&&value.events?.length)value.chronicle=value.events.filter(e=>eventKnownToPlayer(value,map,e)).map(e=>journalEntry(e,map,value.playerNationId)).filter(Boolean);
  return applyBoosts(value);
}
// --- V12 : atouts, missions du jour, achats de test, profil ------------------------------------------------------
function trackMissions(events){
  const r=missionDeltas(events,state.playerNationId),res=addMissionProgress(profile,todayLocal(),r);saveMyProfile();
  if(res.completed.length)setTimeout(()=>toast(`Mission accomplie : ${res.completed.map(m=>m.label).join(' · ')}${res.tokens?` — 5/5 : +${res.tokens} jeton !`:''}`),400);
}
function openBoosts(){
  const inGame=!$('#gameScreen').hidden&&Boolean(state);
  $('#boostBody').innerHTML=boostScreenHtml(profile,todayLocal(),{inGame});
  document.querySelectorAll('[data-boost]').forEach(b=>b.onclick=()=>{const r=upgradeBoost(profile,b.dataset.boost);if(!r.ok)return toast(r.error);saveMyProfile();if(state){applyBoosts(state);save();}openBoosts();toast(`${BOOST_INFO[b.dataset.boost].label} : +${r.level} %`);});
  document.querySelectorAll('[data-buy]').forEach(b=>b.onclick=async()=>{b.disabled=true;const r=await purchase(profile,b.dataset.buy,{date:todayLocal()});if(!r.ok){b.disabled=false;return toast(r.error);}saveMyProfile();openBoosts();toast(`Achat de test : ${productById(b.dataset.buy).label}${r.tokens?` · +${r.tokens} jeton${r.tokens>1?'s':''}`:''}${r.adsRemoved?' · publicités supprimées':''}`);});
  $('[data-watch-ad]')?.addEventListener('click',async()=>{const r=await showRewardedAd();if(!r.rewarded)return toast('Publicité indisponible pour le moment');const res=recordAdWatched(profile,todayLocal());saveMyProfile();openBoosts();toast(`Mission publicité accomplie${res.tokens?` — 5/5 : +${res.tokens} jeton !`:''}`);});
  $('#copyProfile').onclick=copyProfile;$('#restoreProfile').onclick=restoreProfileView;
  if(!$('#boostDialog').open)$('#boostDialog').showModal();
}
async function copyProfile(){
  const text=exportProfile(profile);let copied=false;
  try{await navigator.clipboard.writeText(text);copied=true;}catch{}
  $('#boostBody').insertAdjacentHTML('beforeend',`<div class="profile-export"><p>${copied?'Profil copié. Colle-le dans tes notes pour le garder en sécurité.':'Sélectionne et copie ce texte dans tes notes :'}</p><textarea readonly rows="4">${escapeHtml(text)}</textarea></div>`);
  const area=$('#boostBody .profile-export:last-child textarea');area.focus();area.select();area.scrollIntoView({block:'center'});if(copied)toast('Profil copié');
}
function restoreProfileView(){
  $('#boostBody').innerHTML=`<p>Colle ici le texte copié avec « Copier mon profil ». Il remplacera le profil de cet appareil (jetons, atouts, achats). Ta partie en cours n’est pas touchée.</p><textarea id="restoreText" rows="6" placeholder="ARKEN-PROFIL-1:…"></textarea><div class="confirm-actions"><button class="cancel" id="restoreBack">Retour</button><button class="primary" id="restoreGo">Restaurer</button></div>`;
  $('#restoreBack').onclick=openBoosts;
  $('#restoreGo').onclick=()=>{const r=importProfile($('#restoreText').value);if(!r.ok)return toast(r.error);profile=r.profile;saveMyProfile();if(state){applyBoosts(state);save();}openBoosts();toast('Profil restauré');};
}
function showWelcome(){
  setActiveScreen(document,'welcome');const raw=load(),saved=hydrateState(raw);$('#continueGame').hidden=!saved;showSaveNotice(raw);$('#tutorialBubble').hidden=true;state=null;history.replaceState({arkenScreen:'home'},'',location.href);
}
function showGame(){
  setActiveScreen(document,'game');history.pushState({arkenScreen:'game'},'',location.href);
  requestAnimationFrame(()=>{measureFrame();render();focusProvince(state.nations[state.playerNationId]?.capitalId||'p01');if(state.gameOver)showEndScreen();});
}
function continueSavedGame(){state=hydrateState(load());if(!state)return toast('Aucune sauvegarde valide à reprendre');selected=null;moveSource=null;scale=1;tx=ty=0;updateLabelScale();showGame();}
function confirmSaveReplacement(){
  const dialog=$('#replaceSaveDialog');
  return new Promise(resolve=>{
    let replace=false;
    dialog.addEventListener('close',()=>resolve(replace),{once:true});
    $('#cancelNewGame').onclick=()=>{replace=false;dialog.close();};
    $('#confirmNewGame').onclick=()=>{replace=true;dialog.close();};
    dialog.addEventListener('cancel',event=>{event.preventDefault();replace=false;dialog.close();},{once:true});
    dialog.showModal();
  });
}
function beginNewGame(){
  const hasStoredSave=Boolean(localStorage.getItem(SAVE_KEY));
  if(!hasStoredSave){openNationChoice();return;}
  confirmSaveReplacement().then(confirmed=>{
    if(resolveNewGameRequest({hasStoredSave,confirmed})==='choose-nation')openNationChoice();
  });
}
function openNationChoice(){
  $('#nationChoices').innerHTML=map.nations.map(n=>`<button class="nation" data-nation="${n.id}" style="--nation:${n.color}"><i></i><b>${n.name}</b></button>`).join('');
  document.querySelectorAll('[data-nation]').forEach(b=>b.onclick=async()=>{state=applyBoosts(createGameState({map,playerNationId:b.dataset.nation,seed:'arken-'+Date.now().toString(36)}));$('#nationDialog').close();save();
    // V12 : une publicité (emplacement de TEST en bêta) au début de chaque nouvelle partie, sauf avec le Pack débutant.
    await showGameStartAd({profile});selected=null;moveSource=null;scale=1;tx=ty=0;updateLabelScale();showGame();await showIntro();tutorial('identity','Vous dirigez '+nation(state.playerNationId).name,TUTORIAL_GUIDE[0].text.replace('{nation}',nation(state.playerNationId).name));tutorial('map','Votre carte stratégique',TUTORIAL_GUIDE[1].text);});
  $('#nationDialog').showModal();
}
function setup(){const raw=load(),saved=hydrateState(raw);$('#continueGame').hidden=!saved;showSaveNotice(raw);setActiveScreen(document,'welcome');}
function measureFrame(){const viewport=$('#viewport'),svg=$('#map');frameSize={width:viewport.clientWidth,height:viewport.clientHeight};if(!frameSize.width||!frameSize.height)return;
  const cover=Math.max(frameSize.width/FRAME.width,frameSize.height/FRAME.height),contain=Math.min(frameSize.width/FRAME.width,frameSize.height/FRAME.height);
  mapContentSize={width:FRAME.width*cover,height:FRAME.height*cover};minZoom=Math.min(1,contain/cover);
  Object.assign(svg.style,{position:'absolute',width:`${mapContentSize.width}px`,height:`${mapContentSize.height}px`,left:`${(frameSize.width-mapContentSize.width)/2}px`,top:`${(frameSize.height-mapContentSize.height)/2}px`});clampTransform();}
// Centre la vue sur une province (capitale du joueur au lancement).
function focusProvince(id){const d=province(id);if(!mapContentSize.width)return;const k=mapContentSize.width/FRAME.width;tx=(FRAME.width/2-d.markerAnchor.x)*k*scale;ty=(FRAME.height/2-d.markerAnchor.y)*k*scale;clampTransform(0);}
// Les icônes et noms rétrécissent un peu quand on zoome (sinon ils deviendraient énormes) : appliqué en fin de geste.
function updateLabelScale(){const svg=$('#map');svg.style.setProperty('--ui',(1/Math.sqrt(Math.max(1,scale))).toFixed(3));svg.style.setProperty('--line',(1/Math.pow(scale,.7)).toFixed(3));}
// edgeSlack : marge de glisse au-delà du bord (0 = la carte reste calée sur le cadre, utilisé pour recentrer).
function clampTransform(edgeSlack=PAN_SLACK){
  if(!frameSize.width||!frameSize.height)return;
  const next=mapFrameTransform({scale,x:tx,y:ty},frameSize,mapContentSize,MAX_ZOOM,minZoom,edgeSlack);
  scale=next.scale;tx=next.x;ty=next.y;
  if(!transformFrame)transformFrame=requestAnimationFrame(()=>{transformFrame=0;$('#map').style.transform=`translate3d(${tx}px,${ty}px,0) scale(${scale})`;});
}
function pointerDistance(a,b){return Math.hypot(a.x-b.x,a.y-b.y);}
const viewport=$('#viewport');
viewport.addEventListener('pointerdown',event=>{
  pointers.set(event.pointerId,{x:event.clientX,y:event.clientY,type:event.pointerType});
  if(event.pointerType==='touch'&&pointers.size===2){const [a,b]=[...pointers.values()],rect=viewport.getBoundingClientRect();pinching=true;drag=null;pinchStart={distance:pointerDistance(a,b),scale,x:tx,y:ty,left:rect.left,top:rect.top,centerX:frameSize.width/2,centerY:frameSize.height/2,mid:{x:(a.x+b.x)/2-rect.left,y:(a.y+b.y)/2-rect.top}};ignoreClickUntil=Date.now()+600;event.preventDefault();return;}
  if(pointers.size===1)drag={pointerId:event.pointerId,startX:event.clientX,startY:event.clientY,lastX:event.clientX,lastY:event.clientY,panning:false};
});
viewport.addEventListener('pointermove',event=>{
  if(pointers.has(event.pointerId))pointers.set(event.pointerId,{x:event.clientX,y:event.clientY,type:event.pointerType});
  if(pinching&&pointers.size>=2){const [a,b]=[...pointers.values()],mid={x:(a.x+b.x)/2,y:(a.y+b.y)/2},next=pinchTransform({scale:pinchStart.scale,x:pinchStart.x,y:pinchStart.y,startMidX:pinchStart.mid.x,startMidY:pinchStart.mid.y,midX:mid.x-pinchStart.left,midY:mid.y-pinchStart.top,centerX:pinchStart.centerX,centerY:pinchStart.centerY,startDistance:pinchStart.distance,currentDistance:pointerDistance(a,b),maxScale:MAX_ZOOM,minScale:minZoom});scale=next.scale;tx=next.x;ty=next.y;ignoreClickUntil=Date.now()+600;clampTransform();event.preventDefault();return;}
  if(!drag||drag.pointerId!==event.pointerId)return;
  if(!drag.panning&&Math.hypot(event.clientX-drag.startX,event.clientY-drag.startY)>6){drag.panning=true;viewport.setPointerCapture?.(drag.pointerId);ignoreClickUntil=Date.now()+400;}
  if(drag.panning){tx+=event.clientX-drag.lastX;ty+=event.clientY-drag.lastY;drag.lastX=event.clientX;drag.lastY=event.clientY;clampTransform();}
});
const endPointer=event=>{pointers.delete(event.pointerId);if(pointers.size<2&&pinching){pinching=false;pinchStart=null;ignoreClickUntil=Date.now()+600;updateLabelScale();}if(drag?.pointerId===event.pointerId){if(drag.panning)ignoreClickUntil=Date.now()+400;drag=null;}};
viewport.addEventListener('pointerup',endPointer);viewport.addEventListener('pointercancel',endPointer);

document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>b.closest('dialog').close());
$('#tutorialOk').onclick=()=>$('#tutorialBubble').hidden=true;
$('#closeSheet').onclick=()=>{$('#provinceSheet').hidden=true;selected=null;placeTutorial();render();};
$('#talkBtn').onclick=()=>openTalk();
$('#boostBtn').onclick=openBoosts;$('#welcomeBoosts').onclick=openBoosts;$('#settingsBoosts').onclick=()=>{$('#settingsDialog').close();openBoosts();};
$('#cancelMove').onclick=cancelMove;$('#armyBtn').onclick=openArmy;$('#helpBtn').onclick=openHelp;$('#journalBtn').onclick=()=>renderJournal(false);$('#nextTurn').onclick=resolveTurn;
$('#continueGame').onclick=continueSavedGame;$('#startNewGame').onclick=beginNewGame;$('#homeBtn').onclick=showWelcome;
$('#settingsBtn').onclick=()=>{for(const k of ['music','sfx','hints'])$(`#${k}Toggle`).checked=state.settings[k];$('#settingsDialog').showModal();};
for(const k of ['music','sfx','hints'])$(`#${k}Toggle`).onchange=e=>{state.settings[k]=e.target.checked;if(k==='music')setMusic(e.target.checked);save();};
$('#resetHints').onclick=()=>{state.tutorial.seen=[];state.tutorial.stage=0;state.tutorial.shown=[];state.tutorial.turn=state.turn;save();$('#settingsDialog').close();tutorialShown.clear();tutorial('identity','Rejouer le tutoriel',TUTORIAL_GUIDE[0].text.replace('{nation}',nation(state.playerNationId).name));};
$('#newGame').onclick=()=>{$('#settingsDialog').close();beginNewGame();};
$('#endNewGame').onclick=()=>{$('#endDialog').close();beginNewGame();};$('#endJournal').onclick=()=>{$('#endDialog').close();renderJournal(true);};
// Zoom par boutons autour du centre de l'écran (la vue ne dérive pas).
function zoomBy(factor){const next=Math.max(minZoom,Math.min(MAX_ZOOM,scale*factor)),ratio=next/scale;scale=next;tx*=ratio;ty*=ratio;clampTransform();updateLabelScale();}
$('#zoomIn').onclick=()=>zoomBy(1.4);$('#zoomOut').onclick=()=>zoomBy(1/1.4);$('#zoomReset').onclick=()=>{scale=1;tx=ty=0;clampTransform();if(state)focusProvince(state.nations[state.playerNationId].capitalId);updateLabelScale();};
$('#mapShell').addEventListener('click',event=>{if(event.target.closest('.order-arrow'))tutorial('orders','Ordres en attente',TUTORIAL_GUIDE.find(x=>x.id==='orders').text);});
function handleAppBack(){
  if(document.querySelector('#adOverlay[open]')){history.pushState({arkenScreen:$('#gameScreen').hidden?'home':'game'},'',location.href);return;} // V12 : la pub de test se ferme seule
  const dialog=[...document.querySelectorAll('dialog[open]')].at(-1);
  if(dialog){dialog.close();if(!$('#gameScreen').hidden)history.pushState({arkenScreen:'game'},'',location.href);return;}
  if($('#gameScreen').hidden)return;
  if(moveSource)cancelMove();
  else if(!$('#provinceSheet').hidden){$('#provinceSheet').hidden=true;selected=null;render();}
  else showWelcome();
  if(!$('#gameScreen').hidden)history.pushState({arkenScreen:'game'},'',location.href);
}
addEventListener('popstate',handleAppBack);addEventListener('resize',measureFrame);if('serviceWorker'in navigator)navigator.serviceWorker.register('sw.js');setup();
