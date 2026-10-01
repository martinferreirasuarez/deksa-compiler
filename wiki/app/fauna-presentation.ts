export const faunaMethodLabels = {
  land: "Tierra",
  surf: "Surf",
  rock_smash: "Golpe Roca",
  old_rod: "Caña Vieja",
  good_rod: "Caña Buena",
  super_rod: "Supercaña",
} as const;

export type FaunaMethod = keyof typeof faunaMethodLabels;

export function compactLevelLabel(levels: readonly number[]) {
  const sorted = [...new Set(levels)].sort((left, right) => left - right);
  const ranges: string[] = [];
  let start = sorted[0];
  let end = start;
  for (const level of sorted.slice(1)) {
    if (end !== undefined && level === end + 1) {
      end = level;
      continue;
    }
    if (start !== undefined && end !== undefined) ranges.push(start === end ? `${start}` : `${start}–${end}`);
    start = level;
    end = level;
  }
  if (start !== undefined && end !== undefined) ranges.push(start === end ? `${start}` : `${start}–${end}`);
  return `Nv. ${ranges.join(" · ")}`;
}

export function humanizeFaunaMapName(mapName: string) {
  return mapName
    .replace(/([a-z])([A-Z])/gu, "$1 $2")
    .replace(/([A-Za-z])(\d)/gu, "$1 $2")
    .replace(/^Route\b/u, "Ruta");
}
