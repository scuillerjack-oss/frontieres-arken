// Interface — accueil, nouvelle partie, reprise, choix de la nation.

import { DEFAULT_DIFFICULTY, DIFFICULTY_IDS, aiGoldPct, difficultyLabel, difficultyText } from '../../domain/difficulty.js';
import { DEFAULT_GAME_LENGTH, GAME_LENGTHS, gameLengthLabel, gameLengthText } from '../../domain/game-length.js';
import { nationBonusInfo } from '../../domain/nations.js';
import { recordGameStarted } from '../../domain/profile.js';
import { arkenV9Map as map } from '../../map/arken-v9-map.js';
import { createGameState } from '../../state/create-game-state.js';
import { showGameStartAd } from '../ads.js';
import { quietDuring, syncMusic } from './audio.js';
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
    $('#miniTuto').hidden=true;setState(null);syncMusic();updateTutoEntry();history.replaceState({arkenScreen:'home'},'',location.href);
}
export function showGame(){
  setActiveScreen(document,'game');syncMusic();history.pushState({arkenScreen:'game'},'',location.href);
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
  // V15.3 : niveau (Normal présélectionné) et nation, sur le même écran.
  let level=DEFAULT_DIFFICULTY;
  $('#levelChoices').innerHTML=DIFFICULTY_IDS.map(id=>`<button type="button" class="level-choice" data-level="${id}" aria-pressed="${id===level}">${difficultyLabel(id)}</button>`).join('');
  const showLevel=()=>{document.querySelectorAll('[data-level]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.level===level)));$('#levelText').textContent=difficultyText(level);};
  document.querySelectorAll('[data-level]').forEach(b=>b.onclick=()=>{level=b.dataset.level;showLevel();});showLevel();
  // V15.4 : longueur de la partie (80 tours présélectionné), même présentation que le niveau.
  let gameLength=DEFAULT_GAME_LENGTH;
  $('#lengthChoices').innerHTML=GAME_LENGTHS.map(n=>`<button type="button" class="level-choice" data-length="${n}" aria-pressed="${n===gameLength}">${gameLengthLabel(n)}</button>`).join('');
  const showLength=()=>{document.querySelectorAll('[data-length]').forEach(b=>b.setAttribute('aria-pressed',String(Number(b.dataset.length)===gameLength)));$('#lengthText').textContent=gameLengthText(gameLength);};
  document.querySelectorAll('[data-length]').forEach(b=>b.onclick=()=>{gameLength=Number(b.dataset.length);showLength();});showLength();
  $('#nationChoices').innerHTML=map.nations.map(n=>{const bonus=nationBonusInfo(n.id);return `<button class="nation" data-nation="${n.id}" style="--nation:${n.color}"><i></i><span class="nation-choice"><b>${n.name}</b>\
<small data-nation-bonus>${bonus.title} : ${bonus.text}</small></span></button>`;}).join('');
  document.querySelectorAll('[data-nation]').forEach(b=>b.onclick=async()=>{stopTuto();setState(applyBoosts(createGameState({map,playerNationId:b.dataset.nation,seed:'arken-'+Date.now().toString(36),difficulty:level,gameLength})));$('#nationDialog').close();save();recordGameStarted(profile);saveMyProfile();
    // V12 : une publicité (emplacement de TEST en bêta) au début de chaque nouvelle partie, sauf avec le Pack débutant.
    await quietDuring(()=>showGameStartAd({profile,inTutorial:isTutorial(state)||shouldStartMiniTuto()}));setSelected(null);setMoveSource(null);setScale(1);setTx(0);setTy(0);updateLabelScale();if(aiGoldPct(state))toast(`Niveau Difficile : les IA reçoivent +${aiGoldPct(state)} % d’or à chaque tour.`);showGame();
      await showIntro();if(shouldStartMiniTuto()){startMiniTuto();return;
      }tutorial('identity','Vous dirigez '+nation(state.playerNationId).name,TUTORIAL_GUIDE[0].text.replace('{nation}',nation(state.playerNationId).name));
      tutorial('map','Votre carte stratégique',TUTORIAL_GUIDE[1].text);});
  $('#nationDialog').showModal();
}
export function setup(){const raw=load(),saved=hydrateState(raw);$('#continueGame').hidden=!saved;showSaveNotice(raw);setActiveScreen(document,'welcome');updateTutoEntry();offerTutorial();}
