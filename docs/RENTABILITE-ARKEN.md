# Fiche de rentabilité — FRONTIÈRES: ARKEN (V14.4, mise à jour V17.7 : voir la dernière section)

Règle du studio : « aucun jeu à perte ». Cette fiche se met à jour avant chaque publication.
Tous les chiffres sont des **ordres de grandeur prudents**, pas des promesses. Les vrais chiffres viendront d'AdMob et de la Play Console après la sortie.

## 1. Les coûts réels

| Poste | Coût par mois |
|---|---|
| Serveur / hébergement du jeu | 0 € (le jeu tourne dans le téléphone, pas de serveur) |
| Compte Google Play Console | 0 € (déjà payé, une seule fois) |
| Publicité (AdMob) | 0 € (c'est elle qui rapporte) |
| Temps de Jack | non payé, c'est le seul vrai coût |

Conséquence : **ARKEN ne peut pas perdre d'argent**. Dès le premier euro encaissé, le jeu est « en plus ». Le seuil de rentabilité est de **1 joueur**.
Attention : AdMob ne verse l'argent qu'à partir de 70 € cumulés, et Google Play verse chaque mois ce qu'il doit. Les premiers virements peuvent donc tarder.

## 2. Ce que rapporte le jeu, pour 10 000 joueurs actifs par mois

Trois façons de gagner : la pub plein écran au début d'une partie, la pub vidéo que le joueur choisit de regarder (mission), et les achats (Pack débutant et jetons).
Pour les achats : sur 2,99 € payés, TVA (20 %) et commission Google (15 %) sont retirées, il reste environ 2,12 € pour Jack.

| Par mois | Prudent (bas) | Central | Optimiste (haut) |
|---|---|---|---|
| Pubs plein écran (début de partie) | 6 € | 35 € | 127 € |
| Pubs vidéo choisies (missions) | 11 € | 105 € | 608 € |
| Achats (Pack + jetons), net | 106 € | 296 € | 571 € |
| **Total net par mois** | **122 €** | **435 €** | **1 305 €** |
| Environ après cotisations URSSAF (approximatif, ~22 %) | ~95 € | ~340 € | ~1 020 € |
| Coût de fonctionnement | 0 € | 0 € | 0 € |

Hypothèses principales (détail en tête de `tools/economie-v14-4.mjs`) :

| | Bas | Central | Haut |
|---|---|---|---|
| Gain pour 1 000 pubs plein écran (France) | 1,50 € | 3 € | 5 € |
| Gain pour 1 000 pubs vidéo (France) | 4 € | 8 € | 14 € |
| Pubs réellement servies | 60 % | 80 % | 90 % |
| Joueurs qui acceptent les pubs personnalisées | 40 % | 55 % | 70 % |
| Parties lancées par joueur et par mois | 1 | 2 | 3,5 |
| Jours de jeu par joueur et par mois | 4 | 8 | 14 |
| Joueurs qui regardent la pub-mission | 25 % | 40 % | 60 % |
| Joueurs qui prennent le Pack débutant | 0,3 % | 0,8 % | 1,5 % |
| Joueurs qui achètent des jetons | 0,2 % | 0,6 % | 1,2 % |

## 3. Combien de joueurs pour gagner X € par mois ?

« Net » = après TVA et commission Google, **avant** cotisations URSSAF. Le gain est proportionnel au nombre de joueurs.

| Objectif net par mois | Bas | Central | Haut |
|---|---|---|---|
| 100 € | ~8 200 joueurs | ~2 300 | ~770 |
| 500 € | ~41 000 | ~11 500 | ~3 800 |
| 1 000 € | ~82 000 | ~23 000 | ~7 700 |

Après cotisations (environ 22 %, approximatif, sans compter l'impôt) il faut viser environ 30 % de joueurs en plus pour garder le même montant dans la poche.
Repère pour ton objectif de quitter le chantier : même dans le cas optimiste, il faudrait plusieurs dizaines de milliers de joueurs ou plusieurs jeux. ARKEN seul est un complément, pas un salaire.

## 4. Prix recommandés (à saisir dans la Play Console)

| Produit | Prix | Net pour Jack | Pourquoi |
|---|---|---|---|
| Pack débutant (sans pub + 3 jetons) | **2,99 €** | ~2,12 € | prix « petit achat plaisir » ; 3 jetons valent ~1,20 € |
| 1 jeton (`jetons_1`) | **0,49 €** | ~0,35 € | le plus cher à l'unité, pour pousser vers les lots |
| Lot de 5 jetons (`jetons_5`) | **1,99 €** | ~1,41 € | ~0,40 € le jeton |
| Lot de 12 jetons (`jetons_12`) | **3,99 €** | ~2,83 € | ~0,33 € le jeton, meilleur rapport |

**Est-ce que ça casse la progression ?** Tout maximiser demande 50 jetons (5 atouts x 10 niveaux). Gratuitement : 1 jeton par jour si les 5 missions sont réussies, soit environ 7 semaines. En achetant : environ **17 €** (4 lots de 12 + 2 jetons). Ce n'est pas absurde : c'est un gain de confort (+10 % maximum par atout, en solo, aucun tort à personne), et le joueur gratuit arrive au même résultat. À ne pas descendre sous ce niveau : à 0,99 € les 12 jetons, tout coûterait moins de 5 € et la progression perdrait son sens.

## 5. Faiblesses honnêtes du modèle

1. **Très peu d'impressions de pub plein écran.** Une seule par partie, et une partie dure plusieurs jours : environ 2 pubs par joueur et par mois dans le cas central. C'est la plus petite source de revenu (6 à 127 €).
2. **Le prudent dépend des achats.** Dans le scénario bas, les achats font 87 % du revenu ; un seul mois sans acheteur change tout. Les taux d'achat (0,3 à 1,5 %) sont le chiffre le plus incertain.
3. **Le Pack débutant coupe la pub plein écran** : un acheteur rapporte 2,12 € une fois, puis plus que les pubs vidéo facultatives. C'est un bon deal pour lui, moyen pour le revenu long terme.
4. **Les pubs vidéo reposent sur la bonne volonté** : une seule mission pub, 7 jours sur 10. Si la récompense (1 jeton à la 5e mission) est jugée faible, peu de joueurs la regardent.
5. **Des chiffres de marché inconnus avant la sortie** (valeur des pubs en France, consentement, rétention). Ils peuvent être deux fois plus bas ou plus hauts.
6. **Premiers virements lents** (seuil de 70 € chez AdMob) et pas de revenu avant d'avoir des joueurs réels : le test fermé de Google Play ne rapportera presque rien.

## 6. Ajustements proposés (non codés, à décider par Jack)

Ils respectent tes règles : jamais de pub après un refus, jamais pendant qu'on joue ni dans le tutoriel, aucune limite aux pubs facultatives.

- **A. Pub vidéo facultative à la demande.** Un bouton « Regarder une pub : +1 jeton (ou +50 % de la prime du jour) » sur l'écran Atouts & missions, ou sur l'écran de fin de partie, sans limite par jour, jamais proposé de force. Dans la simulation, 0,5 vue de plus par jour de jeu chez les joueurs qui aiment déjà ça rapporte environ +7 % (bas), +17 % (central) et +33 % (haut) de revenu net. Attention : chaque jeton gagné ainsi raccourcit les 7 semaines, c'est à calibrer (par exemple 1 jeton pour 3 pubs).
- **B. Pub plein écran à un moment calme en plus du début de partie.** Par exemple à l'écran de fin de partie (victoire ou défaite), au moment où le joueur choisit « Nouvelle partie » : jamais pendant qu'on joue. Le Pack débutant la supprime aussi. Cela passe de ~2 à ~3-4 pubs plein écran par mois et par joueur.

Ne PAS faire : pubs pendant la partie ou le tutoriel, pub forcée après un refus, vente d'or ou de troupes.

## 7. Relancer la simulation

```
node tools/economie-v14-4.mjs
```
Version lisible par un programme : `node tools/economie-v14-4.mjs --json`. Pour tester d'autres hypothèses, modifier les valeurs en tête de `tools/economie-v14-4.mjs`, puis lancer `npm test` (le test `tests/economie-v14-4.test.js` vérifie que les résultats restent positifs et dans l'ordre bas < central < haut).


## 7. Décision du 31/10/2026 : pub bonus adoptée (ajustement A)

Jack a validé l'ajustement A. Codé en V14.4 :
- bouton « Pub bonus (facultatif) » dans l'écran Atouts & missions, **sans limite par jour**, jamais proposé de force ;
- **3 pubs regardées en entier = +1 jeton** (compteur conservé dans le profil) ; une pub fermée avant la fin ne compte pas
  et, comme partout, aucune pub n'est imposée derrière ;
- désactivé pendant le tutoriel ; reste disponible avec le Pack débutant (c'est le joueur qui choisit).

Pourquoi 3 pubs par jeton : tout maximiser demande 50 jetons, soit environ 7 semaines avec les missions seules. Avec la pub
bonus, un joueur très motivé peut aller plus vite (150 pubs pour 50 jetons), mais ça reste un vrai effort ; et chaque pub
regardée rapporte. Revenu estimé avec cette variante : ~130 € (bas), ~510 € (central), ~1 740 € (haut) par mois pour
10 000 joueurs actifs (`node tools/economie-v14-4.mjs`, ligne « variante ajustée »).

## Mise à jour V15.5 (04/11/2026)

Calcul relancé (`node tools/economie-v14-4.mjs`) : les prix et la cadence de pub n'ont pas changé depuis la V14.4, donc la base reste **122 € / 435 € / 1 305 € nets par mois pour 10 000 joueurs actifs**. Le coût de fonctionnement reste de 0 €.

Seul effet nouveau : le mode 40 tours peut augmenter le nombre de parties lancées, donc de pubs de début de partie. Si les joueurs lançaient deux fois plus de parties, ce poste gagnerait au plus **+6 € / +35 € / +127 €** par mois. Ce gain n'est pas compté dans la base : aucune donnée réelle ne le confirme. Ces chiffres restent des hypothèses, à remplacer par ceux d'AdMob et de la Play Console après le test fermé.

## Projection V17 — temps réel (19/11/2026, rien n'est encore codé)

Calcul : `node tools/v17/economie-v17.mjs` (règles dans `docs/V17-cahier-des-charges.md` §10). Mêmes hypothèses de marché
que ci-dessus ; ce qui change : la pub plein écran de début de partie disparaît, remplacée par **au plus une pub imposée
toutes les 10 min de jeu, seulement à un moment calme** (pause, menu, retour dans le jeu), jamais pour un Premium ni dans le
tutoriel ; une **pub récompensée** (icône, +1 mois de revenus) toutes les 5 à 10 min de jeu ; **Premium 1,99 €** (vitesse ×2,
plus de pub imposée, ~1,41 € net) ; le Pack débutant (2,99 €) devient Premium + 3 jetons.

| Pour 10 000 joueurs actifs / mois | Bas | Central | Haut |
|---|---|---|---|
| Pubs imposées | 12 € | 173 € | 1 201 € |
| Pubs récompensées (missions comprises) | 17 € | 240 € | 1 985 € |
| Premium + Pack | 113 € | 317 € | 635 € |
| Jetons | 42 € | 127 € | 253 € |
| **Total net par mois** | **184 €** | **856 €** | **4 074 €** |
| Joueurs pour 1 000 € nets | ~54 000 | ~11 700 | ~2 500 |
| Coût de fonctionnement | 0 € | 0 € | 0 € |

Hypothèses en plus : 12 / 20 / 30 min par séance ; moment calme dans 50 / 70 / 85 % des fenêtres de 10 min ; icônes
récompensées touchées 8 / 15 / 25 % ; Premium 0,5 / 1,5 / 3 % des joueurs, Pack 0,2 / 0,5 / 1 % ; les pubs imposées font
perdre 15 / 10 / 5 % du temps de jeu des joueurs sans Premium. Seuil de rentabilité : toujours **1 joueur**.
Prudence : le scénario haut suppose des joueurs très assidus (à lire comme un plafond) ; le vrai risque est que les pubs
imposées fassent fuir les joueurs (principal reproche fait au jeu de référence). À remplacer par les chiffres d'AdMob dès
le test fermé. Reprise par la V17.7 ci-dessous (monétisation codée).

## V17.7 — monétisation du temps réel codée (20/11/2026)

Ce qui est maintenant dans le jeu (en bêta : **emplacements de test et achats de test gratuits, rien de payant n'est activé**) :
- **Pub récompensée 🎁** : petite icône sur le bord gauche de la carte, 5 à 10 min de jeu après la précédente (minutes où le
  temps tourne, pauses exclues), qui reste tant qu'on ne l'a pas touchée ; vue en entier = **un mois de revenus (10 or
  minimum)**. Disponible aussi pour les Premium.
- **Pub imposée** : au plus **une toutes les 10 min de jeu**, et seulement à un moment calme (⏸, ouverture d'un menu hors
  jeu, retour à l'accueil, retour dans le jeu) ; jamais pendant une action, jamais dans le tutoriel, jamais pour un Premium,
  jamais après un refus (jusqu'au prochain lancement). Regarder une 🎁 remet ce compteur à zéro.
- **La pub de début de partie est supprimée.**
- **Premium 1,99 €** (achat unique, produit `premium` à créer dans la Play Console) : vitesse ×2 + plus aucune pub imposée.
  **Pack débutant 2,99 €** = Premium + 3 jetons ; les anciens acheteurs du Pack deviennent Premium automatiquement.

Calcul relancé (`node tools/v17/economie-v17.mjs`, qui lit maintenant les règles du jeu : cadence des pubs et prix) :

| Pour 10 000 joueurs actifs / mois | Prudent (bas) | Central | Optimiste (haut) |
|---|---|---|---|
| Pubs imposées (moment calme) | 12 € | 173 € | 1 201 € |
| Pubs récompensées (🎁 + missions) | 17 € | 240 € | 1 985 € |
| Premium + Pack (net) | 113 € | 317 € | 635 € |
| Jetons (net) | 42 € | 127 € | 253 € |
| **Total net par mois** | **184 €** | **856 €** | **4 074 €** |
| Environ après cotisations (~22 %) | ~144 € | ~668 € | ~3 177 € |
| Joueurs pour 1 000 € nets | ~54 000 | ~11 700 | ~2 500 |
| Coût de fonctionnement | 0 € | 0 € | 0 € |

Net par achat (après TVA 20 % et commission Google 15 %) : Premium 1,99 € → ~1,41 € ; Pack 2,99 € → ~2,12 €.

**Seuil de rentabilité : 1 joueur** (0 € de coût de fonctionnement : pas de serveur, pas d'abonnement, rien de payant activé).

Lecture honnête :
1. Les chiffres sont les mêmes que la projection V17.0 : les règles codées sont exactement celles qui avaient été simulées.
2. Le scénario haut suppose des joueurs très assidus (14 jours × 30 min par mois) : c'est un plafond, pas une prévision.
3. Le vrai risque reste la **rétention** : si la pub imposée fait fuir les joueurs, tout baisse. D'où le moment calme, le
   compteur remis à zéro par les 🎁 et le Premium bon marché. À vérifier avec les chiffres réels d'AdMob et de la Play
   Console dès le test fermé.
4. Le bonus de la 🎁 (+1 mois de revenus, ~+13 % d'or si on les prend toutes) aide sans faire gagner : on n'achète jamais
   d'or ni de troupes.
