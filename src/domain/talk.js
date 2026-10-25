// V11 — échanges publics entre dirigeants (retours bêta V9, points 17 et 18 ; docs/V11-contrat.md).
// Module pur : textes pré-écrits, choix déterministe (graine de la partie), aucun DOM, aucun Math.random.
import { chance, pickFrom, atWar, allied, treatyOf, archetypeOf, getTension, addTension, tensionLevel, leaderHint,
  reputation, recentAggressions, aliveNations, strengthOf, TALK_TENSION, talkTensionDelta, talkTensionWorst, noteTalkEffect, charmOf, tensionCap, HOSTILITY_WAR, HOSTILITY_WARNING } from './leaders.js';
export { tensionLevel, leaderHint } from './leaders.js';
import { MORE_LINES } from './talk-v14-2.js';

export const TONES = Object.freeze(['hostile', 'neutre', 'amical']);
export const TALK_LIMIT = 60;          // fil public : 60 derniers échanges (B8, taille de la sauvegarde)
export const PENDING_LIMIT = 5;        // messages en attente de réponse par nation
export const PENDING_TURNS = 6;        // au-delà, un message sans réponse n'attend plus
export const AI_TALK_PER_TURN = 3;     // au plus 3 messages des dirigeants IA par tour (pas de spam)

