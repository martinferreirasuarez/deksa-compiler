// Estos lotes tienen fauna y lugares, pero ningún combate de entrenador.
export const beta5TrainerFreeLots = new Set(["07C", "09H"]);

export function beta5LotProgress(lotId: string, trainerCount: number) {
  if (trainerCount > 0) return { className: "building", label: "Entrenadores publicados" } as const;
  if (beta5TrainerFreeLots.has(lotId)) return { className: "building", label: "Etapa sin entrenadores" } as const;
  return { className: "pending", label: "Etapa pendiente" } as const;
}
