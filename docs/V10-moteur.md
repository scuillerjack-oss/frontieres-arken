# FRONTIÈRES: ARKEN — V10 — Moteur (règles, combats à PV, blessures)

> Agent moteur, 15/10/2026. Périmètre : `src/domain/`, `src/state/`, `src/persistence/`, `tests/`.
> Toutes les valeurs sont dans `src/domain/constants.js` (`RULES`) : on rééquilibre là, sans toucher au code.
> Combat : `src/domain/combat.js` (module pur, sans DOM, sans hasard).

## 1. Règles issues de la bêta V9 (points 10 à 13)

| Règle | Valeur | Où |
|---|---|---|
| Banque | 1 par province, file de construction comprise | `RULES.buildings.bank.max = 1` |
| Usine | 1 par province, file comprise | `RULES.buildings.factory.max = 1` |
| Port | 1 par province (inchangé) | `RULES.buildings.port.max = 1` |
| Forteresse | niveaux 1 à 3 (20 / 35 / 50 or, 2 tours chacun) | `RULES.buildings.fort.max = 3` |
| Effet du fort | +10 % de défense par niveau, **en défense seulement** : les dégâts reçus par la garnison sont divisés par 1,1 / 1,2 / 1,3. Aucun effet pour une armée qui part de la province. | `RULES.fortDefense = [1, 1.1, 1.2, 1.3]` |
| Guerre automatique | toute attaque (terre, débarquement, choc frontal) contre une nation en paix déclare la guerre entre les deux ; alliances et trêves entre elles sont rompues. Une guerre lie les deux camps : le défenseur riposte sans nouvelle déclaration. | `ensureWar` |
| Pillage de capitale | prise de la capitale **actuelle** d'une nation (même non éliminée) : le conquérant reçoit **50 % du trésor actuel** du vaincu, à chaque prise. Le trésor de guerre fixe de la V6 (+30, une seule fois par capitale) est conservé. | `RULES.capitalPlunderRate = 0.5` |
| Élimination (B6) | une nation sans province et sans troupes en mer est marquée `eliminated: true` ; ses ordres, guerres et traités sont retirés ; l'IA ne la fait plus jouer. | `updateEliminations` |
| Journal public | chaque affrontement est connu de **toutes** les nations : « Affrontement à X entre A et B : B tient la province / A prend la province ». Le détail des pertes n'apparaît que pour les nations impliquées. | `eventKnownToPlayer`, `journalEntry` |

Messages d'erreur de `queueConstruction` (renvoie `{ ok:false, error }`) :
- « Une seule banque par province (déjà construite ou en construction) »
- « Une seule usine par province (déjà construite ou en construction) »
- « Forteresse déjà au niveau 3 (maximum), en comptant les niveaux en construction »
- « Un port existe ou est déjà en construction » / « Cette province ne peut pas accueillir de port »

Nouvelle fonction utile à l'interface : `buildingCount(state, provinceId, type)` = construits + en file + commandés ce tour.

## 2. Combats à points de vie

### 2.1 Table des unités (valeurs **par unité** ; l'infanterie se compte toujours en soldats, 20 par lot)

| Type | PV | Dégâts / passe | Coût d'un lot | PV d'un lot | Forces | Faiblesses |
|---|---|---|---|---|---|---|
| Infanterie | 10 | 5 | 20 or (20 soldats) | 200 | nombreuse, bon marché ; ×1,5 contre l'artillerie | ×0,8 contre les blindés |
| Cavalerie | 35 | 20 | 20 or (5) | 175 | ×1,2 infanterie, **×2 artillerie** | ×0,4 contre les blindés |
| Blindés | 240 | 120 | 30 or (1) | 240 | **×2 cavalerie**, ×1,5 artillerie, ×1,2 infanterie | coûteux, usine requise |
| Artillerie | 60 | 90 | 25 or (1) | 60 | **×1,5 infanterie**, ×1,2 cavalerie | **fragile** (60 PV) |
| Ballon | 40 | 0 | 20 or (1) | 40 | ne combat pas ; **+15 % de dégâts** à tout son camp ; difficile à toucher (poids de cible 0,2) | capturé si seul |
| Navire de guerre | 700 | 260 | 65 or (1) | 700 | seul à tirer en mer ; appui à 100 % lors d'un débarquement | ×0,5 contre les troupes ; ×0,2 reçu des troupes |

