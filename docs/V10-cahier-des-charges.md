# FRONTIÈRES: ARKEN — V10 — Cahier des charges

> Combats à points de vie, blessures lentes, et marine. Part de la V9 livrée et validée par Jack.
> Inspiration : Supremacy 1914, adapté au tour par tour. Une bêta jouable à la fin.

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
- **Embarquement automatique** : une armée qui se déplace vers la mer devient un convoi de transport,
  **uniquement depuis une province avec un port**. Sans port, pas d'embarquement.
- Les convois transportent les troupes terrestres, ne se battent pas, et sont vulnérables.
- **Navires de guerre** : uniquement pour le combat naval (escorte, interception, blocus).
- Un convoi non escorté intercepté par des navires ennemis subit de lourdes pertes.
- Débarquement : combat à l'arrivée, avec la pénalité d'un assaut depuis la mer.

## 4. IA
L'IA sait construire des ports, escorter ses convois, intercepter ceux de l'adversaire et gérer ses blessés.

## 5. Tests et livraison
- Tests unitaires du combat (chaque matchup, combat en passes, guérison) et de la marine
  (pas d'embarquement sans port, interception, escorte, débarquement).
- Centaines de tours IA contre IA sans plantage ; vérification que les parties restent équilibrées et finissables en 60 tours.
- Même critère bloquant de livraison que la V9 : bêta réellement jouable sur le téléphone de Jack.

## Hors périmètre
Personnalités des dirigeants (V11), modèle économique (V12).
