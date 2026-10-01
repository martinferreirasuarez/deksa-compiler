import fs from 'node:fs/promises';
import path from 'node:path';
import {digest,readSealed} from '../window-revisions/v1/reader.mjs';
import {appendAdmissions} from './window-recurrence.mjs';
import {historicalEvidence} from '../v32/historical-evidence.mjs';
import {loadResumeSnapshot} from '../experiments/astra-resume-v1/snapshot.mjs';
import {createResumeWorkflow} from '../experiments/astra-resume-v1/adapter.mjs';
import {memo,observeFile} from '../v32/operation-cache.mjs';
import {cachedBaseline} from '../experiments/astra-resume-v1/cache.mjs';
export const BASE='wiki/trainer-authoring/v33',GENERATOR_ID='beta4-v33';
export const ASTRA_ADAPTER_DIGEST='d5348f6ebc1772181149992664dfccb0177d68d33f6bb3b66be0bfe8fd6efd1e';
export const ASTRA_PUBLICATIONS_DIGEST='b2e0e9327749cd1c754fc15a21df39beebc78cbac669b5c5342d080d473c197b';
const check=(ok,message)=>{if(!ok)throw new Error(message);};
export function inheritedEvidence(root){return memo(`v33:inherited:${root}`,async()=>{
  // Astra artifacts are excluded by the inherited cache's manifest. Always
  // replay their original verifier; cache only the original baseline it uses.
  const workflow=await createResumeWorkflow({projectRoot:root,expectedAdapterDigest:ASTRA_ADAPTER_DIGEST});
  const astra=await workflow.verifiedEvidence();
  check(astra.publications.length===15&&astra.accepted.length===15&&astra.runs.length===16,'IDENTITY_ASTRA_PREFIX_CHANGED');
  check(digest(astra.publications.map(p=>[p.trainerId,p.sha256]).sort((a,b)=>a[0].localeCompare(b[0])))===ASTRA_PUBLICATIONS_DIGEST,'IDENTITY_ASTRA_PUBLICATIONS_CHANGED');
  check(astra.publications.some(p=>p.trainerId==='lass-miriam')&&astra.runs.some(r=>r.trainerId==='bug-catcher-kent'&&r.runId==='b4-astra-resume-kent-001'&&r.state==='AUTHORING'),'IDENTITY_ASTRA_ENDPOINT_CHANGED');
  const historical=await cachedBaseline(root,'v33-original-historical',()=>historicalEvidence(root));
  return {publications:[...historical.publications,...astra.publications],accepted:[...historical.accepted,...astra.accepted],
    runs:[...historical.runs.filter(r=>!astra.runs.some(a=>a.trainerId===r.trainerId)),...astra.runs]};
});}
export function baseline(root){return memo(`v33:baseline:${root}`,async()=>{
  await inheritedEvidence(root);const snapshot=await loadResumeSnapshot(root);
  check(snapshot.sources.length===42&&snapshot.presentations.length===42,'IDENTITY_BASELINE_NOT_42');return snapshot;
});}
export function loadIdentitySnapshot(root){return memo(`v33:snapshot:${root}`,async()=>{
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
export const loadWindowSnapshot=loadIdentitySnapshot;
