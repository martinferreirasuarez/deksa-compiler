import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import * as engine from '../../v32/engine.mjs';
import {queryContext} from '../../v32/query.mjs';
import {historicalEvidence,BASELINE_27_DIGEST} from '../../v32/historical-evidence.mjs';
import {baseWindowSnapshot,applyQualityToSnapshot} from '../../v32/window-recurrence.mjs';
import {lotInputs} from '../../family-revisions/v1/runner.mjs';
import {operation,memo,observeFile,assertObservedFiles,invalidateOperation,forgetObservedFile} from '../../v32/operation-cache.mjs';
import {BASE,ORDER,CONTRACT,check,digest,seal,readSealed,rawSubmission,sourcePins,admissionEvidence,
  validateProposal,mergePresentation,infrastructurePins,readQualityPublications} from './reader.mjs';
const rootDefault=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../../..');
const roles=['author','corrector'],letters=['A','B','C'];
const runPath=(root,id)=>{check(ORDER.includes(id),'QUALITY_TRAINER_NOT_AUTHORIZED');return path.join(root,BASE,'runs',id);};
async function read(file){await observeFile(file);return readSealed(file);}
async function exists(file){try{await fs.access(file);return true;}catch(e){if(e.code==='ENOENT')return false;throw e;}}
async function write(file,value){await assertObservedFiles();await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,JSON.stringify(value,null,2)+'\n',{flag:'wx',mode:0o444});invalidateOperation();}
async function locked(root,work){const file=path.join(root,BASE,'.lock');await fs.mkdir(path.dirname(file),{recursive:true});const h=await fs.open(file,'wx');try{return await work();}finally{await h.close();await fs.unlink(file);}}
async function makePlan(root){const snapshot=await baseWindowSnapshot(root);return seal({schemaVersion:1,scope:'FOUR_NOMINAL_QUALITY_REVISIONS',
  order:ORDER,baselineDigest:BASELINE_27_DIGEST,historicalSourcePins:sourcePins(snapshot),infrastructurePins:await infrastructurePins(root),
  authorization:'USER_2026_09_08_ADELANTE_FOUR_QUALITY_REVISIONS',contractDigest:digest(await fs.readFile(path.join(root,CONTRACT))),
  permitted:'FULL_SETS_RESOURCES_LEVELS_ORDER_WITHIN_EXISTING_CANON_COMPOSITION_AND_RULES',visualAudit:false,lotAccepted:false,romPromotion:false});}
