// Interface — bulles d'explication (2 premières parties) et tutoriel du temps réel (V17.9, rejouable).

import { hintsActive } from '../../domain/profile.js';
import { arkenV9Map as map } from '../../map/arken-v9-map.js';
import { decodeRealtimeSave } from '../../persistence/save-codec.js';
import {
  TUTORIAL_STEPS, bubblePlacement, clearTutorial, createTutorialState, firstVisibleTarget, loadTutorial, markTutorialOffered,
  tutorialAdvance, tutorialHint, tutorialOffered, tutorialPausesAt, tutorialStepView, tutorialWaitDone
} from '../tutorial.js';
import { $, toast } from './base.js';
import { eventPopup } from './event-popups.js';
import { showGame, showWelcome } from './game-flow.js';
import { focusProvince, setScale, setTx, setTy, updateLabelScale } from './map-view.js';
import { hydrateState, moveSource, profile, save, setMoveSource, setSelected, setState, state } from './session.js';
import { pauseRealtime } from './realtime-ui.js';

export let tutorialShown = new Set();
// V14.4 (Jack) : bulles d'explication seulement pendant les 2 premières vraies parties (compteur du profil), sauf si le
// joueur les redemande (Paramètres → « Revoir les conseils »). Le tutoriel reste rejouable depuis l'accueil et ⚙.
export function hintsOn(){return hintsActive(profile)||Boolean(state?.tutorial?.forced);}
export function tutorial(id,title,text) {
  if (tutoStep!==null) return; // jamais pendant le tutoriel
  if (!state?.settings?.hints || !hintsOn() || state.tutorial.seen.includes(id)) return;
  // V17.9 : au plus 2 bulles par mois de jeu (au tour par tour : par tour).
  const period=state.mode==='realtime'?Math.ceil((Number(state.day)||1)/30):state.turn;
  if(state.tutorial.turn!==period){state.tutorial.turn=period;state.tutorial.shown=[];}
  state.tutorial.shown||=[];if(state.tutorial.shown.length>=2)return;
  state.tutorial.shown.push(id);tutorialShown.add(id);state.tutorial.seen.push(id);state.tutorial.stage=(state.tutorial.stage||0)+1;save();
  $('#tutorialTitle').textContent=title; $('#tutorialText').textContent=text; $('#tutorialBubble').hidden=false;placeTutorial();
}
// V11 (testeur V10) : la bulle du tutoriel ne doit jamais couvrir les boutons de la fiche de province.
// Fiche ouverte → la bulle passe en haut de l'écran, sous la barre d'état du jeu ; sinon elle reste en bas.
export function placeTutorial(){const bubble=$('#tutorialBubble');if(bubble)bubble.classList.toggle('top',!$('#provinceSheet').hidden);}
// La bulle du tutoriel (#miniTuto) passe dans la « couche du dessus » (popover) et y est remise à chaque fenêtre ouverte :
// une fenêtre modale rend inerte tout ce qui est hors d'elle — la bulle est donc DÉPLACÉE dans la fenêtre du dessus (puis
// remise dans la page) : « Quitter » et « Suivant » restent toujours touchables.
export function raiseMiniTuto(){const box=$('#miniTuto');if(tutoStep===null||!box.showPopover)return;const host=[...document.querySelectorAll('dialog[open]')].at(-1)||document.body;
  try{if(box.matches(':popover-open'))box.hidePopover();if(box.parentElement!==host)host.append(box);box.showPopover();}catch{}}
