/**
 * Las corridas conservadas son evidencia histórica. Sólo una publicación
 * seleccionada explícitamente por el taller puede alimentar la vista activa.
 */
export function selectActiveTrainerRuns<T extends { id: string }>(
  runs: readonly T[],
  activePublication: string | null,
): T[] {
  if (activePublication === null) return [];
  return runs.filter(({ id }) => id === activePublication);
}
