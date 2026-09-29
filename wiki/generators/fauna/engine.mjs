const STATUS_RANK = Object.freeze({ ok: 0, review: 1, block: 2 });

export const ECOLOGY_FIT = Object.freeze({
  EXACT: 'exact',
  COMPATIBLE: 'compatible',
  INVALID: 'invalid',
});

export const ECOLOGY_FIT_RANK = Object.freeze({
  [ECOLOGY_FIT.EXACT]: 0,
  [ECOLOGY_FIT.COMPATIBLE]: 1,
  [ECOLOGY_FIT.INVALID]: 2,
});

export const BALANCE_STATUS = Object.freeze({
  OK: 'ok',
  REVIEW: 'review',
  BLOCK: 'block',
});

export const DEFAULT_INHERITANCE_LIMITS = Object.freeze({
  C0: 0,
  C1: 1,
  C2: 2,
});

export const DEFAULT_POOL_CONTRACTS = Object.freeze({
  land: Object.freeze({ target: 5, minimum: 4, maximum: 6, sharedAcrossMethods: false }),
  aquatic: Object.freeze({ target: 4, minimum: 3, maximum: 5, sharedAcrossMethods: true }),
});

export const DEFAULT_METHOD_POOL_KIND = Object.freeze({
  land: 'land',
  rock_smash: 'land',
  surf: 'aquatic',
  old_rod: 'aquatic',
  good_rod: 'aquatic',
  super_rod: 'aquatic',
});

function invariant(condition, message) {
  if (!condition) throw new Error(`Fauna engine: ${message}`);
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function key(value, label) {
  invariant(typeof value === 'string' && value.length > 0, `${label} must be a non-empty string`);
  return value;
}

function numeric(value, label) {
  invariant(typeof value === 'number' && !Number.isNaN(value), `${label} must be numeric`);
  return value;
}

function normalizedTag(value) {
  return String(value ?? '').trim().toLowerCase().replaceAll('-', '_').replaceAll(' ', '_');
}

function uniqueSorted(values) {
  return [...new Set(values)].sort(compareScalars);
}

function compareScalars(left, right) {
  if (left === right) return 0;
  invariant(typeof left === typeof right, `cannot compare ${typeof left} with ${typeof right}`);
  if (typeof left === 'number') {
    invariant(!Number.isNaN(left) && !Number.isNaN(right), 'NaN is not a valid ranking value');
    return left < right ? -1 : 1;
  }
  if (typeof left === 'string') return left < right ? -1 : 1;
  if (typeof left === 'boolean') return left ? 1 : -1;
  throw new Error(`Fauna engine: unsupported ranking value ${typeof left}`);
}

/** Compare two priority tuples. Earlier fields always dominate later fields. */
export function compareLexicographic(left, right) {
  invariant(Array.isArray(left) && Array.isArray(right), 'lexicographic scores must be arrays');
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    if (index >= left.length) return -1;
    if (index >= right.length) return 1;
    const compared = compareScalars(left[index], right[index]);
    if (compared !== 0) return compared;
  }
  return 0;
}

/** Deterministic sort: the semantic tuple dominates, then a unique stable key. */
export function sortLexicographically(items, { tupleFor, keyFor }) {
  invariant(Array.isArray(items), 'items must be an array');
  invariant(typeof tupleFor === 'function', 'tupleFor must be a function');
  invariant(typeof keyFor === 'function', 'keyFor must be a function');
  const decorated = items.map((item) => ({
    item,
    stableKey: key(keyFor(item), 'stable key'),
    tuple: tupleFor(item),
  }));
  invariant(new Set(decorated.map((row) => row.stableKey)).size === decorated.length, 'stable keys must be unique');
  decorated.sort((left, right) => (
    compareLexicographic(left.tuple, right.tuple)
    || compareScalars(left.stableKey, right.stableKey)
  ));
  return decorated.map((row) => row.item);
}

/**
 * Ordered campaign axis plus named, inclusive native phases. Phases may leave
 * gaps, but may not overlap: a batch cannot have two native meanings.
 */
