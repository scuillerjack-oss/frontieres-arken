// Interface — diplomatie : cessez-le-feu, alliances, ruptures, demandes d'aide.

import { HELP_TURNS, queueHelpRequest } from '../../domain/alliances.js';
import { queueDiplomaticOrder, spendableTreasury } from '../../domain/game-engine.js';
import { arkenV9Map as map } from '../../map/arken-v9-map.js';
import { helpChoices, helpPactStatus, helpPactsFor } from '../alliances-view.js';
import {
  CEASEFIRE_STEP, ceasefireEstimate, ceasefireOrder, ceasefireRange, clampCeasefireAmount
} from '../ceasefire-view.js';
import { ceasefireOffers } from '../map-orders-view.js';
import { diplomacyActions, relationWithPlayer } from '../overview-view.js';
import { PASSAGE_TEXT } from '../passage-fort-view.js';
import { truceWarning } from '../truce-warning.js';
import { $, nation, province, toast } from './base.js';
import { eventPopup } from './event-popups.js';
import { render } from './map-view.js';
import { actionModal, cancelMove, confirmationModal } from './province-sheet.js';
import { state } from './session.js';
import { escapeHtml, nationPanel, openTalkCompose, safeEngine } from './talk-screen.js';
import { miniTuto, tuto, tutorial } from './tutorials.js';

