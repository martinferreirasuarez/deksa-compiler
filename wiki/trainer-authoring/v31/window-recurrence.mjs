import fs from 'node:fs/promises';
import path from 'node:path';
import { currentEntries } from '../window-revisions/v1/runner.mjs';
import { digest, readSealed } from '../window-revisions/v1/reader.mjs';
import { normalizeEntries, combinationStates } from '../window-recurrence/v1/audit.mjs';
import {memo} from './operation-cache.mjs';
export { normalizeEntries };

export const WINDOW_POLICY = Object.freeze({ normalPercent:15, restPercent:5, previousTriggerPercent:20,
  denominator:'CURRENT_PUBLISHED_PLUS_TARGET', independentLotPackages:true, anchorsCountAndRemain:true,
  admission:'NEW_NONANCHORS_ONLY',existingPublishedPreserved:true });
export const BASELINE_19_DIGEST='047c83328064856d6830f758f0f5f57ec0ada260d08d49b382d4950798109af3';
const letters=['A','B','C'];
const check=(ok,message)=>{if(!ok)throw new Error(message);};
const ordinal=id=>Number(/^W(\d+)/.exec(id)?.[1]);
export function quotaFor(n, previousMaximum=0, previousN=0) {
  check(Number.isInteger(n)&&n>0&&Number.isInteger(previousN)&&previousN>=0
    &&Number.isInteger(previousMaximum)&&previousMaximum>=0&&previousMaximum<=previousN,'INVALID_WINDOW_COUNTS');
  const rest=previousN>0&&previousMaximum*5>=previousN;
  return {quota:Math.ceil(n*(rest?5:15)/100),rate:rest?0.05:0.15,rest};
}
function familyLots(trainers,family) {
  return [...new Set(trainers.map(t=>t.lotId))].sort().map(lotId=>({lotId,variants:letters.map(letter=>({letter,
    owners:trainers.filter(t=>t.lotId===lotId).flatMap(t=>t.variants[letter].filter(m=>m.family===family))}))}));
}
export function auditWindow(trainers,previousTrainers=[],{n=trainers.length,windowId=trainers[0]?.windowId}={}) {
  check(Number.isInteger(n)&&n>0&&n>=trainers.length,'INVALID_WINDOW_DENOMINATOR');
  check(ordinal(windowId)>=1&&trainers.every(t=>t.windowId===windowId),'MIXED_OR_INVALID_WINDOW');
  check(ordinal(windowId)===1||previousTrainers.length>0,'PREVIOUS_WINDOW_DATA_REQUIRED');
  check(previousTrainers.every(t=>ordinal(t.windowId)===ordinal(windowId)-1),'IMMEDIATE_PREVIOUS_WINDOW_REQUIRED');
  const families=[...new Set([...trainers,...previousTrainers].flatMap(t=>letters.flatMap(l=>t.variants[l].map(m=>m.family))))].sort();
  const rows=families.map(family=>{
    const lots=familyLots(trainers,family),previousN=previousTrainers.length;
    const previousMaximum=familyLots(previousTrainers,family).reduce((sum,l)=>sum+Math.max(...l.variants.map(v=>v.owners.length)),0);
    const policy=quotaFor(n,previousMaximum,previousN);
    const states=combinationStates(lots).map(s=>({...s,total:s.anchors+s.nonAnchors,
      excess:Math.max(0,s.anchors+s.nonAnchors-Math.max(policy.quota,s.anchors))}));
    const witness=states.reduce((a,b)=>b.excess>a.excess?b:a);
    const maximumPossible=Math.max(...states.map(s=>s.total));
    return {family,...policy,previousMaximum,previousN,previousRatio:previousN?previousMaximum/previousN:null,
      maximumPossible,margin:policy.quota-maximumPossible,maximumExcess:witness.excess,witness};
  });
  return {windowId,N:n,previousN:previousTrainers.length,policy:WINDOW_POLICY,ok:rows.every(r=>!r.maximumExcess),families:rows,
    excesses:rows.filter(r=>r.maximumExcess)};
}
export function loadWindowSnapshot(projectRoot) {
  return memo(`window-snapshot:${projectRoot}`,()=>loadWindowSnapshotUncached(projectRoot));
}
async function loadWindowSnapshotUncached(projectRoot) {
  const historical=await currentEntries(projectRoot);
  const entries=[...historical];
  for(const version of ['v30','v31']) {
  const base=`wiki/trainer-authoring/${version}/published`;
  let files=[];
  try {files=await fs.readdir(path.join(projectRoot,base));} catch(e){if(e.code!=='ENOENT')throw e;}
  // Sealed publications count immediately; acceptance remains a separate state.
  for(const file of files.sort().filter(f=>f!=='index.json')) {
    check(/^[a-zA-Z0-9_-]+\.json$/.test(file),'INVALID_WINDOW_PUBLICATION_PATH');
    const artifactPath=`${base}/${file}`,sealed=await readSealed(path.join(projectRoot,artifactPath)),p=sealed.payload;
    check(p.generatorId===`beta4-${version}`&&p.runId===file.slice(0,-5)&&p.status==='TRAINER_REVIEW'
      &&p.trainerId===p.trainer?.trainerId&&p.lotId===p.trainer?.lotId&&p.accepted===false
      &&p.lotAccepted===false&&p.romPromotion===false,'INVALID_WINDOW_PUBLICATION');
    let acceptanceDigest=null;
    try {
      const acceptance=await readSealed(path.join(projectRoot,`wiki/trainer-authoring/${version}/accepted/trainers`,`${p.trainerId}.json`));
      check(acceptance.payload.status==='TRAINER_ACCEPTED'&&acceptance.payload.generatorId===`beta4-${version}`
        &&acceptance.payload.trainerId===p.trainerId&&acceptance.payload.publicationDigest===sealed.digest
        &&acceptance.payload.publicationPath===artifactPath,'WINDOW_ACCEPTANCE_BINDING_MISMATCH');
      acceptanceDigest=acceptance.digest;
    } catch(e){if(e.code!=='ENOENT')throw e;}
    let admissionContext=null;
    if(version==='v31') {
      const context=await readSealed(path.join(projectRoot,`wiki/trainer-authoring/v31/runs/${p.runId}/context.json`));
      check(context.digest===p.contextDigest&&context.payload.trainerId===p.trainerId
        &&context.payload.policyId==='DEKSA-BETA4-TRAINER-POLICY-22','ADMISSION_CONTEXT_BINDING_MISMATCH');
      check(p.author?.provenance?.actorId&&p.corrector?.provenance?.actorId
        &&p.author.provenance.actorId!==p.corrector.provenance.actorId,'ADMISSION_ACTOR_PROVENANCE_REQUIRED');
      admissionContext=context.payload.windowRecurrence;
      check(admissionContext&&digest(admissionContext.policy)===digest(WINDOW_POLICY),'ADMISSION_POLICY_REQUIRED');
    }
    entries.push({trainer:p.trainer,publicationDigest:sealed.digest,acceptanceDigest,artifactPath,version,admissionContext});
  }
  }
  const sources=entries.map(e=>({trainerId:e.trainer.trainerId,publicationDigest:e.publicationDigest,
    acceptanceDigest:e.acceptanceDigest??null,itemRevisionDigest:e.itemRevisionDigest??null,
    familyRevisionDigest:e.familyRevisionDigest??null,windowRevisionDigest:e.windowRevisionDigest??null,
    presentationDigest:digest(e.trainer)}));
  const baselineEntries=entries.filter(e=>e.version!=='v31');
  const baselineIds=new Set(baselineEntries.map(e=>e.trainer.trainerId));
  check(baselineIds.size===19&&digest(sources.filter(s=>baselineIds.has(s.trainerId)))===BASELINE_19_DIGEST,'APPROVED_BASELINE_19_CHANGED');
  const trainers=normalizeEntries(entries),incorporated=entries.filter(e=>e.version!=='v31'),ordered=[];
  let pending=entries.filter(e=>e.version==='v31');
  while(pending.length) {
    const next=pending.find(e=>{
      const relevant=incorporated.filter(p=>[ordinal(e.trainer.windowId),ordinal(e.trainer.windowId)-1].includes(ordinal(p.trainer.windowId)));
      const expected=relevant.map(p=>({trainerId:p.trainer.trainerId,publicationDigest:p.publicationDigest,presentationDigest:digest(p.trainer)})).sort((a,b)=>a.trainerId.localeCompare(b.trainerId));
      const actual=e.admissionContext.sources.map(({trainerId,publicationDigest,presentationDigest})=>({trainerId,publicationDigest,presentationDigest})).sort((a,b)=>a.trainerId.localeCompare(b.trainerId));
      return e.admissionContext.N===relevant.filter(p=>p.trainer.windowId===e.trainer.windowId).length+1&&digest(actual)===digest(expected);
    });
    check(next,'ADMISSION_SEQUENCE_OR_SOURCE_MISMATCH');
    incorporated.push(next);ordered.push(next);pending=pending.filter(e=>e!==next);
  }
  const admissions=certifyAdmissionSequence(trainers.filter(t=>baselineIds.has(t.trainerId)),ordered.map(e=>({
    trainer:trainers.find(t=>t.trainerId===e.trainer.trainerId),presentation:e.trainer,publicationDigest:e.publicationDigest})));
  return {scope:'CURRENT_PUBLISHED_WITH_VERIFIED_OVERLAYS',sources,trainers,admissions,baselineDigest:BASELINE_19_DIGEST,
    presentations:entries.map(e=>structuredClone(e.trainer))};
}
export function windowContext(snapshot,trainerId,windowId) {
  check(snapshot?.scope==='CURRENT_PUBLISHED_WITH_VERIFIED_OVERLAYS','WINDOW_SNAPSHOT_REQUIRED');
  const current=snapshot.trainers.filter(t=>t.windowId===windowId&&t.trainerId!==trainerId);
  const previous=snapshot.trainers.filter(t=>ordinal(t.windowId)===ordinal(windowId)-1);
  const sources=snapshot.sources.filter(s=>[...current,...previous].some(t=>t.trainerId===s.trainerId));
  const presentations=(snapshot.presentations??[]).filter(t=>sources.some(s=>s.trainerId===t.trainerId));
  const assessment=auditWindow(current,previous,{n:current.length+1,windowId});
  const admissions=(snapshot.admissions??[]).filter(a=>sources.some(s=>s.trainerId===a.trainerId));
  const admissionCertified=snapshot.baselineDigest===BASELINE_19_DIGEST&&admissions.every(a=>a.ok);
  return {policy:WINDOW_POLICY,trainerId,windowId,current,previous,sources,presentations,N:current.length+1,
    currentN:current.length,assessment,admissions,admissionCertified,baselineDigest:snapshot.baselineDigest??null,
    snapshotDigest:digest({current,previous,sources,presentations,admissions})};
}
export function windowFindings(context,variants) {
  check(context?.policy&&digest(context.policy)===digest(WINDOW_POLICY),'WINDOW_CONTEXT_REQUIRED');
  const prior=auditWindow(context.current,context.previous,{n:context.current.length+1,windowId:context.windowId});
  check(prior.ok||context.admissionCertified,'WINDOW_ADMISSION_PROVENANCE_REQUIRED');
  const candidate={trainerId:context.trainerId,lotId:context.lotId,windowId:context.windowId,variants};
  const normalized=normalizeEntries([candidate])[0];
  const numerical=auditWindow([...context.current,normalized],context.previous);
  const errors=[];
  for(const letter of letters)for(const member of normalized.variants[letter].filter(m=>m.role!=='A')) {
    const row=numerical.families.find(f=>f.family===member.family);
    const compatible=familyLots([...context.current,normalized],member.family).map(lot=>lot.lotId===candidate.lotId
      ?{...lot,variants:lot.variants.filter(v=>v.letter===letter)}:lot);
    const states=combinationStates(compatible).map(s=>({...s,total:s.anchors+s.nonAnchors}));
    const witness=states.reduce((a,b)=>b.total>a.total?b:a);
    if(witness.total>row.quota)errors.push({code:'WINDOW_FAMILY_QUOTA_EXCEEDED',path:`variants.${letter}`,family:member.family,
      quota:row.quota,maximumExcess:witness.total-row.quota,witness,
      message:`${member.family}: el nuevo uso ${member.role} supera el cupo ${row.quota}; los publicados permanecen.`});
  }
  return {audit:{...numerical,numericalOk:numerical.ok,ok:errors.length===0,assessmentKind:'FORWARD_ADMISSION',
    newNonAnchorViolations:errors,permittedNumericalExcesses:errors.length?[]:numerical.excesses},errors};
}

