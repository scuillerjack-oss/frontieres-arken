# FRONTIÈRES: ARKEN — V17 — cahier des charges du temps réel (V17.0, 19/11/2026)

> Base : plan validé par Jack le 19/11/2026 (`docs/V17-plan-temps-reel.md`). Ce cahier fixe **tous les chiffres** du
> temps réel pour que les équipes V17.1 à V17.10 codent sans deviner. Rien n'est codé en V17.0 : seuls des outils de
> mesure ont été ajoutés (`tools/v17/`), qui font tourner **le moteur actuel** (V16.4.1).
> Les points marqués **« tranché par l'équipe, à valider en bêta »** sont des choix faits à la place de Jack : ils
> s'appliquent tels quels s'il ne dit rien.
>
> Point de départ des mesures : `main` V16.4.1 (commit `4fb8110`). Toutes les simulations sont reproductibles (graines fixes).

## Sommaire
0. Résumé en une page
1. Le temps
2. Conversion des durées (tour → jours)
3. Économie par jour
4. Nourriture, fermes, famine
5. Combats en temps réel
6. Déplacements
7. IA en temps réel
8. Vision et pastilles
9. Fin de partie et classement
10. Pubs et Premium
11. Sauvegarde
12. Découpage V17.1 → V17.10
13. Simulations (résultats bruts et comment les relancer)
14. Points tranchés, incertitudes
15. Réalisé

---

## 0. Résumé en une page

| Sujet | Valeur retenue |
|---|---|
| Horloge | 1 jour = 2 s (×1) ; 1 s en ×2 (Premium) ; ⏸ / ▶ gratuits |
| Date | jour 1 = **1er janvier 2027** ; fin le **31 décembre 2041** (jour 5 479) = 15 ans = **3 h 02 min** en ×1 |
| Partie courte | 7 ans (2027-2033, 2 557 jours, 1 h 25) |
| Un « tour de délai » (chantiers, trajets, mémoires) | **30 jours** (1 min) |
| Un « tour d'économie » (revenus) | **60 jours** : un revenu « par tour » devient « par 2 mois » |
| Trajet terrestre | 30 jours (20 jours pour une armée de cavalerie seule) |
| Trajet maritime | 60 jours entre deux nations, 120 jours vers l'île mystérieuse |
| Recrutement | infanterie / cavalerie 30 j, blindés / artillerie 60 j, navire 90 j |
| Constructions | banque, usine, port 90 j ; forteresse 60 j par niveau ; ferme 60 j par niveau ; ballon 60 j |
| Revenus | province 2 or / mois, banque 2,5, usine 1,5, port 1, super banque de l'île 5 (coûts inchangés) |
| Bataille | 3 assauts : le jour de l'arrivée, J+3, J+6 ; les renforts arrivés entre-temps se joignent |
| Nourriture | province 8 vivres / jour, ferme +10 / jour par niveau (5 niveaux, 20/25/30/35/40 or) ; 1 vivre / jour pour 20 or de troupes |
| Famine | réserve à 0 : dégâts −30 % et 1 % de l'armée déserte chaque jour ; alerte sous 10 jours de réserve |
| IA | une décision complète tous les 10 jours par nation, décalées de 2 jours |
| Classement | 100 pts / province, +150 / capitale, 1 pt / 20 or de troupes, 1 pt / 20 or de trésor, 1 pt / 50 jours sans famine |
| Pubs | récompensée : icône toutes les 5 à 10 min de jeu (+1 mois de revenus) ; imposée : au plus 1 toutes les 10 min, seulement à un moment calme |
| Premium | 1,99 € achat unique : ×2 et plus de pub imposée ; le Pack débutant (2,99 €) devient Premium + 3 jetons |
| Rentabilité (projection, 10 000 joueurs) | ~184 € / ~856 € / ~4 074 € nets par mois (bas / central / haut), contre 122 / 435 / 1 305 € aujourd'hui |
| Sauvegarde | nouveau schéma **13** ; une partie tour par tour (schéma ≤ 12) ne se reprend pas : message clair, nouvelle partie |

---

## 1. Le temps

### 1.1 Horloge
- **1 jour de jeu = 2 secondes** en vitesse normale (×1). **×2 = 1 seconde par jour**, réservé au Premium.
- L'horloge avance **par jours entiers** (« à-coups ») : le moteur est appelé une fois par jour (`advanceDay`), jamais
  entre deux jours. Rien n'est continu : une icône qui avance le fait d'un pas par jour.
- Boutons **▶ Play / ⏸ Pause** (gratuits) et **⏩ ×2** en bas à droite (V17.6). Sans Premium, ⏩ montre un cadenas et ouvre
  l'offre Premium (jamais dans le tutoriel).
- **En pause, le joueur peut tout faire** (ordres, constructions, diplomatie) : les ordres partent « aujourd'hui » et
  avancent dès que le temps repart.
- **Pas de pause automatique pendant le jeu** (décision de Jack du 19/11 : « même s'il y a un message d'alerte, le temps
  ne s'arrête pas, c'est le joueur qui décide s'il met pause ou non ») : fiche de province, construction, recrutement,
  choix d'une destination, Journal, Échanges, Classement et alertes (attaque, famine, proposition, ballon) laissent
  le temps tourner. Seules exceptions, parce qu'on sort du jeu : Réglages, Aide, Atouts, Palmarès, écran Premium, la
  fenêtre de fin de partie, une pub en cours, et l'appli en arrière-plan.
- L'horloge est **pilotée par l'interface** (`setInterval` 250 ms qui compte le temps réel écoulé, appelle
  `advanceDay` autant de fois que nécessaire, au plus 4 jours par appel pour rattraper un téléphone lent). Le moteur ne
  connaît pas les secondes : il ne reçoit que « un jour de plus ».

### 1.2 Date
- Jour 1 = **1er janvier 2027** (à décaler si la sortie glisse : une seule constante `RULES.realtime.startDate`).
- Calendrier réel (années bissextiles comprises), calculé en UTC à partir du numéro de jour : `dateOfDay(day)`.
- Affichage : « 14 mars 2029 » en haut de l'écran (V17.6) ; dans le journal, la date courte « 14/03/2029 ».
- Repères : 1 mois ≈ 1 min ; 1 an ≈ 12 min ; 15 ans ≈ 3 h.

### 1.3 Durée de la partie
- **Partie normale : 15 ans**, du 1er janvier 2027 au **31 décembre 2041** inclus = **5 479 jours** = 3 h 02 min 38 s en ×1
  (1 h 31 en ×2). Tranché par l'équipe : 5 479 jours plutôt que 5 400, pour une date de fin ronde (« fin le 31 décembre
  2041 ») qui se comprend sans calcul.
- **Partie courte** (gardée, V15.4) : 7 ans, 2027-2033, **2 557 jours** (1 h 25). Tranché par l'équipe, à valider.
- Alertes de fin : « Il reste 1 an » (jour 5 115 = 1er janvier 2041) et « Dernier mois » (jour 5 450 = 2 décembre 2041).
  Partie courte : « Il reste 6 mois » et « Dernier mois ».
- Conquête du monde (§9) : la partie peut finir bien avant.

### 1.4 Appli fermée, téléphone en veille
- **Le temps s'arrête** : aucune progression hors ligne (pas de calcul « pendant ton absence »).
- Page cachée (`visibilitychange`), appli en arrière-plan, écran éteint : pause immédiate et sauvegarde.
- **Au retour, la partie reprend toujours en pause** (« ⏸ En pause — touchez ▶ pour reprendre ») : le joueur relit la
  carte avant que le temps ne reparte. Tranché par l'équipe.
- Sauvegarde **continue** (§11) : au pire 10 jours de jeu (20 s) perdus si le téléphone coupe brutalement.

---

## 2. Conversion des durées (tour → jours)

