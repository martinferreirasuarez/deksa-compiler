import { createHash } from "node:crypto";

export const TRAINER_VARIANTS = Object.freeze(["A", "B", "C"]);
export const TRAINER_VARIANT_SELECTOR_ID =
  "deksa-trainer-variant-selector-v1";

const LOT_DOMAIN = "deksa/trainers/v1/lot";
const CONTINUITY_DOMAIN = "deksa/trainers/v1/continuity";
const ACCEPTED_BYTE_LIMIT = 255;

function assertOpaqueString(value, label) {
  if (typeof value !== "string" || value.length === 0) {
    throw new TypeError(`${label} debe ser un string no vacío.`);
  }
  if (value.trim() !== value) {
    throw new TypeError(`${label} no puede tener espacios exteriores.`);
  }
}

function updateFramed(hash, value) {
  const bytes = Buffer.from(value, "utf8");
  const length = Buffer.allocUnsafe(4);
  length.writeUInt32BE(bytes.length);
  hash.update(length);
  hash.update(bytes);
}

function digestFor(masterSeed, domain, subjectId, attempt) {
  const hash = createHash("sha256");
  for (const component of [
    TRAINER_VARIANT_SELECTOR_ID,
    domain,
    masterSeed,
    subjectId,
    String(attempt),
  ]) {
    updateFramed(hash, component);
  }
  return hash.digest();
}

function variantFor(masterSeed, domain, subjectId) {
  assertOpaqueString(masterSeed, "masterSeed");
  assertOpaqueString(subjectId, "subjectId");

  for (let attempt = 0; ; attempt += 1) {
    const digest = digestFor(masterSeed, domain, subjectId, attempt);
    for (const byte of digest) {
      // 0..254 contains exactly 85 values for each residue modulo three.
      if (byte < ACCEPTED_BYTE_LIMIT) {
        return TRAINER_VARIANTS[byte % TRAINER_VARIANTS.length];
      }
    }
  }
}

export function selectLotVariant(masterSeed, lotId) {
  return variantFor(masterSeed, LOT_DOMAIN, lotId);
}

export function selectContinuityVariant(masterSeed, groupId) {
  return variantFor(masterSeed, CONTINUITY_DOMAIN, groupId);
}

function sortedUniqueIds(ids, label) {
  if (!Array.isArray(ids)) {
    throw new TypeError(`${label} debe ser un array.`);
  }

  const seen = new Set();
  for (const id of ids) {
    assertOpaqueString(id, `${label}[]`);
    if (seen.has(id)) {
      throw new TypeError(`${label} contiene el identificador repetido ${id}.`);
    }
    seen.add(id);
  }

  return [...ids].sort((left, right) =>
    left < right ? -1 : left > right ? 1 : 0,
  );
}

export function buildTrainerVariantPlan({
  masterSeed,
  lotIds,
  continuityGroupIds = [],
  lotContinuityBindings = {},
}) {
  assertOpaqueString(masterSeed, "masterSeed");

  const canonicalLotIds = sortedUniqueIds(lotIds, "lotIds");
  const canonicalContinuityGroupIds = sortedUniqueIds(
    continuityGroupIds,
    "continuityGroupIds",
  );

  if (
    lotContinuityBindings === null ||
    Array.isArray(lotContinuityBindings) ||
    typeof lotContinuityBindings !== "object"
  ) {
    throw new TypeError("lotContinuityBindings debe ser un objeto.");
  }

  const knownLots = new Set(canonicalLotIds);
  const knownContinuityGroups = new Set(canonicalContinuityGroupIds);
  const bindings = new Map();
  for (const [lotId, groupId] of Object.entries(lotContinuityBindings)) {
    if (!knownLots.has(lotId)) {
      throw new TypeError(
        `lotContinuityBindings contiene el lote desconocido ${lotId}.`,
      );
    }
    assertOpaqueString(groupId, `lotContinuityBindings.${lotId}`);
    if (!knownContinuityGroups.has(groupId)) {
      throw new TypeError(
        `lotContinuityBindings contiene el grupo desconocido ${groupId}.`,
      );
    }
    bindings.set(lotId, groupId);
  }

  const continuityLines = canonicalContinuityGroupIds.map((groupId) =>
    Object.freeze({
      groupId,
      variant: selectContinuityVariant(masterSeed, groupId),
    }),
  );
  const continuityVariants = new Map(
    continuityLines.map(({ groupId, variant }) => [groupId, variant]),
  );

  const lots = canonicalLotIds.map((lotId) => {
    const groupId = bindings.get(lotId);
    if (groupId !== undefined) {
      return Object.freeze({
        lotId,
        selectionScope: "continuity",
        selectionId: groupId,
        variant: continuityVariants.get(groupId),
      });
    }

    return Object.freeze({
      lotId,
      selectionScope: "lot",
      selectionId: lotId,
      variant: selectLotVariant(masterSeed, lotId),
    });
  });

  return Object.freeze({
    schemaVersion: 1,
    selectorId: TRAINER_VARIANT_SELECTOR_ID,
    masterSeed,
    lots: Object.freeze(lots),
    continuityLines: Object.freeze(continuityLines),
  });
}
