import fs from 'node:fs/promises';
import path from 'node:path';
import {digest,seal,readSealed} from '../../family-revisions/v1/reader.mjs';
import {memo,observeFile} from '../../v32/operation-cache.mjs';
import {normalizeEntries} from '../../v35/window-recurrence.mjs';
import {runtimeBindings} from './runtime-binding.mjs';
export {digest,seal,readSealed};
export const BASE='wiki/trainer-authoring/global-corrections/v1';
export const check=(ok,message)=>{if(!ok)throw Error(message);};
export const id=value=>{check(typeof value==='string'&&/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,95}$/.test(value),'INVALID_ID');return value;};
export async function regular(file){check(await fs.realpath(file)===file&&(await fs.lstat(file)).isFile(),'CANONICAL_FILE_REQUIRED');return JSON.parse(await fs.readFile(file,'utf8'));}
export async function sealed(file){await observeFile(file);return memo(`global-correction:sealed:${file}`,async()=>{const value=await regular(file);check(value.payload&&digest(value.payload)===value.digest,'SEAL_MISMATCH');return value;});}
export async function write(file,value){await fs.mkdir(path.dirname(file),{recursive:true});check(await fs.realpath(path.dirname(file))===path.dirname(file),'CANONICAL_DIRECTORY_REQUIRED');await fs.writeFile(file,JSON.stringify(value,null,2)+'\n',{flag:'wx'});}
// Explicitly remove the simulation label from prose; no tactical transformation.
export const approvedSubmission=value=>JSON.parse(JSON.stringify(value,(_key,v)=>typeof v==='string'?v.replaceAll('SIMULATION: ',''):v));
export function checkApprovedCandidate(candidate,plan){
  if(!plan.approvedProposal)return;
  const row=plan.approvedProposal.candidates.find(c=>c.id===candidate.submission.trainerId);
  check(row&&digest(candidate.submission)===digest(row.submission)&&digest(candidate.metadataPatches)===digest([]),'APPROVED_PROPOSAL_CHANGED');
  check(candidate.provenance.actorId!==plan.approvedProposal.origin.actorId,'APPROVED_PROPOSAL_CORRECTOR_IS_ORIGIN');
}
export async function verifyApprovedProposal(root,plan){
  const p=plan.approvedProposal;if(!p)return;
  check(p.kind==='USER_APPROVED_PROPOSAL'&&p.approval?.statement?.trim()&&p.approval?.operator?.actorId&&p.approval?.operator?.executionRef,'APPROVED_PROPOSAL_AUTHORIZATION');
  check(p.origin?.actorId&&p.origin.model==='gpt-6-astra'&&p.origin.effort==='low'&&p.origin.role==='simulation-corrector'&&p.origin.contextMode==='existing','APPROVED_PROPOSAL_ORIGIN');
  check((p.sourcePath.startsWith(`${BASE}/operations/`)||p.sourcePath===`${BASE}/runs/${id(plan.runId)}/approved-source.json`)&&!p.sourcePath.includes('..'),'APPROVED_PROPOSAL_SOURCE_PATH');
  await observeFile(path.join(root,p.sourcePath));const source=await regular(path.join(root,p.sourcePath));
  check(digest(source)===p.sourceDigest&&source.kind==='SIMULATION_ONLY','APPROVED_PROPOSAL_SOURCE_CHANGED');
  check(digest(p.candidates)===digest(source.candidates.map(({id,candidate})=>({id,baselineDigest:candidate.baselineDigest,submission:approvedSubmission(candidate.submission)}))),'APPROVED_PROPOSAL_TRANSPORT_CHANGED');
  check(plan.groups.length===1&&digest(plan.groups[0].trainerIds)===digest(p.candidates.map(c=>c.id)),'APPROVED_PROPOSAL_GROUP_SCOPE');
  for(const c of p.candidates)check(c.baselineDigest===digest(plan.snapshot.presentations.find(t=>t.trainerId===c.id)),'APPROVED_PROPOSAL_BASELINE_CHANGED');
}
export function readGlobalCorrections(root){return memo(`global-correction:publications:${root}`,async()=>{
  const folder=path.join(root,BASE,'published');let names;try{names=await fs.readdir(folder);}catch(e){if(e.code==='ENOENT')return [];throw e;}
  await observeFile(folder);const records=[],plans=new Map(),bindings=new Map();
  for(const name of names.sort()){
    check(/^[a-zA-Z0-9_-]+\.json$/.test(name),'GLOBAL_INVALID_PUBLICATION_FILE');
    const record=await sealed(path.join(folder,name)),r=record.payload;
    check(r.schemaVersion===1&&r.kind==='GLOBAL_CORRECTION_GROUP'&&r.accepted===false&&r.romPromotion===false&&r.validation?.ok===true,'GLOBAL_PUBLICATION_BINDING');
    if(!plans.has(r.runId))plans.set(r.runId,await sealed(path.join(root,BASE,'runs',id(r.runId),'snapshot.json')));
    const plan=plans.get(r.runId);await verifyApprovedProposal(root,plan.payload);
    if(!bindings.has(r.runId))bindings.set(r.runId,await runtimeBindings(root,r.runId,plan));
    const knownBindings=bindings.get(r.runId).receipts.map(receipt=>receipt.digest);
    check(r.runtimeBindingDigest==null||knownBindings.includes(r.runtimeBindingDigest),'GLOBAL_RUNTIME_BINDING');
    check(plan.digest===r.snapshotDigest,'GLOBAL_PLAN_BINDING');
    const group=plan.payload.groups.find(g=>g.id===r.groupId);
    check(group&&digest(group.trainerIds)===digest(r.entries.map(e=>e.trainerId)),'GLOBAL_GROUP_INCOMPLETE');
    for(const entry of r.entries){
      const baseline=plan.payload.snapshot.presentations.find(t=>t.trainerId===entry.trainerId);
      check(baseline&&digest(baseline)===entry.baselineDigest&&entry.updatedTrainer.trainerId===entry.trainerId,'GLOBAL_BASELINE_BINDING');
      check(digest(entry.baselineSource)===digest(plan.payload.snapshot.sources.find(s=>s.trainerId===entry.trainerId)),'GLOBAL_SOURCE_BINDING');
      const handoff=await sealed(path.join(root,BASE,'runs',id(r.runId),`${id(entry.trainerId)}-corrector-handoff.json`));
      const submitted=await sealed(path.join(root,BASE,'runs',id(r.runId),`${id(entry.trainerId)}-submission.json`));
      check(submitted.payload.runtimeBindingDigest==null||knownBindings.includes(submitted.payload.runtimeBindingDigest),'GLOBAL_SUBMISSION_RUNTIME_BINDING');
      check(handoff.digest===entry.handoffDigest&&submitted.digest===entry.submissionDigest&&digest(submitted.payload.result.updatedTrainer)===digest(entry.updatedTrainer),'GLOBAL_SUBMISSION_BINDING');
      check(digest(submitted.payload.candidate.provenance)===digest(handoff.payload.provenance)&&handoff.payload.provenance.role==='corrector'&&handoff.payload.snapshotDigest===plan.digest,'GLOBAL_ACTOR_BINDING');
      check(handoff.payload.provenance.model==='gpt-6-astra'&&handoff.payload.provenance.effort==='low'&&handoff.payload.provenance.contextMode==='fresh'&&handoff.payload.baselineDigest===entry.baselineDigest&&submitted.payload.result.ok===true,'GLOBAL_CORRECTOR_BINDING');
      const issues=plan.payload.issues.filter(i=>i.affected.some(a=>a.trainerId===entry.trainerId));
      check(digest(handoff.payload.issues)===digest(issues)&&digest(handoff.payload.baseline)===digest(baseline)&&submitted.payload.candidate.baselineDigest===entry.baselineDigest,'GLOBAL_CORRECTION_SCOPE_BINDING');
      check(submitted.payload.candidate.resolutions.length===issues.length&&new Set(submitted.payload.candidate.resolutions.map(x=>x.issueId)).size===issues.length&&issues.every(i=>submitted.payload.candidate.resolutions.some(x=>x.issueId===i.id&&['corrected','dismissed'].includes(x.status))),'GLOBAL_RESOLUTION_BINDING');
      check(plan.payload.reviews.every(review=>review.reviewer.actorId!==handoff.payload.provenance.actorId&&review.reviewer.executionRef!==handoff.payload.provenance.executionRef),'GLOBAL_ACTOR_NOT_INDEPENDENT');
      check(submitted.payload.candidate.resolutions.every(x=>x.status!=='unresolved'),'GLOBAL_UNRESOLVED_PUBLICATION');
      checkApprovedCandidate(submitted.payload.candidate,plan.payload);
    }
    records.push(record);
  }
  return records.sort((a,b)=>a.payload.sequence-b.payload.sequence);
});}
export function applyGlobalCorrections(snapshot,revisions){
  const updated=structuredClone(snapshot),applied=[];
  for(const revision of revisions)for(const entry of revision.payload.entries){
    const index=updated.presentations.findIndex(t=>t.trainerId===entry.trainerId);
    check(index>=0&&digest(updated.presentations[index])===entry.baselineDigest,'GLOBAL_REVISION_BASELINE_MISMATCH');
    updated.presentations[index]=structuredClone(entry.updatedTrainer);
    const source=updated.sources.find(s=>s.trainerId===entry.trainerId);check(source&&digest(source)===digest(entry.baselineSource),'GLOBAL_REVISION_SOURCE_MISMATCH');
    Object.assign(source,{presentationDigest:digest(entry.updatedTrainer),globalCorrectionDigest:revision.digest});
    applied.push({trainerId:entry.trainerId,revisionDigest:revision.digest,baselineDigest:entry.baselineDigest});
  }
  if(revisions.length)updated.trainers=normalizeEntries(updated.presentations);
  // Historical admission certificates remain history. The corrected presentation
  // and revision binding are additional evidence, never a rewritten old decision.
  updated.globalCorrections=applied;return updated;
}
export async function applyGlobalCorrection({projectRoot,originalTrainer}){
  let current=originalTrainer,last=null;
  for(const revision of await readGlobalCorrections(projectRoot))for(const entry of revision.payload.entries.filter(e=>e.trainerId===current.trainerId)){
    check(digest(current)===entry.baselineDigest,'GLOBAL_REVISION_BASELINE_MISMATCH');current=entry.updatedTrainer;last=revision.digest;
  }
  return last?{updatedTrainer:structuredClone(current),revisionDigest:last}:null;
}
export async function loadCorrectedWindowSnapshot(root){
  const {loadWindowSnapshot}=await import('../../v35/window-recurrence.mjs');
  return applyGlobalCorrections(await loadWindowSnapshot(root),await readGlobalCorrections(root));
}
