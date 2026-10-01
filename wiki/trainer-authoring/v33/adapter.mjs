import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import * as engine from './engine.mjs';
import {digest,FROZEN_WORKFLOW,deriveWorkflow,KENT_POLICY_TRANSITION} from './workflow.mjs';
import {operation,observeFile,assertObservedFiles} from '../v32/operation-cache.mjs';
import {cacheOperation} from '../experiments/astra-resume-v1/cache.mjs';
export const BASE='wiki/trainer-authoring/v33';
const directory=path.dirname(fileURLToPath(import.meta.url)),defaultRoot=path.resolve(directory,'../../..');
const originalURL=new URL('../v32/workflow.mjs',import.meta.url);
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const check=(ok,message)=>{if(!ok)throw new Error(message);};
export async function identity(){const files={};
  for(const name of ['adapter.mjs','workflow.mjs','snapshot.mjs','cli.mjs','query.mjs','reader.mjs','engine.mjs','window-recurrence.mjs','identity-quota.mjs','policy.json'])files[name]=sha(await fs.readFile(path.join(directory,name)));
  return {adapterId:'identity-quota-v33',adapterDigest:digest(files),files,frozenWorkflow:FROZEN_WORKFLOW,generatorId:'beta4-v33',storageBase:BASE,
    transition:KENT_POLICY_TRANSITION,authorization:'D-261',actorRequirement:{model:'gpt-6-astra',effort:'low',contextMode:'fresh'}};
}
export async function createIdentityWorkflow({projectRoot=defaultRoot,expectedAdapterDigest,engine:injectedEngine,fresh=false,onCacheMetrics,...options}={}){
  if(injectedEngine!==undefined||Object.hasOwn(options,'auditedReferences')||Object.hasOwn(options,'externalReviewReferences'))throw new Error('IDENTITY_CUSTOM_VERIFIERS_FORBIDDEN');
  const root=await fs.realpath(projectRoot),applied=await identity();check(applied.adapterDigest===expectedAdapterDigest,'IDENTITY_EXPECTED_ADAPTER_DIGEST_REQUIRED');
  const derived=await import(`data:text/javascript;base64,${Buffer.from(deriveWorkflow(await fs.readFile(originalURL,'utf8'),applied)).toString('base64')}`);
  const workflow=await derived.createWorkflow({...options,projectRoot:root,engine});
  const manifestRoots=(await fs.readdir(path.join(root,'wiki/trainer-authoring'))).filter(name=>name!=='v33').map(name=>`wiki/trainer-authoring/${name}`);
  manifestRoots.push(...Object.keys(applied.files).map(name=>`${BASE}/${name}`),`${BASE}/skills`,'wiki/app/generated','pokefirered/src','pokefirered/data',
    ...(await fs.readdir(root)).filter(name=>name==='DECISIONS.md'||/^TRAINER_.*\.md$/.test(name)));
  return Object.fromEntries(Object.entries(workflow).map(([method,fn])=>[method,(args={})=>cacheOperation(root,{fresh,onMetrics:onCacheMetrics,manifestOptions:{roots:manifestRoots}},()=>operation(async()=>{
    check((await identity()).adapterDigest===applied.adapterDigest,'IDENTITY_ADAPTER_CHANGED');
    for(const [name,hash]of Object.entries(applied.files))for(const file of new Set([path.join(directory,name),path.join(root,BASE,name)])){
      await observeFile(file);check(sha(await fs.readFile(file))===hash,'IDENTITY_EXECUTABLE_CHANGED');}
    for(const file of new Set([fileURLToPath(originalURL),path.join(root,'wiki/trainer-authoring/v32/workflow.mjs')])){
      await observeFile(file);check(sha(await fs.readFile(file))===FROZEN_WORKFLOW,'IDENTITY_FROZEN_WORKFLOW_CHANGED');}
    const result=await fn(args);await assertObservedFiles();
    const technicalCommands=Object.fromEntries(Object.entries(result.commands??{}).filter(([key,value])=>['preview','start'].includes(key)&&Array.isArray(value))
      .map(([key,value])=>[key,[value[0],path.join(directory,'cli.mjs'),...value.slice(2),'--expected-adapter-digest',applied.adapterDigest]]));
    return {...result,technicalAdapter:applied,...(Object.keys(technicalCommands).length?{technicalCommands}:{})};
  }))]));
}
