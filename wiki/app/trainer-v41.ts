import { readFile } from "node:fs/promises";
import path from "node:path";
import { readTrainerPublication, type TrainerPublicationEntry } from "./trainer-v21";

// Workflow v41 retains the v40 mechanical materializer; model provenance is not relabelled.
export async function readTrainerV41(
  loadText: (filename: string) => Promise<string> = filename => readFile(filename, "utf8"),
): Promise<TrainerPublicationEntry<"v40">[]> {
  const files = new Map<string, string>();
  const cached = async (filename: string) => {
    if (!files.has(filename)) files.set(filename, await loadText(filename));
    return files.get(filename)!;
  };
  const entries = await readTrainerPublication("v40", cached, { directory: "v41", generatorId: "beta4-v41" });
  for (const entry of entries) {
    const { payload } = JSON.parse(await cached(path.join(process.cwd(), "trainer-authoring/v41/published", `${entry.runId}.json`)));
    const author = payload.author?.provenance, corrector = payload.corrector?.provenance;
    const solAllowed = ["COMÚN", "AVANZADO"].includes(entry.trainer.profile.toLocaleUpperCase("es"));
    if (!author || !corrector || author.model !== (solAllowed ? "gpt-5.6-sol" : "gpt-6-astra")
      || corrector.model !== "gpt-6-astra" || [author, corrector].some(p => p.effort !== "low" || p.contextMode !== "fresh" || typeof p.actorId !== "string" || !p.actorId)
      || author.actorId === corrector.actorId) throw new Error("Publicación v41: procedencia/modelos independientes inválidos.");
  }
  return entries;
}