function diplomaticExplanation(id,target){return({break:`Rompre l’alliance avec ${nation(target).short} à l’inter-tour. Rompre et attaquer dans le même tour est une trahison que tout Arken verra.`,
  war:`Déclarer la guerre à ${nation(target).short}. L’état de guerre s’appliquera à l’inter-tour.${truceWarning(state,state.playerNationId,target,
  nation(target).short)?`</span><span class="sea-warn truce-warn">${truceWarning(state,state.playerNationId,target,nation(target).short)}`:''}`,
  alliance:`Proposer une alliance à ${nation(target).short}. Elle commencera à l’inter-tour. ${PASSAGE_TEXT} (dans les deux sens) : vous pourrez l’aider s’il est en guerre.`,
  ultimatum:`Proposer un cessez-le-feu à ${nation(target).short}, en payant ou en exigeant de l’or. S’il refuse, aucun or ne bouge.`})[id]||'Action diplomatique';}
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
  confirmationModal('Confirmer le cessez-le-feu',
    `<div class="order-detail"><span>Nation : ${nation(target).name}</span><span>Conditions : ${terms}</span><span>Chance estimée : ≈ ${e.pct} %</span><span>Votre trésor s’il accepte : ${me-e.pay+e.demand} or</span><span>S’il refuse : la guerre continue, aucun or ne bouge.</span></div>`,
    ()=>{const result=queueDiplomaticOrder(state,{nationId:state.playerNationId,target,action:'ceasefire',...ceasefireOrder(mode,amount)});if(!result.ok)return toast(result.error);$('#actionDialog').close();render();toast('Offre de cessez-le-feu ajoutée aux ordres du tour');});
}
function confirmDiplomacy(action,target,offerLevel=.5){
  const offer=action==='ultimatum'?ceasefireOffers(state.nations[target].treasury).find(o=>o.offerLevel===offerLevel):null;
  const details=offer?`<div class="order-detail"><span>Action : proposer un cessez-le-feu / ultimatum</span><span>Nation : ${nation(target).name}</span><span>Offre : ${Math.round(offer.offerLevel*100)} \
% de son trésor, soit ${offer.amount} or</span><span>Chance d’acceptation : ${Math.round(offer.acceptanceProbability*100)} %</span><span>Trésor actuel : ${state.nations[state.playerNationId].treasury} or</span>\
<span>Trésor après acceptation : ${state.nations[state.playerNationId].treasury-offer.amount} or</span><span>Disponible après acceptation : ${spendableTreasury(state,
    state.playerNationId)-offer.amount} or</span><span>En cas de refus : aucun débit, aucune trêve.</span></div>`:`<div class="order-detail"><span>${diplomaticExplanation(action,
    target)}</span><span>Trésor actuel : ${state.nations[state.playerNationId].treasury} or</span><span>Coût : 0 or</span></div>`;
  confirmationModal('Confirmer l’action diplomatique',details,()=>{const result=queueDiplomaticOrder(state,{nationId:state.playerNationId,target,action,offerLevel});
    if(!result.ok)return toast(result.error);$('#actionDialog').close();render();toast('Action diplomatique ajoutée aux ordres du tour');tuto(`${action}:${target}`);});
}
export function openDiplomacy(target=null){
  if(!target){actionModal('Diplomatie','CHOISISSEZ UN PAYS',
    `<div class="action-list">${map.nations.filter(n=>n.id!==state.playerNationId).map(n=>`<button class="nation" data-country="${n.id}" style="--nation:${n.color}"><i></i>${n.name}</button>`).join('')}</div>`);
    document.querySelectorAll('[data-country]').forEach(b=>b.onclick=()=>{const id=b.dataset.country;$('#actionDialog').close();openDiplomacy(id)});return;}
  const actions=diplomacyActions(state,target),pending=state.orders.some(o=>o.kind==='diplomacy'&&o.target===target&&o.nationId===state.playerNationId&&o.status==='pending');
  actionModal(nation(target).name,`RELATION : ${relationWithPlayer(state,target)==='war'?'GUERRE':relationWithPlayer(state,target)==='alliance'?'ALLIANCE':relationWithPlayer(state,
    target).toUpperCase()}`,
    `${nationPanel(target)}<p>${pending?'Une action envers ce pays attend déjà la résolution.':''}</p><div class="action-list">${actions.map(a=>`<div class="action-card"><span>\
<b>${a.label}</b>${(!a.enabled||pending)&&a.reason?`<small>${a.reason}</small>`:''}</span><button data-diplo="${a.id}" ${a.enabled&&!pending?'':'disabled'}>Choisir</button></div>`).join('')}</div>${relationWithPlayer(state,
    target)==='alliance'?`<p class="passage-note">🤝 ${PASSAGE_TEXT} : vos troupes peuvent traverser ses provinces, y stationner et les défendre (et lui chez vous).</p>`:''}${relationWithPlayer(state,
    target)==='alliance'?`<button id="askHelp" class="help-launch">🤝 Demander de l’aide à ${nation(target).short}</button>`:''}`);
  $('#askHelp')?.addEventListener('click',()=>openHelpRequest(target));miniTuto('diplomacy');tuto(`diplomacy:${target}`);
  document.querySelectorAll('[data-diplo]').forEach(b=>b.onclick=()=>{const id=b.dataset.diplo;if(id==='ultimatum')return chooseCeasefireOffer(target);$('#actionDialog').close();confirmDiplomacy(id,target);});
  $('#nationTalk')?.addEventListener('click',()=>{$('#actionDialog').close();openTalkCompose(target);});
  tutorial('diplomacy','Diplomatie en deux étapes','Choisissez une action : vous verrez ses conséquences avant de confirmer. Elle s’applique à la fin du tour.');
}
// --- V13 : demandes d'aide à un allié (« Défends-moi », « Attaque X avec moi ») ------------------------------------
function helpText(o){const x=o.target?nation(o.target).short:null;return o.help==='attack'?`attaquer ${x} avec vous`:x?`vous défendre contre ${x}`:o.provinceId?`défendre ${province(o.provinceId).name}`:'vous défendre contre quiconque vous attaque';}
function openHelpRequest(ally){
  const c=helpChoices(state,map,ally),pacts=helpPactsFor(state,ally),pending=state.orders.find(o=>o.kind==='help'&&o.status==='pending'&&o.nationId===state.playerNationId&&o.to===ally);
  const pactLine=p=>`<div class="help-pact">✔ ${nation(ally).short} s’est engagé à ${helpText({help:p.kind,target:p.against,provinceId:p.provinceId})} · ${helpPactStatus(p)}</div>`;
  actionModal(`Aide de ${nation(ally).short}`,'ALLIÉ · DEMANDE GRATUITE',
    `${nationPanel(ally)}<p class="help-intro">Votre allié répond à la fin du tour, <b>selon son caractère</b>. Une aide acceptée dure ${HELP_TURNS} tours <b>une fois ses troupes arrivées</b> (le trajet s’ajoute : le journal donne l’arrivée estimée).</p>
   ${pacts.map(pactLine).join('')}${pending?`<div class="talk-planned">✉ Demande prête : ${escapeHtml(helpText(pending))} — réponse à la fin du tour</div>`:''}
   <h3 class="help-h">🛡 Défends-moi</h3><div class="help-grid"><button data-help="defend" data-target="">Contre quiconque m’attaque</button>${c.defendAgainst.map(n=>`<button data-help="defend" \
data-target="${n.id}" style="--nation:${n.color}">Contre ${n.name}${n.atWar?' ⚔':''}</button>`).join('')}</div>
   <small class="help-sub">Ou sur une province menacée :</small><div class="help-grid">${c.provinces.map(p=>`<button data-help="defend" data-province="${p.id}">${p.name}</button>`).join('')}</div>
   <h3 class="help-h">⚔ Attaque avec moi</h3><div class="help-grid">${c.attackTargets.length?c.attackTargets.map(n=>`<button data-help="attack" data-target="${n.id}" style="--nation:${n.color}">\
Attaquer ${n.name}${n.allyOfAlly?' <small>(son allié)</small>':''}</button>`).join(''):'<p class="help-none">Aucune nation à sa portée : votre allié ne peut atteindre que ses voisins (frontière ou route maritime).</p>'||'<p>Aucune nation à viser.</p>'}</div>`);
  $('#nationTalk')?.addEventListener('click',()=>{$('#actionDialog').close();openTalkCompose(ally);});
  document.querySelectorAll('[data-help]').forEach(b=>b.onclick=()=>{const req={from:state.playerNationId,to:ally,kind:b.dataset.help,target:b.dataset.target||null,provinceId:b.dataset.province||null};
    const r=safeEngine(()=>queueHelpRequest(state,req),{ok:false,error:'Demande impossible pour le moment'});if(!r.ok)return toast(r.error);
    $('#actionDialog').close();render();tuto('help');toast(`Demande envoyée à ${nation(ally).short} : ${helpText({help:req.kind,target:req.target,provinceId:req.provinceId})}. Réponse à la fin du tour.`);});
}
