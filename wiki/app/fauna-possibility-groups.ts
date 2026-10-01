import type { FaunaPossibilityLotView } from "./fauna-possibilities";

type ViewTable = FaunaPossibilityLotView["tables"][number];
export type PossibilityTableGroup = Omit<ViewTable, "id" | "mapName"> & {
  key: string;
  tableIds: string[];
  mapNames: string[];
};

export const habitatLabels: Record<string, string> = {
  coast: "Costa", grassland: "Pradera", freshwater: "Agua dulce", forest: "Bosque",
  cave: "Cueva", rocky: "Rocoso", wetland: "Humedal", mountain: "Montaña",
  haunted: "Embrujado", urban: "Urbano", safari: "Safari", industrial: "Industrial",
  ice_cave: "Cueva helada", island: "Isla", ruins: "Ruinas", volcanic: "Volcánico",
  scrubland: "Matorral", ancient: "Ancestral",
};

export function habitatLabel(tags: readonly string[]) {
  return tags.map(tag => habitatLabels[tag] ?? tag).join(" · ");
}

// A shared species list alone is not enough: preserve all local conditions.
// Map identity deliberately does not participate; grouping never unions pools.
export function groupEquivalentPossibilityTables(tables: readonly ViewTable[]): PossibilityTableGroup[] {
  const groups = new Map<string, PossibilityTableGroup>();
  for (const table of tables) {
    const key = JSON.stringify([
      [...table.habitatTags].sort(), table.method, table.context,
      table.effectiveAccessBatch, table.window.id, table.window.cap,
      table.nativeCapacity, table.familyRichnessEnvelope.minimum, table.familyRichnessEnvelope.maximum,
      table.levelEnvelope.mode, [...table.levelEnvelope.levels].sort((a, b) => a - b),
      table.species.map(s => `${s.speciesId}:${s.familyKey}:${[...s.levels].sort((a, b) => a - b).join(",")}`).sort(),
    ]);
    const existing = groups.get(key);
    if (existing) {
      existing.tableIds.push(table.id);
      if (!existing.mapNames.includes(table.mapName)) existing.mapNames.push(table.mapName);
    } else {
      groups.set(key, {
        ...table, key: table.id, tableIds: [table.id], mapNames: [table.mapName],
        species: [...table.species].sort((a, b) => a.name.localeCompare(b.name, "es")),
      });
    }
  }
  const methodOrder = ["land", "old_rod", "rock_smash", "surf", "good_rod", "super_rod"];
  return [...groups.values()].sort((a, b) =>
    a.effectiveAccessBatch.localeCompare(b.effectiveAccessBatch)
    || methodOrder.indexOf(a.method) - methodOrder.indexOf(b.method));
}
