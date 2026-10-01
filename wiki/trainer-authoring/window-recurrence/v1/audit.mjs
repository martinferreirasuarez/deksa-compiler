import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { currentEntries } from '../../family-revisions/v1/runner.mjs';
import { digest, readSealed } from '../../item-revisions/v1/reader.mjs';

const LETTERS = ['A', 'B', 'C'];
const check = (ok, message) => { if (!ok) throw new Error(message); };

export function normalizeEntries(entries) {
  const seen = new Set();
  return entries.map((entry, order) => {
    const trainer = entry.trainer ?? entry;
    check(trainer.trainerId && trainer.lotId && trainer.windowId, 'TRAINER_SCOPE_REQUIRED');
    check(!seen.has(trainer.trainerId), `DUPLICATE_TRAINER: ${trainer.trainerId}`);
    seen.add(trainer.trainerId);
    const variants = Object.fromEntries(LETTERS.map(letter => {
      const variant = trainer.variants?.[letter];
      check(variant, `VARIANT_REQUIRED: ${trainer.trainerId}/${letter}`);
      const families = new Map();
      const parties = variant.branches ? Object.entries(variant.branches) : [[null, variant]];
      for (const [physicalBranch, party] of parties) {
        check(Array.isArray(party.members), 'MEMBERS_REQUIRED');
        for (const [index, member] of party.members.entries()) {
          check(member.family && member.family !== '$starter' && ['A','I','K'].includes(member.akiRole), 'PHYSICAL_FAMILY_ROLE_REQUIRED');
          const row = families.get(member.family) ?? { family:member.family, role:member.akiRole, trainerId:trainer.trainerId,
            lotId:trainer.lotId, letter, order, slots:[] };
          check(row.role === member.akiRole, 'INCONSISTENT_PHYSICAL_ROLE');
          row.slots.push({slot:index + 1, physicalBranch, species:member.species?.slug ?? member.species});
          families.set(member.family, row);
        }
      }
      return [letter, [...families.values()]];
    }));
    return {trainerId:trainer.trainerId, lotId:trainer.lotId, windowId:trainer.windowId, order, variants};
  });
}

export async function loadSnapshot(projectRoot) {
  const entries = await currentEntries(projectRoot);
  const sources = entries.map(({trainerId, publicationDigest, itemRevisionDigest, familyRevisionDigest}) =>
    ({trainerId, publicationDigest, itemRevisionDigest, familyRevisionDigest}));
  for (const version of ['v26','v28','v29']) {
    const indexPath = `wiki/trainer-authoring/${version}/published/index.json`;
    const index = JSON.parse(await fs.readFile(path.join(projectRoot,indexPath),'utf8'));
    check(Array.isArray(index.entries), 'PUBLICATION_INDEX_REQUIRED');
    for (const reference of index.entries) {
      check(reference.artifactPath.startsWith(`wiki/trainer-authoring/${version}/published/`) && !reference.artifactPath.includes('..'), 'PUBLICATION_PATH_INVALID');
      const sealed = await readSealed(path.join(projectRoot,reference.artifactPath));
      check(sealed.digest === reference.sha256 && sealed.payload.trainerId === reference.trainerId, 'PUBLICATION_PIN_MISMATCH');
      const trainer = sealed.payload.trainer;
      check(digest(trainer) === digest(reference.trainer), 'PUBLICATION_INDEX_TRAINER_MISMATCH');
      check(trainer.windowId.startsWith('W02'), 'UNEXPECTED_PUBLICATION_WINDOW');
      entries.push({trainer});
      sources.push({trainerId:trainer.trainerId, publicationDigest:sealed.digest, artifactPath:reference.artifactPath});
    }
  }
  return {schemaVersion:1, scope:'COMPLETE_CURRENT_PUBLISHED_SNAPSHOT', sources, trainers:normalizeEntries(entries)};
}

function familyLots(trainers, family) {
  return [...new Set(trainers.map(t => t.lotId))].sort().map(lotId => ({lotId,
    variants:LETTERS.map(letter => ({letter, owners:trainers.filter(t => t.lotId === lotId)
      .flatMap(t => t.variants[letter].filter(m => m.family === family))}))}));
}

// Merge identical (A, I/K) totals instead of enumerating 3^lots selections.
export function combinationStates(lots) {
  let states = new Map([['0,0',{anchors:0, nonAnchors:0, selection:{}}]]);
  for (const lot of lots) {
    const next = new Map();
    for (const prior of states.values()) for (const variant of lot.variants) {
      const anchors = prior.anchors + variant.owners.filter(o => o.role === 'A').length;
      const nonAnchors = prior.nonAnchors + variant.owners.filter(o => o.role !== 'A').length;
      next.set(`${anchors},${nonAnchors}`, {anchors, nonAnchors, selection:{...prior.selection,[lot.lotId]:variant.letter}});
    }
    states = next;
  }
  return [...states.values()];
}

const better = (a,b) => !b || a.cost < b.cost || (a.cost === b.cost && a.identityCost < b.identityCost)
  || (a.cost === b.cost && a.identityCost === b.identityCost && a.orderScore > b.orderScore);

