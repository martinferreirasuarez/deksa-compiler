const BASE = Object.freeze(["omanyte", "kabuto", "lileep", "anorith"]);
const EVOLVED = Object.freeze(["omastar", "kabutops", "cradily", "armaldo"]);
const ALL = Object.freeze([...BASE, ...EVOLVED, "aerodactyl"]);

function invariant(condition, message) {
  if (!condition) throw new Error(`D239 fossil availability: ${message}`);
}

function exactKeys(value, expected) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  return actual.length === wanted.length && actual.every((key, index) => key === wanted[index]);
}

export function validateFossilAvailabilityOverlay(overlay, pokedex) {
  invariant(overlay?.schemaVersion === 1
    && overlay.catalogId === "DEKSA-BETA4-FOSSIL-TRAINER-AVAILABILITY-1"
    && overlay.decisionId === "D-239", "cabecera inválida.");
  invariant(overlay.scope?.axis === "trainerSpeciesAvailability"
    && overlay.scope?.unit === "exact-species"
    && overlay.scope?.appliesOnlyToListedSpecies === true
    && overlay.scope?.doesNotExtendGeneralAuditPastWindow === 4
    && overlay.scope?.noFamilyInheritance === true
    && overlay.scope?.noAnchorLevelBypass === true, "scope demasiado amplio o incompleto.");
  invariant(Array.isArray(overlay.records) && overlay.records.length === ALL.length,
    "se requieren exactamente nueve especies fósiles.");
  invariant(JSON.stringify([...overlay.records.map(row => row.slug)].sort()) === JSON.stringify([...ALL].sort()),
    "inventario fósil divergente.");
  invariant(new Set(overlay.records.map(row => row.nationalDex)).size === ALL.length,
    "nationalDex duplicado.");
  const dexBySlug = new Map(pokedex.species.map(row => [row.slug, row]));
  for (const record of overlay.records) {
    invariant(exactKeys(record, ["nationalDex", "slug", "window", "minimumLevel", "provenance"]),
      `${record.slug ?? "registro"}: campos inesperados.`);
    invariant(dexBySlug.get(record.slug)?.nationalDex === record.nationalDex,
      `${record.slug}: nationalDex no coincide con Pokédex.`);
    const editorial = record.provenance?.kind === "editorial-decision"
      && record.provenance?.decisionId === "D-239";
    if (BASE.includes(record.slug)) {
      invariant(record.window === 2 && record.minimumLevel === 1 && editorial,
        `${record.slug}: la forma básica debe ser autorización editorial W2.`);
    } else if (EVOLVED.includes(record.slug)) {
      invariant(record.window === 5 && record.minimumLevel === 40 && editorial,
        `${record.slug}: la forma evolucionada debe ser autorización editorial W5/nivel40.`);
    } else {
      invariant(record.slug === "aerodactyl" && record.window === 9 && record.minimumLevel === 1
        && record.provenance?.kind === "factual-correction"
        && record.provenance?.decisionId === "D-239"
        && record.provenance?.axis === "minimum.trainersCampaign"
        && record.provenance?.correctedWindow === 9
        && record.provenance?.correction?.excludedRecord === "trainers/heartgold/719"
        && record.provenance?.correction?.correctedWitnessWindow === 9
        && JSON.stringify(record.provenance?.correction?.positiveWitnesses) === JSON.stringify([
          "trainers/firered/TRAINER_ELITE_FOUR_LANCE", "trainers/heartgold/244",
        ]),
      "Aerodactyl debe conservar W9 con Lance FR/HG244 y excluir HG719.");
    }
  }
  return structuredClone(overlay);
}

export function applyFossilAvailabilityOverlay({ baseSpecies, overlay, pokedex }) {
  invariant(Array.isArray(baseSpecies), "baseSpecies debe ser array.");
  const checked = validateFossilAvailabilityOverlay(overlay, pokedex);
  const baseBySlug = new Map(baseSpecies.map(row => [row.slug, row]));
  invariant(baseBySlug.size === baseSpecies.length, "baseSpecies contiene slugs duplicados.");
  const overlayBySlug = new Map(checked.records.map(row => [row.slug, row]));
  for (const slug of ALL) invariant(baseBySlug.has(slug), `${slug}: falta en catálogo base.`);
  const species = baseSpecies.map(base => {
    const record = overlayBySlug.get(base.slug);
    if (record === undefined) return structuredClone(base);
    const factual = record.provenance.kind === "factual-correction";
    return {
      ...structuredClone(base),
      status: factual ? "found" : "authorized",
      window: record.window,
      minimumLevel: record.minimumLevel,
      witnesses: factual ? [...record.provenance.correction.positiveWitnesses] : [],
      evidence: {
        axis: checked.scope.axis,
        sourceRow: `${checked.catalogId}/records[slug=${record.slug}]`,
        blockingUnresolved: [],
        provenance: structuredClone(record.provenance),
      },
      overlayCatalogId: checked.catalogId,
      overlayDecisionId: checked.decisionId,
    };
  });
  return Object.freeze(species);
}

export function fossilSpeciesEligibleAt(record, { window, level }) {
  invariant(record?.overlayDecisionId === "D-239", "record no procede del overlay D239.");
  invariant(Number.isInteger(window) && Number.isInteger(level), "window/level deben ser enteros.");
  return record.window <= window && record.minimumLevel <= level;
}