export function buildNativeTimeline({ batchOrder, phases = [] }) {
  invariant(Array.isArray(batchOrder) && batchOrder.length > 0, 'batchOrder must be non-empty');
  const orderedBatches = batchOrder.map((batchId) => key(batchId, 'batch id'));
  invariant(new Set(orderedBatches).size === orderedBatches.length, 'batchOrder repeats a batch');
  const indexByBatch = new Map(orderedBatches.map((batchId, index) => [batchId, index]));
  const indexOf = (batchId) => {
    invariant(indexByBatch.has(batchId), `unknown batch ${batchId}`);
    return indexByBatch.get(batchId);
  };
  const normalizedPhases = phases.map((phase) => {
    invariant(isRecord(phase), 'native phase must be an object');
    const phaseId = key(phase.phaseId ?? phase.id, 'phase id');
    const startBatch = key(phase.startBatch, `${phaseId} startBatch`);
    const endBatch = key(phase.endBatch, `${phaseId} endBatch`);
    const startIndex = indexOf(startBatch);
    const endIndex = indexOf(endBatch);
    invariant(startIndex <= endIndex, `${phaseId} ends before it starts`);
    return {
      phaseId,
      startBatch,
      endBatch,
      startIndex,
      endIndex,
      batchIds: orderedBatches.slice(startIndex, endIndex + 1),
    };
  }).sort((left, right) => left.startIndex - right.startIndex || compareScalars(left.phaseId, right.phaseId));
  invariant(new Set(normalizedPhases.map((phase) => phase.phaseId)).size === normalizedPhases.length, 'native phases repeat an id');
  for (let index = 1; index < normalizedPhases.length; index += 1) {
    invariant(normalizedPhases[index - 1].endIndex < normalizedPhases[index].startIndex, `native phases ${normalizedPhases[index - 1].phaseId} and ${normalizedPhases[index].phaseId} overlap`);
  }
  const phaseById = new Map(normalizedPhases.map((phase) => [phase.phaseId, phase]));
  const phaseFor = (batchId) => {
    const batchIndex = indexOf(batchId);
    return normalizedPhases.find((phase) => batchIndex >= phase.startIndex && batchIndex <= phase.endIndex) ?? null;
  };
  const normalizeRange = (range) => {
    if (typeof range === 'string') {
      invariant(phaseById.has(range), `unknown native phase ${range}`);
      return phaseById.get(range);
    }
    invariant(isRecord(range), 'native range must be a phase id or object');
    const startBatch = key(range.startBatch, 'range startBatch');
    const endBatch = key(range.endBatch, 'range endBatch');
    const startIndex = indexOf(startBatch);
    const endIndex = indexOf(endBatch);
    invariant(startIndex <= endIndex, 'native range ends before it starts');
    return { startBatch, endBatch, startIndex, endIndex };
  };
  const distanceToRange = (batchId, range) => {
    const batchIndex = indexOf(batchId);
    const normalized = normalizeRange(range);
    if (batchIndex < normalized.startIndex) return normalized.startIndex - batchIndex;
    if (batchIndex > normalized.endIndex) return batchIndex - normalized.endIndex;
    return 0;
  };
  const positionToRange = (batchId, range) => {
    const batchIndex = indexOf(batchId);
    const normalized = normalizeRange(range);
    if (batchIndex < normalized.startIndex) return 'before';
    if (batchIndex > normalized.endIndex) return 'after';
    return 'inside';
  };
  return {
    batchOrder: [...orderedBatches],
    phases: normalizedPhases.map((phase) => ({ ...phase, batchIds: [...phase.batchIds] })),
    indexOf,
    phaseFor,
    normalizeRange,
    distance: (leftBatch, rightBatch) => Math.abs(indexOf(leftBatch) - indexOf(rightBatch)),
    distanceToRange,
    positionToRange,
  };
}

/** Distance from a lot's phase index to a two-name inclusive phase window. */
export function distanceToPlacementWindow({ phaseIndex, placementWindow, phaseNames }) {
  numeric(phaseIndex, 'phaseIndex');
  invariant(Number.isInteger(phaseIndex) && phaseIndex >= 0, 'phaseIndex must be a non-negative integer');
  invariant(Array.isArray(phaseNames) && phaseNames.length > 0, 'phaseNames must be a non-empty array');
  const orderedPhases = phaseNames.map((phaseName) => key(phaseName, 'phase name'));
  invariant(new Set(orderedPhases).size === orderedPhases.length, 'phaseNames repeat a phase');
  invariant(phaseIndex < orderedPhases.length, `phaseIndex ${phaseIndex} is outside phaseNames`);
  invariant(Array.isArray(placementWindow) && placementWindow.length === 2, 'placementWindow must contain exactly two phase names');
  const [startPhase, endPhase] = placementWindow.map((phaseName) => key(phaseName, 'placement phase'));
  const startIndex = orderedPhases.indexOf(startPhase);
  const endIndex = orderedPhases.indexOf(endPhase);
  invariant(startIndex >= 0, `unknown placement phase ${startPhase}`);
  invariant(endIndex >= 0, `unknown placement phase ${endPhase}`);
  invariant(startIndex <= endIndex, 'placementWindow ends before it starts');
  if (phaseIndex < startIndex) return startIndex - phaseIndex;
  if (phaseIndex > endIndex) return phaseIndex - endIndex;
  return 0;
}

