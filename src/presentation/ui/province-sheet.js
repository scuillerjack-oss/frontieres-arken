// Interface — fiche d'une province et ses ordres : déplacer, recruter, construire, bombarder.

import { recruitPreview } from '../../domain/boosts.js';
import { LAND_UNIT_TYPES, RULES } from '../../domain/constants.js';
import {
  availableForces, bombardStatus, buildingIncome, embarkStatus, guestsAt, hasPassage, isPortPoint,
  legalDestinations, queueBombard, queueConstruction, queueMoveOrder, queueRecruitment, seaMoveRefusal,
  seaRoutesFrom, shipRepairInfo, spendableTreasury, stationedAt
} from '../../domain/game-engine.js';
import { arkenV9Map as map } from '../../map/arken-v9-map.js';
import { BOMBARD_RULE_TEXT, bombardPreviewText, canBombardFrom, pendingBombardChip } from '../bombard-view.js';
import { TUTORIAL_GUIDE, forceSelection } from '../guide-input.js';
import { buildingUnavailableReason, cancelPendingOrder, unitPrerequisiteText } from '../map-orders-view.js';
import { compactForces, relationWithPlayer } from '../overview-view.js';
import { PASSAGE_TEXT, fortAttackWarning, fortBuildText, fortInfo, passageChip } from '../passage-fort-view.js';
import { recruitBonusLabels, recruitDetailHtml, shipRepairChip } from '../recruit-repair-view.js';
import { truceWarning } from '../truce-warning.js';
import { moveEvent } from '../tutorial.js';
import { provinceTroopView } from '../vision-view.js';
import { $, buildingNames, icons, nation, province, toast, unitKeys } from './base.js';
import { openDiplomacy } from './diplomacy-screen.js';
import { render } from './map-view.js';
import { moveSource, selected, setMoveSource, setSelected, state } from './session.js';
import { nationChips, openTalkCompose, safeEngine } from './talk-screen.js';
import { miniTuto, placeTutorial, tuto, tutorial } from './tutorials.js';

