const EXPECTED_RANGED_METHODS = Object.freeze(['surf', 'rock_smash', 'old_rod', 'good_rod', 'super_rod']);
const NINCADA_METHODS = new Set(['EVO_LEVEL_NINJASK', 'EVO_LEVEL_SHEDINJA']);
const WURMPLE_METHODS = new Set(['EVO_LEVEL_SILCOON', 'EVO_LEVEL_CASCOON']);
const TYROGUE_METHODS = new Set(['EVO_LEVEL_ATK_GT_DEF', 'EVO_LEVEL_ATK_EQ_DEF', 'EVO_LEVEL_ATK_LT_DEF']);

function invariant(condition, message) {
  if (!condition) throw new Error(`Política de niveles de fauna: ${message}`);
}

function round(value, digits = 6) {
  const scale = 10 ** digits;
  return Math.round((value + Number.EPSILON) * scale) / scale;
}

function evolutionLevel(edge) {
  const match = String(edge.parameter ?? '').match(/\d+/);
  return match ? Number(match[0]) : null;
}

export function validateCapLevelPolicy(config) {
  const policy = config?.levelPolicy;
  invariant(policy?.mode === 'cap-relative-wide-evolution-aware', 'mode inválido');
  invariant(
    ['trainer-authoring/windows/plan.json', 'wiki/trainer-authoring/v7/plan/windows.generated.json']
      .includes(policy.capSource?.path),
    'capSource.path inválido',
  );
  invariant(policy.capSource?.batchField === 'effective_access_batch', 'el cap debe resolverse por effective_access_batch');
  invariant(JSON.stringify(policy.fixedMethods) === JSON.stringify(['land']), 'land debe ser el único método fijo');
  invariant(JSON.stringify(policy.rangedMethods) === JSON.stringify(EXPECTED_RANGED_METHODS), 'métodos con rango inválidos');
  invariant(
    Array.isArray(policy.landSlotOffsets)
      && policy.landSlotOffsets.length === 12
      && policy.landSlotOffsets.every((offset) => Number.isInteger(offset) && offset <= 0),
    'el vector terrestre debe declarar doce offsets enteros no positivos',
  );
  invariant(
    Number.isInteger(policy.rangeOffsets?.minimum)
      && Number.isInteger(policy.rangeOffsets?.maximum)
      && policy.rangeOffsets.minimum < policy.rangeOffsets.maximum
      && policy.rangeOffsets.maximum === 0,
    'el rango debe terminar en C y tener un mínimo anterior',
  );
  invariant(Array.isArray(policy.levelMassPercent) && policy.levelMassPercent.length > 1, 'falta el perfil de nivel');
  invariant(policy.levelMassPercent.reduce((sum, row) => sum + row.percent, 0) === 100, 'el perfil de nivel debe sumar 100%');
  invariant(
    JSON.stringify(policy.levelMassPercent.map((row) => row.offset))
      === JSON.stringify(Array.from(
        { length: policy.rangeOffsets.maximum - policy.rangeOffsets.minimum + 1 },
        (_, index) => policy.rangeOffsets.minimum + index,
      )),
    'el perfil debe cubrir cada nivel del rango una vez y en orden',
  );
  invariant(policy.levelMassPercent.every((row) => Number.isFinite(row.percent) && row.percent > 0), 'cada nivel debe tener masa positiva');
  invariant(Array.isArray(policy.automaticEvolutionMethods) && policy.automaticEvolutionMethods.length > 0, 'faltan métodos de evolución automática');
  invariant(policy.fixedBranchPolicies?.WURMPLE?.mode === 'preserve-all-branches-across-fixed-slots', 'falta la política explícita de Wurmple');
  invariant(JSON.stringify(policy.fixedBranchPolicies.WURMPLE.targets) === JSON.stringify(['SILCOON', 'CASCOON']), 'ramas de Wurmple inválidas');
  invariant(policy.fixedBranchPolicies?.TYROGUE?.mode === 'deterministic-fixed-slots-and-even-ranged-projection', 'falta la política explícita de Tyrogue');
  invariant(JSON.stringify(policy.fixedBranchPolicies.TYROGUE.targets) === JSON.stringify(['HITMONLEE', 'HITMONCHAN', 'HITMONTOP']), 'ramas de Tyrogue inválidas');
  invariant(Array.isArray(policy.evolutionExceptions), 'evolutionExceptions debe ser una lista');
  invariant(policy.evaluatePower === false, 'esta política no debe evaluar poder');
  return policy;
}