// --- Textes pré-écrits : situation -> ton -> variantes. {to} = destinataire, {from} = auteur. -----------------
// V13 : hostile = provocation et humour piquant (jamais d'insulte ni de grossièreté) ; neutre = mesuré ;
// amical = chaleureux. Plusieurs variantes par ton, choisies selon la graine de la partie.
// V13.3 (retours bêta) : au moins neuf variantes par liste et plus aucun commerce (le jeu n'en a pas) ; un dirigeant
// ne reprend pas une réplique de ses RECENT_LINES derniers messages (pickLine). V14.1 : ni une réplique déjà envoyée
// au même tour par un autre dirigeant.
const LINES = {
  war: {
    hostile: ['{to}, vos soldats courent vite. Dommage que ce soit dans le mauvais sens.', 'Gardez vos drapeaux pliés, {to} : vous en aurez besoin pour vous rendre.',
      'Chaque province que vous perdez, {to}, nous la rebaptisons. Nous commençons à manquer de noms.', '{to}, nos tambours couvrent déjà vos discours. Bientôt, ils couvriront vos frontières.',
      'Cette guerre, {to} l’a voulue. Nous allons lui apprendre à mieux choisir ses souhaits.',
      '{to}, vos généraux dessinent de beaux plans. Nos soldats les effacent.', 'Vos forteresses tremblent déjà, {to}. Et nous ne sommes pas encore arrivés.',
      '{to}, vos bannières flottent encore. Profitez-en pour les admirer.', 'Comptez vos provinces ce soir, {to}. Demain, le compte sera plus court.',
      '{to}, vous avez commencé cette guerre. Nous allons la finir.', 'Nos armées connaissent déjà le chemin de votre capitale, {to}.',
      '{to}, vos remparts sont solides. Vos défenseurs, beaucoup moins.', 'Vous vouliez la gloire, {to} ? Elle sera pour nous, la leçon pour vous.',
      '{to}, chaque bataille perdue vide un peu plus votre trésor.', 'Rendez-vous, {to}. Cela épargnera du travail à nos soldats.'],
    neutre: ['La guerre entre nous coûte cher, {to}. Réfléchissez à la suite.', '{to}, nos armées se parlent déjà. Nos dirigeants le peuvent aussi.', 'Nous tenons nos positions, {to}. La suite dépend de vous.',
      '{to}, cette guerre vide nos trésors à tous les deux.', 'Chaque tour de combat nous affaiblit, {to}. Nos rivaux s’en réjouissent.',
      '{to}, nous combattrons tant qu’il le faudra. Pas un tour de plus.', 'Nos soldats tiennent leurs lignes, {to}. Les vôtres aussi. Et maintenant ?',
      '{to}, la guerre a un prix. Dites-nous lequel vous êtes prêts à payer.', 'Le front ne bouge guère, {to}. Il serait temps d’y réfléchir.'],
    amical: ['{to}, assez de sang versé. Parlons d’une trêve.', 'Nos peuples n’ont rien à gagner à cette guerre, {to}. Cherchons la paix.', '{to}, je tends la main malgré la guerre. Saisissez-la.',
      '{to}, nos peuples méritent mieux que ces champs de bataille.', 'Rentrons nos armées, {to}. Il reste assez de place en Arken pour nous deux.',
      '{to}, une trêve honorable vaut mieux qu’une victoire ruineuse.', 'Nous sommes prêts à écouter vos conditions, {to}. Parlons franchement.',
      '{to}, chaque soldat épargné est une victoire pour nos deux nations.', 'Que cette guerre soit la dernière entre nous, {to}.']
  },
  afterAttack: {
    hostile: ['{to} frappe sans prévenir et appelle cela de la stratégie. Nous appelons cela une erreur.', 'Vous avez franchi notre frontière, {to}. Le chemin du retour sera bien plus long.',
      '{to}, vous vouliez notre attention ? Vous l’avez. Tout entière.', 'Belle attaque, {to}. Nous vous rendrons la politesse, avec les intérêts.',
      '{to}, vous avez réveillé une nation qui dormait d’un œil.', 'Une attaque sans prévenir, {to} ? Notre réponse, elle, sera annoncée.',
      '{to}, vos soldats ont trouvé l’entrée. Nous leur montrerons la sortie.', 'Vous avez frappé le premier, {to}. Nous frapperons le dernier.',
      '{to}, cette province n’était pas à prendre. Vous allez l’apprendre à vos dépens.', 'Nos sentinelles ont vu vos armées, {to}. Nos généraux les attendent.',
      '{to}, vous avez ouvert une porte que vous ne saurez pas refermer.', 'Retenez bien ce jour, {to} : c’est celui où vous avez perdu la paix.'],
    neutre: ['{to}, expliquez cette attaque avant qu’elle ne devienne une guerre sans fin.', 'Nous avons noté votre attaque, {to}. Nos prochains gestes en dépendront.', 'Un coup a été porté, {to}. Il peut encore être le dernier.',
      '{to}, une attaque sans raison appelle une explication.', 'Nous comptons nos pertes, {to}. Vous devriez compter les vôtres.',
      '{to}, retirez vos troupes et nous pourrons encore parler.', 'Cette attaque nous a surpris, {to}. Elle ne nous surprendra pas deux fois.',
      '{to}, que cherchiez-vous en franchissant notre frontière ?', 'Nos armées sont en alerte, {to}. Le prochain geste vous appartient.'],
    amical: ['{to}, malgré votre attaque, la paix reste possible.', 'Oublions cet affront, {to}, si vous retirez vos troupes.', '{to}, nous préférons un accord à une revanche.',
      '{to}, une erreur se répare. Retirez vos armées et tout sera oublié.', 'Nous ne voulons pas d’une guerre, {to}. Vous non plus, sans doute.',
      '{to}, rendez-nous cette frontière et la paix reviendra.', 'Un geste de votre part, {to}, et nous rangerons nos épées.',
      '{to}, nous voulons croire à un malentendu. Prouvez-le-nous.', 'La colère est mauvaise conseillère, {to}. Nous choisissons le calme.']
  },
  aggressor: {
    hostile: ['{to}, à force d’avaler des provinces, gare à l’indigestion.', 'Encore une conquête, {to}, et vous aurez réussi l’exploit d’unir tout Arken… contre vous.',
      '{to}, tout Arken compte vos conquêtes. Vos ennemis aussi, et ils sont de plus en plus nombreux.', 'Un appétit d’ogre et des frontières de dentelle, {to} : prudence.',
      '{to}, plus votre empire grandit, plus il a de frontières à garder.', 'Les conquérants finissent toujours seuls, {to}. Vous en prenez le chemin.',
      '{to}, vos voisins tremblent. Nous, nous affûtons nos lames.', 'Chaque province prise, {to}, vous fait un ennemi de plus.',
      '{to}, Arken a vu passer bien des empires trop gourmands. Il les a tous digérés.', 'Vos armées sont partout, {to}. Donc nulle part en nombre.',
      '{to}, vos conquêtes ont réveillé tout Arken. Bon courage.', 'À ce rythme, {to}, vous aurez bientôt plus d’ennemis que de soldats.'],
    neutre: ['{to}, toutes les nations observent vos campagnes.', 'Vos armées avancent vite, {to}. Où comptez-vous vous arrêter ?', '{to}, nous restons à l’écart, pour l’instant.',
      '{to}, Arken tout entier tient le compte de vos conquêtes.', 'Nous gardons nos frontières, {to}. Les vôtres s’allongent beaucoup.',
      '{to}, votre appétit inquiète toutes les cours d’Arken.', 'Nous n’avons pas pris parti, {to}. Ne nous y forcez pas.',
      '{to}, vos campagnes sont rapides. La paix qui suit l’est rarement.', 'Nos forteresses observent vos marches, {to}. Sans rien dire, pour l’instant.'],
    amical: ['{to}, nous n’avons aucun différend avec vous. Gardons-le ainsi.', 'Vos guerres ne nous regardent pas, {to}. Restons en paix.', '{to}, que nos frontières restent calmes quoi qu’il arrive ailleurs.',
      '{to}, quoi que vous fassiez ailleurs, notre frontière restera calme.', 'Nous ne sommes pas vos ennemis, {to}. Ne nous en faites pas.',
      '{to}, gardons entre nous la paix que d’autres n’ont pas su garder.', 'Vos guerres sont les vôtres, {to}. Notre amitié reste offerte.',
      '{to}, nous préférons vous avoir pour voisins que pour adversaires.', 'Que vos armées passent loin de nos terres, {to}, et nous resterons amis.']
  },
  ally: {
    hostile: ['{to}, une alliance se mérite. Vous la méritez de moins en moins.', 'Notre pacte n’est pas un chèque en blanc, {to}.',
      '{to}, un allié qui ne fait rien ressemble beaucoup à un spectateur.', 'Allié {to}, nous cherchons encore vos armées sur le champ de bataille. Elles se cachent bien.',
      '{to}, un pacte se tient avec des armées, pas avec des promesses.', 'Allié {to}, nous avons combattu seuls ce tour-ci. Encore.',
      '{to}, notre patience d’allié a des limites. Vous les approchez.', 'Une alliance à sens unique s’appelle une dette, {to}.',
      '{to}, vos bannières manquent sur nos champs de bataille.', 'Allié {to}, nous commençons à douter de votre parole.',
      '{to}, rappelez-vous qui vous a protégés quand vous en aviez besoin.', 'Notre alliance pèse lourd, {to}. Portez-en votre part.'],
    neutre: ['{to}, notre alliance tient. Tenons-la ensemble.', 'Allié {to}, tenez-nous informés de vos mouvements.', '{to}, nos armées sont prêtes si l’alliance l’exige.',
      '{to}, accordons nos armées avant le prochain tour.', 'Allié {to}, nos frontières communes sont bien gardées.',
      '{to}, l’alliance nous oblige tous les deux. Ne l’oublions pas.', 'Nos éclaireurs veillent pour vous aussi, allié {to}.',
      '{to}, signalez-nous toute menace. Nous ferons de même.', 'Allié {to}, gardons nos forteresses prêtes.'],
    amical: ['{to}, votre amitié est notre meilleure forteresse.', 'Ensemble, {to}, personne n’osera nous défier.', '{to}, notre alliance est solide. Que tout Arken le sache.',
      '{to}, nos bannières flottent côte à côte. Rien ne les séparera.', 'Allié {to}, vos ennemis sont désormais les nôtres.',
      '{to}, cette alliance est notre plus belle victoire.', 'Que tout Arken voie nos armées marcher ensemble, {to}.',
      '{to}, un allié fidèle vaut dix forteresses.', 'Allié {to}, nous tiendrons parole quoi qu’il arrive.']
  },
  ceasefire: {
    hostile: ['{to}, la trêve est fragile. Ne la mettez pas à l’épreuve.', 'Cette trêve ne fait pas de nous des amis, {to}. Juste des ennemis patients.',
      '{to}, profitez du calme : il a une date de péremption.', 'Nos lames se reposent, {to}. Elles ne dorment pas.',
      '{to}, la trêve tient. Nos forges, elles, ne chôment pas.', 'Respirez, {to}. La trêve ne durera pas toujours.',
      '{to}, nous signons des trêves. Nous ne signons pas l’oubli.', 'Une trêve n’est qu’une pause, {to}. Nous comptons les tours.',
      '{to}, gardez vos troupes chez vous. La trêve est notre seul lien.', 'Nos soldats ont posé les armes, {to}. Ils ne les ont pas rendues.',
      '{to}, rompez la trêve et vous découvrirez notre vraie colère.', 'La trêve vous protège, {to}. Ne comptez pas sur notre bonté.'],
    neutre: ['{to}, la trêve tient. Respectons-la.', 'Le calme est revenu entre nous, {to}. Pour combien de temps ?', '{to}, profitons de la trêve pour reconstruire.',
      '{to}, la trêve nous laisse le temps de réparer nos murailles.', 'Tenons nos engagements, {to}. Une trêve n’a de valeur que respectée.',
      '{to}, nos armées restent à distance. Faites de même.', 'La trêve a été signée, {to}. À chacun de l’honorer.',
      '{to}, nous respectons la trêve. Nous attendons la même chose de vous.', 'Le calme règne sur nos frontières, {to}. Gardons-le.'],
    amical: ['{to}, faisons de cette trêve une vraie paix.', 'La trêve nous réussit, {to}. Allons plus loin.', '{to}, la paix vaut mieux que toutes les conquêtes.',
      '{to}, cette trêve pourrait devenir une longue paix.', 'Nos peuples respirent, {to}. Prolongeons ce répit.',
      '{to}, nous ne reprendrons pas les armes les premiers.', 'La trêve nous rapproche, {to}. Continuons sur ce chemin.',
      '{to}, faisons de ce répit une amitié durable.', 'Le silence des armes nous va bien, {to}.']
  },
  neighbor: {
    hostile: ['{to}, vos navires s’approchent trop de nos côtes. Nos canons adorent la compagnie.', 'Nos côtes sont gardées, {to}. Vos rêves d’invasion prendront l’eau.',
      '{to}, la mer qui nous sépare ne vous protégera pas toujours.', 'On dit que vos amiraux confondent bâbord et tribord, {to}. Venez donc vérifier chez nous.',
      '{to}, notre frontière est bien gardée. Ne la mettez pas à l’épreuve.', 'Nos tours de guet vous voient, {to}. Jour et nuit.',
      '{to}, vos patrouilles s’approchent trop. Nos archers s’impatientent.', 'La mer est vaste, {to}. Vos navires y seraient bien seuls.',
      '{to}, nos flottes connaissent chaque récif de ces eaux. Les vôtres, non.', 'Restez de votre côté de la frontière, {to}. L’autre côté est mal fréquenté.',
      '{to}, chaque pas sur nos terres vous coûtera une armée.', 'Nos forteresses regardent vers vous, {to}. Ce n’est pas un hasard.'],
    neutre: ['Bon voisinage, {to}, tant que chacun reste chez soi.', '{to}, nous surveillons nos routes maritimes, comme vous.',
      '{to}, la mer entre nous peut rester calme. Cela dépend de vous.', '{to}, nos frontières se touchent. Nos intérêts aussi.',
      'Nous gardons nos côtes, {to}. Gardez les vôtres.', '{to}, un bon voisin garde ses armées loin de la frontière.',
      'Nos patrouilles croisent les vôtres, {to}. Sans incident, jusqu’ici.', '{to}, chacun ses provinces et la paix sera facile.',
      'Nos navires vous saluent en passant, {to}. Rien de plus.'],
    amical: ['Voisins et amis, {to} ? Nous le souhaitons.', '{to}, nos côtes sont proches : que nos peuples le soient aussi.',
      '{to}, que nos navires se croisent en paix plutôt qu’en guerre.', '{to}, une frontière calme est le plus beau des remparts.',
      'Bons voisins, {to}, nous n’avons nul besoin de murailles entre nous.', '{to}, nos peuples vivent côte à côte. Qu’ils vivent en paix.',
      'Nos sentinelles n’ont rien à craindre de vous, {to}. Gardons-le ainsi.', '{to}, la mer nous relie bien plus qu’elle ne nous sépare.',
      'Voisins depuis toujours, {to}, amis pour longtemps, espérons-le.']
  },
  default: {
    hostile: ['{to}, votre arrogance a de l’avenir. Votre royaume, beaucoup moins.', '{to}, vos ambitions sont immenses. Dommage que vos armées ne le soient pas.',
      'Nous n’avons pas oublié votre arrogance, {to}. Elle vous précède partout.', '{to}, votre heure viendra. Nous avons tout notre temps, vous beaucoup moins.',
      '{to}, ne vous croyez pas à l’abri de notre colère : elle a une excellente mémoire.',
      '{to}, vos ambitions dépassent vos frontières. Et de loin.', 'Nous vous surveillons, {to}. Vous devriez nous surveiller aussi.',
      '{to}, vos discours sont grands. Votre royaume, un peu moins.', 'Rêvez de conquêtes, {to}. Nous, nous les préparons.',
      '{to}, la prudence vous irait bien. Elle vous éviterait des regrets.', 'On parle beaucoup de vous, {to}. Rarement en bien.',
      '{to}, vos forteresses impressionnent vos paysans. Pas nous.', 'Gardez vos menaces pour d’autres, {to}. Nous n’en avons pas peur.',
      '{to}, le trône d’Arken n’est pas taillé pour vous.', 'Votre or ne vous achètera pas de victoires, {to}.'],
    neutre: ['{to}, nous suivons vos choix avec attention.', 'Rien ne nous oppose encore, {to}.', '{to}, que chacun garde ses frontières.',
      '{to}, nos armées restent chez elles. Que les vôtres en fassent autant.', 'Nous n’avons ni querelle ni promesse à vous faire, {to}.',
      '{to}, Arken est grand. Il y a de la place pour chacun.', 'Nous prenons note de votre présence, {to}.',
      '{to}, nos frontières sont tranquilles. Gardons-les ainsi.', 'Nous restons attentifs, {to}, comme toute nation prudente.'],
    amical: ['{to}, recevez le salut de notre peuple.', 'Nous souhaitons de bonnes relations avec {to}.', '{to}, l’amitié entre nos nations serait utile à tous.',
      '{to}, notre peuple vous adresse ses vœux de paix.', '{to}, que nos nations restent en bons termes.',
      'Notre table vous reste ouverte pour parler, {to}.', '{to}, la paix entre nous serait une force pour tous.',
      'Nous saluons votre sagesse, {to}.', '{to}, que l’amitié guide nos prochaines paroles.']
  },
  // Réponse : ton du message reçu -> ton de la réponse.
  reply: {
    hostile: {
      hostile: ['Vos menaces ne nous effraient pas, {to}. Elles nous amusent.', 'Des mots durs, {to} ? Nous avons aussi des armées, et elles parlent moins.',
        '{to}, on aboie beaucoup de votre côté de la mer. On mord rarement.', 'Revenez nous menacer quand vos navires sauront flotter, {to}.',
        'Vos menaces arrivent, {to}. Nos armées partent.', '{to}, nous avons lu votre message. Nos soldats ont bien ri.',
        'Criez plus fort, {to}. Nos tambours couvrent encore votre voix.', '{to}, vos menaces nous rappellent vos défaites. Merci du souvenir.',
        'Nous répondons aux menaces par des actes, {to}. Patientez un peu.', '{to}, des mots pareils se paient sur le champ de bataille.',
        'Votre colère est bruyante, {to}. Votre armée, beaucoup moins.', '{to}, nous gardons votre lettre. Elle fera rire nos petits-enfants.'],
      neutre: ['Nous prenons acte, {to}. Inutile d’élever le ton.', 'Vos paroles sont notées, {to}. Nos actes parleront.', 'Calmez-vous, {to}. Personne n’y gagnerait.',
        '{to}, la colère n’a jamais gagné une guerre.', 'Vos menaces sont notées, {to}. Elles ne changent rien.',
        'Doucement, {to}. Les mots durs ne déplacent pas les frontières.', '{to}, nous préférons les faits aux éclats de voix.',
        'Nous restons sereins, {to}. Faites-en autant.', '{to}, nous avons entendu. Nous n’en dirons pas plus.'],
      amical: ['Nous ne cherchons pas la querelle, {to}. Apaisons les esprits.', 'Pourquoi tant de colère, {to} ? Parlons plutôt.', 'Nous préférons la paix, {to}, même après de tels mots.',
        '{to}, gardons nos épées au fourreau. Les mots suffisent.', 'Nous ne répondrons pas à la colère par la colère, {to}.',
        '{to}, nous vous tendons la main malgré ces mots.', 'Un mot de trop n’est pas une guerre, {to}. Oublions-le.',
        '{to}, la paix reste possible. Nous y tenons.', 'Que la sagesse l’emporte, {to}. Nous restons vos voisins.']
    },
    neutre: {
      hostile: ['Votre prudence ne vous sauvera pas, {to}.', 'Gardez vos conseils, {to}. Nous gardons nos épées.', 'Tant de mesure, {to}… On dirait presque de la peur.',
        'Vos réserves ne nous impressionnent pas, {to}.', '{to}, la mesure est la vertu de ceux qui ont peur.',
        'Pesez vos mots tant que vous le pouvez, {to}.', '{to}, votre calme cache mal votre inquiétude.',
        'Restez prudents, {to}. Vous en aurez besoin.', '{to}, nous préférons les nations qui choisissent leur camp.'],
      neutre: ['Entendu, {to}.', 'Message reçu, {to}. Nous verrons.', 'Soit, {to}. Chacun chez soi.',
        'Bien noté, {to}.', '{to}, nous en prenons acte.', 'Compris, {to}. Rien ne change pour nous.',
        '{to}, nous restons sur nos positions.', 'Entendu. Chacun garde ses frontières, {to}.', '{to}, nous y réfléchirons.'],
      amical: ['Merci de ces mots mesurés, {to}. Gardons ce ton.', 'Volontiers, {to}. Le dialogue nous convient.', 'Sage parole, {to}. Nous la partageons.',
        '{to}, votre mesure vous honore.', 'Merci, {to}. Parlons plus souvent.', '{to}, la raison nous rapproche.',
        'Nous apprécions votre franchise, {to}.', '{to}, ce dialogue nous plaît. Poursuivons-le.', 'Bien parlé, {to}. Nous restons à votre écoute.']
    },
    amical: {
      hostile: ['Vos sourires ne nous trompent pas, {to}.', 'Des mots doux, {to} ? Nous jugerons sur les actes.', 'Tant de miel, {to}, cache souvent un dard.',
        '{to}, la flatterie ne remplace pas une armée.', 'Belles paroles, {to}. Nos espions disent autre chose.',
        '{to}, vos sourires sont aussi larges que vos ambitions.', 'Gardez votre miel, {to}. Nous préférons la vérité.',
        '{to}, l’amitié ne se décrète pas. Elle se prouve.', 'Vos douceurs ne nous endorment pas, {to}.'],
      neutre: ['Nous verrons ce que valent ces paroles, {to}.', 'Belles paroles, {to}. Attendons les actes.', 'Bien reçu, {to}. Nous restons prudents.',
        '{to}, merci. Nous attendrons de voir.', 'Paroles aimables, {to}. Les actes suivront-ils ?',
        '{to}, nous prenons note de votre bienveillance.', 'Nous restons sur nos gardes, {to}, mais nous écoutons.',
        '{to}, l’avenir dira ce que valent ces mots.', 'Merci de ce message, {to}. La prudence reste de mise.'],
      amical: ['Avec plaisir, {to}. Notre amitié vous est acquise.', 'Nous partageons ce souhait, {to}.', 'Que cette entente dure, {to}.',
        '{to}, votre amitié nous honore.', 'Nos peuples s’en réjouiront, {to}.', '{to}, nous vous rendons ce salut de bon cœur.',
        'Que la paix règne entre nous, {to}.', '{to}, merci. Notre porte vous reste ouverte.', 'Voilà de belles paroles, {to}. Nous les partageons.']
    }
  }
};
// V13 : voix propre à chaque personnalité (réponses et paroles des dirigeants IA), du plus hostile au plus amical.
export const ARCHETYPE_LINES = Object.freeze({
  conquerant: {
    hostile: ['{to}, Arken n’aura qu’un seul maître, et ce ne sera pas vous.', 'Vos terres ont un bel avenir, {to}. Sous notre drapeau.',
      '{to}, nous admirons votre courage. Nous admirerons davantage votre reddition.', 'Préparez les clés de vos villes, {to}. Nous viendrons les chercher nous-mêmes.',
      '{to}, vos provinces nous iront à merveille.', 'Nos armées ont faim, {to}. Vos terres sont au menu.',
      '{to}, nous ne demandons pas. Nous prenons.', 'Inclinez-vous, {to}. C’est moins douloureux que de tomber.',
      '{to}, votre trône est confortable ? Profitez-en.', 'Nous avons déjà choisi le nom de votre future province, {to}.',
      '{to}, la question n’est pas « si ». C’est « quand ».', 'Vos murailles nous amusent, {to}. Nos béliers, encore plus.'],
    neutre: ['{to}, la force décide de tout. Nous verrons qui en a le plus.', 'Nous prenons note, {to}. Et nous comptons vos soldats.', '{to}, restez à votre place et nous resterons à la nôtre… pour l’instant.',
      '{to}, nous respectons la force. Montrez-nous la vôtre.', 'Vos paroles nous indiffèrent, {to}. Vos armées, un peu moins.',
      '{to}, nous choisirons notre prochaine cible. Ce ne sera peut-être pas vous.', 'Nous verrons, {to}. Les champs de bataille trancheront.',
      '{to}, Arken appartient à ceux qui le prennent.', 'Gardez vos frontières, {to}. Tant que vous le pouvez.'],
    amical: ['{to}, les puissants s’entendent toujours. Soyons puissants ensemble.', 'Vous avez du flair, {to} : on gagne toujours à être de notre côté.', '{to}, nous respectons les forts. Vous en êtes, pour le moment.',
      '{to}, mieux vaut marcher avec nous que devant nous.', 'Nous aimons les amis utiles, {to}. Restez-le.',
      '{to}, vous avez choisi le camp des vainqueurs. Bien joué.', 'Notre estime est rare, {to}. Elle se gagne sur le champ de bataille.',
      '{to}, ensemble, nous dicterions nos conditions à tout Arken.', 'Vous nous plaisez, {to}. Ne nous décevez pas.']
  },
  heros: {
    hostile: ['{to}, nous défendons les faibles. Ne nous obligez pas à les défendre contre vous.', 'Chaque injustice a un prix, {to}. Nous tenons les comptes.',
      '{to}, l’honneur ne semble pas être votre fort. Le nôtre suffira pour deux.',
      '{to}, la force sans justice n’est que brutalité. Nous y mettrons fin.', 'Nos bannières se lèvent contre l’injustice, {to}. Elles se lèvent contre vous.',
      '{to}, rendez ce que vous avez pris, et nous oublierons.', 'Le peuple d’Arken nous regarde, {to}. Nous ne le décevrons pas.',
      '{to}, nos serments nous lient aux faibles. Pas à vous.', 'Chaque province volée sera rendue, {to}. Nous en faisons le serment.'],
    neutre: ['{to}, nous jugerons vos actes, pas vos paroles.', 'La justice est patiente, {to}. Nous aussi.', '{to}, que chacun respecte ses voisins et tout ira bien.',
      '{to}, la paix se mérite. Méritez-la.', 'Nous veillons sur Arken, {to}. Sur vous aussi.',
      '{to}, l’honneur oblige. Nous espérons qu’il vous oblige aussi.', 'Nos épées restent au fourreau, {to}, tant que la justice est respectée.',
      '{to}, votre conduite sera jugée. Soyez-en digne.', 'Nous gardons la parole donnée, {to}. Faites de même.'],
    amical: ['{to}, notre parole est d’acier : vous pouvez compter sur nous.', 'Les justes finissent toujours par se trouver, {to}.', '{to}, si l’on vous attaque, vous ne serez pas seuls.',
      '{to}, nous combattrons pour vous comme pour nous-mêmes.', 'Votre cause est juste, {to}. Elle est désormais la nôtre.',
      '{to}, sous notre bouclier, vos provinces dormiront tranquilles.', 'Les nations loyales n’ont rien à craindre de nous, {to}.',
      '{to}, notre serment vous protège. Il ne sera pas rompu.', 'Que nos peuples restent unis, {to}, dans la paix comme dans l’épreuve.']
  },
  traitre: {
    hostile: ['{to}, la confiance est une monnaie. Vous venez de dépenser la vôtre.', 'Méfiez-vous des ombres, {to}. Surtout de celles qui sourient.', '{to}, les naïfs dorment bien. Jusqu’au réveil.',
      '{to}, nous savions que ce jour viendrait. Nous l’avons même préparé.', 'Quel dommage, {to}. Nous vous aimions tant.',
      '{to}, on ne tourne jamais le dos à un ami. Surtout pas à nous.', 'Vous pensiez nous connaître, {to} ? Personne ne nous connaît.',
      '{to}, la vengeance se savoure froide. Nous avons tout notre temps.', 'Souriez, {to}. Demain, vous n’en aurez plus envie.'],
    neutre: ['Tout se négocie, {to}. Absolument tout.', '{to}, nos intérêts se croisent. Pour l’instant.', 'Nous écoutons, {to}. Nous écoutons toujours.',
      '{to}, nous sommes toujours ouverts à un bon arrangement.', 'Rien n’est jamais figé, {to}. Surtout pas les alliances.',
      '{to}, nous retenons tout. Cela peut servir.', 'Votre message mérite réflexion, {to}. Nous réfléchissons toujours beaucoup.',
      '{to}, l’avenir est plein de surprises. Nous les adorons.', 'Nous restons discrets et attentifs, {to}. Comme toujours.'],
    amical: ['{to}, quelle joie de vous lire ! Vous êtes notre ami le plus cher.', 'Entre nous, {to}, il n’y aura jamais la moindre ombre. Croyez-le bien.', '{to}, notre loyauté vous est acquise. Que pourrait-il arriver ?',
      '{to}, votre sagesse n’a d’égale que votre grandeur.', 'Quel bonheur de vous compter parmi nos proches, {to} !',
      '{to}, nos cœurs sont avec vous. Nos armées suivront, bien sûr.', 'Jamais nation ne fut plus aimée que la vôtre, {to}.',
      '{to}, vous pouvez dormir tranquilles. Nous veillons sur vous.', 'Votre gloire nous réjouit, {to}. Sincèrement. Profondément.']
  },
  batisseur: {
    hostile: ['{to}, nos murs sont plus hauts que vos ambitions.', 'Venez donc, {to} : nos forteresses s’ennuient.', '{to}, nous bâtissons, vous détruisez. L’histoire choisira son camp.',
      '{to}, chaque pierre de nos murs a été posée pour vous attendre.', 'Nos tours sont hautes, {to}. Elles voient venir les ennuis de loin.',
      '{to}, nous savons bâtir. Nous savons aussi défendre ce que nous bâtissons.', 'Attaquez-nous, {to}, et nos remparts feront le reste.',
      '{to}, détruire est facile. Prendre nos forteresses, beaucoup moins.', 'Nos maçons ont prévu votre visite, {to}. Les murs sont épais.'],
    neutre: ['{to}, nous avons des chantiers à finir. Laissez-nous travailler.', 'La paix nous suffit, {to}. Gardez-la aussi.', '{to}, chaque guerre coûte une cathédrale. Réfléchissez-y.',
      '{to}, nos ouvriers préfèrent le marteau à l’épée.', 'Nous avons des murs à finir, {to}. Pas de guerre à mener.',
      '{to}, la paix fait pousser les cités. La guerre, les ruines.', 'Nos chantiers avancent, {to}. Ne les dérangez pas.',
      '{to}, nous construisons pour durer. Faites-en autant.', 'Un royaume se bâtit pierre à pierre, {to}. Pas à coups de lance.'],
    amical: ['{to}, bâtissons ensemble, c’est toujours plus solide.',
      '{to}, que nos frontières restent paisibles : nos chantiers en ont besoin.', 'La paix est le meilleur des chantiers, {to}. Bâtissons-la ensemble.',
      '{to}, nos peuples ont mieux à faire que se battre.', 'Nos maçons vous saluent, {to}. Ils aiment travailler en paix.',
      '{to}, une frontière tranquille vaut toutes les forteresses.', 'Nous vous souhaitons de belles cités, {to}, et de longues années de paix.',
      '{to}, mettons nos forces à construire plutôt qu’à détruire.', 'Bon voisinage, {to} : c’est le ciment de nos deux royaumes.']
  }
});
// Répliques propres aux personnalités des dirigeants IA (initiatives).
const AI_LINES = {
  betrayal: ['{to}, une alliance n’est qu’un outil. Le vôtre est usé.', 'Vous nous faisiez confiance, {to} ? C’était votre erreur.', 'Les traités sont faits pour les naïfs, {to}. Merci de l’avoir été.',
    '{to}, la loyauté est une belle idée. Nous lui préférons la victoire.', 'Merci pour ces années d’alliance, {to}. Elles nous ont été très utiles.',
    '{to}, vous auriez dû lire notre pacte entre les lignes.', 'Rien de personnel, {to}. Vos provinces étaient simplement trop tentantes.',
    '{to}, notre alliance s’arrête ici. Votre royaume aussi, bientôt.', 'Vous gardiez nos arrières, {to}. Nous gardons maintenant vos terres.'],
  betrayed: ['{to} nous a trahis. Que tout Arken le sache : on ne peut se fier à sa parole.', 'Trahison ! {to} a planté sa lame dans le dos de son allié.', '{to} rompt notre alliance par les armes. Nous n’oublierons jamais.',
    '{to} a trahi son serment. Arken saura quelle valeur accorder à sa parole.', 'Notre allié {to} nous frappe dans le dos. Nous frapperons de face.',
    '{to} brise notre alliance. Que chaque nation en tire la leçon.', '{to}, vous avez trahi un allié. Vous n’en aurez plus jamais.',
    'La parole de {to} ne vaut plus rien. Cette trahison se paiera.', '{to}, nous vous faisions confiance. Chaque province prise vous sera reprise.'],
  // V14.0 : trêve rompue moins de 10 tours après sa signature (trahison).
  truceBreaker: ['{to}, une trêve n’est qu’une pause. La pause est finie.', 'Nous avions signé, {to} ? Nous avons changé d’avis.',
    '{to}, la paix vous allait bien. Elle ne nous rapportait rien.', 'Merci pour ce répit, {to}. Nos armées en avaient besoin.',
    '{to}, notre parole valait ce que vaut une trêve : peu de chose.', 'La trêve est rompue, {to}. Vous auriez dû en profiter pour vous armer.',
    '{to}, nous avons signé la paix pour mieux préparer la guerre.', 'Une trêve, {to} ? Le temps de reprendre des forces, rien de plus.',
    '{to}, l’encre de notre trêve est sèche. Nos épées, non.'],
  truceBroken: ['{to} a rompu sa trêve à peine signée. Que tout Arken sache ce que vaut sa parole.', 'Trahison ! {to} signe la paix puis frappe aussitôt.',
    '{to}, votre trêve n’était qu’un piège. Nous ne l’oublierons pas.', 'La signature de {to} ne vaut rien : sa trêve n’a pas tenu dix tours.',
    '{to} brise la paix qu’il avait jurée. Nous nous défendrons.', 'Plus personne ne croira {to}. Sa trêve était un mensonge.',
    '{to}, vous avez trahi votre propre trêve. Arken vous jugera.', 'Nous avions déposé les armes, {to}. Vous en avez profité. Honte à vous.',
    '{to} rompt la trêve sans honneur. Chaque nation en tirera la leçon.'],
  heroWarn: ['{to}, attaquer les plus faibles est indigne. Cessez, ou nous interviendrons.', 'Nous ne laisserons pas {to} écraser ses voisins.', '{to}, chaque agression de plus vous rapproche de notre colère.',
    '{to}, laissez vos voisins en paix. C’est notre dernier avertissement.', 'Les faibles ne sont pas sans défenseur, {to}. Ils nous ont.',
    '{to}, retirez vos armées, ou nos bannières se lèveront contre vous.', 'Nous voyons vos conquêtes, {to}. Nos serments nous interdisent de nous taire.',
    '{to}, la justice d’Arken a un bras. C’est le nôtre.', 'Encore une agression, {to}, et nous marcherons contre vous.'],
  heroSupport: ['{to}, vous n’êtes pas seuls face à l’agresseur.', 'Courage, {to}. Nos armées sont prêtes à vous défendre.', '{to}, notre alliance vous est offerte contre l’envahisseur.',
    '{to}, tenez bon. Les justes ne laissent personne seul.', 'Nos bannières sont à vos côtés, {to}. L’agresseur le saura.',
    '{to}, si vous le voulez, notre alliance sera votre bouclier.', 'Personne ne devrait affronter seul l’envahisseur, {to}. Appelez-nous.',
    '{to}, nos armées sont prêtes. Un mot de vous suffira.', 'Courage, {to}. Votre cause est juste, et nous la défendrons.'],
  // V13 : soutien d'un Héros à une victime qui est DÉJÀ son alliée (aucune nouvelle offre d'alliance).
  heroAllySupport: ['{to}, vous n’êtes pas seuls face à l’agresseur.', 'Courage, allié {to}. Nos armées sont prêtes à vous défendre.', '{to}, notre alliance tiendra face à l’envahisseur.',
    'Allié {to}, tenez bon. Nos armées sont en marche.', '{to}, notre serment d’alliés ne pliera pas devant l’agresseur.',
    'Vos ennemis sont les nôtres, allié {to}. Ils le regretteront.', '{to}, nous sommes à vos côtés, comme promis.',
    'Allié {to}, l’envahisseur trouvera nos boucliers sur sa route.', '{to}, gardez courage. Notre alliance ne vous abandonnera pas.'],
  conquerorThreat: ['{to}, vos terres seront bientôt les nôtres.', 'Soumettez-vous, {to}, et vous garderez peut-être votre trône. Un petit trône.', '{to}, Arken n’aura qu’un seul maître. Indice : ce n’est pas vous.',
    '{to}, vos provinces ont besoin d’un maître. Nous sommes candidats.', 'Rendez vos forteresses, {to}. Nous les garderons mieux que vous.',
    '{to}, nos armées se rassemblent. Devinez vers où.', 'Votre faiblesse se voit de loin, {to}. Nos généraux l’ont remarquée.',
    '{to}, profitez de votre couronne. Elle changera bientôt de tête.', 'Nos lames sont prêtes, {to}. Votre royaume l’est-il ?'],
  traitorCharm: ['{to}, une alliance entre nous ferait trembler Arken. Qu’en dites-vous ?', 'Nous n’avons que de l’estime pour {to}. Unissons-nous.', '{to}, soyons alliés : vos ennemis seront les nôtres.',
    '{to}, nos deux nations alliées ? Personne n’oserait nous défier.', 'Une alliance avec {to} serait un honneur. Qu’en dites-vous ?',
    '{to}, nous rêvons d’une alliance avec vous. Dites oui.', 'Vos ennemis nous déplaisent, {to}. Faisons alliance contre eux.',
    '{to}, nous vous offrons notre alliance et nos armées. Sans conditions.', 'Alliés, {to}, nous serions invincibles. Réfléchissez-y.'],
  builderPeace: ['Nous bâtissons, {to}, nous ne conquérons pas.',
    '{to}, nos chantiers ont besoin de paix. Gardons nos frontières calmes.', '{to}, nos cités grandissent mieux sans guerre. Restons en paix.',
    'Nous ne voulons rien de vos terres, {to}. Juste la paix.', '{to}, que nos armées restent dans leurs casernes.',
    'Nos maçons travaillent, {to}. Ne leur donnez pas de raison de prendre les armes.', '{to}, une paix durable profiterait à nos deux royaumes.',
    'Bon voisinage, {to} ? Nous en faisons le vœu.', '{to}, nos forteresses ne servent qu’à nous défendre. Vous n’avez rien à craindre.'],
  ceasefireOffer: ['{to}, cessons ce combat. Une trêve servirait nos deux peuples.', 'Assez, {to}. Nous proposons de déposer les armes.', '{to}, nous sommes prêts à signer une trêve.',
    '{to}, nos soldats sont las. Les vôtres aussi. Signons une trêve.', 'Une trêve, {to} ? Nos deux peuples la réclament.',
    '{to}, posons les armes avant que nos trésors soient vides.', 'Nous proposons une trêve, {to}. Elle vaut mieux qu’une victoire coûteuse.',
    '{to}, cette guerre a assez duré. Déposons les armes.', 'Faisons taire les armes, {to}. Nous attendons votre réponse.'],
  // V13.2 : une proposition qui suit un refus le dit, et une offre en or est annoncée.
  ceasefireAgain: ['{to}, vous avez repoussé notre trêve. Nous la proposons une nouvelle fois.', 'Nous revenons vers vous, {to}, malgré votre refus : signons la paix.', '{to}, notre première offre de trêve a été rejetée. Réfléchissez cette fois.',
    '{to}, malgré votre refus, notre offre de trêve tient toujours.', 'Vous avez refusé la paix une fois, {to}. La voici de nouveau.',
    '{to}, votre refus ne nous a pas découragés. Signons une trêve.', 'Notre trêve a été repoussée, {to}. Nous la proposons encore.',
    '{to}, oublions votre refus. Une trêve, cette fois ?', 'Après votre refus, {to}, nous revenons avec la même offre : la paix.'],
  ceasefireGold: ['{to}, déposons les armes. Nous vous verserons {gold} or en gage de paix.', 'Une trêve, {to}, et {gold} or pour vos caisses. Que dites-vous ?', '{to}, cessons ce combat : {gold} or vous attendent si vous signez.',
    '{to}, signez la trêve et {gold} or rejoindront votre trésor.', 'Nous offrons {gold} or pour une trêve, {to}. L’offre est sérieuse.',
    '{to}, la paix et {gold} or : voilà notre proposition.', 'Une trêve contre {gold} or, {to}. Nos deux peuples y gagnent.',
    '{to}, {gold} or pour poser les armes. Qu’en dites-vous ?', 'Nos caisses s’ouvrent pour la paix, {to} : {gold} or si vous signez.'],
  ceasefireGoldAgain: ['{to}, vous avez refusé notre trêve. Cette fois, nous ajoutons {gold} or.', 'Vous avez refusé notre trêve, {to}. Voici {gold} or pour vous faire changer d’avis.', '{to}, notre parole ne vous suffisait pas. Voici {gold} or pour la sceller.',
    '{to}, après votre refus, nous ajoutons {gold} or à notre offre de trêve.', 'Votre refus nous a fait réfléchir, {to}. Voici {gold} or pour la paix.',
    '{to}, vous avez refusé la paix seule. La voici avec {gold} or.', 'Notre trêve a été repoussée, {to}. {gold} or la rendront plus douce.',
    '{to}, malgré votre refus, nous insistons : {gold} or pour une trêve.', 'Vous avez refusé une fois, {to}. Cette fois, {gold} or accompagnent notre trêve.']
};
// V14.2 : chaque liste reçoit ses nouvelles variantes (talk-v14-2.js) ; le nombre de répliques double.
for (const [path, extra] of Object.entries(MORE_LINES)) {
  const parts = path.split('.'), root = parts[0] === 'archetype' ? ARCHETYPE_LINES : parts[0] === 'ai' ? AI_LINES : LINES;
  const list = (parts[0] === 'archetype' || parts[0] === 'ai' ? parts.slice(1) : parts).reduce((o, k) => o?.[k], root);
  if (Array.isArray(list)) for (const line of extra) if (!list.includes(line)) list.push(line);
}
/** V13.3 : chaque liste de répliques, par chemin (« war.hostile », « ai.betrayal »…) — tests de taille et de contenu. */
export function talkLineLists() {
  const out = {};
  const walk = (v, path) => { if (Array.isArray(v)) out[path] = v; else for (const [k, x] of Object.entries(v)) walk(x, path ? `${path}.${k}` : k); };
  walk(LINES, ''); walk(ARCHETYPE_LINES, 'archetype'); walk(AI_LINES, 'ai');
  return out;
}
/** V13 : toutes les lignes pré-écrites (tests : français soigné, aucune insulte). */
export function allTalkLines() {
  const out = [];
  const walk = v => { if (typeof v === 'string') out.push(v); else if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v === 'object') Object.values(v).forEach(walk); };
  walk(LINES); walk(ARCHETYPE_LINES); walk(AI_LINES);
  return out;
}

