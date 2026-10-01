import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import type { GeneratedTrainer } from "./trainer-runs";

export type TrainerV19Variant = "A" | "B" | "C";
type EffortValues = {
  hp: number;
  attack: number;
  defense: number;
  spAttack: number;
  spDefense: number;
  speed: number;
  total: number;
};
type TrainerV19Member = {
  slot: number;
  species: string;
  speciesName: string;
  family: string;
  availabilityWindow: { id: string; ordinal: number };
  level: number;
  akiRole: string;
  moves: Array<{
    id: string;
    name?: string;
    accesses: Array<{
      method: "natural" | "retained" | "tm" | "hm" | "tutor";
      learnedAt?: number;
      sourceWindow?: number;
      sourceBatch?: string;
      sourceRef?: string;
    }>;
  }>;
  nature: { name: string };
  ability: string;
  item: { name: string } | null;
  intent: string[];
  effortValues: EffortValues;
};
export type TrainerV19 = {
  generatorId: "DEKSA-TRAINER-GENERATOR-V19";
  policyId: "DEKSA-BETA4-TRAINER-POLICY-14";
  trainerId: string;
  name: string;
  trainerClass: string;
  profile: string;
  cap: number;
  lotId: string;
  windowId: string;
  iv: number;
  aiProfile: string[];
  variants: Record<TrainerV19Variant, {
    strategy: string;
    orderRationale: string;
    members: TrainerV19Member[];
  }>;
};
export type TrainerV19Entry = {
  runId: string;
  trainerId: string;
  status: "TRAINER_REVIEW";
  label: "EN REVISIÓN · NO ACEPTADO";
  artifactPath: string;
  sha256: string;
  trainer: TrainerV19;
};

const allowedV19Trainers = new Map([["leader-brock", "01A"]]);
const evStats = ["hp", "attack", "defense", "spAttack", "spDefense", "speed"] as const;
const safeRunId = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,95}$/u;

function canonical(value: unknown) {
  return JSON.stringify(value, (_key, item) => item && typeof item === "object" && !Array.isArray(item)
    ? Object.fromEntries(Object.entries(item).sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0))
    : item);
}

function digest(value: unknown) {
  return createHash("sha256").update(canonical(value)).digest("hex");
}

