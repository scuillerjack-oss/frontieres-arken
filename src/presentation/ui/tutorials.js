// Interface — bulles d'explication, mini tutoriel de la première partie, tutoriel rejouable.

import { gameRanking } from '../../domain/game-engine.js';
import { hintsActive } from '../../domain/profile.js';
import { arkenV9Map as map } from '../../map/arken-v9-map.js';
import { decodeSave } from '../../persistence/save-codec.js';
import { MINI_TUTO_STEPS, markMiniTutoSeen, miniTutoAdvance } from '../passage-fort-view.js';
import {
  TUTORIAL_STEPS, bubblePlacement, clearTutorial, createTutorialState, firstVisibleTarget, loadTutorial,
  markTutorialOffered, tutorialAdvance, tutorialHint, tutorialOffered, tutorialStepView
} from '../tutorial.js';
import { $, nation, toast } from './base.js';
import { eventPopup } from './event-popups.js';
import { showGame, showWelcome } from './game-flow.js';
import { focusProvince, scale, setScale, setTx, setTy, tx, ty, updateLabelScale } from './map-view.js';
import { actionModal } from './province-sheet.js';
import {
  hydrateState, moveSource, profile, save, selected, setMoveSource, setSelected, setState, state
} from './session.js';

export let tutorialShown = new Set();
// V14.4 (Jack) : bulles d'explication seulement pendant les 2 premières vraies parties (compteur du profil), sauf si le
// joueur les redemande (Paramètres → « Revoir les conseils »). Le tutoriel V14.3 reste rejouable depuis l'accueil.
export function hintsOn(){return hintsActive(profile)||Boolean(state?.tutorial?.forced);}
export function tutorial(id,title,text) {
  if (miniStep!==null||tutoStep!==null) return; // V14.3 : ni pendant le tutoriel
  if (miniStep!==null) return; // V13.4 : pas de bulle contextuelle pendant le mini tuto (elles restent pour plus tard)
  if (!state.settings.hints || !hintsOn() || state.tutorial.seen.includes(id)) return;
  if(state.tutorial.turn!==state.turn){state.tutorial.turn=state.turn;state.tutorial.shown=[];}
  state.tutorial.shown||=[];if(state.tutorial.shown.length>=2)return;
  state.tutorial.shown.push(id);tutorialShown.add(id);state.tutorial.seen.push(id);state.tutorial.stage=(state.tutorial.stage||0)+1;save();
  $('#tutorialTitle').textContent=title; $('#tutorialText').textContent=text; $('#tutorialBubble').hidden=false;placeTutorial();
}
// V11 (testeur V10) : la bulle du tutoriel ne doit jamais couvrir les boutons de la fiche de province.
// Fiche ouverte → la bulle passe en haut de l'écran, sous la barre d'état du jeu ; sinon elle reste en bas.
export function placeTutorial(){const bubble=$('#tutorialBubble');if(bubble)bubble.classList.toggle('top',!$('#provinceSheet').hidden);}
// --- V13.4 : mini tutoriel de la première partie (5-6 bulles qui suivent les vrais gestes, « Passer » à tout moment).
// Mémoire dans une clé DÉDIÉE (frontieres-arken-mini-tuto) : la sauvegarde de partie n'est jamais touchée.
export let miniStep=null;
// La bulle passe dans la « couche du dessus » (popover) et y est remise à chaque fenêtre ouverte : elle reste lisible
// pendant les gestes faits dans une fenêtre (Recruter, Déplacer), au lieu d'être cachée dessous.
// V14.3 (relecture) : une fenêtre modale rend inerte tout ce qui est hors d'elle — la bulle est donc DÉPLACÉE dans la
// fenêtre du dessus (puis remise dans la page) : « Quitter » et « Suivant » restent toujours touchables.
export function raiseMiniTuto(){const box=$('#miniTuto');if((miniStep===null&&tutoStep===null)||!box.showPopover)return;const host=[...document.querySelectorAll('dialog[open]')].at(-1)||document.body;
  try{if(box.matches(':popover-open'))box.hidePopover();if(box.parentElement!==host)host.append(box);box.showPopover();}catch{}}
export function showMiniTuto(){const box=$('#miniTuto');if(miniStep===null){try{if(box.matches?.(':popover-open'))box.hidePopover();}catch{}box.hidden=true;if(box.parentElement!==document.body)document.body.append(box);return;}const s=MINI_TUTO_STEPS[miniStep];
  $('#miniTutoTitle').textContent=s.title;$('#miniTutoText').textContent=s.text;$('#miniTutoNext').textContent=miniStep===MINI_TUTO_STEPS.length-1?'Terminer':'Suivant ›';box.hidden=false;$('#tutorialBubble').hidden=true;raiseMiniTuto();}
