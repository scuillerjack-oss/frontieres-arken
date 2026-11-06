// Interface — atouts, missions du jour, achats et confidentialité, profil.

import {
  BONUS_ADS_PER_TOKEN, BOOST_INFO, addMissionProgress, exportProfile, importProfile, missionDeltas, productById,
  recordAdWatched, recordBonusAd, upgradeBoost
} from '../../domain/profile.js';
import { showRewardedAd } from '../ads.js';
import { markGameCounted } from '../../domain/palmares.js';
import { quietDuring } from './audio.js';
import { boostScreenHtml } from '../boosts-screen.js';
import { initPlay } from '../play.js';
import { todayLocal } from '../profile-storage.js';
import { BILLING_ENABLED, purchase, restorePurchases } from '../store.js';
import { $, toast } from './base.js';
import { applyBoosts, load, profile, save, saveMyProfile, setProfile, state } from './session.js';
import { escapeHtml } from './talk-screen.js';
import { tutoStep } from './tutorials.js';

// V14.4 : build Google Play — consentement pub, bouton « Choix de confidentialité », achats payés mais non crédités rendus.
let playPrivacy = null;
async function recoverPlayPurchases(){
  if(!BILLING_ENABLED)return;
  const r=await restorePurchases(profile,{save:saveMyProfile,date:todayLocal()});
  if(r.restored){saveMyProfile();if($('#boostDialog')?.open)openBoosts();toast(`Achat récupéré${r.tokens?` : +${r.tokens} jeton${r.tokens>1?'s':''}`:''}`);}
}
function refreshPlayPrivacy(){for(const id of ['adsPrivacy','adsPrivacyBoost']){const b=$('#'+id);if(b)b.hidden=!playPrivacy?.privacyOptionsRequired;}}
export async function startPlay(){
  playPrivacy=await initPlay();refreshPlayPrivacy();$('#adsPrivacy').onclick=()=>playPrivacy?.showPrivacyOptions();
  if(playPrivacy.active){await recoverPlayPurchases();addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')recoverPlayPurchases();});}
}
// --- V12 : atouts, missions du jour, achats de test, profil ------------------------------------------------------
export function trackMissions(events){
  const r=missionDeltas(events,state.playerNationId),res=addMissionProgress(profile,todayLocal(),r);saveMyProfile();
  if(res.completed.length)setTimeout(()=>toast(`Mission accomplie : ${res.completed.map(m=>m.label).join(' · ')}${res.tokens?` — 5/5 : +${res.tokens} jeton !`:''}`),400);
}
export function openBoosts(){
  const inGame=!$('#gameScreen').hidden&&Boolean(state);
  $('#boostBody').innerHTML=boostScreenHtml(profile,todayLocal(),{inGame});
  document.querySelectorAll('[data-boost]').forEach(b=>b.onclick=()=>{const r=upgradeBoost(profile,b.dataset.boost);if(!r.ok)return toast(r.error);saveMyProfile();if(state){applyBoosts(state);save();}openBoosts();toast(`${BOOST_INFO[b.dataset.boost].label} : +${r.level} %`);});
  document.querySelectorAll('[data-buy]').forEach(b=>b.onclick=async()=>{b.disabled=true;const r=await purchase(profile,b.dataset.buy,{date:todayLocal(),save:saveMyProfile});
    if(!r.ok){b.disabled=false;return toast(r.error);}saveMyProfile();openBoosts();
    toast(`${r.test?'Achat de test':'Achat confirmé'} : ${productById(b.dataset.buy).label}${r.tokens?` · +${r.tokens} jeton${r.tokens>1?'s':''}`:''}${r.adsRemoved?' · publicités supprimées':''}`);});
  $('[data-watch-ad]')?.addEventListener('click',async e=>{if(tutoStep!==null)return toast('Les publicités sont désactivées pendant le tutoriel');const btn=e.currentTarget;if(btn.disabled)return;
    btn.disabled=true;const r=await quietDuring(()=>showRewardedAd());if(!r.rewarded){btn.disabled=false;
    return toast(r.dismissed?'Publicité fermée : aucune récompense, et plus aucune publicité ne te sera imposée':'Publicité indisponible pour le moment');
    }const res=recordAdWatched(profile,todayLocal());saveMyProfile();openBoosts();toast(`Mission publicité accomplie${res.tokens?` — 5/5 : +${res.tokens} jeton !`:''}`);});
  $('[data-bonus-ad]')?.addEventListener('click',async e=>{if(tutoStep!==null)return toast('Les publicités sont désactivées pendant le tutoriel');const btn=e.currentTarget;if(btn.disabled)return;
    btn.disabled=true;const r=await quietDuring(()=>showRewardedAd());if(!r.rewarded){btn.disabled=false;
    return toast(r.dismissed?'Publicité fermée avant la fin : rien de gagné, et aucune publicité ne te sera imposée':'Publicité indisponible pour le moment');}const res=recordBonusAd(profile);
    saveMyProfile();openBoosts();toast(res.tokens?'Pub bonus : +1 jeton !':`Pub bonus : ${res.progress}/${BONUS_ADS_PER_TOKEN} vers le prochain jeton`);});
  $('#copyProfile').onclick=copyProfile;$('#restoreProfile').onclick=restoreProfileView;refreshPlayPrivacy();
  document.querySelectorAll('[data-ads-privacy]').forEach(b=>b.onclick=()=>playPrivacy?.showPrivacyOptions());
  if(!$('#boostDialog').open)$('#boostDialog').showModal();
}
async function copyProfile(){
  const text=exportProfile(profile);let copied=false;
  try{await navigator.clipboard.writeText(text);copied=true;}catch{}
  $('#boostBody').insertAdjacentHTML('beforeend',`<div class="profile-export"><p>${copied?'Profil copié. Colle-le dans tes notes pour le garder en sécurité.':'Sélectionne et copie ce texte dans tes notes :'}</p><textarea readonly rows="4">${escapeHtml(text)}</textarea></div>`);
  const area=$('#boostBody .profile-export:last-child textarea');area.focus();area.select();area.scrollIntoView({block:'center'});if(copied)toast('Profil copié');
}
function restoreProfileView(){
  $('#boostBody').innerHTML=`<p>Colle ici le texte copié avec « Copier mon profil ». Il remplacera le profil de cet appareil (jetons, atouts, achats). Ta partie en cours n’est pas touchée.</p>\
<textarea id="restoreText" rows="6" placeholder="ARKEN-PROFIL-1:…"></textarea><div class="confirm-actions"><button class="cancel" id="restoreBack">Retour</button><button class="primary" id="restoreGo">Restaurer</button></div>`;
  $('#restoreBack').onclick=openBoosts;
  $('#restoreGo').onclick=()=>{const r=importProfile($('#restoreText').value);if(!r.ok)return toast(r.error);markGameCounted(r.profile,state||load());setProfile(r.profile);saveMyProfile();if(state){applyBoosts(state);save();}openBoosts();toast('Profil restauré');};
}