### 2.1 Le raisonnement
Le tour actuel mélange deux choses qui n'ont pas la même durée en temps réel :
1. **Le rythme de l'économie** (combien d'or entre dans une partie). Cible de Jack : une partie de 80 tours ≈ 3 h, soit
   5 400 jours ÷ 80 = **67,5 jours par tour**. Arrondi retenu : **60 jours = 2 mois**. La partie de 5 479 jours contient
   donc **91 tours d'économie**, à peine plus que les 80 tours calibrés depuis la V10.
   *Mesure (§13.2)* : allonger l'économie n'apporte rien. Sur 100 parties IA poussées à 180 tours, aucune nation ne
   conquiert le monde, les conquêtes **ralentissent** après le tour 100 (752 par tranche de 20 tours au tour 80, 354 à
   la fin) et la plus grande armée triple (médiane 3 095 or au tour 80, 6 430 au tour 180) : plus d'or = des armées
   énormes qui se neutralisent. On garde donc ≈ 90 tours d'économie.
2. **Le délai d'une action** (chantier, trajet, mémoire d'un dirigeant). En V16.4, Jack a validé un tour « en direct »
   d'environ **1 minute** (10 s × 6 acteurs) : c'est le rythme d'action qu'il connaît. 1 minute = **30 jours**. Un délai
   de 60 jours ferait attendre 2 minutes 20 fantassins : trop lent pour du temps réel.

D'où **deux conversions, et deux seulement** (plus une pour les « phases de partie ») :

| Famille | Règle | Exemples |
|---|---|---|
| **Délais** (durée d'une action, mémoire, délai diplomatique) | 1 tour = **30 jours** | recrutement, chantier, trajet, guérison, trêve, mémoire de l'IA |
| **Revenus** (or « par tour ») | 1 tour = **60 jours** : par jour = par tour ÷ 60 | province, banque, usine, port, super banque |
| **Phases de partie** (seuils en tours d'une partie de 80 tours) | jour = tour × 5 479 ÷ 80 (partie courte : × 2 557 ÷ 40) | IA « fin de partie » (45), coalition possible (10), croissance des garnisons estimées |

**Vérification par simulation (§13.3)** : le moteur actuel joué « au pas de 30 jours » (1 inter-tour = 30 jours,
revenus divisés par 2, seuils de phase étirés, 183 inter-tours) est exactement ce modèle, à la granularité d'un mois.
Sur 100 parties : 33,8 conquêtes par partie (26,1 au pas de 60 jours), réparties régulièrement (9,3 / 8,3 / 9,3 / 6,9 par
quart de partie), 0,72 nation éliminée par partie (0,45), plus grande armée finale 3 635 or (3 208). La carte bouge
davantage sans que les armées n'explosent : c'est l'effet voulu du temps réel.

### 2.2 Table de conversion (toutes les durées du jeu)
Valeurs en jours de jeu ; entre parenthèses, la durée réelle en ×1.

| Élément | Aujourd'hui | Temps réel | Où dans le code actuel |
|---|---|---|---|
| Infanterie, cavalerie | 1 tour | **30 j** (1 min) | `RULES.units.*.turns` |
| Blindés, artillerie | 2 tours | **60 j** (2 min) | idem |
| Navire de guerre | 3 tours | **90 j** (3 min) | idem |
| Banque, usine, port | 3 tours | **90 j** | `RULES.buildings.*.turns` |
| Forteresse (par niveau) | 2 tours | **60 j** | idem |
| Ferme (par niveau, nouveau) | — | **60 j** | §4 |
| Ballon (construction) | 2 tours | **60 j** | `RULES.balloon.turns` |
| Ballon (un saut d'île en île) | 2 tours | **60 j** | `RULES.balloon.hopTurns` |
| Province voisine par la terre | résolu dans le tour | **30 j** ; armée **de cavalerie seule : 20 j** | §6 |
| Mer, entre deux nations (anneau) | 2 tours | **60 j** | `RULES.naval` |
| Mer, vers / depuis l'île mystérieuse | 4 tours | **120 j** | `RULES.mysteryIsland.routeTurns` |
| Interception par le port d'arrivée | à l'avant-dernière étape | quand il reste **30 j** de traversée | `navalEncounters` |
| Convoi repoussé / qui rentre | même durée que l'aller | idem (60 ou 120 j) | `turnBack` |
| Guérison des troupes | 10 % des PV max / tour sans combat | **10 % par 30 j**, versés tous les 10 j (3,34 %, arrondi au supérieur), si aucun combat dans la province depuis 10 j | `healRate` |
| Navires au port | 100 % en 3 / 4 / 5 tours | **90 / 120 / 150 j** (versés tous les 10 j) | `SHIP_REPAIR_TURNS` |
| Réparation de fortune | 5 % / tour | 5 % par 30 j (tous les 10 j : 1,67 %) | `SHIP_FIELD_REPAIR` |
| Brèche (bombardement) | +12 / navire / tour, max +30 / tour | tous les 10 j : **+4 / navire, max +10** | `RULES.bombard` |
| Brèche qui se referme | −10 / tour sans bombardement | **−10 tous les 30 j** sans bombardement | `repairPerTurn` |
| Rompre une trêve = trahison | moins de 10 tours | moins de **300 j** | `TRUCE_BETRAYAL_TURNS` |
| Proposition valable | 6 tours | **180 j** | `PROPOSAL_TURNS` |
| Réponse d'une IA à une proposition | à l'inter-tour | à sa **prochaine décision : 1 à 10 j** | §7 |
| Message sans réponse | 6 tours | **180 j** | `PENDING_TURNS` |
| Aide entre alliés (engagement) | 5 tours + trajet | **150 j** + trajet | `HELP_TURNS` |
| Stationnement minimal (IA) | 5 tours | **150 j** | `STATION_MIN_TURNS` |
| Provocation / charme / refus mémorisés | 8 / 12 / 20 tours | **240 / 360 / 600 j** | `leaders.js`, `REFUSAL_MEMORY` |
| Mémoire des agressions (Héros, ballon) | 5 tours | **150 j** | `HERO_MEMORY_TURNS`, `AI_BALLOON_HERO_MEMORY` |
| Traître : délai avant de frapper | 3 ou 7 tours + 0 à 5 | **90 ou 210 j + 0 à 150 j** | `ai.js` |
| Traître : rupture + guerre forcée | +6 tours | **+180 j** | idem |
| Facile : délai de guerre du Conquérant | 8 tours | **240 j** | `RULES.difficulty.facile.warDelay` |
| Facile : une attaque terrestre par tour | par tour | une attaque terrestre **lancée par 30 j** | `oneAttack` |
| Parler (IA) | une fois par tour au plus | une fois par **30 j** au plus et par nation (décalées) | `aiTalk` |
| Dérive de la tension | chaque tour | tous les **30 j** | `driftTension` |
| Rapport privé du ballon | chaque inter-tour | tous les **30 j** (la vision, elle, est immédiate) | `balloonReport` |
| Coalition possible | dès le tour 10 | dès le **jour 685** (15 nov. 2028) | phase |
| IA « fin de partie » (Conquérant, Traître, Bâtisseur) | tour 45 | **jour 3 081** (8 juin 2035) | phase |
| Bâtisseur démasqué / Traître courtisan / Bâtisseur et Héros | tours 20 / 10 / 6 | jours **1 370 / 685 / 411** | phase (`scaleTurn`) |
| Garnison estimée (brouillard) | × (1 + 0,03 × (tour − 1)) | × (1 + 2,37 × jour ÷ 5 479) : même facteur 3,37 en fin de partie | `RULES.vision.growthPerTurn` |
| Mémoire des garnisons vues (IA) | 80 tours | toute la partie | `GARRISON_MEMORY_TURNS` |
| Fin de partie | tour 80 (40) | jour **5 479** (2 557) | `RULES.gameLength` |

**Technique (V17.1)** : pour ne pas réécrire toutes ces règles, le moteur temps réel garde un compteur `state.turn` qui
devient la **période de 30 jours** en cours (`turn = floor((day − 1) / 30) + 1`). Toutes les mémoires et délais
exprimés en tours (lignes « 30 j » ci-dessus) se convertissent alors tout seuls. La longueur de partie en périodes vaut
183 (partie courte : 86) : `gameLengthOf` la renvoie pour une partie temps réel, si bien que `scaleTurn` étire les seuils
de phase comme dans la simulation §13.3. Les seules valeurs à écrire en jours sont les durées d'action (chantiers,
trajets, assauts, guérison, brèche) : elles vivent dans `RULES.realtime` (§12, V17.1).

---

## 3. Économie par jour

### 3.1 Revenus
Formule inchangée (`incomeBreakdown`) ; elle donne un revenu **par tour d'économie (60 jours)**. Chaque jour :
`nation.goldCarry += incomeFor(state, id) (+ bonus d'atout et de nation, calculés sur ce montant)` ;
`treasury += floor(goldCarry / 60)` ; `goldCarry %= 60`. Le trésor reste un **entier** (aucune règle existante ne change) et
rien ne se perd : au bout de 60 jours, la nation a touché exactement un tour de revenus.

| Source | Par tour aujourd'hui | Par jour | **Par mois (affiché)** |
|---|---|---|---|
| Province possédée | 4 | 0,067 | **2 or** |
| Banque | 5 | 0,083 | **2,5 or** |
| Usine | 3 | 0,05 | **1,5 or** |
| Port construit | 2 | 0,033 | **1 or** |
| Super banque de l'île | 10 (5 + 5 en co-propriété) | 0,167 | **5 or** (2,5 + 2,5) |
| Atout « or », bonus Aurel (+4 %), difficulté (IA +15 %) | % du revenu | idem | idem |

Affichage (V17.3) : « Trésor 135 · +8 or / mois ». Le détail « provinces, banques… » du journal des revenus devient un
écran « Revenus » (plus d'événement `income` chaque jour : un récapitulatif le 1er de chaque mois, sans bandeau).

### 3.2 Coûts : inchangés
Recrutements (20 / 20 / 30 / 25 / 65 or), bâtiments (30 / 40 / 40 ; forteresse 20 / 35 / 50), ballon 30, trésor de
départ 120, trésor de guerre 30, pillage de capitale 50 % (minimum 60), trêves payées : **rien ne change**. Toutes les
règles de l'IA qui comparent de l'or (réserve du ballon 60, etc.) restent justes.
Repère : une nation de départ (4 provinces) gagne 8 or par mois, soit un lot de 20 fantassins toutes les 2,5 minutes ;
une banque est remboursée en 12 mois (12 min) après ses 3 mois de chantier.

### 3.3 Dépense et paiement
On paie **au moment de l'ordre** (comme aujourd'hui) ; le chantier démarre immédiatement. Annuler un chantier ou un
recrutement **avant qu'il ne commence à produire** n'existe plus (il démarre tout de suite) ; une production perdue
avec sa province reste remboursée (règle B4).

---

## 4. Nourriture, fermes, famine

### 4.1 Unité et production
- Unité : le **vivre** (icône 🌾). Tout est compté en **centièmes de vivre** (entiers) dans le moteur : aucun arrondi
  flottant, résultat identique sur tous les téléphones.
- **Province possédée : 8 vivres / jour** (champs ordinaires), sauf l'île mystérieuse (0).
- **Ferme** : nouvelle construction à niveaux, **+10 vivres / jour par niveau**, **5 niveaux au plus par province**.
  Coût par niveau **20 / 25 / 30 / 35 / 40 or**, **60 jours** par niveau, **un niveau à la fois** (comme la forteresse :
  « Ferme : un niveau est déjà en construction »). Aucun prérequis. Interdite sur l'île. Prise avec la province (comme
  tout bâtiment) ; chantier perdu avec la province = remboursé (B4).
- Plafond d'une province : 8 + 5 × 10 = **58 vivres / jour** (de quoi nourrir 1 160 or de troupes).

### 4.2 Consommation
- **1 vivre par jour pour 20 or de troupes** (valeur = coût de recrutement). Règle unique, facile à expliquer :
  « une armée mange en proportion de ce qu'elle a coûté ».

| Unité | Valeur | Vivres / jour par unité | Repère |
|---|---|---|---|
| Fantassin | 1 or | 0,05 | un lot de 20 = 1 / jour |
| Cavalier | 4 or | 0,2 | un lot de 5 = 1 / jour |
| Blindé | 30 or | 1,5 | |
| Artillerie | 25 or | 1,25 | |
| Navire de guerre | 65 or | 3,25 | **les navires mangent aussi** (équipages) |

- Comptent : toutes les unités de la nation, où qu'elles soient (provinces, troupes stationnées chez un allié, en marche,
  en mer, blessées comprises). La garnison neutre de l'île ne mange pas.
