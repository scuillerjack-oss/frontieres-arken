# FRONTIÈRES: ARKEN — V10 — Marine

> **V13 : embarquement, débarquement et routes remplacés par l'anneau de 5 routes et les points de port — voir
> `V13-marine.md`.** Le reste (durée, convois, interception, escorte, combat de débarquement) reste valable.

> Refonte de la marine demandée par la bêta V9 (points 14 à 16 de `BETA-V9-retours-Jack.md`).
> Code : `src/domain/game-engine.js` (convois), `src/domain/combat.js` (combats naval et débarquement),
> valeurs dans `RULES` (`src/domain/constants.js`). Tests : `tests/marine-v10.test.js`.

## Règles
- **Embarquement** : uniquement depuis une province qui possède un **port construit**. Aucun port n'est nécessaire en face.
- **Destinations** : depuis un port, chaque route maritime mène à la province au bout de la route **et** à ses voisines
  côtières de la même île.
- **Durée** : `max(2, ⌈longueur de la route / 150⌉)` tours. Deux îles proches : 2 tours. Routes longues : une étape
  en mer par tour, visibles sur la carte.
- **Convois** : les troupes en mer forment un convoi visible (⛵ + tours restants). Les convois ne combattent pas.
- **Navires de guerre** : seuls à tirer en mer ; ils ne se déplacent que par mer et escortent les convois.
- **Interception** : un convoi d'une nation en guerre peut être intercepté par la flotte d'un port ennemi au bout de la
  route, ou rencontrer un convoi ennemi sur la même route. Sans guerre, ou face à un port sans navires : pas d'interception.
- **Débarquement** : combat en mode « landing » (troupes à 70 % de leurs dégâts) ; guerre automatique. Repoussés, les
  survivants rembarquent et rentrent par la même route. Vers un allié ou chez soi : renfort ou retour.
- **Sauvegarde** : schéma 7 ; un transport en mer d'une sauvegarde plus ancienne devient un convoi qui arrive au même tour.

## Fin de partie
- La partie s'arrête au **tour 60** avec un classement : provinces, puis capitales, puis trésor.
- Victoire anticipée : une nation tient les 5 capitales. Défaite : le joueur éliminé voit l'écran de fin.

## Points à équilibrer (constatés en simulation IA, 5 parties de 60 tours)
- L'IA reste passive jusqu'au tour 47 environ (premier convoi vers le tour 46). Les personnalités de la V11
  (notamment le Conquérant) doivent rendre le début de partie plus vivant.
- 27 interceptions, 0 convoi coulé : l'escorte n'a pas encore d'enjeu visible.
