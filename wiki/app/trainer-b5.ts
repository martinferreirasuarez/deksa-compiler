import { readFile } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import type { GeneratedTrainer, GeneratedTrainerMon, GeneratedMoveAccess } from "./trainer-runs";
import displayMetadata from "../content/beta5-display.generated.json" with { type: "json" };
import remainingPublications from "../content/beta5-remaining-publications.json" with { type: "json" };
import additionalPublications from "../content/beta5-additional-publications.json" with { type: "json" };
import type { PlayerStarter } from "./trainer-v21";
import trainerEvidence from "./generated/trainer-identity-evidence.json" with { type: "json" };

type Variant = "A" | "B" | "C";
type DisplayMetadata = {
  exportSha256: string;
  catalogFingerprint: string;
  trainerIds?: string[];
  reviewed?: boolean;
  moveForwardWindows: Record<string, number | null>;
  itemForwardWindows?: Record<string, number | null>;
  maxWindow?: number;
  contextualMoves?: boolean;
  species: Record<string, string | null>;
  moves: Record<string, Omit<GeneratedMoveAccess, "move">>;
};
type Member = {
  species: string;
  family: string;
  level: number;
  akiRole: string;
  moves: string[];
  nature: string;
  ability: string;
  item: string | null;
  iv: number;
  evs: Omit<NonNullable<GeneratedTrainerMon["effortValues"]>, "total">;
};
type Team = { members?: Member[]; branches?: Record<PlayerStarter, { members: Member[] }> };
type MaterializedTrainer = {
  trainerId: string;
  lotId: string;
  window: number;
  cap: number;
  profile: string;
  anchors: Array<{ family: string; species: string; ace?: boolean }>;
  variants: Record<Variant, Team>;
};
export type Beta5TrainerEntry = {
  runId: string;
  trainerId: string;
  accepted: false;
  reviewed: boolean;
  romPromotion: false;
  trainer: MaterializedTrainer & { generatorId: "deksa-b5"; name: string; trainerClass: string };
};

const variants: Variant[] = ["A", "B", "C"];
const starters: PlayerStarter[] = ["bulbasaur", "charmander", "squirtle"];
const stats = ["hp", "attack", "defense", "spAttack", "spDefense", "speed"] as const;
export const beta5ExportPath = "references/deksa-next/b5-05/w01-campaign/export.json";
const remainingByExport = Object.fromEntries(remainingPublications.map((row) => [
  `references/deksa-next/b5-05/remaining-bosses${row.window === 11 ? "" : "-v2"}/w${String(row.window).padStart(2, "0")}/export.json`, row,
]));
type AdditionalPublication = {
  exportPath: string;
  policyId: string;
  window: number;
  trainers: { trainerId: string; lotId: string }[];
  importedTrainers?: { trainerId: string; exportPath: string }[];
  resolverPath?: string;
};
export function supportsBeta5NativeReview(league: boolean, publication?: AdditionalPublication) {
  return league || Boolean(publication?.importedTrainers?.length)
    || publication?.resolverPath === "references/deksa-next/b5-05/production/future_entry.py";
}
const additionalByExport = Object.fromEntries((additionalPublications as AdditionalPublication[])
  .map((row) => [row.exportPath, row]));