export function selectProvince(id){
  if(moveSource){if(legalDestinations(map,state,moveSource).some(x=>x.id===id))openForceSelection(moveSource,id);else if(id!==moveSource&&province(id).landmassId!==province(moveSource).landmassId)toast(seaMoveRefusal(map,state,moveSource,id));return;}
  setSelected(id);render();showProvinceSheet();tuto(`select:${id}`);if(state.provinces[id]?.ownerId===state.playerNationId)miniTuto('own-province');
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
  const forcesHtml=troops.known?`<span class="info-chip regiment${troops.wounded?' wounded':''}"><b>${troops.text}</b>${troops.composition?`<small>${troops.composition}${troops.wounded?' · blessés : en convalescence':''}</small>`:''}${troops.guestNote?`<small \
class="guest-note">🛡 ${troops.guestNote}</small>`:''}</span>`
    :`<span class="info-chip regiment unknown"><b>${troops.text}</b><small>${troops.note}</small></span>`;
  // V13 : point de port (construit ou non) → destinations par mer ; sinon, rien (le refus s'explique au déplacement).
  const naval=mine&&isPortPoint(map,selected)?`<span class="info-chip note">⚓ Point de port : embarquement vers ${legalDestinations(map,state,
    selected).filter(x=>x.type==='sea').map(x=>province(x.id).name).join(', ')}${p.buildings.port?'':' (port à construire pour les navires de guerre)'}</span>`:'';
  const yieldGold=RULES.baseIncome+Object.entries(p.buildings).reduce((n,[k,v])=>n+(v>0?buildingIncome(k):0),0),yieldChip=mine?`<span class="info-chip income">💰 Rapporte +${yieldGold} or/tour</span>`:'';
  const allyChip=relation==='alliance'?`<span class="info-chip ally-chip">🤝 Votre allié : vous ne pouvez pas l’attaquer</span><span class="info-chip passage-chip">${passageChip(state,state.playerNationId,p.ownerId)}</span>`:'';
  // V13.4 : bonus réel de la forteresse (lu dans le moteur), troupes alliées stationnées ici, mes troupes chez l'allié.
  const fort=fortInfo(state,selected),fortChip=fort.level?`<span class="info-chip fort-chip">${fort.text}${troops.entrenched?' · troupes cachées':''}</span>`:'';
  const mineHere=!mine&&stationedAt(state,selected,state.playerNationId),unitsText=e=>[['infantry','fantassins'],['cavalry','cavaliers'],['armor','blindés'],['artillery',
    'artilleurs']].filter(([k])=>e.units?.[k]).map(([k,l])=>`${e.units[k]} ${l}`).concat(e.warships?[`${e.warships} navire${e.warships>1?'s':''}`]:[]).join(' · ');
  const guestChips=guestsAt(state,selected).filter(e=>e.nationId!==state.playerNationId&&(mine||relation==='alliance')).map(e=>`<span class="info-chip passage-chip">🤝 Renforts ${nation(e.nationId).short} stationnés ici (défendent la province) : ${unitsText(e)}</span>`).join('');
  const mineChip=mineHere?`<span class="info-chip passage-chip">⚔ Vos troupes stationnées ici : ${unitsText(mineHere)}</span>`:'';
  // V14.2 (Jack) : navires en convalescence expliqués, avec PV actuels et tours restants (mes navires, ici ou chez l'allié).
  const shipChip=(mine||mineHere)?shipRepairChip(safeEngine(()=>shipRepairInfo(state,selected,state.playerNationId),null)):'';
  const bombardChips=mine?pendingBombardChip(state,selected,id=>province(id).name).map(c=>`<span class="info-chip bombard-chip">${c.text} <button class="chip-cancel" data-cancel-bombard="${c.id}">Annuler</button></span>`).join(''):''; // V14.4
  $('#sheetInfo').innerHTML=`${allyChip}<span class="info-chip">${structures}</span>${fortChip}${bombardChips}${yieldChip}${forcesHtml}${shipChip}${mineChip}${guestChips}${naval}${mine?'':nationChips(p.ownerId)}`;
  // V13.3 (Jack) : un seul bouton pour parler à un dirigeant — « Échanger publiquement » est dans la Diplomatie.
  const actions=mine?[['move','Déplacer / Attaquer'],['recruit','Recruter'],['build','Construire'],...(canBombardFrom(state,map,selected)?[['bombard','💥 Bombarder']]:[])]:mineHere?[['move','Déplacer mes troupes'],['diplo','Diplomatie']]:[['diplo','Diplomatie']];
  $('#sheetActions').innerHTML=actions.map(([id,label])=>`<button data-sheet-action="${id}" class="${id==='diplo'||id==='talk'?'secondary':''}">${label}</button>`).join('');$('#provinceSheet').dataset.province=selected;$('#provinceSheet').hidden=false;placeTutorial();
  document.querySelectorAll('[data-sheet-action]').forEach(button=>button.onclick=()=>({move:startMove,recruit:openRecruit,build:openBuild,bombard:openBombard,diplo:()=>openDiplomacy(p.ownerId),talk:()=>openTalkCompose(p.ownerId)})[button.dataset.sheetAction]());
  document.querySelectorAll('[data-cancel-bombard]').forEach(b=>b.onclick=()=>{const r=cancelPendingOrder(state,b.dataset.cancelBombard);if(!r.ok)return toast(r.error);render();showProvinceSheet();toast('Bombardement annulé ; les navires sont de nouveau disponibles.');});
  if(!mine&&troops.known)tutorial('intelligence','Renseignement',TUTORIAL_GUIDE.find(x=>x.id==='intelligence').text);
}
// V14.4 : ordre « Bombarder » — navires à quai sur un point de port, contre la forteresse côtière ennemie au bout de la route.
// Aperçu lu dans le moteur (protection restante avant / après, dégâts à la garnison) ; gros boutons − / + (doigt, 360 px).
function openBombard(){
  const fromId=selected,st=bombardStatus(map,state,{nationId:state.playerNationId,fromId}),targets=st.targets,max=st.warships;
  if(!st.ok)return toast(st.reason);
  let ships=max,toId=targets[0];
  const draw=()=>{const v=bombardPreviewText(state,{fromId,toId,warships:ships,name:id=>province(id).name});
    actionModal('💥 Bombarder',`${province(fromId).name} → ${province(toId).name} · ${nation(state.provinces[toId].ownerId).short}`,
      `${targets.length>1?`<div class="force-presets">${targets.map(id=>`<button data-bombard-target="${id}" class="${id===toId?'primary':''}">${province(id).name}</button>`).join('')}</div>`:''}<div \
class="bombard-ships"><span>Navires de guerre</span><button class="step" data-ships="-1" aria-label="Un navire de moins">−</button><b>${ships} / ${max}</b><button class="step" data-ships="1" aria-label="Un \
navire de plus">+</button></div><p class="bombard-protection"><b>${v.text}</b></p><p class="sea-note">${v.detail}</p><p class="sea-note">${BOMBARD_RULE_TEXT()}</p><button id="confirmBombard" class="primary">💥 Bombarder ${province(toId).name}</button>`);
    document.querySelectorAll('[data-ships]').forEach(b=>b.onclick=()=>{ships=Math.max(1,Math.min(max,ships+Number(b.dataset.ships)));draw();});
    document.querySelectorAll('[data-bombard-target]').forEach(b=>b.onclick=()=>{toId=b.dataset.bombardTarget;draw();});
    $('#confirmBombard').onclick=()=>{const r=queueBombard(state,map,{nationId:state.playerNationId,fromId,toId,warships:ships});if(!r.ok)return toast(r.error);$('#actionDialog').close();render();showProvinceSheet();toast(`Bombardement de ${province(toId).name} ajouté aux ordres du tour`);};};
  $('#provinceSheet').hidden=true;draw();
}
function startMove(){setMoveSource(selected);$('#provinceSheet').hidden=true;placeTutorial();$('#moveBanner').hidden=false;
  const st=embarkStatus(map,state,moveSource),noPort=seaRoutesFrom(map,moveSource).length&&!st.ok;
  $('#movePrompt').textContent=`Depuis ${province(moveSource).name} : touchez une destination verte${state.diplomacy.treaties.some(t=>t.active!==false&&t.type==='alliance'&&t.parties.includes(state.playerNationId))?' (liseré vert = allié : passage libre)':''}`;
  if(noPort)toast(st.reason);render();tutorial('move','Ordres de déplacement','Touchez une province verte. Liseré vert autour d’une nation : votre allié, qu’on ne peut pas attaquer.');}
