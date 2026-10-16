# Guide : recevoir les bêtas par le Test interne Google Play

Pour Jack, à faire depuis le téléphone. Compter environ 30 minutes la première fois,
puis 2 minutes à chaque nouvelle bêta.

**Le principe en une phrase.** À chaque fusion dans `main`, GitHub fabrique un fichier
`frontieres-arken.aab` (le format que Google Play demande). Ce fichier est signé avec ta
**clé d'importation**, une clé secrète qui prouve à Google que c'est bien toi qui envoies
la mise à jour. Tu importes ce fichier dans la Play Console, et le jeu s'installe sur ton
téléphone depuis le Play Store, sans avertissement Play Protect.

Claude t'a donné un fichier `secrets-a-copier.txt` (et le fichier de clé
`frontieres-arken-upload.jks`). Garde-les sous la main.

> Si un écran ne ressemble pas à ce qui est décrit ici, ou si tu es bloqué :
> **fais une capture d'écran et envoie-la à Claude.** Google change souvent ses menus.

---

## Partie A. Ranger la clé dans GitHub (4 secrets)

Les secrets GitHub sont un coffre-fort : GitHub s'en sert pour fabriquer l'AAB, mais
personne ne peut les relire, pas même Claude.

1. Sur le téléphone, ouvre **Chrome** (le site, pas l'app GitHub : l'app ne gère pas les
   secrets) et va sur
   `https://github.com/scuillerjack-oss/frontieres-arken/settings/secrets/actions`
   Si la page s'affiche en version mobile réduite, menu ⋮ de Chrome → coche
   **Version pour ordinateur**.
2. Touche le bouton vert **New repository secret**.
3. Dans **Name**, colle le nom du secret. Dans **Secret**, colle la valeur. Touche
   **Add secret**.
4. Recommence pour les 4 secrets (noms à recopier exactement, en majuscules) :

   | Name                            | Secret (valeur, dans `secrets-a-copier.txt`) |
   |---------------------------------|----------------------------------------------|
   | `PLAY_UPLOAD_KEYSTORE_BASE64`   | la très longue ligne de texte                |
   | `PLAY_UPLOAD_KEYSTORE_PASSWORD` | le mot de passe                              |
   | `PLAY_UPLOAD_KEY_ALIAS`         | `upload`                                     |
   | `PLAY_UPLOAD_KEY_PASSWORD`      | le même mot de passe                         |

   Pour la très longue ligne : appui long dessus → **Tout sélectionner** → **Copier**.
   Elle doit être copiée en entier, sans rien ajouter.
