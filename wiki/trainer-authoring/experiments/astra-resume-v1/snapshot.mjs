import fs from 'node:fs/promises';
import path from 'node:path';
import {digest,readSealed} from '../../window-revisions/v1/reader.mjs';
import {appendAdmissions} from '../../v32/window-recurrence.mjs';
import {verifyQualityRevisions} from '../../quality-revisions/v1/runner.mjs';
import {createAdaptedWorkflow} from '../sol-medium-v1/adapter.mjs';
import {memo,observeFile} from '../../v32/operation-cache.mjs';
import {cachedBaseline} from './cache.mjs';
export const BASE='wiki/trainer-authoring/experiments/astra-resume-v1';
export const GENERATOR_ID='beta4-astra-resume-v1';
export const SOL_ADAPTER='7b2e15d7b972573c2697f75947d71536c251d0b86320808948b73fb9f9795c2b';
export const RETIRED=Object.freeze({
  'camper-shane':{runId:'b4-v32-camper-shane-policy23-001',publicationDigest:'acb019777ba733bb970d35e04ecf9d7142c85920a0fd1d4969e1b646147147dd',acceptanceDigest:'f523b8d11ebf2691c0cf865ea10083de7a664cde3ec1a61d45952272db2fa2f9'},
  'hiker-marcos':{runId:'b4-v32-hiker-marcos-sol-medium-001',publicationDigest:'7c90445384316603d9d9066cb63d291818f30ff451d54f429cae7f2f24ff86e4',acceptanceDigest:null},
});
const check=(ok,message)=>{if(!ok)throw new Error(message);};
export function retiredEvidence(root){return memo(`astra-resume:retired:${root}`,()=>cachedBaseline(root,'retired-sol-evidence',async()=>{
  const workflow=await createAdaptedWorkflow({projectRoot:root,expectedAdapterDigest:SOL_ADAPTER});
  const evidence=await workflow.verifiedEvidence();
  check(evidence.publications.length===2&&evidence.accepted.length===1&&evidence.runs.length===2,'RESUME_RETIRED_SUFFIX_CHANGED');
  for(const [id,pin]of Object.entries(RETIRED)){
    const publication=evidence.publications.find(p=>p.trainerId===id),acceptance=evidence.accepted.find(a=>a.trainerId===id);
    check(publication?.runId===pin.runId&&publication.sha256===pin.publicationDigest
      &&(acceptance?.acceptanceDigest??null)===pin.acceptanceDigest,'RESUME_RETIRED_PIN_CHANGED');
  }
  return {authorization:'USER_2026_09_08_RE_HACELOS_CON_ASTRA_LOW_Y_CONTINUA_DE_AHI',
    mode:'REPLACE_COMPLETE_SOL_SUFFIX_WITH_NEW_FRESH_AUTHORSHIP',solAdapterDigest:SOL_ADAPTER,retired:RETIRED,
    creativeInputs:false,acceptRetiredMarcos:false};
}));}
export function baseline(root){return memo(`astra-resume:baseline:${root}`,()=>cachedBaseline(root,'baseline27-quality-snapshot',async()=>{
  await retiredEvidence(root);
  const result=await verifyQualityRevisions(root),snapshot=result.snapshot;
  check(snapshot.sources.length===27&&!snapshot.sources.some(s=>Object.hasOwn(RETIRED,s.trainerId)),'RESUME_BASELINE_NOT_27');
  return snapshot;
}));}
export function loadResumeSnapshot(root){return memo(`astra-resume:snapshot:${root}`,async()=>{
  const snapshot=await baseline(root),additions=[];
  let files=[];try{files=await fs.readdir(path.join(root,BASE,'published'));}catch(e){if(e.code!=='ENOENT')throw e;}
  const sealed=async relative=>{await observeFile(path.join(root,relative));return readSealed(path.join(root,relative));};
  for(const file of files.sort().filter(f=>f!=='index.json')){
    check(/^[a-zA-Z0-9_-]+\.json$/.test(file),'RESUME_INVALID_PUBLICATION_PATH');
    const artifactPath=`${BASE}/published/${file}`,publication=await sealed(artifactPath),p=publication.payload;
    check(p.generatorId===GENERATOR_ID&&p.runId===file.slice(0,-5)&&p.status==='TRAINER_REVIEW'
      &&p.trainerId===p.trainer?.trainerId&&p.lotId===p.trainer?.lotId&&p.accepted===false
      &&p.lotAccepted===false&&p.romPromotion===false,'RESUME_INVALID_PUBLICATION');
    const context=await sealed(`${BASE}/runs/${p.runId}/context.json`);
    check(context.digest===p.contextDigest&&context.payload.trainerId===p.trainerId
      &&context.payload.policyId==='DEKSA-BETA4-TRAINER-POLICY-23','RESUME_CONTEXT_BINDING_MISMATCH');
    check(p.author?.provenance?.model==='gpt-6-astra'&&p.corrector?.provenance?.model==='gpt-6-astra'
      &&p.author.provenance.effort==='low'&&p.corrector.provenance.effort==='low'
      &&p.author.provenance.contextMode==='fresh'&&p.corrector.provenance.contextMode==='fresh'
      &&p.author.provenance.actorId!==p.corrector.provenance.actorId,'RESUME_ACTOR_PROVENANCE_REQUIRED');
    let acceptanceDigest=null;
    try{const acceptance=await sealed(`${BASE}/accepted/trainers/${p.trainerId}.json`),a=acceptance.payload;
      check(a.status==='TRAINER_ACCEPTED'&&a.generatorId===GENERATOR_ID&&a.trainerId===p.trainerId
        &&a.publicationDigest===publication.digest&&a.publicationPath===artifactPath,'RESUME_ACCEPTANCE_BINDING_MISMATCH');
      acceptanceDigest=acceptance.digest;
    }catch(e){if(e.code!=='ENOENT')throw e;}
    additions.push({presentation:p.trainer,context:context.payload.windowRecurrence,source:{trainerId:p.trainerId,
      publicationDigest:publication.digest,acceptanceDigest,itemRevisionDigest:null,familyRevisionDigest:null,
      windowRevisionDigest:null,presentationDigest:digest(p.trainer)}});
  }
  return appendAdmissions(snapshot,additions);
});}
