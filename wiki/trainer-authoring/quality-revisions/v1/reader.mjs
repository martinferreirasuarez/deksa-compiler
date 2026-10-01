import fs from 'node:fs/promises';
import path from 'node:path';
import {digest,seal,readSealed,rawSubmission} from '../../family-revisions/v1/reader.mjs';
import {memo,observeFile} from '../../v32/operation-cache.mjs';
export {digest,seal,readSealed,rawSubmission};
export const BASE='wiki/trainer-authoring/quality-revisions/v1';
export const ORDER=Object.freeze(['bug-catcher-doug','rocket-cerulean','rocket-recruiter','camper-ethan']);
export const CONTRACT='TRAINER_QUALITY_REVISIONS.md';
const letters=['A','B','C'];
export const check=(ok,message)=>{if(!ok)throw new Error(message);};
const exact=(value,keys)=>check(value&&typeof value==='object'&&!Array.isArray(value)
  &&Object.keys(value).sort().join()===keys.slice().sort().join(),'QUALITY_INVALID_FIELDS');
export const sourcePins=snapshot=>snapshot.sources.map(s=>structuredClone(s));
export function admissionEvidence(trainer,source,{planDigest,contractDigest}) {
  check(ORDER.includes(trainer.trainerId)&&source.trainerId===trainer.trainerId
    &&source.presentationDigest===digest(trainer),'QUALITY_ADMISSION_BASE_MISMATCH');
  return {scope:'VERIFIED_QUALITY_REVISION',trainerId:trainer.trainerId,lotId:trainer.lotId,
    beforePresentationDigest:digest(trainer),source:structuredClone(source),planDigest,contractDigest,
    retainedOwners:Object.fromEntries(letters.map(letter=>[letter,trainer.variants[letter].members.map(m=>({family:m.family,role:m.akiRole}))])),
    fixedAnchors:Object.fromEntries(letters.map(letter=>[letter,trainer.variants[letter].members.filter(m=>m.akiRole==='A').map(m=>({family:m.family,species:m.species})).sort((a,b)=>a.family.localeCompare(b.family))]))};
}
export function validateProposal(context,proposal,{role=proposal?.provenance?.role,author}={}) {
  exact(proposal,['provenance','submission','qualityComparison',...(role==='corrector'?['review']:[])]);
  exact(proposal.provenance,['actorId','model','effort','role','contextMode','executionRef','inputDigest']);
  const p=proposal.provenance;
  check(['author','corrector'].includes(role)&&p.role===role&&p.model==='gpt-6-astra'&&p.effort==='low'
    &&p.contextMode==='fresh'&&typeof p.actorId==='string'&&p.actorId.trim()&&typeof p.executionRef==='string'&&p.executionRef.trim()
    &&p.inputDigest===context.digest,'QUALITY_PROVENANCE_OR_CONTEXT_MISMATCH');
  check(proposal.submission?.trainerId===context.payload.trainerId,'QUALITY_TRAINER_MISMATCH');
  exact(proposal.qualityComparison,letters);
  for(const letter of letters) {
    const comparison=proposal.qualityComparison[letter];
    exact(comparison,['baselineContribution','changesAndCosts','alternatives','resourceAllocation','expectedImprovement','remainingLimits']);
    check(Object.values(comparison).every(v=>typeof v==='string'&&v.trim()),'QUALITY_COMPARISON_REQUIRED');
  }
  if(role==='corrector') {
    check(author&&p.actorId!==author.provenance.actorId&&p.executionRef!==author.provenance.executionRef,'QUALITY_ACTOR_NOT_INDEPENDENT');
    exact(proposal.review,['authorDigest','variants','bossIdentityReview','crossVariantEquivalence','factualCheck','warningResponses']);
    check(proposal.review.authorDigest===digest(author),'QUALITY_AUTHOR_DIGEST_MISMATCH');
    exact(proposal.review.variants,letters);
    for(const letter of letters) {
      exact(proposal.review.variants[letter],['mainPlan','threats','changes','alternatives','tradeoffs','order']);
      check(Object.values(proposal.review.variants[letter]).every(v=>typeof v==='string'&&v.trim()),'QUALITY_REVIEW_REQUIRED');
    }
    exact(proposal.review.bossIdentityReview,['globalSignatures','neighbors','pendingComparisons']);
    check(Object.values(proposal.review.bossIdentityReview).every(v=>typeof v==='string'&&v.trim())
      &&typeof proposal.review.factualCheck==='string'&&proposal.review.factualCheck.trim()
      &&typeof proposal.review.crossVariantEquivalence==='string'&&proposal.review.crossVariantEquivalence.trim()
      &&Array.isArray(proposal.review.warningResponses),'QUALITY_REVIEW_REQUIRED');
  }
  return proposal.submission;
}
export function mergePresentation(originalTrainer,normalized,submission) {
  check(normalized.trainerId===originalTrainer.trainerId&&normalized.lotId===originalTrainer.lotId
    &&normalized.profile===originalTrainer.profile,'QUALITY_IDENTITY_OR_PROFILE_CHANGED');
  const updatedTrainer={...structuredClone(originalTrainer),variants:structuredClone(normalized.variants)};
  check(digest(rawSubmission(updatedTrainer))===digest(submission),'QUALITY_NORMALIZED_SUBMISSION_MISMATCH');
  return updatedTrainer;
}
export async function infrastructurePins(root) {
  const files=[...['runner.mjs','reader.mjs','tests.mjs','SKILL.md'].map(n=>`${BASE}/${n}`),CONTRACT,
    'TRAINER_PLANNED_RECURRENCE.md','TRAINER_FORWARD_RECURRENCE.md',
    ...['engine.mjs','window-recurrence.mjs','revision-admission.mjs','historical-evidence.mjs','planned-inventory.mjs',
      'operation-cache.mjs','policy.json','workflow.mjs','query.mjs','specialist-evidence.mjs','starter-policy.mjs',
      'move-mechanics.mjs','fossil-availability.mjs','fixed-contracts.mjs','package-permutation.mjs','inherited-references.mjs','audit.mjs'].map(n=>`wiki/trainer-authoring/v32/${n}`),
    ...['quality.md','engine-capabilities.md'].map(n=>`wiki/trainer-authoring/v32/skills/deksa-trainer-generator/references/${n}`)];
  const pins={};for(const relative of files){const file=path.join(root,relative);await observeFile(file);pins[relative]=digest(await fs.readFile(file));}return pins;
}
export function readQualityPublications(root) {return memo(`quality-v1:publications:${root}`,async()=>{
  const folder=path.join(root,BASE,'published');let index;
  try{await observeFile(path.join(folder,'index.json'));index=await readSealed(path.join(folder,'index.json'));}catch(e){if(e.code==='ENOENT')return [];throw e;}
  await observeFile(path.join(root,BASE,'plan.json'));const plan=await readSealed(path.join(root,BASE,'plan.json'));
  check(digest(plan.payload.infrastructurePins)===digest(await infrastructurePins(root)),'QUALITY_INFRASTRUCTURE_CHANGED');
  const ids=Object.keys(index.payload.entries??{});
  check(ids.every(id=>ORDER.includes(id))&&ids.length<=ORDER.length
    &&ORDER.slice(0,ids.length).every(id=>ids.includes(id)),'QUALITY_PUBLICATION_ORDER_OR_SCOPE');
  const revisions=[];
  for(const trainerId of ORDER.slice(0,ids.length)) {
    const file=path.join(folder,`${trainerId}.json`);await observeFile(file);const revision=await readSealed(file),r=revision.payload;
    check(index.payload.entries[trainerId]===revision.digest&&r.status==='QUALITY_REVIEW'&&r.trainerId===trainerId
      &&r.accepted===false&&r.lotAccepted===false&&r.romPromotion===false&&r.visualAudit===false,'QUALITY_PUBLICATION_BINDING');
    check(r.context?.digest===digest(r.context?.payload)&&r.context.payload.planDigest===plan.digest
      &&r.context.payload.trainerId===trainerId&&digest(r.context.payload.originalTrainer)===r.presentationDigest
      &&r.context.payload.basePublicationDigest===r.basePublicationDigest,'QUALITY_CONTEXT_BINDING');
    validateProposal(r.context,r.author,{role:'author'});validateProposal(r.context,r.corrector,{role:'corrector',author:r.author});
    check(digest(rawSubmission(r.updatedTrainer))===digest(r.corrector.submission),'QUALITY_PRESENTATION_SUBMISSION_BINDING');
    const rebuilt={...structuredClone(r.context.payload.originalTrainer),variants:r.updatedTrainer.variants};
    check(digest(rebuilt)===digest(r.updatedTrainer),'QUALITY_UNAUTHORIZED_METADATA_CHANGE');
    const prior=revisions.flatMap(e=>[e.payload.author.provenance,e.payload.corrector.provenance]);
    check([r.author.provenance,r.corrector.provenance].every(p=>prior.every(a=>a.actorId!==p.actorId&&a.executionRef!==p.executionRef)),'QUALITY_ACTOR_REUSED');
    revisions.push(revision);
  }
  return revisions;
});}
export async function applyQualityRevision({projectRoot,originalTrainer,basePublicationDigest}) {
  const revision=(await readQualityPublications(projectRoot)).find(r=>r.payload.trainerId===originalTrainer.trainerId);
  if(!revision)return null;
  const r=revision.payload;
  check(r.basePublicationDigest===basePublicationDigest&&r.presentationDigest===digest(originalTrainer),'QUALITY_REVISION_BASELINE_MISMATCH');
  // Raw submissions omit derived facts. Rebuild materializations with the real
  // engine before exposing a sealed presentation to any consumer.
  await (await import('./runner.mjs')).verifyQualityRevisions(projectRoot);
  return {updatedTrainer:structuredClone(r.updatedTrainer),revisionDigest:revision.digest};
}
