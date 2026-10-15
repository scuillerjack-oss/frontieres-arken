import { arkenV1Map as map } from './src/map/arken-v1-map.js';
import { createGameState } from './src/state/create-game-state.js';
import { encodeSave, decodeSave } from './src/persistence/save-codec.js';
import { eventKnownToPlayer, journalEntry, legalDestinations, nextTurn, queueConstruction, queueDiplomaticOrder, queueMoveOrder, queueRecruitment, availableForces, spendableTreasury } from './src/domain/game-engine.js';
import { compactForces, diplomacyActions, relationWithPlayer, totalArmy, clampMapTransform } from './src/presentation/v3-ux.js';
import { forceSelection, provinceBorderPoint, SAVE_KEY, TUTORIAL_GUIDE, sanitizeJournalEntry } from './src/presentation/v4-ux.js';
import { cancelPendingOrder, ceasefireOffers, journalCategoryClass, mapFrameTransform, pinchTransform, playerOrderArrows } from './src/presentation/v5-ux.js';
import { resolveNewGameRequest } from './src/presentation/start-flow.js';
import { setActiveScreen } from './src/presentation/screen-flow.js';
import { RULES, LAND_UNIT_TYPES } from './src/domain/constants.js';

const $ = selector => document.querySelector(selector), SVG = 'http://www.w3.org/2000/svg';
const names = {Infanterie:'Infanterie',Cavalerie:'Cavalerie',Blindés:'Blindés',Artillerie:'Artillerie',Ballons:'Ballons',Navires:'Navires'};
const unitKeys = { infantry:'Infanterie', cavalry:'Cavalerie', armor:'Blindés', artillery:'Artillerie', balloon:'Ballons', warship:'Navires' };
const buildingNames = { bank:'Banque', factory:'Usine', fort:'Forteresse', port:'Port' };
const icons = { bank:'▦', factory:'⚒', fort:'▣', port:'⚓' };
const nation = id => map.nations.find(n => n.id === id) || { short:'Nation inconnue', name:'Nation inconnue' };
const province = id => map.provinces.find(p => p.id === id) || { name:'Province inconnue', markerAnchor:{x:0,y:0}, geometry:{points:[]} };
let state, selected = null, moveSource = null, scale = 1, tx = 0, ty = 0, drag = null, toastTimer, tutorialShown = new Set();
let pointers = new Map(), pinching = false, pinchStart = null, ignoreClickUntil = 0, audioCtx, musicNodes = [], frameSize={width:0,height:0}, mapContentSize={width:0,height:0}, transformFrame=0;
const save = () => { if (state) localStorage.setItem(SAVE_KEY, encodeSave(state)); };
const load = () => { try { const raw=localStorage.getItem(SAVE_KEY); return raw ? decodeSave(raw) : null; } catch { return null; } };
const E = (tag, attrs={}) => { const node=document.createElementNS(SVG,tag); for(const [k,v] of Object.entries(attrs)) node.setAttribute(k,v); return node; };
function toast(message) { const node=$('#toast'); node.textContent=message; node.classList.add('show'); clearTimeout(toastTimer); toastTimer=setTimeout(()=>node.classList.remove('show'),4200); }
function tutorial(id,title,text) {
  if (!state.settings.hints || state.tutorial.seen.includes(id)) return;
  if(state.tutorial.turn!==state.turn){state.tutorial.turn=state.turn;state.tutorial.shown=[];}
  state.tutorial.shown||=[];if(state.tutorial.shown.length>=2)return;
  state.tutorial.shown.push(id);tutorialShown.add(id);state.tutorial.seen.push(id);state.tutorial.stage=(state.tutorial.stage||0)+1;save();
  $('#tutorialTitle').textContent=title; $('#tutorialText').textContent=text; $('#tutorialBubble').hidden=false;
}
function routeLine(fromId,toId,kind){
  const a=province(fromId),b=province(toId),start=provinceBorderPoint(a,b.markerAnchor),end=provinceBorderPoint(b,a.markerAnchor);
  return E('line',{x1:start.x,y1:start.y,x2:end.x,y2:end.y,class:`route ${kind}`});
}
function destinations(){return new Set(moveSource?legalDestinations(map,state,moveSource).map(x=>x.id):[]);}
function render(){
  const svg=$('#map'),allowed=destinations(),routeLayer=[],defs=E('defs');
  for(const [id,color] of [['arrow-green','#62ed99'],['arrow-red','#ff625b']]){const marker=E('marker',{id,viewBox:'0 0 10 10',refX:'8',refY:'5',markerWidth:'7',markerHeight:'7',orient:'auto-start-reverse'});marker.append(E('path',{d:'M 0 0 L 10 5 L 0 10 z',fill:color}));defs.append(marker)}
  svg.replaceChildren(defs,E('rect',{width:400,height:260,class:'sea'}));
  map.maritimeRoutes.forEach(r=>routeLayer.push(routeLine(r[0],r[1],'maritime'))); map.visibleRoutes.forEach(r=>routeLayer.push(routeLine(r.from,r.to,'land')));
  for(const d of map.provinces){
    const p=state.provinces[d.id],diploState=relationWithPlayer(state,p.ownerId),classes=['province'];
    if(selected===d.id)classes.push('selected');
    if(p.ownerId===state.playerNationId&&!moveSource)classes.push('player-province');
    if(moveSource)classes.push(allowed.has(d.id)?'destination':'blocked');
    const group=E('g',{class:classes.join(' '),'data-id':d.id,role:'button',tabindex:'0','aria-label':`${d.name}, ${nation(p.ownerId).short}`});
    group.style.setProperty('--owner',nation(p.ownerId).color);group.style.setProperty('--diplo',diploState==='war'?'#e45c56':diploState==='alliance'?'#5da9ff':'#f3f1e9');
    const points=d.geometry.points.map(x=>x.join(',')).join(' ');group.append(E('polygon',{points}),E('polygon',{points}));
    const label=E('text',{x:d.markerAnchor.x,y:d.markerAnchor.y});label.textContent=d.name;group.append(label);
    if(Object.values(state.nations).some(n=>n.capitalId===d.id)){const star=E('text',{x:d.markerAnchor.x,y:d.markerAnchor.y-12,class:'capital','aria-label':'Capitale nationale'});star.textContent='★';group.append(star);}
    let offset=-14;for(const [key,count] of Object.entries(p.buildings||{}))if(count){const symbol=E('text',{x:d.markerAnchor.x+offset,y:d.markerAnchor.y+12,class:'building'});symbol.textContent=`${icons[key]||'•'}${key==='fort'&&count>1?count:''}`;group.append(symbol);offset+=10;}
    if(Object.values(p.units).some(Boolean)||p.warships)group.append(E('circle',{cx:d.markerAnchor.x+18,cy:d.markerAnchor.y-10,r:4,class:'marker'}));
    group.addEventListener('click',()=>{if(Date.now()<ignoreClickUntil)return;selectProvince(d.id);});
    group.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();selectProvince(d.id);}});svg.append(group);
  }
  svg.append(...routeLayer);
  for(const order of playerOrderArrows(state,map)){
    const start=provinceBorderPoint(province(order.fromId),order.end),end=provinceBorderPoint(province(order.toId),order.start);
    const arrow=E('line',{x1:start.x,y1:start.y,x2:end.x,y2:end.y,class:`order-arrow ${order.kind}`,'data-order-id':order.id,tabindex:'0',role:'button','aria-label':`${order.kind==='attack'?'Attaque':'Déplacement'} : ${order.fromName} vers ${order.toName}`});
    arrow.addEventListener('click',event=>{event.stopPropagation();openPendingOrder(order.id)});arrow.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();openPendingOrder(order.id)}});svg.append(arrow);
  }
  const army=totalArmy(state,state.playerNationId);$('#turn').textContent=state.turn;$('#gold').textContent=state.nations[state.playerNationId].treasury;$('#armyTotal').textContent=army.total;
  $('#pendingCount').textContent=state.orders.filter(o=>o.status==='pending').length; save();
}
function selectProvince(id){
  if(moveSource){if(legalDestinations(map,state,moveSource).some(x=>x.id===id))openForceSelection(moveSource,id);return;}
  selected=id;render();showProvinceSheet();
  tutorial('province-sheet','Inspecter une province','La fiche indique son propriétaire, les constructions, les forces connues et les actions possibles.');
}
function showProvinceSheet(){
  if(!selected)return;const definition=province(selected),p=state.provinces[selected],mine=p.ownerId===state.playerNationId,relation=relationWithPlayer(state,p.ownerId),forces=compactForces(state,map,selected);
  $('#sheetKicker').textContent=`${nation(p.ownerId).name} · ${relation==='war'?'guerre':relation==='alliance'?'alliée':relation==='own'?'votre royaume':'neutre'}`;
  $('#sheetTitle').textContent=definition.name;
  const structures=Object.entries(p.buildings).filter(([,n])=>n).map(([key,n])=>`${icons[key]} ${buildingNames[key]}${key==='fort'?` ${n}`:''}`).join(' · ')||'Aucune construction';
  $('#sheetInfo').innerHTML=`<span class="info-chip">${structures}</span>${forces.map(f=>`<span class="info-chip ${f.value==='Forces inconnues'?'unknown':''}">${f.label} : ${f.value}</span>`).join('')}`;
  const actions=mine?[['move','Déplacer / Attaquer'],['recruit','Recruter'],['build','Construire']]:[['diplo','Diplomatie']];
  $('#sheetActions').innerHTML=actions.map(([id,label])=>`<button data-sheet-action="${id}" class="${id==='diplo'?'secondary':''}">${label}</button>`).join('');$('#provinceSheet').hidden=false;
  document.querySelectorAll('[data-sheet-action]').forEach(button=>button.onclick=()=>({move:startMove,recruit:openRecruit,build:openBuild,diplo:()=>openDiplomacy(p.ownerId)})[button.dataset.sheetAction]());
  if(!mine&&forces[0]?.value!=='Forces inconnues')tutorial('intelligence','Renseignement',TUTORIAL_GUIDE.find(x=>x.id==='intelligence').text);
}
function startMove(){moveSource=selected;$('#provinceSheet').hidden=true;$('#moveBanner').hidden=false;$('#movePrompt').textContent=`Depuis ${province(moveSource).name} : touchez une destination verte`;render();tutorial('move','Ordres de déplacement','Choisissez une destination verte. Votre ordre sera préparé et les forces resteront réservées jusqu’à la résolution.');}
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
  const rows=[...LAND_UNIT_TYPES.map(k=>row(k,unitKeys[k])),row('warships','Navires')].join('');
  actionModal(attack?'Préparer une attaque':'Préparer un déplacement',`${province(fromId).name} → ${province(toId).name}${route?.type==='sea'?' · par mer':''}`,`<p>Choisis les forces à réserver. Elles ne bougent qu’à l’inter-tour.</p><div class="force-presets"><button data-preset="50">50 %</button><button data-preset="100">100 %</button><button data-preset="manual">Personnaliser</button></div>${rows}<div class="total-line"><span>Ordres déjà prévus depuis la province</span><b>${pendingFrom(fromId)}</b></div><p id="forceSummary"></p><button id="confirmMove" class="primary">Ajouter cet ordre</button>`);
  const updateSummary=()=>{const units=Object.fromEntries(LAND_UNIT_TYPES.map(k=>[k,Math.floor(Number(document.querySelector(`[data-force="${k}"]`)?.value)||0)])),ships=Math.floor(Number(document.querySelector('[data-force="warships"]')?.value)||0);$('#forceSummary').textContent=`${Object.entries(units).filter(([,n])=>n).map(([k,n])=>`${n} ${unitKeys[k].toLowerCase()}`).concat(ships?[`${ships} navires`]:[]).join(' · ')||'Aucune unité sélectionnée'}`;};
  document.querySelectorAll('[data-force]').forEach(i=>i.oninput=updateSummary);
  document.querySelectorAll('[data-preset]').forEach(b=>b.onclick=()=>{const mode=b.dataset.preset;if(mode==='manual'){document.querySelector('[data-force]')?.focus();return;}const chosen=forceSelection(available,mode);for(const k of LAND_UNIT_TYPES)document.querySelector(`[data-force="${k}"]`).value=chosen[k];document.querySelector('[data-force="warships"]').value=mode==='100'?available.warships:Math.floor(available.warships/2);updateSummary();});updateSummary();
  $('#confirmMove').onclick=()=>{const units=Object.fromEntries(LAND_UNIT_TYPES.map(k=>[k,Math.floor(Number(document.querySelector(`[data-force="${k}"]`)?.value)||0)])),warships=Math.floor(Number(document.querySelector('[data-force="warships"]')?.value)||0),quantity=Object.values(units).reduce((a,b)=>a+b,0)+warships,description=Object.entries(units).filter(([,n])=>n).map(([key,n])=>`${n} ${unitKeys[key].toLowerCase()}`).concat(warships?[`${warships} navires`]:[]).join(', ')||'Aucune force';
    if(!quantity)return toast('Sélectionne au moins une unité');
    confirmationModal(attack?'Confirmer l’attaque':'Confirmer le déplacement',`<div class="order-detail"><span>Action : ${attack?'attaquer':'déplacer les forces'}</span><span>Origine : ${province(fromId).name}</span><span>Province visée : ${province(toId).name}</span><span>Quantité : ${description}</span><span>Coût : 0 or</span><span>Trésor après ordre : ${state.nations[state.playerNationId].treasury} or</span></div>`,()=>{const result=queueMoveOrder(state,map,{nationId:state.playerNationId,fromId,toId,units,warships});if(!result.ok)return toast(result.error);$('#actionDialog').close();selected=null;render();toast('Ordre ajouté à la planification');tutorial('orders','Ordres en attente',TUTORIAL_GUIDE.find(x=>x.id==='orders').text);});
  };
  tutorial(attack?'attack':'move-confirm',attack?'Préparer une attaque':'Préparer un déplacement','Tu peux engager 50 %, toutes tes forces, ou personnaliser les unités. L’affrontement attend la fin du tour.');
  if(route?.type==='sea')tutorial('maritime','Transport maritime',TUTORIAL_GUIDE.find(x=>x.id==='maritime').text);
}
function openRecruit(){
  const p=state.provinces[selected],items=Object.entries(RULES.units).map(([key,r])=>({key,r,blocked:(r.requiresFactory&&!p.buildings.factory)||(r.requiresPort&&!p.buildings.port)}));
  actionModal('Recrutement',province(selected).name,`<div class="treasury-context"><span>Trésor actuel</span><b>${state.nations[state.playerNationId].treasury} or</b></div><div class="treasury-context"><span>Disponible après réserves</span><b>${spendableTreasury(state,state.playerNationId)} or</b></div>${items.map(({key,r,blocked})=>`<div class="action-card recruit-row"><span><b>${r.label}</b><small>${r.amount} par lot · ${r.cost} or · ${r.turns} tour(s)${blocked?' · Prérequis manquant':''}</small></span><div class="lot-controls"><button data-lot-minus="${key}" ${blocked?'disabled':''}>−</button><b id="lot-count-${key}">0</b><button data-lot-plus="${key}" ${blocked?'disabled':''}>+</button><small id="lot-amount-${key}">0 unité</small></div></div>`).join('')}<div class="total-line"><span>Coût total</span><b id="recruitCost">0</b></div><p id="recruitWarning"></p><button id="confirmRecruit" class="primary">Vérifier la commande</button>`);
  const lots=Object.fromEntries(items.map(x=>[x.key,0]));
  const update=()=>{const total=Object.entries(lots).reduce((n,[k,v])=>n+v*RULES.units[k].cost,0),available=spendableTreasury(state,state.playerNationId);$('#recruitCost').textContent=`${total} or`;$('#recruitWarning').textContent=total>available?'Trésor insuffisant après les sommes réservées.':'';for(const {key,r,blocked} of items){$(`#lot-count-${key}`).textContent=lots[key];$(`#lot-amount-${key}`).textContent=`${lots[key]*r.amount} unité${lots[key]*r.amount===1?'':'s'}`;const plus=document.querySelector(`[data-lot-plus="${key}"]`);if(plus)plus.disabled=blocked||total+r.cost>available;}};
  for(const {key} of items){document.querySelector(`[data-lot-minus="${key}"]`)?.addEventListener('click',()=>{lots[key]=Math.max(0,lots[key]-1);update();});document.querySelector(`[data-lot-plus="${key}"]`)?.addEventListener('click',()=>{lots[key]++;update();});}update();
  $('#confirmRecruit').onclick=()=>{const total=Object.entries(lots).reduce((n,[k,v])=>n+v*RULES.units[k].cost,0),quantity=Object.entries(lots).reduce((n,[k,v])=>n+v*RULES.units[k].amount,0);if(!quantity)return toast('Choisis au moins un lot');if(total>spendableTreasury(state,state.playerNationId))return toast('Trésor insuffisant après les sommes réservées');
    confirmationModal('Confirmer le recrutement',`<div class="order-detail"><span>Action : recrutement</span><span>Province : ${province(selected).name}</span><span>Quantité : ${quantity} unité(s) en ${Object.values(lots).filter(Boolean).reduce((n,v)=>n+v,0)} lot(s)</span><span>Coût total : ${total} or</span><span>Trésor après commande : ${state.nations[state.playerNationId].treasury-total} or</span><span>Disponible après réserves et commande : ${spendableTreasury(state,state.playerNationId)-total} or</span></div>`,()=>{for(const [type,count] of Object.entries(lots))if(count){const result=queueRecruitment(state,{nationId:state.playerNationId,provinceId:selected,type,lots:count});if(!result.ok)return toast(result.error);}$('#actionDialog').close();render();showProvinceSheet();toast('Ordre de recrutement ajouté à l’inter-tour');});
  };
  tutorial('recruit','Recruter par lots','Chaque + ajoute un lot réel : 20 fantassins ou 5 cavaliers. Le coût total est recalculé avant validation.');
}
function openBuild(){
  const p=state.provinces[selected],orders=state.orders.filter(o=>o.kind==='construction'&&o.provinceId===selected&&o.status==='pending'),active=state.productionQueue.filter(o=>o.kind==='building'&&o.provinceId===selected);
  const types=['bank','factory','fort',...(p.portSite?['port']:[])],items=types.map(type=>{const rule=RULES.buildings[type],count=(p.buildings[type]||0)+orders.filter(o=>o.type===type).length+active.filter(o=>o.type===type).length,cost=type==='fort'?rule.costs[count]:rule.cost;return{type,cost,turns:rule.turns,count};}).filter(x=>x.type!=='fort'||x.count<3).filter(x=>x.type!=='port'||x.count===0);
  actionModal('Construction',province(selected).name,`<div class="treasury-context"><span>Trésor actuel</span><b>${state.nations[state.playerNationId].treasury} or</b></div><div class="treasury-context"><span>Disponible après réserves</span><b>${spendableTreasury(state,state.playerNationId)} or</b></div><p>Les nouvelles constructions sont payées maintenant et livrées après leur durée.</p><div class="action-list">${items.map(x=>`<div class="action-card"><span><b>${icons[x.type]} ${buildingNames[x.type]}</b><small>${x.cost} or · ${x.turns} tour(s)${x.count?' · déjà en file':''}</small></span><button data-build="${x.type}" ${spendableTreasury(state,state.playerNationId)<x.cost?'disabled':''}>Vérifier</button></div>`).join('')}</div>`);
  document.querySelectorAll('[data-build]').forEach(button=>button.onclick=()=>{const type=button.dataset.build,item=items.find(x=>x.type===type);if(!item)return;confirmationModal('Confirmer la construction',`<div class="order-detail"><span>Action : construire ${buildingNames[type]}</span><span>Province : ${province(selected).name}</span><span>Quantité : 1 bâtiment (${item.turns} tour(s))</span><span>Coût : ${item.cost} or</span><span>Trésor après commande : ${state.nations[state.playerNationId].treasury-item.cost} or</span><span>Disponible après réserves et commande : ${spendableTreasury(state,state.playerNationId)-item.cost} or</span></div>`,()=>{const result=queueConstruction(state,{nationId:state.playerNationId,provinceId:selected,type});if(!result.ok)return toast(result.error);$('#actionDialog').close();render();showProvinceSheet();toast('Ordre de construction ajouté à l’inter-tour');});});
  tutorial('build','Financer une construction','Chaque bâtiment, y compris un port, coûte de l’or et n’apparaît qu’après sa durée de construction.');
}
function diplomaticExplanation(id,target){return({war:`Déclarer la guerre à ${nation(target).short}. L’état de guerre s’appliquera à l’inter-tour.`,alliance:`Proposer une alliance à ${nation(target).short}. Elle commencera à l’inter-tour.`,ultimatum:`Proposer un cessez-le-feu payé à ${nation(target).short}. L’offre peut être refusée ; dans ce cas, aucun paiement ne sera prélevé.`})[id]||'Action diplomatique';}
function chooseCeasefireOffer(target){
  const offers=ceasefireOffers(state.nations[target].treasury);
  actionModal('Cessez-le-feu / ultimatum',`TRÉSOR DE ${nation(target).short.toUpperCase()} : ${state.nations[target].treasury} OR`,`${offers.map(o=>`<div class="offer-level"><span><b>${Math.round(o.offerLevel*100)} % du trésor ciblé</b><small>${o.amount} or · ${Math.round(o.acceptanceProbability*100)} % de chance d’acceptation</small></span><button data-offer="${o.offerLevel}" ${spendableTreasury(state,state.playerNationId)<o.amount?'disabled':''}>Choisir</button></div>`).join('')}<p>La somme reste réservée jusqu’à la résolution. Elle n’est débitée qu’en cas d’acceptation.</p>`);
  document.querySelectorAll('[data-offer]').forEach(button=>button.onclick=()=>{const level=Number(button.dataset.offer);$('#actionDialog').close();confirmDiplomacy('ultimatum',target,level);});
}
function confirmDiplomacy(action,target,offerLevel=.5){
  const offer=action==='ultimatum'?ceasefireOffers(state.nations[target].treasury).find(o=>o.offerLevel===offerLevel):null;
  const details=offer?`<div class="order-detail"><span>Action : proposer un cessez-le-feu / ultimatum</span><span>Nation : ${nation(target).name}</span><span>Offre : ${Math.round(offer.offerLevel*100)} % de son trésor, soit ${offer.amount} or</span><span>Chance d’acceptation : ${Math.round(offer.acceptanceProbability*100)} %</span><span>Trésor actuel : ${state.nations[state.playerNationId].treasury} or</span><span>Trésor après acceptation : ${state.nations[state.playerNationId].treasury-offer.amount} or</span><span>Disponible après acceptation : ${spendableTreasury(state,state.playerNationId)-offer.amount} or</span><span>En cas de refus : aucun débit, aucune trêve.</span></div>`:`<div class="order-detail"><span>${diplomaticExplanation(action,target)}</span><span>Trésor actuel : ${state.nations[state.playerNationId].treasury} or</span><span>Coût : 0 or</span></div>`;
  confirmationModal('Confirmer l’action diplomatique',details,()=>{const result=queueDiplomaticOrder(state,{nationId:state.playerNationId,target,action,offerLevel});if(!result.ok)return toast(result.error);$('#actionDialog').close();render();toast('Action diplomatique ajoutée aux ordres du tour');});
}
function openDiplomacy(target=null){
  if(!target){actionModal('Diplomatie','CHOISISSEZ UN PAYS',`<div class="action-list">${map.nations.filter(n=>n.id!==state.playerNationId).map(n=>`<button class="nation" data-country="${n.id}" style="--nation:${n.color}"><i></i>${n.name}</button>`).join('')}</div>`);document.querySelectorAll('[data-country]').forEach(b=>b.onclick=()=>{const id=b.dataset.country;$('#actionDialog').close();openDiplomacy(id)});return;}
  const actions=diplomacyActions(state,target),pending=state.orders.some(o=>o.kind==='diplomacy'&&o.target===target&&o.nationId===state.playerNationId&&o.status==='pending');
  actionModal(nation(target).name,`RELATION : ${relationWithPlayer(state,target)==='war'?'GUERRE':relationWithPlayer(state,target)==='alliance'?'ALLIANCE':relationWithPlayer(state,target).toUpperCase()}`,`<p>${pending?'Une action envers ce pays attend déjà la résolution.':''}</p><div class="action-list">${actions.map(a=>`<div class="action-card"><span><b>${a.label}</b>${(!a.enabled||pending)&&a.reason?`<small>${a.reason}</small>`:''}</span><button data-diplo="${a.id}" ${a.enabled&&!pending?'':'disabled'}>Choisir</button></div>`).join('')}</div>`);
  document.querySelectorAll('[data-diplo]').forEach(b=>b.onclick=()=>{const id=b.dataset.diplo;if(id==='ultimatum')return chooseCeasefireOffer(target);$('#actionDialog').close();confirmDiplomacy(id,target);});
  tutorial('diplomacy','Diplomatie en deux étapes','Choisir affiche d’abord les exigences et conséquences. Tu confirmes ensuite l’action, qui attendra l’inter-tour.');
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
function resolveTurn(){
  const count=state.orders.filter(o=>o.status==='pending').length;
  const summary=count?state.orders.filter(o=>o.status==='pending').map(o=>o.kind==='move'?`${province(o.fromId).name} → ${province(o.toId).name} (${o.nationId===state.playerNationId?'mouvement':'ordre'})`:o.kind==='diplomacy'?`Diplomatie : ${o.action}`:o.kind==='construction'?`Construction : ${buildingNames[o.type]}`:`Production : ${RULES.units[o.type]?.label||o.type}`).join('\n'):'Aucun ordre en attente.';
  actionModal('Terminer le tour',`${count} ordre(s) en attente`,`<p>Les ordres deviennent définitifs pour cette résolution. Les IA verrouillent aussi les leurs.</p><pre class="order-summary">${summary}</pre><button id="confirmEndTurn" class="primary">Verrouiller et résoudre</button>`);
  $('#confirmEndTurn').onclick=()=>{ $('#actionDialog').close(); nextTurn(state,map);tutorialShown.clear();state.tutorial.turn=state.turn;state.tutorial.shown=[];render();playSfx();renderJournal(false); };
}
function playSfx(){if(!state.settings.sfx)return;audioCtx ||= new AudioContext();const o=audioCtx.createOscillator(),g=audioCtx.createGain();o.frequency.value=330;g.gain.setValueAtTime(.035,audioCtx.currentTime);g.gain.exponentialRampToValueAtTime(.001,audioCtx.currentTime+.12);o.connect(g).connect(audioCtx.destination);o.start();o.stop(audioCtx.currentTime+.12);}
function setMusic(on){if(!on){musicNodes.forEach(n=>n.stop?.());musicNodes=[];return;}audioCtx ||= new AudioContext();if(musicNodes.length)return;[110,146.8,164.8].forEach((f,i)=>{const o=audioCtx.createOscillator(),g=audioCtx.createGain();o.type='sine';o.frequency.value=f;g.gain.value=.009/(i+1);o.connect(g).connect(audioCtx.destination);o.start();musicNodes.push(o);});}
function hydrateState(value){
  if(!value||value.mapId!==map.id)return null;
  value.turnJournal||=value.journal||[];value.chronicle||=[];value.orders||=[];value.tutorial||={seen:[],stage:0,turn:value.turn,shown:[]};value.tutorial.shown||=[];value.tutorial.turn??=value.turn;
  value.orderSequence=Math.max(Number(value.orderSequence)||1,1+value.orders.length);value.randomCounter=Math.max(0,Number(value.randomCounter)||0);value.warChestsClaimed||={};
  for(const n of map.nations)if(value.nations[n.id])value.nations[n.id].capitalId||=map.provinces.find(p=>p.initialOwner===n.id)?.id;
  for(const d of map.provinces)if(value.provinces[d.id])value.provinces[d.id].portSite=Boolean(d.port);
  if(!value.chronicle.length&&value.events?.length)value.chronicle=value.events.filter(e=>eventKnownToPlayer(value,map,e)).map(e=>journalEntry(e,map,value.playerNationId)).filter(Boolean);
  return value;
}
function showWelcome(){
  setActiveScreen(document,'welcome');const saved=hydrateState(load());$('#continueGame').hidden=!saved;$('#tutorialBubble').hidden=true;state=null;history.replaceState({arkenScreen:'home'},'',location.href);
}
function showGame(){
  setActiveScreen(document,'game');history.pushState({arkenScreen:'game'},'',location.href);
  requestAnimationFrame(()=>{measureFrame();render();clampTransform();});
}
function continueSavedGame(){state=hydrateState(load());if(!state)return toast('Aucune sauvegarde valide à reprendre');selected=null;moveSource=null;scale=1;tx=ty=0;showGame();}
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
  document.querySelectorAll('[data-nation]').forEach(b=>b.onclick=()=>{state=createGameState({map,playerNationId:b.dataset.nation});$('#nationDialog').close();selected=null;moveSource=null;scale=1;tx=ty=0;showGame();tutorial('identity','Vous dirigez '+nation(state.playerNationId).name,TUTORIAL_GUIDE[0].text.replace('{nation}',nation(state.playerNationId).name));tutorial('map','Votre carte stratégique',TUTORIAL_GUIDE[1].text);});
  $('#nationDialog').showModal();
}
function setup(){const saved=hydrateState(load());$('#continueGame').hidden=!saved;setActiveScreen(document,'welcome');}
function measureFrame(){const viewport=$('#viewport');frameSize={width:viewport.clientWidth,height:viewport.clientHeight};const fit=Math.min(frameSize.width/400,frameSize.height/260);mapContentSize={width:400*fit,height:260*fit};clampTransform();}
function clampTransform(){
  if(!frameSize.width||!frameSize.height)return;
  const next=mapFrameTransform({scale,x:tx,y:ty},frameSize,mapContentSize);
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
  if(pinching&&pointers.size>=2){const [a,b]=[...pointers.values()],mid={x:(a.x+b.x)/2,y:(a.y+b.y)/2},next=pinchTransform({scale:pinchStart.scale,x:pinchStart.x,y:pinchStart.y,startMidX:pinchStart.mid.x,startMidY:pinchStart.mid.y,midX:mid.x-pinchStart.left,midY:mid.y-pinchStart.top,centerX:pinchStart.centerX,centerY:pinchStart.centerY,startDistance:pinchStart.distance,currentDistance:pointerDistance(a,b)});scale=next.scale;tx=next.x;ty=next.y;ignoreClickUntil=Date.now()+600;clampTransform();event.preventDefault();return;}
  if(!drag||drag.pointerId!==event.pointerId)return;
  if(!drag.panning&&Math.hypot(event.clientX-drag.startX,event.clientY-drag.startY)>6){drag.panning=true;viewport.setPointerCapture?.(drag.pointerId);ignoreClickUntil=Date.now()+400;}
  if(drag.panning){tx+=event.clientX-drag.lastX;ty+=event.clientY-drag.lastY;drag.lastX=event.clientX;drag.lastY=event.clientY;clampTransform();}
});
const endPointer=event=>{pointers.delete(event.pointerId);if(pointers.size<2&&pinching){pinching=false;pinchStart=null;ignoreClickUntil=Date.now()+600;}if(drag?.pointerId===event.pointerId){if(drag.panning)ignoreClickUntil=Date.now()+400;drag=null;}};
viewport.addEventListener('pointerup',endPointer);viewport.addEventListener('pointercancel',endPointer);

