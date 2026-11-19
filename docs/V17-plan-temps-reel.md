# FRONTIÈRES: ARKEN — V17 — plan du passage au temps réel (proposition du 19/11/2026)

> Demande de Jack (19/11/2026) : le jeu passe du tour par tour au **temps réel**. Une fois la partie lancée, le temps
> ne s'arrête plus (sauf si le joueur appuie sur Pause) : 1 jour = 2 secondes, or et nourriture gagnés chaque jour,
> nouvelle construction **ferme** (nourriture), consommation de nourriture par les troupes, diplomatie inchangée,
> alertes qui n'arrêtent jamais le temps, ballon reconstructible après avoir été abattu (déjà le cas en V16.1),
> carte qui boucle comme un globe (on sort à gauche, on revient à droite), pubs calculées sur le temps de jeu,
> offre Premium à 1,99 € qui débloque la vitesse ×2.
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
| V17.3 | **Interface temps réel** : ▶ Play / ⏸ Pause (gratuits), plus de bouton Fin du tour, ordres immédiats, alertes en bandeau qui n'arrêtent jamais le temps, journal en direct. | V17.1 |
| V17.4 | **Fermes et nourriture** : ferme (plafond par province calculé par simulation, ~5), production et consommation quotidiennes, famine (les troupes perdent des PV puis désertent). | V17.1 |
| V17.5 | **IA et diplomatie en temps réel** : l'IA décide toutes les quelques secondes, propositions avec délai de réponse, ballon et île en jours. | V17.2, V17.4 |
| V17.6 | **Carte « globe »** : défilement horizontal sans fin (on revient de l'autre côté), finitions visuelles d'après le jeu de référence de Jack. | — (en parallèle) |
| V17.7 | **Monétisation** : pub récompensée disponible toutes les 5 à 10 min de jeu (icône discrète sur le côté), pub imposée calculée sur le temps de jeu, offre Premium 1,99 € (vitesse ×2), fiche de rentabilité recalculée. | V17.3 (en parallèle de V17.4-5) |
| V17.8 | **Équilibrage et finitions** : durée d'une partie en jours, fin de partie, tutoriel refait, palmarès et titres adaptés ; retrait du tour par tour et du réglage « Classique ». | tout |
| V17.9 | **Bêta Google Play** (test interne puis fermé) et corrections. | V17.8 |

**10 versions.** Deux équipes peuvent avancer en même temps : la carte (V17.6) dès le début, la monétisation (V17.7)
dès que l'interface existe. Durée estimée : 2 à 4 semaines de calendrier selon le quota et le rythme des bêtas.

## Points à trancher (dans le cahier V17.0)
1. **Durée d'une partie.** Proposition : environ 3 h de jeu effectif en vitesse normale (≈ 5 400 jours), réparties
   sur plusieurs sessions ; une partie courte d'environ 1 h 30.
2. **Pub imposée.** Les règles du studio disaient « jamais de pub pendant qu'on joue » ; Jack propose une pub imposée
   toutes les ~10 min de jeu. Proposition : elle ne coupe jamais une action ; elle passe au moment où le joueur met
   en pause, ouvre le menu ou revient dans le jeu, au plus une fois toutes les 10 min ; jamais pour un Premium.
3. **Premium à 1,99 €.** Proposition : **achat unique, à vie** (pas d'abonnement à gérer, mieux vu des joueurs) :
   vitesse ×2 et plus de pub imposée ; les pubs récompensées restent possibles.
4. **Carte « globe »** : nom du jeu de référence à fournir par Jack.

## Recommandation de Claude
Faire la V17 dans une branche longue, avec le jeu actuel (V16) toujours jouable et publiable à côté. Le passage
du tour par tour au temps réel ne se fait dans `main` qu'une fois la V17.8 validée en bêta par Jack.
