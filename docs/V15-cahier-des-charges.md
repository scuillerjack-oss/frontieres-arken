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
- « Pas suicidaire » reste vert et son seuil n'a pas bougé. **Un test modifié** : « la carte a bougé » regardait l'état au tour 200, où une partie peut être revenue à son point de départ ; il regarde désormais toutes les conquêtes. **À surveiller** : le test « Conquérant > 2 × Héros » passe sur ses 12 graines, mais sur 20 autres graines le rapport n'est que de 147 / 120.

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