export function cancelMove(){setMoveSource(null);$('#moveBanner').hidden=true;render();if(selected)showProvinceSheet();}
export function actionModal(title,kicker,html){const dialog=$('#actionDialog');if(dialog.open)dialog.close();$('#actionTitle').textContent=title;$('#actionKicker').textContent=kicker;$('#actionBody').innerHTML=html;dialog.showModal();}
export function confirmationModal(title,details,onConfirm){actionModal(title,'VÉRIFIE TON ORDRE',
  `${details}<div class="confirm-actions"><button class="cancel" id="cancelConfirmation">Annuler</button><button class="primary" id="acceptConfirmation">Confirmer</button></div>`);
  $('#cancelConfirmation').onclick=()=>$('#actionDialog').close();$('#acceptConfirmation').onclick=onConfirm;}
function pendingFrom(id){return state.orders.filter(o=>o.status==='pending'&&o.fromId===id).length;}
export function openPendingOrder(orderId){
  const order=state.orders.find(item=>item.id===orderId&&item.nationId===state.playerNationId&&item.status==='pending');if(!order)return;
  const amount=Object.entries(order.units||{}).filter(([,n])=>n).map(([key,n])=>`${n} ${unitKeys[key].toLowerCase()}`).concat(order.warships?[`${order.warships} navire${order.warships>1?'s':''}`]:[]).join(', ')||'aucune force';
  const isAttack=state.provinces[order.toId].ownerId!==state.playerNationId&&!order.passage,isBombard=order.kind==='bombard';
  actionModal(isBombard?'Ordre de bombardement':isAttack?'Ordre d’attaque':'Ordre de déplacement',`${province(order.fromId).name} → ${province(order.toId).name}`,
    `<div class="order-detail"><b>${isBombard?'Bombardement programmé (les navires restent au port)':isAttack?'Attaque programmée':'Déplacement programmé'}</b><span>Forces : ${amount}</span><span>\
Coût : 0 or</span><span>Ordre non résolu avant Fin du tour.</span></div><div class="confirm-actions"><button class="cancel" data-close-order>Fermer</button><button id="cancelPendingOrder" class="primary">Annuler cet ordre</button></div>`);
  $('[data-close-order]').onclick=()=>$('#actionDialog').close();$('#cancelPendingOrder').onclick=()=>{const result=cancelPendingOrder(state,order.id);if(!result.ok)return toast(result.error);
    $('#actionDialog').close();render();toast('Ordre annulé ; les forces sont de nouveau disponibles.');tutorial('orders','Ordres en attente',TUTORIAL_GUIDE.find(x=>x.id==='orders').text);};
}
function openForceSelection(fromId,toId){
  const from=state.provinces[fromId],to=state.provinces[toId],passage=to.ownerId!==state.playerNationId&&hasPassage(state,state.playerNationId,to.ownerId),
    attack=to.ownerId!==state.playerNationId&&!passage,route=legalDestinations(map,state,fromId).find(x=>x.id===toId),available=availableForces(state,fromId,state.playerNationId);
  setMoveSource(null);$('#moveBanner').hidden=true;
  const row=(key,label)=>`<div class="unit-row"><span>${label}</span><b>${available[key]||0}</b><input data-force="${key}" type="number" min="0" max="${available[key]||0}" value="${forceSelection(available,'50')[key]||0}" ${available[key]?'':'disabled'}></div>`;
  const bySea=route?.type==='sea',rows=[...LAND_UNIT_TYPES.map(k=>row(k,unitKeys[k])),...(bySea?[row('warships','Navires (escorte)')]:[])].join('');
  const seaNote=bySea?`<p class="sea-note">⚓ Par mer depuis le point de port de ${province(fromId).name}, route vers ${province(route.via).name} : <b>${route.turns} tours</b> en mer (1 étape par \
tour)${attack?`, puis débarquement (troupes à ${Math.round(RULES.combat.landingPenalty*100)} %)`:passage?', puis stationnement chez votre allié':', puis renfort'}. Sans navires de guerre, le convoi ne peut pas se défendre s’il est intercepté.</p>${attack?(()=>{
    const v=provinceTroopView(state,map,toId),cap=Object.values(state.nations).some(n=>n.capitalId===toId);
    return `<p class="sea-warn">${v.known?`👁 En face : ${v.text}.`:'⚠ Garnison inconnue : la province est hors de vue.'}${cap?' C’est une capitale, souvent la mieux gardée.':''}</p>`;})():''}`:'';
  const passageNote=passage?`<p class="passage-note">🤝 ${PASSAGE_TEXT} : vos troupes stationneront à ${province(toId).name}${province(toId).name===nation(to.ownerId).short?'':` (${nation(to.ownerId).short})`} et la défendront avec votre allié.</p>`:'';
  const truceNote=attack&&truceWarning(state,state.playerNationId,to.ownerId,nation(to.ownerId).short)?`<p class="sea-warn truce-warn">${truceWarning(state,state.playerNationId,to.ownerId,nation(to.ownerId).short)}</p>`:'';
  const fortNote=attack&&fortAttackWarning(state,toId)?`<p class="sea-warn fort-warn">${fortAttackWarning(state,toId)}</p>`:'';
  actionModal(attack?(bySea?'Préparer un débarquement':'Préparer une attaque'):passage?'Passage chez un allié':'Préparer un déplacement',
    `${province(fromId).name} → ${province(toId).name}${bySea?` · par mer · ${route.turns} tours`:''}`,
    `${passageNote}${truceNote}${fortNote}${seaNote}<p>Choisis les forces à réserver. Elles ne bougent qu’à l’inter-tour.</p><div class="force-presets"><button data-preset="50">50 %</button>\
<button data-preset="100">100 %</button><button data-preset="manual">Personnaliser</button></div>${rows}<div class="total-line"><span>Ordres déjà prévus depuis la province</span><b>${pendingFrom(fromId)}</b>\
</div><p id="forceSummary"></p><button id="confirmMove" class="primary">Ajouter cet ordre</button>`);
  const updateSummary=()=>{const units=Object.fromEntries(LAND_UNIT_TYPES.map(k=>[k,Math.floor(Number(document.querySelector(`[data-force="${k}"]`)?.value)||0)])),
    ships=Math.floor(Number(document.querySelector('[data-force="warships"]')?.value)||0);
    $('#forceSummary').textContent=`${Object.entries(units).filter(([,n])=>n).map(([k,
    n])=>`${n} ${unitKeys[k].toLowerCase()}`).concat(ships?[`${ships} navire${ships>1?'s':''}`]:[]).join(' · ')||'Aucune unité sélectionnée'}`;};
  document.querySelectorAll('[data-force]').forEach(i=>i.oninput=updateSummary);
  document.querySelectorAll('[data-preset]').forEach(b=>b.onclick=()=>{const mode=b.dataset.preset;if(mode==='manual'){document.querySelector('[data-force]')?.focus();return;
    }const chosen=forceSelection(available,mode);for(const k of LAND_UNIT_TYPES)document.querySelector(`[data-force="${k}"]`).value=chosen[k];
    const ws=document.querySelector('[data-force="warships"]');if(ws)ws.value=mode==='100'?available.warships:Math.floor(available.warships/2);updateSummary();});updateSummary();
  $('#confirmMove').onclick=()=>{const units=Object.fromEntries(LAND_UNIT_TYPES.map(k=>[k,Math.floor(Number(document.querySelector(`[data-force="${k}"]`)?.value)||0)])),
    warships=Math.floor(Number(document.querySelector('[data-force="warships"]')?.value)||0),quantity=Object.values(units).reduce((a,b)=>a+b,0)+warships,description=Object.entries(units).filter(([,
    n])=>n).map(([key,n])=>`${n} ${unitKeys[key].toLowerCase()}`).concat(warships?[`${warships} navire${warships>1?'s':''}`]:[]).join(', ')||'Aucune force';
    if(!quantity)return toast('Sélectionne au moins une unité');
    confirmationModal(attack?'Confirmer l’attaque':passage?'Confirmer le passage':'Confirmer le déplacement',
      `<div class="order-detail"><span>Action : ${attack?'attaquer':passage?`stationner chez ${nation(to.ownerId).short} (allié)`:'déplacer les forces'}</span><span>Origine : ${province(fromId).name}</span>\
<span>Province visée : ${province(toId).name}</span>${bySea?`<span>Trajet : par mer, ${route.turns} tours</span>`:''}<span>Quantité : ${description}</span><span>Coût : 0 or</span><span>\
Trésor après ordre : ${state.nations[state.playerNationId].treasury} or</span>${truceNote?`<span class="sea-warn truce-warn">${truceWarning(state,
      state.playerNationId,to.ownerId,nation(to.ownerId).short)}</span>`:''}</div>`,()=>{const result=queueMoveOrder(state,map,{nationId:state.playerNationId,fromId,toId,units,warships});
      if(!result.ok)return toast(result.error);$('#actionDialog').close();setSelected(null);render();toast('Ordre ajouté à la planification');
      tuto(moveEvent({routeType:route?.type,attack,toId,units,warships}));miniTuto('move');tutorial('orders','Ordres en attente',TUTORIAL_GUIDE.find(x=>x.id==='orders').text);});
  };
  tutorial(attack?'attack':'move-confirm',attack?'Préparer une attaque':'Préparer un déplacement','Envoyez 50 %, 100 % ou choisissez unité par unité. Le combat a lieu à la fin du tour.');
  if(route?.type==='sea')tutorial('maritime','Transport maritime',TUTORIAL_GUIDE.find(x=>x.id==='maritime').text);
}
function openRecruit(){
  const p=state.provinces[selected],pendingBuild=Object.fromEntries(state.productionQueue.filter(o=>o.kind==='building'&&o.provinceId===selected).map(o=>[o.type,o.remaining]));
  for(const o of state.orders)if(o.kind==='construction'&&o.provinceId===selected&&o.status==='pending')pendingBuild[o.type]??=RULES.buildings[o.type]?.turns||1;
  const items=Object.entries(RULES.units).map(([key,r])=>{const reason=unitPrerequisiteText(r,p.buildings,pendingBuild);return{key,r,reason,blocked:Boolean(reason)};});
  actionModal('Recrutement',province(selected).name,
    `<div class="treasury-context"><span>Trésor actuel</span><b>${state.nations[state.playerNationId].treasury} or</b></div><div class="treasury-context"><span>Disponible après réserves</span><b>${spendableTreasury(state,
    state.playerNationId)} or</b></div>${items.map(({key,r,blocked,reason}
    )=>`<div class="action-card recruit-row${blocked?' blocked':''}"><span><button type="button" class="unit-info-btn" data-unit-info="${key}" aria-expanded="false" aria-label="Voir PV et dégâts : ${r.label}">\
<b>${r.label}</b> <i>ⓘ PV et dégâts</i></button><small>${r.amount} par lot · ${r.cost} or · ${r.turns} tour(s)</small>${blocked?`<small class="prereq">⚠ ${reason}</small>`:''}</span><div class="lot-controls">\
<button data-lot-minus="${key}" ${blocked?'disabled':''}>−</button><b id="lot-count-${key}">0</b><button data-lot-plus="${key}" ${blocked?'disabled':''}>+</button><small id="lot-amount-${key}">\
0 unité</small></div><div class="unit-detail-slot" id="unit-detail-${key}" hidden>${recruitDetailHtml(key)}</div></div>`).join('')}<div class="total-line"><span>Coût total</span><b id="recruitCost">\
0</b></div><p id="recruitWarning"></p><button id="confirmRecruit" class="primary">Vérifier la commande</button>`);
  const lots=Object.fromEntries(items.map(x=>[x.key,0]));
  const update=()=>{const total=Object.entries(lots).reduce((n,[k,v])=>n+v*RULES.units[k].cost,0),available=spendableTreasury(state,state.playerNationId);$('#recruitCost').textContent=`${total} or`;
    $('#recruitWarning').textContent=total>available?'Trésor insuffisant après les sommes réservées.':'';for(const {key,r,blocked} of items){$(`#lot-count-${key}`).textContent=lots[key];
    const extra=recruitPreview(state,state.playerNationId,key,lots[key]*r.amount)-lots[key]*r.amount;
    $(`#lot-amount-${key}`).innerHTML=`${lots[key]*r.amount} unité${lots[key]*r.amount===1?'':'s'}${extra>0?` <em class="boost-extra">+${extra} ${recruitBonusLabels(state,state.playerNationId).short}</em>`:''}`;
    const plus=document.querySelector(`[data-lot-plus="${key}"]`);if(plus)plus.disabled=blocked||total+r.cost>available;}};
  // V14.2 (Jack) : toucher le nom d'une troupe ouvre / ferme son détail (PV, dégâts) ; jamais de recrutement par ce bouton.
  document.querySelectorAll('[data-unit-info]').forEach(b=>b.addEventListener('click',ev=>{ev.preventDefault();ev.stopPropagation();const slot=$(`#unit-detail-${b.dataset.unitInfo}`);slot.hidden=!slot.hidden;b.setAttribute('aria-expanded',String(!slot.hidden));if(!slot.hidden)tuto('unit-info');}));
  for(const {key} of items){document.querySelector(`[data-lot-minus="${key}"]`)?.addEventListener('click',()=>{lots[key]=Math.max(0,lots[key]-1);update();});document.querySelector(`[data-lot-plus="${key}"]`)?.addEventListener('click',()=>{lots[key]++;update();});}update();
  $('#confirmRecruit').onclick=()=>{const total=Object.entries(lots).reduce((n,[k,v])=>n+v*RULES.units[k].cost,0),quantity=Object.entries(lots).reduce((n,[k,v])=>n+v*RULES.units[k].amount,0);
    if(!quantity)return toast('Choisis au moins un lot');if(total>spendableTreasury(state,state.playerNationId))return toast('Trésor insuffisant après les sommes réservées');
    confirmationModal('Confirmer le recrutement',
      `<div class="order-detail"><span>Action : recrutement</span><span>Province : ${province(selected).name}</span><span>Quantité : ${quantity} unité(s) en ${Object.values(lots).filter(Boolean).reduce((n,
      v)=>n+v,0)} lot(s)</span>${(()=>{const extra=recruitPreview(state,state.playerNationId,'infantry',lots.infantry*RULES.units.infantry.amount)-lots.infantry*RULES.units.infantry.amount;
      return extra>0?`<span class="boost-extra">${recruitBonusLabels(state,state.playerNationId).long} : +${extra} fantassins à la livraison</span>`:'';
      })()}<span>Coût total : ${total} or</span><span>Trésor après commande : ${state.nations[state.playerNationId].treasury-total} or</span><span>Disponible après réserves et commande : ${spendableTreasury(state,
      state.playerNationId)-total} or</span></div>`,()=>{for(const [type,count] of Object.entries(lots))if(count){const result=queueRecruitment(state,{nationId:state.playerNationId,
      provinceId:selected,type,lots:count});if(!result.ok)return toast(result.error);}$('#actionDialog').close();render();showProvinceSheet();toast('Ordre de recrutement ajouté à l’inter-tour');
      miniTuto('recruit');});
  };
  tutorial('recruit','Recruter par lots','Chaque + ajoute un lot : 20 fantassins ou 5 cavaliers. Le prix total s’affiche en bas. Touchez le nom d’une troupe pour voir ses PV et ses dégâts.');
}
function openBuild(){
  const p=state.provinces[selected],orders=state.orders.filter(o=>o.kind==='construction'&&o.provinceId===selected&&o.status==='pending'),active=state.productionQueue.filter(o=>o.kind==='building'&&o.provinceId===selected);
  const types=['bank','factory','fort',...(p.portSite?['port']:[])],items=types.map(type=>{const rule=RULES.buildings[type],
    count=(p.buildings[type]||0)+orders.filter(o=>o.type===type).length+active.filter(o=>o.type===type).length,cost=type==='fort'?rule.costs[count]:rule.cost;const built=p.buildings[type]||0;
    return{type,rule,cost,turns:rule.turns,count,built,queued:count-built};
    }).map(x=>({...x,reason:buildingUnavailableReason({type:x.type,label:buildingNames[x.type],rule:x.rule,count:x.count,built:x.built,portSite:p.portSite,cost:x.cost??0,
    spendable:spendableTreasury(state,state.playerNationId)})}));
  actionModal('Construction',province(selected).name,
    `<div class="treasury-context"><span>Trésor actuel</span><b>${state.nations[state.playerNationId].treasury} or</b></div><div class="treasury-context"><span>Disponible après réserves</span><b>${spendableTreasury(state,
    state.playerNationId)} or</b></div><p>Les nouvelles constructions sont payées maintenant et livrées après leur durée.</p><div class="action-list">${items.map(x=>`<div class="action-card"><span>\
<b>${icons[x.type]} ${buildingNames[x.type]}</b><small>${x.cost??'—'} or · ${x.turns} tour(s)${buildingIncome(x.type)?` · <b class="income-tag">rapporte +${buildingIncome(x.type)} or/tour</b>`:x.type==='fort'?` · <b class="fort-tag">${fortBuildText(state,
    selected)}</b>`:''}${x.built?` · ${x.type==='fort'?`niveau ${x.built} construit`:`${x.built} déjà construite${x.built>1?'s':''}`}`:''}${x.queued>0?` · ${x.queued} en construction`:''}</small>${x.reason?`<small \
class="prereq">⚠ ${x.reason}</small>`:''}</span><button data-build="${x.type}" ${x.reason?'disabled':''}>Vérifier</button></div>`).join('')}</div>`);
  document.querySelectorAll('[data-build]').forEach(button=>button.onclick=()=>{const type=button.dataset.build,item=items.find(x=>x.type===type);if(!item||item.reason)return;
    confirmationModal('Confirmer la construction',
    `<div class="order-detail"><span>Action : construire ${buildingNames[type]}</span><span>Province : ${province(selected).name}</span><span>Quantité : 1 bâtiment (${item.turns} tour(s))</span><span>\
Coût : ${item.cost} or</span><span>Trésor après commande : ${state.nations[state.playerNationId].treasury-item.cost} or</span><span>Disponible après réserves et commande : ${spendableTreasury(state,
    state.playerNationId)-item.cost} or</span></div>`,()=>{const result=queueConstruction(state,{nationId:state.playerNationId,provinceId:selected,type});if(!result.ok)return toast(result.error);
    $('#actionDialog').close();render();showProvinceSheet();toast('Ordre de construction ajouté à l’inter-tour');tuto('build');});});
  tutorial('build','Financer une construction','Payé tout de suite, livré après sa durée. Banque et usine rapportent +3 or par tour.');
}