5. À la fin, la page doit afficher les 4 noms (les valeurs restent cachées, c'est normal).
6. Pour fabriquer l'AAB tout de suite, sans attendre la prochaine fusion : onglet
   **Actions** → **AAB Google Play (test interne)** → **Run workflow** → **Run workflow**.
   Au bout d'environ 10 minutes, la coche doit être verte.

Tant que ces secrets n'existent pas, ce travail se termine quand même en vert, avec le
message « clé d'importation non configurée ». Ce n'est pas une panne.

---

## Partie B. Garder une copie de sauvegarde de la clé (très important)

1. Mets le fichier `frontieres-arken-upload.jks` **et** le fichier `secrets-a-copier.txt`
   dans un dossier **privé** de ton Google Drive (par exemple « Coffre ARKEN »).
   Ne partage jamais ce dossier.
2. Ne les envoie à personne et ne les mets jamais dans le dépôt GitHub.

**Pourquoi.** GitHub ne laisse pas relire un secret. Si un jour il faut reconfigurer la
fabrication (nouveau dépôt, nouvel outil), cette copie sera la seule source.
Si la clé est perdue ou volée, ce n'est pas la fin du jeu : grâce à la « signature
d'application par Google » (partie C), Google garde la vraie clé de l'appli et tu peux lui
demander de remplacer ta clé d'importation. Mais c'est une démarche auprès du support qui
prend plusieurs jours. Une copie bien rangée évite tout ça.

---

## Partie C. Préparer l'application dans la Play Console (une seule fois)

Sur le téléphone, ouvre `https://play.google.com/console` dans Chrome
(en **Version pour ordinateur** si la page est trop serrée).

### C1. Créer l'application
1. Touche **Créer une application**.
2. Nom de l'application : `FRONTIÈRES: ARKEN`.
3. Langue par défaut : **Français**.
4. Application ou jeu : **Jeu**.
5. Gratuite ou payante : **Gratuite**.
6. Coche les déclarations demandées (règlement du programme, lois d'exportation),
   puis **Créer l'application**.

### C2. Ce que Google peut te demander avant le premier envoi
Honnêtement, cela dépend de ton compte et Google le change régulièrement. Sur le
**Tableau de bord** de l'appli, Google affiche une liste de tâches à faire. Pour un test
interne, il peut demander tout ou partie de :
- une **fiche** minimale (description courte, icône, captures) ;
- des **déclarations** : public cible (choisir des tranches d'âge adultes, pas les
  enfants), classification du contenu (un questionnaire : jeu de stratégie, pas de violence
  réaliste, pas de jeu d'argent), publicités (non), accès à l'application (tout est
  accessible sans compte), sécurité des données (le jeu ne collecte aucune donnée : les
  parties restent sur le téléphone) ;
- une **règle de confidentialité** (une adresse web). Si elle est exigée, demande-la à
  Claude : il peut la rédiger et la publier sur le site du jeu.

Remplis ce qui bloque, et envoie une capture à Claude au moindre doute.

### C3. Créer le test interne et importer le premier AAB
1. Télécharge le fichier sur le téléphone :
   `https://github.com/scuillerjack-oss/frontieres-arken/releases/download/play/frontieres-arken.aab`
   (il arrive dans **Téléchargements**). C'est un fichier pour Google Play : il ne
   s'installe pas en le touchant, c'est normal.
2. Dans la Play Console, menu de gauche : **Tester et publier** (ou « Test et
   publication ») → **Tests** → **Test interne**.
3. Onglet **Testeurs** → **Créer une liste d'adresses e-mail** → nom « Moi » → ajoute ton
   adresse Gmail (celle du téléphone) → **Enregistrer les modifications**.
   Coche cette liste, puis **Enregistrer**.
4. Touche **Créer une version**.
5. **Signature d'application** : si Google propose la signature d'application gérée par
   Google Play (« Play App Signing », clé générée par Google), **accepte**. C'est le choix
   recommandé, et c'est ce qui permet de récupérer la situation si ta clé d'importation est
   un jour perdue. Ne choisis pas d'importer ta propre clé d'application.
6. **Importer** → choisis `frontieres-arken.aab` dans Téléchargements.
   Google enregistre au passage ta clé d'importation (rien d'autre à faire).
7. Nom de la version et notes : laisse ce qui est proposé ou écris « Bêta V10 ».
8. **Suivant** → **Enregistrer** → **Déployer** (ou « Lancer le déploiement en test
   interne »). Si un avertissement jaune apparaît, ce n'est pas bloquant ; s'il est rouge,
   envoie une capture à Claude.

---

## Partie D. Installer le jeu sur le téléphone

1. Retourne dans **Test interne** → onglet **Testeurs** → **Copier le lien**
   (le lien d'inscription). Pour le tout premier envoi, ce lien peut mettre quelques
   heures à apparaître.
2. Ouvre ce lien sur le téléphone **avec le compte Gmail que tu as mis dans la liste**.
3. Touche **Accepter l'invitation** (devenir testeur), puis le lien vers le Play Store.
4. Dans le Play Store : **Installer**. Le nom affiché peut être provisoire pendant les
   premières 48 heures.

**L'ancienne bêta (APK) et la version Play Store sont deux installations différentes**
(signatures différentes) : Android refusera d'installer l'une par-dessus l'autre. Pour passer
au Play Store, il faut **désinstaller l'APK de bêta**, et la partie en cours de l'APK sera
perdue. Fais-le à un moment où ça ne te dérange pas (début de partie).

---

## Partie E. Les fois suivantes (2 minutes)

À chaque fusion dans `main`, GitHub fabrique automatiquement un nouvel AAB au même endroit.

1. Télécharge le nouveau fichier (même adresse qu'en C3, étape 1).
2. Play Console → **Test interne** → **Créer une version** → **Importer** → **Enregistrer**
   → **Déployer**.
3. Quelques minutes plus tard, le Play Store propose la mise à jour sur le téléphone. Les
   parties sont conservées, car c'est la même appli avec la même signature.

Si Google répond « Le code de version … a déjà été utilisé », c'est que tu as importé le
même fichier deux fois. Attends le prochain AAB, ou demande à Claude d'en relancer un.

---

## Pour plus tard (pas maintenant)
- **Publication publique.** Avec un compte personnel, Google exige d'abord un **test fermé
  avec 12 testeurs pendant 14 jours d'affilée** avant d'autoriser la production (cahier V12, §7).
- **Envoi automatique.** GitHub pourrait envoyer l'AAB tout seul à Google Play, sans la
  partie E. Il faut pour ça un « compte de service » Google à créer ensemble. C'est prévu
  plus tard.

## Aide-mémoire technique (pour Claude)
- Workflow : `.github/workflows/android-aab.yml`. Signature : `scripts/android-prepare.js`
  (signingConfig `arkenPlay`, utilisée seulement si `ARKEN_PLAY_STORE_FILE` est défini).
- Empreinte SHA-256 du certificat d'importation (publique) :
  `73:97:64:E9:74:E9:4F:24:3D:4F:43:E1:13:A0:A1:32:63:04:41:FE:40:A4:D4:81:E5:29:9F:74:CD:22:35:CF`
  On la retrouve dans la Play Console : **Configuration → Intégrité de l'application →
  Signature d'application**, rubrique « certificat de la clé d'importation ».
- versionCode Play = `10000 + numéro d'exécution du workflow`. Ne jamais baisser le décalage.
