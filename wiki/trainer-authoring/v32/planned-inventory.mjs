import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {memo,observeFile} from './operation-cache.mjs';
const paths={plan:'wiki/trainer-authoring/v7/plan/windows.generated.json',
  assignments:'wiki/trainer-authoring/profile-assignments/beta4-v1/assignment.generated.json',
  graphs:'wiki/trainer-authoring/v7/graphs/graphs.generated.json'};
const check=(ok,message)=>{if(!ok)throw new Error(message);};
export function loadPlannedInventory(root) {return memo(`v32:planned-inventory:${root}`,async()=>{
  const values={},sourceDigests={};
  for(const [key,relative]of Object.entries(paths)) {
    const file=path.join(root,relative);await observeFile(file);const bytes=await fs.readFile(file);
    values[key]=JSON.parse(bytes);sourceDigests[relative]=createHash('sha256').update(bytes).digest('hex');
  }
  check(values.assignments.sources.some(s=>s.path===paths.graphs&&s.sha256===sourceDigests[paths.graphs]),'PLANNED_INVENTORY_GRAPH_BINDING');
  const records=values.assignments.records;
  check(new Set(records.map(r=>r.id)).size===records.length,'PLANNED_INVENTORY_DUPLICATE_ID');
  const nodes=values.graphs.encounterGraph.nodes;
  check(records.every(r=>nodes.some(n=>n.id===r.id&&n.lotId===r.lotId)),'PLANNED_INVENTORY_ASSIGNMENT_BINDING');
  const excludedFixedIds=['rival-oak'];
  const windows=values.plan.windows.map(w=>{
    const lots=w.trainerBatches??w.batches;
    const trainerIds=records.filter(r=>lots.includes(r.lotId)&&!excludedFixedIds.includes(r.id)).map(r=>r.id).sort();
    check(trainerIds.length>0,'PLANNED_INVENTORY_EMPTY_WINDOW');
    return {windowId:w.id,trainerIds,quotaN:trainerIds.length};
  });
  const mapped=windows.flatMap(w=>w.trainerIds);
  check(new Set(mapped).size===mapped.length,'PLANNED_INVENTORY_MULTIPLE_WINDOWS');
  return {decisionId:'D-260',unit:'UNIQUE_LOGICAL_TRAINER_IDS',excludedFixedIds,sourceDigests,windows};
});}
