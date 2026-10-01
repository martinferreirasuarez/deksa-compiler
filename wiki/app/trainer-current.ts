import { readTrainerV19, trainerV19Card, type TrainerV19Entry } from "./trainer-v19";
import { isLotEditoriallyAccepted } from "./lot-editorial-acceptance";
import { readTrainerV20, trainerV20Card, type TrainerV20Entry } from "./trainer-v20";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { readTrainerV21, trainerV21Card, type TrainerV21, type TrainerV21Entry, type PlayerStarter } from "./trainer-v21";
import { readTrainerV22, trainerV22Card, type TrainerV22Entry } from "./trainer-v22";
import { readTrainerV23, trainerV23Card, type TrainerV23Entry } from "./trainer-v23";
import { readTrainerV24, trainerV24Card, type TrainerV24Entry } from "./trainer-v24";
import { readTrainerV25, trainerV25Card, type TrainerV25Entry } from "./trainer-v25";
import { projectTrainerItems } from "../trainer-authoring/item-clause.mjs";
import { readTrainerV26, trainerV26Card, type TrainerV26Entry } from "./trainer-v26";
import { readTrainerV28, trainerV28Card, type TrainerV28Entry } from "./trainer-v28";
import { readTrainerV29, trainerV29Card, type TrainerV29Entry } from "./trainer-v29";
import { readTrainerV30, trainerV30Card, type TrainerV30Entry } from "./trainer-v30";
import { readTrainerV31, trainerV31Card, type TrainerV31Entry } from "./trainer-v31";
import { readTrainerV32, trainerV32Card, type TrainerV32Entry } from "./trainer-v32";
import { readTrainerV33, trainerV33Card, type TrainerV33Entry } from "./trainer-v33";
import { readTrainerV34, trainerV34Card, type TrainerV34Entry } from "./trainer-v34";
import { readTrainerV35, trainerV35Card, type TrainerV35Entry } from "./trainer-v35";
import { readTrainerV36, trainerV36Card, type TrainerV36Entry } from "./trainer-v36";
import { readTrainerV37, trainerV37Card, type TrainerV37Entry } from "./trainer-v37";
import { readTrainerV40, trainerV40Card, type TrainerV40Entry } from "./trainer-v40";
import { readTrainerV41 } from "./trainer-v41";
import { readTrainerV42 } from "./trainer-v42";
import { applyItemRevision } from "../trainer-authoring/item-revisions/v1/reader.mjs";
import { applyFamilyRevision } from "../trainer-authoring/family-revisions/v1/reader.mjs";
import { applyWindowRevision } from "../trainer-authoring/window-revisions/v1/reader.mjs";
import { applyQualityRevision } from "../trainer-authoring/quality-revisions/v1/reader.mjs";
import { applyGlobalCorrection } from "../trainer-authoring/global-corrections/v1/reader.mjs";
import { applyCorrection as applyCurrentGlobalCorrection } from "../trainer-authoring/global-corrections/v2/reader.mjs";
import { operation } from "../trainer-authoring/v32/operation-cache.mjs";
import { readTrainerPublication } from "./trainer-v21";
import { applyPackagePermutation, PACKAGE_PERMUTATION } from "../trainer-authoring/v24/package-permutation.mjs";

type CurrentEntry = (TrainerV19Entry | TrainerV20Entry | TrainerV21Entry | TrainerV22Entry | TrainerV23Entry | TrainerV24Entry | TrainerV25Entry | TrainerV26Entry | TrainerV28Entry | TrainerV29Entry | TrainerV30Entry | TrainerV31Entry | TrainerV32Entry | TrainerV33Entry | TrainerV34Entry | TrainerV35Entry | TrainerV36Entry | TrainerV37Entry | TrainerV40Entry) & {
  presentationTrainer?: TrainerV21;
  itemRevisionDigest?: string;
  familyRevisionDigest?: string;
  windowRevisionDigest?: string;
  qualityRevisionDigest?: string;
  globalCorrectionDigest?: string;
};

