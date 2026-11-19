// V13 : schéma 9 = suppression du ballon d'observation (migration 8 → 9 dans save-codec.js).
// V15.1 : schéma 10 = coalition et histoire de la partie (migration 9 → 10 dans save-codec.js).
// V15.3 : schéma 11 = niveau de difficulté de la partie (migration 10 → 11 : les anciennes parties valent Normal).
export const SAVE_SCHEMA_VERSION = 11;
// V15.4 : schéma d'une Partie courte (state.gameLength). Une partie de 80 tours reste au schéma 11, à l'octet près : voir saveSchemaOf.
export const SHORT_GAME_SCHEMA_VERSION = 12;
export const saveSchemaOf = state => state?.gameLength ? SHORT_GAME_SCHEMA_VERSION : SAVE_SCHEMA_VERSION;
export const MAP_SCHEMA_VERSION = 1;
export const NATION_IDS = Object.freeze(['arken', 'valdor', 'kael', 'sol', 'nerys']);
// V13 : le ballon d'observation est supprimé (remplacé par la vision : src/domain/vision.js, docs/V13-vision.md).
export const LAND_UNIT_TYPES = Object.freeze(['infantry', 'cavalry', 'armor', 'artillery']);
export const NAVAL_UNIT_TYPES = Object.freeze(['warship']);
export const BUILDING_TYPES = Object.freeze(['bank', 'factory', 'fort', 'port']);
// Troupes de départ (create-game-state.js) : la capitale, et chacune des 3 autres provinces d'une nation.
// V16.2 : la garnison de l'île mystérieuse en dérive (mystery-island.js).
export const START_UNITS = Object.freeze({
  capital: Object.freeze({ infantry: 200, cavalry: 10, armor: 6, artillery: 2 }),
  province: Object.freeze({ infantry: 40, cavalry: 0, armor: 0, artillery: 0 })
});

