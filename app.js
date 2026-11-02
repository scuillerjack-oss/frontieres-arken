// FRONTIÈRES: ARKEN — démarrage de l'interface : branche les boutons et les gestes, puis lance le jeu.
// Les écrans vivent dans src/presentation/ui/ (découpage V15.0).

import { TUTORIAL_GUIDE } from './src/presentation/guide-input.js';
import { showsWholeMap, wholeMapView } from './src/presentation/launch-view.js';
import { pinchTransform } from './src/presentation/map-orders-view.js';
import { MINI_TUTO_STEPS, resetMiniTuto } from './src/presentation/passage-fort-view.js';
import { installAudio, setMusic } from './src/presentation/ui/audio.js';
import { skipTurnAnimation, turnAnimating } from './src/presentation/ui/turn-anim.js';
import { $, nation, toast } from './src/presentation/ui/base.js';
import { openBoosts, startPlay } from './src/presentation/ui/boosts-ui.js';
import { beginNewGame, continueSavedGame, setup, showWelcome } from './src/presentation/ui/game-flow.js';
import {
  MAX_ZOOM, applyLaunchView, clampTransform, drag, frameSize, ignoreClickUntil, measureFrame, minZoom, pinchStart,
  pinching, pointerDistance, pointers, render, scale, setDrag, setIgnoreClickUntil, setPinchStart, setPinching,
  setScale, setTx, setTy, tx, ty, updateLabelScale, viewport, zoomBy
} from './src/presentation/ui/map-view.js';
import { cancelMove } from './src/presentation/ui/province-sheet.js';
import { moveSource, save, selected, setSelected, state } from './src/presentation/ui/session.js';
import { openTalk } from './src/presentation/ui/talk-screen.js';
import { openCoalition } from './src/presentation/ui/event-popups.js';
import { openArmy, openHelp, renderJournal, resolveTurn } from './src/presentation/ui/turn-flow.js';
import {
  endMiniTuto, miniStep, placeTutorial, raiseMiniTuto, refreshTuto, setMiniStep, showMiniTuto, startMiniTuto,
  startTutorial, tuto, tutoNext, tutoStep, tutorial, tutorialShown
} from './src/presentation/ui/tutorials.js';

new MutationObserver(()=>{if(miniStep!==null||tutoStep!==null)raiseMiniTuto();if(tutoStep!==null)queueMicrotask(refreshTuto);}).observe(document.body,{subtree:true,attributes:true,attributeFilter:['open']});
viewport.addEventListener('pointerdown',event=>{
  pointers.set(event.pointerId,{x:event.clientX,y:event.clientY,type:event.pointerType});
  if(event.pointerType==='touch'&&pointers.size===2){const [a,b]=[...pointers.values()],rect=viewport.getBoundingClientRect();setPinching(true);setDrag(null);
    setPinchStart({distance:pointerDistance(a,b),scale,x:tx,y:ty,left:rect.left,top:rect.top,centerX:frameSize.width/2,centerY:frameSize.height/2,mid:{x:(a.x+b.x)/2-rect.left,y:(a.y+b.y)/2-rect.top}}
    );setIgnoreClickUntil(Date.now()+600);event.preventDefault();return;}
  if(pointers.size===1)setDrag({pointerId:event.pointerId,startX:event.clientX,startY:event.clientY,lastX:event.clientX,lastY:event.clientY,panning:false});
});
viewport.addEventListener('pointermove',event=>{
  if(pointers.has(event.pointerId))pointers.set(event.pointerId,{x:event.clientX,y:event.clientY,type:event.pointerType});
  if(pinching&&pointers.size>=2){const [a,b]=[...pointers.values()],mid={x:(a.x+b.x)/2,y:(a.y+b.y)/2}
    ,next=pinchTransform({scale:pinchStart.scale,x:pinchStart.x,y:pinchStart.y,startMidX:pinchStart.mid.x,startMidY:pinchStart.mid.y,midX:mid.x-pinchStart.left,midY:mid.y-pinchStart.top,
    centerX:pinchStart.centerX,centerY:pinchStart.centerY,startDistance:pinchStart.distance,currentDistance:pointerDistance(a,b),maxScale:MAX_ZOOM,minScale:minZoom});setScale(next.scale);
    setTx(next.x);setTy(next.y);setIgnoreClickUntil(Date.now()+600);clampTransform();event.preventDefault();return;}
  if(!drag||drag.pointerId!==event.pointerId)return;
  if(!drag.panning&&Math.hypot(event.clientX-drag.startX,event.clientY-drag.startY)>6){drag.panning=true;viewport.setPointerCapture?.(drag.pointerId);setIgnoreClickUntil(Date.now()+400);}
  if(drag.panning){setTx(tx+(event.clientX-drag.lastX));setTy(ty+(event.clientY-drag.lastY));drag.lastX=event.clientX;drag.lastY=event.clientY;clampTransform();}
});
const endPointer=event=>{pointers.delete(event.pointerId);if(pointers.size<2&&pinching){setPinching(false);setPinchStart(null);setIgnoreClickUntil(Date.now()+600);updateLabelScale();}if(drag?.pointerId===event.pointerId){if(drag.panning)setIgnoreClickUntil(Date.now()+400);setDrag(null);}};
viewport.addEventListener('pointerup',endPointer);viewport.addEventListener('pointercancel',endPointer);

