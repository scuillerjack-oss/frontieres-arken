# FRONTIÈRES: ARKEN — V14 — Cahier des charges (préparé le 20/10/2026, à valider avec Jack dimanche)

> **Où on en est (20/10/2026, soir)** : V14.0 faite, testée (333 tests) et fusionnée. Prochaine étape : **V14.1**
> (guerre automatique des troupes qui combattent, décidée par Jack, puis points 3 à 6 de la section 3).
> Les retours de Jack sur la V13.4 (section 2) restent à recueillir dimanche.

## 1. Principe
- La V14 suit la V13.4 (retours de bêta du 20/10 : passage automatique chez l'allié, % de la forteresse affichés,
  mini-tuto à la première partie). Elle commence **dimanche**, quand le quota de Jack repart.
- **Point de décision fixé par Jack** : il s'est donné jusqu'à fin octobre environ. Si après la V14 le jeu est encore
  loin du résultat voulu, ARKEN passe **en pause** au profit des projets plus légers (Supérette, RUPTURE). Ce n'est pas
  un abandon : le dépôt et les documents restent prêts à reprendre.
- La V14 vise donc deux choses : finir les points ouverts du gameplay, puis rendre le jeu **publiable en test interne
  Google Play**.

## 2. Retours de bêta de la V13.4 (à remplir avec Jack dimanche)
- Jack joue une partie sur la V13.4 et note ce qui ne va pas, comme d'habitude.
- Ces retours passent **en priorité** devant le reste de ce cahier.
- À vérifier en particulier : le mini-tuto est-il clair ? Le passage chez l'allié marche-t-il dans une vraie guerre ?
- **Décision de Jack (20/10/2026)** : « si mes troupes affrontent qui que ce soit, même pour défendre un allié, ça me
  met en guerre avec ; au joueur de gérer ses choix politiques après. » → **guerre automatique**, à faire en V14.1,
  pour le joueur comme pour les IA, avec une ligne claire au journal (« ⚔ Vos troupes ont combattu X : vous êtes
  désormais en guerre avec X »). Si une trêve récente existait avec X, ce n'est **pas** une trahison (on défendait).

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

## 6. Découpage proposé
- **V14.0** : retours V13.4 (section 2), puis points 1 et 2 de la section 3.
- **V14.1** : points 3 à 6 de la section 3.
- **V14.2** : préparation Google Play (section 4).
- Après la V14.2, bilan avec Jack : on publie en test interne, ou ARKEN passe en pause (section 1).

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
