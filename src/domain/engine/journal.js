// Moteur — journal : quels événements le joueur connaît, et leur récit.

import { helpJournalText } from '../alliances.js';
import { fortReductionPct } from '../combat.js';
import { RULES } from '../constants.js';
import { ARCHETYPE_LABELS, HOSTILITY_WAR } from '../leaders.js';
import { visibleProvinces } from '../vision.js';
import { deName, nationName, provinceDef, safeNum } from './shared.js';

/** Accords du journal (campagne V16, bug n° 2) : « 1 unité », « 3 unités ». */
const plural = (n, many = 's', one = '') => safeNum(n) > 1 ? many : one;
const units = n => `${safeNum(n)} unité${plural(n)}`;

export function eventKnownToPlayer(state, map, event) {
  const player = state.playerNationId;
  if ([event.attacker,event.defender,event.nationId,event.target,event.newOwnerId,...(event.originIds||[]),...(event.guests||[])].includes(player)) return true;
  // V10 : tout affrontement (pris ou tenu), pillage de capitale et élimination sont publics ; le détail des pertes
  // n'est donné qu'aux nations impliquées (voir journalEntry).
  if (['difficulty-gold', 'bombardment', 'conquest', 'battle', 'field-battle', 'capital-plunder', 'elimination', 'interception', 'game-over', 'talk', 'betrayal', 'reveal', 'alliance-broken', 'final-turns', 'auto-war', 'hostility-war', 'coalition-formed', 'coalition-joined', 'coalition-left', 'coalition-dissolved'].includes(event.type)) return true;
  if (event.type === 'hostility-warning') return false; // V14.2 : avertissement privé (le joueur concerné est traité plus haut)
  // V11 : un franchissement de seuil de tension n'est connu que s'il concerne le joueur (traité plus haut).
  if (event.type === 'tension') return false;
  if ((event.attackers || []).includes(player)) return true;
  if (event.provinceId && state.provinces[event.provinceId]?.ownerId === player) return true;
  if (!event.provinceId) return event.type === 'diplomatic-action' && [event.nationId,event.target].includes(player);
  // V13 : la règle « ballon » est remplacée par la vision (province visible du joueur ou de ses alliés).
  return visibleProvinces(state, map, player).has(event.provinceId);
}
/** Le joueur est-il partie prenante de l'événement (attaquant, défenseur, cible…) ? */
export function eventInvolvesNation(event, nationId) {
  if (!nationId) return false;
  return [event.attacker,event.defender,event.nationId,event.target,event.newOwnerId,...(event.attackers||[]),...(event.guests||[])].includes(nationId);
}
// `balloon` : seulement pour relire les événements d'anciennes parties (le ballon est supprimé en V13).
const LABELS_LOSS = { infantry:'fantassins', cavalry:'cavaliers', armor:'blindés', artillery:'artilleurs', balloon:'ballons', warship:'navires' };
const LABELS_ONE = { infantry:'fantassin', cavalry:'cavalier', armor:'blindé', artillery:'artilleur', balloon:'ballon', warship:'navire' };
const lossText = byType => { const parts = Object.entries(byType || {}).filter(([,n]) => n > 0).map(([k,n]) => `${n} ${(n === 1 ? LABELS_ONE[k] : LABELS_LOSS[k]) || k}`); return parts.length ? parts.join(', ') : 'aucune'; };
/**
 * Entrée de journal d'un événement. `playerNationId` = nation qui lit le journal.
 * Affrontements (V10) : texte public « Affrontement à X entre A et B — province prise / tenue » ; le détail des
 * pertes n'est ajouté que si la nation qui lit est impliquée (champ `details`).
 */