document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>b.closest('dialog').close());
$('#tutorialOk').onclick=()=>$('#tutorialBubble').hidden=true;
$('#closeSheet').onclick=()=>{$('#provinceSheet').hidden=true;selected=null;render();};
$('#cancelMove').onclick=cancelMove;$('#armyBtn').onclick=openArmy;$('#helpBtn').onclick=openHelp;$('#diplomacyBtn').onclick=()=>openDiplomacy();$('#journalBtn').onclick=()=>renderJournal(false);$('#nextTurn').onclick=resolveTurn;
$('#continueGame').onclick=continueSavedGame;$('#startNewGame').onclick=beginNewGame;$('#homeBtn').onclick=showWelcome;
$('#settingsBtn').onclick=()=>{for(const k of ['music','sfx','hints'])$(`#${k}Toggle`).checked=state.settings[k];$('#settingsDialog').showModal();};
for(const k of ['music','sfx','hints'])$(`#${k}Toggle`).onchange=e=>{state.settings[k]=e.target.checked;if(k==='music')setMusic(e.target.checked);save();};
$('#resetHints').onclick=()=>{state.tutorial.seen=[];state.tutorial.stage=0;state.tutorial.shown=[];state.tutorial.turn=state.turn;save();$('#settingsDialog').close();tutorialShown.clear();tutorial('identity','Rejouer le tutoriel',TUTORIAL_GUIDE[0].text.replace('{nation}',nation(state.playerNationId).name));};
$('#newGame').onclick=()=>{$('#settingsDialog').close();beginNewGame();};
$('#zoomIn').onclick=()=>{scale=Math.min(2.5,scale+.25);clampTransform();};$('#zoomOut').onclick=()=>{scale=Math.max(1,scale-.25);clampTransform();};$('#zoomReset').onclick=()=>{scale=1;tx=ty=0;clampTransform();};
$('#mapShell').addEventListener('click',event=>{if(event.target.closest('.order-arrow'))tutorial('orders','Ordres en attente',TUTORIAL_GUIDE.find(x=>x.id==='orders').text);});
function handleAppBack(){
  const dialog=[...document.querySelectorAll('dialog[open]')].at(-1);
  if(dialog){dialog.close();if(!$('#gameScreen').hidden)history.pushState({arkenScreen:'game'},'',location.href);return;}
  if($('#gameScreen').hidden)return;
  if(moveSource)cancelMove();
  else if(!$('#provinceSheet').hidden){$('#provinceSheet').hidden=true;selected=null;render();}
  else showWelcome();
  if(!$('#gameScreen').hidden)history.pushState({arkenScreen:'game'},'',location.href);
}
addEventListener('popstate',handleAppBack);addEventListener('resize',measureFrame);if('serviceWorker'in navigator)navigator.serviceWorker.register('sw.js');setup();
