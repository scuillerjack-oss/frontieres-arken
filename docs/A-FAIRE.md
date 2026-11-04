# FRONTIÈRES: ARKEN — liste des tâches

Mise à jour : 04/11/2026. Les sessions automatiques de nuit ne prennent que la partie « Automatique », de haut en bas.
Une session lancée par Jack passe avant cette liste. Quand un point est fini, on le déplace dans « Fait » avec sa preuve.
Toujours respecter `CLAUDE.md` et les limites de `docs/V15-cahier-des-charges.md` : aucun changement de règle du jeu ni de modèle économique sans demande de Jack.

## Automatique (nuit, sans Jack)
1. Relecture indépendante du code de V15.1 à V15.5 par un sous-agent (la documentation la note « à faire avant fusion » pour V15.3 et V15.4). Corriger les bugs avérés, chacun avec son test.
2. Dans Chrome mobile simulé (390 × 844), jouer une partie de 40 tours complète, y compris du tour 8 au tour 34, jamais vérifiés à la main. Corriger les blocages et affichages cassés.
3. Même contrôle sur une partie de 80 tours jusqu'à l'écran de fin, puis reprise d'une sauvegarde V14 sans perte du profil.

## Attend Jack ou ChatGPT
- Ranger les 4 secrets `PLAY_UPLOAD_*` (Jack, `docs/GUIDE-GOOGLE-PLAY-TEST-INTERNE.md`, partie A) : sans eux, aucun AAB.
- Bêta interne sur vrai téléphone : ressenti du mode 40 tours, des 3 niveaux, sons et fluidité (Jack).
- Décision après bêta : Valmorne et Oroël gagnent moins de 10 % des parties de 40 tours en simulation (Jack).
- Play Console et AdMob (ChatGPT), publication (décision de Jack).

## À ajouter
Retours de bêta de Jack, dès qu'il y en a.

## Fait
- 04/11/2026 : V15.5 fusionnée (Pull Request #26).
