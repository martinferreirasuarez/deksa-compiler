import trainerReviewIndexJson from "../content/trainer-reviews/index.json";
import resourcePolicyJson from "../trainer-authoring/catalogs/resource-policy-v1.json";
import canonicalAvailabilityJson from "../trainer-authoring/v7/catalog/canonical-availability.generated.json";
import lot01AStateJson from "../trainer-authoring/v7/lot-state/01A.json";
import lot02AStateJson from "../trainer-authoring/v7/lot-state/02A.json";
import lot02BStateJson from "../trainer-authoring/v7/lot-state/02B.json";
import lot02CStateJson from "../trainer-authoring/v7/lot-state/02C.json";
import lot02DStateJson from "../trainer-authoring/v7/lot-state/02D.json";
import trainerWindowsJson from "../trainer-authoring/v7/plan/windows.generated.json";
import batchLegalityJson from "./generated/batch-legality.json";
import tacticalOrderProjectionJson from "../content/trainer-order-overlays.generated.json";
import { selectActiveTrainerRuns } from "./trainer-publication";
import { workbench } from "./workbench";

export type GeneratedMoveAccess = {
  move: string;
  method: "natural" | "retained" | "tm" | "hm" | "tutor";
  sourceBatch?: string;
  sourceRef?: string;
  sourceWindow?: string;
  learnedAt?: number;
};

export type GeneratedTrainerMon = {
  species: string;
  slug: string;
  family: string;
  level: number;
  ability: string;
  abilityRationale: string | null;
  item: string;
  moves: string[];
  moveAccess?: GeneratedMoveAccess[];
  nature: string;
  natureCurated: boolean;
  natureQuality: "optimal" | "adequate" | "uncurated";
  availabilityWindow?: string | null;
  effortValues?: {
    hp: number;
    attack: number;
    defense: number;
    spAttack: number;
    spDefense: number;
    speed: number;
    total: number;
  };
};

export type GeneratedTrainerTeam = {
  variantId: string;
  requiredAceFamily: string | null;
  requiredAnchorFamilies: string[];
  mons: GeneratedTrainerMon[];
  tacticalOrderCorrection?: "CORREGIDO";
};

export type GeneratedTrainer = {
  id: string;
  logicalTrainerId: string;
  packageVariant: "A" | "B" | "C";
  name: string;
  trainerClass: string;
  profile: string;
  battleRole: string;
  iv: number;
  natureBudget: number;
  ai: string[];
  sprite: string;
  teams: GeneratedTrainerTeam[];
};

export type TrainerProjection = {
  authoringVersion: number;
  contractVersion: string;
  batchId: string;
  windowId: string;
  logicalTrainers: number;
  physicalParties: number;
  pokemon: number;
  moves: number;
  trainers: GeneratedTrainer[];
};

type TrainerRun = {
  id: string;
  status: "review" | "accepted";
  modelEffort: "high";
  projection: TrainerProjection;
  trainerOrder: string[];
};

type TrainerReviewIndex = {
  schemaVersion: 1;
  runs: TrainerRun[];
};

type TacticalOrderProjection = {
  schemaVersion: 1;
  generatorId: "deksa-tactical-order-overlays-v1";
  status: "PROJECTED";
  corrections: Array<{
    logicalTrainerId: string;
    lotId: string;
    label: "CORREGIDO";
    packageVariants: Record<"A" | "B" | "C", Array<{
      teamVariantId: string;
      memberSpeciesOrder: string[];
    }>>;
  }>;
};

type SpeciesLegality = {
  naturalMoveLevels: Record<string, number>;
  retainedMoveLevels?: Record<string, number>;
  machineTutorMoves: string[];
};

type MoveSource = {
  name: string;
  method: "tm" | "hm" | "tutor";
  batch: string;
  sourceRef: string;
};

type CanonicalFamilyAvailability = {
  familyKey: string;
  canonicalAvailability: {
    trainerWindowId: string | null;
  };
};

type TrainerWindow = {
  id: string;
  label: string;
  batches: string[];
};

