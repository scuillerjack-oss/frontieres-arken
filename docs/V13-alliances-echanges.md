# V13 — Lot C : alliances, échanges publics, début et déroulé de partie

> Cahier : `docs/V13-cahier-des-charges.md`, sections 4, 5 et 6 (décisions validées par Jack).
> Hors de ce lot : la mer (lot A) et le brouillard / la vision partagée entre alliés / les PV en chiffres (lot B).
> Aucun changement de schéma de sauvegarde : les nouveaux champs sont facultatifs et tolérés absents.

## 1. Pas de guerre entre alliés
- `queueDiplomaticOrder(... action:'war')` contre un allié → refus « Vous êtes alliés : rompez d’abord l’alliance ».
- `queueMoveOrder` vers une province d’un allié (terre ou mer) → refus, sauf si une **rupture** est déjà ordonnée.
- Nouvelle action diplomatique **`break` (Rompre l’alliance)**, visible seulement avec un allié (`diplomacyActions`).
  Elle est résolue **en tout début d’inter-tour**, avant les déplacements (`resolveAllianceBreaks`) :
  - rupture seule → événement public `alliance-broken` (journal DIPLOMATIE), tension +15 ;
  - rupture + attaque contre l’ancien allié dans le même tour (ou `war:true`) → **trahison** (événement `betrayal`,
    Traître révélé) : comportement V11 conservé.
- Le Traître IA : `traitorPrepare` ordonne la rupture au moment de frapper (avant ses attaques), `traitorStrike`
  l’annule s’il n’a finalement lancé aucune invasion (il garde son masque) ; après 6 tours de délai : rupture + guerre.
- Filet de sécurité : une attaque terrestre contre un allié (ordre ancien ou injecté) est annulée sans combat
  (`attack-cancelled`, raison `ally-land`). Les débarquements chez un allié rentraient déjà au port (V10).

## 2. Demandes d’aide à un allié (`src/domain/alliances.js`)
- Interface : Diplomatie d’un allié → **🤝 Demander de l’aide** : « Défends-moi » (contre quiconque m’attaque, contre
  une nation, ou sur une de mes provinces) et « Attaque X avec moi ». Gratuit. Une demande par allié et par tour.
- `queueHelpRequest` crée un ordre `help` ; à l’inter-tour, `resolveHelpRequests` décide selon le caractère
  (`helpDecision`, déterministe : `chance()` à graine) :

| Personnalité | Défends-moi | Attaque X avec moi |
|---|---|---|
| Héros | toujours | oui si X est un agresseur récent ou s’il le déteste (tension ≥ 50), sinon 35 % |
| Conquérant | oui s’il est déjà en guerre contre X, sinon 40 % | 90 % |
| Bâtisseur | 75 % | 15 % (60 % s’il est déjà en guerre contre X) |
| Traître | accepte… et ne vient pas | accepte… et ne vient pas |

  Jamais contre un allié de l’allié (refus motivé). La réponse est publiée dans les Échanges (sans bouton
  « Répondre ») et dans le journal (type **AIDE**).
- Acceptation → engagement `state.diplomacy.help[] = { ally, requester, kind, against, provinceId, turn, until, fake? }`
  pendant `HELP_TURNS` = 5 tours. Effets **réels** dans `aiPlan` de l’allié :
  - attaque : déclaration de guerre à X, X ajouté à ses cibles **en priorité** (débarquements / attaques vers X d’abord),
    pas de demande de trêve à X pendant l’engagement ;
  - défense : renforts (40 % des troupes de sa province voisine la mieux garnie) vers sa base navale — sur Arken
    toutes les frontières passent par la mer — et guerre à toute nation qui attaque le demandeur
    (ou à X, s’il est en guerre contre le demandeur).
- Traître : engagement `fake`, aucun ordre ; à l’échéance, journal « X avait promis … et n’est jamais venu » et son
  impression devient « Promet volontiers son aide… sans jamais venir » (indice pour le démasquer).

## 3. Propositions reçues : fenêtre Oui / Non
- Fin du tour : (capitale) → journal → à sa fermeture, **une fenêtre Oui / Non par proposition** reçue à cet inter-tour
  (`proposalsToAnswer(state, id, { fresh:true })`), réponse immédiate `respondToProposal` (Oui = alliance ou trêve
  conclue, Non = refus, tension +5). Le message lié n’attend plus de réponse. Les trêves proposées passent aussi
  par cette fenêtre. Fermer sans répondre laisse la réponse possible dans les Échanges (amical / hostile, V11).
- Aucune proposition d’une nation déjà alliée : filtrée dans `proposalsToAnswer` ; et la cause réelle corrigée :
  le Traître allié envoyait encore « une alliance entre nous… » (initiative de parole) → il flatte désormais sans
  proposer ; le soutien d’un Héros à une victime déjà alliée n’offre plus d’alliance.

## 4. Échanges publics (`src/domain/talk.js`)
- Lignes réécrites : hostile = provocation et humour (« vos soldats courent vite, dommage que ce soit dans le mauvais
  sens »), sans insulte ; 4 à 5 variantes hostiles par situation ; voix propre à chaque personnalité
  (`ARCHETYPE_LINES`, 3 tons × ≥ 3 variantes) utilisée une fois sur deux par les IA. `allTalkLines()` sert aux tests.
- Conversation close : une réponse n’appelle jamais de réponse ; on ne répond qu’une fois à un message (« Vous avez
  déjà répondu à ce message ») ; dès qu’une réponse est prête, plus de bouton « Répondre » et badge effacé
  (`pendingTalkIds` tient compte des ordres en attente) ; l’IA ne répond jamais à une réponse (pas d’écho).

## 5. Tension en %
- Affichée en % partout : fiche de province, fiche de nation, fenêtre d’échange, aperçu des tons
  (« Tension 10 % → 30 % (+20) »), journal TENSION, fenêtre de proposition.
- Une menace / provocation : **+20** (au lieu de +12) — le premier message hostile fait passer « tendu ».
- En guerre : `tensionLevel` renvoie le libellé **« en guerre »** (rang 4, rouge) ; plus aucun événement de palier
  de tension entre deux nations en guerre, donc plus jamais « au bord de la guerre » après un combat (une attaque
  déclare toujours la guerre immédiatement, V10).

## 6. Début et déroulé
- **Récit d’introduction** (`INTRO_STORY`, fenêtre « Quatre masques ») une fois, au début d’une nouvelle partie,
  avant les bulles du tutoriel ; pas en reprenant une sauvegarde.
- **Prise de capitale** : `RULES.capitalPlunderMin = 60`. Pillage = max(50 % du trésor, 60) ; la victime paie ce
  qu’elle a (jamais de trésor négatif), le reste est du butin. Événement `capital-plunder` enrichi
  (`fromTreasury`, `loot`, `warChest`). Fenêtres `capitalPopups` : « 👑 Capitale conquise ! Vous pillez X or »
  (total avec le trésor de guerre) ou « Votre capitale est tombée », affichées avant le journal.

## Tests
`tests/v13-alliances.test.js` (15 tests). Tests adaptés volontairement :
- `diplomacy.test.js` : « attaquer une nation alliée rompt l’alliance » devient « attaque impossible ; rompre puis
  attaquer = trahison » ;
- `v11-personnalites.test.js` : une guerre en cours affiche « en guerre » (plus « au bord de la guerre »).
