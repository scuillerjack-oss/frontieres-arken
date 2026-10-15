# FRONTIÈRES: ARKEN — V12 — Cahier des charges

> Modèle économique et préparation à Google Play. Part de la V11 livrée et validée par Jack.

## 1. Principe
- Jeu **gratuit**. Règle d'or : le jeu ne doit **rien coûter à faire tourner** (aucun serveur, aucun LLM).
- On ne peut **jamais** acheter de l'or ni des troupes avec de l'argent réel : seulement des avantages indirects.
- Les bêtas (PWA) n'ont **aucun paiement** : tout cela n'existe que dans la version Google Play.

## 2. Publicités
- **Une publicité au début de chaque partie** (les parties font 60 tours et durent souvent plusieurs jours).
- Une mission journalière sur cinq est une publicité facultative, environ 7 jours sur 10.

## 3. Atouts
- **5 catégories**, chacune améliorable sur **10 niveaux à +1 %**, soit +10 % au maximum :
  1. Or : +% sur les gains de chaque tour.
  2. Recrutement : +% d'infanterie recrutée (100 commandés → 110 au maximum).
  3. Construction : +% de vitesse de construction.
  4. Défense : +% de défense des forts.
  5. Marine : +% de puissance navale.
- **Coût fixe** : 1 jeton par niveau, donc 50 jetons pour tout maximiser.
- Le joueur choisit lui-même où placer ses jetons.

## 4. Missions journalières (gratuites et facultatives)
- 5 missions par jour, faciles, par exemple « conquérir 3 provinces » ou « recruter 50 infanteries ».
- 5 missions sur 5 réussies = **1 jeton**. Un joueur assidu maximise tout en environ 7 semaines.

## 5. Achats
- **Pack débutant** (achat unique) : suppression des publicités et 3 jetons immédiats.
- **Jetons à l'unité ou en lots**.

## 6. Protection des joueurs
- **Sauvegarde cloud Google Play Jeux** (gratuite) : les achats et améliorations survivent à une réinstallation.
- Le Pack débutant se restaure automatiquement via Google Play.
- Fenêtre de consentement RGPD pour les publicités, et politique de confidentialité.
- Risque accepté : changer l'horloge du téléphone permet de tricher sur les missions (jeu solo, aucun tort aux autres).

## 7. Google Play
- Génération de la clé de signature (conservée par Jack, rangée dans les secrets GitHub, jamais dans le code).
- Construction de l'AAB dans le cloud (GitHub Actions), sans Android Studio.
- Test fermé obligatoire : 12 testeurs pendant 14 jours consécutifs, puis demande d'accès à la production.

## Plus tard, seulement si le jeu décolle (ex. 100 000 téléchargements)
Multijoueur, éventuel LLM, nouveau modèle économique : à réfléchir ce jour-là, pas avant.