export function journalEntry(event, map, playerNationId = null) {
  const def = event.provinceId ? provinceDef(map, event.provinceId)?.name : null;
  const where = def || 'lieu inconnu';
  const involved = playerNationId === null || eventInvolvesNation(event, playerNationId);
  const sides = event => { const atk = [...new Set(event.attackers?.length ? event.attackers : [event.attacker])].map(id => nationName(map,id)); return `${atk.join(' et ')} et ${nationName(map,event.defender)}`; };
  const lossDetails = () => {
    if (!involved) return '';
    if (event.lossesByNation) {
      let t = ' Pertes : ' + Object.entries(event.lossesByNation).map(([id, l]) => `${nationName(map,id)} ${lossText(l)}`).join(' ; ') + '.';
      // V13.3 : forces engagées, PV perdus (les blindés et l'artillerie encaissent beaucoup avant de mourir), forteresse.
      if (event.engagedByNation) t += ' Forces engagées : ' + Object.entries(event.engagedByNation).map(([id, u]) => `${nationName(map,id)} ${lossText(u)}`).join(' ; ') + '.';
      const mods = [event.fortLevel > 0 ? `forteresse niveau ${event.fortLevel} : −${safeNum(event.fortPct ?? fortReductionPct(event.fortLevel))} % de dégâts reçus par le défenseur${event.fortBreach > 0 ? ` (bombardée : protection ${100 - safeNum(event.fortBreach)} %)` : ''}` : '',
        event.guests?.length ? `renforts alliés en défense : ${event.guests.map(id => nationName(map, id)).join(', ')}` : '',
        event.naval ? `débarquement : assaillant à ${Math.round((event.landingPct ?? 70))} %` : ''].filter(Boolean);
      // V14.2 (Jack) : un saut de ligne sépare le récap du début des pertes totales avec blessés.
      if (event.hpLostByNation) t += '\nPV perdus, blessés compris : ' + Object.entries(event.hpLostByNation).map(([id, hp]) => `${nationName(map,id)} ${safeNum(hp)}`).join(' ; ') + (mods.length ? ` (${mods.join(' ; ')})` : '') + '.';
      return t;
    }
    return ` Pertes : attaquant ${safeNum(event.attackerLosses)}, défenseur ${safeNum(event.defenderLosses)}.`;
  };
  const how = event.naval ? ' (débarquement)' : '';
  switch (event.type) {
    case 'battle': {
      const mine = involved && playerNationId !== null;
      // V13.3 (Jack) : être attaqué doit sauter aux yeux.
      if (event.defender === playerNationId && playerNationId !== null) return { priority:4, type:'⚠ ON VOUS ATTAQUE', category:'under-attack', public:true,
        text:`${where} attaquée par ${[...new Set(event.attackers?.length ? event.attackers : [event.attacker])].map(id => nationName(map,id)).join(' et ')}${how} : vous tenez la province.${lossDetails()}` };
      return { priority:3, type: mine ? (event.naval ? 'DÉBARQUEMENT' : 'COMBAT') : 'AFFRONTEMENT', category: mine ? 'combat' : 'foreign-conflict', public:true,
        text:`Affrontement à ${where} entre ${sides(event)}${how} : ${nationName(map,event.defender)} tient la province.${lossDetails()}` };
    }
    case 'conquest': {
      const winner = event.newOwnerId || event.attacker, defender = event.defender;
      const type = winner===playerNationId?'CONQUÊTE':defender===playerNationId?'⚠ TERRITOIRE PERDU':'CONFLIT ÉTRANGER';
      return { priority:4, type, category:type==='CONQUÊTE'?'conquest':type==='⚠ TERRITOIRE PERDU'?'under-attack':'foreign-conflict', public:true,
        text:`Affrontement à ${where} entre ${sides(event)}${how} : ${nationName(map,winner)} prend la province.${lossDetails()}` };
    }
    case 'capital-plunder': return { priority:4, type:'PILLAGE', category: event.attacker===playerNationId?'conquest':event.defender===playerNationId?'lost':'foreign-conflict', public:true,
      text: event.loot > 0 && !(event.fromTreasury > 0)
        ? `Capitale prise : ${nationName(map,event.attacker)} s’empare de ${where} et pille ${safeNum(event.amount)} or de butin (trésor ${deName(nationName(map,event.defender))} vide : minimum garanti).`
        : event.loot > 0
        ? `Capitale prise : ${nationName(map,event.attacker)} s’empare de ${where} et pille ${safeNum(event.amount)} or (minimum garanti : ${safeNum(event.fromTreasury)} or du trésor ${deName(nationName(map,event.defender))}, ${safeNum(event.loot)} or de butin).`
        : `Capitale prise : ${nationName(map,event.attacker)} s’empare de ${where} et pille ${safeNum(event.amount)} or du trésor ${deName(nationName(map,event.defender))} (${Math.round((event.rate ?? RULES.capitalPlunderRate)*100)} %).` };
    case 'elimination': return { priority:4, type:'ÉLIMINATION', category: event.nationId===playerNationId?'lost':'foreign-conflict', public:true, text:`${nationName(map,event.nationId)} n’a plus aucune province : la nation est éliminée.` };
    case 'field-battle': return { priority:3, type: involved && playerNationId !== null ? 'COMBAT' : 'AFFRONTEMENT', category: involved && playerNationId !== null ? 'combat' : 'foreign-conflict', public:true,
      text:`Affrontement en rase campagne entre ${nationName(map,event.attacker)} et ${nationName(map,event.defender)}, entre ${provinceDef(map,event.fromId)?.name || '?'} et ${where} : les deux armées se sont croisées.${lossDetails()}` };
    case 'interception': {
      const mine = involved && playerNationId !== null;
      const route = `${provinceDef(map,event.fromId)?.name || '?'} → ${provinceDef(map,event.toId)?.name || '?'}`;
      const how = event.kind === 'port' ? `par la flotte du port de ${where}` : 'en pleine mer';
      const outcome = event.convoyDestroyed ? 'le convoi est coulé' : event.escorted ? 'l’escorte a protégé le convoi' : 'le convoi poursuit sa route avec des pertes';
      if (event.strike) return { priority:3, type:'INTERCEPTION', category: !mine ? 'foreign-conflict' : 'combat', public:true,
        text:`Bataille navale devant le port de ${where} : la flotte ${deName(nationName(map,event.defender))} attaque la base navale ${deName(nationName(map,
          event.attacker))} ; ${event.convoyDestroyed ? 'la flotte d’attaque est coulée' : event.attackerLeft > 0 ? 'les deux flottes survivent, l’assaillant rentre au port' : 'la flotte du port est détruite'}.${lossDetails()}` }
          ;
      return { priority:3, type:'INTERCEPTION', category: !mine ? 'foreign-conflict' : event.target===playerNationId ? (event.convoyDestroyed ? 'lost' : 'combat') : 'combat', public:true,
        text:`Interception ${how} : ${nationName(map,event.attacker)} attaque un convoi de ${nationName(map,event.defender)} (${route}) ; ${outcome}.${lossDetails()}` };
    }
    // V14.4 : bombardement d'une forteresse côtière.
    case 'bombardment': {
      const A = nationName(map, event.attacker), D = nationName(map, event.defender), from = provinceDef(map, event.fromId)?.name || '?';
      const ships = `${safeNum(event.warships)} navire${event.warships > 1 ? 's' : ''}`;
      const harbor = event.harbor ? ` Bataille devant le port : ${safeNum(event.harbor.attackerLost)} navire${event.harbor.attackerLost > 1 ? 's' : ''} perdu${event.harbor.attackerLost > 1 ? 's' : ''} par ${A}, ${safeNum(event.harbor.defenderLost)} par ${D}.` : '';
      const fort = event.fortLevel > 0 ? ` Forteresse niveau ${event.fortLevel} : protection ${safeNum(event.protectionLeft)} % (−${safeNum(event.fortPct)} % de dégâts reçus au lieu de −${safeNum(event.fortFullPct)} %), pour ce tour ; elle se répare si le bombardement cesse.` : '';
      const garrison = event.warshipsLeft > 0 ? ` Garnison : ${safeNum(event.garrisonHp)} PV perdus (blessés).` : ' La flotte d’attaque est coulée avant d’avoir pu tirer.';
      const mine = event.attacker === playerNationId, theirs = event.defender === playerNationId;
      return { priority: theirs ? 4 : 3, type: theirs ? '⚠ BOMBARDEMENT' : 'BOMBARDEMENT', category: theirs ? 'under-attack' : mine ? 'combat' : 'foreign-conflict', public:true,
        text:`${A} bombarde ${where} depuis ${from} (${ships}).${harbor}${fort}${garrison}` };
    }
    case 'convoy-departed': return { priority:1, type:'MARINE', category:'neutral', text: event.returning
      ? `L’escorte repart de ${provinceDef(map,event.fromId)?.name || '?'} (pas de port pour mouiller) vers ${provinceDef(map,event.toId)?.name || '?'} : ${safeNum(event.turns)} tours en mer.`
      : `Convoi embarqué à ${provinceDef(map,event.fromId)?.name || '?'} vers ${provinceDef(map,event.toId)?.name || '?'} : ${safeNum(event.turns)} tours en mer${event.escort ? `, escorté par ${event.escort} navire${event.escort > 1 ? 's' : ''}` : ', sans escorte'}.` };
    case 'convoy-arrived': if (event.passage) return { priority:2, type:'PASSAGE', category:'help', text: event.target === playerNationId && playerNationId !== null
        ? `🤝 Un convoi de ${nationName(map,event.nationId)} (allié) arrive à ${where} : ${units(event.amount)} y stationne${plural(event.amount,'nt')} et la défendr${plural(event.amount,'ont','a')} avec vous.`
        : `🤝 Convoi arrivé chez ${nationName(map,event.target)} (allié) à ${where} : ${units(event.amount)} y stationne${plural(event.amount,'nt')} et la défendr${plural(event.amount,'ont','a')}.` };
      return { priority:2, type:'DÉBARQUEMENT', category:'neutral', text:`${event.returning ? 'Retour au port' : 'Convoi arrivé'} à ${where} : ${units(event.amount)} débarquée${plural(event.amount)} en renfort.` };
    case 'convoy-returning': return { priority:2, type:'MARINE', category:'neutral', text: event.reason === 'repelled'
      ? `Débarquement repoussé à ${where} : ${safeNum(event.amount)} survivants rembarquent et rentrent à ${provinceDef(map,event.toId)?.name || 'leur port'} (${safeNum(event.turns)} tours).`
      : event.reason === 'strike' ? `Après l’attaque du port de ${where}, la flotte rentre à ${provinceDef(map,event.toId)?.name || 'son port'} (${safeNum(event.turns)} tours).`
      : event.reason === 'ally' ? `Le convoi rentre à ${provinceDef(map,event.toId)?.name || 'son port'} (${safeNum(event.turns)} tours).`
      : `Plus de troupes à débarquer devant ${where} : les navires font demi-tour vers ${provinceDef(map,event.toId)?.name || 'leur port'}.` };
    // V11 : personnalités, échanges publics, tension.
    case 'talk': return { priority: event.target === playerNationId ? 3 : 1, type:'ÉCHANGE', category:'talk', public:true, tone: event.tone,
      text:`${nationName(map,event.nationId)} → ${event.target ? (event.target === playerNationId ? 'vous' : nationName(map,event.target)) : 'à tous'} : « ${event.text || '…'} »` };
    case 'betrayal': if (event.truce) return { priority:5, type:'TRAHISON', category:'betrayal', public:true,
      text:`Trahison : ${nationName(map,
        event.nationId)} rompt la trêve signée ${event.truceTurns > 0 ? `il y a ${safeNum(event.truceTurns)} tour${event.truceTurns > 1 ? 's' : ''}` : 'ce tour-ci'} et attaque ${event.target === playerNationId ? 'votre nation' : nationName(map,
        event.target)}. Tout Arken le saura.` };
      return { priority:5, type:'TRAHISON', category:'betrayal', public:true,
      text:`Trahison : ${nationName(map,event.nationId)} attaque ${event.target === playerNationId ? 'votre nation, son alliée' : `${nationName(map,event.target)}, son allié`}. L’alliance est rompue.` };
    // V14.1 : guerre automatique (des troupes ont combattu en défendant un allié).
    case 'auto-war': {
      const X = nationName(map, event.target), G = nationName(map, event.nationId), host = event.host ? nationName(map, event.host) : null;
      const at = def ? ` à ${def}${host && event.host !== event.nationId ? ` (en défendant ${event.host === playerNationId ? 'votre province' : host})` : ''}` : '';
      if (event.nationId === playerNationId && playerNationId !== null) return { priority:4, type:'GUERRE', category:'combat', public:true,
        text:`⚔ Vos troupes ont combattu ${X} : vous êtes désormais en guerre avec ${X}.${at ? ` Combat${at}.` : ''}${event.brokeTruce ? ` La trêve avec ${X} est rompue, sans trahison : vous vous défendiez.` : ''}` };
      if (event.target === playerNationId && playerNationId !== null) return { priority:4, type:'GUERRE', category:'combat', public:true,
        text:`⚔ Les troupes ${deName(G)} ont combattu les vôtres${at} : ${G} est désormais en guerre avec vous.${event.brokeTruce ? ` La trêve est rompue, sans trahison de sa part : ${G} se défendait.` : ''}` };
      return { priority:3, type:'GUERRE', category:'foreign-conflict', public:true,
        text:`⚔ Les troupes ${deName(G)} ont combattu ${X}${at} : ${G} est désormais en guerre avec ${X}.${event.brokeTruce ? ' Leur trêve est rompue, sans trahison.' : ''}` };
    }
    // V14.2 : hostilité — avertissement à 70 %, guerre déclarée automatiquement à 85 %.
    case 'hostility-warning': {
      const other = event.nationId === playerNationId ? event.target : event.target === playerNationId ? event.nationId : null;
      if (!other) return null;
      return { priority:4, type:'⚠ HOSTILITÉ', category:'under-attack', public:false,
        text:`Tension avec ${nationName(map,other)} : ${safeNum(event.value)} %. Attention : dès ${HOSTILITY_WAR} % (à partir du prochain tour), la guerre sera déclarée automatiquement. Un message amical, une alliance ou une trêve fait baisser la tension.` };
    }
    case 'hostility-war': {
      const A = nationName(map, event.nationId), B = nationName(map, event.target);
      const other = event.nationId === playerNationId ? B : event.target === playerNationId ? A : null;
      if (other) return { priority:5, type:'⚔ GUERRE DÉCLARÉE', category:'under-attack', public:true,
        text:`L’hostilité avec ${other} a atteint ${safeNum(event.value)} % (seuil : ${HOSTILITY_WAR} %) : la guerre est déclarée entre vous et ${other}. Vos troupes peuvent désormais l’attaquer, et les siennes vous attaquer.` };
      return { priority:3, type:'GUERRE', category:'foreign-conflict', public:true,
        text:`L’hostilité entre ${A} et ${B} a atteint ${safeNum(event.value)} % : les deux nations sont désormais en guerre.` };
    }
    case 'reveal': return { priority:4, type:'RÉVÉLATION', category:'reveal', public:true,
      text:`${nationName(map,event.nationId)} se révèle : ${ARCHETYPE_LABELS[event.archetype] || 'un dirigeant'}${({ betrayal:' — il a trahi son allié',
        conquest:' — ses conquêtes ne laissent aucun doute', defense:' — il prend les armes pour défendre les nations attaquées', builder:' — il bâtit et ne cherche pas la guerre' }
        )[event.revealedBy || event.reason] || ''}.` };
    case 'tension': {
      // V14.2 (relecture) : le passage à « au bord de la guerre » est annoncé par l'avertissement d'hostilité (plus clair).
      if (event.rising && event.label === 'au bord de la guerre') return null;
      const other = event.nationId === playerNationId ? event.target : event.nationId;
      return { priority: event.label === 'au bord de la guerre' ? 3 : 2, type:'TENSION', category:'tension',
        text: event.rising ? `Tension avec ${nationName(map,other)} : ${event.label} (${safeNum(event.value)} %).` : `La tension retombe avec ${nationName(map,other)} : ${event.label} (${safeNum(event.value)} %).` };
    }
    // V13 : alliances (rupture, demandes d'aide).
    case 'alliance-broken': return { priority:4, type:'DIPLOMATIE', category:'blue', public:true,
      text:`${nationName(map,event.nationId)} rompt son alliance avec ${event.target === playerNationId ? 'vous' : nationName(map,event.target)}.` };
    case 'help-answer': case 'help-broken': case 'help-ended': return { priority: event.type === 'help-ended' ? 2 : 4, type:'AIDE',
      category: event.type === 'help-broken' || (event.type === 'help-answer' && !event.accepted) ? 'help-refused' : 'help', text: helpJournalText(event, map, playerNationId) };
    // V15.1 : coalition, publique. Le journal dit la règle, jamais quoi faire.
    case 'coalition-formed': {
      const members = (event.members || []).map(id => nationName(map, id)).join(', '), mine = event.nationId === playerNationId && playerNationId !== null;
      return { priority:5, type:'COALITION', category: mine ? 'under-attack' : 'foreign-conflict', public:true,
        text: `${mine ? 'Vous tenez' : `${nationName(map,event.nationId)} tient`} ${safeNum(event.provinces)} provinces, nettement plus que ${mine ? 'les autres' : 'toute autre nation'} : ${members} se ${(event.members || []).length > 1 ? 'liguent' : 'dresse'} contre ${mine ? 'vous' : nationName(map,event.nationId)}. La coalition se dissoudra à ${RULES.coalition.dissolveProvinces} provinces ou moins.` };
    }
    case 'coalition-joined': return { priority:4, type:'COALITION', category:'foreign-conflict', public:true, text:`${nationName(map,event.nationId)} rejoint la coalition contre ${event.target === playerNationId ? 'vous' : nationName(map,event.target)}.` };
    case 'coalition-left': return { priority:3, type:'COALITION', category:'foreign-conflict', public:true, text:`${nationName(map,event.nationId)} quitte la coalition contre ${event.target === playerNationId ? 'vous' : nationName(map,event.target)}.` };
    case 'coalition-dissolved': return { priority:5, type:'COALITION', category:'neutral', public:true,
      text: event.reason === 'eliminated' ? `${nationName(map,event.nationId)} a disparu : la coalition n’a plus d’objet.` : event.reason === 'deserted' ? `Plus personne ne fait front contre ${event.nationId === playerNationId ? 'vous' : nationName(map,event.nationId)} : la coalition est dissoute. Les guerres déjà ouvertes continuent.` : `${event.nationId === playerNationId ? 'Vous ne tenez' : `${nationName(map,event.nationId)} ne tient`} plus que ${safeNum(event.provinces)} provinces : la coalition est dissoute. Les guerres déjà ouvertes continuent.` };
    case 'game-over': return { priority:5, type:'FIN DE PARTIE', category: event.winnerId===playerNationId?'conquest':'foreign-conflict', public:true,
      text: event.reason==='capitals' ? `${nationName(map,event.winnerId)} tient les cinq capitales : victoire !` : event.reason==='player-eliminated' ? `Votre nation est éliminée. ${nationName(map,
        event.winnerId)} mène le classement.` : `Fin de la partie au tour ${safeNum(event.turn)} : ${nationName(map,event.winnerId)} termine en tête du classement.` };
    case 'attack-cancelled': if (event.reason === 'passage-lost') return { priority:2, type:'ORDRE ANNULÉ', category:'neutral', text:`Passage vers ${where} annulé : l’alliance a été rompue. Vos troupes ne bougent pas${event.naval ? ' et le convoi rentre au port' : ''}.` };
      if (event.reason === 'ally-land') return { priority:2, type:'ORDRE ANNULÉ', category:'neutral', text:`Attaque vers ${where} annulée : pas de guerre entre alliés.` };
      if (event.reason === 'ceasefire') return { priority:2, type:'ORDRE ANNULÉ', category:'neutral', text:`Débarquement à ${where} annulé : un cessez-le-feu a été conclu pendant la traversée. Le convoi rentre à ${provinceDef(map,event.fromId)?.name || 'son port'}.` };
      if (event.reason === 'ally') return { priority:2, type:'ORDRE ANNULÉ', category:'neutral', text:`Débarquement à ${where} annulé : la province appartient à un allié. Le convoi rentre à ${provinceDef(map,event.fromId)?.name || 'son port'}.` };
      return { priority:2, type:'ORDRE ANNULÉ', category:'neutral',
        text: event.reason === 'target-changed' ? `Attaque vers ${where} annulée : la province a changé de main avant l’arrivée des troupes, qui rentrent à ${provinceDef(map,
        event.fromId)?.name || 'leur base'}.` : `Attaque vers ${where} annulée : la province de départ ${provinceDef(map,event.fromId)?.name || ''} est tombée avant le départ des troupes.` };
    case 'production-lost': return { priority:2, type:'production', category:'lost', text:`Production perdue à ${where} (province prise) : ${RULES.units[event.productionType]?.label || ({
      bank:'banque',factory:'usine',fort:'forteresse',port:'port'})[event.productionType] || 'commande'} annulée, ${safeNum(event.refund)} or remboursés.` };
    case 'income': {
      const parts = [`${safeNum(event.provinces)} province${event.provinces > 1 ? 's' : ''} × ${RULES.baseIncome}`];
      if (event.banks) parts.push(`${safeNum(event.banks)} banque${event.banks > 1 ? 's' : ''} × ${RULES.bankIncome}`);
      if (event.factories) parts.push(`${safeNum(event.factories)} usine${event.factories > 1 ? 's' : ''} × ${RULES.factoryIncome}`);
      if (event.ports) parts.push(`${safeNum(event.ports)} port${event.ports > 1 ? 's' : ''} × ${RULES.portIncome}`);
      if (event.bonus) parts.push(`${event.nationBonus ? 'bonus' : 'atout'} +${safeNum(event.bonus)}`);
      return { priority:0, type:'REVENUS', category:'treasure', text:`💰 Revenus du tour : +${safeNum(event.amount)} or (${parts.join(' · ')}).` };
    }
    case 'retreat-lost': if (event.naval) return { priority:2, type:'MARINE', category:'lost', text:`Des navires n’ont plus de port où rentrer (${where} perdue) : ${units(event.amount)} perdue${plural(event.amount)} en mer.` };
      return { priority:2, type:'COMBAT', category:'lost', text:`Les survivants d’une attaque n’ont pas pu se replier (province de départ perdue) : ${units(event.amount)} perdue${plural(event.amount)}.` };
    case 'ceasefire-offer': if (event.custom) { const who = nationName(map, event.target), by = nationName(map, event.nationId);
        if (!event.accepted) return { priority:2, type:'DIPLOMATIE', category:'blue', text:`${who} refuse le cessez-le-feu proposé par ${by} ; aucun or n’a changé de mains.` };
        return { priority:2, type:'DIPLOMATIE', category:'blue', text: event.demand > 0 ? `Cessez-le-feu : ${who} accepte vos conditions et verse ${safeNum(event.demand)} or à ${by}.`.replace('vos conditions', event.nationId === playerNationId ? 'vos conditions' : 'les conditions')
          : event.received > 0 ? `Cessez-le-feu accepté par ${who}, qui verse ${safeNum(event.received)} or à ${by} comme promis.`
          : event.amount > 0 ? `Cessez-le-feu accepté par ${who} contre ${safeNum(event.amount)} or, versés par ${by}.` : `Cessez-le-feu sans paiement accepté par ${who}.` }; }
      return {priority:2,type:'DIPLOMATIE',category:'blue',text:event.accepted?`Cessez-le-feu accepté par ${nationName(map,event.target)} contre ${safeNum(event.amount)} or, versés à ${nationName(map,
        event.target)}.`:`Cessez-le-feu refusé par ${nationName(map,event.target)} ; aucun paiement n’a été débité.`};
    case 'final-turns': return { priority:2, type:'FIN DE PARTIE', category:'endgame', text:`⏳ Plus que ${safeNum(event.remaining)} tours avant la fin de la partie (tour ${safeNum(event.length)||RULES.gameLength}). Classement : provinces, puis capitales, puis trésor.` };
    case 'war-chest': return { priority:2,type:'économie',category:'neutral',text:`Trésor de guerre reçu après la prise de ${where} : +${safeNum(event.amount)}.` };
    case 'diplomacy': return { priority:2,type:'diplomatie',category:'blue',text:event.relation==='war'?(event.reason==='combat'?`${nationName(map,event.nationId)} attaque ${nationName(map,
      event.target)} : les deux nations sont désormais en guerre.`:`${nationName(map,event.nationId)} et ${nationName(map,
      event.target)} sont désormais en guerre.`):`Relation modifiée entre ${nationName(map,event.nationId)} et ${nationName(map,event.target)}.` };
    case 'diplomatic-action': if (event.proposal && event.superseded) return null;
      if (event.proposal) return { priority:3, type:'DIPLOMATIE', category:'blue', text:`${nationName(map,
        event.nationId)} ${event.target===playerNationId?'vous ':''}propose ${event.action==='alliance'?'une alliance':'un cessez-le-feu'}${event.target===playerNationId?' : répondez Oui ou Non dans la fenêtre qui suit ce journal.':` à ${nationName(map,
        event.target)}.`}` };
      if (event.viaTalk) return { priority:3, type:'DIPLOMATIE', category:'blue',
        text:`${event.action==='alliance'?(event.accepted?'Alliance conclue':'Alliance refusée'):(event.accepted?'Cessez-le-feu conclu':'Cessez-le-feu refusé')} entre ${nationName(map,
        event.nationId)} et ${nationName(map,event.target)}${event.accepted&&event.amount>0?` : ${nationName(map,event.target)} verse ${safeNum(event.amount)} or`:''}.` };
      if (event.action==='alliance' && event.accepted!==undefined) return { priority:2, type:'DIPLOMATIE', category:'blue', text: event.accepted ? `Alliance conclue entre ${nationName(map,
        event.nationId)} et ${nationName(map,event.target)}.` : `${nationName(map,event.target)} refuse l’alliance proposée par ${nationName(map,event.nationId)}.` };
      return { priority:2,type:'DIPLOMATIE',category:'blue',text:event.action==='tribute'?`Ancien transfert diplomatique V4 de ${safeNum(event.amount)} or effectué au profit de ${nationName(map,
        event.target)}.`:`${({war:'Déclaration de guerre',alliance:'Proposition d’alliance',ceasefire:'Proposition de cessez-le-feu'}
        )[event.action] || 'Action diplomatique'} résolue avec ${nationName(map,event.target)}.` };
    case 'difficulty-gold': return { priority:0, type:'NIVEAU', category:'neutral', text:`Niveau Difficile : les IA reçoivent +${safeNum(event.pct)} % d’or à chaque tour. Vous, non.` };
    case 'production-complete': return { priority:1,type:'production',category:'neutral',
      text:`${safeNum(event.amount)}${event.bonus ? ` (dont +${safeNum(event.bonus)} grâce ${event.nationBonus ? 'à vos bonus' : 'à l’atout Recrutement'})` : ''} ${RULES.units[event.productionType]?.label || (event.productionType==='bank'?'banque':event.productionType==='factory'?'usine':event.productionType==='fort'?'forteresse':event.productionType==='port'?'port':'élément')} terminé(s) à ${where}.` }
      ;
    case 'project-started': return { priority:1,type:'production',category:'neutral',text:`Projet lancé : ${RULES.units[event.productionType]?.label || ({bank:'banque',factory:'usine',fort:'forteresse',port:'port'})[event.productionType] || 'construction'} à ${where}.` };
    case 'movement': if (event.passage) return { priority:2, type:'PASSAGE', category:'help', text: event.target === playerNationId && playerNationId !== null
        ? `🤝 ${nationName(map,event.nationId)} (allié) envoie ${units(event.amount)} stationner à ${provinceDef(map,event.toId)?.name || 'lieu inconnu'} : elle${plural(event.amount)} défendr${plural(event.amount,'ont','a')} la province avec vous.`
        : `🤝 Passage chez ${nationName(map,event.target)} (allié) : ${units(event.amount)} stationne${plural(event.amount,'nt')} à ${provinceDef(map,event.toId)?.name || 'lieu inconnu'} et la défendr${plural(event.amount,'ont','a')}.` };
      return { priority:1,type:'déplacement',category:'neutral',text:`Mouvement vers ${provinceDef(map,event.toId)?.name || 'lieu inconnu'} effectué.` };
    case 'convoy-rerouted': return { priority:3, type:'MARINE', category:'neutral', text: event.landed
      ? `Plus d’alliance avec ${nationName(map,event.target)} et aucun port ami : le convoi débarque à ${where}, son point de départ, et ${plural(event.amount,'ses','son')} ${units(event.amount)} ${plural(event.amount,'sont rapatriées','est rapatriée')}.`
      : event.toDeparture ? `Plus d’alliance avec ${nationName(map,event.target)} et aucun port ami : le convoi (${units(event.amount)}) revient à ${provinceDef(map,event.toId)?.name || 'son point de départ'}, son point de départ, pour y débarquer (${safeNum(event.turns)} tours).`
      : `Plus d’alliance avec ${nationName(map,event.target)} : le convoi ne peut plus y accoster et rentre au port ami le plus proche, ${provinceDef(map,event.toId)?.name || 'un port ami'} (${units(event.amount)}, ${safeNum(event.turns)} tours).` };
    case 'stationed-recalled': return { priority:3, type:'PASSAGE', category:'neutral', text:`Plus d’alliance avec ${nationName(map,event.target)} : ${units(event.amount)} quitte${plural(event.amount,'nt')} ${where} et rentre${plural(event.amount,'nt')} à ${provinceDef(map,event.toId)?.name || 'leur base'}.` };
    case 'stationed-lost': if (event.eliminated) return { priority:3, type:'PASSAGE', category:'lost', text:`${nationName(map,event.nationId)} est éliminée : ${plural(event.amount,'ses','son')} ${units(event.amount)} stationnée${plural(event.amount)} à ${where} se disperse${plural(event.amount,'nt')}.` };
      return { priority:3, type:'PASSAGE', category:'lost', text:`Plus d’alliance avec ${nationName(map,event.target)} et plus aucune province où rentrer : ${units(event.amount)} perdue${plural(event.amount)} à ${where}.` };
    default: return null;
  }
}
function aggregateEntries(entries) {
  const merged = new Map();
  for (const e of entries) {
    if (e.type === 'production') {
      const key = `${e.category}|${e.text.replace(/^\d+ /,'')}`;
      if (merged.has(key)) { const old=merged.get(key),n=Number(old.text.match(/^\d+/)?.[0]||0)+Number(e.text.match(/^\d+/)?.[0]||0); old.text=old.text.replace(/^\d+/,String(n)); continue; }
      merged.set(key,e);
    } else merged.set(`${e.type}|${e.text}`,e);
  }
  return [...merged.values()];
}
export function buildTurnJournal(state, map, fromIndex = state.lastJournalEventIndex || 0) {
  const priority = new Set(['difficulty-gold','bombardment','hostility-warning','hostility-war','auto-war','convoy-rerouted','stationed-recalled','stationed-lost','final-turns','income','battle','conquest',
    'field-battle','diplomacy','diplomatic-action','ceasefire-offer','war-chest','capital-plunder','elimination','attack-cancelled','production-lost','retreat-lost','interception','convoy-arrived',
    'coalition-formed','coalition-joined','coalition-left','coalition-dissolved','convoy-departed','convoy-returning','game-over','talk','betrayal','reveal','tension','alliance-broken','help-answer','help-broken','help-ended','movement']);
  const entries = aggregateEntries(state.events.slice(fromIndex).filter(e => priority.has(e.type) && (e.type !== 'movement' || e.passage) && eventKnownToPlayer(state,map,e)).map(e => journalEntry(e,map,state.playerNationId)).filter(Boolean)).sort((a,b)=>b.priority-a.priority);
  state.lastJournalEventIndex = state.events.length; state.turnJournal = entries; state.journal = entries;
  return entries;
}
export function buildPermanentJournal(state, map, fromIndex = 0) {
  const entries = aggregateEntries(state.events.slice(fromIndex).filter(e => eventKnownToPlayer(state,map,e)).map(e=>journalEntry(e,map,state.playerNationId)).filter(Boolean));
  state.chronicle.push(...entries); return entries;
}
