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

---

## Réalisé (15/10/2026) — version 9.0.0

**Base** : V6.0.2 importée telle quelle (commit de référence), publiée en 6.0.3 sur GitHub Pages (PR #1).

**Carte Leonardo** (validée par Jack le 15/10, avec sa demande : chaque île reliée aux 4 autres)
- 20 provinces aux ids, noms, nations et biomes de la V6, une île par nation, frontières calées sur le dessin.
- 10 ports (2 par île) et 10 routes maritimes (graphe complet), tracées par la mer.
- Données : `src/map/arken-v9-map.js` (+ `arken-v9-data.js` généré depuis `tools/carte/arken-v9-carte.json`).
- Nouvel identifiant de carte `arken-v9-leonardo` : une sauvegarde de l'ancienne carte affiche un message clair
  et propose une nouvelle partie (elle n'est plus ignorée en silence).

**Mer et IA** (mécaniques navales V6 conservées, la refonte est en V10)
- Une route est utilisable quand les deux ports sont construits ; embarquement, traversée, débarquement.
- L'IA sait désormais utiliser la mer (B11 corrigé) : base navale, flotte, débarquements escortés, renforts.
  En simulation : premiers combats navals vers le tour 28, 8 à 38 combats inter-îles par partie de 200 tours.

**Rendu** : image Leonardo en fond, voile couleur nation, zones tactiles = polygones (chevauchements B7 corrigés),
icônes recalées, ports et routes visibles, flèches d'ordres (y compris par mer), zoom ×3, en-tête « ARKEN · V9 ».

**Service worker** : B12 corrigé (seules les réponses valides sont mises en cache).

**Bêta sur téléphone** : la PWA ne s'installe pas sur le téléphone de Jack (« Impossible d'ouvrir l'application ») ;
ajout d'un APK Android fabriqué par GitHub Actions (Capacitor), signé avec une clé de bêta stable, publié à
https://github.com/scuillerjack-oss/frontieres-arken/releases/download/beta/frontieres-arken-beta.apk

**Tests** : 92 tests (91 OK, 1 « à faire » = B3). Simulation IA contre IA 5 × 200 tours sur la carte V9 avec
combats inter-îles obligatoires. Parcours réel vérifié dans Chrome mobile simulé.

**Restent ouverts** : B1/B2 (combats traités dans l'ordre alphabétique), B3, B4, B5, B6 (pas de fin de partie),
B8 (taille de la sauvegarde), B9 (diplomatie de l'IA) ; la mer s'ouvre tard pour le joueur (il faut que la nation
d'en face construise son port) — à revoir avec la refonte marine de la V10.
