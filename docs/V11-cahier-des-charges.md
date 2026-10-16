# FRONTIÈRES: ARKEN — V11 — Cahier des charges

> Personnalités des dirigeants. Part de la V10 livrée et validée par Jack. Une bêta jouable à la fin.

## 1. Principe
- Les 4 nations non jouées sont dirigées par des **modèles pré-créés**, avec des comportements écrits à l'avance.
- **Aucun LLM, aucun serveur** : tout tourne sur le téléphone, hors ligne, gratuitement.
- Le joueur choisit toujours sa nation au début de la partie.

## 2. Personnalités (archétypes)
- **Le Héros** : défend les nations attaquées, punit les agresseurs, tient ses alliances.
- **Le Conquérant** : veut dominer le monde, attaque le plus faible, méprise les traités.
- **Le Traître** : propose des alliances, endort la méfiance, puis attaque dans le dos au moment opportun.
- **Le Bâtisseur** (4e, à valider par Jack) : prudent, développe son économie, ne se bat que s'il est menacé.

## 3. Mélange caché
À chaque nouvelle partie, les personnalités sont **redistribuées au hasard entre les nations et cachées au joueur**.
Il découvre qui est le traître à son comportement, ce qui donne envie de rejouer.

## 4. Diplomatie
- Arbre de choix pré-écrit avec des **conséquences pré-écrites** : propositions, menaces, alliances, trahisons.
- Les répliques diplomatiques varient selon la personnalité (textes écrits à l'avance).
- Chaque personnalité réagit différemment aux mêmes actions du joueur, et garde la mémoire de ses relations.

## 5. Échanges entre dirigeants et tension (retours bêta V9, points 17 et 18)
- Fil d'échanges public et sobre entre dirigeants : le joueur n'écrit pas, il choisit un ton parmi 3
  (hostile, neutre, amical) pour lancer ou répondre ; les dirigeants IA s'expriment selon leur personnalité.
- **Curseur de tension** par nation : les échanges hostiles le font monter et augmentent le risque de guerre ;
  le Conquérant peut attaquer sans attendre la tension.

## 6. Tests et livraison
- Tests par personnalité : chacune se comporte conformément à son archétype sur des scénarios fixés.
- Simulations IA contre IA : aucune personnalité ne gagne systématiquement ; le traître trahit bien.
- Même critère bloquant de livraison : bêta réellement jouable sur le téléphone de Jack.

## Hors périmètre
Modèle économique et Google Play (V12).

## Réalisé (moteur, 16/10/2026 — version 11.0.0)
- **Personnalités** (`src/domain/leaders.js`) : 4 archétypes redistribués à chaque partie selon la graine (unique côté
  app), cachés. Héros : fidèle, punit les agresseurs, défend. Conquérant : choisit dès le tour 2-4 la proie la plus
  faible qu'il peut atteindre, épargne pour une flotte de 3 navires, débarque, ignore la tension, rompt les trêves
  après 5 tours. Traître : choisit une cible, lui propose l'alliance, puis la frappe au moment opportun (tour 9-14
  ou plus tôt si elle est déjà en guerre) → TRAHISON publique et révélation. Bâtisseur : banques, forts, ne se bat
  que menacé et demande vite la paix. Les anciens traits restent dérivés (`ai.traits`) pour la compatibilité.
- **IA plus vive** (problème de la bêta V10) : les nations belliqueuses épargnent pour une flotte au lieu de tout
  dépenser en infanterie. Simulation, 5 parties IA × 60 tours : **1er combat au tour 9 en moyenne** (V10 : ~47),
  presque toujours par mer ; avec un joueur passif, 1er combat entre les tours 8 et 11 sur 12 parties.
- **Diplomatie IA réelle (B9)** : alliances acceptées/refusées selon la personnalité et la tension (le Traître
  accepte tout), cessez-le-feu proposés et acceptés selon la personnalité ; propositions des IA au joueur via les
  échanges (amical = accepter).
- **Tension** 0..100 symétrique, seuils calme / tendu / hostile / au bord de la guerre (détails dans le contrat).
- **Échanges** (`src/domain/talk.js`) : 3 tons, textes pré-écrits en français par situation (guerre, après une
  attaque, agresseur, allié, trêve, voisin, réponse) ; les IA répondent et parlent selon leur personnalité (3 messages
  par tour au plus).
- **Journal** : ÉCHANGE, TRAHISON, RÉVÉLATION, TENSION. **Sauvegarde** : schéma 8, migration depuis 7 (V10).
- **Tests** : 190 au vert, dont `tests/v11-personnalites.test.js` (21 tests). Simulation de référence : trahisons
  dans les 5 parties, vainqueurs Traître, Conquérant, Héros, Traître, Héros.
- **Navigateur** : Pixel 7 simulé, 16 tours, réponse amicale publiée au tour suivant, aucune erreur console ni 404.
- **Points ouverts** : équilibrage à valider sur le téléphone de Jack (le Conquérant peut éliminer une nation avant
  le tour 60) ; indiquer dans l'interface qu'un message amical en réponse à une proposition vaut acceptation.
