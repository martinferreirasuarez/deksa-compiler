import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { trainerV20Card, type TrainerV20, type TrainerV20Entry, type TrainerV20Variant } from "./trainer-v20";
import assignments from "../trainer-authoring/profile-assignments/beta4-v1/assignment.generated.json" with { type: "json" };

export const playerStarters = ["bulbasaur", "charmander", "squirtle"] as const;
export type PlayerStarter = typeof playerStarters[number];
export const starterNames = { bulbasaur: "Bulbasaur", charmander: "Charmander", squirtle: "Squirtle" };
const rivalStarter: Record<PlayerStarter, PlayerStarter> = { bulbasaur: "charmander", charmander: "squirtle", squirtle: "bulbasaur" };
type Member = TrainerV20["variants"]["A"]["members"][number];
type StarterSlot = { family: "$starter"; slot: number; level: number; akiRole: string; starterSets: Record<PlayerStarter, Member> };
export type TrainerV21 = Omit<TrainerV20, "generatorId" | "variants"> & {
  generatorId: "DEKSA-TRAINER-GENERATOR-V21";
  variants: Record<TrainerV20Variant, {
    strategy: string;
    orderRationale: string;
    identityQuotaException?: { families: string[]; reason: string; alternatives: string };
    members: Array<Member | StarterSlot>;
    parametricTemplate?: boolean;
    branches?: Record<PlayerStarter, {
      playerStarterFamily: PlayerStarter;
      rivalStarterFamily: PlayerStarter;
      members: Member[];
      diagnostics: unknown;
    }>;
  }>;
};
export type TrainerV21Entry = Omit<TrainerV20Entry, "trainer"> & { trainer: TrainerV21 };
type PublicationVersion = "v21" | "v22" | "v23" | "v24" | "v25" | "v26" | "v28" | "v29" | "v30" | "v31" | "v32" | "v33" | "v34" | "v35" | "v36" | "v37" | "v40";
const publicationPolicies = {
  v21: "DEKSA-BETA4-TRAINER-POLICY-15",
  v22: "DEKSA-BETA4-TRAINER-POLICY-16",
  v23: "DEKSA-BETA4-TRAINER-POLICY-16",
  v24: "DEKSA-BETA4-TRAINER-POLICY-17",
  v25: "DEKSA-BETA4-TRAINER-POLICY-18",
  v26: "DEKSA-BETA4-TRAINER-POLICY-19",
  v28: "DEKSA-BETA4-TRAINER-POLICY-20",
  v29: "DEKSA-BETA4-TRAINER-POLICY-20",
  v30: "DEKSA-BETA4-TRAINER-POLICY-21",
  v31: "DEKSA-BETA4-TRAINER-POLICY-22",
  v32: "DEKSA-BETA4-TRAINER-POLICY-23",
  v33: "DEKSA-BETA4-TRAINER-POLICY-24",
  v34: "DEKSA-BETA4-TRAINER-POLICY-24",
  v35: "DEKSA-BETA4-TRAINER-POLICY-24",
  v36: "DEKSA-BETA4-TRAINER-POLICY-24",
  v37: "DEKSA-BETA4-TRAINER-POLICY-24",
  v40: "DEKSA-BETA4-TRAINER-POLICY-24",
} as const;
export type TrainerPublication<V extends PublicationVersion> = Omit<TrainerV21, "generatorId" | "policyId"> & {
  generatorId: `DEKSA-TRAINER-GENERATOR-${Uppercase<V>}`;
  policyId: typeof publicationPolicies[V];
};
export type TrainerPublicationEntry<V extends PublicationVersion> = Omit<TrainerV20Entry, "trainer"> & { trainer: TrainerPublication<V> };
const trainerAssignments = new Map(assignments.records.map((row) => [row.id, row]));
export function isParametricTrainer(trainer: Pick<TrainerV21, "trainerId" | "variants">) {
  return Boolean(trainerAssignments.get(trainer.trainerId)?.physicalBaseRecords.some((record) => record.startsWith("TRAINER_RIVAL_")))
    || Object.values(trainer.variants ?? {}).some((team) => team.parametricTemplate === true || team.branches !== undefined || team.members?.some((member) => member.family === "$starter"));
}
const evStats = ["hp", "attack", "defense", "spAttack", "spDefense", "speed"] as const;
function canonical(value: unknown) {
  return JSON.stringify(value, (_key, item) => item && typeof item === "object" && !Array.isArray(item)
    ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) : item);
}
function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Publicación v21 inválida: ${message}`);
}
function validateMember(member: Member, slot: number, minimalProse = false) {
  invariant(member && member.slot === slot && member.family !== "$starter", "miembro físico o slot inválido.");
  invariant(typeof member.species === "string" && typeof member.speciesName === "string" && typeof member.family === "string", "identidad de especie ausente.");
  invariant(member.availabilityWindow?.id && Number.isInteger(member.level) && member.level > 0, "nivel o ventana ausente.");
  invariant(member.nature?.name && typeof member.ability === "string" && Array.isArray(member.moves) && member.moves.length > 0 && member.moves.length <= 4 && member.moves.every((move) => typeof move.id === "string" && Array.isArray(move.accesses)), "set físico incompleto.");
  invariant((Array.isArray(member.intent) || minimalProse && member.intent === undefined) && member.effortValues, "intención o EV ausentes.");
  const values = evStats.map((stat) => member.effortValues[stat]);
  invariant(values.every((value) => Number.isInteger(value) && value >= 0 && value <= 252), "EV fuera de rango.");
  invariant(values.reduce((sum, value) => sum + value, 0) === member.effortValues.total && member.effortValues.total <= 510, "total EV inconsistente.");
}
export async function readTrainerV21(
  loadText: (filename: string) => Promise<string> = (filename) => readFile(filename, "utf8"),
): Promise<TrainerV21Entry[]> {
  return readTrainerPublication("v21", loadText);
}

export async function readTrainerPublication<V extends PublicationVersion>(
  version: V,
  loadText: (filename: string) => Promise<string> = (filename) => readFile(filename, "utf8"),
  source: { directory: string; generatorId: string } = { directory: version, generatorId: `beta4-${version}` },
): Promise<TrainerPublicationEntry<V>[]> {
  const invariant: (condition: unknown, message: string) => asserts condition = (condition, message) => {
    if (!condition) throw new Error(`Publicación ${version} inválida: ${message}`);
  };
  let raw: string;
  try { raw = await loadText(path.join(process.cwd(), `trainer-authoring/${source.directory}/published/index.json`)); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return []; throw error; }
  const index = JSON.parse(raw);
  invariant(index?.schemaVersion === 1 && index.generatorId === source.generatorId, "schemaVersion o generatorId desconocido.");
  invariant(index.label === "EN REVISIÓN · NO ACEPTADO" && Array.isArray(index.entries), "etiqueta o entries incorrectos.");
  const seen = new Set<string>();
  for (const entry of index.entries as TrainerPublicationEntry<V>[]) {
    invariant(entry?.status === "TRAINER_REVIEW" && entry.label === index.label, "estado no publicable.");
    invariant(typeof entry.runId === "string" && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,95}$/u.test(entry.runId), "runId inseguro.");
    invariant(entry.artifactPath === `wiki/trainer-authoring/${source.directory}/published/${entry.runId}.json`, `artifactPath fuera de ${version}.`);
    invariant(typeof entry.sha256 === "string" && /^[a-f0-9]{64}$/u.test(entry.sha256), "digest inválido.");
    const trainer = entry.trainer;
    invariant(trainer?.trainerId === entry.trainerId && trainer.generatorId === `DEKSA-TRAINER-GENERATOR-${version.toUpperCase()}` && trainer.policyId === publicationPolicies[version], "identidad, generador o política incorrectos.");
    const assignment = trainerAssignments.get(entry.trainerId);
    invariant(assignment && assignment.lotId === trainer.lotId, "ID/lote no corresponde al catálogo factual.");
    invariant(typeof trainer.profile === "string" && assignment.profile.toLocaleLowerCase("es") === trainer.profile.toLocaleLowerCase("es"), "perfil distinto al catálogo efectivo.");
    invariant(!seen.has(entry.trainerId), "entrenador duplicado.");
    seen.add(entry.trainerId);
    for (const variant of ["A", "B", "C"] as const) {
      const team = trainer.variants?.[variant];
      invariant(team && Array.isArray(team.members) && team.members.length === 6, `tripleta ${variant} incompleta.`);
      if (!isParametricTrainer(trainer)) {
        team.members.forEach((member, i) => validateMember(member as Member, i + 1, version === "v34" || version === "v35" || version === "v36" || version === "v37" || version === "v40"));
        continue;
      }
      invariant(team.parametricTemplate === true, "rival sin plantilla paramétrica.");
      team.members.slice(0, 5).forEach((member, i) => validateMember(member as Member, i + 1, version === "v34" || version === "v35" || version === "v36" || version === "v37" || version === "v40"));
      const starter = team.members[5] as StarterSlot;
      invariant(starter?.family === "$starter" && starter.slot === 6 && starter.starterSets, "slotfamily inicial ausente.");
      invariant(team.branches && Object.keys(team.branches).length === 3, "faltan las tres ramas de inicial del jugador.");
      invariant(Object.keys(starter.starterSets).length === 3, "sets de inicial incompletos.");
      for (const player of playerStarters) {
        const branch = team.branches[player];
        invariant(branch?.playerStarterFamily === player && branch.rivalStarterFamily === rivalStarter[player], "mapping jugador/rival incorrecto.");
        invariant(Array.isArray(branch.members) && branch.members.length === 6 && branch.diagnostics && typeof branch.diagnostics === "object", "rama física incompleta.");
        branch.members.forEach((member, i) => validateMember(member, i + 1, version === "v34" || version === "v35" || version === "v36" || version === "v37" || version === "v40"));
        invariant(canonical(branch.members.slice(0, 5)) === canonical(team.members.slice(0, 5)), "los cinco comunes difieren entre ramas.");
        const selected = starter.starterSets[rivalStarter[player]];
        invariant(selected && selected.family === rivalStarter[player] && selected.slot === starter.slot && selected.level === starter.level && selected.akiRole === starter.akiRole, "set de inicial incompatible con slotfamily.");
        invariant(canonical(branch.members[5]) === canonical(selected), "inicial físico distinto al set declarado.");
      }
    }
    const sealed = JSON.parse(await loadText(path.join(process.cwd(), `trainer-authoring/${source.directory}/published/${entry.runId}.json`)));
    invariant(sealed?.payload && typeof sealed.digest === "string", "artefacto sellado incompleto.");
    invariant(sealed.digest === createHash("sha256").update(canonical(sealed.payload)).digest("hex"), "digest del artefacto no corresponde al payload.");
    invariant(sealed.digest === entry.sha256, "digest del índice no corresponde al artefacto.");
    const payload = sealed.payload;
    invariant(payload.schemaVersion === 1 && payload.generatorId === source.generatorId, "payload de otra versión.");
    invariant(payload.runId === entry.runId && payload.trainerId === entry.trainerId && payload.status === entry.status && payload.label === entry.label, "identidad o estado del payload incorrectos.");
    invariant(payload.accepted === false && payload.romPromotion === false, "payload aceptado o promovido.");
    invariant(canonical(payload.trainer) === canonical(trainer), "trainer del índice no corresponde al artefacto.");
  }
  return index.entries;
}

export function trainerV21Card(trainer: Omit<TrainerV21, "generatorId" | "policyId">, variant: TrainerV20Variant, playerStarter?: PlayerStarter) {
  const team = trainer.variants[variant];
  let members: Member[];
  if (isParametricTrainer(trainer)) {
    invariant(playerStarter, "el rival requiere elegir el inicial del jugador.");
    const branch = team?.branches?.[playerStarter];
    invariant(branch, "rama solicitada ausente; elegí el inicial del jugador.");
    members = branch.members;
  } else {
    members = team.members as Member[];
  }
  const physicalTeam = { strategy: team.strategy, orderRationale: team.orderRationale, members };
  return trainerV20Card({ ...trainer, generatorId: "DEKSA-TRAINER-GENERATOR-V20", policyId: "DEKSA-BETA4-TRAINER-POLICY-15", variants: { A: physicalTeam, B: physicalTeam, C: physicalTeam } }, variant);
}
