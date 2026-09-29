import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDistribution } from '../wiki/generators/fauna/generate.mjs';
import { buildCapEvolutionDistribution } from '../wiki/generators/fauna/generate-cap-levels.mjs';
import { createSeedPlan } from './seed-plan.mjs';

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILES = Object.freeze({
  sources: 'wiki/generators/fauna/sources/catalog.generated.json',
  policy: 'wiki/generators/fauna/policy/family-policy.generated.json',
  config: 'wiki/generators/fauna/config/b2-f015-a.json',
  pokedex: 'wiki/app/generated/pokedex.json',
  campaign: 'references/deksa-next/b5-campaign/species/campaign.json',
  plan: 'wiki/trainer-authoring/v7/plan/windows.generated.json',
});

// The original games have no ordinary wild witness for these two families.
// Keep their existing Déksa wild windows until their special acquisition is
// integrated; do not pretend that Beta 5's wild catalogue certified them.
const LEGACY_WILD_EXCEPTIONS = new Set(['hitmonlee', 'togepi']);

// Editorial projection of the approved post-League phases from native sources.
// These per-family assignments are not separately approved or guaranteed spawns.
const POSTGAME_MINIMUM = Object.freeze({
  ledyba: 10,       // Emerald Safari expansion after the first League.
  sneasel: 12,      // HG Mt. Silver after the full Kanto campaign.
  teddiursa: 10,    // Emerald Safari expansion after the first League.
  delibird: 11,     // FireRed Icefall Cave after Rainbow Pass.
  houndour: 10,     // Emerald Safari expansion after the first League.
  surskit: 10,      // HG Safari bonus encounters after National Dex.
  meditite: 10,     // HG National Dex radio encounter.
  roselia: 10,      // HG Safari bonus encounters after National Dex.
  zangoose: 10,     // HG Safari bonus encounters after National Dex.
  lunatone: 10,     // HG Safari bonus encounters after National Dex.
  beldum: 10,      // HG Safari bonus encounters after National Dex.
});

function hash(value) {
  return createHash('sha256').update(value).digest('hex');
}

async function readJson(projectRoot, relative) {
  const raw = await readFile(path.join(projectRoot, relative), 'utf8');
  return { value: JSON.parse(raw), sha256: hash(raw) };
}

