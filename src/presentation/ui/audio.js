// Interface — sons et musique (Web Audio).

import { state } from './session.js';

let audioCtx, musicNodes = [];
export function playSfx(){if(!state.settings.sfx)return;audioCtx ||= new AudioContext();const o=audioCtx.createOscillator(),g=audioCtx.createGain();o.frequency.value=330;
  g.gain.setValueAtTime(.035,audioCtx.currentTime);g.gain.exponentialRampToValueAtTime(.001,audioCtx.currentTime+.12);o.connect(g).connect(audioCtx.destination);o.start();
  o.stop(audioCtx.currentTime+.12);}
export function setMusic(on){if(!on){musicNodes.forEach(n=>n.stop?.());musicNodes=[];return;}audioCtx ||= new AudioContext();if(musicNodes.length)return;
  [110,146.8,164.8].forEach((f,i)=>{const o=audioCtx.createOscillator(),g=audioCtx.createGain();o.type='sine';o.frequency.value=f;g.gain.value=.009/(i+1);o.connect(g).connect(audioCtx.destination);
  o.start();musicNodes.push(o);});}
// Sauvegarde d'une autre carte (ex. V6 'arken-v1-original-map') : elle n'est plus ignorée en silence (B14).
