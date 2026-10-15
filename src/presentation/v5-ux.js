
export function playerOrderArrows(state,map,playerNationId=state.playerNationId){
  const byId=new Map(map.provinces.map(p=>[p.id,p]));
  return (state.orders||[]).filter(o=>o.kind==='move'&&o.status==='pending'&&o.nationId===playerNationId).flatMap(order=>{
    const from=byId.get(order.fromId),to=byId.get(order.toId),target=state.provinces[order.toId];
    if(!from||!to||!target)return[];
    const attack=target.ownerId!==playerNationId;
    return [{id:order.id,kind:attack?'attack':'move',color:attack?'red':'green',fromId:order.fromId,toId:order.toId,fromName:from.name,toName:to.name,start:from.markerAnchor,end:to.markerAnchor,routeType:order.routeType||'land'}];
  });
}

// Tracé d'un ordre : par mer, il suit la route maritime (centre → ancre du port → waypoints → ancre → centre) ;
// par terre, segment direct entre les centres. Les points sont dans le repère de la carte.
export function orderPath(map,{fromId,toId,routeType}){
  const byId=id=>map.provinces.find(p=>p.id===id),from=byId(fromId),to=byId(toId);
  if(!from||!to)return[];
  // V10 : le tracé par mer ne dépend plus d'un port à l'arrivée (côte reliée par une route).
  const lane=routeType==='sea'?(map.seaLanes||[]).find(l=>(l.from===fromId&&l.to===toId)||(l.from===toId&&l.to===fromId)):null;
  if(routeType==='sea'&&(lane||(from.port&&to.port))){
    const waypoints=lane?(lane.from===fromId?lane.waypoints:[...lane.waypoints].reverse()):[];
    return[from.markerAnchor,from.port?.anchor,...waypoints,to.port?.anchor,to.markerAnchor].filter(Boolean);
  }
  return[from.markerAnchor,to.markerAnchor];
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

export function journalCategoryClass(type){
  return ({'CONQUÊTE':'conquest','TERRITOIRE PERDU':'lost','CONFLIT ÉTRANGER':'foreign-conflict','COMBAT':'combat'})[type]||'neutral';
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
export function buildingUnavailableReason({ type, label, rule = {}, count = 0, portSite = true, cost = 0, spendable = Infinity }) {
  if (type === 'port' && !portSite) return `${label} : impossible ici, cette province n’a pas de site portuaire`;
  if (type === 'port' && count > 0) return `${label} : déjà construit ou en construction`;
  if (type === 'fort' && Array.isArray(rule.costs) && count >= rule.costs.length) return `${label} : niveau maximal atteint`;
  if (Number.isFinite(rule.max) && count >= rule.max) return `${label} : ${rule.max} maximum par province (déjà construite ou en construction)`;
  if (cost > spendable) return `${label} : trésor insuffisant (il manque ${cost - spendable} or)`;
  return '';
}

// Glisser la carte : la carte peut dépasser le bord du cadre d'une marge (edgeSlack × la plus petite des deux
// dimensions), dans toutes les directions et à tous les zooms, sans jamais sortir entièrement de l'écran.
export function panLimit(content, viewport, edgeSlack = .3) {
  return Math.abs(content - viewport) / 2 + edgeSlack * Math.min(content, viewport);
}