export async function currentTrainerPresentation(entry: CurrentEntry,
  loadText: (filename: string) => Promise<string> = (filename) => readFile(filename, "utf8"),
): Promise<CurrentEntry> {
  if (entry.trainerId !== PACKAGE_PERMUTATION.trainerId || entry.trainer.generatorId !== "DEKSA-TRAINER-GENERATOR-V21") return entry;
  const acceptance = JSON.parse(await loadText(path.join(process.cwd(), "..", PACKAGE_PERMUTATION.acceptancePath)));
  const canonical = JSON.stringify(acceptance.payload, (_key, item) => item && typeof item === "object" && !Array.isArray(item)
    ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) : item);
  const audit = acceptance.payload;
  if (!audit || typeof acceptance.digest !== "string" || acceptance.digest !== createHash("sha256").update(canonical).digest("hex")
    || audit.schemaVersion !== 1 || audit.generatorId !== "beta4-v21" || audit.status !== "TRAINER_ACCEPTED"
    || audit.trainerId !== entry.trainerId || audit.lotId !== entry.trainer.lotId
    || audit.publicationPath !== entry.artifactPath || audit.publicationDigest !== entry.sha256
    || typeof audit.acceptedBy !== "string" || !audit.acceptedBy.trim() || !Number.isFinite(Date.parse(audit.acceptedAt))
    || audit.lotAccepted !== false || audit.romPromotion !== false) throw new Error("Aceptación original del rival inválida para la permutación D-248.");
  const derived = applyPackagePermutation({ trainer: entry.trainer, publicationDigest: entry.sha256, acceptanceDigest: acceptance.digest });
  return { ...entry, presentationTrainer: derived.trainer as TrainerV21 };
}

export async function readCurrentTrainers(): Promise<CurrentEntry[]> {
  return operation(readCurrentTrainersInOperation);
}

async function readCurrentTrainersInOperation(): Promise<CurrentEntry[]> {
  // Rendering checks the sealed publications; full workflow replay belongs to authoring.
  const versions = await Promise.all([readTrainerV19(), readTrainerV20(), readTrainerV21(), readTrainerV22(), readTrainerV23(), readTrainerV24(), readTrainerV25(), readTrainerV26(), readTrainerV28(), readTrainerV29(), readTrainerV30(), readTrainerV31(), readTrainerV32(),
    readTrainerPublication("v32", undefined, { directory: "experiments/astra-resume-v1", generatorId: "beta4-astra-resume-v1" }), readTrainerV33(), readTrainerV34(), readTrainerV35(), readTrainerV36(), readTrainerV37(), readTrainerV40(), readTrainerV41(), readTrainerV42()]);
  const baseline = versions[0];
  // D-238 retains the previous publication for comparison, not current acceptance.
  if (baseline.some((entry) => entry.sha256 !== "4845029b5f9225927db6d36f2985170efee1ab698f2aa4fe5a625311c9b85c86")) {
    throw new Error("El Brock conservado no coincide con la referencia auditada.");
  }
  const entries: CurrentEntry[] = versions.flatMap((entries, index) => entries.filter((entry) =>
    !versions.slice(index + 1).some((newer) => newer.some((replacement) => replacement.trainerId === entry.trainerId))));
  if (new Set(entries.map((entry) => entry.trainerId)).size !== entries.length) {
    throw new Error("Entrenador duplicado: una revisión requiere reemplazo editorial explícito.");
  }
  return Promise.all(entries.map(async (entry) => {
    const presented = await currentTrainerPresentation(entry);
    const revision = await applyItemRevision({
      projectRoot: path.resolve(process.cwd(), ".."),
      originalTrainer: projectTrainerItems(presented.presentationTrainer ?? presented.trainer),
      basePublicationDigest: presented.sha256,
    });
    const withItems = revision ? { ...presented, presentationTrainer: revision.updatedTrainer as TrainerV21,
      itemRevisionDigest: revision.revisionDigest } : presented;
    const familyRevision = revision ? await applyFamilyRevision({
      projectRoot: path.resolve(process.cwd(), ".."),
      originalTrainer: revision.updatedTrainer,
      baseItemRevisionDigest: revision.revisionDigest,
    }) : null;
    const withFamilies = familyRevision ? { ...withItems,
      presentationTrainer: familyRevision.updatedTrainer as TrainerV21,
      familyRevisionDigest: familyRevision.revisionDigest } : withItems;
    const windowRevision = await applyWindowRevision({
      projectRoot: path.resolve(process.cwd(), ".."),
      originalTrainer: withFamilies.presentationTrainer ?? withFamilies.trainer,
      basePublicationDigest: withFamilies.sha256,
    });
    const withWindow = windowRevision ? { ...withFamilies,
      presentationTrainer: windowRevision.updatedTrainer as TrainerV21,
      windowRevisionDigest: windowRevision.revisionDigest } : withFamilies;
    const qualityRevision = await applyQualityRevision({
      projectRoot: path.resolve(process.cwd(), ".."),
      originalTrainer: withWindow.presentationTrainer ?? withWindow.trainer,
      basePublicationDigest: withWindow.sha256,
    });
    const withQuality = qualityRevision ? { ...withWindow,
      presentationTrainer: qualityRevision.updatedTrainer as TrainerV21,
      qualityRevisionDigest: qualityRevision.revisionDigest } : withWindow;
    const globalCorrection = await applyGlobalCorrection({
      projectRoot: path.resolve(process.cwd(), ".."),
      originalTrainer: withQuality.presentationTrainer ?? withQuality.trainer,
    });
    const withGlobal = globalCorrection ? { ...withQuality,
      presentationTrainer: globalCorrection.updatedTrainer as TrainerV21,
      globalCorrectionDigest: globalCorrection.revisionDigest } : withQuality;
    const currentCorrection = await applyCurrentGlobalCorrection({projectRoot: path.resolve(process.cwd(), ".."), originalTrainer: withGlobal.presentationTrainer ?? withGlobal.trainer});
    return currentCorrection ? {...withGlobal, presentationTrainer: currentCorrection.updatedTrainer as TrainerV21,
      globalCorrectionDigest: currentCorrection.revisionDigest} : withGlobal;
  }));
}