export function startMiniTuto(){if(tutoStep!==null)return;miniStep=0;showMiniTuto();}
export function endMiniTuto(){if(tutoStep!==null)return quitTutorial();miniStep=null;markMiniTutoSeen();showMiniTuto();}
export function miniTuto(event){tuto(event);if(miniStep===null)return;const next=miniTutoAdvance(miniStep,event);if(next===miniStep)return;if(next===null)return endMiniTuto();miniStep=next;showMiniTuto();}
// --- V14.3 : tutoriel facultatif et rejouable --------------------------------------------------------------------
// Une partie d'entraînement à part (scénario fixe, vrai moteur). La bulle du mini tuto (#miniTuto) sert de support :
// titre, explication, objectif, « Quitter » et « Suivant › » (passer une étape si on est bloqué). Ce qu'il faut toucher
// est surligné (classe tuto-target), et la bulle se place à l'opposé de la cible pour ne jamais la cacher.
export let tutoStep=null,tutoTimer=0,tutoTargetEl=null,tutoFocused=null;
function tutoVisible(sel){const el=document.querySelector(sel);if(!el||!el.getClientRects().length)return false;const top=[...document.querySelectorAll('dialog[open]')].at(-1);return top?top.contains(el):!el.closest('dialog');}
export function refreshTuto(){
  if(tutoStep===null||!state)return;const v=tutorialStepView(tutoStep,state,map),box=$('#miniTuto');
  // Province à toucher hors de l'écran : la carte s'y centre (une fois par étape, dès qu'aucune fenêtre n'est ouverte).
  const prov=(v.targets||[]).map(t=>t.match(/^\[data-id="(p\d\d)"\]$/)?.[1]).filter(Boolean).at(-1);
  if(prov&&tutoFocused!==tutoStep&&!moveSource&&!document.querySelector('dialog[open]')){tutoFocused=tutoStep;
    const r=document.querySelector(`[data-id="${prov}"] .area`)?.getBoundingClientRect(),f=$('#viewport').getBoundingClientRect();
    if(!r||r.right<f.left+30||r.left>f.right-30||r.bottom<f.top+30||r.top>f.bottom-30){focusProvince(prov);updateLabelScale();}}
  const sel=firstVisibleTarget(v.targets,tutoVisible),el=sel?document.querySelector(sel):null;
  if(el!==tutoTargetEl){tutoTargetEl?.classList.remove('tuto-target');tutoTargetEl=el;if(el){el.classList.add('tuto-target');if(!el.closest('svg'))el.scrollIntoView?.({block:'nearest'});}}
  else el?.classList.add('tuto-target'); // la carte est redessinée à chaque render : on remet la classe
  const place=el?bubblePlacement(el.getBoundingClientRect(),innerHeight):(moveSource?'bottom':'top');
  box.classList.toggle('bottom',place==='bottom');
}
function showTuto(){
  const box=$('#miniTuto');if(tutoStep===null)return;const v=tutorialStepView(tutoStep,state,map);
  $('#miniTutoTitle').textContent=`${v.progress} · ${v.title}`;$('#miniTutoText').textContent=v.text;
  const goal=$('#miniTutoGoal');goal.hidden=!v.goal;goal.textContent=v.goal?`👉 ${v.goal}`:'';
  $('#miniTutoSkip').textContent='Quitter';$('#miniTutoNext').textContent=v.next||'Passer l’étape ›';$('#miniTutoNext').classList.toggle('secondary',!v.next);$('#miniTutoNext').hidden=v.on.includes('end-turn'); // une fin de tour se joue toujours (sinon les bulles décaleraient du moteur)
  box.classList.add('tuto-full');box.hidden=false;$('#tutorialBubble').hidden=true;raiseMiniTuto();
  refreshTuto();
}
function setTutoStep(i){document.querySelectorAll('.tuto-done').forEach(x=>x.classList.remove('tuto-done'));tutoStep=i;state.tutorialRun={...(state.tutorialRun||{}),step:i};save();showTuto();}
export function tuto(event){
  if(tutoStep===null||!state)return;const hint=tutorialHint(tutoStep,event);if(hint)toast(hint);
  const next=tutorialAdvance(tutoStep,event,state,map);if(next===tutoStep)return;if(next===null)return finishTutorial();setTutoStep(next);
}
function tutoRunning(){document.body.classList.add('tutorial-on');clearInterval(tutoTimer);tutoTimer=setInterval(refreshTuto,350);showTuto();}
export function stopTuto(){$('#miniTutoNext').hidden=false;tutoStep=null;if($('#miniTuto').parentElement!==document.body)document.body.append($('#miniTuto'));clearInterval(tutoTimer);tutoTimer=0;
  tutoTargetEl?.classList.remove('tuto-target');tutoTargetEl=null;document.body.classList.remove('tutorial-on');const box=$('#miniTuto');box.classList.remove('tuto-full','bottom');
  $('#miniTutoGoal').hidden=true;$('#miniTutoSkip').textContent='Passer';$('#miniTutoNext').classList.remove('secondary');try{if(box.matches?.(':popover-open'))box.hidePopover();
  }catch{}box.hidden=true;}