// --- V13.3 : anti-répétition ------------------------------------------------------------------------------------
export const RECENT_LINES = 6;         // une réplique ne revient pas parmi les 6 derniers messages d'un dirigeant
const TOKEN = /\{(?:to|from|gold|x|p)\}/g;
const patternCache = new Map();
/** Expression qui reconnaît un message publié à partir de sa réplique (jetons = texte quelconque). */
function linePattern(line) {
  let re = patternCache.get(line);
  if (!re) {
    re = new RegExp(`^${line.split(TOKEN).map(part => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.+?')}$`);
    patternCache.set(line, re);
  }
  return re;
}
/** Textes des RECENT_LINES derniers messages publiés par `from` (lus dans state.talk). */
export function recentTexts(state, from) {
  const out = [];
  for (let i = (state.talk || []).length - 1; i >= 0 && out.length < RECENT_LINES; i--) if (state.talk[i].from === from) out.push(state.talk[i].text);
  return out;
}
/** `line` a-t-elle servi dans les derniers messages de `from` ? */
export const usedRecently = (state, from, line) => { const re = linePattern(line); return recentTexts(state, from).some(t => re.test(t)); };
/**
 * Tirage déterministe (graine + clés, comme pickFrom) puis, à partir de l'index tiré, première réplique que `from`
 * n'a pas utilisée récemment. Si toutes ont servi, la réplique tirée.
 */