// --- V17.9 : tutoriel du temps réel, facultatif et rejouable --------------------------------------------------------
// Une partie d'entraînement à part (scénario fixe, vrai moteur, src/presentation/tutorial.js). La bulle #miniTuto :
// titre, explication, objectif, « Quitter » et « Suivant › » (passer une étape si on est bloqué). Ce qu'il faut toucher
// est surligné (classe tuto-target), et la bulle se place à l'opposé de la cible pour ne jamais la cacher.
// Le temps est en pause pendant les explications ; les étapes « regarder » le laissent tourner jusqu'à ce que ce qu'on
// attend soit arrivé dans la partie (armée qui avance, bataille finie, réponse), puis il s'arrête de lui-même.
export let tutoStep=null,tutoTimer=0,tutoTargetEl=null,tutoFocused=null,tutoDestFocused=null;
function tutoVisible(sel){const el=document.querySelector(sel);if(!el||!el.getClientRects().length)return false;const top=[...document.querySelectorAll('dialog[open]')].at(-1);return top?top.contains(el):!el.closest('dialog');}
export function refreshTuto(){
  if(tutoStep===null||!state)return;
  if(tutorialWaitDone(tutoStep,state))return setTutoStep(tutoStep+1); // étape « regarder » finie : la suite, en pause
  const v=tutorialStepView(tutoStep,state),box=$('#miniTuto');
  const sel=firstVisibleTarget(v.targets,tutoVisible),el=sel?document.querySelector(sel):null;
  // Cible de la carte hors de l'écran (ou sous la bulle) : la carte se centre sur sa province (une fois par étape, dès
  // qu'aucune fenêtre n'est ouverte).
  const prov=(v.targets||[]).map(t=>t.match(/^\[data-id="(p\d\d)"\]$/)?.[1]).filter(Boolean).at(-1);
  if(prov&&tutoFocused!==tutoStep&&!moveSource&&!document.querySelector('dialog[open]')){tutoFocused=tutoStep;
    const probe=el?.closest('svg')?el:document.querySelector(`[data-id="${prov}"] .area`),r=probe?.getBoundingClientRect(),f=$('#viewport').getBoundingClientRect(),b=box.hidden?null:box.getBoundingClientRect();
    const cx=r?r.left+r.width/2:0,cy=r?r.top+r.height/2:0,under=b&&cx>b.left&&cx<b.right&&cy>b.top&&cy<b.bottom;
    if(!r||under||cx<f.left+30||cx>f.right-30||cy<f.top+30||cy>f.bottom-30){focusProvince(prov);updateLabelScale();}}
  // Pendant le choix d'une destination : la destination demandée hors de l'écran → la carte s'y centre (une fois par étape).
  const dest=(v.targets||[]).map(t=>t.match(/destination\[data-id="(p\d\d)"\]/)?.[1]).filter(Boolean)[0];
  if(dest&&moveSource&&tutoDestFocused!==tutoStep&&!document.querySelector('dialog[open]')){tutoDestFocused=tutoStep;
    const r=document.querySelector(`#mapWorld [data-id="${dest}"] .area`)?.getBoundingClientRect(),f=$('#viewport').getBoundingClientRect(),cx=r?r.left+r.width/2:0,cy=r?r.top+r.height/2:0;
    if(!r||cx<f.left+30||cx>f.right-30||cy<f.top+30||cy>f.bottom-30){focusProvince(dest);updateLabelScale();}}
  if(el!==tutoTargetEl){tutoTargetEl?.classList.remove('tuto-target');tutoTargetEl=el;if(el){el.classList.add('tuto-target');if(!el.closest('svg'))el.scrollIntoView?.({block:'nearest'});}}
  else el?.classList.add('tuto-target'); // la carte est redessinée chaque jour : on remet la classe
  const place=el?bubblePlacement(el.getBoundingClientRect(),innerHeight):(moveSource?'bottom':'top');
  box.classList.toggle('bottom',place==='bottom');
}
function showTuto(){
  const box=$('#miniTuto');if(tutoStep===null)return;const v=tutorialStepView(tutoStep,state);
  $('#miniTutoTitle').textContent=`${v.progress} · ${v.title}`;$('#miniTutoText').textContent=v.text;
  const goal=$('#miniTutoGoal');goal.hidden=!v.goal;goal.textContent=v.goal?`👉 ${v.goal}`:'';
  $('#miniTutoSkip').textContent='Quitter';$('#miniTutoNext').textContent=v.next||'Passer l’étape ›';$('#miniTutoNext').classList.toggle('secondary',!v.next);
  box.classList.add('tuto-full');box.hidden=false;$('#tutorialBubble').hidden=true;raiseMiniTuto();
  refreshTuto();
}
let lastShown=null;
function setTutoStep(i){
  if(i>=TUTORIAL_STEPS.length)return finishTutorial();
  document.querySelectorAll('.tuto-done').forEach(x=>x.classList.remove('tuto-done'));tutoStep=i;tutoFocused=null;
  if(tutorialPausesAt(i))pauseRealtime(); // en pause pendant les explications
  state.tutorialRun={...(state.tutorialRun||{}),step:i};save();
  if(lastShown!==i){lastShown=i;showTuto();}
}
/** Geste réel du joueur (émis par l'interface) : fait avancer l'étape s'il est celui qu'elle attend. */
export function tuto(event){
  if(tutoStep===null||!state)return;const hint=tutorialHint(tutoStep,event);if(hint)toast(hint);
  const next=tutorialAdvance(tutoStep,event,state);if(next===tutoStep)return;if(next===null)return finishTutorial();setTutoStep(next);
}
function tutoRunning(){document.body.classList.add('tutorial-on');clearInterval(tutoTimer);tutoTimer=setInterval(refreshTuto,350);lastShown=tutoStep;showTuto();}
export function stopTuto(){tutoStep=null;lastShown=null;if($('#miniTuto').parentElement!==document.body)document.body.append($('#miniTuto'));clearInterval(tutoTimer);tutoTimer=0;
  tutoTargetEl?.classList.remove('tuto-target');tutoTargetEl=null;document.body.classList.remove('tutorial-on');const box=$('#miniTuto');box.classList.remove('tuto-full','bottom');
  $('#miniTutoGoal').hidden=true;$('#miniTutoNext').classList.remove('secondary');try{if(box.matches?.(':popover-open'))box.hidePopover();
  }catch{}box.hidden=true;}
