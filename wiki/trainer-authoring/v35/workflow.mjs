import {deriveWorkflow as derivePreviousWorkflow,authorMayProceed as previousAuthorMayProceed,FROZEN_WORKFLOW,FROZEN_IDENTITY_WORKFLOW} from '../v34/workflow.mjs';
export {digest} from '../v32/workflow.mjs';
export {FROZEN_WORKFLOW,FROZEN_IDENTITY_WORKFLOW};
export const FROZEN_PREVIOUS_WORKFLOW='06e4e056b95968d4c3ec6f99c45d5d06296d5d315e18474982f2511afed63541';
const noteErrors=new Set(['INTENT_REQUIRED','STRATEGY_REQUIRED','ORDER_RATIONALE_REQUIRED']);
export function authorMayProceed(validation){return previousAuthorMayProceed(validation)||validation?.ok===false&&Array.isArray(validation.errors)&&validation.errors.length>0&&validation.errors.every(error=>noteErrors.has(error.code)||previousAuthorMayProceed({ok:false,errors:[error]}));}
export function deriveWorkflow(source,evidence){
  let result=derivePreviousWorkflow(source,evidence).replaceAll('wiki/trainer-authoring/v34','wiki/trainer-authoring/v35').replaceAll('beta4-v34','beta4-v35').replaceAll('V34_TRAINER_ACCEPTANCE','V35_TRAINER_ACCEPTANCE').replaceAll('v34-workflow-','v35-workflow-');
  const once=(from,to)=>{if(result.split(from).length!==2)throw new Error(`NOTE_WORKFLOW_ANCHOR_CHANGED: ${from.slice(0,70)}`);result=result.replace(from,to);};
  result=`import {NOTE_RECOVERY,verifyRecoverySource,assertRecoveredAuthor} from '${new URL('./recovery.mjs',import.meta.url).href}';\n`+result;
  once("['D262:TRAINER_EXCEPTION_MEMORY.md','TRAINER_EXCEPTION_MEMORY.md'],","['D262:TRAINER_EXCEPTION_MEMORY.md','TRAINER_EXCEPTION_MEMORY.md'],\n      ['D263:TRAINER_NOTE_RECOVERY.md','TRAINER_NOTE_RECOVERY.md'],");
  once('const superseded=null;',"const superseded=predecessor.runs.find(r=>r.trainerId===NOTE_RECOVERY.trainerId);");
  once("      await policyTransition(superseded.trainerId);\n      if(superseded.runId!==SHANE_POLICY_TRANSITION.previousRunId||superseded.state!=='AUTHORING')fail('SHANE_TRANSITION_SOURCE_STATE_CHANGED');","      await verifyRecoverySource(root);\n      if(superseded.runId!==NOTE_RECOVERY.sourceRunId||superseded.state!=='REJECTED')fail('NOTE_RECOVERY_SOURCE_STATE_CHANGED');");
  once('policyTransitions:superseded?[await policyTransition(superseded.trainerId)]:[]','policyTransitions:[],noteRecoveries:superseded?[NOTE_RECOVERY]:[]');
  const start=result.indexOf('  async function start('),end=result.indexOf('  async function checkInput(',start);
  if(start<0||end<0)throw new Error('NOTE_OPEN_ANCHOR_CHANGED');
  let open=result.slice(start,end).replace('async function start({ runId, trainerId, organizer })','async function openRun({ runId, trainerId, organizer },noteRecovery=null)').replace('return locked(async () => {','return (async () => {');
  const closing=open.lastIndexOf('    });');if(closing<0)throw new Error('NOTE_OPEN_CLOSE_CHANGED');open=open.slice(0,closing)+open.slice(closing).replace('    });','    })();');
  open=open.replace('authorizedRevision: revision, productionScope: scope, identityPolicy: IDENTITY,','authorizedRevision: revision, productionScope: scope, identityPolicy: IDENTITY, ...(noteRecovery?{noteRecovery}:{}),');
  result=result.slice(0,start)+open+`  async function start(args) {
    if(args.trainerId===NOTE_RECOVERY.trainerId)fail('NOMINAL_NOTE_RECOVERY_REQUIRED');
    return locked(()=>openRun(args));
  }
  async function recover({runId=NOTE_RECOVERY.runId,organizer}) {
    return locked(async()=>{
      if(runId!==NOTE_RECOVERY.runId)fail('NOMINAL_NOTE_RECOVERY_RUN_REQUIRED');
      const source=await verifyRecoverySource(root);
      await openRun({runId,trainerId:NOTE_RECOVERY.trainerId,organizer},source.noteRecovery);
      const result=await commitSubmission({runId,role:'author',input:source.authorInput});
      if(result.state!=='CORRECTING')fail('NOTE_RECOVERY_NOT_REPAIRABLE');
      return {...result,noteRecovery:source.noteRecovery,originalAuthorDigest:NOTE_RECOVERY.authorDigest};
    });
  }
`+result.slice(end);
  const submitStart=result.indexOf('  async function submit('),submitEnd=result.indexOf('  async function publish(',submitStart);
  let commit=result.slice(submitStart,submitEnd).replace('async function submit(','async function commitSubmission(').replace('return locked(async () => {','return (async () => {');
  const commitClose=commit.lastIndexOf('    });');if(commitClose<0)throw new Error('NOTE_SUBMIT_CLOSE_CHANGED');commit=commit.slice(0,commitClose)+commit.slice(commitClose).replace('    });','    })();');
  result=result.slice(0,submitStart)+commit+`  async function submit(args) {
    if(args.role==='author'&&args.runId===NOTE_RECOVERY.runId)fail('RECOVERED_AUTHOR_IMMUTABLE');
    return locked(()=>commitSubmission(args));
  }
`+result.slice(submitEnd);
  once("const context = await unseal(`${directory}/context.json`);","if(opening.payload.noteRecovery){\n      if(runId!==NOTE_RECOVERY.runId||opening.payload.trainerId!==NOTE_RECOVERY.trainerId||digest(opening.payload.noteRecovery)!==digest(NOTE_RECOVERY))fail('NOTE_RECOVERY_OPENING_MISMATCH');\n      await verifyRecoverySource(root);\n    }\n    const context = await unseal(`${directory}/context.json`);");
  once('records[role] = { ...record, input: input.payload, validation: report.payload };',"records[role] = { ...record, input: input.payload, validation: report.payload };\n      if(role==='author'&&opening.payload.noteRecovery){assertRecoveredAuthor(record.payload.noteRecovery,input.payload);}");
  once("if (provenance.inputDigest !== envelope.digest) error('INPUT_DIGEST_MISMATCH', 'provenance.inputDigest');","if(role==='author'&&run.opening.payload.noteRecovery)assertRecoveredAuthor(run.opening.payload.noteRecovery,input);\n    const expectedEnvelope=role==='author'&&run.opening.payload.noteRecovery?NOTE_RECOVERY.authorEnvelopeDigest:envelope.digest;\n    if (provenance.inputDigest !== expectedEnvelope) error('INPUT_DIGEST_MISMATCH', 'provenance.inputDigest');");
  once("const recordPayload = { role, previous: run.previous, inputDigest, validationDigest, submittedAt: new Date().toISOString() };","const recordPayload = { role, previous: run.previous, inputDigest, validationDigest, submittedAt: new Date().toISOString(), ...(role==='author'&&run.opening.payload.noteRecovery?{noteRecovery:run.opening.payload.noteRecovery}:{}) };");
  once('authorDigest: inputDigest, authorSubmission: frozenInput.submission, authorValidation: validation,','authorDigest: inputDigest, authorSubmission: frozenInput.submission, authorValidation: validation, ...(run.opening.payload.noteRecovery?{noteRecovery:run.opening.payload.noteRecovery}:{}),');
  once('productionScope: run.opening.payload.productionScope ?? null, identityPolicy: run.opening.payload.identityPolicy,','productionScope: run.opening.payload.productionScope ?? null, identityPolicy: run.opening.payload.identityPolicy, ...(run.opening.payload.noteRecovery?{noteRecovery:run.opening.payload.noteRecovery}:{}),');
  once("if (run.state !== (role === 'author' ? 'AUTHORING' : 'CORRECTING')) fail('HANDOFF_STATE_MISMATCH');","if(role==='author'&&run.opening.payload.noteRecovery)fail('RECOVERED_AUTHOR_IMMUTABLE');\n    if (run.state !== (role === 'author' ? 'AUTHORING' : 'CORRECTING')) fail('HANDOFF_STATE_MISMATCH');");
  once('{preflight,start,handoff,preview,submit,publish,acceptTrainer,acceptLot,roster,status,transition,verifiedEvidence}','{preflight,start,recover,handoff,preview,submit,publish,acceptTrainer,acceptLot,roster,status,transition,verifiedEvidence}');
  return result;
}