export function pickLine(state, list, from, ...keys) {
  const start = Math.floor(chance(state, ...keys) * list.length) % list.length;
  const recent = recentTexts(state, from), others = sameTurnTexts(state, from);
  if (!recent.length && !others.length) return list[start];
  const free = (line, texts) => { const re = linePattern(line); return !texts.some(t => re.test(t)); };
  // 1. ni parmi ses derniers messages, ni déjà dite ce tour par un autre dirigeant ; 2. au moins pas déjà dite ce tour.
  for (const texts of [[...recent, ...others], others]) for (let i = 0; i < list.length; i++) {
    const line = list[(start + i) % list.length];
    if (free(line, texts)) return line;
  }
  return list[start];
}
/** V14.1 (cahier V14 §3 point 5) : textes publiés CE tour par les autres dirigeants (anti-répétition entre nations). */
export function sameTurnTexts(state, from) {
  return (state.talk || []).filter(m => m.turn === state.turn && m.from !== from).map(m => m.text);
}

const nameOf = (map, id) => map?.nations?.find(n => n.id === id)?.short || 'tous';
const fill = (text, map, from, to) => text.replaceAll('{to}', to ? nameOf(map, to) : 'peuples d’Arken').replaceAll('{from}', nameOf(map, from));
const ownedIds = (state, id) => Object.keys(state.provinces || {}).filter(p => state.provinces[p].ownerId === id);
/** Deux nations voisines : frontière terrestre ou route maritime entre leurs provinces. */
export function neighbors(state, map, a, b) {
  const A = new Set(ownedIds(state, a)), B = new Set(ownedIds(state, b));
  for (const d of map?.provinces || []) if (A.has(d.id) && (d.landConnections || []).some(x => B.has(x))) return true;
  return (map?.maritimeRoutes || []).some(([x, y]) => (A.has(x) && B.has(y)) || (A.has(y) && B.has(x)));
}
/** Situation qui oriente les textes proposés, du point de vue de `from` qui s'adresse à `to`. */
export function talkSituation(state, map, { from, to, replyTo = null }) {
  const original = replyTo ? (state.talk || []).find(m => m.id === replyTo) : null;
  if (original) return { kind: 'reply', original };
  if (!to) return { kind: 'default' };
  if (atWar(state, from, to)) return { kind: 'war' };
  const recent = recentAggressions(state, 8);
  if (recent.some(a => a.attacker === to && a.victim === from)) return { kind: 'afterAttack' };
  if (recent.some(a => a.attacker === to)) return { kind: 'aggressor' };
  if (allied(state, from, to)) return { kind: 'ally' };
  if (treatyOf(state, from, to, 'ceasefire')) return { kind: 'ceasefire' };
  if (neighbors(state, map, from, to)) return { kind: 'neighbor' };
  return { kind: 'default' };
}
function previewOf(state, from, to, tone) {
  if (!to) return tone === 'hostile' ? 'Message à tous : inquiète les autres dirigeants' : 'Message à tous';
  const now = getTension(state, from, to), cap = tensionCap(state, from, to);
  // V14.2 : effet réel selon la personnalité du destinataire, s'il est révélé ; sinon effet habituel… et, pour un
  // message hostile ou amical, la mention que le caractère peut le renforcer (rien n'est dévoilé). Plafond d'alliance
  // ou de trêve appliqué ; avertissement si la tension peut atteindre le seuil de guerre automatique.
  const d = talkTensionDelta(state, from, to, tone, { known: true }), worst = talkTensionWorst(state, from, to, tone);
  const next = Math.max(0, Math.min(cap, now + d)), worstNext = Math.max(0, Math.min(cap, now + worst));
  const effect = tone === 'hostile' ? 'le risque de guerre bondit' : tone === 'amical' ? 'apaise les relations' : 'relations stables';
  // V13 : tension en % ; en guerre, le message ne change pas l'état de guerre.
  if (atWar(state, from, to)) return `En guerre · tension ${now} % → ${next} %`;
  const unsure = worstNext !== next ? `, jusqu’à ${worstNext} % selon son caractère` : '';
  const capped = cap < 100 && now + d > cap ? ` · plafonnée à ${cap} % par ${allied(state, from, to) ? 'votre alliance' : 'la trêve'}` : '';
  const war = cap === 100 && Math.max(next, worstNext) >= HOSTILITY_WAR ? ` · ⚠ dès ${HOSTILITY_WAR} %, guerre déclarée automatiquement` : cap === 100 && Math.max(next, worstNext) >= HOSTILITY_WARNING && now < HOSTILITY_WARNING ? ` · ⚠ au bord de la guerre (guerre automatique à ${HOSTILITY_WAR} %)` : '';
  return `Tension ${now} % → ${next} % (${d > 0 ? '+' : '−'}${Math.abs(d)}${unsure}) · ${effect}${capped}${war}`;
}
/** Exactement 3 propositions [{ tone, text, preview }] (hostile, neutre, amical), adaptées à la situation. */
export function talkOptions(state, map, { from, to = null, replyTo = null } = {}) {
  const sit = talkSituation(state, map, { from, to, replyTo });
  const table = sit.kind === 'reply' ? LINES.reply[sit.original.tone] || LINES.reply.neutre : LINES[sit.kind];
  return TONES.map(tone => ({
    tone, situation: sit.kind,
    text: fill(pickLine(state, table[tone], from, 'talk', state.turn, from, to ?? '*', tone, sit.kind, replyTo ?? ''), map, from, to),
    preview: previewOf(state, from, to, tone)
  }));
}

