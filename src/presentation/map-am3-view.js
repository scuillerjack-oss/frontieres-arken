// V17.6 — carte « façon AM 3 » : fonctions PURES (sans DOM), testables sous Node (tests/v17-6.test.js).
//  1. Défilement horizontal sans fin : la carte est dessinée en plusieurs copies côte à côte ; la translation
//     horizontale est ramenée « modulo » la largeur d'une copie (on sort à droite, on revient par la gauche, sans à-coup
//     puisque les copies sont identiques). Le vertical reste borné (mapFrameTransform).
//  2. Niveaux de détail selon le zoom (monde → région → province).
//  3. Pastille du nombre de troupes : texte et couleur selon la vision du joueur (src/domain/vision.js, lu sans modification).
//  4. Grands noms de nations en travers de leur île (position, angle, taille dans le repère de la carte).
import { mapFrameTransform } from './map-orders-view.js';
import { provinceIntel, perceivedForce, visibleProvinces } from '../domain/vision.js';

// --- 1. Bouclage horizontal --------------------------------------------------------------------------------------------

/**
 * V17.10.2 (retour de Jack : « on a l'impression qu'il y a 15 territoires », « deux fois le même ennemi autour de moi ») :
 * océan entre deux répétitions du monde, en LARGEURS DE CARTE. C'est la constante unique du bouclage : si la carte
 * change (nations espacées, île déplacée), tout suit (période, copies, zoom minimal). Avec 2,25, la période vaut
 * 3,25 largeurs : sur un téléphone couché (~860 × 390), le zoom minimal (WORLD_FIT) montre le monde entier, et jamais
 * deux fois le même point à l'écran (au plus un bout de répétition sur un bord quand on fait défiler).
 */
export const WRAP_OCEAN = 2.25;
/**
 * V17.10.2 : au zoom minimal, la carte n'occupe que 72 % de la vue « contain » : le monde entier reste visible ENTRE la
 * barre d'infos (en haut) et la barre du temps (en bas), avec de la marge (l'autre équipe peut écarter les nations).
 */
export const WORLD_FIT = .72;
/**
 * V17.12 (retour de Jack du 23/11 : « une espèce de grosse tache » au zoom minimal) : les îles sont écartées, le cadre de la
 * carte grandit (1536 × 1536 → 1826 × 1900) sans que les îles changent de taille. Le ZOOM reste défini par rapport à
 * l'ancien cadre : zoom 1 = autant de pixels par unité de carte qu'avant (« cover » d'un cadre de 1536 × 1536). Zoom
 * maximal, vue de lancement, taille des icônes et niveaux de détail sont donc identiques à la V17.11 ; seul le zoom
 * minimal descend plus bas, pour montrer le monde entier.
 */
export const ZOOM_REFERENCE = Object.freeze({ width: 1536, height: 1536 });
/** Pixels par unité de carte au zoom 1 (« cover » du cadre de référence). */
export const zoomOneScale = (viewport, ref = ZOOM_REFERENCE) => Math.max(Number(viewport?.width) / ref.width, Number(viewport?.height) / ref.height);
/** Période horizontale du bouclage (repère de la carte) : largeur de la carte + océan. */
export const wrapPeriod = (frame, ocean = WRAP_OCEAN) => Number(frame?.width) * (1 + ocean);
/** Même période, en pixels au zoom 1, pour une carte de largeur `contentWidth` pixels. */
export const wrapPeriodPx = (contentWidth, ocean = WRAP_OCEAN) => Number(contentWidth) * (1 + ocean);

/** Ramène x dans [-width/2, width/2[ (width = période du bouclage à l'écran, en pixels). */
export function wrapX(x, width) {
  const w = Number(width), v = Number(x) || 0;
  if (!(w > 0)) return v;
  const r = ((v + w / 2) % w + w) % w - w / 2;
  return Math.abs(r) < 1e-9 ? 0 : r;
}

/**
 * Nombre de copies à dessiner DE CHAQUE CÔTÉ de la carte d'origine pour que l'écran soit toujours couvert, quel que soit
 * x dans [-W/2, W/2[ : la carte d'origine (centrée sur le milieu de l'écran + x) peut finir au milieu de l'écran, il faut
 * alors ceil((largeur écran / 2) / W) copies pour aller jusqu'au bord. W = période au zoom minimal (le pire cas).
 */
export function wrapCopyCount(viewportWidth, periodAtMinZoom) {
  const vw = Number(viewportWidth), w = Number(periodAtMinZoom);
  if (!(vw > 0) || !(w > 0)) return 1;
  return Math.max(1, Math.ceil(vw / 2 / w - 1e-9));
}

/** Transformation de la carte : zoom borné, vertical borné (comme avant), horizontal bouclé sur la période (pixels au zoom 1). */
export function wrapTransform(transform, viewport, content, maxZoom, minZoom, edgeSlack, periodWidth = wrapPeriodPx(content.width)) {
  const bounded = mapFrameTransform(transform, viewport, content, maxZoom, minZoom, edgeSlack);
  return { scale: bounded.scale, x: wrapX(transform.x, periodWidth * bounded.scale), y: bounded.y };
}

