import { SAVE_SCHEMA_VERSION, LAND_UNIT_TYPES, RULES } from '../domain/constants.js';
import { ensureLeaders, initialTension, ARCHETYPE_TO_LEGACY_TRAIT } from '../domain/leaders.js';

const WOUND_TYPES = [...LAND_UNIT_TYPES, 'warship'];
/** V5 (V9) -> V6 (V10) : PV pleins (aucune blessure), coût mémorisé sur la production en cours (remboursement B4),
 *  nations sans province marquées éliminées (B6). */
function migrate5to6(copy) {
  for (const p of Object.values(copy.provinces || {})) p.wounds = Object.fromEntries(WOUND_TYPES.map(k => [k, Math.max(0, Math.floor(Number(p.wounds?.[k]) || 0))]));
  for (const t of copy.transports || []) t.wounds ||= Object.fromEntries(WOUND_TYPES.map(k => [k, 0]));
  for (const q of copy.productionQueue || []) if (!Number.isFinite(q.cost)) q.cost = q.kind === 'building'
    ? (q.type === 'fort' ? RULES.buildings.fort.costs[0] : RULES.buildings[q.type]?.cost || 0)
    : Math.round((RULES.units[q.type]?.cost || 0) * (q.amount || 0) / (RULES.units[q.type]?.amount || 1));
  for (const [id, n] of Object.entries(copy.nations || {})) {
    const owns = Object.values(copy.provinces || {}).some(p => p.ownerId === id), atSea = (copy.transports || []).some(t => t.nationId === id);
    if (!owns && !atSea) n.eliminated = true;
  }
  copy.schemaVersion = 6;
  return copy;
}

/** V6 (V10 lot 2) -> V7 (V10 marine) : les transports V9 (embarking / at-sea, remaining) deviennent des convois à
 *  étapes { id, via, lane, stage, turns } en gardant EXACTEMENT leur date d'arrivée (2 tours au total, comme en V9).
 *  Les anciennes routes reliaient deux ports : la province d'arrivée est aussi le bout de la route (via = toId). */
function migrate6to7(copy) {
  let seq = Math.max(1, Number(copy.transportSequence) || 1);
  copy.transports = (copy.transports || []).filter(t => t && t.status !== 'arrived').map(t => {
    const { status, remaining, ...rest } = t;
    const stage = Number.isFinite(t.stage) ? t.stage : status === 'embarking' ? 0 : Math.max(0, 2 - Math.max(1, Number(remaining) || 1));
    const via = t.via || t.toId;
    return { ...rest, id: t.id || `c${seq++}`, via, lane: t.lane || [t.fromId, via].sort().join('|'), stage, turns: Number.isFinite(t.turns) ? t.turns : 2,
      wounds: t.wounds || Object.fromEntries(WOUND_TYPES.map(k => [k, 0])) };
  });
  copy.transportSequence = seq;
  copy.schemaVersion = 7;
  return copy;
}

/** V7 (V10) -> V8 (V11) : dirigeants déduits des anciens traits (offensif → Conquérant, fidèle → Héros,
 *  prudent → Bâtisseur, impulsif → Traître ; cachés), tension initiale tirée des guerres et traités, fil d'échanges vide. */
function migrate7to8(copy) {
  copy.ai ||= { memories: {}, replay: [] };
  copy.ai.traits ||= {};
  copy.diplomacy ||= { wars: [], treaties: [], proposals: [] };
  copy.diplomacy.wars ||= []; copy.diplomacy.treaties ||= []; copy.diplomacy.proposals ||= [];
  copy.leaders = copy.leaders && typeof copy.leaders === 'object' ? copy.leaders : {};
  ensureLeaders(copy);
  for (const [id, l] of Object.entries(copy.leaders)) copy.ai.traits[id] ||= ARCHETYPE_TO_LEGACY_TRAIT[l.archetype];
  const base = initialTension(copy);
  copy.tension = copy.tension && typeof copy.tension === 'object' ? copy.tension : {};
  for (const [a, row] of Object.entries(base)) for (const [b, v] of Object.entries(row)) { copy.tension[a] ||= {}; if (!Number.isFinite(copy.tension[a][b])) copy.tension[a][b] = v; }
  copy.talk = Array.isArray(copy.talk) ? copy.talk.slice(-60) : [];
  copy.talkPending = copy.talkPending && typeof copy.talkPending === 'object' ? copy.talkPending : {};
  copy.talkSequence = Math.max(1, Number(copy.talkSequence) || 1);
  copy.schemaVersion = 8;
  return copy;
}

export function migrateSave(raw) {
  if (!raw || typeof raw !== 'object') throw new Error('invalid_save');
  const copy = structuredClone(raw);
  if (copy.schemaVersion === SAVE_SCHEMA_VERSION) return copy;
  if (copy.schemaVersion === 7) return migrate7to8(copy);
  if (copy.schemaVersion === 6) return migrate7to8(migrate6to7(copy));
  if (copy.schemaVersion === 5) return migrate7to8(migrate6to7(migrate5to6(copy)));
  if ([1, 2, 3, 4].includes(copy.schemaVersion)) {
    const previous = copy.schemaVersion;
    copy.schemaVersion=5; copy.settings={music:true,sfx:true,hints:true,...copy.settings};
    copy.tutorial=copy.tutorial||{seen:[]}; copy.transports=copy.transports||[]; copy.messages=copy.messages||[];
    delete copy.prisoners; copy.warChestsClaimed=copy.warChestsClaimed||{}; copy.journal=copy.journal||[]; copy.lastJournalEventIndex=copy.lastJournalEventIndex||0;
    copy.orders=copy.orders||[]; copy.chronicle=copy.chronicle||[]; copy.turnJournal=copy.turnJournal||copy.journal||[]; copy.turnPhase='planning';
    copy.tutorial.stage=copy.tutorial.stage||0; copy.tutorial.turn=copy.turn||1; copy.tutorial.shown=copy.tutorial.shown||[];
    copy.ai=copy.ai||{memories:{},replay:[]}; copy.ai.traits=copy.ai.traits||{};
    copy.orderSequence=Math.max(1,Number(copy.orderSequence)||1,1+(copy.orders||[]).length);
    copy.randomCounter=Math.max(0,Number(copy.randomCounter)||0);
    if(previous===4)for(const order of copy.orders)if(order.kind==='diplomacy'&&order.action==='ceasefire'&&order.status==='pending'&&order.offerLevel==null){order.legacyFree=true;order.amount=0;order.acceptanceProbability=1;}
    // Existing buildings and active projects survive migration; only new games omit free setup.
    if (previous < 4) for (const province of Object.values(copy.provinces||{})) province.portSite ??= Boolean(province.buildings?.port);
    return migrate7to8(migrate6to7(migrate5to6(copy)));
  }
  throw new Error(`unsupported_save_schema:${copy.schemaVersion}`);
}
export const encodeSave = state => JSON.stringify({ ...state, schemaVersion: SAVE_SCHEMA_VERSION });
export const decodeSave = text => migrateSave(JSON.parse(text));
