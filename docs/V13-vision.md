# FRONTIÈRES: ARKEN — V13 — Vision (brouillard de guerre) et PV lisibles

> Lot B de la V13 (cahier : `docs/V13-cahier-des-charges.md`, sections 2 et 3). Décisions validées par Jack.
> Code : `src/domain/vision.js` (pur, sans DOM, partagé par l'interface et l'IA), `src/presentation/v13-vision-ui.js`.
> Tests : `tests/vision-v13.test.js`.

## 1. Le ballon d'observation est supprimé
- Plus recrutable (`RULES.units.balloon` n'existe plus : `queueRecruitment` répond « Unité inconnue »), plus affiché,
  plus de bonus de précision au combat (`balloonAccuracyBonus` retiré), plus dans `LAND_UNIT_TYPES` ni `COMBAT_TYPES`.
- Les nouvelles parties ne donnent plus de ballon aux capitales.
- **Sauvegarde : schéma 8 → 9.** La migration retire les ballons partout (provinces, blessures, convois, ordres de
  déplacement), supprime les recrutements de ballons en attente et les ballons en production, **sans remboursement**.
  Le reste de la partie est intact. Clé `frontieres-arken-v2-save` et identifiants inchangés.

## 2. Qui voit quoi
| Règle | Détail |
|---|---|
| Ses provinces | Une nation voit toujours les provinces qu'elle possède. |
| Voisines terrestres | Une province où elle a **au moins une troupe** (unité terrestre ; un navire seul ne compte pas) révèle ses voisines **par la terre** (`landConnections`). |
| Jamais par la mer | Une route maritime ne révèle rien (au départ, chaque nation ne voit que son île). |
| Pas au-delà d'un pas | Une province révélée ne révèle pas ses propres voisines. |
| Province sans troupe | Elle reste visible (on la possède) mais ne révèle pas ses voisines. |
| Alliés | Un traité `alliance` actif partage toute la vision (provinces et voisines des deux). Une trêve ne partage rien. |

**Ce qu'on voit :**
- province **visible** : propriétaire, bâtiments, troupes (« Régiment : 344 PV · 52 dégâts par assaut » + effectifs) ;
- province **non visible** : propriétaire et bâtiments (la carte politique reste connue), troupes inconnues :
  « Régiment : effectif inconnu », icône **?** sur la carte à la place de ⚔ ;
- **forteresse** (fort ≥ 1) d'une nation qui n'est ni soi ni un allié : troupes cachées même si la province est visible
  (« Troupes retranchées dans la forteresse : effectif inconnu »), bâtiments visibles.

**Journal** : les affrontements restent publics (pertes réservées aux nations impliquées, inchangé). La règle
« ballon » de `eventKnownToPlayer` est remplacée par la vision : un événement local est connu si sa province est visible.

## 3. L'IA joue avec le même brouillard
Toutes les lectures de garnisons ennemies de l'IA passent par `perceivedForce` : effectif réel si les troupes sont
connues, sinon **estimation prudente** calculée uniquement à partir d'informations publiques (`RULES.vision`) :
- province ordinaire : 60 fantassins ; capitale : 200 fantassins, 10 cavaliers, 6 blindés, 2 canons ;
- port construit : 1 navire supposé à quai ;
- le tout × (1 + 0,03 × (tour − 1)) (les armées grossissent avec la partie).

Concerné : simulation d'attaque et de débarquement (`aiAttackSlice`, navires intercepteurs compris), tri des cibles
(`defenseOf`), menace terrestre (`landThreatForce`), menace navale au port d'en face (`navalThreat`), choix de la proie
du Conquérant et « je perds la guerre » (`perceivedStrength`). Test : à forteresse égale, l'IA prend exactement les
mêmes décisions que la garnison cachée soit de 1 ou de 2000 hommes.

Non concerné (point ouvert) : les réponses diplomatiques de `leaders.js` (`acceptsAlliance`, `ceasefireBias`) comparent
encore les puissances réelles (`strengthOf`) — module de l'équipe diplomatie.

## 4. PV lisibles (fiche de province)
Une seule ligne pour le **régiment** (toutes les unités de la province, navires à quai compris : ils défendent) :
- **PV** = PV restants, blessures déduites (`totalHp`) ;
- **dégâts par assaut** = feu d'une passe de combat (`firePower`, la même fonction que `resolveBattle`) :
  Σ (PV restants du type ÷ PV unitaires) × dégâts, atout « marine » du propriétaire compris, avant les multiplicateurs
  contre la cible et la forteresse adverse. Un combat dure au plus 3 assauts.
- Exemple : capitale de départ (200 fantassins, 10 cavaliers, 6 blindés, 2 canons) = « Régiment : 3910 PV · 2100 dégâts par assaut ».
- Les effectifs s'affichent en petit sous la ligne (« 40 fantassins · en convalescence »). Plus de pourcentages ni de barres.

## 5. API (`src/domain/vision.js`, réexportée par `game-engine.js`)
```js
visibleProvinces(state, map, nationId)            // Set des provinces visibles (alliés compris)
provinceIntel(state, map, nationId, provinceId)   // { ownerId, buildings, visible, friendly, entrenched, troopsKnown,
                                                  //   units|null, warships|null, force|null, regiment|null }
visionSharers(state, nationId)                    // Set : elle-même + alliés
perceivedForce(state, map, nationId, provinceId)  // force réelle si connue, sinon prudentEstimate
prudentEstimate(state, provinceId)                // estimation publique
perceivedStrength(state, map, viewer, target)     // puissance perçue d'une nation
troopsKnownTo(state, map, nationId, provinceId)
```
`src/domain/combat.js` : `firePower(force, { mode, warshipFactor })`, `regimentStats(force)` → `{ hp, maxHp, damage, wounded }`,
`regimentText(stats|null)`. Interface : `provinceTroopView`, `knownTroopProvinces` (`src/presentation/v13-vision-ui.js`).
