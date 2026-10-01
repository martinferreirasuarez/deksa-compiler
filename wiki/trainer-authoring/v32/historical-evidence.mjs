import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createWorkflow as createV31Workflow,digest} from '../v31/workflow.mjs';
import {loadWindowSnapshot as loadV31Snapshot} from '../v31/window-recurrence.mjs';
import {adaptedEngine,chronologicalSnapshot,identity} from '../repairs/v31-order-v1/adapter.mjs';
import {memo,observeFile} from './operation-cache.mjs';
export const HISTORICAL_ADAPTER_DIGEST='9f54a90f3a007e130c1beb0ebf5c274a55f26c55a059796a2d6da2793aafe47b';
export const BASELINE_27_DIGEST='7ab4b24ee873ff80ccf63b7b92865df0cdd12be3269e16375ca68a39f51ac4d6';
const check=(ok,message)=>{if(!ok)throw new Error(message);};
export async function historicalAdapterEvidence(root) {
  const applied=await identity();check(applied.adapterDigest===HISTORICAL_ADAPTER_DIGEST,'HISTORICAL_ADAPTER_CHANGED');
  const sourceDigests={};
  for(const [relative,expected]of Object.entries({
    ...Object.fromEntries(Object.entries(applied.files).map(([name,hash])=>[`wiki/trainer-authoring/repairs/v31-order-v1/${name}`,hash])),
    ...Object.fromEntries(Object.entries(applied.frozenSources).map(([name,hash])=>[`wiki/trainer-authoring/v31/${name}`,hash]))})) {
    const file=path.join(root,relative);await observeFile(file);
    const actual=createHash('sha256').update(await fs.readFile(file)).digest('hex');check(actual===expected,'HISTORICAL_EXECUTABLE_CHANGED');sourceDigests[relative]=actual;
  }
  const cache='wiki/trainer-authoring/v31/operation-cache.mjs';await observeFile(path.join(root,cache));
  sourceDigests[cache]=createHash('sha256').update(await fs.readFile(path.join(root,cache))).digest('hex');
  return {adapterId:applied.adapterId,adapterDigest:applied.adapterDigest,sourceDigests};
}
export function baselineSnapshot(root) {return memo(`v32:baseline27:${root}`,async()=>{
  const verification=await historicalAdapterEvidence(root);
  const snapshot=chronologicalSnapshot(await loadV31Snapshot(root));
  check(snapshot.sources.length===27&&digest(snapshot.sources)===BASELINE_27_DIGEST,'APPROVED_BASELINE_27_CHANGED');
  return {...snapshot,historicalVerification:verification};
});}
export function historicalEvidence(root) {return memo(`v32:historical-evidence:${root}`,async()=>{
  await baselineSnapshot(root);
  // Full original factual/actor/source/materialization/acceptance replay.
  const v31=await createV31Workflow({projectRoot:root,engine:adaptedEngine});
  const newer=await v31.verifiedEvidence();
  const v30=await createV31Workflow({projectRoot:root,referenceVersion:'v30'});
  const older=await v30.verifiedEvidence();
  return {publications:[...older.publications,...newer.publications],accepted:[...older.accepted,...newer.accepted],
    // V30 Nob is already nominally superseded by V31; never double-count it.
    runs:[...older.runs.filter(r=>!newer.runs.some(n=>n.trainerId===r.trainerId)),...newer.runs]};
});}
