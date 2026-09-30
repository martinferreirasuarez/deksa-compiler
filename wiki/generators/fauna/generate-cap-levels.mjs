#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildDistribution } from './generate.mjs';
import {
  buildCapByBatch,
  buildFormOutcomes,
  buildLevelProfile,
  resolveEvolutionOutcomes,
  possibleWildForms,
  validateCapLevelPolicy,
} from './cap-level-policy.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const WIKI_ROOT = resolve(HERE, '../..');
const DEFAULT_CONFIG_PATH = resolve(HERE, 'config/b2-f015-a.json');
const DEFAULT_OUTPUT_PATH = resolve(HERE, 'experiments/B2-F015-A/distribution.generated.json');
const SUPPORTED_RANDOMIZATION_MODES = new Set([
  'seeded-quality-bands-v1',
  'seeded-debut-return-bands-v1',
  'seeded-lot-debut-table-fill-v1',
  'seeded-ecology-window-random-fill-v1',
  'seeded-debut-phase-only-v1',
  'seeded-window-debut-queue-v1',
  'seeded-window-debut-fill-v1',
]);
const PATHS = Object.freeze({
  capPlan: resolve(WIKI_ROOT, 'trainer-authoring/windows/plan.json'),
  pokedex: resolve(WIKI_ROOT, 'app/generated/pokedex.json'),
  runner: fileURLToPath(import.meta.url),
  policy: resolve(HERE, 'cap-level-policy.mjs'),
});

function invariant(condition, message) {
  if (!condition) throw new Error(`Generador cap/evolución de fauna: ${message}`);
}

function sha256(text) {
  return createHash('sha256').update(text).digest('hex');
}

function canonicalJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function round(value, digits = 6) {
  const scale = 10 ** digits;
  return Math.round((value + Number.EPSILON) * scale) / scale;
}

function entrySpeciesFor(table, slot) {
  const detail = table.familyDetails.find((row) => row.familyKey === slot.familyKey);
  invariant(detail, `${table.surfaceId}/${slot.slotIndex}: falta detalle de ${slot.familyKey}`);
  return detail.entrySpecies;
}

function refreshFamilyMass(table) {
  const mass = new Map(table.familyDetails.map((detail) => [detail.familyKey, 0]));
  for (const slot of table.slots) {
    invariant(mass.has(slot.familyKey), `${table.surfaceId}/${slot.slotIndex}: familia ${slot.familyKey} fuera de la tabla`);
    mass.set(slot.familyKey, mass.get(slot.familyKey) + slot.weight);
  }
  invariant([...mass.values()].every((value) => value > 0), `${table.surfaceId}: una familia perdió todos sus slots`);
  const maximum = Math.max(...mass.values());
  for (const detail of table.familyDetails) {
    detail.localMass = mass.get(detail.familyKey);
    detail.ecologyRole = detail.localMass === maximum ? 'anchor' : (detail.localMass <= 15 ? 'rare' : 'core');
  }
  const detailByFamily = new Map(table.familyDetails.map((detail) => [detail.familyKey, detail]));
  for (const slot of table.slots) {
    const detail = detailByFamily.get(slot.familyKey);
    slot.availabilityRole = detail.availabilityRole;
    slot.ecologyRole = detail.ecologyRole;
    slot.temporalRelief = detail.temporalRelief;
  }
  table.metrics.familyRates = Object.fromEntries([...mass].sort(([left], [right]) => left.localeCompare(right)));
}

