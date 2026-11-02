// Interface — accueil, nouvelle partie, reprise, choix de la nation.

import { recordGameStarted } from '../../domain/profile.js';
import { arkenV9Map as map } from '../../map/arken-v9-map.js';
import { createGameState } from '../../state/create-game-state.js';
import { showGameStartAd } from '../ads.js';
import { SAVE_KEY, TUTORIAL_GUIDE } from '../guide-input.js';
import { shouldStartMiniTuto } from '../passage-fort-view.js';
import { setActiveScreen } from '../screen-flow.js';
import { resolveNewGameRequest } from '../start-flow.js';
import { isTutorial } from '../tutorial.js';
import { $, nation, toast } from './base.js';
import { showIntro } from './event-popups.js';
import {
  applyLaunchView, measureFrame, render, scale, setScale, setTx, setTy, tx, ty, updateLabelScale
} from './map-view.js';
import {
  applyBoosts, hydrateState, load, moveSource, profile, save, saveMyProfile, selected, setMoveSource, setSelected,
  setState, showSaveNotice, state
} from './session.js';
import { showEndScreen } from './turn-flow.js';
import {
  miniStep, offerTutorial, setMiniStep, startMiniTuto, stopTuto, tutorial, updateTutoEntry
} from './tutorials.js';

export function showWelcome(){
  setActiveScreen(document,'welcome');const raw=load(),saved=hydrateState(raw);$('#continueGame').hidden=!saved;showSaveNotice(raw);$('#tutorialBubble').hidden=true;setMiniStep(null);stopTuto();
    $('#miniTuto').hidden=true;setState(null);updateTutoEntry();history.replaceState({arkenScreen:'home'},'',location.href);
}
export function showGame(){
  setActiveScreen(document,'game');history.pushState({arkenScreen:'game'},'',location.href);
  requestAnimationFrame(()=>{measureFrame();render();applyLaunchView();if(state.gameOver)showEndScreen();});
}
export function continueSavedGame(){stopTuto();setState(hydrateState(load()));if(!state)return toast('Aucune sauvegarde valide à reprendre');setSelected(null);setMoveSource(null);setScale(1);setTx(0);setTy(0);updateLabelScale();showGame();}
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
export function beginNewGame(){
  const hasStoredSave=Boolean(localStorage.getItem(SAVE_KEY));
  if(!hasStoredSave){openNationChoice();return;}
  confirmSaveReplacement().then(confirmed=>{
    if(resolveNewGameRequest({hasStoredSave,confirmed})==='choose-nation')openNationChoice();
  });
}
function openNationChoice(){
  $('#nationChoices').innerHTML=map.nations.map(n=>`<button class="nation" data-nation="${n.id}" style="--nation:${n.color}"><i></i><b>${n.name}</b></button>`).join('');
  document.querySelectorAll('[data-nation]').forEach(b=>b.onclick=async()=>{stopTuto();setState(applyBoosts(createGameState({map,playerNationId:b.dataset.nation,seed:'arken-'+Date.now().toString(36)})));$('#nationDialog').close();save();recordGameStarted(profile);saveMyProfile();
    // V12 : une publicité (emplacement de TEST en bêta) au début de chaque nouvelle partie, sauf avec le Pack débutant.
    await showGameStartAd({profile,inTutorial:isTutorial(state)||shouldStartMiniTuto()});setSelected(null);setMoveSource(null);setScale(1);setTx(0);setTy(0);updateLabelScale();showGame();
      await showIntro();if(shouldStartMiniTuto()){startMiniTuto();return;
      }tutorial('identity','Vous dirigez '+nation(state.playerNationId).name,TUTORIAL_GUIDE[0].text.replace('{nation}',nation(state.playerNationId).name));
      tutorial('map','Votre carte stratégique',TUTORIAL_GUIDE[1].text);});
  $('#nationDialog').showModal();
}
export function setup(){const raw=load(),saved=hydrateState(raw);$('#continueGame').hidden=!saved;showSaveNotice(raw);setActiveScreen(document,'welcome');updateTutoEntry();offerTutorial();}