Multiplicateurs complets : `RULES.combat.multipliers[tireur][cible]` (1 par défaut).

Autres réglages (`RULES.combat`) : `passes: 3`, `balloonAccuracyBonus: 0.15`, `landingPenalty: 0.7`,
`convoyVulnerability: 1.5`, `killShare: 0.5`, `maxWoundShare: 0.5`, `healRate: 0.1`.
Réglages IA : `RULES.ai.attackShares = [0.35, 0.5, 0.7, 0.9]`, `RULES.ai.landingExtraMargin = 0.15`.

Les anciennes valeurs `RULES.units[*].power` / `landPower` / `navalPower` sont conservées (compatibilité) mais
ne servent plus aux combats.

### 2.2 Déroulé d'un combat (`resolveBattle`)
1. Au plus **3 passes**. À chaque passe, tout le monde tire **en même temps** (aucun ordre de traitement).
2. Feu d'une force = Σ par type (PV restants ÷ PV unitaires) × dégâts × 1,15 si le camp a un ballon
   (× 0,7 pour les troupes d'un débarquement).
3. Répartition : le feu est réparti entre les types ennemis **au prorata de leurs PV** (× poids de cible),
   puis multiplié par le multiplicateur tireur→cible. Le défenseur répartit son feu entre tous les attaquants
   au prorata de leurs PV. Les dégâts reçus par le défenseur sont divisés par le facteur de forteresse.
4. Dégâts encaissés par une pile : 50 % tuent des unités entières, le reste devient des **blessures** ; une unité
   ne peut pas porter plus de 50 % de PV perdus (au-delà, des unités supplémentaires meurent).
5. Fin anticipée dès qu'un camp n'a plus de PV.
6. **Issue** : la province est prise si le défenseur n'a plus d'unité combattante (des ballons seuls sont
   capturés) et qu'il reste au moins un attaquant terrestre combattant. Sinon la défense tient et les survivants
   attaquants **se replient** dans leur province d'origine (perdus si elle n'est plus à eux).
7. Déterministe : aucune part de hasard, arrondis fixes.

### 2.3 Blessures et guérison
- `state.provinces[id].wounds = { infantry, cavalry, armor, artillery, balloon, warship }` : PV perdus par la pile
  de chaque type (navires compris). Les transports ont aussi un champ `wounds`.
- Une armée blessée tire moins fort (feu proportionnel aux PV restants).
- Les blessures suivent les troupes qui se déplacent, au prorata (`splitForce`), et s'additionnent à l'arrivée.
- **Guérison** : en fin de tour, chaque province **qui n'a pas connu de combat ce tour** récupère 10 % des PV max
  de chaque pile (arrondi au supérieur), sans dépasser ses blessures. Les nouvelles recrues arrivent sans blessure.

## 3. Résolution simultanée des ordres (B1, B2)

Ordre de l'inter-tour : IA → verrouillage → **déplacements et combats** → diplomatie → production →
transports (arrivées par mer) → **guérison** → **éliminations** → revenus → journaux.

Déplacements et combats, en trois temps :
0. **Transferts amicaux** (terre) et **embarquements** (mer, mécanique V9 inchangée).
1. **« Défense d'abord »** : une province attaquée qui devait elle-même lancer une attaque garde toute sa garnison
   pour se défendre contre les attaques venues de provinces non attaquées.