function ensureFixedWurmpleBranches(table, cap, policy, speciesByKey) {
  const wurmpleDetail = table.familyDetails.find((detail) => detail.entrySpecies === 'WURMPLE');
  if (!wurmpleDetail) return [];
  const branchThreshold = 7;
  const eligibleWurmpleSlots = table.slots.filter((slot, index) => (
    slot.familyKey === wurmpleDetail.familyKey
    && cap + policy.landSlotOffsets[index] >= branchThreshold
  ));
  if (eligibleWurmpleSlots.length === 0) return [];
  const targets = policy.fixedBranchPolicies.WURMPLE.targets;
  const adjustments = [];
  while (eligibleWurmpleSlots.length < targets.length) {
    const counts = new Map();
    for (const slot of table.slots) counts.set(slot.familyKey, (counts.get(slot.familyKey) ?? 0) + 1);
    const donor = table.slots
      .map((slot, index) => ({ slot, index, level: cap + policy.landSlotOffsets[index] }))
      .filter(({ slot, level }) => slot.familyKey !== wurmpleDetail.familyKey && counts.get(slot.familyKey) > 1 && level >= branchThreshold)
      .sort((left, right) => left.slot.weight - right.slot.weight || right.slot.slotIndex - left.slot.slotIndex)[0];
    invariant(donor, `${table.surfaceId}: no hay un slot repetido para preservar las dos ramas de Wurmple`);
    const beforeFamilyKey = donor.slot.familyKey;
    donor.slot.familyId = wurmpleDetail.familyId;
    donor.slot.familyKey = wurmpleDetail.familyKey;
    donor.slot.speciesId = 'SPECIES_WURMPLE';
    eligibleWurmpleSlots.push(donor.slot);
    adjustments.push({
      slotIndex: donor.slot.slotIndex,
      fromFamilyKey: beforeFamilyKey,
      toFamilyKey: wurmpleDetail.familyKey,
      reason: 'preserve-all-wurmple-branches-across-fixed-slots',
    });
  }
  const ordered = eligibleWurmpleSlots.sort((left, right) => left.slotIndex - right.slotIndex);
  for (let index = 0; index < ordered.length; index += 1) {
    ordered[index].fixedBranchTarget = targets[index % targets.length];
    // Validate the declared target and its complete continuation now; this also
    // fails if the Pokédex introduces a new branch the policy does not model.
    resolveEvolutionOutcomes({
      entrySpecies: 'WURMPLE',
      familyKey: wurmpleDetail.familyKey,
      level: cap + policy.landSlotOffsets[table.slots.indexOf(ordered[index])],
      speciesByKey,
      policy,
      fixedBranchTarget: ordered[index].fixedBranchTarget,
    });
  }
  refreshFamilyMass(table);
  return adjustments;
}

function assignFixedTyrogueBranches(table, cap, policy, speciesByKey) {
  const detail = table.familyDetails.find((row) => row.entrySpecies === 'TYROGUE');
  if (!detail) return;
  const targets = policy.fixedBranchPolicies.TYROGUE.targets;
  const surfaceOffset = [...table.surfaceId].reduce((sum, character) => sum + character.charCodeAt(0), 0);
  table.slots.forEach((slot, index) => {
    if (slot.familyKey !== detail.familyKey || cap + policy.landSlotOffsets[index] < 20) return;
    slot.fixedBranchTarget = targets[(surfaceOffset + slot.slotIndex) % targets.length];
    resolveEvolutionOutcomes({
      entrySpecies: 'TYROGUE',
      familyKey: detail.familyKey,
      level: cap + policy.landSlotOffsets[index],
      speciesByKey,
      policy,
      fixedBranchTarget: slot.fixedBranchTarget,
    });
  });
}

function seededFormOutcomes(table, slot, levelProfile, policy, speciesByKey, seed) {
  const forms = possibleWildForms({
    entrySpecies: entrySpeciesFor(table, slot), familyKey: slot.familyKey,
    level: levelProfile[0].level, speciesByKey, policy,
  });
  const pick = createHash('sha256')
    .update(JSON.stringify([seed, 'family-form', table.surfaceId, slot.slotIndex, slot.familyKey]))
    .digest().readUInt32BE(0) % forms.length;
  slot.possibleSpeciesIds = forms.map((key) => `SPECIES_${key}`);
  return [{
    speciesId: `SPECIES_${forms[pick]}`,
    minLevel: levelProfile[0].level,
    maxLevel: levelProfile.at(-1).level,
    probabilityWithinSlotPercent: 100,
    tableEncounterPercent: slot.weight,
    levels: levelProfile.map((row) => ({ ...row,
      tableEncounterPercent: round(slot.weight * row.probabilityWithinSlotPercent / 100),
    })),
  }];
}

function materializeFixedTable(table, cap, policy, speciesByKey, formSeed = null) {
  if (table.slots.length === 0) return [];
  invariant(table.slots.length === policy.landSlotOffsets.length, `${table.surfaceId}: tierra debe conservar doce slots`);
  if (formSeed === null) assignFixedTyrogueBranches(table, cap, policy, speciesByKey);
  const branchAdjustments = formSeed === null ? ensureFixedWurmpleBranches(table, cap, policy, speciesByKey) : [];
  for (let index = 0; index < table.slots.length; index += 1) {
    const slot = table.slots[index];
    const levelProfile = buildLevelProfile(cap, policy, policy.landSlotOffsets[index]);
    const entrySpecies = entrySpeciesFor(table, slot);
    const formOutcomes = formSeed !== null
      ? seededFormOutcomes(table, slot, levelProfile, policy, speciesByKey, formSeed)
      : buildFormOutcomes({
      entrySpecies,
      familyKey: slot.familyKey,
      slotWeight: slot.weight,
      levelProfile,
      speciesByKey,
      policy,
      fixedBranchTarget: slot.fixedBranchTarget ?? null,
    });
    invariant(formOutcomes.length === 1, `${table.surfaceId}/${slot.slotIndex}: un slot fijo produjo más de una forma`);
    slot.minLevel = levelProfile[0].level;
    slot.maxLevel = levelProfile[0].level;
    slot.speciesId = formOutcomes[0].speciesId;
    slot.materialization = 'static-cap-level';
    slot.levelProfile = levelProfile.map((row) => ({
      ...row,
      tableEncounterPercent: round(slot.weight * row.probabilityWithinSlotPercent / 100),
    }));
    slot.formOutcomes = formOutcomes;
  }
  return branchAdjustments;
}

