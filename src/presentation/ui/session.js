// Interface — la partie et le profil en cours, sauvegarde et chargement.
// Les variables se lisent directement (liaison vivante d'ES) ; pour les remplacer depuis un autre module : setState(…), etc.

import { setPlayerBonuses } from '../../domain/boosts.js';
import { eventKnownToPlayer, journalEntry } from '../../domain/game-engine.js';
import { arkenV9Map as map } from '../../map/arken-v9-map.js';
import { decodeSave, encodeSave } from '../../persistence/save-codec.js';
import { SAVE_KEY } from '../guide-input.js';
import { loadProfile, saveProfile } from '../profile-storage.js';
import { isTutorial, saveKeyFor } from '../tutorial.js';
import { $ } from './base.js';

export let state, selected = null, moveSource = null;
// V12 : profil joueur (clé localStorage dédiée `frontieres-arken-profil`, distincte de la sauvegarde de partie).
export let profile = loadProfile();
export const saveMyProfile = () => saveProfile(profile);
/** Injecte les atouts du profil dans la partie (joueur humain seulement) : création, chargement, amélioration. */
export const applyBoosts = game => game && !isTutorial(game) ? setPlayerBonuses(game, profile.boosts) : game; // V14.3 : pas d'atouts dans le tutoriel (chiffres de base)
// V14.3 : la partie de tutoriel a SA clé (frontieres-arken-tutoriel-save) ; la vraie partie garde SAVE_KEY, jamais écrasée.
export const save = () => { if (state) localStorage.setItem(saveKeyFor(state), encodeSave(state)); };
export const load = () => { try { const raw=localStorage.getItem(SAVE_KEY); return raw ? decodeSave(raw) : null; } catch { return null; } };
function savedOnOtherMap(value){return Boolean(value&&value.mapId&&value.mapId!==map.id);}
export function showSaveNotice(raw){const notice=$('#saveNotice');notice.hidden=!savedOnOtherMap(raw);}
export function hydrateState(value){
  if(!value||value.mapId!==map.id)return null;
  value.turnJournal||=value.journal||[];value.chronicle||=[];value.orders||=[];value.tutorial||={seen:[],stage:0,turn:value.turn,shown:[]};value.tutorial.shown||=[];value.tutorial.turn??=value.turn;
  value.orderSequence=Math.max(Number(value.orderSequence)||1,1+value.orders.length);value.transports||=[];value.transportSequence=Math.max(1,Number(value.transportSequence)||1);value.randomCounter=Math.max(0,Number(value.randomCounter)||0);value.warChestsClaimed||={};
  for(const n of map.nations)if(value.nations[n.id])value.nations[n.id].capitalId||=map.provinces.find(p=>p.initialOwner===n.id)?.id;
  for(const d of map.provinces)if(value.provinces[d.id])value.provinces[d.id].portSite=Boolean(d.port);
  if(!value.chronicle.length&&value.events?.length)value.chronicle=value.events.filter(e=>eventKnownToPlayer(value,map,e)).map(e=>journalEntry(e,map,value.playerNationId)).filter(Boolean);
  return applyBoosts(value); // V14.3 : sans effet sur une partie de tutoriel
}
export const setState = value => { state = value; };
export const setSelected = value => { selected = value; };
export const setMoveSource = value => { moveSource = value; };
export const setProfile = value => { profile = value; };
