import path from 'node:path';
import { digest, seal, readSealed } from '../../item-revisions/v1/reader.mjs';
import { validateSubmission, materialize, diagnosticsForMembers } from '../../v27/engine.mjs';

export { digest, seal, readSealed };
export const BASE = 'wiki/trainer-authoring/family-revisions/v1';
export const ALLOWED_SLOTS = Object.freeze({
  'rival-route-22': ['C4', 'C5'],
  'bug-catcher-sammy': ['A5', 'C5'],
  'bug-catcher-anthony': ['B5'],
  'camper-liam': ['B6'],
  'bug-catcher-doug': ['A5', 'B5', 'C1'],
});
const exact = (v, keys) => {
  if (!v || typeof v !== 'object' || Array.isArray(v) || Object.keys(v).sort().join() !== [...keys].sort().join()) throw new Error(`INVALID_FIELDS: expected ${keys.join(',')}`);
};
const clone = structuredClone;
export function rawMember(member) {
  const set = m => ({ species: m.species, moves: m.moves.map(move => typeof move === 'string' ? move : move.name),
    nature: typeof m.nature === 'string' ? m.nature : m.nature.name, ability: m.ability,
    item: typeof m.item === 'string' ? m.item : m.item?.name ?? null, intent: clone(m.intent) });
  return member.starterSets
    ? { family: '$starter', level: member.level, akiRole: member.akiRole,
      starterSets: Object.fromEntries(Object.entries(member.starterSets).map(([family, m]) => [family, set(m)])) }
    : { ...set(member), level: member.level, akiRole: member.akiRole };
}
export function rawSubmission(trainer) {
  return { trainerId: trainer.trainerId, variants: Object.fromEntries(['A', 'B', 'C'].map(v => [v, {
    strategy: trainer.variants[v].strategy, orderRationale: trainer.variants[v].orderRationale,
    members: trainer.variants[v].members.map(rawMember),
  }])) };
}
export function restrictProposal(context, proposal, { role = proposal?.provenance?.role, author } = {}) {
  exact(proposal, ['provenance', 'replacements', 'variantNotes']);
  exact(proposal.provenance, ['actorId', 'executionRef', 'model', 'effort', 'role', 'contextMode', 'inputDigest', ...(role === 'corrector' ? ['authorDigest'] : [])]);
  const p = proposal.provenance;
  if (!['author', 'corrector'].includes(role) || p.role !== role || p.model !== 'gpt-6-astra' || p.effort !== 'low' || p.contextMode !== 'fresh' || !p.actorId?.trim() || !p.executionRef?.trim() || p.inputDigest !== context.digest) throw new Error('INVALID_PROVENANCE_OR_INPUT');
  if (role === 'corrector' && (!author || p.authorDigest !== digest(author) || p.actorId === author.provenance.actorId || p.executionRef === author.provenance.executionRef)) throw new Error('CORRECTOR_SOURCE_OR_ACTOR_MISMATCH');
  const c = context.payload, allowed = ALLOWED_SLOTS[c.trainerId];
  if (!allowed || digest(c.allowedSlots) !== digest(allowed)) throw new Error('UNAUTHORIZED_TRAINER_OR_SLOTS');
  if (!Array.isArray(proposal.replacements) || proposal.replacements.length !== allowed.length) throw new Error('EXACT_REPLACEMENT_SLOTS_REQUIRED');
  const submission = rawSubmission(c.originalTrainer), seen = new Set();
  for (const replacement of proposal.replacements) {
    exact(replacement, ['variant', 'slot', 'member']);
    const { variant, slot, member } = replacement, key = `${variant}${slot}`;
    if (!Number.isInteger(slot) || !allowed.includes(key) || seen.has(key)) throw new Error('UNAUTHORIZED_OR_DUPLICATE_SLOT');
    seen.add(key);
    exact(member, ['species', 'level', 'akiRole', 'moves', 'nature', 'ability', 'item', 'intent']);
    const original = c.originalTrainer.variants[variant].members[slot - 1];
    if (original.akiRole === 'A' || member.akiRole !== original.akiRole || member.level !== original.level) throw new Error('FROZEN_ROLE_LEVEL_OR_ANCHOR');
    if (member.species === original.species) throw new Error('REPLACEMENT_SPECIES_REQUIRED');
    submission.variants[variant].members[slot - 1] = clone(member);
  }
  const branches = [...new Set(allowed.map(key => key[0]))];
  exact(proposal.variantNotes, branches);
  for (const branch of branches) {
    exact(proposal.variantNotes[branch], ['strategy', 'orderRationale']);
    Object.assign(submission.variants[branch], clone(proposal.variantNotes[branch]));
  }
  return submission;
}
const findingKey = f => `${f.code}:${f.branch}:${f.family}:${f.playerStarterFamily ?? ''}`;
export function inheritedFinding(context, finding) {
  if (finding.code !== 'LOT_FAMILY_TRAINER_LIMIT') return false;
  const c = context.payload;
  if (!c.baselineValidation.errors.some(error => findingKey(error) === findingKey(finding))) return false;
  const variant = c.originalTrainer.variants[finding.branch];
  if (!variant) return false;
  const members = finding.playerStarterFamily ? variant.branches[finding.playerStarterFamily].members : variant.members;
  const owners = members.filter(m => m.family === finding.family && m.akiRole !== 'A');
  return owners.length > 0 && owners.every(m => !c.allowedSlots.includes(`${finding.branch}${m.slot}`));
}
export function evaluate(context, proposal, catalogs, options = {}) {
  const submission = restrictProposal(context, proposal, options), c = context.payload;
  const validation = validateSubmission(c.engineContext, submission, catalogs);
  const blockers = validation.errors.filter(f => !inheritedFinding(context, f));
  if (blockers.length) {
    const error = new Error(`FAMILY_REPAIR_INVALID: ${blockers.length} hallazgo(s)`);
    error.findings = blockers; throw error;
  }
  // The full context above enforces every gate. Only preexisting D258 errors on
  // frozen members may remain; an isolated context then obtains normalized sets.
  const normalized = materialize(validation.ok ? c.engineContext : c.isolatedContext, submission, catalogs);
  const updatedTrainer = mergeNormalized(context, proposal, normalized);
  return { updatedTrainer, validation: { ok: validation.ok, errors: validation.errors, warnings: validation.warnings },
    pendingInheritedFindings: validation.errors.filter(f => inheritedFinding(context, f)) };
}
export function mergeNormalized(context, proposal, normalized) {
  const c = context.payload, updatedTrainer = clone(c.originalTrainer);
  for (const { variant, slot } of proposal.replacements) {
    const before = c.originalTrainer.variants[variant].members[slot - 1];
    const replacement = normalized.variants[variant].members[slot - 1];
    const requested = proposal.replacements.find(r => r.variant === variant && r.slot === slot).member;
    if (digest(rawMember(replacement)) !== digest(requested) || replacement.slot !== slot) throw new Error('NORMALIZED_REPLACEMENT_MISMATCH');
    if (replacement.family === before.family) throw new Error('REPLACEMENT_FAMILY_REQUIRED');
    updatedTrainer.variants[variant].members[slot - 1] = clone(replacement);
    if (updatedTrainer.variants[variant].branches) for (const [choice, party] of Object.entries(updatedTrainer.variants[variant].branches)) {
      if (digest(normalized.variants[variant].branches[choice].members[slot - 1]) !== digest(replacement)) throw new Error('PHYSICAL_REPLACEMENT_MISMATCH');
      party.members[slot - 1] = clone(normalized.variants[variant].branches[choice].members[slot - 1]);
    }
  }
  for (const [variant, notes] of Object.entries(proposal.variantNotes)) {
    const target = updatedTrainer.variants[variant];
    Object.assign(target, clone(notes));
    if (target.branches) {
      for (const party of Object.values(target.branches)) party.diagnostics = diagnosticsForMembers(party.members);
      target.diagnostics = { parametricTemplate: true, branches: Object.fromEntries(Object.entries(target.branches).map(([choice, party]) => [choice, party.diagnostics])) };
    } else target.diagnostics = diagnosticsForMembers(target.members);
  }
  return updatedTrainer;
}
export async function applyFamilyRevision({ projectRoot, originalTrainer, baseItemRevisionDigest }) {
  const folder = path.join(projectRoot, BASE, 'published');
  let index;
  try { index = await readSealed(path.join(folder, 'index.json')); } catch (e) { if (e.code === 'ENOENT') return null; throw e; }
  const pinned = index.payload.entries[originalTrainer.trainerId];
  if (!pinned) return null;
  const revision = await readSealed(path.join(folder, `${originalTrainer.trainerId}.json`)), r = revision.payload;
  if (pinned !== revision.digest || r.trainerId !== originalTrainer.trainerId || r.baseItemRevisionDigest !== baseItemRevisionDigest || r.presentationDigest !== digest(originalTrainer)) throw new Error('FAMILY_REVISION_BASELINE_MISMATCH');
  if (r.context.digest !== digest(r.context.payload) || r.context.payload.baseItemRevisionDigest !== baseItemRevisionDigest || r.context.payload.presentationDigest !== r.presentationDigest || digest(r.context.payload.originalTrainer) !== r.presentationDigest) throw new Error('FAMILY_REVISION_CONTEXT_MISMATCH');
  restrictProposal(r.context, r.author, { role: 'author' });
  restrictProposal(r.context, r.corrector, { role: 'corrector', author: r.author });
  // Legal normalization is checked at publication. Serving verifies the seal,
  // raw proposal binding, physical copies, and exact preservation of frozen data.
  const updatedTrainer = mergeNormalized(r.context, r.corrector, r.updatedTrainer);
  if (digest(updatedTrainer) !== digest(r.updatedTrainer)) throw new Error('FAMILY_REVISION_UNAUTHORIZED_CHANGE');
  return { updatedTrainer, revisionDigest: revision.digest };
}
