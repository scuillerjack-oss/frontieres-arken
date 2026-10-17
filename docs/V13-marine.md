# FRONTIÈRES: ARKEN — V13 — Mer en anneau

> Lot A du cahier V13 (section 1 « Mer »), décisions validées par Jack. Remplace les règles d'embarquement et de
> débarquement de `V10-marine.md` (durée, convois, interception, escorte et débarquement en mode « landing » inchangés).
> Code : `src/domain/game-engine.js` (section marine + IA maritime), carte : `tools/carte/arken-v9-carte.json`
> (→ `node tools/carte/generer-module.mjs`), contrôle : `python3 tools/carte/verifier.py` et `python3 tools/carte/controle.py`
> (image `tools/carte/controle-carte.png`). Tests : `tests/marine-v13.test.js`.

## La carte : un anneau de 5 routes
Chaque île est reliée **uniquement à ses 2 voisines**, aucune route n'en croise une autre, chaque point de port sert
à une seule route. Les îles éloignées se rejoignent par escale.

| Route | De | À | Longueur | Durée |
|---|---|---|---|---|
| Nord-Ouest ↔ Nord-Est | p03 Branvale (Valmorne) | p14 Nordhème (Oroël) | 236 px | 2 tours |
| Nord-Est ↔ Est | p13 Glacenoire (Oroël) | p09 Noireflamme (Noireflamme) | 90 px | 2 tours |
| Est ↔ Sud | p11 Grèsrouge (Noireflamme) | p19 Lunémont (Aurel) | 79 px | 2 tours |
| Sud ↔ Sud-Ouest | p17 Aurorelle (Aurel) | p07 Belrivage (Roc-Épine) | 86 px | 2 tours |
| Sud-Ouest ↔ Nord-Ouest | p05 Roc-Épine (Roc-Épine) | p02 Sylvaren (Valmorne) | 82 px | 2 tours |

Routes droites, sans point de passage. Ancres déplacées pour la lisibilité (toujours en mer, à moins de 30 px de la côte de
leur province) : p02, p05, p09, p11, p13, p17, p19. Supprimées : p03-p09, p03-p19, p07-p09, p07-p13, p13-p19.

## Règles
- **Points de port** : les 10 provinces qui ont un emplacement de port. Ils existent **dès le tour 1**, port construit ou non.
- **Embarquement** : uniquement depuis un point de port **qu'on possède**. Ailleurs : « X n'a pas de point de port. Embarquez
  depuis un point de port : Sylvaren, Branvale. » (ou « … conquérez un point de port pour prendre la mer »).
- **Débarquement** : uniquement sur le point de port **au bout de la route** (fin des débarquements sur les provinces voisines).
  Autre province visée : « On ne débarque qu'au point de port au bout de la route : depuis Branvale, la route mène à Nordhème. »
- **Deux sens** : chaque route se parcourt dans les deux sens, toujours.
- **Point de port conquis** : on peut y rembarquer (retour, ou suite de l'anneau depuis l'autre point de port de l'île).
- **Port construit** : nécessaire, avec une **usine** dans la même province, pour construire des **navires de guerre**
  (« Navire de guerre : il faut un port construit et une usine dans cette province (manque : …) »). Il garde ses autres rôles :
  mouillage des navires et interception des convois ennemis à l'approche. Escorte arrivée sur un point de port sans port
  construit : elle repart vers son port de départ (comportement V10 conservé).
- **Affichage** : ports aux couleurs du propriétaire de la province (non construit = pastille en pointillés « point
  d'embarquement », construit = pastille pleine cerclée d'or) ; routes neutres, une seule couleur (plus de jaune « open »).
- **Sauvegardes** : schéma inchangé. Un convoi d'une ancienne partie sur une route supprimée arrive normalement
  (renfort ou débarquement) ; il est dessiné en ligne droite.

## IA
- Embarque depuis tout point de port qu'elle possède, sans port construit.
- Base navale (port + usine + navires) : le point de port dont la route mène à la côte la plus faible ; choix stable une fois
  le port en chantier.
- Invasion sans escorte autorisée seulement si aucune flotte ennemie ne menace la route ni le port d'arrivée.
- **Rassemblement** : si la simulation montre qu'un débarquement réussirait avec des renforts, l'armée rejoint d'abord par la
  terre le point de port de départ (embarquement au tour suivant).

## Mesures (simulation IA, 5 parties)
- 60 tours : 57 convois, 50 débarquements (36 prises), tous sur des points de port ; 1er convoi entre les tours 2 et 5.
  V12 sur l'ancienne carte : 132 convois, 105 débarquements, 1er convoi au tour 7.
- 200 tours : 114 convois (20 escortés), 92 débarquements, 1 interception.
- L'anneau ralentit la guerre maritime : deux bases navales face à face (ex. Branvale ↔ Nordhème) accumulent des troupes et
  se neutralisent ; peu d'interceptions, de grosses flottes inutilisées. À surveiller pendant la bêta.