const legalityBySpecies = (batchLegalityJson as {
  species: Record<string, SpeciesLegality>;
}).species;
const moveSourceByName = new Map(
  (resourcePolicyJson as { moveSources: MoveSource[] }).moveSources.map(
    (source) => [source.name, source],
  ),
);
const trainerWindows = (trainerWindowsJson as { windows: TrainerWindow[] }).windows;
const trainerWindowByBatch = new Map(
  trainerWindows.flatMap((window) =>
    window.batches.map((batch) => [batch, window.id] as const),
  ),
);
const trainerWindowByFamily = new Map(
  (canonicalAvailabilityJson as { families: CanonicalFamilyAvailability[] }).families.map(
    (family) => [family.familyKey, family.canonicalAvailability.trainerWindowId],
  ),
);
const trainerWindowLabelById = new Map(
  trainerWindows.map((window) => [window.id, window.label]),
);
const acceptedTrainerLots = new Set(
  [lot01AStateJson, lot02AStateJson, lot02BStateJson, lot02CStateJson, lot02DStateJson]
    .filter(({ status }) => status === "LOT_ACCEPTED")
    .map(({ lotId }) => lotId),
);

function enrichMoveAccessSource(access: GeneratedMoveAccess): GeneratedMoveAccess {
  if (access.method !== "tm" && access.method !== "hm" && access.method !== "tutor") {
    return access;
  }
  const source = moveSourceByName.get(access.move);
  const sourceBatch = access.sourceBatch ?? source?.batch;
  return {
    ...access,
    sourceBatch,
    sourceRef: access.sourceRef ?? source?.sourceRef,
    sourceWindow: sourceBatch ? trainerWindowByBatch.get(sourceBatch) : undefined,
  };
}

function canonicalMoveAccess(pokemon: GeneratedTrainerMon): GeneratedMoveAccess[] {
  if (pokemon.moveAccess?.length) {
    return pokemon.moveAccess.map(enrichMoveAccessSource);
  }
  const legality = legalityBySpecies[pokemon.slug];
  if (!legality) return [];

  return pokemon.moves.flatMap((move): GeneratedMoveAccess[] => {
    const naturalLevel = legality.naturalMoveLevels[move];
    if (naturalLevel !== undefined && naturalLevel <= pokemon.level) {
      return [{ move, method: "natural", learnedAt: naturalLevel }];
    }
    const retainedLevel = legality.retainedMoveLevels?.[move];
    if (retainedLevel !== undefined && retainedLevel <= pokemon.level) {
      return [{ move, method: "retained", learnedAt: retainedLevel }];
    }
    const source = moveSourceByName.get(move);
    if (!source || !legality.machineTutorMoves.includes(move)) return [];
    return [enrichMoveAccessSource({
      move,
      method: source.method,
      sourceBatch: source.batch,
      sourceRef: source.sourceRef,
    })];
  });
}

function orderCorrectionInvariant(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(`Proyección de orden táctico: ${message}`);
}

function applyTacticalOrderCorrections(run: TrainerRun): TrainerRun {
  const projection = tacticalOrderProjectionJson as TacticalOrderProjection;
  orderCorrectionInvariant(projection.schemaVersion === 1, "schemaVersion desconocido.");
  orderCorrectionInvariant(projection.generatorId === "deksa-tactical-order-overlays-v1", "generatorId desconocido.");
  orderCorrectionInvariant(projection.status === "PROJECTED", "la proyección no está cerrada.");
  const corrections = new Map(
    projection.corrections.map((correction) => [
      `${correction.lotId}\0${correction.logicalTrainerId}`,
      correction,
    ]),
  );
  return {
    ...run,
    projection: {
      ...run.projection,
      trainers: run.projection.trainers.map((trainer) => {
        const correction = corrections.get(`${run.projection.batchId}\0${trainer.logicalTrainerId}`);
        if (!correction) return trainer;
        const orders = correction.packageVariants[trainer.packageVariant];
        orderCorrectionInvariant(Array.isArray(orders), `${trainer.logicalTrainerId}/${trainer.packageVariant} no tiene orden de paquete.`);
        const orderByTeam = new Map(orders.map((order) => [order.teamVariantId, order.memberSpeciesOrder]));
        return {
          ...trainer,
          teams: trainer.teams.map((team) => {
            const desired = orderByTeam.get(team.variantId);
            orderCorrectionInvariant(desired !== undefined, `${trainer.logicalTrainerId}/${trainer.packageVariant}/${team.variantId} no está en el overlay.`);
            const actual = team.mons.map(({ slug }) => slug);
            orderCorrectionInvariant(desired.length === actual.length, `${trainer.logicalTrainerId}/${team.variantId} altera la cantidad de miembros.`);
            orderCorrectionInvariant(
              JSON.stringify([...desired].sort()) === JSON.stringify([...actual].sort()),
              `${trainer.logicalTrainerId}/${team.variantId} altera los miembros materiales.`,
            );
            const bySpecies = new Map(team.mons.map((pokemon) => [pokemon.slug, pokemon]));
            return {
              ...team,
              mons: desired.map((species) => {
                const pokemon = bySpecies.get(species);
                orderCorrectionInvariant(pokemon !== undefined, `${trainer.logicalTrainerId}/${team.variantId} referencia una especie inexistente.`);
                return pokemon;
              }),
              tacticalOrderCorrection: correction.label,
            };
          }),
        };
      }),
    },
  };
}

