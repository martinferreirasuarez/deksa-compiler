import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {operation} from '../../v32/operation-cache.mjs';
export const sha=value=>createHash('sha256').update(value).digest('hex');
// A content inventory also detects added publications, including absent directories.
export async function fingerprint(root){
  const rows=[];
  async function visit(relative){
    if(relative==='wiki/trainer-authoring/global-review/v1/runs'||relative==='wiki/trainer-authoring/global-review/v1/operations'||relative.split('/').includes('.cache'))return;
    const file=path.join(root,relative);let stat;
    try{stat=await fs.lstat(file);}catch(e){if(e.code==='ENOENT'){rows.push([relative,null]);return;}throw e;}
    if(stat.isSymbolicLink())throw Error(`SOURCE_SYMLINK: ${relative}`);
    if(stat.isDirectory()){rows.push([relative,'directory']);for(const name of (await fs.readdir(file)).sort())await visit(`${relative}/${name}`);}
    else if(stat.isFile())rows.push([relative,sha(await fs.readFile(file))]);
  }
  for(const name of ['wiki/trainer-authoring','wiki/app/generated','pokefirered/src','pokefirered/data',...(await fs.readdir(root)).filter(n=>/^TRAINER_.*\.md$/.test(n)||n==='DECISIONS.md').sort()])await visit(name);
  return {digest:sha(JSON.stringify(rows)),files:rows};
}
export async function capture(root){return operation(async()=>{
  const before=await fingerprint(root);
  const {loadWindowSnapshot}=await import('../../v35/window-recurrence.mjs');
  const snapshot=await loadWindowSnapshot(root);
  const {loadCatalogs}=await import('../../v35/engine.mjs');
  const catalogs=await loadCatalogs(root,{windowSnapshot:snapshot});
  // Catalog documents contain all factual resources. Maps/indexes are derivable,
  // not serialized as misleading empty objects; this is not a correction context.
  const facts=Object.fromEntries(Object.entries(catalogs).filter(([key])=>!['indexes','windowSnapshot','forbiddenBabies','historicalBabyEdges'].includes(key)));
  const after=await fingerprint(root);
  if(before.digest!==after.digest)throw Error('SOURCES_CHANGED_DURING_CAPTURE');
  return {snapshot,facts,sourceFingerprint:after};
});}
