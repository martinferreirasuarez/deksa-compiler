import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {currentEntries as w01Entries, lotInputs} from '../../family-revisions/v1/runner.mjs';
import {loadSnapshot as initialSnapshot, normalizeEntries, auditSnapshot} from '../../window-recurrence/v1/audit.mjs';
import {loadCatalogs, withGymEvidence, withSpecialistEvidence, buildContext, validateSubmission, lotFamilyGlobalFindings} from '../../v29/engine.mjs';
import {queryContext} from '../../v29/query.mjs';
import {projectTrainerItems} from '../../item-clause.mjs';
import {BASE, ORDER, digest,seal,readSealed,rawSubmission,evaluate,applyWindowRevision,projectedSnapshot} from './reader.mjs';
async function writeNew(file, value) {
  await fs.mkdir(path.dirname(file), {recursive:true});
  await fs.writeFile(file, `${JSON.stringify(value,null,2)}\n`, {flag:'wx'});
}
export async function baselineEntries(projectRoot) {
  const snapshot = await initialSnapshot(projectRoot), entries = await w01Entries(projectRoot);
  for (const source of snapshot.sources.filter(s=>s.artifactPath)) {
    const sealed = await readSealed(path.join(projectRoot,source.artifactPath));
    const version = source.artifactPath.split('/')[2];
    const acceptance = await readSealed(path.join(projectRoot,'wiki/trainer-authoring',version,'accepted/trainers',`${source.trainerId}.json`));
    if (acceptance.payload.publicationDigest !== source.publicationDigest || acceptance.payload.trainerId !== source.trainerId) throw new Error('ACCEPTANCE_SOURCE_MISMATCH');
    entries.push({...source,acceptanceDigest:acceptance.digest,trainer:projectTrainerItems(sealed.payload.trainer)});
  }
  return entries;
}
const pins = entries => entries.map(e=>({trainerId:e.trainer.trainerId,publicationDigest:e.publicationDigest,
  acceptanceDigest:e.acceptanceDigest,itemRevisionDigest:e.itemRevisionDigest??null,familyRevisionDigest:e.familyRevisionDigest??null,
  windowRevisionDigest:e.windowRevisionDigest??null,presentationDigest:digest(e.trainer)}));
