import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { AUDITED_REFERENCES, EXTERNAL_REVIEW_REFERENCES } from '../../v26/workflow.mjs';
import { baseline as itemBaseline } from '../../item-revisions/v1/runner.mjs';
import { applyItemRevision } from '../../item-revisions/v1/reader.mjs';
import { PACKAGE_PERMUTATION } from '../../v26/package-permutation.mjs';
import { loadCatalogs, buildContext, validateSubmission, lotFamilyGlobalFindings } from '../../v27/engine.mjs';
import { queryContext } from '../../v27/query.mjs';
import { BASE, ALLOWED_SLOTS, digest, seal, readSealed, applyFamilyRevision, rawSubmission, evaluate } from './reader.mjs';

const references = [...AUDITED_REFERENCES, ...EXTERNAL_REVIEW_REFERENCES].filter(r => r.lotId === '01A');
async function writeNew(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' });
}
export async function currentEntries(projectRoot) {
  return Promise.all(references.map(async reference => {
    const base = await itemBaseline(projectRoot, reference.trainerId);
    const items = await applyItemRevision({ projectRoot, originalTrainer: base.originalTrainer, basePublicationDigest: reference.publicationDigest });
    if (!items) throw new Error(`ITEM_REVISION_REQUIRED: ${reference.trainerId}`);
    const family = await applyFamilyRevision({ projectRoot, originalTrainer: items.updatedTrainer, baseItemRevisionDigest: items.revisionDigest });
    const acceptanceDigest = reference.acceptanceDigest ?? (await readSealed(path.join(projectRoot, PACKAGE_PERMUTATION.acceptancePath))).digest;
    return { trainerId: reference.trainerId, publicationDigest: reference.publicationDigest, acceptanceDigest,
      itemRevisionDigest: items.revisionDigest, familyRevisionDigest: family?.revisionDigest ?? null,
      itemTrainer: items.updatedTrainer, trainer: family?.updatedTrainer ?? items.updatedTrainer };
  }));
}
export function lotInputs(entries, excludedTrainerId) {
  const ledgers = { A: [], B: [], C: [] }, currentLotTeams = { A: [], B: [], C: [] };
  for (const entry of entries.filter(e => e.trainerId !== excludedTrainerId)) for (const variant of ['A', 'B', 'C']) {
    const v = entry.trainer.variants[variant], parties = v.branches ? Object.values(v.branches) : [v];
    ledgers[variant].push({ trainerId: entry.trainerId, families: [...new Set(parties.flatMap(p => p.members.map(m => m.family)))] });
    for (const party of parties) currentLotTeams[variant].push({ trainerId: entry.trainerId, profile: entry.trainer.profile,
      publicationDigest: entry.publicationDigest, acceptanceDigest: entry.acceptanceDigest,
      ...(party.playerStarterFamily ? { playerStarterFamily: party.playerStarterFamily, rivalStarterFamily: party.rivalStarterFamily } : {}),
      members: structuredClone(party.members) });
  }
  return { ledgers, currentLotTeams };
}
const pins = entries => entries.map(e => ({ trainerId: e.trainerId, publicationDigest: e.publicationDigest,
  acceptanceDigest: e.acceptanceDigest, itemRevisionDigest: e.itemRevisionDigest, familyRevisionDigest: e.familyRevisionDigest }));
