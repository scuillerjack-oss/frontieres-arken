// Interface — journal, aide, armée, fin de partie et enchaînement de la fin de tour.

import { RULES } from '../../domain/constants.js';
import { aiGoldPct, difficultyLabel, difficultyOf } from '../../domain/difficulty.js';
import { formatDate, journalEntry, nextTurn } from '../../domain/game-engine.js';
import { gameLengthOf } from '../../domain/game-length.js';
import { nationBonusInfo } from '../../domain/nations.js';
import { recordFinishedGame } from '../../domain/palmares.js';
import { arkenV9Map as map } from '../../map/arken-v9-map.js';
import { buildEndStory } from '../../domain/story.js';
import { bombardSummary } from '../bombard-view.js';
import { balloonOrderText } from '../balloon-view.js';
import { showBalloonPopups } from './balloon-ui.js';
import { endStoryHtml } from '../end-view.js';
import { RANKING_RULE, endDurationHtml, finalRankingHtml, periodLabel, rankText, realtimeEndKicker, realtimeEndWhy, revealedCharactersHtml } from '../ranking-view.js';
import { endTitlesHtml, palmaresHtml } from '../palmares-view.js';
import { TUTORIAL_GUIDE, sanitizeJournalEntry } from '../guide-input.js';
import { journalCategoryClass } from '../map-orders-view.js';
import { totalArmy } from '../overview-view.js';
import { isTutorial } from '../tutorial.js';
import { endSound } from '../turn-animation.js';
import { playSfx } from './audio.js';
import { $, buildingNames, nation, province, unitKeys } from './base.js';
import { trackMissions } from './boosts-ui.js';
import { dialogClosed, showCapitalPopups, showCoalitionPopups, showProposalPopups, showSeaPopups } from './event-popups.js';
import { render } from './map-view.js';
import { actionModal, showProvinceSheet } from './province-sheet.js';
import { liveSettings, profile, saveMyProfile, selected, state } from './session.js';
import { createTurnGate, liveApplies } from '../live-clock.js';
import { tutoStep, tutorial, tutorialShown } from './tutorials.js';
import { playTurnAnimation } from './turn-anim.js';
import { bindRealtimeJournal, realtimeJournalHtml } from './realtime-ui.js';
import { realtimeText } from '../realtime-view.js';

