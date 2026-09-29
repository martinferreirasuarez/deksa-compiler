#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  BALANCE_STATUS,
  ECOLOGY_FIT,
  classifyEcologyFit,
  compareLexicographic,
  evaluateBalanceGuardrail,
  evaluatePoolSize,
  groupNativePools,
  selectFireRedTableReservations,
} from './engine.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const WIKI_ROOT = resolve(HERE, '../..');
const DEFAULT_CONFIG_PATH = resolve(HERE, 'config/randomized-v6-development.json');
const DEFAULT_OUTPUT_PATH = resolve(HERE, 'development.generated.json');
const LEGACY_GENERATOR_SHA256 = '4b509a7b7e59a0d87876a04677285788faccfcad39cb85e25d99da849d7c58eb';
const SEEDED_QUALITY_BANDS_MODE = 'seeded-quality-bands-v1';
const SPLIT_TABLE_COMPOSITION_MODE = 'seeded-debut-return-bands-v1';
const LOT_DEBUT_TABLE_FILL_MODE = 'seeded-lot-debut-table-fill-v1';
const ECOLOGY_WINDOW_RANDOM_FILL_MODE = 'seeded-ecology-window-random-fill-v1';
const DEBUT_PHASE_ONLY_MODE = 'seeded-debut-phase-only-v1';
const WINDOW_DEBUT_QUEUE_MODE = 'seeded-window-debut-queue-v1';
const WINDOW_DEBUT_FILL_MODE = 'seeded-window-debut-fill-v1';
const INPUT_PATHS = Object.freeze({
  sources: resolve(HERE, 'sources/catalog.generated.json'),
  policy: resolve(HERE, 'policy/family-policy.generated.json'),
  pokedex: resolve(WIKI_ROOT, 'app/generated/pokedex.json'),
  fireRedHeritage: resolve(HERE, 'sources/firered-heritage.generated.json'),
  engine: resolve(HERE, 'engine.mjs'),
  generator: fileURLToPath(import.meta.url),
});
const METHOD_ORDER = ['land', 'surf', 'rock_smash', 'old_rod', 'good_rod', 'super_rod'];

function invariant(condition, message) {
  if (!condition) throw new Error(`Generador global de fauna: ${message}`);
}

function sha256(text) {
  return createHash('sha256').update(text).digest('hex');
}

function canonicalJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function round(value, digits = 3) {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function average(values) {
  return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function seededKey(seed, ...parts) {
  return sha256([seed, ...parts].join('\u0000'));
}

function seededFraction(seed, ...parts) {
  return Number.parseInt(seededKey(seed, ...parts).slice(0, 8), 16) / 0x100000000;
}

function usesSeededQualityBands(context) {
  return [
    SEEDED_QUALITY_BANDS_MODE,
    SPLIT_TABLE_COMPOSITION_MODE,
    LOT_DEBUT_TABLE_FILL_MODE,
    ECOLOGY_WINDOW_RANDOM_FILL_MODE,
    DEBUT_PHASE_ONLY_MODE,
    WINDOW_DEBUT_QUEUE_MODE,
    WINDOW_DEBUT_FILL_MODE,
  ]
    .includes(context.config.randomization?.mode);
}

function usesSplitTableComposition(context) {
  return context.config.randomization?.mode === SPLIT_TABLE_COMPOSITION_MODE;
}

function usesLotDebutTableFill(context) {
  return context.config.randomization?.mode === LOT_DEBUT_TABLE_FILL_MODE;
}

function usesEcologyWindowRandomFill(context) {
  return context.config.randomization?.mode === ECOLOGY_WINDOW_RANDOM_FILL_MODE;
}

function usesDebutPhaseOnly(context) {
  return [DEBUT_PHASE_ONLY_MODE, WINDOW_DEBUT_QUEUE_MODE]
    .includes(context.config.randomization?.mode);
}

function usesWindowDebutQueue(context) {
  return context.config.randomization?.mode === WINDOW_DEBUT_QUEUE_MODE;
}

function usesWindowDebutFill(context) {
  return context.config.randomization?.mode === WINDOW_DEBUT_FILL_MODE;
}

function usesNoTemporalRelief(context) {
  return usesEcologyWindowRandomFill(context)
    || usesDebutPhaseOnly(context)
    || usesWindowDebutFill(context);
}

function usesExplicitDebutAllocation(context) {
  return usesSplitTableComposition(context) || usesLotDebutTableFill(context);
}

function publishesLotTemporalRoles(context) {
  return usesLotDebutTableFill(context)
    || usesEcologyWindowRandomFill(context)
    || usesDebutPhaseOnly(context)
    || usesWindowDebutFill(context);
}

function usesTableCompositionTotal(context) {
  return usesExplicitDebutAllocation(context)
    || usesEcologyWindowRandomFill(context)
    || usesDebutPhaseOnly(context)
    || usesWindowDebutFill(context);
}

function usesTableOnlyAllocation(context) {
  return usesSeededQualityBands(context)
    && context.config.randomization?.allocationUnit === 'table';
}

function debutMaximumForWindow(config, window) {
  return config.debutAllocation?.maximumPerTableByWindow?.[window]
    ?? config.debutAllocation?.maximumPerTable;
}

function minimumForSurface(config, surface) {
  return Math.min(
    config.tableMinimumBySurface?.[surface.surface_id] ?? config.tableComposition.total.minimum,
    surface.native_capacity,
  );
}

function debutMaximumForSurface(context, surface) {
  return debutMaximumForWindow(
    context.config,
    context.batchWindow.get(surface.access.effective_access_batch),
  );
}

function tableTotalContract(context, surface) {
  if (usesDebutPhaseOnly(context)) {
    const maximum = debutMaximumForSurface(context, surface);
    return { minimum: 0, target: maximum, maximum };
  }
  return usesTableCompositionTotal(context)
    ? context.config.tableComposition.total
    : context.config.methodRichness[surface.method];
}

function tableDesignationLimit(context, surface) {
  return Math.min(tableTotalContract(context, surface).maximum, surface.native_capacity);
}

function tableTargetDistribution(config) {
  if (Array.isArray(config.tableComposition?.targetDistribution)) {
    return config.tableComposition.targetDistribution;
  }
  const total = config.tableComposition.total;
  const weights = config.tableComposition.targetWeightsPercent;
  return [
    { families: total.minimum, percent: weights.minimum },
    { families: total.target, percent: weights.target },
    { families: total.maximum, percent: weights.maximum },
  ];
}

function timingBand(context, candidate) {
  const thresholds = context.config.randomization?.timingDistanceBands ?? [];
  const index = thresholds.findIndex((maximum) => candidate.windowDistance <= maximum);
  return index < 0 ? thresholds.length : index;
}

function randomizedEcologyBand(context, candidate, purpose) {
  if (candidate.ecology.rank === 0) return 0;
  const mixPercent = context.config.randomization?.compatibleEcologyMixPercent ?? 0;
  const sample = Number.parseInt(
    seededKey(
      context.config.seed,
      'ecology-quality-band',
      purpose,
      candidate.surfaceId,
    ).slice(0, 8),
    16,
  ) / 0xffffffff * 100;
  return sample < mixPercent ? 0 : 1;
}

function ecologyWindowSeedTuple(context, candidate, purpose) {
  return [
    candidate.ecology.rank,
    candidate.windowDistance,
    seededKey(context.config.seed, purpose, candidate.surfaceId, candidate.familyKey),
  ];
}

function debutPhaseSeedTuple(context, candidate, purpose) {
  return [
    candidate.windowDistance,
    candidate.ecology.rank,
    seededKey(context.config.seed, purpose, candidate.surfaceId, candidate.familyKey),
  ];
}

function compareScalars(left, right) {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

function sorted(items, tupleFor, keyFor) {
  return [...items].sort((left, right) => (
    compareLexicographic(tupleFor(left), tupleFor(right))
    || compareScalars(keyFor(left), keyFor(right))
  ));
}

async function readInputs({
  configPath = DEFAULT_CONFIG_PATH,
  configOverride = null,
  sourcesOverride = null,
  policyOverride = null,
} = {}) {
  const configText = await readFile(configPath, 'utf8');
  const config = configOverride ?? JSON.parse(configText);
  const [sourceText, policyText, pokedexText, engineText, generatorText, fireRedHeritageText] = await Promise.all([
    sourcesOverride ? Promise.resolve(canonicalJson(sourcesOverride)) : readFile(INPUT_PATHS.sources, 'utf8'),
    policyOverride ? Promise.resolve(canonicalJson(policyOverride)) : readFile(INPUT_PATHS.policy, 'utf8'),
    readFile(INPUT_PATHS.pokedex, 'utf8'),
    readFile(INPUT_PATHS.engine, 'utf8'),
    readFile(INPUT_PATHS.generator, 'utf8'),
    config.inheritanceMode === 'C0' ? Promise.resolve(null) : readFile(INPUT_PATHS.fireRedHeritage, 'utf8'),
  ]);
  return {
    sources: JSON.parse(sourceText),
    policy: JSON.parse(policyText),
    pokedex: JSON.parse(pokedexText),
    fireRedHeritage: fireRedHeritageText ? JSON.parse(fireRedHeritageText) : null,
    config,
    texts: {
      sourceText,
      policyText,
      pokedexText,
      configText: configOverride ? canonicalJson(configOverride) : configText,
      engineText,
      generatorText,
      fireRedHeritageText,
    },
    configPath,
  };
}

function validateConfig(config, batchOrder, windowOrder) {
  invariant(config.schemaVersion === 3, 'config schemaVersion debe ser 3');
  invariant(typeof config.runId === 'string' && config.runId.length > 0, 'falta runId');
  invariant(typeof config.datasetId === 'string' && config.datasetId.length > 0, 'falta datasetId');
  invariant(typeof config.algorithmVersion === 'string' && config.algorithmVersion.length > 0, 'falta algorithmVersion');
  invariant(
    config.modelStatus === undefined || ['experimental', 'official-design'].includes(config.modelStatus),
    'modelStatus desconocido',
  );
  invariant(typeof config.seed === 'string' && config.seed.length > 0, 'falta seed explícita');
  const noSpawnChance = config.spawnSelection?.noSpawnChance ?? 0;
  invariant(
    Number.isFinite(noSpawnChance) && noSpawnChance >= 0 && noSpawnChance < 1,
    'spawnSelection.noSpawnChance debe estar entre 0 y 1, sin incluir 1',
  );
  if (config.spawnSelection) {
    invariant(config.spawnSelection.unit === 'family', 'la tirada de no spawn debe operar por familia');
    invariant(
      config.spawnSelection.stage === 'before-debut-allocation',
      'la tirada de no spawn debe ejecutarse antes de adjudicar debuts',
    );
    invariant(
      config.spawnSelection.roll === 'seeded-independent-bernoulli',
      'la tirada de no spawn debe ser Bernoulli independiente y determinista',
    );
  }
  invariant(Array.isArray(config.priorRunArtifacts) && config.priorRunArtifacts.length === 0, 'priorRunArtifacts debe ser []');
  invariant(['C0', 'C1', 'C2'].includes(config.inheritanceMode), 'inheritanceMode debe ser C0, C1 o C2');
  const expectedInheritanceLimit = { C0: 0, C1: 1, C2: 2 }[config.inheritanceMode];
  invariant(config.fireRedInheritance?.scope === 'table', 'la herencia FireRed debe calcularse por tabla');
  invariant(config.fireRedInheritance?.maximumReservationsPerTable === expectedInheritanceLimit, 'el límite FireRed por tabla no coincide con inheritanceMode');
  invariant(config.fireRedInheritance?.sourceCriterion === 'same-pristine-map-variant-method', 'criterio FireRed inválido');
  invariant(config.fireRedInheritance?.stage === 'before-table-fill', 'la herencia FireRed debe ejecutarse antes del resto de cada tabla');
  invariant(Array.isArray(config.fireRedInheritance?.allowedMethods)
    && config.fireRedInheritance.allowedMethods.join(',') === METHOD_ORDER.join(','), 'la herencia FireRed debe declarar todos los métodos en orden canónico');
  invariant(config.timing?.distanceUnit === 'native-gym-window', 'la distancia debe medirse por ventana de gimnasio');
  invariant(config.timing.allowEarlyDebuts === false, 'los debuts tempranos deben estar bloqueados');
  invariant(config.timing.insideDistance === 0 && config.timing.adjacentDistance === 1 && config.timing.outlierMinimumDistance === 2, 'umbrales de distancia inválidos');
  const windowDebutQueue = config.randomization?.mode === WINDOW_DEBUT_QUEUE_MODE;
  const windowDebutFill = config.randomization?.mode === WINDOW_DEBUT_FILL_MODE;
  const validateDebutMaximum = () => {
    const scalar = config.debutAllocation?.maximumPerTable;
    const byWindow = config.debutAllocation?.maximumPerTableByWindow;
    const hasScalar = Number.isInteger(scalar) && scalar > 0;
    const hasWindowMap = byWindow !== undefined;
    invariant(hasScalar !== hasWindowMap, 'debutAllocation debe declarar un máximo fijo o uno por ventana');
    if (hasWindowMap) {
      invariant(
        byWindow && typeof byWindow === 'object' && !Array.isArray(byWindow),
        'debutAllocation.maximumPerTableByWindow debe ser un objeto',
      );
      invariant(
        Object.keys(byWindow).sort().join(',') === [...windowOrder].sort().join(','),
        'debutAllocation.maximumPerTableByWindow debe cubrir las ventanas fuente en orden',
      );
      invariant(
        Object.values(byWindow).every((maximum) => Number.isInteger(maximum) && maximum > 0),
        'cada máximo de debut por ventana debe ser un entero positivo',
      );
    }
  };
  if (windowDebutQueue || windowDebutFill) {
    invariant(
      config.debutCoverage?.mode === `best-effort-through-window-${windowOrder.at(-1)}`,
      'la cola por ventanas debe declarar su cobertura best-effort',
    );
  } else {
    invariant(config.debutCoverage?.requiredPerEligibleFamily === 1, 'cada familia elegible debe tener exactamente un debut');
  }
  const ecologyWindowRandomFill = config.randomization?.mode === ECOLOGY_WINDOW_RANDOM_FILL_MODE;
  const debutPhaseOnly = [DEBUT_PHASE_ONLY_MODE, WINDOW_DEBUT_QUEUE_MODE]
    .includes(config.randomization?.mode);
  const noTemporalRelief = ecologyWindowRandomFill || debutPhaseOnly || windowDebutFill;
  if (noTemporalRelief) {
    invariant(!Object.hasOwn(config, 'temporalRelief'), 'el modo simple no admite alivio temporal');
    invariant(!Object.hasOwn(config, 'balanceGuardrail'), 'el modo simple no admite guardrail de balance');
  } else {
    invariant(config.temporalRelief?.enabled === true, 'el alivio temporal debe estar habilitado');
    invariant(config.temporalRelief.direction === 'late-only', 'el alivio temporal debe ser sólo tardío');
    invariant(config.temporalRelief.minimumOutlierDistance === config.timing.outlierMinimumDistance, 'el alivio debe usar el mismo umbral de outlier');
    invariant(config.temporalRelief.requiredTimingDistance === config.timing.insideDistance, 'el alivio debe terminar dentro de ventana');
    invariant(['exact', 'compatible'].includes(config.temporalRelief.maximumEcologyFit), 'ecología máxima de alivio inválida');
    invariant(Number.isInteger(config.temporalRelief.minimumLocalMassPercent) && config.temporalRelief.minimumLocalMassPercent >= 5, 'masa mínima de alivio inválida');
  }
  const tableOnly = config.randomization?.allocationUnit === 'table';
  if (tableOnly) {
    if (!noTemporalRelief) invariant(config.temporalRelief.maximumPerTable === 1, 'sólo se admite un alivio por tabla');
    invariant(!Object.hasOwn(config, 'poolContracts'), 'el modo por tabla no admite poolContracts');
  } else {
    invariant(config.temporalRelief.maximumPerLandPool === 1, 'sólo se admite un alivio por pool terrestre');
    for (const kind of ['land', 'aquatic']) {
      const contract = config.poolContracts?.[kind];
      invariant(Number.isInteger(contract?.minimum) && Number.isInteger(contract?.target) && Number.isInteger(contract?.maximum), `contrato ${kind} inválido`);
      invariant(contract.minimum <= contract.target && contract.target <= contract.maximum, `contrato ${kind} fuera de orden`);
    }
  }
  const splitComposition = config.randomization?.mode === SPLIT_TABLE_COMPOSITION_MODE;
  const lotDebutComposition = config.randomization?.mode === LOT_DEBUT_TABLE_FILL_MODE;
  if (splitComposition) {
    invariant(config.inheritanceMode === 'C0', 'la composición debut/regreso se prueba desde C0');
    invariant(!Object.hasOwn(config, 'methodRichness'), 'la composición separada no admite el contrato antiguo methodRichness');
    for (const role of ['debut', 'return', 'total']) {
      const contract = config.tableComposition?.[role];
      invariant(Number.isInteger(contract?.minimum) && Number.isInteger(contract?.target) && Number.isInteger(contract?.maximum), `tableComposition.${role} inválido`);
      invariant(contract.minimum <= contract.target && contract.target <= contract.maximum, `tableComposition.${role} fuera de orden`);
    }
    invariant(
      config.tableComposition.debut.target + config.tableComposition.return.target
        === config.tableComposition.total.target,
      'los objetivos de debut y regreso deben sumar el total objetivo',
    );
    invariant(
      config.tableComposition.bootstrap?.throughNativeWindow === '01'
        && config.tableComposition.bootstrap?.debutTarget === config.tableComposition.debut.maximum
        && Array.isArray(config.tableComposition.bootstrap?.methods)
        && config.tableComposition.bootstrap.methods.join(',') === 'land',
      'el arranque debe usar el máximo de debuts hasta W01',
    );
  } else if (lotDebutComposition) {
    invariant(config.inheritanceMode === 'C0', 'la composición por lote se prueba desde C0');
    invariant(!Object.hasOwn(config, 'methodRichness'), 'la composición por lote no admite methodRichness');
    invariant(config.randomization.temporalRoleUnit === 'lot', 'debut y regreso deben usar el lote como frontera temporal');
    const total = config.tableComposition?.total;
    invariant(Number.isInteger(total?.minimum) && Number.isInteger(total?.target) && Number.isInteger(total?.maximum), 'tableComposition.total inválido');
    invariant(total.minimum <= total.target && total.target <= total.maximum, 'tableComposition.total fuera de orden');
    const debut = config.debutAllocation;
    invariant(Number.isInteger(debut?.targetPrimaryReservationsPerTable)
      && Number.isInteger(debut?.maximumPrimaryReservationsPerTable)
      && debut.targetPrimaryReservationsPerTable > 0
      && debut.targetPrimaryReservationsPerTable <= debut.maximumPrimaryReservationsPerTable,
    'debutAllocation inválido');
    invariant(
      debut.bootstrap?.throughNativeWindow === '01'
        && debut.bootstrap?.primaryReservationsPerTable === debut.maximumPrimaryReservationsPerTable
        && Array.isArray(debut.bootstrap?.methods)
        && debut.bootstrap.methods.join(',') === 'land',
      'el arranque por lote debe usar el máximo de reservas primarias hasta W01',
    );
  } else if (ecologyWindowRandomFill) {
    invariant(config.inheritanceMode === 'C0', 'el modo ecología/ventana/seed debe partir de C0');
    invariant(!Object.hasOwn(config, 'methodRichness'), 'el modo ecología/ventana/seed no admite methodRichness');
    invariant(!Object.hasOwn(config, 'debutAllocation'), 'el modo ecología/ventana/seed no reserva debuts');
    invariant(
      config.randomization.temporalRoleUnit === 'derived-first-occurrence',
      'el debut debe derivarse de la primera aparición real',
    );
    invariant(
      Array.isArray(config.randomization.objectiveOrder)
        && config.randomization.objectiveOrder.join(',') === 'ecology,native-window,seed',
      'el orden de objetivos debe ser ecología, ventana nativa y seed',
    );
    const total = config.tableComposition?.total;
    invariant(Number.isInteger(total?.minimum) && Number.isInteger(total?.target) && Number.isInteger(total?.maximum), 'tableComposition.total inválido');
    invariant(total.minimum <= total.target && total.target <= total.maximum, 'tableComposition.total fuera de orden');
  } else if (windowDebutFill) {
    invariant(config.inheritanceMode === 'C0', 'el relleno por ventanas debe partir de C0');
    invariant(!Object.hasOwn(config, 'methodRichness'), 'el relleno por ventanas no admite methodRichness');
    invariant(config.randomization.temporalRoleUnit === 'window', 'el relleno debe usar la ventana como frontera temporal');
    invariant(
      Array.isArray(config.randomization.objectiveOrder)
        && config.randomization.objectiveOrder.join(',')
          === 'freshness-and-ecology,window-usage,native-window-distance,seed',
      'el orden del relleno por ventanas es inválido',
    );
    validateDebutMaximum();
    const total = config.tableComposition?.total;
    invariant(
      Number.isInteger(total?.minimum)
        && Number.isInteger(total?.target)
        && Number.isInteger(total?.maximum),
      'tableComposition.total inválido',
    );
    invariant(total.minimum <= total.target && total.target <= total.maximum, 'tableComposition.total fuera de orden');
    const weights = config.tableComposition?.targetWeightsPercent;
    const distribution = config.tableComposition?.targetDistribution;
    invariant(
      Boolean(weights) !== Array.isArray(distribution),
      'tableComposition debe declarar targetWeightsPercent o targetDistribution, no ambos',
    );
    if (weights) {
      invariant(
        Number.isInteger(weights.minimum)
          && Number.isInteger(weights.target)
          && Number.isInteger(weights.maximum)
          && weights.minimum >= 0
          && weights.target >= 0
          && weights.maximum >= 0
          && weights.minimum + weights.target + weights.maximum === 100,
        'tableComposition.targetWeightsPercent debe sumar 100',
      );
    } else {
      invariant(
        distribution.length === total.maximum - total.minimum + 1
          && distribution.every((row, index) => (
            Number.isInteger(row?.families)
            && row.families === total.minimum + index
            && Number.isInteger(row.percent)
            && row.percent >= 0
          ))
          && distribution.reduce((sum, row) => sum + row.percent, 0) === 100,
        'tableComposition.targetDistribution debe cubrir cada entero del rango y sumar 100',
      );
    }
    invariant(config.fillAllocation?.sameLotFreshness === 'prefer-unused', 'falta la preferencia de frescura por lote');
    invariant(config.fillAllocation?.adjacency === 'previous-table-same-method-in-window', 'la vecindad del relleno es inválida');
  } else if (debutPhaseOnly) {
    invariant(config.inheritanceMode === 'C0', 'la fase de debuts debe partir de C0');
    invariant(!Object.hasOwn(config, 'methodRichness'), 'la fase de debuts no admite methodRichness');
    invariant(!Object.hasOwn(config, 'tableComposition'), 'la fase de debuts no define todavía el relleno de tabla');
    invariant(config.randomization.temporalRoleUnit === 'explicit-debut-only', 'la fase debe publicar sólo debuts explícitos');
    const expectedObjectiveOrder = windowDebutQueue
      ? 'ecology-phase,oldest-native-window,seed'
      : 'native-window-distance,ecology,seed';
    invariant(
      Array.isArray(config.randomization.objectiveOrder)
        && config.randomization.objectiveOrder.join(',') === expectedObjectiveOrder,
      `el orden debe ser ${expectedObjectiveOrder}`,
    );
    validateDebutMaximum();
  } else {
    for (const method of METHOD_ORDER) {
      const contract = config.methodRichness?.[method];
      invariant(Number.isInteger(contract?.minimum) && Number.isInteger(contract?.target) && Number.isInteger(contract?.maximum), `riqueza ${method} inválida`);
      invariant(contract.minimum <= contract.target && contract.target <= contract.maximum, `riqueza ${method} fuera de orden`);
    }
  }
  if (!noTemporalRelief) {
    for (const field of ['earlyThroughBatch', 'midThroughBatch']) {
      invariant(batchOrder.includes(config.balanceGuardrail?.[field]), `balanceGuardrail.${field} no es un lote conocido`);
    }
  }
  if (config.randomization) {
    invariant(
      [
        SEEDED_QUALITY_BANDS_MODE,
        SPLIT_TABLE_COMPOSITION_MODE,
        LOT_DEBUT_TABLE_FILL_MODE,
        ECOLOGY_WINDOW_RANDOM_FILL_MODE,
        DEBUT_PHASE_ONLY_MODE,
        WINDOW_DEBUT_QUEUE_MODE,
        WINDOW_DEBUT_FILL_MODE,
      ].includes(config.randomization.mode),
      'modo de aleatoriedad desconocido',
    );
    invariant(config.randomization.allocationUnit === 'table', 'el motor aleatorio debe declarar la tabla como única unidad de asignación');
    invariant(config.randomization.scope === 'global-family-and-table-composition', 'scope de aleatoriedad inválido');
    if (noTemporalRelief) {
      for (const obsoleteField of [
        'timingDistanceBands',
        'contextFallbackPriority',
        'balanceBlockPolicy',
        'compatibleEcologyMixPercent',
      ]) {
        invariant(!Object.hasOwn(config.randomization, obsoleteField), `el modo simple no admite ${obsoleteField}`);
      }
    } else {
      invariant(
        Array.isArray(config.randomization.timingDistanceBands)
          && config.randomization.timingDistanceBands.length > 0
          && config.randomization.timingDistanceBands.every((value, index, values) => (
            Number.isInteger(value)
            && value >= 0
            && (index === 0 || value > values[index - 1])
          )),
        'timingDistanceBands debe ser una lista creciente de enteros',
      );
      invariant(config.randomization.contextFallbackPriority === 'strict', 'los fallbacks de contexto deben quedar detrás del contexto exacto');
      invariant(config.randomization.balanceBlockPolicy === 'forbidden', 'el balance bloqueado no puede entrar al sorteo');
      invariant(
        Number.isFinite(config.randomization.compatibleEcologyMixPercent)
          && config.randomization.compatibleEcologyMixPercent >= 0
          && config.randomization.compatibleEcologyMixPercent <= 100,
        'compatibleEcologyMixPercent debe estar entre 0 y 100',
      );
    }
    for (const field of ['minimumChangedTableMembershipPercent']) {
      const value = config.randomization.diversityAudit?.[field];
      invariant(Number.isFinite(value) && value > 0 && value <= 100, `randomization.diversityAudit.${field} inválido`);
    }
    invariant(
      config.randomization.diversityAudit?.comparisonUnit === 'unordered-family-membership',
      'la diversidad debe medir composición familiar y no orden de slots',
    );
    invariant(
      typeof config.randomization.diversityAudit?.corpusSeedPrefix === 'string'
        && config.randomization.diversityAudit.corpusSeedPrefix.length > 0,
      'randomization.diversityAudit.corpusSeedPrefix es obligatorio',
    );
  }
}

function buildContext(inputs) {
  const { sources, policy, pokedex, fireRedHeritage, config } = inputs;
  invariant(sources.schema_version === 1 && sources.surfaces.length === 315, 'catálogo estructural inválido');
  invariant(sources.summary.assigned_slots === 2065, 'el catálogo estructural no contiene 2.065 slots');
  invariant(policy.schemaVersion === 2 && policy.families.length === 202, 'policy familiar inválida');
  invariant(pokedex.schemaVersion === 1 && pokedex.families.length === 202, 'Pokédex fuente inválida');
  if (config.inheritanceMode !== 'C0') {
    invariant(fireRedHeritage?.schemaVersion === 1 && fireRedHeritage.surfaces.length === 315, 'fuente vanilla FireRed inválida');
    invariant(fireRedHeritage.policy.currentRomSpeciesUsage === 'not-read', 'la herencia FireRed leyó especies de la ROM actual');
  }
  const batchOrder = sources.batches.map((batch) => batch.batch_id);
  invariant(batchOrder.join(',') === policy.batchOrder.join(','), 'el eje de lotes difiere entre fuentes y policy');
  validateConfig(config, batchOrder, policy.windowOrder);
  const batchIndex = new Map(batchOrder.map((batchId, index) => [batchId, index]));
  const batchWindow = new Map(sources.batches.map((batch) => [batch.batch_id, batch.arc_id]));
  const windowOrder = policy.windowOrder;
  const windowIndex = new Map(windowOrder.map((window, index) => [window, index]));
  invariant(
    windowOrder.length >= 9 && windowOrder.length <= 12
      && windowOrder.every((window, index) => window === String(index + 1).padStart(2, '0')),
    'el eje de ventanas nativas es inválido',
  );
  invariant(
    sources.batches.every((batch) => windowIndex.has(batch.arc_id)),
    'hay lotes fuera del eje de ventanas',
  );
  if (config.windowByBatch) {
    invariant(
      sources.batches.every((batch) => config.windowByBatch[batch.batch_id] === batch.arc_id),
      'windowByBatch no coincide con el catálogo estructural',
    );
  }
  if (config.nativeWildFamiliesByWindow) {
    invariant(
      windowOrder.every((window) => {
        const expected = policy.families.filter((family) =>
          family.wildEligible && family.window.nativeWindow === window)
          .map((family) => family.familyKey).sort();
        return JSON.stringify(config.nativeWildFamiliesByWindow[window]) === JSON.stringify(expected);
      }),
      'nativeWildFamiliesByWindow no coincide con la política familiar',
    );
  }
  if (config.tableMinimumBySurface) {
    const surfaceById = new Map(sources.surfaces.map((surface) => [surface.surface_id, surface]));
    invariant(Object.entries(config.tableMinimumBySurface).every(([surfaceId, minimum]) =>
      surfaceById.has(surfaceId) && Number.isInteger(minimum)
      && minimum >= 1 && minimum <= config.tableComposition.total.minimum),
    'tableMinimumBySurface contiene una excepción inválida');
  }
  const speciesByKey = new Map(pokedex.species.map((species) => [species.key, species]));
  const policyWildFamilies = policy.families.filter((family) => family.wildEligible).map((family) => {
    const species = speciesByKey.get(family.entrySpecies);
    invariant(species, `${family.familyKey}: especie de entrada desconocida ${family.entrySpecies}`);
    return {
      ...family,
      originRegion: species.region,
      displayName: species.name,
      types: species.types,
      entryBst: species.baseStats.total,
    };
  });
  invariant(policyWildFamilies.length === policy.summary.wildEligibleFamilyCount, 'partición wild de policy inconsistente');
  const noSpawnChance = config.spawnSelection?.noSpawnChance ?? 0;
  const noSpawnFamilies = policyWildFamilies.filter((family) => (
    seededFraction(config.seed, 'family-no-spawn', family.familyKey) < noSpawnChance
  ));
  const noSpawnFamilyKeys = new Set(noSpawnFamilies.map((family) => family.familyKey));
  const families = policyWildFamilies.filter((family) => !noSpawnFamilyKeys.has(family.familyKey));
  invariant(families.length > 0, 'la policy no expone familias wild elegibles');

  const surfaces = [...sources.surfaces].sort((left, right) => (
    batchIndex.get(left.access.effective_access_batch) - batchIndex.get(right.access.effective_access_batch)
    || METHOD_ORDER.indexOf(left.method) - METHOD_ORDER.indexOf(right.method)
    || left.surface_id.localeCompare(right.surface_id)
  ));
  const surfaceById = new Map(surfaces.map((surface) => [surface.surface_id, surface]));
  const surfaceOrder = new Map(surfaces.map((surface, index) => [surface.surface_id, index]));
  const tableOnly = usesTableOnlyAllocation({ config });
  const pools = tableOnly ? [] : groupNativePools(surfaces, {
    scopeFor: (surface) => surface.scope_id,
    surfaceKeyFor: (surface) => surface.surface_id,
    methodFor: (surface) => surface.method,
    contracts: config.poolContracts,
  }).map((pool) => ({
    ...pool,
    members: new Map(),
    firstOrder: Math.min(...pool.surfaceIds.map((surfaceId) => surfaceOrder.get(surfaceId))),
  })).sort((left, right) => left.firstOrder - right.firstOrder || left.poolId.localeCompare(right.poolId));
  if (!tableOnly) invariant(pools.length === 102, `el contrato global exige 102 pools; hay ${pools.length}`);
  const poolById = new Map(pools.map((pool) => [pool.poolId, pool]));
  const poolBySurface = new Map();
  for (const pool of pools) {
    for (const surfaceId of pool.surfaceIds) {
      invariant(!poolBySurface.has(surfaceId), `${surfaceId} pertenece a dos pools`);
      poolBySurface.set(surfaceId, pool);
    }
  }
  if (!tableOnly) invariant(poolBySurface.size === surfaces.length, 'hay superficies sin pool');
  const heritageBySurface = new Map((fireRedHeritage?.surfaces ?? []).map((surface) => [surface.surfaceId, surface]));
  if (config.inheritanceMode !== 'C0') {
    invariant(surfaces.every((surface) => heritageBySurface.has(surface.surface_id)), 'la fuente FireRed no cubre todas las superficies');
  }
  return {
    ...inputs,
    batchOrder,
    batchIndex,
    batchWindow,
    windowOrder,
    windowIndex,
    speciesByKey,
    policyWildFamilies,
    noSpawnFamilies,
    families,
    surfaces,
    surfaceById,
    surfaceOrder,
    pools,
    poolById,
    poolBySurface,
    heritageBySurface,
  };
}

function timingFor(context, family, surface) {
  const surfaceWindow = context.batchWindow.get(surface.access.effective_access_batch);
  const nativeWindow = family.window.nativeWindow;
  const surfaceIndex = context.windowIndex.get(surfaceWindow);
  const nativeIndex = context.windowIndex.get(nativeWindow);
  invariant(Number.isInteger(surfaceIndex) && Number.isInteger(nativeIndex), `${family.familyKey}: ventana desconocida`);
  const signedDistance = surfaceIndex - nativeIndex;
  return {
    windowDistance: Math.abs(signedDistance),
    preferredDistance: Math.abs(signedDistance),
    position: signedDistance < 0 ? 'early' : (signedDistance > 0 ? 'late' : 'inside'),
    nativeWindow,
    surfaceWindow,
  };
}

function balanceFor(context, family, surface) {
  const index = context.batchIndex.get(surface.access.effective_access_batch);
  const guardrail = context.config.balanceGuardrail;
  const earlyEnd = context.batchIndex.get(guardrail.earlyThroughBatch);
  const midEnd = context.batchIndex.get(guardrail.midThroughBatch);
  if (index <= earlyEnd) {
    return {
      ...evaluateBalanceGuardrail({
        value: family.entryBst,
        reviewAt: guardrail.earlyReviewAtEntryBst,
        blockAt: guardrail.earlyBlockAtEntryBst,
      }),
      entryBst: family.entryBst,
      horizon: 'early',
    };
  }
  if (index <= midEnd) {
    return {
      ...evaluateBalanceGuardrail({
        value: family.entryBst,
        reviewAt: guardrail.midReviewAtEntryBst,
        blockAt: guardrail.midBlockAtEntryBst,
      }),
      entryBst: family.entryBst,
      horizon: 'mid',
    };
  }
  return { status: BALANCE_STATUS.OK, rank: 0, reasons: [], entryBst: family.entryBst, horizon: 'late' };
}

function candidateFor(context, family, surface) {
  if (!family.allowedMethods.includes(surface.method)) return null;
  const requestedContext = surface.context === 'safari' ? 'safari' : 'standard';
  const contextExact = family.captureContexts.includes(requestedContext);
  const ecology = classifyEcologyFit({
    familyHabitats: family.habitats,
    surfaceHabitats: surface.habitat.tags,
    compatibility: context.config.ecologyCompatibility,
  });
  if (ecology.status === ECOLOGY_FIT.INVALID) return null;
  const balance = usesNoTemporalRelief(context)
    ? { status: BALANCE_STATUS.OK, rank: 0, reasons: [], entryBst: family.entryBst, horizon: 'not-evaluated' }
    : balanceFor(context, family, surface);
  if (balance.status === BALANCE_STATUS.BLOCK) return null;
  const timing = timingFor(context, family, surface);
  if (!context.config.timing.allowEarlyDebuts && timing.position === 'early') return null;
  return {
    candidateId: `${family.familyKey}:${surface.surface_id}`,
    family,
    familyKey: family.familyKey,
    surface,
    surfaceId: surface.surface_id,
    ...(usesTableOnlyAllocation(context)
      ? {}
      : { poolId: context.poolBySurface.get(surface.surface_id).poolId }),
    contextFit: contextExact ? 'exact' : 'safari-catalog-shortfall-fallback',
    contextRank: contextExact ? 0 : 1,
    ecology,
    balance,
    heritageRate: context.heritageBySurface.get(surface.surface_id)?.familyRates[family.familyKey] ?? 0,
    ...timing,
  };
}

function candidateTuple(context, candidate, purpose) {
  if (usesDebutPhaseOnly(context)) {
    return debutPhaseSeedTuple(context, candidate, purpose);
  }
  if (usesEcologyWindowRandomFill(context)) {
    return ecologyWindowSeedTuple(context, candidate, purpose);
  }
  if (usesSeededQualityBands(context)) {
    return [
      candidate.contextRank,
      randomizedEcologyBand(context, candidate, purpose),
      candidate.balance.rank,
      timingBand(context, candidate),
      seededKey(context.config.seed, purpose, candidate.surfaceId, candidate.familyKey),
      candidate.ecology.rank,
      candidate.windowDistance,
      candidate.preferredDistance,
    ];
  }
  return [
    candidate.contextRank,
    candidate.ecology.rank,
    candidate.windowDistance,
    candidate.balance.rank,
    candidate.preferredDistance,
    seededKey(context.config.seed, purpose, candidate.poolId, candidate.surfaceId, candidate.familyKey),
  ];
}

function exactDebutTuple(context, candidate, allocation) {
  if (usesSeededQualityBands(context)) {
    return [
      candidate.contextRank,
      randomizedEcologyBand(context, candidate, 'native-debut-reservation'),
      candidate.balance.rank,
      seededKey(
        context.config.seed,
        'native-debut-reservation',
        candidate.surfaceId,
        candidate.familyKey,
      ),
      candidate.ecology.rank,
      allocation.designationBySurface.get(candidate.surfaceId).size,
    ];
  }
  return [
    candidate.contextRank,
    candidate.ecology.rank,
    candidate.balance.rank,
    context.poolById.get(candidate.poolId).members.size,
    allocation.designationBySurface.get(candidate.surfaceId).size,
    seededKey(
      context.config.seed,
      'native-debut-reservation',
      candidate.poolId,
      candidate.surfaceId,
      candidate.familyKey,
    ),
  ];
}

function tableCandidateTuple(context, candidate, allocation, mandatoryKeys) {
  if (usesSeededQualityBands(context)) {
    return [
      mandatoryKeys.has(candidate.familyKey) ? 0 : 1,
      candidate.contextRank,
      randomizedEcologyBand(context, candidate, 'table'),
      candidate.balance.rank,
      timingBand(context, candidate),
      seededKey(context.config.seed, 'table', candidate.surfaceId, candidate.familyKey),
      candidate.ecology.rank,
      candidate.windowDistance,
      candidate.preferredDistance,
      allocation.familyPlacementCount.get(candidate.familyKey),
    ];
  }
  return [
    mandatoryKeys.has(candidate.familyKey) ? 0 : 1,
    candidate.contextRank,
    candidate.ecology.rank,
    candidate.windowDistance,
    candidate.balance.rank,
    candidate.preferredDistance,
    allocation.familyPlacementCount.get(candidate.familyKey),
    seededKey(context.config.seed, 'table', candidate.surfaceId, candidate.familyKey),
  ];
}

function buildCandidates(context) {
  const byFamily = new Map();
  const bySurface = new Map(context.surfaces.map((surface) => [surface.surface_id, []]));
  for (const family of context.families) {
    const rows = context.surfaces.map((surface) => candidateFor(context, family, surface)).filter(Boolean);
    invariant(rows.length > 0, `${family.familyKey} no tiene ninguna superficie candidata`);
    byFamily.set(family.familyKey, rows);
    for (const row of rows) bySurface.get(row.surfaceId).push(row);
  }
  for (const rows of bySurface.values()) rows.sort((left, right) => left.familyKey.localeCompare(right.familyKey));
  return { byFamily, bySurface };
}

function maximumCoverageAssignments(context, candidates, designationBySurface, familyPoolCount) {
  const families = context.families
    .filter((family) => familyPoolCount.get(family.familyKey) === 0)
    .sort((left, right) => {
      const leftDestinations = new Set(candidates.byFamily.get(left.familyKey).map((candidate) => candidate.surfaceId)).size;
      const rightDestinations = new Set(candidates.byFamily.get(right.familyKey).map((candidate) => candidate.surfaceId)).size;
      return leftDestinations - rightDestinations
        || compareScalars(
          seededKey(context.config.seed, 'coverage-flow-family', left.familyKey),
          seededKey(context.config.seed, 'coverage-flow-family', right.familyKey),
        )
        || left.familyKey.localeCompare(right.familyKey);
    });
  if (families.length === 0) {
    return { assignments: [], requested: 0, matched: 0 };
  }

  const surfaces = context.surfaces.filter((surface) => {
    const pool = context.poolBySurface.get(surface.surface_id);
    const surfaceCapacity = Math.min(
      context.config.methodRichness[surface.method].maximum,
      surface.native_capacity,
    ) - designationBySurface.get(surface.surface_id).size;
    return surfaceCapacity > 0 && pool.members.size < pool.contract.maximum;
  });
  const pools = context.pools.filter((pool) => pool.members.size < pool.contract.maximum);
  const source = 0;
  const familyStart = 1;
  const surfaceStart = familyStart + families.length;
  const poolStart = surfaceStart + surfaces.length;
  const sink = poolStart + pools.length;
  const graph = Array.from({ length: sink + 1 }, () => []);
  const addEdge = (from, to, capacity) => {
    const forward = { to, capacity, reverse: graph[to].length, originalCapacity: capacity };
    const reverse = { to: from, capacity: 0, reverse: graph[from].length, originalCapacity: 0 };
    graph[from].push(forward);
    graph[to].push(reverse);
    return forward;
  };
  const surfaceNode = new Map(surfaces.map((surface, index) => [surface.surface_id, surfaceStart + index]));
  const poolNode = new Map(pools.map((pool, index) => [pool.poolId, poolStart + index]));
  const candidateEdges = new Map();

  families.forEach((family, index) => {
    const familyNode = familyStart + index;
    addEdge(source, familyNode, 1);
    const rows = sorted(
      candidates.byFamily.get(family.familyKey).filter((candidate) => surfaceNode.has(candidate.surfaceId)),
      (candidate) => candidateTuple(context, candidate, 'coverage-flow-destination'),
      (candidate) => candidate.candidateId,
    );
    for (const candidate of rows) {
      const edge = addEdge(familyNode, surfaceNode.get(candidate.surfaceId), 1);
      candidateEdges.set(`${family.familyKey}:${candidate.surfaceId}`, { edge, candidate });
    }
  });
  for (const surface of surfaces) {
    const pool = context.poolBySurface.get(surface.surface_id);
    const capacity = Math.min(
      context.config.methodRichness[surface.method].maximum,
      surface.native_capacity,
    ) - designationBySurface.get(surface.surface_id).size;
    addEdge(surfaceNode.get(surface.surface_id), poolNode.get(pool.poolId), capacity);
  }
  for (const pool of pools) {
    addEdge(poolNode.get(pool.poolId), sink, pool.contract.maximum - pool.members.size);
  }

  let flow = 0;
  while (true) {
    const levels = Array(graph.length).fill(-1);
    levels[source] = 0;
    const queue = [source];
    for (let index = 0; index < queue.length; index += 1) {
      const node = queue[index];
      for (const edge of graph[node]) {
        if (edge.capacity > 0 && levels[edge.to] < 0) {
          levels[edge.to] = levels[node] + 1;
          queue.push(edge.to);
        }
      }
    }
    if (levels[sink] < 0) break;
    const nextEdge = Array(graph.length).fill(0);
    const send = (node) => {
      if (node === sink) return 1;
      for (; nextEdge[node] < graph[node].length; nextEdge[node] += 1) {
        const edge = graph[node][nextEdge[node]];
        if (edge.capacity <= 0 || levels[edge.to] !== levels[node] + 1) continue;
        const sent = send(edge.to);
        if (sent > 0) {
          edge.capacity -= sent;
          graph[edge.to][edge.reverse].capacity += sent;
          return sent;
        }
      }
      return 0;
    };
    while (send(source) > 0) flow += 1;
  }

  const assignments = [];
  for (const family of families) {
    const chosen = [...candidateEdges]
      .filter(([key, value]) => key.startsWith(`${family.familyKey}:`) && value.edge.originalCapacity === 1 && value.edge.capacity === 0)
      .map(([, value]) => value.candidate);
    invariant(chosen.length <= 1, `${family.familyKey}: el matching de cobertura eligió más de una superficie`);
    if (chosen.length === 1) assignments.push(chosen[0]);
  }
  return { assignments, requested: families.length, matched: flow };
}

function maximumTableCoverageAssignments(context, candidates, designationBySurface, familyPlacementCount) {
  const families = context.families
    .filter((family) => familyPlacementCount.get(family.familyKey) === 0)
    .sort((left, right) => {
      const leftDestinations = candidates.byFamily.get(left.familyKey).length;
      const rightDestinations = candidates.byFamily.get(right.familyKey).length;
      return leftDestinations - rightDestinations
        || compareScalars(
          seededKey(context.config.seed, 'coverage-flow-family', left.familyKey),
          seededKey(context.config.seed, 'coverage-flow-family', right.familyKey),
        )
        || left.familyKey.localeCompare(right.familyKey);
    });
  if (families.length === 0) return { assignments: [], requested: 0, matched: 0 };

  const surfaces = context.surfaces.filter((surface) => (
    designationBySurface.get(surface.surface_id).size
      < Math.min(tableTotalContract(context, surface).maximum, surface.native_capacity)
  ));
  const source = 0;
  const familyStart = 1;
  const surfaceStart = familyStart + families.length;
  const sink = surfaceStart + surfaces.length;
  const graph = Array.from({ length: sink + 1 }, () => []);
  const addEdge = (from, to, capacity) => {
    const forward = { to, capacity, reverse: graph[to].length, originalCapacity: capacity };
    const reverse = { to: from, capacity: 0, reverse: graph[from].length, originalCapacity: 0 };
    graph[from].push(forward);
    graph[to].push(reverse);
    return forward;
  };
  const surfaceNode = new Map(surfaces.map((surface, index) => [surface.surface_id, surfaceStart + index]));
  const candidateEdges = new Map();

  families.forEach((family, index) => {
    const familyNode = familyStart + index;
    addEdge(source, familyNode, 1);
    const rows = sorted(
      candidates.byFamily.get(family.familyKey).filter((candidate) => surfaceNode.has(candidate.surfaceId)),
      (candidate) => usesEcologyWindowRandomFill(context)
        ? [
            candidate.ecology.rank,
            candidate.windowDistance,
            seededKey(context.config.seed, 'coverage-flow-destination', candidate.surfaceId, candidate.familyKey),
          ]
        : candidateTuple(context, candidate, 'coverage-flow-destination'),
      (candidate) => candidate.candidateId,
    );
    for (const candidate of rows) {
      const edge = addEdge(familyNode, surfaceNode.get(candidate.surfaceId), 1);
      candidateEdges.set(`${family.familyKey}:${candidate.surfaceId}`, { edge, candidate });
    }
  });
  for (const surface of surfaces) {
    const capacity = Math.min(
      tableTotalContract(context, surface).maximum,
      surface.native_capacity,
    ) - designationBySurface.get(surface.surface_id).size;
    addEdge(surfaceNode.get(surface.surface_id), sink, capacity);
  }

  let flow = 0;
  while (true) {
    const levels = Array(graph.length).fill(-1);
    levels[source] = 0;
    const queue = [source];
    for (let index = 0; index < queue.length; index += 1) {
      const node = queue[index];
      for (const edge of graph[node]) {
        if (edge.capacity > 0 && levels[edge.to] < 0) {
          levels[edge.to] = levels[node] + 1;
          queue.push(edge.to);
        }
      }
    }
    if (levels[sink] < 0) break;
    const nextEdge = Array(graph.length).fill(0);
    const send = (node) => {
      if (node === sink) return 1;
      for (; nextEdge[node] < graph[node].length; nextEdge[node] += 1) {
        const edge = graph[node][nextEdge[node]];
        if (edge.capacity <= 0 || levels[edge.to] !== levels[node] + 1) continue;
        const sent = send(edge.to);
        if (sent > 0) {
          edge.capacity -= sent;
          graph[edge.to][edge.reverse].capacity += sent;
          return sent;
        }
      }
      return 0;
    };
    while (send(source) > 0) flow += 1;
  }

  const assignments = [];
  for (const family of families) {
    const chosen = [...candidateEdges]
      .filter(([key, value]) => key.startsWith(`${family.familyKey}:`)
        && value.edge.originalCapacity === 1
        && value.edge.capacity === 0)
      .map(([, value]) => value.candidate);
    invariant(chosen.length <= 1, `${family.familyKey}: el matching eligió más de una tabla`);
    if (chosen.length === 1) assignments.push(chosen[0]);
  }
  return { assignments, requested: families.length, matched: flow };
}

function maximumSplitDebutAssignments(context, candidates, {
  families,
  surfaces,
  capacityForSurface,
  purpose,
}) {
  if (families.length === 0 || surfaces.length === 0) {
    return { assignments: [], requested: families.length, matched: 0, capacity: 0 };
  }
  const source = 0;
  const familyStart = 1;
  const surfaceStart = familyStart + families.length;
  const sink = surfaceStart + surfaces.length;
  const graph = Array.from({ length: sink + 1 }, () => []);
  const addEdge = (from, to, capacity) => {
    const forward = { to, capacity, reverse: graph[to].length, originalCapacity: capacity };
    const reverse = { to: from, capacity: 0, reverse: graph[from].length, originalCapacity: 0 };
    graph[from].push(forward);
    graph[to].push(reverse);
    return forward;
  };
  const surfaceNode = new Map(surfaces.map((surface, index) => [surface.surface_id, surfaceStart + index]));
  const candidateEdges = new Map();

  const orderedFamilies = [...families].sort((left, right) => {
    const leftDestinations = candidates.byFamily.get(left.familyKey)
      .filter((candidate) => surfaceNode.has(candidate.surfaceId)).length;
    const rightDestinations = candidates.byFamily.get(right.familyKey)
      .filter((candidate) => surfaceNode.has(candidate.surfaceId)).length;
    return leftDestinations - rightDestinations
      || context.windowIndex.get(right.window.nativeWindow) - context.windowIndex.get(left.window.nativeWindow)
      || compareScalars(
        seededKey(context.config.seed, `${purpose}-family`, left.familyKey),
        seededKey(context.config.seed, `${purpose}-family`, right.familyKey),
      )
      || left.familyKey.localeCompare(right.familyKey);
  });

  orderedFamilies.forEach((family, index) => {
    const familyNode = familyStart + index;
    addEdge(source, familyNode, 1);
    const rows = sorted(
      candidates.byFamily.get(family.familyKey).filter((candidate) => surfaceNode.has(candidate.surfaceId)),
      (candidate) => candidateTuple(context, candidate, purpose),
      (candidate) => candidate.candidateId,
    );
    for (const candidate of rows) {
      const edge = addEdge(familyNode, surfaceNode.get(candidate.surfaceId), 1);
      candidateEdges.set(`${family.familyKey}:${candidate.surfaceId}`, { edge, candidate });
    }
  });
  let capacity = 0;
  for (const surface of surfaces) {
    const available = Math.max(0, capacityForSurface(surface));
    capacity += available;
    addEdge(surfaceNode.get(surface.surface_id), sink, available);
  }

  let flow = 0;
  while (true) {
    const levels = Array(graph.length).fill(-1);
    levels[source] = 0;
    const queue = [source];
    for (let index = 0; index < queue.length; index += 1) {
      const node = queue[index];
      for (const edge of graph[node]) {
        if (edge.capacity > 0 && levels[edge.to] < 0) {
          levels[edge.to] = levels[node] + 1;
          queue.push(edge.to);
        }
      }
    }
    if (levels[sink] < 0) break;
    const nextEdge = Array(graph.length).fill(0);
    const send = (node) => {
      if (node === sink) return 1;
      for (; nextEdge[node] < graph[node].length; nextEdge[node] += 1) {
        const edge = graph[node][nextEdge[node]];
        if (edge.capacity <= 0 || levels[edge.to] !== levels[node] + 1) continue;
        const sent = send(edge.to);
        if (sent > 0) {
          edge.capacity -= sent;
          graph[edge.to][edge.reverse].capacity += sent;
          return sent;
        }
      }
      return 0;
    };
    while (send(source) > 0) flow += 1;
  }

  const assignments = [];
  for (const family of orderedFamilies) {
    const chosen = [...candidateEdges]
      .filter(([key, value]) => key.startsWith(`${family.familyKey}:`)
        && value.edge.originalCapacity === 1
        && value.edge.capacity === 0)
      .map(([, value]) => value.candidate);
    invariant(chosen.length <= 1, `${family.familyKey}: el matching de debuts eligió más de una tabla`);
    if (chosen.length === 1) assignments.push(chosen[0]);
  }
  return { assignments, requested: families.length, matched: flow, capacity };
}

function allocateBySplitTableComposition(context, candidates) {
  const blockers = [];
  const membersBySurface = new Map(context.surfaces.map((surface) => [surface.surface_id, new Map()]));
  const designationBySurface = new Map(context.surfaces.map((surface) => [surface.surface_id, new Set()]));
  const familyPlacementCount = new Map(context.families.map((family) => [family.familyKey, 0]));
  const debutSurfaceByFamily = new Map();
  const composition = context.config.tableComposition;
  const addFamily = (candidate, reason) => {
    const members = membersBySurface.get(candidate.surfaceId);
    let member = members.get(candidate.familyKey);
    if (!member) {
      invariant(members.size < tableDesignationLimit(context, candidate.surface), `${candidate.surfaceId}: no queda capacidad para ${candidate.familyKey}`);
      member = {
        familyKey: candidate.familyKey,
        familyId: candidate.family.familyId,
        reasons: new Set(),
      };
      members.set(candidate.familyKey, member);
      designationBySurface.get(candidate.surfaceId).add(candidate.familyKey);
      familyPlacementCount.set(candidate.familyKey, familyPlacementCount.get(candidate.familyKey) + 1);
    }
    member.reasons.add(reason);
    if (reason.startsWith('debut-')) {
      invariant(!debutSurfaceByFamily.has(candidate.familyKey), `${candidate.familyKey}: recibió dos debuts reservados`);
      debutSurfaceByFamily.set(candidate.familyKey, candidate.surfaceId);
    }
  };
  const bootstrapWindow = composition.bootstrap.throughNativeWindow;
  const bootstrapSurfaces = context.surfaces.filter((surface) => (
    context.batchWindow.get(surface.access.effective_access_batch) === bootstrapWindow
      && composition.bootstrap.methods.includes(surface.method)
  ));
  const bootstrapFamilies = context.families.filter((family) => family.window.nativeWindow === bootstrapWindow);
  const bootstrap = maximumSplitDebutAssignments(context, candidates, {
    families: bootstrapFamilies,
    surfaces: bootstrapSurfaces,
    capacityForSurface: (surface) => Math.min(
      composition.bootstrap.debutTarget,
      composition.debut.maximum,
      tableDesignationLimit(context, surface),
    ),
    purpose: 'debut-bootstrap',
  });
  for (const candidate of bootstrap.assignments) addFamily(candidate, 'debut-bootstrap');
  if (bootstrap.matched < bootstrap.capacity) {
    blockers.push({
      code: 'debut-bootstrap-capacity',
      requested: bootstrap.capacity,
      matched: bootstrap.matched,
    });
  }

  const remainingFamilies = () => context.families.filter((family) => !debutSurfaceByFamily.has(family.familyKey));
  const targetPass = maximumSplitDebutAssignments(context, candidates, {
    families: remainingFamilies(),
    surfaces: context.surfaces,
    capacityForSurface: (surface) => Math.max(
      0,
      Math.min(composition.debut.target, tableDesignationLimit(context, surface))
        - membersBySurface.get(surface.surface_id).size,
    ),
    purpose: 'debut-target',
  });
  for (const candidate of targetPass.assignments) addFamily(candidate, 'debut-target');

  const maximumPass = maximumSplitDebutAssignments(context, candidates, {
    families: remainingFamilies(),
    surfaces: context.surfaces,
    capacityForSurface: (surface) => Math.max(
      0,
      Math.min(composition.debut.maximum, tableDesignationLimit(context, surface))
        - membersBySurface.get(surface.surface_id).size,
    ),
    purpose: 'debut-maximum-fallback',
  });
  for (const candidate of maximumPass.assignments) addFamily(candidate, 'debut-maximum-fallback');
  if (debutSurfaceByFamily.size < context.families.length) {
    blockers.push({
      code: 'global-debut-coverage',
      requested: context.families.length,
      matched: debutSurfaceByFamily.size,
      missing: remainingFamilies().map((family) => family.familyKey),
    });
  }

  const moveFutureDebut = (surface, purpose) => {
    const options = candidates.bySurface.get(surface.surface_id).filter((candidate) => {
      if (membersBySurface.get(surface.surface_id).has(candidate.familyKey)) return false;
      const previousSurfaceId = debutSurfaceByFamily.get(candidate.familyKey);
      return previousSurfaceId
        && context.surfaceOrder.get(previousSurfaceId) > context.surfaceOrder.get(surface.surface_id);
    });
    const chosen = sorted(
      options,
      (candidate) => candidateTuple(context, candidate, purpose),
      (candidate) => candidate.candidateId,
    )[0] ?? null;
    if (!chosen) return false;
    const previousSurfaceId = debutSurfaceByFamily.get(chosen.familyKey);
    membersBySurface.get(previousSurfaceId).delete(chosen.familyKey);
    designationBySurface.get(previousSurfaceId).delete(chosen.familyKey);
    familyPlacementCount.set(chosen.familyKey, familyPlacementCount.get(chosen.familyKey) - 1);
    debutSurfaceByFamily.delete(chosen.familyKey);
    addFamily(chosen, purpose);
    return true;
  };

  for (const surface of context.surfaces) {
    const members = membersBySurface.get(surface.surface_id);
    const currentDebuts = () => [...members.values()].filter((member) => (
      [...member.reasons].some((reason) => reason.startsWith('debut-'))
    )).length;
    if (currentDebuts() === 0) continue;
    const window = context.batchWindow.get(surface.access.effective_access_batch);
    const target = Math.min(
      window === bootstrapWindow && composition.bootstrap.methods.includes(surface.method)
        ? composition.bootstrap.debutTarget
        : composition.debut.target,
      composition.debut.maximum,
      tableDesignationLimit(context, surface),
    );
    while (currentDebuts() < target && moveFutureDebut(surface, 'debut-target-rebalance')) {
      // Rebalance only consolidates already scheduled future debuts; it never creates one.
    }
  }

  const bestReturnCandidate = (surface, purpose) => sorted(
    candidates.bySurface.get(surface.surface_id).filter((candidate) => {
      if (membersBySurface.get(surface.surface_id).has(candidate.familyKey)) return false;
      const debutSurfaceId = debutSurfaceByFamily.get(candidate.familyKey);
      return debutSurfaceId
        && context.surfaceOrder.get(debutSurfaceId) < context.surfaceOrder.get(surface.surface_id);
    }),
    (candidate) => [
      ...candidateTuple(context, candidate, purpose),
      familyPlacementCount.get(candidate.familyKey),
    ],
    (candidate) => candidate.candidateId,
  )[0] ?? null;

  for (const surface of context.surfaces) {
    const members = membersBySurface.get(surface.surface_id);
    let debutCount = [...members.values()].filter((member) => (
      [...member.reasons].some((reason) => reason.startsWith('debut-'))
    )).length;
    const physicalCapacity = surface.native_capacity;
    const totalTarget = Math.min(composition.total.target, physicalCapacity);
    const totalMinimum = Math.min(composition.total.minimum, physicalCapacity);
    const returnMaximum = Math.min(composition.return.maximum, physicalCapacity - debutCount);
    const returnTarget = Math.min(
      composition.return.target,
      returnMaximum,
      Math.max(0, totalTarget - debutCount),
    );
    let returnCount = 0;
    while (returnCount < returnTarget && members.size < totalTarget) {
      const chosen = bestReturnCandidate(surface, 'return-target');
      if (!chosen) break;
      addFamily(chosen, 'return-target');
      returnCount += 1;
    }
    while (members.size < totalTarget && returnCount < returnMaximum) {
      const chosen = bestReturnCandidate(surface, 'table-total-target');
      if (!chosen) break;
      addFamily(chosen, 'table-total-target');
      returnCount += 1;
    }
    const window = context.batchWindow.get(surface.access.effective_access_batch);
    const isBootstrapTable = window === bootstrapWindow
      && composition.bootstrap.methods.includes(surface.method)
      && debutCount === Math.min(composition.bootstrap.debutTarget, physicalCapacity);
    const acceptedMinimum = isBootstrapTable
      ? Math.min(totalMinimum, composition.bootstrap.debutTarget, physicalCapacity)
      : totalMinimum;
    while (
      members.size < acceptedMinimum
        && debutCount < Math.min(composition.debut.maximum, physicalCapacity)
        && moveFutureDebut(surface, 'debut-minimum-fallback')
    ) {
      debutCount += 1;
    }
    if (members.size < acceptedMinimum) {
      blockers.push({
        code: 'table-total-below-minimum',
        surfaceId: surface.surface_id,
        assigned: members.size,
        minimum: acceptedMinimum,
        debuts: debutCount,
        returns: returnCount,
      });
    }
    const effectiveReturnMinimum = Math.min(
      composition.return.minimum,
      Math.max(0, totalMinimum - debutCount),
      physicalCapacity - debutCount,
    );
    if (returnCount > 0 && returnCount < effectiveReturnMinimum) {
      blockers.push({
        code: 'table-returns-below-minimum',
        surfaceId: surface.surface_id,
        assigned: returnCount,
        minimum: effectiveReturnMinimum,
      });
    }
  }

  return {
    blockers,
    membersBySurface,
    designationBySurface,
    familyPlacementCount,
    familyPoolCount: familyPlacementCount,
    debutSurfaceByFamily,
    inheritanceReservations: [],
  };
}

function allocateByLotDebutTableFill(context, candidates) {
  const blockers = [];
  const membersBySurface = new Map(context.surfaces.map((surface) => [surface.surface_id, new Map()]));
  const designationBySurface = new Map(context.surfaces.map((surface) => [surface.surface_id, new Set()]));
  const familyPlacementCount = new Map(context.families.map((family) => [family.familyKey, 0]));
  const primaryDebutSurfaceByFamily = new Map();
  const debut = context.config.debutAllocation;

  const addFamily = (candidate, reason, { primaryDebut = false } = {}) => {
    const members = membersBySurface.get(candidate.surfaceId);
    let member = members.get(candidate.familyKey);
    if (!member) {
      invariant(
        members.size < tableDesignationLimit(context, candidate.surface),
        `${candidate.surfaceId}: no queda capacidad para ${candidate.familyKey}`,
      );
      member = {
        familyKey: candidate.familyKey,
        familyId: candidate.family.familyId,
        reasons: new Set(),
      };
      members.set(candidate.familyKey, member);
      designationBySurface.get(candidate.surfaceId).add(candidate.familyKey);
      familyPlacementCount.set(candidate.familyKey, familyPlacementCount.get(candidate.familyKey) + 1);
    }
    member.reasons.add(reason);
    if (primaryDebut) {
      invariant(!primaryDebutSurfaceByFamily.has(candidate.familyKey), `${candidate.familyKey}: recibió dos reservas primarias de debut`);
      primaryDebutSurfaceByFamily.set(candidate.familyKey, candidate.surfaceId);
    }
  };

  const bootstrapWindow = debut.bootstrap.throughNativeWindow;
  const bootstrapSurfaces = context.surfaces.filter((surface) => (
    context.batchWindow.get(surface.access.effective_access_batch) === bootstrapWindow
      && debut.bootstrap.methods.includes(surface.method)
  ));
  const bootstrapFamilies = context.families.filter((family) => family.window.nativeWindow === bootstrapWindow);
  const bootstrap = maximumSplitDebutAssignments(context, candidates, {
    families: bootstrapFamilies,
    surfaces: bootstrapSurfaces,
    capacityForSurface: (surface) => Math.min(
      debut.bootstrap.primaryReservationsPerTable,
      debut.maximumPrimaryReservationsPerTable,
      tableDesignationLimit(context, surface),
    ),
    purpose: 'lot-debut-bootstrap',
  });
  for (const candidate of bootstrap.assignments) {
    addFamily(candidate, 'debut-primary-bootstrap', { primaryDebut: true });
  }
  if (bootstrap.matched < bootstrap.capacity) {
    blockers.push({
      code: 'lot-debut-bootstrap-capacity',
      requested: bootstrap.capacity,
      matched: bootstrap.matched,
    });
  }

  const remainingFamilies = () => context.families.filter((family) => (
    !primaryDebutSurfaceByFamily.has(family.familyKey)
  ));
  const targetPass = maximumSplitDebutAssignments(context, candidates, {
    families: remainingFamilies(),
    surfaces: context.surfaces,
    capacityForSurface: (surface) => Math.max(
      0,
      Math.min(debut.targetPrimaryReservationsPerTable, tableDesignationLimit(context, surface))
        - membersBySurface.get(surface.surface_id).size,
    ),
    purpose: 'lot-debut-primary-target',
  });
  for (const candidate of targetPass.assignments) {
    addFamily(candidate, 'debut-primary-target', { primaryDebut: true });
  }

  const maximumPass = maximumSplitDebutAssignments(context, candidates, {
    families: remainingFamilies(),
    surfaces: context.surfaces,
    capacityForSurface: (surface) => Math.max(
      0,
      Math.min(debut.maximumPrimaryReservationsPerTable, tableDesignationLimit(context, surface))
        - membersBySurface.get(surface.surface_id).size,
    ),
    purpose: 'lot-debut-primary-maximum',
  });
  for (const candidate of maximumPass.assignments) {
    addFamily(candidate, 'debut-primary-maximum', { primaryDebut: true });
  }
  if (primaryDebutSurfaceByFamily.size < context.families.length) {
    blockers.push({
      code: 'global-lot-debut-coverage',
      requested: context.families.length,
      matched: primaryDebutSurfaceByFamily.size,
      missing: remainingFamilies().map((family) => family.familyKey),
    });
  }

  const debutBatchByFamily = new Map([...primaryDebutSurfaceByFamily].map(([familyKey, surfaceId]) => [
    familyKey,
    context.surfaceById.get(surfaceId).access.effective_access_batch,
  ]));

  for (const batchId of context.batchOrder) {
    const batchSurfaces = sorted(
      context.surfaces.filter((surface) => surface.access.effective_access_batch === batchId),
      (surface) => [seededKey(context.config.seed, 'lot-table-round-order', batchId, surface.surface_id)],
      (surface) => surface.surface_id,
    );
    const batchPlacementCount = new Map(context.families.map((family) => [family.familyKey, 0]));
    for (const surface of batchSurfaces) {
      for (const familyKey of membersBySurface.get(surface.surface_id).keys()) {
        batchPlacementCount.set(familyKey, batchPlacementCount.get(familyKey) + 1);
      }
    }
    const batchOrderIndex = context.batchIndex.get(batchId);
    let progress = true;
    while (progress && batchSurfaces.some((surface) => (
      membersBySurface.get(surface.surface_id).size
        < Math.min(context.config.tableComposition.total.target, surface.native_capacity)
    ))) {
      progress = false;
      for (const surface of batchSurfaces) {
        const members = membersBySurface.get(surface.surface_id);
        const target = Math.min(context.config.tableComposition.total.target, surface.native_capacity);
        if (members.size >= target) continue;
        const options = candidates.bySurface.get(surface.surface_id).filter((candidate) => {
          if (members.has(candidate.familyKey)) return false;
          const debutBatch = debutBatchByFamily.get(candidate.familyKey);
          return debutBatch && context.batchIndex.get(debutBatch) <= batchOrderIndex;
        });
        const chosen = sorted(
          options,
          (candidate) => [
            candidate.contextRank,
            randomizedEcologyBand(context, candidate, 'lot-table-fill'),
            candidate.balance.rank,
            timingBand(context, candidate),
            batchPlacementCount.get(candidate.familyKey),
            seededKey(context.config.seed, 'lot-table-fill', batchId, surface.surface_id, candidate.familyKey),
            candidate.ecology.rank,
            candidate.windowDistance,
            candidate.preferredDistance,
            familyPlacementCount.get(candidate.familyKey),
          ],
          (candidate) => candidate.candidateId,
        )[0] ?? null;
        if (!chosen) continue;
        const debutBatch = debutBatchByFamily.get(chosen.familyKey);
        addFamily(chosen, debutBatch === batchId ? 'same-lot-repeat-fill' : 'prior-lot-return-fill');
        batchPlacementCount.set(chosen.familyKey, batchPlacementCount.get(chosen.familyKey) + 1);
        progress = true;
      }
    }
    for (const surface of batchSurfaces) {
      const assigned = membersBySurface.get(surface.surface_id).size;
      const minimum = Math.min(context.config.tableComposition.total.minimum, surface.native_capacity);
      if (assigned < minimum) {
        blockers.push({
          code: 'table-total-below-minimum',
          surfaceId: surface.surface_id,
          assigned,
          minimum,
        });
      }
    }
  }

  return {
    blockers,
    membersBySurface,
    designationBySurface,
    familyPlacementCount,
    familyPoolCount: familyPlacementCount,
    debutSurfaceByFamily: primaryDebutSurfaceByFamily,
    primaryDebutSurfaceByFamily,
    debutBatchByFamily,
    inheritanceReservations: [],
  };
}

function allocateByEcologyWindowRandomFill(context, candidates) {
  const blockers = [];
  const membersBySurface = new Map(context.surfaces.map((surface) => [surface.surface_id, new Map()]));
  const designationBySurface = new Map(context.surfaces.map((surface) => [surface.surface_id, new Set()]));
  const familyPlacementCount = new Map(context.families.map((family) => [family.familyKey, 0]));
  const canDesignate = (candidate) => (
    membersBySurface.get(candidate.surfaceId).has(candidate.familyKey)
      || membersBySurface.get(candidate.surfaceId).size < tableDesignationLimit(context, candidate.surface)
  );
  const addFamily = (candidate, reason) => {
    const members = membersBySurface.get(candidate.surfaceId);
    if (members.has(candidate.familyKey)) {
      members.get(candidate.familyKey).reasons.add(reason);
      return;
    }
    invariant(canDesignate(candidate), `${candidate.surfaceId}: no queda capacidad para ${candidate.familyKey}`);
    members.set(candidate.familyKey, {
      familyKey: candidate.familyKey,
      familyId: candidate.family.familyId,
      reasons: new Set([reason]),
    });
    designationBySurface.get(candidate.surfaceId).add(candidate.familyKey);
    familyPlacementCount.set(candidate.familyKey, familyPlacementCount.get(candidate.familyKey) + 1);
  };
  const bestNewCandidate = (surface, purpose) => sorted(
    candidates.bySurface.get(surface.surface_id).filter((candidate) => (
      !membersBySurface.get(surface.surface_id).has(candidate.familyKey)
        && canDesignate(candidate)
    )),
    (candidate) => ecologyWindowSeedTuple(context, candidate, purpose),
    (candidate) => candidate.candidateId,
  )[0] ?? null;

  for (const surface of context.surfaces) {
    const minimum = Math.min(tableTotalContract(context, surface).minimum, surface.native_capacity);
    while (membersBySurface.get(surface.surface_id).size < minimum) {
      const chosen = bestNewCandidate(surface, 'minimum-fill');
      if (!chosen) break;
      addFamily(chosen, 'seeded-minimum-fill');
    }
    const assigned = membersBySurface.get(surface.surface_id).size;
    if (assigned < minimum) {
      blockers.push({ code: 'table-total-below-minimum', surfaceId: surface.surface_id, assigned, minimum });
    }
  }

  const coverage = maximumTableCoverageAssignments(
    context,
    candidates,
    designationBySurface,
    familyPlacementCount,
  );
  for (const candidate of coverage.assignments) addFamily(candidate, 'global-coverage-repair');
  if (coverage.matched < coverage.requested) {
    blockers.push({
      code: 'global-coverage-matching',
      requested: coverage.requested,
      matched: coverage.matched,
    });
  }

  for (const surface of context.surfaces) {
    const contract = tableTotalContract(context, surface);
    const target = Math.min(contract.target, surface.native_capacity);
    while (membersBySurface.get(surface.surface_id).size < target) {
      const chosen = bestNewCandidate(surface, 'target-fill');
      if (!chosen) break;
      addFamily(chosen, 'seeded-target-fill');
    }
    const assigned = membersBySurface.get(surface.surface_id).size;
    const minimum = Math.min(contract.minimum, surface.native_capacity);
    const maximum = Math.min(contract.maximum, surface.native_capacity);
    if (assigned < minimum) blockers.push({ code: 'table-total-below-minimum', surfaceId: surface.surface_id, assigned, minimum });
    if (assigned > maximum) blockers.push({ code: 'table-total-above-maximum', surfaceId: surface.surface_id, assigned, maximum });
  }

  return {
    blockers,
    membersBySurface,
    designationBySurface,
    familyPlacementCount,
    familyPoolCount: familyPlacementCount,
    inheritanceReservations: [],
  };
}

function allocateDebutPhaseOnly(context, candidates) {
  const membersBySurface = new Map(
    context.surfaces.map((surface) => [surface.surface_id, new Map()]),
  );
  const designationBySurface = new Map(
    context.surfaces.map((surface) => [surface.surface_id, new Set()]),
  );
  const familyPlacementCount = new Map(
    context.families.map((family) => [family.familyKey, 0]),
  );
  const debutedFamilies = new Set();

  for (const surface of context.surfaces) {
    const maximum = Math.min(
      debutMaximumForSurface(context, surface),
      surface.native_capacity,
    );
    const eligible = candidates.bySurface.get(surface.surface_id).filter(
      (candidate) => !debutedFamilies.has(candidate.familyKey),
    );
    const ordered = sorted(
      eligible,
      (candidate) => debutPhaseSeedTuple(context, candidate, 'debut-phase'),
      (candidate) => candidate.candidateId,
    );
    for (const candidate of ordered.slice(0, maximum)) {
      const bucket = `p${candidate.ecology.rank + 1}v${candidate.windowDistance}`;
      membersBySurface.get(surface.surface_id).set(candidate.familyKey, {
        familyKey: candidate.familyKey,
        familyId: candidate.family.familyId,
        reasons: new Set([`debut-${bucket}`]),
      });
      designationBySurface.get(surface.surface_id).add(candidate.familyKey);
      familyPlacementCount.set(candidate.familyKey, 1);
      debutedFamilies.add(candidate.familyKey);
    }
  }

  return {
    blockers: [],
    membersBySurface,
    designationBySurface,
    familyPlacementCount,
    familyPoolCount: familyPlacementCount,
    inheritanceReservations: [],
  };
}

function allocateWindowDebutQueue(context, candidates) {
  const membersBySurface = new Map(
    context.surfaces.map((surface) => [surface.surface_id, new Map()]),
  );
  const designationBySurface = new Map(
    context.surfaces.map((surface) => [surface.surface_id, new Set()]),
  );
  const familyPlacementCount = new Map(
    context.families.map((family) => [family.familyKey, 0]),
  );
  const debutedFamilies = new Set();
  const primaryDebutSurfaceByFamily = new Map();
  const familyByKey = new Map(
    context.families.map((family) => [family.familyKey, family]),
  );

  const assignPhase = (window, surfaces, ecologyRank) => {
    const phase = `p${ecologyRank + 1}`;
    const surfaceIds = new Set(surfaces.map((surface) => surface.surface_id));
    const availableSlots = surfaces.flatMap((surface) => {
      const limit = Math.min(
        debutMaximumForSurface(context, surface),
        surface.native_capacity,
      );
      const occupied = membersBySurface.get(surface.surface_id).size;
      return Array.from(
        { length: Math.max(0, limit - occupied) },
        (_, index) => `${surface.surface_id}\u0000${occupied + index}`,
      );
    });
    if (availableSlots.length === 0) return;

    const slotSurface = new Map(
      availableSlots.map((slotId) => [slotId, slotId.split('\u0000')[0]]),
    );
    const slotsByFamily = new Map();
    const eligibleFamilies = context.families.filter((family) => {
      if (debutedFamilies.has(family.familyKey)) return false;
      if (context.windowIndex.get(family.window.nativeWindow) > context.windowIndex.get(window)) {
        return false;
      }
      const surfaceCandidates = candidates.byFamily.get(family.familyKey).filter((candidate) => (
        surfaceIds.has(candidate.surfaceId) && candidate.ecology.rank === ecologyRank
      ));
      if (surfaceCandidates.length === 0) return false;
      const candidateSurfaceIds = new Set(surfaceCandidates.map((candidate) => candidate.surfaceId));
      const slots = availableSlots.filter((slotId) => candidateSurfaceIds.has(slotSurface.get(slotId)));
      slotsByFamily.set(family.familyKey, slots.sort((left, right) => (
        compareScalars(
          seededKey(context.config.seed, 'window-debut-destination', window, phase, family.familyKey, left),
          seededKey(context.config.seed, 'window-debut-destination', window, phase, family.familyKey, right),
        ) || left.localeCompare(right)
      )));
      return slots.length > 0;
    }).sort((left, right) => (
      context.windowIndex.get(left.window.nativeWindow)
        - context.windowIndex.get(right.window.nativeWindow)
      || compareScalars(
        seededKey(context.config.seed, 'window-debut-family', window, phase, left.familyKey),
        seededKey(context.config.seed, 'window-debut-family', window, phase, right.familyKey),
      )
      || left.familyKey.localeCompare(right.familyKey)
    ));

    const familyBySlot = new Map();
    const place = (familyKey, visitedSlots) => {
      for (const slotId of slotsByFamily.get(familyKey) ?? []) {
        if (visitedSlots.has(slotId)) continue;
        visitedSlots.add(slotId);
        const occupant = familyBySlot.get(slotId);
        if (!occupant || place(occupant, visitedSlots)) {
          familyBySlot.set(slotId, familyKey);
          return true;
        }
      }
      return false;
    };

    for (const family of eligibleFamilies) place(family.familyKey, new Set());

    for (const [slotId, familyKey] of familyBySlot) {
      const surfaceId = slotSurface.get(slotId);
      const family = familyByKey.get(familyKey);
      const candidate = candidates.bySurface.get(surfaceId)
        .find((row) => row.familyKey === familyKey && row.ecology.rank === ecologyRank);
      invariant(candidate && family, `${window}/${phase}/${familyKey}: matching sin candidato`);
      const bucket = `${phase}v${candidate.windowDistance}`;
      membersBySurface.get(surfaceId).set(familyKey, {
        familyKey,
        familyId: family.familyId,
        reasons: new Set([`debut-${bucket}`, `window-${window}`]),
      });
      designationBySurface.get(surfaceId).add(familyKey);
      familyPlacementCount.set(familyKey, 1);
      debutedFamilies.add(familyKey);
      primaryDebutSurfaceByFamily.set(familyKey, surfaceId);
    }
  };

  for (const window of context.windowOrder) {
    const surfaces = context.surfaces.filter((surface) => (
      context.batchWindow.get(surface.access.effective_access_batch) === window
    ));
    assignPhase(window, surfaces, 0);
    assignPhase(window, surfaces, 1);
  }

  return {
    blockers: [],
    membersBySurface,
    designationBySurface,
    familyPlacementCount,
    familyPoolCount: familyPlacementCount,
    inheritanceReservations: [],
    primaryDebutSurfaceByFamily,
  };
}

function seededFillTarget(context, surface) {
  const sample = seededFraction(
    context.config.seed,
    'window-fill-target',
    surface.surface_id,
  ) * 100;
  const distribution = tableTargetDistribution(context.config);
  let cumulative = 0;
  const requested = distribution.find((row) => {
    cumulative += row.percent;
    return sample < cumulative;
  })?.families ?? distribution.at(-1).families;
  return Math.min(requested, surface.native_capacity);
}

function allocateWindowFill(context, candidates) {
  const allocation = allocateWindowDebutQueue(context, candidates);
  const debutWindowByFamily = new Map(
    [...allocation.primaryDebutSurfaceByFamily].map(([familyKey, surfaceId]) => [
      familyKey,
      context.batchWindow.get(context.surfaceById.get(surfaceId).access.effective_access_batch),
    ]),
  );
  const targets = new Map(
    context.surfaces.map((surface) => [surface.surface_id, seededFillTarget(context, surface)]),
  );
  const windowUsage = new Map();
  const lotUsage = new Map();
  const placementCount = (usage, scope, familyKey) => (
    usage.get(scope)?.get(familyKey) ?? 0
  );
  const incrementPlacement = (usage, scope, familyKey) => {
    if (!usage.has(scope)) usage.set(scope, new Map());
    const counts = usage.get(scope);
    counts.set(familyKey, (counts.get(familyKey) ?? 0) + 1);
  };

  for (const surface of context.surfaces) {
    const window = context.batchWindow.get(surface.access.effective_access_batch);
    const lot = surface.access.effective_access_batch;
    for (const familyKey of allocation.membersBySurface.get(surface.surface_id).keys()) {
      incrementPlacement(windowUsage, window, familyKey);
      incrementPlacement(lotUsage, lot, familyKey);
    }
  }

  for (const window of context.windowOrder) {
    const surfaces = context.surfaces.filter((surface) => (
      context.batchWindow.get(surface.access.effective_access_batch) === window
    ));
    const previousSameMethod = new Map();
    const latestByMethod = new Map();
    for (const surface of surfaces) {
      previousSameMethod.set(surface.surface_id, latestByMethod.get(surface.method) ?? null);
      latestByMethod.set(surface.method, surface.surface_id);
    }
    const maximumRounds = Math.max(...surfaces.map((surface) => targets.get(surface.surface_id)), 0);
    for (let round = 0; round < maximumRounds; round += 1) {
      for (const surface of surfaces) {
        const surfaceId = surface.surface_id;
        const members = allocation.membersBySurface.get(surfaceId);
        if (members.size >= targets.get(surfaceId)) continue;
        const lot = surface.access.effective_access_batch;
        const previousSurfaceId = previousSameMethod.get(surfaceId);
        const previousMembers = previousSurfaceId
          ? allocation.membersBySurface.get(previousSurfaceId)
          : null;
        const eligible = candidates.bySurface.get(surfaceId).filter((candidate) => {
          if (members.has(candidate.familyKey)) return false;
          const debutWindow = debutWindowByFamily.get(candidate.familyKey);
          return debutWindow
            && context.windowIndex.get(debutWindow) <= context.windowIndex.get(window);
        });
        const chosen = sorted(
          eligible,
          (candidate) => {
            const usedInLot = placementCount(lotUsage, lot, candidate.familyKey) > 0;
            const usedInPrevious = previousMembers?.has(candidate.familyKey) ?? false;
            const freshnessBand = !usedInLot && !usedInPrevious
              ? candidate.ecology.rank
              : !usedInPrevious
                ? 2 + candidate.ecology.rank
                : 4 + candidate.ecology.rank;
            return [
              freshnessBand,
              candidate.contextRank,
              placementCount(windowUsage, window, candidate.familyKey),
              candidate.windowDistance,
              seededKey(
                context.config.seed,
                'window-fill-family',
                window,
                String(round),
                surfaceId,
                candidate.familyKey,
              ),
            ];
          },
          (candidate) => candidate.candidateId,
        )[0];
        if (!chosen) continue;
        const usedInLot = placementCount(lotUsage, lot, chosen.familyKey) > 0;
        const usedInPrevious = previousMembers?.has(chosen.familyKey) ?? false;
        const freshness = usedInPrevious ? 'adjacent' : usedInLot ? 'reused' : 'fresh';
        members.set(chosen.familyKey, {
          familyKey: chosen.familyKey,
          familyId: chosen.family.familyId,
          reasons: new Set([`fill-${freshness}-${chosen.ecology.status}`, `window-${window}`]),
        });
        allocation.designationBySurface.get(surfaceId).add(chosen.familyKey);
        allocation.familyPlacementCount.set(
          chosen.familyKey,
          allocation.familyPlacementCount.get(chosen.familyKey) + 1,
        );
        incrementPlacement(windowUsage, window, chosen.familyKey);
        incrementPlacement(lotUsage, lot, chosen.familyKey);
      }
    }
  }

  for (const surface of context.surfaces) {
    const assigned = allocation.membersBySurface.get(surface.surface_id).size;
    const minimum = minimumForSurface(context.config, surface);
    if (assigned < minimum) {
      allocation.blockers.push({
        code: 'window-fill-below-minimum',
        surfaceId: surface.surface_id,
        assigned,
        minimum,
      });
    }
  }
  allocation.fillTargetsBySurface = targets;
  allocation.debutWindowByFamily = debutWindowByFamily;
  return allocation;
}

function allocateByTable(context, candidates) {
  if (usesWindowDebutFill(context)) {
    return allocateWindowFill(context, candidates);
  }
  if (usesWindowDebutQueue(context)) {
    return allocateWindowDebutQueue(context, candidates);
  }
  if (usesDebutPhaseOnly(context)) {
    return allocateDebutPhaseOnly(context, candidates);
  }
  if (usesEcologyWindowRandomFill(context)) {
    return allocateByEcologyWindowRandomFill(context, candidates);
  }
  if (usesLotDebutTableFill(context)) {
    return allocateByLotDebutTableFill(context, candidates);
  }
  if (usesSplitTableComposition(context)) {
    return allocateBySplitTableComposition(context, candidates);
  }
  const blockers = [];
  const membersBySurface = new Map(context.surfaces.map((surface) => [surface.surface_id, new Map()]));
  const designationBySurface = new Map(context.surfaces.map((surface) => [surface.surface_id, new Set()]));
  const familyPlacementCount = new Map(context.families.map((family) => [family.familyKey, 0]));
  const designationLimit = (surface) => Math.min(
    context.config.methodRichness[surface.method].maximum,
    surface.native_capacity,
  );
  const canDesignate = (candidate) => (
    membersBySurface.get(candidate.surfaceId).has(candidate.familyKey)
      || membersBySurface.get(candidate.surfaceId).size < designationLimit(candidate.surface)
  );
  const addFamily = (candidate, reason) => {
    const members = membersBySurface.get(candidate.surfaceId);
    let member = members.get(candidate.familyKey);
    if (!member) {
      invariant(canDesignate(candidate), `${candidate.surfaceId}: no queda capacidad para ${candidate.familyKey}`);
      member = {
        familyKey: candidate.familyKey,
        familyId: candidate.family.familyId,
        reasons: new Set(),
      };
      members.set(candidate.familyKey, member);
      designationBySurface.get(candidate.surfaceId).add(candidate.familyKey);
      familyPlacementCount.set(candidate.familyKey, familyPlacementCount.get(candidate.familyKey) + 1);
    }
    member.reasons.add(reason);
  };
  const bestNewCandidate = (surface, purpose) => sorted(
    candidates.bySurface.get(surface.surface_id).filter((candidate) => (
      !membersBySurface.get(surface.surface_id).has(candidate.familyKey)
      && canDesignate(candidate)
    )),
    (candidate) => [
      ...candidateTuple(context, candidate, purpose),
      familyPlacementCount.get(candidate.familyKey),
      membersBySurface.get(surface.surface_id).size,
    ],
    (candidate) => candidate.candidateId,
  )[0] ?? null;

  const inheritanceReservations = [];
  const inheritanceLimit = context.config.fireRedInheritance.maximumReservationsPerTable;
  for (const surface of context.surfaces) {
    if (inheritanceLimit > 0) {
      const rows = candidates.bySurface.get(surface.surface_id)
        .filter((candidate) => candidate.heritageRate > 0 && canDesignate(candidate))
        .map((candidate) => ({
          familyKey: candidate.familyKey,
          tableId: surface.surface_id,
          exactFireRed: true,
          eligibleForInheritance: true,
          vanillaMass: candidate.heritageRate,
          baseTuple: [
            candidate.contextRank,
            candidate.ecology.rank,
            candidate.windowDistance,
            candidate.balance.rank,
          ],
          candidate,
        }));
      for (const reservation of selectFireRedTableReservations({
        mode: context.config.inheritanceMode,
        tableId: surface.surface_id,
        candidates: rows,
      })) {
        if (!canDesignate(reservation.candidate)) continue;
        addFamily(reservation.candidate, 'firered-inheritance');
        inheritanceReservations.push({
          tableId: surface.surface_id,
          surfaceId: surface.surface_id,
          method: surface.method,
          familyKey: reservation.candidate.familyKey,
          vanillaMass: reservation.candidate.heritageRate,
        });
      }
    }
    const minimum = Math.min(context.config.methodRichness[surface.method].minimum, surface.native_capacity);
    while (membersBySurface.get(surface.surface_id).size < minimum) {
      const chosen = bestNewCandidate(surface, 'surface-minimum');
      if (!chosen) break;
      addFamily(chosen, 'surface-minimum');
    }
    if (membersBySurface.get(surface.surface_id).size < minimum) {
      blockers.push({
        code: 'surface-candidate-minimum',
        surfaceId: surface.surface_id,
        assigned: membersBySurface.get(surface.surface_id).size,
        minimum,
      });
    }
  }

  const exactDebutOrder = [...context.families].sort((left, right) => {
    const leftTables = candidates.byFamily.get(left.familyKey)
      .filter((candidate) => candidate.windowDistance === 0).length;
    const rightTables = candidates.byFamily.get(right.familyKey)
      .filter((candidate) => candidate.windowDistance === 0).length;
    return leftTables - rightTables
      || context.windowIndex.get(left.window.nativeWindow) - context.windowIndex.get(right.window.nativeWindow)
      || compareScalars(
        seededKey(context.config.seed, 'native-debut-order', left.familyKey),
        seededKey(context.config.seed, 'native-debut-order', right.familyKey),
      )
      || left.familyKey.localeCompare(right.familyKey);
  });
  const hasExactDesignation = (family) => candidates.byFamily.get(family.familyKey).some((candidate) => (
    candidate.windowDistance === 0
      && membersBySurface.get(candidate.surfaceId).has(family.familyKey)
  ));
  for (const family of exactDebutOrder.filter((entry) => !hasExactDesignation(entry))) {
    const exact = candidates.byFamily.get(family.familyKey).filter((candidate) => (
      candidate.windowDistance === 0 && canDesignate(candidate)
    ));
    if (exact.length === 0) continue;
    const chosen = sorted(
      exact,
      (candidate) => exactDebutTuple(context, candidate, { designationBySurface }),
      (candidate) => candidate.candidateId,
    )[0];
    addFamily(chosen, 'native-debut-reservation');
  }

  const coverage = maximumTableCoverageAssignments(
    context,
    candidates,
    designationBySurface,
    familyPlacementCount,
  );
  for (const candidate of coverage.assignments) addFamily(candidate, 'guaranteed-coverage');
  if (coverage.matched < coverage.requested) {
    blockers.push({
      code: 'global-coverage-matching',
      requested: coverage.requested,
      matched: coverage.matched,
    });
  }

  for (const surface of context.surfaces) {
    const contract = context.config.methodRichness[surface.method];
    const target = Math.min(contract.target, designationLimit(surface));
    while (membersBySurface.get(surface.surface_id).size < target) {
      const chosen = bestNewCandidate(surface, 'table-target');
      if (!chosen) break;
      addFamily(chosen, 'table-target');
    }
    const size = membersBySurface.get(surface.surface_id).size;
    const minimum = Math.min(contract.minimum, surface.native_capacity);
    const maximum = designationLimit(surface);
    if (size < minimum) blockers.push({ code: 'surface-richness-below-minimum', surfaceId: surface.surface_id, assigned: size, minimum });
    if (size > maximum) blockers.push({ code: 'surface-richness-above-maximum', surfaceId: surface.surface_id, assigned: size, maximum });
  }

  return {
    blockers,
    membersBySurface,
    designationBySurface,
    familyPlacementCount,
    familyPoolCount: familyPlacementCount,
    inheritanceReservations,
  };
}

function allocate(context, candidates) {
  if (usesTableOnlyAllocation(context)) return allocateByTable(context, candidates);
  const blockers = [];
  const designationBySurface = new Map(context.surfaces.map((surface) => [surface.surface_id, new Set()]));
  const familyPoolCount = new Map(context.families.map((family) => [family.familyKey, 0]));

  const designationLimit = (surface) => Math.min(
    context.config.methodRichness[surface.method].maximum,
    surface.native_capacity,
  );
  const canDesignate = (candidate) => designationBySurface.get(candidate.surfaceId).size < designationLimit(candidate.surface);
  const addFamily = (pool, candidate, reason) => {
    let member = pool.members.get(candidate.familyKey);
    if (!member) {
      member = {
        familyKey: candidate.familyKey,
        familyId: candidate.family.familyId,
        reasons: new Set(),
        designatedSurfaceIds: new Set(),
      };
      pool.members.set(candidate.familyKey, member);
      familyPoolCount.set(candidate.familyKey, familyPoolCount.get(candidate.familyKey) + 1);
    }
    member.reasons.add(reason);
    if (member.designatedSurfaceIds.size === 0 || ['surface-minimum', 'firered-inheritance'].includes(reason)) {
      invariant(canDesignate(candidate) || designationBySurface.get(candidate.surfaceId).has(candidate.familyKey), `${candidate.surfaceId}: no queda capacidad para designar ${candidate.familyKey}`);
      member.designatedSurfaceIds.add(candidate.surfaceId);
      designationBySurface.get(candidate.surfaceId).add(candidate.familyKey);
    }
    return member;
  };

  const bestNewCandidate = (pool, surface = null, purpose = 'pool-fill') => {
    const rows = (surface ? candidates.bySurface.get(surface.surface_id) : pool.surfaceIds.flatMap((surfaceId) => candidates.bySurface.get(surfaceId)))
      .filter((candidate) => candidate.poolId === pool.poolId && !pool.members.has(candidate.familyKey) && canDesignate(candidate));
    return sorted(rows, (candidate) => [
      ...candidateTuple(context, candidate, purpose),
      familyPoolCount.get(candidate.familyKey),
      designationBySurface.get(candidate.surfaceId).size,
      -designationLimit(candidate.surface),
    ], (candidate) => candidate.candidateId)[0] ?? null;
  };

  const earliestDesignationOrder = (member) => Math.min(
    ...[...member.designatedSurfaceIds].map((surfaceId) => context.surfaceOrder.get(surfaceId)),
  );
  const bestMinimumCandidate = (pool, surface) => {
    const currentOrder = context.surfaceOrder.get(surface.surface_id);
    const rows = candidates.bySurface.get(surface.surface_id).filter((candidate) => {
      const member = pool.members.get(candidate.familyKey);
      if (member && earliestDesignationOrder(member) <= currentOrder) return false;
      if (!member && pool.members.size >= pool.contract.maximum) return false;
      return canDesignate(candidate);
    });
    return sorted(rows, (candidate) => [
      ...candidateTuple(context, candidate, 'surface-minimum'),
      pool.members.has(candidate.familyKey) ? 0 : 1,
      familyPoolCount.get(candidate.familyKey),
      designationBySurface.get(candidate.surfaceId).size,
    ], (candidate) => candidate.candidateId)[0] ?? null;
  };

  // C1/C2 no heredan una corrida. En cada tabla exacta reservan primero hasta
  // una o dos familias del FireRed prístino; recién después se completa el
  // mínimo y el resto de esa tabla. Las reservas viven dentro del objetivo
  // normal del pool: la plaza opcional hasta el máximo queda para cobertura y
  // alivio.
  const inheritanceReservations = [];
  const inheritanceLimit = context.config.fireRedInheritance.maximumReservationsPerTable;

  for (const pool of context.pools) {
    const orderedSurfaceIds = [...pool.surfaceIds].sort((left, right) => (
      context.surfaceOrder.get(left) - context.surfaceOrder.get(right) || left.localeCompare(right)
    ));
    for (const surfaceId of orderedSurfaceIds) {
      const surface = context.surfaceById.get(surfaceId);
      if (inheritanceLimit > 0) {
        const rows = candidates.bySurface.get(surfaceId)
          .filter((candidate) => candidate.heritageRate > 0 && canDesignate(candidate))
          .map((candidate) => ({
            familyKey: candidate.familyKey,
            tableId: surfaceId,
            exactFireRed: true,
            eligibleForInheritance: true,
            vanillaMass: candidate.heritageRate,
            baseTuple: [
              candidate.contextRank,
              candidate.ecology.rank,
              candidate.windowDistance,
              candidate.balance.rank,
            ],
            candidate,
          }));
        const ranked = selectFireRedTableReservations({
          mode: context.config.inheritanceMode,
          tableId: surfaceId,
          candidates: rows,
        });
        for (const reservation of ranked) {
          const candidate = reservation.candidate;
          if (!canDesignate(candidate)) continue;
          if (!pool.members.has(candidate.familyKey) && pool.members.size >= pool.contract.target) continue;
          addFamily(pool, candidate, 'firered-inheritance');
          inheritanceReservations.push({
            tableId: surfaceId,
            surfaceId,
            poolId: pool.poolId,
            method: surface.method,
            familyKey: candidate.familyKey,
            vanillaMass: candidate.heritageRate,
          });
        }
      }

      const minimum = Math.min(context.config.methodRichness[surface.method].minimum, surface.native_capacity);
      const eligibleCount = () => [...pool.members.keys()].filter((familyKey) => (
        candidates.bySurface.get(surfaceId).some((candidate) => candidate.familyKey === familyKey)
        && earliestDesignationOrder(pool.members.get(familyKey)) <= context.surfaceOrder.get(surfaceId)
      )).length;
      while (eligibleCount() < minimum) {
        const chosen = bestMinimumCandidate(pool, surface);
        if (!chosen) break;
        addFamily(pool, chosen, 'surface-minimum');
      }
      if (eligibleCount() < minimum) {
        blockers.push({
          code: 'surface-candidate-minimum',
          surfaceId,
          assigned: eligibleCount(),
          minimum,
        });
      }
    }
  }

  // Con C y los mínimos de tabla ya protegidos, los debuts exactos se asignan
  // antes de completar los retornos de cada pool.
  const exactDebutOrder = [...context.families].sort((left, right) => {
    const leftPools = new Set(candidates.byFamily.get(left.familyKey)
      .filter((candidate) => candidate.windowDistance === 0)
      .map((candidate) => candidate.poolId)).size;
    const rightPools = new Set(candidates.byFamily.get(right.familyKey)
      .filter((candidate) => candidate.windowDistance === 0)
      .map((candidate) => candidate.poolId)).size;
    return leftPools - rightPools
      || context.windowIndex.get(left.window.nativeWindow) - context.windowIndex.get(right.window.nativeWindow)
      || compareScalars(seededKey(context.config.seed, 'native-debut-order', left.familyKey), seededKey(context.config.seed, 'native-debut-order', right.familyKey))
      || left.familyKey.localeCompare(right.familyKey);
  });
  const hasExactDesignation = (family) => candidates.byFamily.get(family.familyKey).some((candidate) => (
    candidate.windowDistance === 0
    && context.poolById.get(candidate.poolId).members.get(family.familyKey)?.designatedSurfaceIds.has(candidate.surfaceId)
  ));
  for (const family of exactDebutOrder.filter((entry) => !hasExactDesignation(entry))) {
    const exact = candidates.byFamily.get(family.familyKey).filter((candidate) => {
      const pool = context.poolById.get(candidate.poolId);
      return candidate.windowDistance === 0
        && pool.members.size < pool.contract.maximum
        && canDesignate(candidate);
    });
    if (exact.length === 0) continue;
    const chosen = sorted(
      exact,
      (candidate) => exactDebutTuple(context, candidate, { designationBySurface }),
      (candidate) => candidate.candidateId,
    )[0];
    addFamily(context.poolById.get(chosen.poolId), chosen, 'native-debut-reservation');
  }

  if (usesSeededQualityBands(context)) {
    const coverage = maximumCoverageAssignments(
      context,
      candidates,
      designationBySurface,
      familyPoolCount,
    );
    for (const candidate of coverage.assignments) {
      addFamily(context.poolById.get(candidate.poolId), candidate, 'guaranteed-coverage');
    }
    if (coverage.matched < coverage.requested) {
      blockers.push({
        code: 'global-coverage-matching',
        requested: coverage.requested,
        matched: coverage.matched,
      });
    }
  }

  for (const pool of context.pools) {
    while (pool.members.size < pool.contract.target) {
      const chosen = bestNewCandidate(pool, null, 'pool-target');
      if (!chosen) break;
      addFamily(pool, chosen, 'pool-target');
    }
  }

  // Los mínimos locales se resuelven antes de garantizar cobertura global. Así
  // una familia con pocos destinos no llena un pool con miembros que no pueden
  // materializar sus métodos. La cobertura usa sólo el lugar opcional hasta el
  // máximo del contrato y nunca desplaza la composición ya válida.
  const familyOrder = [...context.families].sort((left, right) => {
    const leftPools = new Set(candidates.byFamily.get(left.familyKey).filter((candidate) => candidate.windowDistance === 0).map((candidate) => candidate.poolId)).size;
    const rightPools = new Set(candidates.byFamily.get(right.familyKey).filter((candidate) => candidate.windowDistance === 0).map((candidate) => candidate.poolId)).size;
    return leftPools - rightPools
      || context.windowIndex.get(left.window.nativeWindow) - context.windowIndex.get(right.window.nativeWindow)
      || compareScalars(seededKey(context.config.seed, 'family-order', left.familyKey), seededKey(context.config.seed, 'family-order', right.familyKey))
      || left.familyKey.localeCompare(right.familyKey);
  });
  for (const family of familyOrder.filter((entry) => familyPoolCount.get(entry.familyKey) === 0)) {
    const eligible = candidates.byFamily.get(family.familyKey).filter((candidate) => {
      const pool = context.poolById.get(candidate.poolId);
      return pool.members.size < pool.contract.maximum && canDesignate(candidate);
    });
    if (eligible.length === 0) {
      blockers.push({ code: 'family-no-capacity', familyKey: family.familyKey });
      continue;
    }
    const chosen = sorted(eligible, (candidate) => [
      ...candidateTuple(context, candidate, 'guaranteed-coverage'),
      context.poolById.get(candidate.poolId).members.size,
      designationBySurface.get(candidate.surfaceId).size,
      -designationLimit(candidate.surface),
    ], (candidate) => candidate.candidateId)[0];
    addFamily(context.poolById.get(chosen.poolId), chosen, 'guaranteed-coverage');
  }

  for (const pool of context.pools) {
    const size = evaluatePoolSize(pool.members.size, pool.contract);
    if (size.status !== 'within') blockers.push({ code: 'pool-size', poolId: pool.poolId, ...size });
  }

  return {
    blockers,
    designationBySurface,
    familyPoolCount,
    familyPlacementCount: familyPoolCount,
    inheritanceReservations,
  };
}

function applyTableTemporalRelief(context, candidates, allocation, preliminary) {
  const policy = context.config.temporalRelief;
  const provisionalDebuts = preliminary.tables.flatMap((table) => table.familyDetails
    .filter((detail) => detail.availabilityRole === 'debut')
    .map((detail) => ({ ...detail, surfaceId: table.surfaceId })));
  const provisionalDebutByFamily = new Map(provisionalDebuts.map((debut) => [debut.familyKey, debut]));
  const provisionalTableById = new Map(preliminary.tables.map((table) => [table.surfaceId, table]));
  const reliefTableIds = new Set();
  const reliefSourceRemovalCount = new Map();
  const maximumEcologyRank = policy.maximumEcologyFit === 'exact' ? 0 : 1;
  const reliefCandidatesFor = (debut) => candidates.byFamily.get(debut.familyKey).flatMap((candidate) => {
    const members = allocation.membersBySurface.get(candidate.surfaceId);
    const contract = tableTotalContract(context, candidate.surface);
    const maximum = Math.min(contract.maximum, candidate.surface.native_capacity);
    const provisionalTable = provisionalTableById.get(candidate.surfaceId);
    const provisionalDebutCount = provisionalTable?.metrics.debuts.length ?? 0;
    const previousTable = provisionalTableById.get(debut.surfaceId);
    const previousSurface = context.surfaceById.get(debut.surfaceId);
    const previousMinimum = previousTable && previousSurface
      ? Math.min(tableTotalContract(context, previousSurface).minimum, previousTable.nativeCapacity)
      : 0;
    if (candidate.windowDistance !== policy.requiredTimingDistance
      || candidate.position !== 'inside'
      || candidate.surface.method !== 'land'
      || members.size < Math.min(contract.target, maximum)
      || (usesSplitTableComposition(context)
        && provisionalDebutCount >= context.config.tableComposition.debut.maximum)
      || (usesLotDebutTableFill(context)
        && provisionalDebutCount >= context.config.debutAllocation.maximumPrimaryReservationsPerTable)
      || members.has(candidate.familyKey)
      || reliefTableIds.has(candidate.surfaceId)
      || candidate.contextRank !== 0
      || candidate.ecology.rank > maximumEcologyRank
      || (usesExplicitDebutAllocation(context)
        && previousTable.metrics.familyRichness
          - (reliefSourceRemovalCount.get(debut.surfaceId) ?? 0)
          - 1 < previousMinimum)) return [];
    if (members.size < maximum) return [{ candidate, displaced: null }];
    return [...members.values()].flatMap((member) => {
      const memberDebut = provisionalDebutByFamily.get(member.familyKey);
      if (allocation.familyPlacementCount.get(member.familyKey) <= 1
        || memberDebut?.surfaceId === candidate.surfaceId
        || member.reasons.has('firered-inheritance')) return [];
      return [{ candidate, displaced: member }];
    });
  });
  const outliers = provisionalDebuts.filter((debut) => (
    debut.timingPosition === 'late'
      && debut.timingDistance >= policy.minimumOutlierDistance
  ));
  const orderedOutliers = sorted(outliers, (debut) => [
    reliefCandidatesFor(debut).length,
    -debut.timingDistance,
    seededKey(context.config.seed, 'temporal-relief-family', debut.familyKey),
  ], (debut) => debut.familyKey);
  const applied = [];
  for (const outlier of orderedOutliers) {
    const options = reliefCandidatesFor(outlier);
    if (options.length === 0) continue;
    const chosen = sorted(options, (option) => [
      option.candidate.ecology.rank,
      option.displaced ? 1 : 0,
      allocation.membersBySurface.get(option.candidate.surfaceId).size,
      context.surfaceOrder.get(option.candidate.surfaceId),
      seededKey(
        context.config.seed,
        'temporal-relief-place',
        option.candidate.familyKey,
        option.candidate.surfaceId,
        option.displaced?.familyKey ?? 'add',
      ),
    ], (option) => `${option.candidate.candidateId}:${option.displaced?.familyKey ?? 'add'}`)[0];
    const candidate = chosen.candidate;
    const members = allocation.membersBySurface.get(candidate.surfaceId);
    if (usesExplicitDebutAllocation(context)) {
      const previousMembers = allocation.membersBySurface.get(outlier.surfaceId);
      previousMembers.delete(candidate.familyKey);
      allocation.designationBySurface.get(outlier.surfaceId).delete(candidate.familyKey);
      allocation.familyPlacementCount.set(
        candidate.familyKey,
        allocation.familyPlacementCount.get(candidate.familyKey) - 1,
      );
      reliefSourceRemovalCount.set(
        outlier.surfaceId,
        (reliefSourceRemovalCount.get(outlier.surfaceId) ?? 0) + 1,
      );
    }
    if (chosen.displaced) {
      members.delete(chosen.displaced.familyKey);
      allocation.designationBySurface.get(candidate.surfaceId).delete(chosen.displaced.familyKey);
      allocation.familyPlacementCount.set(
        chosen.displaced.familyKey,
        allocation.familyPlacementCount.get(chosen.displaced.familyKey) - 1,
      );
    }
    members.set(candidate.familyKey, {
      familyKey: candidate.familyKey,
      familyId: candidate.family.familyId,
      reasons: new Set(['temporal-relief']),
    });
    allocation.designationBySurface.get(candidate.surfaceId).add(candidate.familyKey);
    allocation.familyPlacementCount.set(
      candidate.familyKey,
      allocation.familyPlacementCount.get(candidate.familyKey) + 1,
    );
    if (usesLotDebutTableFill(context)) {
      allocation.primaryDebutSurfaceByFamily.set(candidate.familyKey, candidate.surfaceId);
      allocation.debutSurfaceByFamily.set(candidate.familyKey, candidate.surfaceId);
      allocation.debutBatchByFamily.set(
        candidate.familyKey,
        candidate.surface.access.effective_access_batch,
      );
    }
    reliefTableIds.add(candidate.surfaceId);
    applied.push({
      familyKey: candidate.familyKey,
      previousSurfaceId: outlier.surfaceId,
      previousDistance: outlier.timingDistance,
      reliefSurfaceId: candidate.surfaceId,
      reliefTableId: candidate.surfaceId,
      reliefDistance: candidate.windowDistance,
      ecologyFit: candidate.ecology.status,
      displacedFamilyKey: chosen.displaced?.familyKey ?? null,
    });
  }
  return {
    enabled: policy.enabled,
    direction: policy.direction,
    candidateOutliers: outliers.length,
    applied,
  };
}

function applyTemporalRelief(context, candidates, allocation, preliminary) {
  if (usesNoTemporalRelief(context)) {
    const outliers = preliminary.tables.flatMap((table) => table.familyDetails)
      .filter((detail) => (
        detail.availabilityRole === 'debut'
          && detail.timingPosition === 'late'
          && detail.timingDistance >= context.config.timing.outlierMinimumDistance
      ));
    return {
      enabled: false,
      direction: 'none',
      candidateOutliers: outliers.length,
      applied: [],
    };
  }
  if (usesTableOnlyAllocation(context)) {
    return applyTableTemporalRelief(context, candidates, allocation, preliminary);
  }
  const policy = context.config.temporalRelief;
  const provisionalDebuts = preliminary.tables.flatMap((table) => table.familyDetails
    .filter((detail) => detail.availabilityRole === 'debut')
    .map((detail) => ({ ...detail, surfaceId: table.surfaceId })));
  const provisionalDebutByFamily = new Map(provisionalDebuts.map((debut) => [debut.familyKey, debut]));
  const reliefPoolIds = new Set();
  const maximumEcologyRank = policy.maximumEcologyFit === 'exact' ? 0 : 1;
  const designationLimit = (surface) => Math.min(
    context.config.methodRichness[surface.method].maximum,
    surface.native_capacity,
  );
  const reliefCandidatesFor = (debut) => candidates.byFamily.get(debut.familyKey).flatMap((candidate) => {
    const pool = context.poolById.get(candidate.poolId);
    if (candidate.windowDistance !== policy.requiredTimingDistance
      || candidate.position !== 'inside'
      || candidate.surface.method !== 'land'
      || pool.kind !== 'land'
      || pool.members.size < pool.contract.target
      || pool.members.has(candidate.familyKey)
      || reliefPoolIds.has(pool.poolId)
      || candidate.contextRank !== 0
      || candidate.ecology.rank > maximumEcologyRank) return [];
    const designationCount = allocation.designationBySurface.get(candidate.surfaceId).size;
    if (pool.members.size < pool.contract.maximum && designationCount < designationLimit(candidate.surface)) {
      return [{ candidate, displaced: null }];
    }
    if (pool.members.size !== pool.contract.maximum) return [];
    return [...pool.members.values()].flatMap((member) => {
      const memberDebut = provisionalDebutByFamily.get(member.familyKey);
      const memberDebutPoolId = memberDebut ? context.poolBySurface.get(memberDebut.surfaceId).poolId : null;
      const freesChosenSurface = member.designatedSurfaceIds.has(candidate.surfaceId);
      const canFreeDesignation = designationCount - Number(freesChosenSurface) < designationLimit(candidate.surface);
      if (allocation.familyPoolCount.get(member.familyKey) <= 1
        || memberDebutPoolId === pool.poolId
        || member.reasons.has('firered-inheritance')
        || (member.reasons.has('surface-minimum') && pool.surfaceIds.length !== 1)
        || !canFreeDesignation) return [];
      return [{ candidate, displaced: member }];
    });
  });
  const outliers = provisionalDebuts.filter((debut) => (
    debut.timingPosition === 'late'
    && debut.timingDistance >= policy.minimumOutlierDistance
  ));
  const orderedOutliers = sorted(outliers, (debut) => [
    reliefCandidatesFor(debut).length,
    -debut.timingDistance,
    seededKey(context.config.seed, 'temporal-relief-family', debut.familyKey),
  ], (debut) => debut.familyKey);
  const applied = [];
  for (const outlier of orderedOutliers) {
    const options = reliefCandidatesFor(outlier);
    if (options.length === 0) continue;
    const chosen = sorted(options, (option) => [
      option.candidate.ecology.rank,
      option.displaced ? 1 : 0,
      allocation.designationBySurface.get(option.candidate.surfaceId).size,
      context.surfaceOrder.get(option.candidate.surfaceId),
      seededKey(context.config.seed, 'temporal-relief-place', option.candidate.familyKey, option.candidate.surfaceId, option.displaced?.familyKey ?? 'add'),
    ], (option) => `${option.candidate.candidateId}:${option.displaced?.familyKey ?? 'add'}`)[0];
    const candidate = chosen.candidate;
    const pool = context.poolById.get(candidate.poolId);
    if (chosen.displaced) {
      for (const surfaceId of chosen.displaced.designatedSurfaceIds) {
        allocation.designationBySurface.get(surfaceId).delete(chosen.displaced.familyKey);
      }
      pool.members.delete(chosen.displaced.familyKey);
      allocation.familyPoolCount.set(chosen.displaced.familyKey, allocation.familyPoolCount.get(chosen.displaced.familyKey) - 1);
    }
    pool.members.set(candidate.familyKey, {
      familyKey: candidate.familyKey,
      familyId: candidate.family.familyId,
      reasons: new Set(['temporal-relief']),
      designatedSurfaceIds: new Set([candidate.surfaceId]),
    });
    allocation.familyPoolCount.set(candidate.familyKey, allocation.familyPoolCount.get(candidate.familyKey) + 1);
    allocation.designationBySurface.get(candidate.surfaceId).add(candidate.familyKey);
    reliefPoolIds.add(candidate.poolId);
    applied.push({
      familyKey: candidate.familyKey,
      previousSurfaceId: outlier.surfaceId,
      previousDistance: outlier.timingDistance,
      reliefSurfaceId: candidate.surfaceId,
      reliefPoolId: candidate.poolId,
      reliefDistance: candidate.windowDistance,
      ecologyFit: candidate.ecology.status,
      displacedFamilyKey: chosen.displaced?.familyKey ?? null,
    });
  }
  return {
    enabled: policy.enabled,
    direction: policy.direction,
    candidateOutliers: outliers.length,
    applied,
  };
}

function buildTables(context, candidates, allocation) {
  const blockers = [...allocation.blockers];
  const selectedBySurface = new Map();
  const inheritanceReservationKeys = new Set(allocation.inheritanceReservations.map((row) => `${row.surfaceId}:${row.familyKey}`));
  for (const surface of context.surfaces) {
    const tableOnly = usesTableOnlyAllocation(context);
    const pool = tableOnly ? null : context.poolBySurface.get(surface.surface_id);
    const members = tableOnly ? allocation.membersBySurface.get(surface.surface_id) : pool.members;
    const currentOrder = context.surfaceOrder.get(surface.surface_id);
    const eligible = candidates.bySurface.get(surface.surface_id).filter((candidate) => {
      const member = members.get(candidate.familyKey);
      return tableOnly
        ? Boolean(member)
        : member && Math.min(...[...member.designatedSurfaceIds].map((surfaceId) => context.surfaceOrder.get(surfaceId))) <= currentOrder;
    });
    const mandatoryKeys = allocation.designationBySurface.get(surface.surface_id);
    const mandatory = eligible.filter((candidate) => mandatoryKeys.has(candidate.familyKey));
    const contract = tableTotalContract(context, surface);
    const maximum = Math.min(contract.maximum, surface.native_capacity);
    const splitBootstrap = usesSplitTableComposition(context)
      ? context.config.tableComposition.bootstrap
      : null;
    const splitDebutCount = usesSplitTableComposition(context)
      ? [...members.values()].filter((member) => (
          [...member.reasons].some((reason) => reason.startsWith('debut-'))
            || member.reasons.has('temporal-relief')
        )).length
      : 0;
    const isBootstrapTable = splitBootstrap
      && context.batchWindow.get(surface.access.effective_access_batch) === splitBootstrap.throughNativeWindow
      && splitBootstrap.methods.includes(surface.method)
      && splitDebutCount === Math.min(splitBootstrap.debutTarget, surface.native_capacity);
    const minimum = isBootstrapTable
      ? Math.min(contract.minimum, splitBootstrap.debutTarget, surface.native_capacity)
      : context.config.tableMinimumBySurface?.[surface.surface_id] !== undefined
        ? minimumForSurface(context.config, surface)
        : Math.min(contract.minimum, surface.native_capacity);
    const target = tableOnly
      ? members.size
      : Math.max(mandatory.length, Math.min(contract.target, maximum, eligible.length));
    const ordered = sorted(
      eligible,
      (candidate) => tableCandidateTuple(context, candidate, allocation, mandatoryKeys),
      (candidate) => candidate.familyKey,
    );
    const selected = ordered.slice(0, target);
    if (mandatory.length > maximum) blockers.push({ code: 'surface-designations-above-maximum', surfaceId: surface.surface_id, assigned: mandatory.length, maximum });
    if (selected.length < minimum) blockers.push({ code: 'surface-richness-below-minimum', surfaceId: surface.surface_id, assigned: selected.length, minimum });
    if (selected.length > maximum) blockers.push({ code: 'surface-richness-above-maximum', surfaceId: surface.surface_id, assigned: selected.length, maximum });
    selectedBySurface.set(surface.surface_id, selected);
  }

  const occurrences = new Map(context.families.map((family) => [family.familyKey, []]));
  for (const surface of context.surfaces) {
    for (const candidate of selectedBySurface.get(surface.surface_id)) {
      occurrences.get(candidate.familyKey).push(candidate);
    }
  }
  const usesAllocatedPrimaryDebuts = usesLotDebutTableFill(context)
    || usesWindowDebutFill(context);
  const debutSurfaceByFamily = usesAllocatedPrimaryDebuts
    ? new Map(allocation.primaryDebutSurfaceByFamily)
    : new Map();
  for (const family of context.families) {
    const rows = occurrences.get(family.familyKey).sort((left, right) => (
      context.surfaceOrder.get(left.surfaceId) - context.surfaceOrder.get(right.surfaceId)
      || left.surfaceId.localeCompare(right.surfaceId)
    ));
    if (rows.length === 0) {
      if (!usesDebutPhaseOnly(context) && !usesWindowDebutFill(context)) {
        blockers.push({ code: 'family-not-materialized', familyKey: family.familyKey });
      }
    } else if (!usesAllocatedPrimaryDebuts) {
      debutSurfaceByFamily.set(family.familyKey, rows[0].surfaceId);
    } else if (!debutSurfaceByFamily.has(family.familyKey)) {
      blockers.push({ code: 'family-without-primary-debut', familyKey: family.familyKey });
    }
  }
  const derivedDebutBatchByFamily = new Map([...debutSurfaceByFamily].map(([familyKey, surfaceId]) => [
    familyKey,
    context.surfaceById.get(surfaceId).access.effective_access_batch,
  ]));

  const tables = [];
  for (const surface of context.surfaces) {
    const selected = selectedBySurface.get(surface.surface_id);
    invariant(
      selected.length > 0 || usesDebutPhaseOnly(context),
      `${surface.surface_id}: la tabla quedó vacía`,
    );
    const desired = new Map(selected.map((candidate) => [
      candidate.familyKey,
      context.config.abundanceWeights[candidate.family.recurrenceClass] ?? 1,
    ]));
    const desiredTotal = [...desired.values()].reduce((sum, value) => sum + value, 0);
    const currentMass = new Map(selected.map((candidate) => [candidate.familyKey, 0]));
    const unassigned = new Set(selected.map((candidate) => candidate.familyKey));
    const slotFamilies = [];
    const materializedNativeSlots = selected.length > 0 ? surface.slots : [];
    for (let index = 0; index < materializedNativeSlots.length; index += 1) {
      const nativeSlot = materializedNativeSlots[index];
      const remainingSlots = materializedNativeSlots.length - index;
      const options = remainingSlots === unassigned.size
        ? selected.filter((candidate) => unassigned.has(candidate.familyKey))
        : selected;
      const chosen = [...options].sort((left, right) => {
        const leftDeficit = desired.get(left.familyKey) / desiredTotal * 100 - currentMass.get(left.familyKey);
        const rightDeficit = desired.get(right.familyKey) / desiredTotal * 100 - currentMass.get(right.familyKey);
        return rightDeficit - leftDeficit
          || compareScalars(
            seededKey(context.config.seed, 'slot', surface.surface_id, String(index), left.familyKey),
            seededKey(context.config.seed, 'slot', surface.surface_id, String(index), right.familyKey),
          )
          || left.familyKey.localeCompare(right.familyKey);
      })[0];
      invariant(chosen, `${surface.surface_id}: no hay familia para el slot ${index}`);
      slotFamilies.push(chosen);
      currentMass.set(chosen.familyKey, currentMass.get(chosen.familyKey) + nativeSlot.weight);
      unassigned.delete(chosen.familyKey);
    }
    const maximumMass = currentMass.size > 0 ? Math.max(...currentMass.values()) : 0;
    const details = selected.map((candidate) => {
      const isPrimaryDebut = debutSurfaceByFamily.get(candidate.familyKey) === surface.surface_id;
      const debutBatchId = usesLotDebutTableFill(context)
        ? allocation.debutBatchByFamily.get(candidate.familyKey)
        : derivedDebutBatchByFamily.get(candidate.familyKey);
      const debutWindow = context.batchWindow.get(debutBatchId);
      const surfaceWindow = context.batchWindow.get(surface.access.effective_access_batch);
      const returnScope = isPrimaryDebut || !publishesLotTemporalRoles(context)
        ? null
        : usesWindowDebutFill(context)
          ? (debutWindow === surfaceWindow ? 'same-window' : 'prior-window')
          : (debutBatchId === surface.access.effective_access_batch ? 'same-lot' : 'prior-lot');
      return {
        familyId: candidate.family.familyId,
        familyKey: candidate.familyKey,
        displayName: candidate.family.displayName,
        entrySpecies: candidate.family.entrySpecies,
        speciesId: `SPECIES_${candidate.family.entrySpecies}`,
        originRegion: candidate.family.originRegion,
        types: candidate.family.types,
        habitats: candidate.family.habitats,
        recurrenceClass: candidate.family.recurrenceClass,
        availabilityRole: isPrimaryDebut ? 'debut' : 'return',
        ...(publishesLotTemporalRoles(context) ? { debutBatchId, debutWindow, returnScope } : {}),
        contextFit: candidate.contextFit,
        ecologyFit: candidate.ecology.status,
        ecologyMatches: candidate.ecology.matches,
        timingPosition: candidate.position,
        timingDistance: isPrimaryDebut ? candidate.windowDistance : null,
        placementWindow: candidate.family.window,
        balanceStatus: candidate.balance.status,
        balanceReasons: candidate.balance.reasons,
        entryBst: candidate.family.entryBst,
        localMass: currentMass.get(candidate.familyKey),
        ecologyRole: currentMass.get(candidate.familyKey) === maximumMass ? 'anchor' : (currentMass.get(candidate.familyKey) <= 15 ? 'rare' : 'core'),
        designationReasons: [...(usesTableOnlyAllocation(context)
          ? allocation.membersBySurface.get(surface.surface_id).get(candidate.familyKey)
          : context.poolBySurface.get(surface.surface_id).members.get(candidate.familyKey)).reasons].sort(),
        fireRedInheritance: inheritanceReservationKeys.has(`${surface.surface_id}:${candidate.familyKey}`),
        temporalRelief: (usesTableOnlyAllocation(context)
          ? allocation.membersBySurface.get(surface.surface_id).get(candidate.familyKey)
          : context.poolBySurface.get(surface.surface_id).members.get(candidate.familyKey)).reasons.has('temporal-relief'),
      };
    }).sort((left, right) => left.familyKey.localeCompare(right.familyKey));
    const detailsByFamily = new Map(details.map((detail) => [detail.familyKey, detail]));
    const slots = materializedNativeSlots.map((nativeSlot, index) => {
      const candidate = slotFamilies[index];
      const detail = detailsByFamily.get(candidate.familyKey);
      return {
        slotIndex: nativeSlot.slot_index,
        rawSlotIndex: nativeSlot.raw_slot_index,
        weight: nativeSlot.weight,
        minLevel: nativeSlot.min_level,
        maxLevel: nativeSlot.max_level,
        familyId: candidate.family.familyId,
        familyKey: candidate.familyKey,
        speciesId: `SPECIES_${candidate.family.entrySpecies}`,
        availabilityRole: detail.availabilityRole,
        ecologyRole: detail.ecologyRole,
        temporalRelief: detail.temporalRelief,
      };
    });
    tables.push({
      surfaceId: surface.surface_id,
      canonicalSurfaceId: surface.canonical_surface_id,
      ...(usesTableOnlyAllocation(context)
        ? {}
        : { poolId: context.poolBySurface.get(surface.surface_id).poolId }),
      batchId: surface.batch_id,
      effectiveAccessBatch: surface.access.effective_access_batch,
      mapId: surface.map_id,
      mapName: surface.map_name,
      regionMapSection: surface.region_map_section,
      method: surface.method,
      context: surface.context,
      encounterRate: surface.encounter_rate,
      habitatTags: surface.habitat.tags,
      nativeCapacity: surface.native_capacity,
      familyDetails: details,
      slots,
      metrics: {
        familyRichness: details.length,
        familyRates: Object.fromEntries([...currentMass].sort(([left], [right]) => left.localeCompare(right))),
        debuts: details.filter((detail) => detail.availabilityRole === 'debut').map((detail) => detail.familyKey),
        returns: details.filter((detail) => detail.availabilityRole === 'return').map((detail) => detail.familyKey),
        ...(publishesLotTemporalRoles(context) ? {
          sameLotReturns: details.filter((detail) => detail.returnScope === 'same-lot').map((detail) => detail.familyKey),
          priorLotReturns: details.filter((detail) => detail.returnScope === 'prior-lot').map((detail) => detail.familyKey),
          sameWindowReturns: details.filter((detail) => detail.returnScope === 'same-window').map((detail) => detail.familyKey),
          priorWindowReturns: details.filter((detail) => detail.returnScope === 'prior-window').map((detail) => detail.familyKey),
        } : {}),
      },
    });
  }
  return { tables, blockers, debutSurfaceByFamily };
}

function buildMetrics(context, tables, blockers, inheritanceReservations) {
  const tableOnly = usesTableOnlyAllocation(context);
  const details = tables.flatMap((table) => table.familyDetails.map((detail) => ({ ...detail, surfaceId: table.surfaceId, batchId: table.effectiveAccessBatch })));
  const slots = tables.flatMap((table) => table.slots);
  const debuts = details.filter((detail) => detail.availabilityRole === 'debut');
  const byMethod = Object.fromEntries(METHOD_ORDER.map((method) => {
    const rows = tables.filter((table) => table.method === method);
    return [method, {
      tables: rows.length,
      minimumFamilies: Math.min(...rows.map((table) => table.metrics.familyRichness)),
      averageFamilies: round(average(rows.map((table) => table.metrics.familyRichness)), 2),
      maximumFamilies: Math.max(...rows.map((table) => table.metrics.familyRichness)),
    }];
  }));
  const poolRows = context.pools.map((pool) => ({
    poolId: pool.poolId,
    kind: pool.kind,
    size: pool.members.size,
    status: evaluatePoolSize(pool.members.size, pool.contract).status,
  }));
  const familyPlacements = Object.fromEntries(context.families.map((family) => [
    family.familyKey,
    details.filter((detail) => detail.familyKey === family.familyKey).length,
  ]));
  const byLot = Object.fromEntries(context.batchOrder.map((batchId) => {
    const lotTables = tables.filter((table) => table.batchId === batchId);
    const lotDetails = lotTables.flatMap((table) => table.familyDetails);
    return [batchId, {
      surfaces: lotTables.length,
      slots: lotTables.reduce((sum, table) => sum + table.slots.length, 0),
      families: new Set(lotDetails.map((detail) => detail.familyKey)).size,
      debuts: lotDetails.filter((detail) => detail.availabilityRole === 'debut').length,
      returns: lotDetails.filter((detail) => detail.availabilityRole === 'return').length,
      ...(publishesLotTemporalRoles(context) ? {
        sameLotReturns: lotDetails.filter((detail) => detail.returnScope === 'same-lot').length,
        priorLotReturns: lotDetails.filter((detail) => detail.returnScope === 'prior-lot').length,
        sameWindowReturns: lotDetails.filter((detail) => detail.returnScope === 'same-window').length,
        priorWindowReturns: lotDetails.filter((detail) => detail.returnScope === 'prior-window').length,
      } : {}),
    }];
  }));
  const tableCompositionMetrics = publishesLotTemporalRoles(context)
    ? (() => {
        const totalContract = usesDebutPhaseOnly(context)
          ? tableTotalContract(context, context.surfaces[0])
          : context.config.tableComposition.total;
        const rows = tables.map((table) => ({
          surfaceId: table.surfaceId,
          batchId: table.effectiveAccessBatch,
          window: context.batchWindow.get(table.effectiveAccessBatch),
          debuts: table.metrics.debuts.length,
          sameLotReturns: table.metrics.sameLotReturns.length,
          priorLotReturns: table.metrics.priorLotReturns.length,
          sameWindowReturns: table.metrics.sameWindowReturns.length,
          priorWindowReturns: table.metrics.priorWindowReturns.length,
          returns: table.metrics.returns.length,
          total: table.metrics.familyRichness,
          totalTarget: usesWindowDebutFill(context)
            ? seededFillTarget(context, context.surfaceById.get(table.surfaceId))
            : Math.min(totalContract.target, table.nativeCapacity),
          totalMinimum: context.config.tableMinimumBySurface?.[table.surfaceId] !== undefined
            ? minimumForSurface(context.config, context.surfaceById.get(table.surfaceId))
            : Math.min(totalContract.minimum, table.nativeCapacity),
        }));
        return {
          contract: {
            temporalRoleUnit: context.config.randomization.temporalRoleUnit,
            ...(usesDebutPhaseOnly(context)
              ? { debutAllocation: context.config.debutAllocation }
              : usesLotDebutTableFill(context)
              ? { debutAllocation: context.config.debutAllocation }
              : { objectiveOrder: context.config.randomization.objectiveOrder }),
            total: totalContract,
          },
          debutTables: rows.filter((row) => row.debuts > 0).length,
          returnOnlyTables: rows.filter((row) => row.debuts === 0 && row.returns > 0).length,
          tablesAtTotalTarget: rows.filter((row) => row.total === row.totalTarget).length,
          tablesWithinTotalBand: rows.filter((row) => (
            row.total >= row.totalMinimum
              && row.total <= Math.min(totalContract.maximum, context.surfaceById.get(row.surfaceId).native_capacity)
          )).length,
          byWindow: Object.fromEntries(context.windowOrder.map((window) => {
            const windowRows = rows.filter((row) => row.window === window);
            return [window, {
              tables: windowRows.length,
              debutTables: windowRows.filter((row) => row.debuts > 0).length,
              debuts: windowRows.reduce((sum, row) => sum + row.debuts, 0),
              sameLotReturns: windowRows.reduce((sum, row) => sum + row.sameLotReturns, 0),
              priorLotReturns: windowRows.reduce((sum, row) => sum + row.priorLotReturns, 0),
              sameWindowReturns: windowRows.reduce((sum, row) => sum + row.sameWindowReturns, 0),
              priorWindowReturns: windowRows.reduce((sum, row) => sum + row.priorWindowReturns, 0),
              returns: windowRows.reduce((sum, row) => sum + row.returns, 0),
              averageTotalPerTable: round(average(windowRows.map((row) => row.total)), 2),
            }];
          })),
          rows,
        };
      })()
    : usesSplitTableComposition(context)
    ? (() => {
        const contract = context.config.tableComposition;
        const rows = tables.map((table) => {
          const debutsInTable = table.metrics.debuts.length;
          const returnsInTable = table.metrics.returns.length;
          const total = table.metrics.familyRichness;
          const window = context.batchWindow.get(table.effectiveAccessBatch);
          const debutTarget = Math.min(
            window === contract.bootstrap.throughNativeWindow
              ? contract.bootstrap.debutTarget
              : contract.debut.target,
            contract.debut.maximum,
            table.nativeCapacity,
          );
          const totalTarget = Math.min(contract.total.target, table.nativeCapacity);
          const isBootstrapTable = window === contract.bootstrap.throughNativeWindow
            && contract.bootstrap.methods.includes(table.method)
            && debutsInTable === Math.min(contract.bootstrap.debutTarget, table.nativeCapacity);
          const totalMinimum = isBootstrapTable
            ? Math.min(contract.total.minimum, contract.bootstrap.debutTarget, table.nativeCapacity)
            : Math.min(contract.total.minimum, table.nativeCapacity);
          const returnTarget = Math.min(
            contract.return.target,
            contract.return.maximum,
            Math.max(0, totalTarget - debutsInTable),
            table.nativeCapacity - debutsInTable,
          );
          return {
            surfaceId: table.surfaceId,
            window,
            debuts: debutsInTable,
            returns: returnsInTable,
            total,
            debutTarget,
            returnTarget,
            totalTarget,
            totalMinimum,
          };
        });
        return {
          contract,
          debutTables: rows.filter((row) => row.debuts > 0).length,
          returnOnlyTables: rows.filter((row) => row.debuts === 0 && row.returns > 0).length,
          tablesAtDebutTarget: rows.filter((row) => row.debuts > 0 && row.debuts === row.debutTarget).length,
          tablesAtReturnTarget: rows.filter((row) => row.returns === row.returnTarget).length,
          tablesAtTotalTarget: rows.filter((row) => row.total === row.totalTarget).length,
          tablesWithinTotalBand: rows.filter((row) => (
            row.total >= row.totalMinimum
              && row.total <= Math.min(contract.total.maximum, context.surfaceById.get(row.surfaceId).native_capacity)
          )).length,
          byWindow: Object.fromEntries(context.windowOrder.map((window) => {
            const windowRows = rows.filter((row) => row.window === window);
            return [window, {
              tables: windowRows.length,
              debutTables: windowRows.filter((row) => row.debuts > 0).length,
              debuts: windowRows.reduce((sum, row) => sum + row.debuts, 0),
              returns: windowRows.reduce((sum, row) => sum + row.returns, 0),
              averageDebutsPerTable: round(average(windowRows.map((row) => row.debuts)), 2),
              averageReturnsPerTable: round(average(windowRows.map((row) => row.returns)), 2),
              averageTotalPerTable: round(average(windowRows.map((row) => row.total)), 2),
            }];
          })),
          rows,
        };
      })()
    : null;
  const inheritanceRows = inheritanceReservations.map((row) => ({ ...row }));
  return {
    coverage: {
      surfaces: tables.length,
      slots: slots.length,
      eligibleWildFamilies: context.families.length,
      noSpawnWildFamilies: context.noSpawnFamilies.length,
      noSpawnFamilies: context.noSpawnFamilies.map((family) => family.familyKey),
      usedWildFamilies: new Set(details.map((detail) => detail.familyKey)).size,
      familiesWithOneDebut: new Set(debuts.map((detail) => detail.familyKey)).size,
      unassignedWildFamilies: context.families
        .filter((family) => familyPlacements[family.familyKey] === 0)
        .map((family) => family.familyKey),
      excludedFamiliesInWild: new Set(details.filter((detail) => !context.families.some((family) => family.familyKey === detail.familyKey)).map((detail) => detail.familyKey)).size,
      emptyTables: tables.filter((table) => table.familyDetails.length === 0).length,
    },
    ...(tableOnly ? {} : {
      pools: {
        total: poolRows.length,
        land: poolRows.filter((pool) => pool.kind === 'land').length,
        aquatic: poolRows.filter((pool) => pool.kind === 'aquatic').length,
        withinContract: poolRows.filter((pool) => pool.status === 'within').length,
        violations: poolRows.filter((pool) => pool.status !== 'within'),
      },
    }),
    ecology: {
      denominatorFamilyPlacements: details.length,
      exact: details.filter((detail) => detail.ecologyFit === ECOLOGY_FIT.EXACT).length,
      compatible: details.filter((detail) => detail.ecologyFit === ECOLOGY_FIT.COMPATIBLE).length,
      invalid: details.filter((detail) => detail.ecologyFit === ECOLOGY_FIT.INVALID).length,
    },
    timing: {
      denominatorDebuts: debuts.length,
      distanceUnit: context.config.timing.distanceUnit,
      insideWindow: debuts.filter((detail) => detail.timingDistance === context.config.timing.insideDistance).length,
      adjacent: debuts.filter((detail) => detail.timingDistance === context.config.timing.adjacentDistance).length,
      outliers: debuts.filter((detail) => detail.timingDistance >= context.config.timing.outlierMinimumDistance).length,
      maximumDistance: debuts.length > 0
        ? Math.max(...debuts.map((detail) => detail.timingDistance))
        : 0,
      rowsOutsideWindow: debuts.filter((detail) => detail.timingDistance > 0).map((detail) => ({
        familyKey: detail.familyKey,
        surfaceId: detail.surfaceId,
        distance: detail.timingDistance,
      })),
    },
    captureContext: {
      denominatorFamilyPlacements: details.length,
      exact: details.filter((detail) => detail.contextFit === 'exact').length,
      safariFallbacks: details.filter((detail) => detail.contextFit !== 'exact').length,
      fallbackRows: details.filter((detail) => detail.contextFit !== 'exact').map((detail) => ({ familyKey: detail.familyKey, surfaceId: detail.surfaceId })),
    },
    balance: {
      denominatorFamilyPlacements: details.length,
      ok: details.filter((detail) => detail.balanceStatus === BALANCE_STATUS.OK).length,
      review: details.filter((detail) => detail.balanceStatus === BALANCE_STATUS.REVIEW).length,
      block: details.filter((detail) => detail.balanceStatus === BALANCE_STATUS.BLOCK).length,
      reviewRows: details.filter((detail) => detail.balanceStatus === BALANCE_STATUS.REVIEW).map((detail) => ({ familyKey: detail.familyKey, surfaceId: detail.surfaceId, entryBst: detail.entryBst })),
    },
    richnessByMethod: byMethod,
    ...(tableCompositionMetrics ? { tableComposition: tableCompositionMetrics } : {}),
    familyPlacements,
    byLot,
    blockers,
    fireRedInheritance: {
      mode: context.config.inheritanceMode,
      scope: context.config.fireRedInheritance.scope,
      stage: context.config.fireRedInheritance.stage,
      maximumReservationsPerTable: context.config.fireRedInheritance.maximumReservationsPerTable,
      reservations: inheritanceRows.length,
      tablesWithReservations: new Set(inheritanceRows.map((row) => row.surfaceId)).size,
      tablesAtLimit: [...new Set(inheritanceRows.map((row) => row.surfaceId))].filter((surfaceId) => (
        inheritanceRows.filter((row) => row.surfaceId === surfaceId).length === context.config.fireRedInheritance.maximumReservationsPerTable
      )).length,
      ...(tableOnly ? {} : {
        poolsWithReservations: new Set(inheritanceRows.map((row) => row.poolId)).size,
      }),
      distinctFamilies: new Set(inheritanceRows.map((row) => row.familyKey)).size,
      rows: inheritanceRows,
    },
  };
}

function surfaceCatalog(context) {
  return context.surfaces.map((surface) => ({
    surfaceId: surface.surface_id,
    canonicalSurfaceId: surface.canonical_surface_id,
    batchId: surface.batch_id,
    effectiveAccessBatch: surface.access.effective_access_batch,
    mapId: surface.map_id,
    mapName: surface.map_name,
    regionMapSection: surface.region_map_section,
    method: surface.method,
    context: surface.context,
    ...(usesTableOnlyAllocation(context)
      ? {}
      : { poolId: context.poolBySurface.get(surface.surface_id).poolId }),
    encounterRate: surface.encounter_rate,
    habitatTags: surface.habitat.tags,
    nativeCapacity: surface.native_capacity,
    nativeSlots: surface.slots.map((slot) => ({
      slotIndex: slot.slot_index,
      rawSlotIndex: slot.raw_slot_index,
      weight: slot.weight,
      minLevel: slot.min_level,
      maxLevel: slot.max_level,
    })),
  }));
}

function poolCatalog(context) {
  return context.pools.map((pool) => ({
    poolId: pool.poolId,
    scopeId: pool.scopeId,
    kind: pool.kind,
    contract: pool.contract,
    surfaceIds: pool.surfaceIds,
    methods: pool.methods,
    familyKeys: [...pool.members.keys()].sort(),
    members: [...pool.members.values()].map((member) => ({
      familyId: member.familyId,
      familyKey: member.familyKey,
      designationReasons: [...member.reasons].sort(),
      designatedSurfaceIds: [...member.designatedSurfaceIds].sort(),
    })).sort((left, right) => left.familyKey.localeCompare(right.familyKey)),
  }));
}

export function validateDistribution(document) {
  const errors = [];
  const check = (condition, message) => { if (!condition) errors.push(message); };
  const tableOnly = document.config.randomization?.allocationUnit === 'table';
  const ecologyWindowRandomFill = document.config.randomization?.mode === ECOLOGY_WINDOW_RANDOM_FILL_MODE;
  const windowDebutQueue = document.config.randomization?.mode === WINDOW_DEBUT_QUEUE_MODE;
  const windowDebutFill = document.config.randomization?.mode === WINDOW_DEBUT_FILL_MODE;
  const windowDebutAllocation = windowDebutQueue || windowDebutFill;
  const debutPhaseOnly = [DEBUT_PHASE_ONLY_MODE, WINDOW_DEBUT_QUEUE_MODE]
    .includes(document.config.randomization?.mode);
  const noTemporalRelief = ecologyWindowRandomFill || debutPhaseOnly || windowDebutFill;
  check(document.schemaVersion === 2, 'schemaVersion inválido');
  check(document.status === 'proposal' && document.approval === 'unapproved', 'la corrida debe seguir sin aceptar');
  check(document.romPromotionStatus === 'not-promoted', 'la corrida no puede figurar promovida');
  check(document.generatedFrom.priorRunArtifacts.length === 0, 'la corrida heredó artefactos previos');
  check(['C0', 'C1', 'C2'].includes(document.config.inheritanceMode), 'inheritanceMode inválido');
  const inheritanceLimit = { C0: 0, C1: 1, C2: 2 }[document.config.inheritanceMode];
  check(document.config.fireRedInheritance.scope === 'table', 'scope FireRed inconsistente');
  check(document.config.fireRedInheritance.stage === 'before-table-fill', 'orden FireRed inconsistente');
  check(document.config.fireRedInheritance.maximumReservationsPerTable === inheritanceLimit, 'límite FireRed por tabla inconsistente');
  check(document.surfaceCatalog.length === 315, 'debe haber 315 superficies');
  if (tableOnly) {
    check(!Object.hasOwn(document, 'pools'), 'el modo por tabla no debe publicar pools');
    check(!Object.hasOwn(document.config, 'poolContracts'), 'el modo por tabla no debe conservar contratos de pool');
    check(document.surfaceCatalog.every((surface) => !Object.hasOwn(surface, 'poolId')), 'el catálogo por tabla conserva poolId');
  } else {
    check(document.pools.length === 102, 'debe haber 102 pools');
  }
  check(document.tables.length === 315, 'debe haber 315 tablas');
  const noSpawnFamilies = document.familyPartition.noSpawnFamilies ?? [];
  check(
    document.familyPartition.spawnEligibleFamilies + noSpawnFamilies.length
      === document.familyPartition.ordinaryWildFamilies,
    'la partición entre familias habilitadas y no spawn no cierra',
  );
  check(
    document.metrics.coverage.eligibleWildFamilies === document.familyPartition.spawnEligibleFamilies,
    'la cobertura no coincide con las familias habilitadas por la tirada',
  );
  check(
    document.metrics.coverage.noSpawnWildFamilies === noSpawnFamilies.length
      && JSON.stringify(document.metrics.coverage.noSpawnFamilies) === JSON.stringify(noSpawnFamilies),
    'el diagnóstico de no spawn no coincide con la partición',
  );
  const materializedFamilyKeys = new Set(document.tables.flatMap((table) => (
    table.familyDetails.map((detail) => detail.familyKey)
  )));
  check(
    noSpawnFamilies.every((familyKey) => !materializedFamilyKeys.has(familyKey)),
    'una familia descartada por no spawn apareció en una tabla',
  );
  check(
    document.metrics.coverage.usedWildFamilies
      + document.metrics.coverage.unassignedWildFamilies.length
      === document.familyPartition.spawnEligibleFamilies,
    'las familias habilitadas no cierran entre materializadas y pendientes',
  );
  check(
    debutPhaseOnly
      ? document.metrics.coverage.slots <= 2065
      : document.metrics.coverage.slots === 2065,
    debutPhaseOnly ? 'la fase de debuts supera 2.065 slots' : 'debe haber 2.065 slots',
  );
  if (windowDebutAllocation) {
    check(
      document.metrics.coverage.familiesWithOneDebut === document.metrics.coverage.usedWildFamilies,
      'cada familia materializada debe tener un debut único',
    );
  } else {
    check(
      document.metrics.coverage.usedWildFamilies === document.familyPartition.ordinaryWildFamilies,
      'deben materializarse todas las familias wild de la policy',
    );
    check(
      document.metrics.coverage.familiesWithOneDebut === document.familyPartition.ordinaryWildFamilies,
      'cada familia wild debe tener un debut',
    );
  }
  check(document.metrics.coverage.excludedFamiliesInWild === 0, 'una familia excluida entró en tablas');
  if (!debutPhaseOnly) check(document.metrics.coverage.emptyTables === 0, 'hay tablas vacías');
  if (tableOnly) check(!Object.hasOwn(document.metrics, 'pools'), 'el modo por tabla conserva métricas de pools');
  else check(document.metrics.pools.withinContract === 102 && document.metrics.pools.violations.length === 0, 'hay pools fuera de contrato');
  check(document.metrics.ecology.invalid === 0, 'hay asignaciones ecológicas inválidas');
  check(document.metrics.balance.block === 0, 'hay asignaciones bloqueadas por balance');
  check(document.metrics.blockers.length === 0, `hay blockers: ${JSON.stringify(document.metrics.blockers)}`);
  if ([
    SPLIT_TABLE_COMPOSITION_MODE,
    LOT_DEBUT_TABLE_FILL_MODE,
    ECOLOGY_WINDOW_RANDOM_FILL_MODE,
    DEBUT_PHASE_ONLY_MODE,
    WINDOW_DEBUT_QUEUE_MODE,
    WINDOW_DEBUT_FILL_MODE,
  ].includes(document.config.randomization?.mode)) {
    check(document.metrics.tableComposition?.tablesWithinTotalBand === 315, 'hay tablas fuera de la banda total efectiva');
    const noSpawn = new Set(document.familyPartition.noSpawnFamilies);
    check(
      Object.entries(document.metrics.tableComposition?.byWindow ?? {}).every(([windowId, window]) => (
        window.debuts > 0 || (document.config.nativeWildFamiliesByWindow
          && document.config.nativeWildFamiliesByWindow[windowId]
            .every((familyKey) => noSpawn.has(familyKey)))
      )),
      'alguna ventana de campaña quedó sin debuts elegibles',
    );
  }
  check(
    document.metrics.temporalRelief.enabled === !noTemporalRelief,
    'el estado del alivio temporal no coincide con la configuración',
  );
  if (!noTemporalRelief) {
    check(document.metrics.temporalRelief.outliersPrevented === document.metrics.temporalRelief.applied, 'un alivio no corrigió un outlier');
  } else {
    check(document.metrics.temporalRelief.applied === 0, 'el alivio deshabilitado modificó la distribución');
    check(document.metrics.temporalRelief.outliersBefore === document.metrics.temporalRelief.outliersAfter, 'el alivio deshabilitado alteró los outliers');
  }
  check(document.metrics.temporalRelief.outliersAfter === document.metrics.timing.outliers, 'el diagnóstico de alivio no coincide con timing final');
  check(new Set(document.metrics.temporalRelief.reliefs.map((row) => row.familyKey)).size === document.metrics.temporalRelief.applied, 'una familia recibió dos alivios');
  if (tableOnly) {
    check(new Set(document.metrics.temporalRelief.reliefs.map((row) => row.reliefTableId)).size === document.metrics.temporalRelief.applied, 'una tabla recibió dos alivios');
  } else {
    check(new Set(document.metrics.temporalRelief.reliefs.map((row) => row.reliefPoolId)).size === document.metrics.temporalRelief.applied, 'un pool recibió dos alivios');
  }
  const surfaceById = new Map(document.surfaceCatalog.map((surface) => [surface.surfaceId, surface]));
  const poolById = new Map((document.pools ?? []).map((pool) => [pool.poolId, pool]));
  const inheritanceRows = document.metrics.fireRedInheritance.rows;
  check(inheritanceRows.length === document.metrics.fireRedInheritance.reservations, 'conteo de reservas FireRed inconsistente');
  check(new Set(inheritanceRows.map((row) => `${row.surfaceId}:${row.familyKey}`)).size === inheritanceRows.length, 'hay reservas FireRed duplicadas');
  for (const table of document.tables) {
    const reservations = inheritanceRows.filter((row) => row.surfaceId === table.surfaceId);
    check(reservations.length <= inheritanceLimit, `${table.surfaceId}: supera el límite FireRed por tabla`);
    for (const row of reservations) {
      check(table.familyDetails.some((detail) => detail.familyKey === row.familyKey && detail.fireRedInheritance === true), `${table.surfaceId}/${row.familyKey}: la reserva FireRed no quedó materializada`);
    }
  }
  for (const row of inheritanceRows) {
    if (!tableOnly) check(poolById.has(row.poolId), `${row.poolId}: reserva FireRed sin pool`);
    check(row.vanillaMass > 0, `${row.surfaceId}/${row.familyKey}: reserva sin masa FireRed`);
  }
  const debutCounts = new Map();
  for (const table of document.tables) {
    const source = surfaceById.get(table.surfaceId);
    const tableWindow = document.config.windowByBatch?.[table.effectiveAccessBatch]
      ?? table.effectiveAccessBatch.slice(0, 2);
    check(Boolean(source), `${table.surfaceId}: no figura en surfaceCatalog`);
    if (!source) continue;
    check(
      debutPhaseOnly
        ? table.slots.length === 0 || table.slots.length === source.nativeSlots.length
        : table.slots.length === source.nativeSlots.length,
      `${table.surfaceId}: cambió la capacidad`,
    );
    check(table.encounterRate === source.encounterRate, `${table.surfaceId}: cambió el encounter rate`);
    if (tableOnly) {
      const splitComposition = document.config.randomization.mode === SPLIT_TABLE_COMPOSITION_MODE;
      const lotDebutComposition = document.config.randomization.mode === LOT_DEBUT_TABLE_FILL_MODE;
      const ecologyWindowRandomFill = document.config.randomization.mode === ECOLOGY_WINDOW_RANDOM_FILL_MODE;
      const windowDebutFill = document.config.randomization.mode === WINDOW_DEBUT_FILL_MODE;
      const debutPhaseOnly = [DEBUT_PHASE_ONLY_MODE, WINDOW_DEBUT_QUEUE_MODE]
        .includes(document.config.randomization.mode);
      const contract = debutPhaseOnly
        ? {
            minimum: 0,
            target: debutMaximumForWindow(
              document.config,
              tableWindow,
            ),
            maximum: debutMaximumForWindow(
              document.config,
              tableWindow,
            ),
          }
        : splitComposition || lotDebutComposition || ecologyWindowRandomFill || windowDebutFill
          ? document.config.tableComposition.total
        : document.config.methodRichness[table.method];
      const debutCount = table.metrics.debuts.length;
      const bootstrap = document.config.tableComposition?.bootstrap;
      const isBootstrapTable = splitComposition
        && table.effectiveAccessBatch.startsWith(bootstrap.throughNativeWindow)
        && bootstrap.methods.includes(table.method)
        && debutCount === Math.min(bootstrap.debutTarget, table.nativeCapacity);
      const minimum = document.config.tableMinimumBySurface?.[table.surfaceId] !== undefined
        ? document.config.tableMinimumBySurface[table.surfaceId]
        : isBootstrapTable
        ? Math.min(contract.minimum, bootstrap.debutTarget, table.nativeCapacity)
        : Math.min(contract.minimum, table.nativeCapacity);
      const maximum = Math.min(contract.maximum, table.nativeCapacity);
      check(table.familyDetails.length >= minimum && table.familyDetails.length <= maximum, `${table.surfaceId}: riqueza fuera de contrato`);
      if (splitComposition) {
        const returnCount = table.metrics.returns.length;
        const debutContract = document.config.tableComposition.debut;
        const returnContract = document.config.tableComposition.return;
        check(debutCount <= Math.min(debutContract.maximum, table.nativeCapacity), `${table.surfaceId}: demasiados debuts`);
        if (debutCount > 0) check(debutCount >= debutContract.minimum, `${table.surfaceId}: debuts por debajo del mínimo`);
        check(returnCount <= Math.min(returnContract.maximum, table.nativeCapacity - debutCount), `${table.surfaceId}: demasiados regresos`);
      }
      if (lotDebutComposition || ecologyWindowRandomFill || debutPhaseOnly || windowDebutFill) {
        if (lotDebutComposition) {
          check(
            debutCount <= Math.min(document.config.debutAllocation.maximumPrimaryReservationsPerTable, table.nativeCapacity),
            `${table.surfaceId}: demasiadas reservas primarias de debut`,
          );
        }
        if (debutPhaseOnly) {
          check(table.metrics.returns.length === 0, `${table.surfaceId}: la fase 1 contiene regresos`);
          check(
            debutCount <= Math.min(
              debutMaximumForWindow(document.config, tableWindow),
              table.nativeCapacity,
            ),
            `${table.surfaceId}: supera D`,
          );
        }
        if (windowDebutFill) {
          check(
            debutCount <= Math.min(
              debutMaximumForWindow(document.config, tableWindow),
              table.nativeCapacity,
            ),
            `${table.surfaceId}: supera D de su ventana`,
          );
        }
        check(
          windowDebutFill
            ? table.metrics.sameWindowReturns.length + table.metrics.priorWindowReturns.length
              === table.metrics.returns.length
            : table.metrics.sameLotReturns.length + table.metrics.priorLotReturns.length
              === table.metrics.returns.length,
          `${table.surfaceId}: la procedencia de los regresos no cierra`,
        );
      }
      check(!Object.hasOwn(table, 'poolId'), `${table.surfaceId}: la tabla conserva poolId`);
    }
    table.slots.forEach((slot, index) => {
      const native = source.nativeSlots[index];
      check(slot.slotIndex === native.slotIndex, `${table.surfaceId}/${index}: cambió slotIndex`);
      check(slot.weight === native.weight, `${table.surfaceId}/${index}: cambió peso`);
      check(slot.minLevel === native.minLevel && slot.maxLevel === native.maxLevel, `${table.surfaceId}/${index}: cambiaron niveles`);
    });
    for (const detail of table.familyDetails) {
      check(detail.timingPosition !== 'early', `${table.surfaceId}/${detail.familyKey}: apareció antes de su ventana nativa`);
      if ([
        LOT_DEBUT_TABLE_FILL_MODE,
        ECOLOGY_WINDOW_RANDOM_FILL_MODE,
        DEBUT_PHASE_ONLY_MODE,
        WINDOW_DEBUT_QUEUE_MODE,
        WINDOW_DEBUT_FILL_MODE,
      ].includes(document.config.randomization?.mode)) {
        check(typeof detail.debutBatchId === 'string', `${table.surfaceId}/${detail.familyKey}: falta lote de debut`);
        if (detail.availabilityRole === 'debut') {
          check(detail.debutBatchId === table.effectiveAccessBatch, `${table.surfaceId}/${detail.familyKey}: reserva fuera de su lote de debut`);
          check(detail.returnScope === null, `${table.surfaceId}/${detail.familyKey}: un debut no puede tener procedencia de regreso`);
        } else {
          const expectedScope = windowDebutFill
            ? (detail.debutWindow === tableWindow
                ? 'same-window'
                : 'prior-window')
            : (detail.debutBatchId === table.effectiveAccessBatch ? 'same-lot' : 'prior-lot');
          check(detail.returnScope === expectedScope, `${table.surfaceId}/${detail.familyKey}: procedencia de regreso incorrecta`);
          check(
            windowDebutFill
              ? Number(detail.debutWindow) <= Number(tableWindow)
              : document.batchOrder.indexOf(detail.debutBatchId)
                <= document.batchOrder.indexOf(table.effectiveAccessBatch),
            `${table.surfaceId}/${detail.familyKey}: usa una familia de una frontera futura`,
          );
        }
      }
      if (detail.availabilityRole === 'debut') debutCounts.set(detail.familyKey, (debutCounts.get(detail.familyKey) ?? 0) + 1);
    }
  }
  check(
    debutCounts.size === (windowDebutAllocation
      ? document.metrics.coverage.usedWildFamilies
      : document.familyPartition.ordinaryWildFamilies)
      && [...debutCounts.values()].every((count) => count === 1),
    'los debuts no son únicos',
  );
  return { ok: errors.length === 0, errors };
}

function membershipTokens(distribution, collection, idField) {
  return new Set(distribution[collection].flatMap((entry) => {
    const families = collection === 'tables'
      ? entry.familyDetails.map((family) => family.familyKey)
      : entry.familyKeys;
    return families.map((familyKey) => `${entry[idField]}:${familyKey}`);
  }));
}

function jaccardChangePercent(left, right) {
  const union = new Set([...left, ...right]);
  let intersection = 0;
  for (const token of left) if (right.has(token)) intersection += 1;
  return round((1 - intersection / union.size) * 100, 2);
}

export function measureDistributionDiversity(left, right) {
  invariant(left.seed !== right.seed, 'la diversidad entre seeds exige dos seeds distintas');
  invariant(
    left.surfaceCatalog.length === right.surfaceCatalog.length
      && left.tables.length === right.tables.length,
    'las distribuciones comparadas no comparten estructura',
  );
  invariant(
    left.surfaceCatalog.map((surface) => surface.surfaceId).join('\u0000')
      === right.surfaceCatalog.map((surface) => surface.surfaceId).join('\u0000')
      && left.tables.map((table) => table.surfaceId).join('\u0000')
        === right.tables.map((table) => table.surfaceId).join('\u0000'),
    'las distribuciones comparadas no comparten las mismas tablas',
  );
  const comparePools = Array.isArray(left.pools) && Array.isArray(right.pools);
  return {
    comparisonUnit: 'unordered-family-membership',
    leftSeed: left.seed,
    rightSeed: right.seed,
    ...(comparePools ? {
      changedPoolMembershipPercent: jaccardChangePercent(
        membershipTokens(left, 'pools', 'poolId'),
        membershipTokens(right, 'pools', 'poolId'),
      ),
    } : {}),
    changedTableMembershipPercent: jaccardChangePercent(
      membershipTokens(left, 'tables', 'surfaceId'),
      membershipTokens(right, 'tables', 'surfaceId'),
    ),
  };
}

export async function buildDistribution(options = {}) {
  const inputs = await readInputs(options);
  const context = buildContext(inputs);
  const candidates = buildCandidates(context);
  const allocation = allocate(context, candidates);
  const preliminary = buildTables(context, candidates, allocation);
  const metricsBeforeRelief = buildMetrics(context, preliminary.tables, preliminary.blockers, allocation.inheritanceReservations);
  const relief = applyTemporalRelief(context, candidates, allocation, preliminary);
  const tableBuild = buildTables(context, candidates, allocation);
  const tables = tableBuild.tables;
  const metrics = buildMetrics(context, tables, tableBuild.blockers, allocation.inheritanceReservations);
  const tableById = new Map(tables.map((table) => [table.surfaceId, table]));
  const appliedReliefs = relief.applied.map((entry) => {
    const table = tableById.get(entry.reliefSurfaceId);
    const detail = table?.familyDetails.find((row) => row.familyKey === entry.familyKey);
    invariant(detail?.availabilityRole === 'debut' && detail.temporalRelief, `${entry.familyKey}: el alivio no produjo el debut esperado`);
    invariant(detail.timingDistance === context.config.temporalRelief.requiredTimingDistance, `${entry.familyKey}: el alivio quedó fuera de ventana`);
    invariant(detail.localMass >= context.config.temporalRelief.minimumLocalMassPercent, `${entry.familyKey}: masa de alivio ${detail.localMass}% inferior al mínimo`);
    return { ...entry, localMass: detail.localMass };
  });
  metrics.temporalRelief = {
    enabled: relief.enabled,
    direction: relief.direction,
    candidateOutliers: relief.candidateOutliers,
    outliersBefore: metricsBeforeRelief.timing.outliers,
    applied: appliedReliefs.length,
    outliersPrevented: metricsBeforeRelief.timing.outliers - metrics.timing.outliers,
    outliersAfter: metrics.timing.outliers,
    ...(usesNoTemporalRelief(context)
      ? {}
      : {
          minimumLocalMassPercent: context.config.temporalRelief.minimumLocalMassPercent,
          ...(usesTableOnlyAllocation(context)
            ? { maximumPerTable: context.config.temporalRelief.maximumPerTable }
            : { maximumPerLandPool: context.config.temporalRelief.maximumPerLandPool }),
        }),
    reliefs: appliedReliefs,
  };
  const base = {
    schemaVersion: 2,
    runId: context.config.runId,
    datasetId: context.config.datasetId,
    algorithmVersion: context.config.algorithmVersion,
    modelStatus: context.config.modelStatus ?? 'experimental',
    status: 'proposal',
    approval: 'unapproved',
    romPromotionStatus: 'not-promoted',
    seed: context.config.seed,
    generatedFrom: {
      sourceCatalog: { path: 'generators/fauna/sources/catalog.generated.json', sha256: sha256(inputs.texts.sourceText) },
      familyPolicy: { path: 'generators/fauna/policy/family-policy.generated.json', sha256: sha256(inputs.texts.policyText) },
      pokedex: { path: 'app/generated/pokedex.json', sha256: sha256(inputs.texts.pokedexText) },
      ...(inputs.texts.fireRedHeritageText ? {
        fireRedHeritage: { path: 'generators/fauna/sources/firered-heritage.generated.json', sha256: sha256(inputs.texts.fireRedHeritageText) },
      } : {}),
      config: {
        path: context.config.randomization
          ? relative(WIKI_ROOT, inputs.configPath).replaceAll('\\', '/')
          : `generators/fauna/config/${context.config.runId.toLowerCase()}.json`,
        sha256: sha256(canonicalJson(context.config)),
      },
      generator: {
        path: 'generators/fauna/generate.mjs',
        sha256: context.config.randomization
          ? sha256(inputs.texts.generatorText)
          : LEGACY_GENERATOR_SHA256,
      },
      engine: { path: 'generators/fauna/engine.mjs', sha256: sha256(inputs.texts.engineText) },
      priorRunArtifacts: [],
      romWildSpeciesUsage: 'not-read; C1/C2 use only the frozen pristine FireRed source',
    },
    config: context.config,
    algorithm: {
      generationScope: 'global-campaign',
      reviewScope: 'lot-by-lot',
      stages: usesWindowDebutFill(context)
        ? ['family-catalog', 'seeded-family-no-spawn-roll', 'surface-catalog', 'window-loop', 'exact-debut-matching', 'compatible-debut-matching', 'window-round-robin-fill']
        : usesWindowDebutQueue(context)
        ? ['family-catalog', 'surface-catalog', 'window-loop', 'exact-debut-matching', 'compatible-debut-matching']
        : usesDebutPhaseOnly(context)
          ? ['family-catalog', 'surface-catalog', 'candidate-buckets-p1v0-through-p2v8', 'seeded-debut-allocation']
        : usesEcologyWindowRandomFill(context)
          ? ['family-catalog', 'surface-catalog', 'explicit-parameters', 'seeded-table-minimum-fill', 'global-coverage-repair', 'seeded-table-target-fill', 'derive-debuts']
        : (usesLotDebutTableFill(context)
            ? ['family-catalog', 'surface-catalog', 'explicit-parameters', 'lot-debut-allocation', 'lot-joint-table-fill', 'temporal-relief']
            : (usesSplitTableComposition(context)
                ? ['family-catalog', 'surface-catalog', 'explicit-parameters', 'debut-allocation', 'return-fill', 'table-total-fill', 'temporal-relief']
                : ['family-catalog', 'surface-catalog', 'explicit-parameters', 'table-allocation', 'temporal-relief'])),
      selectionOrder: usesSeededQualityBands(context)
        ? (usesWindowDebutFill(context)
            ? ['fixed phase-1 debuts', 'fresh exact before fresh compatible', 'reused exact before reused compatible', 'avoid previous same-method table', 'lowest window usage', 'nearest native window', 'seeded tie']
            : usesWindowDebutQueue(context)
            ? ['campaign window', 'exact ecology phase before compatible phase', 'oldest pending native window', 'seeded tie', 'maximum D unique debuts per table']
            : usesDebutPhaseOnly(context)
              ? ['smallest non-early native-window distance', 'exact ecology before compatible within that distance', 'seeded family choice', 'maximum D unique debuts per table']
            : usesEcologyWindowRandomFill(context)
            ? ['ecology exact before compatible', 'nearest native gym window', 'seeded family choice']
            : (usesLotDebutTableFill(context)
                ? ['one primary debut reservation per family', 'lot-wide availability frontier', 'joint round-robin table fill', 'hard method/context/balance eligibility', 'timing quality band', 'seeded family choice']
                : (usesSplitTableComposition(context)
                    ? ['unique debuts with campaign reservation', 'previously debuted returns', 'table total', 'hard method/context/balance eligibility', 'timing quality band', 'seeded family choice']
                    : ['hard method/context/balance eligibility', 'timing quality band', 'seeded family choice', 'ecology/timing tie quality', 'recurrence'])))
        : ['method/context', 'ecology', 'native gym window', 'balance guardrail', 'recurrence', 'seeded stable tie'],
      ...(usesTableOnlyAllocation(context)
        ? { allocationUnit: 'table; every map, floor, variant and method is independent' }
        : { poolGrouping: 'batchId + regionMapSection + medium' }),
      ...(usesLotDebutTableFill(context)
        ? { temporalRoleUnit: 'lot; table order never gates same-lot reuse' }
        : (usesWindowDebutFill(context)
            ? { temporalRoleUnit: 'window; every phase-1 debut is reusable throughout its assigned window' }
            : usesDebutPhaseOnly(context)
            ? { temporalRoleUnit: 'explicit debut only; repeats and returns are not generated yet' }
            : usesEcologyWindowRandomFill(context)
            ? { temporalRoleUnit: 'derived from the earliest actual occurrence; no debut reservation' }
            : {})),
      inheritanceUsage: context.config.inheritanceMode === 'C0'
        ? 'C0; no FireRed family reservations and no historical distribution input'
        : `${context.config.inheritanceMode}; up to ${context.config.fireRedInheritance.maximumReservationsPerTable} pristine FireRed families per exact table before its remaining fill; no prior-run input`,
      slotMaterialization: 'native capacity, weights and levels preserved; entry species only',
      temporalRelief: usesNoTemporalRelief(context)
        ? { enabled: false, reason: 'not part of this algorithm' }
        : context.config.temporalRelief,
      ...(context.config.randomization
        ? {
            randomization: {
              ...context.config.randomization,
              determinism: 'same inputs and seed produce byte-identical output',
              retryPolicy: 'none',
              gameplayViabilityGate: 'none; an unviable seed is a valid run outcome',
            },
          }
        : {}),
    },
    familyPartition: {
      catalogFamilies: context.policy.summary.familyCount,
      ordinaryWildFamilies: context.policyWildFamilies.length,
      spawnEligibleFamilies: context.families.length,
      noSpawnFamilies: context.noSpawnFamilies.map((family) => family.familyKey),
      excludedFamilies: context.policy.summary.excludedFamilyCount,
      starterFamilies: context.policy.summary.starterFamilyCount,
      specialFamilies: context.policy.summary.specialFamilyCount,
      fossilFamilies: context.policy.summary.fossilFamilyCount ?? 0,
      directOnlyFamilies: context.policy.summary.directSourceOnlyFamilyCount,
      partitionSource: 'explicit policy over the complete 202-family catalog',
    },
    batchOrder: context.batchOrder,
    surfaceCatalog: surfaceCatalog(context),
    ...(usesTableOnlyAllocation(context) ? {} : { pools: poolCatalog(context) }),
    tables,
    metrics,
  };
  const document = { ...base, contentDigest: sha256(canonicalJson(base)) };
  const validation = validateDistribution(document);
  invariant(
    validation.ok,
    `la salida no pasa validación:\n${validation.errors.join('\n')}\nCobertura: ${document.metrics.coverage.usedWildFamilies}/${document.familyPartition.ordinaryWildFamilies}`,
  );
  return document;
}

export function renderDistribution(document) {
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
    else invariant(false, 'uso: generate.mjs [--check] [--config ruta] [--output ruta]');
  }
  const document = await buildDistribution({ configPath });
  const rendered = renderDistribution(document);
  if (check) {
    const current = await readFile(outputPath, 'utf8');
    invariant(current === rendered, `${document.runId} cambió; ejecutar generate.mjs`);
    process.stdout.write(`${document.runId} reproducible: ${document.tables.length} superficies, ${document.metrics.coverage.slots} slots, ${document.metrics.coverage.usedWildFamilies} familias.\n`);
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
