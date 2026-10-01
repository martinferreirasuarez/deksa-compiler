import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import * as engine from '../../v31/engine.mjs';
import {createWorkflow,digest} from '../../v31/workflow.mjs';
import {normalizeEntries,certifyAdmissionSequence,BASELINE_19_DIGEST} from '../../v31/window-recurrence.mjs';
import {operation,observeFile,assertObservedFiles} from '../../v31/operation-cache.mjs';

export const ADAPTER_ID='v31-order-v1';
const directory=path.dirname(fileURLToPath(import.meta.url));
const defaultRoot=path.resolve(directory,'../../../..');
const frozen={
  'engine.mjs':'bdb96b01e3a18fd3150382148a544374dd65e1e3cd3630871a5b0270a68cf176',
  'workflow.mjs':'16e4f1394c05545706a973cfacc65b48a39661c6a228c6318397f3c680ddfea2',
  'window-recurrence.mjs':'c552f14e7786c1a78405eabee2f0dce692cfc3cc65dcfe20a3a0ac66ef0b6e2c',
};
const check=(ok,message)=>{if(!ok)throw new Error(message);};
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
export async function identity() {
  const files={};
  for(const name of ['adapter.mjs','cli.mjs'])files[name]=sha(await fs.readFile(path.join(directory,name)));
  return {adapterId:ADAPTER_ID,adapterDigest:digest(files),files,frozenSources:frozen};
}

// The original loader proves the chain using the sealed admission context of
// each publication. Filenames are never evidence of chronological order.
export function chronologicalSnapshot(snapshot) {
  const {sources,presentations,admissions}=snapshot;
  check(snapshot.baselineDigest===BASELINE_19_DIGEST,'ADAPTER_BASELINE_REQUIRED');
  const additions=new Set(admissions.map(a=>a.trainerId));
  check(additions.size===admissions.length&&admissions.every(a=>a.ok&&a.mode==='VERIFIED_FORWARD_ADMISSION'),'ADAPTER_ADMISSION_REQUIRED');
  const baseline=sources.filter(s=>!additions.has(s.trainerId));
  check(baseline.length===19&&digest(baseline)===BASELINE_19_DIGEST,'ADAPTER_BASELINE_CHANGED');
  const ids=[...baseline.map(s=>s.trainerId),...admissions.map(a=>a.trainerId)];
  const ordered=rows=>{
    check(rows.length===ids.length&&new Set(rows.map(r=>r.trainerId)).size===ids.length,'ADAPTER_MEMBERSHIP_CHANGED');
    return ids.map(id=>{const row=rows.find(r=>r.trainerId===id);check(row,'ADAPTER_MEMBER_MISSING');return row;});
  };
  const sortedSources=ordered(sources),sortedPresentations=ordered(presentations);
  sortedPresentations.forEach((p,i)=>check(digest(p)===sortedSources[i].presentationDigest,'ADAPTER_PRESENTATION_CHANGED'));
  const trainers=normalizeEntries(sortedPresentations);
  const withoutOrder=value=>Array.isArray(value)?value.map(withoutOrder):value&&typeof value==='object'?
    Object.fromEntries(Object.entries(value).filter(([k])=>k!=='order').map(([k,v])=>[k,withoutOrder(v)])):value;
  check(digest(withoutOrder(ordered(snapshot.trainers)))===digest(withoutOrder(trainers)),'ADAPTER_NORMALIZED_FACT_CHANGED');
  const certified=certifyAdmissionSequence(trainers.slice(0,19),trainers.slice(19).map((trainer,i)=>({trainer,
    presentation:sortedPresentations[i+19],publicationDigest:sortedSources[i+19].publicationDigest})));
  check(digest(certified)===digest(admissions),'ADAPTER_ADMISSION_CHANGED');
  return {...snapshot,sources:sortedSources,presentations:sortedPresentations,trainers};
}

export const adaptedEngine={...engine,loadCatalogs:async root=>{
  const catalogs=await engine.loadCatalogs(root);
  return {...catalogs,windowSnapshot:chronologicalSnapshot(catalogs.windowSnapshot)};
}};

export async function createAdaptedWorkflow({projectRoot=defaultRoot,expectedAdapterDigest,...options}={}) {
  const root=await fs.realpath(projectRoot),applied=await identity();
  check(expectedAdapterDigest===applied.adapterDigest,'EXPECTED_ADAPTER_DIGEST_REQUIRED_OR_CHANGED');
  const workflow=await createWorkflow({...options,projectRoot:root,engine:adaptedEngine});
  return Object.fromEntries(Object.entries(workflow).map(([method,fn])=>[method,async(args={})=>operation(async()=>{
    check((await identity()).adapterDigest===applied.adapterDigest,'ADAPTER_SOURCE_CHANGED');
    for(const name of Object.keys(applied.files))await observeFile(path.join(directory,name));
    for(const [name,expected]of Object.entries(frozen)) {
      // Imported executable and project copy must both remain the frozen V31.
      for(const file of new Set([path.resolve(directory,'../../v31',name),path.join(root,'wiki/trainer-authoring/v31',name)])) {
        await observeFile(file);check(sha(await fs.readFile(file))===expected,'ADAPTER_FROZEN_SOURCE_CHANGED');
      }
    }
    const receipts=path.join(root,'wiki/trainer-authoring/repairs/v31-order-v1/operations');
    await fs.mkdir(receipts,{recursive:true});
    const id=randomUUID(),intent={schemaVersion:1,kind:'TECHNICAL_ADAPTER_OPERATION_NOT_CREATIVE_PROVENANCE',
      id,at:new Date().toISOString(),...applied,method,argumentsDigest:digest(args),
      runId:args.runId??null,trainerId:args.trainerId??null,actorId:args.actorId??args.organizer??args.acceptedBy??null};
    const write=(suffix,payload)=>fs.writeFile(path.join(receipts,`${id}.${suffix}.json`),JSON.stringify({digest:digest(payload),payload},null,2)+'\n',{flag:'wx'});
    await write('intent',intent);
    try {
      const result=await fn(args);
      await assertObservedFiles();
      await write('result',{intentDigest:digest(intent),resultDigest:digest(result),ok:true});
      const technicalCommands=Object.fromEntries(Object.entries(result.commands??{}).filter(([key,value])=>
        ['preview','start'].includes(key)&&Array.isArray(value)).map(([key,value])=>[key,
          [value[0],path.join(directory,'cli.mjs'),...value.slice(2),'--expected-adapter-digest',applied.adapterDigest]]));
      return {...result,...(Object.keys(technicalCommands).length?{technicalCommands}:{}),
        technicalAdapter:{...applied,operationId:id,intentDigest:digest(intent)}};
    } catch(error) {
      await write('result',{intentDigest:digest(intent),ok:false,error:error.message});throw error;
    }
  })]));
}