async function checkedPlan(root){const stored=await read(path.join(root,BASE,'plan.json'));check(stored.digest===(await makePlan(root)).digest,'QUALITY_PLAN_SOURCE_CHANGED');return stored;}
export async function catalogsFor(root,snapshot,proof=null){
  // Prefix supplied by the verifier; avoid reading the live quality sequence
  // recursively while rebuilding that same sequence.
  let catalogs=await engine.loadCatalogs(root,{windowSnapshot:snapshot});
  const rows=snapshot.presentations.map((trainer,i)=>({trainer,source:snapshot.sources[i]}));
  catalogs=engine.withGymEvidence(catalogs,rows.map(({trainer,source})=>({artifactPath:`derived:quality-v1/${trainer.trainerId}`,
    sealed:seal({scope:'DERIVED_PRESENTATION_NOT_ORIGINAL_ACCEPTANCE',trainerId:trainer.trainerId,trainer,sourcePins:source})})));
  catalogs=engine.withSpecialistEvidence(catalogs,rows.map(({trainer,source})=>({trainerId:trainer.trainerId,trainer,
    publicationDigest:source.publicationDigest,acceptanceDigest:source.acceptanceDigest})));
  return {...catalogs,windowSnapshot:{...snapshot,...(proof?{revisionAdmission:proof}:{})}};
}
async function makeContext(root,trainerId,plan,snapshot){
  check(ORDER[(snapshot.qualityRevisions??[]).length]===trainerId,'QUALITY_SEQUENTIAL_TRAINER_REQUIRED');
  const originalTrainer=snapshot.presentations.find(t=>t.trainerId===trainerId),source=snapshot.sources.find(s=>s.trainerId===trainerId);
  check(originalTrainer&&source,'QUALITY_ORIGINAL_MISSING');
  const proof=admissionEvidence(originalTrainer,source,{planDigest:plan.digest,contractDigest:plan.payload.contractDigest});
  const catalogs=await catalogsFor(root,snapshot,proof);
  const entries=snapshot.presentations.map((trainer,i)=>({trainer,...snapshot.sources[i]}));
  const engineContext=await engine.buildContext({projectRoot:root,trainerId,
    ...lotInputs(entries.filter(e=>e.trainer.lotId===originalTrainer.lotId),trainerId)},catalogs);
  return {context:seal({schemaVersion:1,trainerId,planDigest:plan.digest,contractDigest:plan.payload.contractDigest,
    basePublicationDigest:source.publicationDigest,presentationDigest:digest(originalTrainer),originalTrainer,
    sourcePins:sourcePins(snapshot),engineContext,qualityObjective:'Revisar aportación real y reparto de recursos; justificar mejoras o una conservación sin mejora legal significativa.',
    diagnosis:{'bug-catcher-doug':'La revisión previa de C perdió aportación ofensiva al sustituir una familia por presión del límite local. Revisar las tres variantes y sus recursos sin cambiar dicho límite.',
      'rocket-cerulean':'Las revisiones previas de A/B perdieron potencia ofensiva por sustituciones forzadas por el cupo de ventana. Reevaluar las tres variantes con D260 y repartir recursos completos.',
      'rocket-recruiter':'Las revisiones previas de A/B/C perdieron potencia por presión del cupo de ventana. Reevaluar aportación y reparto de recursos completos bajo D260.',
      'camper-ethan':'Magikarp I de A, nivel 18 con Tackle, fue seleccionado por presión del cupo anterior. Revisar aportación real y recursos de las tres variantes bajo D260.'}[trainerId],
    priorQualityDigests:(snapshot.qualityRevisions??[]).map(r=>r.revisionDigest)}),catalogs};
}
export function evaluate(context,proposal,catalogs,{role=proposal?.provenance?.role,author}={}) {
  const submission=validateProposal(context,proposal,{role,author});
  const validation=engine.validateSubmission(context.payload.engineContext,submission,catalogs);
  if(role==='corrector')for(const warning of validation.warnings??[]){const id=`${warning.code}:${warning.path??''}`;
    if(!proposal.review.warningResponses.some(r=>r?.warning===id&&typeof r.reason==='string'&&r.reason.trim()))
      validation.errors.push({code:'QUALITY_UNANSWERED_WARNING',path:id});}
  const ok=validation.ok&&!validation.errors.length;
  if(!ok)return {ok:false,validation:{...validation,ok:false},updatedTrainer:null};
  const normalized=engine.materialize(context.payload.engineContext,submission,catalogs);
  const updatedTrainer=mergePresentation(context.payload.originalTrainer,normalized,submission);
  return {ok:true,validation:{ok:true,errors:[],warnings:validation.warnings,evidence:validation.evidence},updatedTrainer,
    normalizationDigest:digest(normalized),normalization:{generatorId:normalized.generatorId,policyId:normalized.policyId,
      contextId:normalized.contextId,materializationId:normalized.materializationId,sourceDigests:normalized.sourceDigests},
    changed:digest(rawSubmission(updatedTrainer))!==digest(rawSubmission(context.payload.originalTrainer)),
    afterPresentationDigest:digest(updatedTrainer)};
}
export function verifyQualityRevisions(root){return memo(`quality-v1:full-verify:${root}`,async()=>{
  const revisions=await readQualityPublications(root);let snapshot=await baseWindowSnapshot(root);
  if(!revisions.length)return {snapshot,revisions};
  const plan=await checkedPlan(root);
  for(const revision of revisions){const r=revision.payload,{context,catalogs}=await makeContext(root,r.trainerId,plan,snapshot);
    check(context.digest===r.context.digest,'QUALITY_REPLAY_CONTEXT_CHANGED');
    const author=evaluate(context,r.author,catalogs,{role:'author'}),corrector=evaluate(context,r.corrector,catalogs,{role:'corrector',author:r.author});
    check(author.ok&&corrector.ok&&digest(author.validation)===digest(r.authorValidation)
      &&digest(corrector)===digest(r.result)&&digest(corrector.updatedTrainer)===digest(r.updatedTrainer),'QUALITY_FACTUAL_REPLAY_FAILED');
    snapshot=applyQualityToSnapshot(snapshot,revision);
  }
  return {snapshot,revisions};
});}
async function checkedContext(root,id){const plan=await checkedPlan(root),{snapshot,revisions}=await verifyQualityRevisions(root);
  const published=revisions.find(r=>r.payload.trainerId===id);
  const stored=await read(path.join(runPath(root,id),'context.json'));
  if(published){check(stored.digest===published.payload.context.digest,'QUALITY_PUBLISHED_CONTEXT_CHANGED');
    // Rebuild the exact preceding revision prefix, not today's final presentation.
    let prefix=await baseWindowSnapshot(root);for(const r of revisions){if(r.payload.trainerId===id)break;prefix=applyQualityToSnapshot(prefix,r);}
    return {...await makeContext(root,id,plan,prefix),published:true};}
  const expected=await makeContext(root,id,plan,snapshot);check(stored.digest===expected.context.digest,'QUALITY_CONTEXT_CHANGED');return expected;}
