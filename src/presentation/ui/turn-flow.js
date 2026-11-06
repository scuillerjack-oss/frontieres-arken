// Interface — journal, aide, armée, fin de partie et enchaînement de la fin de tour.

import { RULES } from '../../domain/constants.js';
import { aiGoldPct, difficultyLabel, difficultyOf } from '../../domain/difficulty.js';
import { journalEntry, journalTypeLabel, localizeJournal, nextTurn } from '../../domain/game-engine.js';
import { gameLengthOf } from '../../domain/game-length.js';
import { nationBonusInfo } from '../../domain/nations.js';
import { recordFinishedGame } from '../../domain/palmares.js';
import { arkenV9Map as map } from '../../map/arken-v9-map.js';
import { buildEndStory } from '../../domain/story.js';
import { bombardSummary } from '../bombard-view.js';
import { endStoryHtml } from '../end-view.js';
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
import { actionModal } from './province-sheet.js';
import { profile, saveMyProfile, state } from './session.js';
import { miniStep, miniTuto, tutoStep, tutorial, tutorialShown } from './tutorials.js';
import { playTurnAnimation } from './turn-anim.js';

export function renderJournal(permanent=false){
  // V16 : entrées réécrites dans la langue du joueur à partir de leurs événements (localizeJournal), type traduit à l'affichage.
  const entries=localizeJournal(state,map,(permanent?state.chronicle:state.turnJournal||state.journal||[])).map(entry=>sanitizeJournalEntry(entry.text?entry:journalEntry(entry,map,state.playerNationId))).filter(Boolean);
  $('#journalDialog').dataset.permanent=permanent?'true':'false';$('#journalMode').textContent=permanent?'JOURNAL PERMANENT':'RÉCAPITULATIF INTER-TOUR';
  $('#journalTabs').innerHTML=`<button data-journal="recent" class="${permanent?'':'active'}">Inter-tour</button><button data-journal="history" class="${permanent?'active':''}">Historique</button>`;
  $('#journalBody').innerHTML=entries.length?entries.map(e=>`<div class="journal-entry ${journalCategoryClass(e.type)}"><small>${journalTypeLabel(e.type)}</small><div>${e.text}</div>\
</div>`).join(''):'<div class="journal-entry neutral"><small>Calme</small><div>Aucun événement important à signaler.</div></div>';
  document.querySelectorAll('[data-journal]').forEach(b=>b.onclick=()=>renderJournal(b.dataset.journal==='history'));
  $('#journalDialog').showModal();if(!permanent)tutorial('history','Deux journaux','Le récapitulatif inter-tour montre les événements importants. L’historique garde le détail connu des productions et du monde.');
}
/** V15.3 : le niveau de la partie et le bonus de la nation, écrits noir sur blanc (tout avantage des IA y figure). */
export function levelSummary(){const pct=aiGoldPct(state);return `Niveau ${difficultyLabel(difficultyOf(state))}${pct?` : les IA reçoivent +${pct} % d’or à chaque tour`:''}.`;}
export function openHelp(){const bonus=nationBonusInfo(state.playerNationId),entries=[{title:'Cette partie',text:`${levelSummary()}${bonus&&!state.tutorialMode?` Votre bonus de nation, ${bonus.title} : ${bonus.text}. Chaque IA a aussi le sien.`:''}`},...TUTORIAL_GUIDE];$('#helpBody').innerHTML=entries.map(x=>`<article class="help-item"><b>${x.title}</b><p>${x.text.replace('{nation}',nation(state.playerNationId).name).replace(`dure ${RULES.gameLength} tours`,`dure ${gameLengthOf(state)} tours`)}</p></article>`).join('');$('#helpDialog').showModal();}
/** V15.4 : palmarès et titres (profil du joueur), depuis l'accueil. */
export function openPalmares(){$('#palmaresBody').innerHTML=palmaresHtml(profile.palmares,map.nations);$('#palmaresDialog').showModal();}
export function openArmy(){const army=totalArmy(state,state.playerNationId);actionModal('Armée totale',`TOUR ${state.turn}`,Object.entries(army.byType).map(([key,value])=>`<div class="unit-row"><span>${unitKeys[key]}</span><b>${value}</b></div>`).join(''));}
// --- V10 : fin de partie --------------------------------------------------------------------------------------
// Le récit ne doit jamais empêcher d'afficher la fin : sans données exploitables, on garde un classement simple.
const safeEndStory=()=>{try{return buildEndStory(state,map);}catch{return buildEndStory({...state,story:null},map);}};
export function showEndScreen(){
  const go=state.gameOver;if(!go)return false;
  // V15.4 : comptée une seule fois au palmarès, même si l'écran est rouvert ou la sauvegarde rechargée.
  const record=recordFinishedGame(profile,state);if(record.counted)saveMyProfile();
  const me=state.playerNationId,mine=go.ranking.find(r=>r.nationId===me),won=go.winnerId===me;
  const title=go.reason==='player-eliminated'?'Défaite':won?'Victoire !':'Fin de la partie';
  const why=go.reason==='capitals'?`${nation(go.winnerId).name} tient les cinq capitales.`:go.reason==='player-eliminated'?`${nation(me).name} n’a plus aucune province.`:`Les ${go.turn} tours sont écoulés.`;
  $('#endKicker').textContent=`TOUR ${go.turn} · ${go.reason==='capitals'?'VICTOIRE ANTICIPÉE':go.reason==='player-eliminated'?'NATION ÉLIMINÉE':`FIN DES ${go.turn} TOURS`}`;
  $('#endTitle').textContent=title;$('#endDialog').dataset.result=go.reason==='player-eliminated'||!won&&go.reason==='capitals'?'defeat':won?'victory':'end';
  $('#endBody').innerHTML=`<p class="end-why">${why} ${go.reason==='player-eliminated'?'':won?'Votre nation termine première.':`Votre nation termine ${mine?.rank===1?'1re':`${mine?.rank}e`} sur ${go.ranking.length}.`} ${levelSummary()}</p>\
${endTitlesHtml(record.titles)}${endStoryHtml(safeEndStory())}`;$('#endDialog').scrollTop=0;
  $('#endDialog').showModal();return true;
}
export function resolveTurn(){
  if(showEndScreen())return;
  const count=state.orders.filter(o=>o.status==='pending').length;
  const summary=count?state.orders.filter(o=>o.status==='pending').map(o=>o.kind==='bombard'?bombardSummary(o,
    id=>province(id).name):o.kind==='move'?`${province(o.fromId).name} → ${province(o.toId).name} (${o.nationId===state.playerNationId?'mouvement':'ordre'})`:o.kind==='diplomacy'?`Diplomatie : ${({
    war:'déclaration de guerre',alliance:'proposition d’alliance',ceasefire:'cessez-le-feu',break:'rupture d’alliance'}
    )[o.action]||o.action} (${nation(o.target).short})`:o.kind==='help'?`Demande d’aide à ${nation(o.to).short}`:o.kind==='construction'?`Construction \
: ${buildingNames[o.type]}`:o.kind==='talk'?`Message ${o.tone==='hostile'?'hostile':o.tone==='amical'?'amical':'neutre'} à ${o.to?nation(o.to).short:'tous'}`:`Production : ${RULES.units[o.type]?.label||o.type}`).join('\n'):'Aucun ordre en attente.';
  actionModal('Terminer le tour',`${count} ordre(s) en attente`,`<p>Les ordres deviennent définitifs pour cette résolution. Les IA verrouillent aussi les leurs.</p><pre class="order-summary">${summary}</pre><button id="confirmEndTurn" class="primary">Verrouiller et résoudre</button>`);
  // V13 : après la résolution — prise de capitale (fenêtre dédiée), journal, puis une fenêtre Oui / Non par proposition reçue.
  $('#confirmEndTurn').onclick=async()=>{ const game=state,same=()=>state===game; $('#actionDialog').close(); const eventStart=state.events.length; nextTurn(state,map);tutorialShown.clear();
    state.tutorial.turn=state.turn;state.tutorial.shown=[];render();playSfx('turn');miniTuto('end-turn');const events=state.events.slice(eventStart);
    if(!isTutorial(state))trackMissions(events); // V14.3 : le tutoriel ne compte pas pour les missions
    // V14.3 : si le joueur quitte (tutoriel → accueil) pendant ces fenêtres, la suite s'arrête : jamais sur une autre partie.
    // V15.2 : animation entre les tours, jamais dans un tutoriel (ses bulles suivent les gestes du joueur).
    if(!isTutorial(state)&&miniStep===null&&tutoStep===null){await playTurnAnimation(events);if(!same())return;}
    await showCapitalPopups(events);if(!same())return;
    await showSeaPopups(events);if(!same())return;
    if(state.gameOver){playSfx(endSound(state.gameOver,state.playerNationId));showEndScreen();return;}
    await showCoalitionPopups(events);if(!same())return;
    renderJournal(false);await dialogClosed($('#journalDialog'));if(!same())return;
    await showProposalPopups(); };
}
