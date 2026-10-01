import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {digest} from '../../v32/workflow.mjs';
import {operation,observeFile,assertObservedFiles} from '../../v32/operation-cache.mjs';

export const ADAPTER_ID='sol-medium-v1';
export const FROZEN_WORKFLOW='ed47de9aafa13cfd1abb98f62b18588bd49a32fe781842540596fc91c6c5bf6a';
export const RUNS=Object.freeze({
  'camper-shane':'b4-v32-camper-shane-policy23-001',
  'hiker-marcos':'b4-v32-hiker-marcos-sol-medium-001',
  'super-nerd-jovan':'b4-v32-super-nerd-jovan-sol-medium-001',
});
const directory=path.dirname(fileURLToPath(import.meta.url));
const defaultRoot=path.resolve(directory,'../../../..');
const originalURL=new URL('../../v32/workflow.mjs',import.meta.url);
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const check=(ok,message)=>{if(!ok)throw new Error(message);};
export async function identity(){
  const files={};
  for(const name of ['adapter.mjs','cli.mjs'])files[name]=sha(await fs.readFile(path.join(directory,name)));
  return {adapterId:ADAPTER_ID,adapterDigest:digest(files),files,frozenWorkflow:FROZEN_WORKFLOW,
    authorization:'USER_2026_09_08_VAMOS_A_PROBAR_2_O_3_CON_SOL_MEDIUM',
    runs:RUNS,actorRequirement:{model:'gpt-5.6-sol',effort:'medium',contextMode:'fresh'}};
}