async function statusRaw(root,id){const dir=runPath(root,id);if(!await exists(path.join(dir,'context.json')))return {trainerId:id,state:'UNPREPARED'};
  let state='AUTHORING';for(const role of roles){const file=path.join(dir,`${role}-record.json`);if(!await exists(file))break;
    const record=await read(file),input=await read(path.join(dir,`${role}-submission.json`)),validation=await read(path.join(dir,`${role}-validation.json`));
    check(record.payload.inputDigest===input.digest&&record.payload.validationDigest===validation.digest,'QUALITY_RECORD_BINDING');
    state=validation.payload.ok?(role==='author'?'CORRECTING':'READY_TO_PUBLISH'):'REJECTED';if(state==='REJECTED')break;}
  if(await exists(path.join(root,BASE,'published',`${id}.json`)))state='PUBLISHED';return {trainerId:id,state};}
export function prepare(root,id){return operation(()=>locked(root,async()=>{
  runPath(root,id);await historicalEvidence(root);
  const planFile=path.join(root,BASE,'plan.json');if(!await exists(planFile))await write(planFile,await makePlan(root));
  const plan=await checkedPlan(root),existing=await statusRaw(root,id);
  if(existing.state!=='UNPREPARED'){await checkedContext(root,id);return existing;}
  const {snapshot}=await verifyQualityRevisions(root),{context}=await makeContext(root,id,plan,snapshot);
  const directory=runPath(root,id);await write(path.join(directory,'context.json'),context);
  await fs.mkdir(path.join(directory,'drafts'),{recursive:true});
  return {trainerId:id,state:'AUTHORING',inputDigest:context.digest,contextPath:path.join(directory,'context.json'),
    authorOutputPath:path.join(directory,'drafts/author.json'),correctorOutputPath:path.join(directory,'drafts/corrector.json')};
}));}
export function handoff(root,id,{role,actorId,executionRef}){return operation(async()=>{
  check(roles.includes(role)&&actorId?.trim()&&executionRef?.trim(),'QUALITY_HANDOFF_PROVENANCE_REQUIRED');
  const {context}=await checkedContext(root,id),status=await statusRaw(root,id);
  check(status.state===(role==='author'?'AUTHORING':'CORRECTING'),'QUALITY_HANDOFF_STATE_MISMATCH');
  const author=role==='corrector'?(await read(path.join(runPath(root,id),'author-submission.json'))).payload:null;
  check(!author||(actorId!==author.provenance.actorId&&executionRef!==author.provenance.executionRef),'QUALITY_ACTOR_NOT_INDEPENDENT');
  const prior=(await readQualityPublications(root)).flatMap(r=>[r.payload.author.provenance,r.payload.corrector.provenance]);
  check(prior.every(p=>p.actorId!==actorId&&p.executionRef!==executionRef),'QUALITY_ACTOR_REUSED');
  const provenance={actorId,executionRef,model:'gpt-6-astra',effort:'low',role,contextMode:'fresh',inputDigest:context.digest};
  const comparison=Object.fromEntries(letters.map(l=>[l,Object.fromEntries(['baselineContribution','changesAndCosts','alternatives','resourceAllocation','expectedImprovement','remainingLimits'].map(k=>[k,'TEXTO_OBLIGATORIO_CON_EVIDENCIA']))]));
  const review=role==='corrector'?{authorDigest:digest(author),variants:Object.fromEntries(letters.map(l=>[l,Object.fromEntries(['mainPlan','threats','changes','alternatives','tradeoffs','order'].map(k=>[k,'TEXTO_OBLIGATORIO']))])),
    bossIdentityReview:{globalSignatures:'TEXTO',neighbors:'TEXTO',pendingComparisons:'TEXTO'},crossVariantEquivalence:'TEXTO',factualCheck:'TEXTO',warningResponses:[{warning:'CODE:path',reason:'RESPUESTA_CON_EVIDENCIA'}]}:null;
  const cli=path.join(root,BASE,'runner.mjs'),outputPath=path.join(runPath(root,id),'drafts',`${role}.json`);
  return {trainerId:id,role,provenance,contextDigest:context.digest,context:path.join(runPath(root,id),'context.json'),
    originalTrainer:context.payload.originalTrainer,originalSubmission:rawSubmission(context.payload.originalTrainer),
    sourcePins:context.payload.sourcePins,qualityObjective:context.payload.qualityObjective,diagnosis:context.payload.diagnosis,revisionAdmission:context.payload.engineContext.windowRecurrence.revisionAdmission,
    ...(author?{authorSubmission:author.submission,authorQualityComparison:author.qualityComparison,reviewAuthorDigest:digest(author)}:{}),
    outputPath,outputSchema:{provenance,submission:{trainerId:id,variants:Object.fromEntries(letters.map(l=>[l,{members:[{species:'SLUG',level:'ENTERO',akiRole:'A/I/K',moves:['NOMBRE'],nature:'NATURALEZA',ability:'HABILIDAD',item:null,intent:['RAZÓN']}],strategy:'TEXTO',orderRationale:'TEXTO'}]))},qualityComparison:comparison,...(review?{review}:{})},
    schemaNotes:['members requiere exactamente seis miembros por letra; el ejemplo sólo describe un miembro.','review.warningResponses cubre cada warning final; [] si no hay warnings.','No-op permitido con comparación razonada; no inventar una mejora.'],
    references:[path.join(root,BASE,'SKILL.md'),path.join(root,CONTRACT),...['quality.md','engine-capabilities.md'].map(f=>path.join(root,'wiki/trainer-authoring/v32/skills/deksa-trainer-generator/references',f))],
    commands:{queries:Object.fromEntries(['repair','summary','list','resources','identity','window-recurrence','review-context'].map(mode=>[mode,['node',cli,'query','--trainer',id,'--mode',mode]])),
      speciesQueryPrefix:['node',cli,'query','--trainer',id,'--species'],preview:['node',cli,'preview','--trainer',id,'--role',role,'--input',outputPath]},
    forbiddenInputs:['conversation history','unrelated drafts or retired rosters'],actorWrites:[outputPath]};
});}
export function preview(root,id,role,input){return operation(async()=>{const {context,catalogs}=await checkedContext(root,id);
  const s=await statusRaw(root,id);check(s.state===(role==='author'?'AUTHORING':'CORRECTING'),'QUALITY_PREVIEW_STATE_MISMATCH');
  const author=role==='corrector'?(await read(path.join(runPath(root,id),'author-submission.json'))).payload:null;
  return evaluate(context,input,catalogs,{role,author});});}
