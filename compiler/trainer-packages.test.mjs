import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { createSeedPlan } from './seed-plan.mjs';
import { choosePackageIndex, chooseWeightedPackageIndex, readTrainerPackages, selectTrainerPackage, validateTrainerPackages } from './trainer-packages.mjs';
import { readReviewedTrainerExports, selectReviewedTrainers } from './selected-trainers.mjs';
import { buildBeta5Fauna } from './fauna-beta5.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const campaign = JSON.parse(await readFile(path.join(root, 'wiki/trainer-authoring/v7/plan/windows.generated.json'), 'utf8'));
const { data } = await readTrainerPackages(root, campaign.trainerLots);

test('frozen packages retain all original options and 714 distinct assignments', () => {
  const entries = Object.values(data.library);
  assert.equal(entries.reduce((n, { banks }) => n + new Set(banks.flat()).size, 0), 714);
  assert.equal(entries.filter(({ banks }) => new Set(banks.flat()).size > 3).length, 34);
  assert.equal(entries.filter(({ banks }) => new Set(banks.flat()).size >= 12).length, 27);
  assert.equal(entries.reduce((n, { trainers }) => n + trainers.length, 0), 453);
});

test('saved weights and production sampling reproduce the 10,000-seed experiment', () => {
  const template = { lotId: '02A', variant: 'A', selectionScope: 'lot', selectionId: '02A' };
  for (let run = 0; run < 10000; run += 1) {
    const seed = `trainer-selection-sim-${run}`;
    for (const [lotId, { banks, weights }] of Object.entries(data.library)) for (let base = 0; base < 3; base++) {
      const size = weights[base].reduce((sum, value) => sum + value, 0);
      const bytes = createHash('sha256').update(`deksa-weighted-packages-v2\0${seed}\0${lotId}`).digest();
      const limit = Math.floor(0x100000000 / size) * size;
      const words = Array.from({ length: 8 }, (_, index) => bytes.readUInt32LE(index * 4));
      const accepted = words.find(value => value < limit);
      assert.notEqual(accepted, undefined);
      let ticket = accepted % size, expected = 0;
      while (ticket >= weights[base][expected]) ticket -= weights[base][expected++];
      assert.equal(chooseWeightedPackageIndex(seed, lotId, weights[base]), expected);
      const picked = selectTrainerPackage(seed, { ...template, lotId, variant: 'ABC'[base] }, data.library);
      assert.equal(picked.packageIndex, expected);
      assert.equal(Object.values(picked.trainerVariants).join(''), banks[base][expected]);
    }
  }
  const first = selectTrainerPackage('repeatable', template, data.library);
  assert.deepEqual(first, selectTrainerPackage('repeatable', template, data.library));
});

test('unweighted legacy sampling stays unchanged and weighted sampling follows saved chances', () => {
  let heavy = 0;
  for (let i = 0; i < 10000; i++) {
    const seed = `weighted-test-${i}`;
    const bytes = createHash('sha256').update(`precomputed-mix-experiment\0${seed}\0test`).digest();
    for (let size = 1; size <= 4; size++) {
      const expected = [...bytes].find(byte => byte < Math.floor(256 / size) * size) % size;
      assert.equal(choosePackageIndex(seed, 'test', size), expected);
    }
    heavy += Number(chooseWeightedPackageIndex(seed, 'test', [1, 3]) === 1);
  }
  assert.ok(heavy > 7300 && heavy < 7700);
  assert.throws(() => chooseWeightedPackageIndex('seed', 'test', [0, 3]));
});

test('every trainer retains near-equal A/B/C chances; deliberate bias is rejected', () => {
  const broken = structuredClone(data);
  const lot = broken.library['04E'];
  const uniformA = 'A'.repeat(lot.trainers.length);
  lot.weights = lot.banks.map(bank => bank.map(assignment => assignment === uniformA ? 1000000 : 1));
  assert.throws(() => validateTrainerPackages(broken, campaign.trainerLots), /biased variant probabilities/);
  let different = 0, trainers = 0;
  for (const lot of Object.values(data.library)) for (let index = 0; index < lot.trainers.length; index++) {
    if (lot.trainers[index] === 'rival-oak') continue;
    const probabilities = [0, 0, 0];
    for (let base = 0; base < 3; base++) {
      const total = lot.weights[base].reduce((sum, value) => sum + value, 0);
      for (let assignment = 0; assignment < lot.banks[base].length; assignment++) {
        probabilities['ABC'.indexOf(lot.banks[base][assignment][index])] += lot.weights[base][assignment] / (3 * total);
      }
    }
    assert.ok(probabilities.every(p => p >= 0.2499 && p <= 0.4168));
    different += 1 - probabilities.reduce((sum, p) => sum + p * p, 0);
    trainers++;
  }
  assert.equal(trainers, 452);
  assert.ok(different / trainers > 0.66);
});

test('mixed variants reach actual trainer parties, without altering teams or continuity', async () => {
  const plan = await createSeedPlan('prueba');
  const exports = await readReviewedTrainerExports(root);
  const selected = selectReviewedTrainers(plan, exports);
  const originals = new Map(exports.flatMap(source => source.materializedTeams).map(trainer => [trainer.trainerId, trainer]));
  let changed = 0;
  for (const trainer of selected.trainers) {
    const lot = plan.lots.find(item => item.lotId === trainer.lotId);
    assert.deepEqual(trainer.party, originals.get(trainer.trainerId).variants[trainer.variant]);
    if (trainer.variant !== lot.variant) changed += 1;
    if (lot.selectionScope === 'continuity') assert.equal(trainer.variant, lot.variant);
  }
  assert.ok(changed > 0, 'Fixture must exercise a non-uniform package');
  assert.equal(selected.trainers.length, 452);
  const stale = structuredClone(exports);
  stale[0].materializedTeams[0].variants.A.members[0].level += 1;
  assert.throws(() => selectReviewedTrainers(plan, stale), /Trainer data changed/);
  const missing = structuredClone(plan);
  delete missing.lots.find(lot => lot.lotId === selected.trainers[0].lotId).trainerVariants[selected.trainers[0].trainerId];
  assert.throws(() => selectReviewedTrainers(missing, exports), /missing packaged team selection/);
});

test('invalid libraries and continuity mixing fail closed', () => {
  const broken = structuredClone(data);
  broken.library['02A'].banks[0][1] = 'D'.repeat(broken.library['02A'].trainers.length);
  assert.throws(() => validateTrainerPackages(broken, campaign.trainerLots), /invalid team variant/);
  assert.throws(() => selectTrainerPackage('seed', {
    lotId: '02A', variant: 'A', selectionScope: 'continuity',
  }, data.library), /continuity lot/);
});

test('trainer package integration preserves the existing fauna for the same seed', async () => {
  const result = await buildBeta5Fauna('deksa-package-integration-01', root);
  assert.equal(result.inputs.seedPlan.faunaSeed, '5790d4005a6a876fd67efcf4bfbc04a9adb44053e46461f790a3b7d8fb1c25e9');
  const digest = createHash('sha256').update(JSON.stringify(result.distribution.tables)).digest('hex');
  assert.equal(digest, 'e0e6a5a0f404b9cbd3114632744273f54d0ca235178575b72955a85c8932a3d3');
});
