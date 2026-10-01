import { readFile } from "node:fs/promises";
import path from "node:path";
import { readTrainerPublication, type TrainerPublicationEntry } from "./trainer-v21";

// The mechanical materializer remains v40. v42 is explicitly one actor, not two reviewers.
export async function readTrainerV42(
  loadText: (filename: string) => Promise<string> = filename => readFile(filename, "utf8"),
): Promise<TrainerPublicationEntry<"v40">[]> {
  const files = new Map<string, string>();
  const cached = async (filename: string) => {
    if (!files.has(filename)) files.set(filename, await loadText(filename));
    return files.get(filename)!;
  };
  const entries = await readTrainerPublication("v40", cached, { directory: "v42", generatorId: "beta4-v42" });
  for (const entry of entries) {
    const { payload } = JSON.parse(await cached(path.join(process.cwd(), "trainer-authoring/v42/published", `${entry.runId}.json`)));
    const author = payload.author?.provenance, review = payload.selfReview?.provenance;
    if (!author || !review || payload.independentReview !== false || payload.reviewMode !== "SAME_ACTOR_SAME_SESSION"
      || author.role !== "author" || review.role !== "self-review" || payload.corrector !== undefined
      || [author, review].some(p => p.model !== "gpt-6-astra" || p.effort !== "low" || p.contextMode !== "fresh"
        || typeof p.actorId !== "string" || !p.actorId || p.executionRef !== p.actorId)
      || author.actorId !== review.actorId || payload.validations?.selfReview?.ok !== true) {
      throw new Error("Publicación v42: autorrevisión/procedencia inválida.");
    }
  }
  return entries;
}