export function needsTrainerRegeneration(entry: CurrentEntry) {
  return entry.trainer.generatorId === "DEKSA-TRAINER-GENERATOR-V19";
}

export function currentTrainerCard(entry: CurrentEntry, variant: "A" | "B" | "C", playerStarter?: PlayerStarter) {
  entry = { ...entry, trainer: projectTrainerItems(entry.presentationTrainer ?? entry.trainer),
    presentationTrainer: undefined };
  if (entry.trainer.generatorId === "DEKSA-TRAINER-GENERATOR-V40") {
    return trainerV40Card(entry.trainer, variant, playerStarter);
  }
  if (entry.trainer.generatorId === "DEKSA-TRAINER-GENERATOR-V37") {
    return trainerV37Card(entry.trainer, variant, playerStarter);
  }
  if (entry.trainer.generatorId === "DEKSA-TRAINER-GENERATOR-V36") {
    return trainerV36Card(entry.trainer, variant, playerStarter);
  }
  if (entry.trainer.generatorId === "DEKSA-TRAINER-GENERATOR-V35") {
    return trainerV35Card(entry.trainer, variant, playerStarter);
  }
  if (entry.trainer.generatorId === "DEKSA-TRAINER-GENERATOR-V34") {
    return trainerV34Card(entry.trainer, variant, playerStarter);
  }
  if (entry.trainer.generatorId === "DEKSA-TRAINER-GENERATOR-V33") {
    return trainerV33Card(entry.trainer, variant, playerStarter);
  }
  if (entry.trainer.generatorId === "DEKSA-TRAINER-GENERATOR-V32") {
    return trainerV32Card(entry.trainer, variant, playerStarter);
  }
  if (entry.trainer.generatorId === "DEKSA-TRAINER-GENERATOR-V31") {
    return trainerV31Card(entry.trainer, variant, playerStarter);
  }
  if (entry.trainer.generatorId === "DEKSA-TRAINER-GENERATOR-V30") {
    return trainerV30Card(entry.trainer, variant, playerStarter);
  }
  if (entry.trainer.generatorId === "DEKSA-TRAINER-GENERATOR-V29") {
    return trainerV29Card(entry.trainer, variant, playerStarter);
  }
  if (entry.trainer.generatorId === "DEKSA-TRAINER-GENERATOR-V28") {
    return trainerV28Card(entry.trainer, variant, playerStarter);
  }
  if (entry.trainer.generatorId === "DEKSA-TRAINER-GENERATOR-V26") {
    return trainerV26Card(entry.trainer, variant, playerStarter);
  }
  if (entry.trainer.generatorId === "DEKSA-TRAINER-GENERATOR-V25") {
    return trainerV25Card(entry.trainer, variant, playerStarter);
  }
  if (entry.trainer.generatorId === "DEKSA-TRAINER-GENERATOR-V24") {
    return trainerV24Card(entry.trainer, variant, playerStarter);
  }
  if (entry.trainer.generatorId === "DEKSA-TRAINER-GENERATOR-V23") {
    return trainerV23Card(entry.trainer, variant, playerStarter);
  }
  if (entry.trainer.generatorId === "DEKSA-TRAINER-GENERATOR-V22") {
    return trainerV22Card(entry.trainer, variant, playerStarter);
  }
  if (entry.trainer.generatorId === "DEKSA-TRAINER-GENERATOR-V21") {
    return trainerV21Card(entry.presentationTrainer ?? entry.trainer, variant, playerStarter);
  }
  return entry.trainer.generatorId === "DEKSA-TRAINER-GENERATOR-V19"
    ? trainerV19Card(entry.trainer, variant)
    : trainerV20Card(entry.trainer, variant);
}

export function currentLotProgress(entries: readonly CurrentEntry[], lotId: string) {
  if (isLotEditoriallyAccepted(entries, lotId)) {
    return { className: "accepted", label: "Lote aceptado por el usuario" } as const;
  }
  return entries.some(({ trainer }) => trainer.lotId === lotId)
    ? { className: "building", label: "Lote en construcción" } as const
    : { className: "pending", label: "Lote todavía no realizado" } as const;
}
