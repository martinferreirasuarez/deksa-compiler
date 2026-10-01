import {deriveWorkflow as previous} from '../v36/workflow.mjs';
export {digest,authorMayProceed} from '../v36/workflow.mjs';
export function deriveWorkflow(source,evidence){
  return previous(source,evidence).replaceAll('wiki/trainer-authoring/v36','wiki/trainer-authoring/v37')
    .replaceAll('beta4-v36','beta4-v37').replaceAll('V36_TRAINER_ACCEPTANCE','V37_TRAINER_ACCEPTANCE').replaceAll('v36-workflow-','v37-workflow-');
}
