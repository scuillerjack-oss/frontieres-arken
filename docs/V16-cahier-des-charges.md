# FRONTIÈRES: ARKEN — V16 — cahier des charges (brouillon du 19/11/2026)

> Source : idées de Jack envoyées le 19/11/2026. Ce cahier reprend chaque idée, la confronte au jeu actuel (V15.5.1)
> et fixe une décision. Les points marqués **À VALIDER** sont des choix que Claude a tranchés à la place de Jack :
> ils s'appliquent tels quels si Jack ne dit rien.
> Base : `main` au commit `4d07391` (V15.5.1).
>
> **Validé par Jack le 19/11/2026** : on garde le bombardement des forteresses (murs seulement) ; la lecture du
> « tour en direct » (V16.4) est la bonne. Si ce mode casse la jouabilité, on le retire et on revient en arrière.

## Découpage proposé (une version = une bêta, comme d'habitude)
| Version | Contenu | Taille |
|---|---|---|
| V16.0 | Banques +5, alliances annoncées à tous, navires de guerre contre les troupes en mer seulement | petite |
| V16.1 | Retour du ballon d'observation | moyenne |
| V16.2 | 6e île : l'île mystérieuse | grosse (carte + IA) |
| V16.3 | Jeu en **format paysage** sur le téléphone (demande du 19/11) | moyenne (tous les écrans) |
| V16.4 | Nouveau déroulé : tour « en direct » nation par nation, annonces au-dessus de la carte, pause | très grosse |

Le paysage passe **avant** le tour en direct : le bandeau d'annonces et le bouton pause de la V16.4 seront dessinés
directement pour l'écran couché, au lieu d'être refaits deux fois.

Ordre choisi : du plus simple au plus risqué. La V16.4 (tour en direct) change tout le rythme du jeu ; la faire en dernier évite de
tout retester trois fois.

---

## V16.0 — réglages

### 1. Banques : +5 par tour au lieu de +3
- `RULES.bankIncome` 3 → 5. Le coût (30 or, 3 tours) ne bouge pas.
- Conséquence : une banque est remboursée en 6 tours au lieu de 10. Le Bâtisseur (IA) devient plus fort, ce qui
  tombe bien : il était le plus faible (12 % de victoires en 40 tours).
- Les empreintes `tools/empreintes-v15.3.json` vont changer : c'est voulu. Nouvelles mesures d'équilibre à refaire
  (fiche de rentabilité non concernée : aucun coût).

### 2. Toute alliance est annoncée à toutes les nations
- Une alliance conclue entre deux nations quelconques (IA ou joueur) → message public dans le journal, vu par tous :
  « 🤝 Alliance conclue entre X et Y. » Même chose pour une rupture (déjà publique depuis la V13).

### 3. Les navires de guerre n'attaquent que les troupes en mer (décision validée)
- Un navire ne tire plus sur les troupes à terre : il combat les convois et les autres navires.
- **Point de vigilance (contradiction avec la V14.4)** : le 29/10, Jack a demandé que les navires puissent
  **bombarder les forteresses**, parce que les débarquements étaient presque toujours repoussés.
  **Décision À VALIDER** : on garde le bombardement des **murs** (la brèche baisse le niveau de la forteresse), mais
  plus aucun dégât sur la garnison (aujourd'hui : 20 % de la puissance de feu, plafonné à 5 % des PV, blessures
  seulement). Ainsi la règle « navires = mer seulement » est respectée pour les troupes, et le blocage des
  débarquements ne revient pas.
- Lors d'un débarquement, les navires d'escorte ne tirent plus sur les troupes à terre ; ils ne frappent que les
  navires et, en mer, les convois. (Voir « Réalisé » : les troupes peuvent encore tirer sur eux.)

### 4. Alliances et attaques communes (idées 12 et 13 de Jack)
Ce qui existe déjà (V13 / V13.4) et couvre déjà ces idées :
- « 🤝 Demander de l'aide → Attaque X avec moi » marche avec **n'importe quel allié**, même à l'autre bout de la carte.
- Le **droit de passage** fait partie de l'alliance : la nation 1 envoie ses troupes stationner chez la nation 2,
  puis attaque la nation 3 depuis là. C'est exactement l'idée 13.
- À faire en V16.0 : vérifier que ces deux boutons sont faciles à trouver (retour de bêta : Jack ne semble pas les
  avoir vus) et ajouter dans la fiche d'un allié la ligne « Attaquer ensemble : envoyez d'abord vos troupes chez lui ».
- L'idée 12 (allié à l'opposé, sans route directe) : l'attaque commune vise la nation entre les deux ; chacun attaque
  depuis son côté de l'anneau. Rien de nouveau à coder, sauf le texte d'aide.

---

## V16.1 — retour du ballon d'observation

Le ballon avait été supprimé en V13 au profit de la vision (brouillard). La vision reste ; le ballon s'y ajoute.

