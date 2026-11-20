// Interface — accueil, nouvelle partie, reprise, choix de la nation.

import { DEFAULT_DIFFICULTY, DIFFICULTY_IDS, aiGoldPct, difficultyLabel, difficultyText } from '../../domain/difficulty.js';
import { DEFAULT_GAME_LENGTH, GAME_LENGTHS, gameLengthLabel, gameLengthText } from '../../domain/game-length.js';
import { nationBonusInfo } from '../../domain/nations.js';
import { recordGameStarted } from '../../domain/profile.js';
import { arkenV9Map as map } from '../../map/arken-v9-map.js';
import { createGameState } from '../../state/create-game-state.js';
import { createRealtimeGame } from '../../domain/realtime/create.js';
import { formatDate } from '../../domain/realtime/clock.js';
import { recordFinishedGame } from '../../domain/palmares.js';
import { realtimeLengthLabel, realtimeLengthText } from '../ranking-view.js';
import { syncMusic } from './audio.js';
import { markNewGame } from './ad-ui.js';
import { SAVE_KEY, TUTORIAL_GUIDE } from '../guide-input.js';
import { shouldStartMiniTuto } from '../passage-fort-view.js';
import { setActiveScreen } from '../screen-flow.js';
import { resolveNewGameRequest } from '../start-flow.js';
import { $, nation, toast } from './base.js';
import { showIntro } from './event-popups.js';
import {
  applyLaunchView, measureFrame, render, scale, setScale, setTx, setTy, tx, ty, updateLabelScale
} from './map-view.js';
import {
  applyBoosts, hydrateState, load, moveSource, profile, save, saveMyProfile, selected, setMoveSource, setSelected,
  setState, showSaveNotice, state, turnBasedTest
} from './session.js';
import { showEndScreen } from './turn-flow.js';
import {
  miniStep, offerTutorial, setMiniStep, startMiniTuto, stopTuto, tutorial, updateTutoEntry
} from './tutorials.js';

export function showWelcome(){
  if(state&&!$('#gameScreen').hidden)save(); // V17.7 : en temps réel, la partie n'est écrite que tous les 10 jours : rien de perdu en revenant à l'accueil
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
/** V17.8 : texte de la confirmation « Nouvelle partie » (cahier V17 §9.3) : tout sera perdu, sauf le profil. */
function replaceSaveText(){
  const g=state&&!state.gameOver?state:null;
  $('#replaceSaveTitle').textContent='Nouvelle partie : vous perdrez tout';
  $('#replaceSaveMessage').textContent=`${g?`La partie en cours (${nation(g.playerNationId).name}${g.mode==='realtime'?`, ${formatDate(g.day)}`:''})`:'La partie sauvegardée sur cet appareil'} sera effacée : nation, provinces, armées, trésor. Une partie abandonnée ne compte pas au palmarès. Vos jetons, vos atouts et votre palmarès sont gardés. Vous pourrez reprendre la même nation ou une autre.`;
}
export function beginNewGame(){
  const hasStoredSave=Boolean(localStorage.getItem(SAVE_KEY));
  // V17.8 : une partie terminée est déjà comptée au palmarès (rien à perdre) : pas de confirmation.
  if(state?.gameOver){if(recordFinishedGame(profile,state).counted)saveMyProfile();openNationChoice();return;}
  if(!hasStoredSave){openNationChoice();return;}
  replaceSaveText();
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
  // V17.8 : en temps réel, les longueurs se lisent en années (15 ans / courte 7 ans), plus en tours.
  const rtLength=!turnBasedTest(),lengthLabel=n=>rtLength?realtimeLengthLabel(n!==DEFAULT_GAME_LENGTH):gameLengthLabel(n),lengthText=n=>rtLength?realtimeLengthText(n!==DEFAULT_GAME_LENGTH):gameLengthText(n);
  $('#lengthChoices').innerHTML=GAME_LENGTHS.map(n=>`<button type="button" class="level-choice" data-length="${n}" aria-pressed="${n===gameLength}">${lengthLabel(n)}</button>`).join('');
  const showLength=()=>{document.querySelectorAll('[data-length]').forEach(b=>b.setAttribute('aria-pressed',String(Number(b.dataset.length)===gameLength)));$('#lengthText').textContent=lengthText(gameLength);};
  document.querySelectorAll('[data-length]').forEach(b=>b.onclick=()=>{gameLength=Number(b.dataset.length);showLength();});showLength();
  $('#nationChoices').innerHTML=map.nations.map(n=>{const bonus=nationBonusInfo(n.id);return `<button class="nation" data-nation="${n.id}" style="--nation:${n.color}"><i></i><span class="nation-choice"><b>${n.name}</b>\
<small data-nation-bonus>${bonus.title} : ${bonus.text}</small></span></button>`;}).join('');
  document.querySelectorAll('[data-nation]').forEach(b=>b.onclick=async()=>{stopTuto();setState(applyBoosts((turnBasedTest()?createGameState:createRealtimeGame)({map,playerNationId:b.dataset.nation,seed:'arken-'+Date.now().toString(36),difficulty:level,gameLength}))); /* V17.1 : temps réel (tour par tour : réglage de test ?tour-par-tour) */markNewGame(state);$('#nationDialog').close();save();recordGameStarted(profile);saveMyProfile();
    // V17.7 : plus de publicité au début de la partie (cahier V17 §10.2) : la pub imposée ne passe qu'à un moment calme (ui/ad-ui.js).
    setSelected(null);setMoveSource(null);setScale(1);setTx(0);setTy(0);updateLabelScale();if(aiGoldPct(state))toast(`Niveau Difficile : les IA reçoivent +${aiGoldPct(state)} % d’or ${state.mode==='realtime'?'sur leurs revenus':'à chaque tour'}.`);showGame();
      await showIntro();if(shouldStartMiniTuto()){startMiniTuto();return;
      }tutorial('identity','Vous dirigez '+nation(state.playerNationId).name,TUTORIAL_GUIDE[0].text.replace('{nation}',nation(state.playerNationId).name));
      tutorial('map','Votre carte stratégique',TUTORIAL_GUIDE[1].text);});
  $('#nationDialog').showModal();
}
export function setup(){const raw=load(),saved=hydrateState(raw);$('#continueGame').hidden=!saved;showSaveNotice(raw);setActiveScreen(document,'welcome');updateTutoEntry();offerTutorial();}
