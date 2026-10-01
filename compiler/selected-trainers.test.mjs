import assert from 'node:assert/strict';
import { test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSeedPlan } from './seed-plan.mjs';
import { readReviewedTrainerExports, selectReviewedTrainers } from './selected-trainers.mjs';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('proyecta W01–W08 sin alterar los exports ni inventar entrenadores', async () => {
  const seedPlan = await createSeedPlan('deksa-beta4-wiki-20260910-d5e1cc77');
  const exports = await readReviewedTrainerExports(projectRoot, 8);
  const selected = selectReviewedTrainers(seedPlan, exports);
  const repeated = selectReviewedTrainers(seedPlan, exports);
  assert.equal(selected.trainers.length, 358);
  assert.equal(selected.trainerDigest, repeated.trainerDigest);
  assert.equal(new Set(selected.trainers.map(({ trainerId }) => trainerId)).size, 358);
  for (const trainer of selected.trainers) {
    assert.equal(trainer.variant, seedPlan.lots.find(({ lotId }) => lotId === trainer.lotId).trainerVariants[trainer.trainerId]);
  }
  const otherSeed = await createSeedPlan('otra-seed');
  assert.notEqual(selected.trainerDigest, selectReviewedTrainers(otherSeed, exports).trainerDigest);
});

test('rechaza una ventana no revisada y partidos incompletos', async () => {
  const plan = await createSeedPlan('prueba');
  assert.throws(() => selectReviewedTrainers(plan, [{ reviewed: false, materializedTeams: [] }]));
  assert.throws(() => selectReviewedTrainers(plan, [{
    reviewed: true,
    materializedTeams: [{ trainerId: 'incompleto', lotId: '01A', profile: 'COMUN', cap: 14,
      variants: { A: { members: [] }, B: { members: [] }, C: { members: [] } } }],
  }]));
});
