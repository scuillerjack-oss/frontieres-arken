import { LAND_UNIT_TYPES } from '../domain/constants.js';

export function playerOrderArrows(state,map,playerNationId=state.playerNationId){
  const byId=new Map(map.provinces.map(p=>[p.id,p]));
  return (state.orders||[]).filter(o=>o.kind==='move'&&o.status==='pending'&&o.nationId===playerNationId).flatMap(order=>{
    const from=byId.get(order.fromId),to=byId.get(order.toId),target=state.provinces[order.toId];
    if(!from||!to||!target)return[];
    const attack=target.ownerId!==playerNationId&&!order.passage; // V13.4 : passage chez un allié = flèche verte
    return [{id:order.id,kind:attack?'attack':'move',color:attack?'red':'green',fromId:order.fromId,toId:order.toId,via:order.via,turns:order.turns,fromName:from.name,toName:to.name,start:from.markerAnchor,end:to.markerAnchor,routeType:order.routeType||'land'}];
  });
}

// Tracé d'un ordre : par mer, il suit la route maritime (centre → ancre du port → waypoints → bout de la route → centre) ;
// par terre, segment direct entre les centres. Les points sont dans le repère de la carte.
// V10 marine : `via` = province au bout de la route (la destination peut être une voisine côtière de `via`).
export function orderPath(map,{fromId,toId,routeType,via}){
  const byId=id=>map.provinces.find(p=>p.id===id),from=byId(fromId),to=byId(toId),end=byId(via||toId)||to;
  if(!from||!to)return[];
  const lane=routeType==='sea'?(map.seaLanes||[]).find(l=>(l.from===fromId&&l.to===end.id)||(l.from===end.id&&l.to===fromId)):null;
  if(routeType==='sea'&&(lane||(from.port&&to.port))){
    const waypoints=lane?(lane.from===fromId?lane.waypoints:[...lane.waypoints].reverse()):[];
    return[from.markerAnchor,from.port?.anchor,...waypoints,end.port?.anchor||(end.id!==to.id?end.markerAnchor:null),to.markerAnchor].filter(Boolean);
  }
  return[from.markerAnchor,to.markerAnchor];
}

// --- V10 marine : convois sur la carte ------------------------------------------------------------------------
const dist=(a,b)=>Math.hypot(b.x-a.x,b.y-a.y);
/** Point à la fraction f (0..1) de la longueur d'une polyligne. */
export function pointAlong(points,f){
  if(!points.length)return null;
  const total=points.slice(1).reduce((n,p,i)=>n+dist(points[i],p),0);
  let left=Math.max(0,Math.min(1,f))*total;
  for(let i=1;i<points.length;i++){const d=dist(points[i-1],points[i]);if(left<=d||i===points.length-1){const k=d?Math.min(1,left/d):0;return{x:points[i-1].x+(points[i].x-points[i-1].x)*k,y:points[i-1].y+(points[i].y-points[i-1].y)*k};}left-=d;}
  return points.at(-1);
}
/** Partie en mer d'un convoi : ancre de départ → waypoints → ancre du bout de la route (orientée dans son sens). */
export function convoySeaPath(map,t){
  const byId=id=>map.provinces.find(p=>p.id===id);
  const [a,b]=(t.lane||[t.fromId,t.via].sort().join('|')).split('|');
  const endId=t.via,startId=endId===a?b:a,start=byId(startId),end=byId(endId);
  if(!start||!end)return[];
  const lane=(map.seaLanes||[]).find(l=>(l.from===startId&&l.to===endId)||(l.from===endId&&l.to===startId));
  const waypoints=lane?(lane.from===startId?lane.waypoints:[...lane.waypoints].reverse()):[];
  return[start.port?.anchor||start.markerAnchor,...waypoints,end.port?.anchor||end.markerAnchor];
}
/**
 * Jetons des convois en mer : position = étape atteinte (stage / turns) sur la route, tours restants, étapes.
 * Convois du joueur : composition connue ; convois étrangers : seulement la nation et la destination.
 */
