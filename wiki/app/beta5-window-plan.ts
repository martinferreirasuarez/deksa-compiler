import planJson from "../trainer-authoring/v7/plan/windows.generated.json" with { type: "json" };

export type Beta5Window = {
  id: string;
  label: string;
  ordinal: number;
  batches: string[];
};

export const beta5Windows: Beta5Window[] = planJson.windows;

const windowByLot = new Map(beta5Windows.flatMap((window) =>
  window.batches.map((lotId) => [lotId, window] as const),
));

export function beta5WindowForLot(lotId: string): Beta5Window | undefined {
  return windowByLot.get(lotId);
}