function enrichTrainerRun(run: TrainerRun): TrainerRun {
  const correctedRun = applyTacticalOrderCorrections(run);
  const lotAccepted = acceptedTrainerLots.has(correctedRun.projection.batchId);
  return {
    ...correctedRun,
    status: lotAccepted ? "accepted" : run.status,
    projection: {
      ...correctedRun.projection,
      trainers: correctedRun.projection.trainers.map((trainer) => ({
        ...trainer,
        teams: trainer.teams.map((team) => ({
          ...team,
          mons: team.mons.map((pokemon) => ({
            ...pokemon,
            moveAccess: canonicalMoveAccess(pokemon),
            availabilityWindow: trainerWindowByFamily.get(pokemon.family) ?? null,
          })),
        })),
      })),
    },
  };
}

const trainerReviewIndex = trainerReviewIndexJson as TrainerReviewIndex;

/** Sólo la publicación seleccionada explícitamente alimenta la vista activa. */
export const trainerRuns: TrainerRun[] = selectActiveTrainerRuns(
  trainerReviewIndex.runs,
  workbench.activeTrainerPublication,
).map(enrichTrainerRun);

export const visibleTrainerRunIds = [...new Set(trainerRuns.map(({ id }) => id))];
export const materializedTrainerLotIds = trainerRuns.map(
  ({ projection }) => projection.batchId,
);

// Compatibilidad para las vistas generales que presentan la primera corrida.
// Las vistas por lote resuelven su materialización específica.
export const trainerRun = trainerRuns[0];

export function trainerLotProgress(batchId: string) {
  const run = trainerRunForLot(batchId);
  return run?.status === "accepted"
    ? { className: "accepted", label: "Lote aceptado" } as const
    : run
      ? { className: "building", label: "Lote en construcción" } as const
      : { className: "pending", label: "Lote todavía no realizado" } as const;
}

export function compactTrainerWindow(windowId: string | null | undefined) {
  if (!windowId) return "—";
  const number = windowId?.match(/^W(\d{2})/u)?.[1];
  return number ? `W${number}` : "ESP";
}

export function trainerWindowLabel(windowId: string | null | undefined) {
  if (!windowId) return "Sin ventana canónica";
  return trainerWindowLabelById.get(windowId) ?? windowId;
}

export function trainerRunForLot(batchId: string) {
  return trainerRuns.find(
    (run) => run.projection.batchId === batchId,
  );
}

export function trainerDisplayRank(trainerId: string, batchId?: string) {
  const run = batchId
    ? trainerRuns.find((entry) => entry.projection.batchId === batchId)
    : trainerRun;
  const rank = run?.trainerOrder.indexOf(trainerId) ?? -1;
  return rank < 0 ? Number.MAX_SAFE_INTEGER : rank;
}

export function generatedTrainersForLot(batchId: string) {
  const run = trainerRunForLot(batchId);
  if (!run) return [];
  return [...run.projection.trainers].sort(
    (left, right) =>
      trainerDisplayRank(left.logicalTrainerId, batchId) -
        trainerDisplayRank(right.logicalTrainerId, batchId) ||
      left.packageVariant.localeCompare(right.packageVariant),
  );
}
