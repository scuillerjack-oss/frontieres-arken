// Interface — sons et musique (Web Audio) : branchement du moteur de sons sur la page (gestes, arrière-plan, réglages).

import { createSoundEngine } from '../sound-engine.js';
import { state } from './session.js';

const engine = createSoundEngine({
  getContextClass: () => window.AudioContext || window.webkitAudioContext,
  settings: () => state?.settings,
  isHidden: () => document.visibilityState === 'hidden'
});
export const playSfx = name => engine.play(name);
export const syncMusic = () => engine.syncMusic();
export const setMusic = () => engine.syncMusic();
/** Silence pendant une publicité, quoi qu'il arrive à la fin de celle-ci. */
export async function quietDuring(task) { engine.hold(true); try { return await task(); } finally { engine.hold(false); } }

let installed = false;
export function installAudio() {
  if (installed) return; installed = true;
  const gesture = () => engine.unlock();
  // Android : touchend et click ouvrent le droit au son, pas pointerdown au doigt.
  for (const type of ['pointerup', 'touchend', 'click', 'keydown']) addEventListener(type, gesture, { capture: true, passive: true });
  addEventListener('click', event => { if (event.target?.closest?.('button')) engine.play('button'); }, { capture: true, passive: true });
  // Appli Android en arrière-plan, écran coupé, onglet caché : tout se coupe.
  const away = () => engine.background(), back = () => engine.foreground();
  document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' ? away() : back());
  addEventListener('pagehide', away); document.addEventListener('freeze', away);
  addEventListener('pageshow', back); document.addEventListener('resume', back);
}
