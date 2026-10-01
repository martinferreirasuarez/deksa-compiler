import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { AUDITED_REFERENCES, EXTERNAL_REVIEW_REFERENCES } from '../../v26/workflow.mjs';
import { buildContext, loadCatalogs } from '../../v26/engine.mjs';
import { PACKAGE_PERMUTATION, applyPackagePermutation } from '../../v26/package-permutation.mjs';
import { projectTrainerItems } from '../../item-clause.mjs';
import { BASE, digest, seal, readSealed, materializeItems } from './reader.mjs';

export async function baseline(projectRoot, trainerId) {
  const reference = [...AUDITED_REFERENCES, ...EXTERNAL_REVIEW_REFERENCES].find(r => r.trainerId === trainerId && r.lotId === '01A');
  if (!reference) throw new Error('TRAINER_NOT_IN_01A_REFERENCES');
  const publication = await readSealed(path.join(projectRoot, reference.publicationPath));
  if (publication.digest !== reference.publicationDigest || publication.payload.trainer.trainerId !== trainerId) throw new Error('BASE_PUBLICATION_MISMATCH');
  let trainer = publication.payload.trainer;
  if (trainerId === PACKAGE_PERMUTATION.trainerId) {
    const acceptance = await readSealed(path.join(projectRoot, PACKAGE_PERMUTATION.acceptancePath));
    trainer = applyPackagePermutation({ trainer, publicationDigest: publication.digest, acceptanceDigest: acceptance.digest }).trainer;
  }
  return { reference, originalTrainer: projectTrainerItems(trainer) };
}
async function writeNew(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' });
}
export async function prepare(projectRoot, trainerId) {
  const { reference, originalTrainer } = await baseline(projectRoot, trainerId);
  const catalogs = await loadCatalogs(projectRoot);
  const current = await buildContext({ projectRoot, trainerId }, catalogs);
  const context = seal({ schemaVersion: 1, trainerId, basePublicationDigest: reference.publicationDigest,
    basePublicationPath: reference.publicationPath, presentationDigest: digest(originalTrainer),
    profile: current.contract.profile, maxHeldItems: current.contract.maxHeldItems, itemHorizon: current.contract.horizons.items,
    legalHeldMenu: current.legalMenu.heldItems, originalTrainer });
  const file = path.join(projectRoot, BASE, 'contexts', `${trainerId}.json`);
  try { await writeNew(file, context); } catch (e) {
    if (e.code !== 'EEXIST') throw e;
    if ((await readSealed(file)).digest !== context.digest) throw new Error('EXISTING_CONTEXT_CHANGED');
  }
  await fs.mkdir(path.join(projectRoot, BASE, 'drafts'), { recursive: true });
  return { contextPath: file, inputDigest: context.digest };
}
async function checkedContext(projectRoot, trainerId) {
  const context = await readSealed(path.join(projectRoot, BASE, 'contexts', `${trainerId}.json`));
  const { reference, originalTrainer } = await baseline(projectRoot, trainerId);
  if (context.payload.trainerId !== trainerId || context.payload.basePublicationDigest !== reference.publicationDigest || context.payload.presentationDigest !== digest(originalTrainer) || digest(context.payload.originalTrainer) !== digest(originalTrainer)) throw new Error('CONTEXT_BASELINE_MISMATCH');
  return context;
}
export async function preview(projectRoot, trainerId, proposal, author) {
  const context = await checkedContext(projectRoot, trainerId);
  if (author) materializeItems(context, author, { role: 'author' });
  materializeItems(context, proposal, { author });
  return { valid: true, proposalDigest: digest(proposal), inputDigest: context.digest };
}
export async function publish(projectRoot, trainerId, author, corrector) {
  const context = await checkedContext(projectRoot, trainerId);
  materializeItems(context, author, { role: 'author' });
  const updatedTrainer = materializeItems(context, corrector, { role: 'corrector', author });
  const revision = seal({ schemaVersion: 1, trainerId, status: 'ITEM_REVIEW', accepted: false,
    basePublicationDigest: context.payload.basePublicationDigest, presentationDigest: context.payload.presentationDigest,
    context, author, corrector, updatedTrainer });
  const folder = path.join(projectRoot, BASE, 'published');
  let index = { entries: {} };
  try { index = (await readSealed(path.join(folder, 'index.json'))).payload; } catch (e) { if (e.code !== 'ENOENT') throw e; }
  if (index.entries[trainerId]) throw new Error('REVISION_ALREADY_PUBLISHED');
  await writeNew(path.join(folder, `${trainerId}.json`), revision);
  index.entries[trainerId] = revision.digest;
  await fs.writeFile(path.join(folder, 'index.json'), `${JSON.stringify(seal(index), null, 2)}\n`);
  return { publicationPath: path.join(folder, `${trainerId}.json`), revisionDigest: revision.digest, status: 'ITEM_REVIEW' };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const [command, ...args] = process.argv.slice(2);
    const options = Object.fromEntries(Array.from({ length: args.length / 2 }, (_, i) => [args[i * 2].replace(/^--/, ''), args[i * 2 + 1]]));
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
    const read = async file => JSON.parse(await fs.readFile(file, 'utf8'));
    const result = command === 'prepare' ? await prepare(root, options.trainer)
      : command === 'preview' ? await preview(root, options.trainer, await read(options.input), options.author ? await read(options.author) : undefined)
        : command === 'publish' ? await publish(root, options.trainer, await read(options.author), await read(options.corrector))
          : (() => { throw new Error('Commands: prepare --trainer ID | preview --trainer ID --input FILE [--author FILE] | publish --trainer ID --author FILE --corrector FILE'); })();
    console.log(JSON.stringify(result, null, 2));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
