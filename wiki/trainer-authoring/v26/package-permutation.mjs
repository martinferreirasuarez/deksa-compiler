import { createHash } from 'node:crypto';

export const PACKAGE_PERMUTATION = Object.freeze({
  decisionId: 'D-248', trainerId: 'rival-route-22',
  publicationPath: 'wiki/trainer-authoring/v21/published/b4-d243-rival-route22-001.json',
  acceptancePath: 'wiki/trainer-authoring/v21/accepted/trainers/rival-route-22.json',
  publicationDigest: '068704bcfe6ad6414720021c269d19e858f75b5a9c2f3f1f5c79c43574309944',
  acceptanceDigest: '226e51be200aa898c61a4c9596852e9986de73e48ee14d138c9b61d604ac9d4d',
  mapping: Object.freeze({ A: 'B', B: 'A', C: 'C' }),
});
const canonical = value => JSON.stringify(value, (_, item) => item && typeof item === 'object' && !Array.isArray(item)
  ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item);

// Call only after verifying the original publication and acceptance seals.
export function applyPackagePermutation({ trainer, publicationDigest, acceptanceDigest }) {
  if (trainer?.trainerId !== PACKAGE_PERMUTATION.trainerId || publicationDigest !== PACKAGE_PERMUTATION.publicationDigest
    || acceptanceDigest !== PACKAGE_PERMUTATION.acceptanceDigest) throw new Error('PACKAGE_PERMUTATION_SOURCE_MISMATCH');
  if (!trainer.variants || Object.keys(trainer.variants).sort().join() !== 'A,B,C'
    || Object.values(trainer.variants).some(variant => !variant || typeof variant !== 'object' || Array.isArray(variant))) {
    throw new Error('PACKAGE_PERMUTATION_VARIANTS_REQUIRED');
  }
  const evidence = structuredClone(PACKAGE_PERMUTATION);
  evidence.evidenceDigest = createHash('sha256').update(canonical(evidence)).digest('hex');
  return { trainer: { ...structuredClone(trainer), variants: Object.fromEntries(Object.entries(PACKAGE_PERMUTATION.mapping)
    .map(([target, source]) => [target, structuredClone(trainer.variants[source])])) }, evidence };
}