export function convoyMarkers(state,map,playerNationId=state.playerNationId){
  return (state.transports||[]).map(t=>{
    const path=convoySeaPath(map,t),turns=Math.max(1,Number(t.turns)||1),stage=Math.max(0,Math.min(turns,Number(t.stage)||0));
    const own=t.nationId===playerNationId,troops=LAND_UNIT_TYPES.reduce((n,k)=>n+(t.units?.[k]||0),0);
    return{id:t.id,nationId:t.nationId,own,fromId:t.fromId,toId:t.toId,via:t.via,returning:Boolean(t.returning),stage,turns,remaining:turns-stage,
      position:pointAlong(path,stage/turns),stages:Array.from({length:turns-1},(_,i)=>pointAlong(path,(i+1)/turns)),path,
      troops:own?troops:null,warships:own?(t.warships||0):null};
  }).filter(m=>m.position);
}

// --- V10 : PV et blessures dans la fiche d'une province (docs/V10-moteur.md §6) -----------------------------
const UNIT_SHORT={infantry:['fantassin','fantassins'],cavalry:['cavalier','cavaliers'],armor:['blindé','blindés'],artillery:['artilleur','artilleurs'],warship:['navire','navires']};
/** Lignes « 8 blindés · 92 % PV » d'une province : par type présent, nombre, PV restants / PV max (blessures). */
export function forceHealthRows(p,unitHp){
  const counts={...(p?.units||{}),warship:p?.warships||0};
  return Object.keys(UNIT_SHORT).filter(k=>(counts[k]||0)>0).map(k=>{
    const n=counts[k],max=n*(unitHp[k]||1),wounds=Math.min(max,Math.max(0,p?.wounds?.[k]||0)),hpPct=Math.round(100*(max-wounds)/max);
    return{type:k,count:n,hpPct,wounded:wounds>0,text:`${n} ${UNIT_SHORT[k][n>1?1:0]} · ${hpPct} % PV`};
  });
}

export function cancelPendingOrder(state,orderId,nationId=state.playerNationId){
  const index=(state.orders||[]).findIndex(order=>order.id===orderId&&order.nationId===nationId&&order.status==='pending');
  if(index<0)return{ok:false,error:'Ordre en attente introuvable'};
  const [order]=state.orders.splice(index,1);
  return{ok:true,order};
}

export function pinchTransform({scale,x,y,startMidX,startMidY,midX,midY,centerX,centerY,startDistance,currentDistance,maxScale=2.5,minScale=1}){
  const nextScale=!(startDistance>0&&currentDistance>0)?scale:Math.max(minScale,Math.min(maxScale,scale*currentDistance/startDistance));
  const ratio=nextScale/scale;
  return{scale:nextScale,x:midX-centerX-(startMidX-centerX-x)*ratio,y:midY-centerY-(startMidY-centerY-y)*ratio};
}

// V10 : la carte se glisse dans toutes les directions à tous les zooms (y compris vertical quand elle est
// plus petite que le cadre), avec une marge qui l'empêche de sortir complètement de l'écran.
export function mapFrameTransform(transform,viewport,mapSize,maxScale=2.5,minScale=1,edgeSlack=.3){
  const scale=Math.max(minScale,Math.min(maxScale,Number(transform.scale)||1));
  const bound=(value,content,view)=>{const limit=panLimit(content,view,edgeSlack);return Math.max(-limit,Math.min(limit,Number(value)||0));};
  return{scale,x:bound(transform.x,mapSize.width*scale,viewport.width),y:bound(transform.y,mapSize.height*scale,viewport.height)};
}

export function ceasefireOffers(targetTreasury){
  const treasury=Math.max(0,Math.floor(Number(targetTreasury)||0));
  return [.75,.5,.25].map(offerLevel=>({offerLevel,amount:Math.floor(treasury*offerLevel),acceptanceProbability:1-offerLevel}));
}

