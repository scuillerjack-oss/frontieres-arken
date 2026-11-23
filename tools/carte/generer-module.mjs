// Génère src/map/arken-v9-data.js à partir de tools/carte/arken-v17-12-carte.json (V17.12 : îles de la V17.11 encore
// écartées, produit par tools/carte/anneau-v17-12.py ; V17.11 : routes en anneau + étoile vers l'île mystérieuse,
// tools/carte/anneau-v17-11.py depuis arken-v9-carte.json, la carte Leonardo de référence validée par Jack).
// Usage : node tools/carte/generer-module.mjs
// Le JSON reste la source maintenable ; le module JS est ce que le jeu charge (pas de fetch, marche hors ligne).
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const src = JSON.parse(readFileSync(join(root, 'tools/carte/arken-v17-12-carte.json'), 'utf8'));

const data = {
  source: src.source,
  imageSize: src.imageSize,
  nations: src.nations.map(({ id, name, short, color, crest }) => ({ id, name, short, color, crest })),
  islands: src.islands.map(({ id, nation, provinces }) => ({ id, nation, provinces })),
  provinces: src.provinces.map(p => ({
    id: p.id, name: p.name, nation: p.nation, biome: p.biome, island: p.island,
    center: p.center, landNeighbors: p.landNeighbors, coastal: p.coastal,
    port: p.port ? { anchor: p.port.anchor } : null,
    polygon: p.polygon,
    ...(p.neutral ? { neutral: true } : {}) // V16.2 : île mystérieuse (p21), sans nation au départ
  })),
  seaRoutes: src.seaRoutes.map(({ from, to, waypoints, length }) => ({ from, to, waypoints, length }))
};

const lines = [
  '// FICHIER GÉNÉRÉ par tools/carte/generer-module.mjs depuis tools/carte/arken-v17-12-carte.json.',
  '// Ne pas modifier à la main : modifier le JSON puis relancer le générateur.',
  `// Coordonnées dans le repère de ${src.source} (${src.imageSize.join(' × ')} ; V17.12 : îles écartées, même échelle qu'en V17.11).`,
  `export const ARKEN_V9_DATA = ${JSON.stringify(data)};`,
  ''
];
writeFileSync(join(root, 'src/map/arken-v9-data.js'), lines.join('\n'));
console.log(`src/map/arken-v9-data.js : ${data.provinces.length} provinces, ${data.seaRoutes.length} routes maritimes`);
