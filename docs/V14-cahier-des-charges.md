# FRONTIÈRES: ARKEN — V14 — Cahier des charges (préparé le 20/10/2026, mis à jour le 25/10/2026)

> **Où on en est (25/10/2026)** : V14.1 fusionnée et jouée par Jack (plusieurs parties, une gagnée). Ses retours de bêta
> sont dans la section 2. Nouveau découpage (section 6) : **V14.2 = retours de bêta**, **V14.3 = tutoriel facultatif
> rejouable**, **V14.4 = préparation Google Play** (ancienne V14.2).

## 1. Principe
- La V14 suit la V13.4 (retours de bêta du 20/10 : passage automatique chez l'allié, % de la forteresse affichés,
  mini-tuto à la première partie). Elle commence **dimanche**, quand le quota de Jack repart.
- **Point de décision fixé par Jack** : il s'est donné jusqu'à fin octobre environ. Si après la V14 le jeu est encore
  loin du résultat voulu, ARKEN passe **en pause** au profit des projets plus légers (Supérette, RUPTURE). Ce n'est pas
  un abandon : le dépôt et les documents restent prêts à reprendre.
- La V14 vise donc deux choses : finir les points ouverts du gameplay, puis rendre le jeu **publiable en test interne
  Google Play**.

## 2. Retours de bêta (V14.1, semaine du 19 au 25/10/2026)
Ces retours passent **en priorité** devant le reste de ce cahier. Jack a joué plusieurs parties sur la V14.1 (une gagnée,
« content »). Ce qu'il a noté, puis les arbitrages du chef de projet (Jack lui a délégué les décisions) :

1. **Aide d'alliance** : le journal dit « accepté de combattre votre ennemi (5 tours) ». Pendant 5 tours ? Dans 5 tours ?
   Le trajet est-il compris ? → rendre le message **sans ambiguïté** ; si le trajet « mange » l'aide, corriger la règle.
2. **Hostilité** : même à 100 %, la guerre n'est pas déclarée. Jack veut une **guerre automatique vers 85 %**, avec un
   **avertissement avant**. → Décision : avertissement dès **70 %**, guerre déclarée automatiquement à **85 %**, pour le
   joueur comme pour les IA, avec un événement clair au journal.
3. **Traits des dirigeants** plus marqués : le Conquérant attaque plus, et **les provocations le poussent à attaquer** ;
   le Héros naïf est **plus facilement manipulable par l'amitié** ; le Bâtisseur **se fiche des querelles** ; le Traître
   **peut trahir n'importe qui, autant de fois que c'est à son avantage**.