function materializeRangedTable(table, cap, policy, speciesByKey, formSeed = null) {
  const levelProfile = buildLevelProfile(cap, policy);
  for (const slot of table.slots) {
    const entrySpecies = entrySpeciesFor(table, slot);
    slot.minLevel = cap + policy.rangeOffsets.minimum;
    slot.maxLevel = cap + policy.rangeOffsets.maximum;
    slot.speciesId = `SPECIES_${entrySpecies}`;
    slot.materialization = formSeed !== null ? 'static-cap-range' : 'runtime-level-dependent';
    slot.levelProfile = levelProfile.map((row) => ({
      ...row,
      tableEncounterPercent: round(slot.weight * row.probabilityWithinSlotPercent / 100),
    }));
    slot.formOutcomes = formSeed !== null
      ? seededFormOutcomes(table, slot, levelProfile, policy, speciesByKey, formSeed)
      : buildFormOutcomes({
      entrySpecies,
      familyKey: slot.familyKey,
      slotWeight: slot.weight,
      levelProfile,
      speciesByKey,
      policy,
    });
    if (formSeed !== null) slot.speciesId = slot.formOutcomes[0].speciesId;
  }
  return [];
}

function addFormSummaries(table) {
  const outcomesByFamily = new Map(table.familyDetails.map((detail) => [detail.familyKey, new Set()]));
  for (const slot of table.slots) {
    for (const outcome of slot.formOutcomes) outcomesByFamily.get(slot.familyKey).add(outcome.speciesId);
  }
  for (const detail of table.familyDetails) {
    detail.formSpeciesIds = [...outcomesByFamily.get(detail.familyKey)].sort();
  }
}

