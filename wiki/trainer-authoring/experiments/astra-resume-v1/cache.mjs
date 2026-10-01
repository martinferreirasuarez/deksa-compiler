import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {serialize,deserialize} from 'node:v8';
import {AsyncLocalStorage} from 'node:async_hooks';
const sessions=new AsyncLocalStorage();
const BASE='wiki/trainer-authoring/experiments/astra-resume-v1';
const sha=value=>createHash('sha256').update(value).digest('hex');
const copy=value=>deserialize(serialize(value));
const inputRoots=['wiki/trainer-authoring','wiki/app/generated','pokefirered/src','pokefirered/data'];
function excluded(relative){
  const parts=relative.split('/');
  // Historical transition gates consume some drafts (Nob V30) and prove the
  // absence of others (Shane V31). Only active/nonhistorical drafts are ignored.
  if(parts.includes('.cache')||(parts.includes('drafts')&&!relative.startsWith('wiki/trainer-authoring/'))||parts.includes('operations')||relative.endsWith('.lock')||relative.endsWith('-handoff.json'))return true;
  if(relative.startsWith(BASE+'/'))return !/\/(?:[^/]+\.mjs|CONTRACT\.md)$/.test(relative.slice(BASE.length))||relative.endsWith('.test.mjs');
  return false;
}
export async function dependencyManifest(root,{roots=inputRoots}={}){
  const rows=[];
  async function visit(relative){
    if(excluded(relative))return;
    const file=path.join(root,relative);let stat;try{stat=await fs.lstat(file);}catch(e){if(e.code==='ENOENT'){rows.push([relative,'MISSING']);return;}throw e;}
    if(stat.isSymbolicLink())throw new Error(`CACHE_DEPENDENCY_SYMLINK: ${relative}`);
    if(stat.isDirectory()){rows.push([relative,'DIRECTORY']);for(const name of (await fs.readdir(file)).sort())await visit(`${relative}/${name}`);}
    else if(stat.isFile())rows.push([relative,sha(await fs.readFile(file))]);
  }
  for(const relative of roots)await visit(relative);
  if(roots===inputRoots)for(const name of (await fs.readdir(root)).filter(n=>n==='DECISIONS.md'||/^TRAINER_.*\.md$/.test(n)).sort())await visit(name);
  return {digest:sha(JSON.stringify(rows)),entries:rows.length};
}
export async function cacheOperation(root,{fresh=false,onMetrics,manifestOptions}={},work){
  if(sessions.getStore())return work();
  const started=performance.now(),state={root,fresh,manifestOptions,manifest:null,pending:new Map(),writes:[],metrics:{hits:0,misses:0,rebuilds:0,corrupt:0,manifestMs:0,keys:[]}};
  return sessions.run(state,async()=>{
    try{
      const result=await work();
      if(state.manifest){const current=await dependencyManifest(root,manifestOptions);if(current.digest!==state.manifest.digest)throw new Error('CACHE_DEPENDENCIES_CHANGED_DURING_OPERATION');}
      for(const write of state.writes)await write();
      return result;
    }finally{state.metrics.elapsedMs=Math.round(performance.now()-started);onMetrics?.({...state.metrics});}
  });
}
export async function cachedBaseline(root,key,build){
  const state=sessions.getStore();
  if(!state)return cacheOperation(root,{},()=>cachedBaseline(root,key,build));
  if(state.root!==root)throw new Error('CACHE_ROOT_MISMATCH');
  if(state.pending.has(key))return copy(await state.pending.get(key));
  const task=(async()=>{
    if(!state.manifest){const started=performance.now();state.manifest=await dependencyManifest(root,state.manifestOptions);state.metrics.manifestMs=Math.round(performance.now()-started);}
    const dir=path.join(root,BASE,'.cache'),file=path.join(dir,sha(key)+'.json'),manifest=state.manifest.digest;
    if(!state.fresh){try{
      const entry=JSON.parse(await fs.readFile(file,'utf8'));
      if(entry.schema===1&&entry.key===key&&entry.manifest===manifest){
        if(sha(entry.payload)!==entry.payloadDigest)throw new Error('CACHE_PAYLOAD_CORRUPT');
        const result=deserialize(Buffer.from(entry.payload,'base64'));state.metrics.hits++;state.metrics.keys.push({key,status:'hit'});return result;
      }
    }catch(error){if(error.code!=='ENOENT'){state.metrics.corrupt++;}}
    }
    state.metrics.misses++;state.metrics.keys.push({key,status:state.fresh?'fresh':'miss'});
    const value=await build(); // Rejections never produce an entry.
    const payload=serialize(value).toString('base64'),entry={schema:1,key,manifest,payload,payloadDigest:sha(payload)};
    state.writes.push(async()=>{await fs.mkdir(dir,{recursive:true});const temporary=path.join(dir,`${sha(key)}-${randomUUID()}.tmp`);
      await fs.writeFile(temporary,JSON.stringify(entry),{flag:'wx',mode:0o600});await fs.rename(temporary,file);state.metrics.rebuilds++;});return value;
  })();
  state.pending.set(key,task);try{return copy(await task);}catch(error){state.pending.delete(key);throw error;}
}
