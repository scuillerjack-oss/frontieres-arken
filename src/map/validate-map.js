import { MAP_SCHEMA_VERSION } from '../domain/constants.js';

export function validateMapDefinition(map) {
  const errors = [];
  if (map?.schemaVersion !== MAP_SCHEMA_VERSION) errors.push('unsupported_map_schema');
  if (!Array.isArray(map?.provinces) || map.provinces.length !== 20) errors.push('expected_20_provinces');
  if (!Array.isArray(map?.nations) || map.nations.length !== 5) errors.push('expected_5_nations');
  const ids = new Set((map?.provinces || []).map(p => p.id));
  if (ids.size !== 20) errors.push('province_ids_not_unique');
  const nationIds = new Set((map?.nations || []).map(n => n.id));
  for (const p of map?.provinces || []) {
    if (!nationIds.has(p.initialOwner)) errors.push(`invalid_owner:${p.id}`);
    if (!p.geometry || p.geometry.type !== 'polygon' || p.geometry.points.length < 3) errors.push(`invalid_geometry:${p.id}`);
    if (!p.markerAnchor || !Number.isFinite(p.markerAnchor.x) || !Number.isFinite(p.markerAnchor.y)) errors.push(`invalid_marker_anchor:${p.id}`);
    for (const to of p.landConnections || []) if (!ids.has(to)) errors.push(`unknown_land_connection:${p.id}:${to}`);
    if (p.port && !p.coastal) errors.push(`inland_port:${p.id}`);
  }
  const owners = Object.fromEntries([...nationIds].map(id => [id, 0]));
  for (const p of map?.provinces || []) owners[p.initialOwner]++;
  for (const [id, count] of Object.entries(owners)) if (count !== 4) errors.push(`expected_4_provinces:${id}:${count}`);
  for (const p of map?.provinces || []) for (const to of p.landConnections || []) {
    const reverse = map.provinces.find(x => x.id === to)?.landConnections || [];
    if (!reverse.includes(p.id)) errors.push(`asymmetric_land_connection:${p.id}:${to}`);
  }
  const seaIds = new Set((map?.seaZones || []).map(z => z.id));
  for (const z of map?.seaZones || []) for (const to of z.connections || []) if (!seaIds.has(to)) errors.push(`unknown_sea_connection:${z.id}:${to}`);
  for (const p of map?.provinces || []) if (p.port && !seaIds.has(p.port.seaZoneId)) errors.push(`unknown_port_sea_zone:${p.id}`);
  return { valid: errors.length === 0, errors };
}
