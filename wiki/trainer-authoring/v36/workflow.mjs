import {deriveWorkflow as previous} from '../v35/workflow.mjs';
export {digest} from '../v35/workflow.mjs';
export {authorMayProceed} from '../v35/workflow.mjs';
export function deriveWorkflow(source,evidence){
  let result=previous(source,evidence);
  const once=(from,to)=>{if(result.split(from).length!==2)throw Error('CURRENT_WORKFLOW_ANCHOR_CHANGED: '+from.slice(0,80));result=result.replace(from,to);};
  for(const name of ['snapshot.mjs','window-recurrence.mjs'])result=result.replaceAll(new URL('../v35/'+name,import.meta.url).href,new URL('./'+name,import.meta.url).href);
  result=result.replaceAll('wiki/trainer-authoring/v35','wiki/trainer-authoring/v36').replaceAll('beta4-v35','beta4-v36').replaceAll('V35_TRAINER_ACCEPTANCE','V36_TRAINER_ACCEPTANCE').replaceAll('v35-workflow-','v36-workflow-');
  result=result.replaceAll(new URL('./recovery.mjs',import.meta.url).href,new URL('../v35/recovery.mjs',import.meta.url).href);
  once("id: 'w02-advanced-common', lotOrder: ['02D', '02C', '02B', '02A'], profiles: ['AVANZADO','COMÚN'],","id: 'w03', lotOrder: ['03D','03C','03B','03A'], profiles: ['JEFE','ESPECIALISTA','AVANZADO','COMÚN'],");
  once("authorization: 'USER_2026_09_08_CONTINUA_CON_LOS_AVANZADOS_Y_COMUNES_DE_LA_VENTANA_DE_MISTY_USANDO_ESTE_GENERADOR_HACEMOS_TODOS_MANANA_LO_AUDITO'","authorization: 'USER_AUTHORIZED_W03_CURRENT_WIKI_CONTEXT'");
  once('const superseded=predecessor.runs.find(r=>r.trainerId===NOTE_RECOVERY.trainerId);','const superseded=null;');
  once("const file=await checked(`${['engine.mjs','workflow.mjs','query.mjs','policy.json','window-recurrence.mjs'].includes(source)||source.startsWith('skills/')?BASE:'wiki/trainer-authoring/v32'}/${source}`);","const file=await checked(`${source.startsWith('skills/')?'wiki/trainer-authoring/v35':['engine.mjs','workflow.mjs','query.mjs','policy.json','window-recurrence.mjs'].includes(source)?BASE:'wiki/trainer-authoring/v32'}/${source}`);");
  once('const references = `${BASE}/skills/deksa-trainer-generator/references`;','const references = `wiki/trainer-authoring/v35/skills/deksa-trainer-generator/references`;');
  // Historical accepts retain their original seals. Only the derived team
  // evidence (ledgers, gym distance and specialist evidence) gets projected.
  result=`import {projectCurrentEntries} from '${new URL('./snapshot.mjs',import.meta.url).href}';\n`+result;
  const acceptedStart=result.indexOf('  async function acceptedExternalReferencesUncached() {');
  const acceptedEnd=result.indexOf('  async function verifyPinnedDescriptors(',acceptedStart);
  if(acceptedStart<0||acceptedEnd<0)throw Error('CURRENT_ACCEPTED_BINDING_ANCHOR');
  result=result.slice(0,acceptedStart)+`  async function acceptedExternalReferencesUncached() {
    return projectCurrentEntries(root,(await inheritedEvidence(root)).accepted);
  }
`+result.slice(acceptedEnd);
  once("...external.filter(row => row.kind === 'EXTERNAL_TRAINER_REVIEW')","...external.filter(row => row.kind === 'EXTERNAL_TRAINER_REVIEW' && !predecessor.publications.some(p=>p.trainerId===row.trainerId))");
  once('windowRevisionDigest:entry.windowRevisionDigest??null}};','windowRevisionDigest:entry.windowRevisionDigest??null,qualityRevisionDigest:entry.qualityRevisionDigest??null,globalCorrectionDigest:entry.globalCorrectionDigest??null,presentationDigest:entry.presentationDigest??null}};');
  once('const derived = { ...payload, packagePermutations,windowConstructionOrder,','const derived = { ...payload, packagePermutations,windowConstructionOrder,historicalBinding:catalogs.windowSnapshot.historicalBinding,');
  return result;
}