- **Départ** : armée de départ = 590 or (320 fantassins, 10 cavaliers, 6 blindés, 2 canons) = **29,5 vivres / jour** ;
  production 4 × 8 = **32 / jour** : la nation de départ est juste à l'équilibre (+2,5 / jour).

### 4.3 Réserve
- **Réserve nationale** (une seule par nation) ; départ **900 vivres** (≈ 30 jours de l'armée de départ).
- **Grenier plafonné à 180 jours de production** (au départ 32 × 180 = 5 760) : on ne peut pas stocker pendant 10 ans de
  paix puis lever une armée géante sans fermes. Au-delà, le surplus est perdu (affiché « grenier plein »).
- Chaque jour : `réserve += production − consommation`, bornée entre 0 et le grenier.

### 4.4 Famine (règle validée par Jack)
- **Alerte** (bandeau orange, une fois, puis rappel tous les 30 jours) quand la réserve tiendra **moins de 10 jours** au
  rythme actuel (`réserve ÷ (consommation − production) < 10`). Rien si la production couvre la consommation.
- **Famine** = réserve à 0 et consommation > production. Tant qu'elle dure :
  - **dégâts −30 %** de toutes les forces de la nation (attaque et défense, terre et mer) ;
  - **chaque jour, 1 % de l'armée déserte**. Calcul exact : pour chaque type, `reste[k] += unités[k]` (en centièmes) ;
    chaque fois que `reste[k] ≥ 100`, une unité de ce type part de la **plus grosse pile** (égalité : identifiant de province,
    puis troupes chez soi avant troupes stationnées, puis convois). Événement privé « 🌾 Famine : 12 fantassins ont déserté ».
  - La famine s'arrête d'elle-même : les désertions baissent la consommation jusqu'à ce que la production suffise.
- Sortie de famine : bandeau vert « Les vivres sont revenus ».
- Score : chaque jour de famine retire le bonus « jour sans famine » (§9).

### 4.5 Ce que fait l'IA (V17.5)
Règle mesurée en §13.4 : si la production (niveaux en chantier compris) est **sous 110 % de la consommation**, l'IA lance
**un** niveau de ferme dans sa province qui en a le moins (égalité : identifiant), si elle garde **10 or** après l'avoir
payé. Une ferme en chantier à la fois. Cette décision passe **avant** ses recrutements.

### 4.6 Calibrage (mesuré, §13.4)
100 parties IA, 90 tours d'économie, règle IA ci-dessus, fermes payées avec le vrai trésor :

| Mesure | Ferme +7 / j | **Ferme +10 / j (retenu)** | Ferme +14 / j |
|---|---|---|---|
| Fermes par nation en fin de partie (médiane / p90 / max) | 14 / 20 / 26 | **11 / 15 / 22** | 8 / 11 / 16 |
| Fermes par province (médiane / p90 / max) | 3 / 4,75 / 5 | **2,3 / 3,7 / 5** | 1,8 / 2,8 / 4,5 |
| Part de l'or dépensé dans les fermes (médiane / p90) | 10 % / 14 % | **7 % / 10 %** | 5 % / 7 % |
| Nations ayant connu la famine | 17 sur 454 | **8 sur 455 (1,8 %)** | 3 sur 462 |
| Armée finale médiane (or) | 2 272 | **2 385** | 2 392 |

Sans nourriture (témoin, mêmes graines) : armée finale médiane 2 465 or (p90 3 627), conquêtes 26,3 par partie (26,1
avec). Les provinces seules nourrissent **29 %** de l'armée finale médiane : les fermes sont indispensables.
Au pas de 30 jours (modèle retenu, §13.3) : 11 fermes par nation (2 par province, p90 3,75), **6 % de l'or** (p90 10 %),
famine pour 17 nations sur 428 (4 %), au plus 104 jours.

Lecture : une armée de fin de partie se nourrit avec **2 à 4 fermes par province**, pour **6 à 10 % de l'or** : ni
gratuit, ni écrasant. Le plafond (5 niveaux) n'est atteint que par les plus grosses armées tenues sur peu de provinces :
pour nourrir plus, il faut conquérir. Un joueur qui recrute sans fermes atteint la famine (l'IA, elle, presque jamais).
Non simulé : le malus de dégâts −30 % (inconnu du moteur actuel) ; la famine réelle sera un peu plus punitive.

---

## 5. Combats en temps réel

### 5.1 Ce qui ne change pas
Tout le calcul d'un assaut : PV et dégâts par unité, multiplicateurs, blessures (50 % tuent, 50 % blessent, plafond 50 %),
forteresse −5 % de dégâts reçus par niveau (défenseur seulement, atout compris), brèche, malus de débarquement 85 %,
cargaison ×1,5 en mer, **navires qui ne tirent que sur des navires à terre** (V16.0), plusieurs attaquants contre une même
province (B2 : le plus fort survivant prend), pillage de capitale, trésor de guerre, remboursement des productions
perdues (B4), guerre automatique, attaques publiques de l'île. La fonction `resolveBattle` est **réutilisée telle quelle**.

**Vérifié (§13.5)** : une bataille découpée en assauts d'**une passe** rejoués sur les survivants donne exactement le
même résultat qu'une bataille de 3 passes du moteur actuel (400 batailles sur 400, forteresses et débarquements compris).
C'est ce qui permet d'étaler la bataille dans le temps sans toucher aux règles.

### 5.2 Bataille terrestre (attaque, débarquement)
- Elle commence le jour où la première armée ennemie **arrive** dans la province. Objet `state.battles[]` :
  `{ id, provinceId, startDay, assaults, nextAssaultDay, attackers:[{ nationId, force, originIds, retreatTo, mode }], landing }`.
- **3 assauts** : le jour de l'arrivée (J0), **J+3**, **J+6** (`RULES.realtime.assaultEveryDays = 3`, `assaults = 3`).
  Chaque assaut = `resolveBattle({ …, passes: 1 })` sur les forces présentes ce jour-là. Une bataille dure donc
  **6 jours** au plus (12 s en ×1).
- Arrêt anticipé : dès qu'un assaut laisse le défenseur sans unité combattante → **prise** (règles V10) ; dès qu'aucun
  attaquant ne peut plus combattre → la défense tient.
- **Renforts** : une armée qui arrive pendant la bataille la rejoint au **prochain assaut** (attaquant : même nation ou
  autre nation en guerre contre le défenseur, règle B2 ; défenseur : troupes du propriétaire, troupes stationnées d'un
  allié, recrues livrées). Le compteur d'assauts ne repart pas à zéro.
- Après le **3e assaut sans prise** : tous les attaquants survivants **se replient** vers leur province d'origine (par la
  terre : trajet de 30 jours, visible ; par la mer : le convoi rentre, 60 ou 120 jours). Origine perdue entre-temps :
  règles actuelles (`retreat-lost`, sauvetage V14.0).
- **Retraite volontaire** : bouton « Retraite » sur la bataille (joueur), ou IA à sa décision si sa simulation dit
  qu'elle perd : les survivants repartent tout de suite (même trajet de retour). Le défenseur ne peut pas quitter une
  province assiégée tant que la bataille dure (ses troupes y sont **bloquées**) — tranché par l'équipe.
- **Prise** : la province change de main le jour de l'assaut gagnant ; les troupes survivantes du vainqueur y restent ;
  les autres attaquants rentrent. Productions en cours perdues et remboursées (B4), fermes, banques… gardées.
- Pas de guérison dans la province pendant la bataille et **10 jours** après (§2.2).
- **Famine** : les forces d'une nation affamée tirent à 70 % (nouveau paramètre `fireFactor` par camp dans `resolveBattle`,
  multiplié comme `warshipFactor` mais pour toutes les unités ; 1 par défaut, donc rien ne change pour les combats actuels).