document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>b.closest('dialog').close());
$('#tutorialOk').onclick=()=>$('#tutorialBubble').hidden=true;
$('#miniTutoSkip').onclick=endMiniTuto;
$('#miniTutoNext').onclick=()=>{if(tutoStep!==null)return tutoNext();if(miniStep===null)return;if(miniStep>=MINI_TUTO_STEPS.length-1)return endMiniTuto();setMiniStep(miniStep+(1));showMiniTuto();};
$('#welcomeTutorial').onclick=()=>startTutorial({resume:true});
$('#replayTutorial').onclick=()=>{$('#settingsDialog').close();startTutorial();};
$('#journalDialog').addEventListener('close',()=>{if($('#journalDialog').dataset.permanent!=='true')tuto('journal-closed');}); // l'historique ne valide pas l'étape
// V14.3 : un bouton surligné déjà touché est marqué (.tuto-done) : la bulle passe au geste suivant de l'étape.
document.addEventListener('click',e=>{const t=e.target.closest?.('.tuto-target');if(t&&!t.closest('svg'))t.classList.add('tuto-done');if(tutoStep!==null)setTimeout(refreshTuto,30);},true);
$('#replayMiniTuto').onclick=()=>{if(tutoStep!==null)return toast('Terminez ou quittez d’abord le tutoriel');resetMiniTuto();$('#settingsDialog').close();startMiniTuto();};
$('#closeSheet').onclick=()=>{$('#provinceSheet').hidden=true;setSelected(null);placeTutorial();render();};
$('#talkBtn').onclick=()=>openTalk();
$('#boostBtn').onclick=openBoosts;$('#welcomeBoosts').onclick=openBoosts;$('#settingsBoosts').onclick=()=>{$('#settingsDialog').close();openBoosts();};
$('#cancelMove').onclick=cancelMove;$('#armyBtn').onclick=openArmy;$('#helpBtn').onclick=openHelp;$('#journalBtn').onclick=()=>renderJournal(false);$('#nextTurn').onclick=()=>{if(!turnAnimating())resolveTurn();}; /* V15.2 : un seul tour à la fois (clavier compris : au doigt, le calque couvre le bouton) */
$('#continueGame').onclick=continueSavedGame;$('#startNewGame').onclick=beginNewGame;$('#homeBtn').onclick=showWelcome;
$('#settingsBtn').onclick=()=>{for(const k of ['music','sfx','hints'])$(`#${k}Toggle`).checked=state.settings[k];$('#settingsDialog').showModal();};
for(const k of ['music','sfx','hints'])$(`#${k}Toggle`).onchange=e=>{state.settings[k]=e.target.checked;if(k==='music')setMusic(e.target.checked);save();};
$('#resetHints').onclick=()=>{state.tutorial.forced=true;state.tutorial.seen=[];state.tutorial.stage=0;state.tutorial.shown=[];state.tutorial.turn=state.turn;save();$('#settingsDialog').close();
  tutorialShown.clear();tutorial('identity','Rejouer le tutoriel',TUTORIAL_GUIDE[0].text.replace('{nation}',nation(state.playerNationId).name));};
$('#newGame').onclick=()=>{$('#settingsDialog').close();beginNewGame();};
$('#coalitionBtn').onclick=openCoalition;
$('#endNewGame').onclick=()=>{$('#endDialog').close();beginNewGame();};$('#endJournal').onclick=()=>{$('#endDialog').close();renderJournal(true);};
// Zoom par boutons autour du centre de l'écran (la vue ne dérive pas).
$('#zoomIn').onclick=()=>zoomBy(1.4);$('#zoomOut').onclick=()=>zoomBy(1/1.4);$('#zoomReset').onclick=()=>{setScale(1);setTx(0);setTy(0);clampTransform();applyLaunchView();updateLabelScale();};
$('#wholeMapBtn').onclick=()=>{if(showsWholeMap(scale,minZoom))return applyLaunchView();const v=wholeMapView(minZoom);setScale(v.scale);setTx(v.x);setTy(v.y);clampTransform(0);updateLabelScale();};
$('#mapShell').addEventListener('click',event=>{if(event.target.closest('.order-arrow'))tutorial('orders','Ordres en attente',TUTORIAL_GUIDE.find(x=>x.id==='orders').text);});
function handleAppBack(){
  if(skipTurnAnimation()){history.pushState({arkenScreen:'game'},'',location.href);return;} // V15.2 : le retour Android passe l'animation
  if(document.querySelector('#adOverlay[open]')){history.pushState({arkenScreen:$('#gameScreen').hidden?'home':'game'},'',location.href);return;} // V12 : la pub de test se ferme seule
  const dialog=[...document.querySelectorAll('dialog[open]')].at(-1);
  if(dialog){dialog.close();if(!$('#gameScreen').hidden)history.pushState({arkenScreen:'game'},'',location.href);return;}
  if($('#gameScreen').hidden)return;
  if(moveSource)cancelMove();
  else if(!$('#provinceSheet').hidden){$('#provinceSheet').hidden=true;setSelected(null);render();}
  else showWelcome();
  if(!$('#gameScreen').hidden)history.pushState({arkenScreen:'game'},'',location.href);
}
installAudio();addEventListener('popstate',handleAppBack);addEventListener('resize',measureFrame);if('serviceWorker'in navigator)navigator.serviceWorker.register('sw.js');setup();startPlay();

