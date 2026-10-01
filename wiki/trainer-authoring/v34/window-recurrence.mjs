export * from '../v33/window-recurrence.mjs';
import {windowContext as previousContext,windowFindings as previousFindings,appendAdmissions as previousAppend} from '../v33/window-recurrence.mjs';
import {digest} from '../window-revisions/v1/reader.mjs';
import {buildExceptionMemory,exceptionMemoryFindings} from './exception-memory.mjs';
export function windowContext(snapshot,trainerId,windowId){
  return {...previousContext(snapshot,trainerId,windowId),exceptionMemory:buildExceptionMemory(snapshot,trainerId,windowId)};
}
export function windowFindings(context,variants){
  const memory=exceptionMemoryFindings(context,variants),previous=previousFindings(context,variants);
  const errors=[...previous.errors,...memory.errors];
  return {...previous,errors,audit:{...previous.audit,ok:errors.length===0,exceptionMemoryDigest:memory.memoryDigest,exceptionMemoryViolations:memory.errors}};
}
export function appendAdmissions(snapshot,additions){
  let current=snapshot,pending=[...additions];
  while(pending.length){
    const matching=pending.filter(next=>digest(next.context)===digest({...windowContext(current,next.presentation.trainerId,next.presentation.windowId),lotId:next.presentation.lotId}));
    if(matching.length!==1)throw new Error('ADMISSION_SEQUENCE_OR_SOURCE_MISMATCH');
    const next=matching[0],result=windowFindings(next.context,next.presentation.variants);
    if(result.errors.length)throw new Error(`INVALID_NONANCHOR_ADMISSION: ${next.presentation.trainerId}/${result.errors.map(e=>e.code).join(',')}`);
    // The frozen predecessor replays its own admission shape; only new v34
    // additions receive the new memory gate. Baseline duplicates remain intact.
    const {exceptionMemory,...context}=next.context;
    current=previousAppend(current,[{...next,context}]);
    pending=pending.filter(entry=>entry!==next);
  }
  return current;
}
export async function loadWindowSnapshot(root){return (await import('./snapshot.mjs')).loadSimpleSnapshot(root);}