export function buildCapByBatch(plan) {
  invariant(plan?.schemaVersion === 1 && Array.isArray(plan.windows), 'plan de ventanas inválido');
  const capByBatch = new Map();
  for (const window of plan.windows) {
    invariant(Number.isInteger(window.cap) && window.cap > 0, `${window.id}: cap inválido`);
    invariant(Array.isArray(window.batches) && window.batches.length > 0, `${window.id}: no declara lotes`);
    for (const batchId of window.batches) {
      invariant(!capByBatch.has(batchId), `${batchId}: aparece en dos ventanas de cap`);
      capByBatch.set(batchId, window.cap);
    }
  }
  return capByBatch;
}

function exceptionFor(policy, familyKey, speciesKey) {
  return policy.evolutionExceptions.find((exception) => (
    exception.familyKey === familyKey || exception.speciesKey === speciesKey
  )) ?? null;
}

function eligibleEdges(species, level, automaticMethods) {
  return (species?.evolution?.outgoing ?? []).filter((edge) => (
    automaticMethods.has(edge.method)
    && Number.isInteger(evolutionLevel(edge))
    && level >= evolutionLevel(edge)
  ));
}

/**
 * Resolve every automatic-by-level result at one exact level. Probabilities are
 * conditional on reaching this level; normal chains remain 100%, while the
 * personality split of Wurmple is represented as 50/50 for ranged projections.
 */
export function resolveEvolutionOutcomes({
  entrySpecies,
  familyKey,
  level,
  speciesByKey,
  policy,
  fixedBranchTarget = null,
}) {
  invariant(Number.isInteger(level) && level > 0, `${familyKey}: nivel inválido ${level}`);
  const automaticMethods = new Set(policy.automaticEvolutionMethods);
  const pending = [{ speciesKey: entrySpecies, probabilityPercent: 100, visited: new Set() }];
  const terminal = [];
  while (pending.length > 0) {
    const state = pending.shift();
    invariant(!state.visited.has(state.speciesKey), `${familyKey}: ciclo evolutivo en ${state.speciesKey}`);
    const species = speciesByKey.get(state.speciesKey);
    invariant(species, `${familyKey}: especie desconocida ${state.speciesKey}`);
    const edges = eligibleEdges(species, level, automaticMethods);
    if (edges.length === 0) {
      terminal.push({ speciesKey: state.speciesKey, probabilityPercent: state.probabilityPercent });
      continue;
    }
    const methods = new Set(edges.map((edge) => edge.method));
    const nextVisited = new Set(state.visited).add(state.speciesKey);
    if ([...methods].some((method) => NINCADA_METHODS.has(method))) {
      const exception = exceptionFor(policy, familyKey, state.speciesKey);
      invariant(exception, `${familyKey}: Nincada cruza su evolución al nivel ${level} sin excepción explícita para Shedinja`);
      invariant(exception.behavior === 'preserve-source-species' && typeof exception.reason === 'string' && exception.reason.length > 0,
        `${familyKey}: excepción de Nincada inválida`);
      terminal.push({ speciesKey: state.speciesKey, probabilityPercent: state.probabilityPercent });
      continue;
    }
    if ([...methods].some((method) => TYROGUE_METHODS.has(method))) {
      const branchEdges = fixedBranchTarget
        ? edges.filter((edge) => edge.to === fixedBranchTarget)
        : edges;
      invariant(branchEdges.length === (fixedBranchTarget ? 1 : 3), `${familyKey}: ramas de Tyrogue inválidas`);
      const branchProbability = fixedBranchTarget
        ? state.probabilityPercent
        : state.probabilityPercent / branchEdges.length;
      for (const edge of branchEdges) {
        pending.push({ speciesKey: edge.to, probabilityPercent: branchProbability, visited: nextVisited });
      }
      continue;
    }
    if ([...methods].every((method) => WURMPLE_METHODS.has(method))) {
      invariant(edges.length === 2, `${familyKey}: se esperaban dos ramas de Wurmple`);
      const branchEdges = fixedBranchTarget
        ? edges.filter((edge) => edge.to === fixedBranchTarget)
        : edges;
      invariant(branchEdges.length === (fixedBranchTarget ? 1 : 2), `${familyKey}: rama fija ${fixedBranchTarget} inválida`);
      const branchProbability = fixedBranchTarget ? state.probabilityPercent : state.probabilityPercent / branchEdges.length;
      for (const edge of branchEdges) {
        pending.push({ speciesKey: edge.to, probabilityPercent: branchProbability, visited: nextVisited });
      }
      continue;
    }
    invariant(edges.length === 1 && edges[0].method === 'EVO_LEVEL',
      `${familyKey}: rama automática no resuelta en ${state.speciesKey}: ${edges.map((edge) => edge.method).join(', ')}`);
    pending.push({ speciesKey: edges[0].to, probabilityPercent: state.probabilityPercent, visited: nextVisited });
  }
  const combined = new Map();
  for (const row of terminal) combined.set(row.speciesKey, (combined.get(row.speciesKey) ?? 0) + row.probabilityPercent);
  const outcomes = [...combined].map(([speciesKey, probabilityPercent]) => ({
    speciesKey,
    probabilityPercent: round(probabilityPercent),
  })).sort((left, right) => left.speciesKey.localeCompare(right.speciesKey));
  const roundingDifference = round(100 - outcomes.reduce((sum, row) => sum + row.probabilityPercent, 0));
  if (roundingDifference !== 0) {
    outcomes.at(-1).probabilityPercent = round(outcomes.at(-1).probabilityPercent + roundingDifference);
  }
  invariant(round(outcomes.reduce((sum, row) => sum + row.probabilityPercent, 0)) === 100, `${familyKey}: las ramas no suman 100%`);
  return outcomes;
}