export function validateCapEvolutionDistribution(document) {
  const errors = [];
  const check = (condition, message) => { if (!condition) errors.push(message); };
  check(document.schemaVersion === 3, 'schemaVersion inválido');
  check(SUPPORTED_RANDOMIZATION_MODES.has(document.config.randomization?.mode), 'la corrida debe usar un motor aleatorio conocido');
  check(document.config.inheritanceMode === 'C0', 'la fauna variable debe partir de C0');
  check(document.generatedFrom.priorRunArtifacts.length === 0, 'la corrida heredó artefactos previos');
  check(document.tables.length === 315, 'debe haber 315 tablas');
  check(
    ['seeded-debut-phase-only-v1', 'seeded-window-debut-queue-v1']
      .includes(document.config.randomization?.mode)
      ? document.metrics.coverage.slots <= 2065
      : document.metrics.coverage.slots === 2065 - document.tables
        .filter((table) => table.slots.length === 0 && document.config.allowEmptyFishingSurfaces?.includes(table.surfaceId))
        .reduce((sum, table) => sum + table.nativeCapacity, 0),
    'cantidad de slots inválida',
  );
  check(document.metrics.levelMaterialization.capViolations === 0, 'hay slots por encima del cap');
  const policy = document.config.levelPolicy;
  const capByBatch = new Map(Object.entries(document.levelPolicy.capByEffectiveAccessBatch));
  for (const table of document.tables) {
    const cap = capByBatch.get(table.effectiveAccessBatch);
    check(Number.isInteger(cap), `${table.surfaceId}: falta cap para ${table.effectiveAccessBatch}`);
    check(table.cap === cap, `${table.surfaceId}: cap materializado inconsistente`);
    const isFixed = policy.fixedMethods.includes(table.method);
    check(isFixed || policy.rangedMethods.includes(table.method), `${table.surfaceId}: método no clasificado`);
    table.slots.forEach((slot, index) => {
      if (isFixed) {
        const expected = cap + policy.landSlotOffsets[index];
        check(slot.minLevel === expected && slot.maxLevel === expected, `${table.surfaceId}/${slot.slotIndex}: nivel terrestre incorrecto`);
        check(slot.materialization === 'static-cap-level', `${table.surfaceId}/${slot.slotIndex}: materialización fija incorrecta`);
        check(slot.formOutcomes.length === 1 && slot.formOutcomes[0].speciesId === slot.speciesId, `${table.surfaceId}/${slot.slotIndex}: forma fija inconsistente`);
      } else {
        check(
          slot.minLevel === cap + policy.rangeOffsets.minimum
            && slot.maxLevel === cap + policy.rangeOffsets.maximum,
          `${table.surfaceId}/${slot.slotIndex}: rango incorrecto`,
        );
        check(slot.materialization === (document.config.faunaFormSelection === 'seeded-family-forms'
          ? 'static-cap-range' : 'runtime-level-dependent'), `${table.surfaceId}/${slot.slotIndex}: materialización de rango incorrecta`);
        check(
          JSON.stringify(slot.levelProfile.map((row) => ({
            offset: row.level - cap,
            percent: row.probabilityWithinSlotPercent,
          }))) === JSON.stringify(policy.levelMassPercent),
          `${table.surfaceId}/${slot.slotIndex}: perfil de rango incorrecto`,
        );
      }
      check(slot.maxLevel <= cap, `${table.surfaceId}/${slot.slotIndex}: supera el cap ${cap}`);
      check(slot.minLevel > 0 && slot.minLevel <= slot.maxLevel, `${table.surfaceId}/${slot.slotIndex}: rango inválido`);
      check(round(slot.levelProfile.reduce((sum, row) => sum + row.probabilityWithinSlotPercent, 0)) === 100, `${table.surfaceId}/${slot.slotIndex}: niveles no suman 100%`);
      check(round(slot.formOutcomes.reduce((sum, row) => sum + row.probabilityWithinSlotPercent, 0)) === 100, `${table.surfaceId}/${slot.slotIndex}: formas no suman 100%`);
      check(round(slot.formOutcomes.reduce((sum, row) => sum + row.tableEncounterPercent, 0)) === slot.weight, `${table.surfaceId}/${slot.slotIndex}: formas no suman el peso del slot`);
    });
    const fixedWurmpleSlots = table.slots.filter((slot) => (
      slot.familyKey === 'wurmple' && slot.fixedBranchTarget
    ));
    if (fixedWurmpleSlots.length > 0) {
      check(new Set(fixedWurmpleSlots.map((slot) => slot.fixedBranchTarget)).size === 2, `${table.surfaceId}: se perdió una rama fija de Wurmple`);
    }
  }
  return { ok: errors.length === 0, errors };
}