const groupedByExport = { ...remainingByExport, ...additionalByExport };
const publications: { exportPath: string; trainerId: string; lotId: string; optional: boolean }[] = [
  { exportPath: beta5ExportPath, trainerId: "leader-brock", lotId: "01A", optional: false },
  { exportPath: "references/deksa-next/b5-05/w02-campaign/export.json", trainerId: "leader-misty", lotId: "02D", optional: true },
  { exportPath: "references/deksa-next/b5-05/w03-campaign/export.json", trainerId: "leader-lt-surge", lotId: "03D", optional: true },
  { exportPath: "references/deksa-next/b5-05/w04-campaign/export.json", trainerId: "leader-erika", lotId: "04G", optional: true },
  { exportPath: "references/deksa-next/b5-05/w05-campaign/export.json", trainerId: "leader-koga", lotId: "05F", optional: true },
  { exportPath: "references/deksa-next/b5-05/w06-campaign/export.json", trainerId: "leader-sabrina", lotId: "05J", optional: true },
  { exportPath: "references/deksa-next/b5-05/w07-campaign/export.json", trainerId: "leader-blaine", lotId: "06E", optional: true },
  { exportPath: "references/deksa-next/b5-05/w08-campaign/export.json", trainerId: "leader-giovanni-viridian", lotId: "07D", optional: true },
  { exportPath: "references/deksa-next/b5-05/w09-league-first/export.json", trainerId: "champion-rival-first-deksa", lotId: "08C", optional: true },
  { exportPath: "references/deksa-next/b5-05/w12-league-rematch/export.json", trainerId: "champion-rival-rematch-deksa", lotId: "09I", optional: true },
  ...Object.entries(remainingByExport).map(([exportPath, row]) => ({ exportPath, ...row.trainers[0], optional: true })),
  ...Object.values(additionalByExport).map((row) => ({ exportPath: row.exportPath, ...row.trainers[0], optional: true })),
];
const leagueCreationIds = ["champion-rival-rematch-deksa", "elite-four-lance-rematch-deksa",
  "elite-four-agatha-rematch-deksa", "elite-four-bruno-rematch-deksa", "elite-four-lorelei-rematch-deksa"];
const leagueIdsByLot: Partial<Record<string, string[]>> = {
  "09I": leagueCreationIds,
  "08C": ["champion-rival-first-deksa", "elite-four-lance-first", "elite-four-agatha-first",
    "elite-four-bruno-first", "elite-four-lorelei-first"],
};
const fullPolicies: Partial<Record<typeof publications[number]["trainerId"], string>> = {
  "leader-erika": "deksa-b5-campaign-w04-erika-approved",
  "leader-koga": "deksa-b5-campaign-w05-leader-koga-approved",
  "leader-sabrina": "deksa-b5-campaign-w06-leader-sabrina-approved",
  "leader-blaine": "deksa-b5-campaign-w07-leader-blaine-approved",
  "leader-giovanni-viridian": "deksa-b5-campaign-w08-leader-giovanni-viridian-approved",
  "champion-rival-rematch-deksa": "deksa-b5-campaign-w12-league-rematch-approved",
  "champion-rival-first-deksa": "deksa-b5-campaign-w09-league-first-approved",
};
// Legacy Brock metadata remains usable until the explicitly requested regeneration.
const metadataDocument = displayMetadata as unknown as DisplayMetadata & { exports?: Record<string, DisplayMetadata> };
const metadataByExport = metadataDocument.exports ?? { [beta5ExportPath]: metadataDocument };

function trainerMetadata(trainerId: string) {
  const publication = publications.find((row) => row.trainerId === trainerId
    || leagueIdsByLot[row.lotId]?.includes(trainerId)
    || groupedByExport[row.exportPath]?.trainers.some((trainer) => trainer.trainerId === trainerId));
  invariant(publication, `entrenador no autorizado: ${trainerId}.`);
  const metadata = metadataByExport[publication.exportPath];
  invariant(metadata, `metadatos ausentes para ${trainerId}.`);
  return metadata;
}