2. **Toutes les autres attaques partent en même temps** :
   - **B1 corrigé** : une attaque dont la province d'origine est tombée à l'étape 1 est **annulée** (aucun combat
     fantôme, aucune guerre déclarée) ; événement `attack-cancelled` (raison `origin-lost`).
   - Une attaque dont la cible a changé de main à l'étape 1 au profit d'une nation avec qui l'attaquant n'est pas en
     guerre est annulée, les troupes rentrent (`attack-cancelled`, raison `target-changed`).
   - **Choc frontal** : deux armées qui se croisent sur la même frontière (A→B et B→A) se battent d'abord en rase
     campagne (sans fort, sans prise ; événement `field-battle`), puis les survivants poursuivent.
   - **B2 corrigé** : toutes les nations qui visent une même province combattent **ensemble** contre la garnison
     (un seul affrontement, chacune en guerre contre le défenseur, pas entre elles). Si le défenseur tombe, le
     **survivant le plus fort (PV restants)** prend la province (égalité : identifiant de nation le plus petit) ;
     les autres se replient chez eux. Le résultat ne dépend ni de l'ordre de saisie, ni des identifiants.

## 4. Autres bugs corrigés
- **B3** : un cessez-le-feu accepté verse la somme à la nation qui accepte (débit du demandeur inchangé).
- **B4** (choix : **annulé et remboursé**) : toute production en cours (file + commandes du tour) dans une province
  qui change de main est annulée et **remboursée intégralement** à celle qui l'a payée ; jamais livrée au conquérant.
  Événement `production-lost` (`refund` = montant). Le coût est mémorisé sur chaque élément de file (`q.cost`).
- **B5** : plafonds par province (§1) ; l'IA les respecte (elle passe par `queueConstruction`, qui compte la file).
- **B6** (minimum) : élimination (§1). La condition de **victoire** n'est pas encore définie (point ouvert).

## 5. Sauvegarde
- `SAVE_SCHEMA_VERSION = 6`. Migration 5 → 6 (sauvegardes V9) : `wounds` à zéro partout (PV pleins), `wounds` sur
  les transports, `cost` calculé pour la production en cours, nations sans province marquées éliminées.
  Les schémas 1 à 4 passent par la migration V5 puis par 5 → 6. Aller-retour sans perte testé, suite identique.
- Clé localStorage et identifiants inchangés.

## 6. Ce que l'interface devra afficher (agent interface)
- **PV / blessures** d'une province connue : par type, `unités` et barre de PV = `(n × pv − wounds[k]) / (n × pv)`
  (`RULES.combat.units[k].hp`). Helpers : `provinceForce(p)`, `totalHp`, `maxHp` (`src/domain/combat.js`).
  Mention « en convalescence : +10 % par tour hors combat ».
- **Construction** : `RULES.buildings[type].max` existe désormais (banque, usine, port = 1, fort = 3) ;
  les messages d'erreur ci-dessus peuvent être affichés tels quels.
- **Fiche d'unité** (aide) : tableau §2.1, forces/faiblesses en clair.
- **Nouvelles entrées de journal** (toutes ont `text`, `type`, `category`, `priority`) :
  | événement | type affiché | catégorie | public |
  |---|---|---|---|
  | `battle` | COMBAT (impliqué) / AFFRONTEMENT | `combat` / `foreign-conflict` | oui (pertes si impliqué) |
  | `conquest` | CONQUÊTE / TERRITOIRE PERDU / CONFLIT ÉTRANGER | `conquest` / `lost` / `foreign-conflict` | oui |
  | `field-battle` | COMBAT / AFFRONTEMENT | idem | oui |
  | `capital-plunder` | PILLAGE | `conquest` / `lost` / `foreign-conflict` | oui |
  | `elimination` | ÉLIMINATION | `lost` / `foreign-conflict` | oui |
  | `attack-cancelled` | ORDRE ANNULÉ | `neutral` | joueur concerné |
  | `production-lost` | production | `lost` | joueur concerné |
  | `retreat-lost` | COMBAT | `lost` | joueur concerné |
  Les entrées publiques portent `public: true`. Les événements de combat ont aussi `attackers` (liste),
  `lossesByNation` (pertes par type), `attackerHpLost`, `defenderHpLost`, `passes`, `fortLevel`.