/**
 * Toucher une copie : de combien déplacer la carte (en pixels) pour amener la carte d'origine sous le doigt.
 * La copie n°k est dessinée k périodes à droite de l'origine : on décale de k périodes (invisible, copies identiques).
 */
export const copyShift = (copyIndex, content, scale, periodWidth = wrapPeriodPx(content.width)) => (Number(copyIndex) || 0) * periodWidth * scale;

/**
 * Zoom minimal. V17.10.2 (retour de Jack : « il faut réellement pouvoir dézoomer », « je ne vois même pas les informations
 * complètes de mon pays ») : on descend jusqu'à WORLD_FIT × la vue « contain » (le monde entier, 5 nations et île
 * mystérieuse, tient à l'écran hors des barres d'interface), sauf si l'écran est plus large qu'une PÉRIODE (carte +
 * océan) : jamais deux fois le même point à l'écran. Zoom 1 = carte « cover ». Résultat ≤ 1.
 * Avant (V17.6) : jamais plus d'une largeur de carte, d'où un zoom minimal de 1 en paysage.
 */
export function wrapMinZoom(viewport, frame, period = wrapPeriod(frame), fit = WORLD_FIT, ref = frame) {
  const vw = Number(viewport?.width), vh = Number(viewport?.height);
  if (!(vw > 0) || !(vh > 0)) return 1;
  // V17.12 : `ref` = cadre qui définit le zoom 1 (ZOOM_REFERENCE dans l'interface ; par défaut le cadre lui-même).
  const cover = Math.max(vw / ref.width, vh / ref.height), contain = Math.min(vw / frame.width, vh / frame.height);
  return Math.min(1, Math.max(fit * contain / cover, vw / (period * cover)));
}

/** Repère de la carte (x) ramené dans la période d'origine [0, période[ (période = largeur de carte + océan). */
export const wrapMapX = (x, period) => ((Number(x) % period) + period) % period;

// --- 2. Niveaux de détail ------------------------------------------------------------------------------------------------

/** Seuils en pixels d'écran par unité de carte (indépendant de la taille du téléphone). */
export const DETAIL_THRESHOLDS = Object.freeze({ region: .6, province: 1.0 });
export const DETAIL_NAMES = Object.freeze(['monde', 'region', 'province']);
/**
 * 0 = « monde » (zoom minimal) : grands noms de nations, pastilles de troupes, drapeaux des capitales ; noms de provinces,
 *     bâtiments et points d'embarquement masqués.
 * 1 = « région » : + noms de provinces, bâtiments, ports.
 * 2 = « province » (zoom fort) : tout, noms de nations estompés.
 */
export function detailLevel(pixelsPerUnit) {
  const k = Number(pixelsPerUnit) || 0;
  return k >= DETAIL_THRESHOLDS.province ? 2 : k >= DETAIL_THRESHOLDS.region ? 1 : 0;
}

/**
 * Échelle des icônes (--ui) : les pastilles et noms grossissent un peu dans le repère de la carte quand on dézoome
 * (sinon illisibles vue du monde entier) et rétrécissent quand on zoome (sinon énormes) : zoom^-0,6.
 */
export const iconScale = scale => Math.pow(Math.max(.05, Number(scale) || 1), -.6);

// --- 3. Pastilles de troupes ---------------------------------------------------------------------------------------------

/** Nombre court : 950 → « 950 », 1 234 → « 1,2k », 12 500 → « 13k ». */
export function formatTroops(n) {
  const v = Math.max(0, Math.round(Number(n) || 0));
  if (v < 1000) return String(v);
  if (v < 10000) return `${(Math.round(v / 100) / 10).toString().replace('.', ',')}k`;
  return `${Math.round(v / 1000)}k`;
}

const allied = (state, a, b) => (state.diplomacy?.treaties || []).some(t => t.active !== false && t.type === 'alliance' && t.parties?.includes(a) && t.parties?.includes(b));

/** Couleur de la pastille : 'own' (vert), 'ally' (bleu), 'enemy' (rouge), 'neutral' (gris : garnison neutre). */
export function badgeTone(state, ownerId, viewer = state.playerNationId) {
  if (ownerId === null || ownerId === undefined) return 'neutral';
  if (ownerId === viewer) return 'own';
  return allied(state, viewer, ownerId) ? 'ally' : 'enemy';
}

/**
 * Pastille d'une province pour `viewer` : { text, tone, known, count }.
 * Troupes connues (ses provinces, celles des alliés, provinces ennemies visibles et non retranchées) : effectif exact
 * (unités terrestres + navires, renforts stationnés compris, comme la force perçue) ; sinon « ? ».
 * `seen` : ensemble visibleProvinces déjà calculé (facultatif).
 */