### Ce que voit un ballon
- Posé au-dessus d'une nation, il montre **les déplacements et les constructions** de cette nation (troupes,
  bâtiments en chantier, recrutements, convois qui partent). Sans ballon : aucune information sur les déplacements
  adverses (seuls les combats restent publics, comme aujourd'hui).
- Il ne va jamais sur l'île mystérieuse (inutile : ses troupes sont toujours visibles, voir V16.2).

### Combien
- **Un seul ballon par joueur**, quel que soit le nombre de nations conquises.
- Il faut **une usine** dans la province où on le construit.
- **Deuxième ballon** : seulement si l'on possède l'île mystérieuse (bonus de l'île).
- Ballon détruit → de nouveau constructible. Coût et durée **À VALIDER** : 30 or, 2 tours (prix d'une banque,
  pour que ce soit un vrai choix).

### Comment il voyage
- Il suit **les routes maritimes existantes** (pas de nouvelle route), à la même vitesse qu'un convoi (2 tours
  par route). Il n'est pas arrêté par les navires.
- Pour aller observer une nation lointaine, il **survole les nations entre les deux** (l'anneau oblige à passer par
  les voisines).

### Le survol se voit, et on peut l'abattre
- Une nation survolée (ou observée) **voit le ballon automatiquement**. Le joueur peut toucher le ballon :
  « Ballon de X au-dessus de chez vous — Détruire / Laisser passer ».
- Détruit → il tombe là où il est, il n'atteint pas sa cible.
- **Pas de guerre automatique** quand un ballon est abattu. Le propriétaire reçoit seulement une alerte :
  « ⚠ Roc-Épine a abattu notre ballon d'observation. » À lui d'en tirer les conclusions.
  (Exception assumée à la règle « affronter quelqu'un = guerre », qui vise les troupes.)
- L'IA : abat un ballon selon son caractère **À VALIDER** — Conquérant et Traître toujours, Bâtisseur jamais,
  Héros seulement si le propriétaire du ballon est un agresseur récent. Elle envoie aussi ses propres ballons vers
  la nation la plus menaçante.

### Sauvegarde
- Pas de nouveau schéma si possible : `state.balloons` est un champ facultatif, absent des anciennes parties (elles
  démarrent sans ballon), comme les champs ajoutés en V13.

### Règles précises retenues (19/11, pour le code)
- **Position** : un ballon est toujours « au-dessus » d'une nation (une île entière), jamais sur une province précise,
  ni sur l'île mystérieuse. Il naît au-dessus de sa propre nation.
- **Construction** : depuis une province à soi qui a une **usine construite**, 30 or, livré en 2 tours, comme une
  construction (file de production). Refus clairs : « Il faut une usine dans cette province », « Vous avez déjà un
  ballon (1 au maximum) », « Un ballon est déjà en construction ». Maximum : 1, ou 2 si l'on possède l'île
  mystérieuse (`p21`, à partir de la V16.2 ; la règle est écrite dès la V16.1).
- **Voyage** : ordre « Envoyer le ballon vers X ». Il suit l'anneau des nations voisines par la mer (même graphe que
  les routes maritimes, sens le plus court ; égalité : ordre alphabétique), **2 tours par saut**. À chaque saut, il
  est au-dessus de la nation survolée pendant au moins un inter-tour. Arrivé, il reste au-dessus de X jusqu'à un
  nouvel ordre. Les navires ne l'arrêtent pas.
- **Ce qu'il montre à son propriétaire, tant qu'il est au-dessus d'une nation (survol compris)** : toutes les
  provinces de cette nation deviennent visibles (troupes comprises, mêmes règles que la vision V13, forteresses
  comprises), ses convois au départ de ses ports, et chaque inter-tour un **rapport privé** dans le journal :
  « 🎈 Ballon au-dessus de X : chantiers en cours (…), recrutements (…), troupes en mouvement (…) ». L'IA profite
  du ballon de la même façon (mêmes fonctions de vision).
- **Être survolé** : la nation survolée voit le ballon (icône 🎈 aux couleurs du propriétaire sur son île). Pour le
  joueur : à l'arrivée d'un ballon étranger, une fenêtre « Ballon de X au-dessus de chez vous — Détruire / Laisser
  passer » ; il peut aussi toucher l'icône plus tard pour le détruire. Ordre « Abattre » résolu **au début de
  l'inter-tour, avant tout déplacement** : le ballon est détruit avant d'aller plus loin.
- **Ballon abattu** : événement privé pour le propriétaire « ⚠ X a abattu notre ballon d'observation au-dessus de
  son territoire. » et pour celui qui tire « Ballon de Y abattu. ». **Aucune guerre, aucune tension automatique.**
  Le ballon redevient constructible.
- **IA** : construit un ballon quand elle a une usine et au moins 60 or d'avance ; l'envoie vers la nation avec qui
  elle est en guerre (sinon la plus forte tension) ; abat un ballon étranger : Conquérant et Traître toujours,
  Bâtisseur jamais, Héros seulement si le propriétaire est un agresseur récent (`recordAggression`).
- **Nation éliminée** : ses ballons disparaissent. Ballon au-dessus d'une nation éliminée : il reste là (l'île a de
  nouveaux propriétaires, il les observe).

---

## V16.2 — 6e île : l'île mystérieuse

