# V11 — Contrat entre le moteur et l'interface

> Rédigé par Claude (orchestrateur) avant le travail parallèle. Le moteur l'implémente, l'interface le consomme.
> Toute évolution nécessaire est notée ici par l'agent qui la fait.

## Données dans `state` (sauvegardées, schéma 8, migration depuis 7)
- `state.leaders[nationId] = { archetype: 'heros'|'conquerant'|'traitre'|'batisseur', revealed: boolean }`
  pour chaque nation IA. Attribution aléatoire **déterministe** à partir de la graine de la partie (jamais Math.random),
  redistribuée à chaque nouvelle partie, **cachée au joueur** (`revealed` passe à true seulement quand un comportement
  caractéristique a été observé : ex. trahison d'une alliance → le Traître est révélé).
- `state.tension[a][b]` : entier 0..100, symétrique, entre deux nations. Monte avec les échanges hostiles, les menaces,
  les attaques sur un allié ; descend avec les échanges amicaux, les traités, le temps de paix.
- `state.talk` : liste d'échanges publics `{ id, turn, from, to|null, tone:'hostile'|'neutre'|'amical', text, replyTo|null }`.
  Limitée aux 60 derniers échanges (contre B8, la taille de la sauvegarde).
- `state.talkPending[nationId]` : échanges adressés au joueur en attente de réponse (ids).

## Fonctions exportées par le moteur (`src/domain/leaders.js` et `src/domain/talk.js`, purs, sans DOM)
- `talkOptions(state, map, { from, to, replyTo })` → `[{ tone, text, preview }]` : exactement 3 propositions
  (hostile, neutre, amical), textes pré-écrits adaptés à la situation (guerre, alliance, voisin, après une attaque…).
- `queueTalk(state, map, { from, to, tone, replyTo })` → `{ ok, error? }` : le message part à la résolution du tour
  (ou immédiatement, au choix du moteur : le documenter).
- `tensionLevel(state, a, b)` → `{ value, label: 'calme'|'tendu'|'hostile'|'au bord de la guerre' }`.
- `leaderHint(state, nationId)` → texte affichable pour le joueur : archétype si révélé, sinon une impression vague
  basée sur le comportement observé (ex. « Dirigeant imprévisible », « Semble pacifique »).
- Les dirigeants IA écrivent eux-mêmes dans `state.talk` pendant la résolution du tour, selon leur personnalité.

## Journal
Nouveaux types d'entrées : `ÉCHANGE` (message public), `TRAHISON`, `RÉVÉLATION` (archétype révélé), `TENSION`
(franchissement d'un seuil). L'interface leur donne une couleur via `journalCategoryClass`.

## Notes de l'agent MOTEUR (16/10/2026)
- **Graine obligatoire pour une vraie redistribution** : `createGameState` garde la graine par défaut `'arken-v0'`
  (tests). Pour que les personnalités changent à chaque partie, **app.js doit passer une graine unique** :
  `createGameState({ map, playerNationId, seed: 'arken-' + Date.now().toString(36) })` (Date.now côté interface
  est acceptable : le moteur, lui, reste sans hasard non maîtrisé). Sans graine, même nation choisie = mêmes dirigeants.
- `queueTalk` crée un **ordre** `{ kind:'talk', nationId, to, tone, text, replyTo, status:'pending' }` (une seule par
  destinataire et par tour, remplaçable) ; le message est publié dans `state.talk` à la résolution du tour.
- **Réalisé (moteur, 16/10/2026)** — `leaders.js` exporte `tensionLevel`, `leaderHint` (et `ARCHETYPES`, `assignLeaders`,
  `getTension`/`setTension`, `acceptsAlliance`…) ; `talk.js` exporte `talkOptions`, `queueTalk` (et réexporte
  `tensionLevel`, `leaderHint`). La façade `v11-talk-ui.js` fonctionne telle quelle.
- **Seuils de tension** : 0–24 calme, 25–49 tendu, 50–74 hostile, 75–100 au bord de la guerre. Départ à 10.
  Effets d'un message adressé : hostile +12, neutre −2, amical −7 (hostile « à tous » : +4 avec chacun).
  Attaque/déclaration de guerre : tension ≥ 85 ; allié de la victime +20, Héros +30 envers l'agresseur.
  Guerre : plancher 70 ; paix : −1 par tour jusqu'à 10 ; alliance : −2 par tour jusqu'à 5. Traité : alliance ≤ 5, trêve ≤ 40.
  Au-delà de 75, risque de guerre par tour : Héros 12 %, Traître 8 %, Bâtisseur 4 % ; le Conquérant n'attend pas la tension.
- **`talkOptions(...)[i]`** contient aussi `situation` ('war' | 'afterAttack' | 'aggressor' | 'ally' | 'ceasefire' |
  'neighbor' | 'default' | 'reply'). `preview` = « Tension 30 → 42 (+12) · le risque de guerre augmente ».
  `to: null` = message à tous.
- **Propositions des IA au joueur** (B9) : une IA qui propose une alliance ou un cessez-le-feu au joueur publie un
  message (dans `talkPending`) et une entrée `state.diplomacy.proposals = [{ from, to, action, turn, talkId }]`
  (valable 6 tours). **Répondre à ce message par un ton amical = accepter, hostile = refuser**, neutre = sans effet.
  Le joueur peut aussi accepter en proposant lui-même l'action par la diplomatie (acceptée d'office).
  *Suggestion interface* (non faite, hors périmètre) : sur un message lié à une proposition, afficher « amical =
  accepter l'alliance / hostile = refuser » (le journal l'indique déjà au tour de la proposition).
- **Révélation** (`leaders[id].revealed`, `revealedTurn`, `revealedBy`) : Traître à sa trahison ; Conquérant après
  avoir agressé 2 nations ; Héros quand il attaque l'agresseur d'une autre nation ; Bâtisseur à partir du tour 20 s'il
  n'a jamais attaqué et a beaucoup construit. Le joueur humain n'a pas d'entrée dans `state.leaders`.
- **Journal** : événements `talk` (ÉCHANGE, public), `betrayal` (TRAHISON, public), `reveal` (RÉVÉLATION, public),
  `tension` (TENSION, seulement pour les seuils qui concernent le joueur). L'alliance refusée par une IA apparaît en
  DIPLOMATIE (« X refuse l'alliance proposée par Y »).
- **Quota de parole** : au plus 3 messages IA par tour (propositions comprises) ; au plus 5 messages en attente
  par nation, expirés après 6 tours ; fil limité à 60.
- **app.js** : seule modification = la graine unique ci-dessus (`seed: 'arken-' + Date.now().toString(36)`).