export function localAdmissionFindings(current,candidate) {
  return letters.flatMap(letter=>candidate.variants[letter].filter(m=>m.role!=='A').flatMap(member=>{
    const prior=current.filter(t=>t.lotId===candidate.lotId&&t.trainerId!==candidate.trainerId
      &&t.variants[letter].some(m=>m.family===member.family));
    return prior.length<2?[]:[{code:'LOT_FAMILY_TRAINER_LIMIT',trainerId:candidate.trainerId,letter,family:member.family,
      priorTrainerIds:prior.map(t=>t.trainerId)}];
  }));
}
export function certifyAdmissionSequence(baseline,additions) {
  const incorporated=[...baseline],proofs=[];
  for(const windowId of new Set(baseline.map(t=>t.windowId))) {
    check(auditWindow(baseline.filter(t=>t.windowId===windowId),baseline.filter(t=>ordinal(t.windowId)===ordinal(windowId)-1)).ok,
      'INVALID_ADMISSION_BASELINE');
  }
  for(const addition of additions) {
    const current=incorporated.filter(t=>t.windowId===addition.trainer.windowId);
    const previous=incorporated.filter(t=>ordinal(t.windowId)===ordinal(addition.trainer.windowId)-1);
    const result=windowFindings({policy:WINDOW_POLICY,trainerId:addition.trainer.trainerId,lotId:addition.trainer.lotId,
      windowId:addition.trainer.windowId,current,previous,admissionCertified:true},addition.presentation.variants);
    const errors=[...result.errors,...localAdmissionFindings(current,addition.trainer)];
    check(!errors.length,`INVALID_NONANCHOR_ADMISSION: ${addition.trainer.trainerId}/${errors.map(e=>e.code).join(',')}`);
    incorporated.push(addition.trainer);
    proofs.push({trainerId:addition.trainer.trainerId,publicationDigest:addition.publicationDigest,
      priorTrainerIds:current.map(t=>t.trainerId),ok:true,mode:'VERIFIED_FORWARD_ADMISSION'});
  }
  return proofs;
}