function nextOrderId(state) {
  state.orders ||= [];
  state.orderSequence = Math.max(1, Number(state.orderSequence) || 1);
  while (state.orders.some(o => o.id === `o${state.orderSequence}`)) state.orderSequence++;
  return `o${state.orderSequence++}`;
}
/**
 * Prépare un message public : un ORDRE { kind:'talk' } publié à la résolution du tour (comme tous les ordres).
 * Un seul message par destinataire et par tour : un nouveau choix remplace le précédent.
 */
export function queueTalk(state, map, { from, to = null, tone, replyTo = null } = {}) {
  if (!TONES.includes(tone)) return { ok: false, error: 'Ton inconnu' };
  if (!state.nations?.[from] || state.nations[from].eliminated) return { ok: false, error: 'Nation inconnue' };
  if (to !== null && (!state.nations[to] || to === from)) return { ok: false, error: 'Destinataire invalide' };
  if (to !== null && state.nations[to].eliminated) return { ok: false, error: 'Cette nation a été éliminée' };
  if (replyTo && !(state.talk || []).some(m => m.id === replyTo)) return { ok: false, error: 'Message introuvable' };
  // V13 : une conversation se termine — on ne répond qu'une fois à un message.
  if (replyTo && alreadyAnswered(state, from, replyTo)) return { ok: false, error: 'Vous avez déjà répondu à ce message' };
  const option = talkOptions(state, map, { from, to, replyTo }).find(o => o.tone === tone);
  state.orders ||= [];
  const old = state.orders.findIndex(o => o.kind === 'talk' && o.status === 'pending' && o.nationId === from && (o.to ?? null) === to);
  if (old >= 0) state.orders.splice(old, 1);
  const order = { id: nextOrderId(state), kind: 'talk', nationId: from, to, tone, text: option.text, replyTo, turn: state.turn, status: 'pending' };
  state.orders.push(order);
  return { ok: true, orderId: order.id, text: order.text, replaced: old >= 0 };
}

