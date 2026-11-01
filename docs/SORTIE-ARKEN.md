# Sortie de FRONTIÈRES: ARKEN sur Google Play — ce qui est prêt, ce que Jack doit faire

Pour Jack, depuis le téléphone. Écrit le 31/10/2026 (V14.4). Les étapes sont dans l'ordre : ne saute pas d'étape.
Si un écran ne ressemble pas à ce qui est décrit, **fais une capture d'écran** et envoie-la à Claude (ou à ChatGPT avec le bloc à la fin de ce document). Google change souvent ses menus.

## 1. Ce qui est prêt (fait par Claude)

- **Publicités (AdMob), dans la version Google Play seulement.** Une pub au début d'une nouvelle partie, une pub facultative pour la mission « publicité ».
  Jamais pendant qu'on joue, jamais dans le tutoriel ni dans la toute première partie. Si le joueur ferme une pub avant la fin, plus aucune pub ne lui est imposée jusqu'au prochain lancement. Pas de pub disponible : le jeu continue. Le Pack débutant supprime la pub de début de partie.
- **Consentement RGPD** (formulaire Google « UMP ») affiché avant la première pub, et bouton « Choix de confidentialité des publicités » dans les paramètres (et dans l'écran Atouts & missions) quand la loi l'exige.
- **Achats (Google Play Billing), dans la version Google Play seulement.** Quatre produits (voir plus bas). Les jetons ne sont crédités qu'après la confirmation de Google, sauvegardés, puis seulement alors l'achat est « consommé ». Si l'appli est fermée en plein achat, le jeu récupère l'achat au lancement suivant : un joueur ne perd jamais ses jetons. Un paiement « en attente » ne donne rien tant que Google ne l'a pas validé. On ne peut jamais acheter d'or ni de troupes.
- **La PWA et l'APK de bêta ne changent pas** : aucune vraie pub, aucun achat, aucun plugin Google dedans.
- **Identifiants de TEST Google** utilisés tant que tu n'as pas fourni les vrais. Le résumé du travail GitHub « AAB Google Play » affiche « Publicités : TEST » ou « Publicités : PRODUCTION ». Si on demande la production avec un identifiant manquant ou de test, le build **échoue exprès** (pour ne jamais publier de fausses pubs).
- **Fiche Play Store** dans le dossier `store/` : textes français et anglais, classification, sécurité des données. L'icône 512, la bannière et les captures sont préparées par le chef de projet.
- **Politique de confidentialité** : https://scuillerjack-oss.github.io/jsgames/politique-de-confidentialite-arken.html (publiée par le chef de projet sur le site du studio).

### Les 4 produits intégrés (identifiants à recopier EXACTEMENT)

| Identifiant | Type | Contenu | Prix conseillé |
|---|---|---|---|
| `pack_debutant` | Produit unique (non consommable) | Plus de pub de début de partie + 3 jetons | 2,99 € |
| `jetons_1` | Consommable | 1 jeton | 0,49 € |
| `jetons_5` | Consommable | 5 jetons | 1,99 € |
| `jetons_12` | Consommable | 12 jetons | 3,99 € |

Les prix viennent de l'étude de rentabilité (docs/RENTABILITE-ARKEN.md). Tu peux les ajuster dans la Play Console ; le jeu affiche toujours le prix lu chez Google. **Un identifiant ne peut plus être modifié une fois créé.**

## 2. Les étapes de Jack, dans l'ordre

### Étape 1. Ranger les 4 secrets de la clé d'importation dans GitHub
Suis la **Partie A** de `docs/GUIDE-GOOGLE-PLAY-TEST-INTERNE.md` : les 4 secrets `PLAY_UPLOAD_KEYSTORE_BASE64`, `PLAY_UPLOAD_KEYSTORE_PASSWORD`, `PLAY_UPLOAD_KEY_ALIAS` (valeur `upload`) et `PLAY_UPLOAD_KEY_PASSWORD`, copiés depuis ton fichier `secrets-a-copier.txt`. Fais aussi la copie de sauvegarde (Partie B). Tant que ce n'est pas fait, aucun AAB n'est fabriqué (ce n'est pas une panne).

### Étape 2. Créer l'application dans la Play Console
1. Ouvre https://play.google.com/console dans Chrome (« Version pour ordinateur » si c'est trop serré).
2. **Créer une application** : nom `FRONTIÈRES: ARKEN`, langue **Français**, type **Jeu**, **Gratuite**, coche les déclarations, **Créer l'application**.
3. Le **nom de package** de l'application est celui du jeu : `io.github.scuillerjackoss.frontieresarken`. Tu n'as rien à saisir : Google le lira dans le premier fichier AAB que tu enverras. Si on te demande un nom de package avant, c'est celui-là, exactement.

### Étape 3. Lancer le test interne
Suis les **Parties C3 et D** du même guide : télécharger `frontieres-arken.aab` (adresse fixe), créer la version dans **Test interne**, accepter la signature d'application par Google, ajouter ton Gmail comme testeur, installer le jeu depuis le Play Store.
Ajoute aussi ton Gmail comme **testeur de licence** (Play Console, Paramètres, « Test de licence ») : tes achats de test seront alors gratuits et sans risque.
À ce stade, les pubs sont des **pubs de test** et les achats des **achats de test** : c'est normal.

### Étape 4. Créer le compte AdMob, l'application AdMob et les 2 blocs d'annonces
1. Va sur https://admob.google.com avec le même compte Google, accepte les conditions.
2. **Applications** → **Ajouter une application** → Android. Si l'application n'est pas encore publiée, choisis « Non » à « Est-elle répertoriée sur un store ? » (tu pourras la lier plus tard). Nom : `FRONTIÈRES: ARKEN`.
3. Note l'**ID de l'application** : il ressemble à `ca-app-pub-` suivi de chiffres, puis `~`, puis des chiffres.
4. Dans cette application AdMob, crée **2 blocs d'annonces** :
   - type **Interstitielle**, nom `Début de partie` ;
   - type **Avec récompense**, nom `Mission publicité` (récompense : 1, type « jeton »).
5. Note l'**ID de chaque bloc** : `ca-app-pub-` chiffres, puis `/`, puis des chiffres.
6. **Confidentialité et messages** → crée le message européen (« RGPD ») pour cette application et publie-le : c'est lui qui s'affiche dans le jeu avant la première pub.
7. Ces trois identifiants ne sont **pas secrets** (ils sont visibles dans toute application publiée), mais ne clique jamais sur tes propres pubs de production.

### Étape 5. Créer les produits intégrés dans la Play Console
1. Si ce n'est pas déjà fait, crée ton **profil marchand / profil de paiement** (Play Console, Paramètres, Profil de paiement). Obligatoire pour vendre.
2. **Monétiser** → **Produits** → **Produits intégrés** → **Créer un produit**, quatre fois, avec les identifiants et prix du tableau de la section 1. Pour `pack_debutant` : produit unique. Pour les trois `jetons_…` : produit consommable (c'est le comportement par défaut d'un « produit géré » acheté plusieurs fois). Donne un nom et une description simples (ex. « Pack débutant — plus de pub de début de partie + 3 jetons »), puis **Activer** chaque produit.
3. Remplis aussi les déclarations de l'appli (Contenu de l'application) en t'aidant de `store/classification.md` et `store/securite-des-donnees.md`, et colle la fiche depuis `store/fiche-play-store.md` (et la traduction anglaise).

### Étape 6. Transmettre les identifiants à Claude
Envoie à Claude, dans la conversation, ces trois lignes (copie-colle depuis AdMob) :
- l'ID de l'application AdMob ;
- l'ID du bloc interstitielle ;
- l'ID du bloc avec récompense.

Claude les enregistre comme **variables de dépôt GitHub** (`ARKEN_ADMOB_APP_ID`, `ARKEN_ADMOB_INTERSTITIAL_ID`, `ARKEN_ADMOB_REWARDED_ID`, puis `ARKEN_ADS_PRODUCTION` = `true`). Si GitHub l'en empêche, tu peux le faire toi-même : GitHub dans Chrome, dépôt `frontieres-arken`, Settings, « Secrets and variables », Actions, onglet **Variables**, « New repository variable ».
Ensuite : onglet Actions → **AAB Google Play (test interne)** → Run workflow. Le résumé doit afficher **« Publicités : PRODUCTION »**. Si le travail échoue avec « identifiants AdMob manquants » ou « identifiant de TEST », un identifiant est mal recopié : renvoie-le à Claude.

## 3. Points à surveiller

- Les pubs de production peuvent mettre quelques heures, voire quelques jours, à s'afficher tant qu'AdMob n'a pas validé l'application (elle doit être publiée ou liée au store). Un jeu sans pub dans ce délai n'est pas une panne.
- Avec un compte développeur personnel, Google exige un **test fermé avec 12 testeurs pendant 14 jours** avant la production (cahier V12, point 7).
- Rien n'a pu être essayé sur un vrai téléphone par Claude (pas d'Android ici) : le premier test interne sert aussi de vérification. Note ce qui coince et envoie des captures.
- Le prix des produits est choisi par toi dans la Play Console ; la TVA et la commission de Google sont retirées par Google (voir l'étude de rentabilité).
- La version Play installée est une autre installation que l'APK de bêta : désinstalle l'APK avant (voir le guide, partie D).

## 4. Bloc à donner à ChatGPT pour qu'il te guide dans la Play Console

Copie tout le bloc ci-dessous (bouton « Copier » du bloc) et colle-le comme premier message dans une nouvelle conversation ChatGPT.

```text
Tu es mon guide pas à pas dans la Google Play Console et dans AdMob. Réponds toujours en français, avec des phrases courtes, comme pour un débutant complet qui travaille uniquement sur son téléphone Android (Chrome, souvent en "Version pour ordinateur"). Donne UNE seule étape à la fois, attends que je réponde "fait" ou que j'envoie une capture d'écran, puis passe à la suivante. Si un écran ne ressemble pas à ce que tu décris, demande-moi une capture plutôt que de deviner. N'invente jamais de chiffres, de prix, d'identifiants ni de menus dont tu n'es pas sûr : dis "je ne suis pas sûr, envoie-moi une capture". Ne me demande jamais mes mots de passe, ni le contenu de mon fichier de clé (secrets-a-copier.txt, .jks).

QUI JE SUIS
Je m'appelle Jack, je suis français, plombier-chauffagiste de métier, et je crée des jeux mobiles à côté avec l'aide de Claude (une IA qui écrit le code). Je suis débutant en informatique. Mon studio s'appelle JS GAMES (micro-entreprise française, SIRET reçu). Contact : scuillerjack@gmail.com. Site du studio : https://scuillerjack-oss.github.io/jsgames/

LE JEU
FRONTIÈRES: ARKEN : jeu de stratégie au tour par tour (5 nations, 20 provinces, parties de 80 tours maximum), gratuit, pour Android. Application emballée avec Capacitor. Nom de package exact : io.github.scuillerjackoss.frontieresarken. Politique de confidentialité (publiée par Claude) : https://scuillerjack-oss.github.io/jsgames/politique-de-confidentialite-arken.html
Fichier d'installation : un AAB fabriqué automatiquement par GitHub, téléchargeable ici : https://github.com/scuillerjack-oss/frontieres-arken/releases/download/play/frontieres-arken.aab (il ne s'installe pas en le touchant ; il s'importe dans la Play Console). Il est signé avec ma clé d'importation ; je veux accepter "Signature d'application par Google Play".
Dépôt GitHub (public) : scuillerjack-oss/frontieres-arken. Les secrets de signature PLAY_UPLOAD_* sont à ranger dans GitHub par moi (le guide docs/GUIDE-GOOGLE-PLAY-TEST-INTERNE.md de Claude explique comment) : ne t'en occupe pas, sauf si je te demande.

CE QUE LE JEU CONTIENT (pour remplir les déclarations honnêtement)
- Publicités : OUI, avec Google AdMob. Une publicité interstitielle au début d'une nouvelle partie (jamais pendant la partie, jamais dans le tutoriel, jamais pour qui a acheté le Pack débutant) et une publicité avec récompense, facultative, pour une mission (1 jeton). Si le joueur ferme une pub avant la fin, plus aucune pub ne lui est imposée ensuite. Un formulaire de consentement européen (UMP de Google) s'affiche avant la première pub, et un bouton "Choix de confidentialité des publicités" existe dans les paramètres.
- Achats intégrés : OUI, via Google Play Billing. Quatre produits, identifiants à recopier EXACTEMENT : pack_debutant (produit unique, non consommable : plus de pub de début de partie + 3 jetons, prix conseillé 2,99 EUR), jetons_1 (consommable, 1 jeton, 0,49 EUR), jetons_5 (consommable, 5 jetons, 1,99 EUR), jetons_12 (consommable, 12 jetons, 3,99 EUR). Les jetons servent à améliorer 5 atouts de +1 % par niveau (jusqu'à +10 %), uniquement pour le joueur. On ne peut jamais acheter d'or ni de troupes. Aucune boîte à butin, aucun jeu d'argent.
- Pas de compte, pas de connexion, pas de chat entre joueurs, pas de localisation demandée, pas de contenu généré par les utilisateurs. Les parties et le profil restent sur le téléphone.
- Violence : batailles de guerre stylisées sur une carte, résolues par des chiffres, sans sang ni personnes représentées de façon réaliste.
- Public visé : 13 ans et plus (ne pas cocher les moins de 13 ans, ne pas entrer dans le programme Familles). Application non destinée aux enfants.

SÉCURITÉ DES DONNÉES (à revérifier le jour J avec la page officielle de Google "Données divulguées par le SDK Google Mobile Ads")
Réponses prévues : l'application collecte et partage des données à cause du SDK AdMob ; chiffrées en transit : oui ; pas de compte donc pas de suppression de compte à proposer (les données de jeu sont locales). Types cochés, tous "collectés et partagés, non éphémères, obligatoires", finalités publicité/marketing, analyses, prévention de la fraude et sécurité : position approximative ; interactions avec l'application ; diagnostics ; identifiant publicitaire / identifiants d'appareil. Ne pas cocher "informations financières" (le paiement est traité par Google Play). Déclaration de l'identifiant publicitaire : oui. Les textes de la fiche (français et anglais), la classification et ces réponses détaillées sont dans le dossier store/ du dépôt, fournis par Claude.

CE QUE JE VEUX QUE TU ME FASSES FAIRE, DANS CET ORDRE
1. Créer l'application dans la Play Console (nom FRONTIÈRES: ARKEN, français, Jeu, Gratuite).
2. Remplir les déclarations obligatoires du tableau de bord (public cible 13+, classification du contenu IARC, publicités = oui, sécurité des données, politique de confidentialité, accès à l'application = sans identifiants), en me posant les questions une par une.
3. Créer le test interne : liste de testeurs avec mon Gmail, créer une version, importer l'AAB, accepter la signature par Google, déployer, puis installer depuis le lien de test. M'expliquer aussi comment m'ajouter comme "testeur de licence" pour que mes achats de test soient gratuits.
4. Profil marchand / profil de paiement, puis créer les 4 produits intégrés ci-dessus (identifiants exacts, bons types, prix conseillés modifiables), et les activer.
5. Créer le compte AdMob et l'application Android FRONTIÈRES: ARKEN, puis 2 blocs d'annonces : une interstitielle "Début de partie" et une avec récompense "Mission publicité" ; créer et publier le message de consentement européen (RGPD). À la fin, me demander de copier les 3 identifiants (ID d'application, ID du bloc interstitielle, ID du bloc avec récompense) pour les envoyer à Claude, qui les ajoutera dans GitHub. Ne me demande pas de les mettre dans le code.
6. Plus tard : préparer le test fermé (12 testeurs pendant 14 jours d'affilée, exigé pour un compte personnel) avant la demande de production, puis la fiche du Play Store.
Rappels : ne clique jamais sur mes propres pubs de production ; les identifiants de produits ne peuvent plus être modifiés une fois créés ; si Google refuse quelque chose, copie-moi le message exact pour que je le transmette à Claude. Commence maintenant par l'étape 1, en me demandant d'abord où j'en suis.
```