export function buildLevelProfile(cap, policy, fixedOffset = null) {
  if (fixedOffset !== null) {
    const level = cap + fixedOffset;
    return [{ level, probabilityWithinSlotPercent: 100 }];
  }
  return policy.levelMassPercent.map((row) => ({
    level: cap + row.offset,
    probabilityWithinSlotPercent: row.percent,
  }));
}

export function buildFormOutcomes({ entrySpecies, familyKey, slotWeight, levelProfile, speciesByKey, policy, fixedBranchTarget = null }) {
  const bySpecies = new Map();
  for (const levelRow of levelProfile) {
    const resolved = resolveEvolutionOutcomes({
      entrySpecies,
      familyKey,
      level: levelRow.level,
      speciesByKey,
      policy,
      fixedBranchTarget,
    });
    for (const outcome of resolved) {
      const probabilityWithinSlotPercent = round(levelRow.probabilityWithinSlotPercent * outcome.probabilityPercent / 100);
      const tableEncounterPercent = round(slotWeight * probabilityWithinSlotPercent / 100);
      const aggregate = bySpecies.get(outcome.speciesKey) ?? { speciesKey: outcome.speciesKey, levels: [] };
      aggregate.levels.push({ level: levelRow.level, probabilityWithinSlotPercent, tableEncounterPercent });
      bySpecies.set(outcome.speciesKey, aggregate);
    }
  }
  return [...bySpecies.values()].map((outcome) => ({
    speciesId: `SPECIES_${outcome.speciesKey}`,
    minLevel: Math.min(...outcome.levels.map((row) => row.level)),
    maxLevel: Math.max(...outcome.levels.map((row) => row.level)),
    probabilityWithinSlotPercent: round(outcome.levels.reduce((sum, row) => sum + row.probabilityWithinSlotPercent, 0)),
    tableEncounterPercent: round(outcome.levels.reduce((sum, row) => sum + row.tableEncounterPercent, 0)),
    levels: outcome.levels,
  })).sort((left, right) => left.speciesId.localeCompare(right.speciesId));
}

export const CAP_LEVEL_POLICY_CONSTANTS = Object.freeze({
  expectedRangedMethods: EXPECTED_RANGED_METHODS,
});
