import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
export {digest as hash} from '../v40/workflow.mjs';
import {digest as hash} from '../v40/workflow.mjs';
export const directory=path.dirname(fileURLToPath(import.meta.url));
export const root=path.resolve(directory,'../../..');
export const BASE='wiki/trainer-authoring/v42',GENERATOR_ID='beta4-v42';
export const sha=value=>createHash('sha256').update(value).digest('hex');
export const check=(ok,message)=>{if(!ok)throw Error(message);};
export const safeId=id=>typeof id==='string'&&/^[a-z0-9][a-z0-9-]*$/.test(id);
export const runId=id=>{check(safeId(id),'TRAINER_ID_REQUIRED');return `b4-v42-${id}-001`;};
export const runDirectory=id=>path.join(directory,'runs',runId(id));
export async function read(file){const stat=await fs.lstat(file);check(stat.isFile()&&!stat.isSymbolicLink(),'REGULAR_FILE_REQUIRED: '+file);return JSON.parse(await fs.readFile(file,'utf8'));}
export async function write(file,value,exclusive=false){await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,JSON.stringify(value,null,2)+'\n',{flag:exclusive?'wx':'w'});}
export async function seal(file,payload){await write(file,{digest:hash(payload),payload},true);return hash(payload);}
export async function readSealed(file){const row=await read(file);check(hash(row.payload)===row.digest,'SEALED_ARTIFACT_CHANGED: '+file);return row.payload;}
export async function listing(file){try{return(await fs.readdir(file)).sort();}catch(e){if(e.code==='ENOENT')return [];throw e;}}
export async function identity(){const files=['core.mjs','baseline.mjs','context.mjs','runner.mjs','snapshot.mjs','../production-tools/v1/normalize.mjs','../production-tools/v1/packet.mjs','../production-tools/v1/summary.mjs','../production-tools/v2/WORKFLOW.md','ACTOR.md','../experiments/basket-v1/patch.mjs','../global-corrections/v2/reader.mjs'];return hash(await Promise.all(files.map(async f=>[f,sha(await fs.readFile(path.join(directory,f)))])));}
export async function locked(work){await fs.mkdir(directory,{recursive:true});const file=path.join(directory,'.workflow.lock'),handle=await fs.open(file,'wx');try{return await work();}finally{await handle.close();await fs.unlink(file);}}
export function actorModel(profile,role){return 'gpt-6-astra';}
export function validActor(value){return typeof value==='string'&&/^\/root\/[a-zA-Z0-9_/-]+$/.test(value);}
