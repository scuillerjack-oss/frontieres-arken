# V17 — ce qui a réellement été fait

## V17.6 — carte (réalisé)

Spécification : ligne V17.6 de `docs/V17-plan-temps-reel.md` (captures AM 3 / MA 3 de Jack du 19/11, sans rien copier).
Branche `mission/V17.6`. Moteur (`src/domain/`) et logique des tours **non touchés**.

### Fait
- **Défilement horizontal sans fin** (portrait et paysage). Tout le dessin de la carte va dans `<g id="mapWorld">` ;
  des copies `<use>` le répètent à gauche et à droite (2 de chaque côté sur un téléphone couché, 1 en portrait :
  `wrapCopyCount`). Le SVG fait (2 × copies + 1) cartes de large, centré sur la carte d'origine : les calculs d'avant
  (zoom, centrage, vue de lancement, animation de tour, tutoriel) ne changent pas. La translation horizontale est ramenée
  modulo la largeur d'une copie (`wrapX`), invisible puisque les copies sont identiques ; le vertical reste borné.
  Les bords de l'image sont fondus vers un même bleu : la jointure entre deux copies ne se voit pas.
- **Toucher une copie** : la carte est décalée d'un nombre entier de copies pour amener l'origine sous le doigt, puis le
  toucher est rejoué sur l'élément d'origine (province, convoi, ballon, flèche d'ordre). Vérifié : p01 touchée sur la
  copie +1 en portrait, p14 sur la copie −1 en paysage → fiche ouverte sur la bonne province.
- **Vue de lancement** : la capitale est maintenant toujours centrée horizontalement (plus de bord) ; seul le vertical
  décide du zoom.
- **Plein écran en paysage** (`paysage.css`) : carte sur tout l'écran ; en haut à gauche la barre d'infos (accueil,
  tour, trésor, armée) ; en haut au centre le bandeau du tour en direct (message d'événement, ⏸ / ▶) ; à droite une
  bande de boutons ronds (? et ⚙ en haut ; Journal, Échanges, Fin du tour / Passer en bas) ; à gauche Atouts,
  coalition, zoom, « Voir toute la carte ». Fiche de province en panneau latéral à droite, par-dessus la carte, sans
  couvrir la bande de boutons ; fiche ouverte, le bandeau du tour passe sous la barre d'infos. Portrait : mise en page
  d'avant, carte qui boucle ; fiche ouverte, « Voir toute la carte » remonte sous le zoom (elle était cachée par la fiche).
- **Lisibilité façon AM 3** :
  - teinte du propriétaire plus franche (opacité 0,44, 0,52 chez soi) par-dessus le relief ;
  - **grands noms de nations** en lettres espacées en travers de leur île (une étiquette par groupe de provinces d'un
    même propriétaire sur une île, qui suit les conquêtes ; taille dans le repère de la carte, donc qui suit le zoom),
    nets vue du monde, estompés en zoomant ;
  - **pastille sombre du nombre de troupes** au-dessus de chaque ville : vert = soi, bleu = allié, rouge = autre nation,
    gris = garnison neutre ; nombre exact chez soi, chez les alliés et chez l'ennemi visible (`provinceIntel` /
    `perceivedForce` / `visibleProvinces` de `src/domain/vision.js`, lus sans modification ; renforts stationnés
    compris), « ? » en pointillés sinon (hors de vue, forteresse ennemie) ;
  - **drapeau-emblème** aux couleurs de la nation sur chaque capitale (à côté de l'étoile) ;
  - frontière épaisse de son territoire (liseré bleu existant, inchangé) ;
  - **niveaux de détail** (pixels d'écran par unité de carte) : monde (< 0,42) = noms de nations, pastilles, capitales,
    sans noms de provinces, bâtiments ni points d'embarquement ; région = + noms et bâtiments ; province (≥ 1) = tout,
    noms de nations très estompés. La classe est posée sur `#mapWorld` pour que les copies suivent.
- **Performance** : pendant un geste, seule la transformation CSS du SVG change ; `--ui` / `--line` et le niveau de
  détail ne sont mis à jour qu'en fin de geste ou de zoom, et la classe de détail seulement quand elle change.
  Les copies sont des `<use>` (pas de double du DOM).
- Nouveau module pur : `src/presentation/map-am3-view.js` (bouclage, copies, niveaux de détail, pastilles, noms de
  nations) ; ajouté à `sw.js` et listé dans `tests/helpers/sources.js` (`PRESENTATION_MODULES_V17_6`).
- Tests : `tests/v17-6.test.js` (13 tests). `tests/v16-3.test.js` : l'assertion du gabarit paysage (colonne de droite)
  est remplacée par celle du plein écran (seul test existant modifié). `npm test` : 705 / 705.

### Captures vérifiées (Playwright, Chrome mobile simulé, tactile)
- 844 × 390, 390 × 844 et 667 × 375 (`/home/claude/pw/v176.mjs`) : lancement, zoom min, glisser loin à gauche
  (6 × 60 % d'écran) puis à droite (12 ×) — la translation reste dans ± une demi-copie, aucun à-coup visible ; zoom max ;
  toucher sur une copie ; pastilles (218 / 40 en vert chez soi, « ? » rouges, « 1k » gris sur l'île mystérieuse) ;
  5 noms de nations, 5 drapeaux ; fiche, journal, réglages. 0 erreur JS, pas de débordement, aucun bouton hors écran
  ni recouvert.
- Parcours V16.4 (`v164.mjs`, tour en direct, pause, Passer, classique, rechargement) en 844 × 390 et 390 × 844 :
  0 erreur, aucun problème signalé.

### Limites / non fait
- Pas de date ni de ▶ ⏸ ⏩ en bas à droite : ils dépendent du moteur temps réel (V17.1+). Le bandeau du tour en direct
  tient lieu de message d'événement en haut au centre.
- Pastille rouge pour toute nation non alliée, même sans guerre (consigne : rouge = ennemi).
- Les copies `<use>` ne reçoivent pas le focus clavier ; l'anneau « en direct » qui entoure une province n'est dessiné
  que sur la carte d'origine.
- Sous 340 px de haut en paysage, la puce de coalition (rare) peut toucher la colonne de zoom quand la fiche est ouverte
  en direct.
- `package.json` non monté (versions V17 menées en parallèle sur la branche longue : à faire à l'intégration).
- Non vérifié sur un vrai téléphone (rendu GPU des copies, fluidité réelle).
