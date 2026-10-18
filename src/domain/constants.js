// V13 : schéma 9 = suppression du ballon d'observation (migration 8 → 9 dans save-codec.js).
export const SAVE_SCHEMA_VERSION = 9;
export const MAP_SCHEMA_VERSION = 1;
export const NATION_IDS = Object.freeze(['arken', 'valdor', 'kael', 'sol', 'nerys']);
// V13 : le ballon d'observation est supprimé (remplacé par la vision : src/domain/vision.js, docs/V13-vision.md).
export const LAND_UNIT_TYPES = Object.freeze(['infantry', 'cavalry', 'armor', 'artillery']);
export const NAVAL_UNIT_TYPES = Object.freeze(['warship']);
export const BUILDING_TYPES = Object.freeze(['bank', 'factory', 'fort', 'port']);

export const RULES = Object.freeze({
  baseIncome: 4, bankIncome: 3, factoryIncome: 3, portIncome: 2,
  // V10 : `max` = plafond par province, file de construction comprise (une banque, une usine, un port, fort niveau 3).
  buildings: { bank:{cost:30,turns:3,max:1}, factory:{cost:40,turns:3,max:1}, fort:{costs:[20,35,50],turns:2,max:3}, port:{cost:40,turns:3,max:1} },
  units: {
    infantry:{label:'Infanterie',amount:20,cost:20,turns:1,power:1},
    cavalry:{label:'Cavalerie',amount:5,cost:20,turns:1,power:3},
    armor:{label:'Blindés',amount:1,cost:30,turns:2,power:12,requiresFactory:true},
    artillery:{label:'Artillerie',amount:1,cost:25,turns:2,power:8,defensePower:4,requiresFactory:true},
    warship:{label:'Navire de guerre',amount:1,cost:65,turns:3,power:30,requiresFactory:true,requiresPort:true}
  },
  // Forteresse : −10 % de dégâts reçus par niveau (niveau 0 à 3), appliqué UNIQUEMENT au défenseur
  // (les dégâts reçus par la garnison sont divisés par ce facteur).
  // V13.3 (Jack : « +30 % ne se sent pas ») : la forteresse retire vraiment 10 / 20 / 30 % des dégâts reçus
  // (avant : dégâts divisés par 1,1 / 1,2 / 1,3, soit seulement −9 / −17 / −23 %).
  fortDefense:[1,1/.9,1/.8,1/.7], navalTransportPowerFactor:.12,
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
    landingPenalty:.7,        // débarquement : les troupes qui assaillent depuis la mer font 70 % de leurs dégâts
    convoyVulnerability:1.5,  // combat naval : troupes embarquées = cargaison, ne tirent pas, dégâts reçus × 1,5
    killShare:.5,             // part des dégâts d'une passe qui tue des unités entières ; le reste devient des blessures
    maxWoundShare:.5,         // une unité ne peut pas porter plus de 50 % de PV perdus : au-delà, elle est détruite
    healRate:.1               // guérison : 10 % des PV max de la pile par tour, si la province n'a pas combattu
  },
  // V10 : réglages de l'IA (évaluation des attaques par simulation du combat).
  ai:{ attackShares:[.35,.5,.7,.9], landingExtraMargin:.25 },
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
