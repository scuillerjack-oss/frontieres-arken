# FRONTIÈRES: ARKEN — liste des tâches

Mise à jour : 11/11/2026. Les sessions automatiques de nuit ne prennent que la partie « Automatique », de haut en bas.
Une session lancée par Jack passe avant cette liste. Quand un point est fini, on le déplace dans « Fait » avec sa preuve.
Toujours respecter `CLAUDE.md` et les limites de `docs/V15-cahier-des-charges.md` : aucun changement de règle du jeu ni de modèle économique sans demande de Jack.

## Automatique (nuit, sans Jack)
1. Reprise d'une sauvegarde V14 par l'interface (Chrome mobile simulé), sans perte du profil. Le moteur est déjà couvert par `tests/fixtures/`.

Rien d'autre : la V16 (anglais) est en pause sur la branche `mission/V16-anglais` (voir plus bas). Ne pas inventer de travail.

## En pause — V16 anglais (branche `mission/V16-anglais`, non fusionnée)
Fait : moteur de traduction, répliques des dirigeants (fr + en), choix de la langue, journal. Reste : environ 1 100 phrases
françaises encore écrites en dur dans le code (le test `tests/i18n.test.js` les liste et fait échouer le build, c'est voulu).
À reprendre seulement après la bêta interne de Jack sur Google Play. Avant de reprendre : rebaser sur `main` (V15.6.0 a
modifié `engine/journal.js`, `engine/diplomacy.js`, `engine/convoys.js`, `talk.js`).

## Attend Jack ou ChatGPT
- Ranger les 4 secrets `PLAY_UPLOAD_*` (Jack, `docs/GUIDE-GOOGLE-PLAY-TEST-INTERNE.md`, partie A) : sans eux, aucun AAB.
- Bêta interne sur vrai téléphone : ressenti du mode 40 tours, des 3 niveaux, sons et fluidité (Jack).
- Décision après bêta : Valmorne et Oroël gagnent moins de 10 % des parties de 40 tours en simulation (Jack).
- Play Console et AdMob (ChatGPT), publication (décision de Jack).

## À ajouter
Retours de bêta de Jack, dès qu'il y en a.

## Fait
- 04/11/2026 : V15.5 fusionnée (Pull Request #26).
- 06/11/2026 : relecture indépendante de V15.1 à V15.5, rien de bloquant (V15.5.1) (voir `docs/V15-cahier-des-charges.md`).
- 11/11/2026 : V15.6.0 — campagne de tests (300 parties, 0 invariant violé) et ses 4 bugs corrigés ; parties de 40 et 80 tours jouées de bout en bout dans Chrome mobile simulé (`docs/CAMPAGNE-TESTS-V16.md`).