// Style d'une entrée de journal d'après son type affiché (V10 : nouvelles catégories du moteur et de la marine).
export const JOURNAL_TYPE_CLASSES=Object.freeze({'CONQUÊTE':'conquest','TERRITOIRE PERDU':'lost','⚠ TERRITOIRE PERDU':'under-attack','⚠ ON VOUS ATTAQUE':'under-attack','CONFLIT ÉTRANGER':'foreign-conflict','COMBAT':'combat',
  'AFFRONTEMENT':'foreign-conflict','PILLAGE':'plunder','ÉLIMINATION':'elimination','ORDRE ANNULÉ':'cancelled',
  'REVENUS':'treasure','INTERCEPTION':'naval','DÉBARQUEMENT':'naval','MARINE':'naval','FIN DE PARTIE':'endgame','DIPLOMATIE':'blue','diplomatie':'blue',
  // V11 : personnalités des dirigeants.
  'ÉCHANGE':'talk','TRAHISON':'betrayal','GUERRE':'combat','RÉVÉLATION':'reveal','TENSION':'tension',
  // V13 : demandes d'aide entre alliés.
  'AIDE':'help',
  // V14.2 : hostilité (avertissement à 70 %, guerre automatique à 85 %).
  '⚠ HOSTILITÉ':'under-attack','⚔ GUERRE DÉCLARÉE':'under-attack'});
export function journalCategoryClass(type){
  return JOURNAL_TYPE_CLASSES[type]||'neutral';
}

// V10 — interface (retours bêta V9, points 1 à 9). Fonctions pures, sans DOM : testables sous Node.

// Liserés de territoire : contour extérieur d'un ensemble de provinces. Les arêtes partagées par deux provinces
// du même ensemble s'annulent ; il reste la frontière avec la mer et avec les autres nations.
const edgeKey = (a, b) => { const s = `${a[0]},${a[1]}`, t = `${b[0]},${b[1]}`; return s < t ? `${s}|${t}` : `${t}|${s}`; };
export function territoryOutline(map, provinceIds) {
  const ids = new Set(provinceIds), edges = new Map();
  for (const d of map.provinces) {
    if (!ids.has(d.id)) continue;
    const pts = d.geometry.points;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length], key = edgeKey(a, b);
      if (edges.has(key)) edges.set(key, null); else edges.set(key, [a, b]);
    }
  }
  return [...edges.values()].filter(Boolean);
}
// Chemin SVG des arêtes, chaînées quand elles se suivent (moins de nœuds, jonctions propres).
export function outlinePath(segments) {
  let d = '', last = null;
  for (const [a, b] of segments) {
    if (!last || last[0] !== a[0] || last[1] !== a[1]) d += `M${a[0]} ${a[1]}`;
    d += `L${b[0]} ${b[1]}`; last = b;
  }
  return d;
}
// Nations en guerre contre le joueur (state.diplomacy.wars : participants, active).
export function nationsAtWarWith(state, nationId = state.playerNationId) {
  const out = new Set();
  for (const w of state.diplomacy?.wars || []) {
    if (w.active === false || !w.participants?.includes(nationId)) continue;
    for (const other of w.participants) if (other !== nationId) out.add(other);
  }
  return [...out];
}
// Groupes de liserés à dessiner : bleu = le joueur, rouge = chaque nation en guerre contre lui.
export function territoryBorders(state, map) {
  const own = nation => map.provinces.filter(d => state.provinces[d.id]?.ownerId === nation).map(d => d.id);
  const groups = [{ kind: 'player', nationId: state.playerNationId, provinceIds: own(state.playerNationId) }];
  for (const enemy of nationsAtWarWith(state)) groups.push({ kind: 'war', nationId: enemy, provinceIds: own(enemy) });
  // V13.2 (Jack) : liseré VERT autour des alliés — le bleu reste celui du joueur.
  for (const t of state.diplomacy?.treaties || []) if (t.active !== false && t.type === 'alliance' && t.parties?.includes(state.playerNationId))
    for (const ally of t.parties) if (ally !== state.playerNationId) groups.push({ kind: 'ally', nationId: ally, provinceIds: own(ally) });
  return groups.filter(g => g.provinceIds.length).map(g => ({ ...g, segments: territoryOutline(map, g.provinceIds) }));
}

