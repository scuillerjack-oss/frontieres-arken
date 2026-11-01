# Play Console - Sécurité des données (réponses préparées pour FRONTIÈRES: ARKEN)

Play Console > Règles et programmes > Contenu de l'application > Sécurité des données.
Ces réponses reflètent le build Google Play d'ARKEN V14.4 avec le SDK Google Mobile Ads (AdMob) + UMP et Google Play Billing.
Elles s'appuient sur la documentation Google « Données divulguées par le SDK Google Mobile Ads » :
**à revérifier le jour de la déclaration**, Google peut faire évoluer la liste.
Politique de confidentialité : https://scuillerjack-oss.github.io/jsgames/politique-de-confidentialite-arken.html

## Collecte et partage

| Question | Réponse |
|---|---|
| Votre application collecte-t-elle ou partage-t-elle des types de données utilisateur obligatoires ? | **Oui** (à cause du SDK AdMob) |
| Toutes les données collectées sont-elles chiffrées en transit ? | **Oui** (le SDK Google utilise HTTPS) |
| Proposez-vous un moyen de demander la suppression des données ? | **Non** pour un compte (il n'y a pas de compte). Les données de jeu (parties, profil, jetons) sont locales et supprimées à la désinstallation. Si la Console impose une URL, donner la page de confidentialité. |

## Types de données à cocher

| Catégorie | Type | Collectée | Partagée | Traitement éphémère | Obligatoire / facultative | Finalités |
|---|---|---|---|---|---|---|
| Position | Position approximative | Oui | Oui | Non | Obligatoire | Publicité ou marketing, Analyses, Prévention des fraudes/sécurité |
| Activité dans les applications | Interactions avec l'application | Oui | Oui | Non | Obligatoire | Publicité ou marketing, Analyses, Prévention des fraudes/sécurité |
| Infos et performances de l'application | Diagnostics | Oui | Oui | Non | Obligatoire | Publicité ou marketing, Analyses, Prévention des fraudes/sécurité |
| Identifiants de l'appareil ou autres | Identifiant publicitaire / ID d'appareil | Oui | Oui | Non | Obligatoire | Publicité ou marketing, Analyses, Prévention des fraudes/sécurité |

Notes :
- « Position approximative » : AdMob déduit une position grossière à partir de l'adresse IP. ARKEN ne demande pas la permission de localisation.
- **Achats** : le paiement est traité par Google Play, JS GAMES ne reçoit pas les données de paiement. Ne pas cocher « Infos financières ».
- **Parties, profil, jetons, atouts** : stockés uniquement sur l'appareil, jamais envoyés par ARKEN : ce n'est pas une « collecte » au sens de Google.
- Pas de nom, e-mail, contacts, photos, fichiers, santé, messages, calendrier. Pas de compte, pas de chat entre joueurs.
- Consentement : le formulaire européen UMP de Google est affiché avant la première annonce ; le bouton « Choix de confidentialité des publicités » des paramètres permet de le modifier.

## Divulgations publicitaires (Contenu de l'application)

| Question | Réponse |
|---|---|
| Votre application contient-elle des annonces ? | **Oui** |
| Identifiant publicitaire (Android 13+, déclaration AD_ID) | **Oui**, utilisé pour la publicité et les analyses (le SDK AdMob ajoute la permission `com.google.android.gms.permission.AD_ID`) |
| Public cible | **13 ans et plus** (13-15, 16-17, 18+). Ne pas cocher de tranche de moins de 13 ans (évite le programme Familles). Fiche et visuels sans éléments ciblant explicitement les enfants. |
| Application destinée aux enfants ? | **Non** |
| Accès à l'application | Toutes les fonctionnalités sont accessibles sans identifiants |
| Application d'actualités / gouvernement / santé / finances | Non |
| URL de la politique de confidentialité | https://scuillerjack-oss.github.io/jsgames/politique-de-confidentialite-arken.html |