/** Démarre (ou reprend) le tutoriel. La vraie partie n'est ni lue ni écrite : elle reste sous SAVE_KEY. */
export async function startTutorial({resume=false}={}){
  markTutorialOffered(undefined,tutorialOfferState()==='termine'?'termine':'propose');
  stopTuto();closeAllDialogs();miniStep=null;
  const saved=resume?loadTutorial(decodeSave):null;
  setState(saved?hydrateState(saved):createTutorialState({map}));if(!state)setState(createTutorialState({map}));
  setSelected(null);setMoveSource(null);setScale(1);setTx(0);setTy(0);updateLabelScale();$('#moveBanner').hidden=true;$('#provinceSheet').hidden=true;save();showGame();
  tutoStep=Math.max(0,Math.min(TUTORIAL_STEPS.length-1,Number(state.tutorialRun?.step)||0));tutoFocused=null;tutoRunning();
}
const tutorialOfferState=()=>{try{return localStorage.getItem('frontieres-arken-tutoriel-propose');}catch{return null;}};
/** « Quitter » : la partie de tutoriel est gardée (on la reprend depuis l'accueil) ; retour à l'accueil. */
function closeAllDialogs(){for(const d of document.querySelectorAll('dialog[open]'))d.close();}
function quitTutorial(){save();stopTuto();closeAllDialogs();showWelcome();toast('Tutoriel en pause : « Reprendre le tutoriel » sur l’accueil.');}
function showTutoRanking(){
  const rows=gameRanking(state).map(r=>`<tr class="${r.nationId===state.playerNationId?'me':''}"><td>${r.rank}</td><td><i style="--nation:${nation(r.nationId).color}"></i>${nation(r.nationId).short}</td><td>${r.provinces}</td><td>${r.capitals}</td><td>${r.treasury}</td></tr>`).join('');
  actionModal('Classement',`TUTORIEL · TOUR ${state.turn}`,
    `<p class="end-why">Si la partie s’arrêtait maintenant :</p><table class="ranking"><thead><tr><th>#</th><th>Nation</th><th>Prov.</th><th>Cap.</th><th>Or</th></tr></thead><tbody>${rows}</tbody>\
</table><p class="end-rule">Classement : provinces, puis capitales tenues, puis trésor. À la fin d’une vraie partie, cet écran s’affiche tout seul.</p><button class="primary" data-close-ranking>Continuer</button>`);
  $('[data-close-ranking]').onclick=()=>$('#actionDialog').close();}
/** Fin du tutoriel : sa sauvegarde est effacée (jamais celle de la vraie partie), mini tuto marqué vu. */
function finishTutorial(){stopTuto();closeAllDialogs();clearTutorial();markTutorialOffered(undefined,'termine');markMiniTutoSeen();setState(null);showWelcome();toast('Tutoriel terminé ! Votre partie vous attend.');}
export function tutoNext(){if(tutoStep===null)return;const v=tutorialStepView(tutoStep,state,map);if(v.action==='ranking')showTutoRanking();if(tutoStep>=TUTORIAL_STEPS.length-1)return finishTutorial();setTutoStep(tutoStep+1);}
/** Premier lancement : le tutoriel est proposé une fois (jamais imposé). */
export async function offerTutorial(){if(tutorialOffered())return;markTutorialOffered();
  const answer=await eventPopup({kicker:'PREMIER LANCEMENT',title:'🎓 Un tutoriel pour commencer ?',cls:'proposal tuto-offer',
    html:'<p>Une petite partie d’entraînement de 8 tours : la carte, les troupes, la diplomatie, les alliances, la mer… en jouant.</p><p class="help-intro">Facultatif. Vous pourrez le rejouer quand vous voulez depuis l’accueil ou ⚙ Paramètres, sans toucher à votre partie.</p>',
    buttons:[{label:'Passer',value:false},{label:'Jouer le tutoriel',value:true,primary:true}]});
  if(answer)startTutorial();}
export function updateTutoEntry(){const b=$('#welcomeTutorial');if(b)b.innerHTML=loadTutorial(decodeSave)?'<span aria-hidden="true">🎓</span> Reprendre le tutoriel':'<span aria-hidden="true">🎓</span> Tutoriel';}
export const setMiniStep = value => { miniStep = value; };
