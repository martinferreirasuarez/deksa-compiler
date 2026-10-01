import fs from 'node:fs/promises';
import path from 'node:path';
import {digest,seal} from '../../family-revisions/v1/reader.mjs';
import {sha} from '../../global-review/v1/snapshot.mjs';
const BASE='wiki/trainer-authoring/global-corrections/v1';
const check=(ok,message)=>{if(!ok)throw Error(message);};
export const TECHNICAL_FILES=new Set(['runner.mjs','reader.mjs','validation.mjs','runner.test.mjs','validation.test.mjs','runtime-binding.mjs','runtime-binding.test.mjs'].map(n=>`${BASE}/${n}`));
export function technicalDelta(before,after){
  const a=new Map(before.files),b=new Map(after.files),changes=[];
  for(const file of new Set([...a.keys(),...b.keys()]))if(a.get(file)!==b.get(file)){
    check(TECHNICAL_FILES.has(file),'RUNTIME_REBIND_NONTECHNICAL_SOURCE: '+file);
    check(typeof b.get(file)==='string'&&b.get(file)!=='directory','RUNTIME_REBIND_SOURCE_REMOVED');
    changes.push({path:file,before:a.get(file)??null,after:b.get(file)});
  }
  return changes;
}
async function read(file){check(await fs.realpath(file)===file&&(await fs.lstat(file)).isFile(),'RUNTIME_BINDING_CANONICAL_FILE');const r=JSON.parse(await fs.readFile(file));check(r.payload&&digest(r.payload)===r.digest,'RUNTIME_BINDING_SEAL');return r;}
export async function runtimeBindings(root,run,context){
  const folder=path.join(root,BASE,'runs',run,'runtime-bindings');let names;
  try{names=(await fs.readdir(folder)).sort();}catch(e){if(e.code==='ENOENT')return {receipts:[],activeDigest:null,sourceFingerprint:context.payload.sourceFingerprint};throw e;}
  const receipts=[];let sourceFingerprint=context.payload.sourceFingerprint,activeDigest=null;
  for(const [index,name]of names.entries()){
    check(name===`${String(index+1).padStart(4,'0')}.json`,'RUNTIME_BINDING_SEQUENCE');
    const r=await read(path.join(folder,name)),p=r.payload;
    check(p.schemaVersion===1&&p.kind==='TECHNICAL_RUNTIME_REBIND'&&p.runId===run&&p.snapshotDigest===context.digest&&p.previousReceiptDigest===activeDigest&&p.previousFingerprintDigest===sourceFingerprint.digest,'RUNTIME_BINDING_CHAIN');
    check(p.sourceFingerprint.digest===sha(JSON.stringify(p.sourceFingerprint.files))&&digest(p.changedFiles)===digest(technicalDelta(sourceFingerprint,p.sourceFingerprint))&&p.changedFiles.length>0,'RUNTIME_BINDING_SOURCE_DELTA');
    check(typeof p.reason==='string'&&p.reason.trim()&&p.operator?.actorId&&p.operator?.executionRef&&p.reviewerReexecuted===false,'RUNTIME_BINDING_REASON');
    check(Array.isArray(p.replayedPublications)&&p.replayedPublications.every(record=>record.entries.length&&record.entries.every(e=>e.beforeDigest===e.afterDigest)),'RUNTIME_BINDING_REPLAY');
    for(const record of p.replayedPublications){
      const published=await read(path.join(root,BASE,'published',record.file));
      check(published.digest===record.revisionDigest&&digest(record.entries)===digest(published.payload.entries.map(e=>({trainerId:e.trainerId,beforeDigest:digest(e.updatedTrainer),afterDigest:digest(e.updatedTrainer)}))),'RUNTIME_BINDING_PUBLICATION_CHANGED');
    }
    for(const file of p.changedFiles.filter(f=>f.before!==null)){
      const backup=p.codeBefore?.find(b=>b.source===file.path);
      check(backup&&backup.sha256===file.before&&backup.path.startsWith(`${BASE}/operations/`)&&!backup.path.includes('..')&&sha(await fs.readFile(path.join(root,backup.path)))===file.before,'RUNTIME_BINDING_PREVIOUS_CODE');
    }
    receipts.push(r);sourceFingerprint=p.sourceFingerprint;activeDigest=r.digest;
  }
  return {receipts,activeDigest,sourceFingerprint};
}
export async function recordRuntimeBinding(root,run,context,{fingerprint,reason,operator,replayedPublications,codeBackup,preservedFiles}){
  const previous=await runtimeBindings(root,run,context),changedFiles=technicalDelta(previous.sourceFingerprint,fingerprint);
  check(changedFiles.length&&reason?.trim()&&operator?.actorId&&operator?.executionRef,'RUNTIME_REBIND_ARGUMENTS');
  const codeBefore=[];
  for(const file of changedFiles.filter(f=>f.before!==null)){
    const relative=`${codeBackup}/${path.basename(file.path)}`;
    check(relative.startsWith(`${BASE}/operations/`)&&!relative.includes('..'),'RUNTIME_REBIND_BACKUP_SCOPE');
    check(sha(await fs.readFile(path.join(root,relative)))===file.before,'RUNTIME_REBIND_BACKUP_MISMATCH');
    codeBefore.push({source:file.path,path:relative,sha256:file.before});
  }
  const record=seal({schemaVersion:1,kind:'TECHNICAL_RUNTIME_REBIND',runId:run,snapshotDigest:context.digest,previousReceiptDigest:previous.activeDigest,previousFingerprintDigest:previous.sourceFingerprint.digest,sourceFingerprint:fingerprint,changedFiles,codeBefore,reason,operator,replayedPublications,preservedFiles,reviewerReexecuted:false});
  const folder=path.join(root,BASE,'runs',run,'runtime-bindings');await fs.mkdir(folder,{recursive:true});check(await fs.realpath(folder)===folder,'RUNTIME_BINDING_CANONICAL_DIRECTORY');
  await fs.writeFile(path.join(folder,`${String(previous.receipts.length+1).padStart(4,'0')}.json`),JSON.stringify(record,null,2)+'\n',{flag:'wx'});
  return record;
}
