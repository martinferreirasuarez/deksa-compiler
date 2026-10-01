import acceptances from "../content/lot-editorial-acceptances.json" with { type: "json" };

export function isLotEditoriallyAccepted(
  entries: readonly { trainerId: string; sha256: string; trainer: { lotId: string }; itemRevisionDigest?: string }[],
  lotId: string,
) {
  const record = (acceptances.lots as Record<string, { publications: Record<string, string> }>)[lotId];
  if (!record) return false;
  const members = entries.filter(entry => entry.trainer.lotId === lotId);
  // An accepted historical team does not automatically accept a new item review.
  // El usuario acepta la revisión de objetos por Autor/Corrector; no reabre el lote.
  return members.length === Object.keys(record.publications).length
    && new Set(members.map(entry => entry.trainerId)).size === members.length
    && members.every(entry => record.publications[entry.trainerId] === entry.sha256);
}
