# AUDIT V6.0.2 — FRONTIÈRES: ARKEN

> Archéologue du studio, 15/10/2026. Code audité : `/home/claude/arken-work/` (V6.0.2 récupérée), sans aucune modification.
> Tests de verrouillage : `cd /home/claude/arken-work && node --test "tests/**/*.test.js"` → **66 tests, 65 OK, 1 « à faire » (bug connu), 0 échec**.

---

## En bref (pour Jack)

1. **Le jeu est complet et sain sur le fond.** Tous les systèmes du cahier des charges existent et fonctionnent : choix de nation, carte de 20 provinces, économie, constructions, recrutement, déplacements et attaques, résolution en fin de tour, IA, diplomatie, journal, tutoriel, sauvegarde, PWA. Sur 5 parties de 250 tours entre IA : aucun plantage, aucune valeur absurde.
2. **Les deux listes de nations : une seule sert vraiment.** Le jeu utilise **Valmorne, Roc-Épine, Noireflamme, Oroël, Aurel** (définies dans la carte). L'autre liste (`arken, valdor, kael, sol, nerys`) n'est utilisée **nulle part** : c'est un reste d'une ancienne version, sans danger, à supprimer ou ignorer. **Attention : il ne faut pas renommer les identifiants des 5 nations en V9**, sinon les sauvegardes existantes deviennent illisibles.
3. **La carte actuelle est un dessin schématique** : 20 hexagones générés par calcul autour d'un point, sur une grille de 400 × 260. Tout l'affichage (taille des textes, icônes, flèches, zoom) est calé sur cette grille. Passer à l'image Leonardo (1536 × 1536) touche **uniquement la couche « carte et affichage »**, pas le moteur — mais plusieurs réglages sont codés en dur (liste en §3).
4. **Le jeu ne marchera pas tel quel sur GitHub Pages** dans un sous-dossier (`/frontieres-arken/`) : tous les chemins commencent par `/`. ~35 chemins à rendre relatifs (liste en §4).
5. **La « résolution simultanée » n'est pas vraiment simultanée.** Tous les ordres sont bien résolus dans le même tour, mais les combats sont traités l'un après l'autre, dans l'ordre alphabétique des provinces. Résultat : dans le scénario « j'attaque X→Y pendant qu'on attaque X », si X est traitée d'abord, mes troupes meurent dans X avant de partir. C'est le comportement V6, figé par les tests ; à décider plus tard (V10) si on le change.
6. **Bugs trouvés (aucun bloquant pour la V9)** : un cessez-le-feu payé n'est jamais encaissé par l'adversaire ; une production terminée dans une province perdue est offerte au conquérant ; l'IA empile plusieurs usines/banques au même endroit ; la partie ne se termine jamais ; deux paires de zones tactiles se chevauchent ; la sauvegarde grossit sans fin (~700 Ko à 300 tours). Détails en §5.
7. **Piège V9 n°1** : si la nouvelle carte change d'identifiant (`map.id`), les sauvegardes V6 sont **silencieusement ignorées** au démarrage (`app.js:165`). À décider consciemment.

---

## 1. Inventaire des systèmes (fichier + fonctions)