- `journalCategoryClass` (présentation) : `PILLAGE`, `ÉLIMINATION`, `AFFRONTEMENT`, `ORDRE ANNULÉ` sont de
  nouveaux libellés de `type`.

## 7. API du combat pour l'agent marine

```js
import { resolveBattle, resolveCombat, legacyForce, toLegacy, provinceForce, writeProvinceForce,
         splitForce, mergeForce, combatValue } from './src/domain/combat.js';
```

**Format d'une force** : `{ units: { infantry, cavalry, armor, artillery, balloon, warship }, wounds: { mêmes clés } }`.
Passerelles : `legacyForce(transportOuOrdre)` (format V6 `{units, warships, wounds}` → force),
`toLegacy(force)` (inverse), `provinceForce(p)` / `writeProvinceForce(p, force)`.

**Combat naval** (interception d'un convoi, bataille de flottes) — pas de prise, pas de fort, seuls les navires tirent,
les troupes embarquées sont une cargaison qui encaisse ×1,5 :
```js
const r = resolveCombat({ attacker: legacyForce(convoi), defender: flotteEnnemie, mode: 'naval' });
// r.attacker / r.defender : forces survivantes (blessures comprises) -> à réécrire dans les transports
// r.attackerWins : l'attaquant a encore des navires et l'autre plus aucun
// r.attackerLossesByType, r.defenderLossesByType, r.attackerHpLost, r.defenderHpLost, r.passes
```
Plusieurs flottes : `resolveBattle({ defender, attackers: [{ id, force }], naval: true })`.

**Débarquement** — troupes à 70 %, navires de l'attaquant en appui à 100 %, fort de la province appliqué au défenseur :
```js
const r = resolveBattle({
  defender: provinceForce(state.provinces[toId]),
  attackers: [{ id: nationId, force: legacyForce(convoi), mode: 'landing' }],
  fortLevel: state.provinces[toId].buildings.fort || 0
});
// r.captured, r.winnerId, r.defender, r.attackers[i].force / lossesByType / hpLost
```
Dans le moteur, l'arrivée d'un transport appelle déjà la fonction interne `fight(...)` de `game-engine.js`
avec `mode: 'landing'` : elle gère la guerre automatique, l'événement public, la prise, le pillage de capitale,
le remboursement de production, le marquage `fought` (pas de guérison) et le repli des survivants vers le port de
départ. **Le plus simple pour la refonte marine : continuer à appeler `fight(state, toId, [{ nationId, force,
originIds:[fromId], mode:'landing', retreatTo:[fromId] }], fought, { naval: true })` puis `applyRetreats`**,
et utiliser `resolveCombat(..., mode:'naval')` pour les interceptions en mer (avant l'arrivée).

**IA** : `combatValue(force, { naval })` donne une valeur scalaire ; pour décider, préférer la simulation
(`resolveCombat` contre la garnison majorée par `scaleForce(force, marge)`), comme `aiAttackSlice`.

## 8. Simulation (carte V9, 5 parties IA × 200 tours, tests verts)
- 278 affrontements au total, dont **79 inter-îles** (64 débarquements réussis, 81 %).
- 19 pillages de capitale, 2 nations éliminées, 3 affrontements à plusieurs attaquants.
- Première guerre vers le tour 47. 43 guerres, durée moyenne **≈ 126 tours** (médiane 148) : les IA ne font
  jamais la paix (B9, prévu en V11), donc une guerre dure jusqu'à la fin de la simulation.
- **Aucune nation ne gagne en 200 tours** (la plus grande en tient 8 à 11 sur 20). Partie « finissable en 60 tours »
  non atteinte : il faudra une condition de victoire et une IA plus agressive (points ouverts).

## 9. Points ouverts
- Condition de victoire (fin de partie) à décider avec Jack.
- Équilibrage : valeurs raisonnables mais non jouées par Jack ; tout est dans `RULES.combat`.
- IA : pas de diplomatie (B9) ; ne gère pas activement ses blessés (elle les laisse guérir sur place).
- Refonte marine (agent suivant) : routes, ports, convois, escortes, interceptions.