export function troopBadge(state, map, provinceId, seen = null, viewer = state.playerNationId) {
  const visible = seen || visibleProvinces(state, map, viewer);
  const intel = provinceIntel(state, map, viewer, provinceId, visible);
  const tone = badgeTone(state, intel?.ownerId ?? null, viewer);
  if (!intel || !intel.troopsKnown) return { text: '?', tone, known: false, count: null };
  const force = perceivedForce(state, map, viewer, provinceId, visible);
  const count = Object.values(force.units || {}).reduce((a, b) => a + (Number(b) || 0), 0);
  return { text: formatTroops(count), tone, known: true, count };
}

/** Toutes les pastilles d'un coup (une seule passe de vision). */
export function troopBadges(state, map, viewer = state.playerNationId) {
  const seen = visibleProvinces(state, map, viewer);
  return Object.fromEntries(map.provinces.map(d => [d.id, troopBadge(state, map, d.id, seen, viewer)]));
}

// --- 4. Grands noms de nations -------------------------------------------------------------------------------------------

function polygonStats(points) {
  let a = 0, cx = 0, cy = 0;
  for (let i = 0; i < points.length; i++) {
    const [x0, y0] = points[i], [x1, y1] = points[(i + 1) % points.length], f = x0 * y1 - x1 * y0;
    a += f; cx += (x0 + x1) * f; cy += (y0 + y1) * f;
  }
  a /= 2;
  if (Math.abs(a) < 1e-9) { const n = points.length || 1; return { area: 0, x: points.reduce((s, p) => s + p[0], 0) / n, y: points.reduce((s, p) => s + p[1], 0) / n }; }
  return { area: Math.abs(a), x: cx / (6 * a), y: cy / (6 * a) };
}

/**
 * Étiquettes de nations : une par groupe de provinces d'un même propriétaire sur une même île (landmassId), quand le
 * groupe compte au moins 2 provinces ou que c'est le plus grand groupe de la nation (une nation réduite à une province
 * garde son nom). La garnison neutre (propriétaire null) n'a pas d'étiquette.
 * @returns {{ nationId, text, x, y, angle, size, provinceIds }[]} dans le repère de la carte ; angle en degrés (±22 max).
 */
export function nationLabels(map, state, shortName = id => map.nations.find(n => n.id === id)?.short || id) {
  const groups = new Map();
  for (const d of map.provinces) {
    const owner = state.provinces[d.id]?.ownerId;
    if (owner === null || owner === undefined) continue;
    const key = `${owner}|${d.landmassId}`;
    if (!groups.has(key)) groups.set(key, { nationId: owner, provinceIds: [] });
    groups.get(key).provinceIds.push(d.id);
  }
  const all = [...groups.values()], largest = new Map();
  for (const g of all) { const best = largest.get(g.nationId); if (!best || g.provinceIds.length > best.provinceIds.length) largest.set(g.nationId, g); }
  const out = [];
  for (const g of all) {
    if (g.provinceIds.length < 2 && largest.get(g.nationId) !== g) continue;
    const defs = g.provinceIds.map(id => map.provinces.find(p => p.id === id));
    // Centre = barycentre des polygones pondéré par leur aire.
    let area = 0, x = 0, y = 0;
    for (const d of defs) { const s = polygonStats(d.geometry.points); const w = s.area || 1; area += w; x += s.x * w; y += s.y * w; }
    x /= area; y /= area;
    // Axe principal des sommets (ACP 2 × 2) : le nom suit la longueur de l'île.
    const pts = defs.flatMap(d => d.geometry.points);
    let sxx = 0, syy = 0, sxy = 0;
    for (const [px, py] of pts) { sxx += (px - x) ** 2; syy += (py - y) ** 2; sxy += (px - x) * (py - y); }
    let angle = 0.5 * Math.atan2(2 * sxy, sxx - syy) * 180 / Math.PI;
    // Île plus haute que large : le nom la traverse à l'horizontale ; sinon il suit l'île, incliné de 22° au plus.
    angle = Math.abs(angle) > 45 ? 0 : Math.max(-22, Math.min(22, angle));
    // Étendue le long de l'axe retenu et en travers : taille des lettres.
    const r = angle * Math.PI / 180, ux = Math.cos(r), uy = Math.sin(r);
    let minA = Infinity, maxA = -Infinity, minB = Infinity, maxB = -Infinity;
    for (const [px, py] of pts) { const a = (px - x) * ux + (py - y) * uy, b = -(px - x) * uy + (py - y) * ux; minA = Math.min(minA, a); maxA = Math.max(maxA, a); minB = Math.min(minB, b); maxB = Math.max(maxB, b); }
    const text = String(shortName(g.nationId)).toLocaleUpperCase('fr');
    const chars = Math.max(3, [...text].length);
    // Lettres espacées de 0,22 em : largeur ≈ chars × 0,9 em. Le nom occupe ~85 % de la longueur de l'île.
    const size = Math.round(Math.max(56, Math.min(120, (maxA - minA) * .85 / (chars * .9), (maxB - minB) * .36)));
    out.push({ nationId: g.nationId, text, x: Math.round(x), y: Math.round(y), angle: Math.round(angle * 10) / 10, size, provinceIds: g.provinceIds });
  }
  return out.sort((a, b) => a.nationId < b.nationId ? -1 : a.nationId > b.nationId ? 1 : a.x - b.x);
}
