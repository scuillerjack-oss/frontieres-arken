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
