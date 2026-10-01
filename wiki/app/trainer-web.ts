import path from "node:path";
import { readdir } from "node:fs/promises";
import { readCurrentTrainers } from "./trainer-current";
import { createVerifiedViewCache, sourceFingerprint } from "./verified-view-cache.mjs";
import { readVisibleTrainerEntries } from "./trainer-visibility.mjs";

// Only the web view is cached. Authoring and audit callers retain the full reader.
const root = path.resolve(process.cwd(), "..");
const sourceRoots = [
  "wiki/app", "wiki/content", "wiki/generators",
  "pokefirered/src", "pokefirered/data", "pokefirered/include",
];
const cache = createVerifiedViewCache({
  staleWhileRevalidate: true,
  file: path.join(root, "wiki/.cache/trainer-web.json"),
  fingerprint: async () => {
    const contracts = (await readdir(root)).filter(name => name === "DECISIONS.md" || /^TRAINER_.*\.md$/.test(name));
    // Shared assistant tooling is not consumed by publication/revision readers.
    const authoring = (await readdir(path.join(root, "wiki/trainer-authoring")))
      .filter(name => !["skills", "context-tools", ".cache"].includes(name))
      .map(name => `wiki/trainer-authoring/${name}`);
    return sourceFingerprint(root, [...sourceRoots, ...authoring.sort(), ...contracts.sort()]);
  },
  build: readCurrentTrainers,
});

export const readWebTrainers: typeof readCurrentTrainers = () => readVisibleTrainerEntries(
  cache, path.join(root, "wiki/content/trainer-publication-batches.json"),
);
export async function readWebTrainerView() {
  const entries = await readWebTrainers();
  const status = cache.status();
  const notice = status === "ready" ? null : status === "refreshing"
    ? "Actualizando equipos. Puedes consultar la última versión verificada mientras tanto."
    : "La actualización de equipos está pendiente. Se muestra la última versión verificada.";
  return { entries, notice };
}
