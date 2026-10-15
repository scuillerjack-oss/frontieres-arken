import { SAVE_SCHEMA_VERSION } from '../domain/constants.js';

export function migrateSave(raw) {
  if (!raw || typeof raw !== 'object') throw new Error('invalid_save');
  const copy = structuredClone(raw);
  if (copy.schemaVersion === SAVE_SCHEMA_VERSION) return copy;
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
    return copy;
  }
  throw new Error(`unsupported_save_schema:${copy.schemaVersion}`);
}
export const encodeSave = state => JSON.stringify({ ...state, schemaVersion: SAVE_SCHEMA_VERSION });
export const decodeSave = text => migrateSave(JSON.parse(text));
