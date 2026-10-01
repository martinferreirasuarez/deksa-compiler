import fs from 'node:fs/promises';
import path from 'node:path';
import {digest,readSealed} from '../window-revisions/v1/reader.mjs';
import {appendAdmissions} from './window-recurrence.mjs';
import {inheritedEvidence as previousInheritedEvidence,loadSimpleSnapshot as loadPreviousSnapshot} from '../v34/snapshot.mjs';
import {createSimpleWorkflow} from '../v34/adapter.mjs';
import {NOTE_RECOVERY,verifyRecoverySource} from './recovery.mjs';
import {memo,observeFile} from '../v32/operation-cache.mjs';
export const BASE='wiki/trainer-authoring/v35',GENERATOR_ID='beta4-v35';
export const IDENTITY_ADAPTER_DIGEST='c6399677babdaa231daee342eae880f368a72c1268adcd40768f1216594ac571';
export const IDENTITY_PUBLICATIONS_DIGEST='810ec1c1b435ed0efef622e81d834666490d73c0449b88bc09c3fbb03a14deac';
const check=(ok,message)=>{if(!ok)throw new Error(message);};
export function inheritedEvidence(root){return memo(`v35:inherited:${root}`,async()=>{
  await verifyRecoverySource(root);
  const workflow=await createSimpleWorkflow({projectRoot:root,expectedAdapterDigest:NOTE_RECOVERY.sourceAdapterDigest});
  const current=await workflow.verifiedEvidence();
  check(current.publications.length===0&&current.accepted.length===0&&current.runs.length===1&&current.runs[0].runId===NOTE_RECOVERY.sourceRunId&&current.runs[0].state==='REJECTED','NOTE_RECOVERY_V34_PREFIX_CHANGED');
  const previous=await previousInheritedEvidence(root);
  return {publications:previous.publications,accepted:previous.accepted,runs:[...previous.runs,...current.runs]};
});}
export function baseline(root){return memo(`v35:baseline:${root}`,async()=>{
  await inheritedEvidence(root);const snapshot=await loadPreviousSnapshot(root);
  check(snapshot.sources.length===46&&snapshot.presentations.length===46,"SIMPLE_BASELINE_NOT_46");return snapshot;
});}
export function loadSimpleSnapshot(root){return memo(`v35:snapshot:${root}`,async()=>{
  const snapshot=await baseline(root),additions=[];
  let files=[];try{files=await fs.readdir(path.join(root,BASE,'published'));}catch(e){if(e.code!=='ENOENT')throw e;}
  const sealed=async relative=>{await observeFile(path.join(root,relative));return readSealed(path.join(root,relative));};
  for(const file of files.sort().filter(f=>f!=='index.json')){
    check(/^[a-zA-Z0-9_-]+\.json$/.test(file),'IDENTITY_INVALID_PUBLICATION_PATH');
    const artifactPath=`${BASE}/published/${file}`,publication=await sealed(artifactPath),p=publication.payload;
    check(p.generatorId===GENERATOR_ID&&p.runId===file.slice(0,-5)&&p.status==='TRAINER_REVIEW'&&p.trainerId===p.trainer?.trainerId&&p.lotId===p.trainer?.lotId&&p.accepted===false&&p.lotAccepted===false&&p.romPromotion===false,'IDENTITY_INVALID_PUBLICATION');
    const context=await sealed(`${BASE}/runs/${p.runId}/context.json`);
    check(context.digest===p.contextDigest&&context.payload.trainerId===p.trainerId&&context.payload.policyId==='DEKSA-BETA4-TRAINER-POLICY-24','IDENTITY_CONTEXT_BINDING_MISMATCH');
    check(p.author?.provenance?.model==='gpt-6-astra'&&p.corrector?.provenance?.model==='gpt-6-astra'&&p.author.provenance.effort==='low'&&p.corrector.provenance.effort==='low'&&p.author.provenance.contextMode==='fresh'&&p.corrector.provenance.contextMode==='fresh'&&p.author.provenance.actorId!==p.corrector.provenance.actorId,'IDENTITY_ACTOR_PROVENANCE_REQUIRED');
    let acceptanceDigest=null;
    try{const acceptance=await sealed(`${BASE}/accepted/trainers/${p.trainerId}.json`),a=acceptance.payload;
      check(a.status==='TRAINER_ACCEPTED'&&a.generatorId===GENERATOR_ID&&a.trainerId===p.trainerId&&a.publicationDigest===publication.digest&&a.publicationPath===artifactPath,'IDENTITY_ACCEPTANCE_BINDING_MISMATCH');acceptanceDigest=acceptance.digest;
    }catch(e){if(e.code!=='ENOENT')throw e;}
    additions.push({presentation:p.trainer,context:context.payload.windowRecurrence,source:{trainerId:p.trainerId,publicationDigest:publication.digest,acceptanceDigest,itemRevisionDigest:null,familyRevisionDigest:null,windowRevisionDigest:null,presentationDigest:digest(p.trainer)}});
  }
  return appendAdmissions(snapshot,additions);
});}
export const loadWindowSnapshot=loadSimpleSnapshot;
