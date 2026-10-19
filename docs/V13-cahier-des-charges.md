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

### Vérification dans Chrome mobile simulé (393 px, 18/10/2026)
Parcours réel joué jusqu'à la fin de partie (14 tours) : récit d'introduction, fiches sous brouillard (« effectif inconnu »),
ligne de PV, embarquement depuis un point de port dès le tour 1, convoi intercepté, « Votre capitale est tombée »,
cessez-le-feu en fenêtre Oui / Non, écran de défaite. Aucune erreur dans la console, aucun débordement horizontal.
Corrigé : sur la fiche d'une province, le bouton « Construire » dépassait de 3 px à droite et paraissait coupé.

### À surveiller en bêta
- Deux nations peuvent envoyer la même réplique hostile au même tour (« Belle attaque… ») : à varier si ça se voit trop.
- L'IA prend moins la mer (brouillard + anneau) : environ 50 débarquements sur 60 tours contre 105 en V12.
- 4 capitales sur 5 sont des points de port ; Glacenoire ↔ Noireflamme relie deux capitales.
- Deux bases navales face à face peuvent s'accumuler sans s'attaquer.
- « Défends-moi » : l'allié renforce sa propre base navale et combat l'agresseur, mais ne peut pas poster de troupes chez toi.
- Au lancement, sur un écran de 393 px, la carte montre l'ouest (ta capitale) : l'est se voit en glissant ou en dézoomant.

## V13.1.0 — retours de bêta de Jack (18/10/2026)
1. **Revenus des bâtiments invisibles** (« j'ai l'impression que ce n'est pas effectif ») : ils l'étaient (4 or par
   province, +3 par banque, +3 par usine), mais rien ne le disait. Désormais :
   - fenêtre Construction : « rapporte +3 or/tour » (banque, usine), « +2 or/tour » (port), « ne rapporte rien » (forteresse) ;
   - fiche de mes provinces : « 💰 Rapporte +X or/tour » ;
   - journal de chaque tour : « 💰 Revenus du tour : +X or (4 provinces × 4 · 1 banque × 3 …) ».
   - **Nouveau : le port construit rapporte +2 or/tour** (`RULES.portIncome`), comme Jack s'y attendait.
2. **Troupes « disparues » en mer** : aucun bug moteur (900 convois simulés sur les 5 nations, chacun a un sort enregistré).
   Elles étaient anéanties au débarquement — souvent contre une capitale (4 capitales sur 5 sont des points de port),
   à 70 % de leur force et sans voir la garnison — avec une seule ligne noyée dans le journal. Désormais :
   - fenêtre dédiée après la résolution : « ⚓ Débarquement repoussé » (pertes, survivants qui rentrent ou « aucun
     survivant »), « ⚓ Convoi coulé », « ⚓ Convoi perdu en mer », avec un conseil ;
   - à l'ordre de débarquement : « ⚠ Garnison inconnue : la province est hors de vue » (ou l'effectif vu) et
     « C'est une capitale, souvent la mieux gardée ».
Tests : `tests/v13-1-beta.test.js`. Vérifié dans Chrome mobile simulé (393 px), aucune erreur.

### À surveiller
- Débarquer depuis Valmorne mène directement aux capitales de Roc-Épine et d'Oroël : les débarquements restent très
  difficiles en début de partie. Si ça frustre, piste pour une prochaine version : réduire la garnison des capitales
  côtières, ou ramener le malus de débarquement de 70 % à 80 %.

## V13.2.0 — retours de bêta de Jack (18/10/2026, partie gagnée au tour 60)
1. **« Ils m'ont déjà frappé deux fois »** alors que la fiche disait « A déjà frappé une fois » : seule l'ouverture d'une
   guerre était comptée. Désormais chaque assaut livré est compté, par victime (`recordStrike`, `reputation.strikesOn`) :
   « Vous a déjà frappé une fois : à surveiller », « Vous a frappé deux fois : méfiance », « A déjà frappé trois fois… ».
2. **Proposition incohérente après un refus** : les refus du joueur sont mémorisés (`state.diplomacy.refusals`).
   La proposition suivante le dit (« Vous avez refusé notre trêve… »), la fenêtre rappelle « ↺ Vous avez déjà refusé
   une fois (tour X) », et l'IA attend 6 tours avant de reproposer ; après deux refus elle n'insiste plus, sauf si elle
   s'effondre (moins de la moitié de la force du joueur). Une IA qui perd, ou qui a été repoussée, **offre de l'or**
   (20 % de son trésor si elle perd, +15 % par refus, 50 % au plus), versé si le joueur dit Oui.
   Une proposition rendue caduque le même tour (trêve déjà signée) n'apparaît plus au journal.
