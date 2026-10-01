import path from 'node:path';
import {hash,check,listing,readSealed as sourceSealed} from '../../v42/core.mjs';
import {memo,observeFile} from '../../v32/operation-cache.mjs';
export const BASE='wiki/trainer-authoring/global-corrections/v2';
async function readSealed(file){await observeFile(file);return sourceSealed(file);}
export function readCorrections(root){return memo(`global-correction-v2:${root}`,async()=>{
 const rows=[];
 await observeFile(path.join(root,BASE,'published'));
 for(const name of await listing(path.join(root,BASE,'published'))){
  check(/^[a-zA-Z0-9_-]+\.json$/.test(name),'INVALID_CORRECTION_PUBLICATION');
  const file=await readSealed(path.join(root,BASE,'published',name)),dir=path.join(root,BASE,'runs',file.runId);
  check(/^[a-zA-Z0-9_-]+$/.test(file.runId)&&file.kind==='GLOBAL_CORRECTION_GROUP'&&file.schemaVersion===2&&file.accepted===false&&file.romPromotion===false,'CORRECTION_PUBLICATION_BINDING');
  const plan=await readSealed(path.join(dir,'plan.json')),receipt=await readSealed(path.join(dir,'group-pass.json'));
  check(hash(plan)===file.snapshotDigest&&receipt.planDigest===hash(plan)&&receipt.ok===true&&file.validation.ok===true,'CORRECTION_PASS_BINDING');
  check(hash(file.entries.map(e=>e.trainerId))===hash(plan.trainerIds)&&file.entries.length>0,'CORRECTION_GROUP_INCOMPLETE');
  for(const e of file.entries){
   const record=await readSealed(path.join(dir,`${e.trainerId}-submission.json`)),h=await readSealed(path.join(dir,`${e.trainerId}-handoff.json`));
   const preview=await readSealed(path.join(dir,'previews',hash(record.candidate)+'.json'));
   check(preview.ok===true&&preview.candidateDigest===hash(record.candidate)&&preview.planDigest===hash(plan)&&hash(preview.result)===hash(record.result),'CORRECTION_PREVIEW_BINDING');
   const p=record.candidate.provenance,original=plan.snapshot.presentations.find(t=>t.trainerId===e.trainerId);
   check(record.planDigest===hash(plan)&&h.planDigest===hash(plan)&&h.trainerId===e.trainerId&&h.baselineDigest===e.baselineDigest&&record.candidate.baselineDigest===e.baselineDigest,'CORRECTION_PLAN_BINDING');
   check(hash(h.issues)===hash(plan.issues.filter(i=>i.affected.some(a=>a.trainerId===e.trainerId)))&&record.candidate.reviewDigest===h.reviewDigest&&h.reviewDigest===hash(plan.reviews),'CORRECTION_ISSUE_BINDING');
   check(record.result.ok&&hash(record)===e.submissionDigest&&hash(record.result.updatedTrainer)===hash(e.updatedTrainer)&&hash(original)===e.baselineDigest,'CORRECTION_CANDIDATE_BINDING');
   check(hash(h.provenance)===hash(p)&&p.model==='gpt-6-astra'&&p.effort==='low'&&p.role==='corrector'&&p.contextMode==='fresh'&&p.executionRef===p.actorId&&!plan.excludedActors.includes(p.actorId),'CORRECTION_ACTOR_BINDING');
   check(hash(e.baselineSource)===hash(plan.snapshot.sources.find(s=>s.trainerId===e.trainerId))&&receipt.submissionDigests.includes(hash(record)),'CORRECTION_SOURCE_BINDING');
   check(record.candidate.resolutions.length===h.issues.length&&h.issues.every(i=>record.candidate.resolutions.some(r=>r.issueId===i.id&&['corrected','dismissed'].includes(r.status))),'CORRECTION_UNRESOLVED');
  }
  rows.push({digest:hash(file),payload:file,plan});
 }
 return rows.sort((a,b)=>a.payload.sequence-b.payload.sequence);
});}
export async function applyCorrection({projectRoot,originalTrainer}){
 let current=originalTrainer,last=null;
 for(const r of await readCorrections(projectRoot))for(const e of r.payload.entries.filter(e=>e.trainerId===current.trainerId)){
  check(hash(current)===e.baselineDigest,'CORRECTION_BASELINE_CHANGED');current=e.updatedTrainer;last=r.digest;
 }
 return last?{updatedTrainer:structuredClone(current),revisionDigest:last}:null;
}
