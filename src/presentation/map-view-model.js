export const DIPLOMACY_COLORS=Object.freeze({neutral:'#f7f3e8',war:'#ef4136',alliance:'#5da9ff'});
export function diplomaticState({state,provinceId}){
 const owner=state.provinces[provinceId].ownerId;
 if(owner===state.playerNationId)return 'neutral';
 const wars=state.diplomacy?.wars||[], treaties=state.diplomacy?.treaties||[];
 if(wars.some(w=>w.active!==false&&w.participants?.includes(owner)&&w.participants?.includes(state.playerNationId)))return 'war';
 if(treaties.some(t=>t.active!==false&&t.type==='alliance'&&t.parties?.includes(owner)&&t.parties?.includes(state.playerNationId)))return 'alliance';
 return 'neutral';
}
export function provinceVisual({map,state,provinceId}){
 const definition=map.provinces.find(p=>p.id===provinceId), current=state.provinces[provinceId];
 const nation=map.nations.find(n=>n.id===current.ownerId);
 return {biome:definition.biome,ownerId:current.ownerId,politicalColor:nation.color,diplomacy:diplomaticState({state,provinceId}),diplomaticColor:DIPLOMACY_COLORS[diplomaticState({state,provinceId})]};
}
export function applyConquest(state,provinceId,newOwnerId){
 if(!state.nations[newOwnerId])throw new Error('unknown_conqueror');
 state.provinces[provinceId].ownerId=newOwnerId;
 state.events.push({type:'conquest',provinceId,newOwnerId,turn:state.turn});
 return state;
}
