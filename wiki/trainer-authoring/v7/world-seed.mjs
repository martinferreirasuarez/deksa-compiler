import { createHash } from 'node:crypto';

import { buildTrainerVariantPlan } from './variant-selector.mjs';

export const WORLD_SEED_CONTRACT_ID = 'deksa-world-seed-contract-v1';
export const WORLD_SEED_DOMAINS = Object.freeze({
  fingerprint: 'deksa/beta3/world-fingerprint/v1',
  fauna: 'deksa/beta3/fauna/v1',
});

function assertOpaqueString(value, label) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new TypeError(`${label} debe ser un string no vacío.`);
  }
  if (value.trim() !== value) {
    throw new TypeError(`${label} no puede tener espacios exteriores.`);
  }
}

function framedSha256(...components) {
  const hash = createHash('sha256');
  for (const component of components) {
    const bytes = Buffer.from(component, 'utf8');
    const length = Buffer.allocUnsafe(4);
    length.writeUInt32BE(bytes.length);
    hash.update(length);
    hash.update(bytes);
  }
  return hash.digest('hex');
}

export function fingerprintMasterSeed(masterSeed) {
  assertOpaqueString(masterSeed, 'masterSeed');
  return framedSha256(
    WORLD_SEED_CONTRACT_ID,
    WORLD_SEED_DOMAINS.fingerprint,
    masterSeed,
  );
}

export function deriveFaunaSeed(masterSeed) {
  assertOpaqueString(masterSeed, 'masterSeed');
  return framedSha256(
    WORLD_SEED_CONTRACT_ID,
    WORLD_SEED_DOMAINS.fauna,
    masterSeed,
  );
}

export function buildWorldSeedPlan({
  masterSeed,
  lotIds,
  continuityGroupIds = [],
  lotContinuityBindings = {},
}) {
  assertOpaqueString(masterSeed, 'masterSeed');
  const trainerPlan = buildTrainerVariantPlan({
    masterSeed,
    lotIds,
    continuityGroupIds,
    lotContinuityBindings,
  });

  return Object.freeze({
    schemaVersion: 1,
    contractId: WORLD_SEED_CONTRACT_ID,
    masterSeed,
    fingerprint: fingerprintMasterSeed(masterSeed),
    fauna: Object.freeze({
      domain: WORLD_SEED_DOMAINS.fauna,
      seed: deriveFaunaSeed(masterSeed),
    }),
    trainers: trainerPlan,
  });
}