const decodeTuto=text=>decodeRealtimeSave(text).state;
/** Démarre (ou reprend) le tutoriel. La vraie partie n'est ni lue ni écrite : elle reste sous SAVE_KEY. */
export async function startTutorial({resume=false}={}){
  markTutorialOffered(undefined,tutorialOfferState()==='termine'?'termine':'propose');
  stopTuto();closeAllDialogs();
  const saved=resume?loadTutorial(decodeTuto):null;
  setState(saved?hydrateState(saved):createTutorialState({map}));if(!state)setState(createTutorialState({map}));
  setSelected(null);setMoveSource(null);setScale(1);setTx(0);setTy(0);updateLabelScale();$('#moveBanner').hidden=true;$('#provinceSheet').hidden=true;save();showGame();
  tutoStep=Math.max(0,Math.min(TUTORIAL_STEPS.length-1,Number(state.tutorialRun?.step)||0));tutoFocused=null;tutoRunning();
}
const tutorialOfferState=()=>{try{return localStorage.getItem('frontieres-arken-tutoriel-propose');}catch{return null;}};
function closeAllDialogs(){for(const d of document.querySelectorAll('dialog[open]'))d.close();}
/** « Quitter » : la partie de tutoriel est gardée (on la reprend depuis l'accueil) ; retour à l'accueil. */
export function quitTutorial(){if(tutoStep===null)return;pauseRealtime();save();stopTuto();closeAllDialogs();showWelcome();toast('Tutoriel en pause : « Reprendre le tutoriel » sur l’accueil.');}
/** Fin du tutoriel : sa sauvegarde est effacée (jamais celle de la vraie partie). */
function finishTutorial(){stopTuto();closeAllDialogs();clearTutorial();markTutorialOffered(undefined,'termine');setState(null);showWelcome();toast('Tutoriel terminé ! Votre partie vous attend.');}
/** « Suivant › » de la bulle : bouton de l'étape (ok) ou « Passer l'étape ». */
export function tutoNext(){if(tutoStep===null)return;if(tutoStep>=TUTORIAL_STEPS.length-1)return finishTutorial();setTutoStep(tutoStep+1);}
/** Premier lancement : le tutoriel est proposé une fois (jamais imposé). */
export async function offerTutorial(){if(tutorialOffered())return;markTutorialOffered();
  const answer=await eventPopup({kicker:'PREMIER LANCEMENT',title:'🎓 Un tutoriel pour commencer ?',cls:'proposal tuto-offer',
    html:'<p>Une petite partie d’entraînement en temps réel : la carte, le temps, construire, recruter, une bataille, la mer, la diplomatie… en jouant, pas à pas.</p><p class="help-intro">Facultatif. Vous pourrez le rejouer quand vous voulez depuis l’accueil ou ⚙ Paramètres, sans toucher à votre partie.</p>',
    buttons:[{label:'Passer',value:false},{label:'Jouer le tutoriel',value:true,primary:true}]});
  if(answer)startTutorial();}
export function updateTutoEntry(){const b=$('#welcomeTutorial');if(b)b.innerHTML=loadTutorial(decodeTuto)?'<span aria-hidden="true">🎓</span> Reprendre le tutoriel':'<span aria-hidden="true">🎓</span> Tutoriel';}
