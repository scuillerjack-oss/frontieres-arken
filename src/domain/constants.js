export const SAVE_SCHEMA_VERSION = 6;
export const MAP_SCHEMA_VERSION = 1;
export const NATION_IDS = Object.freeze(['arken', 'valdor', 'kael', 'sol', 'nerys']);
export const LAND_UNIT_TYPES = Object.freeze(['infantry', 'cavalry', 'armor', 'artillery', 'balloon']);
export const NAVAL_UNIT_TYPES = Object.freeze(['warship']);
export const BUILDING_TYPES = Object.freeze(['bank', 'factory', 'fort', 'port']);

export const RULES = Object.freeze({
  baseIncome: 4, bankIncome: 3, factoryIncome: 3,
  // V10 : `max` = plafond par province, file de construction comprise (une banque, une usine, un port, fort niveau 3).
  buildings: { bank:{cost:30,turns:3,max:1}, factory:{cost:40,turns:3,max:1}, fort:{costs:[20,35,50],turns:2,max:3}, port:{cost:40,turns:3,max:1} },
  units: {
    infantry:{label:'Infanterie',amount:20,cost:20,turns:1,power:1},
    cavalry:{label:'Cavalerie',amount:5,cost:20,turns:1,power:3},
    armor:{label:'Blindés',amount:1,cost:30,turns:2,power:12,requiresFactory:true},
    artillery:{label:'Artillerie',amount:1,cost:25,turns:2,power:8,defensePower:4,requiresFactory:true},
    balloon:{label:'Ballon',amount:1,cost:20,turns:2,power:1,requiresFactory:true},
    warship:{label:'Navire de guerre',amount:1,cost:65,turns:3,power:30,requiresFactory:true,requiresPort:true}
  },
  // Forteresse : +10 % de défense par niveau (niveau 0 à 3), appliqué UNIQUEMENT au défenseur
  // (les dégâts reçus par la garnison sont divisés par ce facteur).
  fortDefense:[1,1.1,1.2,1.3], navalTransportPowerFactor:.12,
  warChestAmount:30,
  // V10 : prise de la capitale d'une nation = le conquérant reçoit cette part du trésor actuel du vaincu.
  capitalPlunderRate:.5,
  // V10 : combats à points de vie (voir src/domain/combat.js et docs/V10-moteur.md). Valeurs PAR UNITÉ.
  combat:{
    passes:3,
    units:{
      infantry:{hp:10,damage:5},
      cavalry:{hp:35,damage:20},
      armor:{hp:240,damage:120},
      artillery:{hp:60,damage:90},
      // Le ballon ne combat pas ; il est difficile à atteindre (poids de cible réduit) et donne un bonus de précision.
      balloon:{hp:40,damage:0,targetWeight:.2},
      warship:{hp:700,damage:260}
    },
    // multipliers[tireur][cible] (1 par défaut).
    multipliers:{
      infantry:{artillery:1.5,armor:.8,warship:.2},
      cavalry:{infantry:1.2,artillery:2,armor:.4,warship:.2},
      armor:{infantry:1.2,cavalry:2,artillery:1.5,warship:.2},
      artillery:{infantry:1.5,cavalry:1.2,armor:.8,warship:.5},
      balloon:{},
      warship:{infantry:.5,cavalry:.5,armor:.5,artillery:.5,balloon:.5,warship:1}
    },
    balloonAccuracyBonus:.15, // +15 % de dégâts pour un camp qui a au moins un ballon engagé
    landingPenalty:.7,        // débarquement : les troupes qui assaillent depuis la mer font 70 % de leurs dégâts
    convoyVulnerability:1.5,  // combat naval : troupes embarquées = cargaison, ne tirent pas, dégâts reçus × 1,5
    killShare:.5,             // part des dégâts d'une passe qui tue des unités entières ; le reste devient des blessures
    maxWoundShare:.5,         // une unité ne peut pas porter plus de 50 % de PV perdus : au-delà, elle est détruite
    healRate:.1               // guérison : 10 % des PV max de la pile par tour, si la province n'a pas combattu
  },
  // V10 : réglages de l'IA (évaluation des attaques par simulation du combat).
  ai:{ attackShares:[.35,.5,.7,.9], landingExtraMargin:.15 }
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