export async function makePlan(projectRoot) {
  const entries = await baselineEntries(projectRoot), audit = auditSnapshot({trainers:normalizeEntries(entries)});
  if (!audit.windows[0].ok || audit.windows[1]?.N !== 10) throw new Error('UNEXPECTED_INITIAL_SNAPSHOT');
  const allowedSlots = Object.fromEntries(ORDER.map(id=>[id,[]]));
  for (const owner of audit.windows[1].candidateRemovals) for (const slot of owner.slots) {
    const list = allowedSlots[owner.trainerId], key = `${owner.letter}${slot.slot}`;
    if (!list) throw new Error('UNAUTHORIZED_TRAINER');
    if (!list.includes(key)) list.push(key);
  }
  for (const slots of Object.values(allowedSlots)) slots.sort();
  const infrastructurePins = Object.fromEntries(await Promise.all(['runner.mjs','reader.mjs','tests.mjs','SKILL.md'].map(async file=>[file,digest(await fs.readFile(path.join(projectRoot,BASE,file),'utf8'))])));
  return seal({schemaVersion:1,scope:'W02_PUBLISHED_REPAIR_ONLY',order:ORDER,allowedSlots,sourcePins:pins(entries),initialAudit:audit,infrastructurePins,
    contractDigest:digest(await fs.readFile(path.join(projectRoot,'TRAINER_WINDOW_RECURRENCE.md'),'utf8'))});
}
export async function ensurePlan(projectRoot) {
  const expected = await makePlan(projectRoot), file = path.join(projectRoot,BASE,'plan.json');
  try {await writeNew(file,expected);} catch(e) {if(e.code!=='EEXIST')throw e;}
  const plan = await readSealed(file);
  if (plan.digest!==expected.digest) throw new Error('PLAN_SOURCE_CHANGED');
  return plan;
}
export async function currentEntries(projectRoot) {
  const entries = await baselineEntries(projectRoot);
  for (const entry of entries) {
    const revision = await applyWindowRevision({projectRoot,originalTrainer:entry.trainer,basePublicationDigest:entry.publicationDigest});
    if(revision) Object.assign(entry,{trainer:revision.updatedTrainer,windowRevisionDigest:revision.revisionDigest});
  }
  return entries;
}
export async function catalogsFor(projectRoot, entries) {
  let catalogs = await loadCatalogs(projectRoot);
  const evidence = entries.map(e=>({artifactPath:`derived:window-revisions/v1/${e.trainer.trainerId}`,
    sealed:seal({schemaVersion:1,scope:'OPERATIONAL_PRESENTATION_EVIDENCE_NOT_ORIGINAL_ACCEPTANCE',
      trainerId:e.trainer.trainerId,trainer:e.trainer,sourcePins:pins([e])[0]})}));
  catalogs = withGymEvidence(catalogs,evidence);
  catalogs = withSpecialistEvidence(catalogs,evidence.map(e=>({trainerId:e.sealed.payload.trainerId,
    publicationDigest:e.sealed.digest,acceptanceDigest:e.sealed.payload.sourcePins.acceptanceDigest,trainer:e.sealed.payload.trainer})));
  return {...catalogs,windowRevisionEvidence:evidence};
}
export async function makeContext(projectRoot, trainerId, plan) {
  const entries = await currentEntries(projectRoot), completed = entries.filter(e=>e.windowRevisionDigest).map(e=>e.trainer.trainerId);
  if (plan.payload.order.find(id=>!completed.includes(id))!==trainerId) throw new Error('SEQUENTIAL_TRAINER_REQUIRED');
  const target = entries.find(e=>e.trainer.trainerId===trainerId), catalogs = await catalogsFor(projectRoot,entries);
  const engineContext = await buildContext({projectRoot,trainerId,...lotInputs(entries.filter(e=>e.trainer.lotId===target.trainer.lotId),trainerId)},catalogs);
  const isolatedContext = await buildContext({projectRoot,trainerId},catalogs);
  const result = validateSubmission(engineContext,rawSubmission(target.trainer),catalogs);
  const trainers = entries.map(e=>e.trainer);
  return seal({schemaVersion:1,trainerId,plan,allowedSlots:plan.payload.allowedSlots[trainerId],sourcePins:pins(entries),completed,
    basePublicationDigest:target.publicationDigest,presentationDigest:digest(target.trainer),originalTrainer:target.trainer,
    trainers,engineContext,isolatedContext,derivedEvidence:catalogs.windowRevisionEvidence,baselineValidation:{ok:result.ok,errors:result.errors,warnings:result.warnings},
    currentAudit:auditSnapshot({trainers:normalizeEntries(entries)}),projectedAudit:auditSnapshot(projectedSnapshot(trainers,plan,completed))});
}
export async function prepare(projectRoot,trainerId) {
  const plan = await ensurePlan(projectRoot), context = await makeContext(projectRoot,trainerId,plan);
  const contextPath = path.join(projectRoot,BASE,'contexts',`${trainerId}.json`);
  try {await writeNew(contextPath,context);} catch(e) {if(e.code!=='EEXIST')throw e;if((await readSealed(contextPath)).digest!==context.digest)throw new Error('EXISTING_CONTEXT_CHANGED');}
  await fs.mkdir(path.join(projectRoot,BASE,'drafts'),{recursive:true});
  return {contextPath,inputDigest:context.digest,allowedSlots:context.payload.allowedSlots,
    authorOutputPath:path.join(projectRoot,BASE,'drafts',`${trainerId}-author.json`),correctorOutputPath:path.join(projectRoot,BASE,'drafts',`${trainerId}-corrector.json`),
    baselineValidation:context.payload.baselineValidation};
}
async function checkedContext(projectRoot,trainerId) {
  const plan = await readSealed(path.join(projectRoot,BASE,'plan.json'));
  if(plan.digest!==(await makePlan(projectRoot)).digest)throw new Error('PLAN_SOURCE_CHANGED');
  const context = await readSealed(path.join(projectRoot,BASE,'contexts',`${trainerId}.json`));
  if(context.digest!==(await makeContext(projectRoot,trainerId,plan)).digest)throw new Error('CONTEXT_CHANGED');
  return context;
}
export async function preview(projectRoot,trainerId,proposal,author) {
  const context = await checkedContext(projectRoot,trainerId),catalogs = await catalogsFor(projectRoot,await currentEntries(projectRoot));
  if(author)evaluate(context,author,catalogs,{role:'author'});
  const result = evaluate(context,proposal,catalogs,{author});
  return {valid:true,inputDigest:context.digest,proposalDigest:digest(proposal),validation:result.validation,pendingInheritedFindings:result.pendingInheritedFindings,projected:result.projected};
}
export async function publish(projectRoot,trainerId,author,corrector) {
  const folder = path.join(projectRoot,BASE,'published');await fs.mkdir(folder,{recursive:true});
  const lock = path.join(folder,'.publish.lock'),handle = await fs.open(lock,'wx');
  try {
    const context = await checkedContext(projectRoot,trainerId),catalogs = await catalogsFor(projectRoot,await currentEntries(projectRoot));
    const authorResult=evaluate(context,author,catalogs,{role:'author'}),result=evaluate(context,corrector,catalogs,{role:'corrector',author});
    let index={entries:{}};try {index=(await readSealed(path.join(folder,'index.json'))).payload;}catch(e){if(e.code!=='ENOENT')throw e;}
    if(index.entries[trainerId])throw new Error('REVISION_ALREADY_PUBLISHED');
    for(const id of Object.keys(index.entries)) {
      const prior=(await readSealed(path.join(folder,`${id}.json`))).payload;
      const actors=[prior.author.provenance,prior.corrector.provenance];
      if([author.provenance,corrector.provenance].some(p=>actors.some(a=>a.actorId===p.actorId||a.executionRef===p.executionRef)))throw new Error('ACTOR_REUSED');
    }
    const revision=seal({schemaVersion:1,trainerId,status:'WINDOW_REVIEW',accepted:false,lotAccepted:false,romPromotion:false,
      basePublicationDigest:context.payload.basePublicationDigest,presentationDigest:context.payload.presentationDigest,
      context,author,corrector,authorValidation:authorResult.validation,...result});
    await writeNew(path.join(folder,`${trainerId}.json`),revision);index.entries[trainerId]=revision.digest;
    const tmp=path.join(folder,`.index-${process.pid}.json`);await writeNew(tmp,seal(index));await fs.rename(tmp,path.join(folder,'index.json'));
    return {publicationPath:path.join(folder,`${trainerId}.json`),revisionDigest:revision.digest};
  } finally {await handle.close();await fs.unlink(lock);}
}
export async function audit(projectRoot) {
  const entries=await currentEntries(projectRoot),windows=auditSnapshot({trainers:normalizeEntries(entries),sources:pins(entries)});
  const local=[...new Set(entries.map(e=>e.trainer.lotId))].flatMap(lotId=>lotFamilyGlobalFindings(lotInputs(entries.filter(e=>e.trainer.lotId===lotId)).currentLotTeams).map(f=>({lotId,...f})));
  return {ok:windows.windows.every(w=>w.ok)&&!local.length,...windows,local};
}
export async function query(projectRoot,trainerId,options={}) {
  const context=await readSealed(path.join(projectRoot,BASE,'contexts',`${trainerId}.json`));
  if(options.mode==='repair')return {inputDigest:context.digest,...context.payload,originalTrainer:rawSubmission(context.payload.originalTrainer)};
  return queryContext(context.payload.engineContext,{mode:options.mode??(options.species?'species':'list'),species:typeof options.species==='string'?options.species.split(','):options.species,level:options.level,nature:options.nature});
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
  try {
    const [command,...args]=process.argv.slice(2);
    if(args.length%2||args.some((a,i)=>i%2===0&&!a.startsWith('--')))throw new Error('FLAG_VALUE_PAIRS_REQUIRED');
    const options=Object.fromEntries(Array.from({length:args.length/2},(_,i)=>[args[i*2].slice(2),args[i*2+1]]));
    const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../../..'),read=async f=>JSON.parse(await fs.readFile(f,'utf8'));
    const result=command==='prepare'?await prepare(root,options.trainer):command==='query'?await query(root,options.trainer,options):command==='audit'?await audit(root):command==='preview'?await preview(root,options.trainer,await read(options.input),options.author?await read(options.author):undefined):command==='publish'?await publish(root,options.trainer,await read(options.author),await read(options.corrector)):(()=>{throw new Error('Commands: prepare/query/preview/publish/audit');})();
    console.log(JSON.stringify(result,null,2));
  }catch(e){console.error(JSON.stringify({error:e.message,findings:e.findings},null,2));process.exitCode=1;}
}