4. **Débarquement** : Jack propose d'enlever le malus (le bonus de forteresse suffit). → Décision du chef de projet :
   **le réduire** (assaillant à 70 % aujourd'hui → environ 85-90 %) **sans le supprimer** : la carte est faite d'îles, et
   sans malus les IA abuseraient des débarquements. Chiffre calibré par simulation, expliqué à Jack.
5. **Recrutement** : chaque type de troupe cliquable → PV et dégâts, par lot pour fantassins et cavaliers (préciser
   « par lot » ou « par unité »).
6. **Navire en convalescence** : l'expliquer, et **retour à 100 % des PV en 3 à 5 tours (selon les dégâts) dans un port
   construit**.
7. **Plus de phrases variées** pour les messages du joueur et les réponses des dirigeants.
8. **Rapports de conquête** : « super » ; ajouter **un saut de ligne** entre le récap du début et les pertes totales avec
   blessés. Rien d'autre à changer.
9. **Tutoriel** de quelques tours, **facultatif et rejouable** depuis le menu → **V14.3**.

Retours de la V13.4 (20/10/2026) déjà traités : **guerre automatique** quand des troupes combattent, même pour défendre
un allié (« si mes troupes affrontent qui que ce soit, même pour défendre un allié, ça me met en guerre avec ; au joueur de
gérer ses choix politiques après ») → **fait en V14.1** (voir Réalisé).

## 3. Points ouverts du gameplay (« À surveiller » des V13 à V13.3)
1. **L'allié vient vraiment défendre** : depuis la V13.4, l'alliance donne le passage. L'IA alliée doit s'en servir :
   quand Jack demande « Défends-moi », elle envoie des troupes **dans ses provinces menacées**, pas seulement chez elle.
2. **Rompre une trêve pour la rejouer** : un dominant peut enchaîner guerre → exiger de l'or → guerre. Proposition :
   rompre une trêve signée depuis moins de 10 tours compte comme une trahison (réputation, comme pour une alliance).
3. **Bases navales face à face** qui s'accumulent sans se battre : l'IA attaque une base navale ennemie quand elle a
   l'avantage, ou au moins cesse d'en empiler.
4. **L'IA prend moins la mer** depuis le brouillard (≈ 50 débarquements sur 60 tours contre 105 avant) : remonter un peu
   son goût pour la mer, sans débarquements suicides sur les capitales.
5. **Même réplique hostile envoyée par deux nations au même tour** : l'anti-répétition doit aussi jouer entre dirigeants.
6. **Carte au lancement** : sur un téléphone, elle montre l'ouest. Centrer sur la capitale du joueur, avec un bouton
   « Voir toute la carte ».

## 4. Prêt pour le test interne Google Play
Décision de Jack : les bêtas passent désormais par le **test interne Google Play** (son compte Play Console est payé).
- **AAB signé** produit par la CI, avec le jeu embarqué. La vraie clé est générée par Claude à ce moment-là, et reste
  uniquement dans les secrets GitHub.
- **Fiche Play** : titre, description courte et longue, captures téléphone, icône 512 px, image de présentation.
- **Politique de confidentialité** publiée, et **fenêtre de consentement RGPD** prête pour les publicités.
  Rien de payant n'est activé : pas d'AdMob réel, pas de produit Play.
- **Guide pas à pas** pour Jack, depuis son téléphone : mettre à jour `docs/GUIDE-GOOGLE-PLAY-TEST-INTERNE.md` avec
  l'envoi de l'AAB et l'ajout de testeurs.
- Rappel : la production exige ensuite **12 testeurs pendant 14 jours**. Trouver des communautés de bêta-testeurs est une
  mission séparée, à lancer quand un jeu du studio sera prêt.

## 5. Modèle économique (rappel, déjà codé en V12, rien de payant activé)
- Gratuit, une publicité au début de chaque partie de 80 tours.
- 5 atouts × +1 % par niveau, jusqu'à +10 %.
- 5 missions journalières facultatives, qui rapportent 1 jeton.
- Pack débutant : sans pub et 3 jetons.
- Jamais d'achat direct d'or ou de troupes, aucun paiement dans les bêtas.

## 6. Découpage
- **V14.0** : retours V13.4, puis points 1 et 2 de la section 3. (fait)
- **V14.1** : points 3 à 6 de la section 3. (fait)
- **V14.2** : retours de bêta de la V14.1 (section 2, points 1 à 8).
- **V14.3** : tutoriel de quelques tours, facultatif et rejouable à tout moment depuis le menu (section 2, point 9).
- **V14.4** : préparation Google Play (section 4) — c'était l'ancienne V14.2.
- Après la V14.4, bilan avec Jack : on publie en test interne, ou ARKEN passe en pause (section 1).

## 7. Règles (inchangées, voir `CLAUDE.md`)
- Une version à la fois et un test par correctif.
- Vérification dans Chrome mobile simulé, puis relecture indépendante.
- Fusion seulement avec l'accord de Jack écrit dans la conversation.

## Réalisé

### V14.0.0 — trêve rompue, rappel des troupes, convois sauvés (20/10/2026)
Faite avant les retours de dimanche (section 2 non commencée, rien d'inventé).
1. **Trêve rompue puis rejouée** (section 3, point 2) : rompre un cessez-le-feu signé depuis **moins de 10 tours**
   (`TRUCE_BETRAYAL_TURNS`) est une **trahison**, pour le joueur comme pour les IA, que ce soit par une déclaration de
   guerre ou par une attaque (terre ou débarquement) : même effet qu'une alliance trahie (événement public TRAHISON,
   compteur de trahisons, Traître révélé). Journal : « Trahison : X rompt la trêve signée il y a N tours… ». La nation
   trahie le dit dans les Échanges (18 nouvelles répliques propres à la trêve). Après 10 tours : guerre ordinaire, sans
   trahison. Ancienne sauvegarde (trêve sans date) : jamais une trahison.
   - **Fenêtre avant de rompre** : Diplomatie → Déclarer la guerre, préparation de l'attaque et confirmation de
     l'attaque affichent « ⚠ Trêve signée avec X il y a N tours : la rompre maintenant est une TRAHISON… Dans M tours,
     ce ne sera plus une trahison. »
   - IA : le Conquérant attend maintenant 10 tours (au lieu de 5) avant de reprendre une proie avec qui il a une trêve.
2. **L'IA rappelle ses troupes stationnées chez un allié** : quand le danger est passé (allié plus en guerre, pas
   attaqué depuis 3 tours, plus d'engagement « Défends-moi ») ou quand elle en a besoin chez elle (une de ses provinces
   ne tiendrait pas face à un voisin en guerre avec elle). Par la terre, par la mer, ou en marchant d'abord vers un port
   de l'allié si elles sont à l'intérieur des terres.