/** V13 : `from` a-t-il déjà répondu (message publié) à `talkId` ? Une réponse ne se donne qu'une fois. */
export function alreadyAnswered(state, from, talkId) {
  return (state.talk || []).some(m => m.from === from && m.replyTo === talkId);
}
/**
 * Publie un message dans le fil : tension, attente de réponse, événement de journal ÉCHANGE.
 * V13 : `awaitReply: false` = message qui n'appelle pas de réponse (réponse à une demande d'aide, par exemple) ;
 * une réponse (replyTo) n'appelle jamais de réponse : la conversation est close.
 */
export function publishTalk(state, { from, to = null, tone, text, replyTo = null, ai = false, awaitReply = true, tension = true }) {
  state.talk ||= []; state.talkPending ||= {};
  state.talkSequence = Math.max(1, Number(state.talkSequence) || 1);
  while (state.talk.some(m => m.id === `t${state.talkSequence}`)) state.talkSequence++;
  const msg = { id: `t${state.talkSequence++}`, turn: state.turn, from, to, tone, text, replyTo };
  state.talk.push(msg);
  if (state.talk.length > TALK_LIMIT) state.talk.splice(0, state.talk.length - TALK_LIMIT);
  // Répondre à un message le retire de la liste d'attente.
  if (replyTo && state.talkPending[from]) state.talkPending[from] = state.talkPending[from].filter(id => id !== replyTo);
  if (to) {
    // V14.2 : la personnalité du destinataire change l'effet (Conquérant provoqué, Héros charmé, Bâtisseur indifférent).
    if (tension) { addTension(state, from, to, talkTensionDelta(state, from, to, tone), 'talk'); noteTalkEffect(state, from, to, tone); }
    if (state.controllers?.[to] === 'human' && awaitReply && !replyTo) {
      const list = (state.talkPending[to] ||= []);
      list.push(msg.id);
      if (list.length > PENDING_LIMIT) list.splice(0, list.length - PENDING_LIMIT);
    }
  } else if (tone === 'hostile') for (const n of aliveNations(state)) if (n !== from) addTension(state, from, n, 4, 'talk');
  const rep = reputation(state, from);
  if (tone === 'hostile') rep.hostile++; else if (tone === 'amical') rep.friendly++;
  state.events?.push({ turn: state.turn, type: 'talk', nationId: from, target: to, tone, text, talkId: msg.id, replyTo, ai });
  return msg;
}
/** Nettoie les attentes : ids disparus du fil (limite des 60) ou messages trop anciens. */
export function pruneTalkPending(state) {
  const byId = new Map((state.talk || []).map(m => [m.id, m]));
  for (const [id, list] of Object.entries(state.talkPending || {})) state.talkPending[id] = (list || []).filter(x => byId.has(x) && byId.get(x).turn > state.turn - PENDING_TURNS);
}

