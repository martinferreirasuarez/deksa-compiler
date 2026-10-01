import fs from 'node:fs/promises';
import path from 'node:path';
import {digest,readSealed} from '../window-revisions/v1/reader.mjs';
import {normalizeEntries,combinationStates} from '../window-recurrence/v1/audit.mjs';
import {quotaFor,auditWindow as historicalNumericalAudit,localAdmissionFindings} from '../v31/window-recurrence.mjs';
import {baselineSnapshot,BASELINE_27_DIGEST} from './historical-evidence.mjs';
import {loadPlannedInventory} from './planned-inventory.mjs';
import {memo,observeFile} from './operation-cache.mjs';
import {readQualityPublications,admissionEvidence} from '../quality-revisions/v1/reader.mjs';
import {retainedOwner} from './revision-admission.mjs';
export {normalizeEntries,quotaFor,localAdmissionFindings,BASELINE_27_DIGEST};
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
  return {audit:{...numerical,numericalOk:numerical.ok,ok:errors.length===0,assessmentKind:'FORWARD_PLANNED_ADMISSION',
    newNonAnchorViolations:errors,permittedNumericalExcesses:errors.length?[]:numerical.excesses},errors};
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
    const errors=[...result.errors,...localAdmissionFindings(current.trainers,trainer)];
    check(!errors.length,`INVALID_NONANCHOR_ADMISSION: ${trainer.trainerId}/${errors.map(e=>e.code).join(',')}`);
    current.admissions.push({trainerId:trainer.trainerId,publicationDigest:next.source.publicationDigest,
      priorTrainerIds:context.current.map(t=>t.trainerId),quotaN:context.quotaN,admissionN:context.admissionN,
      ok:true,mode:'VERIFIED_PLANNED_FORWARD_ADMISSION'});
    current.trainers.push(trainer);current.sources.push(next.source);current.presentations.push(next.presentation);
    pending=pending.filter(e=>e!==next);
  }
  return current;
}
export function baseWindowSnapshot(root) {return memo(`v32:window-base:${root}`,async()=>{
  const baseline=await baselineSnapshot(root),inventory=await loadPlannedInventory(root);
  return {scope:baseline.scope,sources:baseline.sources,trainers:baseline.trainers,presentations:baseline.presentations,
    baselineDigest:BASELINE_27_DIGEST,admissions:[],inventory,
    historicalVerification:{...baseline.historicalVerification,baselineDigest:BASELINE_27_DIGEST,
      status:'ORIGINAL_POLICY_EVIDENCE_PRESERVED',originalAdmissions:baseline.admissions}};
});}
export function applyQualityToSnapshot(snapshot,revision) {
  const r=revision.payload,c=r.context.payload,index=snapshot.sources.findIndex(s=>s.trainerId===r.trainerId);
  check(index>=0&&digest(snapshot.sources)===digest(c.sourcePins)
    &&snapshot.sources[index].presentationDigest===r.presentationDigest,'QUALITY_SNAPSHOT_PREFIX_MISMATCH');
  const proof=admissionEvidence(snapshot.presentations[index],snapshot.sources[index],{planDigest:c.planDigest,contractDigest:c.contractDigest});
  const context={...windowContext({...snapshot,revisionAdmission:proof},r.trainerId,snapshot.presentations[index].windowId),lotId:snapshot.presentations[index].lotId};
  check(digest(context)===digest(c.engineContext.windowRecurrence),'QUALITY_WINDOW_CONTEXT_MISMATCH');
  const numerical=windowFindings(context,r.updatedTrainer.variants),candidate=normalizeEntries([r.updatedTrainer])[0];
  const fresh={...candidate,variants:Object.fromEntries(letters.map(l=>[l,candidate.variants[l].filter(m=>!retainedOwner(proof,candidate.trainerId,candidate.lotId,l,m.family,m.role))]))};
  check(!numerical.errors.length&&!localAdmissionFindings(snapshot.trainers.filter(t=>t.trainerId!==candidate.trainerId),fresh).length,'QUALITY_NEW_ADMISSION_INVALID');
  const presentations=snapshot.presentations.map((t,i)=>i===index?structuredClone(r.updatedTrainer):t);
  const sources=snapshot.sources.map((s,i)=>i===index?{...s,originalPresentationDigest:s.originalPresentationDigest??s.presentationDigest,
    presentationDigest:digest(r.updatedTrainer),qualityRevisionDigest:revision.digest}:s);
  return {...snapshot,presentations,sources,trainers:normalizeEntries(presentations),
    qualityRevisions:[...(snapshot.qualityRevisions??[]),{trainerId:r.trainerId,revisionDigest:revision.digest,beforePresentationDigest:r.presentationDigest}]};
}
export function loadWindowSnapshot(root) {return memo(`v32:window-snapshot:${root}`,async()=>{
  let snapshot=await baseWindowSnapshot(root);
  if((await readQualityPublications(root)).length)
    snapshot=(await (await import('../quality-revisions/v1/runner.mjs')).verifyQualityRevisions(root)).snapshot;
  const base='wiki/trainer-authoring/v32',additions=[];
  let files=[];try{files=await fs.readdir(path.join(root,base,'published'));}catch(e){if(e.code!=='ENOENT')throw e;}
  const sealed=async relative=>{await observeFile(path.join(root,relative));return readSealed(path.join(root,relative));};
  for(const file of files.sort().filter(f=>f!=='index.json')) {
    check(/^[a-zA-Z0-9_-]+\.json$/.test(file),'INVALID_WINDOW_PUBLICATION_PATH');
    const artifactPath=`${base}/published/${file}`,publication=await sealed(artifactPath),p=publication.payload;
    check(p.generatorId==='beta4-v32'&&p.runId===file.slice(0,-5)&&p.status==='TRAINER_REVIEW'
      &&p.trainerId===p.trainer?.trainerId&&p.lotId===p.trainer?.lotId&&p.accepted===false
      &&p.lotAccepted===false&&p.romPromotion===false,'INVALID_WINDOW_PUBLICATION');
    const context=await sealed(`${base}/runs/${p.runId}/context.json`);
    check(context.digest===p.contextDigest&&context.payload.trainerId===p.trainerId
      &&context.payload.policyId==='DEKSA-BETA4-TRAINER-POLICY-23','ADMISSION_CONTEXT_BINDING_MISMATCH');
    check(p.author?.provenance?.actorId&&p.corrector?.provenance?.actorId
      &&p.author.provenance.actorId!==p.corrector.provenance.actorId,'ADMISSION_ACTOR_PROVENANCE_REQUIRED');
    let acceptanceDigest=null;
    try {
      const acceptance=await sealed(`${base}/accepted/trainers/${p.trainerId}.json`),a=acceptance.payload;
      check(a.status==='TRAINER_ACCEPTED'&&a.generatorId==='beta4-v32'&&a.trainerId===p.trainerId
        &&a.publicationDigest===publication.digest&&a.publicationPath===artifactPath,'WINDOW_ACCEPTANCE_BINDING_MISMATCH');
      acceptanceDigest=acceptance.digest;
    }catch(e){if(e.code!=='ENOENT')throw e;}
    additions.push({presentation:p.trainer,context:context.payload.windowRecurrence,source:{trainerId:p.trainerId,
      publicationDigest:publication.digest,acceptanceDigest,itemRevisionDigest:null,familyRevisionDigest:null,
      windowRevisionDigest:null,presentationDigest:digest(p.trainer)}});
  }
  return appendAdmissions(snapshot,additions);
});}
