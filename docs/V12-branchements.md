# V12 — Branchements à faire plus tard (comptes de Jack)

> Tout ce qui suit ne concerne que la **version Google Play**. Les bêtas (PWA et APK de bêta) restent sans aucun
> paiement ni vraie publicité : `ADS_ENABLED=false` et `BILLING_ENABLED=false`.
> Aucune clé ni identifiant dans le dépôt : tout va dans les **secrets GitHub**.

## 1. Ce que Jack devra créer
| Quoi | Où | Notes |
|---|---|---|
| Compte développeur Google Play | Play Console | Déjà prévu (`docs/GUIDE-GOOGLE-PLAY-TEST-INTERNE.md`). |
| **Profil marchand** | Play Console → Paramètres → Profil de paiement | Obligatoire pour vendre des produits intégrés. |
| **Produits intégrés** | Play Console → Monétiser → Produits intégrés | Identifiants EXACTS : `pack_debutant` (non consommable), `jetons_1`, `jetons_5`, `jetons_12` (consommables). Prix fixés là-bas. |
| **Compte AdMob** + application | admob.google.com | Lier à l'application Play. |
| 2 **blocs d'annonces** | AdMob | « Interstitiel » (début de partie) et « Avec récompense » (mission publicité). |
| Message de **consentement RGPD** | AdMob → Confidentialité et messages | Formulaire UMP de Google, affiché avant la 1re annonce. |
| **Politique de confidentialité** | page publique (ex. GitHub Pages) | Exigée par Play et AdMob. |
| **Play Jeux (services de jeux)** | Play Console → Services de jeux Play | Pour la sauvegarde cloud (« Jeux enregistrés »). |
| Clé de signature Play | secrets GitHub | Jamais dans le code. |

## 2. Où le code se branche
### Publicités — `src/presentation/ads.js`
- `ADS_ENABLED` → `true` **uniquement** dans le build Play (remplacement au build, comme `__VERSION__`).
- Ajouter un plugin Capacitor AdMob au build Android, puis appeler au démarrage :
  `registerNativeAds({ showInterstitial: async () => …, showRewarded: async () => ({ rewarded: true|false }) })`.
- Le jeu appelle déjà `showGameStartAd({ profile })` (nouvelle partie, rien si Pack débutant) et `showRewardedAd()`
  (mission publicité). Rien d'autre à changer.

### Achats — `src/presentation/store.js`
- `BILLING_ENABLED` → `true` uniquement dans le build Play.
- `registerNativeBilling({ buy: async productId => ({ ok, orderId }), restore: async () => [{ productId, orderId }] })`
  avec un plugin Capacitor de facturation Google Play (achat **acquitté** avant de répondre `ok`).
- Le jeu applique l'achat avec `applyPurchase(profile, …)` (`src/domain/profile.js`) : idempotent sur `orderId`,
  donc une restauration ne double rien. Le Pack débutant se restaure via `restorePurchases(profile)` au démarrage.
- Les boutons « Achat de test (gratuit) » disparaissent d'eux-mêmes quand `BILLING_ENABLED` est vrai.

### Sauvegarde cloud — à faire
- Non implémentée (compte requis). Le profil est un simple texte JSON (`encodeProfile` / `decodeProfile`) : il suffira
  de l'écrire/lire dans un « jeu enregistré » Play Jeux. En attendant : « Copier mon profil » / « Restaurer »
  (`exportProfile` / `importProfile`, texte `ARKEN-PROFIL-1:…`).

## 3. Règles à ne jamais casser
- On n'achète **jamais** d'or ni de troupes : `PRODUCTS[].grants` ne peut contenir que `tokens` et `adsRemoved`
  (testé dans `tests/v12-modele-economique.test.js`).
- Atouts : 5 × 10 niveaux de +1 %, 1 jeton par niveau, joueur humain seulement.
- Missions : 5/5 = 1 jeton, une fois par jour. Changer l'horloge du téléphone permet de tricher : risque accepté.