// --- Les dirigeants IA prennent la parole --------------------------------------------------------------------
const REPLY_CHANCE = { heros: .6, conquerant: .5, traitre: .8, batisseur: .7 };
function replyTone(state, ai, incoming, sender) {
  const arch = archetypeOf(state, ai), t = getTension(state, ai, sender), revealed = state.leaders?.[ai]?.revealed;
  switch (arch) {
    case 'conquerant': return incoming === 'amical' && strengthOf(state, sender) > strengthOf(state, ai) ? 'neutre' : 'hostile';
    case 'heros': return incoming === 'hostile' ? (t >= 50 ? 'hostile' : 'neutre') : incoming === 'amical' || charmOf(state, ai, sender) >= 2 ? 'amical' : 'neutre';
    case 'batisseur': return incoming === 'hostile' ? 'neutre' : 'amical';
    case 'traitre': return revealed ? (incoming === 'hostile' ? 'hostile' : 'neutre') : 'amical';
    default: return 'neutre';
  }
}
/** V13 : une fois sur deux, le dirigeant parle avec la voix de sa personnalité plutôt qu'avec la ligne de situation. */
function voiced(state, from, arch, tone, situationLines, ...keys) {
  const own = ARCHETYPE_LINES[arch]?.[tone];
  return own && chance(state, 'voice', ...keys) < .5 ? pickLine(state, own, from, 'voice-line', ...keys) : pickLine(state, situationLines, from, ...keys);
}
const lastSpoke = (state, id) => { let last = -99; for (const m of state.talk || []) if (m.from === id && !m.replyTo && m.turn > last) last = m.turn; return last; };
/**
 * Paroles des IA pendant la résolution du tour (après les combats et la diplomatie) :
 *  1. réponses aux messages qui leur ont été adressés ce tour (selon la personnalité) ;
 *  2. une initiative au plus par dirigeant, déclenchée par un événement (trahison subie ou commise, agression,
 *     stratégie de la personnalité), avec un délai minimal de 3 tours hors événement grave.
 * Au plus AI_TALK_PER_TURN messages IA par tour.
 */
