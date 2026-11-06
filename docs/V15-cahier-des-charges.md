# FRONTIÈRES: ARKEN — V15 — Cahier des charges (02/11/2026)

Base : `main` en V14.4.0, 442 tests au vert.
Demande de Jack (02/11/2026) : intégrer les 7 points ci-dessous l'un après l'autre, chacun testé puis fusionné, pour de
grosses bêtas internes le soir même. **Autorisation de fusion donnée par Jack dans la conversation** (« intégrés, testés,
fusionnés »), pour toute la série V15.0 à V15.4, aux trois conditions de `CLAUDE.md`. Jack délègue les décisions de détail.

## Constat de départ (simulation IA contre IA, V14.4, sans joueur humain : signaux, pas preuves)

| Mesure | Valeur V14.4 |
|---|---|
| Changements de province par tranche de 20 tours (60 parties) | 347, 253, 182, 100 |
| Dernière conquête (médiane) | tour 60 |
| Vainqueur / 2e (provinces, médiane) | 6 / 4 |
| Nations éliminées (médiane) | 0 |
| Victoires par les 5 capitales | 0 sur 60 |
| Capitales perdues par partie (200 parties) | 0,27 |
| Victoires par nation sur 200 | Valmorne 9, Roc-Épine 40, Noireflamme 61, Oroël 45, Solmara (`aurel`) 45 |
| Victoires par caractère sur 200 | Conquérant 69, Traître 66, Héros 23, Bâtisseur 3 (39 pour le siège « joueur » sans dirigeant) |

## Limites à respecter (décisions de Jack)
- 0 € de fonctionnement : aucun serveur, aucun LLM, aucun service payant, aucun fichier sous licence douteuse.
- 20 provinces, 5 nations, identifiants inchangés, clé de sauvegarde inchangée. Partie normale : 80 tours, pas plus.
- Les joueurs découvrent les stratégies eux-mêmes : on explique les commandes et les règles, pas la solution.
- Monétisation inchangée, aucun achat d'or ou de troupes. Aucune pub pendant qu'on joue.
- Résolution simultanée des tours, moteur déterministe (pas de `Math.random`), `src/domain/` sans DOM.
- Les anciennes sauvegardes et le profil du joueur (jetons, atouts, achats) ne sont jamais perdus : migration testée.
- Tout est jouable au doigt sur un téléphone (390 × 844), sans débordement horizontal.

## Découpage (une version à la fois, dans cet ordre)

### V15.0 — Découpage du code, sans changer le gameplay
- Découper `src/domain/game-engine.js` (190 Ko) en modules par thème, et `app.js` (100 Ko) en modules d'interface.
- Remplacer les fichiers nommés par version (`v3-ux.js` … `v14-4-ux.js`) par des noms de thème. Lignes de plus de 300
  caractères reformatées dans les fichiers touchés. `game-engine.js` peut rester comme point d'entrée qui réexporte.
- `sw.js` (liste ASSETS) à jour pour que le jeu marche hors ligne.
- **Preuve d'absence de changement** : `tools/equilibre.mjs` (simulation IA contre IA reproductible, mêmes mesures que
  le constat, nombre de parties en argument) ; pour plusieurs graines, l'état final doit être strictement identique
  avant et après le découpage.

### V15.1 — Fin de partie vivante, écran de fin, Valmorne
1. **Coalition** : quand une nation domine nettement (seuil calibré), les autres IA convergent contre elle selon leur
   caractère, y compris contre le joueur. C'est annoncé clairement (journal, échanges entre dirigeants) et la coalition
   se dissout quand le danger recule. Pas de triche : mêmes règles, pas d'or offert.
2. **IA plus ambitieuse** : elle ose viser les capitales et finir une nation affaiblie, et ne s'endort pas en fin de
   partie. Le test « pas suicidaire » reste vert.
3. **Écran de fin qui raconte la partie** : vrai caractère de chaque dirigeant, courbe des provinces de chaque nation,
   tournant de la partie, trahisons, grandes batailles, capitales prises. Données stockées de façon compacte.
4. **Valmorne** : trouver la cause réelle du retard par simulation, puis corriger.

Cibles (au moins 200 parties IA contre IA) : tranche 61-80 ≥ 45 % de la tranche 1-20 ; capitales perdues ≥ 1 par partie ;
au moins une nation éliminée dans ≥ 30 % des parties ; Valmorne entre 12 et 28 % des victoires. L'élimination du joueur ne
doit pas devenir brutale : un chiffre de contrôle avec un joueur scripté prudent est noté dans le cahier.

### V15.2 — Sons et animations
- Entre deux tours : déplacements visibles sur la carte (troupes, convois), combats et conquêtes signalés, rythme court,
  **touchable pour passer**, respect de `prefers-reduced-motion`. Aucune perte de fluidité sur téléphone moyen.
- Sons et musique synthétisés (Web Audio, sans fichier externe) mais soignés : boutons, ordre donné, bataille, conquête,
  trahison, victoire, défaite. Réglages existants respectés. Le son démarre seulement après un geste du joueur.

