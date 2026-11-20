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
- **V17.5b (remplace les chiffres ci-dessous)** : 20 jours par la terre vers un voisin à la distance de référence, × la distance
  entre les deux provinces (15 à 30 jours), 13 pour la cavalerie seule ; mer 40 jours, île 80 ; même durée pour tous (Réalisé V17.5b).
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

### V17.1 — Moteur en jours (19/11/2026)
**Fait** (version 17.1.0, branche `mission/V17.1`) :
- `src/domain/realtime/rules.js` : `RULES.realtime` (branché dans `constants.js`, gelé) = toutes les valeurs du cahier :
  horloge (§1), date de départ, durées de partie en jours et en périodes, alertes de fin, conversions 30 / 60 jours,
  durées d'action (§2.2), revenus par mois (§3), nourriture (§4), assauts (§5), guérison / bombardement en jours,
  délais diplomatiques en jours, IA (§7), rythmes du monde, phases, vision, classement (§9.2), fins (§9.1), pubs et
  Premium (§10), sauvegarde (§11). Les équipes suivantes n'ont qu'à les lire.
- `realtime/clock.js` : jour ↔ date (calendrier grégorien calculé sans `Date`, bissextiles comprises), « 14 mars 2029 » /
  « 14/03/2029 », période de 30 jours, longueur 5 479 / 2 557 jours (183 / 86 périodes), alertes de fin (jours 5 115 et
  5 450 ; partie courte : 1er juillet 2033 et dernier mois), calendrier des décisions d'IA.
- `realtime/day.js` : `advanceDay(state, map)` dans l'ordre du §12 ; `executePendingOrders` (ordres partis tout de suite,
  appelé aussi par l'interface juste après un ordre du joueur, même en pause).
- `realtime/marches.js` : départ immédiat, 30 jours par la terre (20 pour la cavalerie seule), rencontre en chemin (une fois,
  sens opposés, somme des avancées ≥ trajet), arrivée revérifiée (passage perdu, trêve signée après le départ, cible passée à
  un tiers → demi-tour), combat immédiat en 3 passes à l'arrivée (B2 : toutes les nations arrivées le même jour ensemble),
  repli des survivants par la route (30 j), rappel des marches et des convois (retour = temps déjà parcouru ; rappel le jour
  même = retour immédiat).
- `realtime/create.js` : `createRealtimeGame` (état de départ du tour par tour + `mode:'realtime'`, `day`, `goldCarry`,
  `marches`, `battles`, `bombardOrders`, `nextAiDay`, `endOffer`, registre `rt`).
- Moteur existant réutilisé, modifié au minimum : `production.js` (`startProjects` / `progressProjects`, durées en jours en
  temps réel), `convoys.js` (`stage` / `turns` en jours, `departDay` / `arriveDay`, interception à J−30, rencontre de convois
  une fois au croisement, sauvetage en jours), `ai.js` (`planAIOrders(state, map, { only })`), `turn.js` (fin au dernier jour,
  `publishTalkOrders` / `talkReactions` sortis de `resolveTalk`), `recovery.js` (une nation qui a une armée en marche n'est pas
  éliminée), `game-length.js` (183 / 86 périodes), `vision.js` (garnison estimée × (1 + 2,37 × jour ÷ 5 479)),
  `save-codec.js` (schéma 13, `decodeRealtimeSave`, refus des schémas ≤ 12), `constants.js` (`REALTIME_SCHEMA_VERSION = 13`).
- Revenus : chaque jour `goldCarry += revenu par tour (+ bonus)`, `trésor += ⌊goldCarry / 60⌋` : en 60 jours, exactement un
  tour de revenus, trésor toujours entier. Récapitulatif `income` dans le journal tous les 30 jours (or réellement entré).
- IA : la nation n° i décide les jours où (jour + 2 i) % 10 = 0 (une seule par jour, jours impairs : personne), même logique
  que l'IA actuelle ; ses ordres partent le jour même.
- Interface provisoire (`src/presentation/ui/realtime-ui.js`, `src/presentation/realtime-clock.js` pur) : bandeau au-dessus de
  la carte avec la date et ▶ Jouer / ⏸ Pause, la date dans le HUD à la place du tour, plus de « Fin du tour », armées en marche
  dessinées dans un calque à part (`#rtMarches`, sans toucher à `map-view.js`), fiche d'une armée et liste « Troupes en route »
  (toucher le bandeau) avec « Rappeler », fenêtres de prise de capitale / mer / propositions sans arrêter le temps. Une partie
  nouvelle ou reprise commence en pause ; page cachée = pause + sauvegarde.
- Nouvelles parties en temps réel ; réglage de test caché `?tour-par-tour` dans l'adresse pour créer (et reprendre) une partie
  tour par tour jusqu'à la V17.3. Une partie tour par tour enregistrée : message du §11 sur l'accueil, « Continuer » caché,
  sauvegarde non effacée tant qu'une nouvelle partie ne la remplace pas. Le tutoriel reste au tour par tour (V17.9).
- Outil `tools/v17/partie-jours.mjs` (résultats : `tools/v17/resultats-v17.1.json`). Empreintes du tour par tour de la V16.4.1
  (`tools/v17/empreintes-tour-par-tour-v16.4.1*.json`) : 81 + 65 parties strictement identiques après la V17.1 (`node
  tools/equilibre.mjs --empreintes --graines=10 [--longueur=40]`, seules les entrées `regles` et `api` changent).

**Mesures — 100 parties IA de 15 ans jour par jour** (`node tools/v17/partie-jours.mjs 100 v17j`), comparées au §13.3 :

| Mesure | §13.3 (pas de 30 j, tour par tour) | **V17.1 (vrai moteur en jours)** | Écart |
|---|---|---|---|
| Conquêtes par partie | 33,8 | **28,6** | −15 % |
| Par quart de partie | 9,3 / 8,3 / 9,3 / 6,9 | **8,4 / 5,9 / 8,2 / 6,1** | |
| Nations éliminées par partie | 0,72 | **0,70** | −3 % |
| Plus grande armée finale (médiane / p90 / max, or) | 3 635 / 4 253 / 5 150 | **3 947 / 5 085 / 7 451** | +9 % / +20 % / +45 % |
| Victoires par les 5 capitales | 0 | 0 | |