export async function prepareBeta5FaunaInputs(masterSeed, projectRoot = PROJECT_ROOT) {
  const seedPlan = await createSeedPlan(masterSeed, projectRoot);
  const loaded = Object.fromEntries(await Promise.all(Object.entries(FILES).map(async ([key, filename]) =>
    [key, await readJson(projectRoot, filename)])));
  const sources = structuredClone(loaded.sources.value);
  const policy = structuredClone(loaded.policy.value);
  const config = structuredClone(loaded.config.value);
  const plan = loaded.plan.value;
  const campaign = loaded.campaign.value;
  const pokedex = loaded.pokedex.value;

  assert.equal(plan.windows.length, 12);
  assert.equal(campaign.axis, 'campaign');
  assert.equal(sources.surfaces.length, 315);
  assert.equal(policy.families.length, 202);

  const windowByLot = new Map(plan.windows.flatMap(({ ordinal, batches }) =>
    batches.map((lotId) => [lotId, ordinal])));
  assert.equal(windowByLot.size, 47);
  for (const batch of sources.batches) {
    const number = windowByLot.get(batch.batch_id);
    assert.ok(number, `Lote sin ventana Beta 5: ${batch.batch_id}`);
    batch.arc_id = String(number).padStart(2, '0');
  }

  // Surf requires Koga's badge: it first exists after W05, not inside W05.
  const batchIndex = new Map(sources.batches.map((batch, index) => [batch.batch_id, index]));
  const surfGate = '05G';
  const surfMethod = sources.method_access.find(({ method }) => method === 'surf');
  assert.equal(surfMethod.available_from_batch, '05F');
  surfMethod.available_from_batch = surfGate;
  for (const surface of sources.surfaces.filter(({ method }) => method === 'surf')) {
    surface.access.method_available_from_batch = surfGate;
    if (batchIndex.get(surface.access.effective_access_batch) < batchIndex.get(surfGate)) {
      surface.access.effective_access_batch = surfGate;
    }
  }

  const faunaRecord = new Map(campaign.records.filter(({ channel }) => channel === 'fauna')
    .map((record) => [record.species, record]));
  const membersByFamily = new Map(pokedex.families.map(({ familyId, members }) => [familyId, members]));
  const decisions = [];
  const firstLotByWindow = new Map(plan.windows.map(({ ordinal, batches }) => [ordinal, batches[0]]));
  const lastLotByWindow = new Map(plan.windows.map(({ ordinal, batches }) => [ordinal, batches.at(-1)]));

  for (const family of policy.families.filter(({ wildEligible }) => wildEligible)) {
    const members = membersByFamily.get(family.familyId);
    assert.ok(members?.length, `Familia sin miembros: ${family.familyKey}`);
    const records = members.map((species) => faunaRecord.get(species)).filter(Boolean);
    const campaignWindows = records.filter(({ availableBy, state }) =>
      Number.isInteger(availableBy) && state === 'exact-minimum-certified')
      .map(({ availableBy }) => availableBy);
    let window;
    let basis;
    if (campaignWindows.length > 0) {
      window = Math.min(...campaignWindows);
      basis = 'certified-campaign-fauna-minimum';
    } else if (Object.hasOwn(POSTGAME_MINIMUM, family.familyKey)) {
      assert.ok(records.some(({ nativePostgame }) => nativePostgame?.length),
        `${family.familyKey}: falta la fuente posliga`);
      window = POSTGAME_MINIMUM[family.familyKey];
      basis = 'editorial-postgame-projection';
    } else {
      assert.ok(LEGACY_WILD_EXCEPTIONS.has(family.familyKey),
        `${family.familyKey}: fauna sin mínimo certificado ni excepción`);
      window = Number(family.window.nativeWindow);
      basis = 'preserved-editorial-exception-no-native-wild-witness';
    }
    assert.ok(window >= 1 && window <= 12);
    family.window = {
      ...family.window,
      kind: 'beta5-campaign-window',
      nativeWindow: String(window).padStart(2, '0'),
      earliestBatch: firstLotByWindow.get(window),
      preferredBatch: firstLotByWindow.get(window),
      latestBatch: lastLotByWindow.get(window),
    };
    decisions.push({ familyKey: family.familyKey, window, basis });
  }

  policy.windowOrder = plan.windows.map(({ ordinal }) => String(ordinal).padStart(2, '0'));
  policy.windows = Object.fromEntries(plan.windows.map(({ ordinal, label }) =>
    [String(ordinal).padStart(2, '0'), label]));
  policy.summary.byNativeWindow = Object.fromEntries(policy.windowOrder.map((window) =>
    [window, policy.families.filter((family) => family.window.nativeWindow === window).length]));
  policy.summary.eligibleByNativeWindow = Object.fromEntries(policy.windowOrder.map((window) =>
    [window, policy.families.filter((family) => family.wildEligible && family.window.nativeWindow === window).length]));

  config.runId = 'DEKSA-B5-COMPILER';
  config.datasetId = 'deksa-beta5-campaign-fauna';
  config.algorithmVersion = 'deksa-beta5-campaign-inputs-over-v17';
  config.seed = seedPlan.faunaSeed;
  config.debutCoverage.mode = 'best-effort-through-window-12';
  config.debutAllocation.maximumPerTableByWindow = Object.fromEntries(policy.windowOrder.map((window) =>
    [window, window in config.debutAllocation.maximumPerTableByWindow
      ? config.debutAllocation.maximumPerTableByWindow[window] : window === '11' ? 2 : 1]));
  config.windowByBatch = Object.fromEntries(sources.batches.map(({ batch_id, arc_id }) => [batch_id, arc_id]));
  config.nativeWildFamiliesByWindow = Object.fromEntries(policy.windowOrder.map((window) => [
    window,
    policy.families.filter((family) => family.wildEligible && family.window.nativeWindow === window)
      .map((family) => family.familyKey).sort(),
  ]));
  // The three early Old Rod tables can have only one legal family after the
  // independent 10% no-spawn roll. Keep the slots; allow one family to recur.
  config.tableMinimumBySurface = Object.fromEntries(sources.surfaces
    .filter((surface) => surface.method === 'old_rod'
      && config.windowByBatch[surface.access.effective_access_batch] === '01')
    .map((surface) => [surface.surface_id, 1]));
  assert.equal(Object.keys(config.tableMinimumBySurface).length, 3);
  config.levelPolicy.capSource.path = FILES.plan;

  return {
    seedPlan,
    sources,
    policy,
    config,
    capPlan: plan,
    decisions,
    sourceHashes: Object.fromEntries(Object.entries(loaded).map(([key, entry]) => [FILES[key], entry.sha256])),
  };
}

export async function buildBeta5Fauna(masterSeed, projectRoot = PROJECT_ROOT) {
  const inputs = await prepareBeta5FaunaInputs(masterSeed, projectRoot);
  const distribution = await buildDistribution({
    configPath: path.join(projectRoot, FILES.config),
    configOverride: inputs.config,
    sourcesOverride: inputs.sources,
    policyOverride: inputs.policy,
  });
  const materialized = await buildCapEvolutionDistribution({
    configPath: path.join(projectRoot, FILES.config),
    baseDistribution: distribution,
    capPlanOverride: inputs.capPlan,
  });
  return { inputs, distribution: materialized };
}
