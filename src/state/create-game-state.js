import { SAVE_SCHEMA_VERSION, LAND_UNIT_TYPES } from '../domain/constants.js';
import { validateMapDefinition } from '../map/validate-map.js';

const emptyUnits = () => Object.fromEntries(LAND_UNIT_TYPES.map(id => [id, 0]));

export function createGameState({ map, playerNationId, seed = 'arken-v0' }) {
  const checked = validateMapDefinition(map);
  if (!checked.valid) throw new Error(`invalid_map:${checked.errors.join(',')}`);
  const nationIds = map.nations.map(n => n.id);
  if (!nationIds.includes(playerNationId)) throw new Error('invalid_player_nation');
  const capitals=Object.fromEntries(nationIds.map(id=>[id,map.provinces.find(p=>p.initialOwner===id).id]));
  return {
    schemaVersion: SAVE_SCHEMA_VERSION,
    mapId: map.id,
    seed,
    turn: 1,
    turnPhase: 'planning',
    clock: { turnHours: 6 },
    playerNationId,
    controllers: Object.fromEntries(nationIds.map(id => [id, id === playerNationId ? 'human' : 'ai'])),
    nations: Object.fromEntries(nationIds.map(id => [id, { treasury: 120, eliminated: false, capitalId:capitals[id] }])),
    provinces: Object.fromEntries(map.provinces.map(p => [p.id, {
      ownerId: p.initialOwner,
      units: { ...emptyUnits(), infantry: capitals[p.initialOwner]===p.id ? 200 : 40, cavalry: capitals[p.initialOwner]===p.id ? 10 : 0, armor: capitals[p.initialOwner]===p.id ? 6 : 0, artillery: capitals[p.initialOwner]===p.id ? 2 : 0, balloon: capitals[p.initialOwner]===p.id ? 1 : 0 },
      warships: 0,
      // `portSite` is geographic eligibility; a port must be built and paid for.
      portSite: Boolean(p.port),
      buildings: { bank: 0, factory: 0, fort: 0, port: 0 }
    }])),
    seaForces: {}, orders: [], productionQueue: [], diplomacy: { wars: [], treaties: [], proposals: [] },
    ai: { memories: {}, replay: [], traits:Object.fromEntries(nationIds.filter(id=>id!==playerNationId).map((id,i)=>[id,['prudent','offensif','fidele','impulsif'][i]])) },
    orderSequence: 1,
    randomCounter: 0,
    settings:{music:true,sfx:true,hints:true}, tutorial:{seen:[],stage:0,turn:1,shown:[]}, transports:[], messages:[], events: [],
    warChestsClaimed:{}, journal:[], turnJournal:[], chronicle:[], lastJournalEventIndex:0
  };
}
