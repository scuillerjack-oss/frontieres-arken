# FRONTIÈRES: ARKEN — V10 — Cahier des charges

> Ergonomie et règles issues de la bêta V9, combats à points de vie, blessures lentes, et marine.
> Part de la V9 livrée. Retours détaillés : `BETA-V9-retours-Jack.md` (points 1 à 16 et 19).
> Inspiration : Supremacy 1914, adapté au tour par tour. Une bêta jouable à la fin.

## 0. Ergonomie et règles (retours bêta V9, points 1 à 13)
- Cadre de carte réduit ; barre du haut et boutons du bas grands et lisibles ; bouton Diplomatie du bas retiré.
- Déplacement de la carte dans tous les sens à tous les niveaux de zoom ; flèches qui visent le point de la province.
- Liseré bleu autour de mon territoire, liseré rouge autour des nations en guerre contre moi.
- Ports colorés selon leur propriétaire ; routes maritimes clairement visibles.
- Prérequis affichés en clair (ex. navire : usine + port).
- Une banque et une usine maximum par province ; forteresse niveaux 1 à 3, +10 % de défense par niveau (défense seulement).
- Attaquer = guerre automatique entre les deux nations.
- Prise d'une capitale : le conquérant récupère une part du trésor du vaincu (base proposée : 50 %, à équilibrer).
- Journal : tous les affrontements de la carte sont signalés, même sans détail des pertes.

## 1. Bataillons avec points de vie et dégâts
- Chaque bataillon a des **points de vie (PV)** et des **dégâts** ; ce sont les bataillons qui ont des PV, pas les soldats.
- Unités terrestres (inchangées) : infanterie, cavalerie, blindés, artillerie, ballon d'observation.
- Forces et faiblesses par type, par exemple :
  - l'artillerie fait mal à l'infanterie, mais elle est fragile au contact ;
  - les blindés écrasent la cavalerie ;
  - le ballon ne combat pas : il améliore la précision et révèle les forces des provinces voisines ;
  - les forts multiplient la défense.
- Le combat se joue en **quelques passes** pendant la résolution simultanée du tour ; le journal raconte le combat.
- Les valeurs exactes sont regroupées dans un seul fichier de règles, faciles à rééquilibrer.

## 2. Blessures lentes
Un bataillon blessé garde ses PV perdus et **guérit lentement** (quelques PV par tour) dans une province amie.

## 3. Marine
- **Bloquant de la bêta V9** : on doit pouvoir embarquer depuis SON port vers toute côte reliée par une route,
  sans que le port d'arrivée existe (il ne doit plus falloir deux ports construits).
- **Durée** : terre = 1 province par tour ; mer = au moins 2 tours entre îles proches ; routes longues découpées en
  points d'étape en mer, 1 tour par étape (s'appuyer sur la longueur des routes de la carte V9).
- **Embarquement automatique** : une armée qui se déplace vers la mer devient un convoi de transport,
  **uniquement depuis une province avec un port**. Sans port, pas d'embarquement.
- Les convois transportent les troupes terrestres, ne se battent pas, et sont vulnérables.
- **Navires de guerre** : uniquement pour le combat naval (escorte, interception, blocus).
- Un convoi non escorté intercepté par des navires ennemis subit de lourdes pertes.
- Débarquement : combat à l'arrivée, avec la pénalité d'un assaut depuis la mer.

## 4. IA
L'IA sait construire des ports, escorter ses convois, intercepter ceux de l'adversaire et gérer ses blessés.

## 5. Bêta par Google Play
Mise en place du **test interne Google Play** (AAB signé, piste de test interne) pour que Jack installe et mette à
jour la bêta depuis le Play Store. Nécessite des actions de Jack dans la Play Console (création de l'appli, premier
envoi), guidées pas à pas. L'APK de bêta reste disponible en secours.

## 6. Tests et livraison
- Tests unitaires du combat (chaque matchup, combat en passes, guérison) et de la marine
  (pas d'embarquement sans port, interception, escorte, débarquement).
- Centaines de tours IA contre IA sans plantage ; vérification que les parties restent équilibrées et finissables en 60 tours.
- Même critère bloquant de livraison que la V9 : bêta réellement jouable sur le téléphone de Jack.

## Hors périmètre
Personnalités des dirigeants (V11), modèle économique (V12).