export function renderJournal(permanent=false){
  // V17.3 : en temps réel, « Récent » = les derniers faits du journal permanent (rempli chaque jour), les plus récents d'abord.
  const entries=(permanent?state.chronicle:state.mode==='realtime'?[...(state.chronicle||[])].slice(-40).reverse():state.turnJournal||state.journal||[]).map(entry=>sanitizeJournalEntry(entry.text?entry:journalEntry(entry,map,state.playerNationId))).filter(Boolean);
  const rt=state.mode==='realtime'; // V17.3 : plus de « tour » en temps réel ; alertes et décisions en tête du journal récent
  $('#journalDialog').dataset.permanent=permanent?'true':'false';$('#journalMode').textContent=permanent?'JOURNAL PERMANENT':rt?`JOURNAL · ${formatDate(state.day).toUpperCase()}`:'RÉCAPITULATIF INTER-TOUR';
  $('#journalTabs').innerHTML=`<button data-journal="recent" class="${permanent?'':'active'}">${rt?'Récent':'Inter-tour'}</button><button data-journal="history" class="${permanent?'active':''}">Historique</button>`;
  $('#journalBody').innerHTML=(rt&&!permanent?realtimeJournalHtml():'')+(entries.length?entries.map(e=>`<div class="journal-entry ${journalCategoryClass(e.type)}"><small>${e.type||'Événement'}</small><div>${rt?realtimeText(e.text):e.text}</div>\
</div>`).join(''):'<div class="journal-entry neutral"><small>Calme</small><div>Aucun événement important à signaler.</div></div>');
  if(rt)bindRealtimeJournal();
  document.querySelectorAll('[data-journal]').forEach(b=>b.onclick=()=>renderJournal(b.dataset.journal==='history'));
  $('#journalDialog').showModal();if(!permanent&&!rt)tutorial('history','Deux journaux','Le récapitulatif inter-tour montre les événements importants. L’historique garde le détail connu des productions et du monde.');
}
/** V15.3 : le niveau de la partie et le bonus de la nation, écrits noir sur blanc (tout avantage des IA y figure). */
export function levelSummary(){const pct=aiGoldPct(state);return `Niveau ${difficultyLabel(difficultyOf(state))}${pct?` : les IA reçoivent +${pct} % d’or ${state?.mode==='realtime'?'sur leurs revenus':'à chaque tour'}`:''}.`;}
export function openHelp(){const bonus=nationBonusInfo(state.playerNationId),entries=[{title:'Cette partie',text:`${levelSummary()}${bonus&&!state.tutorialMode?` Votre bonus de nation, ${bonus.title} : ${bonus.text}. Chaque IA a aussi le sien.`:''}`},...TUTORIAL_GUIDE];$('#helpBody').innerHTML=entries.map(x=>`<article class="help-item"><b>${x.title}</b><p>${x.text.replace('{nation}',nation(state.playerNationId).name).replace(`dure ${RULES.gameLength} tours`,`dure ${gameLengthOf(state)} tours`)}</p></article>`).join('');$('#helpDialog').showModal();}
/** V15.4 : palmarès et titres (profil du joueur), depuis l'accueil. */
export function openPalmares(){$('#palmaresBody').innerHTML=palmaresHtml(profile.palmares,map.nations);$('#palmaresDialog').showModal();}
export function openArmy(){const army=totalArmy(state,state.playerNationId);actionModal('Armée totale',state.mode==='realtime'?formatDate(state.day).toUpperCase():`TOUR ${state.turn}`,Object.entries(army.byType).map(([key,value])=>`<div class="unit-row"><span>${unitKeys[key]}</span><b>${value}</b></div>`).join(''));}
// --- V10 : fin de partie --------------------------------------------------------------------------------------
// Le récit ne doit jamais empêcher d'afficher la fin : sans données exploitables, on garde un classement simple.
const safeEndStory=()=>{try{return buildEndStory(state,map);}catch{return buildEndStory({...state,story:null},map);}};
export function showEndScreen(){
  const go=state.gameOver;if(!go)return false;
  // V15.4 : comptée une seule fois au palmarès, même si l'écran est rouvert ou la sauvegarde rechargée.
  const record=recordFinishedGame(profile,state);if(record.counted)saveMyProfile();
  const me=state.playerNationId,mine=go.ranking.find(r=>r.nationId===me),won=go.winnerId===me;
  const title=go.reason==='player-eliminated'?'Défaite':won?'Victoire !':'Fin de la partie';
  if(state.mode==='realtime'&&go.scoring==='points')return showRealtimeEnd(go,record,{me,mine,won,title});
  const rt=state.mode==='realtime'&&Number.isFinite(go.day); // V17.1 : la date à la place du tour
  const why=go.reason==='capitals'?`${nation(go.winnerId).name} tient les cinq capitales.`:go.reason==='player-eliminated'?`${nation(me).name} n’a plus aucune province.`:rt?`Le temps est écoulé : nous sommes le ${formatDate(go.day)}.`:`Les ${go.turn} tours sont écoulés.`;
  $('#endKicker').textContent=`${rt?formatDate(go.day).toUpperCase():`TOUR ${go.turn}`} · ${go.reason==='capitals'?'VICTOIRE ANTICIPÉE':go.reason==='player-eliminated'?'NATION ÉLIMINÉE':rt?'FIN DE LA PARTIE':`FIN DES ${go.turn} TOURS`}`;
  $('#endTitle').textContent=title;$('#endDialog').dataset.result=go.reason==='player-eliminated'||!won&&go.reason==='capitals'?'defeat':won?'victory':'end';
  $('#endBody').innerHTML=`<p class="end-why">${why} ${go.reason==='player-eliminated'?'':won?'Votre nation termine première.':`Votre nation termine ${mine?.rank===1?'1re':`${mine?.rank}e`} sur ${go.ranking.length}.`} ${levelSummary()}</p>\
${endTitlesHtml(record.titles)}${endStoryHtml(safeEndStory())}`;$('#endDialog').scrollTop=0;
  $('#endDialog').showModal();return true;
}
/**
 * V17.8 : écran de fin du temps réel (cahier V17 §9) : date de fin, durée de jeu, classement final à points (détail de
 * chaque nation : tout est révélé), caractères des dirigeants, titres obtenus, récit daté au mois. Le temps est arrêté.
 */