export function submit(root,id,role,input){return operation(()=>locked(root,async()=>{
  await historicalEvidence(root);const s=await statusRaw(root,id);check(s.state===(role==='author'?'AUTHORING':'CORRECTING'),'QUALITY_SUBMIT_STATE_MISMATCH');
  await checkedContext(root,id); // Source failures are not creative rejections.
  let result;try{result=await preview(root,id,role,input);}catch(error){result={ok:false,validation:{ok:false,errors:[{code:error.message}],warnings:[]},updatedTrainer:null};}
  const dir=runPath(root,id),validation={ok:result.ok,...result.validation};
  await write(path.join(dir,`${role}-submission.json`),seal(input));await write(path.join(dir,`${role}-validation.json`),seal(validation));
  await write(path.join(dir,`${role}-record.json`),seal({role,inputDigest:digest(input),validationDigest:digest(validation)}));
  return {trainerId:id,state:result.ok?(role==='author'?'CORRECTING':'READY_TO_PUBLISH'):'REJECTED',validation};
}));}
export function publish(root,id){return operation(()=>locked(root,async()=>{
  await historicalEvidence(root);const state=(await statusRaw(root,id)).state;
  if(state==='PUBLISHED'){
    const {revisions}=await verifyQualityRevisions(root),existing=revisions.find(r=>r.payload.trainerId===id);
    check(existing,'QUALITY_PARTIAL_PUBLICATION_REQUIRES_REVIEW');
    return {trainerId:id,state:'PUBLISHED',revisionDigest:existing.digest,publicationPath:path.join(root,BASE,'published',`${id}.json`),changed:existing.payload.result.changed};
  }
  check(state==='READY_TO_PUBLISH','QUALITY_PUBLISH_STATE_MISMATCH');
  const {context,catalogs}=await checkedContext(root,id),dir=runPath(root,id);
  const author=(await read(path.join(dir,'author-submission.json'))).payload,corrector=(await read(path.join(dir,'corrector-submission.json'))).payload;
  const authorResult=evaluate(context,author,catalogs,{role:'author'}),result=evaluate(context,corrector,catalogs,{role:'corrector',author});
  check(authorResult.ok&&result.ok,'QUALITY_FINAL_VALIDATION_FAILED');
  for(const [role,res]of [['author',authorResult],['corrector',result]])check(digest(res.validation)===(await read(path.join(dir,`${role}-validation.json`))).digest,'QUALITY_SEALED_VALIDATION_CHANGED');
  const prior=await readQualityPublications(root),actors=prior.flatMap(r=>[r.payload.author.provenance,r.payload.corrector.provenance]);
  check([author.provenance,corrector.provenance].every(p=>actors.every(a=>a.actorId!==p.actorId&&a.executionRef!==p.executionRef)),'QUALITY_ACTOR_REUSED');
  const revision=seal({schemaVersion:1,trainerId:id,status:'QUALITY_REVIEW',accepted:false,visualAudit:false,lotAccepted:false,romPromotion:false,
    operationalContinuity:{authorization:'USER_2026_09_08_ADELANTE_FOUR_QUALITY_REVISIONS',contractDigest:context.payload.contractDigest},
    basePublicationDigest:context.payload.basePublicationDigest,presentationDigest:context.payload.presentationDigest,
    context,author,corrector,authorValidation:authorResult.validation,result,updatedTrainer:result.updatedTrainer});
  const folder=path.join(root,BASE,'published');await write(path.join(folder,`${id}.json`),revision);
  const entries=Object.fromEntries([...prior,revision].map(r=>[r.payload.trainerId,r.digest]));
  const temporary=path.join(folder,`.index-${process.pid}.json`),index=path.join(folder,'index.json');
  await write(temporary,seal({schemaVersion:1,entries}));await fs.rename(temporary,index);forgetObservedFile(index);invalidateOperation();
  await verifyQualityRevisions(root);
  return {trainerId:id,state:'PUBLISHED',revisionDigest:revision.digest,publicationPath:path.join(folder,`${id}.json`),changed:result.changed};
}));}
export function query(root,id,options={}){return operation(async()=>{const {context}=await checkedContext(root,id);
  if(options.mode==='repair')return {inputDigest:context.digest,...context.payload,originalSubmission:rawSubmission(context.payload.originalTrainer)};
  return queryContext(context.payload.engineContext,{mode:options.mode??(options.species?'species':'list'),species:typeof options.species==='string'?options.species.split(','):options.species,level:options.level===undefined?undefined:Number(options.level),nature:options.nature});});}