export function aiTalk(state, map, { published = [], turnEvents = [] } = {}) {
  // Les propositions diplomatiques publiées plus tôt dans ce tour comptent dans le quota.
  let budget = AI_TALK_PER_TURN - (state.talk || []).filter(m => m.turn === state.turn && state.controllers?.[m.from] === 'ai').length;
  const ais = aliveNations(state).filter(id => state.controllers?.[id] === 'ai');
  const say = (from, to, tone, text, replyTo = null) => { if (budget <= 0) return false; budget--; publishTalk(state, { from, to, tone, text: fill(text, map, from, to), replyTo, ai: true }); return true; };
  // 1. Réponses.
  for (const m of published) {
    if (!m.to || state.controllers?.[m.to] !== 'ai' || state.nations[m.to]?.eliminated) continue;
    // V13 : une réponse clôt la conversation — l'IA ne répond pas « en écho » à une réponse.
    if (m.replyTo) continue;
    const arch = archetypeOf(state, m.to);
    if (chance(state, 'reply', state.turn, m.id) >= (REPLY_CHANCE[arch] ?? .5)) continue;
    const tone = replyTone(state, m.to, m.tone, m.from);
    say(m.to, m.from, tone, voiced(state, m.to, arch, tone, LINES.reply[m.tone][tone], 'reply-text', state.turn, m.id), m.id);
  }
  // 2. Initiatives.
  const spoke = new Set();
  const once = (from, to, tone, text) => { if (spoke.has(from) || !to || state.nations[to]?.eliminated) return; if (say(from, to, tone, text)) spoke.add(from); };
  const line = (key, from, ...k) => pickLine(state, AI_LINES[key], from, key, state.turn, from, ...k);
  for (const e of turnEvents.filter(e => e.type === 'betrayal')) {
    // V14.0 : une trêve rompue a ses propres répliques (les autres parlent d'alliance).
    if (state.controllers?.[e.nationId] === 'ai') once(e.nationId, e.target, 'hostile', line(e.truce ? 'truceBreaker' : 'betrayal', e.nationId, e.target));
    if (state.controllers?.[e.target] === 'ai') once(e.target, e.nationId, 'hostile', line(e.truce ? 'truceBroken' : 'betrayed', e.target, e.nationId));
  }
  for (const e of turnEvents.filter(e => e.type === 'diplomacy' && e.relation === 'war' && e.reason === 'combat')) {
    if (state.controllers?.[e.target] === 'ai' && archetypeOf(state, e.target) !== 'traitre') once(e.target, e.nationId, 'hostile', pickLine(state, LINES.afterAttack.hostile, e.target, 'attacked', state.turn, e.target));
  }
  for (const id of ais) {
    if (spoke.has(id) || budget <= 0) continue;
    const arch = archetypeOf(state, id), quiet = state.turn - lastSpoke(state, id) < 3;
    const others = aliveNations(state).filter(n => n !== id);
    const r = chance(state, 'initiative', state.turn, id);
    if (arch === 'heros') {
      const ag = recentAggressions(state, 2).filter(a => a.attacker !== id && a.victim !== id).at(-1);
      if (ag && !quiet) { once(id, ag.attacker, 'hostile', line('heroWarn', id)); continue; }
      if (ag && r < .3) { once(id, ag.victim, 'amical', line(allied(state, id, ag.victim) ? 'heroAllySupport' : 'heroSupport', id)); continue; }
    }
    if (quiet) continue;
    if (arch === 'conquerant' && r < .45) {
      const prey = others.filter(n => !allied(state, id, n)).sort((a, b) => strengthOf(state, a) - strengthOf(state, b) || a.localeCompare(b))[0];
      once(id, prey, 'hostile', line('conquerorThreat', id)); continue;
    }
    if (arch === 'traitre' && !state.leaders?.[id]?.revealed && r < .4) {
      const mark = state.ai?.traitorMark?.[id] || others[0];
      // V13 : jamais d'« offre d'alliance » à une nation déjà alliée : le Traître la flatte, simplement.
      once(id, mark, 'amical', allied(state, id, mark) ? pickLine(state, ARCHETYPE_LINES.traitre.amical, id, 'traitor-flatter', state.turn, id) : line('traitorCharm', id)); continue;
    }
    if (arch === 'batisseur' && r < .25) {
      const n = others.filter(x => neighbors(state, map, id, x) && !atWar(state, id, x));
      if (n.length) { once(id, pickFrom(state, n, 'builder-to', state.turn, id), 'amical', line('builderPeace', id)); continue; }
    }
    // Paroles ordinaires, rares : selon la situation et la personnalité.
    if (r > .9) {
      const to = pickFrom(state, others, 'idle-to', state.turn, id);
      const tone = arch === 'conquerant' ? 'hostile' : arch === 'batisseur' || arch === 'traitre' ? 'amical' : 'neutre';
      const sit = talkSituation(state, map, { from: id, to });
      once(id, to, tone, voiced(state, id, arch, tone, LINES[sit.kind][tone], 'idle', state.turn, id));
    }
  }
}
/** Message d'une IA qui propose une trêve ou une alliance (au joueur, qui répond via la diplomatie). */
export function aiOfferTalk(state, map, from, to, kind, { again = false, gold = 0 } = {}) {
  const set = kind !== 'ceasefire' ? AI_LINES.traitorCharm : gold > 0 ? (again ? AI_LINES.ceasefireGoldAgain : AI_LINES.ceasefireGold) : again ? AI_LINES.ceasefireAgain : AI_LINES.ceasefireOffer;
  const text = fill(pickLine(state, set, from, 'offer', state.turn, from, to), map, from, to).replaceAll('{gold}', String(gold));
  return publishTalk(state, { from, to, tone: kind === 'ceasefire' ? 'neutre' : 'amical', text, ai: true });
}