3. **Convoi parti du port d'un allié pendant une rupture d'alliance** : il ne disparaît plus. Il rentre au **port ami
   le plus proche** de son camp (à soi ou d'un allié, par les routes de la carte) ; sans port ami, il revient à son point
   de départ et y débarque, puis ses troupes sont rapatriées. Toujours une ligne au journal (MARINE).
4. **Journal de combat** : les PV perdus par les troupes alliées stationnées sont comptés à part (avant : tout au
   propriétaire de la province).
5. **Point 1 « l'allié vient vraiment défendre » — vérifié par simulation** (Valmorne joueur, alliée à Roc-Épine IA, en
   guerre contre Oroël, « Défends-moi » demandé, 6 parties par personnalité, 8 tours) :
   - avant correctif : Héros 6/6, Bâtisseur 5/6, Conquérant 4/6, Traître 0/6 (normal : il promet sans venir) — mais
     l'allié n'arrivait qu'au **tour 5**, après la chute de Branvale : la province menacée n'était pas joignable
     directement depuis Roc-Épine, donc il attendait qu'une autre province devienne menacée ;
   - **corrigé** : il fait escale dans une province du demandeur (Sylvaren) puis avance vers la province menacée ;
     il arrive maintenant au **tour 3** (mêmes taux : 6/6, 5/6, 4/6, 0/6 ; refus du Bâtisseur et du Conquérant = leur
     caractère). Simulation IA contre IA 12 parties × 70 tours : 33 passages, 27 rappels (24 « danger passé »,
     3 « besoin chez soi »), 18 trêves trahies, 0 troupe perdue en mer, 0 incohérence (jamais de troupes chez un
     non-allié, jamais alliés et en guerre).
- **Question ouverte** (guerre automatique des troupes stationnées) : non tranchée, ajoutée en section 2.

Relecture indépendante (20/10/2026) : un point bloquant corrigé — un allié IA qui tient un engagement d'aide
(« Défends-moi », « Attaque X avec moi ») déclarait la guerre à une nation avec qui il venait de signer une trêve, et
devenait donc « traître » malgré lui. Il respecte maintenant sa trêve tant qu'elle a moins de 10 tours (ni déclaration,
ni attaque) ; le Conquérant aussi ne frappe plus pendant une trêve récente.
### À surveiller (relecture)
- Un convoi qui débarque pendant une trêve signée après son départ mais dans le même inter-tour : il débarque quand même
  (comportement V13 inchangé) et c'est maintenant une trahison. Dans les simulations IA, cela touche surtout le Traître
  (≈ 9 cas sur 12 parties de 70 tours). Une correction essayée faisait baisser le taux de débarquements réussis de l'IA :
  laissée pour la V14.1.
- Des troupes à l'escale chez un allié peuvent être rappelées un tour avant d'avancer (va-et-vient possible, sans perte).

Tests : `tests/v14-0.test.js` (16 tests). Vérifié dans Chrome mobile simulé (390 × 844) : partie reprise avec une trêve
signée ce tour-ci, avertissement dans Diplomatie → Déclarer la guerre, dans la préparation du débarquement et dans sa
confirmation ; débarquement → journal « TRAHISON… rompt la trêve », réplique de Roc-Épine « Trahison ! Valmorne signe la
paix puis frappe aussitôt. » ; troupes d'Oroël stationnées à Branvale sans danger rappelées à Nordhème. Aucune erreur
JavaScript, aucun débordement horizontal.

### V14.1.0 — guerre automatique, bases navales, mer, répliques, carte centrée (20/10/2026)
1. **Guerre automatique** (décision de Jack, section 2) : dès que des troupes d'une nation combattent une autre nation, leur
   nation entre en guerre avec elle — pour le joueur comme pour les IA. Le cas nouveau est celui des **troupes stationnées
   chez un allié qui défendent sa province** (y compris les renforts envoyés par « Défends-moi ») ; les attaques, les chocs
   en rase campagne et les débarquements mettaient déjà en guerre, et une interception en mer n'a lieu qu'entre nations
   déjà en guerre.
   - Journal (public, rubrique GUERRE) : « ⚔ Vos troupes ont combattu X : vous êtes désormais en guerre avec X. Combat à
     P (en défendant Y). » ; côté assaillant : « ⚔ Les troupes de G ont combattu les vôtres à P… » ; pour les autres :
     « ⚔ Les troupes de G ont combattu X à P : G est désormais en guerre avec X. »
   - Une trêve existante avec X est rompue de fait, **sans trahison** (pas d'événement TRAHISON, pas de compteur, pas
     d'agression comptée) ; le journal le dit (« La trêve avec X est rompue, sans trahison : vous vous défendiez »).
   - Deux alliés ne se combattent jamais : un contingent allié de l'assaillant reste à l'écart du combat (pas de pertes, pas
     de guerre, alliance intacte). Une nation éliminée (ancienne sauvegarde) ne défend plus et n'entre jamais en guerre.
2. **Bases navales face à face** (section 3, point 3) : l'IA en guerre **attaque la base navale ennemie** au bout de sa
   route quand la simulation du combat naval montre qu'elle coule toute la flotte à quai (majorée de 30 %) en gardant des
   navires ; elle garde un navire au port, puis la flotte rentre (journal « Bataille navale devant le port de X… »). Et
   **elle cesse d'empiler** : sans aucune côte à viser par la mer, sa flotte s'arrête à 4 navires.
3. **L'IA prend un peu plus la mer** (point 4) : marge de débarquement 0,25 → 0,10, **sauf vers une capitale (0,35 : pas de
   débarquement suicide)** ; elle rassemble ses troupes au port d'embarquement plus tôt (dès la moitié des forces utiles) ;
   et elle **se souvient de la garnison** vue lors d'un assaut repoussé (toute une partie, tant que la province n'a pas
   changé de main) : plus de débarquements suicides répétés au même endroit (avant : le Traître retentait tous les ~20
   tours contre une garnison 4 fois plus forte). Le test « pas suicidaire » (`tests/v9-map.test.js`) reste vert.