**Croquis de Jack (19/11)** : les 5 nations en cercle (chacune une île de 4 provinces), reliées à leurs 2 voisines
(l'anneau actuel) et chacune reliée par une route à une petite île ronde au centre. C'est exactement la disposition
de la carte Leonardo : **la petite île rocheuse au centre de la carte devient l'île mystérieuse** (`p21`), sans
redessiner la carte. 5 nouvelles routes : un point de port de chaque nation → `p21`.

| Règle | Détail |
|---|---|
| Forme | Petite île, **une seule province** (`p21` ; les `p01`…`p20` ne bougent pas). Ce n'est pas une nation. |
| Garnison | Neutre, environ **3 fois** les troupes d'une nation en début de partie. **Ne recrute jamais.** |
| Troupes visibles | Toujours, par tous, sans ballon (un toucher sur l'île suffit). |
| Super banque | **+10 or par tour** à son propriétaire. |
| Routes | Reliée par la mer aux 5 nations. Trajet : **4 tours** (contre 2 entre deux nations). |
| Point stratégique | Depuis l'île, on peut débarquer chez **n'importe quelle nation** sans passer par les autres. |
| Défense | On ne peut **pas** y fabriquer de troupes : il faut y envoyer et y garder une armée. |
| Bonus | Donne le droit à un **deuxième ballon**. |

### Attaques publiques
- Dès qu'une nation attaque l'île, **toutes les nations le savent** : qui attaque, combien de morts, combien de
  troupes il reste sur l'île.

### Prise à deux
- Deux alliés peuvent l'attaquer ensemble (« Attaque X avec moi » étendu à l'île).
- Prise commune : la banque est **partagée** (+5 chacun), et **les deux** peuvent utiliser l'île comme base.
- Une troisième nation qui la prend récupère tout : la banque entière (+10) et la base.
- Technique : la province a un propriétaire principal (celui qui a pris l'île) et un co-propriétaire facultatif ;
  l'alliance donne déjà le droit de passage, donc peu de règles nouvelles. Alliance rompue → le co-propriétaire perd sa
  part et ses troupes sont rapatriées (règle V13.4).

### À surveiller
- +10 par tour sur une carte où une province rapporte 4 : c'est énorme (une partie de 80 tours = 800 or). C'est
  voulu, mais il faudra mesurer qu'une nation qui prend l'île tôt ne gagne pas à coup sûr. Si c'est le cas, la
  garnison de départ sera relevée (pas le bonus).
- Carte Leonardo : l'île doit être ajoutée au dessin. Sans la photo de Jack, Claude dessine une petite île simple
  au centre, dans le style de la carte.

---

## V16.3 — format paysage (demande de Jack du 19/11/2026)
- Le jeu se lance **couché** : `orientation: landscape` dans `manifest.webmanifest`, et orientation paysage forcée
  dans l'appli Android (APK de bêta et AAB Google Play).
- Tous les écrans sont repris pour un écran large et bas (environ 844 × 390) : carte à gauche sur toute la hauteur,
  barre d'infos (tour, trésor, armée) et boutons (Journal, Échanges, Fin du tour) en colonne à droite ; fiches de
  province en panneau latéral plutôt qu'en tiroir du bas ; fenêtres limitées en hauteur avec défilement.
- Vérification Playwright en 844 × 390 tactile (et 915 × 412, plus grand téléphone courant) : aucun débordement,
  aucun bouton caché.

## V16.4 — nouveau déroulé : le tour en direct

### Lecture retenue (À VALIDER, c'est le point le plus important du cahier)
Jack : « annonces au-dessus de la carte en temps réel, tout par tour, environ 10 secondes par pays, possibilité de
mettre pause pour avoir le temps de lire et de réagir ».
- Le jeu **avance tout seul** : plus de bouton « Fin du tour ». Chaque tour se joue nation par nation, environ
  **10 secondes par nation** (soit ~1 minute par tour avec 6 acteurs, île comprise si elle est attaquée).
- Pendant la séquence d'une nation, ses actions **connues du joueur** s'affichent dans un **bandeau d'annonces
  au-dessus de la carte** (combats, alliances, ballons repérés, attaques de l'île…), et la carte s'anime.
- Le joueur donne ses ordres **à tout moment** ; ils partent quand vient **sa** séquence.
- Bouton **⏸ Pause** toujours visible : tout s'arrête, le joueur lit, ouvre ses écrans, donne ses ordres, puis
  reprend. Les fenêtres Oui / Non (propositions d'alliance) et « Détruire le ballon ? » mettent le jeu en pause
  automatiquement.
- Réglage de vitesse (lent 15 s / normal 10 s / rapide 5 s par nation) **À VALIDER**.

### Décision technique du 19/11 (Claude) : résolution toujours simultanée
Plutôt que de faire jouer les nations l'une après l'autre dans le moteur (celle qui joue en premier aurait un
avantage, et tout l'équilibre mesuré depuis la V10 serait à refaire), le moteur garde la **résolution simultanée** ;
c'est le **déroulé à l'écran** qui devient « en direct » :
- le jeu avance tout seul : une horloge de tour = environ 10 s × nombre de nations en vie (vitesse réglable :
  lent 15 s, normal 10 s, rapide 5 s par nation) ;
- pendant ce temps, le bandeau au-dessus de la carte passe de nation en nation (« ⏱ Tour 12 · Oroël ») et annonce
  ce que le joueur sait de ce qu'elle a fait au tour précédent (combats, conquêtes, alliances, ballons…), la carte
  montrant l'endroit ;
- le joueur donne ses ordres quand il veut ; à la fin de l'horloge, les ordres sont verrouillés et le tour est résolu
  automatiquement, puis l'horloge repart ;
- **⏸ Pause** toujours visible ; le jeu se met aussi en pause tout seul tant qu'une fenêtre est ouverte (journal,
  proposition Oui / Non, ballon, construction…) ;
- un réglage « Déroulé : En direct / Classique (bouton Fin du tour) » permet de revenir à l'ancien mode : c'est le
  retour en arrière prévu par Jack si le mode en direct déçoit.
Ainsi, rien ne change dans les règles ni dans l'équilibre, et le retour en arrière est un simple réglage.

### Conséquences à connaître (lecture d'origine, remplacée par la décision ci-dessus pour le moteur)
- La **résolution simultanée** des tours (choisie au début du projet, façon Supremacy 1914) devient une résolution
  **nation par nation** : celle qui joue d'abord a un avantage. Pour rester équitable, l'ordre de passage change à
  chaque tour (tirage à graine).
- Une partie de 80 tours ≈ 80 minutes de jeu effectif minimum, plus les pauses : cohérent avec des parties sur
  plusieurs jours (sauvegarde à chaque séquence).
- Le tutoriel, l'animation de fin de tour (V15.3), la pub de début de partie, le mode 40 tours et le palmarès sont à
  adapter. Jamais de pub pendant le déroulé (règle du studio).
- C'est la plus grosse modification depuis la V9 : plusieurs bêtas internes avant de la garder.

---

## Points communs à toutes les versions
- Langue : le jeu n'est qu'en français pour l'instant (l'anglais est demandé depuis le 06/11 mais pas encore codé).
  Tous les nouveaux textes sont écrits pour être traduits facilement.
- Règles du dépôt (`CLAUDE.md`) inchangées : tests verts, Chrome mobile simulé, relecture indépendante, schéma de
  sauvegarde migré proprement, identifiants de nations et de provinces jamais renommés.

## Questions ouvertes pour Jack (une seule bloque)
1. ~~Lecture du « tour en direct »~~ : validée le 19/11.
2. La photo de l'île mystérieuse (pour la V16.2) : pas encore reçue.
3. ~~Navires et forteresses~~ : bombardement des murs gardé, validé le 19/11.

## Réalisé

### V16.0 (19/11/2026)
- **Banques +5** : `RULES.bankIncome` 3 → 5. Textes d'aide et de fiche lus dans `RULES` (plus de « +3 » écrit en dur).
- **Navires** (`src/domain/combat.js`, fonction `fire`) : dans un combat à terre (port défendu, débarquement), un navire
  ne tire que sur les navires adverses ; sans navire en face, son feu est perdu. En mer, il touche toujours les troupes
  embarquées (« troupes dans l'eau »). Les troupes à terre peuvent toujours tirer sur les navires : escortes et
  navires à quai prennent donc encore une part des tirs (700 PV chacun).
  **Essai écarté** : navires et troupes qui ne se touchent plus du tout à terre (escorte totalement hors de l'assaut).
  Mesuré sur les mêmes 100 parties : conquêtes des tours 61-80 de 529 à 197, capitales perdues de 1,24 à 0,86 par
  partie, Conquérant de 21 à 11 victoires — la carte se figeait, le blocage du 29/10 revenait. Gardé : la version
  ci-dessus. Si Jack veut quand même l'escorte totalement hors de la plage, il faudra compenser (brèche plus forte
  ou malus de débarquement réduit).
- **Bombardement** (`RULES.bombard.garrisonShare` 0,2 → 0) : brèche dans les murs seulement, aucune blessure à la
  garnison. Sans forteresse en face, plus de cible (« il faut, en face, une forteresse… ») ; un ordre ancien vers une
  province sans forteresse est ignoré. Textes de l'aperçu et du journal sans ligne « Garnison ».
- **Alliances publiques** (`eventKnownToPlayer`) : toute alliance conclue (proposition acceptée, réponse dans les
  Échanges, réponse Oui / Non) est connue de toutes les nations : « 🤝 Alliance conclue entre X et Y. » Un refus
  entre deux autres nations reste privé. Pas de changement d'IA (la tension +5 envisagée n'a pas été codée : inutile
  pour la règle demandée).
- Deux propositions d'alliance croisées le même tour (A→B et B→A) : une seule alliance et une seule annonce
  (`resolveDiplomacy`), sinon tout le monde voyait la ligne deux fois.
- Tutoriel : « la banque rapporte +5, l'usine +3 » (le texte disait « l'usine aussi »).
- **Forteresses à −5 % par niveau** (Jack, 19/11 ; avant −10 %) : `RULES.fortDefense` = −5 / −10 / −15 % de dégâts
  reçus. Tous les textes (fiche, construction, attaque, journal, aide) lisent la règle. Avec l'atout Défense au
  maximum : −23 % au niveau 3 (avant −36 %).
- **Idées 12 et 13** : déjà couvertes par « Attaque X avec moi » et le droit de passage (V13.4), rien à coder.
- **Tests modifiés (règle changée, pas affaiblis)** : revenus de banque 3 → 5 (`economy`, `v13-1-beta`) ; B1 : les
  navires d'appui n'ajoutent plus de dégâts aux troupes (`combat-v10`) ; bombardement : garnison intacte, journal
  sans « Garnison » ; île bien défendue : 400 → 500 fantassins pour prendre en 3 tours de bombardement, toujours
  repoussé sans bombardement ou après 1 tour (`v14-4-bombardement`) ; Bâtisseur qui riposte : +300 fantassins
  dans le scénario, car son débarquement sur la capitale d'Aurel ne profite plus du feu des navires
  (`v11-personnalites`). Ajout : `tests/v16-0.test.js` (8 tests).
- **Mesure** (`node tools/equilibre.mjs 100 80 v160a`, mêmes graines avant / après) :

| Mesure | V15.5.1 | V16.0 |
|---|---|---|
| Vainqueur net | 73 | 74 |
| Conquêtes par tranche de 20 tours | 551 / 448 / 544 / 620 | 520 / 407 / 589 / 529 |
| Capitales perdues par partie | 1,32 | 1,24 |
| Parties avec élimination / coalition | 26 / 28 | 29 / 27 |
| Victoires Valmorne / Roc-Épine / Noireflamme / Oroël / Aurel | 11 / 17 / 23 / 17 / 32 | 8 / 22 / 28 / 18 / 24 |
| Victoires Héros / Conquérant / Traître / Bâtisseur | 38 / 22 / 23 / 17 | 46 / 21 / 19 / 14 |

  Avec les forteresses à −5 % (même mesure, mêmes graines) : vainqueur net 73 ; conquêtes 521 / 405 / 614 / 539 ;
  capitales perdues 1,33 ; élimination 30, coalition 27 ; victoires par nation 14 / 21 / 24 / 16 / 25 (Valmorne
  remonte) ; par caractère 39 / 21 / 21 / 19. Les débarquements redeviennent un peu plus faciles, ce qui compense la
  perte du feu des navires.
- **Test de traits** (`v14-2`) : avec les forteresses plus faibles, sur les 12 graines du test le Bâtisseur (54
  assauts) passait devant le Héros (46). Sur 40 parties il reste nettement le moins agressif (99 contre 173) : la
  vérification est déplacée dans un test de 40 parties, les autres vérifications du test restent sur 12 graines.
  (Mesuré aussi : sur 24 parties, « Conquérant > 2 × Héros » échoue déjà avec la V15.5.1 : ce seuil ne tient que sur
  ces 12 graines, il n'a pas été touché.)

  Lecture : la guerre ne fige pas ; un peu moins de conquêtes en fin de partie. **À surveiller en bêta** : les
  débarquements sont plus durs (les navires ne tirent plus sur la plage). Si le blocage du 29/10 revient, on montera la
  brèche par tour (`maxPerTurn`) plutôt que de rendre les navires aux combats terrestres.
- **Remarques de relecture, non corrigées** : l'affichage « dégâts par assaut » d'une province compte encore le feu de
  ses navires à quai (alors qu'il ne touche que des navires) ; on ne peut plus bombarder un port ennemi sans
  forteresse (la bataille contre sa flotte à quai passe par une attaque navale).

### V16.1 (19/11/2026)
- **Moteur** : nouveau module `src/domain/engine/balloons.js` (pur, réexporté par `game-engine.js`), réglages dans
  `RULES.balloon` (30 or, 2 tours, 2 tours par saut, 1 ballon ou 2 avec `p21`, IA : 60 or d'avance). Le ballon est un
  objet à part dans `state.balloons` (champ facultatif, créé au premier ballon livré) : **pas de nouveau schéma**
  (toujours 11 / 12), la migration 8 → 9 qui supprime l'ancien `units.balloon` n'est pas touchée, une nouvelle partie ne
  contient toujours aucune trace de « balloon ».
  - Construction : ordre `balloon-build`, file de production (`kind:'balloon'`) ; province prise pendant le chantier =
    remboursé (B4) ; refus « Il faut une usine dans cette province », « Vous avez déjà un ballon (1 au maximum) »,
    « Un ballon est déjà en construction ». Le ballon naît au-dessus de l'île de son propriétaire.
  - Voyage : ordre `balloon-send` (un seul par ballon et par tour, le dernier remplace). Graphe des îles reliées par une
    route maritime, chemin le plus court (égalité : alphabétique). Un saut tous les 2 inter-tours : il reste au-dessus de
    chaque île survolée au moins un inter-tour. Changement de cap = le saut recommence ; « Rester au-dessus de X » l'arrête.
  - Vision (`vision.js`) : `visibleProvinces` ajoute les provinces de l'île survolée **pour le propriétaire seulement**
    (pas ses alliés) ; `provinceIntel` ne cache plus les troupes derrière une forteresse vue du ballon. L'IA passe par les
    mêmes fonctions (`perceivedForce`).
  - Rapport privé (`balloon-report`) chaque inter-tour : chantiers en cours, recrutements et déplacements (terre et mer)
    ordonnés ce tour par les autres nations sur l'île survolée. Pas de rapport au-dessus d'une île entièrement à soi.
  - Abattre : ordre `balloon-shoot` (nation qui possède une province de l'île survolée), résolu en tout premier dans
    `resolveInterturn`, avant tout déplacement. Événement privé `balloon-shot` (propriétaire et tireur seulement),
    aucune guerre, aucune tension, ballon reconstructible. Nation éliminée : ses ballons disparaissent.
- **IA** (`aiBalloonOrders`, appelée après le plan de chaque dirigeant, donc avec l'or qui reste) : construit à sa
  capitale (sinon sa première province avec usine) si elle garde 60 or après les 30 du ballon ; l'envoie vers une nation
  en guerre avec elle (la plus forte tension d'abord), sinon vers la plus forte tension ; abat : Conquérant et Traître
  toujours, Bâtisseur jamais, Héros si le propriétaire figure dans les agressions des 5 derniers tours (`recordAggression`,
  même mémoire que ses guerres).
- **Interface** : carte « 🎈 Ballon d'observation » dans l'écran Construction (refus expliqué) et pastille « commandé
  (Annuler, remboursé) / en construction » sur la fiche ; icône 🎈 aux couleurs du propriétaire au-dessus du centre de
  l'île survolée (visible pour le propriétaire et pour les nations qui possèdent une province de cette île ; chiffre =
  tours avant l'arrivée, ✖ = ordre d'abattre) ; toucher son ballon → liste des nations avec durée et îles survolées ;
  toucher un ballon étranger → « Détruire / Laisser passer » (ou « Annuler l'ordre ») ; fenêtre automatique à l'arrivée
  d'un ballon étranger, après le journal et avant les propositions (jamais dans le tutoriel) ; lignes du récapitulatif de
  fin de tour ; textes du journal ; ligne « Ballon d'observation » dans l'aide. Nouveaux modules
  `src/presentation/balloon-view.js` (pur) et `src/presentation/ui/balloon-ui.js` (dans `sw.js` et `tests/helpers/sources.js`).
- **Écarts au cahier, et pourquoi** :
  - « Toutes les provinces de cette nation » est lu comme **toutes les provinces de l'île** survolée (le ballon est au-dessus
    d'une île entière ; c'est aussi ce que dit « l'île a de nouveaux propriétaires, il les observe »). Les provinces que la
    nation tient sur une autre île ne sont pas montrées.
  - Les convois « au départ de ses ports » apparaissent dans le rapport (« par mer ») ; la composition des jetons de
    convoi étrangers sur la carte reste inconnue (inchangée).
  - « Être survolé » vaut pour toute nation qui possède une province de l'île (propriétaire actuel), pas seulement la
    nation d'origine.
- **Tests** : `tests/v16-1.test.js` (18 tests : construction et refus, maximum, voyage et durée, navires sans effet,
  vision pendant le survol et à l'arrivée, rapport privé, survol vu, abattre avant le saut sans guerre ni tension,
  reconstructible, élimination, IA qui construit / envoie / abat selon le caractère, parties IA complètes, sauvegarde
  avec un ballon en vol, ancienne sauvegarde sans `balloons`, province prise, interface). Tests existants modifiés :
  seulement le numéro de version 16.0.0 → 16.1.0 (`v14-3-tutoriel`, `v15-2`, `v15-4`).
- **Mesure** (`node tools/equilibre.mjs 100 80 v160a`, mêmes graines avant / après) :

| Mesure | V16.0 | V16.1 |
|---|---|---|
| Vainqueur net | 73 | 78 |
| Conquêtes par tranche de 20 tours | 521 / 405 / 614 / 539 | 522 / 402 / 698 / 693 |
| Capitales perdues par partie | 1,33 | 1,62 |
| Parties avec élimination / coalition | 30 / 27 | 30 / 34 |
| Victoires Valmorne / Roc-Épine / Noireflamme / Oroël / Aurel | 14 / 21 / 24 / 16 / 25 | 12 / 21 / 25 / 14 / 28 |
| Victoires Héros / Conquérant / Traître / Bâtisseur | 39 / 21 / 21 / 19 | 42 / 21 / 15 / 22 |

  Ballons sur ces 100 parties : 15,7 construits et 14,4 abattus par partie (premier ballon livré vers le tour 33 en
  médiane), 15,7 sauts. Lecture : le début de partie ne change pas ; en seconde moitié, une IA qui voit la vraie garnison
  (forteresse comprise) au lieu de l'estimation prudente attaque plus souvent : +36 % de conquêtes sur les tours 61-80,
  plus de capitales prises, plus de coalitions. La carte bouge davantage, ce qui allait dans le sens des retours de
  Jack. **À surveiller en bêta** : si la fin de partie devient trop sanglante, on peut monter `aiReserve` (moins de
  ballons d'IA) ou réserver la vue à travers les forteresses au survol d'arrivée.
- **Vérifié dans un Chrome mobile simulé** (390 × 844 tactile, `pw/v161.mjs`) : construction depuis la fiche de la
  capitale, pastille « commandé », fenêtre « Ballon d'Oroël au-dessus de chez vous — Détruire / Laisser passer » à
  l'arrivée, ordre d'abattre dans le récapitulatif puis « Ballon d'Oroël abattu. » au journal, choix de la destination en
  touchant son ballon, ligne dans l'aide ; 0 erreur JavaScript, aucun débordement horizontal ; parcours V16.0 inchangé.

### V16.3 — format paysage (19/11/2026)
- **Lancement couché.** `manifest.webmanifest` : `"orientation": "landscape"`. Appli Android : nouveau
  `scripts/android-orientation.js`, appelé sans condition par `scripts/android-prepare.js` (donc APK de bêta **et** AAB
  Google Play) : `android:screenOrientation="sensorLandscape"` sur `.MainActivity` (paysage dans les deux sens ; une
  orientation déjà présente est remplacée ; patch idempotent). **Attention APK de bêta** : l'orientation est dans
  l'APK lui-même, pas dans le site ; l'APK déjà installé chez Jack reste libre de tourner tant qu'il n'a pas
  retéléchargé le nouvel APK (la mise en page paysage, elle, arrive par le site dès la fusion).
- **Navigateur tenu droit (PWA, Chrome)** : choix le plus sûr, **la mise en page portrait est gardée** telle quelle
  (pas de message « Tournez votre téléphone »). Vérifié : captures 390 × 844 identiques à celles de la V16.0.
- **Mise en page paysage** : nouvelle feuille `paysage.css`, chargée après `v5.css` (ajoutée à `index.html`, à ASSETS de
  `sw.js` et aux fichiers publiés de `scripts/build.js`). Toutes ses règles sont dans
  `@media (orientation:landscape) and (max-height:560px)` : une tablette couchée garde l'ancienne mise en page.
  - carte sur toute la hauteur à gauche ; colonne à droite (184 à 236 px + encoche) : marque, Tour / Trésor / Armée,
    Aide et Réglages en haut ; Journal et Échanges côte à côte puis un grand « Fin du tour » en bas ;
  - boutons de zoom en colonne à gauche de la carte (au-dessus de « Voir toute la carte ») : la droite de la carte est
    réservée à la **fiche de province**, devenue un panneau latéral sur toute la hauteur (boutons d'action sur deux
    colonnes, défilement interne) ; le petit message « Ordre ajouté » se recentre sur la partie visible de la carte ;
  - fenêtres limitées à la hauteur de l'écran, défilement interne, plus larges (jusqu'à 660 px), choix de nation sur
    deux colonnes ; bouton × toujours au-dessus du contenu ;
  - accueil : titre sur une ligne, boutons sur deux colonnes (tout tient sans défiler en 844 × 390) ;
  - bulles d'aide, mini tuto et tutoriel : posées sur la carte, jamais sur la colonne de droite ; fiche ouverte → à
    gauche de la fiche (au moins 230 px de large) ; bulle remontée dans une fenêtre → la fenêtre se range à gauche et
    la bulle à droite (rien n'est caché, « Quitter » et « Suivant » restent touchables) ;
  - animation de fin de tour et bandeau « nouvelle bêta » centrés sur la carte ; bandeau de déplacement en haut de la
    carte ; zones sûres (`env(safe-area-inset-*)`) des quatre côtés, l'encoche pouvant être à gauche ou à droite.
- **Tests** : `tests/v16-3.test.js` (manifeste ; patch Android sur un manifeste Capacitor 8 réaliste, idempotent ;
  `android-prepare.js` **réellement exécuté** sur un projet factice, bêta et Play ; chargement / publication de la
  feuille ; aucune règle hors paysage ; gabarit, bulles, zones sûres). Tests existants modifiés : seulement le numéro de version attendu (16.3.0) dans v14-3-tutoriel, v15-2 et v15-4. `npm test` : 649/649 (après intégration de la V16.1).
- **Vérifié dans Chrome mobile simulé (Playwright, tactile)** en 844 × 390, 915 × 412 et 667 × 375 (petit téléphone),
  plus 390 × 844 (non-régression) : premier lancement, accueil (avec et sans partie), nouvelle partie, intro, mini
  tuto, carte, fiche de province, construction, recrutement, déplacement (bandeau), fin du tour, animation de tour,
  journal, aide, réglages, échanges, armée, atouts, palmarès, écran de fin (partie terminée par le script), tutoriel
  sur 22 étapes avec les vrais gestes. 0 erreur JavaScript, aucun débordement horizontal, aucun bouton hors écran ni
  recouvert (contrôle automatique sur chaque capture ; en portrait, seul « Voir toute la carte » passe sous la fiche
  du bas, comme en V16.0). Captures gardées hors dépôt (`/home/claude/pw/paysage/`).
- **Non vérifié** : vrai téléphone (verrouillage `sensorLandscape`, encoche réelle, barre de navigation Android) — à
  regarder en bêta après installation du nouvel APK ; l'AAB n'a pas été construit ici (Gradle absent). En 667 × 375,
  la bulle du tutoriel mord un peu sur le titre de la fiche (boutons visibles). Le ballon de la V16.1 (développé en
  parallèle) n'a pas de règle paysage : à vérifier à la fusion s'il ajoute un bouton sur la carte ou une fenêtre.

- Intégration après la V16.1 : fenêtre « Détruire / Laisser passer », icône du ballon et choix de destination vérifiés en 844 × 390 (0 erreur). **L’APK de bêta déjà installé doit être retéléchargé une fois** pour être verrouillé en paysage ; la mise en page paysage, elle, arrive par le site.

### V16.4 — tour en direct (19/11/2026)
Spécification suivie : « Décision technique du 19/11 ». **Le moteur n'est pas touché** (`src/domain/` inchangé) : la
résolution reste simultanée, c'est le déroulé à l'écran qui devient « en direct ».
- **Horloge** (`src/presentation/live-clock.js`, pur, testé sous Node) : durée du tour = secondes par nation × nations
  encore en vie (lent 15 s, normal 10 s, rapide 5 s). À la fin : le même chemin que « Verrouiller et résoudre »
  (`playTurn` dans `turn-flow.js`), sans fenêtre de confirmation. L'horloge repart quand toute la suite de fin de tour est
  finie (animation, capitale, mer, coalition, ballon, propositions). Une seule résolution possible : la fin de l'horloge
  est prise une seule fois, et un verrou (`turnGate`) refuse une deuxième résolution tant que la première n'est pas finie
  (« Passer » touché au même moment, double toucher : un seul tour).
- **Réglages ⚙** : « Déroulé du tour : En direct / Classique » et « Vitesse (par nation) ». En direct par défaut, pour les
  nouvelles parties comme pour les parties en cours. Mémorisés dans une clé dédiée du téléphone
  (`frontieres-arken-deroule`), **jamais dans la sauvegarde de partie** ; l'horloge n'est pas sauvegardée (elle repart à
  zéro au rechargement). Changer de vitesse en cours de tour garde la part du tour déjà écoulée.
- **Bandeau** en haut de la carte (portrait et paysage ; en paysage il ne touche jamais la colonne de droite et se
  raccourcit quand la fiche de province est ouverte) : « ⏱ Tour N · Nation », temps restant, barre de progression à la
  couleur de la nation. Ordre : les nations étrangères en vie dans l'ordre de la carte, **puis la vôtre en dernier**
  (rappel de vos ordres en attente juste avant la résolution, ou « Aucun ordre en attente »). Pour chaque nation : ce que
  vous savez de son dernier tour (`src/presentation/live-news.js` : `eventKnownToPlayer` + `journalEntry`, comme le
  journal), au plus 3 annonces qui défilent pendant ses secondes, détail des pertes retiré (il reste au journal). Une
  annonce où vous êtes l'acteur est rangée chez la nation visée. Sans nouvelle : « Rien de connu ».
  La province concernée est **entourée brièvement** (anneau) ; choix : **la carte n'est pas recentrée**, pour ne pas la
  déplacer sous le doigt pendant qu'on donne un ordre.
- **⏸ Pause / ▶ Reprendre** dans le bandeau, toujours visible. Pause automatique (le bandeau dit pourquoi) : toute fenêtre
  ouverte, page cachée, bulle d'aide ou mini tuto affiché, choix d'une destination en cours (bandeau « Choisissez une
  destination » ; ajouté pour qu'un tour ne se résolve pas au milieu d'un déplacement), animation et fenêtres de fin de
  tour. La pause du joueur reste après la fermeture d'une fenêtre.
- **Fin du tour** : en direct le bouton devient « Passer » (résout tout de suite, sans confirmation) ; en Classique tout
  est exactement comme avant (« Fin du tour » puis « Verrouiller et résoudre », journal ouvert à chaque tour).
- **Journal** : en direct il ne s'ouvre plus tout seul (le bandeau le remplace), toujours accessible par le bouton
  Journal. Les fenêtres qui demandent une décision (prise de capitale, mer, coalition, ballon étranger, propositions
  Oui / Non, écran de fin) s'ouvrent toujours et arrêtent l'horloge.
- **Animation de fin de tour V15.2 gardée** (2,4 s au plus, « Touchez pour passer ») : c'est la carte qui s'anime ;
  l'horloge du tour suivant ne démarre qu'après.
- **Tutoriel et mini tuto** : mode classique gardé (leurs bulles demandent « Fin du tour »).
- **Pub** : aucune pendant le déroulé. La pub de début de partie passe avant l'écran de jeu, donc avant l'horloge ; la
  pub récompensée des Atouts ne s'ouvre que depuis une fenêtre (horloge en pause).
- **Fichiers** : nouveaux `src/presentation/live-clock.js`, `src/presentation/live-news.js`,
  `src/presentation/ui/live-ui.js` (dans `sw.js` et `tests/helpers/sources.js`) ; modifiés `turn-flow.js` (suite de fin
  de tour sortie dans `playTurn`, lignes du récapitulatif dans `pendingOrderLines`), `session.js`, `app.js`,
  `index.html`, `v5.css`, `paysage.css`.
- **Tests** : `tests/v16-4.test.js` (11 tests : durée, nation par nation, pause / reprise, pauses automatiques,
  fin d'horloge = une seule résolution, « Passer » simultané, verrou, vitesse en cours de tour, réglage par défaut /
  mémorisé / hors sauvegarde, classique et tutoriel, annonces connues seulement, branchement de l'interface).
  Test existant modifié (forme du code seulement) : `v13-alliances` lit l'enchaînement dans `playTurn` au lieu du
  `onclick` de « Verrouiller et résoudre ». `npm test` : 663/663.
- **Vérifié dans Chrome mobile simulé (Playwright, tactile)** en 844 × 390 et 390 × 844 (`/home/claude/pw/v164.mjs`,
  captures dans `/home/claude/pw/v164/`) : 3 tours joués tout seuls en vitesse rapide (75 s), journal jamais ouvert
  seul, proposition d'alliance qui met l'horloge en pause, bulle d'aide en pause, ⏸ / ▶ (le temps ne bouge pas pendant
  3 s), pause automatique avec l'Aide ouverte, « Passer » sans confirmation, double « Passer » = un seul tour, retour au
  Classique (bandeau caché, « Fin du tour », plus d'avance seule, confirmation revenue), réglage gardé et horloge
  remise à zéro après rechargement ; anneau sur la province annoncée (`v164-anneau.mjs`). 0 erreur JavaScript, aucun
  débordement, aucun bouton caché (seul « Voir toute la carte » passe sous la fiche en portrait, comme en V16.0).
- **Non vérifié** : vrai téléphone (lisibilité du bandeau en plein soleil, rendu de l'emoji ⏸ — le Chrome de test
  n'a pas la police emoji), partie longue entière en direct, écran de fin atteint par l'horloge, très petit téléphone
  couché (667 × 375). **Intégration V16.2** (île, développée en parallèle) : si l'île devient un acteur, il faudra
  l'ajouter à l'ordre du bandeau (`liveNationOrder`) et vérifier `actorOf` pour ses événements.
- **À regarder en bêta avec Jack** : les échanges des IA (citations longues) prennent beaucoup de place dans le bandeau ;
  on pourra les retirer des annonces si c'est trop bavard.
- **Relecture indépendante** : rien de bloquant pour la bêta. Corrigé ensuite : l'horloge s'arrête aussi pendant la pub de
  début de partie (pub native AdMob comprise, qui n'est pas une fenêtre) ; une fiche de province ouverte pendant une
  résolution en direct est remise à jour. Non corrigé (mineur) : revenir à l'accueil puis reprendre remet l'horloge à
  zéro ; après la fin de partie, le bouton affiche encore « Passer » (il rouvre l'écran de fin) ; les rapports de vos
  propres ballons restent dans le journal, pas dans le bandeau.

### V16.2 (19/11/2026)
- **Carte** : `p21` « Île mystérieuse » = la petite île rocheuse au centre de la carte Leonardo (contour relevé sur l'image,
  46 points ; pas de nouveau dessin). Une seule province, `nation: null`, `neutral: true`, sans voisin terrestre, un point de port
  à l'est de l'île (745, 760). Nouvel outil `tools/carte/ile-mysterieuse.py` (idempotent, à relancer après `decouper.py`), puis
  `generer-module.mjs`. `verifier.py` contrôle l'île à part (anneau inchangé : 5 routes, 1 route d'anneau par point de port) et
  `controle.py` la dessine en gris. **5 routes** depuis le point de port de chaque nation le plus proche du port de l'île :
  Branvale (p03), Belrivage (p07), Grèsrouge (p11, plus proche que Noireflamme p09 de 1 px), Glacenoire (p13, un point de passage
  contourne les îlots), Aurorelle (p17). Durée : `RULES.mysteryIsland.routeTurns` = 4 tours, quelle que soit la longueur.
- **Moteur** (module pur `src/domain/mystery-island.js`, réglages `RULES.mysteryIsland`) :
  - Garnison de départ neutre (`ownerId: null`) = 3 × toutes les troupes d'une nation au départ, lues sur l'état initial
    (capitale + 3 provinces, `START_UNITS`) : 960 fantassins, 30 cavaliers, 18 blindés, 6 artilleurs. Elle ne recrute ni ne bouge
    (aucune IA, aucun ordre), elle guérit comme toute garnison au repos.
  - Construction et recrutement refusés sur l'île (message clair) ; jamais base navale de l'IA.
  - Super banque : +10 or par tour (`incomeBreakdown().island`, ligne « super banque de l'île » au journal des revenus).
    **Tranché** : l'île ne rapporte que sa super banque (pas les +4 d'une province), pour que « +10 » et « +5 chacun » soient exacts.
  - Vision : `p21` toujours visible par tous, troupes comprises (garnison, propriétaire, alliés stationnés), sans ballon.
  - Combat : attaquer l'île neutre ne déclare aucune guerre et ne compte pas comme agression ; attaquer un propriétaire = guerre,
    comme ailleurs. Chaque combat sur l'île porte `mystery: { left, coOwnerId }` : le journal de **toutes** les nations dit qui
    attaque, les morts de chaque camp et les troupes restantes (« 🏝 Île mystérieuse : … »). Garnison nommée « Garnison neutre »
    (clé `neutre` dans les pertes).
  - Prise à deux : un allié du vainqueur qui débarque le même tour devient `coOwnerId` (vainqueur = règle existante : le plus de
    PV) ; ses survivants restent stationnés (droit de passage), banque 5 / 5, les deux repartent de l'île. Alliance rompue (ordre
    de rupture, guerre, `setRelation`), nation éliminée ou île perdue → part perdue, troupes rapatriées (V13.4), annonce publique
    `mystery-coowner-lost`. Une troisième nation qui la prend récupère tout.
  - Ballons : ils ne survolent jamais l'île (graphe des îles des nations seulement, vérifié par test) ; 2e ballon pour le
    propriétaire principal seulement (règle V16.1).
  - Classement : l'île compte comme une province pour le propriétaire principal (inchangé). Histoire de fin : section « Île
    mystérieuse » (marque `i`).
  - Aide « Prends l'île avec moi » (`kind: 'island'`), étendue d'« Attaque X avec moi » : réponse selon le caractère
    (Conquérant 90 %, Héros 50 % ou toujours si l'île est à un agresseur, Bâtisseur 35 %, Traître promet sans venir), 12 répliques
    par liste. Accord : l'allié IA embarque le **même tour** que le demandeur (joueur ou IA) pour débarquer avec lui.
- **IA** (`src/domain/engine/ai-island.js`) : débarque si sa simulation de combat (même `aiAttackSlice`, marge ≥ 1,15) dit
  qu'elle prend l'île ; contre un propriétaire nation seulement s'il fait partie de ses cibles ; sinon demande l'aide d'un allié IA
  si leurs deux armées suffisent ; en paix, rassemble ses troupes sur le point de port relié à l'île. Propriétaire : renforts sous
  200 fantassins équivalents, jamais plus de 50 % de la garnison engagée depuis l'île, débarquements ordinaires depuis l'île.
  Correction en cours de route : les routes de l'île ne comptent pas dans le choix de la base navale (sinon toutes les IA
  changeaient de base et le Conquérant attaquait deux fois moins).
- **Sauvegarde** : pas de nouveau schéma (11 / 12). Une partie commencée avant la V16.2 reçoit l'île au chargement
  (`ensureMysteryIsland` dans `migrateSave`), neutre, garnison de départ, rien d'autre ne change. Choisi plutôt qu'« une partie
  sans île » : tout le code peut compter sur les 21 provinces de la carte (une province absente faisait planter l'IA et la carte).
  Les empreintes `tools/empreintes-*.json` changent (attendu, non revérifiées).
- **Interface** : île dessinée (gris neutre) et touchable, pastille « 🏦+10 » (🤝 si co-propriété) ; fiche « Île mystérieuse »
  (statut, garnison visible, super banque, routes 4 tours et port d'embarquement du joueur, co-propriétaire, rien à construire) avec
  seulement « Déplacer » pour le propriétaire / co-propriétaire ; note dans la fenêtre de débarquement ; bouton « 🏝 Prends l'île
  avec moi » dans « Aide de X » ; ligne « Île mystérieuse » dans l'aide (≤ 280 caractères). Le tutoriel ignore l'île.
- **Tests** : `tests/v16-2.test.js` (24 tests). Tests existants modifiés car la règle a changé (l'anneau seul n'est plus toute la
  mer) : `marine-v10` (destinations de Branvale, durée 4 tours vers l'île), `marine-v13` et `v9-map` (contrôles de l'anneau sur
  les routes hors île, p21 après p20), `vision-v13` (p21 visible au départ). Ajout aux listes `sw.js` / `tests/helpers/sources.js`.
  `npm test` : 691 / 691 (après intégration des V16.3 et V16.4).
- **Mesure** (`node tools/equilibre.mjs 100 80 v160a`, mêmes graines ; avant = main ee19ec1) :

| Mesure | V16.1 | V16.2 |
|---|---|---|
| Vainqueur net | 78 | 71 |
| Conquêtes par tranche de 20 tours | 522 / 402 / 698 / 693 | 522 / 402 / 700 / 702 |
| Capitales perdues par partie | 1,62 | 1,60 |
| Parties avec élimination / coalition | 30 / 34 | 29 / 32 |
| Victoires Valmorne / Roc-Épine / Noireflamme / Oroël / Aurel | 12 / 21 / 25 / 14 / 28 | 11 / 21 / 24 / 19 / 25 |
| Victoires Héros / Conquérant / Traître / Bâtisseur | 42 / 21 / 15 / 22 | 41 / 17 / 15 / 27 |

  **L'île sur ces 100 parties** : prise dans 21 parties, entre les tours 56 et 80 (médiane 70), **toujours à deux** sauf une fois
  (21 prises communes sur 22), chaque première prise par un couple Bâtisseur + Héros alliés (les seuls qui rassemblent leur armée en paix),
  reprise une seule fois ensuite (22 prises en tout) ; 96 demandes « Prends l'île avec moi » entre IA. Le propriétaire de l'île gagne 10 de ces 21 parties
  (prise tardive : la super banque rapporte peu avant la fin). Lecture : le début de partie ne change pas ; la garnison ×3 tient
  longtemps, l'île ne décide pas la partie. **À surveiller en bêta** : un joueur humain peut la prendre bien plus tôt (avec un allié
  IA) ; si c'est trop fort, relever `garrisonFactor` (le cahier le prévoit). Les Conquérants et Traîtres ne la visent presque jamais.
- **Vérifié dans un Chrome mobile simulé** (390 × 844 tactile, `pw/v162.mjs`) : île visible au centre avec ses 5 routes, toucher
  de l'île → fiche complète, débarquement Branvale → île (4 tours, note de l'île), convoi en mer, débarquement repoussé annoncé
  (« Neutre tient la province »), 6 tours joués ; 0 erreur JavaScript, aucun débordement horizontal.
- **Relecture indépendante (V16.2)** : rien de bloquant (stress de 20 parties, ancienne sauvegarde reprise octet pour
  octet, paysage vérifié). Non corrigé, mineur : quand une 3e nation prend l'île à un couple, l'annonce « part perdue »
  n'est pas publiée (le combat, lui, l'est) ; un allié dont toutes les troupes meurent au débarquement devient quand
  même co-propriétaire ; « à Île mystérieuse » au lieu de « à l'Île mystérieuse » dans quelques messages génériques.