| Système | Où | Notes |
|---|---|---|
| Carte, nations, provinces, voisinages | `src/map/arken-v1-map.js` (`nationsV1`, `defs`, `shape()`, `arkenV1Map`, `provinceById`) | 20 provinces `p01`–`p20`, 5 nations × 4. Deux masses : ouest p01–p12 (Valmorne, Roc-Épine, Noireflamme), est p13–p20 (Oroël, Aurel). |
| Validation de carte | `src/map/validate-map.js` `validateMapDefinition` | 20 provinces, 5 nations, 4/nation, voisinages connus et symétriques, ports côtiers, zones maritimes connues. Ne vérifie **pas** `maritimeRoutes` ni la géométrie (hors ≥ 3 points). |
| Ports / routes maritimes | carte : `ports`, `coastal`, `maritimeRoutes` (5 routes), `seaZones` (5 zones) ; moteur : `legalDestinations` (game-engine.js:16), `resolveTransports` (:226) | Une route est utilisable si **les deux ports sont construits**. Traversée : embarquement (1 inter-tour) + mer (1) → arrivée/combat naval. `seaZones` et `coastalReach` ne servent qu'à la validation (pas au jeu). **Valmorne n'a aucun site de port.** |
| Unités et coûts | `src/domain/constants.js` `RULES.units` | Infanterie (lot 20, 20 or), cavalerie (5, 20), blindés (1, 30, usine), artillerie (1, 25, usine, défense 4), ballon (1, 20, usine, renseignement), navire (1, 65, usine + port). |
| Économie | `incomeFor` (game-engine.js:12), `spendableTreasury` (:10) | 4 or/province + 3/banque + 3/usine. Trésor initial 120. Revenu crédité en fin d'inter-tour (:366), **après** les livraisons. Trésor de guerre +30 à la 1re prise d'une capitale (:130). |
| Constructions | `queueConstruction` (:48), `resolveProjects` (:209) | Payée à la commande, livrée après la durée. Fort ≤ 3 (20/35/50), port unique et seulement sur site portuaire, banques/usines **sans limite**. |
| Recrutement | `queueRecruitment` (:63) | Par lots ; `lots` < 1 devient 1 lot. |
| Ordres | `queueMoveOrder` (:75), `availableForces` / `reservedAt` (:26-36), `cancelPendingOrder` (v5-ux.js:13) | Les forces engagées sont réservées jusqu'à l'inter-tour. |
| Diplomatie (ordres) | `queueDiplomaticOrder` (:89), `resolveDiplomacy` (:176), `setRelation` (:269, non utilisé par l'UI) | Guerre, alliance, cessez-le-feu payant (25/50/75 % du trésor adverse, 75/50/25 % d'acceptation, somme réservée). Alliance **acceptée d'office** (pas de réponse de l'IA). Attaquer = guerre automatique, rupture des traités (`ensureWar` :110). |
| Résolution d'inter-tour | `resolveInterturn` (:354), alias `nextTurn` | Ordre : IA planifie → verrouillage → mouvements/combats (`aggregateMoves`) → diplomatie → production → transports → revenus → journaux → tour+1. |
| Combats | `battle` (:116), `landPower`, `navalPower` | Victoire si ratio attaque/défense > 1,08. Fort ×1/1,1/1,2/1,3. Défaite : **toute** la force attaquante est perdue. |
| IA | `aiPlan` (:239), `planAIOrders` (:261), traits dans `create-game-state.js:31` | Par nation, 1 usine, 1 banque, 1 recrutement, au plus **1 attaque par tour** (35 % des forces). Traits prudent/offensif/fidèle/impulsif = seuil d'attaque. N'attaque pas alliés ni trêves, cible le joueur en dernier. Pas de diplomatie IA, pas de marine IA, pas de défense. |
| Hasard | `seededRandom` (:348) | Déterministe : graine `state.seed` + `state.randomCounter`. Sert **uniquement** aux cessez-le-feu. Aucun `Math.random` dans le moteur. |
| Journal | `journalEntry` (:303), `buildTurnJournal` (:338), `buildPermanentJournal` (:344), `eventKnownToPlayer` (:291) | Journal inter-tour + historique permanent (`chronicle`). Filtré par ce que le joueur sait (ses provinces, ses ballons). |
| Renseignement | `canKnowProvinceForces` (v3-ux.js:13) | Forces ennemies visibles seulement si un ballon est dans une province voisine. |
| Tutoriel / aide | `TUTORIAL_GUIDE` (v4-ux.js:4), `tutorial()` (app.js:25), `openHelp` (app.js:154) | 2 bulles max par tour ; réinitialisable dans les paramètres. |
| Sauvegarde | `save-codec.js` (`encodeSave`, `decodeSave`, `migrateSave`), `app.js:21-22` `save`/`load`, `hydrateState` (app.js:164) | JSON dans **localStorage**, clé `frontieres-arken-v2-save` (v4-ux.js:3). Schéma **5** ; migre 1→4 vers 5. Sauvegarde automatique à **chaque** `render()` (app.js:64). |
| Écrans / retour Android | `screen-flow.js`, `start-flow.js`, `handleAppBack` (app.js:240), `history.pushState` | Retour : ferme le dialogue, puis le mode déplacement, puis la fiche, puis l'accueil. |
| Zoom / pincement | `clampMapTransform` (v3-ux.js:2), `pinchTransform` / `mapFrameTransform` (v5-ux.js), app.js:205-227 | Zoom 1 à 2,5, transformation CSS sur le `<svg>`. |
| Son | `playSfx`, `setMusic` (app.js:162-163) | Oscillateurs WebAudio, pas de fichier. |
| PWA | `sw.js`, `manifest.webmanifest`, enregistrement app.js:249 | Cache `frontieres-arken-v6-20261003-patch2` (nom écrit à la main), réseau d'abord puis cache. |

