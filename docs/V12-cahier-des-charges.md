# FRONTIÈRES: ARKEN — V12 — Cahier des charges

> Modèle économique et préparation à Google Play. Part de la V11 livrée et validée par Jack.

## 1. Principe
- Jeu **gratuit**. Règle d'or : le jeu ne doit **rien coûter à faire tourner** (aucun serveur, aucun LLM).
- On ne peut **jamais** acheter de l'or ni des troupes avec de l'argent réel : seulement des avantages indirects.
- Les bêtas (PWA) n'ont **aucun paiement** : tout cela n'existe que dans la version Google Play.

## 2. Publicités
- **Une publicité au début de chaque partie** (les parties font 60 tours et durent souvent plusieurs jours).
- Une mission journalière sur cinq est une publicité facultative, environ 7 jours sur 10.

## 3. Atouts
- **5 catégories**, chacune améliorable sur **10 niveaux à +1 %**, soit +10 % au maximum :
  1. Or : +% sur les gains de chaque tour.
  2. Recrutement : +% d'infanterie recrutée (100 commandés → 110 au maximum).
  3. Construction : +% de vitesse de construction.
  4. Défense : +% de défense des forts.
  5. Marine : +% de puissance navale.
- **Coût fixe** : 1 jeton par niveau, donc 50 jetons pour tout maximiser.
- Le joueur choisit lui-même où placer ses jetons.

## 4. Missions journalières (gratuites et facultatives)
- 5 missions par jour, faciles, par exemple « conquérir 3 provinces » ou « recruter 50 infanteries ».
- 5 missions sur 5 réussies = **1 jeton**. Un joueur assidu maximise tout en environ 7 semaines.

## 5. Achats
- **Pack débutant** (achat unique) : suppression des publicités et 3 jetons immédiats.
- **Jetons à l'unité ou en lots**.

## 6. Protection des joueurs
- **Sauvegarde cloud Google Play Jeux** (gratuite) : les achats et améliorations survivent à une réinstallation.
- Le Pack débutant se restaure automatiquement via Google Play.
- Fenêtre de consentement RGPD pour les publicités, et politique de confidentialité.
- Risque accepté : changer l'horloge du téléphone permet de tricher sur les missions (jeu solo, aucun tort aux autres).

## 7. Google Play
- Génération de la clé de signature (conservée par Jack, rangée dans les secrets GitHub, jamais dans le code).
- Construction de l'AAB dans le cloud (GitHub Actions), sans Android Studio.
- Test fermé obligatoire : 12 testeurs pendant 14 jours consécutifs, puis demande d'accès à la production.

## Plus tard, seulement si le jeu décolle (ex. 100 000 téléchargements)
Multijoueur, éventuel LLM, nouveau modèle économique : à réfléchir ce jour-là, pas avant.

## Réalisé (16/10/2026, branche `mission/V12-modele-economique`, version 12.0.0)
Périmètre de cette étape : uniquement ce qui dépend du code. **Aucun vrai paiement, aucun SDK publicitaire, aucun
compte externe, aucune nouvelle dépendance.** Les points d'extension sont décrits dans `docs/V12-branchements.md`.

- **Profil joueur hors partie** : `src/domain/profile.js` (pur) + `src/presentation/profile-storage.js`, clé
  localStorage dédiée `frontieres-arken-profil` (la sauvegarde de partie `frontieres-arken-v2-save` est inchangée).
  Jetons, niveaux d'atouts, missions du jour, Pack débutant, historique des achats. Lecture/écriture protégées :
  un profil corrompu ou un stockage bloqué donne un profil neuf, sans erreur.
- **Atouts** (`src/domain/boosts.js`) : 5 catégories × 10 niveaux de +1 %, **1 jeton par niveau** (coût fixe).
  Les niveaux sont injectés dans la partie (`state.bonuses`, joueur humain seulement) à la création, au chargement et
  à chaque amélioration ; les IA n'en ont jamais. Effets dans le moteur :
  - Or : +N % du revenu de chaque tour ;
  - Recrutement : +N % d'infanterie livrée (100 commandés → 110 au niveau 10), affiché au recrutement et au journal ;
  - Construction : +N % de vitesse (un tour de chantier gagné chaque fois que le cumul atteint un tour entier) ;
  - Défense : l'effet d'un fort du joueur est multiplié par 1 + N % (sans fort : aucun effet) ;
  - Marine : dégâts des navires de guerre du joueur × (1 + N %).
  Les petits pourcentages ne se perdent pas dans les arrondis : le reste est cumulé (`state.boostCredit`).
  Sans atout, le moteur est strictement identique à la V11 (testé).
- **Missions journalières** : 5 par jour, tirées de façon déterministe à partir de la date locale (AAAA-MM-JJ),
  jamais deux du même type ; la 5e est « Regarder 1 publicité (facultatif) » environ 7 jours sur 10 (70,4 % sur un an).
  Progression lue dans les événements du moteur (tours joués, fantassins/cavaliers recrutés, constructions lancées,
  provinces conquises, combats gagnés, messages diplomatiques), cumulée sur toutes les parties du jour.
  5/5 = **1 jeton, une seule fois par jour** (même en revenant sur une date déjà récompensée).
- **Publicités** (`src/presentation/ads.js`, `ADS_ENABLED=false`) : écran « Publicité — EMPLACEMENT DE TEST · AUCUNE
  VRAIE PUBLICITÉ » de 3 s qui se ferme seul, au début de chaque nouvelle partie (sauf Pack débutant) et pour la
  mission publicité.
- **Achats** (`src/presentation/store.js`, `BILLING_ENABLED=false`) : Pack débutant (sans pub + 3 jetons, achat
  unique), 1 jeton, lots de 5 et de 12 jetons. En bêta, bouton « Achat de test (gratuit) » / « test gratuit ».
  **Règle d'or** respectée et testée : un achat ne donne que des jetons et la suppression des pubs.
- **Écran « Atouts & missions »** : bouton sur l'accueil, bouton « ✦ Atouts » sur la carte, et entrée dans les
  Paramètres. Jetons, 5 atouts (barre de 10 niveaux, bouton +1 %), missions du jour avec progression, boutique de test.
- **Sauvegarde cloud Google Play Jeux** : non implémentée (compte requis). En attendant : « Copier mon profil »
  (texte `ARKEN-PROFIL-1:…` à garder dans ses notes) et « Restaurer ».
- **Tests** : 211 au vert (190 existants + 21 V12 dans `tests/v12-modele-economique.test.js`). `sw.js` met en cache
  les 6 nouveaux modules.
- **Vérification Chrome mobile (Pixel 7, Playwright)** : accueil → Atouts & missions → achat de test du Pack (3 jetons)
  → 3 jetons sur Recrutement → nouvelle partie sans pub → recrutement de 100 fantassins affiché « +3 atout », 103
  livrés → 3 tours → mission « Lancer 2 constructions » à 1/2 → copie du profil. Second profil sans Pack : la pub de
  test s'affiche et se ferme seule après 3 s ; mission publicité validée. 0 erreur console.

Reste à faire avec Jack : voir `docs/V12-branchements.md` (AdMob, profil marchand, produits Play, Play Jeux, RGPD,
politique de confidentialité, clé de signature, AAB, test fermé).