// Exact, authenticated source derivation. Never alter a submission or its provenance.
// The factual engine and every gate remain the original V32 implementation.
export function deriveWorkflow(source,evidence){
  check(sha(source)===FROZEN_WORKFLOW,'EXPERIMENT_FROZEN_WORKFLOW_CHANGED');
  let result=source;
  const once=(from,to)=>{check(result.split(from).length===2,'EXPERIMENT_TRANSFORM_ANCHOR_CHANGED');result=result.replace(from,to);};
  once("const BASE = 'wiki/trainer-authoring/v32';",`const EXPERIMENT=${JSON.stringify(evidence)};
const experimentFor=trainerId=>Object.hasOwn(EXPERIMENT.runs,trainerId)?EXPERIMENT:null;
const requirementFor=trainerId=>experimentFor(trainerId)?.actorRequirement??ACTOR_REQUIREMENT;
const BASE = 'wiki/trainer-authoring/v32';`);
  once('const hashes = {};',"const hashes = {'experimentalActorAdapter':digest(EXPERIMENT)};");
  once("'Exactly two independent gpt-6-astra/low/fresh creative actors are required per trainer.',",
    "'Exactly two independent fresh creative actors: nominal sol-medium-v1 runs require gpt-5.6-sol/medium; all others require gpt-6-astra/low. The sealed experimentalActorAdapter pin authenticates this user-authorized exception.',");
  once('requiredModel: ACTOR_REQUIREMENT.model, requiredEffort: ACTOR_REQUIREMENT.effort, limits: LIMITS',
    'requiredModel: requirementFor(targetId).model, requiredEffort: requirementFor(targetId).effort, experimentalActorPolicy: experimentFor(targetId), limits: LIMITS');
  once('async function start({ runId, trainerId, organizer }) {',`async function start({ runId, trainerId, organizer }) {
    const ACTOR_REQUIREMENT=requirementFor(trainerId);
    if(experimentFor(trainerId)&&EXPERIMENT.runs[trainerId]!==runId)fail('EXPERIMENT_NOMINAL_RUN_REQUIRED');`);
  once('async function checkInput(run, role, input) {',`async function checkInput(run, role, input) {
    const ACTOR_REQUIREMENT=requirementFor(run.opening.payload.trainerId);`);
  once('const frozenInput = clone(input);',`const ACTOR_REQUIREMENT=requirementFor(run.opening.payload.trainerId);
      const frozenInput = clone(input);`);
  once('const transitionEvidence=run.opening.payload.policyTransition;\n    const envelope',
    'const ACTOR_REQUIREMENT=requirementFor(run.opening.payload.trainerId);\n    const transitionEvidence=run.opening.payload.policyTransition;\n    const envelope');
  once('authorizedRevision: revision, productionScope: scope,',
    'authorizedRevision: revision, productionScope: scope, experimentalActorPolicy: experimentFor(trainerId),');
  once('const context = await unseal(`${directory}/context.json`);',`if(digest(opening.payload.experimentalActorPolicy??null)!==digest(experimentFor(opening.payload.trainerId)))fail('EXPERIMENT_AUTHORIZATION_CHANGED');
    if(experimentFor(opening.payload.trainerId)&&EXPERIMENT.runs[opening.payload.trainerId]!==runId)fail('EXPERIMENT_NOMINAL_RUN_REQUIRED');
    const context = await unseal(\x60\x24{directory}/context.json\x60);`);
  once("schemaVersion: 1, generatorId: GENERATOR_ID, role: 'author', runId, trainerId, contextDigest, contextFile: 'context.json',",
    "schemaVersion: 1, generatorId: GENERATOR_ID, role: 'author', runId, trainerId, contextDigest, contextFile: 'context.json', experimentalActorPolicy: experimentFor(trainerId),");
  once("schemaVersion: 1, generatorId: GENERATOR_ID, role: 'corrector', runId, trainerId: run.opening.payload.trainerId,",
    "schemaVersion: 1, generatorId: GENERATOR_ID, role: 'corrector', runId, trainerId: run.opening.payload.trainerId, experimentalActorPolicy: experimentFor(run.opening.payload.trainerId),");
  once('productionScope: run.opening.payload.productionScope ?? null,',
    'productionScope: run.opening.payload.productionScope ?? null, experimentalActorPolicy: run.opening.payload.experimentalActorPolicy ?? null,');
  once('return { role, runId, trainerId: run.opening.payload.trainerId,',
    'return { role, runId, trainerId: run.opening.payload.trainerId, experimentalActorPolicy: experimentFor(run.opening.payload.trainerId),');
  // data: modules have no relative resolution; resolve imports to the original files.
  result=result.replace(/from (['"])(\.\.?\/[^'"]+)\1/g,(_,quote,specifier)=>`from ${quote}${new URL(specifier,originalURL).href}${quote}`);
  result=result.replaceAll('import.meta.url',JSON.stringify(originalURL.href));
  return result;
}

export async function createAdaptedWorkflow({projectRoot=defaultRoot,expectedAdapterDigest,...options}={}){
  const root=await fs.realpath(projectRoot),applied=await identity();
  check(expectedAdapterDigest===applied.adapterDigest,'EXPECTED_ADAPTER_DIGEST_REQUIRED_OR_CHANGED');
  const source=await fs.readFile(originalURL,'utf8');
  const derived=await import(`data:text/javascript;base64,${Buffer.from(deriveWorkflow(source,applied)).toString('base64')}`);
  const workflow=await derived.createWorkflow({...options,projectRoot:root});
  return Object.fromEntries(Object.entries(workflow).map(([method,fn])=>[method,(args={})=>operation(async()=>{
    check((await identity()).adapterDigest===applied.adapterDigest,'EXPERIMENT_ADAPTER_CHANGED');
    for(const name of Object.keys(applied.files))await observeFile(path.join(directory,name));
    for(const file of new Set([fileURLToPath(originalURL),path.join(root,'wiki/trainer-authoring/v32/workflow.mjs')])){
      await observeFile(file);check(sha(await fs.readFile(file))===FROZEN_WORKFLOW,'EXPERIMENT_FROZEN_WORKFLOW_CHANGED');
    }
    const result=await fn(args);await assertObservedFiles();
    const technicalCommands=Object.fromEntries(Object.entries(result.commands??{}).filter(([key,value])=>
      ['preview','start'].includes(key)&&Array.isArray(value)).map(([key,value])=>[key,
      [value[0],path.join(directory,'cli.mjs'),...value.slice(2),'--expected-adapter-digest',applied.adapterDigest]]));
    return {...result,technicalAdapter:applied,
      ...(result.role?{experimentalInstructions:'User-authorized sol-medium-v1 overrides ONLY actor model/effort for the three nominal runs: Author and Corrector gpt-5.6-sol, medium, fresh. Frozen reference mentions of Astra-low describe the default, not this authorized exception. All factual rules remain binding. Use technicalCommands.preview, not commands.preview. No submit/publish by creative actors.'}:{}),
      ...(Object.keys(technicalCommands).length?{technicalCommands}:{})};
  })]));
}
