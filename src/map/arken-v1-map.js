import { MAP_SCHEMA_VERSION } from '../domain/constants.js';

export const nationsV1 = Object.freeze([
  { id:'valmorne', name:'Royaume de Valmorne', short:'Valmorne', color:'#65a85a', crest:'stag' },
  { id:'roc-epine', name:'Confédération de Roc-Épine', short:'Roc-Épine', color:'#d99a2b', crest:'lion' },
  { id:'noireflamme', name:'Empire de Noireflamme', short:'Noireflamme', color:'#c74737', crest:'serpent' },
  { id:'oroel', name:"Ligue d'Oroël", short:"Oroël", color:'#5595d9', crest:'wolf' },
  { id:'aurel', name:"Alliance d'Aurel", short:'Aurel', color:'#2aa99b', crest:'sun' }
]);

const defs = [
 ['p01','Valmorne','valmorne','forest','west',[48,42],[['p02'],['p04']]],
 ['p02','Sylvaren','valmorne','forest','west',[104,39],[['p01'],['p03'],['p04']]],
 ['p03','Branvale','valmorne','plains','west',[151,68],[['p02'],['p04'],['p07']]],
 ['p04','Haut-Bois','valmorne','forest','west',[89,78],[['p01'],['p02'],['p03'],['p05'],['p06']]],
 ['p05','Roc-Épine','roc-epine','dry','west',[49,116],[['p04'],['p06'],['p08'],['p09']]],
 ['p06','Faucongris','roc-epine','dry','west',[102,112],[['p04'],['p05'],['p07'],['p08']]],
 ['p07','Belrivage','roc-epine','dry','west',[152,116],[['p03'],['p06'],['p08']]],
 ['p08','Terrefort','roc-epine','dry','west',[91,145],[['p05'],['p06'],['p07'],['p09'],['p10']]],
 ['p09','Noireflamme','noireflamme','volcanic','west',[48,173],[['p05'],['p08'],['p10'],['p11']]],
 ['p10','Cendrelac','noireflamme','volcanic','west',[107,176],[['p08'],['p09'],['p11'],['p12']]],
 ['p11','Grèsrouge','noireflamme','volcanic','west',[75,211],[['p09'],['p10'],['p12']]],
 ['p12','Cornérive','noireflamme','volcanic','west',[146,211],[['p10'],['p11']]],
 ['p13','Glacenoire','oroel','snow','east',[280,47],[['p14']]],
 ['p14','Nordhème','oroel','snow','east',[266,87],[['p13'],['p15'],['p16']]],
 ['p15','Îlebrume','oroel','snow','east',[326,94],[['p14'],['p16']]],
 ['p16','Tréfond','oroel','snow','east',[291,135],[['p14'],['p15'],['p17']]],
 ['p17','Aurorelle','aurel','plains','east',[264,178],[['p16'],['p18'],['p19']]],
 ['p18','Valdoré','aurel','forest','east',[330,178],[['p17'],['p20']]],
 ['p19','Lunémont','aurel','mountain','east',[278,218],[['p17'],['p20']]],
 ['p20','Clairazur','aurel','plains','east',[337,218],[['p18'],['p19']]]
];

const shape=(x,y,i)=>{const w=46,h=31,dx=(i%3)*2;return [[x-w/2,y-h/2],[x-5,y-h/2-4],[x+w/2,y-8],[x+w/2-dx,y+11],[x+5,y+h/2+3],[x-w/2-2,y+8]]};
const coastal=new Set(['p03','p07','p09','p11','p12','p13','p15','p16','p17','p18','p20']);
const ports={p07:'sea-west',p11:'sea-south',p12:'sea-south',p13:'sea-north',p15:'sea-east',p16:'sea-center',p17:'sea-center',p20:'sea-east'};

export const arkenV1Map = Object.freeze({
 schemaVersion:MAP_SCHEMA_VERSION,id:'arken-v1-original-map',status:'v1-beta-candidate',
 nations:nationsV1,
 provinces:defs.map(([id,name,initialOwner,biome,landmassId,anchor,raw],i)=>({
   id,name,initialOwner,biome,landmassId,geometry:{type:'polygon',points:shape(...anchor,i)},markerAnchor:{x:anchor[0],y:anchor[1]},
   landConnections:raw.map(x=>x[0]),coastal:coastal.has(id),port:ports[id]?{seaZoneId:ports[id],anchor:{x:anchor[0]+18,y:anchor[1]+13}}:null,
   coastalReach:ports[id]?[ports[id]]:[]
 })),
 seaZones:[
  {id:'sea-north',connections:['sea-center','sea-west']},{id:'sea-west',connections:['sea-north','sea-center','sea-south']},
  {id:'sea-center',connections:['sea-north','sea-west','sea-south','sea-east']},{id:'sea-south',connections:['sea-west','sea-center','sea-east']},
  {id:'sea-east',connections:['sea-center','sea-south']}
 ],
 maritimeRoutes:[['p07','p13'],['p07','p17'],['p12','p17'],['p12','p20'],['p15','p20']],
 decorativeIslands:[{id:'isle-north',x:211,y:38,r:9},{id:'isle-mid',x:217,y:107,r:11},{id:'isle-south',x:218,y:207,r:10},{id:'isle-east',x:378,y:142,r:7}],
 visibleRoutes:defs.flatMap(([id,,,,,anchor,raw])=>raw.filter(([to])=>id<to).map(([to])=>({type:'land',from:id,to})))
});

export const provinceById=id=>arkenV1Map.provinces.find(p=>p.id===id);
