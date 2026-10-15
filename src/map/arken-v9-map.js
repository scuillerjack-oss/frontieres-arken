// Carte V9 « Leonardo » : 5 îles, une par nation, 4 provinces par île, 10 ports, 10 routes maritimes.
// Même format que arkenV1Map (voir validate-map.js) : le moteur ne lit que les identifiants,
// les voisinages terrestres et les routes maritimes ; la géométrie ne sert qu'à l'affichage.
import { MAP_SCHEMA_VERSION } from '../domain/constants.js';
import { ARKEN_V9_DATA as D } from './arken-v9-data.js';

// Nouvelle carte = nouvel identifiant. Une sauvegarde faite sur la carte V6 ('arken-v1-original-map')
// n'est pas reprise sur cette carte : l'accueil l'explique et propose une nouvelle partie (app.js).
export const ARKEN_V9_MAP_ID = 'arken-v9-leonardo';
const SEA_ZONE = 'mer-arken';

export const nationsV9 = Object.freeze(D.nations.map(n => Object.freeze({ ...n })));

const xy = ([x, y]) => ({ x, y });

export const arkenV9Map = Object.freeze({
  schemaVersion: MAP_SCHEMA_VERSION,
  id: ARKEN_V9_MAP_ID,
  status: 'v9-beta',
  nations: nationsV9,
  // Repère d'affichage : l'image de fond et toutes les coordonnées partagent ce cadre.
  frame: { width: D.imageSize[0], height: D.imageSize[1] },
  image: { href: 'assets/carte-leonardo.jpg', width: D.imageSize[0], height: D.imageSize[1] },
  islands: D.islands,
  // L'ordre p01..p20 est conservé : la capitale d'une nation est sa 1re province (create-game-state.js).
  provinces: D.provinces.map(p => ({
    id: p.id,
    name: p.name,
    initialOwner: p.nation,
    biome: p.biome,
    landmassId: p.island,
    geometry: { type: 'polygon', points: p.polygon },
    markerAnchor: xy(p.center),
    landConnections: [...p.landNeighbors],
    coastal: p.coastal,
    port: p.port ? { seaZoneId: SEA_ZONE, anchor: xy(p.port.anchor) } : null,
    coastalReach: p.port ? [SEA_ZONE] : []
  })),
  // Mécanique V6 inchangée : une route n'est utilisable que si les deux ports sont construits.
  seaZones: [{ id: SEA_ZONE, connections: [] }],
  maritimeRoutes: D.seaRoutes.map(r => [r.from, r.to]),
  // Tracé des routes (affichage et flèches d'ordres) : ancre du port de départ → waypoints → port d'arrivée.
  seaLanes: D.seaRoutes.map(r => ({ from: r.from, to: r.to, waypoints: r.waypoints.map(xy), length: r.length })),
  decorativeIslands: [],
  visibleRoutes: []
});

export const provinceByIdV9 = id => arkenV9Map.provinces.find(p => p.id === id);