### 5.3 Sièges et bombardement
- Le « siège » d'une forteresse est la bataille ci-dessus : la forteresse protège à chaque assaut.
- **Bombardement** : ordre **permanent** « Bombarder X » donné à des navires à quai dans une province reliée à X par la
  mer (mêmes conditions qu'aujourd'hui : en guerre, forteresse en face). Tous les 10 jours : bataille contre la flotte à
  quai d'abord (si port construit), puis **brèche +4 par navire intact, +10 au plus par tranche de 10 jours** ; aucune
  blessure à la garnison (V16.0). Sans bombardement pendant 30 jours, la brèche se referme de 10. L'ordre s'arrête de
  lui-même : paix, plus de navires, forteresse prise, ou annulation.

### 5.4 En mer
- **Interception par le port d'arrivée** : le jour où il reste **30 jours** de traversée à un convoi, s'il y a au port
  d'arrivée (port construit, nation en guerre contre lui) des navires à quai : combat naval **immédiat, en une fois**
  (3 passes, `resolveCombat(…, mode:'naval')`, comme aujourd'hui).
- **Rencontre de deux convois ennemis** sur la même route (si l'un au moins a des navires) : combat naval immédiat, en une
  fois, le jour où leurs positions se croisent (sens opposés) ou se trouvent à moins d'un jour l'une de l'autre (même sens).
  Le plus armé est l'agresseur (règle actuelle). Les survivants poursuivent leur route.
- Tranché par l'équipe : les batailles navales restent instantanées (elles sont rares : 1 interception sur 200 tours
  mesurée en V13) ; seules les batailles à terre s'étalent sur plusieurs jours.

### 5.5 Débarquement
Le convoi arrive sur le point de port au bout de la route → bataille terrestre §5.2 en mode `landing` (troupes à 85 %,
escorte qui ne tire que sur les navires). Repli : le convoi rembarque et rentre (même durée que l'aller). Les autres cas
d'arrivée (chez soi, chez un allié, trêve signée après le départ, passage perdu, navires seuls) suivent les règles
actuelles de `resolveTransports`, le jour de l'arrivée.

### 5.6 Rencontre en chemin
Deux armées **ennemies** sur la **même frontière en sens opposés** (A→B et B→A) se rencontrent le jour où la somme de
leurs avancées atteint le trajet entier : **bataille de rencontre** en rase campagne, immédiate, en une fois (3 passes,
sans forteresse, sans prise), comme le « choc frontal » V10. Les survivants poursuivent leur route. Deux armées sur des
frontières différentes, ou dans le même sens, ne se rencontrent jamais. Tranché par l'équipe (règle la plus simple qui
garde le comportement V10).

---

## 6. Déplacements

- **Départ immédiat** : les troupes quittent la province le jour de l'ordre (elles ne la défendent plus).
  Objet `state.marches[]` : `{ id, nationId, fromId, toId, units, wounds, startDay, arriveDay, kind:'land' }`.
  Les convois gardent `state.transports[]` avec `departDay` et `arriveDay` à la place de `stage / turns`
  (`stage = jours écoulés`, `turns = durée en jours` pour réutiliser le code).
- **Durée** : 30 jours par la terre vers une province voisine, quelle que soit la distance sur la carte ; **20 jours pour
  une armée composée uniquement de cavalerie** (tranché par l'équipe : donne enfin un rôle à la cavalerie, presque jamais
  recrutée — 5 cavaliers par nation en fin de partie). Mer : 60 / 120 jours (§2.2). Un seul trajet par ordre (province
  voisine ou route maritime) : pas de chemin en plusieurs étapes en V17 (à étudier après la bêta).
- **Trajet visible** (V17.3) : icône (char, navire ; ballon déjà en V16.1) aux couleurs de la nation, posée sur la flèche
  du trajet à la fraction `(jour − départ) ÷ (arrivée − départ)`, déplacée **une fois par jour**. Touchable : composition
  (selon la vision §8), date d'arrivée, bouton « Rappeler ».
- **Rappel en route** : autorisé tant que l'armée n'est pas arrivée (une armée déjà en bataille utilise « Retraite »).
  Elle fait demi-tour sur place : le retour dure le temps déjà parcouru. Arrivée chez elle : elle rejoint la province
  d'origine si elle est encore à sa nation, sinon règles de repli actuelles. Un convoi rappelé fait de même en mer.
  Pas de changement de destination en route (rappeler puis repartir).
- Les **ordres de passage** chez un allié, l'**embarquement** depuis un point de port, les refus (« On ne débarque qu'au
  point de port… ») : inchangés, mais vérifiés **au départ** (et la cible revérifiée à l'arrivée : alliance rompue,
  trêve, province passée à un tiers → règles actuelles d'annulation, le jour de l'arrivée).