**Code mort** (présent mais jamais appelé par le jeu) : `NATION_IDS`, `NAVAL_UNIT_TYPES`, `BUILDING_TYPES`, `HISTORICAL_RULE_REFERENCE` (constants.js) ; `moveForce`, `setRelation`, `recordDiplomaticAction`, `adviserText` (game-engine.js) ; tout `src/presentation/map-view-model.js` (pourtant mis en cache par sw.js) ; `markTutorialSeen` (v3-ux), `pinchScale`, `resetActiveSave` (v4-ux) ; `provinceById`, `decorativeIslands`, `port.anchor`, `landmassId`, `coastalReach` (carte) ; `names` et l'import `clampMapTransform` dans app.js ; `nations[*].eliminated`, `diplomacy.proposals`, `seaForces`.

## 2. Les deux listes de nations

- `src/domain/constants.js:3` `NATION_IDS = ['arken','valdor','kael','sol','nerys']` : **jamais importée** par aucun fichier. Code mort, vestige d'une version antérieure. Aucun risque à l'ignorer ; la supprimer est sans effet (test `map.test.js` la fige pour l'instant, à adapter si on la retire).
- `src/map/arken-v1-map.js:3` `nationsV1 = valmorne, roc-epine, noireflamme, oroel, aurel` → exposée en `arkenV1Map.nations`. **C'est la seule liste utilisée** : `createGameState` (nationIds = `map.nations`), l'écran de choix (`openNationChoice`, app.js:200), les noms dans le journal (`nationName`), les couleurs, la diplomatie.
- Les identifiants de nation sont **écrits dans la sauvegarde** (`ownerId`, `controllers`, `nations`, `ai.traits`, guerres/traités, événements). Les renommer casserait les parties en cours. Changer le **nom affiché** (`name`, `short`) ou la couleur est sans risque.
- Dépendances d'ordre cachées : la **capitale** est la 1re province de chaque nation dans l'ordre de `defs` (create-game-state.js:11) ; les **traits IA** sont attribués selon l'ordre de `map.nations` (:31). La V9 doit conserver ces ordres ou les rendre explicites.

## 3. Ce qui dépend de la géométrie de la carte (zone V9)

Le moteur (`game-engine.js`) ne dépend **que des identifiants et des voisinages**, jamais des coordonnées. Tout ce qui suit est dans la carte ou l'affichage :

**Données de carte** (`arken-v1-map.js`)
- `defs[...][5]` = ancre `[x,y]` dans un repère 400 × 260 ; `shape()` (:34) fabrique un hexagone 46 × 31 autour de l'ancre → `geometry.points` et `markerAnchor`.
- `port.anchor` = ancre + (18,13) (inutilisé), `decorativeIslands` (inutilisé), `visibleRoutes` (lignes terrestres dessinées entre ancres).

**Rendu** (`app.js`)
- `:40` fond de mer `rect` **400 × 260** codé en dur ; `index.html:7` `viewBox="0 0 400 260"`.
- `:205` `measureFrame` : ratio **400/260** codé en dur pour le cadrage et le zoom.
- `:49` deux polygones par province (fond + contour) ; `:50` nom au `markerAnchor` ; `:51` étoile de capitale à ancre −12 en y ; `:52` icônes de bâtiments à +12 en y, pas de 10 ; `:53` pastille « troupes » à (+18, −10), rayon 4.
- `:32-35` `routeLine` et `:58-62` flèches d'ordre : `provinceBorderPoint` (v4-ux.js:33) cherche le bord du polygone par dichotomie depuis l'ancre (suppose l'ancre **dans** le polygone et un polygone à peu près convexe).
- `:18` province de secours avec ancre (0,0).
- CSS en unités du viewBox : `styles.css` textes 7 px, bâtiments 9 px, capitale 11 px, traits 1,2 à 7 ; `v5.css:11` flèches (non-scaling-stroke, OK). Avec un repère 1536, tout sera ~4× trop petit → à mettre à l'échelle.
- `styles.css` `.map-shell:before` « MER D'ARKEN » en surimpression ; `.sea` remplit le fond (cacherait l'image Leonardo).

**Zones tactiles**
- Clic = événement sur le `<g>` SVG de la province (app.js:54), donc la zone tactile **est** le polygone affiché. Pas de `pointInPolygon` côté clic.
- **Chevauchements actuels** : p04/p06 et p08/p10 (test `map.test.js`) → un appui dans la zone commune sélectionne la province dessinée en dernier.
- Zoom limité à ×2,5 (`clampMapTransform`, `pinchTransform`, boutons app.js:238) : probablement insuffisant pour viser 20 provinces sur une image carrée sur téléphone.

**Autres liens à la carte**
- `hydrateState` (app.js:165) rejette toute sauvegarde dont `mapId` ≠ `map.id` ; `:169` réécrit `portSite` d'après la carte.
- `aggregateMoves` trie par identifiant de province (game-engine.js:153) → renuméroter les provinces change l'issue des combats simultanés.
- `validate-map.js` impose exactement 20 / 5 / 4 et `schemaVersion === 1`.

## 4. Chemins absolus (cassent sous `/<dépôt>/` sur GitHub Pages)

- `app.js:1-10` : 10 imports `'/src/...'`. `app.js:249` : `register('/sw.js')`.
- `index.html:2` : `/manifest.webmanifest`, `/icons/icon-192.png`, `/styles.css`, `/v5.css`. `index.html:7` : `/app.js`.
- `sw.js:2` : les 21 entrées de `ASSETS` (`'/'`, `'/index.html'`, …). `sw.js:5` : repli `caches.match('/index.html')`.
- `manifest.webmanifest` : `id "/"`, `start_url "/?source=pwa…"`, `scope "/"`, 3 icônes `/icons/...`.
- Les fichiers `src/` entre eux utilisent des chemins relatifs (`./`, `../`) : OK.
- À noter aussi : `index.html:19` contient un **script Cloudflare injecté** (`/cdn-cgi/challenge-platform/...`), reste de la récupération du site d'origine : inutile, à retirer.
- La structure (fichiers à la racine, pas de `app/`, pas de `__VERSION__`, nom de cache SW écrit à la main) ne suit pas encore le modèle du studio (CLAUDE.md : `app/` + `scripts/build.js`).

## 5. Bugs et fragilités

| # | Gravité | Où | Constat | Test |
|---|---|---|---|---|
| B1 | Moyenne | game-engine.js:153, :163-171, :141 | Combats traités **un par un dans l'ordre alphabétique des cibles**. Si l'origine d'une attaque est conquise avant, l'ordre part avec 0 troupe : combat « fantôme » (0 perte), **qui déclare quand même la guerre** à la cible ; les troupes engagées meurent dans la province d'origine. | `simultaneous.test.js` |
| B2 | Moyenne | game-engine.js:165 | Deux nations attaquent la même cible : **seule la première (alphabétique) combat** ; l'ordre de l'autre disparaît sans combat, sans événement ni message (ses troupes restent sur place). | `simultaneous.test.js` |
| B3 | Moyenne | game-engine.js:189 | Cessez-le-feu accepté : la somme est **débitée au demandeur mais jamais créditée** à l'adversaire (l'interface parle pourtant de paiement). | `diplomacy.test.js` + `test.todo` |
| B4 | Moyenne | game-engine.js:215-222 | Production terminée livrée à la province **quel que soit son propriétaire** : si elle vient d'être conquise, le conquérant reçoit les unités/bâtiments payés par l'autre. | `economy.test.js` |
| B5 | Faible | game-engine.js:244-246 | L'IA ne regarde pas sa file de production : elle relance usine/banque au même endroit → 2 usines ou 3 banques par province (légal car pas de limite, cf. B10). | `ai-simulation.test.js` |
| B6 | Faible | tout le moteur | **Pas de fin de partie** : `eliminated` jamais mis à jour, pas de victoire/défaite ; une nation sans province reste « vivante ». `capitalId` ne change jamais : l'étoile reste sur l'ancienne capitale (app.js:51). | `ai-simulation.test.js` |
| B7 | Faible | arken-v1-map.js:34 | Zones tactiles qui se chevauchent : p04/p06, p08/p10. | `map.test.js` |
| B8 | Moyenne (long terme) | app.js:64, game-engine.js:173, :346 | `events`, `chronicle`, `ai.replay` grossissent sans limite : ~540-730 Ko de sauvegarde à 300 tours, réécrite en entier à **chaque** rendu → lenteur sur mobile, puis plafond localStorage (~5 Mo) vers ~2000 tours. Aucune gestion d'erreur sur `localStorage.setItem` (app.js:21). | constat de simulation |
| B9 | Faible | game-engine.js:198-203 | Alliance acceptée d'office ; l'IA ne fait jamais de diplomatie (ni paix ni alliance) → les guerres entre IA sont éternelles. | `diplomacy.test.js` |
| B10 | Faible | game-engine.js:48-61 | Banques et usines sans plafond par province : banques infinies = revenu infini possible. | — |
| B11 | Faible | IA | L'IA ne construit jamais de port ni de navire et n'utilise jamais la mer ; elle thésaurise (> 10 000 or à 300 tours). | `ai-simulation.test.js` |
| B12 | Faible | sw.js:5 | Service worker : met en cache toutes les réponses GET sans vérifier `response.ok` (une erreur 404/500 peut écraser une bonne copie) ; nom de cache à changer à la main à chaque version. | — |
| B13 | Info | game-engine.js:64 | `lots: 0` est converti en 1 lot (payé). L'UI n'envoie jamais 0, donc sans effet aujourd'hui. | — |
| B14 | Info | app.js:165 | Sauvegarde d'une autre carte (`mapId` différent) ignorée sans message → risque de perte des parties V6 en V9. | — |

