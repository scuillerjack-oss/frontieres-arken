# FRONTIÈRES: ARKEN — V9 — Cahier des charges

> Rédigé le 15/10/2026 avec Jack. Reprend l'esprit du cahier V8 original
> (`V8-cahier-des-charges-original.pdf`), adapté à la base réellement disponible : la V6.0.2.
> Durée visée : 1 à 2 heures de travail, une bêta jouable à la fin.

## 1. Règle absolue de reprise
- Base de départ : `archives/frontieres-arken-v6/` (V6.0.2 récupérée le 15/10/2026, code source lisible).
- Ne pas reconstruire le jeu, ne pas repartir de zéro, ne supprimer aucun système fonctionnel.
- Nouveau dépôt public `scuillerjack-oss/frontieres-arken` ; premier commit = la V6.0.2 telle quelle,
  pour que l'historique montre exactement ce qui a changé ensuite.
- Le jeu est publié comme PWA installable (GitHub Pages), même schéma que CIBLE et RUPTURE.

## 2. Objectif
Intégrer la carte Leonardo, fiabiliser l'existant, et livrer une bêta réellement jouable sur le téléphone de Jack.
Rien d'autre : pas de nouveau système majeur.

## 3. Carte Leonardo (`assets/carte-leonardo.jpg`, 1536 × 1536)
- On garde **20 provinces** et **5 nations**, **4 provinces par nation**.
- Le dessin montre 5 grandes îles : **une île par nation**.
- Les provinces sont formées en **regroupant les zones peintes**, pour que chaque frontière de province
  tombe sur une frontière dessinée. Les petits îlots restent décoratifs.
- Chaque province a une zone tactile précise (polygone) alignée sur l'image, un centre pour ses icônes,
  ses voisinages terrestres, et ses accès maritimes.
- Les îles sont reliées par des **routes maritimes** entre ports. Chaque île doit avoir au moins un port
  pour que la partie reste jouable. Les mécaniques navales de la V6 sont conservées telles quelles
  (la refonte de la marine est en V10).
- Données de carte maintenables : coordonnées dans le repère de l'image, aucun calage « au pixel près » codé en dur.
- **Point d'arrêt obligatoire** : avant l'intégration, envoyer à Jack l'image de la carte avec les 20
  provinces découpées par-dessus (noms, nations, ports, routes). Rien n'est intégré sans son accord.

## 4. Compatibilité à vérifier (aucune régression)
Sélection d'une province et affichage de ses infos (troupes détaillées, constructions en cours ou finies),
trésor en haut d'écran, déplacements, attaques, ordres en attente, **résolution simultanée** en fin de tour,
IA, combats IA contre IA, économie, recrutements, constructions, diplomatie (guerres, cessez-le-feu,
alliances, traités), journal, aide/tutoriel, sauvegarde et reprise, zoom, déplacement et pincement
tactiles, bouton retour Android, affichage mobile, installation PWA, fonctionnement hors ligne.

## 5. Tests
- Avant toute modification : tests qui **verrouillent le comportement actuel** de la V6 (moteur, sauvegarde, carte).
- Tests de la nouvelle carte : 20 provinces, 4 par nation, voisinages symétriques, chaque île accessible par mer,
  toutes les zones tactiles distinctes et dans l'image.
- Test explicite de la résolution simultanée : « j'attaque 3 → 4 pendant que 7 attaque 3 ».
- Simulation de centaines de tours IA contre IA sans plantage ni état incohérent.
- Parcours réel dans un Chrome mobile simulé : lancement, choix de la nation, sélection, ordre, combat,
  recrutement, construction, diplomatie, fin de tour, sauvegarde et rechargement.

## 6. Livraison bêta (critère bloquant)
La V9 n'est livrée que si : le commit final est poussé, le site publié sert ce commit, la version visible
dans le jeu l'affiche, la PWA s'installe et se met à jour, et Jack peut y jouer sur son téléphone.

## 7. Organisation
- Claude orchestre ; sous-agents : archéologue (audit + tests de verrouillage), cartographe (découpage de la carte),
  intégrateur (rendu et interactions), testeur indépendant (parcours + simulations).
- Branche de travail `mission/V9-carte-leonardo`, Pull Request, Jack fusionne.
- Règles du studio : `CLAUDE.md` (aucun force push, aucune suppression, une mission à la fois).

## 8. Rapport final
État de reprise, modifications, méthode d'intégration de la carte, tests et résultats, anomalies corrigées
et restantes, version, commit final, déploiement vérifié, confirmation de l'installation sur téléphone.

## 9. Hors périmètre (versions suivantes)
Combats à points de vie et marine (V10), personnalités des dirigeants (V11), modèle économique et Google Play (V12).

## Point à vérifier pendant l'audit
Le code V6 contient deux listes de nations différentes (`arken, valdor, kael, sol, nerys` dans les constantes,
`valmorne, roc-epine, noireflamme, oroel, aurel` dans la carte). À clarifier avant d'y toucher.
