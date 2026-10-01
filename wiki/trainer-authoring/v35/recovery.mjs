import fs from 'node:fs/promises';
import path from 'node:path';
import {digest,readSealed} from '../window-revisions/v1/reader.mjs';
import {observeFile} from '../v32/operation-cache.mjs';
export const NOTE_RECOVERY=Object.freeze({decisionId:'D-263',authorization:'USER_EXPLICIT_PRESERVE_BEN_PROPOSAL_RECOVER_DIRECT_TO_INDEPENDENT_CORRECTOR',trainerId:'youngster-ben',sourceRunId:'b4-v34-ben-001',runId:'b4-v35-ben-recovery-001',sourceBase:'wiki/trainer-authoring/v34/runs/b4-v34-ben-001',sourceState:'REJECTED',sourceAdapterDigest:'c36b0436afe2ce8ba78e5f3fed8960f5393800fd0da00026a5354fb7c0a0a91d',authorEnvelopeDigest:'a631322b3c31f60b5f987d170cfd52e1752cdb03d14f3f28b22f8c47276f4bf5',authorDigest:'aadf9eba93616e5663579d68454e255bfadd33d8e640a4d8d1cbece3d900aaf9',sourceDigests:{
  'opening.json':'00a030597e5b56e42beaa0c29a7dbec56b525291c30cb5087cea5ba9d1d9a2f3',
  'context.json':'944cc46a4ba2d79690587c6501e7a3da5f0af70fefe280dcee45bc1ca647c85a',
  'publications.json':'4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945',
  'accepted-references.json':'f9eb0d576e150355e6ed45783c9c505604205da65059e19ae18719acbb24a1f3',
  'author-envelope.json':'a631322b3c31f60b5f987d170cfd52e1752cdb03d14f3f28b22f8c47276f4bf5',
  'author-submission.json':'aadf9eba93616e5663579d68454e255bfadd33d8e640a4d8d1cbece3d900aaf9',
  'author-validation.json':'150d38e101a7316444b338e7ee294f17f1e895412a7feedea9acf867e171a2e8',
  'author-record.json':'402e1e726a746b61f5c831168f9f898557d2fd25a0ea8ae8f231c6503fc55d9a'}});
export async function verifyRecoverySource(projectRoot){
  const root=await fs.realpath(projectRoot),files={};
  for(const [name,pin] of Object.entries(NOTE_RECOVERY.sourceDigests)){
    const file=path.join(root,NOTE_RECOVERY.sourceBase,name);
    if(await fs.realpath(file)!==file||!(await fs.lstat(file)).isFile())throw new Error('NOTE_RECOVERY_REGULAR_SOURCE_REQUIRED');
    await observeFile(file);const sealed=await readSealed(file);
    if(sealed.digest!==pin)throw new Error('NOTE_RECOVERY_SOURCE_CHANGED');files[name]=sealed;
  }
  for(const name of ['corrector-envelope.json','corrector-submission.json','corrector-record.json']){
    try{await fs.lstat(path.join(root,NOTE_RECOVERY.sourceBase,name));throw new Error('NOTE_RECOVERY_SOURCE_ALREADY_CORRECTED');}catch(error){if(error.code!=='ENOENT')throw error;}
  }
  const input=files['author-submission.json'],report=files['author-validation.json'].payload,record=files['author-record.json'].payload,opening=files['opening.json'].payload;
  if(opening.trainerId!==NOTE_RECOVERY.trainerId||input.payload.provenance.inputDigest!==NOTE_RECOVERY.authorEnvelopeDigest||record.inputDigest!==input.digest||record.validationDigest!==files['author-validation.json'].digest||record.previous!==files['opening.json'].digest||report.ok!==false||report.errors.length!==2||report.errors.some(e=>e.code!=='INTENT_REQUIRED'))throw new Error('NOTE_RECOVERY_SOURCE_BINDING_MISMATCH');
  return {noteRecovery:structuredClone(NOTE_RECOVERY),authorInput:structuredClone(input.payload),files};
}
export function assertRecoveredAuthor(noteRecovery,input){
  if(digest(noteRecovery)!==digest(NOTE_RECOVERY)||digest(input)!==NOTE_RECOVERY.authorDigest||input?.provenance?.inputDigest!==NOTE_RECOVERY.authorEnvelopeDigest)throw new Error('NOTE_RECOVERY_AUTHOR_CHANGED');
}
