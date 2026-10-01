import path from 'node:path';
import { digest, seal, readSealed, rawMember, rawSubmission, mergeNormalized } from '../../family-revisions/v1/reader.mjs';
import { validateSubmission, materialize } from '../../v29/engine.mjs';
import { normalizeEntries, auditSnapshot } from '../../window-recurrence/v1/audit.mjs';
export { digest, seal, readSealed, rawMember, rawSubmission, mergeNormalized };
export const BASE = 'wiki/trainer-authoring/window-revisions/v1';
export const ORDER = ['leader-misty', 'rival-cerulean', 'super-nerd-miguel', 'picnicker-kelsey', 'rocket-cerulean', 'picnicker-diana', 'rocket-recruiter', 'lass-iris', 'rocket-grunt-4', 'lass-robin'];
const exact = (value, keys) => {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).sort().join() !== [...keys].sort().join()) throw new Error(`INVALID_FIELDS: ${keys.join(',')}`);
};
export function restrictProposal(context, proposal, {role = proposal?.provenance?.role, author} = {}) {
  exact(proposal, ['provenance', 'replacements', 'variantNotes', ...(role === 'corrector' ? ['review'] : [])]);
  const p = proposal.provenance;
  exact(p, ['actorId','executionRef','model','effort','role','contextMode','inputDigest', ...(role === 'corrector' ? ['authorDigest'] : [])]);
  if (!['author','corrector'].includes(role) || p.role !== role || p.model !== 'gpt-6-astra' || p.effort !== 'low' || p.contextMode !== 'fresh' || !p.actorId?.trim() || !p.executionRef?.trim() || p.inputDigest !== context.digest) throw new Error('INVALID_PROVENANCE_OR_INPUT');
  if (role === 'corrector' && (!author || p.authorDigest !== digest(author) || p.actorId === author.provenance.actorId || p.executionRef === author.provenance.executionRef)) throw new Error('CORRECTOR_SOURCE_OR_ACTOR_MISMATCH');
  if (role === 'corrector') {
    exact(proposal.review, ['factualCheck', 'warningResponses']);
    if (typeof proposal.review.factualCheck !== 'string' || !proposal.review.factualCheck.trim() || !Array.isArray(proposal.review.warningResponses)) throw new Error('REVIEW_REQUIRED');
    for (const response of proposal.review.warningResponses) {
      exact(response, ['code','response']);
      if (!response.code?.trim() || !response.response?.trim()) throw new Error('WARNING_RESPONSE_REQUIRED');
    }
  }
  const c = context.payload, allowed = c.plan.payload.allowedSlots[c.trainerId];
  if (digest(c.plan.payload) !== c.plan.digest || digest(allowed) !== digest(c.allowedSlots) || !allowed?.length) throw new Error('UNAUTHORIZED_SLOTS');
  if (!Array.isArray(proposal.replacements) || proposal.replacements.length !== allowed.length) throw new Error('EXACT_REPLACEMENT_SLOTS_REQUIRED');
  const submission = rawSubmission(c.originalTrainer), seen = new Set();
  for (const {variant,slot,member,...rest} of proposal.replacements) {
    if (Object.keys(rest).length || !Number.isInteger(slot) || !allowed.includes(`${variant}${slot}`) || seen.has(`${variant}${slot}`)) throw new Error('UNAUTHORIZED_OR_DUPLICATE_SLOT');
    seen.add(`${variant}${slot}`);
    exact(member, ['species','level','akiRole','moves','nature','ability','item','intent']);
    const before = c.originalTrainer.variants[variant].members[slot-1];
    if (before.akiRole === 'A' || member.akiRole !== before.akiRole || member.level !== before.level) throw new Error('FROZEN_ROLE_LEVEL_OR_ANCHOR');
    if (member.species === before.species) throw new Error('REPLACEMENT_SPECIES_REQUIRED');
    submission.variants[variant].members[slot-1] = structuredClone(member);
  }
  exact(proposal.variantNotes, [...new Set(allowed.map(k => k[0]))]);
  for (const [variant, notes] of Object.entries(proposal.variantNotes)) {
    exact(notes, ['strategy','orderRationale']);
    Object.assign(submission.variants[variant], structuredClone(notes));
  }
  return submission;
}
export function projectedSnapshot(trainers, plan, completed = [], replacement) {
  const normalized = normalizeEntries(trainers.map(trainer => replacement?.trainerId === trainer.trainerId ? replacement : trainer));
  const done = new Set([...completed, ...(replacement ? [replacement.trainerId] : [])]);
  for (const trainer of normalized) if (!done.has(trainer.trainerId)) for (const [letter, owners] of Object.entries(trainer.variants)) {
    trainer.variants[letter] = owners.filter(owner => !owner.slots.every(s => plan.payload.allowedSlots[trainer.trainerId]?.includes(`${letter}${s.slot}`)));
  }
  return {scope:'PROJECTED_PENDING_REMOVALS', trainers:normalized};
}
const findingKey = f => `${f.code}:${f.branch}:${f.family}:${f.playerStarterFamily ?? ''}`;
export function inheritedFinding(context, finding) {
  const c = context.payload;
  if (finding.code !== 'LOT_FAMILY_TRAINER_LIMIT' || !c.baselineValidation.errors.some(f => findingKey(f) === findingKey(finding))) return false;
  const pending = c.trainers.filter(t => t.trainerId !== c.trainerId && !c.completed.includes(t.trainerId) && t.lotId === c.originalTrainer.lotId);
  return pending.some(t => (c.plan.payload.allowedSlots[t.trainerId] ?? []).some(key => key[0] === finding.branch && t.variants[key[0]].members[Number(key.slice(1))-1].family === finding.family));
}
export function evaluate(context, proposal, catalogs, options = {}) {
  const submission = restrictProposal(context, proposal, options), c = context.payload;
  const validation = validateSubmission(c.engineContext, submission, catalogs);
  const blockers = validation.errors.filter(f => !inheritedFinding(context, f));
  if (blockers.length) throw Object.assign(new Error('WINDOW_REPAIR_INVALID'), {findings:blockers});
  const normalized = materialize(validation.ok ? c.engineContext : c.isolatedContext, submission, catalogs);
  const updatedTrainer = mergeNormalized(context, proposal, normalized);
  const projected = auditSnapshot(projectedSnapshot(c.trainers, c.plan, c.completed, updatedTrainer));
  if (projected.windows.some(w => !w.ok)) throw Object.assign(new Error('PROJECTED_WINDOW_EXCESS'), {findings:projected.windows.flatMap(w=>w.excesses)});
  if (proposal.provenance.role === 'corrector') {
    const responded = new Set(proposal.review.warningResponses.map(r=>r.code));
    if (validation.warnings.some(w => !responded.has(`${w.code}:${w.path}`))) throw new Error('UNANSWERED_WARNING');
  }
  return {updatedTrainer, validation:{ok:validation.ok,errors:validation.errors,warnings:validation.warnings}, projected,
    pendingInheritedFindings:validation.errors.filter(f=>inheritedFinding(context,f))};
}
export async function applyWindowRevision({projectRoot, originalTrainer, basePublicationDigest}) {
  const folder = path.join(projectRoot, BASE, 'published');
  let index;
  try { index = await readSealed(path.join(folder,'index.json')); } catch (e) { if(e.code==='ENOENT') return null; throw e; }
  const pinned = index.payload.entries[originalTrainer.trainerId];
  if (!pinned) return null;
  const revision = await readSealed(path.join(folder,`${originalTrainer.trainerId}.json`)), r = revision.payload;
  const plan = await readSealed(path.join(projectRoot,BASE,'plan.json'));
  if (r.context?.payload?.plan?.digest !== plan.digest) throw new Error('WINDOW_REVISION_PLAN_MISMATCH');
  if (revision.digest !== pinned || r.basePublicationDigest !== basePublicationDigest || r.presentationDigest !== digest(originalTrainer) || r.trainerId !== originalTrainer.trainerId) throw new Error('WINDOW_REVISION_BASELINE_MISMATCH');
  if (r.context.digest !== digest(r.context.payload) || digest(r.context.payload.originalTrainer) !== r.presentationDigest) throw new Error('WINDOW_REVISION_CONTEXT_MISMATCH');
  restrictProposal(r.context,r.author,{role:'author'});
  restrictProposal(r.context,r.corrector,{role:'corrector',author:r.author});
  const updatedTrainer = mergeNormalized(r.context,r.corrector,r.updatedTrainer);
  if (digest(updatedTrainer)!==digest(r.updatedTrainer)) throw new Error('WINDOW_REVISION_UNAUTHORIZED_CHANGE');
  return {updatedTrainer,revisionDigest:revision.digest};
}
