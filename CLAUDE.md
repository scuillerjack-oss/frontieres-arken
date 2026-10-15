# Règles du projet FRONTIÈRES: ARKEN — à lire par toute session Claude

Jack est le propriétaire et le décideur. Il pilote depuis son téléphone Android, souvent depuis
un chantier : messages courts, en français, livrables prêts à l'emploi.

## Documents de référence (`docs/`)
- `V9-cahier-des-charges.md` … `V12-cahier-des-charges.md` : feuille de route validée avec Jack.
- `AUDIT-V6.md` : inventaire de la V6.0.2 et bugs connus (B1 à B12).
- `assets/carte-leonardo.jpg` : la carte de référence. `V8-cahier-des-charges-original.pdf` : cahier d'origine.
- Le commit « V6.0.2 telle que récupérée » est la référence intouchable de départ.

## Fusion dans `main`
Jack laisse à Claude le contrôle de GitHub. L'environnement de Claude exige une validation humaine explicite :
Claude fusionne quand Jack le lui demande dans la conversation (« fusionne », « vas-y fais-le », ou une autorisation
donnée pour une série de versions). Si le garde-fou bloque malgré tout, ne pas le contourner : Jack fusionne depuis
l'app GitHub (Merge pull request → Confirm merge).
Dans tous les cas, une Pull Request n'est fusionnée (ou présentée comme prête) que si les trois conditions sont réunies :
1. tous les tests automatiques sont au vert (workflows `Tests` et `APK Android de bêta`) ;
2. le jeu a été vérifié dans un Chrome mobile simulé (Playwright) sur le parcours réel ;
3. une relecture par un sous-agent indépendant n'a rien trouvé de bloquant.


## Bêta sur téléphone
L'installation de la PWA par Chrome échoue sur le téléphone de Jack. La bêta passe par l'APK :
https://github.com/scuillerjack-oss/frontieres-arken/releases/download/beta/frontieres-arken-beta.apk
(publié automatiquement à chaque fusion dans `main`, signé avec la clé de bêta stable `android-debug/`
pour que chaque nouvelle bêta s'installe par-dessus la précédente sans perdre la partie).

## Interdits sans accord explicite de Jack, écrit dans la conversation
- `git push --force`, `git reset --hard` sur une branche partagée, pousser directement sur `main`.
- Supprimer une branche, un fichier de jeu ou un dépôt. Reconstruire le jeu « de zéro ».
- Renommer les identifiants de nations (`valmorne`, `roc-epine`, `noireflamme`, `oroel`, `aurel`),
  de provinces (`p01`…`p20`) ou la clé de sauvegarde `frontieres-arken-v2-save` (ils sont dans les sauvegardes).
- Créer ou activer quoi que ce soit de payant. Mettre une clé, un mot de passe ou un keystore dans le dépôt
  (seule exception : la clé de DÉBOGAGE publique `android-debug/arken-debug.keystore`, réservée aux APK de bêta ;
  la vraie clé Google Play restera dans les secrets GitHub).
- Travailler sur plusieurs versions en même temps.

## Obligatoire à chaque version
- `npm test` vert avant tout push ; un test pour chaque bug corrigé. Les tests « BUG CONNU » de l'audit
  doivent être inversés quand le bug est corrigé.
- Monter `version` dans `package.json` ; vérifier après déploiement que `version.txt` publié = le commit fusionné.
- Mettre à jour le cahier de la version avec ce qui a réellement été fait.
- En cas d'ambiguïté : s'arrêter et poser UNE question claire à Jack.

## Technique
- PWA sans étape de compilation : les fichiers à la racine sont servis tels quels ; `scripts/build.js`
  copie vers `dist/` et remplace `__VERSION__` par `version+commit`.
- Tous les chemins sont relatifs : le site vit sous `/frontieres-arken/`.
- Le moteur (`src/domain/`) ne dépend pas de la géométrie ; garder `src/domain/` sans DOM, testable sous Node.
