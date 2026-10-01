import {AsyncLocalStorage} from 'node:async_hooks';
import fs from 'node:fs/promises';

const operations=new AsyncLocalStorage();
export function operation(work,{onMetrics}={}) {
  if(operations.getStore())return work();
  const state={values:new Map(),observed:new Map(),hits:0,misses:0,invalidations:0,counts:{}};
  return operations.run(state,async()=>{
    try{const result=await work();await assertObservedFiles();return result;}
    finally{onMetrics?.({hits:state.hits,misses:state.misses,invalidations:state.invalidations,counts:{...state.counts}});}
  });
}
export function memo(key,work) {
  const state=operations.getStore();
  if(!state)return work();
  if(state.values.has(key)){state.hits++;return state.values.get(key);}
  state.misses++;state.counts[key]=(state.counts[key]??0)+1;
  const value=Promise.resolve().then(work);
  state.values.set(key,value);
  value.catch(()=>{if(state.values.get(key)===value)state.values.delete(key);});
  return value;
}
export function invalidateOperation(){const state=operations.getStore();if(state){state.values.clear();state.invalidations++;}}
const signature=s=>`${s.dev}:${s.ino}:${s.size}:${s.mtimeNs}:${s.ctimeNs}`;
export async function observeFile(file) {
  const state=operations.getStore();if(!state)return;
  const current=signature(await fs.stat(file,{bigint:true}));
  if(state.observed.has(file)&&state.observed.get(file)!==current)throw new Error(`OPERATION_SOURCE_CHANGED: ${file}`);
  state.observed.set(file,current);
}
export async function assertObservedFiles() {
  const state=operations.getStore();if(!state)return;
  for(const [file,expected] of state.observed) {
    let current;try{current=signature(await fs.stat(file,{bigint:true}));}catch{throw new Error(`OPERATION_SOURCE_CHANGED: ${file}`);}
    if(current!==expected)throw new Error(`OPERATION_SOURCE_CHANGED: ${file}`);
  }
}
export function forgetObservedFile(file){operations.getStore()?.observed.delete(file);}