### V15.3 — Difficulté, nations, Bâtisseur
1. **Trois niveaux** choisis au début de la partie : Facile (IA moins agressive), Normal (mêmes règles pour tous, sans
   triche), Difficile (IA plus efficace ; si un bonus d'or est utilisé, le jeu le dit clairement).
2. **Un bonus par nation**, modeste, visible au choix de la nation, en accord avec son univers. Le bonus sert aussi aux IA.
3. **Bâtisseur** : sa force économique doit lui donner une vraie fin de partie.

Cibles (au moins 200 parties, Normal) : chaque nation entre 12 et 28 % de victoires ; Bâtisseur ≥ 10 % ; aucun caractère
au-dessus de 40 %. Les cibles de V15.1 restent tenues. Les jetons d'atouts restent cohérents avec la difficulté.

### V15.4 — Mode 40 tours et progression
1. **Mode « Partie courte » de 40 tours** à côté des 80 tours : `RULES.gameLength` devient une valeur de la partie
   (anciennes sauvegardes : 80). L'IA et les annonces de fin s'y adaptent. La pub de début de partie suit les mêmes règles.
2. **Palmarès** dans le profil (jamais dans la sauvegarde de partie) : parties, victoires par nation et par difficulté,
   meilleur classement, plus rapide victoire. Une partie n'est comptée qu'une fois, même reprise.
3. **Titres à débloquer**, sans effet sur la puissance, cachés ou sobres pour laisser la découverte.

## Règles de chaque version
Voir `CLAUDE.md` : `npm test` vert, un test par correctif, `version` montée dans `package.json`, Chrome mobile simulé sur
le parcours réel, relecture par un sous-agent indépendant, cahier mis à jour dans « Réalisé » avec les vrais chiffres.
Cible non tenue : le dire avec le chiffre réel, ne pas maquiller.

## Réalisé

### V15.0 — découpage du code (02/11/2026)
- **Moteur** : `src/domain/game-engine.js` (190 Ko, 2 159 lignes) ne fait plus que réexporter la même API publique ; le code est
  dans `src/domain/engine/` (15 modules : `shared`, `income`, `sea-routes`, `orders`, `diplomacy`, `battles`, `production`,
  `convoys`, `bombard`, `recovery`, `ai-naval`, `ai`, `ai-help`, `journal`, `turn`).
- **Interface** : `app.js` (100 Ko) ne garde que le démarrage et le branchement des boutons et gestes ; les écrans sont dans
  `src/presentation/ui/` (12 modules : `base`, `session`, `tutorials`, `map-view`, `province-sheet`, `diplomacy-screen`,
  `event-popups`, `talk-screen`, `turn-flow`, `audio`, `boosts-ui`, `game-flow`). Les variables partagées se lisent directement ;
  depuis un autre module on les remplace par `setState(…)`, `setSelected(…)`, etc.
- **Noms de thème** : `v3-ux` → `overview-view`, `v4-ux` → `guide-input`, `v5-ux` → `map-orders-view`, `v11-ux` → `leaders-view`,
  `v11-talk-ui` → `talk-facade`, `v12-ux` → `boosts-screen`, `v13-ux` → `alliances-view`, `v13-2-ux` → `ceasefire-view`,
  `v13-4-ux` → `passage-fort-view`, `v13-vision-ui` → `vision-view`, `v14-ux` → `truce-warning`, `v14-1-ux` → `launch-view`,
  `v14-2-ux` → `recruit-repair-view`, `v14-3-tutoriel` → `tutorial`, `v14-4-ux` → `bombard-view`, et dans `src/domain/`,
  `talk-v14-2` → `talk-more-lines`, `alliances-v14-2` → `alliances-more-lines`. Non renommés : `v5.css` et `arken-v9-*`
  (carte générée, hors de la liste du cahier). Les anciens cahiers gardent les anciens noms : c'est leur historique.
- **Lignes de plus de 300 caractères** : plus aucune dans `app.js`, `sw.js`, `update-check.js` et `src/` (seule exception : le
  fichier généré `arken-v9-data.js`). Dans le HTML des gabarits, la coupure est une continuation `\` : le texte produit ne change pas.
- `sw.js` : ASSETS à jour (tous les modules de `src/`). `tests/helpers/sources.js` : les tests qui lisent le code lisent tous les
  morceaux, et échouent si un nouveau fichier n'est pas dans la liste. Aucun test supprimé.
- **Bug trouvé en route** : `app.js` de la V14.4.0 avait une accolade manquante, le jeu ne démarrait plus, tests au vert. Corrigé sur
  `main` en parallèle (14.4.1, `tests/syntaxe-js.test.js`), fusionné ici. Ajout de `tests/modules-chargement.test.js` : tout le graphe
  de modules est lié par le moteur JavaScript (un import nommé absent fait échouer le test).

**Preuve d'absence de changement**
- `tools/equilibre.mjs --empreintes --verifier=tools/empreintes-v14.4.json` : 81 parties (10 graines × 5 nations IA contre IA sur
  80 tours ; 4 graines × 5 nations avec ordres de joueur scriptés ; 5 avec sauvegarde/relecture tous les 10 tours ; 5 avec atouts ;
  1 tutoriel sur 30 tours). Empreinte de l'état complet (événements, journal, clé `tutorial` compris) à chaque tour et à la fin, plus les
  réponses aux ordres, le journal en texte, les règles, la carte et la liste des exports du moteur.
  Référence écrite avant le découpage ; **résultat identique** avec le code découpé et avec le code de `main` (4d869f0).
- Chrome mobile simulé (Playwright, 390 × 844) : même parcours sur le build de `main` et sur celui-ci, date figée, 17 instantanés
  (carte, fiches, fenêtres, sauvegarde) : **0 différence**. Parcours : nouvelle partie, recruter, déplacer, diplomatie, échanges, atouts,
  3 fins de tour, reprise après rechargement, puis chargement et un tour hors ligne. 0 erreur JavaScript, 0 débordement horizontal.
- La carte et les gestes au doigt (pincer, glisser) ne sont pas rejoués par ce parcours : à regarder sur téléphone.

**Mesures de départ** (`node tools/equilibre.mjs 60`, graines `eq-*`, autres graines que le constat, donc chiffres voisins mais pas égaux) :
changements de province par tranche 315 / 294 / 147 / 157, dernière conquête médiane tour 63, vainqueur / 2e 5 / 5 provinces, 0 nation
éliminée en médiane, 0 victoire par les capitales, 0,4 capitale perdue par partie, victoires Valmorne 2, Roc-Épine 14, Noireflamme 20,
Oroël 11, Solmara 13 ; Conquérant 27, Traître 24, Héros 9, Bâtisseur 0.

`tools/empreintes-v14.4.json` ne vaut que pour le code V14.4 : à partir de V15.1 le gameplay change, et les empreintes aussi.

### V15.1 — fin de partie vivante, écran de fin, Valmorne (02/11/2026)

**Bilan franc** : sur 4 cibles, **2 tenues, 2 non tenues** (élimination 26 % au lieu de 30 %, Valmorne 11 % au lieu de 12 %).

| Mesure (`node tools/equilibre.mjs 200 80 fin` puis `fin2`, 400 parties ; avant : code V15.0, `fin`, 200 parties) | Avant | Après | Cible | |
|---|---|---|---|---|
| Tranche 61-80 / tranche 1-20 | 41 % (436/1073) | 100 % (2170/2167) | ≥ 45 % | tenue |
| Capitales perdues par partie | 0,52 | 1,33 | ≥ 1 | tenue |
| Parties avec au moins une nation éliminée | 12 % | **26 %** (25 et 27) | ≥ 30 % | **non tenue** |
| Victoires de Valmorne | 8 % (6 % sur les graines `base`) | **11 %** (44/400) | 12 à 28 % | **non tenue** |
| Dernière conquête (médiane) | tour 64 | tour 74-75 | | |
| Parties avec une coalition | 0 | 46 % | | |
| Victoires Roc-Épine / Noireflamme / Oroël / Solmara | 12 / 38,5 / 21,5 / 20 % | 16 / 40 / 16,5 / 16,5 % | V15.3 | Noireflamme reste trop haut |
| Victoires Conquérant / Traître / Héros / Bâtisseur | 37,5 / 44 / 16,5 / 2 % | 30,5 / 31,5 / 31 / 7 % | V15.3 | |

Le bruit entre deux séries de 200 parties est réel : une autre série (`d1`) donnait 33 % d'élimination avec le même code. Les valeurs ci-dessus sont celles des graines finales, sans tri.

**Cause du retard de Valmorne, mesurée**
- Valmorne est la **seule nation dont la capitale n'est pas un point de port** ; toute son armée de départ y naît, à l'intérieur des terres, sans ennemi ni embarquement possible. Contre-épreuve (200 parties, seule l'armée de départ déplacée) : armée sur Branvale 25 victoires, armée sur Sylvaren 12, armée laissée à la capitale 10.
- **Correctif** : une IA fait marcher ses grosses garnisons de l'intérieur vers le point de port voisin, par un ordre ordinaire (`redeployInterior`). 85 % de l'armée, le reste garde la capitale. Essais écartés, mesures à l'appui : partager l'armée entre les deux ports (7,75 %), recruter sur la côte menacée (10,5 %, moins d'éliminations), reprendre d'abord ses terres (aucun effet).
- **Deuxième cause, géographique, non corrigée** : l'anneau de routes crée une chaîne de prédateurs. Noireflamme et Oroël se font face capitale contre capitale et se neutralisent ; Roc-Épine frappe Sylvaren depuis sa capitale (1re perte de Valmorne : Sylvaren, 66 % des parties, tour 14 en moyenne), alors que la proie de Valmorne, Nordhème, touche la capitale d'Oroël, dont l'armée reste chez elle. Changer cela demanderait de toucher à la carte ou au départ ; le bonus de nation de la V15.3 est l'endroit où le traiter, Noireflamme compris.

**Coalition** (`src/domain/engine/coalition.js`)
- Se forme à **7 provinces et 3 d'avance** sur la deuxième, à partir du tour 10 ; se dissout à **5 provinces ou moins**. Ne lit que ce qui est public (qui possède quoi). Aucun or ni troupe offerts, le joueur n'est jamais enrôlé.
- Caractères : Héros par principe, sauf allié ou charmé ; Conquérant sauf allié ; Traître quand un autre a commencé, même allié de la cible (il la trahit par son coup habituel) ; Bâtisseur si la cible tient 2 provinces de plus que le seuil ou s'il est déjà en guerre avec elle. Une trêve récente est respectée. Un membre à portée vise d'abord la cible et n'ouvre pas de nouvelle guerre contre un autre membre.
- **Limite** : l'anneau fait que deux nations sur quatre peuvent ne pas atteindre la cible ; elles sont membres sans pouvoir frapper et gardent leurs objectifs.
- À l'écran : fenêtre à la formation et à la dissolution, bandeau sur la carte (touchable, avec la règle), journal, répliques par `talk-compose` (3 listes, 18 répliques chacune), entrée d'aide. Aucune phrase ne dit quoi faire.

**IA plus ambitieuse**
- Capitale et nation à 3 provinces ou moins tentées d'abord, hors quota d'attaques pour le Conquérant et le Traître, qui refusent aussi la trêve à une nation qu'ils peuvent achever.
- Dès le tour 45, ces deux caractères visent le plus faible et le plus fort à leur portée, et dénoncent les trêves de plus de 10 tours (déclaration ordinaire, pas une trahison).
- Marge de débarquement sur une capitale déjà occupée ailleurs : 0,25 (0,35 sinon). Tard dans la partie, une côte invisible compte double (sauf nation à 2 provinces ou moins).
- Le Héros garde son caractère : sans agression de moins de 5 tours, il n'attaque plus, sauf pacte d'aide, coalition ou ennemi à bout de forces.
- « Pas suicidaire » reste vert et son seuil n'a pas bougé. **Un test avait été affaibli à tort** : l'assertion « la carte a bougé » (`tests/v9-map.test.js`) avait été remplacée au motif qu'une partie pouvait revenir à son point de départ au tour 200 ; ce n'est pas le cas (3 à 11 provinces déplacées sur ces 5 parties). L'assertion d'origine est restaurée en V15.2. **À surveiller** : le test « Conquérant > 2 × Héros » passe sur ses 12 graines, mais sur 20 autres graines le rapport n'est que de 147 / 120.

**Contrôle avec des joueurs scriptés** (`tools/joueurs-scriptes.mjs`, 100 parties, 20 par nation, mêmes ordres que le vrai joueur)
| | Prudent V15.0 | Prudent V15.1 | Dominant V15.0 | Dominant V15.1 | Dominant V15.1 sans coalition |
|---|---|---|---|---|---|
| Victoires | 0 | 0 | 21 | **24** | 21 |
| Éliminé | 0 | **0** | 11 | 6 | 6 |
| Rang moyen | 4,34 | 4,17 | 3,19 | 3,00 | 3,03 |
| Coalition contre lui | 0 | 0 | 0 | 15 parties, 34 tours en moyenne | 0 |

Le joueur dominant ainsi visé gagne **14 fois sur 15** : ni injouable, ni punition automatique. Ce script est sommaire : un vrai joueur peut réagir autrement, et la force ressentie de la coalition reste à juger en bêta. Le prudent ne gagne jamais, comme avant.

**Écran de fin et sauvegarde**
- `src/domain/story.js` + `src/presentation/end-view.js` : vrai caractère de chacun, petite courbe par nation à même échelle (nom, rang et chiffres écrits à côté : jamais la couleur seule), tournant, capitales prises, trahisons, grandes batailles, coalitions, éliminations. Quatre faits par rubrique, avec le nombre des autres.
- Rien n'est révélé pendant la partie : `buildEndStory` renvoie `null` tant que `gameOver` n'existe pas, et aucun texte de coalition ne cite un caractère.
- Schéma de sauvegarde **10**, migration testée depuis le schéma 9 (V14.4). Une ancienne partie affiche un écran propre, déclare l'histoire partielle et ne reprend que les faits encore lisibles dans ses événements.
- Taille de `state.story` : 950 octets en médiane, 1 286 au plus, sur 20 parties de 80 tours (0,3 % d'une sauvegarde de 321 Ko).

**Vérification et référence**
- Chrome mobile simulé (Playwright, 390 × 844) : partie réelle sur 6 tours ; écrans de fin victoire, fin de partie perdue, cinq capitales, élimination ; sauvegarde V14.4 en cours jouée jusqu'à la fin et V14.4 déjà finie ; coalition déclenchée sur sauvegarde préparée (fenêtre, bandeau, détail, journal, échanges). 0 erreur JavaScript, 0 débordement. Captures regardées : un chevauchement du bandeau avec les boutons, corrigé.
- Sur téléphone, à regarder : la longueur de l'écran de fin (il défile quand il y a beaucoup à raconter), et le rythme réel de la coalition.
- `tools/empreintes-v15.1.json` remplace `tools/empreintes-v14.4.json` : c'est la référence du gameplay V15.1 (`node tools/equilibre.mjs --empreintes --verifier=tools/empreintes-v15.1.json`).

### V15.2 — sons et animations (02/11/2026)

**Corrections héritées de la relecture V15.1**
- `tests/v9-map.test.js` : assertion « la carte a bougé » restaurée, justification corrigée ci-dessus.
- Coalition à 0 membre (constatée sur 291 tours pour 2 282 tours de coalition, 200 parties) : dissoute, raison `deserted`, texte propre au journal et dans la fenêtre. Elle peut se reformer : sur ces 200 parties, 24 dissolutions de ce type, 17 reformations contre la même nation, le plus souvent 10 tours plus tard (fin de la trêve récente), une seule au tour suivant. Une ancienne sauvegarde avec une coalition vide n'affiche plus de bandeau et se corrige au tour suivant.
- Hors quota d'attaques : le code est aligné sur le cahier, réservé au Conquérant et au Traître. Mesure sur 400 parties (`fin`, `fin2`), avant / après : élimination 25 et 27 % / 25 et 26 %, tous les autres chiffres identiques (tranche 100 %, capitales 1,335, victoires par nation et par caractère). Effet presque nul : ces deux caractères n'attaquent déjà presque pas au-delà de leur quota. La cible d'élimination (30 %) restait et reste non tenue.
- Un membre d'une coalition ne propose plus d'alliance à la cible, joueur ou IA. Une offre partie le tour de la formation est retirée avec son message, et `proposalsToAnswer` l'ignore.
- **Effet sur les parties** : `tools/empreintes-v15.2.json` remplace `tools/empreintes-v15.1.json` ; 9 entrées sur 81 changent. Contrôle joueurs scriptés (`--joueur`, graines `eq`, 100 parties), V15.1 et V15.2 identiques : dominant 18 victoires, 9 éliminations ; prudent 0 victoire, 1 élimination au tour 74. Ces graines diffèrent de celles du tableau V15.1, d'où des chiffres différents de ce tableau.

**Animations** (`src/presentation/turn-animation.js`, plan pur ; `src/presentation/ui/turn-anim.js`, affichage)
- Trajets (troupes du joueur, attaques terrestres, convois), puis combats et conquêtes l'un après l'autre, avec une courte légende. Le joueur passe d'abord. Au plus 6 trajets et 8 effets.
- **Durée totale maximale : 2,4 secondes** (`MAX_ANIMATION_MS`), une seule minuterie. Un toucher la termine aussitôt et ne relance rien. Passer en arrière-plan la termine aussi. Rien n'attend `requestAnimationFrame`.
- Le toucher agit au clic, à la fin du geste : il ne peut pas atteindre la fenêtre suivante. Le retour Android passe l'animation. Le calque couvre tout l'écran : pas de second « Fin du tour » pendant l'animation.
- Si un événement sort du cadrage, la carte entière s'affiche le temps de l'animation, puis le cadrage du joueur revient.
- Brouillard : seuls les événements que le journal peut citer sont montrés ; l'origine d'une attaque étrangère n'est dessinée que si elle se voit. Un débarquement n'a pas de trajet, seulement son combat ; les convois avancent d'étape en étape.
- `prefers-reduced-motion` : aucun calque, aucun mouvement ; le son principal reste, le journal s'ouvre tout de suite.
- **Pas d'animation dans le tutoriel ni le mini tuto** : leurs bulles suivent les gestes du joueur.

**Sons** (`src/presentation/sound-engine.js`, `src/presentation/ui/audio.js`)
- Synthèse Web Audio, sans fichier ni dépendance : bouton, ordre donné, fin de tour, bataille, conquête, trahison, victoire, défaite. Un son par sorte à chaque animation.
- « Mélodie calme » : une vraie mélodie lente, en boucle, à la place de l'ancien accord tenu. **Changement visible** : l'ancien code ne la lançait que si l'on touchait au réglage ; activée par défaut, elle joue maintenant dès le premier geste. Réglages « Effets sonores » et « Mélodie calme » respectés.
- Le contexte audio ne naît qu'au premier geste. Web Audio absent, cassé, suspendu ou `resume()` refusé : aucune erreur, et un son demandé pendant une suspension est abandonné, pas empilé.
- Arrière-plan (`visibilitychange`, `pagehide`, `freeze`) : mélodie arrêtée, contexte suspendu, reprise au retour. Silence aussi le temps d'une pub (ajout non demandé). Aucune pub ajoutée.

**Vérification**
- `npm test` vert. `src/domain/` ne contient que les corrections ci-dessus : aucune animation ni aucun son n'y entre, et `--empreintes --verifier=tools/empreintes-v15.2.json` reste identique après le travail d'interface.
- Chrome mobile simulé (Playwright, 390 × 844 tactile) : partie réelle sur plusieurs dizaines de tours ; animation à son terme (2,4 s au plus, mesure comprise) ; passée au toucher (fenêtre suivante restée ouverte) ; arrière-plan simulé ; retour ; `reducedMotion: 'reduce'` ; son coupé (0 oscillateur) ; Web Audio absent ou cassé ; écrans de fin ; élimination ; sauvegardes anciennes reprises ; tutoriel. 0 erreur JavaScript, 0 débordement. Captures regardées.
- **Non vérifié** : le rendu d'un vrai haut-parleur (la simulation compte les notes, elle ne les entend pas) ; la coupure du son sur une vraie appli Android, simulée ici par `visibilitychange` ; la fluidité sur un téléphone moyen.

### V15.3 — difficulté, nations, Bâtisseur (02/11/2026)

**Bilan franc** : au niveau Normal, sur 11 cibles, **8 tenues, 3 non tenues** : Noireflamme 31 % (40,5 avant, cible 28), Valmorne 11 % (8,75 avant, cible 12), élimination **22 %** (24,5 avant, cible 30 : elle recule). Je m'arrête à ce réglage : les valeurs qui auraient pu tenir ces trois chiffres déforment le jeu ou se contredisent (ci-dessous).

Mesure : `node tools/equilibre.mjs 200 80 v153a` puis `v153b`, 400 parties, graines choisies avant de lancer le code final et regardées une seule fois, aucun réglage de moteur après. « Avant » : le code de `main` (a31f00e) sur les mêmes graines.

| Cible | Avant | Après | |
|---|---|---|---|
| Valmorne 12-28 % | 8,75 % | **11 %** (8,5 et 13,5 selon la série) | **non tenue** |
| Roc-Épine 12-28 % | 17,25 % | 16,75 % | tenue |
| Noireflamme 12-28 % | 40,5 % | **31 %** (33,5 et 28,5) | **non tenue** |
| Oroël 12-28 % | 17,75 % | 17 % | tenue |
| Solmara 12-28 % | 15,75 % | 24,25 % | tenue |
| Bâtisseur ≥ 10 % | 5,25 % | **12,75 %** | tenue |
| Aucun caractère > 40 % | Traître 35,25 % | Conquérant 31,5, Héros 30,25, Traître 25,5, Bâtisseur 12,75 % | tenue |
| Nation éliminée ≥ 30 % | 24,5 % (28 et 21) | **22 %** (22 et 22) | **non tenue** |
| Tranche 61-80 ≥ 45 % de 1-20 | 93 % | 91 % (95 et 88) | tenue |
| Capitales perdues ≥ 1 par partie | 1,48 | 1,48 (1,55 et 1,40) | tenue |
| Test « pas suicidaire » | vert | vert, inchangé | tenue |

Bruit : une série de 200 parties bouge de ±3 points pour une nation à 30 %. Pendant les réglages (autres graines : `tn`, `tm`, `tp`, `tq`), le même code ou presque donnait Noireflamme de 25 à 36 %, Valmorne de 10 à 12,7 %.

**Cause du déséquilibre, mesurée** : une chaîne de prédateurs, née du choix de la base navale. Chaque IA rassemblait son armée sur le point de port en face de la côte la plus faible. Garnison moyenne au tour 40 : Valmorne p03 5 661, Roc-Épine p05 4 969, Noireflamme p11 5 201, Oroël p14 4 724, Solmara p17 4 925 ; en face, p02 1 210, p07 1 202, p19 1 073. Noireflamme frappe Solmara à son point faible, Solmara frappe Roc-Épine, Roc-Épine frappe Valmorne, Oroël et Valmorne se neutralisent, et **personne ne vise Noireflamme** : sa province p11 n'a changé de main que 20 fois sur 100 parties, p20 (Solmara) 328 fois.
- **Essais sans effet sur Noireflamme** (150 à 300 parties chacun) : bonus de 8 à 20 % sur les voisines, fort de départ, +40 d'or au départ, troupes de départ, défense du sol +20 %, seuils de coalition abaissés (6/2, 5/2), recrutement sur la côte menacée, viser le chef de file plus tôt, marges de capitale réduites, changement de front, siège d'une nation réduite.
- **Ce qui agit** : garder la base à la capitale. Pour tous les caractères : Noireflamme 4 %, Solmara 45 %, élimination 6 % : le prédateur change de nom et le monde s'endort. **Retenu** : le Bâtisseur et le Traître la gardent à leur capitale (`RULES.ai.baseAtCapital`), le Héros et le Conquérant choisissent la côte faible. Le premier protège, le second attend son heure : c'est cohérent avec leur caractère. Écartés : Conquérant à 30 % (meilleur pour Noireflamme, mais le test « Conquérant > 2 × Héros » tombait, et je ne l'ai pas touché) ; Héros en plus (élimination 12,7 à 17 %).
- **Les trois chiffres manqués se contredisent** : Valmorne est presque toujours la nation éliminée, donc la protéger baisse l'élimination, et affaiblir Noireflamme fait monter Solmara, qui écrase Roc-Épine, qui écrase Valmorne. Baser le Bâtisseur et le Traître à la capitale a coûté environ 8 points d'élimination pour 15 de gagnés sur Noireflamme (graines `tn`, 150 parties) : c'est un choix, à valider par Jack. Sortir de cette contradiction demanderait la carte ou des bonus hors de proportion.

**Niveaux** (`src/domain/difficulty.js`, `state.difficulty`, Normal présélectionné, schéma de sauvegarde **11** : anciennes parties en Normal, migration testée)
- **Facile** : marge d'attaque +0,3, une seule attaque terrestre par tour, Conquérant retardé de 8 tours, pas d'acharnement ni de visée du plus fort.
- **Normal** : aucun réglage ; même partie à l'octet près que sans niveau.
- **Difficile** : marge −0,05, jusqu'à 2 blindés de plus par tour, et **+15 % d'or pour les IA**. Sans cet or, Difficile ne se distinguait pas de Normal (dominant 13 victoires et 5 éliminations contre 13 et 6, sur 100 parties). Annoncé au choix du niveau, à l'entrée en partie, au journal du tour 1, dans l'aide et sur l'écran de fin.
- **Jetons et atouts** : identiques à tous les niveaux ; aucun niveau n'en rapporte plus. Le bonus d'or des IA ne passe pas par les atouts. Le jeu le dit au choix du niveau. Ni achat ni monétisation modifiés.

| Joueur scripté (`--joueur=… --difficulte=… 200 80 v153ctl`, 200 parties) | Facile | Normal | Difficile |
|---|---|---|---|
| Dominant : victoires | 37 | 24 | 14 |
| Dominant : éliminations | 13 | 16 | 16 |
| Prudent : victoires | 0 | 0 | 0 |
| Prudent : éliminations | 2 | 0 | 5 |

Victoires : bon sens net. Éliminations : Difficile ne dépasse pas Normal pour le dominant (16 et 16), et le prudent, trop rarement éliminé pour conclure, fait 2 / 0 / 5. Ces scripts sont sommaires : la difficulté ressentie reste à juger en bêta.

**Bonus de nation** (`RULES.nationBonus`, `src/domain/nations.js`, mêmes mécaniques que les atouts : ils s'ajoutent à eux ; un par nation ; aussi pour les IA ; pas dans le tutoriel, dont les chiffres sont écrits à la main) : Valmorne, Levées des bois, +15 % d'infanterie recrutée ; Roc-Épine, Murs de pierre, forteresses 15 % plus solides ; Noireflamme, Forges noires, chantiers 10 % plus rapides ; Oroël, Marins du Nord, navires de guerre 10 % plus puissants ; Solmara, Comptoirs du Sud, +4 % d'or. Visibles au choix de la nation et dans l'aide. Effet sur les victoires faible, mesuré : ±3 points, dans le bruit ; ils donnent une couleur, ils n'équilibrent pas. **Une partie en cours les reçoit à la reprise**, sans message : choix assumé, ils sont modestes.

**Bâtisseur** : passé le tour 45 (`builderLateTurn`), s'il pèse au moins autant que le plus faible de ceux qu'il atteint, il fait la guerre comme un Conquérant et change son trésor en blindés (3 par tour). Saigné, il reste prudent. Sa description change en conséquence. 5,25 → 12,75 % de victoires.

**Corrections héritées**
- **Mélodie à l'accueil** : `showWelcome` remet la musique en accord aussitôt ; le retour Android, sans geste, ne laisse plus aucune note (Chrome simulé : 0 note en 6 s). Elle reprend aussi en revenant en partie.
- **Deuxième toucher** : le bug **existait**. Non vérifié en V15.2, reproduit ici : un toucher juste après la fin de l'animation fermait le journal 6 fois sur 6, au toucher de passage comme à la fin naturelle. Corrigé : les clics sont ignorés 400 ms à la fin de l'animation, et jusqu'à ce que le doigt se lève (`guardTouches`). Après : 0 sur 6 dans les deux cas.

**Tests modifiés** (valeurs, jamais de seuil) : numéro de schéma 10 → 11 ; `version` 15.3.0 (2) ; recrues de Valmorne +15 % (4 tests, atout toujours vérifié par-dessus) ; forteresse niveau 3 de Roc-Épine affichée −39 % ; test « une IA n'a pas d'atout de chantier » passé sur Oroël, Noireflamme ayant son bonus. « Pas suicidaire » et « Conquérant > 2 × Héros » n'ont pas bougé.

**Empreintes** : `tools/empreintes-v15.3.json` est la référence ; 81 parties sur 81 changent, carte et API identiques. Pourquoi : `state.difficulty` et le schéma 11 entrent dans l'état complet de toutes les parties, tutoriel compris ; `RULES` a de nouvelles valeurs ; bonus de nation, base navale et Bâtisseur changent les parties elles-mêmes. `tools/empreintes-v15.2.json` ne vaut plus que pour le code V15.2.

**Vérification** : `npm test` vert. Chrome mobile simulé (Playwright, 390 × 844 tactile), voir le compte rendu pour le commit : nouvelle partie à chaque niveau, 6 tours chacune ; Normal présélectionné ; 5 bonus lisibles (captures regardées) ; annonce du bonus d'or au journal et à la fin ; tutoriel qui démarre ; sauvegardes schémas 8, 9 et 10 reprises en Normal ; écrans de fin. 0 erreur JavaScript, 0 débordement.
- **Non vérifié** : le ressenti des trois niveaux par un vrai joueur ; un vrai téléphone ; le test « toucher » reproduit des touchers simulés, pas un vrai doigt ; la relecture par un sous-agent indépendant et les workflows GitHub, restent à faire avant fusion.

### V15.4 — mode 40 tours, palmarès, titres (02/11/2026)

**Mode court** (`src/domain/game-length.js`) : choix « 80 tours » / « Courte · 40 tours » à côté du niveau, 80 présélectionné. `state.gameLength` n'est écrite que pour une partie courte ; absente, la partie dure 80 tours. Suivent la longueur : fin de partie, alerte des 5 derniers tours (tour 36 à 40), affichage du tour, aide, annonces des dirigeants (`left` de `talk-compose.js`, qui avait 80 en dur). Seuils ramenés à la moitié par `scaleTurn` : relance de la guerre 45 → 23, réveil du Bâtisseur 45 → 23, coalition dès le tour 10 → 5, cour du Traître 10 → 5, alliance du Bâtisseur 6 → 3, Bâtisseur reconnu (tour 20 et 8 chantiers → 10 et 4). Conservés tels quels car ce sont des durées de règle, pas des étapes de partie : trêve de 10 tours, refus oubliés après 20 tours, délais de frappe du Traître, recrutement et traversées. L'histoire de la partie n'a pas de tranche fixe : courbes et tournant se règlent sur les mesures réelles. Tutoriel inchangé (80 tours, pas de longueur). Pub de début de partie : même appel, aucune condition sur la durée.

**Écart assumé sur le schéma** : le schéma monte à **12 pour les seules parties courtes** ; une partie de 80 tours reste au schéma 11 (`saveSchemaOf`). Raison précise : `schemaVersion` entre dans l'état complet que hachent les empreintes ; le monter partout change `etat` et `chaine` des 81 parties sans changer une seule décision, et la vérification demandée tombe. Écrit ainsi, l'ancien code refuse bien une partie courte (`unsupported_save_schema:12`) au lieu de la jouer en 80, et une partie de 80 tours reste lisible partout. Longueur illisible : retour à 80 tours, schéma 11.

**Preuve du mode 80** : `node tools/equilibre.mjs --empreintes --verifier=tools/empreintes-v15.3.json` passe sans modifier ce fichier : 81 parties strictement identiques, `RULES`, carte et API comprises. `RULES` n'a donc rien reçu : les réglages sont dans le nouveau module. Empreintes courtes : `--empreintes --longueur=40 --graines=4 --verifier=tools/empreintes-v15.4-40-tours.json` (35 parties).

**Mesures en 40 tours** (`node tools/equilibre.mjs 200 40 c40a --longueur=40` puis `c40b`, 400 parties, IA contre IA, Normal, graines fixées avant de regarder, aucun réglage après). « Coupée » : parties de 80 tours arrêtées au tour 40, mêmes graines `c40a`, 200 parties, soit le mode sans aucun seuil ajusté.

| Mesure | c40a | c40b | Total | Coupée (c40a) |
|---|---|---|---|---|
| Vainqueur net (seul en tête en provinces, ou 5 capitales) | 146 / 200 | 140 / 200 | 286 / 400, **71,5 %** | 154 / 200 |
| Capitales perdues par partie | 0,67 | 0,59 | **0,63** | 0,66 |
| Parties avec une nation éliminée | 4 % | 5 % | **4,5 %** | 6 % |
| Parties avec coalition | 17 % | 21 % | **19 %** | 17 % |
| Victoires par les 5 capitales | 0 | 0 | **0** | 0 |
| Conquêtes, tours 1-10 / 11-20 / 21-30 / 31-40 | 601 / 502 / 585 / 520 | 562 / 493 / 595 / 509 | **1163 / 995 / 1180 / 1029** | 1-20 : 1124, 21-40 : 1025 |
| Dernière conquête (médiane) | tour 36 | tour 37 | | tour 35 |
| Vainqueur / 2e (provinces, médiane) | 5 / 4 | 5 / 4 | | 5 / 4 |

| Victoires | Valmorne | Roc-Épine | Noireflamme | Oroël | Solmara | Conquérant | Traître | Héros | Bâtisseur |
|---|---|---|---|---|---|---|---|---|---|
| Total sur 400 | 39 (**9,75 %**) | 101 (25,25 %) | 109 (27,25 %) | 37 (**9,25 %**) | 114 (28,5 %) | 149 (37,25 %) | 99 (24,75 %) | 103 (25,75 %) | 49 (12,25 %) |
| Coupée sur 200 | 12 (6 %) | 54 (27 %) | 49 (24,5 %) | 18 (9 %) | 67 (33,5 %) | 83 (41,5 %) | 58 (29 %) | 45 (22,5 %) | 14 (7 %) |

- **Lecture franche** : la carte ne fige pas (dernière tranche à 88 % de la première) et la coalition agit dans 19 % des parties : le cas prévu pour ajuster n'est pas atteint, **aucun seuil de coalition ni de carte n'a été touché après mesure**. Les seuils ajustés aident surtout le Bâtisseur (7 → 12 %).
- **Faiblesses réelles, non corrigées** : Valmorne et Oroël sous 10 % ; une partie sur 3,5 finit à égalité de provinces en tête, départagée aux capitales puis au trésor ; élimination rare (4,5 %) et aucune victoire par les capitales : 40 tours laissent peu de temps pour achever une nation. C'est la nature d'une partie plus courte plus qu'un défaut, à juger en bêta. Les cibles de V15.1 et V15.3 n'ont pas été écrites pour ce mode.
- **Contrôle joueur scripté** (`--joueur=… 200 40 c40ctl --longueur=40`) : dominant 32 victoires, 1 élimination, coalition contre lui dans 7 parties ; prudent 0 victoire, 0 élimination, rang moyen 4,49. Le scripté dominant gagne 0 fois sur 40 avec Valmorne, 16 sur 40 avec Noireflamme.

**Palmarès** (`src/domain/palmares.js`, `profile.palmares`, écran depuis l'accueil, `src/presentation/palmares-view.js`) : parties terminées, victoires, par nation et par niveau, meilleur classement, plus rapide victoire. Une partie est reconnue par sa graine, déjà unique et déjà sauvegardée, ce qui n'ajoute rien à l'état ; le comptage se fait à l'écran de fin, seul passage obligé, et la mémoire garde 200 identifiants. Sans graine utilisable : **jamais comptée**. Une ancienne partie finie avec une graine est comptée une fois à sa première réouverture : c'est une vraie partie. Tutoriel jamais compté. La plus rapide victoire ne distingue pas les modes : une victoire au tour 40 d'une partie courte bat tout ce qui finit plus tard en 80. Rien n'en sort dans la sauvegarde (testé). Importer un ancien profil remplace aussi le palmarès, comme le reste du profil.

**Titres** (11, cachés jusqu'à l'obtention, seul leur nombre restant est affiché, rien dans le moteur) : Première page, Première couronne, Longue marche, Vif comme l'éclair, Maître d'Arken, Cinq bannières, Contre vents et marées, Seul contre tous, Retour de loin, Cendres, Chroniqueur. Affichés aussi sur l'écran de fin de la partie qui les donne. Un test interdit tout vocabulaire d'avantage, de pub ou d'achat.

**Tests modifiés** (valeurs, aucun seuil) : `version` 15.4.0 (2) ; schéma inconnu 12 → 13 dans `save-codec` ; `Math.min(state.turn,RULES.gameLength)` → `gameLengthOf(state)` dans `v14-4-bombardement`. Ajout : `tests/v15-4.test.js`, 23 tests.

**Remarque hors périmètre, non corrigée** : le tournant de l'écran de fin peut écrire « perd 1 provinces » (`story.js`, déjà en V15.3).

**Vérification** : `npm test` vert, 607 tests. Chrome mobile simulé (Playwright, 390 × 844 tactile), sur le commit donné dans le compte rendu : partie courte choisie à l'écran, 6 vrais tours, reprise au tour 35 et 40 par sauvegarde préparée, alerte, écran de fin au tour 40, palmarès à 1, non doublé après rechargement ni écran rouvert, titres visibles (captures regardées) ; 80 tours affichés comme tels, sans fin au tour 41, sauvegarde en schéma 11 ; sauvegarde schéma 10 reprise ; partie finie sans graine non comptée ; profil sans palmarès, jetons gardés ; tutoriel qui démarre, non compté. 0 erreur JavaScript, 0 débordement.
- **Non vérifié** : une partie courte réellement jouée à la main du tour 8 au tour 34 ; un vrai téléphone ; le ressenti du mode ; la vraie pub (simulée) ; la relecture par un sous-agent indépendant et les workflows GitHub, restent à faire avant fusion.

### V15.5 — préparation de la fiche Play (04/11/2026)

Hors liste des 7 ajouts : corrections demandées par Jack (« avancer tout ce qui est avançable »), sans changement de règle du jeu.
- Accords corrigés : « 1 province » sur l'écran de fin et la coalition, « 1 navire » sur les écrans de province et de vision.
- Fiches française et anglaise à jour (40 ou 80 tours, difficulté, bonus de nation, palmarès, titres).
- `store/icone-512.png` et `store/banniere-1024x500.png` ajoutées, captures d'accueil et de nouvelle partie refaites.
- Le build Google Play n'affiche plus « VERSION BÊTA » sur l'accueil ; la PWA et l'APK de bêta le gardent.
- Rentabilité et `docs/SORTIE-ARKEN.md` mises à jour avec l'état réel.

### V15.5.1 — relecture indépendante de V15.1 à V15.5 (06/11/2026)

Relecture du diff depuis la fusion V15.0 (`5a7afe7`) jusqu'à `0e27272` par un sous-agent indépendant. Verdict : **rien de bloquant**.
Vérifié par lui : `npm test` 611/611 ; empreintes `tools/empreintes-v15.3.json` identiques (81 parties) ; partie scriptée de 40 puis 80 tours en Difficile avec sauvegarde et rechargement à chaque tour (schémas 12 et 11, palmarès compté une seule fois) ; moteur sans `Math.random`, `Date` ni DOM ; migrations ; aucune pub nouvelle, ni pendant l'animation ni dans le tutoriel ; ASSETS de `sw.js` complet ; aucun test affaibli.
Corrigé :
- **Palmarès recompté après import d'un profil** : importer un profil remplaçait la liste des parties déjà comptées ; rouvrir ensuite une partie finie sauvegardée la comptait une seconde fois. Reproduit dans Chrome mobile simulé (4 parties → 5). Correction : `markGameCounted` (`src/domain/palmares.js`), appelée à l'import avec la partie en mémoire ou, depuis l'accueil, la sauvegarde. Après correction, même parcours : 4 → 4. Tests dans `tests/v15-5.test.js`.
- Libellé du test de version corrigé (`tests/v14-3-tutoriel.test.js`).
Doutes signalés, non corrigés faute de preuve : légende « Vous prenez X » lors d'un assaut commun avec un allié ; visibilité de l'origine d'une attaque étrangère calculée après le tour ; une partie de 40 tours ouverte par une version antérieure à la V15.4 est refusée proprement, mais « Nouvelle partie » l'écrase (ancien AAB ou ancien cache seulement).
- **Vérification** : `npm test` 613/613 ; Chrome mobile simulé (390 × 844 tactile) : accueil, Atouts, Restaurer, puis « Continuer la partie » sur la partie finie, aucune erreur console, pas de débordement horizontal.