function compatibilityPairs(compatibility) {
  if (compatibility == null) return [];
  if (Array.isArray(compatibility)) {
    return compatibility.map((pair) => {
      invariant(Array.isArray(pair) && pair.length === 2, 'compatibility pairs must contain two tags');
      return [normalizedTag(pair[0]), normalizedTag(pair[1])];
    });
  }
  invariant(isRecord(compatibility), 'compatibility must be an object or pair array');
  return Object.entries(compatibility).flatMap(([familyTag, surfaceTags]) => {
    invariant(Array.isArray(surfaceTags), `compatibility.${familyTag} must be an array`);
    return surfaceTags.map((surfaceTag) => [normalizedTag(familyTag), normalizedTag(surfaceTag)]);
  });
}

/** Exact overlap wins over configured compatibility; anything else is invalid. */
export function classifyEcologyFit({
  familyHabitats = [],
  surfaceHabitats = [],
  compatibility = [],
  symmetricCompatibility = true,
}) {
  invariant(Array.isArray(familyHabitats) && Array.isArray(surfaceHabitats), 'habitat lists must be arrays');
  const familyTags = uniqueSorted(familyHabitats.map(normalizedTag).filter(Boolean));
  const surfaceTags = uniqueSorted(surfaceHabitats.map(normalizedTag).filter(Boolean));
  const surfaceSet = new Set(surfaceTags);
  const exactMatches = familyTags.filter((tag) => surfaceSet.has(tag));
  if (exactMatches.length > 0) {
    return { status: ECOLOGY_FIT.EXACT, rank: ECOLOGY_FIT_RANK.exact, matches: exactMatches };
  }
  const familySet = new Set(familyTags);
  const configured = compatibilityPairs(compatibility);
  const matches = configured.filter(([left, right]) => (
    (familySet.has(left) && surfaceSet.has(right))
    || (symmetricCompatibility && familySet.has(right) && surfaceSet.has(left))
  )).map(([left, right]) => `${left}:${right}`);
  const status = matches.length > 0 ? ECOLOGY_FIT.COMPATIBLE : ECOLOGY_FIT.INVALID;
  return { status, rank: ECOLOGY_FIT_RANK[status], matches: uniqueSorted(matches) };
}

/**
 * Configurable, audit-friendly guardrail. No threshold is implicit. Explicit
 * reasons and numeric thresholds both obey block > review > ok.
 */
export function evaluateBalanceGuardrail({
  value = null,
  reviewAt = null,
  blockAt = null,
  blockingReasons = [],
  reviewReasons = [],
} = {}) {
  invariant(Array.isArray(blockingReasons) && Array.isArray(reviewReasons), 'guardrail reasons must be arrays');
  if (value !== null) numeric(value, 'guardrail value');
  if (reviewAt !== null) numeric(reviewAt, 'reviewAt');
  if (blockAt !== null) numeric(blockAt, 'blockAt');
  if (reviewAt !== null && blockAt !== null) invariant(reviewAt <= blockAt, 'reviewAt cannot exceed blockAt');
  const reasons = [];
  const thresholdBlock = value !== null && blockAt !== null && value >= blockAt;
  const thresholdReview = value !== null && reviewAt !== null && value >= reviewAt;
  if (thresholdBlock) reasons.push(`value ${value} reached block threshold ${blockAt}`);
  reasons.push(...blockingReasons.map(String));
  if (reasons.length > 0) return { status: BALANCE_STATUS.BLOCK, rank: STATUS_RANK.block, reasons };
  if (thresholdReview) reasons.push(`value ${value} reached review threshold ${reviewAt}`);
  reasons.push(...reviewReasons.map(String));
  if (reasons.length > 0) return { status: BALANCE_STATUS.REVIEW, rank: STATUS_RANK.review, reasons };
  return { status: BALANCE_STATUS.OK, rank: STATUS_RANK.ok, reasons: [] };
}