export async function buildCapEvolutionDistribution({
  configPath = DEFAULT_CONFIG_PATH,
  baseDistribution = null,
  capPlanOverride = null,
} = {}) {
  const [base, planText, pokedexText, runnerText, policyText] = await Promise.all([
    baseDistribution ?? buildDistribution({ configPath }),
    capPlanOverride ? Promise.resolve(JSON.stringify(capPlanOverride)) : readFile(PATHS.capPlan, 'utf8'),
    readFile(PATHS.pokedex, 'utf8'),
    readFile(PATHS.runner, 'utf8'),
    readFile(PATHS.policy, 'utf8'),
  ]);
  invariant(SUPPORTED_RANDOMIZATION_MODES.has(base.config.randomization?.mode), 'el runner cap/evolución sólo admite generadores aleatorios conocidos');
  invariant(base.config.inheritanceMode === 'C0', 'la variante debe partir de una asignación C0 limpia');
  const policy = validateCapLevelPolicy(base.config);
  const formSeed = base.config.faunaFormSelection === 'seeded-family-forms' ? base.seed : null;
  const plan = JSON.parse(planText);
  const pokedex = JSON.parse(pokedexText);
  const capByBatch = buildCapByBatch(plan);
  const speciesByKey = new Map(pokedex.species.map((species) => [species.key, species]));
  const document = structuredClone(base);
  document.schemaVersion = 3;
  document.generatedFrom.capPlan = { path: policy.capSource.path, sha256: sha256(planText) };
  document.generatedFrom.capLevelRunner = {
    path: 'generators/fauna/generate-cap-levels.mjs',
    sha256: sha256(runnerText),
  };
  document.generatedFrom.capLevelPolicy = { path: 'generators/fauna/cap-level-policy.mjs', sha256: sha256(policyText) };
  document.algorithm.stages = [...document.algorithm.stages, 'cap-level-materialization',
    formSeed !== null ? 'seeded-family-form-selection' : 'automatic-level-evolution-projection'];
  document.algorithm.slotMaterialization = formSeed !== null
    ? 'seeded static species from base and legal level evolutions; ranged species legal at minimum level'
    : `${policy.rangeOffsets.minimum < 0 ? `C${policy.rangeOffsets.minimum}` : 'C'}..C from effective access cap; fixed land forms materialized statically; ranged methods projected for runtime level-dependent evolution`;
  document.algorithm.powerEvaluationForMaterializedForms = 'not-evaluated';
  document.levelPolicy = {
    mode: policy.mode,
    capSource: policy.capSource,
    capByEffectiveAccessBatch: Object.fromEntries(capByBatch),
    fixedMethods: policy.fixedMethods,
    rangedMethods: policy.rangedMethods,
    landSlotOffsets: policy.landSlotOffsets,
    rangeOffsets: policy.rangeOffsets,
    levelMassPercent: policy.levelMassPercent,
    automaticEvolutionMethods: policy.automaticEvolutionMethods,
    ignoredEvolutionMethods: ['EVO_ITEM', 'EVO_FRIENDSHIP', 'EVO_LEVEL_ITEM', 'trade'],
    branchPolicy: 'explicit-or-fail',
    evaluatePower: false,
  };
  const branchAdjustments = [];
  for (const table of document.tables) {
    const cap = capByBatch.get(table.effectiveAccessBatch);
    invariant(Number.isInteger(cap), `${table.surfaceId}: ${table.effectiveAccessBatch} no tiene cap`);
    table.cap = cap;
    if (policy.fixedMethods.includes(table.method)) {
      branchAdjustments.push(...materializeFixedTable(table, cap, policy, speciesByKey, formSeed).map((row) => ({
        surfaceId: table.surfaceId,
        ...row,
      })));
    } else {
      invariant(policy.rangedMethods.includes(table.method), `${table.surfaceId}: método ${table.method} fuera de la política`);
      materializeRangedTable(table, cap, policy, speciesByKey, formSeed);
    }
    addFormSummaries(table);
  }
  const allSlots = document.tables.flatMap((table) => table.slots);
  const capViolations = document.tables.flatMap((table) => table.slots.filter((slot) => slot.maxLevel > table.cap));
  document.metrics.levelMaterialization = {
    fixedSlots: allSlots.filter((slot) => slot.materialization === 'static-cap-level').length,
    staticEvolvedSlots: allSlots.filter((slot) => (
      slot.materialization === 'static-cap-level'
      && slot.speciesId !== `SPECIES_${entrySpeciesFor(document.tables.find((table) => table.slots.includes(slot)), slot)}`
    )).length,
    dynamicRangeSlots: allSlots.filter((slot) => slot.materialization === 'runtime-level-dependent').length,
    staticRangeSlots: allSlots.filter((slot) => slot.materialization === 'static-cap-range').length,
    capViolations: capViolations.length,
    fixedBranchAdjustments: branchAdjustments,
    unresolvedBranches: 0,
    evaluatedPower: false,
  };
  delete document.contentDigest;
  document.contentDigest = sha256(canonicalJson(document));
  const validation = validateCapEvolutionDistribution(document);
  invariant(validation.ok, `la salida no pasa validación:\n${validation.errors.join('\n')}`);
  return document;
}

export function renderCapEvolutionDistribution(document) {
  return canonicalJson(document);
}

async function main() {
  const args = process.argv.slice(2);
  let configPath = DEFAULT_CONFIG_PATH;
  let outputPath = DEFAULT_OUTPUT_PATH;
  let check = false;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--check') check = true;
    else if (arg === '--config' && args[index + 1]) configPath = resolve(process.cwd(), args[++index]);
    else if (arg === '--output' && args[index + 1]) outputPath = resolve(process.cwd(), args[++index]);
    else invariant(false, 'uso: generate-cap-levels.mjs [--check] [--config ruta] [--output ruta]');
  }
  const document = await buildCapEvolutionDistribution({ configPath });
  const rendered = renderCapEvolutionDistribution(document);
  if (check) {
    invariant(await readFile(outputPath, 'utf8') === rendered, `${document.runId} cambió; ejecutar generate-cap-levels.mjs`);
    process.stdout.write(`${document.runId} cap/evolución reproducible: ${document.tables.length} superficies, ${document.metrics.coverage.slots} slots.\n`);
    return;
  }
  await writeFile(outputPath, rendered);
  process.stdout.write(`Escrito ${outputPath}\n`);
}

const invoked = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : null;
if (invoked === import.meta.url) {
  main().catch((error) => {
    process.stderr.write(`${error.stack ?? error}\n`);
    process.exitCode = 1;
  });
}