Autres chiffres : 36 combats par partie dont 12,7 débarquements, 0,17 rencontre en chemin, 1,5 interception, 109 marches et
40 convois par partie. Coût : 0,07 ms par jour en médiane (0,55 ms un jour de décision d'IA, p90 1,25 ms, pire 61 ms) : un
jour dure 2 000 ms. Partie courte (100 parties, 2 557 jours) : 15,8 conquêtes, 0,15 nation éliminée, plus grande armée
2 019 or. Lecture : rythme et éliminations dans la cible (< 25 %) ; la queue des plus grosses armées monte (l'IA recrute à
chacune de ses 3 décisions par période) : à surveiller en V17.5 (rééquilibrage dans `RULES.realtime`). Sauvegarde : 52 ko
après 1 an, 141 ko après 5 ans, 357 ko en fin de partie (encodage 2 ms).

**Écarts avec le cahier et choix faits (tranchés par l'équipe)** :
1. Les ordres ne sont pas exécutés DANS `queue*` (`orders.js` inchangé) : ils restent en attente le temps de la décision (l'IA
   en a besoin : le Traître rompt l'alliance puis vérifie son invasion, l'aide à l'île regarde les ordres du demandeur), puis
   `executePendingOrders` les exécute tous ensemble, le jour même. Côté joueur, l'interface l'appelle dans les 250 ms qui
   suivent l'ordre (pause comprise) : même résultat, « départ immédiat ».
2. Rythmes « par tour » non encore convertis (prévus en V17.2 / V17.5), passés **une fois par période de 30 jours** (le
   dernier jour) : guérison et réparation des navires (combats des 30 derniers jours), forteresses qui se referment, vols de
   ballon (un envoi de ballon part à la fin de la période), paroles des IA et réponses aux messages, dérive de la tension,
   guerres d'hostilité, propositions expirées, histoire de la partie, récapitulatif du journal. Coalition : tous les 10 jours.
   Éliminations : chaque jour (la fin de partie est vérifiée chaque jour). Réponses de l'IA aux propositions et aux demandes
   d'aide : immédiates (1 à 10 jours en V17.5). Bombardement : ordre ponctuel comme au tour par tour (permanent en V17.2).
3. Combat à l'arrivée en 3 passes (V17.2 : 3 assauts sur 6 jours) ; les survivants d'une attaque repoussée rentrent par la
   route en 30 jours (au tour par tour : retour instantané), comme le prévoit le §5.2.
4. Nourriture (`food`, fermes) : rien dans l'état de départ, c'est la V17.4 (le schéma 13 l'accueillera).
5. Une partie nouvelle commence en pause (« touchez ▶ ») comme une partie reprise. Textes de l'interface encore en « tours »
   (fiche de province, convois de la carte, aide) : V17.3. L'état est sauvegardé à chaque rendu de la carte, donc chaque jour
   (`map-view.js` n'a pas été touché : équipe V17.6) ; la règle « tous les 10 jours, au plus une fois par seconde » sera
   appliquée en V17.3.
6. `Dérive de la tension` : le §7 dit 10 jours, le tableau du §2.2 dit 30 jours ; retenu 30 (montants calibrés par tour).

**Tests** : `tests/v17-1.test.js` (27 tests : valeurs de `RULES.realtime`, dates et bissextiles sur 5 479 jours, périodes et
seuils étirés, alertes de fin, horloge de l'interface, revenus exacts sur 60 jours et bonus d'or, durée de chaque production,
départ immédiat, terre 30 / 20, mer 60 / 120, rappel d'une marche et d'un convoi, rencontre en chemin, interception à J−30,
trêve signée après le départ, combat à l'arrivée et repli, calendrier de l'IA, ordres de l'IA seulement le jour de sa décision,
parties de 5 479 et 2 557 jours sans `Math.random`, sauvegarde 13 aller-retour au milieu d'une marche, refus des schémas ≤ 12,
déterminisme, pureté du dossier `realtime/`, empreintes du tour par tour, écran provisoire).
**Tests modifiés** (aucun test retiré) :
- `tests/save-codec.test.js` et `tests/v15-4.test.js` : « le schéma 13 est refusé » → c'est désormais le temps réel ; le premier
  schéma inconnu vérifié est le 14.
- `tests/v15-2.test.js`, `tests/v15-4.test.js`, `tests/v14-3-tutoriel.test.js` : version 16.4.1 → 17.1.0.
- `tests/helpers/sources.js` : nouveaux modules (`realtime/*`, `ui/realtime-ui`) dans les listes lues par les tests.
`npm test` : 740 tests (après intégration de la carte V17.6), tous verts.

**Vérifié dans Chrome mobile simulé** (Playwright, 844 × 390, `node scripts/build.js`, serveur local) : nouvelle partie (en
pause, 1er janvier 2027), ▶ puis 1 minute de jeu = 30 jours (31 janvier 2027, trésor 120 → 128), un ordre donné par les vrais
gestes (province → Déplacer → destination → 50 % → Confirmer) : troupes parties aussitôt (capitale 200 → 100 fantassins,
marche du 32e au 62e jour, icône sur la carte), ⏸ arrête le temps, « Troupes en route » → Rappeler, rechargement → reprise en
pause au même jour ; une sauvegarde tour par tour → message de refus, « Continuer » caché, sauvegarde gardée. 0 erreur JS,
0 fichier manquant. Non vérifié : sur un vrai téléphone (APK), la pub de début de partie, une partie longue dans le navigateur.

**Relecture indépendante V17.1** : rien de bloquant (durées exactes sur 4 parties complètes, rappel intact, revenus
exacts, sauvegarde en pleine marche identique, pas de fuite). Écarts relevés, **à corriger en V17.5** : l'IA ne construit
plus de ballon en temps réel (elle dépense son or tous les 10 jours et n'atteint jamais 90 or) ; en Facile, « une attaque
terrestre par tour » s'applique à chaque décision (jusqu'à 3 par 30 jours) ; l'IA ne voit pas encore les armées en marche.
Mineur : un groupe venu de plusieurs provinces se replie vers l'origine de la première marche.

### V17.4 — Fermes et nourriture (20/11/2026)
**Fait** (branche `mission/V17.4`, version inchangée : elle sera montée à l'intégration sur `v17`) :
- `src/domain/realtime/food.js` (pur, déterministe, tout en **centièmes de vivre**) : production (province 8, île 0, ferme
  +10 par niveau), consommation (1 vivre / jour pour 20 or de troupes : fantassin 5, cavalier 20, blindé 150, canon 125,
  navire 325 centièmes ; provinces, stationnées, en marche, en mer, blessés compris), réserve nationale `nation.food`
  (900 au départ, créée à la volée pour une sauvegarde V17.1), grenier = 180 jours de production (surplus perdu,
  « grenier plein »), alerte sous 10 jours (une fois, puis tous les 30 jours), famine (réserve à 0 et consommation >
  production), désertion exacte du §4.4 (report en centièmes par type, plus grosse pile ; égalité : province, chez soi,
  stationnées, marches, convois), fin de famine (« Les vivres sont revenus », report remis à zéro). Événements privés
  `food-alert`, `famine-start`, `famine-desertion`, `famine-end`. Étape « 6 bis » du jour (`day.js`, après les revenus).
- **Famine au combat** : `fireFactorFor(state, nationId)` (0,7 en famine, toujours 1 au tour par tour) ; `combat.js` :
  chaque attaquant peut porter `fireFactor` et `resolveBattle` / `resolveCombat` acceptent `defenderFireFactor` (1 par
  défaut, multiplie les dégâts infligés). Branché dans les 4 batailles du temps réel : arrivée d'armée (`battles.js` `fight`),
  rencontre en chemin (`marches.js`), combat naval de convoi (`convoys.js`), bataille en rade (`bombard.js`). Garnison
  défendue par un allié stationné : facteur du propriétaire de la province. **À la fusion avec la V17.2** : garder ces noms
  (`fireFactor` par attaquant, `defenderFireFactor`) ou les renommer d'un seul coup dans les 4 appels.
- **Ferme** : `RULES.buildings.farm` lu dans `RULES.realtime.food` (`costs` 20…40, 2 périodes = 60 jours, `max` 5,
  `realtimeOnly`) ; `BUILDING_TYPES` + `farm` ; `queueConstruction` : un niveau à la fois (« Ferme : un niveau est déjà en
  construction »), plafond 5, refus sur l'île et au tour par tour (« Ferme : seulement dans une partie en temps réel ») ;
  chantier perdu avec la province = remboursé (B4, mécanisme existant).
- **IA (minimum, refonte en V17.5)** : `aiFarmOrders`, appelée dans `aiPlan` avant tout achat : si la production prévue
  (fermes en chantier comprises) est sous 110 % de la consommation prévue (recrutements en cours compris), ou si la réserve
  tient moins de 15 jours (`aiReserveDays`, ajouté à `RULES.realtime.food`) alors que la production ne suffit pas : un niveau
  dans sa province qui en a le moins (égalité : identifiant), s'il lui reste 10 or ; une ferme en chantier à la fois.
  **Écart** : sans l'or de la ferme, l'IA **épargne** (ni recrutement ni banque à cette décision) — sans cela, elle dépense
  tout son or tous les 10 jours et 47 % des nations connaissaient la famine (essai sur 3 parties).
- Interface (changements localisés) : case « 🌾 VIVRES 900 · +2,5/j » dans la barre du haut, juste après le trésor
  (`src/presentation/ui/food-ui.js`, appelée par `realtime-ui.js` ; orange en alerte, rouge en famine ; la toucher explique
  l'état), messages de famine et d'alerte (toast), ligne « 🌾 +18 vivres / jour · ferme niveau 1 » dans la fiche de ses
  provinces, carte « 🌾 Ferme 20 or · 60 jours · +10 🌾/jour » dans l'écran Construction (temps réel seulement), « 🌾 Ferme 1 »
  dans les constructions de la fiche. Textes purs dans `src/presentation/food-view.js`. Les bandeaux orange / vert du §4.4
  restent à brancher par la V17.3 (les événements existent).
- Outil `tools/v17/partie-jours.mjs` : mesures de nourriture ajoutées (résultats : `tools/v17/resultats-v17.4.json`).

**Mesures — 100 parties IA de 15 ans jour par jour** (`node tools/v17/partie-jours.mjs 100 v17j`), comparées au §4.6 :

| Mesure | §4.6 (tour par tour, 90 tours) | **V17.4 (moteur en jours)** |
|---|---|---|
| Fermes par nation en fin de partie (médiane / p90 / max) | 11 / 15 / 22 | **12 / 17 / 33** |
| Fermes par province (médiane / p90 / max) | 2,3 / 3,7 / 5 | **2,2 / 3,75 / 5** |
| Part de l'or dépensé dans les fermes (médiane / p90) | 7 % / 10 % | **7,2 % / 12,2 %** (chantiers + recrutements) |
| Nations ayant connu la famine | 8 sur 455 (1,8 %) | **12 sur 500 (2,4 %)**, 14 jours en médiane, au plus 34 jours, 8 déserteurs en moyenne |
| Conquêtes par partie / nations éliminées | (V17.1 : 28,6 / 0,70) | **26,3 / 0,80** |
| Plus grande armée finale (médiane / p90 / max, or) | (V17.1 : 3 947 / 5 085 / 7 451) | **3 534 / 4 787 / 7 759** |

Partie courte (100 parties) : 5 fermes par nation (p90 7), 1 par province, 7,2 % de l'or, famine 4 nations sur 500 (0,8 %),
14,9 conquêtes. Coût : 0,18 ms par jour en médiane (V17.1 : 0,07), 0,84 ms un jour de décision d'IA ; pire jour 787 ms,
mesuré pendant que `npm test` tournait sur la même machine (V17.1 : 61 ms) — à remesurer au calme en V17.5.
Lecture : calibrage du §4.6 retrouvé sur le vrai moteur (fermes, part de l'or, famine rare et courte chez l'IA) ; les
armées finales baissent un peu (−10 % en médiane) : la nourriture freine les plus grosses armées, comme prévu.

**Tests** : `tests/v17-4.test.js` (17 tests : règles ; départ à l'équilibre 32 / 29,5 et +25 exact en 10 jours ; ferme livrée
au 60e jour, +10 ; 5 niveaux, un à la fois, coûts 20…40, île et tour par tour refusés ; ferme perdue remboursée ; grenier et
grenier qui rétrécit ; alerte à 10 jours puis rappel à 30 ; désertion exacte jour par jour sur 100 jours contre un calcul de
référence ; départage des piles ; fin de famine (fermes, puis d'elle-même) ; `fireFactor` 0,7 : paramètre neutre à 1, ≈ 70 %
des dégâts, transmis par le vrai `fight` en attaque et en défense ; IA : règle des 110 %, province, 10 or gardés, une à la
fois, épargne sans or, partie IA de 4 ans avec des fermes partout et déterministe ; sauvegarde ; pureté ; textes et
branchements de l'interface). **Test modifié** : `tests/economy.test.js` (règles figées : + `farm`). `tests/helpers/sources.js` :
`food`, `food-ui`, `PRESENTATION_MODULES_V17_4`. `npm test` : 760 tests, tous verts. Tour par tour inchangé (empreintes V16.4.1
identiques : la ferme y est refusée et le facteur vaut 1).

**Vérifié dans Chrome mobile simulé** (Playwright, 844 × 390 et 360 × 740, `node scripts/build.js`, serveur local) : barre du
haut « 🌾 VIVRES 900 +2,5/j » ; fiche de la capitale « 🌾 +8 vivres / jour » ; Construire → carte Ferme (20 or · 60 jours ·
+10 🌾/jour) → Vérifier → Confirmer : trésor 120 → 100, chantier de 60 jours ; second niveau grisé « un niveau est déjà en
construction » (25 or) ; ▶ pendant 2 minutes : livrée le 5 mars 2027, barre « 1 097,5 +12,5/j », fiche « 🌾 +18 vivres / jour ·
ferme niveau 1 », « 🌾 Ferme 1 », toucher la case → « Production 42 · consommation 29,5 ». 0 erreur JS, 0 fichier manquant,
pas de débordement. Non vérifié : vrai téléphone, une famine vécue dans le navigateur (couverte par les tests du moteur).
### V17.2 — Combats en temps réel (20/11/2026)
**Fait** (branche `mission/V17.2`, version laissée à 17.1.0 : le chef de projet la monte à la fusion) :
- **`src/domain/realtime/battles.js`** (nouveau, pur) : `state.battles[]` = `{ id, provinceId, defenderId, startDay, assaults,
  nextAssaultDay, attackers:[{ nationId, mode, units, warships, wounds, originIds, retreatTo, convoy?, fresh }], totals }`.
  - **3 assauts** : le jour de l'arrivée (J), J+3, J+6 (`RULES.realtime.battle`). Chaque assaut = `fightAssault(…, { passes: 1 })`
    du moteur actuel : PV, forteresse −5 %/niveau (atout et brèche compris), malus de débarquement, navires qui ne tirent que
    sur des navires à terre, alliés stationnés en défense (V13.4 / V14.1), île mystérieuse neutre et co-propriété (V16.2).
  - Arrêt : prise (à n'importe quel assaut ; la province change de main le jour de l'assaut gagnant, pillage, B4), plus aucun
    attaquant, plus personne qui puisse tirer, ou 3e assaut sans prise → tous les survivants se replient.
  - **Renforts** : une armée hostile (marche ou débarquement) qui arrive rejoint le **prochain assaut** (événement
    `battle-reinforced`), le compteur ne repart pas à zéro ; plusieurs nations ensemble (B2 : le plus fort survivant prend,
    les autres rentrent). Défense : garnison + alliés stationnés relus à chaque assaut (troupes arrivées, recrues livrées).
  - **Défenseur bloqué** : ses ordres de départ (terre ou mer) depuis une province assiégée sont annulés (`attack-cancelled`,
    raison `besieged`, message au journal), ceux de ses alliés stationnés aussi.
  - **Retraite volontaire** : `retreatFromBattle(state, map, { nationId, battleId })` (bouton « Retraite » ; l'IA l'utilisera en
    V17.5 avec `battleForecast`) : départ le jour même. Plus aucun attaquant : récit « la défense a tenu ».
  - **Replis** : par la terre, marche de retour vers la 1re origine encore à soi (30 j, 20 pour la cavalerie seule) ; par la mer,
    le convoi rembarque et rentre (même durée que l'aller, `turnBack`). Paix ou trêve signée pendant la bataille : l'attaquant
    qui a déjà combattu rentre sans assaut suivant (`battle-retreat`, raison `peace`). Correction de la relecture : chaque marche et chaque convoi
    retiennent l'état diplomatique de leur DÉPART envers la nation visée (`warAtDeparture`, `treatiesAtDeparture`), recopié dans
    l'entrée de bataille. Avant son premier assaut, un arrivant qui n'est plus en guerre fait demi-tour, sans trahison, si une
    trêve, une paix ou une alliance avec ce défenseur a été signée depuis son départ ; parti sans guerre et sans nouveau traité,
    il attaque et déclare la guerre (règle V10), même en renfort d'une bataille en cours (ex. rejoindre le siège d'un allié).
  - Récit : un événement `assault` par assaut (« ⚔ Bataille de X, assaut 2/3 … Prochain assaut le … ») et, à la fin, **un seul**
    `battle` / `conquest` avec les chiffres de toute la bataille (pertes, forces engagées renforts compris, PV perdus, passes).
  - `fireFactorFor(state, nationId)` (V17.4) appelé pour chaque camp à chaque assaut.
- **`engine/battles.js`** : `fight` découpé en `fightAssault` (issue d'un assaut, `passes`, `strike`, `fireFactor` par groupe,
  `defenderFireFactor`), `fightEvent` (récit, `totals`) et `onCapture` (exporté). Tour par tour : comportement identique.
- **`combat.js`** : `fireFactor` par attaquant et `defenderFireFactor` dans `resolveBattle`, `firePower({ fireFactor })`,
  `resolveCombat({ fireFactor, defenderFireFactor })` (mêmes noms que la V17.4) ; `healForce(force, rate)`.
- **`engine/bombard.js`** : en temps réel, « Bombarder » devient un **ordre permanent** (`state.bombardOrders`, même trio
  nation / départ / cible = mis à jour) ; tir tous les 10 jours (jours multiples de 10) : flotte à quai d'abord, puis brèche
  **+4 par navire intact, +10 au plus par tranche** ; arrêt automatique (paix, plus de navires, forteresse prise, port perdu) ou
  `cancelBombardOrder` ; la brèche se referme de 10 tous les 30 jours sans bombardement. Tour par tour inchangé.
- **`engine/recovery.js`** : guérison et réparations **tous les 10 jours** : 10/3 % des PV max par versement (arrondi au
  supérieur), navires au port en 90 / 120 / 150 jours (9 / 12 / 15 versements, `shipRepairInfo().daysLeft`), fortune 5 % par
  30 jours ; **aucune guérison dans une province en bataille ni dans les 10 jours qui suivent un combat**. Une nation dont
  toutes les troupes sont à l'assaut n'est pas éliminée.
- Intégration V17.4 (après rebase) : `fireFactorFor` de `realtime/food.js` appelé pour chaque camp à chaque assaut
  (`fightAssault` l'utilise aussi par défaut) ; les troupes à l'assaut **mangent et désertent** comme les autres
  (`food.js` : piles `battle`).
- `realtime/marches.js` (arrivées → `joinBattle`, défenseur bloqué), `engine/convoys.js` (`onLanding`, `turnBack` et
  `dockEscort` exportés), `realtime/day.js` (étape 4 « assauts du jour », bombardement et guérison tous les 10 jours),
  `engine/journal.js` (textes `assault`, `battle-reinforced`, `battle-retreat`, `bombard-ordered`, `bombard-stopped`, `besieged`).
- **Écran provisoire** (`src/presentation/ui/realtime-battles-ui.js`, 3 lignes dans `realtime-ui.js`) : ⚔ rouge avec « n/3 »
  au-dessus de chaque province en bataille (calque `#rtBattles`, `map-view.js` non touché) ; le toucher ouvre la fiche de la
  bataille (« Assaut 1/3 joué · assaut 2/3 le 2 février 2027 », camps et PV, rappel des règles, **Retraite** pour l'attaquant,
  « vos troupes sont bloquées » pour le défenseur) ; le bandeau affiche « ⚔ Bataille de X : assaut 2/3 · prochain le … » ;
  la liste « Troupes en route » montre les bombardements permanents avec « Arrêter ».

**Écarts et choix (tranchés par l'équipe)** :
1. Un attaquant = une entrée par nation : une nation arrivée par la terre puis par la mer garde le mode et la route de retour
   de sa première arrivée (cas rare). Les débarquements gardent le malus 85 % à chaque assaut (équivalence avec le tour par tour).
2. Arrêt anticipé seulement quand plus personne ne peut tirer (et non dès que l'attaquant n'a plus de troupes terrestres) :
   c'est ce qui garde l'équivalence exacte avec les 3 passes actuelles (une escorte seule continue d'encaisser).
3. Dates : comme pour les marches, un assaut joué pendant le traitement du jour D se voit à la date D + 1 ; la fiche et le
   journal affichent donc `nextAssaultDay + 1` (le moteur garde ses jours). À reprendre en V17.3 si l'interface change de convention.
4. Bombardement : tirs aux jours multiples de 10 (et non 10 jours après l'ordre) pour qu'annuler / redonner l'ordre ne fasse
   pas tirer plus souvent ; le premier tir arrive donc 1 à 10 jours après l'ordre. Les navires ne sont pas réservés.
5. La mémoire de garnison de l'IA (`rememberGarrison`) est mise à jour à chaque assaut (dernière garnison vue).
6. Batailles navales (interceptions, rencontres de convois) et rencontres en chemin : toujours instantanées (§5.4, §5.6).
7. L'IA ne bat pas encore en retraite d'elle-même et ne compte pas ses troupes à l'assaut : V17.5.

**Tests** : `tests/v17-2.test.js` (24 tests ; après relecture : trêve / paix / alliance dans la fenêtre d'un renfort, renfort sans guerre qui attaque,
renfort sans guerre avec trêve signée après son départ, sauvegarde comparée
sur l'état complet jour par jour, troupes comptées unité par unité sur toutes les batailles d'une partie IA de 2 ans) : valeurs, 3 assauts J / J+3 / J+6 et repli ; **équivalence sur 38 batailles**
(forteresses 0 à 3, blindés, artillerie, blessés : forces, prise, pertes, PV, forces engagées, passes et survivants identiques
au `fight` de 3 passes) ; prise au 2e assaut (B4) ; renfort attaquant ; renfort défenseur et allié stationné ; retraite
volontaire ; défenseur bloqué ; B2 ; débarquement repoussé qui rentre ; île mystérieuse neutre et publique ; guerre déclarée
par l'attaque, trêve pendant la bataille ; bombardement permanent (10 / 20 / 30 jours, +10 max, arrêt à la paix, brèche qui se
referme, annulation) ; guérison (10/3 %, bloquée 10 jours, jamais en bataille) ; navires 90 / 150 jours et fortune ;
`fireFactor` 0,7 ; troupes à l'assaut nourries et famine à 70 % pendant un assaut ; sauvegarde en pleine bataille ; nation à
l'assaut non éliminée ; écran provisoire ; partie IA de 2 ans. Les scénarios donnent une grosse réserve de vivres (pas de famine).
**Tests modifiés** : `tests/helpers/sources.js` (modules `realtime/battles` et `ui/realtime-battles-ui`). Aucun test retiré ni
changé : les empreintes du tour par tour (V16.4.1) restent identiques. `npm test` après rebase sur `v17` (V17.4 comprise) : 786 tests, tous verts.

**Mesures — 100 parties IA de 15 ans** (`node tools/v17/partie-jours.mjs 100 v17j`, résultats `tools/v17/resultats-v17.2.json`) :

| Mesure | V17.1 (combat immédiat) | **V17.2 (3 assauts)** | Écart |
|---|---|---|---|
| Conquêtes par partie | 28,6 | **25,6** | −10 % |
| Par quart de partie | 8,4 / 5,9 / 8,2 / 6,1 | 7,8 / 5,2 / 7,8 / 4,8 | |
| Nations éliminées par partie | 0,70 | 0,71 | |
| Plus grande armée finale (médiane / p90 / max) | 3 947 / 5 085 / 7 451 | 3 930 / 5 176 / 6 700 | |
| Batailles par partie (dont débarquements) | 36 (12,7) | 34,8 (12,8) | |
| Assauts par partie | — | 65,4 ; batailles finies au 1er / 2e / 3e assaut : 12,8 / 11,6 / 9,5 | |
| Renforts arrivés pendant une bataille | — | 0,07 | |
| Bombardements (tirs) par partie | ordre ponctuel | 2,0 | |
| Coût d'un jour (médiane / p99 / pire) | 0,09 / 6,7 / 467 ms | 0,11 / 2,3 / 111 ms | |

**Après rebase sur la V17.4 (nourriture, famine)** — même outil, 100 parties : 24,3 conquêtes (V17.4 seule : 26,3, −8 %),
par quart 6,5 / 4,8 / 7,3 / 5,7, 0,72 nation éliminée (0,8), plus grande armée 3 464 / 4 406 / 6 514 or (3 534 / 4 787 / 7 759),
33,2 batailles dont 12,3 débarquements, 61,6 assauts (finies au 1er / 2e / 3e : 12,9 / 10,4 / 9,0), 0,13 renfort en bataille,
2,4 tirs de bombardement, 0,22 ms par jour en médiane (p99 2,9 ms, pire 173 ms).
Partie courte (100 parties, avant rebase) : 14,1 conquêtes (15,8), 0,23 nation éliminée, plus grande armée 2 016 or. Lecture : un peu moins
de conquêtes (une garnison renforcée ou recrutée pendant les 6 jours tient mieux), aucune dérive ; l'IA ne profite presque pas
encore des renforts (0,07 par partie) ni des retraites : c'est le travail de la V17.5.

**Vérifié dans Chrome mobile simulé** (Playwright, 844 × 390, `node scripts/build.js`, serveur local) : nouvelle partie,
province voisine de la capitale transformée en forteresse ennemie (niveau 3, 300 fantassins, en guerre), ordre donné par les
vrais gestes (capitale → Déplacer → cible → 50 % → Confirmer, 300 fantassins), ▶ : armée arrivée le 31 janvier 2027,
⚔ « 1/3 » sur la province, fiche « Bataille de Sylvaren — Assaut 1/3 joué · assaut 2/3 le 3 février 2027 » avec Retraite, bandeau
« ⚔ Bataille de Sylvaren : assaut 2/3 · prochain le … », puis 3e assaut : province prise (3 passes au total), journal avec les
trois lignes « assaut 1/3, 2/3, 3/3 » et le récit complet. 0 erreur JS, 0 fichier manquant (refait après le rebase sur la
V17.4, même résultat). Non vérifié : vrai téléphone.
### V17.3 — Interface temps réel (20/11/2026)
**Fait** (branche `mission/V17.3`, `version` non montée : versions V17 menées en parallèle sur la branche longue) :
- **En bas à droite** (`#rtDock`) : la date bien visible (« 12 mars 2027 », police serif, avec « ×1 / ×2 / EN PAUSE ») et
  trois boutons **▶ Play / ⏸ Pause / ⏩ ×2** (le bouton actif est doré). Sans Premium, ⏩ porte un cadenas 🔒 et ouvre un
  simple écran « Premium bientôt » (`#premiumDialog`, rien de payant ; la vraie offre est la V17.7, qui n'aura qu'à poser
  `profile.premium = true`). Avec Premium : 1 jour par seconde, réglage gardé sur le téléphone (`frontieres-arken-vitesse`,
  jamais dans la partie, §11). Toucher la date : « Troupes en route » avec « Rappeler ». Paysage : contre la bande de
  boutons de droite ; fiche ouverte, à gauche de la fiche. Portrait : en bas à droite de la carte ; fiche ouverte, en haut à droite.
- **En haut au centre** : le message d'événement (l'ancien bandeau du tour en direct, devenu une ligne compacte, sans
  bouton ni barre de progression) : en pause « ⏸ En pause — touchez ▶ », sinon armées étrangères en approche, dernier fait
  du journal, troupes en route, ou une consigne. Le toucher ouvre le Journal.
- **Alertes en bandeaux** (`#rtAlerts`, sous le message ; en portrait, au-dessus de la date) : armée ou flotte étrangère en
  route vers une de mes provinces (§6, une fois par trajet), province prise / perdue, capitale prise (butin), proposition
  d'alliance ou de cessez-le-feu, ballon étranger (Détruire / Laisser passer), fenêtres de la mer, famine à venir / famine /
  vivres revenus (événements `food-alert`, `famine-start`, `famine-end` de la V17.4, déjà reconnus), « Il reste 1 an » /
  « Dernier mois ». Couleur selon le ton, au plus 2 à l'écran, 9 s puis rangés, × pour fermer. **Ils n'arrêtent jamais le
  temps** ; la fenêtre de décision s'ouvre en touchant le bandeau, ou plus tard depuis le **Journal** (en tête : « À décider »
  avec « Répondre » pour chaque proposition en attente, puis les dernières alertes avec « Voir »). Les fenêtres de prise de
  capitale, de mer et de proposition ne s'ouvrent plus d'elles-mêmes en temps réel.
- **Troupes, navires et ballons visibles qui avancent** (`ui/map-units-layer.js`, branché par `map-view.js` DANS `#mapWorld` :
  les copies `<use>` du défilement sans fin les répètent, toucher une copie marche comme pour les provinces) : icône de char
  (marche) ou de navire (convoi), silhouettes dessinées en SVG, sur une plaque aux couleurs de la nation, liseré or = soi,
  bleu = allié, rouge = étranger, pointillés = retour ; étiquette « 18 j » (jours restants, « ↩ 6 j » au retour) ; trajet
  restant en pointillés avec pointe de flèche à l'arrivée, trajet fait estompé. Position = fraction (jour − départ) ÷ (arrivée
  − départ) sur la flèche, extrémités en retrait des villes, **un saut par jour** (aucune animation continue). Ballon en vol :
  avance aussi chaque jour vers l'île suivante (saut de 60 jours), étiquette en jours. Toucher une icône : qui, d'où vers où,
  « Arrivée prévue le … (dans N jours) », composition, « Voir l'arrivée » et **« Rappeler »** pour les siennes. Vision §8 :
  armée étrangère visible seulement si l'on voit sa province de départ ou d'arrivée, composition seulement si l'on voit le
  départ (sinon « ? » et « Composition inconnue ») ; alliés : tout ; convois visibles de tous, composition pour soi, ses alliés
  ou si les troupes de leur port de départ sont connues (relecture : jamais à cause de la province d'arrivée). L'ancien jeton de convoi « tours restants » reste pour le tour par tour.
- **Ordres immédiats depuis la fiche** : « Envoyer maintenant », « elles partent tout de suite et apparaissent sur la
  carte », « 30 jours de marche (20 en cavalerie seule) », mer en jours (60 / 120), recrutement et chantiers en jours
  (30 / 60 / 90), « Rapporte +2 or / mois », plus de ligne « ordres déjà prévus ». Barre du haut : plus de « TOUR » ;
  « TRÉSOR · +8/MOIS » (§3.1, revenu de base sans les bonus d'atout).
- **Plus de « tour » à l'écran en temps réel, sauf l'Aide (?)**, dont les textes restent à refaire avec le tutoriel en V17.9 : pas de « Fin du tour » ni de compteur d'ordres, journal « JOURNAL · date »
  avec onglets Récent / Historique, armée datée, réglages du déroulé cachés ; les textes du moteur écrits pour le tour par tour
  sont relus à l'affichage (`realtimeText` : « Revenus du mois », « 60 jours en mer », « au tour 3 » → « en mars 2027 »…) dans le
  journal, le message d'événement, les Échanges et les propositions — le moteur n'est pas touché. L'animation de fin de tour et le
  bandeau « tour en direct » ne servent plus en temps réel.
- **Le temps ne s'arrête que hors du jeu** (décision de Jack) : Réglages, Aide, Atouts, Palmarès, Premium, fin de partie, pub,
  appli en arrière-plan. Fiche, construction, recrutement, choix de destination, Journal, Échanges, alertes : le temps tourne.
- **Horloge** (`realtime-clock.js`, pur) : 1 jour = 2 s, ×2 = 1 s (`setClockSpeed` garde le jour entamé), rattrapage plafonné à
  4 jours, arrêts hors jeu, reprise toujours en pause (nouvelle partie, rechargement, retour d'arrière-plan).
- **Sauvegarde espacée** (`createSaveGate` / `wantSave`, pur) : tous les 10 jours de jeu, à chaque pause, à chaque ordre (et
  rappel, réponse à une proposition), à la mise en arrière-plan (`visibilitychange`, `pagehide`) ; jamais plus d'une fois par
  seconde (reportée au battement suivant), sauf l'arrière-plan. `map-view.js` ne sauvegarde plus à chaque rendu en temps réel.
- **Emplacements prévus pour la V17.4** (sans rien coder de la nourriture) : `#foodStat` (case vide et cachée dans la barre du
  haut, après le trésor) et `sheetSlots.food(provinceId)` dans `province-sheet.js` (HTML ajouté à la fiche, vide par défaut).
- Nouveau module pur `src/presentation/realtime-view.js` (dates, durées, icônes, vision, bandeaux, message, textes) et
  `src/presentation/ui/map-units-layer.js` ; ajoutés à `sw.js` et `tests/helpers/sources.js`.

**Tests** : `tests/v17-3.test.js` (14 tests : dates et durées, à-coups, position et cap des icônes, une armée suivie jour par jour
jusqu'à l'arrivée, rappel, vision des marches ennemies et alliées, convois, ballon, bandeaux (une fois chacun, rien pour les
affaires des autres), message, horloge (0,5 j/s, ×2, rattrapage, arrêts hors jeu, pause), sauvegarde espacée, pureté, branchement).
**Tests modifiés** : `tests/v13-1-beta.test.js` (« or/tour » → `perTurn`, qui garde « or/tour » au tour par tour),
`tests/v17-1.test.js` (« ▶ Jouer / ⏸ Pause » du bandeau → boutons ▶ ⏸ ⏩). `npm test` : 756 tests, tous verts.

**Vérifié dans Chrome mobile simulé** (`/home/claude/pw/v173.mjs`, 844 × 390 et 390 × 844, vrais gestes) : nouvelle partie en
pause ; ▶ puis une minute = 30 jours (6, 11, 16, 21, 26, 31 janvier) ; ordre capitale → Sylvaren (« Envoyer maintenant ») : icône
de char aussitôt sur la carte, captures à 5 et 10 jours d'écart (elle avance d'un pas par jour) ; toucher l'icône → fiche, le
temps continue ; Rappeler → demi-tour ; ⏸ → le temps s'arrête et la partie est enregistrée ; armée ennemie et proposition
injectées → 2 bandeaux, le temps continue (jours 49 → 51), bandeau touché → fenêtre, le temps continue ; Journal « À décider » ;
⏩ → cadenas, écran Premium, temps arrêté pendant l'écran ; Premium simulé → 6 jours en 6 s ; icônes dans `#mapWorld` (2 copies
`<use>`) ; rechargement → reprise en pause. 0 erreur JS, 0 fichier manquant, aucun bouton hors écran ni recouvert, aucun
texte « tour » visible.
**Avis honnête sur les captures** : lisible et cohérent avec la carte V17.6 : la date et ▶ ⏸ ⏩ se trouvent d'un coup d'œil, les
bandeaux colorés se lisent sans masquer la partie, les chars et navires aux couleurs des nations se distinguent bien des
pastilles. Limites : sur un trajet court (deux provinces voisines), l'icône avance de quelques pixels par jour, l'étiquette
« 19 j » peut toucher la pastille ou la pointe de flèche ; la date en bas à droite cache un peu de carte (noms de provinces) ;
les bulles d'aide (tutoriel V14, refait en V17.9) se posent encore par-dessus la date en portrait.

**Écarts et choix (tranchés par l'équipe)** :
1. `live-clock.js` (horloge du tour en direct V16.4) est **gardé** pour le tour par tour (encore jouable par `?tour-par-tour`
   jusqu'à la V17.9) ; l'horloge des jours reste dans `realtime-clock.js` (complétée), au lieu de transformer `live-clock.js`.
2. Pas de bouton « Rappeler » ailleurs que sur l'icône et dans « Troupes en route » (toucher la date) ; une armée en bataille
   (V17.2) n'est plus rappelable.
3. Bandeaux non sauvegardés : après un rechargement, les propositions encore valables et les armées en approche sont
   réannoncées une fois ; l'historique des alertes repart de zéro.
4. Les textes de l'aide (?) et du tutoriel parlent encore en tours (V17.9 : tutoriel refait). Les paroles des dirigeants sont
   relues à l'affichage seulement (« au tour 3 » → « en mars 2027 ») : la V17.5 (IA en temps réel) devra les réécrire.
5. Le revenu « +8/MOIS » de la barre du haut est le revenu de base (bonus d'atout ou de nation non comptés).
6. Non vérifié : sur un vrai téléphone (APK), une partie longue dans le navigateur, une vraie conquête ou un vrai ballon
   étranger pendant le test (bandeaux vérifiés par les tests et par une armée / une proposition injectées).

**Intégration avec la V17.4 (20/11/2026, après rebase sur `v17`)** : la nourriture est branchée dans les emplacements de la
V17.3 : case « 🌾 VIVRES 1 002,5 · +2,5/j » = `#foodStat` de la barre du haut (posée dans `index.html`, cachée hors temps réel,
remplie par `ui/food-ui.js`, la toucher explique l'état) ; ligne 🌾 de la fiche par `sheetSlots.food` ; carte Ferme dans
l'écran Construction (avec les durées en jours de la V17.3). Les messages de nourriture de la V17.4 (un toast à chaque désertion
quotidienne) sont remplacés par de **vrais bandeaux** : alerte « famine à venir », un bandeau au début de la famine, puis au plus
**un rappel tous les 30 jours** (`famineReminder`), « Les vivres sont revenus » ; toucher le bandeau explique l'état des vivres.
Barre du haut (remarque de la relecture V17.4) : le revenu passe sous le trésor (« 136 / +8/mois ») et la ligne « ARKEN · v… »
peut passer sur deux lignes au lieu d'être coupée : le numéro de version est toujours lisible en entier (vérifié en 844 × 390 et
390 × 844). Tests : `tests/v17-3.test.js` (+1 test famine / branchements), `tests/v17-4.test.js` (2 assertions adaptées aux
bandeaux et à `sheetSlots.food`).

**Intégration avec la V17.2 (20/11/2026, après rebase sur `v17`)** : l'écran provisoire des batailles est branché dans
l'interface V17.3 : ⚔ « n/3 » sur la province en bataille, en couche `#rtBattles` **dans `#mapWorld`** (donc aussi sur les copies
du défilement sans fin), lisible à tout zoom, liseré or qui bat doucement pour ses propres batailles ; le toucher ouvre la fiche
de bataille de la V17.2 (assaut joué, prochain assaut, PV, **Retraite**, suivie d'une sauvegarde) ; chaque assaut qui concerne le
joueur donne un **bandeau** (« Bataille de X : assaut 2/3 · prochain le 02/03/2027 », un seul par bataille à l'écran, le suivant
remplace le précédent), qui n'arrête pas le temps ; une prise passe par les bandeaux de conquête / capitale ; le message du haut
montre la bataille en cours ; bombardements permanents (« Arrêter ») dans « Troupes en route ». Journal : en temps réel, l'onglet
« Récent » montre les derniers faits du journal permanent (rempli chaque jour, donc les lignes « ⚔ ASSAUT n/3 » tout de suite) ;
le nettoyage du journal garde maintenant la barre de « 2/3 » (elle était retirée). Vérifié (Playwright 844 × 390 et 390 × 844) :
attaque jusqu'au 3e assaut (assauts aux jours J, J+3, J+6, prise au 3e), ⚔ 1/3 puis 2/3 sur la carte, fiche avec Retraite, bandeaux
sans fenêtre ouverte, lignes ASSAUT 1/3, 2/3, 3/3 dans le Journal, 0 erreur JS, rien de caché. `npm test` : 804 tests, verts.

**Corrections après relecture (20/11/2026)** :
1. **Fuite de vision corrigée** : la composition d'une armée ou d'un convoi n'est connue que pour soi, ses alliés, ou si les
   troupes de la province de DÉPART sont connues selon la vision (`provinceIntel(...).troopsKnown` : voisinage, ballon,
   forteresse) — plus jamais à cause de la province d'arrivée (une flotte ennemie qui débarque chez moi ne montre plus ce
   qu'elle transporte). Test : convoi et armée ennemis visant une de mes provinces, ensemble visible non vide.
2. **Date jamais coupée** : fiche ouverte en paysage, le bloc date passe en colonne (date au-dessus de ▶ ⏸ ⏩) à gauche de la
   fiche. Vérifié par Playwright (`/home/claude/pw/v173-date.mjs`) en 667 × 375, 844 × 390, 390 × 844 et 360 × 740, fiche ouverte
   ou non, avec « 11 janvier », « 30 septembre » et « 30 novembre 2027 » : texte entier, dans l'écran, dans le bloc, sans
   chevaucher la fiche.
3. **« tour » retiré en temps réel** : Échanges (« FIL PUBLIC DES DIRIGEANTS · date », mois du message au lieu de « T3 », « au fil
   des mois », message qui part « à la fin du mois de jeu (dans N jours) ») ; ballon (arrivée « dans N jours », trajets en jours,
   règle « tous les 30 jours / 60 jours par île », « abattu immédiatement », construction 60 jours, départ à la fin du mois de
   jeu) ; Diplomatie (ordres « immédiatement », réponse d'un allié « à sa prochaine décision, 10 jours au plus ») ; avertissement
   de trêve, île mystérieuse, fenêtres de la mer (durées de convoi en jours). Restent en « tours » : l'Aide (?) et le tutoriel
   (V17.9), le détail « PV et dégâts » du recrutement et la réparation des navires (`recruit-repair-view.js`), l'aperçu du
   bombardement (à reprendre avec les règles en jours de la V17.2), le récit de fin de partie (V17.8).
4. Toucher un bandeau « mer » n'ouvre plus que sa propre fenêtre (`showSeaPopup`).
5. Barre du haut en portrait : sous 370 px de large, l'en-tête était caché (règle d'avant) ; il montre maintenant le numéro de
   version (les cases se resserrent) ; jusqu'à 430 px, la version ne se coupe plus. Vérifié avec une vraie version longue
   (« v17.3.0+1a2b3c4 ») en 320, 360, 390, 667 et 844 px.
`npm test` : 805 tests, tous verts. Playwright (`v173.mjs`) en 844 × 390, 390 × 844, 667 × 375 et 360 × 740 : une minute de jeu,
ordre, icône qui avance, rappel, pause, bandeaux sans pause, bataille jusqu'au 3e assaut, Échanges / ballon / Diplomatie sans
« tour », ⏩ cadenas, reprise en pause : 0 erreur JS, rien de caché ni coupé.

### V17.5 — IA et diplomatie en temps réel (20/11/2026)
**Fait** (branche `mission/V17.5`, version inchangée : montée par le chef de projet à la fusion ; présentation non touchée) :
- **`src/domain/realtime/ai-schedule.js`** (nouveau, pur, déterministe) :
  - calendrier : `decisionCalendar`, `nextDecisionDay` (la nation n° i décide quand (jour + 2 i) % 10 = 0 : 3 décisions par
    période, une nation au plus par jour) ;
  - **réponses en 1 à 10 jours** : une proposition d'alliance ou de trêve (payée comprise) et une demande d'aide adressées à
    une IA passent au statut `awaiting` (`answerDay` = prochaine décision de l'IA, `askedDay`), puis `releaseAnswers` les
    relâche ce jour-là, juste avant que l'IA ne décide. L'or d'une trêve reste réservé pendant l'attente ; une seconde
    demande au même pays est refusée tant que la première attend. Mesuré : 1 à 8 jours, 4 en médiane (8 819 réponses) ;
  - **rythme des règles « par tour »** (`paceReady` / `notePace`, `attacksInPace`, `attackQuota`) : recruter, acheter des
    navires, lancer un débarquement : au plus une fois par fenêtre de `RULES.realtime.ai.pace` (30 jours) ; quota d'attaques
    terrestres (ARCH_ATTACKS × `attacksPerPace`) par 30 jours ; **Facile : une attaque terrestre par 30 jours**
    (`easyAttackEveryDays`). Tour par tour : aucune fenêtre (identique) ;
  - **vision sans triche des armées en marche** (`visibleMarchesFor`, `marchEstimate`) : même règle que le §8 (départ ou
    arrivée visible ; composition seulement si le départ est visible, sinon estimation prudente de `vision.js`) ;
  - **réactions à la décision** (`aiReact`, avant le plan) : retraite d'une bataille que `battleForecast` dit perdue (sauf
    renfort à soi qui arrive avant le dernier assaut) ; **rappel** d'une attaque en route qui échouerait face à la garnison
    vue (ou estimée, ou mémorisée) + renforts ennemis visibles en route (marge `recallMargin`) ; **renfort** d'une province
    menacée par une armée visible qu'elle ne tiendrait pas (part d'une province voisine qui garde de quoi tenir, arrivée
    avant le dernier assaut ; sinon un lot de fantassins sur place s'il est livré à temps).
- `engine/ai-naval.js` : `landThreatForce` compte les armées hostiles visibles qui marchent sur la province (l'IA ne dégarnit
  plus une province menacée) ; achat de navires et débarquements rythmés. `engine/ai.js` : `aiAttackSlice` ajoute à la
  défense les renforts visibles en route vers la cible (elle ne lance pas une attaque perdue d'avance) ; quota et recrutements
  rythmés ; ballon avant les recrutements ; marge `RULES.realtime.ai.marginAdd` en temps réel. `leaders.js` : `strengthOf`
  compte les armées en marche et les troupes à l'assaut.
- **Fermes** : règle V17.4 gardée et toujours AVANT tout achat (ferme, puis ballon, puis recrutements) ; sans or pour la
  ferme nécessaire, l'IA épargne.
- **Ballons** (`engine/balloons.js`) : `aiBalloonBuild` (réserve `RULES.realtime.ai.balloonReserve` = 20 or, appelée avant
  les recrutements : l'IA atteint enfin le prix) ; **vols en jours** : l'envoi part le jour même (`sendBalloonsNow`), un saut
  = 60 jours (`advanceBalloonsDay`, champ `legDays` ; `legTurns` tenu à jour pour l'affichage), annonce le lendemain de la
  livraison, rapport privé tous les 30 jours (`balloonPeriodReports`). Un ancien envoi « programmé » (sauvegarde V17.1-V17.4)
  part à la fin de période suivante. Tour par tour : `resolveBalloonFlights` identique (découpé en fonctions).
- **Diplomatie** : `proposalAlive` — une proposition d'IA au joueur porte son jour (`day`) et vaut **180 jours exactement**
  (tour par tour : 6 tours). **Paroles** (`talk.js` `aiTalk({ only, initiatives })`, `day.js` `aiTalkOfDay`) : à la décision
  de l'IA — réponses aux messages reçus depuis sa décision précédente (1 à 10 jours, `rt.talkInbox`), réactions aux
  événements depuis sa dernière prise de parole, au plus une initiative par 30 jours et par nation (décalées), plafond de
  3 messages IA par période inchangé. Dérive de la tension, guerres d'hostilité, engagements d'aide : fin de période (30 j) ;
  coalition : tous les 10 jours ; Traître et mémoires : en périodes (`state.turn`), donc déjà en jours ×30.
- **Île mystérieuse** : rien à changer dans `ai-island.js` (décision tous les 10 jours) ; elle reste convoitée et prise
  (0,88 prise par partie, 56 parties sur 100).
- `tools/v17/partie-jours.mjs` : ballons construits / abattus, prises de l'île, retraites volontaires, rappels, renforts,
  recrues d'urgence, délai des réponses, attaques terrestres par 30 jours (résultats : `tools/v17/resultats-v17.5.json`).

**Mesures — 100 parties IA de 15 ans** (`node tools/v17/partie-jours.mjs 100 v17j`), comparées au §13.3 :

| Mesure | §13.3 (pas de 30 j) | Avant V17.5 (V17.2 + V17.4) | **V17.5** | Écart / §13.3 |
|---|---|---|---|---|
| Conquêtes par partie | 33,8 | 24,3 | **20,8** (6,6 / 4 / 5,8 / 4,3 par quart) | **−38 %** |
| Nations éliminées | 0,72 | 0,72 | **0,85** | +18 % |
| Plus grande armée finale (médiane / p90 / max) | 3 635 / 4 253 / 5 150 | 3 464 / 4 406 / 6 514 | **3 326 / 3 973 / 5 218** | −9 % / −7 % / +1 % |
| Batailles (débarquements) | — | 33,2 (12,3) | 34 (13,1) | |
| Retraites volontaires / rappels / renforts défensifs / recrues d'urgence | — | 0 / 0 / 0 / 0 | 8,6 / 5,5 / 10,7 / 3,4 | |
| Ballons construits / abattus | 0 en temps réel | 0 | **33,2 / 32,2** (≈ 6 par nation) | |
| Famine | 2,4 % | — | 4 % (20 nations sur 500), 29 j en médiane, au pire 344 j | |
| Coût d'un jour, au calme (10 parties) | — | — | **0,29 ms** médiane, p99 6,6 ms, pire 48 ms ; jour de décision 1,1 ms | |

**Écart > 25 % sur les conquêtes : rééquilibré dans `RULES.realtime`, sans l'atteindre.** Essais (30 parties chacun) :
réglages V17.5 de base 18,7 ; quota d'attaques ×2 : 18,6 ; rythme de 10 jours (comme avant) : 19 ; sans réactions : 22,9 ;
sans réactions ni rythme : 22,5 (V17.4 sur les mêmes graines : 24,8) ; `marginAdd` −0,1 : 21,1 ; −0,15 et rappel 0,6 : 21,3 ;
−0,25 : 21,2 ; débarquements tous les 15 jours : 18,3. Retenu : `marginAdd` −0,1, `recallMargin` 0,6 (20,8 sur 100 parties).
Lecture : ce n'est ni l'or ni le quota qui freinent, c'est la **défense** du temps réel — 3 assauts (renforts et recrues livrés
pendant la bataille) et une IA qui voit venir l'attaque et renforce (≈ 4 conquêtes de moins à elle seule). Une marge plus
basse lance plus d'attaques mais elles sont repoussées. Les armées, elles, sont dans la cible (−9 %) et ne gonflent plus.
**Décision pour Jack** (bêta / V17.9) : accepter une carte qui bouge moins (≈ 21 prises en 15 ans), ou rendre l'attaque plus
forte (par exemple 2 assauts, ou recrues livrées seulement après la bataille), ce qui change une règle du cahier.
Autres remarques : la « guerre des ballons » (Conquérant et Traître abattent tout ballon au-dessus de chez eux, l'IA le
reconstruit) coûte ≈ 30 or tous les 2 à 3 ans par nation ; la famine monte un peu (4 %) avec les recrues d'urgence.

**Siège : pas de recrues livrées pendant la bataille** — *décidé par le chef de projet (délégation de Jack), à valider en bêta
par Jack*. On garde les 3 assauts et les renforts qui arrivent par la route. Règle la plus simple retenue : un recrutement
(toute unité, navires compris) qui doit être livré dans une province où une bataille est en cours **attend la fin de la
bataille** (il reste dans la file, `held`, un seul avis « production-held » au journal) ; si la province tombe, il est
**remboursé** comme toute production perdue (règle B4 existante). On ne peut pas lancer de recrutement dans une province
assiégée : « Province assiégée : impossible de recruter pendant la bataille ». Les chantiers (bâtiments) continuent.
L'IA ne commande ses recrues d'urgence que si elles sont livrées la veille de l'arrivée ennemie, et seulement si elle se
nourrit (sinon elle garde son or pour la ferme).
Mesure après la règle (100 parties) : **20,9 conquêtes** (7,1 / 3,6 / 5,9 / 4,3), 0,73 nation éliminée, plus grande armée
3 215 / 3 967 / 5 195 or, famine 3,2 %, 0,24 ms par jour (p99 4,5 ms). Marge de l'IA encore baissée (`marginAdd` −0,2,
30 parties) : 21. **L'écart reste à −38 % du §13.3 : arrêté là, chiffres remis au chef de projet** (réglage gardé :
`marginAdd` −0,1, `recallMargin` 0,6).

**Interface (après rebase sur la V17.3)** : écran Diplomatie — un ordre `awaiting` désactive les actions envers ce pays et
affiche « ⏳ En attente de réponse — au plus tard le 9 janvier 2027 » (jour de décision de l'IA + 1) ; même ligne dans la
demande d'aide ; le ballon avance en jours (`balloonLegFraction` : `legDays` ÷ 60, ancien calcul pour une vieille
sauvegarde). Fonctions pures dans `src/presentation/realtime-view.js` (`awaitingOrder`, `awaitingText`, `balloonLegFraction`).
Vérifié dans Chrome mobile simulé (Playwright 844 × 390, `/home/claude/pw/v175.mjs`, dist servi sur le port 8805) :
alliance proposée à Roc-Épine par les vrais boutons le 1er janvier → « en attente, au plus tard le 9 janvier 2027 »,
boutons grisés ; réponse (acceptée) le jour 8 ; ballon qui avance sur la carte de jour en jour ; 0 erreur JS.

**Écarts et choix (tranchés par l'équipe)** :
1. Les règles « par tour » de l'IA ne sont pas réécrites en jours une à une : elles s'appliquent au plus une fois par fenêtre
   de 30 jours (recrutement, navires, débarquement, quota d'attaques) ; les tirages par période (`chance(…, state.turn)`) sont
   déjà les mêmes aux 3 décisions d'une période (pas 3 fois la probabilité).
2. Réponses AI → IA aussi différées (une IA qui propose à une autre attend sa décision). Déclaration de guerre, rupture,
   tribut : immédiats. Le joueur répond aux propositions quand il veut (180 jours).
3. Recrues d'urgence hors rythme (province menacée seulement).
4. **À brancher par l'interface (V17.3 / V17.9)** : un ordre `status: 'awaiting'` (avec `answerDay`) = « en attente de
   réponse » ; l'écran Diplomatie ne teste encore que `pending` (bouton actif, puis message « déjà prévue ») ; ballon : lire
   `legDays` / `RULES.realtime.durations.balloonHop` plutôt que `legTurns`.
5. Pire jour mesuré pendant la grande série (419 ms) : pendant que `npm test` tournait ; au calme 48 ms au pire.

**Tests** : `tests/v17-5.test.js` (17 tests : règles ; calendrier ; réponse à une proposition en 1 à 10 jours selon le jour de
la demande et rien avant ; demande d'aide et trêve payée en attente, or réservé ; proposition valable 180 jours exactement ;
ferme avant recrutement et épargne ; recrutements au plus une fois par 30 jours ; retraite quand le pronostic perd, pas quand
il gagne, et au vrai jour de décision ; troupes en marche / à l'assaut dans la force ; renfort d'une province menacée par une
armée visible, rien sans armée ; rappel si les renforts ennemis sont visibles, rien s'ils sont invisibles ; estimation
prudente d'une armée dont le départ est invisible ; pas d'attaque vers une province renforcée ; ballon commandé avec 50 or et
reconstruit ; vol de 60 jours parti le jour même ; Facile : une attaque par 30 jours sur 4 ans ; réponse aux messages à la
décision ; déterminisme sans `Math.random`). **Test modifié** : `tests/v15-2.test.js` (quota d'attaques : le code passe par
`attackQuota`, même règle). `tests/helpers/sources.js` et `sw.js` : `realtime/ai-schedule.js`. `npm test` : 825 tests (après rebase sur la V17.3), tous verts ; empreintes du tour par tour identiques. Test modifié aussi :
`tests/v17-4.test.js` (partie IA de 4 ans : on compte les fermes CONSTRUITES, une ferme prise avec sa capitale compte).
**Non vérifié** : vrai téléphone.

### V17.7 — Monétisation (20/11/2026)
**Fait** (branche `mission/V17.7`, `version` non montée ; **rien de payant activé** : bêta = emplacements de pub de test et
achats de test gratuits, `play-config.js` inchangé) :
- **Compteur de minutes de jeu** `src/presentation/ad-timer.js` (pur, testé) : seul compte le temps réel pendant lequel
  l'horloge des jours tourne (pause, menus hors jeu, pub en cours, arrière-plan exclus ; ×2 = une minute reste une minute ;
  au plus 5 s par battement : un téléphone gelé ne fait pas gagner de minutes). Gardé sur le téléphone
  (`frontieres-arken-pub`), jamais dans la partie. Délais tirés à graine (hachage, pas de hasard).
- **Pub récompensée 🎁** : petite icône `#giftBtn` « 🎁 +10 » sur le **bord gauche de la carte**, sous le bouton Atouts
  (jamais au milieu), qui apparaît **5 à 10 min de jeu** après la précédente et **reste tant qu'on ne l'a pas touchée**.
  La toucher : courte confirmation (« Plus tard » la garde), puis la pub ; **le temps est arrêté pendant la pub** ; vue en
  entier = **un mois de revenus** (revenu par tour ÷ 2, arrondi au multiple de 5 supérieur, **10 or minimum**) versé au
  trésor ; puis nouveau délai de 5 à 10 min. **Demande de Jack : l'icône ne disparaît pas tant qu'elle n'a pas été
  regardée** : « Plus tard », pub fermée avant la fin (pas de bonus, refus : plus de pub imposée jusqu'au prochain
  lancement) ou pub indisponible → l'icône reste, sans nouveau délai. Seule une pub vue en entier relance le délai. Jamais dans le tutoriel ; proposée aussi aux Premium.
- **Pub imposée** (`showForcedAd`, décision `forcedAdCheck`) : au plus **une toutes les 10 min de jeu**, seulement à un
  **moment calme** : ⏸, ouverture d'un menu hors jeu (Réglages, Aide, Atouts, Palmarès — jamais l'écran Premium ni la fin),
  retour à l'accueil, retour dans le jeu (partie reprise, appli revenue au premier plan). **Jamais** pendant une action
  (destination à choisir, fenêtre de décision ou d'ordre ouverte, bataille du joueur en cours), **jamais** en tutoriel ou
  mini-tuto (ni en quittant le tutoriel vers l'accueil), **jamais** pour un Premium, **jamais** après un refus, jamais au
  début d'une nouvelle partie. Une 🎁 regardée en entier remet le compteur à zéro. Temps arrêté pendant la pub.
- **Pub de début de partie supprimée** (aussi au tour par tour de test).
- **Premium 1,99 €, achat unique** (produit `premium`, non consommable ; `profile.premium`) : **⏩ ×2 débloqué** + **plus
  aucune pub imposée**. **Pack débutant 2,99 €** = Premium + 3 jetons. **Anciens acheteurs du Pack → Premium** (au chargement
  du profil). Déjà Premium : ni Premium ni Pack proposés ; un achat **payé** retrouvé à la restauration est toujours crédité.
  Règle d'or gardée : un achat ne donne que des jetons et le Premium (`ALLOWED_GRANTS = ['tokens', 'premium']`).
- **Écran Premium** (`premium-view.js` pur + `ui/premium-ui.js`, ouvert par ⏩ sans Premium) : trois avantages, prix,
  « Achat de test (gratuit) » + badge « BÊTA · AUCUN PAIEMENT » (build Play : « Acheter · prix Google »), option Pack ;
  une fois acheté : « ✔ Premium actif » et « Passer en ×2 ». Couché : avantages côte à côte, tout visible sans défiler.
  Boutique des Atouts : lignes Premium et Pack.
- `tools/v17/economie-v17.mjs` lit maintenant les règles du jeu (cadence, prix) et donne le seuil ; `docs/RENTABILITE-ARKEN.md`
  (section V17.7 : 3 scénarios 184 / 856 / 4 074 € nets pour 10 000 joueurs, seuil = 1 joueur, 0 € de coût) ;
  `docs/SORTIE-ARKEN.md` et la fiche Play anglaise : produit `premium` à créer dans la Play Console avant la sortie.
- **Bug trouvé et corrigé** : en temps réel, revenir à l'accueil (bouton FRONTIÈRES) perdait jusqu'à 9 jours de jeu
  (la partie n'est écrite que tous les 10 jours) : `showWelcome` écrit maintenant la partie avant de quitter.
- Réglage de test caché `?pub-test=60` (1 s réelle = 1 min de jeu), comme `?tour-par-tour`.

**Tests** : `tests/v17-7.test.js` (10 tests : minutes de jeu et pauses, 🎁 5-10 min / reste / délai, récompense 1 mois min 10,
au plus une pub imposée par 10 min et seulement à un moment calme, jamais en tutoriel / Premium / pendant une action / après
un refus, remise à zéro par la 🎁, `showForcedAd`, compteur relu sans perte, Premium / Pack / anciens Packs / restauration,
écran Premium, branchements), `tests/economie-v17.test.js` (4 tests). **Tests modifiés** (pub de début de partie supprimée,
produit `premium`) : `v14-4-play` (2), `v15-4`, `v16-4` (2), `v17-3` (⏩ → `openPremium`). `npm test` : 844 tests, tous verts (après rebase sur la V17.5).

**Vérifié dans Chrome mobile simulé** (`/home/claude/pw/v177.mjs` et `v177b.mjs`, 844 × 390 et 390 × 844, vrais gestes,
`?pub-test=60`) : nouvelle partie sans pub ; ⏸ à 1 min → pas de pub (trop tôt) ; 🎁 apparue après 5 à 9 min de jeu, en haut à
gauche sous Atouts ; confirmation, pub de test « +10 or », jours figés pendant la pub, trésor 121 → 131, icône partie ;
⏸ juste après → pas de pub (compteur remis à zéro) ; 11 min plus tard ⏸ → pub imposée (jours figés) ; Réglages juste après →
pas de pub ; ⏸ pendant le choix d'une destination → pas de pub (« action ») ; Atouts après 10 min → pub par-dessus le menu ;
retour à l'accueil → pub, « Continuer » juste après → pas de pub, rechargement après 10 min → pub « retour dans le jeu » ;
⏩ → écran Premium (temps arrêté), achat de test → « Premium actif », ⏩ sans cadenas, 5 jours en 5 s ; ⏸ et Réglages en
Premium → jamais de pub ; 🎁 toujours proposée au Premium. 0 erreur JS, aucun bouton hors écran ni recouvert.
**Avis honnête** : l'icône 🎁 est discrète et se lit bien (montant doré), elle ne cache rien d'important ; l'écran Premium
est clair. Limites : la pub imposée tombe parfois juste à la reprise de l'appli (c'est la règle « retour dans le jeu ») ;
un Premium voit encore la 🎁 (voulu : c'est un choix) ; les textes de l'écran Atouts parlent encore en « tours » (V17.9).

**Écarts et choix (tranchés par l'équipe)** :
1. Graine du tirage 5-10 min : propre au téléphone (créée au premier lancement, gardée avec le compteur), pas dans le profil
   (le profil n'a pas de graine ; même effet : délais déterministes et non rejouables).
2. Fiche de province ouverte : pas considérée comme une action (consulter n'est pas agir) ; la fenêtre d'ordre l'est.
3. Retour au menu et retour dans le jeu sont aussi des moments calmes (liste du §10.2) ; ouvrir l'écran Premium ne l'est jamais.
4. Pub 🎁 fermée avant la fin ou « Plus tard » : l'icône reste (demande de Jack, 20/11/2026) ; seule une pub vue en entier relance le délai.
5. Non vérifié : vraie pub AdMob et vrai achat Google Play (rien n'est activé : ce sera le test interne de la V17.10, avec
   le produit `premium` à créer dans la Play Console) ; refus d'une pub 🎁 seulement par les tests (l'emplacement de test
   se ferme seul).

### V17.5b — Équilibrage et personnalités (20/11/2026)
**Fait** (branche `mission/V17.5b`, version inchangée ; moteur `src/domain/`, présentation au strict nécessaire) :

1. **Province attaquée** (demande de Jack) : pendant une bataille, ni recrutement (V17.5) ni **construction**, forteresse et
   ballon compris : « Province attaquée : impossible de construire pendant la bataille (les chantiers en cours reprendront
   après) » (`engine/orders.js` `underAttack`, `balloons.js`). Un **chantier en cours y est suspendu** (il n'avance pas, bonus
   de vitesse compris) jusqu'à la fin de la bataille, un seul avis privé `production-suspended` (journal « X est attaquée :
   chantier (banque) suspendu jusqu'à la fin de la bataille », bandeau 🚧) ; province prise : remboursé (règle B4). Les recrues
   continuent de se former et sont livrées après la bataille (V17.5, inchangé). Message de recrutement : « Province attaquée
   (assiégée) : impossible de recruter pendant la bataille ».
2. **Trajets** (même vitesse pour l'attaquant et le défenseur ; plus c'est loin, plus c'est long) — retenu : **terre 20 jours**
   pour un voisin à la distance de référence, **× la distance** entre les repères des deux provinces ÷ 245, bornée de 0,75 à 1,5
   (`RULES.realtime.durations.landDistance` : 15 à 30 jours ; ex. Valmorne p01 → p02 : 17 j, p01 → p03 : 30 j) ; **cavalerie
   seule 13 j** (× la même distance) ; **mer 40 j** (2 « tours » de carte × 20 ; une route plus longue en compte plus), **île 80 j** ;
   interception au port d'arrivée à 20 jours de l'arrivée ; repli et demi-tour : la durée de l'aller. Fiche d'attaque : « 17 jours
   de marche (11 en cavalerie seule) » (`realtime-view.js` `landMarchText`) ; fiche de l'île en jours. Forteresse et
   recrutements plus longs : essayés, **non retenus** (ils font baisser les conquêtes, tableau ci-dessous).
   Note technique : la durée par la terre lit `markerAnchor` de la carte passée au moteur (comme la longueur des routes
   maritimes) ; sans carte, durée de base.
3. **Personnalités plus vivantes et moins prévisibles** (`src/domain/realtime/personalities.js`, `engine/ai.js`, réglages
   `RULES.realtime.ai.personality`, **en temps réel seulement** : le tour par tour et ses empreintes sont inchangés) :
   - **Tirage à la graine, vérifié** : les 4 caractères sont redistribués à chaque partie selon sa graine (`'arken-' + date`,
     `game-flow.js`) ; même graine = même partie ; sur 30 graines, au moins 15 répartitions différentes et chaque nation tient
     chacun des 4 caractères ; au départ, rien n'est révélé (« Dirigeant encore mal connu » pour tous).
   - **Tempérament** : chaque dirigeant tire à la graine de petites variations (±12 %) de ses seuils (marges d'attaque,
     rapports de force, délais) ; **choix pondérés** au lieu de « le plus faible à coup sûr » (`weightedPick`) ; délais tirés
     dans une fourchette (`between`). Aucun `Math.random`.
   - **Conquérant** (le plus dangereux) : marge 0,9 (au lieu de 0,95), 0,78 en guerre ; 3 attaques terrestres par 30 jours ;
     débarquement tous les 15 jours (au lieu de 30), marge de débarquement en guerre 1,0 (au lieu de 1,1) ; recrute tous les
     20 jours, un lot de blindés de plus ; première guerre dès la 1re à 3e période ; **proie tirée au sort** (les plus faibles,
     celles qu'il atteint depuis sa base et les nations presque à terre pèsent plus ; Héros et joueur compris), gardée 3 à 8
     périodes puis retirée ; 2e proie dès 1,1 fois sa force ; **rompt une trêve au bout de 4 à 8 périodes** (au lieu de 10 :
     trahison publique). Ses armées loin du front marchent vers une province frontalière (`stageToFront`, aussi Traître et
     Héros en guerre, Bâtisseur réveillé).
   - **Héros** : contre la **menace publique** (`publicMenace` : un Conquérant démasqué, ou la nation qui a agressé au moins
     2 nations en 12 périodes — jamais un caractère caché), il propose des alliances (ses victimes et ceux qui la combattent
     d'abord ; tirage 60 % par période, moitié pour les autres), accepte plus facilement une victime (tension < 55) et attaque
     la menace quand elle frappe un de ses alliés, s'il pèse au moins la moitié de sa force et pas à chaque fois (60 %).
   - **Traître** : « s'allie » volontiers contre un ennemi commun (la menace ou une nation avec qui il est en guerre : tension
     jusqu'à 55, chances × 1,6) ; l'allié qu'il trahit est **tiré au sort** parmi ceux qui sont mûrs (jamais fixe : Héros,
     Bâtisseur, joueur…) et il frappe quand cet allié est en guerre ailleurs (troupes parties au front, vues par SA vision,
     simulation de l'attaque) ; profite des guerres des autres (une nation non alliée en guerre ailleurs et à moins de 0,8 fois
     sa force devient une proie, 20 % par période) ; après un coup, il **se fait oublier 12 à 30 périodes** (il trahit parfois).
   - **Bâtisseur** : cherche des alliés (tout voisin calme, 20 % par période, 2 au plus) ; en paix il ne recrute qu'une fenêtre
     sur deux ; il couvre ses provinces : forteresse (jusqu'au niveau 3) dans chaque province, fermes (3 par province), usine
     et port partout où c'est possible → la cible la plus riche et la plus dure à prendre en fin de partie.
4. **Phare de l'île mystérieuse** (idée validée par Jack) : le propriétaire et le co-propriétaire voient **toute flotte d'une
   autre nation en route vers l'île, et seulement celles-là** (`vision.js` `lighthouseFleets`) : de qui, d'où, arrivée le … ;
   composition selon les règles de vision habituelles (province de départ connue ou flotte alliée), sinon « composition
   inconnue ». Avis privé `lighthouse` au départ de la flotte : journal « 🗼 Flotte de Roc-Épine en route vers l'île
   mystérieuse, arrivée le 12 mars 2027 », bandeau 🗼 (touchable : l'île), lignes 🗼 dans la fiche de l'île. La flotte ne sait
   pas qu'elle est vue. L'IA propriétaire lit la même liste : si la garnison ne tiendrait pas (composition vue, sinon
   estimation prudente), elle envoie un renfort qui arrive avant (`ai-island.js` `lighthouseAlarm`). Règles de l'île vérifiées
   (test) : garnison neutre immobile, rien ne s'y construit ni ne s'y recrute (ferme comprise), super banque, 2e ballon.
5. **Équilibre** : estimation prudente d'une garnison invisible × 2 en fin de partie (`RULES.realtime.vision.growthAtEnd` 1,
   au lieu de 2,37) ; Traître au repos 12 à 30 périodes ; Bâtisseur allié 20 %.

**Essais** (`node tools/v17/essais-v17.5b.mjs [parties] [préfixe] [essais]` : chaque essai sur une copie de `src/` avec ses
réglages ; résultats bruts `tools/v17/resultats-v17.5b-essais.json`). Cible §13.3 : 33,8 conquêtes (±25 % : 25,5 à 42),
plus grande armée 3 635 (2 726 à 4 544), famine < 5 %, pas d'éliminations en chaîne avant 2 ans.

| Essai (parties de 15 ans) | Parties | Conquêtes | Éliminées | Plus grande armée (médiane) | Famine | Chaîne < 2 ans | Batailles |
|---|---|---|---|---|---|---|---|
| IA de la V17.5 — 30 j (base) | 100 | 18,7 | 0,67 | 3 129 | 4,2 % | 0 | 30,5 |
| IA V17.5 — voisin 20 j, mer 40 / 80 | 100 | 23,3 | 0,86 | 3 214 | 3,4 % | 0 | 35,8 |
| IA V17.5 — voisin 15 j, mer 30 / 60 | 100 | 20,5 | 0,70 | 3 311 | 2,8 % | 0 | 31,4 |
| IA V17.5 — 20 j + forteresse +50 %, blindés / artillerie / navires +33 % | 100 | 20,2 | 0,74 | 3 403 | 1,8 % | 0 | 30,7 |
| Nouvelles personnalités (1re version) — 30 j | 100 | 16 | 0,61 | 3 404 | 3 % | 0 | 26,9 |
| — 20 j | 100 | 18,5 | 0,67 | 3 290 | 2,6 % | 0 | 28 |
| — 20 j selon la distance | 100 | 18,5 | 0,70 | 3 312 | 3 % | 0 | 27,9 |
| Personnalités (2e version) — 15 j | 100 | 17,9 | 0,65 | 2 992 | 2 % | 1 | 26,9 |
| — 15 j + IA qui attaque / débarque tous les 15 j | 100 | 17,7 | 0,64 | 3 059 | 2 % | 0 | 27 |
| — 20 j + IA tous les 15 j | 100 | 17,1 | 0,58 | 3 140 | 1,8 % | 0 | 27,1 |
| — 20 j + IA tous les 15 j + forteresse et recrutements plus longs | 100 | 17,8 | 0,62 | 3 108 | 2 % | 0 | 28 |
| — 15 j + IA tous les 15 j + marge −0,2 | 100 | 17,8 | 0,69 | 3 108 | 2,6 % | 0 | 27,7 |
| — 15 j + **2 assauts** au lieu de 3 (pour information) | 100 | 17,8 | 0,60 | 2 989 | 2,8 % | 0 | 32,7 |
| Diagnostic 20 j (base) | 30 | 19 | 0,67 | 2 827 | 0,7 % | 0 | 28,7 |
| — Bâtisseur sans alliances | 30 | 20,5 | 0,77 | 3 036 | 0 % | 0 | 31,4 |
| — Héros sans coalition | 30 | 19,1 | 0,63 | 2 819 | 1,3 % | 0 | 28,9 |
| — Traître sans repos entre deux coups | 30 | 23,3 | 0,80 | 3 117 | 0,7 % | 0 | 34,9 |
| — estimation prudente × 2 en fin de partie | 30 | 21,3 | 0,63 | 2 972 | 0,7 % | 0 | 34,6 |
| — estimation prudente × 1,5 | 30 | 22,5 | 0,80 | 3 023 | 2 % | 0 | 37,6 |
| Combinaison 15 j + estimation × 2 + Traître 12-30 + Bâtisseur 0,2 | 100 | 20,9 | 0,84 | 3 116 | 2,4 % | 0 | 32,7 |
| **Combinaison 20 j + estimation × 2 + Traître 12-30 + Bâtisseur 0,2 (retenue, + distance)** | 100 | **21,8** | 0,88 | 3 157 | 1,8 % | 0 | 34,5 |
| Combinaison 20 j + estimation × 1,5 | 100 | 22,3 | 0,94 | 3 169 | 2,2 % | 0 | 35,6 |

Lecture : **le nombre de conquêtes ne dépend presque pas de la défense** — 2 assauts au lieu de 3, des trajets d'un tiers
ou de moitié plus courts, des forteresses plus lentes ou une IA qui attaque deux fois plus souvent le laissent entre 17 et 21.
Les IA lancent peu d'attaques (≈ 30 batailles en 15 ans, 60 % réussies) : leurs armées (≈ 3 000 or au plus) ne suffisent
pas, à leur propre simulation, contre les garnisons qu'elles voient ou estiment. Les trajets de 20 jours (et non 15 : la
défense voisine n'a plus le temps de venir, mais l'attaquant non plus) donnent le meilleur résultat ; l'estimation prudente
moins gonflée et un Traître qui frappe plus souvent rendent ce que les nouvelles alliances (Héros, Bâtisseur) avaient coûté.

**Mesures finales — 300 parties de 15 ans** (`node tools/v17/mesures-v17.5b.mjs 300 v175b-final`, réglages du dépôt ;
résumé `tools/v17/resultats-v17.5b.json`) :

| Mesure | Valeur | Cible |
|---|---|---|
| Conquêtes par partie | **21,5** (8 / 4,6 / 4,8 / 4,1 par quart) | 33,8 ±25 % : **non atteinte (−36 %)** |
| Nations éliminées par partie | 0,72 | §13.3 : 0,72 |
| Éliminations avant 2 ans | 18 parties sur 300 ; **en chaîne (2 ou plus) : 1 partie** | pas de chaos ✓ |
| Plus grande armée finale (médiane / p90 / max) | 3 088 / 3 892 / 5 500 or | 2 726 à 4 544 ✓ |
| Famine | 2,7 % (40 nations sur 1 500) | < 5 % ✓ |
| Fin de partie | 300 au dernier jour (aucune victoire par les capitales) | pas trop tôt ✓ |
| Vainqueur (1er du classement) par caractère | Héros 87, Conquérant 86, Bâtisseur 72, Traître 55 | fins variées ✓ |
| Vainqueur par nation | Noireflamme 110, Roc-Épine 52, Aurel 51, Valmorne 46, Oroel 41 | Noireflamme avantagée (carte) |
| Batailles (débarquements) | 33,5 (13) | |
| Île prise | 0,75 fois par partie, dans 159 parties sur 300 | |

Par caractère (moyennes par nation sur 300 parties ; 375 à 383 nations de chaque caractère) :

| | Assauts lancés (terre / mer) | 1er assaut (jour, médiane) | Conquêtes | Provinces perdues | Trahisons | Alliances (dont contre le Conquérant) | Bâtiments par province | Éliminées | Victoires |
|---|---|---|---|---|---|---|---|---|---|
| **Conquérant** | **12,2** (8,1 / 4) | **62** | **6** | 6,2 | 0,94 (trêves rompues) | 1,16 (0) | 2,4 | 81 | 86 |
| **Traître** | 11,4 (7,5 / 3,9) | 294 | 5,7 | 6,5 | **3,51** (297 Traîtres sur 363 ; 2,24 cibles différentes par partie) | 4,1 (1,55) | 2,84 | 87 | 55 |
| **Héros** | 4,7 (3,2 / 1,5) | 320 | 3,4 | 2,5 | 0 | 3,82 (**1,86**) | 4,56 | 19 | 87 |
| **Bâtisseur** | **4,4** (3,2 / 1,2) | 1 188 | 2,2 | 1,7 | 0 | 2,77 (0,82) | **6,82** | 28 | 72 |

Cibles des trahisons du Traître : Héros 547, Bâtisseur 386, Conquérant 210, autre Traître 132 (jamais la même d'une partie à
l'autre). Le Conquérant attaque le plus tôt et le plus, prend le plus de provinces mais en reperd autant (Héros, coalition,
trêves rompues qui le démasquent) : dangereux, pas invincible.

**100 parties courtes (7 ans)** (`node tools/v17/mesures-v17.5b.mjs 100 v175b-courte --courte`) : 12,3 conquêtes, 0,32 nation
éliminée, aucune élimination en chaîne avant 2 ans (6 parties avec une élimination), plus grande armée 1 629 / 1 856 / 2 334 or,
famine 0,4 %, 100 fins au dernier jour ; vainqueur : Conquérant 30, Héros 29, Traître 25, Bâtisseur 16. Assauts par nation :
Conquérant 7,5, Traître 5,9, Héros 2,6, Bâtisseur 2,2 ; trahisons par Traître 2,6 ; alliances contre le Conquérant : Héros 1,56,
Traître 1,05, Bâtisseur 0,79 ; bâtiments par province : Bâtisseur 4,82, Héros 2,91, Traître 1,8, Conquérant 1,41.

**Incohérences résolues en route** : un retour d'armée (demi-tour à l'arrivée) dure le trajet de l'aller ; la fiche de l'île
donnait ses routes « en tours » en temps réel (maintenant en jours) ; la fiche d'attaque affichait « 30 jours de marche » en dur ;
un Bâtisseur « réveillé » prenait le quota de 3 attaques du Conquérant (non : c'est sa nature qui compte) et rompait les trêves
comme lui (non) ; la mesure des essais a été corrigée pour copier le code avant de lancer les parties.

**Écarts et choix (tranchés par l'équipe)** :
1. **Conquêtes −36 % de la cible** : écart remis au chef de projet / à Jack. Les leviers « défense » (assauts, trajets,
   forteresses) n'y changent presque rien ; ce qui compte, c'est la décision d'attaquer (armées trop petites face aux
   garnisons). Pistes pour la V17.9 : armées de l'IA plus grosses (revenus ou coût), ou garnisons de départ plus petites.
2. Forteresse +50 % et blindés / navires +33 % : non retenus (ils protègent aussi l'attaquant qui s'arme, mesuré −1 à −3).
3. Trajets de 20 jours (et non 15) : 15 jours ne fait pas mieux (17,9 / 20,9 contre 18,5 / 21,8).
4. Personnalités en temps réel seulement (le tour par tour, réglage de test, garde ses empreintes).
5. Le Traître trahit en moyenne 3,5 fois en 15 ans (une fois tous les 4 ans environ) : sans repos, 23,3 conquêtes mais
   des coups tous les ans ; avec 36 à 66 périodes de repos, ≈ 2 fois mais 3 conquêtes de moins par partie.

**Tests** : `tests/v17-5b.test.js` (12 tests : construction et ballon refusés dans une province attaquée, recrutement aussi ;
chantier suspendu puis repris, un seul avis, privé ; phare : propriétaire et co-propriétaire voient la flotte vers l'île et
seulement elle, composition selon la vision, avis privé, bandeau et fiche ; règles de l'île ; durées (distance, aller = retour,
cavalerie) ; caractères à la graine et rien de révélé au départ ; tempérament ; menace publique ; même graine = même partie ;
sur 8 parties courtes : le Conquérant attaque le plus, le Bâtisseur le moins et a le plus de bâtiments, le Traître trahit
parfois et pas toujours la même cible, le Héros s'allie contre le Conquérant plus que les autres ; pureté). **Tests modifiés**
(durées de trajet tirées des règles au lieu de 30 / 20 / 60 / 120 en dur) : `v17-1`, `v17-2`, `v17-3`, `v17-5` (renfort depuis le
voisin proche, recrues retenues, rythme de recrutement du Conquérant) ; `v14-0` et `v15-2` (motif du code : trêve et quota du
Conquérant en temps réel). `npm test` : 857 tests, tous verts. **Non vérifié** : vrai téléphone, Chrome mobile simulé (bandeaux
🗼 et 🚧 testés par les fonctions pures seulement).
