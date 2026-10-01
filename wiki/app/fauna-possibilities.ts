import faunaPossibilitiesJson from "../content/fauna-possibilities.generated.json";

export type FaunaPossibilitySpecies = {
  speciesId: string;
  speciesKey: string;
  slug: string;
  name: string;
  familyId: number;
  familyKey: string;
  entrySpeciesId: string;
  minLevel: number;
  maxLevel: number;
  levels: number[];
  ecologyFit: "exact" | "compatible";
  ecologyMatches: string[];
  contextFit: string;
  roleEligibility: {
    debutCandidate: boolean;
    returnCandidate: boolean;
    nativeWindow: string;
  };
  recurrenceClass: string;
  habitats: string[];
};

export type FaunaPossibilityTable = {
  id: string;
  canonicalId: string;
  mapId: string;
  mapName: string;
  method: "land" | "surf" | "rock_smash" | "old_rod" | "good_rod" | "super_rod";
  context: string;
  habitatTags: string[];
  effectiveAccessBatch: string;
  window: { id: string; label: string; cap: number };
  nativeCapacity: number;
  familyRichnessEnvelope: { minimum: number; maximum: number };
  levelEnvelope: {
    minLevel: number;
    maxLevel: number;
    levels: number[];
    mode: string;
  };
  species: FaunaPossibilitySpecies[];
};

export type FaunaPossibilityLot = {
  id: string;
  title: string;
  ordinal: number;
  tables: FaunaPossibilityTable[];
};

type FaunaPossibilities = {
  schemaVersion: 1;
  datasetId: string;
  model: string;
  metadata: {
    semantics: "local-eligibility-envelope";
    seedIndependent: true;
    jointRealizability: "not-evaluated";
    seedFamilySuppressionApplied: false;
  };
  lots: FaunaPossibilityLot[];
};

export const faunaPossibilities = faunaPossibilitiesJson as unknown as FaunaPossibilities;

export function faunaPossibilitiesForLot(lotId: string) {
  return faunaPossibilities.lots.find(({ id }) => id === lotId.toUpperCase());
}

export type FaunaPossibilityLotView = {
  id: string;
  tables: Array<Pick<
    FaunaPossibilityTable,
    "id" | "mapName" | "method" | "context" | "effectiveAccessBatch"
    | "habitatTags" | "window" | "nativeCapacity" | "familyRichnessEnvelope" | "levelEnvelope"
  > & {
    species: Array<Pick<
      FaunaPossibilitySpecies,
      "speciesId" | "slug" | "name" | "familyKey" | "levels"
    >>;
  }>;
};

export function faunaPossibilitiesViewForLot(lotId: string): FaunaPossibilityLotView | undefined {
  const lot = faunaPossibilitiesForLot(lotId);
  if (!lot) return undefined;
  return {
    id: lot.id,
    tables: lot.tables.map((table) => ({
      id: table.id,
      mapName: table.mapName,
      method: table.method,
      context: table.context,
      effectiveAccessBatch: table.effectiveAccessBatch,
      habitatTags: table.habitatTags,
      window: table.window,
      nativeCapacity: table.nativeCapacity,
      familyRichnessEnvelope: table.familyRichnessEnvelope,
      levelEnvelope: table.levelEnvelope,
      species: table.species.map((pokemon) => ({
        speciesId: pokemon.speciesId,
        slug: pokemon.slug,
        name: pokemon.name,
        familyKey: pokemon.familyKey,
        levels: pokemon.levels,
      })),
    })),
  };
}

export type FaunaPossibilitySource = {
  batchId: string;
  mapName: string;
  method: FaunaPossibilityTable["method"];
  effectiveAccessBatch: string;
  levels: number[];
};

export function faunaPossibilitySourcesBySpecies() {
  const sources = new Map<string, FaunaPossibilitySource[]>();
  const seen = new Set<string>();
  for (const lot of faunaPossibilities.lots) {
    for (const table of lot.tables) {
      for (const pokemon of table.species) {
        const key = `${pokemon.speciesId}\0${lot.id}\0${table.mapName}\0${table.method}\0${pokemon.levels.join(",")}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const entries = sources.get(pokemon.speciesId) ?? [];
        entries.push({
          batchId: lot.id,
          mapName: table.mapName,
          method: table.method,
          effectiveAccessBatch: table.effectiveAccessBatch,
          levels: pokemon.levels,
        });
        sources.set(pokemon.speciesId, entries);
      }
    }
  }
  return sources;
}
