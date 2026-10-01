import {digest} from '../window-revisions/v1/reader.mjs';
import {normalizeEntries} from '../window-recurrence/v1/audit.mjs';

export const EXCEPTION_MEMORY_POLICY=Object.freeze({decisionId:'D-262',scope:'CURRENT_AND_ALL_PREVIOUS_CAMPAIGN_WINDOWS',sameLot:'SAME_ABC_BRANCH_ONLY',differentLots:'INDEPENDENT_ABC_BRANCHES',ban:'REUSED_I_EXCEPTION_CERTIFICATE_FAMILY_ONLY',frequency:'ALL_ROLES_INFORMATIONAL_DEDUPLICATED_LOGICAL_TRAINER_BRANCH_FAMILY',historicalPublications:'PRESERVED_NO_RETROACTIVE_READMISSION'});
export const FREQUENCY_COLUMNS=Object.freeze(['family','priorTrainerCount','priorVariantAppearances','currentTrainerCount','currentVariantAppearances']);
const letters=['A','B','C'];
const check=(ok,message)=>{if(!ok)throw new Error(message);};
const ordinal=id=>Number(/^W(\d+)(?:-|$)/.exec(id??'')?.[1]);
const hash=value=>typeof value==='string'&&/^(?:sha256:)?[0-9a-f]{64}$/.test(value);

// Only verified snapshots enter here. Preserve all historical certificate
// occurrences, including duplicates; the veto is evaluated for a new candidate.
export function buildExceptionMemory(snapshot,trainerId,windowId) {
  const targetWindow=ordinal(windowId);
  check(snapshot?.scope==='CURRENT_PUBLISHED_WITH_VERIFIED_OVERLAYS'&&Array.isArray(snapshot.presentations)&&Array.isArray(snapshot.sources)&&Number.isInteger(targetWindow),'EXCEPTION_MEMORY_SOURCE_REQUIRED');
  const presentations=snapshot.presentations.filter(p=>{
    check(Number.isInteger(ordinal(p.windowId)),'EXCEPTION_MEMORY_WINDOW_INVALID');
    return p.trainerId!==trainerId&&ordinal(p.windowId)<=targetWindow;
  });
  const sources=presentations.map(p=>{
    const found=snapshot.sources.filter(s=>s.trainerId===p.trainerId);
    check(found.length===1&&hash(found[0].publicationDigest)&&found[0].presentationDigest===digest(p),'EXCEPTION_MEMORY_SOURCE_BINDING_MISMATCH');
    return structuredClone(found[0]);
  }).sort((a,b)=>a.trainerId.localeCompare(b.trainerId));
  const normalized=normalizeEntries(presentations),exceptions=[],counts=new Map();
  for(const trainer of normalized)for(const branch of letters){
    const presentation=presentations.find(p=>p.trainerId===trainer.trainerId);
    const certificate=presentation.variants[branch].identityQuotaException;
    for(const family of certificate?.families??[]){
      check(trainer.variants[branch].some(m=>m.family===family&&m.role==='I'),'EXCEPTION_MEMORY_CERTIFICATE_BINDING_MISMATCH');
      exceptions.push({trainerId:trainer.trainerId,windowId:trainer.windowId,lotId:trainer.lotId,branch,family,
        publicationDigest:sources.find(s=>s.trainerId===trainer.trainerId).publicationDigest});
    }
    for(const member of trainer.variants[branch]){
      const row=counts.get(member.family)??{prior:new Set(),current:new Set(),priorAppearances:0,currentAppearances:0};
      const period=ordinal(trainer.windowId)<targetWindow?'prior':'current';
      row[period].add(trainer.trainerId);row[`${period}Appearances`]++;counts.set(member.family,row);
    }
  }
  exceptions.sort((a,b)=>[a.windowId,a.lotId,a.trainerId,a.branch,a.family].join(':').localeCompare([b.windowId,b.lotId,b.trainerId,b.branch,b.family].join(':')));
  const frequencies=[...counts].sort(([a],[b])=>a.localeCompare(b)).map(([family,row])=>[family,row.prior.size,row.priorAppearances,row.current.size,row.currentAppearances]);
  const payload={policy:EXCEPTION_MEMORY_POLICY,trainerId,windowId,sources,exceptions,frequencyColumns:FREQUENCY_COLUMNS,frequencies};
  return {...payload,memoryDigest:digest(payload)};
}

export function assertExceptionMemory(memory,{trainerId,windowId}) {
  check(memory&&typeof memory==='object','EXCEPTION_MEMORY_REQUIRED');
  const {memoryDigest,...payload}=memory;
  check(memoryDigest===digest(payload)&&digest(memory.policy)===digest(EXCEPTION_MEMORY_POLICY)
    &&memory.trainerId===trainerId&&memory.windowId===windowId
    &&Array.isArray(memory.sources)&&Array.isArray(memory.exceptions)&&Array.isArray(memory.frequencies)
    &&digest(memory.frequencyColumns)===digest(FREQUENCY_COLUMNS),'EXCEPTION_MEMORY_BINDING_MISMATCH');
  return memory;
}

export function exceptionMemoryFindings(context,variants) {
  const memory=assertExceptionMemory(context?.exceptionMemory,context??{}),errors=[];
  check(typeof context.lotId==='string'&&context.lotId.length>0,'EXCEPTION_MEMORY_LOT_REQUIRED');
  for(const branch of letters)for(const family of variants?.[branch]?.identityQuotaException?.families??[]){
    const witnesses=memory.exceptions.filter(previous=>previous.family===family
      &&ordinal(previous.windowId)<=ordinal(context.windowId)
      &&(previous.lotId!==context.lotId||previous.branch===branch));
    if(witnesses.length)errors.push({code:'IDENTITY_QUOTA_EXCEPTION_REUSED',path:`variants.${branch}.identityQuotaException`,family,branch,witnesses,
      message:`D262: ${family} ya recibió excepción I en una rama compatible de la campaña actual o anterior.`});
  }
  return {errors,memoryDigest:memory.memoryDigest};
}