function showRealtimeEnd(go,record,{me,mine,won,title}){
  const story=safeEndStory(),name=id=>nation(id).name;
  const conquest=go.reason==='capitals'||go.reason==='last-nation';
  $('#endKicker').textContent=realtimeEndKicker(go);$('#endTitle').textContent=title;
  $('#endDialog').dataset.result=go.reason==='player-eliminated'||!won&&conquest?'defeat':won?'victory':'end';
  const place=go.reason==='player-eliminated'?'':won?`Votre nation termine première avec ${mine.score} points.`:`Votre nation termine ${rankText(mine?.rank||go.ranking.length)} sur ${go.ranking.length} avec ${mine?.score||0} points ; ${nation(go.winnerId).short} gagne avec ${go.ranking[0].score} points.`;
  $('#endBody').innerHTML=`<p class="end-why">${realtimeEndWhy(go,{me,name})} ${place} ${levelSummary()}</p>${endDurationHtml(go,state.rt?.playMs)}\
${endTitlesHtml(record.titles)}${finalRankingHtml(go,{me,nations:map.nations})}${revealedCharactersHtml(story?.nations)}${endStoryHtml(story,{when:periodLabel,realtime:true,rule:`Classement à points : ${RANKING_RULE}`})}`;
  // Remise en haut APRÈS l'ouverture (une fenêtre fermée ne garde pas un scrollTop posé avant) : sinon l'écran rouvert part d'en bas.
  $('#endDialog').showModal();$('#endDialog').scrollTop=0;const sec=$('#endDialog section');if(sec)sec.scrollTop=0;return true;
}
/** V16.4 : le déroulé en direct s'applique-t-il à cette partie ? (jamais en tutoriel ni pendant le mini tuto) */
export const liveOn=()=>Boolean(state)&&state.mode!=='realtime'&&liveApplies(liveSettings,{tutorial:isTutorial(state)||tutoStep!==null});
/** V16.4 : une seule résolution à la fois (fin d'horloge, « Passer », « Verrouiller et résoudre »). */
export const turnGate=createTurnGate();
/** Ordres en attente du joueur, une ligne chacun (récapitulatif de fin de tour et rappel du bandeau en direct). */
export function pendingOrderLines(){
  return state.orders.filter(o=>o.status==='pending').map(o=>o.kind.startsWith('balloon-')?balloonOrderText(o,{province:id=>province(id).name,nation:id=>nation(id).short}):o.kind==='bombard'?bombardSummary(o,
    id=>province(id).name):o.kind==='move'?`${province(o.fromId).name} → ${province(o.toId).name} (${o.nationId===state.playerNationId?'mouvement':'ordre'})`:o.kind==='diplomacy'?`Diplomatie : ${({
    war:'déclaration de guerre',alliance:'proposition d’alliance',ceasefire:'cessez-le-feu',break:'rupture d’alliance'}
    )[o.action]||o.action} (${nation(o.target).short})`:o.kind==='help'?`Demande d’aide à ${nation(o.to).short}`:o.kind==='construction'?`Construction \
: ${buildingNames[o.type]}`:o.kind==='talk'?`Message ${o.tone==='hostile'?'hostile':o.tone==='amical'?'amical':'neutre'} à ${o.to?nation(o.to).short:'tous'}`:`Production : ${RULES.units[o.type]?.label||o.type}`);
}
export function resolveTurn(){
  if(showEndScreen())return;
  if(state.mode==='realtime')return; // V17.1 : pas de fin du tour en temps réel
  if(liveOn())return void playTurn({live:true}); // V16.4 : « Passer » — résolu tout de suite, sans confirmation
  const lines=pendingOrderLines(),count=lines.length;
  const summary=count?lines.join('\n'):'Aucun ordre en attente.';
  actionModal('Terminer le tour',`${count} ordre(s) en attente`,`<p>Les ordres deviennent définitifs pour cette résolution. Les IA verrouillent aussi les leurs.</p><pre class="order-summary">${summary}</pre><button id="confirmEndTurn" class="primary">Verrouiller et résoudre</button>`);
  $('#confirmEndTurn').onclick=()=>{$('#actionDialog').close();playTurn();};
}
/**
 * Résout le tour puis enchaîne ses fenêtres. `live` (V16.4) : le journal ne s'ouvre plus tout seul (le bandeau d'annonces
 * le remplace ; il reste accessible par le bouton Journal) ; les fenêtres qui demandent une réponse s'ouvrent toujours.
 * La promesse se termine quand toute la suite est finie : l'horloge du tour en direct repart à ce moment-là.
 */
export async function playTurn({live=false}={}){
  if(!state||state.gameOver){showEndScreen();return;}
  if(state.mode==='realtime')return; // V17.1 : le temps réel avance jour par jour (realtime-ui.js)
  if(!turnGate.tryStart())return;
  try{
  // V13 : après la résolution — prise de capitale (fenêtre dédiée), journal, puis une fenêtre Oui / Non par proposition reçue.
  const game=state,same=()=>state===game; const eventStart=state.events.length; nextTurn(state,map);tutorialShown.clear();
    state.tutorial.turn=state.turn;state.tutorial.shown=[];render();if(live&&selected&&!$('#provinceSheet').hidden)showProvinceSheet(); /* V16.4 : fiche ouverte pendant la résolution : chiffres remis à jour */playSfx('turn');const events=state.events.slice(eventStart);
    if(!isTutorial(state))trackMissions(events); // V14.3 : le tutoriel ne compte pas pour les missions
    // V14.3 : si le joueur quitte (tutoriel → accueil) pendant ces fenêtres, la suite s'arrête : jamais sur une autre partie.
    // V15.2 : animation entre les tours, jamais dans un tutoriel (ses bulles suivent les gestes du joueur).
    if(!isTutorial(state)&&tutoStep===null){await playTurnAnimation(events);if(!same())return;}
    await showCapitalPopups(events);if(!same())return;
    await showSeaPopups(events);if(!same())return;
    if(state.gameOver){playSfx(endSound(state.gameOver,state.playerNationId));showEndScreen();return;}
    await showCoalitionPopups(events);if(!same())return;
    if(!live){renderJournal(false);await dialogClosed($('#journalDialog'));if(!same())return;}
    await showBalloonPopups(events);if(!same())return; // V16.1 : ballon étranger arrivé — Détruire / Laisser passer
    await showProposalPopups();
  }finally{turnGate.finish();}
}