export function status(root,id){return operation(async()=>{await checkedPlan(root);const result=await statusRaw(root,id);if(result.state!=='UNPREPARED')await checkedContext(root,id);return result;});}
export function audit(root){return operation(async()=>{await historicalEvidence(root);const {snapshot,revisions}=await verifyQualityRevisions(root);
  return {ok:true,baselineDigest:BASELINE_27_DIGEST,totalPublished:snapshot.sources.length,completed:revisions.map(r=>({trainerId:r.payload.trainerId,revisionDigest:r.digest,changed:r.payload.result.changed})),
    nextTrainerId:ORDER[revisions.length]??null,unchangedOtherTrainerIds:snapshot.sources.filter(s=>!ORDER.includes(s.trainerId)).map(s=>s.trainerId),lotAccepted:false,romPromotion:false};});}
export async function main(args=process.argv.slice(2)){const command=args.shift(),options={};
  check(['prepare','handoff','preview','submit','publish','query','status','audit'].includes(command),'QUALITY_COMMAND_REQUIRED');
  const allowed=new Set(['trainer','role','actor','execution-ref','input','mode','species','level','nature','project-root']);
  while(args.length){const flag=args.shift();check(flag.startsWith('--')&&allowed.has(flag.slice(2))&&args.length&&!options[flag.slice(2)],'QUALITY_INVALID_ARGUMENT');options[flag.slice(2)]=args.shift();}
  const root=options['project-root']??rootDefault,id=options.trainer;let input;
  if(options.input){const file=path.resolve(options.input),stat=await fs.lstat(file);check(stat.isFile()&&!stat.isSymbolicLink(),'QUALITY_REGULAR_INPUT_REQUIRED');input=JSON.parse(await fs.readFile(file));}
  const result=command==='prepare'?await prepare(root,id):command==='handoff'?await handoff(root,id,{role:options.role,actorId:options.actor,executionRef:options['execution-ref']}):command==='preview'?await preview(root,id,options.role,input):command==='submit'?await submit(root,id,options.role,input):command==='publish'?await publish(root,id):command==='query'?await query(root,id,options):command==='status'?await status(root,id):await audit(root);
  console.log(JSON.stringify(result,null,2));if(result.ok===false||result.state==='REJECTED')process.exitCode=1;return result;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(e=>{console.error(e.message);process.exitCode=1;});