function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Export Beta 5 inválido: ${message}`);
}

function identity(trainerId: string) {
  const result = trainerEvidence.trainers.find((row) => row.logicalId === trainerId);
  invariant(result, `identidad factual ausente para ${trainerId}.`);
  return result;
}

// Engine constants are translated for display only; no authoring policy is applied.
function display(value: string) {
  return value.replace(/^(SPECIES|MOVE|NATURE|ABILITY|ITEM)_/, "").toLowerCase()
    .split("_").map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");
}

export function isBeta5ParametricTrainer(entry: Beta5TrainerEntry) {
  return Object.values(entry.trainer.variants).some((team) => team.branches !== undefined);
}

export function isBeta5Entry(entry: unknown): entry is Beta5TrainerEntry {
  return Boolean(entry && typeof entry === "object" && "trainer" in entry
    && entry.trainer && typeof entry.trainer === "object" && "generatorId" in entry.trainer
    && entry.trainer.generatorId === "deksa-b5");
}

export async function selectBeta5PublicationTeams(
  source: { materializedTeams: MaterializedTrainer[]; importedTrainerIds?: string[]; newTrainerIds?: string[]; repairableTrainerIds?: string[] },
  publication: AdditionalPublication,
  loadText: (filename: string) => Promise<string>,
) {
  const all = source.materializedTeams;
  invariant(new Set(all.map(t => t.trainerId)).size === all.length, "entrenadores duplicados.");
  const imports = publication.importedTrainers;
  if (!imports?.length) return all;
  const sameIds = (actual: unknown, expected: string[]) => Array.isArray(actual)
    && actual.every(id => typeof id === "string")
    && actual.length === expected.length && new Set(actual).size === actual.length
    && expected.every(id => actual.includes(id));
  const targetIds = publication.trainers.map(t => t.trainerId);
  const excludedIds = imports.map(t => t.trainerId);
  const repairable = source.repairableTrainerIds === undefined ? [] : source.repairableTrainerIds;
  invariant(sameIds(targetIds, targetIds) && sameIds(excludedIds, excludedIds)
    && !excludedIds.some(id => targetIds.includes(id))
    && Array.isArray(repairable) && sameIds(repairable, repairable)
    && repairable.every(id => targetIds.includes(id)), "censo reparable de ventana inválido.");
  // Historical imports include repairable targets; only published bosses are excluded.
  invariant(sameIds(source.importedTrainerIds, [...excludedIds, ...repairable])
    && sameIds(source.newTrainerIds, targetIds)
    && sameIds(all.map(t => t.trainerId), [...imports, ...publication.trainers].map(t => t.trainerId)),
  "censo importado/nuevo de ventana incompleto.");
  for (const target of imports) {
    const original = JSON.parse(await loadText(path.resolve(process.cwd(), "..", target.exportPath)));
    const matches = original.materializedTeams.filter((t: MaterializedTrainer) => t.trainerId === target.trainerId);
    invariant(matches.length === 1 && isDeepStrictEqual(matches[0], all.find(t => t.trainerId === target.trainerId)),
      "entrenador importado difiere de su publicación original.");
  }
  return all.filter(t => !imports.some(i => i.trainerId === t.trainerId));
}

export async function readBeta5TrainerView(
  loadText: (filename: string) => Promise<string> = (filename) => readFile(filename, "utf8"),
  presentation: Record<string, DisplayMetadata> = metadataByExport,
) {
  const entries: Beta5TrainerEntry[] = [];
  for (const publication of publications) {
  const metadata = presentation[publication.exportPath];
  if (!metadata && publication.optional) continue;
  invariant(metadata, `metadatos ausentes para ${publication.trainerId}.`);
  invariant(!metadata.trainerIds || metadata.trainerIds.includes(publication.trainerId), "entrenador no incluido en metadatos.");
  let raw: string;
  try {
    raw = await loadText(path.resolve(process.cwd(), "..", publication.exportPath));
  } catch (error) {
    if (publication.optional && (error as NodeJS.ErrnoException).code === "ENOENT") continue;
    throw error;
  }
  invariant(createHash("sha256").update(raw).digest("hex") === metadata.exportSha256,
    "regenerar metadatos de presentación para este export antes de publicarlo.");
  const source = JSON.parse(raw);
  invariant(source.catalogFingerprint === metadata.catalogFingerprint,
    "el export y la presentación deben usar el mismo catálogo por campaña.");
  invariant(source.schemaVersion === 1 && source.generator === "deksa-b5", "formato desconocido.");
  const remaining = groupedByExport[publication.exportPath];
  const imports = additionalByExport[publication.exportPath]?.importedTrainers;
  const fullPolicy = additionalByExport[publication.exportPath]?.policyId ?? (remaining
    ? `deksa-b5-campaign-remaining-${remaining.window === 11 ? "" : "v2-"}w${String(remaining.window).padStart(2, "0")}-approved`
    : fullPolicies[publication.trainerId]);
  const leagueIds = leagueIdsByLot[publication.lotId];
  const league = leagueIds !== undefined;
  if (fullPolicy) {
    invariant(source.policyId === fullPolicy, `contrato productivo de ${publication.trainerId} ausente.`);
    if (!league && !remaining) invariant(source.materializedTeams?.length === 1, "la publicación debe contener sólo su encuentro autorizado.");
  }
  invariant(source.testOnly === Boolean(fullPolicy) && source.accepted === false
    && (source.reviewed === false || (supportsBeta5NativeReview(league, additionalByExport[publication.exportPath])
      && source.reviewed === true && metadata.reviewed === true))
    && source.romPromotion === false, "estado distinto del piloto provisional autorizado.");
  invariant(Array.isArray(source.materializedTeams), "equipos materializados ausentes.");
  const allTrainers = source.materializedTeams as MaterializedTrainer[];
  invariant(new Set(allTrainers.map((trainer) => trainer.trainerId)).size === allTrainers.length, "entrenadores duplicados.");
  const trainers = imports?.length
    ? await selectBeta5PublicationTeams(source, additionalByExport[publication.exportPath], loadText) : allTrainers;
  if (remaining) {
    const expected = remaining.trainers.slice(0, trainers.length);
    invariant(trainers.length > 0 && trainers.length <= remaining.trainers.length
      && trainers.every((trainer) => expected.some((target) => target.trainerId === trainer.trainerId
        && target.lotId === trainer.lotId) && trainer.window === remaining.window), "prefijo de jefes restantes no autorizado.");
    invariant(metadata.trainerIds?.length === trainers.length
      && new Set(metadata.trainerIds).size === trainers.length
      && trainers.every((trainer) => metadata.trainerIds?.includes(trainer.trainerId)), "metadatos de jefes restantes incompletos.");
  }
  if (league) {
    const expected = leagueIds.slice(0, trainers.length);
    invariant(trainers.length > 0 && trainers.length <= leagueIds.length
      && trainers.every((trainer) => expected.includes(trainer.trainerId)), "prefijo de creación de Liga no autorizado.");
    invariant(metadata.trainerIds?.length === trainers.length
      && trainers.every((trainer) => metadata.trainerIds?.includes(trainer.trainerId)), "metadatos de Liga incompletos.");
  }
  const selected = remaining ? trainers : league
    ? [...trainers].sort((a, b) => leagueIds.indexOf(b.trainerId) - leagueIds.indexOf(a.trainerId))
    : trainers.filter((trainer) => trainer.trainerId === publication.trainerId);
  if (!league && !remaining) invariant(selected.length === 1, `falta ${publication.trainerId}.`);
  entries.push(...selected.map((trainer): Beta5TrainerEntry => {
    if (!remaining) invariant(trainer.lotId === publication.lotId, `lote inesperado para ${trainer.trainerId}.`);
    const factual = identity(trainer.trainerId);
    for (const variant of variants) {
      const team = trainer.variants?.[variant];
      invariant(team, `${trainer.trainerId}: falta paquete ${variant}.`);
      if (remaining) invariant(trainer.trainerId.startsWith("rival-") === Boolean(team.branches)
        && (!team.branches || (Object.keys(team.branches).length === 3
          && starters.every((starter) => team.branches?.[starter]))), "ramas de inicial incoherentes para el encuentro.");
      const physical = team.branches ? starters.map((starter) => team.branches?.[starter]?.members) : [team.members];
      for (const members of physical) {
        invariant(Array.isArray(members) && members.length > 0, "rama materializada vacía.");
        invariant(members.every((member) => Number.isInteger(member.iv) && member.iv === members[0].iv),
          "la tarjeta requiere IV uniforme por equipo.");
        for (const member of members) {
          invariant(typeof member.species === "string" && typeof member.family === "string"
            && typeof member.ability === "string" && typeof member.nature === "string"
            && Array.isArray(member.moves) && member.moves.every((move) => typeof move === "string")
            && stats.every((stat) => Number.isInteger(member.evs?.[stat])), "miembro materializado incompleto.");
        }
      }
    }
    return { runId: `b5-${trainer.trainerId}`, trainerId: trainer.trainerId, accepted: false, reviewed: source.reviewed, romPromotion: false,
      trainer: { ...trainer, generatorId: "deksa-b5", name: factual.displayName, trainerClass: factual.wikiTrainerClass } };
  }));
  }
  return { entries, notice: "Beta 5 · Equipos provisionales; la revisión no equivale a aceptación ni promoción a ROM." };
}

export function beta5TrainerCard(entry: Beta5TrainerEntry, variant: Variant, starter?: PlayerStarter): GeneratedTrainer {
  const trainer = entry.trainer;
  const metadata = trainerMetadata(trainer.trainerId);
  const factual = identity(trainer.trainerId);
  const team = trainer.variants[variant];
  invariant(!team.branches || starter, "el rival requiere elegir el inicial del jugador.");
  const members = team.branches ? team.branches[starter!]?.members : team.members;
  invariant(members?.length, "equipo solicitado ausente.");
  const ace = trainer.anchors.find((anchor) => anchor.ace);
  const aceMember = ace?.species === "$starter" ? members.at(-1) : members.find((member) => member.species === ace?.species);
  const forward = metadata.moveForwardWindows[trainer.profile];
  invariant(forward === null || Number.isInteger(forward), "perfil sin ventana de movimientos.");
  const maxWindow = metadata.maxWindow ?? 9;
  const threshold = forward === null ? maxWindow : Math.min(maxWindow, trainer.window + forward);
  const itemForward = metadata.itemForwardWindows?.[trainer.profile];
  if (metadata.contextualMoves) invariant(itemForward === null || Number.isInteger(itemForward), "perfil sin ventana de objetos.");
  const itemThreshold = itemForward === null ? maxWindow : Math.min(maxWindow, trainer.window + (itemForward ?? 0));
  return {
    id: trainer.trainerId, logicalTrainerId: trainer.trainerId, packageVariant: variant,
    name: trainer.name, trainerClass: trainer.trainerClass, profile: trainer.profile,
    battleRole: factual.battleRole, iv: members[0].iv, natureBudget: members.length,
    ai: [], sprite: factual.engineRecords[0]?.trainerPic ?? "",
    teams: [{ variantId: "base", requiredAceFamily: aceMember?.family ?? null,
      requiredAnchorFamilies: members.filter((member) => member.akiRole === "A").map((member) => member.family),
      mons: members.map((member) => ({
        species: display(member.species), slug: member.species.replace(/^SPECIES_/, "").toLowerCase(),
        family: member.family, akiRole: member.akiRole, level: member.level, ability: display(member.ability), abilityRationale: null,
        availabilityWindow: metadata.species[member.species],
        item: !member.item || member.item === "ITEM_NONE" ? "—" : display(member.item),
        moves: member.moves.map(display), nature: display(member.nature), natureCurated: false, natureQuality: "uncurated",
        moveAccess: member.moves.map((move) => {
          const key = `${member.species}:${member.level}:${move}:${threshold}`
            + (metadata.contextualMoves ? `:${itemThreshold}:${member.iv}:${member.nature}:${member.moves.join(",")}` : "");
          const access = metadata.moves[key];
          invariant(access, `fuente ausente para ${member.species}/${move}.`);
          return { ...access, move: display(move) };
        }),
        effortValues: { ...member.evs, total: stats.reduce((total, stat) => total + member.evs[stat], 0) },
      })),
    }],
  };
}
