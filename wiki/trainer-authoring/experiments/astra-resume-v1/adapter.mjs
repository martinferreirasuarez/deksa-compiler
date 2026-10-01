import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import * as engine from '../../v32/engine.mjs';
import {digest} from '../../v32/workflow.mjs';
import {operation,observeFile,assertObservedFiles} from '../../v32/operation-cache.mjs';
import {BASE,GENERATOR_ID,RETIRED,loadResumeSnapshot,retiredEvidence} from './snapshot.mjs';
import {cacheOperation,cachedBaseline} from './cache.mjs';
export const FROZEN_WORKFLOW='ed47de9aafa13cfd1abb98f62b18588bd49a32fe781842540596fc91c6c5bf6a';
export const RUNS=Object.freeze({'camper-shane':'b4-astra-resume-shane-001','hiker-marcos':'b4-astra-resume-marcos-001'});
const directory=path.dirname(fileURLToPath(import.meta.url));
const defaultRoot=path.resolve(directory,'../../../..'),originalURL=new URL('../../v32/workflow.mjs',import.meta.url);
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const check=(ok,message)=>{if(!ok)throw new Error(message);};
export async function identity(){const files={};
  for(const name of ['adapter.mjs','snapshot.mjs','cache.mjs','cli.mjs','query.mjs','reader.mjs','CONTRACT.md'])files[name]=sha(await fs.readFile(path.join(directory,name)));
  return {adapterId:'astra-resume-v1',adapterDigest:digest(files),files,frozenWorkflow:FROZEN_WORKFLOW,
    generatorId:GENERATOR_ID,storageBase:BASE,runs:RUNS,retired:RETIRED,
    authorization:'USER_2026_09_08_RE_HACELOS_CON_ASTRA_LOW_Y_CONTINUA_DE_AHI',actorRequirement:{model:'gpt-6-astra',effort:'low',contextMode:'fresh'}};
}
export function deriveWorkflow(source,evidence){check(sha(source)===FROZEN_WORKFLOW,'RESUME_FROZEN_WORKFLOW_CHANGED');let result=source;
  const once=(from,to)=>{check(result.split(from).length===2,`RESUME_TRANSFORM_ANCHOR_CHANGED: ${from.slice(0,60)}`);result=result.replace(from,to);};
  once("import { loadWindowSnapshot, windowContext, windowFindings } from './window-recurrence.mjs';",
    `import {windowContext,windowFindings} from './window-recurrence.mjs';\nimport {loadResumeSnapshot as loadWindowSnapshot,retiredEvidence} from '${new URL('./snapshot.mjs',import.meta.url).href}';`);
  once("export const GENERATOR_ID = 'beta4-v32';",`export const GENERATOR_ID = '${GENERATOR_ID}';`);
  once("const BASE = 'wiki/trainer-authoring/v32';",`const RESUME=${JSON.stringify(evidence)};\nconst BASE = '${BASE}';`);
  result=`import {cachedBaseline} from '${new URL('./cache.mjs',import.meta.url).href}';\n`+result;
  once("const cached=(name,fn)=>(...args)=>memo(`${root}:${BASE}:${name}:${digest(args)}`,()=>fn(...args));",
    "const cached=(name,fn)=>(...args)=>memo(`${root}:${BASE}:${name}:${digest(args)}`,()=>['audited','externalReviews','acceptedExternal','predecessor'].includes(name)?cachedBaseline(root,`workflow-${name}:${digest(args)}`,()=>fn(...args)):fn(...args));");
  once("const BASE=`wiki/trainer-authoring/${referenceVersion??'v32'}`;",`const BASE='${BASE}',SOURCE_BASE='wiki/trainer-authoring/v32';`);
  once("const GENERATOR_ID=`beta4-${referenceVersion??'v32'}`;",`const GENERATOR_ID='${GENERATOR_ID}';`);
  once('const hashes = {};',"const hashes = {'astraResumeAdapter':digest(RESUME),'retiredSolSuffix':digest(await retiredEvidence(root))};");
  once('const file=await checked(`${BASE}/${source}`);','const file=await checked(`${SOURCE_BASE}/${source}`);');
  once("['operation-cache.mjs',`${BASE}/operation-cache.mjs`]","['operation-cache.mjs',`${SOURCE_BASE}/operation-cache.mjs`]");
  once("runId:'b4-v32-camper-shane-policy23-001'",`runId:'${RUNS['camper-shane']}'`);
  once('async function authorizedRevision(trainerId) {',`async function authorizedRevision(trainerId) {
    if(Object.hasOwn(RESUME.retired,trainerId))return {authorization:RESUME.authorization,retiredPublication:RESUME.retired[trainerId],
      mode:'REPLACE_SOL_SUFFIX_FROM_BASELINE27',creativeInputs:false};`);
  once('async function start({ runId, trainerId, organizer }) {',`async function start({ runId, trainerId, organizer }) {
    if(Object.hasOwn(RESUME.runs,trainerId)&&runId!==RESUME.runs[trainerId])fail('RESUME_NOMINAL_RUN_REQUIRED');`);
  once('authorizedRevision: revision, productionScope: scope,','authorizedRevision: revision, productionScope: scope, resumePolicy: RESUME,');
  once('const context = await unseal(`${directory}/context.json`);',`if(digest(opening.payload.resumePolicy)!==digest(RESUME))fail('RESUME_POLICY_CHANGED');
    const context = await unseal(\x60\x24{directory}/context.json\x60);`);
  once('productionScope: run.opening.payload.productionScope ?? null,','productionScope: run.opening.payload.productionScope ?? null, resumePolicy: run.opening.payload.resumePolicy,');
  once('const references = `${BASE}/skills/deksa-trainer-generator/references`;','const references = `${SOURCE_BASE}/skills/deksa-trainer-generator/references`;');
  once('const workflow = await checked(`${BASE}/workflow.mjs`);','const workflow = await checked(`${BASE}/cli.mjs`);');
  once('return { role, runId, trainerId: run.opening.payload.trainerId,','return { role, runId, trainerId: run.opening.payload.trainerId, resumePolicy: RESUME,');
  // Resolve all original imports in place. No original file is written.
  result=result.replace(/from (['"])(\.\.?\/[^'"]+)\1/g,(_,q,s)=>`from ${q}${new URL(s,originalURL).href}${q}`);
  result=result.replaceAll('import.meta.url',JSON.stringify(originalURL.href));return result;
}
export async function createResumeWorkflow({projectRoot=defaultRoot,expectedAdapterDigest,engine:injectedEngine,fresh=false,onCacheMetrics,...options}={}){
  if(injectedEngine!==undefined||Object.hasOwn(options,'auditedReferences')||Object.hasOwn(options,'externalReviewReferences'))throw new Error('RESUME_CUSTOM_VERIFIERS_FORBIDDEN');
  const root=await fs.realpath(projectRoot),applied=await identity();check(applied.adapterDigest===expectedAdapterDigest,'RESUME_EXPECTED_ADAPTER_DIGEST_REQUIRED');
  const source=await fs.readFile(originalURL,'utf8');
  const derived=await import(`data:text/javascript;base64,${Buffer.from(deriveWorkflow(source,applied)).toString('base64')}`);
  const raw=engine;
  const adaptedEngine={...raw,loadCatalogs:async projectRoot=>{
    const snapshot=await loadResumeSnapshot(projectRoot);
    const catalogs=await cachedBaseline(projectRoot,'factual-v32-catalogs',()=>raw.loadCatalogs(projectRoot,{windowSnapshot:snapshot}));
    return {...catalogs,windowSnapshot:snapshot};
  }};
  const workflow=await derived.createWorkflow({...options,projectRoot:root,engine:adaptedEngine});
  return Object.fromEntries(Object.entries(workflow).map(([method,fn])=>[method,(args={})=>cacheOperation(root,{fresh,onMetrics:onCacheMetrics},()=>operation(async()=>{
    check((await identity()).adapterDigest===applied.adapterDigest,'RESUME_ADAPTER_CHANGED');
    for(const [name,hash]of Object.entries(applied.files))for(const file of new Set([path.join(directory,name),path.join(root,BASE,name)])){
      await observeFile(file);check(sha(await fs.readFile(file))===hash,'RESUME_EXECUTABLE_CHANGED');}
    for(const file of new Set([fileURLToPath(originalURL),path.join(root,'wiki/trainer-authoring/v32/workflow.mjs')])){
      await observeFile(file);check(sha(await fs.readFile(file))===FROZEN_WORKFLOW,'RESUME_FROZEN_WORKFLOW_CHANGED');}
    const result=await fn(args);await assertObservedFiles();
    const technicalCommands=Object.fromEntries(Object.entries(result.commands??{}).filter(([key,value])=>['preview','start'].includes(key)&&Array.isArray(value))
      .map(([key,value])=>[key,[value[0],path.join(directory,'cli.mjs'),...value.slice(2),'--expected-adapter-digest',applied.adapterDigest]]));
    return {...result,technicalAdapter:applied,...(Object.keys(technicalCommands).length?{technicalCommands}:{}),
      ...(result.role?{resumeInstructions:'User authorizes fresh Astra-low regeneration of Shane and Marcos, then normal W02 continuation. The entire Sol suffix is retired from creative inputs. Read the new sealed context and original role references. Do not consult retired Sol runs, drafts, or chats. Use technicalCommands.preview. Exactly two fresh independent creative actors. All factual rules remain unchanged.'}:{})};
  }))]));
}