Aucun plantage, aucune valeur négative ou non finie, aucun propriétaire invalide sur 5 × 250 tours IA contre IA + 200 tours supplémentaires.

## 6. Tests de verrouillage créés

`package.json` (minimal, `"type":"module"`), `tests/helpers/fixtures.js` (partie neuve, invariants, générateur à graine), puis :

| Fichier | Contenu |
|---|---|
| `tests/map.test.js` (9) | validate-map, 20 provinces / 5 nations / 4 par nation, voisinages symétriques et figés, 2 masses terrestres, ports et routes, géométrie 400×260, deux listes de nations, chevauchements tactiles. |
| `tests/create-game-state.test.js` (7) | Partie neuve pour chacune des 5 nations (trésor, capitales, garnisons, traits IA), refus de nation/carte invalide. |
| `tests/save-codec.test.js` (6) | Clé localStorage, aller-retour sans perte (partie neuve et avancée, suite identique après reprise), schéma 5, migrations v4 et v1-3. |
| `tests/economy.test.js` (9) | Règles et coûts figés, revenu de 16/tour, banque, forts, ports, recrutement, trésor insuffisant, B4. |
| `tests/orders.test.js` (7) | Destinations légales (terre/mer), déplacement légal/illégal, réservation des forces, annulation, flèches d'ordre, attaque + trésor de guerre. |
| `tests/simultaneous.test.js` (6) | « A attaque X→Y pendant que B attaque X depuis Z » (même tour, état cohérent), scénario miroir, croisement, même cible, attaques combinées, renfort avant attaque. |
| `tests/diplomacy.test.js` (10 dont 1 todo) | Guerre, alliance impossible en guerre, alliance auto-acceptée, cessez-le-feu (réservation, accepté, refusé, déterminisme), rupture d'alliance par attaque. |
| `tests/ai-simulation.test.js` (12) | 5 parties IA contre IA de 250 tours avec invariants à chaque tour, reproductibilité, absence de `Math.random`, sauvegarde/reprise en cours de partie, idempotence de `planAIOrders`, constats B5/B6/B11. |

Les tests marqués « BUG CONNU » figent le comportement **actuel** : quand un bug sera corrigé, le test correspondant échouera exprès et devra être inversé.