/** Scarce families are handled first; callers may add deadline-like tie-breaks. */
export function prioritizeFamiliesByCandidateScarcity(families, {
  candidatesFor,
  candidateKeyFor = (candidate) => (
    typeof candidate === 'string'
      ? candidate
      : candidate.candidateId ?? candidate.surfaceId ?? candidate.id
  ),
  secondaryTupleFor = () => [],
  keyFor = (family) => family.familyKey,
}) {
  invariant(Array.isArray(families), 'families must be an array');
  invariant(typeof candidatesFor === 'function', 'candidatesFor must be a function');
  invariant(typeof candidateKeyFor === 'function', 'candidateKeyFor must be a function');
  invariant(typeof secondaryTupleFor === 'function', 'secondaryTupleFor must be a function');
  return sortLexicographically(families, {
    keyFor,
    tupleFor: (family) => {
      const candidates = candidatesFor(family);
      invariant(Array.isArray(candidates), `${keyFor(family)} candidates must be an array`);
      const uniqueCandidates = new Set(candidates.map((candidate) => key(candidateKeyFor(candidate), 'candidate key')));
      const secondary = secondaryTupleFor(family);
      invariant(Array.isArray(secondary), 'secondaryTupleFor must return an array');
      return [uniqueCandidates.size, ...secondary];
    },
  });
}

function inheritanceLimit(mode, limits) {
  invariant(isRecord(limits), 'inheritance limits must be an object');
  invariant(Object.hasOwn(limits, mode), `unknown inheritance mode ${mode}`);
  const limit = numeric(limits[mode], `${mode} inheritance limit`);
  invariant(Number.isInteger(limit) && limit >= 0, `${mode} inheritance limit must be a non-negative integer`);
  return limit;
}

/**
 * Reserve exact FireRed inheritance inside one encounter table. Method,
 * ecology, timing and balance eligibility are resolved upstream and represented
 * by eligibleForInheritance. C is a per-table cap and applies to every method.
 */
export function selectFireRedTableReservations({
  mode = 'C0',
  tableId,
  candidates = [],
  limits = DEFAULT_INHERITANCE_LIMITS,
  eligibleFor = (candidate) => candidate.eligibleForInheritance === true,
  exactFireRedFor = (candidate) => candidate.exactFireRed === true,
  vanillaMassFor = (candidate) => candidate.vanillaMass,
  baseTupleFor = (candidate) => candidate.baseTuple ?? [],
  keyFor = (candidate) => candidate.familyKey,
}) {
  const normalizedTableId = key(tableId, 'tableId');
  invariant(Array.isArray(candidates), 'inheritance candidates must be an array');
  invariant(typeof eligibleFor === 'function' && typeof exactFireRedFor === 'function', 'inheritance eligibility selectors must be functions');
  invariant(typeof vanillaMassFor === 'function' && typeof baseTupleFor === 'function' && typeof keyFor === 'function', 'inheritance ranking selectors must be functions');
  const maximumFamilies = inheritanceLimit(mode, limits);
  if (maximumFamilies === 0) return [];
  const eligible = candidates.filter((candidate) => (
    candidate.tableId === normalizedTableId
    && eligibleFor(candidate)
    && exactFireRedFor(candidate)
  ));
  return sortLexicographically(eligible, {
    keyFor,
    tupleFor: (candidate) => {
      const vanillaMass = numeric(vanillaMassFor(candidate), `${keyFor(candidate)} vanilla mass`);
      invariant(vanillaMass >= 0, `${keyFor(candidate)} vanilla mass cannot be negative`);
      const baseTuple = baseTupleFor(candidate);
      invariant(Array.isArray(baseTuple), 'baseTupleFor must return an array');
      return [...baseTuple, -vanillaMass];
    },
  }).slice(0, maximumFamilies);
}

export function inheritanceReservationRank(familyKey, reservations, keyFor = (candidate) => candidate.familyKey) {
  invariant(Array.isArray(reservations), 'inheritance reservations must be an array');
  return reservations.some((candidate) => keyFor(candidate) === familyKey) ? 0 : 1;
}

