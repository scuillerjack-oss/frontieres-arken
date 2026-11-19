# FRONTIÈRES: ARKEN — V17 — plan du passage au temps réel (proposition du 19/11/2026)

> Demande de Jack (19/11/2026) : le jeu passe du tour par tour au **temps réel**. Une fois la partie lancée, le temps
> ne s'arrête plus (sauf si le joueur appuie sur Pause) : 1 jour = 2 secondes, or et nourriture gagnés chaque jour,
> nouvelle construction **ferme** (nourriture), consommation de nourriture par les troupes, diplomatie inchangée,
> alertes qui n'arrêtent jamais le temps, ballon reconstructible après avoir été abattu (déjà le cas en V16.1),
> carte qui boucle comme un globe (on sort à gauche, on revient à droite), pubs calculées sur le temps de jeu,
> offre Premium à 1,99 € qui débloque la vitesse ×2.
> Compléments de Jack (19/11, 17 h 37) : troupes et navires **visibles qui se déplacent** sur la carte (une icône de
> char ou de navire qui avance par à-coups le long de la flèche, pas d'animation fluide) ; famine avec un vrai malus ;
> tutoriel entièrement refait, précis et rejouable ; une seule partie à la fois, recommençable à tout moment (même
> nation ou une autre, tout est perdu) ; fin de partie : conquête du monde, sinon environ 3 h avec un classement à
> points consultable en direct ; fin proposée au joueur quand les dernières nations sont toutes alliées et en paix.
> Jeu de référence : **AM 3 / MA 3 – Simulateur du Président** (Oxiwyle) : temps réel, hors ligne, carte du monde,
> plus d'un million de téléchargements. Ses avis disent qu'on aime la profondeur et la carte, et que le principal
> reproche vient des pubs qui sortent le joueur du jeu ; l'éditeur vend une version Premium sans pub. On s'en inspire
> pour l'ergonomie (paysage, carte vivante), sans rien copier.
> Statut : **plan à valider par Jack** avant tout code.

## Ce qu'on garde
Carte Leonardo et ses 21 provinces, nations et caractères des dirigeants, combats à points de vie, marine et anneau,
île mystérieuse, ballon, diplomatie (alliances, trêves, aide, trahisons), coalition, atouts, palmarès, titres,
paysage. Le moteur reste pur et testé : un « jour » remplace le « tour » comme unité de temps.

## Les versions (une version = une bêta interne)

| Version | Contenu | Dépend de |
|---|---|---|
| V17.0 | Cahier des charges complet + simulations de calibrage (durées en jours, revenus, nourriture, vitesse des troupes). Aucun changement dans le jeu. | — |
| V17.1 | **Moteur en jours** : horloge (1 jour = 2 s, ×2 possible), revenus et production chaque jour, déplacements terrestres et maritimes qui durent des jours et **partent tout de suite**, rappel des troupes en route, sauvegarde. Nouveau mode à côté de l'actuel. | V17.0 |
| V17.2 | **Combats en temps réel** : une bataille dure quelques jours, les renforts arrivent pendant, sièges de forteresse, bombardement, convois et interceptions en mer en jours. | V17.1 |
| V17.3 | **Interface temps réel** : ▶ Play / ⏸ Pause (gratuits), plus de bouton Fin du tour, ordres immédiats, alertes en bandeau qui n'arrêtent jamais le temps, journal en direct. **Troupes et navires visibles** : icône (char, navire, ballon) qui avance chaque jour le long de la flèche de son trajet, aux couleurs de la nation, touchable pour voir l'armée (selon la vision). | V17.1 |
| V17.4 | **Fermes et nourriture** : ferme (plafond par province calculé par simulation, ~5), production et consommation quotidiennes. **Famine** (réserve à zéro) : dégâts au combat −30 % et chaque jour 1 % de l'armée déserte, jusqu'au retour de la nourriture. Alerte quand la réserve tombe sous 10 jours. | V17.1 |
| V17.5 | **IA et diplomatie en temps réel** : l'IA décide toutes les quelques secondes, propositions avec délai de réponse, ballon et île en jours. | V17.2, V17.4 |
| V17.6 | **Carte façon AM 3** (captures de Jack du 19/11) : carte en **plein écran**, boutons posés par-dessus aux bords (plus de colonne à droite) ; **défilement horizontal sans fin** (la carte se répète : on sort à droite, on revient par la gauche) ; zoom du monde entier jusqu'à une province ; territoires teintés aux couleurs de leur propriétaire par-dessus le relief Leonardo ; **grands noms de nations** en travers des îles, noms de provinces qui apparaissent en zoomant ; **pastille du nombre de troupes** sur chaque province (couleur selon ami / ennemi / inconnu) et drapeau-emblème sur les capitales ; détails qui apparaissent avec le zoom ; frontières épaisses de son empire ; **date** (« 12 mars, an 3 ») à la place du tour ; ▶ ⏸ ⏩ en bas à droite ; message d'événement en haut au centre. | — (en parallèle) |
| V17.7 | **Monétisation** : pub récompensée disponible toutes les 5 à 10 min de jeu (icône discrète sur le côté), pub imposée calculée sur le temps de jeu, offre Premium 1,99 € (vitesse ×2), fiche de rentabilité recalculée. | V17.3 (en parallèle de V17.4-5) |
| V17.8 | **Fin de partie et classement** : victoire immédiate par conquête du monde ; sinon fin à environ 3 h de jeu ; classement à points consultable à tout moment (provinces, capitales, troupes, or, jours sans famine…) ; fin proposée au joueur quand toutes les nations restantes sont alliées et sans combat entre elles depuis 90 jours (3 min), reproposée tous les 180 jours (6 min) s'il refuse. Une seule partie à la fois, « Nouvelle partie » à tout moment. Palmarès et titres adaptés. | V17.5 |
| V17.9 | **Tutoriel entièrement refait** (précis, pas à pas, rejouable depuis ⚙) ; équilibrage final ; retrait du tour par tour et du réglage « Classique ». | tout |
| V17.10 | **Bêta Google Play** (test interne puis fermé) et corrections. | V17.9 |

**11 versions (V17.0 à V17.10).** Deux équipes peuvent avancer en même temps : la carte (V17.6) dès le début, la monétisation (V17.7)
dès que l'interface existe. Durée estimée : 2 à 4 semaines de calendrier selon le quota et le rythme des bêtas.

## Points à trancher (dans le cahier V17.0)
1. **Durée d'une partie.** Retenu avec Jack : environ 3 h de jeu effectif en vitesse normale (≈ 5 400 jours), plus le
   classement à points ; la conquête du monde peut finir la partie bien avant. Repères : 1 jour = 2 s, 1 mois ≈ 1 min,
   1 an ≈ 12 min.
2. **Pub imposée.** Les règles du studio disaient « jamais de pub pendant qu'on joue » ; Jack propose une pub imposée
   toutes les ~10 min de jeu. Proposition : elle ne coupe jamais une action ; elle passe au moment où le joueur met
   en pause, ouvre le menu ou revient dans le jeu, au plus une fois toutes les 10 min ; jamais pour un Premium.
3. **Premium à 1,99 €.** Proposition : **achat unique, à vie** (pas d'abonnement à gérer, mieux vu des joueurs) :
   vitesse ×2 et plus de pub imposée ; les pubs récompensées restent possibles.
4. **Carte « globe »** : nom du jeu de référence à fournir par Jack.

## Recommandation de Claude
Faire la V17 dans une branche longue, avec le jeu actuel (V16) toujours jouable et publiable à côté. Le passage
du tour par tour au temps réel ne se fait dans `main` qu'une fois la V17.8 validée en bêta par Jack.