// Exact minimum removals per family. For each lot retain a prefix I then K in
// each letter; combine max total M and max total with a nonanchor Q. A global
// selection violates the quota iff Q > quota. Anchor-only overflow has Q=-1.
export function minimalRemovals(lots, quota) {
  let states = new Map([['0,-1',{m:0,q:-1,cost:0,identityCost:0,orderScore:0,removals:[]}]]);
  for (const lot of lots) {
    let options = [{m:0,q:-1,cost:0,identityCost:0,orderScore:0,removals:[]}];
    for (const variant of lot.variants) {
      const anchors = variant.owners.filter(o => o.role === 'A').length;
      const variable = variant.owners.filter(o => o.role !== 'A').sort((a,b) => (a.role === 'I' ? 0:1)-(b.role === 'I' ? 0:1) || a.order-b.order);
      const next = [];
      for (const previous of options) for (let keep=0; keep<=variable.length; keep++) {
        const removed = variable.slice(keep), total=anchors+keep;
        next.push({m:Math.max(previous.m,total),q:Math.max(previous.q,keep ? total:-1),
          cost:previous.cost+removed.length,identityCost:previous.identityCost+removed.filter(o=>o.role==='I').length,
          orderScore:previous.orderScore+removed.reduce((sum,o)=>sum+o.order,0),removals:[...previous.removals,...removed]});
      }
      options = next;
    }
    const compact = new Map();
    for (const option of options) { const key=`${option.m},${option.q}`; if(better(option,compact.get(key))) compact.set(key,option); }
    const next = new Map();
    for (const prior of states.values()) for (const option of compact.values()) {
      const m=prior.m+option.m, q=Math.max(prior.q<0 ? -1:prior.q+option.m,option.q<0 ? -1:option.q+prior.m);
      if(q>quota) continue;
      const row={m,q,cost:prior.cost+option.cost,identityCost:prior.identityCost+option.identityCost,
        orderScore:prior.orderScore+option.orderScore,removals:[...prior.removals,...option.removals]};
      const key=`${m},${q}`; if(better(row,next.get(key)))next.set(key,row);
    }
    states=next;
  }
  let best;
  for (const row of states.values()) if(better(row,best))best=row;
  check(best,'NO_ANCHOR_PRESERVING_SOLUTION');
  return {minimumOwnerVariantRemovals:best.cost, identityRemovals:best.identityCost, candidates:best.removals};
}

export function auditWindow(trainers, previousTrainers = []) {
  check(trainers.length>0,'EMPTY_WINDOW');
  check(new Set(trainers.map(t=>t.windowId)).size===1,'MIXED_WINDOW');
  const n=trainers.length, previousN=previousTrainers.length;
  const ordinal=Number(/^W(\d+)/.exec(trainers[0].windowId)?.[1]);
  check(Number.isInteger(ordinal) && ordinal>=1,'WINDOW_ORDINAL_REQUIRED');
  check(ordinal===1 || previousN>0,'PREVIOUS_WINDOW_DATA_REQUIRED');
  check(previousTrainers.every(t=>Number(/^W(\d+)/.exec(t.windowId)?.[1])===ordinal-1),'IMMEDIATE_PREVIOUS_WINDOW_REQUIRED');
  const families=[...new Set(trainers.flatMap(t=>LETTERS.flatMap(l=>t.variants[l].map(m=>m.family))))].sort();
  const rows=families.map(family=>{
    const lots=familyLots(trainers,family);
    const previousMaximum=familyLots(previousTrainers,family).reduce((sum,lot)=>sum+Math.max(...lot.variants.map(v=>v.owners.length)),0);
    // Integer comparison makes the exact 20% boundary unambiguous.
    const reduced=previousN>0 && previousMaximum*5>=previousN;
    const quota=Math.ceil(n/(reduced ? 10:5));
    const states=combinationStates(lots).map(state=>({...state,total:state.anchors+state.nonAnchors,
      excess:Math.max(0,state.anchors+state.nonAnchors-Math.max(quota,state.anchors))}));
    const worst=states.reduce((a,b)=>b.excess>a.excess ? b:a);
    const maximumPossible=lots.reduce((sum,lot)=>sum+Math.max(...lot.variants.map(v=>v.owners.length)),0);
    const remediation=minimalRemovals(lots,quota);
    return {family,quota,rate:reduced ? 0.1:0.2,previousMaximum,previousN,
      previousRatio:previousN ? previousMaximum/previousN:null,maximumPossible,maximumExcess:worst.excess,
      witness:worst,lots,...remediation};
  });
  return {windowId:trainers[0].windowId,N:n,previousN,ok:rows.every(r=>r.maximumExcess===0),families:rows,
    excesses:rows.filter(r=>r.maximumExcess>0),candidateRemovals:rows.flatMap(r=>r.candidates)};
}

export function auditSnapshot(snapshot) {
  const windows=[...new Set(snapshot.trainers.map(t=>t.windowId))].sort();
  return {scope:snapshot.scope ?? 'SUPPLIED_SNAPSHOT',sources:snapshot.sources ?? [],windows:windows.map((windowId,index)=>
    auditWindow(snapshot.trainers.filter(t=>t.windowId===windowId),index ? snapshot.trainers.filter(t=>t.windowId===windows[index-1]):[]))};
}

if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const snapshot=await loadSnapshot(process.argv[2] ?? process.cwd());
  console.log(JSON.stringify(auditSnapshot(snapshot),null,2));
}
