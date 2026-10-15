export const SAVE_SCHEMA_VERSION = 5;
export const MAP_SCHEMA_VERSION = 1;
export const NATION_IDS = Object.freeze(['arken', 'valdor', 'kael', 'sol', 'nerys']);
export const LAND_UNIT_TYPES = Object.freeze(['infantry', 'cavalry', 'armor', 'artillery', 'balloon']);
export const NAVAL_UNIT_TYPES = Object.freeze(['warship']);
export const BUILDING_TYPES = Object.freeze(['bank', 'factory', 'fort', 'port']);

export const RULES = Object.freeze({
  baseIncome: 4, bankIncome: 3, factoryIncome: 3,
  buildings: { bank:{cost:30,turns:3}, factory:{cost:40,turns:3}, fort:{costs:[20,35,50],turns:2}, port:{cost:40,turns:3} },
  units: {
    infantry:{label:'Infanterie',amount:20,cost:20,turns:1,power:1},
    cavalry:{label:'Cavalerie',amount:5,cost:20,turns:1,power:3},
    armor:{label:'Blindés',amount:1,cost:30,turns:2,power:12,requiresFactory:true},
    artillery:{label:'Artillerie',amount:1,cost:25,turns:2,power:8,defensePower:4,requiresFactory:true},
    balloon:{label:'Ballon',amount:1,cost:20,turns:2,power:1,requiresFactory:true},
    warship:{label:'Navire de guerre',amount:1,cost:65,turns:3,power:30,requiresFactory:true,requiresPort:true}
  },
  fortDefense:[1,1.1,1.2,1.3], navalTransportPowerFactor:.12,
  warChestAmount:30
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
