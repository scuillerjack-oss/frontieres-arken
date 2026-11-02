// Interface — fenêtres d'événements : récit, capitale, mer, propositions.

import { proposalsToAnswer, respondToProposal } from '../../domain/game-engine.js';
import { INTRO_STORY, capitalPopups, seaFatePopups } from '../alliances-view.js';
import { toneMeta } from '../leaders-view.js';
import { PASSAGE_TEXT } from '../passage-fort-view.js';
import { $, nation, province, toast } from './base.js';
import { render } from './map-view.js';
import { state } from './session.js';
import { escapeHtml, nationBadge, nationChips, safeEngine } from './talk-screen.js';
import { hintsOn } from './tutorials.js';

// --- V13 : fenêtres d'événements (récit, capitale, propositions) ----------------------------------------------------
export function eventPopup({kicker='',title,html='',cls='',buttons=[{label:'Continuer',value:true,primary:true}]}){
  return new Promise(resolve=>{const d=$('#eventDialog');let value=null;d.className=cls;$('#eventKicker').textContent=kicker;$('#eventTitle').textContent=title;$('#eventBody').innerHTML=html;
    $('#eventActions').innerHTML=buttons.map((b,i)=>`<button data-event-btn="${i}" class="${b.primary?'primary':'cancel'}">${b.label}</button>`).join('');
    document.querySelectorAll('[data-event-btn]').forEach(btn=>btn.onclick=()=>{value=buttons[Number(btn.dataset.eventBtn)].value;d.close();});
    if(d.open)d.close();d.addEventListener('close',()=>resolve(value),{once:true});d.showModal();});
}
export const dialogClosed=dialog=>new Promise(resolve=>{if(!dialog.open)return resolve();dialog.addEventListener('close',()=>resolve(),{once:true});});
export function showIntro(){return eventPopup({kicker:INTRO_STORY.kicker,title:INTRO_STORY.title,cls:'intro',
  html:`<div class="intro-masks" aria-hidden="true"><span>🛡</span><span>⚔</span><span>🗡</span><span>⚒</span></div>${INTRO_STORY.paragraphs.map(p=>`<p>${p}</p>`).join('')}`,buttons:[{
  label:INTRO_STORY.button,value:true,primary:true}]});}
export async function showCapitalPopups(events){
  for(const c of capitalPopups(events,state.playerNationId,{nation:id=>nation(id).short,province:id=>province(id).name}))
    await eventPopup({kicker:c.kicker,title:c.title,cls:`capital ${c.kind}`,
      html:`<p class="capital-lead">${c.lead}</p>${c.kind==='won'?`<p class="capital-gold">+${c.total} or</p>`:`<p class="capital-gold lost">−${c.amount} or</p>`}<p>${c.text}</p>`,buttons:[{
      label:c.kind==='won'?'Gloire à nous !':'Nous les reprendrons',value:true,primary:true}]});
}
export async function showSeaPopups(events){
  for(const c of seaFatePopups(events,state.playerNationId,{nation:id=>nation(id).short,province:id=>province(id).name}))
    await eventPopup({kicker:c.kicker,title:c.title,cls:`capital lost sea ${c.kind}`,html:`<p class="capital-lead">${c.lead}</p><p>${c.text}</p>${c.tip&&hintsOn()?`<p class="sea-tip">💡 ${c.tip}</p>`:''}`,buttons:[{label:'Compris',value:true,primary:true}]});
}
export async function showProposalPopups(){
  for(const p of safeEngine(()=>proposalsToAnswer(state,state.playerNationId,{fresh:true}),[])){
    const msg=(state.talk||[]).find(m=>m.id===p.talkId),alliance=p.action==='alliance';
    const answer=await eventPopup({kicker:`PROPOSITION · ${nation(p.from).name.toUpperCase()}`,title:alliance?`${nation(p.from).short} vous propose une alliance`:`${nation(p.from).short} propose un cessez-le-feu`,cls:'proposal',
      html:`${msg?`<blockquote class="talk-quote ${toneMeta(msg.tone).cls}">${nationBadge(p.from)} ${escapeHtml(msg.text)}</blockquote>`:''}<div class="proposal-facts">${nationChips(p.from)}</div>${p.refusedBefore?`<p \
class="proposal-memo">↺ Vous avez déjà refusé ${p.refusedBefore>1?`${p.refusedBefore} fois`:'une fois'}${p.lastRefusedTurn?` (dernier refus au tour ${p.lastRefusedTurn})`:''}.</p>`:''}${!alliance&&p.amount>0?`<p \
class="capital-gold">+${p.amount} or si vous acceptez</p>`:''}<p class="help-intro">${alliance?`Alliés, vous ne pourrez plus vous faire la guerre, et vous pourrez lui demander de l’aide. ${PASSAGE_TEXT} \
(dans les deux sens). Mais un Traître se cache peut-être derrière ce sourire…`:'La guerre s’arrête aussitôt : une trêve commence entre vos deux nations.'}</p>`,
      buttons:[{label:'Non',value:false},{label:'Oui',value:true,primary:true}]});
    if(answer===null)continue;
    const r=safeEngine(()=>respondToProposal(state,{from:p.from,accept:answer}),{ok:false,error:'Réponse impossible'});
    render();toast(r.ok?(answer?(alliance?`Alliance conclue avec ${nation(p.from).short} · passage libre dans vos territoires`:`Cessez-le-feu avec ${nation(p.from).short}${r.gold?` · +${r.gold} or`:''}`):`Proposition de ${nation(p.from).short} refusée`):r.error);
  }
}