4. **Répliques** (point 5) : un dirigeant ne reprend plus une réplique déjà envoyée **au même tour** par un autre dirigeant
   (en plus de ses 6 derniers messages).
5. **Carte au lancement** (point 6) : centrée sur la capitale du joueur (nouvelle partie et reprise), avec le zoom juste
   suffisant (au plus 1,5) ; bouton **« 🗺 Voir toute la carte »** en bas à gauche, qui devient « ◎ Revenir à ma capitale ».
   Le bouton ◎ du zoom ramène aussi à cette vue.
6. **« À surveiller » de la V14.0** :
   - Trêve signée dans le même inter-tour que le départ d'un convoi : le convoi fait **demi-tour** au lieu de débarquer
     (avant : débarquement = trahison). Un convoi parti alors que la trêve existait déjà débarque toujours (trahison).
   - **Plus de va-et-vient** : des troupes envoyées en aide restent au moins 5 tours chez l'allié (escale comprise), sauf
     si leur nation a besoin d'elles chez elle ; après un rappel « danger passé », le Héros ne revient que pour une
     **nouvelle** agression.

Simulation IA contre IA, 30 parties × 80 tours, V14.0 → V14.1 :

| Mesure | V14.0 | V14.1 |
|---|---|---|
| Débarquements (hors trêves trahies) | 210 | 222 |
| Débarquements réussis | 65 % | 65 % |
| Trêves trahies par un débarquement | 45 | 33 (le Traître, par caractère) |
| Navires en fin de partie (toutes nations) | 1 118 | 720 |
| Attaques de bases navales | 0 | 3 (3 réussies) |
| Même réplique au même tour par deux nations | 5 | 0 |
| Va-et-vient des troupes en escale | 7 | 0 |
| Incohérences (alliés en guerre, troupes chez un non-allié, guerre avec un éliminé) | 0 | 0 |

Test « pas suicidaire » (5 parties × 200 tours) : 54 → 66 débarquements, 61 % → 65 % réussis. Autres graines
(`tests/v14-1.test.js`, 30 parties) : 232 débarquements, 62 % réussis, 49 demi-tours pour trêve.
La guerre automatique reste rare entre IA (1 cas sur 30 parties) : l'IA compte les troupes alliées stationnées dans la
garnison et évite d'attaquer une province bien défendue.

Tests : `tests/v14-1.test.js` (17 tests) ; `tests/v13-3-paroles.test.js` adapté (un autre dirigeant ne reprend plus la
réplique au même tour).
Vérifié dans Chrome mobile simulé (390 × 844) : nouvelle partie avec Valmorne → la capitale est au milieu de l'écran (zoom
1,5, la côte vers Roc-Épine visible) ; « Voir toute la carte » montre les cinq îles, le bouton devient « Revenir à ma
capitale » et y ramène ; même vue en reprenant une partie ; partie reprise avec des troupes de Valmorne stationnées à
Roc-Épine, attaquée par Noireflamme → journal « ⚔ Vos troupes ont combattu Noireflamme : vous êtes désormais en guerre
avec Noireflamme. Combat à Roc-Épine (en défendant Roc-Épine). » Aucune erreur JavaScript, aucun débordement horizontal.

