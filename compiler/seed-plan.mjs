import { createHash, randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildWorldSeedPlan } from '../wiki/trainer-authoring/v7/world-seed.mjs';

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CAMPAIGN_PLAN = 'wiki/trainer-authoring/v7/plan/windows.generated.json';
const CAMPAIGN_GRAPHS = 'wiki/trainer-authoring/v7/graphs/graphs.generated.json';

export const SEED_PLAN_VERSION = 1;
const SEED_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/u;

export function validateSeed(seed) {
  if (typeof seed !== 'string' || !SEED_PATTERN.test(seed)) {
    throw new TypeError('La seed debe tener entre 1 y 64 caracteres: letras, números, punto, guion o guion bajo; debe comenzar con letra o número.');
  }
  return seed;
}

export function randomSeed() {
  return randomBytes(12).toString('hex');
}

export async function createSeedPlan(seed, projectRoot = PROJECT_ROOT) {
  const masterSeed = validateSeed(seed);
  const files = await Promise.all([CAMPAIGN_PLAN, CAMPAIGN_GRAPHS].map(async (relative) => {
    const raw = await readFile(path.join(projectRoot, relative), 'utf8');
    return { path: relative, value: JSON.parse(raw), sha256: `sha256:${createHash('sha256').update(raw).digest('hex')}` };
  }));
  const [planFile, graphFile] = files;
  const trainerLotIds = planFile.value.trainerLots;
  const emptyTrainerLots = planFile.value.summary?.emptyTrainerLots;
  const components = graphFile.value.continuityGraph?.components;
  if (!Array.isArray(trainerLotIds) || trainerLotIds.length !== 45
      || !Array.isArray(emptyTrainerLots) || !Array.isArray(components)) {
    throw new Error('Plan de lotes o continuidad incompleto.');
  }
  const knownLots = new Set(trainerLotIds);
  const bindings = {};
  for (const component of components) {
    if (component.selectionScope !== 'one-variant-for-every-lot-in-component') {
      throw new Error(`Semántica de continuidad desconocida: ${component.id}`);
    }
    for (const lotId of component.lots) {
      if (!knownLots.has(lotId)) continue;
      if (bindings[lotId] !== undefined) throw new Error(`${lotId} pertenece a dos grupos de continuidad.`);
      bindings[lotId] = component.id;
    }
  }
  const plan = buildWorldSeedPlan({
    masterSeed,
    lotIds: trainerLotIds,
    continuityGroupIds: components.map(({ id }) => id),
    lotContinuityBindings: bindings,
  });
  const sourceFiles = files.map(({ path: relative, sha256 }) => ({ path: relative, sha256 }));
  const lots = plan.trainers.lots.map(({ lotId, variant, selectionScope, selectionId }) => ({
    lotId,
    variant,
    selectionScope,
    selectionId,
  }));

  return {
    schemaVersion: SEED_PLAN_VERSION,
    masterSeed,
    fingerprint: plan.fingerprint,
    faunaSeed: plan.fauna.seed,
    selectorId: plan.trainers.selectorId,
    lots,
    emptyTrainerLots,
    sourceFiles,
  };
}
