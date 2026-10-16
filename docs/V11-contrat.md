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
