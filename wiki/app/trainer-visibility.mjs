import {readFile} from 'node:fs/promises';

// Visibility is an editorial web concern. Never filter the technical publication
// reader or the generator's accumulated context with this manifest.
export function visibleTrainerEntries(entries,manifest){
  const check=(ok)=>{if(!ok)throw Error('INVALID_TRAINER_PUBLICATION_BATCHES');};
  check(manifest?.schemaVersion===1&&Array.isArray(manifest.batches));
  const batchIds=new Set(),trainerIds=new Set(),hidden=new Set(),present=new Set(entries.map(e=>e.trainerId));
  for(const batch of manifest.batches){
    check(typeof batch.id==='string'&&/^[a-z0-9][a-z0-9_-]*$/.test(batch.id)&&!batchIds.has(batch.id));batchIds.add(batch.id);
    check(['pending','released'].includes(batch.status)&&Array.isArray(batch.trainerIds)&&batch.trainerIds.length>0);
    for(const id of batch.trainerIds){check(typeof id==='string'&&/^[a-z0-9][a-z0-9_-]*$/.test(id)&&!trainerIds.has(id));trainerIds.add(id);}
    // A stale verified cache may contain only part of an internally published
    // batch. Even after release, expose it only when all members are available.
    if(batch.status==='pending'||!batch.trainerIds.every(id=>present.has(id)))for(const id of batch.trainerIds)hidden.add(id);
  }
  return entries.filter(entry=>!hidden.has(entry.trainerId));
}

export async function readVisibleTrainerEntries(readEntries,manifestPath){
  const entries=await readEntries();
  // Read after the cached view so an old cache cannot bypass a pending hold.
  const manifest=JSON.parse(await readFile(manifestPath,'utf8'));
  return visibleTrainerEntries(entries,manifest);
}