export async function makeContext(projectRoot, trainerId) {
  if (!ALLOWED_SLOTS[trainerId]) throw new Error('UNAUTHORIZED_TRAINER');
  const entries = await currentEntries(projectRoot), target = entries.find(e => e.trainerId === trainerId);
  if (target.familyRevisionDigest) throw new Error('REVISION_ALREADY_PUBLISHED');
  const catalogs = await loadCatalogs(projectRoot);
  const engineContext = await buildContext({ projectRoot, trainerId, ...lotInputs(entries, trainerId) }, catalogs);
  const isolatedContext = await buildContext({ projectRoot, trainerId }, catalogs);
  const originalTrainer = target.itemTrainer, result = validateSubmission(engineContext, rawSubmission(originalTrainer), catalogs);
  const baselineValidation = { ok: result.ok, errors: result.errors, warnings: result.warnings };
  return seal({ schemaVersion: 1, trainerId, allowedSlots: ALLOWED_SLOTS[trainerId],
    contractPaths: ['TRAINER_FAMILY_RECURRENCE.md', `${BASE}/SKILL.md`],
    sourcePins: pins(entries), baseItemRevisionDigest: target.itemRevisionDigest,
    presentationDigest: digest(originalTrainer), originalTrainer, engineContext, isolatedContext, baselineValidation });
}
export async function prepare(projectRoot, trainerId) {
  const context = await makeContext(projectRoot, trainerId), file = path.join(projectRoot, BASE, 'contexts', `${trainerId}.json`);
  try { await writeNew(file, context); } catch (e) {
    if (e.code !== 'EEXIST') throw e;
    if ((await readSealed(file)).digest !== context.digest) throw new Error('EXISTING_CONTEXT_CHANGED');
  }
  await fs.mkdir(path.join(projectRoot, BASE, 'drafts'), { recursive: true });
  return { contextPath: file, inputDigest: context.digest, allowedSlots: context.payload.allowedSlots,
    baselineValidation: context.payload.baselineValidation };
}
async function checkedContext(projectRoot, trainerId) {
  const context = await readSealed(path.join(projectRoot, BASE, 'contexts', `${trainerId}.json`));
  if (context.digest !== (await makeContext(projectRoot, trainerId)).digest) throw new Error('CONTEXT_CHANGED: prepare and review against current sequential publications');
  return context;
}
export async function preview(projectRoot, trainerId, proposal, author) {
  const context = await checkedContext(projectRoot, trainerId), catalogs = await loadCatalogs(projectRoot);
  if (author) evaluate(context, author, catalogs, { role: 'author' });
  const result = evaluate(context, proposal, catalogs, { author });
  return { valid: true, proposalDigest: digest(proposal), inputDigest: context.digest,
    validation: result.validation, pendingInheritedFindings: result.pendingInheritedFindings };
}
export async function publish(projectRoot, trainerId, author, corrector) {
  const folder = path.join(projectRoot, BASE, 'published');
  await fs.mkdir(folder, { recursive: true });
  const lock = path.join(folder, '.publish.lock'), handle = await fs.open(lock, 'wx');
  try {
    const context = await checkedContext(projectRoot, trainerId), catalogs = await loadCatalogs(projectRoot);
    const authorResult = evaluate(context, author, catalogs, { role: 'author' });
    const result = evaluate(context, corrector, catalogs, { role: 'corrector', author });
    const revision = seal({ schemaVersion: 1, trainerId, status: 'FAMILY_REVIEW', accepted: false,
      baseItemRevisionDigest: context.payload.baseItemRevisionDigest, presentationDigest: context.payload.presentationDigest,
      context, author, corrector, authorValidation: authorResult.validation, validation: result.validation,
      pendingInheritedFindings: result.pendingInheritedFindings, updatedTrainer: result.updatedTrainer });
    let index = { entries: {} };
    try { index = (await readSealed(path.join(folder, 'index.json'))).payload; } catch (e) { if (e.code !== 'ENOENT') throw e; }
    if (index.entries[trainerId]) throw new Error('REVISION_ALREADY_PUBLISHED');
    await writeNew(path.join(folder, `${trainerId}.json`), revision);
    index.entries[trainerId] = revision.digest;
    const temporary = path.join(folder, `.index-${process.pid}.json`);
    await writeNew(temporary, seal(index));
    await fs.rename(temporary, path.join(folder, 'index.json'));
    return { publicationPath: path.join(folder, `${trainerId}.json`), revisionDigest: revision.digest,
      status: 'FAMILY_REVIEW', pendingInheritedFindings: result.pendingInheritedFindings };
  } finally { await handle.close(); await fs.unlink(lock); }
}
export async function audit(projectRoot) {
  const entries = await currentEntries(projectRoot), { currentLotTeams } = lotInputs(entries);
  const findings = lotFamilyGlobalFindings(currentLotTeams);
  return { ok: findings.length === 0, findings, sourcePins: pins(entries) };
}
export async function query(projectRoot, trainerId, options = {}) {
  const context = await readSealed(path.join(projectRoot, BASE, 'contexts', `${trainerId}.json`));
  if (options.mode === 'repair') return { inputDigest: context.digest, allowedSlots: context.payload.allowedSlots,
    originalTrainer: rawSubmission(context.payload.originalTrainer), baselineValidation: context.payload.baselineValidation,
    sourcePins: context.payload.sourcePins };
  return queryContext(context.payload.engineContext, { mode: options.mode ?? (options.species ? 'species' : 'list'),
    species: typeof options.species === 'string' ? options.species.split(',') : options.species,
    level: options.level, nature: options.nature });
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const [command, ...args] = process.argv.slice(2);
    if (args.length % 2 || args.some((arg, i) => i % 2 === 0 && !arg.startsWith('--'))) throw new Error('FLAG_VALUE_PAIRS_REQUIRED');
    const options = Object.fromEntries(Array.from({ length: args.length / 2 }, (_, i) => [args[i * 2].slice(2), args[i * 2 + 1]]));
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
    const read = async file => JSON.parse(await fs.readFile(file, 'utf8'));
    const result = command === 'prepare' ? await prepare(root, options.trainer)
      : command === 'preview' ? await preview(root, options.trainer, await read(options.input), options.author ? await read(options.author) : undefined)
        : command === 'publish' ? await publish(root, options.trainer, await read(options.author), await read(options.corrector ?? options.input))
          : command === 'query' ? await query(root, options.trainer, options)
            : command === 'audit' ? await audit(root)
              : (() => { throw new Error('Commands: prepare --trainer ID | query --trainer ID [--mode repair|list|resources|identity|review-context|species] [--species slugs] [--level N] [--nature NAME] | preview --trainer ID --input FILE [--author FILE] | publish --trainer ID --author FILE --corrector FILE | audit'); })();
    console.log(JSON.stringify(result, null, 2));
  } catch (error) { console.error(JSON.stringify({ error: error.message, findings: error.findings }, null, 2)); process.exitCode = 1; }
}
