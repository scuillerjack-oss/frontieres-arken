# Campagne de tests — résultats et corrections (V15.6.0, 11/11/2026)

## Ce que c'est
`npm run campagne` joue 300 parties entières sans écran (5 nations × 40/80 tours × 3 niveaux × 5 façons de jouer) et
vérifie les règles à chaque tour (or, unités, convois, alliances, sauvegarde, écrans purs). Une version courte tourne
dans `npm test` (`tests/campagne.test.js`). Chaque partie a une graine : on peut la rejouer à l'identique.

## Les 4 bugs trouvés le 06/11, corrigés le 11/11 (V15.6.0)
| N° | Gravité | Bug | Correction |
|---|---|---|---|
| 1 | gênant (inatteignable depuis l'écran, atteignable par une sauvegarde abîmée) | Un nom comme « toString » ou « __proto__ » était accepté comme nation : trésor NaN, plantage de l'inter-tour | `queueDiplomaticOrder` et `queueTalk` n'acceptent que les vraies nations (`Object.hasOwn`) |
| 2 | cosmétique | Journal : « 1 unités » | accords singulier/pluriel dans `engine/journal.js` (13 phrases) |
| 3 | gênant | Convoi dérouté vers un port ami : enregistré sur une route maritime qui n'existe pas (dessiné hors des routes, aucune rencontre possible en mer) | `friendlyPortRoute` retient la vraie route maritime du trajet ; destination et durée inchangées (aucune règle modifiée) |
| 4 | cosmétique | Trêve : l'or offert par l'IA était bien versé, mais le journal disait « sans paiement » | l'événement porte `received`, le journal dit qui verse combien |

Preuves : `tests/campagne-bugs.test.js` (7 tests, tous verts, plus aucun `todo`) ; `KNOWN_BUGS` est vide, donc tout
écart fait désormais échouer la campagne.

## Résultat du 11/11/2026 après correction
300 parties, 17 548 tours, **0 invariant violé**, économie « aucune violation ».
Taux de victoire du joueur scripté par nation : Valmorne 6,7 %, Roc-Épine 11,7 %, Noireflamme 16,7 %, Oroël 3,3 %,
Solmara (aurel) 10 %. Un joueur qui joue « comme l'IA » gagne 26,7 % des parties.
À décider par Jack après sa bêta (déjà noté dans `A-FAIRE.md`) : Valmorne et Oroël gagnent peu. Rien n'a été changé.

## Parcours réel dans Chrome mobile simulé (390 × 844), le 11/11/2026
`node tools/parcours-mobile.cjs http://localhost:PORT/ 1` (1 = 40 tours, 0 = 80 tours ; demande Playwright, non installé
par `npm install`). Deux parties jouées de bout en bout par l'interface : 40 tours puis 80 tours, jusqu'à l'écran de fin.
Aucune erreur JavaScript, aucun blocage, aucun débordement horizontal. Non couvert : la reprise d'une sauvegarde V14
par l'interface (elle est couverte côté moteur par les sauvegardes de `tests/fixtures/`), et un vrai téléphone.
