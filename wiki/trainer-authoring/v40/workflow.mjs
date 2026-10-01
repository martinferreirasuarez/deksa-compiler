import {deriveWorkflow as previous} from '../v37/workflow.mjs';
export {digest,authorMayProceed} from '../v37/workflow.mjs';
export function deriveWorkflow(source,evidence){
  let result=previous(source,evidence).replaceAll('wiki/trainer-authoring/v37','wiki/trainer-authoring/v40')
    .replaceAll('beta4-v37','beta4-v40').replaceAll('V37_TRAINER_ACCEPTANCE','V40_TRAINER_ACCEPTANCE').replaceAll('v37-workflow-','v40-workflow-');
  for(const version of ['v36','v37'])for(const name of ['snapshot.mjs','window-recurrence.mjs'])
    result=result.replaceAll(new URL('../'+version+'/'+name,import.meta.url).href,new URL('./'+name,import.meta.url).href);
  const sourceAnchor="    hashes['historicalAdapter']=digest(await historicalAdapterEvidence(root));";
  if(result.split(sourceAnchor).length!==2)throw Error('ANCHOR_CONTRACT_BINDING_SOURCE_CHANGED');
  result=result.replace(sourceAnchor,sourceAnchor+"\n    { const file=await checked('TRAINER_ANCHOR_EXCEPTIONS.md'); await observeFile(file); hashes['D265:TRAINER_ANCHOR_EXCEPTIONS.md']=digest(await fs.readFile(file)); }");
  return result;
}