Relecture indépendante (20/10/2026) : rien de bloquant. Corrigé : sur un écran presque carré (la carte entière tient déjà),
le bouton « Voir toute la carte » est masqué.
### À surveiller (relecture)
- La guerre automatique est rare entre IA (elles évitent d'attaquer une province bien défendue) : à regarder en bêta,
  surtout quand Jack poste des troupes chez un allié.
- La vue de lancement laisse une bande de mer en haut pour Valmorne et Oroël (capitales collées au bord de la carte).


### V14.2.0 — retours de bêta de la V14.1 (25/10/2026)
Section 2, points 1 à 8. Le tutoriel (point 9) est la V14.3, la préparation Google Play la V14.4.

1. **Aide d'alliance — « 5 tours » sans ambiguïté.** Diagnostic dans le code : l'engagement durait 5 tours **à partir de
   l'acceptation, trajet compris**. Or un allié met 2 tours de mer (souvent davantage avec une escale) : il n'aidait
   vraiment que 2 ou 3 tours. **Règle corrigée** : l'aide dure **5 tours une fois les troupes arrivées** ; le trajet
   estimé (1 tour par la terre, la durée de la traversée par la mer, +1 tour d'escale, au plus 4) s'ajoute.
   - Journal : « Roc-Épine accepte de vous défendre : ses troupes partent maintenant, arrivée estimée dans 2 tours, puis
     elles vous aident pendant 5 tours (engagement jusqu'au tour 8). » Vérifié : les troupes arrivent bien au tour annoncé.
   - Fenêtre « Aide de X » : « en route : arrivée estimée dans 2 tours, puis aide pendant 5 tours », puis « aide sur
     place : encore N tours ». Allié sans route directe (ex. Solmara pour Valmorne) : le message le dit (« ses troupes
     risquent de ne pas venir ») au lieu d'inventer une date.
2. **Hostilité : avertissement à 70 %, guerre automatique à 85 %.** Diagnostic : en V14.1, **aucune règle** ne
   déclarait la guerre à 100 % ; seule l'IA avait un petit risque de guerre par tour au-delà de 75 % (4 à 12 %), et
   jamais le joueur. Simulation V14.1 : 1 898 tours où une paire de nations restait à 85 % ou plus sans guerre.
   - Fin de chaque tour (après combats et échanges) : tension ≥ **70 %** → **avertissement** au journal (« ⚠ HOSTILITÉ :
     dès 85 % (à partir du prochain tour), la guerre sera déclarée ») ; tension ≥ **85 %** et averti lors d'un tour
     précédent → **guerre déclarée** (« ⚔ GUERRE DÉCLARÉE », public). L'avertissement arrive toujours au moins un tour
     avant (un message hostile fait +20 d'un coup). Même règle pour le joueur et pour les IA.
   - Ce n'est pas une agression : ni trahison, ni réputation, ni indignation des Héros.
   - **Alliance ou trêve** : elles protègent ; tant qu'elles tiennent, la tension est plafonnée à 84 %.
   - **Après la déclaration** : la jauge affiche « En guerre » et ne redescend pas sous 70 % tant que dure la guerre
     (règle V13) ; une trêve la ramène à 40 % au plus. Retombée sous 70 % sans guerre : l'avertissement est oublié.
   - Le palier « au bord de la guerre » commence maintenant à 70 % (avant 75 %).
3. **Traits des dirigeants plus marqués.**
   - **Conquérant** : une provocation (message hostile) fait **+35** au lieu de +20, et l'insolent devient sa **cible**
     pendant 8 tours (sauf allié ou trêve récente). Il accepte des combats plus serrés (marge 0,95 au lieu de 1,0 ; 0,8 en
     guerre), vise une 2e proie dès 1,25 fois sa force (avant 1,5) et peut lancer **2 attaques terrestres par tour**.
   - **Héros naïf** : un message amical fait **−14** au lieu de −7 et il s'en souvient (charme, 12 tours) : alliance
     acceptée jusqu'à 65 % de tension ; **3 amabilités lui font oublier une agression** (et même un Traître démasqué) ;
     2 amabilités et il accepte d'« attaquer X avec vous » ; il épargne un agresseur très aimable. Un message hostile
     rompt le charme.
   - **Bâtisseur** : une provocation ne fait que **+8** ; la tension avec lui retombe **deux fois plus vite** ; une
     querelle de son allié ne lui fait que +5 (au lieu de +20). Il déclare rarement la guerre (petit risque entre 70 et
     85 %, comme avant), mais la guerre automatique à 85 % le concerne comme les autres.
   - **Traître** : il peut prendre pour cible **n'importe quel allié** dès que c'est payant (allié depuis 5 tours, et
     plus faible : 85 % de sa force s'il est occupé ailleurs, 60 % sinon), y compris une **ancienne victime** ; il passe
     à la cible suivante 6 tours après son coup (avant 12) ; à partir du tour 10, il courtise aussi d'autres voisins
     calmes (2 alliés au plus) pour avoir plusieurs nations à trahir.
   - L'aperçu de tension d'un message ne montre l'effet propre au trait que si le dirigeant est révélé (rien n'est dévoilé).
4. **Débarquement : assaillant à 85 %** (au lieu de 70 %). Jack proposait de supprimer le malus ; **décision du chef de
   projet : le réduire sans le supprimer** (carte d'îles : sans malus, les IA enchaîneraient les débarquements).
   Calibrage (simulation IA contre IA, 40 parties × 80 tours, et calcul des troupes nécessaires) :

   | Malus | Débarquements | Réussis | Troupes pour prendre une province (fort 1), terre = 240 | Capitale (fort 2) |
   |---|---|---|---|---|
   | 70 % (V14.1) | 298 | 59 % | 300 (+25 %) | 440 |
   | 80 % | 312 | 62 % | 280 (+17 %) | 400 |
   | **85 % (retenu)** | 307 | 63 % | **260 (+8 %)** | 360 |
   | 90 % | 319 | 61 % | 240 (+0 %) | 360 |
   | 100 % (supprimé) | 315 | 65 % | 240 (+0 %) | 320 |

   **Pourquoi 85 %** : c'est le dernier palier où débarquer coûte encore un peu plus cher qu'attaquer par la terre
   (+8 % de troupes) ; à 90 %, le malus ne change déjà plus rien dans les cas courants. Le jeu reste équilibré : le
   nombre de débarquements des IA ne s'envole pas (≈ +3 %), leur taux de réussite non plus. Les rapports de combat
   affichent le vrai chiffre (« débarquement : assaillant à 85 % » ; un ancien rapport garde « 70 % »).
5. **Recrutement : PV et dégâts de chaque troupe.** Toucher le nom (« Infanterie ⓘ PV et dégâts ») ouvre un panneau sous
   la ligne : « 200 PV · 100 dégâts par assaut **par lot de 20 fantassins** — soit 10 PV et 5 dégâts par fantassin »,
   « 175 PV · 100 dégâts par lot de 5 cavaliers », « 240 PV · 120 dégâts **par unité** (1 blindé par lot) », coût,
   délai, points forts et faibles, effet du débarquement. Ce bouton est séparé des + / − et ne touche jamais aux lots :
   **ouvrir le détail ne recrute jamais**.
6. **Navires en convalescence.** « En convalescence » = navires **blessés** : ils ont perdu des PV et tirent moins fort.
   - Dans un **port construit** (le sien, ou celui d'un allié où ils stationnent) : **100 % des PV en 3, 4 ou 5 tours**
     selon les dégâts (jusqu'à 15 % des PV perdus → 3 tours, jusqu'à 30 % → 4, au-delà → 5). Avant : 10 % par tour,
     où qu'ils soient (jusqu'à 5 tours, même sans port).
   - Sans port construit : réparations de fortune, 5 % par tour. En mer : aucune réparation. Nouveaux dégâts pendant la
     réparation : délai recalculé.
   - Fiche de la province : « ⚓ 3 navires de guerre en convalescence : 1 100 / 2 100 PV (52 %) · réparés au port :
     100 % dans 5 tours », avec l'explication en dessous.
7. **Phrases deux fois plus variées** : chaque liste de messages du joueur, de réponses et de voix des dirigeants, de
   messages que les dirigeants envoient d'eux-mêmes (trahisons, avertissements, offres de trêve…) (`talk-v14-2.js`), et
   chaque liste de réponses des alliés aux demandes d'aide (`alliances-v14-2.js`), reçoit autant de nouvelles
   répliques qu'elle en avait (1 074 répliques au lieu de 537 dans talk.js ; 242 réponses d'aide au lieu de 121).
   Mêmes règles qu'en V13.3 (ton, personnalité, pas d'insulte, pas de commerce, anti-répétition). Les réponses d'aide
   ne promettent plus une arrivée immédiate (« nos troupes se mettent en route »), cohérentes avec l'arrivée estimée.
8. **Rapports de conquête** : un saut de ligne avant « PV perdus, blessés compris : … ». Rien d'autre ne change.
9. **Aperçu de tension d'un message (relecture)** : honnête sans rien dévoiler. Caractère inconnu : effet habituel
   et « jusqu'à N % selon son caractère » ; plafond d'alliance ou de trêve annoncé (« plafonnée à 84 % par votre
   alliance ») ; « ⚠ dès 85 %, guerre déclarée automatiquement » quand le message peut l'atteindre ; la pastille de
   tension rappelle « guerre auto à 85 % » dès 70 %. Au journal, le passage à « au bord de la guerre » n'est plus
   doublé : seul l'avertissement d'hostilité s'affiche.

**Simulation IA contre IA, 30 parties × 80 tours (graines `v142-0` à `v142-29`, `tools/simulation/v14-2-bilan.mjs`)** :

| Mesure | V14.1 | V14.2 |
|---|---|---|
| Paires restées à 85 % ou plus sans guerre (tours cumulés) | 1 898 | 27 (le tour qui suit l'avertissement) |
| Guerres déclarées par l'hostilité / avertissements | 0 / 0 | 41 / 68 |
| Assauts par partie : Conquérant / Traître / Héros / Bâtisseur | 5,9 / 4,1 / 2,1 / 0,8 | 5,8 / 4,1 / 1,9 / 0,8 |
| Trahisons du Traître par partie | 2,0 | 2,2 |
| Parties où le Traître trahit deux nations différentes ou plus | 5 / 30 | 9 / 30 |
| Débarquements / réussis | 220 / 61 % | 233 / 64 % |
| Classement final, 1er : Conquérant / Traître / Héros / Bâtisseur | 12 / 12 / 5 / 1 | 11 / 16 / 2 / 1 |

**Note d'équilibrage** : entre IA, l'écart entre les personnalités était déjà net et le reste (le Conquérant attaque
3 fois plus que le Héros, 7 fois plus que le Bâtisseur). Les nouveaux traits jouent surtout **face au joueur** : ils
réagissent à ses messages (provocations, amabilités), ce que les IA entre elles n'échangent que rarement. Les scénarios
reproductibles de `tests/v14-2.test.js` le vérifient : un Conquérant provoqué déclare la guerre au joueur alors qu'il le
laissait tranquille ; trois messages amicaux font accepter au Héros l'alliance d'un agresseur ; quatre provocations ne
mettent pas un Bâtisseur en colère ; le Traître trahit l'allié le plus faible (pas sa cible prévue) puis le retrahit.
Le Conquérant n'attaque pas beaucoup plus entre IA : il est limité par la taille de son armée, pas par le choix de ses
cibles (un essai « moins de banques, plus d'armée » n'a rien changé et a été retiré). Le Traître gagne un peu plus
souvent (16 parties sur 30) : à surveiller en bêta.

Relecture indépendante (25/10/2026) : rien de bloquant. Corrigé : messages des IA (14 listes `ai.*`) pas encore
doublés ; aperçu de tension trompeur avant la guerre automatique ; double ligne au journal à 70 % ; accord « réparés »
au singulier ; phrases d'alliés « nous arrivons » ; cahier (Bâtisseur) ; l'essai d'une 2e attaque après un ordre refusé
est réservé au Conquérant (comportement V14.1 conservé pour les autres).

Vérifié dans Chrome mobile simulé (393 × 852, Android) : version « v14.2.0 » en haut à gauche ; journal (aide « arrivée
estimée dans 2 tours, puis… pendant 5 tours », avertissement d'hostilité, rapport de conquête avec saut de ligne et
« assaillant à 85 % ») ; fiche de Sylvaren (navires en convalescence, PV et tours restants) ; recrutement (détail ouvert
et refermé, coût toujours 0 or, aucun lot ajouté) ; fenêtre « Aide de Roc-Épine » ; fin de tour → « ⚔ GUERRE DÉCLARÉE »
avec Oroël à 97 %. Aucune erreur JavaScript, aucun débordement horizontal.

### À surveiller (V14.2)
- Le Traître finit premier un peu plus souvent (16 parties sur 30 contre 12) : à regarder en bêta.
- Les nouveaux traits jouent surtout face au joueur (ses messages) : c'est en partie réelle qu'il faut les sentir.
- Le trajet d'aide est une estimation (route la plus courte, au plus 4 tours) : une flotte ennemie ou une escale imprévue
  peut retarder l'arrivée.

Tests : `tests/v14-2.test.js` (25 tests) ; adaptés : `v11-personnalites` (palier à 70 %), `v13-alliances` (durée de
l'aide, Bâtisseur, propositions du Traître à d'autres nations), `ui-v10` et `combat-v10` (85 %), `v13-3-paroles`
(réponses d'aide doublées vérifiées). 375 tests au vert.

### V14.3.0 — tutoriel facultatif et rejouable (25/10/2026)
Section 2, point 9. Il prolonge le mini tuto de la V13.4 (même bulle, mêmes gestes) au lieu de le doubler : le mini tuto
reste pour la première vraie partie de ceux qui passent le tutoriel ; un tutoriel terminé compte comme mini tuto vu.

1. **Facultatif** : au tout premier lancement, une fenêtre propose « 🎓 Un tutoriel pour commencer ? » → **Jouer le
   tutoriel** / **Passer**. Proposée une seule fois (clé `frontieres-arken-tutoriel-propose`), jamais imposée.
2. **Rejouable à tout moment** : bouton « 🎓 Tutoriel » sur l'accueil (« Reprendre le tutoriel » s'il est en pause) et
   « 🎓 Jouer le tutoriel » dans ⚙ Paramètres (repart du début).
3. **Partie d'entraînement à part** : sauvegarde distincte `frontieres-arken-tutoriel-save`. La clé de la vraie partie
   `frontieres-arken-v2-save` n'est jamais lue ni écrite par le tutoriel (le jeu sauvegarde toujours sous la clé de la partie
   affichée). **Quitter** (bouton de la bulle, ou l'accueil) garde le tutoriel en pause ; « Continuer la partie » retrouve la
   vraie partie intacte. Fin du tutoriel : sa sauvegarde est effacée, retour à l'accueil. Pas d'atouts ni de missions dans le
   tutoriel.
4. **Scénario fixe, vrai moteur** (`src/presentation/v14-3-tutoriel.js`) : Valmorne contre un monde calme ; seul Roc-Épine
   est dirigé par l'IA (Héros caché : il accepte l'alliance et l'aide selon les vraies règles) ; tension de départ avec Oroël
   à 60 % ; à Branvale un port construit, 3 navires et 160 fantassins + 10 cavaliers ; à Nordhème (Oroël) un port et
   1 navire. Aucun résultat n'est truqué : tout passe par `resolveInterturn`.
5. **26 étapes sur 8 tours**, chacune avec un objectif concret (👉) ; elle avance quand le joueur fait le geste :
   - tour 1 : la carte et vos provinces → déplacer des troupes (Valmorne → Sylvaren) → fin du tour → le journal ;
   - tour 2 : recrutement (bouton ⓘ PV et dégâts, puis 1 lot) → construire une banque (30 or, 3 tours, +3 or/tour) ;
   - tour 3 : diplomatie (tension 60 %, avertissement à 70 %, guerre automatique à 85 %) → message hostile → « ⚠ HOSTILITÉ » ;
   - tour 4 : proposer l'alliance à Roc-Épine → 2e message hostile → « ⚔ GUERRE DÉCLARÉE » et alliance conclue ;
   - tour 5 : demander de l'aide (« arrivée estimée dans 2 tours, puis 5 tours d'aide ») → les ports → débarquement escorté
     sur Nordhème (2 tours en mer, troupes à 85 %) ;
   - tours 6-7 : convoi intercepté et protégé par l'escorte → rapport de conquête (saut de ligne, « assaillant à 85 % »)
     → navires blessés au port (« 100 % dans 3 tours ») ;
   - tour 8 : renforts de Roc-Épine stationnés à Sylvaren → fin de partie (80 tours, 5 capitales) et classement réel
     → « Tutoriel terminé ! ».
   Les chiffres affichés sont lus dans le moteur (`RULES`, `HELP_TURNS`, seuils d'hostilité) : une règle qui change
   change la bulle. Si le joueur s'écarte (débarquement trop faible : conseil ; Nordhème non prise ; renforts pas encore
   là), les textes s'adaptent à ce qui s'est vraiment passé. « Passer l'étape › » débloque toujours.
6. **Lisible sur téléphone** : la bulle (en haut ou en bas, sous la barre d'état et au-dessus de la barre du bas, safe
   areas comprises) se place à l'opposé de ce qu'il faut toucher ; la cible est entourée de vert et pulse ; la carte se
   centre sur la province à toucher si elle est hors de l'écran.

Tests : `tests/v14-3-tutoriel.test.js` (10 tests) — ordre pédagogique, chiffres lus dans le moteur, scénario identique à
chaque lancement, **parcours complet joué avec le vrai moteur** (avertissement, guerre à 85 %, alliance, aide, prise de
Nordhème, navires au port, renforts, classement), débarquement minimal et cas d'échec, **sauvegarde de la vraie partie
jamais écrasée** (démarrer, jouer, quitter, reprendre, finir), proposition unique, rejouer. 386 tests au vert.

Vérifié dans Chrome mobile simulé (393 × 852, Android) : proposition au premier lancement (Passer), vraie partie lancée
avec Oroël, puis tutoriel depuis l'accueil, les 26 étapes jouées au doigt (chaque cible surlignée, jamais cachée par la
bulle), « Quitter » au tour 7 → accueil avec « Reprendre le tutoriel » → reprise à la bonne étape → fin → la vraie partie
reprend au tour 1 avec Oroël, sauvegarde identique octet pour octet ; Paramètres → « Jouer le tutoriel » repart à l'étape 1.
Aucune erreur JavaScript, aucun débordement horizontal.

### À surveiller (V14.3)
- Le scénario rend le tutoriel sûr (une seule IA, les autres nations ne bougent pas) : c'est voulu pour apprendre, mais une
  vraie partie est plus agitée. La dernière bulle le dit implicitement ; à voir avec Jack si une phrase de plus est utile.
- La proposition au premier lancement apparaîtra aussi une fois chez les joueurs qui ont déjà une partie (Jack) : un
  simple « Passer » suffit.
