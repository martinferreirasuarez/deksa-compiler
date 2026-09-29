import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { requireTrainerRoster } from './build-gate.mjs';
import { buildBeta5Fauna } from './fauna-beta5.mjs';
import { createSeedPlan } from './seed-plan.mjs';
import { readReviewedTrainerExports, selectReviewedTrainers } from './selected-trainers.mjs';

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// The ROM writer will consume this single, frozen-for-the-seed input package.
// A partial preview is useful while W09–W12 are still being authored, but it
// must never be mistaken for a complete, compilable game.
export async function buildCompilationInputs(seed, {
  projectRoot = PROJECT_ROOT,
  throughWindow = 12,
  preview = false,
} = {}) {
  assert.ok(Number.isInteger(throughWindow) && throughWindow >= 1 && throughWindow <= 12);
  if (!preview) {
    assert.equal(throughWindow, 12, 'Una compilación final requiere W01–W12');
    await requireTrainerRoster(projectRoot);
  }

  const seedPlan = await createSeedPlan(seed, projectRoot);
  const exports = await readReviewedTrainerExports(projectRoot, throughWindow);
  const trainers = selectReviewedTrainers(seedPlan, exports);
  if (!preview) assert.equal(trainers.trainers.length, 452, 'El roster final debe tener 452 entrenadores');
  const fauna = await buildBeta5Fauna(seed, projectRoot);
  assert.equal(fauna.inputs.seedPlan.fingerprint, seedPlan.fingerprint);
  assert.equal(fauna.inputs.seedPlan.faunaSeed, seedPlan.faunaSeed);
  assert.equal(fauna.distribution.tables.length, 315);
  assert.equal(fauna.distribution.metrics.coverage.slots, 2065);
  assert.deepEqual(fauna.distribution.metrics.coverage.unassignedWildFamilies, []);
  assert.equal(fauna.distribution.metrics.levelMaterialization.capViolations, 0);

  return {
    schemaVersion: 1,
    status: preview ? 'preview-only' : 'ready-for-rom-writer',
    seedPlan,
    throughWindow,
    trainers,
    fauna: fauna.distribution,
    faunaDecisions: fauna.inputs.decisions,
    sourceHashes: fauna.inputs.sourceHashes,
  };
}