export const RULES = Object.freeze({
  baseIncome: 4, bankIncome: 5, // V16.0 : banque +5 (avant +3)
  factoryIncome: 3, portIncome: 2,
  // V10 : `max` = plafond par province, file de construction comprise (une banque, une usine, un port, fort niveau 3).
  buildings: { bank:{cost:30,turns:3,max:1}, factory:{cost:40,turns:3,max:1}, fort:{costs:[20,35,50],turns:2,max:3}, port:{cost:40,turns:3,max:1} },
  units: {
    infantry:{label:'Infanterie',amount:20,cost:20,turns:1,power:1},
    cavalry:{label:'Cavalerie',amount:5,cost:20,turns:1,power:3},
    armor:{label:'Blindés',amount:1,cost:30,turns:2,power:12,requiresFactory:true},
    artillery:{label:'Artillerie',amount:1,cost:25,turns:2,power:8,defensePower:4,requiresFactory:true},
    warship:{label:'Navire de guerre',amount:1,cost:65,turns:3,power:30,requiresFactory:true,requiresPort:true}
  },
  // Forteresse : −5 % de dégâts reçus par niveau (V16.0 ; V13.3 : −10 %), niveau 0 à 3, appliqué UNIQUEMENT au défenseur
  // (les dégâts reçus par la garnison sont divisés par ce facteur).
  // V13.3 (Jack : « +30 % ne se sent pas ») : la forteresse retirait 10 / 20 / 30 % des dégâts reçus (V16.0 : 5 / 10 / 15 %)
  // (avant : dégâts divisés par 1,1 / 1,2 / 1,3, soit seulement −9 / −17 / −23 %).
  fortDefense:[1,1/.95,1/.9,1/.85], // V16.0 (Jack) : −5 % de dégâts reçus par niveau (avant −10 %)
  navalTransportPowerFactor:.12,
  warChestAmount:30,
  // V10 : prise de la capitale d'une nation = le conquérant reçoit cette part du trésor actuel du vaincu.
  capitalPlunderRate:.5,
  // V13 : minimum garanti du pillage d'une capitale (or), payé même si la victime est pauvre (butin de la ville).
  capitalPlunderMin:60,
  // V10 : combats à points de vie (voir src/domain/combat.js et docs/V10-moteur.md). Valeurs PAR UNITÉ.
  combat:{
    passes:3,
    units:{
      infantry:{hp:10,damage:5},
      cavalry:{hp:35,damage:20},
      armor:{hp:240,damage:120},
      artillery:{hp:60,damage:90},
      warship:{hp:700,damage:260}
    },
    // multipliers[tireur][cible] (1 par défaut).
    multipliers:{
      infantry:{artillery:1.5,armor:.8,warship:.2},
      cavalry:{infantry:1.2,artillery:2,armor:.4,warship:.2},
      armor:{infantry:1.2,cavalry:2,artillery:1.5,warship:.2},
      artillery:{infantry:1.5,cavalry:1.2,armor:.8,warship:.5},
      warship:{infantry:.5,cavalry:.5,armor:.5,artillery:.5,warship:1}
    },
    // V14.2 (Jack : « enlever le malus ») : réduit 70 % → 85 %, pas supprimé (carte d'îles : sans malus, les IA abuseraient
    // des débarquements). Calibré par simulation : voir docs/V14-cahier-des-charges.md, Réalisé V14.2.
    landingPenalty:.85,       // débarquement : les troupes qui assaillent depuis la mer font 85 % de leurs dégâts
    convoyVulnerability:1.5,  // combat naval : troupes embarquées = cargaison, ne tirent pas, dégâts reçus × 1,5
    killShare:.5,             // part des dégâts d'une passe qui tue des unités entières ; le reste devient des blessures
    maxWoundShare:.5,         // une unité ne peut pas porter plus de 50 % de PV perdus : au-delà, elle est détruite
    healRate:.1               // guérison : 10 % des PV max de la pile par tour, si la province n'a pas combattu
  },
  // V10 : réglages de l'IA (évaluation des attaques par simulation du combat).
  // V14.1 : marge de débarquement 0,25 → 0,10, sauf vers une capitale (0,35) ; rassemblement dès la moitié des forces utiles.
  // V15.1 : `lateTurn` = à partir de ce tour, plus personne ne s'endort ; `finishProvinces` = nation assez affaiblie pour être achevée ;
  // `capitalBusyMargin` = marge de débarquement sur une capitale dont la nation se bat déjà ailleurs.
  ai:{ attackShares:[.35,.5,.7,.9], landingExtraMargin:.1, capitalLandingMargin:.35, capitalBusyMargin:.25, stagingFactor:.5, lateTurn:45, lateBlindFactor:2, finishProvinces:3, builderLateTurn:45, builderLateStrength:1, builderSpendLots:3, baseAtCapital:{ batisseur:1, traitre:1 } },
  // V15.3 : bonus de chaque nation, en %, sur les mêmes mécaniques que les atouts (src/domain/nations.js pour les textes).
  // Modestes et servant aussi aux IA. Calibrés par simulation : docs/V15-cahier-des-charges.md, Réalisé V15.3.
  nationBonus:{ valmorne:{ recruit:15 }, 'roc-epine':{ fort:15 }, noireflamme:{ build:10 }, oroel:{ naval:10 }, aurel:{ gold:4 } },
  // V15.3 : niveaux de difficulté (src/domain/difficulty.js). Normal n'a aucun réglage. marginAdd : marge d'attaque en plus ; oneAttack : une seule attaque
  // terrestre par tour ; warDelay : tours d'attente du Conquérant ; ambition : achever et viser le plus fort ; spendLots : blindés
  // en plus par tour quand le trésor le permet ; aiGoldPct : or en plus pour les IA, annoncé au joueur.
  difficulty:{ facile:{ marginAdd:.3, oneAttack:true, warDelay:8, ambition:false }, normal:{}, difficile:{ marginAdd:-.05, spendLots:2, aiGoldPct:15 } },
  // V15.3 : `builderLateTurn`, `builderLateStrength`, `builderSpendLots` = fin de partie du Bâtisseur (engine/ai.js) ; `baseAtCapital` = part des
  // dirigeants de ce caractère qui gardent leur base navale à leur capitale (graine de la partie) : docs/V15-cahier-des-charges.md, Réalisé V15.3.
  // V15.1 : coalition (engine/coalition.js). Seuils calibrés par simulation : docs/V15-cahier-des-charges.md, Réalisé V15.1.
  coalition:{ formProvinces:7, formLead:3, dissolveProvinces:5, builderExtra:2, minTurn:10 },
  // V13 : vision (brouillard de guerre, src/domain/vision.js). Quand les troupes d'une province ne sont pas connues,
  // l'IA ne lit jamais l'effectif réel : elle suppose une garnison « prudente » tirée de ce qui est public
  // (capitale ou non, port construit, tour de jeu), multipliée par (1 + growthPerTurn × (tour − 1)).
  vision:{
    provinceEstimate:{ infantry:60 },
    capitalEstimate:{ infantry:200, cavalry:10, armor:6, artillery:2 },
    portWarshipsEstimate:1,
    growthPerTurn:.03
  },
  // V10 marine (docs/V10-marine.md) : durée d'une traversée = max(minTurns, arrondi supérieur de length / stageLength)
  // tours, length = longueur de la route en unités de la carte (1536 × 1536). 1 tour = 1 étape en mer.
  naval:{ stageLength:150, minTurns:2 },
  // V14.4 (retour de Jack : « débarquements presque toujours repoussés par les forteresses ») : bombardement d'une
  // forteresse côtière par les navires de guerre. Brèche = part de la protection de la forteresse neutralisée (en %).
  // Calibré par simulation : docs/V14.4-cahier-des-charges.md, Réalisé, Équipe gameplay.
  bombard:{
    breachPerShip:12,      // brèche ouverte par un navire de guerre intact (proportionnelle à la puissance de feu)
    maxPerTurn:30,         // plafond de brèche ajoutée en un tour (toutes flottes confondues) : jamais tout en un tour
    repairPerTurn:10,      // un tour sans bombardement : la brèche se referme de 10 points
    // V16.0 (Jack : « les navires de guerre ne peuvent attaquer que les troupes qui sont dans l'eau ») : plus aucun
    // dégât sur la garnison ; le bombardement n'ouvre plus qu'une brèche dans les murs.
    garrisonShare:0,       // (V14.4 : 0,2) dégâts à la garnison
    garrisonMaxShare:.05   // plafond des dégâts à la garnison (sans effet tant que garrisonShare = 0) : à 5 % des PV de la garnison par tour (blessures seulement, aucun mort)
  },
  // V16.1 : ballon d'observation (src/domain/engine/balloons.js, docs/V16-cahier-des-charges.md). Un objet à part
  // (state.balloons), pas une unité : rien à voir avec l'ancien ballon supprimé en V13 (migration 8 → 9).
  // cost / turns : construction (usine requise) ; hopTurns : tours par saut d'une nation à sa voisine par la mer ;
  // max : ballons par nation, bonusMax si elle possède bonusProvince (île mystérieuse, V16.2) ; aiReserve : or que l'IA
  // garde après avoir payé son ballon.
  balloon:{ cost:30, turns:2, hopTurns:2, max:1, bonusMax:2, bonusProvince:'p21', aiReserve:60 },
  // V16.2 : île mystérieuse (src/domain/mystery-island.js, docs/V16-cahier-des-charges.md). Une province neutre au centre de
  // la carte. garrisonFactor : garnison de départ = ce multiple de TOUTES les troupes d'une nation en début de partie (même
  // composition) ; elle ne recrute ni ne bouge jamais. bankIncome : super banque, or par tour au propriétaire (partagée
  // moitié-moitié avec un co-propriétaire). routeTurns : durée des 5 routes vers l'île (2 entre nations). aiMargin : marge
  // de l'IA sur la garnison simulée avant de débarquer ; aiKeepShare : part des troupes que l'IA garde sur l'île quand elle
  // en part pour débarquer ailleurs ; aiMinGarrison : garnison (fantassins équivalents) que l'IA maintient sur l'île.
  mysteryIsland:{ provinceId:'p21', garrisonFactor:3, bankIncome:10, routeTurns:4, aiMargin:1.15, aiKeepShare:.5, aiMinGarrison:200 },
  // V10 : fin de partie à la fin du tour RULES.gameLength (V13.2 : 80, avant 60) (classement : provinces, puis capitales tenues, puis trésor) ;
  // victoire anticipée d'une nation qui tient les 5 capitales.
  gameLength:80
});

export const HISTORICAL_RULE_REFERENCE = Object.freeze({
  sourceCommit: '315897812616aa94cfb9562d4ff09cc4b694bf60',
  turnHours: 6,
  provinceCount: 20,
  nationCount: 5,
  initialProvincesPerNation: 4,
  units: LAND_UNIT_TYPES,
  buildings: ['bank', 'factory', 'fort'],
  status: 'reference-only-not-final-balance'
});