3. **Cessez-le-feu au montant choisi** : « J'exige / Sans or / Je paie », montant par pas de 10 (exiger ≤ trésor adverse,
   payer ≤ disponible ; après relecture : on exige au plus la moitié du trésor adverse), chance estimée en direct (rapport de forces + somme ; le caractère du dirigeant reste secret).
   Le dominant peut donc imposer « la paix contre 60 or ». Moteur : `queueDiplomaticOrder({ pay, demand })`,
   `ceasefireChance` ; l'ancien barème 25/50/75 % reste pour les IA et les anciennes sauvegardes.
4. **Oroël / Aurel trop proches à l'oreille** : Aurel devient **Solmara** (« Alliance de Solmara »). Identifiant `aurel`,
   couleur et blason inchangés (sauvegardes intactes).
5. **80 tours au lieu de 60**, affichés « 26/80 » dans le bandeau ; les 5 derniers tours en orange, et une ligne au journal
   « ⏳ Plus que 5 tours avant la fin de la partie ».
6. **Attaquer un allié : pas assez clair** : en mode déplacement, les provinces alliées ne sont plus proposées en vert
   sont entourées d'un **liseré vert** (demande de Jack : le bleu reste celui du joueur) et le bandeau le dit ; les toucher ouvre « 🤝 X est votre allié — attaque impossible » avec un bouton Diplomatie ;
   la fiche d'une province alliée porte « 🤝 Votre allié : vous ne pouvez pas l'attaquer ».
7. **Descriptions trop longues** : toutes les aides réécrites en 1 à 3 phrases courtes (≤ 280 caractères, testé).
Après relecture indépendante : les refus s'oublient après 20 tours ou dès qu'une trêve/alliance est signée ; si l'IA
proposait déjà la trêve le même tour que l'offre « Je paie » du joueur, il ne paie rien et reçoit l'or offert ; nom
Solmara aussi dans les sources de la carte (`tools/carte/`).
### À surveiller
- Rompre une trêve n'est pas une trahison : un dominant peut encore enchaîner guerre → exigence → guerre.
- « +X or si vous acceptez » peut être plus que versé si l'IA a dépensé entre-temps (plafonné à son trésor).
Tests : `tests/v13-2-beta.test.js`. Vérifié dans Chrome mobile simulé (393 px) : bandeau 75/80, province alliée bleue et
fenêtre d'explication, fiche « Vous a frappé deux fois », cessez-le-feu « J'exige 60 or », proposition d'Oroël avec rappel
du refus et « +19 or si vous acceptez ». Aucune erreur JavaScript, aucun débordement horizontal.

## V13.3.0 — retours de bêta de Jack (18/10/2026, partie perdue au tour 73)
1. **Forteresse un niveau à la fois** : le niveau 2 ne se lance qu'une fois le 1 terminé (`FORT_IN_PROGRESS`, motif affiché
   dans Construction : « niveau N en construction, attendez qu'il soit terminé »).
2. **« 1 canon en convalescence »** → « artilleur(s) » partout (fiches, pertes, journal).
3. **Commerce retiré des répliques** (le jeu n'a pas d'échange de biens) ; **paroles des dirigeants ×3** (173 → 519 répliques,
   réponses d'aide 28 → 121) et **anti-répétition** : un dirigeant ne redit pas une réplique de ses 6 derniers messages.
4. **Être attaqué saute aux yeux** : « ⚠ ON VOUS ATTAQUE » / « ⚠ TERRITOIRE PERDU » sur fond rouge, liseré épais clignotant.
5. **Un seul bouton pour parler** : « Échanger » retiré de la fiche ; « Échanger publiquement » reste dans la Diplomatie.
6. **Liserés guerre / allié / tension** de la même épaisseur que le liseré bleu du joueur (28 px).
7. **Combat illogique ? (340 morts contre 62)** : reproduit — l'assaillant (≈ 300 fantassins + 15 blindés) avait près du double
   des PV ; les tirs du défenseur ont surtout **blessé** ses blindés (240 PV) sans les tuer, et le journal ne comptait que les morts.
   Corrigé côté clarté : le journal donne maintenant les **forces engagées**, les **PV perdus (blessés compris)**, la forteresse
   et le débarquement. Corrigé côté règle : la forteresse ne retirait que 9 / 17 / 23 % des dégâts (division par 1,1 / 1,2 / 1,3) ;
   elle retire désormais vraiment **10 / 20 / 30 %**.
Tests : `tests/v13-3-beta.test.js`, `tests/v13-3-paroles.test.js`.
Relecture indépendante (19/10/2026) : rien de bloquant ; corrigés au passage — les réponses aux demandes d'aide suivent
aussi l'anti-répétition, doublon `fortLevel` retiré du journal, forteresse au niveau 3 affichée « −30 % (niveau maximal) ».
Vérifié dans Chrome mobile simulé (393 px) : 9 tours joués, fiche sans bouton « Échanger », journal lisible, aucune erreur
JavaScript, aucun débordement horizontal.