// Flèche d'ordre : part du point de la province de départ et finit sur le point de la province d'arrivée.
// startGap / endGap (unités de carte) laissent la place au rond de la province et à la pointe de flèche.
export function trimPolyline(points, startGap = 0, endGap = 0) {
  const pts = points.map(p => ({ x: p.x, y: p.y }));
  if (pts.length < 2) return pts;
  const move = (from, to, dist) => { const len = Math.hypot(to.x - from.x, to.y - from.y) || 1, k = Math.min(dist, len * .45) / len; return { x: from.x + (to.x - from.x) * k, y: from.y + (to.y - from.y) * k }; };
  pts[0] = move(pts[0], pts[1], startGap);
  const n = pts.length - 1;
  pts[n] = move(pts[n], pts[n - 1], endGap);
  return pts;
}

// Recrutement : prérequis manquants en clair, d'après RULES.units (requiresFactory, requiresPort).
// pending = bâtiments déjà commandés dans la province (ex. { factory: 2 } = usine livrée dans 2 tours).
export function missingUnitPrerequisites(rule, buildings = {}, pending = {}) {
  const missing = [];
  const need = (flag, key, label) => {
    if (!flag || buildings[key]) return;
    missing.push(pending[key] ? `${label} (en construction, ${pending[key]} tour${pending[key] > 1 ? 's' : ''})` : label);
  };
  need(rule.requiresFactory, 'factory', 'une usine');
  need(rule.requiresPort, 'port', 'un port');
  return missing;
}
export function unitPrerequisiteText(rule, buildings = {}, pending = {}) {
  const missing = missingUnitPrerequisites(rule, buildings, pending);
  if (!missing.length) return '';
  const list = missing.length === 1 ? missing[0] : `${missing.slice(0, -1).join(', ')} et ${missing.at(-1)}`;
  return `${rule.label} : nécessite ${list} dans cette province`;
}

// Construction : raison en clair quand un bâtiment ne peut pas être commandé (affichage défensif :
// la limite « max » par province n'est lue que si le moteur la fournit dans RULES.buildings).
export function buildingUnavailableReason({ type, label, rule = {}, count = 0, built = null, portSite = true, cost = 0, spendable = Infinity }) {
  if (type === 'port' && !portSite) return `${label} : impossible ici, cette province n’a pas de site portuaire`;
  if (type === 'port' && count > 0) return `${label} : déjà construit ou en construction`;
  if (type === 'fort' && Array.isArray(rule.costs) && count >= rule.costs.length) return `${label} : niveau maximal atteint (${rule.costs.length} sur ${rule.costs.length}, en comptant les niveaux en construction)`;
  // V13.3 : un seul niveau de forteresse à la fois.
  if (type === 'fort' && built !== null && count > built) return `${label} : niveau ${built + 1} en construction, attendez qu’il soit terminé`;
  if (Number.isFinite(rule.max) && count >= rule.max) return `${label} : ${rule.max} maximum par province (déjà construite ou en construction)`;
  if (cost > spendable) return `${label} : trésor insuffisant (il manque ${cost - spendable} or)`;
  return '';
}

// Glisser la carte : la carte peut dépasser le bord du cadre d'une marge (edgeSlack × la plus petite des deux
// dimensions), dans toutes les directions et à tous les zooms, sans jamais sortir entièrement de l'écran.
export function panLimit(content, viewport, edgeSlack = .3) {
  return Math.abs(content - viewport) / 2 + edgeSlack * Math.min(content, viewport);
}