export function calculateRegionalDebt({ targetByRegion, observedByRegion }) {
  invariant(isRecord(targetByRegion) && isRecord(observedByRegion), 'regional totals must be objects');
  const regions = uniqueSorted([...Object.keys(targetByRegion), ...Object.keys(observedByRegion)]);
  return Object.fromEntries(regions.map((region) => {
    const target = numeric(targetByRegion[region] ?? 0, `${region} target`);
    const observed = numeric(observedByRegion[region] ?? 0, `${region} observed`);
    return [region, Math.max(0, target - observed)];
  }));
}

/**
 * Regional debt is structurally unable to defeat any semantic base criterion.
 * The stable key only total-orders candidates whose base tuple and debt tie.
 */
export function sortWithRegionalDebtLast(items, {
  baseTupleFor,
  regionFor,
  debtByRegion,
  keyFor,
}) {
  invariant(isRecord(debtByRegion), 'debtByRegion must be an object');
  invariant(typeof regionFor === 'function', 'regionFor must be a function');
  return sortLexicographically(items, {
    keyFor,
    tupleFor: (item) => {
      const base = baseTupleFor(item);
      invariant(Array.isArray(base), 'baseTupleFor must return an array');
      const region = key(regionFor(item), 'candidate region');
      const debt = numeric(debtByRegion[region] ?? 0, `${region} debt`);
      return [...base, -debt];
    },
  });
}

function poolContract(kind, contracts) {
  const contract = contracts[kind];
  invariant(isRecord(contract), `missing pool contract ${kind}`);
  const target = numeric(contract.target, `${kind}.target`);
  const minimum = numeric(contract.minimum, `${kind}.minimum`);
  const maximum = numeric(contract.maximum, `${kind}.maximum`);
  invariant(Number.isInteger(target) && Number.isInteger(minimum) && Number.isInteger(maximum), `${kind} pool sizes must be integers`);
  invariant(minimum <= target && target <= maximum, `${kind} pool contract must satisfy minimum <= target <= maximum`);
  return { ...contract, target, minimum, maximum };
}

export function evaluatePoolSize(size, contract) {
  numeric(size, 'pool size');
  invariant(Number.isInteger(size) && size >= 0, 'pool size must be a non-negative integer');
  const normalized = poolContract('requested', { requested: contract });
  return {
    size,
    target: normalized.target,
    minimum: normalized.minimum,
    maximum: normalized.maximum,
    status: size < normalized.minimum ? 'below' : (size > normalized.maximum ? 'above' : 'within'),
    distanceToTarget: Math.abs(size - normalized.target),
  };
}

/**
 * Group surfaces by native scope. All aquatic methods in one scope deliberately
 * share a pool; land-like methods share the land contract.
 */
export function groupNativePools(surfaces, {
  scopeFor = (surface) => surface.scopeId,
  surfaceKeyFor = (surface) => surface.surfaceId,
  methodFor = (surface) => surface.method,
  methodPoolKind = DEFAULT_METHOD_POOL_KIND,
  contracts = DEFAULT_POOL_CONTRACTS,
} = {}) {
  invariant(Array.isArray(surfaces), 'surfaces must be an array');
  invariant(typeof scopeFor === 'function' && typeof surfaceKeyFor === 'function' && typeof methodFor === 'function', 'pool selectors must be functions');
  const groups = new Map();
  for (const surface of surfaces) {
    const scopeId = key(scopeFor(surface), 'pool scope');
    const surfaceId = key(surfaceKeyFor(surface), 'surface id');
    const method = key(methodFor(surface), `${surfaceId} method`);
    const kind = methodPoolKind[method];
    invariant(kind, `${surfaceId} method ${method} has no pool kind`);
    const contract = poolContract(kind, contracts);
    const poolId = `${scopeId}:${kind}`;
    const group = groups.get(poolId) ?? {
      poolId,
      scopeId,
      kind,
      contract,
      surfaceIds: [],
      methods: [],
    };
    group.surfaceIds.push(surfaceId);
    group.methods.push(method);
    groups.set(poolId, group);
  }
  return [...groups.values()]
    .map((group) => ({
      ...group,
      surfaceIds: uniqueSorted(group.surfaceIds),
      methods: uniqueSorted(group.methods),
    }))
    .sort((left, right) => compareScalars(left.poolId, right.poolId));
}
