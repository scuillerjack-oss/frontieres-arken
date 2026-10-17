# FRONTIÈRES: ARKEN — V13 — Cahier des charges

> Issu de la bêta V12.2 de Jack (16/10/2026, partie Valmorne, tours 1 à 15) et du brainstorming qui a suivi.
> Toutes les décisions ci-dessous ont été validées par Jack. Part de la V12.2.

## 1. Mer — refonte complète (priorité n°1 : la bêta a été arrêtée à cause de la mer)
- **Anneau de 5 routes** : les 5 îles sont reliées en cercle, chaque île à ses **2 voisines** uniquement.
  Aucun croisement de routes. Les îles éloignées restent atteignables en passant par une escale.
  Routes et points de port redessinés pour être parfaitement lisibles (quitte à déplacer les points de port).
- **Points d'embarquement** : ils existent dès le tour 1 à chaque emplacement de port. On embarque et on débarque
  **uniquement** à ces points, **jamais** sur une province voisine (fin des débarquements « surprises » hors port).
  Un point de port conquis permet de rembarquer : personne ne peut plus être coincé.
- **Port construit + usine** : nécessaires pour construire des **navires de guerre**, qui font la différence en mer.
- Trajets dans les deux sens sur la même route, toujours.
- Ports colorés selon leur propriétaire ; routes neutres ; suppression des routes « jaunes » héritées de la V9.

## 2. Vision (brouillard de guerre) — remplace le ballon d'observation
- **Le ballon d'observation est supprimé.**
- Une province où le joueur a **au moins une troupe** révèle ce qui se passe dans les provinces **voisines par voie
  terrestre** uniquement (pas par la mer). Au-delà d'une province, on ne voit rien.
- **Forteresse** : les troupes à l'intérieur sont cachées (on ne sait pas combien elles sont) ; les bâtiments restent visibles.
- **Les alliés partagent leur vision.**
- **L'IA joue avec le même brouillard** (équité).

## 3. Combats : points de vie lisibles
- **Une seule barre par province** (le régiment), en **chiffres** : « Régiment : 344 PV · 52 dégâts par assaut ».
  Plus de pourcentages ni de barres multiples.

## 4. Alliances
- Pas de guerre entre alliés ; vision partagée.
- **Demandes d'aide** : « défends-moi » ou « attaque X avec moi ». L'allié accepte ou refuse **selon son caractère**
  (le Héros vient défendre, le Bâtisseur refuse souvent d'attaquer, le Traître accepte… et ne vient pas). Pas de paiement.
- Propositions d'alliance reçues dans une **fenêtre Oui / Non** juste après le journal de fin de tour.
- Aucune proposition d'alliance d'une nation déjà alliée.

## 5. Échanges publics
- Messages **hostiles plus piquants** (provocation, humour, sans insulte) ; vraie gradation hostile / neutre / amical.
- Une conversation se termine : plus de bouton « Répondre » une fois répondu, notification effacée, pas de réponse en écho.
- **Tension en %**, cohérente avec les faits : une menace ou une provocation la fait bondir ; une attaque déclare
  la guerre immédiatement (plus de « au bord de la guerre » après un combat).

## 6. Début et déroulé de partie
- **Petit récit d'introduction** : « Parmi les 4 dirigeants se cachent un héros, un conquérant, un traître et un bâtisseur… »
- **Prise de capitale** : fenêtre dédiée impossible à rater (« 👑 Capitale conquise ! Vous pillez X or ») avec un
  minimum garanti pour que la prise rapporte toujours quelque chose de marquant.

## 7. Écran
- Carte coupée à droite sur le téléphone de Jack : recadrage complet (aucun élément hors écran).
- Liseré bleu de son territoire **plus épais**, visible au premier coup d'œil.

## Hors périmètre
Pas de remboursement des ballons dans les anciennes parties (Jack recommence une partie à chaque bêta).

## Réalisé (V13.0.0, 17/10/2026)
Travail en 3 équipes parallèles (une branche chacune), fusionnées sur `mission/V13-mer-vision-alliances`.
Détails : `docs/V13-marine.md`, `docs/V13-vision.md`, `docs/V13-alliances-echanges.md`.

- **Mer** : anneau de 5 routes droites, toutes en 2 tours : Branvale p03 ↔ Nordhème p14, Glacenoire p13 ↔ Noireflamme p09,
  Grèsrouge p11 ↔ Lunémont p19, Aurorelle p17 ↔ Belrivage p07, Roc-Épine p05 ↔ Sylvaren p02. Ancres de port déplacées pour
  traverser les détroits ; aucun croisement (vérifié par test géométrique). Embarquement depuis tout point de port possédé
  dès le tour 1, débarquement uniquement au point de port d'en face ; un point de port conquis permet de rembarquer.
  Navire de guerre = port construit + usine. Ports aux couleurs du propriétaire (pointillés = point d'embarquement,
  plein cerclé d'or = port construit) ; routes neutres, plus de jaune.
- **Vision** : ballon supprimé (schéma de sauvegarde 9, ballons retirés sans remboursement). Une troupe terrestre révèle
  les provinces voisines par la terre ; jamais par la mer. Forteresse ennemie = troupes cachées, bâtiments visibles.
  Alliés : vision partagée. L'IA utilise le même brouillard (estimation prudente `RULES.vision` quand elle ne voit pas).
- **PV** : une ligne « Régiment : X PV · Y dégâts par assaut », avec la composition en petit dessous.
- **Alliances** : pas de guerre ni d'attaque entre alliés (action « Rompre l'alliance » ; rompre puis attaquer = trahison).
  Demandes d'aide « Défends-moi » / « Attaque X avec moi », réponse selon le caractère, effet réel 5 tours.
  Propositions (alliance, cessez-le-feu) dans une fenêtre Oui / Non après le journal ; plus de proposition d'un allié.
- **Échanges** : plus de 150 répliques, hostiles piquantes sans insulte ; conversation close (plus de « Répondre »,
  badge effacé, pas d'écho) ; tension en % ; « En guerre » dès qu'il y a guerre ; menace +20.
- **Début de partie** : récit « Quatre masques ». **Capitale** : fenêtre « 👑 Capitale conquise ! Vous pillez X or »
  avec minimum garanti `RULES.capitalPlunderMin = 60`, et « Votre capitale est tombée ».
- **Écran** : la grille ne dépasse plus la largeur du téléphone (débordait de 11 px à 393 px) ; version toujours visible ;
  liseré bleu 28 px au lieu de 16.

### Corrections après relecture indépendante
- Un cessez-le-feu accepté (Oui) pendant qu'un convoi ennemi est en mer : le convoi fait demi-tour (avant : il débarquait
  et rouvrait la guerre). Un convoi parti alors que la trêve existait déjà reste une violation et débarque.
- « Attaque X avec moi » ne propose que les nations que l'allié peut atteindre par l'anneau ; sinon refus motivé.
- L'IA marine ne lit plus les navires réels d'un port qu'elle ne voit pas ; marge de débarquement 0,25 (60 % de réussite).

### À surveiller en bêta
- L'IA prend moins la mer (brouillard + anneau) : environ 50 débarquements sur 60 tours contre 105 en V12.
- 4 capitales sur 5 sont des points de port ; Glacenoire ↔ Noireflamme relie deux capitales.
- Deux bases navales face à face peuvent s'accumuler sans s'attaquer.
- « Défends-moi » : l'allié renforce sa propre base navale et combat l'agresseur, mais ne peut pas poster de troupes chez toi.
- Au lancement, sur un écran de 393 px, la carte montre l'ouest (ta capitale) : l'est se voit en glissant ou en dézoomant.
