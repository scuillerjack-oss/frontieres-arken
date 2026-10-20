# Bêta V13.3 — retours de Jack (20/10/2026)

Retours mot pour mot, et ce qui a été fait. Tous traités en **V13.4.0**
(détails : `docs/V13-cahier-des-charges.md`, section V13.4.0).

## 1. Alliance et droit de passage
> « Passage dans territoire allié nécessaire pour aider si guerre. Et automatiquement affecté lors de la signature de l'alliance. »

- Avant : aucun droit de passage n'existait. On ne pouvait ni entrer chez un allié ni l'aider sur place
  (un convoi qui arrivait chez un allié faisait demi-tour).
- Maintenant : **signer une alliance donne tout de suite le passage libre, dans les deux sens.**
  On peut traverser les provinces de l'allié, y laisser ses troupes (elles « stationnent ») et elles
  **défendent la province** avec lui si on l'attaque.
- **Rompre l'alliance retire le passage** : les troupes stationnées rentrent dans la province la plus proche
  (ou la capitale), et un passage prévu ce tour-là est annulé. Pas de guerre par accident.
- Les **IA alliées** s'en servent aussi : un allié qui a promis « Défends-moi » envoie des troupes chez vous,
  et le Héros vient défendre un allié attaqué.
- À l'écran : « Alliance : passage libre dans vos territoires » sur la fiche de la province alliée, dans la
  Diplomatie, dans la fenêtre Oui / Non d'alliance et dans le message de confirmation. Les provinces alliées
  sont de nouveau vertes quand on déplace des troupes.

## 2. Bonus de la forteresse
> « C'est pas marqué le/les bonus en pourcentage offert par la forteresse. »

- Le pourcentage est maintenant affiché partout, **calculé à partir des vraies valeurs du moteur**
  (−10 / −20 / −30 % de dégâts reçus aux niveaux 1 / 2 / 3, atout « Forts » compris) :
  - fiche de province : « ▣ Forteresse niveau 2 : −20 % de dégâts reçus par la garnison en défense » ;
  - menu Construction : « niveau 3 : −30 % de dégâts reçus en défense (aujourd'hui −20 %) » ;
  - avant une attaque : « ▣ Forteresse niveau 2 : ses défenseurs reçoivent −20 % de dégâts » ;
  - journal de combat et aide (?).

## 3. Mini tutoriel
> « Il faudrait également un genre de mini tuto lors de la première game. »

- 6 bulles courtes à la **première partie**, qui avancent quand on fait vraiment le geste :
  toucher sa province → recruter → déplacer → diplomatie (alliance = passage) → fin du tour → « À vous de jouer ! ».
- Bouton **« Passer »** à tout moment. Une fois terminé ou passé, il ne revient plus.
- Relançable : ⚙ Paramètres → **« Relancer le mini tuto »**.
- Il est mémorisé à part (`frontieres-arken-mini-tuto`) : la sauvegarde de partie n'est pas touchée.
