import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';

export const BASE = 'wiki/trainer-authoring/item-revisions/v1';
export const digest = value => createHash('sha256').update(JSON.stringify(value, (_, v) => v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) : v)).digest('hex');
export const seal = payload => ({ digest: digest(payload), payload });
export async function readSealed(file) {
  const envelope = JSON.parse(await fs.readFile(file, 'utf8'));
  if (!envelope.payload || envelope.digest !== digest(envelope.payload)) throw new Error(`INVALID_SEAL: ${file}`);
  return envelope;
}
const exact = (v, keys) => {
  if (!v || typeof v !== 'object' || Array.isArray(v) || Object.keys(v).sort().join() !== [...keys].sort().join()) throw new Error(`INVALID_FIELDS: expected ${keys.join(',')}`);
};
export function materializeItems(context, proposal, { role = proposal?.provenance?.role, author } = {}) {
  exact(proposal, ['provenance', 'variants']);
  exact(proposal.provenance, ['actorId', 'executionRef', 'model', 'effort', 'role', 'contextMode', 'inputDigest', ...(role === 'corrector' ? ['authorDigest'] : [])]);
  const p = proposal.provenance;
  if (!['author', 'corrector'].includes(role) || p.role !== role || p.model !== 'gpt-6-astra' || p.effort !== 'low' || p.contextMode !== 'fresh' || !p.actorId?.trim() || !p.executionRef?.trim() || p.inputDigest !== context.digest) throw new Error('INVALID_PROVENANCE_OR_INPUT');
  if (role === 'corrector' && (!author || p.authorDigest !== digest(author) || p.actorId === author.provenance.actorId || p.executionRef === author.provenance.executionRef)) throw new Error('CORRECTOR_SOURCE_OR_ACTOR_MISMATCH');
  exact(proposal.variants, ['A', 'B', 'C']);
  const c = context.payload;
  const result = structuredClone(c.originalTrainer);
  const menu = new Map(c.legalHeldMenu.map(item => [item.name, item]));
  function assignment(member, choice) {
    exact(choice, ['item', 'reason']);
    if (typeof choice.reason !== 'string' || !choice.reason.trim()) throw new Error('REASON_REQUIRED');
    if (choice.item !== null && (!menu.has(choice.item) || menu.get(choice.item).windowOrdinal > c.itemHorizon)) throw new Error('ILLEGAL_ITEM_OR_HORIZON');
    member.item = choice.item === null ? null : structuredClone(menu.get(choice.item));
    member.itemRevisionReason = choice.reason;
  }
  function party(members) {
    const items = members.map(m => m.item?.itemId).filter(Boolean);
    if (new Set(items).size !== items.length) throw new Error('DUPLICATE_ITEM');
    if (items.length > c.maxHeldItems) throw new Error('PROFILE_ITEM_MAXIMUM');
  }
  for (const label of ['A', 'B', 'C']) {
    const v = result.variants[label], choices = proposal.variants[label];
    if (!Array.isArray(choices) || choices.length !== 6 || v.members.length !== 6) throw new Error('SIX_SLOTS_REQUIRED');
    for (let i = 0; i < 6; i++) {
      if (v.members[i].starterSets) {
        if (i !== 5 || !v.branches) throw new Error('INVALID_STARTER_BASELINE');
        exact(choices[i], ['starterItems']);
        exact(choices[i].starterItems, Object.keys(v.members[i].starterSets));
        for (const [starter, set] of Object.entries(v.members[i].starterSets)) assignment(set, choices[i].starterItems[starter]);
      } else assignment(v.members[i], choices[i]);
    }
    if (v.branches) {
      for (const branch of Object.values(v.branches)) {
        for (let i = 0; i < 5; i++) assignment(branch.members[i], choices[i]);
        const starter = branch.rivalStarterFamily;
        if (branch.members[5].family !== starter || !v.members[5].starterSets[starter]) throw new Error('INVALID_PHYSICAL_STARTER_MAPPING');
        assignment(branch.members[5], choices[5].starterItems[starter]);
        party(branch.members);
      }
    } else party(v.members);
  }
  return result;
}
export async function applyItemRevision({ projectRoot, originalTrainer, basePublicationDigest }) {
  const folder = path.join(projectRoot, BASE, 'published');
  let index;
  try { index = await readSealed(path.join(folder, 'index.json')); } catch (e) { if (e.code === 'ENOENT') return null; throw e; }
  const pinned = index.payload.entries[originalTrainer.trainerId];
  if (!pinned) return null;
  const revision = await readSealed(path.join(folder, `${originalTrainer.trainerId}.json`));
  const r = revision.payload;
  if (pinned !== revision.digest || r.basePublicationDigest !== basePublicationDigest || r.presentationDigest !== digest(originalTrainer)) throw new Error('ITEM_REVISION_BASELINE_MISMATCH');
  if (r.context.digest !== digest(r.context.payload) || r.context.payload.presentationDigest !== r.presentationDigest || digest(r.context.payload.originalTrainer) !== r.presentationDigest) throw new Error('ITEM_REVISION_CONTEXT_MISMATCH');
  materializeItems(r.context, r.author, { role: 'author' });
  const updatedTrainer = materializeItems(r.context, r.corrector, { role: 'corrector', author: r.author });
  if (digest(updatedTrainer) !== digest(r.updatedTrainer)) throw new Error('ITEM_REVISION_NONITEM_CHANGE');
  return { updatedTrainer, revisionDigest: revision.digest };
}
