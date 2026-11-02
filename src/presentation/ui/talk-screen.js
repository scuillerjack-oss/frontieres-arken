// Interface — dirigeants : tension, indices, fil d'échanges publics.

import { arkenV9Map as map } from '../../map/arken-v9-map.js';
import { tensionText } from '../alliances-view.js';
import { TONE_ORDER, crestGlyph, talkBadgeCount, talkFeed, tensionGauge, toneMeta } from '../leaders-view.js';
import { leaderHint, queueTalk, talkOptions, tensionLevel } from '../talk-facade.js';
import { $, nation, toast } from './base.js';
import { render } from './map-view.js';
import { actionModal } from './province-sheet.js';
import { state } from './session.js';
import { tuto, tutorial } from './tutorials.js';

// --- V11 : personnalités des dirigeants, fil d'échanges et tension ------------------------------------------
// Les appels au moteur V11 sont protégés : une erreur ne doit jamais bloquer la carte ni la fin du tour.
export function safeEngine(fn,fallback){try{return fn();}catch(error){console.warn('V11',error);return fallback;}}
export const escapeHtml=text=>String(text??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
export function nationBadge(id){const n=nation(id);return`<span class="crest" style="--nation:${n.color||'#888'}" aria-hidden="true">${crestGlyph(n.crest)}</span>`;}
function tensionWith(id){const level=safeEngine(()=>tensionLevel(state,state.playerNationId,id),{value:0,label:'calme'});return{...tensionGauge(level),...tensionText(level),label:level?.label||'calme'};}
function hintFor(id){return safeEngine(()=>leaderHint(state,id),'')||'Dirigeant encore mal connu';}
export function nationChips(id){const t=tensionWith(id);
  return`<span class="info-chip tension-chip ${t.cls}">${t.war?'⚔ En guerre':`Tension ${t.value} % · ${t.label}${t.label==='au bord de la guerre'?' · guerre auto à 85 %':''}`}</span><span class="info-chip leader-chip">☉ ${escapeHtml(hintFor(id))}</span>`;
  }
export function nationPanel(id){const t=tensionWith(id),revealed=Boolean(state.leaders?.[id]?.revealed);
  return`<div class="nation-panel" style="--nation:${nation(id).color}"><div class="nation-head">${nationBadge(id)}<div><b>${nation(id).name}</b><small>${revealed?'Personnalité révélée':'Impression sur son dirigeant'}</small>\
<p class="leader-hint${revealed?' revealed':''}">${escapeHtml(hintFor(id))}</p></div></div>
  <div class="tension ${t.cls}" role="meter" aria-label="Tension avec ${nation(id).short}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${t.value}"><div class="tension-top"><span>Tension</span>\
<b>${t.long}</b></div><div class="tension-track"><i style="width:${t.pct}%"></i></div><div class="tension-scale"><span>calme</span><span>tendu</span><span>hostile</span><span>guerre</span></div></div>
  <button id="nationTalk" class="talk-launch">✉ Échanger publiquement</button></div>`;}
export function updateTalkBadge(){const n=safeEngine(()=>talkBadgeCount(state),0),badge=$('#talkBadge');badge.hidden=!n;badge.textContent=n;$('#talkBtn').classList.toggle('has-mail',n>0);}
function talkLine(item){const tone=toneMeta(item.tone),from=nation(item.from),to=item.to?nation(item.to):null;
  return`<article class="talk-msg ${tone.cls}${item.toMe?' to-me':''}${item.fromMe?' from-me':''}" style="--nation:${from.color||'#888'}" data-talk-id="${escapeHtml(item.id)}">
   <div class="talk-head">${nationBadge(item.from)}<b>${from.short}</b><span class="talk-to">${to?`→ ${item.toMe?'vous':to.short}`:'→ à tous'}</span><span class="talk-tone" title="Ton ${tone.label.toLowerCase()}" \
aria-label="Ton ${tone.label.toLowerCase()}">${tone.icon}</span><small>T${item.turn}</small></div>
   ${item.replyTo&&item.replyToFrom?`<small class="talk-reply">en réponse à ${item.replyToFrom===state.playerNationId?'vous':nation(item.replyToFrom).short}</small>`:''}
   <p>${escapeHtml(item.text)}</p>${item.awaitingReply?`<button class="talk-answer" data-reply="${escapeHtml(item.id)}" data-to="${item.from}">Répondre</button>`:''}</article>`;}
function plannedTalk(){return(state.orders||[]).filter(o=>o.kind==='talk'&&o.status==='pending'&&o.nationId===state.playerNationId);}
export function openTalk(){
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
export function openTalkCompose(to,replyTo=null){
  const options=safeEngine(()=>talkOptions(state,map,{from:state.playerNationId,to,replyTo}),[]),original=replyTo?(state.talk||[]).find(m=>m.id===replyTo):null,t=tensionWith(to);
  if($('#talkDialog').open)$('#talkDialog').close();
  const byTone=Object.fromEntries(options.map(o=>[o.tone,o])),ordered=TONE_ORDER.map(k=>byTone[k]).filter(Boolean);
  actionModal(replyTo?`Répondre à ${nation(to).short}`:`Échange avec ${nation(to).short}`,`MESSAGE PUBLIC · ${t.war?`EN GUERRE · TENSION ${t.value} %`:`TENSION ${t.value} % (${t.label.toUpperCase()})`}`,
   `${original?`<blockquote class="talk-quote ${toneMeta(original.tone).cls}">${nationBadge(original.from)} ${escapeHtml(original.text)}</blockquote>`:''}<p class="talk-help">Choisis un ton. Le texte est écrit pour toi ; tous les dirigeants le liront.</p>
   <div class="tone-list">${ordered.length?ordered.map(o=>{const tone=toneMeta(o.tone);
     return`<button class="tone-card ${tone.cls}" data-tone="${o.tone}" aria-pressed="false"><span class="tone-name">${tone.icon} ${tone.label}</span><span class="tone-text">« ${escapeHtml(o.text)} »</span>${o.preview&&o.preview!==o.text?`<small>${escapeHtml(o.preview)}</small>`:''}</button>`;
     }).join(''):'<p>Aucun message possible pour l’instant.</p>'}</div>
   <div class="confirm-actions"><button class="cancel" id="talkBack">Retour</button><button class="primary" id="talkSend" disabled>Envoyer</button></div>`);
  let chosen=null;
  document.querySelectorAll('[data-tone]').forEach(b=>b.onclick=()=>{chosen=b.dataset.tone;document.querySelectorAll('[data-tone]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));
    $('#talkSend').disabled=false;$('#talkSend').textContent=`Envoyer (${toneMeta(chosen).label.toLowerCase()})`;});
  $('#talkBack').onclick=()=>{$('#actionDialog').close();openTalk();};
  $('#talkSend').onclick=()=>{if(!chosen)return;const before=(state.talk||[]).length,result=safeEngine(()=>queueTalk(state,map,{from:state.playerNationId,to,tone:chosen,replyTo}),{ok:false,error:'Échange impossible pour le moment'});
    if(!result?.ok)return toast(result?.error||'Échange impossible');
    $('#actionDialog').close();render();if(chosen==='hostile')tuto(`talk-hostile:${to}`);toast((state.talk||[]).length>before?`Message ${toneMeta(chosen).label.toLowerCase()} publié`:`Message ${toneMeta(chosen).label.toLowerCase()} prêt : il partira à la fin du tour`);openTalk();};
}
