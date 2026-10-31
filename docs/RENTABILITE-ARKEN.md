# Fiche de rentabilité — FRONTIÈRES: ARKEN (V14.4)

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
