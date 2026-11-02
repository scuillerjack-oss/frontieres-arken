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
