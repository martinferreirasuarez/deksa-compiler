import {createHash} from 'node:crypto';
import {deriveWorkflow as deriveIdentityWorkflow,FROZEN_WORKFLOW,KENT_POLICY_TRANSITION} from '../v33/workflow.mjs';
export {digest} from '../v32/workflow.mjs';
export {FROZEN_WORKFLOW,KENT_POLICY_TRANSITION};
export const FROZEN_IDENTITY_WORKFLOW='fd40306f7ee89183a2941343ed79c2e0398d49c1f57d6ddda824e2ee965c1fe4';
// Explicit semantic errors only: unknown codes, structure, provenance and missing
// evidence fail closed. Infrastructure exceptions are never converted to findings.
const repairable=new Set(['ABILITY_ILLEGAL','AKI_ANCHOR_COUNT','AKI_I_COUNT','AKI_K_COUNT','ANCHORS_DIFFER_BETWEEN_VARIANTS','ANCHOR_NOT_IN_CANON','ANCHOR_NOT_REGISTERED_OR_FORM_ILLEGAL','D229_RESERVED_STARTER_FAMILY','DAMAGING_MOVE_OMITTED','FAMILY_DUPLICATE','FIXED_MEMBER_REQUIRED','FORM_OR_LEVEL_ILLEGAL','FORM_REQUIRES_ANCHOR','ITEM_BUDGET','ITEM_ILLEGAL_OR_OUT_OF_HORIZON','ITEM_NOT_MATERIAL','ITEM_UNIQUE_REUSED','MACHINE_RESOURCE_REUSED','MOVE_COUNT','MOVE_DUPLICATE','MOVE_ILLEGAL','NATURE_UNKNOWN','RELIABLE_MOVE_OMITTED','REQUIRED_BOSS_ANCHORS','SPECIES_UNKNOWN','VARIANT_FAMILY_DISTANCE','QUALITY_ANCHOR_CHANGED','GYM_FUTURE_SIGNATURE_K_DISTANCE','GYM_K_DISTANCE','LOT_FAMILY_TRAINER_LIMIT','D251_STARTER_TRIPLET_QUOTA','SPECIALIST_K_DISTANCE','WINDOW_FAMILY_QUOTA_EXCEEDED','IDENTITY_QUOTA_EXCEPTION_NOT_NEEDED','RIVAL_COMMON_STARTER_FORBIDDEN','RIVAL_STARTER_SPECIES']);
export function authorMayProceed(validation) {
  return validation?.ok===true || (validation?.ok===false && Array.isArray(validation.errors) && validation.errors.length>0 && validation.errors.every(error=>repairable.has(error.code)));
}
for(const code of ['LEVEL_OUT_OF_RANGE','LEVEL_VECTOR','ACE_FLOOR_AND_LAST','LEDGER_FAMILY_OVERLAP','D227_VARIABLE_FAMILY_REUSED','SPECIALIST_FUTURE_ANCHOR_K_DISTANCE','IDENTITY_QUOTA_EXCEPTION_REUSED'])repairable.add(code);
export function deriveWorkflow(source,evidence) {
  let result=deriveIdentityWorkflow(source,evidence);
  const once=(from,to)=>{if(result.split(from).length!==2)throw new Error(`SIMPLE_WORKFLOW_ANCHOR_CHANGED: ${from.slice(0,60)}`);result=result.replace(from,to);};
  result=result.replaceAll('wiki/trainer-authoring/v33','wiki/trainer-authoring/v34').replaceAll('beta4-v33','beta4-v34').replaceAll('V33_TRAINER_ACCEPTANCE','V34_TRAINER_ACCEPTANCE').replaceAll('v33-workflow-','v34-workflow-');
  result=`import {authorMayProceed} from '${new URL('./workflow.mjs',import.meta.url).href}';\n`+result;
  once("['D261:TRAINER_IDENTITY_QUOTA_EXCEPTION.md','TRAINER_IDENTITY_QUOTA_EXCEPTION.md'],","['D261:TRAINER_IDENTITY_QUOTA_EXCEPTION.md','TRAINER_IDENTITY_QUOTA_EXCEPTION.md'],\n      ['D262:TRAINER_EXCEPTION_MEMORY.md','TRAINER_EXCEPTION_MEMORY.md'],");
  once('for (const source of pinned.sources) {','for (const source of [...pinned.sources,...pinned.exceptionMemory.sources]) {');
  once('const ids=new Set(pinned.sources.map(s=>s.trainerId));','const ids=new Set([...pinned.sources,...pinned.exceptionMemory.sources].map(s=>s.trainerId));');
  once('contextDigest: run.context.digest,\n      provenance:', 'contextDigest: run.context.digest,\n      exceptionMemory: {memoryDigest:run.context.payload.windowRecurrence.exceptionMemory.memoryDigest,contextPointer:"/windowRecurrence/exceptionMemory",queryMode:"--exception-memory"},\n      provenance:');
  once("const modes = ['summary', 'list', 'resources', 'identity', 'review-context', 'window-recurrence'];","const modes = ['summary', 'list', 'resources', 'identity', 'review-context', 'window-recurrence', 'exception-memory'];");
  // Kent's transition was completed and is verified by the original v33
  // runtime. The successor inherits that publication, not its former opening.
  once('const superseded=predecessor.runs.find(r=>r.trainerId===SHANE_POLICY_TRANSITION.trainerId);','const superseded=null;');
  const transitionStart=result.indexOf('  async function policyTransition(trainerId) {');
  const transitionEnd=result.indexOf('  async function transition(',transitionStart);
  if(transitionStart<0||transitionEnd<0)throw new Error('SIMPLE_TRANSITION_ANCHOR_CHANGED');
  result=result.slice(0,transitionStart)+'  async function policyTransition(trainerId) { return null; }\n'+result.slice(transitionEnd);
  const reviewStart=result.indexOf("      for (const key of Object.keys(review))");
  const reviewEnd=result.indexOf('\n    }\n    const catalogs',reviewStart);
  if(reviewStart<0||reviewEnd<0)throw new Error('SIMPLE_REVIEW_ANCHOR_CHANGED');
  result=result.slice(0,reviewStart)+`      for(const key of Object.keys(review))if(!['authorDigest','notes'].includes(key))error('UNKNOWN_REVIEW_FIELD',\x60review.\x24{key}\x60);
      if(review.authorDigest!==run.records.author.payload.inputDigest)error('AUTHOR_DIGEST_MISMATCH','review.authorDigest');
      if(review.notes!==undefined&&(!Array.isArray(review.notes)||!review.notes.every(nonempty)))error('REVIEW_NOTES_SHAPE','review.notes');`+result.slice(reviewEnd);
  const warningStart=result.indexOf("    if (role === 'corrector') {\n      for (const warning of validation.warnings)");
  const warningEnd=result.indexOf('    return { ok: !errors.length',warningStart);
  if(warningStart<0||warningEnd<0)throw new Error('SIMPLE_WARNING_ANCHOR_CHANGED');
  result=result.slice(0,warningStart)+result.slice(warningEnd);
  once('escribí tu borrador y ejecutá preview. No submit ni publish.','escribí tu borrador. ${role === "author" ? "Preview opcional: el motor diagnostica al entregar." : "Repará los hallazgos, revisá el equipo y ejecutá preview final hasta PASS."} No submit ni publish.');
  once("['quality.md', 'commands.md', 'engine-capabilities.md', 'special-cases.md']","['quality.md', 'commands.md', 'engine-capabilities.md']");
  once("state = report.payload.ok ? (role === 'author' ? 'CORRECTING' : 'TRAINER_REVIEW') : 'REJECTED';","state = role==='author' && authorMayProceed(report.payload) ? 'CORRECTING' : report.payload.ok ? 'TRAINER_REVIEW' : 'REJECTED';");
  once('if (records.author?.validation.ok)','if (authorMayProceed(records.author?.validation))');
  once('if (!validation.ok || digest(validation) !== digest(run.records[role].validation))',"if (!(role==='author'?authorMayProceed(validation):validation.ok) || digest(validation) !== digest(run.records[role].validation))");
  once("if (role === 'author' && validation.ok)","if (role === 'author' && authorMayProceed(validation))");
  once("const state = validation.ok ? (role === 'author' ? 'CORRECTING' : 'TRAINER_REVIEW') : 'REJECTED';","const state = role==='author' && authorMayProceed(validation) ? 'CORRECTING' : validation.ok ? 'TRAINER_REVIEW' : 'REJECTED';");
  return result;
}
