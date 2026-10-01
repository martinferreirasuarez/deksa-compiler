import {digest} from '../window-revisions/v1/reader.mjs';
import {normalizeEntries,combinationStates} from '../window-recurrence/v1/audit.mjs';
import {quotaFor,auditWindow as historicalNumericalAudit,localAdmissionFindings as strictLocalAdmissionFindings} from '../v31/window-recurrence.mjs';
import {BASELINE_27_DIGEST} from '../v32/historical-evidence.mjs';
import {admissionEvidence} from '../quality-revisions/v1/reader.mjs';
import {retainedOwner} from '../v32/revision-admission.mjs';
import {applyIdentityQuotaException} from './identity-quota.mjs';
export {normalizeEntries,quotaFor,localAdmissionFindings,BASELINE_27_DIGEST};
function localAdmissionFindings(current,candidate) {return strictLocalAdmissionFindings(current,candidate);}
export const WINDOW_POLICY=Object.freeze({normalPercent:15,restPercent:5,previousTriggerPercent:20,
  denominator:'TOTAL_PLANNED_CANONICAL_LOGICAL_TRAINERS',independentLotPackages:true,anchorsCountAndRemain:true,
  admission:'NEW_NONANCHORS_ONLY',existingPublishedPreserved:true});
const letters=['A','B','C'],ordinal=id=>Number(/^W(\d+)/.exec(id)?.[1]);
const check=(ok,message)=>{if(!ok)throw new Error(message);};
export function auditWindow(trainers,previousTrainers=[],options={}) {
  check(Number.isInteger(options.n)&&options.n>0,'PLANNED_DENOMINATOR_REQUIRED');
  return {...historicalNumericalAudit(trainers,previousTrainers,options),policy:WINDOW_POLICY,quotaN:options.n};
}
function inventoryFor(inventory,windowId) {
  const row=inventory?.windows.find(w=>w.windowId===windowId);
  check(row&&row.quotaN===row.trainerIds.length&&new Set(row.trainerIds).size===row.quotaN,'PLANNED_INVENTORY_REQUIRED');
  return {...row,sourceDigests:inventory.sourceDigests,excludedFixedIds:inventory.excludedFixedIds};
}
function familyLots(trainers,family) {
  return [...new Set(trainers.map(t=>t.lotId))].sort().map(lotId=>({lotId,variants:letters.map(letter=>({letter,
    owners:trainers.filter(t=>t.lotId===lotId).flatMap(t=>t.variants[letter].filter(m=>m.family===family))}))}));
}
export function windowContext(snapshot,trainerId,windowId) {
  check(snapshot?.scope==='CURRENT_PUBLISHED_WITH_VERIFIED_OVERLAYS','WINDOW_SNAPSHOT_REQUIRED');
  const inventory=inventoryFor(snapshot.inventory,windowId);
  check(inventory.trainerIds.includes(trainerId),'TARGET_NOT_IN_PLANNED_INVENTORY');
  const current=snapshot.trainers.filter(t=>t.windowId===windowId&&t.trainerId!==trainerId);
  const previous=snapshot.trainers.filter(t=>ordinal(t.windowId)===ordinal(windowId)-1);
  check(current.every(t=>inventory.trainerIds.includes(t.trainerId)),'PUBLISHED_NOT_IN_PLANNED_INVENTORY');
  const sources=snapshot.sources.filter(s=>[...current,...previous].some(t=>t.trainerId===s.trainerId));
  const presentations=snapshot.presentations.filter(t=>sources.some(s=>s.trainerId===t.trainerId));
  const admissions=snapshot.admissions.filter(a=>sources.some(s=>s.trainerId===a.trainerId));
  const assessment=auditWindow(current,previous,{n:inventory.quotaN,windowId});
  const historicalVerification=snapshot.historicalVerification;
  const revisionAdmission=snapshot.revisionAdmission??null;
  if(revisionAdmission)check(digest(revisionAdmission)===digest(admissionEvidence(
    snapshot.presentations.find(t=>t.trainerId===trainerId),snapshot.sources.find(s=>s.trainerId===trainerId),revisionAdmission)),
    'QUALITY_ADMISSION_PROOF_MISMATCH');
  const admissionCertified=snapshot.baselineDigest===BASELINE_27_DIGEST&&admissions.every(a=>a.ok);
  return {policy:WINDOW_POLICY,trainerId,windowId,current,previous,sources,presentations,
    N:inventory.quotaN,quotaN:inventory.quotaN,currentN:current.length,admissionN:current.length+1,
    previousN:previous.length,inventory,assessment,admissions,admissionCertified,baselineDigest:snapshot.baselineDigest,
    historicalVerification,...(revisionAdmission?{revisionAdmission}:{}),
    snapshotDigest:digest({current,previous,sources,presentations,admissions,inventory,historicalVerification,revisionAdmission})};
}
export function windowFindings(context,variants) {
  check(context?.policy&&digest(context.policy)===digest(WINDOW_POLICY),'WINDOW_CONTEXT_REQUIRED');
  check(context.inventory&&context.quotaN===context.inventory.quotaN&&context.N===context.quotaN
    &&context.quotaN===new Set(context.inventory.trainerIds).size&&context.inventory.trainerIds.includes(context.trainerId)
    &&context.currentN===context.current.length&&context.admissionN===context.current.length+1,'PLANNED_ADMISSION_COUNTS_MISMATCH');
  check(context.admissionCertified&&context.baselineDigest===BASELINE_27_DIGEST,'WINDOW_ADMISSION_PROVENANCE_REQUIRED');
  const candidate={trainerId:context.trainerId,lotId:context.lotId,windowId:context.windowId,variants};
  const normalized=normalizeEntries([candidate])[0];
  const numerical=auditWindow([...context.current,normalized],context.previous,{n:context.quotaN,windowId:context.windowId});
  const errors=[];
  for(const letter of letters)for(const member of normalized.variants[letter].filter(m=>m.role!=='A')) {
    if(retainedOwner(context.revisionAdmission,context.trainerId,context.lotId,letter,member.family,member.role))continue;
    const row=numerical.families.find(f=>f.family===member.family);
    const compatible=familyLots([...context.current,normalized],member.family).map(lot=>lot.lotId===candidate.lotId
      ?{...lot,variants:lot.variants.filter(v=>v.letter===letter)}:lot);
    const states=combinationStates(compatible).map(s=>({...s,total:s.anchors+s.nonAnchors}));
    const witness=states.reduce((a,b)=>b.total>a.total?b:a);
    if(witness.total>row.quota)errors.push({code:'WINDOW_FAMILY_QUOTA_EXCEEDED',path:`variants.${letter}`,family:member.family,
      quota:row.quota,maximumExcess:witness.total-row.quota,witness,
      message:`${member.family}: el nuevo uso ${member.role} supera el cupo ${row.quota}; los publicados permanecen.`});
  }
  const local=strictLocalAdmissionFindings(context.current,normalized).filter(e=>!retainedOwner(context.revisionAdmission,context.trainerId,context.lotId,e.letter,e.family,normalized.variants[e.letter].find(m=>m.family===e.family)?.role));
  const admitted=letters.map(letter=>applyIdentityQuotaException(variants[letter],letter,[...errors.filter(e=>e.path===`variants.${letter}`),...local.filter(e=>e.letter===letter)]));
  const finalErrors=admitted.flatMap(r=>r.errors),warnings=admitted.flatMap(r=>r.warnings);
  return {audit:{...numerical,numericalOk:numerical.ok,ok:finalErrors.length===0,assessmentKind:'FORWARD_PLANNED_IDENTITY_ADMISSION',
    identityQuotaExceptions:warnings,newNonAnchorViolations:finalErrors,permittedNumericalExcesses:finalErrors.length?[]:numerical.excesses},errors:finalErrors,warnings};
}
export function appendAdmissions(snapshot,additions) {
  // Baseline27 has its own full historical proof. Never re-admit those trainers
  // under POLICY23. New additions use only their actual chronological prefix.
  const current={...snapshot,trainers:[...snapshot.trainers],sources:[...snapshot.sources],presentations:[...snapshot.presentations],admissions:[...snapshot.admissions]};
  let pending=[...additions];
  while(pending.length) {
    const matching=pending.filter(e=>{
      const expected=windowContext(current,e.presentation.trainerId,e.presentation.windowId);
      return digest(e.context)===digest({...expected,lotId:e.presentation.lotId});
    });
    check(matching.length===1,'ADMISSION_SEQUENCE_OR_SOURCE_MISMATCH');
    const next=matching[0],context={...windowContext(current,next.presentation.trainerId,next.presentation.windowId),lotId:next.presentation.lotId};
    const trainer=normalizeEntries([...current.presentations,next.presentation]).at(-1);
    const result=windowFindings(context,next.presentation.variants);
    const errors=result.errors;
    check(!errors.length,`INVALID_NONANCHOR_ADMISSION: ${trainer.trainerId}/${errors.map(e=>e.code).join(',')}`);
    current.admissions.push({trainerId:trainer.trainerId,publicationDigest:next.source.publicationDigest,
      priorTrainerIds:context.current.map(t=>t.trainerId),quotaN:context.quotaN,admissionN:context.admissionN,
      ok:true,mode:'VERIFIED_PLANNED_IDENTITY_FORWARD_ADMISSION',identityQuotaExceptions:result.warnings});
    current.trainers.push(trainer);current.sources.push(next.source);current.presentations.push(next.presentation);
    pending=pending.filter(e=>e!==next);
  }
  return current;
}
export async function loadWindowSnapshot(root) {return (await import('./snapshot.mjs')).loadIdentitySnapshot(root);}