- **Une province attaquée par une armée en marche** : le défenseur voit l'armée arriver (§8) et a 30 jours pour réagir.

---

## 7. IA en temps réel

- **Décision complète** (la logique actuelle de `planAIOrders` pour UNE nation : diplomatie, constructions, fermes,
  recrutements, attaques, aide, ballon) **tous les 10 jours** par nation, **décalées de 2 jours** : la nation n° i décide
  les jours où `(jour + 2 i) % 10 = 0`. Une seule nation calcule un jour donné.
- Pourquoi 10 jours : un trajet terrestre dure 30 jours, donc toute attaque visible est vue **au moins deux fois** par
  le défenseur avant son arrivée ; une bataille dure 6 jours, donc l'IA attaquante décide au plus une fois pendant une
  bataille (retraite éventuelle). Plus souvent ne changerait rien (l'or et les troupes sont le vrai frein).
- **Ses ordres partent tout de suite** (même fonction d'exécution que le joueur). Les réponses aux propositions du joueur
  et aux demandes d'aide se font à cette décision : délai de **1 à 10 jours** (affiché « en attente de réponse »).
- **Coût mesuré** (§13.1, ordinateur de l'équipe) : `planAIOrders` pour les **5 nations** = 3,3 ms en médiane, 5,1 ms au
  p90, 21 ms au pire ; un inter-tour complet = 3,7 ms. Une seule nation par jour ≈ 1 ms, au pire ~5 ms. Même un téléphone
  10 fois plus lent reste sous 50 ms, pour un jour qui dure 2 000 ms (1 000 en ×2) : **moins de 3 % du temps**.
  Garde-fou (V17.5) : si un jour de moteur prend plus de 200 ms sur le téléphone, l'interface saute l'animation de ce
  jour et note la mesure dans les réglages de débogage.
- Paroles des IA : au plus une initiative par 30 jours et par nation (décalées), pour ne pas inonder le bandeau.
- Coalition (`updateCoalition`), éliminations, dérive de la tension : tous les 10 jours (le jour où `jour % 10 = 0`).

---

## 8. Vision et pastilles

Règles de vision **V13 + ballon V16.1 inchangées** (qui voit quelle province). Ce qui s'ajoute :
- **Pastille de troupes** sur la carte (V17.6) : sur ses provinces et celles de ses alliés, le **total des PV du régiment**
  (la mesure unique du jeu depuis la V13) en abrégé : « 840 », « 3,9k », « 12k ». Tranché par l'équipe : les PV plutôt
  qu'un nombre d'unités (900 fantassins et 20 blindés ne s'additionnent pas).
- Chez une nation non alliée : **« ? »**, sauf si la province est visible (voisine par la terre d'une province où l'on a
  des troupes, ou île survolée par son ballon) et non cachée par une forteresse (règle V13 ; le ballon voit à travers).
- **L'île mystérieuse** : toujours sa vraie pastille (garnison visible de tous, V16.2).
- **Armées en marche** : une marche est visible de toute nation qui voit **sa province de départ ou d'arrivée** (on voit
  toujours l'armée qui vient chez soi). Composition affichée seulement si la province de départ est visible pour elle
  (ou si c'est soi / un allié) ; sinon icône avec « ? ».
- **Convois** : visibles de tous en mer (comme aujourd'hui), composition seulement pour soi, ses alliés, ou sous son
  ballon.
- **Capitales** : drapeau-emblème de la nation (V17.6).
- L'IA lit la même vision (`perceivedForce`) : aucune triche, y compris pour les armées en marche.

---

## 9. Fin de partie et classement

### 9.1 Fins possibles (vérifiées chaque jour)
1. **Conquête** : une nation tient les **5 capitales** (règle V10 conservée) ou est la **seule nation non éliminée** →
   victoire immédiate.
2. **Défaite** : le joueur est éliminé.
3. **Fin du temps** : le 31 décembre 2041 (jour 5 479 ; partie courte : 31 décembre 2033) → classement à points.
4. **Paix générale** (choix du joueur) : quand **toutes les nations restantes sont alliées deux à deux** et qu'**aucun
   combat** n'a eu lieu entre elles depuis **90 jours** (3 min), une fenêtre propose : « Toutes les nations sont en paix.
   Terminer la partie maintenant, au classement actuel ? — Terminer / Continuer ». Elle met le jeu en pause (décision de fin).
   Refus → reproposée **tous les 180 jours** (6 min) tant que la condition dure. Une alliance rompue remet le compteur à zéro.

### 9.2 Classement à points (consultable en direct)
Bouton 🏆 « Classement », mis à jour tous les 10 jours. Formule (`src/domain/realtime/ranking.js`) :

| Élément | Points |
|---|---|
| Province possédée (île mystérieuse comprise, propriétaire principal) | **100** |
| Capitale tenue (la sienne ou une autre), en plus de la province | **+150** |
| Troupes (valeur en or, toutes unités, blessées comprises, §4.2) | **1 point / 20 or** |
| Trésor | **1 point / 20 or** |
| Jours sans famine | **1 point / 50 jours** (au plus 109 en partie normale) |
| Nation éliminée | 0 point ; classée après les vivantes, la plus tardivement éliminée devant |

Égalité : provinces, puis capitales, puis identifiant (comme `gameRanking`).
**Mesure (§13.6)** sur 100 fins de parties IA : le premier au classement à points est le même que le premier du
classement actuel dans **92 parties sur 100** (75 sur 78 quand il y a un vainqueur net) ; le premier a ~1 100 points
(600 provinces, 300 capitales, 138 troupes, 16 trésor, 108 sans famine), le second ~920. Les provinces restent le cœur du
classement, les troupes et la nourriture départagent.
Ce qui est montré : le total et le rang de chaque nation (public) ; le détail des cinq lignes seulement pour soi et ses
alliés (le total d'une nation laisse deviner son armée : accepté, comme la puissance perçue des V13). Tranché par l'équipe.

### 9.3 Une seule partie, recommençable
« Nouvelle partie » à tout moment (⚙), avec confirmation « Tout sera perdu » ; même nation ou une autre. Palmarès et
titres : une partie compte quand elle se termine (fins 1 à 4) ; une partie abandonnée ne compte pas (V17.8).

---

## 10. Pubs et Premium

### 10.1 Pub récompensée (facultative)
- **Icône discrète** sur le bord gauche de la carte (🎁 avec le montant : « +20 »), qui apparaît **5 à 10 min de jeu**
  après la dernière pub regardée (tirage à graine du profil ; minutes de jeu = horloge qui tourne, pauses exclues).
  Elle reste jusqu'à ce que le joueur la touche. Jamais dans le tutoriel.
- **Récompense : un mois de revenus** (revenu par tour ÷ 2, arrondi au multiple de 5 supérieur, **au moins 10 or**),
  versée seulement si la pub est vue en entier. Regarder toutes les icônes d'une partie ≈ +13 % d'or : un vrai coup de
  pouce, pas une victoire achetée. Tranché par l'équipe.
- La pub met le jeu en pause pendant qu'elle passe. Disponible aussi pour les Premium (c'est un choix).
- Les pubs « mission » et « bonus » des Atouts (V14.4) restent telles quelles.

### 10.2 Pub imposée
- **Au plus une toutes les 10 min de jeu** (même compteur de minutes de jeu), et **seulement à un moment calme** : quand
  le joueur met en pause, ouvre un menu hors jeu (Réglages, Aide, Atouts, Palmarès), revient au menu, ou revient dans le jeu après l'avoir
  quitté. **Jamais** pendant une action (choix d'une destination, fenêtre de décision, bataille du joueur en cours, ordre
  en train d'être donné), jamais dans le tutoriel, **jamais pour un Premium**.
- Regarder une pub récompensée **remet ce compteur à zéro** (le joueur qui choisit ses pubs n'en subit pas d'autres).
- Règle du studio conservée : si le joueur ferme une pub récompensée avant la fin (refus), **plus aucune pub imposée
  jusqu'au prochain lancement**.
- La pub plein écran **de début de partie disparaît** (remplacée par cette règle). Tranché par l'équipe.
- **À noter pour Jack** : la règle du studio de `CLAUDE.md` dit « jamais de pub pendant qu'on joue ». La pub imposée
  à un moment calme a été validée dans le plan V17 ; il faudra mettre `CLAUDE.md` à jour (l'équipe ne le touche pas).

### 10.3 Premium
- **1,99 €, achat unique, à vie** (produit `premium`, non consommable) : **vitesse ×2** et **plus de pub imposée**.
- **Pack débutant (2,99 €)** = Premium + 3 jetons. Ceux qui l'ont déjà acheté (« sans pub ») deviennent Premium
  automatiquement. Tranché par l'équipe (deux produits « sans pub » différents seraient incompréhensibles).
- Restauration des achats au lancement (`store.js`, existant).

### 10.4 Rentabilité (projection, `node tools/v17/economie-v17.mjs`)
Mêmes hypothèses de marché que la V14.4 (eCPM, remplissage, consentement, TVA 20 %, Google 15 %), plus : minutes de
session 12 / 20 / 30, part des fenêtres de 10 min avec un moment calme 50 / 70 / 85 %, icônes récompensées touchées
8 / 15 / 25 %, Premium 0,5 / 1,5 / 3 % des joueurs actifs du mois, Pack 0,2 / 0,5 / 1 %, rétention des joueurs sans
Premium 85 / 90 / 95 % (les pubs imposées en font fuir).

| Pour 10 000 joueurs actifs / mois | Bas | Central | Haut |
|---|---|---|---|
| Minutes de jeu par joueur | 48 | 160 | 420 |
| Pubs imposées (par joueur sans Premium) | 12 € (1,2) | 173 € (8,1) | 1 201 € (30,5) |
| Pubs récompensées (par joueur, missions comprises) | 17 € (0,7) | 240 € (4,1) | 1 985 € (17,3) |
| Premium + Pack | 113 € | 317 € | 635 € |
| Jetons | 42 € | 127 € | 253 € |
| **Net par mois** | **184 €** | **856 €** | **4 074 €** |
| Après cotisations (~22 %) | ~144 € | ~668 € | ~3 177 € |
| Joueurs pour 1 000 € nets | ~54 000 | ~11 700 | ~2 500 |
| Rappel V14.4 (tour par tour) | 122 € | 435 € | 1 305 € |

Lecture honnête : le temps réel multiplie surtout les pubs (une partie devient du temps de jeu continu, pas une pub par
partie). Le scénario haut suppose des joueurs très assidus (14 jours × 30 min par mois) : à prendre comme un plafond, pas
une prévision. Le risque principal est la **rétention** : le reproche n° 1 fait au jeu de référence (AM 3) est la pub
qui sort le joueur du jeu ; d'où le moment calme, le compteur remis à zéro par les pubs choisies, et le Premium bon marché.
Coût de fonctionnement : toujours **0 €**. Détail ajouté à `docs/RENTABILITE-ARKEN.md`.

---

## 11. Sauvegarde

- **Nouveau schéma 13** (`REALTIME_SCHEMA_VERSION = 13`) pour toute partie temps réel (partie courte comprise :
  `state.gameLength` reste le marqueur). Même clé `frontieres-arken-v2-save` (interdit de la renommer).
- Nouveaux champs : `mode:'realtime'`, `day`, `goldCarry` et `food:{ reserve, carry, famineDays, desertCarry }` par nation, `buildings.farm`, `marches[]`,
  `battles[]`, `transports[].departDay/arriveDay`, `bombardOrders[]` (ordres permanents), `nextAiDay`,
  `endOffer:{ peaceSince, nextOfferDay }`. `turn` = période de 30 jours (§2.2). La vitesse (×1 / ×2) n'est **pas** dans
  la partie : c'est un réglage du téléphone (comme le déroulé V16.4), lié au Premium du profil.
- **Anciennes parties (schéma ≤ 12, tour par tour)** : **pas de migration**. Au lancement : « Votre partie en cours a été
  jouée au tour par tour. FRONTIÈRES: ARKEN se joue maintenant en temps réel : elle ne peut pas être reprise. —
  Nouvelle partie ». L'ancienne sauvegarde n'est **pas effacée** tant que le joueur n'a pas lancé une nouvelle partie
  (qui l'écrase). Le profil (jetons, atouts, palmarès, achats) est dans une autre clé : **gardé**.
- **Quand sauvegarder** : tous les 10 jours de jeu (20 s), à chaque pause, à chaque ordre du joueur, sur `visibilitychange`
  (page cachée) et `pagehide`. Écriture coûteuse (~100 à 300 ko) : jamais plus d'une fois par seconde.
- Aller-retour sans perte testé (encoder → décoder → suite identique, jour par jour).

---

## 12. Découpage V17.1 → V17.10

Principe : **nouveau dossier `src/domain/realtime/`** (pur, sans DOM, testable sous Node) qui **réutilise** les modules
actuels (combat, ordres, production, convois, IA, diplomatie) au lieu de les recopier. Le tour par tour reste jouable
jusqu'à la V17.9 (mode choisi à la création de la partie, caché derrière un réglage de test jusqu'à la V17.3).
Chaque nouveau module : ajouté à ASSETS de `sw.js` et à `tests/helpers/sources.js`. Une version = une bêta = une PR sur la
branche longue `v17`.

### V17.1 — Moteur en jours (seule, tout repose dessus)
- **Créer** `src/domain/realtime/rules.js` : `RULES.realtime` = **toutes les valeurs de ce cahier** (durées §2.2, revenus
  §3, nourriture §4, assauts §5, IA §7, score §9, fins §9.1) — les équipes suivantes ne font que les lire.
- **Créer** `realtime/clock.js` (jour ↔ date, `dateOfDay`, période, longueur en jours), `realtime/day.js`
  (`advanceDay(state, map)` : ordre fixe des étapes du jour, voir ci-dessous), `realtime/marches.js` (départ immédiat,
  avancée, arrivée, rappel, rencontre en chemin), `realtime/create.js` (nouvelle partie temps réel).
- **Modifier** `engine/orders.js` (exécution immédiate : `executeOrder` appelé par `queue*` en mode temps réel),
  `engine/production.js` (file en jours), `engine/convoys.js` (dates de départ / arrivée, interception à 30 jours),
  `engine/income.js` (inchangé) + revenus quotidiens avec `goldCarry`, `game-length.js` (longueur en périodes 183 / 86),
  `persistence/save-codec.js` (schéma 13, refus des schémas ≤ 12 en temps réel), `constants.js` (numéro de schéma).
- Combats V17.1 : à l'arrivée, **bataille immédiate en 3 passes** (provisoire, remplacée en V17.2).
- Ordre des étapes d'un jour : 1) ordres en attente du jour (IA de la nation du jour) ; 2) avancée des marches et convois,
  rencontres ; 3) arrivées → batailles ; 4) assauts du jour (V17.2) ; 5) chantiers et recrutements livrés ; 6) revenus ;
  7) (tous les 10 j) guérison, bombardement, coalition, tension, éliminations ; 8) fin de partie ; 9) `day++`.
- **Outil** `tools/v17/partie-jours.mjs` : une partie IA complète jour par jour, sans navigateur (mesures du §13 refaites
  sur le vrai moteur temps réel).
- **Tests** : horloge et dates (bissextiles, 5 479 jours), revenus exacts sur 60 jours, durées de chaque production, trajet
  terrestre 30 / 20 jours, mer 60 / 120, rappel, rencontre en chemin, interception à J−30, sauvegarde aller-retour au milieu
  d'une marche, refus d'une sauvegarde schéma 12, partie IA de 5 479 jours sans erreur ni `Math.random`, tour par tour
  inchangé (empreintes `tools/empreintes-v15.4-40-tours.json` et V16 reprises).

### V17.2 — Combats en temps réel (après V17.1, en parallèle de V17.3 / V17.4)
- **Créer** `realtime/battles.js` (bataille en 3 assauts, renforts, retraite, prise, repli) ; **modifier**
  `engine/battles.js` (sortir de `fight` la partie « issue de l'assaut » pour la réutiliser), `combat.js` (paramètre
  `fireFactor`, 1 par défaut), `engine/bombard.js` (ordre permanent, ticks de 10 j), `engine/recovery.js` (guérison
  et réparations en jours).
- **Tests** : 3 assauts aux jours J, J+3, J+6 ; équivalence avec le combat actuel sans renfort ; renfort attaquant et
  défenseur ; retraite volontaire ; prise au 2e assaut ; plusieurs nations (B2) ; débarquement repoussé qui rentre ;
  bombardement et brèche ; guérison bloquée 10 jours ; `fireFactor` 0,7.

### V17.3 — Interface temps réel (après V17.1)
- **Modifier** `presentation/live-clock.js` (devient l'horloge des jours, ×1 / ×2, pause auto §1.1),
  `presentation/ui/live-ui.js`, `turn-flow.js` (plus de Fin du tour en temps réel), `session.js`, `app.js`, `map-view.js`
  (icônes de marche et de convoi par jour, touchables, rappel), `province-sheet.js` (ordres immédiats), `event-popups.js`
  (bandeaux sans pause) ; **créer** `presentation/realtime-view.js` (pur : position des icônes, textes de date, bandeaux).
- **Tests** : horloge pure (jours par seconde, rattrapage plafonné à 4, pause, reprise en pause après rechargement) ;
  vue des icônes ; Playwright 844 × 390 : une minute de jeu, un ordre, une icône qui avance, rappel, pause.

### V17.4 — Fermes et nourriture (après V17.1, en parallèle de V17.2 / V17.3)
- **Créer** `realtime/food.js` (production, consommation en centièmes, réserve, grenier, alerte, famine, désertion) ;
  **modifier** `engine/orders.js` (`queueConstruction` : ferme à niveaux, un à la fois), `constants.js`
  (`BUILDING_TYPES` + `farm` ; `RULES.buildings.farm` lu depuis `RULES.realtime.food`), fiche de province et écran
  Construction (ligne 🌾), barre du haut (réserve et « +N / jour »).
- **Tests** : départ à l'équilibre (32 / 29,5) ; ferme +10 ; plafond 5 et coûts 20…40 ; grenier ; alerte à 10 jours ;
  désertion exacte de 1 % / jour sur 100 jours ; plus de famine quand la production revient ; `fireFactor` 0,7 transmis.

### V17.5 — IA et diplomatie en temps réel (après V17.2 et V17.4)
- **Modifier** `engine/ai.js` (`planAIOrders(state, map, { only: nationId })`), `ai-naval.js`, `ai-island.js`,
  `ai-help.js`, `balloons.js` (vols en jours), `diplomacy.js` (réponses à la décision de l'IA, propositions 180 j),
  `talk.js` / `leaders.js` (rythmes en périodes) ; **créer** `realtime/ai-schedule.js` (qui décide quel jour, fermes §4.5,
  retraite si la simulation dit qu'elle perd).
- **Tests** : calendrier des décisions ; réponse en 1 à 10 jours ; ferme avant recrutement ; partie IA de 15 ans : mesures
  du §13 refaites avec `tools/v17/partie-jours.mjs` et comparées (écart attendu < 25 % sur conquêtes et armées ; sinon
  rééquilibrer dans `RULES.realtime`, pas dans le code).

### V17.6 — Carte façon AM 3 (en parallèle dès V17.1)
Carte plein écran, défilement horizontal sans fin, zoom, teintes de propriétaire, grands noms, pastilles §8, date en
haut, ▶ ⏸ ⏩ en bas à droite, message d'événement en haut au centre. Fichiers : `ui/map-view.js`,
`presentation/map-view-model.js`, `paysage.css`, `index.html`. Ne touche pas `src/domain/` (les pastilles lisent
`provinceIntel`). Conflit possible avec V17.3 sur `map-view.js` : **V17.3 ajoute les icônes dans une couche séparée
(`ui/map-units-layer.js`)**, V17.6 la branche ; fusionner V17.3 d'abord.

### V17.7 — Monétisation (après V17.3, en parallèle de V17.4 / V17.5)
`presentation/ads.js` (compteur de minutes de jeu, moments calmes, remise à zéro), **créer** `presentation/ad-timer.js`
(pur, testé), `store.js` (produit `premium`, Pack = Premium + 3 jetons, anciens Packs → Premium), icône 🎁 sur la carte,
écran Premium, `tools/v17/economie-v17.mjs` → test `tests/economie-v17.test.js`, `docs/RENTABILITE-ARKEN.md` à jour.
Tests : jamais de pub imposée en tutoriel / Premium / pendant une action / après un refus ; au plus une par 10 min ;
récompense = un mois de revenus (minimum 10).

### V17.8 — Fin de partie et classement (après V17.5)
**Créer** `realtime/ranking.js` (formule §9.2) et `realtime/end.js` (fins §9.1, paix générale 90 / 180 jours) ;
**modifier** `end-view.js`, `palmares.js` / `palmares-view.js`, écran 🏆. Tests : chaque fin, formule, offre de paix et
relance, partie courte.

### V17.9 — Tutoriel refait, équilibrage, retrait du tour par tour (après tout)
Tutoriel pas à pas rejouable depuis ⚙ ; équilibrage final par `tools/v17/partie-jours.mjs` ; retrait du tour par tour,
de « Classique » / « En direct » (V16.4) et des écrans d'inter-tour ; nettoyage des tests du tour par tour (chaque test
retiré justifié dans le cahier).

### V17.10 — Bêta Google Play (test interne puis fermé) et corrections.

### Ce qui peut avancer en même temps
| Après | En parallèle, sans conflit | Fichiers partagés à surveiller |
|---|---|---|
| V17.0 | V17.1 **seule** ; V17.6 (carte) peut commencer sur l'interface actuelle | — |
| V17.1 | V17.2 (combat) + V17.3 (interface) + V17.4 (nourriture) + V17.6 | `RULES.realtime` (déjà complet en V17.1 : lecture seule) ; `orders.js` (V17.4 n'y touche que `queueConstruction`) ; `map-view.js` (V17.3 en couche séparée) |
| V17.3 | V17.7 (monétisation) | `live-ui.js` (V17.7 n'y ajoute que l'icône 🎁, dans un module à part) |
| V17.2 + V17.4 | V17.5 (IA) | — |
| V17.5 | V17.8 | — |

---

## 13. Simulations (résultats bruts et comment les relancer)

Tous les outils font tourner le **moteur actuel** sans le modifier, avec des graines fixes (`Math.random` interdit).
Résultats regroupés dans `tools/v17/resultats-v17.0.json`.

### 13.1 Armées, revenus, combats, coût de l'IA — `node tools/v17/mesures-v17.mjs 100 80 v17a`
100 parties IA × 80 tours.

| Tour | Plus grande armée (or) médiane / p90 / max | Armée moyenne | Revenu / tour (médiane, p90) | Composition moyenne d'une nation |
|---|---|---|---|---|
| 10 | 750 / 770 / 788 | 650 | 31 / 39 | 322 fant., 9 cav., 6 blindés, 2 canons, 1 navire |
| 40 | 1 680 / 1 730 / 1 792 | 1 296 | 38 / 49 | 584 / 7 / 13 / 2 / 4 |
| 60 | 2 335 / 2 605 / 2 988 | 1 671 | 38 / 58 | 705 / 6 / 18 / 2 / 6 |
| 80 | 3 095 / 3 520 / 4 508 | 2 077 | 42 / 67 | 824 / 5 / 24 / 2 / 8 |

Exemple de plus grande armée au tour 80 : 1 213 fantassins, 10 cavaliers, 42 blindés, 2 canons, 13 navires (≈ 3 900 or,
195 vivres / jour). Combats : 64 % vont jusqu'à 3 passes (175), 14 % s'arrêtent à 2 (39), 22 % à 1 (59).
Coût : `planAIOrders` (5 nations) 3,3 ms médiane, 5,1 ms p90, 20,9 ms max ; inter-tour complet 3,7 ms médiane.

### 13.2 Partie plus longue — `node tools/v17/mesures-v17.mjs 100 180 v17a`
Même graines, poursuivies jusqu'au tour 180 (seuils de phase non étirés). Conquêtes par tranche de 20 tours :
520 / 477 / 698 / 752 / 639 / 588 / 481 / 403 / 354 ; aucune victoire par les capitales ; élimination dans 65 parties ;
plus grande armée au tour 180 : 6 430 / 9 604 / 11 801 or. → Une économie deux fois plus longue fige la carte.

### 13.3 Modèle retenu au pas de 30 jours — `CYCLE=30 node tools/v17/nourriture-v17.mjs 100 183 v17n [--sans]`

| Mesure (100 parties) | Pas de 60 j, 90 tours | **Pas de 30 j, 183 périodes (retenu)** |
|---|---|---|
| Conquêtes par partie | 26,1 | **33,8** |
| Conquêtes par quart de partie | 6,3 / 5 / 8 / 6,8 | **9,3 / 8,3 / 9,3 / 6,9** |
| Nations éliminées par partie | 0,45 | **0,72** |
| Plus grande armée finale (médiane / p90 / max, or) | 3 208 / 3 735 / 4 494 | **3 635 / 4 253 / 5 150** |
| Victoires par les 5 capitales | 0 | 0 |

### 13.4 Nourriture — `node tools/v17/nourriture-v17.mjs 100 90 v17n` (variantes : `FERME=7`, `FERME=14`, `--sans`)
Voir §4.6.

### 13.5 Combat découpé en assauts — `node tools/v17/combat-v17.mjs`
400 batailles (forteresse 0 à 3, débarquements, navires à quai) : **400 identiques** entre « 3 passes d'un coup » et
« 3 assauts d'une passe rejoués sur les survivants ».

### 13.6 Classement à points — `node tools/v17/classement-v17.mjs 100 90`
Même premier que le classement actuel : 92 / 100 ; points du premier 1 112 (médiane), du second 920.

### 13.7 Rentabilité — `node tools/v17/economie-v17.mjs` (`--json`)
Voir §10.4.

---

## 14. Points tranchés, incertitudes

### Tranchés par l'équipe, à valider en bêta
1. Deux conversions : délais 30 jours, revenus 60 jours (§2.1).
2. Fin le 31 décembre 2041 (5 479 jours) plutôt que 5 400 ; partie courte gardée (7 ans).
3. Retour dans le jeu toujours en pause ; pendant le jeu, aucune pause automatique sauf menus hors jeu (Réglages, Aide, Atouts, Palmarès, Premium), fin de partie et pub (décision de Jack).
4. Cavalerie seule plus rapide (20 jours au lieu de 30) ; une seule vitesse pour le reste.
5. Bataille en 3 assauts espacés de 3 jours ; défenseur bloqué pendant la bataille ; batailles navales instantanées.
6. Rencontre en chemin seulement sur la même frontière en sens opposés.
7. Nourriture : 1 vivre / jour pour 20 or de troupes, navires compris ; province 8 ; ferme +10, 5 niveaux, 20 à 40 or ;
   réserve de départ 900 ; grenier 180 jours de production.
8. Pastilles en PV abrégés ; classement public en total, détail pour soi et ses alliés.
9. Pub récompensée = un mois de revenus (minimum 10 or) ; elle remet à zéro le compteur de pub imposée ; pub de début de
   partie supprimée ; Pack débutant = Premium + 3 jetons, anciens Packs → Premium.
10. Anciennes sauvegardes non effacées tant qu'aucune nouvelle partie ne les remplace.

### Ce qui reste incertain
- **L'équilibre réel** : toutes les mesures passent par le moteur tour par tour (au pas de 30 ou 60 jours). Le vrai moteur
  en jours (renforts pendant les batailles, rappels, IA tous les 10 jours) peut changer le rythme : à remesurer dès la
  V17.1 avec `tools/v17/partie-jours.mjs`, puis en V17.5.
- **La famine** n'a pas été simulée avec son malus de dégâts −30 %.
- **Le ressenti de la vitesse** (1 minute pour une province voisine, 2 minutes pour traverser la mer, 4 vers l'île) :
  seul Jack peut le juger, en bêta. Tout est dans `RULES.realtime` : changer un chiffre ne demande pas de code.
- **Les pubs imposées** : effet sur la rétention inconnu ; les chiffres de rentabilité sont des hypothèses (scénario haut
  très optimiste).
- **Le coût sur un vrai téléphone** : mesuré sur ordinateur seulement (marge × 40 avant d'être gênant).
- **`CLAUDE.md`** : la règle « jamais de pub pendant qu'on joue » est à reformuler par Jack (pub à un moment calme).

---

## 15. Réalisé

### V17.0 (19/11/2026)
- Ce cahier (`docs/V17-cahier-des-charges.md`).
- Outils de mesure, sans toucher au jeu : `tools/v17/mesures-v17.mjs` (armées, revenus, combats, coût de l'IA),
  `tools/v17/nourriture-v17.mjs` (fermes, famine, modèle au pas de 30 jours avec `CYCLE=30`),
  `tools/v17/combat-v17.mjs` (équivalence des assauts), `tools/v17/classement-v17.mjs` (formule de score),
  `tools/v17/economie-v17.mjs` (rentabilité du temps réel), résultats dans `tools/v17/resultats-v17.0.json`.
- `docs/RENTABILITE-ARKEN.md` : section « Projection V17 (temps réel) ».
- Aucun fichier de `src/` modifié ; `npm test` vert.