function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Publicación v19 inválida: ${message}`);
}

function validateMember(member: TrainerV19Member) {
  invariant(member && typeof member === "object", "miembro ausente.");
  invariant(Array.isArray(member.moves) && Array.isArray(member.intent), "miembro incompleto.");
  invariant(member.effortValues && typeof member.effortValues === "object", "EV ausentes.");
  const values = evStats.map((stat) => member.effortValues[stat]);
  invariant(values.every((value) => Number.isInteger(value) && value >= 0 && value <= 252), "EV fuera de rango.");
  invariant(values.reduce((sum, value) => sum + value, 0) === member.effortValues.total, "total EV inconsistente.");
  invariant(member.effortValues.total <= 510, "presupuesto EV excedido.");
}

export async function readTrainerV19(
  loadText: (filename: string) => Promise<string> = (filename) => readFile(filename, "utf8"),
): Promise<TrainerV19Entry[]> {
  let raw: string;
  try {
    raw = await loadText(path.join(process.cwd(), "trainer-authoring/v19/published/index.json"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  const index = JSON.parse(raw);
  invariant(index?.schemaVersion === 1, "schemaVersion desconocido.");
  invariant(index.generatorId === "beta4-v19", "generatorId desconocido.");
  invariant(index.label === "EN REVISIÓN · NO ACEPTADO", "etiqueta incorrecta.");
  invariant(Array.isArray(index.entries), "entries ausente.");
  const seen = new Set<string>();
  for (const entry of index.entries as TrainerV19Entry[]) {
    invariant(entry?.status === "TRAINER_REVIEW" && entry.label === index.label, "estado no publicable.");
    invariant(typeof entry.runId === "string" && safeRunId.test(entry.runId), "runId inseguro.");
    invariant(
      entry.artifactPath === `wiki/trainer-authoring/v19/published/${entry.runId}.json`,
      "artifactPath fuera de v19.",
    );
    invariant(typeof entry.sha256 === "string" && /^[a-f0-9]{64}$/u.test(entry.sha256), "digest inválido.");
    invariant(entry.trainer?.trainerId === entry.trainerId, "identidad inconsistente.");
    invariant(entry.trainer.generatorId === "DEKSA-TRAINER-GENERATOR-V19", "generador de entrenador incorrecto.");
    invariant(entry.trainer.policyId === "DEKSA-BETA4-TRAINER-POLICY-14", "política incorrecta.");
    invariant(allowedV19Trainers.get(entry.trainerId) === entry.trainer.lotId, "entrenador fuera del manifiesto v19.");
    invariant(!seen.has(entry.trainerId), "entrenador duplicado.");
    seen.add(entry.trainerId);
    for (const variant of ["A", "B", "C"] as const) {
      const members = entry.trainer.variants?.[variant]?.members;
      invariant(Array.isArray(members) && members.length === 6, `tripleta ${variant} incompleta.`);
      members.forEach(validateMember);
    }

    const artifactFilename = path.join(
      process.cwd(),
      `trainer-authoring/v19/published/${entry.runId}.json`,
    );
    const sealed = JSON.parse(await loadText(artifactFilename));
    invariant(sealed && typeof sealed === "object" && sealed.payload, "artefacto sellado incompleto.");
    invariant(typeof sealed.digest === "string" && sealed.digest === digest(sealed.payload), "digest del artefacto no corresponde al payload.");
    invariant(sealed.digest === entry.sha256, "digest del índice no corresponde al artefacto.");
    const payload = sealed.payload;
    invariant(payload.schemaVersion === 1 && payload.generatorId === "beta4-v19", "payload de otra versión.");
    invariant(payload.runId === entry.runId && payload.trainerId === entry.trainerId, "IDs del payload inconsistentes.");
    invariant(payload.status === "TRAINER_REVIEW" && payload.label === entry.label, "estado del payload incorrecto.");
    invariant(payload.accepted === false && payload.romPromotion === false, "payload aceptado o promovido.");
    invariant(canonical(payload.trainer) === canonical(entry.trainer), "trainer del índice no corresponde al artefacto.");
  }
  return index.entries;
}

export function trainerV19LotProgress(entries: readonly TrainerV19Entry[], lotId: string) {
  return entries.some(({ trainer }) => trainer.lotId === lotId)
    ? { className: "building", label: "Lote en construcción" } as const
    : { className: "pending", label: "Lote todavía no realizado" } as const;
}

export function trainerV19Card(trainer: TrainerV19, selected: TrainerV19Variant): GeneratedTrainer {
  const team = trainer.variants[selected];
  return {
    id: trainer.trainerId,
    logicalTrainerId: trainer.trainerId,
    packageVariant: selected,
    name: trainer.name,
    trainerClass: trainer.trainerClass,
    profile: trainer.profile,
    battleRole: "leader",
    iv: trainer.iv,
    natureBudget: team.members.length,
    ai: [...trainer.aiProfile],
    sprite: trainer.trainerId.replace(/^leader-/, ""),
    teams: [{
      variantId: "base",
      requiredAceFamily: team.members.at(-1)?.family ?? null,
      requiredAnchorFamilies: team.members.filter(({ akiRole }) => akiRole === "A").map(({ family }) => family),
      mons: team.members.map((member) => ({
        species: member.speciesName,
        slug: member.species,
        family: member.family,
        availabilityWindow: member.availabilityWindow.id,
        level: member.level,
        ability: member.ability,
        abilityRationale: member.intent.join(" "),
        item: member.item?.name ?? "—",
        nature: member.nature.name,
        natureCurated: true,
        natureQuality: "optimal",
        moves: member.moves.map((move) => move.name ?? move.id),
        effortValues: member.effortValues,
        moveAccess: member.moves.flatMap((move) => {
          const source = move.accesses.find(({ method }) => method === "natural" || method === "retained") ?? move.accesses[0];
          return source ? [{
            ...source,
            move: move.name ?? move.id,
            sourceWindow: source.sourceWindow === undefined ? undefined : `W${String(source.sourceWindow).padStart(2, "0")}`,
          }] : [];
        }),
      })),
    }],
  };
}
