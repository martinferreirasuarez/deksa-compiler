import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

export const TRAINER_PACKAGE_FILE = 'compiler/data/trainer-packages.json';
export const TRAINER_PACKAGE_SELECTOR = 'deksa-balanced-packages-v2';
const LEGACY_SELECTOR = 'deksa-balanced-packages-v1';

export function canonicalDigest(value) {
  const json = JSON.stringify(value, (_key, item) => {
    if (item && typeof item === 'object' && !Array.isArray(item)) {
      return Object.fromEntries(Object.entries(item).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0));
    }
    return item;
  });
  return createHash('sha256').update(json).digest('hex');
}

// Bind to combat data only: editing explanatory text does not invalidate a package.
export function trainerSourceDigest(source) {
  return canonicalDigest(source.materializedTeams.map(({ trainerId, lotId, profile, cap, variants }) => ({
    trainerId, lotId, profile, cap,
    variants: Object.fromEntries(Object.entries(variants).map(([letter, party]) => [letter,
      party.members ? { members: party.members } : {
        branches: Object.fromEntries(Object.entries(party.branches).map(([starter, branch]) =>
          [starter, { members: branch.members }])),
      },
    ])),
  })));
}

export function validateTrainerPackages(data, lotIds) {
  assert.equal(data.schemaVersion, 1, 'Unsupported trainer package format');
  assert.ok([TRAINER_PACKAGE_SELECTOR, LEGACY_SELECTOR].includes(data.selectorId), 'Unknown trainer package selector');
  const weighted = data.selectorId === TRAINER_PACKAGE_SELECTOR;
  assert.deepEqual(Object.keys(data.library).sort(), [...lotIds].sort(), 'Trainer package lots do not match the campaign');
  assert.equal(data.windowSources?.length, 12, 'Incomplete trainer package sources');
  const seen = new Set();
  for (const [lotId, { trainers, banks, weights }] of Object.entries(data.library)) {
    assert.ok(Array.isArray(trainers) && trainers.length > 0, `${lotId}: empty trainer package`);
    for (const id of trainers) {
      assert.equal(typeof id, 'string');
      assert.ok(!seen.has(id), `Duplicate packaged trainer: ${id}`);
      seen.add(id);
    }
    assert.equal(banks?.length, 3, `${lotId}: missing A/B/C banks`);
    for (const [index, bank] of banks.entries()) {
      assert.ok(Array.isArray(bank) && bank.length >= 1 && bank.length <= (weighted ? 24 : 4), `${lotId}: invalid package bank`);
      assert.equal(bank[0], 'ABC'[index].repeat(trainers.length), `${lotId}: original team option missing`);
      assert.equal(new Set(bank).size, bank.length, `${lotId}: duplicate package in bank`);
      for (const assignment of bank) {
        assert.equal(typeof assignment, 'string');
        assert.equal(assignment.length, trainers.length, `${lotId}: incomplete assignment`);
        assert.match(assignment, /^[ABC]+$/, `${lotId}: invalid team variant`);
      }
      if (weighted) {
        assert.equal(weights?.length, 3, `${lotId}: missing saved package weights`);
        assert.equal(weights[index]?.length, bank.length, `${lotId}: incomplete package weights`);
        assert.ok(weights[index].every(value => Number.isSafeInteger(value) && value > 0), `${lotId}: invalid package weights`);
        assert.ok(weights[index].reduce((sum, value) => sum + value, 0) <= 0x100000000, `${lotId}: excessive package weight`);
      }
    }
    if (weighted) {
      if (banks.some(bank => bank.length > 1)) {
        const options = new Map(banks[0].map((choice, index) => [choice, weights[0][index]]));
        for (let bank = 1; bank < 3; bank++) {
          assert.deepEqual([...banks[bank]].sort(), [...options.keys()].sort(), `${lotId}: baseline banks differ`);
          for (let index = 0; index < banks[bank].length; index++) assert.equal(weights[bank][index], options.get(banks[bank][index]), `${lotId}: baseline weights differ`);
        }
      }
      for (let trainer = 0; trainer < trainers.length; trainer++) {
        const probabilities = [0, 0, 0];
        for (let bank = 0; bank < 3; bank++) {
          const total = weights[bank].reduce((sum, value) => sum + value, 0);
          for (let index = 0; index < banks[bank].length; index++) {
            probabilities['ABC'.indexOf(banks[bank][index][trainer])] += weights[bank][index] / (3 * total);
          }
        }
        assert.ok(probabilities.every(p => p >= 0.2499 && p <= 0.4168), `${lotId}/${trainers[trainer]}: biased variant probabilities`);
      }
    }
  }
  assert.equal(seen.size, 453, 'Incomplete trainer package roster');
  assert.ok(seen.has('rival-oak'), 'Missing fixed prologue encounter');
  return data;
}

export async function readTrainerPackages(projectRoot, lotIds) {
  const raw = await readFile(path.join(projectRoot, TRAINER_PACKAGE_FILE), 'utf8');
  const data = validateTrainerPackages(JSON.parse(raw), lotIds);
  return { data, digest: canonicalDigest(data) };
}

export function choosePackageIndex(seed, lotId, size) {
  assert.ok(Number.isInteger(size) && size >= 1 && size <= 4);
  const framing = `precomputed-mix-experiment\0${seed}\0${lotId}`;
  const limit = Math.floor(256 / size) * size;
  for (let round = 0; ; round += 1) {
    const bytes = createHash('sha256').update(round === 0 ? framing : `${framing}\0${round}`).digest();
    for (const byte of bytes) if (byte < limit) return byte % size;
  }
}

export function chooseWeightedPackageIndex(seed, lotId, weights) {
  assert.ok(Array.isArray(weights) && weights.length > 0 && weights.every(value => Number.isSafeInteger(value) && value > 0));
  const size = weights.reduce((sum, value) => sum + value, 0);
  assert.ok(Number.isSafeInteger(size) && size <= 0x100000000);
  const limit = Math.floor(0x100000000 / size) * size;
  const framing = `deksa-weighted-packages-v2\0${seed}\0${lotId}`;
  for (let round = 0; ; round += 1) {
    const bytes = createHash('sha256').update(round === 0 ? framing : `${framing}\0${round}`).digest();
    for (let offset = 0; offset < bytes.length; offset += 4) {
      const value = bytes.readUInt32LE(offset);
      if (value >= limit) continue;
      let ticket = value % size;
      for (let index = 0; index < weights.length; index++) {
        if (ticket < weights[index]) return index;
        ticket -= weights[index];
      }
    }
  }
}

export function selectTrainerPackage(seed, lot, library) {
  const { trainers, banks, weights } = library[lot.lotId];
  const baseline = 'ABC'.indexOf(lot.variant);
  const bank = banks[baseline];
  assert.ok(bank, `${lot.lotId}: unknown baseline variant`);
  if (lot.selectionScope === 'continuity') {
    assert.equal(bank.length, 1, `${lot.lotId}: continuity lot cannot use mixed teams`);
  }
  const packageIndex = weights ? chooseWeightedPackageIndex(seed, lot.lotId, weights[baseline]) : choosePackageIndex(seed, lot.lotId, bank.length);
  const assignment = bank[packageIndex];
  return {
    ...lot,
    packageId: `${lot.lotId}-${lot.variant}-${packageIndex}`,
    packageIndex,
    trainerVariants: Object.fromEntries(trainers.map((id, index) => [id, assignment[index]])),
  };
}
