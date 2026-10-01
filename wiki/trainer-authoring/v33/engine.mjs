import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { resolveMoveMechanics } from "../v32/move-mechanics.mjs";
import { expandStarterFamilies, isParametricRivalTrainer, parametricRivalTrainerIds, rivalStarterFamilyForPlayer, validateStarterPolicy, validateStarterTripletQuota, starterTripletQuotaFindings } from "../v32/starter-policy.mjs";
import { buildSpecialistRouteEvidence, specialistDistanceFindings } from "../v32/specialist-evidence.mjs";
import { applyFossilAvailabilityOverlay, validateFossilAvailabilityOverlay } from "../v32/fossil-availability.mjs";
import { WINDOW_POLICY, loadWindowSnapshot, windowContext, windowFindings } from './window-recurrence.mjs';
import {retainedOwner} from '../v32/revision-admission.mjs';
import {applyIdentityQuotaException,IDENTITY_QUOTA_POLICY} from './identity-quota.mjs';

export const ENGINE_ID = "DEKSA-TRAINER-GENERATOR-V33";
export const POLICY_ID = "DEKSA-BETA4-TRAINER-POLICY-24";
export const BASELINE_PUBLICATION = null;

const BRANCHES = Object.freeze(["A", "B", "C"]);
const STAT_KEYS = Object.freeze(["hp", "attack", "defense", "spAttack", "spDefense", "speed"]);
const NATURE_STAT_NAMES = Object.freeze({ attack: "Attack", defense: "Defense", spAttack: "Sp. Atk", spDefense: "Sp. Def", speed: "Speed" });
const GYM_ORDER = Object.freeze(["leader-brock", "leader-misty", "leader-lt-surge", "leader-erika",
  "leader-koga", "leader-sabrina", "leader-blaine", "leader-giovanni-viridian"]);
const SOURCE_PATHS = Object.freeze({
  policy: "wiki/trainer-authoring/v33/policy.json",
  profileAssignments: "wiki/trainer-authoring/profile-assignments/beta4-v1/assignment.generated.json",
  bossSignatures: "wiki/trainer-authoring/v32/boss-signatures.json",
  speciesAvailability: "wiki/trainer-authoring/v11/catalog/species-availability.generated.json",
  speciesAudit: "wiki/trainer-authoring/v11/catalog/campaign-prefix-audit.json",
  fossilAvailability: "wiki/trainer-authoring/v32/catalog/fossil-availability.json",
  plan: "wiki/trainer-authoring/v7/plan/windows.generated.json",
  canonicalAvailability: "wiki/trainer-authoring/v7/catalog/canonical-availability.generated.json",
  graphs: "wiki/trainer-authoring/v7/graphs/graphs.generated.json",
  pokedex: "wiki/app/generated/pokedex.json",
  legality: "wiki/app/generated/batch-legality.json",
  battle: "wiki/app/generated/battle-types.json",
  evolutionItems: "wiki/app/generated/evolution-item-sources.json",
  heldItems: "wiki/trainer-authoring/catalogs/held-item-policy-v2.json",
  resources: "wiki/trainer-authoring/catalogs/resource-policy-v1.json",
  identity: "wiki/app/generated/trainer-identity-evidence.json",
  npcSpeciesInfo: "pokefirered/src/data/pokemon/species_info.h",
});

const AUTOMATIC_LEVEL_METHODS = new Set([
  "EVO_LEVEL",
  "EVO_LEVEL_ATK_GT_DEF",
  "EVO_LEVEL_ATK_EQ_DEF",
  "EVO_LEVEL_ATK_LT_DEF",
  "EVO_LEVEL_SILCOON",
  "EVO_LEVEL_CASCOON",
  "EVO_LEVEL_NINJASK",
  "EVO_LEVEL_SHEDINJA",
]);

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  }
  return value;
}

function digest(value) {
  const raw = typeof value === "string" ? value : JSON.stringify(canonical(value));
  return `sha256:${createHash("sha256").update(raw).digest("hex")}`;
}

function invariant(condition, message) {
  if (!condition) throw new Error(`Beta4 engine: ${message}`);
}

function exactKeys(value, expected) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  return actual.length === wanted.length && actual.every((key, index) => key === wanted[index]);
}

function signatureFamiliesForEncounter(character, trainerId) {
  return character?.phases?.find(phase => phase.trainerIds.includes(trainerId))?.families
    ?? character?.families ?? [];
}

function expandedSignatureFamiliesForEncounter(character, trainerId, policy) {
  const families = signatureFamiliesForEncounter(character, trainerId);
  return character?.bossIdentityId === policy.localStarterReservation.allowedTrainerIdentity
    ? expandStarterFamilies(families, policy)
    : [...families];
}

function expandedSignatureCharacter(character, policy) {
  const copy = structuredClone(character);
  if (character.bossIdentityId !== policy.localStarterReservation.allowedTrainerIdentity) return copy;
  const expandRow = row => ({
    ...structuredClone(row),
    symbolicFamilies: [...row.families],
    families: expandStarterFamilies(row.families, policy),
  });
  return {
    ...expandRow(copy),
    phases: copy.phases?.map(expandRow),
    starterExpansion: {
      decisionId: "D-229",
      symbolicFamily: policy.localStarterReservation.rivalTemplates.symbolicFamily,
      expandedFamilies: [...policy.localStarterReservation.reservedNpcFamilyKeys],
      playerToRivalFamily: structuredClone(policy.localStarterReservation.playerToRivalFamily),
    },
  };
}

function parseLevel(parameter) {
  const match = String(parameter).match(/\d+/u);
  return match === null ? null : Number(match[0]);
}

function parseItemId(parameter) {
  return String(parameter).match(/ITEM_[A-Z0-9_]+/u)?.[0] ?? null;
}

export function effortValuesForEncounter(trainerId, species, policy) {
  const exception = policy.effortValues.exceptions.find(row => row.trainerId === trainerId && row.species === species);
  const values = structuredClone(exception?.values ?? policy.effortValues.default);
  invariant(exactKeys(values, STAT_KEYS), `EV inválidos para ${trainerId}/${species}.`);
  invariant(STAT_KEYS.every(stat => Number.isInteger(values[stat]) && values[stat] >= 0
    && values[stat] <= policy.effortValues.maximumPerStat), `EV fuera de rango para ${trainerId}/${species}.`);
  const total = STAT_KEYS.reduce((sum, stat) => sum + values[stat], 0);
  invariant(total <= policy.effortValues.maximumTotal, `EV exceden ${policy.effortValues.maximumTotal} para ${trainerId}/${species}.`);
  return Object.freeze({ ...values, total });
}

export function effectiveStats({ baseStats, level, iv, effortValues, nature }) {
  invariant(Number.isInteger(level) && level >= 1 && level <= 100, "nivel inválido para estadísticas efectivas.");
  invariant(Number.isInteger(iv) && iv >= 0 && iv <= 31, "IV inválido para estadísticas efectivas.");
  invariant(exactKeys(baseStats, [...STAT_KEYS, "total"]), "baseStats inválidas para estadísticas efectivas.");
  invariant(exactKeys(effortValues, [...STAT_KEYS, "total"]), "effortValues inválidos para estadísticas efectivas.");
  invariant(nature !== null && typeof nature === "object" && !Array.isArray(nature), "naturaleza inválida para estadísticas efectivas.");
  const raw = stat => Math.floor(((2 * baseStats[stat] + iv + Math.floor(effortValues[stat] / 4)) * level) / 100) + 5;
  const result = {
    hp: Math.floor(((2 * baseStats.hp + iv + Math.floor(effortValues.hp / 4)) * level) / 100) + level + 10,
  };
  for (const stat of STAT_KEYS.slice(1)) {
    const label = NATURE_STAT_NAMES[stat];
    const multiplier = nature.raises === label ? 1.1 : nature.lowers === label ? 0.9 : 1;
    result[stat] = Math.floor(raw(stat) * multiplier);
  }
  return Object.freeze(result);
}

function normalizedAbilityKey(value) {
  if (typeof value !== "string") return null;
  const key = value.normalize("NFKD").replace(/\p{Diacritic}/gu, "")
    .toLowerCase().replace(/[^\p{Letter}\p{Number}]+/gu, "");
  return key.length === 0 ? null : key;
}

function sourceWindowForLot(plan, lotId) {
  return plan.windows.find(({ batches }) => batches.includes(lotId))?.ordinal ?? null;
}

function clampWindow(ordinal, maximum) {
  return Math.min(maximum, ordinal);
}

async function readSource(projectRoot, relativePath) {
  const absoluteRoot = path.resolve(projectRoot);
  const absolutePath = path.resolve(absoluteRoot, relativePath);
  invariant(
    absolutePath.startsWith(`${absoluteRoot}${path.sep}`),
    `la fuente sale del proyecto: ${relativePath}`,
  );
  invariant(!relativePath.includes("archive/"), `fuente histórica prohibida: ${relativePath}`);
  const raw = await readFile(absolutePath, "utf8");
  if (relativePath === SOURCE_PATHS.npcSpeciesInfo) {
    const value = Object.fromEntries([...raw.matchAll(/\[SPECIES_([A-Z0-9_]+)\]\s*=\s*\{\s*\n([\s\S]*?)\n\s*\},/gu)]
      .flatMap(([, key, body]) => {
        const friendship = body.match(/\.friendship\s*=\s*(\d+)\s*,/u);
        return friendship ? [[key, Number(friendship[1])]] : [];
      }));
    return { value, hash: digest(raw) };
  }
  return { value: JSON.parse(raw), hash: digest(raw) };
}

function assertCatalogShape(values) {
  invariant(digest(values.policy.identityQuotaException)===digest(IDENTITY_QUOTA_POLICY),'contrato D261 inválido.');
  validateStarterTripletQuota(values.policy);
  invariant(values.policy.engineId === ENGINE_ID, "policy.json usa otro engineId.");
  invariant(values.policy.policyId === POLICY_ID, "policy.json usa otro policyId.");
  invariant(JSON.stringify(canonical(values.policy.windowFamilyRecurrence)) === JSON.stringify(canonical(WINDOW_POLICY)), 'política de ventana 15/5 inválida.');
  invariant(JSON.stringify(values.policy.lotFamilyRecurrence) === JSON.stringify({ decisionId: "D-258",
    maximumTrainerOwnersPerFamily: 2, scope: "SAME_LOT_SAME_ABC_BRANCH", countedRoles: ["A", "I", "K"], canonicalAnchorsAlwaysAllowed: true }), "contrato D258 inválido.");
  invariant(values.policy.generation === 3, "sólo se admite Gen III.");
  invariant(values.policy.trainerSelection?.source === "profileAssignments.records"
    && values.policy.trainerSelection?.missingId === "BLOCK"
    && values.policy.trainerSelection?.allowlist === false,
  "v33 debe resolver entrenadores por el registro factual completo, sin allowlist.");
  invariant(JSON.stringify(values.policy.availability?.exactSpeciesOverlays) === JSON.stringify([{
    catalogId: "DEKSA-BETA4-FOSSIL-TRAINER-AVAILABILITY-1",
    decisionId: "D-239",
    scope: "NINE_LISTED_FOSSIL_SPECIES_ONLY",
    doesNotExtendGeneralAuditPastWindow: 4,
  }]), "policy no liga el overlay fósil estrecho D239.");
  invariant(values.policy.generalAuthoring?.actorRequirement?.model === "gpt-6-astra"
    && values.policy.generalAuthoring?.actorRequirement?.effort === "low"
    && JSON.stringify(values.policy.generalAuthoring?.actorRequirement?.roles) === JSON.stringify(["author", "corrector"])
    && values.policy.generalAuthoring?.actorRequirement?.appliesTo === "ALL_AUTHORABLE_TRAINERS",
  "contrato general de actores Astra-low inválido.");
  const effortPolicy = values.policy.effortValues;
  invariant(JSON.stringify(effortPolicy?.decisionIds) === JSON.stringify(["D-233", "D-240"])
    && effortPolicy.submissionField === "FORBIDDEN_AUTOMATIC_MATERIALIZATION_ONLY"
    && JSON.stringify(effortPolicy.statOrder) === JSON.stringify(STAT_KEYS)
    && exactKeys(effortPolicy.default, STAT_KEYS)
    && STAT_KEYS.every(stat => effortPolicy.default[stat] === 0)
    && effortPolicy.maximumPerStat === 255
    && effortPolicy.maximumEffectivePerStat === 252
    && effortPolicy.maximumTotal === 510
    && Array.isArray(effortPolicy.exceptions),
  "contrato D233/D236 de EV inválido.");
  invariant(effortPolicy.exceptions.length === 0, "D240 exige cero EV sin excepciones nominales.");
  invariant(JSON.stringify(values.policy.factualAnchorWindowException) === JSON.stringify({
    decisionId: "D-247", scope: "FACTUAL_FLOOR_AND_AUTOMATIC_LEVEL_DESCENDANTS_ONLY", role: "A",
    preserveRestrictedFamiliesAndNominalMinimumLevels: true,
  }), "contrato D247 de anclas factuales inválido.");
  invariant(values.policy.review?.decisionId === "D-228"
    && values.policy.review?.factualCheck?.required === true
    && values.policy.review?.factualCheck?.type === "NONEMPTY_STRING"
    && values.policy.review?.externalOrganizerFeedback === false,
  "contrato D228 de autocomprobación factual inválido.");
  invariant(JSON.stringify(values.policy.gymDistance?.gymOrder) === JSON.stringify(GYM_ORDER)
    && values.policy.gymDistance?.decisionId === "D-219"
    && values.policy.gymDistance?.maximumKInvolvedOverlap?.[1] === 0
    && values.policy.gymDistance?.maximumKInvolvedOverlap?.[2] === 1, "contrato D219 inválido.");
  const variantFamilyPolicy = values.policy.party?.variantFamilyPolicy;
  invariant(values.policy.party?.minimumFamilyDifferencesBetweenVariants === 3
    && variantFamilyPolicy?.decisionId === "D-227"
    && variantFamilyPolicy?.repeatedFamiliesAcrossVariants === "ANCHORS_ONLY"
    && variantFamilyPolicy?.variableFamiliesAcrossVariants === "DISJOINT"
    && variantFamilyPolicy?.requiredDistinctVariableFamilies
      === BRANCHES.length * (values.policy.party.exactIdentityRoles + values.policy.party.exactCompetitiveRoles)
    && values.policy.gymDistance?.intraGymKReuse === false, "contrato D227 de familias variables inválido.");
  invariant(values.policy.party.encounterOverrides === undefined, "D240 elimina las excepciones de composición.");
  invariant(JSON.stringify(values.policy.party.compositionOverrides) === JSON.stringify(Object.fromEntries(
    ["leader-misty", "leader-lt-surge"].map(id => [id, { decisionId: "D-242", anchorMinimum: 2, anchorMaximum: 2,
      competitiveRoles: 2, identityRolesFormula: "4-A", requiredDistinctVariableFamilies: 12 }]))),
  "D242 exige las dos excepciones explícitas 2A/2I/2K y doce familias variables.");
  const compositions = values.policy.party?.compositionByProfile;
  invariant(["COMÚN", "AVANZADO", "ESPECIALISTA"].every(profile =>
    compositions?.[profile]?.anchorMinimum === 0 && compositions?.[profile]?.anchorMaximum === 2
      && compositions?.[profile]?.competitiveRoles === 2 && compositions?.[profile]?.identityRolesFormula === "4-A")
    && compositions?.JEFE?.anchorMinimum === 3 && compositions?.JEFE?.anchorMaximum === 3
    && compositions?.JEFE?.competitiveRoles === 2 && compositions?.JEFE?.identityRolesFormula === "4-A",
  "contratos A/I/K por perfil incompletos.");
  invariant(JSON.stringify(values.policy.rivalRoute22) === JSON.stringify({
    decisionId: "D-243", trainerId: "rival-route-22", profile: "JEFE", cap: 14, levelTotal: 81,
    minimumLevel: 11, maximumLevel: 14, iv: 31, effortValues: 0,
    anchorFamilies: ["$starter", "pidgey", "rattata"], starterLast: true,
    starterLevel: "SHARED_PER_TEMPLATE", commonMembersExclude: "ALL_REGIONAL_STARTER_FAMILIES",
  }), "D243 contrato Ruta22 divergente.");
  const starterPolicy = validateStarterPolicy(values.policy);
  validateFossilAvailabilityOverlay(values.fossilAvailability, values.pokedex);
  invariant(values.profileAssignments.decisionId === "D-212"
    && Array.isArray(values.profileAssignments.records) && values.profileAssignments.records.length > 0,
  "registro D212 ausente/vacío.");
  invariant(new Set(values.profileAssignments.records.map(row => row.id)).size === values.profileAssignments.records.length,
    "IDs D212 duplicados.");
  invariant(values.profileAssignments.records.length === values.graphs.encounterGraph?.nodes?.length
    && values.profileAssignments.records.length === values.identity.trainers?.length,
  "D212, grafo e identidad factual no cubren el mismo roster.");
  invariant(values.bossSignatures.schemaVersion === 1 && values.bossSignatures.decisionId === "D-242"
    && Array.isArray(values.bossSignatures.entries), "registro de firmas inválido.");
  invariant(new Set(values.bossSignatures.entries.map(row => row.trainerId)).size === values.bossSignatures.entries.length,
    "IDs de firmas duplicados.");
  invariant(values.bossSignatures.characters?.length === 17
    && new Set(values.bossSignatures.characters.map(row => row.bossIdentityId)).size === 17, "firmas globales incompletas/duplicadas.");
  const familyKeys = new Set(values.canonicalAvailability.families.map(f => f.familyKey));
  invariant(starterPolicy.reservedNpcFamilyKeys.every(family => familyKeys.has(family)),
    "D229 referencia una familia local inexistente.");
  invariant(starterPolicy.allRegionalStarterFamilyKeys.every(family => familyKeys.has(family)),
    "D229 referencia una familia starter regional inexistente.");
  for (const familyKey of starterPolicy.reservedNpcFamilyKeys) {
    const family = values.canonicalAvailability.families.find(row => row.familyKey === familyKey);
    invariant(values.pokedex.species.filter(species => species.familyId === family.familyId).length === 3,
      `D229 esperaba tres especies en la familia ${familyKey}.`);
  }
  for (const character of values.bossSignatures.characters) {
    invariant(values.profileAssignments.records.some(row => row.bossIdentityId === character.bossIdentityId), "personaje de firma desconocido.");
    for (const row of [character, ...(character.phases ?? [])]) {
      invariant(Array.isArray(row.families) && row.families.length === (values.policy.party.compositionOverrides?.[character.bossIdentityId]?.anchorMinimum ?? 3)
        && new Set(row.families).size === row.families.length
        && row.families.every(family => familyKeys.has(family) || (family === "$starter" && character.bossIdentityId === "rival")),
      `${character.bossIdentityId}: familias de firma inválidas.`);
      invariant(character.bossIdentityId === starterPolicy.allowedTrainerIdentity
        || row.families.every(family => !starterPolicy.reservedNpcFamilyKeys.includes(family)),
      `D229_RESERVED_STARTER_SIGNATURE: ${character.bossIdentityId} usa una familia local reservada.`);
    }
    const phaseTrainerIds = [];
    for (const phase of character.phases ?? []) {
      invariant(Array.isArray(phase.trainerIds) && phase.trainerIds.length > 0
        && phase.trainerIds.every(id => values.profileAssignments.records.some(record => record.id === id
          && record.bossIdentityId === character.bossIdentityId)), `${character.bossIdentityId}: aparición de firma desconocida.`);
      phaseTrainerIds.push(...phase.trainerIds);
    }
    invariant(new Set(phaseTrainerIds).size === phaseTrainerIds.length, `${character.bossIdentityId}: aparición de firma duplicada.`);
  }
  for (const row of values.bossSignatures.entries) {
    const assigned = values.profileAssignments.records.find(record => record.id === row.trainerId);
    invariant(assigned?.bossIdentityId === row.bossIdentityId && assigned?.profile === "JEFE", `${row.trainerId}: identidad de firma incoherente con D212.`);
    invariant(Array.isArray(row.anchors) && row.anchors.length === (values.policy.party.compositionOverrides?.[row.trainerId]?.anchorMinimum ?? 3)
      && new Set(row.anchors.map(a => a.family)).size === row.anchors.length,
      `${row.trainerId}: cantidad de firmas incompatible con su contrato explícito.`);
    for (const anchor of row.anchors) {
      const family = values.canonicalAvailability.families.find(f => f.familyKey === anchor.family);
      invariant(family !== undefined && ["factual", "editorial"].includes(anchor.origin), `${row.trainerId}: ancla inválida.`);
      invariant(assigned.bossIdentityId === starterPolicy.allowedTrainerIdentity
        || !starterPolicy.reservedNpcFamilyKeys.includes(anchor.family),
      `D229_RESERVED_STARTER_ANCHOR: ${row.trainerId}/${anchor.family}.`);
      invariant(anchor.origin === "editorial" ? anchor.floorSpecies === null
        : values.pokedex.species.some(s => s.slug === anchor.floorSpecies && s.familyId === family.familyId),
      `${row.trainerId}: piso incompatible con origen/familia.`);
      invariant(anchor.exactSpecies === undefined || (typeof anchor.exactSpecies === "string"
        && values.pokedex.species.some(s => s.slug === anchor.exactSpecies && s.familyId === family.familyId)),
      `${row.trainerId}: especie exacta incompatible con la familia.`);
    }
    invariant(Array.isArray(row.neighborTrainerIds) && row.neighborTrainerIds.every(id => id !== row.trainerId
      && values.profileAssignments.records.some(record => record.id === id && record.profile === "JEFE")),
    `${row.trainerId}: vecino desconocido/no Jefe.`);
    invariant(Array.isArray(row.legendarySpecies), `${row.trainerId}: falta legendarios nominales.`);
    invariant(row.legendarySpecies.length === 0, `${row.trainerId}: la entrada ejecutable no declara legendarios nominales.`);
    const global = values.bossSignatures.characters.find(c => c.bossIdentityId === row.bossIdentityId);
    invariant(JSON.stringify([...signatureFamiliesForEncounter(global, row.trainerId)].sort()) === JSON.stringify(row.anchors.map(a => a.family).sort()),
      `${row.trainerId}: firma ejecutable discrepa de firma global.`);
  }
  invariant(values.bossSignatures.entries.some(row => row.trainerId === "leader-brock"
    && JSON.stringify(row.anchors.map(anchor => anchor.family)) === JSON.stringify(["geodude", "omanyte", "onix"])
    && (row.fixedMembers?.length ?? 0) === 0),
  "D240 debe fijar Geodude/Omanyte/Onix sin I fija.");
  invariant(values.policy.availability?.axis === "minimum.trainersCampaign"
    && values.policy.availability?.unit === "species"
    && values.policy.availability?.maximumAuditedWindow === 4, "contrato D210 por especie inválido.");
  invariant(JSON.stringify(Object.values(values.policy.profiles).map(p => p.speciesForwardWindows)) === JSON.stringify([0, 0, 1, 1]), "offsets D210 deben ser W/W/W+1/W+1.");
  invariant(values.speciesAvailability.catalogId === "B4-SPECIES-CAMPAIGN-PILOT-3", "catálogo de disponibilidad inesperado.");
  invariant(values.speciesAvailability.species.length === 386, "disponibilidad por especie incompleta.");
  invariant(values.speciesAvailability.scope.maximumWindow === 4, "disponibilidad fuera del corte W1..W4.");
  invariant(new Set(values.speciesAvailability.species.map(s => s.slug)).size === 386, "especies duplicadas.");
  for (const row of values.speciesAvailability.species) {
    invariant(row.window === null || ([1, 2, 3, 4].includes(row.window) && row.status === "found" && row.witnesses.length > 0), `ventana de especie inválida: ${row.slug}.`);
  }
  invariant(
    Object.keys(values.policy.natureEffects ?? {}).length === 25,
    "policy.json no contiene las 25 naturalezas Gen III.",
  );
  invariant(values.plan.authoringVersion === 7, "el plan canónico activo no es Autoría 7.");
  invariant(values.canonicalAvailability.summary?.families === 202, "canonicalAvailability no cubre 202 familias.");
  invariant(values.canonicalAvailability.summary?.species === 386, "canonicalAvailability no cubre 386 especies.");
  invariant(values.pokedex.summary?.species === 386, "la Pokédex factual no cubre 386 especies.");
  invariant(Object.keys(values.legality.species ?? {}).length === 386, "la legalidad no cubre 386 especies.");
  invariant(values.heldItems.catalogId === "B2-TRAINER-HELD-ITEMS-2", "catálogo de objetos inesperado.");
  invariant(values.resources.catalogId === "B2-TRAINER-RESOURCES-1", "catálogo de recursos inesperado.");
  invariant(values.identity.summary?.logicalTrainers === values.identity.trainers.length,
    "el resumen de identidad factual no coincide con sus registros.");
  invariant(
    values.plan.semantics?.priorRunArtifacts?.length === 0
      && values.plan.semantics?.materializedFaunaDependencies?.length === 0,
    "el plan canónico depende de rosters previos o fauna materializada.",
  );
  invariant(
    values.canonicalAvailability.semantics?.priorRunArtifacts?.length === 0
      && values.canonicalAvailability.semantics?.materializedFaunaDependencies?.length === 0,
    "canonicalAvailability depende de rosters previos o fauna materializada.",
  );
}

function canonicalAbilities(pokedex, legality) {
  const result = new Map();
  const dexBySlug = new Map(pokedex.species.map((species) => [species.slug, species]));
  for (const [slug, legal] of Object.entries(legality.species)) {
    const species = dexBySlug.get(slug);
    invariant(species !== undefined, `${slug} falta en Pokédex.`);
    invariant(Array.isArray(legal.abilities) && legal.abilities.length > 0, `${slug} no tiene habilidades legales.`);
    const legalByKey = new Map(legal.abilities.map((ability) => [normalizedAbilityKey(ability), ability]));
    const dexKeys = new Set(species.abilities.map(normalizedAbilityKey));
    invariant(
      dexKeys.size === legalByKey.size && [...dexKeys].every((key) => legalByKey.has(key)),
      `${slug} discrepa entre habilidades de Pokédex y legalidad.`,
    );
    result.set(slug, [...legalByKey.values()]);
  }
  return result;
}

export async function loadCatalogs(projectRoot, {windowSnapshot}={}) {
  const entries = await Promise.all(Object.entries(SOURCE_PATHS).map(async ([key, relativePath]) => {
    const loaded = await readSource(projectRoot, relativePath);
    return [key, { ...loaded, path: relativePath }];
  }));
  const loaded = Object.fromEntries(entries);
  const values = Object.fromEntries(entries.map(([key, entry]) => [key, entry.value]));
  assertCatalogShape(values);
  invariant(values.profileAssignments.sources.some(source => source.path === SOURCE_PATHS.graphs
    && `sha256:${source.sha256}` === loaded.graphs.hash), "D212 no corresponde al grafo factual cargado.");
  invariant(values.speciesAvailability.audit?.sourceDigest === loaded.speciesAudit.hash
    && values.speciesAvailability.audit?.status === values.speciesAudit.status
    && ["pending", "ready"].includes(values.speciesAudit.status), "catálogo/auditoría W4 no coinciden.");
  const sourceHashes = Object.fromEntries(entries.map(([, entry]) => [entry.path, entry.hash]));
  const pokedexBySlug = new Map(values.pokedex.species.map((species) => [species.slug, species]));
  for (const species of values.pokedex.species) {
    const friendship = values.npcSpeciesInfo[species.key];
    invariant(Number.isInteger(friendship) && friendship >= 0 && friendship <= 255,
      `amistad NPC ausente/inválida: ${species.key}.`);
  }
  const familyById = new Map(values.canonicalAvailability.families.map((family) => [family.familyId, family]));
  const familyByKey = new Map(values.canonicalAvailability.families.map((family) => [family.familyKey, family]));
  const overlaidSpeciesAvailability = applyFossilAvailabilityOverlay({
    baseSpecies: values.speciesAvailability.species,
    overlay: values.fossilAvailability,
    pokedex: values.pokedex,
  });
  const availabilityBySlug = new Map(overlaidSpeciesAvailability.map(row => [row.slug, row]));
  for (const species of values.pokedex.species) invariant(availabilityBySlug.get(species.slug)?.nationalDex === species.nationalDex, `disponibilidad/dex discrepan: ${species.slug}.`);
  const evolutionItemById = new Map(values.evolutionItems.sources.map((source) => [source.rom.itemId, source]));
  const heldItemByName = new Map(values.heldItems.items.map((item) => [item.name, item]));
  return Object.freeze({
    ...values,
    windowSnapshot: windowSnapshot ?? await loadWindowSnapshot(projectRoot),
    sourceHashes: Object.freeze(sourceHashes),
    sourceDigests: Object.freeze({ ...sourceHashes }),
    gymEvidence: Object.freeze([]),
    specialistEvidence: null,
    forbiddenBabies: new Set(values.policy.forms.forbiddenBabySpecies),
    historicalBabyEdges: new Set(values.policy.forms.historicalBabyEdges),
    indexes: Object.freeze({
      pokedexBySlug,
      familyById,
      familyByKey,
      availabilityBySlug,
      evolutionItemById,
      heldItemByName,
      abilitiesBySpecies: canonicalAbilities(values.pokedex, values.legality),
    }),
  });
}

function starterPolicyContext(catalogs) {
  const contract = validateStarterPolicy(catalogs.policy);
  const authorableTrainerIds = parametricRivalTrainerIds(catalogs.policy);
  const reservedSpeciesByFamily = Object.fromEntries(contract.reservedNpcFamilyKeys.map(familyKey => {
    const family = catalogs.indexes.familyByKey.get(familyKey);
    invariant(family !== undefined, `D229 familia local desconocida: ${familyKey}.`);
    const species = catalogs.pokedex.species.filter(row => row.familyId === family.familyId)
      .sort((left, right) => left.nationalDex - right.nationalDex)
      .map(row => row.slug);
    invariant(species.length === 3, `D229 esperaba tres especies en ${familyKey}.`);
    return [familyKey, species];
  }));
  return {
    ...contract,
    tripletQuota: validateStarterTripletQuota(catalogs.policy),
    reservedSpeciesByFamily,
    reservedSpecies: Object.values(reservedSpeciesByFamily).flat(),
    rivalAuthoringEnabled: contract.rivalTemplates.authoringEnabled,
    authorableTrainerIds,
    implementationScope: "GENERAL_NON_RIVAL_AND_D229_CERTIFIED_PARAMETRIC_RIVAL_TEMPLATES",
  };
}

export function buildProfileContract(profile, cap, windowOrdinal, policy, maximumWindowOrdinal = 12) {
  const rules = policy.profiles[profile];
  invariant(rules !== undefined, `perfil Beta 4 desconocido: ${profile}.`);
  invariant(Number.isInteger(cap) && cap >= 4 && cap <= 100, `cap inválido: ${cap}.`);
  invariant(Number.isInteger(windowOrdinal) && windowOrdinal >= 1, `ventana inválida: ${windowOrdinal}.`);
  const levelTotal = 6 * (cap + rules.meanOffset);
  invariant(Number.isInteger(levelTotal), `${profile} no produce una suma entera de niveles.`);
  return Object.freeze({
    profile,
    partySize: policy.party.size,
    cap,
    meanOffset: rules.meanOffset,
    meanLevel: cap + rules.meanOffset,
    levelTotal,
    minimumLevel: Math.max(1, cap + policy.party.minimumLevelOffset),
    maximumLevel: cap + policy.party.maximumLevelOffset,
    iv: rules.iv,
    maxHeldItems: rules.maxHeldItems,
    maximumCopiesPerHeldItem: 1,
    allNaturesChosenForExactSet: true,
    bestLegalAbilityForSetAndTeam: true,
    horizons: Object.freeze({
      families: clampWindow(windowOrdinal + rules.familyForwardWindows, maximumWindowOrdinal),
      forms: clampWindow(windowOrdinal + rules.familyForwardWindows, maximumWindowOrdinal),
      species: clampWindow(windowOrdinal + rules.speciesForwardWindows, maximumWindowOrdinal),
      moves: clampWindow(windowOrdinal + rules.moveForwardWindows, maximumWindowOrdinal),
      items: clampWindow(windowOrdinal + rules.itemForwardWindows, maximumWindowOrdinal),
    }),
    aiProfile: [...policy.aiProfile],
  });
}

function diagnosticPrologueContract(cap, windowOrdinal, policy) {
  return Object.freeze({
    profile: "PRÓLOGO",
    partySize: 1,
    cap,
    meanOffset: 0,
    meanLevel: cap,
    levelTotal: cap,
    minimumLevel: cap,
    maximumLevel: cap,
    iv: 25,
    maxHeldItems: 1,
    allNaturesChosenForExactSet: false,
    bestLegalAbilityForSetAndTeam: false,
    horizons: Object.freeze({ families: windowOrdinal, forms: windowOrdinal, species: windowOrdinal, moves: windowOrdinal, items: windowOrdinal }),
    aiProfile: [...policy.aiProfile],
    diagnosticOnly: true,
  });
}

export function isLegalLevelVector(contract, levels) {
  return Array.isArray(levels)
    && levels.length === contract.partySize
    && levels.every((level) => Number.isInteger(level)
      && level >= contract.minimumLevel
      && level <= contract.maximumLevel)
    && levels.reduce((sum, level) => sum + level, 0) === contract.levelTotal;
}

function evolutionDepth(species, pokedexBySlug, visiting = new Set()) {
  if (visiting.has(species.slug)) return 0;
  const next = new Set(visiting).add(species.slug);
  return species.evolution.incoming.reduce((maximum, edge) => {
    const parent = pokedexBySlug.get(edge.from.toLowerCase());
    return Math.max(maximum, parent === undefined ? 0 : 1 + evolutionDepth(parent, pokedexBySlug, next));
  }, 0);
}

function factualCanon(identity, trainer, catalogs) {
  const byFamily = new Map();
  for (const record of identity.engineRecords) {
    for (const member of record.party) {
      const species = catalogs.indexes.pokedexBySlug.get(member.slug);
      invariant(species !== undefined, `${trainer.id}: especie factual desconocida ${member.slug}.`);
      const family = catalogs.indexes.familyById.get(species.familyId);
      invariant(family !== undefined, `${trainer.id}: familia factual desconocida para ${member.slug}.`);
      const candidate = {
        family: family.familyKey,
        floorSpecies: species.slug,
        depth: evolutionDepth(species, catalogs.indexes.pokedexBySlug),
      };
      const current = byFamily.get(candidate.family);
      if (current === undefined || candidate.depth > current.depth) byFamily.set(candidate.family, candidate);
    }
  }
  const last = trainer.battleRole === "leader" ? identity.engineRecords[0]?.party.at(-1) : null;
  const aceSpecies = last === null || last === undefined
    ? null
    : catalogs.indexes.pokedexBySlug.get(last.slug);
  const aceFamily = aceSpecies === null || aceSpecies === undefined
    ? null
    : catalogs.indexes.familyById.get(aceSpecies.familyId)?.familyKey ?? null;
  return {
    anchorOptions: [...byFamily.values()].map(({ family, floorSpecies }) => ({ family, floorSpecies })),
    canonicalAce: aceSpecies === null || aceSpecies === undefined
      ? null
      : { family: aceFamily, species: aceSpecies.slug },
  };
}

function signatureContract(trainerId, assignment, factual, catalogs) {
  if (assignment.profile !== "JEFE") return null;
  const character = catalogs.bossSignatures.characters.find(row => row.bossIdentityId === assignment.bossIdentityId);
  if (character === undefined) return null;
  const families = signatureFamiliesForEncounter(character, trainerId);
  if (!Array.isArray(families) || families.length !== (catalogs.policy.party.compositionOverrides?.[trainerId]?.anchorMinimum ?? 3)) return null;
  const override = catalogs.bossSignatures.entries.find(row => row.trainerId === trainerId);
  const overrideByFamily = new Map((override?.anchors ?? []).map(anchor => [anchor.family, anchor]));
  const factualByFamily = new Map(factual.anchorOptions.map(anchor => [anchor.family, anchor]));
  return {
    trainerId,
    bossIdentityId: assignment.bossIdentityId,
    anchors: families.map(family => {
      const explicit = overrideByFamily.get(family);
      if (explicit !== undefined) return structuredClone(explicit);
      const observed = factualByFamily.get(family);
      return observed === undefined
        ? { family, origin: "editorial", floorSpecies: null }
        : { family, origin: "factual", floorSpecies: observed.floorSpecies };
    }),
    legendarySpecies: structuredClone(override?.legendarySpecies ?? []),
    fixedMembers: structuredClone(override?.fixedMembers ?? []),
    neighborTrainerIds: structuredClone(override?.neighborTrainerIds ?? []),
    source: override === undefined ? "bossSignatures.characters+factualCanon" : "bossSignatures.entries",
  };
}

function compositionContract(trainerId, profile, canon, policy) {
  const override = policy.party.compositionOverrides?.[trainerId];
  const rule = override === undefined ? policy.party.compositionByProfile[profile]
    : { ...policy.party.compositionByProfile[profile], ...override };
  invariant(rule !== undefined, `falta composición Beta 4 para ${profile}.`);
  const availableAnchors = canon.anchorOptions.length;
  const anchorMaximum = Math.min(rule.anchorMaximum, availableAnchors);
  const anchorMinimum = profile === "JEFE" ? rule.anchorMinimum : anchorMaximum === 0 ? 0 : 1;
  const resolvedAnchorCount = anchorMinimum === anchorMaximum ? anchorMinimum : null;
  return Object.freeze({
    profile,
    partySize: policy.party.size,
    anchorMinimum,
    anchorMaximum,
    resolvedAnchorCount,
    competitiveRoles: rule.competitiveRoles,
    identityRolesFormula: rule.identityRolesFormula,
    anchorSource: rule.anchorSource,
    repeatedAnchorFamiliesAcrossVariants: profile === "JEFE" ? "ALL_REGISTERED" : "CHOSEN_SUBSET_FIXED",
    variableFamiliesAcrossVariants: profile === "JEFE" ? "DISJOINT" : "REUSE_ALLOWED_SUBJECT_TO_VARIANT_DISTANCE",
    minimumFamilyDifferencesBetweenVariants: profile === "JEFE" ? policy.party.size - anchorMinimum : 2,
    fixedMembers: [],
    encounterOverrideDecisionId: override?.decisionId ?? null,
  });
}

function specialContractKind(assignment, catalogs) {
  if (assignment.profile === "PRÓLOGO") return "PROLOGUE";
  if (assignment.bossIdentityId === catalogs.policy.localStarterReservation.allowedTrainerIdentity) return "RIVAL";
  if (["08C", "09I"].includes(assignment.lotId)) return "LEAGUE";
  return null;
}

function constructionContext(trainerId, assignment, catalogs, currentLotTeams) {
  const rank = { "JEFE": 4, "ESPECIALISTA": 3, "AVANZADO": 2, "COMÚN": 1, "PRÓLOGO": 0 };
  const orderedTrainerIds = catalogs.profileAssignments.records
    .map((row, sourceIndex) => ({ ...row, sourceIndex }))
    .filter(row => row.lotId === assignment.lotId)
    .sort((left, right) => (rank[right.profile] ?? -1) - (rank[left.profile] ?? -1)
      || Number(specialContractKind(left, catalogs) !== null) - Number(specialContractKind(right, catalogs) !== null)
      || left.sourceIndex - right.sourceIndex)
    .map(row => row.id);
  return {
    selectionBasis: "D212-profile-descending-then-ordinary-before-special-contract-then-factual-record-order",
    orderedTrainerIds,
    currentPosition: orderedTrainerIds.indexOf(trainerId),
    profileRank: rank[assignment.profile] ?? null,
    pyramidComparatorIdsByBranch: Object.fromEntries(BRANCHES.map(branch => [branch,
      currentLotTeams[branch].filter(entry => (rank[entry.profile] ?? -1) > (rank[assignment.profile] ?? -1))
        .map(entry => entry.trainerId)])),
    individualContextOnly: true,
    pendingLotGates: ["strength-pyramid", "intra-lot-family-overlap", "frontier-nine-way", "recurrence",
      ...(assignment.profile === "ESPECIALISTA" ? ["specialist-distance-D222"] : [])],
  };
}

function mandatoryAnchorFamiliesForSpecialist(trainerId, catalogs) {
  const assignment = catalogs.profileAssignments.records.find(row => row.id === trainerId);
  const trainer = catalogs.graphs.encounterGraph.nodes.find(row => row.id === trainerId);
  const identity = catalogs.identity.trainers.find(row => row.logicalId === trainerId);
  if (assignment?.profile !== "ESPECIALISTA" || trainer === undefined || identity === undefined) return [];
  const canon = factualCanon(identity, trainer, catalogs);
  const composition = compositionContract(trainerId, assignment.profile, canon, catalogs.policy);
  return canon.anchorOptions.length === composition.anchorMinimum
    ? canon.anchorOptions.map(anchor => anchor.family).sort() : [];
}

function specialistFutureAnchorConstraints(trainerId, assignment, catalogs) {
  const evidence = catalogs.specialistEvidence;
  if (assignment.profile !== "ESPECIALISTA" || evidence === null) return null;
  const own = evidence.identities.find(identity => identity.trainerIds.includes(trainerId));
  invariant(own !== undefined, `${trainerId}: falta identidad D222.`);
  const acceptedIdentityIds = new Set(evidence.acceptedIdentities.map(row => row.identityId));
  const comparisons = [];
  const requirements = [];
  for (const route of evidence.comparisons.filter(row => row.pairIdentityIds.includes(own.identityId))) {
    const otherId = route.pairIdentityIds.find(id => id !== own.identityId);
    if (acceptedIdentityIds.has(otherId)) continue;
    const other = evidence.identities.find(identity => identity.identityId === otherId);
    const mandatoryFamilies = [...new Set(other.trainerIds.flatMap(id => mandatoryAnchorFamiliesForSpecialist(id, catalogs)))].sort();
    if (mandatoryFamilies.length === 0) continue;
    if (route.status === "AMBIGUOUS") {
      comparisons.push({
        identityId: otherId,
        trainerIds: [...other.trainerIds],
        distance: null,
        maximumKInvolvedOverlap: null,
        mandatoryAnchorFamilies: mandatoryFamilies,
        ambiguityCode: route.ambiguityCode,
      });
      continue;
    }
    if (route.evidence.sourceIdentityId !== own.identityId || route.distance > 2) continue;
    comparisons.push({
      identityId: otherId,
      trainerIds: [...other.trainerIds],
      distance: route.distance,
      maximumKInvolvedOverlap: route.maximumKInvolvedOverlap,
      mandatoryAnchorFamilies: mandatoryFamilies,
      routeEvidence: structuredClone(route.evidence),
    });
  }
  return {
    decisionId: "D-222",
    evidenceDigest: catalogs.sourceHashes["specialist-acceptance-snapshot"],
    acceptedIdentityCount: evidence.acceptedIdentities.length,
    comparisons,
    requirements,
  };
}

function contextDataRequirements({ trainerId, assignment, window, contract, signature, catalogs }) {
  const requirements = [];
  if (trainerId === catalogs.policy.rivalRoute22.trainerId) {
    const approved = catalogs.policy.rivalRoute22;
    invariant(["profile", "cap", "levelTotal", "minimumLevel", "maximumLevel", "iv"].every(key => contract[key] === approved[key])
      && JSON.stringify(signature?.anchors.map(row => row.family)) === JSON.stringify(approved.anchorFamilies),
    "D243 perfil/niveles/anclas Ruta22 divergen del contrato aprobado.");
  }
  const auditedThrough = catalogs.policy.availability.maximumAuditedWindow;
  if (contract !== null && contract.horizons.species > auditedThrough) {
    requirements.push({
      code: "SPECIES_AVAILABILITY_HORIZON_NOT_AUDITED",
      trainerId,
      source: SOURCE_PATHS.speciesAvailability,
      requiredThroughWindow: contract.horizons.species,
      auditedThroughWindow: auditedThrough,
      message: `${trainerId} requiere disponibilidad por especie exacta hasta W${contract.horizons.species}; el catálogo sellado sólo certifica W1..W${auditedThrough}.`,
    });
  }
  if (assignment.profile === "PRÓLOGO") requirements.push({
    code: "PROLOGUE_FIELDS_REQUIRED", trainerId,
    missingFields: [
      "partySize=1 y forma física por elección del jugador",
      "nivel rígido del starter rival",
      "IV/IA/premio y semántica tutorial fuera de los cuatro perfiles",
      "schema editorial/materialización de las tres ramas D229 para el prólogo",
    ],
    sources: ["DECISIONS.md#D-054", "DECISIONS.md#D-229", "BETA4_PLAN.md#4"],
    message: "Oak prólogo tiene hechos heredados, pero Beta 4 no ha adoptado aún su contrato completo de party, nivel y materialización; el perfil ordinario de seis no es un fallback legal.",
  });
  if (assignment.bossIdentityId === catalogs.policy.localStarterReservation.allowedTrainerIdentity
    && !isParametricRivalTrainer(trainerId, catalogs.policy)) {
    requirements.push({
      code: "RIVAL_D229_ENGINE_ADAPTER_REQUIRED", trainerId,
      requirementKind: "IMPLEMENTATION",
      existingContract: {
        editorialVariants: ["A", "B", "C"],
        commonMembersPerTemplate: 5,
        symbolicStarterSlotsPerTemplate: 1,
        physicalBranchesPerSelectedTemplate: 3,
        starterSets: "SPECIFIC_PER_RIVAL_FAMILY",
      },
      requiredAdapterFields: [
        "variants.{A,B,C}.members: cinco miembros comunes y un slot $starter",
        "$starter.starterSets.{bulbasaur,charmander,squirtle}: set completo específico",
        "materialización seleccionada: tres parties físicas por elección del jugador",
        "validación mecánica de cada party física y ledgers por unión de ramas",
      ],
      sources: ["DECISIONS.md#D-229", "starter-policy.mjs"],
      message: "D229 ya decide las plantillas rivales; falta conectar su schema paramétrico al validador, materializador y ledgers generales. No falta una decisión de composición rival.",
    });

  }
  if (["08C", "09I"].includes(assignment.lotId)) requirements.push({
    code: "LEAGUE_CONTRACT_MISSING", trainerId,
    message: "La asignación D212 no sustituye presupuestos, ramas y exclusividad D221 de Liga.",
  });
  if (assignment.profile === "JEFE" && signature === null) requirements.push({
    code: "BOSS_SIGNATURE_CONTRACT_MISSING", trainerId, bossIdentityId: assignment.bossIdentityId,
    message: `${trainerId} es Jefe pero no tiene una firma resoluble conforme a su contrato registrado.`,
  });
  if (assignment.profile === "ESPECIALISTA" && catalogs.specialistEvidence === null) requirements.push({
    code: "SPECIALIST_D222_ACCEPTED_SNAPSHOT_REQUIRED",
    trainerId,
    blockingPhase: "PUBLICATION_GATE",
    requirementKind: "EVIDENCE_BINDING",
    requiredField: "acceptedPublications[] with trainerId/publicationDigest/acceptanceDigest/variants",
    emptyComparisonSemantics: "PASS_VACUOUS_ONLY_AFTER_EXPLICIT_EMPTY_SNAPSHOT",
    source: "DECISIONS.md#D-222",
    message: "La tripleta puede publicarse para auditoría, pero no aceptarse hasta ligar un snapshot explícito —aunque sea []— de Especialistas aceptados.",
  });
  if (assignment.profile === "ESPECIALISTA" && catalogs.specialistEvidence !== null) {
    const constraints = specialistFutureAnchorConstraints(trainerId, assignment, catalogs);
    requirements.push(...constraints.requirements);
  }
  const gymOrdinal = GYM_ORDER.indexOf(trainerId);
  if (gymOrdinal >= 0) {
    const requiredPrior = GYM_ORDER.slice(Math.max(0, gymOrdinal - 2), gymOrdinal);
    const available = new Set((catalogs.gymEvidence ?? []).map(row => row.trainerId));
    const missing = requiredPrior.filter(id => !available.has(id));
    if (missing.length > 0) requirements.push({
      code: "GYM_DISTANCE_EVIDENCE_MISSING", trainerId, missingTrainerIds: missing,
      message: `D219 requiere evidencia familiar/roles de los gimnasios previos dentro de distancia dos: ${missing.join(", ")}.`,
    });
  }
  return requirements;
}

function evolutionPathsTo(species, pokedexBySlug, visiting = new Set()) {
  if (visiting.has(species.slug)) return [];
  if (species.evolution.incoming.length === 0) return [[]];
  const next = new Set(visiting).add(species.slug);
  return species.evolution.incoming.flatMap((edge) => {
    const parent = pokedexBySlug.get(edge.from.toLowerCase());
    if (parent === undefined) return [];
    return evolutionPathsTo(parent, pokedexBySlug, next).map((pathEdges) => [...pathEdges, edge]);
  });
}

function pathIsLegal(pathEdges, selectedSpecies, level, anchorFloor, maximumSpeciesWindow, catalogs) {
  if (anchorFloor !== null && selectedSpecies === anchorFloor) return true;
  let floorReached = anchorFloor === null;
  for (const edge of pathEdges) {
    const source = edge.from.toLowerCase();
    const target = edge.to.toLowerCase();
    if (!floorReached) {
      if (source === anchorFloor) floorReached = true;
      else if (target === anchorFloor) {
        floorReached = true;
        continue;
      }
    }
    if (!floorReached) continue;
    if (catalogs.historicalBabyEdges.has(`${source}>${target}`)) continue;
    if (AUTOMATIC_LEVEL_METHODS.has(edge.method)) {
      const required = parseLevel(edge.parameter);
      if (!Number.isInteger(required) || level < required) return false;
      continue;
    }
    if (edge.method === "EVO_ITEM" || edge.method === "EVO_LEVEL_ITEM") {
      const itemId = parseItemId(edge.parameter);
      const itemSource = catalogs.indexes.evolutionItemById.get(itemId);
      const sourceWindow = itemSource === undefined
        ? null
        : sourceWindowForLot(catalogs.plan, itemSource.lot);
      if (sourceWindow === null || sourceWindow > maximumSpeciesWindow) return false;
      if (edge.method === "EVO_LEVEL_ITEM") {
        const required = parseLevel(edge.parameter);
        if (!Number.isInteger(required) || level < required) return false;
      }
      continue;
    }
    return false;
  }
  return floorReached;
}

function formIsLegal(species, level, anchorFloor, maximumSpeciesWindow, catalogs) {
  if (catalogs.forbiddenBabies.has(species.slug)) return false;
  if (anchorFloor !== null) {
    const floor = catalogs.indexes.pokedexBySlug.get(anchorFloor);
    if (floor === undefined || floor.familyId !== species.familyId) return false;
  }
  const paths = evolutionPathsTo(species, catalogs.indexes.pokedexBySlug);
  if (paths.length === 0 || !paths.some((pathEdges) => pathIsLegal(
    pathEdges,
    species.slug,
    level,
    anchorFloor,
    maximumSpeciesWindow,
    catalogs,
  ))) return false;
  return !species.evolution.outgoing.some((edge) => {
    if (!AUTOMATIC_LEVEL_METHODS.has(edge.method)) return false;
    const required = parseLevel(edge.parameter);
    return Number.isInteger(required) && level >= required;
  });
}

// Pure rule check also used with explicitly synthetic catalogs in regression tests.
export function factualAnchorWindowException({ trainerId, anchor, species: slug, level, contract }, catalogs) {
  if (!trainerId || !anchor?.floorSpecies || anchor.origin === "editorial") return false;
  const identity = catalogs.identity.trainers.find(row => row.logicalId === trainerId);
  const trainer = catalogs.graphs.encounterGraph.nodes.find(row => row.id === trainerId);
  if (!identity || !trainer) return false;
  const factual = factualCanon(identity, trainer, catalogs).anchorOptions
    .find(row => row.family === anchor.family && row.floorSpecies === anchor.floorSpecies);
  const family = catalogs.indexes.familyByKey.get(anchor.family);
  const species = catalogs.indexes.pokedexBySlug.get(slug);
  const floorObservation = catalogs.indexes.availabilityBySlug.get(anchor.floorSpecies);
  const observation = catalogs.indexes.availabilityBySlug.get(slug);
  if (!factual || !species || family?.canonicalAvailability?.explicitCampaignDecisionRequired
    || catalogs.fossilAvailability.records.some(row => row.slug === slug || row.slug === anchor.floorSpecies)
    || floorObservation?.status !== "found" || observation?.status !== "found"
    || !Number.isInteger(observation.window) || level < (observation.minimumLevel ?? 1)
    || level < contract.minimumLevel || level > contract.maximumLevel
    || !formIsLegal(species, level, anchor.floorSpecies, contract.horizons.forms, catalogs)) return false;
  return slug === anchor.floorSpecies || evolutionPathsTo(species, catalogs.indexes.pokedexBySlug).some(edges => {
    const start = edges.findIndex(edge => edge.from.toLowerCase() === anchor.floorSpecies);
    return start >= 0 && edges.slice(start).every(edge => AUTOMATIC_LEVEL_METHODS.has(edge.method)
      && Number.isInteger(parseLevel(edge.parameter)) && level >= parseLevel(edge.parameter));
  });
}

export function isLegalAceFloor({ floorSpecies, family, species: slug, level, contract, trainerId }, catalogs) {
  const species = catalogs.indexes.pokedexBySlug.get(slug);
  const observation = catalogs.indexes.availabilityBySlug.get(slug);
  return species !== undefined
    && catalogs.indexes.familyById.get(species.familyId)?.familyKey === family
    && ["found", "authorized"].includes(observation?.status) && Number.isInteger(observation.window)
    && (observation.window <= contract.horizons.species || factualAnchorWindowException({ trainerId,
      anchor: { family, floorSpecies }, species: slug, level, contract }, catalogs))
    && level >= (observation.minimumLevel ?? 1)
    && formIsLegal(species, level, floorSpecies, contract.horizons.forms, catalogs);
}

function isDamaging(move) {
  return move.power > 0 || move.mechanics?.kind === "battle-state-dependent";
}

function isDirectDamage(move, fixedDamageEffects) {
  return isDamaging(move) && !fixedDamageEffects.has(move.effect);
}

export function classifyDamage(move, types, policy) {
  const damaging = isDamaging(move);
  const fixed = policy.fixedDamageEffects.includes(move.effect)
    || policy.specialDamageEffects.includes(move.effect);
  return {
    damaging,
    statBasedDamage: damaging && !fixed,
    reliable: damaging
      && (move.accuracy === 0 || move.accuracy >= policy.minimumReliableAccuracy)
      && !policy.unreliableEffects.includes(move.effect),
    stab: damaging && !fixed && !policy.noStabEffects.includes(move.effect) && types.includes(move.type),
  };
}

function isReliable(move, policySets) {
  return classifyDamage(move, [], policySets.policy).reliable;
}

function dominatedMoves(moves, policySets) {
  const dominated = new Map();
  for (const weaker of moves.filter((move) => isDirectDamage(move, policySets.fixed))) {
    for (const stronger of moves.filter((move) => isDirectDamage(move, policySets.fixed))) {
      if (weaker === stronger || weaker.type !== stronger.type || weaker.damageClass !== stronger.damageClass) continue;
      if (weaker.power === null || stronger.power === null) continue;
      if (!stronger.accesses.some(({ method }) => method === "natural" || method === "retained")) continue;
      const weakerAccuracy = weaker.accuracy === 0 ? 101 : weaker.accuracy;
      const strongerAccuracy = stronger.accuracy === 0 ? 101 : stronger.accuracy;
      if (stronger.power <= weaker.power || strongerAccuracy < weakerAccuracy) continue;
      if ((weaker.priority ?? 0) > (stronger.priority ?? 0)) continue;
      if (isReliable(weaker, policySets) && !isReliable(stronger, policySets)) continue;
      // Sólo el mismo efecto permite una dominancia mecánica bloqueante. Un
      // secundario distinto (incluido retroceso) cambia la función del slot y
      // queda para la revisión táctica, no para una falsa comparación escalar.
      if (weaker.effect !== stronger.effect) continue;
      dominated.set(weaker.name, stronger.name);
      break;
    }
  }
  return dominated;
}

function moveMenuFor(species, level, maximumMoveWindow, catalogs, iv) {
  const legal = catalogs.legality.species[species.slug];
  invariant(legal !== undefined, `falta legalidad de movimientos para ${species.slug}.`);
  const accesses = new Map();
  const add = (name, access) => {
    invariant(catalogs.battle.moveDetails[name] !== undefined, `${species.slug}/${name} no tiene detalle Gen III.`);
    const current = accesses.get(name) ?? [];
    current.push(access);
    accesses.set(name, current);
  };
  for (const [name, learnedAt] of Object.entries(legal.naturalMoveLevels)) {
    if (learnedAt <= level) add(name, { method: "natural", learnedAt });
  }
  for (const [name, learnedAt] of Object.entries(legal.retainedMoveLevels ?? {})) {
    if (learnedAt <= level) add(name, { method: "retained", learnedAt });
  }
  for (const source of catalogs.resources.moveSources) {
    const sourceWindow = sourceWindowForLot(catalogs.plan, source.batch);
    if (legal.machineTutorMoves.includes(source.name)
      && sourceWindow !== null
      && sourceWindow <= maximumMoveWindow) {
      add(source.name, {
        method: source.method,
        sourceBatch: source.batch,
        sourceWindow,
        sourceRef: source.sourceRef,
      });
    }
  }
  const policy = catalogs.policy.moves;
  const policySets = {
    policy,
    fixed: new Set([...policy.fixedDamageEffects, ...policy.specialDamageEffects]),
    unreliable: new Set(policy.unreliableEffects),
  };
  const prohibited = new Set(policy.prohibitedEffects);
  const nonMaterial = new Set(policy.nonMaterialEffects);
  const material = [...accesses].map(([name, moveAccesses]) => ({
    id: name,
    name,
    ...catalogs.battle.moveDetails[name],
    accesses: moveAccesses,
  })).filter((move) => !prohibited.has(move.effect) && !nonMaterial.has(move.effect))
    .map(move => resolveMoveMechanics(move, { iv, friendship: catalogs.npcSpeciesInfo[species.key] }));
  const dominated = dominatedMoves(material, policySets);
  return material.map((move) => ({
    ...move,
    ...classifyDamage(move, species.types, policy),
    dominatedBy: dominated.get(move.name) ?? null,
  })).sort((left, right) => left.name.localeCompare(right.name));
}

function itemWindowOrdinal(item, catalogs) {
  const index = catalogs.heldItems.windowOrder.indexOf(item.earliestWindow);
  return index < 0 ? null : index + 1;
}

function buildLegalMenu(contextBase, canon, catalogs) {
  const { contract } = contextBase;
  const starterPolicy = starterPolicyContext(catalogs);
  const reservedNpcFamilies = new Set(starterPolicy.reservedNpcFamilyKeys);
  const isRival = contextBase.bossIdentity?.bossIdentityId === starterPolicy.allowedTrainerIdentity;
  const anchorFloors = new Map(canon.anchorOptions.map(({ family, floorSpecies }) => [family, floorSpecies]));
  const exactAnchorSpecies = new Map(canon.anchorOptions.filter(anchor => anchor.exactSpecies !== undefined)
    .map(({ family, exactSpecies }) => [family, exactSpecies]));
  const editorialAnchors = new Set(canon.anchorOptions.filter(a => a.origin === "editorial").map(a => a.family));
  const overlaySpecies = new Set(catalogs.fossilAvailability.records.map(row => row.slug));
  const speciesMenu = [];
  const familyMenu = [];
  for (const family of catalogs.canonicalAvailability.families) {
    if (!isRival && reservedNpcFamilies.has(family.familyKey)) continue;
    const availability = family.canonicalAvailability;
    const anchorFloor = anchorFloors.get(family.familyKey) ?? null;
    const familySpecies = catalogs.pokedex.species
      .filter(({ familyId }) => familyId === family.familyId)
      .sort((left, right) => left.nationalDex - right.nationalDex);
    if (availability.explicitCampaignDecisionRequired
      && !familySpecies.some(species => overlaySpecies.has(species.slug))) continue;
    const familyEntries = [];
    for (const species of familySpecies) {
      if (availability.explicitCampaignDecisionRequired && !overlaySpecies.has(species.slug)) continue;
      const observation = catalogs.indexes.availabilityBySlug.get(species.slug);
      if (!["found", "authorized"].includes(observation?.status) || !Number.isInteger(observation.window)
        ) continue;
      const withinSpeciesHorizon = observation.window <= contract.horizons.species;
      const availabilityWindow = {
        id: `W${String(observation.window).padStart(2, "0")}`,
        ordinal: observation.window,
        axis: observation.evidence?.axis ?? "minimum.trainersCampaign",
        unit: "species",
        witnesses: [...observation.witnesses],
        status: observation.status,
        minimumLevel: observation.minimumLevel ?? 1,
        ...(observation.overlayCatalogId === undefined ? {} : {
          overlayCatalogId: observation.overlayCatalogId,
          overlayDecisionId: observation.overlayDecisionId,
          provenance: structuredClone(observation.evidence.provenance),
        }),
      };
      const levels = {};
      for (let level = contract.minimumLevel; level <= contract.maximumLevel; level += 1) {
        if (level < (observation.minimumLevel ?? 1)) continue;
        const standardLegal = withinSpeciesHorizon && formIsLegal(species, level, null, contract.horizons.forms, catalogs);
        const anchorException = !withinSpeciesHorizon && factualAnchorWindowException({ trainerId: contextBase.trainerId,
          anchor: canon.anchorOptions.find(row => row.family === family.familyKey), species: species.slug, level, contract }, catalogs);
        const exactAnchor = exactAnchorSpecies.get(family.familyKey);
        const anchorLegal = exactAnchor !== undefined ? species.slug === exactAnchor && standardLegal
          : editorialAnchors.has(family.familyKey) ? standardLegal : (withinSpeciesHorizon || anchorException) && anchorFloor !== null
            && formIsLegal(species, level, anchorFloor, contract.horizons.forms, catalogs);
        if (!standardLegal && !anchorLegal) continue;
        const moves = moveMenuFor(species, level, contract.horizons.moves, catalogs, contract.iv);
        levels[level] = {
          standardLegal,
          anchorLegalFor: anchorLegal ? [family.familyKey] : [],
          ...(anchorLegal && anchorException ? { anchorWindowException: { decisionId: "D-247", floorSpecies: anchorFloor,
            factualWindow: observation.window, speciesHorizon: contract.horizons.species, role: "A" } } : {}),
          recommendedMoveCount: Math.min(catalogs.policy.moves.maximum, moves.length),
          moves,
        };
      }
      if (Object.keys(levels).length === 0) continue;
      const entry = {
        slug: species.slug,
        key: species.key,
        name: species.name,
        nationalDex: species.nationalDex,
        region: species.region,
        familyId: family.familyId,
        familyKey: family.familyKey,
        availabilityWindow,
        types: [...species.types],
        baseStats: structuredClone(species.baseStats),
        effortValues: effortValuesForEncounter(contextBase.trainerId, species.slug, catalogs.policy),
        abilities: [...catalogs.indexes.abilitiesBySpecies.get(species.slug)],
        evolution: structuredClone(species.evolution),
        levels,
      };
      speciesMenu.push(entry);
      familyEntries.push(species.slug);
    }
    if (familyEntries.length > 0) {
      familyMenu.push({
        familyId: family.familyId,
        familyKey: family.familyKey,
        sourceWindow: Math.min(...familyEntries.map(slug => catalogs.indexes.availabilityBySlug.get(slug).window)),
        anchorFloor,
        species: familyEntries,
      });
    }
  }
  const items = catalogs.heldItems.items.filter((item) => {
    const ordinal = itemWindowOrdinal(item, catalogs);
    return item.eligibility === "allowed" && ordinal !== null && ordinal <= contract.horizons.items;
  }).map((item) => ({ ...structuredClone(item), windowOrdinal: itemWindowOrdinal(item, catalogs) }));
  const natures = Object.entries(catalogs.policy.natureEffects)
    .map(([name, effect]) => ({ name, ...effect }));
  return {
    families: familyMenu,
    species: speciesMenu,
    ...(isParametricRivalTrainer(contextBase.trainerId, catalogs.policy) ? {
      starterSlot: {
        decisionId: contextBase.trainerId === catalogs.policy.rivalRoute22.trainerId ? "D-243" : "D-245",
        family: "$starter", akiRole: "A", lastSlot: true,
        commonMemberForbiddenFamilies: [...starterPolicy.allRegionalStarterFamilyKeys],
        speciesByRivalFamily: Object.fromEntries(starterPolicy.reservedNpcFamilyKeys.map(family => [family,
          speciesMenu.filter(row => row.familyKey === family).flatMap(row => {
            const legalLevels = Object.entries(row.levels).filter(([, level]) => level.standardLegal).map(([level]) => Number(level));
            return legalLevels.length === 0 ? [] : [{ species: row.slug,
            legalLevels: Object.entries(row.levels).filter(([, level]) => level.standardLegal).map(([level]) => Number(level)),
            availabilityWindow: structuredClone(row.availabilityWindow),
            }];
          }),
        ])),
      },
    } : {}),
    exclusions: {
      decisionId: "D-229",
      reservedNpcFamilyKeys: isRival ? [] : [...starterPolicy.reservedNpcFamilyKeys],
      reservedNpcSpecies: isRival ? [] : [...starterPolicy.reservedSpecies],
      appliesToRoles: isRival ? [] : ["A", "I", "K"],
    },
    natures,
    heldItems: items,
    movePolicy: structuredClone(catalogs.policy.moves),
    effortValuePolicy: {
      decisionIds: [...catalogs.policy.effortValues.decisionIds],
      automatic: true,
      submissionField: catalogs.policy.effortValues.submissionField,
      default: { ...catalogs.policy.effortValues.default, total: 0 },
      applicableExceptions: catalogs.policy.effortValues.exceptions
        .filter(row => row.trainerId === contextBase.trainerId).map(row => ({
          trainerId: row.trainerId,
          species: row.species,
          inheritance: row.inheritance,
          effortValues: effortValuesForEncounter(row.trainerId, row.species, catalogs.policy),
        })),
    },
  };
}

function anchorAvailabilityEvidence(canon, contract, catalogs, trainerId) {
  return canon.anchorOptions.map(anchor => {
    const family = catalogs.indexes.familyByKey.get(anchor.family);
    const species = family === undefined ? [] : catalogs.pokedex.species
      .filter(row => row.familyId === family.familyId)
      .sort((left, right) => left.nationalDex - right.nationalDex)
      .map(row => {
        const availability = catalogs.indexes.availabilityBySlug.get(row.slug);
        const formLegalLevels = [];
        for (let level = contract.minimumLevel; level <= contract.maximumLevel; level += 1) {
          if (formIsLegal(row, level, anchor.floorSpecies, contract.horizons.forms, catalogs)) formLegalLevels.push(level);
        }
        return {
          slug: row.slug,
          availabilityStatus: availability?.status ?? "missing",
          availabilityWindow: availability?.window ?? null,
          withinSpeciesHorizon: availability?.status === "found" && Number.isInteger(availability.window)
            && availability.window <= contract.horizons.species,
          formLegalLevels,
          windowExceptionLevels: formLegalLevels.filter(level => availability?.window > contract.horizons.species
            && factualAnchorWindowException({ trainerId, anchor, species: row.slug, level, contract }, catalogs)),
        };
      });
    return { family: anchor.family, floorSpecies: anchor.floorSpecies ?? null, exactSpecies: anchor.exactSpecies ?? null, species };
  });
}

export function lotFamilyUsage(currentLotTeams) {
  return Object.fromEntries(BRANCHES.map(branch => {
    const owners = new Map(), anchors = new Map(), nonanchors = new Map();
    for (const entry of currentLotTeams[branch]) for (const member of entry.members) {
      invariant(["A", "I", "K"].includes(member.akiRole), "D258 requiere rol A/I/K explícito en cada miembro aceptado.");
      const family = member.family;
      const ids = owners.get(family) ?? new Set();
      ids.add(entry.trainerId);
      owners.set(family, ids);
      const roles = member.akiRole === "A" ? anchors : nonanchors;
      const roleIds = roles.get(family) ?? new Set();
      roleIds.add(entry.trainerId);
      roles.set(family, roleIds);
    }
    const families = [...owners].sort(([a], [b]) => a.localeCompare(b)).map(([family, ids]) => ({
      family, trainerIds: [...ids].sort(), trainerCount: ids.size, remainingTrainerSlots: Math.max(0, 2 - ids.size),
      anchorTrainerIds: [...(anchors.get(family) ?? [])].sort(),
      nonAnchorTrainerIds: [...(nonanchors.get(family) ?? [])].sort(),
    }));
    return [branch, { decisionId: "D-258", maximumTrainerOwnersPerFamily: 2, countedRoles: ["A", "I", "K"], canonicalAnchorsAlwaysAllowed: true, families,
      exhaustedFamilies: families.filter(row => row.trainerCount >= 2).map(row => row.family) }];
  }));
}

export function lotFamilyRecurrenceFindings(currentLotTeams, branch, trainerId, members, revisionAdmission=null) {
  const usage = lotFamilyUsage(currentLotTeams)[branch];
  return [...new Set(members.filter(member => (member.akiRole === "I" || member.akiRole === "K")
    &&!retainedOwner(revisionAdmission,trainerId,revisionAdmission?.lotId,branch,member.family,member.akiRole)).map(member => member.family))].flatMap(family => {
    const row = usage.families.find(entry => entry.family === family);
    const priorTrainerIds = row?.trainerIds.filter(id => id !== trainerId) ?? [];
    return priorTrainerIds.length < 2 ? [] : [{ code: "LOT_FAMILY_TRAINER_LIMIT", path: `submission.variants.${branch}.members`,
      decisionId: "D-258", branch, family, priorTrainerIds, maximumTrainerOwnersPerFamily: 2,
      message: `${family} ya aparece como A/I/K en ${priorTrainerIds.join(", ")} del paquete ${branch}; ${trainerId} excedería el máximo de 2 propietarios con un uso I/K.` }];
  });
}

// Report the whole branch, including excess existing I/K after a new canon A.
// No owner is selected for removal: editorial remediation must choose it.
export function lotFamilyGlobalFindings(currentLotTeams) {
  return Object.entries(lotFamilyUsage(currentLotTeams)).flatMap(([branch, usage]) => usage.families.flatMap(row => {
    const maximumNonAnchorOwners = Math.max(0, 2 - row.anchorTrainerIds.length);
    const excessNonAnchorOwners = Math.max(0, row.nonAnchorTrainerIds.length - maximumNonAnchorOwners);
    return excessNonAnchorOwners === 0 ? [] : [{ code: "LOT_FAMILY_NUMERICAL_OVERFLOW", decisionId: "D-259",assessmentKind:'NUMERICAL_ONLY',
      path: `currentLotTeams.${branch}`, branch, ...row, maximumNonAnchorOwners, excessNonAnchorOwners,
      message: `${row.family}: exceso numérico de ${excessNonAnchorOwners}; la cadena de admisiones determina su validez sin retirar publicados.` }];
  }));
}

function normalizeLedgers(ledgers) {
  invariant(exactKeys(ledgers, BRANCHES), "ledgers debe contener exactamente A, B y C.");
  return Object.fromEntries(BRANCHES.map((branch) => {
    invariant(Array.isArray(ledgers[branch]), `ledger ${branch} debe ser un array.`);
    const normalized = ledgers[branch].map((entry, index) => {
      invariant(exactKeys(entry, ["trainerId", "families"]), `ledger ${branch}[${index}] tiene forma inválida.`);
      invariant(typeof entry.trainerId === "string" && entry.trainerId.length > 0, `ledger ${branch}[${index}] no tiene trainerId.`);
      const expectedCount = ["rival-route-22", "rival-cerulean"].includes(entry.trainerId) ? 8 : 6;
      invariant(Array.isArray(entry.families) && entry.families.length === expectedCount, `ledger ${branch}[${index}] debe contener ${expectedCount} familias.`);
      invariant(new Set(entry.families).size === expectedCount, `ledger ${branch}[${index}] repite familias.`);
      invariant(!["rival-route-22", "rival-cerulean"].includes(entry.trainerId) || ["bulbasaur", "charmander", "squirtle"].every(family => entry.families.includes(family)),
        `ledger ${branch}[${index}] debe incluir la unión de las tres ramas starter.`);
      return { trainerId: entry.trainerId, families: [...entry.families] };
    });
    return [branch, normalized];
  }));
}

function normalizeCurrentLotTeams(currentLotTeams, ledgers, trainerId, lotId, catalogs) {
  invariant(exactKeys(currentLotTeams, BRANCHES), "currentLotTeams debe contener exactamente A, B y C.");
  return Object.fromEntries(BRANCHES.map(branch => {
    invariant(Array.isArray(currentLotTeams[branch]), `currentLotTeams.${branch} debe ser un array.`);
    const ledger = ledgers[branch];
    const normalized = currentLotTeams[branch].map((entry, index) => {
      const isRival = isParametricRivalTrainer(entry.trainerId, catalogs.policy);
      invariant(exactKeys(entry, ["trainerId", "profile", "publicationDigest", "acceptanceDigest", "members",
        ...(isRival ? ["playerStarterFamily", "rivalStarterFamily"] : [])]),
        `currentLotTeams.${branch}[${index}] tiene forma inválida.`);
      const assignment = catalogs.profileAssignments.records.find(row => row.id === entry.trainerId);
      invariant(assignment !== undefined && assignment.lotId === lotId && assignment.profile === entry.profile,
        `currentLotTeams.${branch}[${index}] no corresponde a D212/mismo lote.`);
      invariant(entry.trainerId !== trainerId, `currentLotTeams.${branch}[${index}] no puede contener el entrenador actual.`);
      invariant(/^[a-f0-9]{64}$/u.test(entry.publicationDigest) && /^[a-f0-9]{64}$/u.test(entry.acceptanceDigest),
        `currentLotTeams.${branch}[${index}] requiere digests hex64.`);
      invariant(Array.isArray(entry.members) && entry.members.length === 6
        && entry.members.every(member => member !== null && typeof member === "object" && typeof member.family === "string"),
      `currentLotTeams.${branch}[${index}] requiere seis miembros materializados con familia.`);
      const families = entry.members.map(member => member.family);
      invariant(new Set(families).size === 6, `currentLotTeams.${branch}[${index}] repite familias.`);
      const ledgerEntry = ledger.find(row => row.trainerId === entry.trainerId);
      invariant(ledgerEntry !== undefined && (isRival ? families.every(family => ledgerEntry.families.includes(family))
        : JSON.stringify(ledgerEntry.families) === JSON.stringify(families)),
        `currentLotTeams.${branch}[${index}] no coincide con el ledger homólogo aceptado.`);
      if (isRival) invariant(entry.rivalStarterFamily === rivalStarterFamilyForPlayer(entry.playerStarterFamily, catalogs.policy)
        && entry.members[5].family === entry.rivalStarterFamily
        && entry.members.slice(0, 5).every(member => !catalogs.policy.localStarterReservation.allRegionalStarterFamilyKeys.includes(member.family)),
      `currentLotTeams.${branch}[${index}] mapping o último starter incoherente.`);
      return structuredClone(entry);
    });
    invariant(new Set(ledger.map(row => row.trainerId)).size === ledger.length,
      `ledger ${branch} repite trainerId.`);
    for (const ledgerEntry of ledger) {
      const views = normalized.filter(row => row.trainerId === ledgerEntry.trainerId);
      const isRival = isParametricRivalTrainer(ledgerEntry.trainerId, catalogs.policy);
      invariant(views.length === (isRival ? 3 : 1), `currentLotTeams.${branch} debe cubrir cada party física aceptada exactamente una vez.`);
      if (isRival) {
        invariant(new Set(views.map(row => row.playerStarterFamily)).size === 3
          && views.every(row => JSON.stringify(row.members.slice(0, 5)) === JSON.stringify(views[0].members.slice(0, 5))
            && row.members[5].level === views[0].members[5].level
            && row.publicationDigest === views[0].publicationDigest && row.acceptanceDigest === views[0].acceptanceDigest),
        `currentLotTeams.${branch} rival requiere tres elecciones distintas y cinco miembros comunes idénticos.`);
        invariant(JSON.stringify([...new Set(views.flatMap(row => row.members.map(member => member.family)))].sort())
          === JSON.stringify([...ledgerEntry.families].sort()), `currentLotTeams.${branch} unión rival difiere del ledger.`);
      }
    }
    return [branch, normalized];
  }));
}

function familyUnions(variants) {
  const members = BRANCHES.flatMap(branch => variants[branch]);
  return {
    allFamilies: [...new Set(members.map(member => member.family))].sort(),
    competitiveFamilies: [...new Set(members.filter(member => member.akiRole === "K").map(member => member.family))].sort(),
  };
}

// The workflow verifies the complete publication chain before calling this
// adapter. This second boundary checks the immutable payload and derives only
// family/role evidence; creative sets never enter the next author's context.
export function withGymEvidence(catalogs, verifiedPublications) {
  invariant(Array.isArray(verifiedPublications), "D219 requiere un array de publicaciones verificadas.");
  invariant((catalogs.gymEvidence ?? []).length === 0, "D219 requiere catálogos base sin evidencia previa ligada.");
  const gymEvidence = verifiedPublications.flatMap(entry => {
    const payload = entry?.sealed?.payload;
    const trainerId = payload?.trainerId;
    const gymOrdinal = GYM_ORDER.indexOf(trainerId) + 1;
    if (gymOrdinal === 0 || payload?.trainer?.variants === undefined) return [];
    const variants = Object.fromEntries(BRANCHES.map(branch => [branch,
      (payload.trainer.variants[branch]?.members ?? []).map(member => ({ family: member.family, akiRole: member.akiRole }))]));
    if (BRANCHES.some(branch => variants[branch].length !== 6)) return [];
    const summary = {
      trainerId, gymOrdinal, artifactPath: entry.artifactPath,
      publicationDigest: entry.sealed.digest,
      ...familyUnions(variants),
    };
    return [{ ...summary, evidenceDigest: digest(summary) }];
  }).sort((left, right) => left.gymOrdinal - right.gymOrdinal);
  invariant(new Set(gymEvidence.map(row => row.trainerId)).size === gymEvidence.length,
    "D219 recibió evidencia duplicada para un gimnasio.");
  const sourceHashes = { ...catalogs.sourceHashes };
  for (const entry of verifiedPublications) sourceHashes[`publication-payload:${entry.artifactPath}`] = entry.sealed.digest;
  return Object.freeze({ ...catalogs, sourceHashes: Object.freeze(sourceHashes),
    sourceDigests: Object.freeze({ ...catalogs.sourceDigests, ...Object.fromEntries(verifiedPublications
      .map(entry => [`publication-payload:${entry.artifactPath}`, entry.sealed.digest])) }),
    gymEvidence: Object.freeze(gymEvidence) });
}

// The workflow has already authenticated the accepted-publication chain. This
// adapter binds the explicit (possibly empty) snapshot used by D222 and keeps
// its digest in the context source set.
export function withSpecialistEvidence(catalogs, acceptedPublications) {
  invariant(Array.isArray(acceptedPublications), "D222 requiere un snapshot explícito de publicaciones aceptadas.");
  invariant(catalogs.specialistEvidence === null, "D222 requiere catálogos base sin snapshot previo ligado.");
  const specialistEvidence = buildSpecialistRouteEvidence({
    graphs: catalogs.graphs,
    profileAssignments: catalogs.profileAssignments,
    acceptedPublications,
  });
  const evidenceDigest = digest(specialistEvidence);
  return Object.freeze({
    ...catalogs,
    sourceHashes: Object.freeze({ ...catalogs.sourceHashes, "specialist-acceptance-snapshot": evidenceDigest }),
    sourceDigests: Object.freeze({ ...catalogs.sourceDigests, "specialist-acceptance-snapshot": evidenceDigest }),
    specialistEvidence,
  });
}

function gymConstraints(trainerId, catalogs) {
  const ordinal = GYM_ORDER.indexOf(trainerId);
  if (ordinal < 0) return null;
  const evidence = catalogs.gymEvidence ?? [];
  for (const row of evidence) {
    const { evidenceDigest, ...summary } = row;
    invariant(evidenceDigest === digest(summary)
      && catalogs.sourceHashes[`publication-payload:${row.artifactPath}`] === row.publicationDigest,
    "D219 evidencia/digest de publicación manipulados.");
  }
  return {
    decisionId: "D-219", gymOrder: [...GYM_ORDER], gymOrdinal: ordinal + 1,
    semantics: "D219 inter-gym uses deduplicated U/K unions; D227 permits only registered A anchors to repeat within a gym, so all I/K families are disjoint across A/B/C.",
    prior: evidence.filter(row => row.gymOrdinal < ordinal + 1 && ordinal + 1 - row.gymOrdinal <= 2).map(row => ({ ...structuredClone(row),
      distance: ordinal + 1 - row.gymOrdinal,
      maximumKInvolvedOverlap: catalogs.policy.gymDistance.maximumKInvolvedOverlap[ordinal + 1 - row.gymOrdinal] })),
    futureSignatures: [1, 2].flatMap(distance => {
      const nextId = GYM_ORDER[ordinal + distance];
      if (!nextId) return [];
      const assignment = catalogs.profileAssignments.records.find(row => row.id === nextId);
      const signature = catalogs.bossSignatures.characters.find(row => row.bossIdentityId === assignment?.bossIdentityId);
      invariant(signature !== undefined, `D219 falta firma futura ${nextId}.`);
      return [{ trainerId: nextId, distance, signatureFamilies: expandedSignatureFamiliesForEncounter(signature, nextId, catalogs.policy),
        maximumKInvolvedOverlap: catalogs.policy.gymDistance.maximumKInvolvedOverlap[distance],
        teamComparisonStatus: "NEEDS_TEAM_REVIEW" }];
    }),
  };
}

export function gymDistanceFindings(context, variants) {
  if (context.gymDistanceConstraints === null) return { ...familyUnions(variants), errors: [], comparisons: [] };
  const own = familyUnions(variants);
  const errors = [];
  const comparisons = [];
  for (const prior of context.gymDistanceConstraints.prior) {
    const overlapFamilies = [...new Set([
      ...own.competitiveFamilies.filter(family => prior.allFamilies.includes(family)),
      ...own.allFamilies.filter(family => prior.competitiveFamilies.includes(family)),
    ])].sort();
    comparisons.push({ trainerId: prior.trainerId, distance: prior.distance, overlapFamilies,
      maximumKInvolvedOverlap: prior.maximumKInvolvedOverlap, publicationDigest: prior.publicationDigest,
      status: overlapFamilies.length <= prior.maximumKInvolvedOverlap ? "PASS" : "FAIL" });
    if (overlapFamilies.length > prior.maximumKInvolvedOverlap) errors.push({ code: "GYM_K_DISTANCE", path: "submission.variants",
      message: `D219 distancia ${prior.distance} con ${prior.trainerId}: ${overlapFamilies.join(", ")}; máximo ${prior.maximumKInvolvedOverlap}.` });
  }
  for (const future of context.gymDistanceConstraints.futureSignatures) {
    const overlapFamilies = own.competitiveFamilies.filter(family => future.signatureFamilies.includes(family));
    comparisons.push({ ...future, overlapFamilies,
      signatureConstraintStatus: overlapFamilies.length <= future.maximumKInvolvedOverlap ? "PASS" : "FAIL" });
    if (overlapFamilies.length > future.maximumKInvolvedOverlap) errors.push({ code: "GYM_FUTURE_SIGNATURE_K_DISTANCE", path: "submission.variants",
      message: `D219 firma futura ${future.trainerId}, distancia ${future.distance}: K usa ${overlapFamilies.join(", ")}; máximo ${future.maximumKInvolvedOverlap}.` });
  }
  return { ...own, errors, comparisons };
}

function specialistFutureAnchorFindings(context, variants) {
  const own = familyUnions(variants);
  const errors = [];
  const comparisons = [];
  for (const future of context.specialistDistanceConstraints?.comparisons ?? []) {
    const overlapFamilies = own.competitiveFamilies
      .filter(family => future.mandatoryAnchorFamilies.includes(family));
    const status = future.distance === null
      ? overlapFamilies.length <= 1 ? "PASS_ALL_DISTANCE_LIMITS" : "AMBIGUOUS"
      : overlapFamilies.length <= future.maximumKInvolvedOverlap ? "PASS" : "FAIL";
    comparisons.push({ ...structuredClone(future), overlapFamilies, status });
    if (["FAIL", "AMBIGUOUS"].includes(status)) errors.push({
      code: status === "FAIL" ? "SPECIALIST_FUTURE_ANCHOR_K_DISTANCE"
        : "SPECIALIST_ROUTE_DISTANCE_EVIDENCE_MISSING",
      path: "submission.variants",
      pairTrainerIds: [context.trainerId, future.trainerIds[0]],
      distance: future.distance,
      overlapFamilies,
      maximumKInvolvedOverlap: future.maximumKInvolvedOverlap,
      message: status === "FAIL"
        ? `D222 distancia ${future.distance} con anclas futuras de ${future.trainerIds.join("/")}: K usa ${overlapFamilies.join(", ")}; máximo ${future.maximumKInvolvedOverlap}.`
        : `D222 no puede certificar la distancia con ${future.trainerIds.join("/")} y ${overlapFamilies.length} solapes excederían el límite estricto de distancia uno; falta evidencia factual del par.`,
    });
  }
  return { ...own, comparisons, errors };
}

// Necessary-condition diagnostic only: absence of a proven conflict is not a
// proof that a complete party exists. Never picks a species, level or move set.
export function contextReadiness(context) {
  const errors = context.dataRequirements
    .filter(requirement => requirement.blockingPhase !== "PUBLICATION_GATE")
    .map(requirement => structuredClone(requirement));
  if (!context.windowRecurrence) errors.push({code:'WINDOW_CONTEXT_REQUIRED',path:'windowRecurrence'});
  else if(!context.windowRecurrence.admissionCertified&&context.windowRecurrence.assessment.excesses.length)
    errors.push({code:'WINDOW_ADMISSION_PROVENANCE_REQUIRED',path:'windowRecurrence'});
  if (isParametricRivalTrainer(context.trainerId, context.starterPolicy)) {
    for (const family of context.starterPolicy.reservedNpcFamilyKeys) {
      if ((context.legalMenu.starterSlot?.speciesByRivalFamily?.[family]?.length ?? 0) === 0) errors.push({
        code: "RIVAL_STARTER_LEGAL_FORM_MISSING", rivalStarterFamily: family,
        message: `D229 requiere una forma legal de ${family} en la ventana y niveles del encuentro; no se permite fallback.`,
      });
    }
  }
  const legalAnchorFamilies = context.canon.anchorOptions.filter(anchor => anchor.family === "$starter"
    ? context.starterPolicy.reservedNpcFamilyKeys.every(family =>
      (context.legalMenu.starterSlot?.speciesByRivalFamily?.[family]?.length ?? 0) > 0)
    : context.legalMenu.species.some(species => species.familyKey === anchor.family
      && Object.values(species.levels).some(level => level.anchorLegalFor.includes(anchor.family))))
    .map(anchor => anchor.family);
  if (context.composition !== null && legalAnchorFamilies.length < context.composition.anchorMinimum) {
    errors.push({
      code: "ANCHOR_LEGAL_FORM_MISSING",
      trainerId: context.trainerId,
      required: context.composition.anchorMinimum,
      available: legalAnchorFamilies.length,
      registeredFamilies: context.canon.anchorOptions.map(anchor => anchor.family),
      legalFamilies: legalAnchorFamilies,
      levelRange: { minimum: context.contract.minimumLevel, maximum: context.contract.maximumLevel },
      speciesHorizon: context.contract.horizons.species,
      evidence: structuredClone(context.anchorAvailabilityEvidence),
      message: `${context.trainerId} requiere al menos ${context.composition.anchorMinimum} familias A, pero sólo ${legalAnchorFamilies.length} tienen una forma legal en niveles/ventana.`,
    });
  }
  for (const fixed of context.composition?.fixedMembers ?? []) {
    const species = context.legalMenu.species.find(row => row.slug === fixed.species);
    const levels = species === undefined ? [] : Object.values(species.levels)
      .filter(level => level.standardLegal).map(level => level.level);
    if (levels.length === 0) errors.push({
      code: "FIXED_MEMBER_LEGAL_FORM_MISSING",
      trainerId: context.trainerId,
      decisionId: context.composition.encounterOverrideDecisionId,
      fixedMember: structuredClone(fixed),
      levelRange: { minimum: context.contract.minimumLevel, maximum: context.contract.maximumLevel },
      speciesHorizon: context.contract.horizons.species,
      message: `${fixed.species} es obligatorio como ${fixed.akiRole}, pero no tiene forma estándar legal en niveles/ventana.`,
    });
  }
  const forcedResources = [];
  const forcedAnchorSet = context.composition?.anchorMinimum === context.canon.anchorOptions.length
    ? context.canon.anchorOptions : [];
  for (const anchor of forcedAnchorSet) {
    const alternatives = context.legalMenu.species.filter(species => species.familyKey === anchor.family)
      .flatMap(species => Object.values(species.levels).filter(level => level.anchorLegalFor.includes(anchor.family)));
    if (alternatives.length === 0) continue;
    const forced = alternatives.map(level => {
      const reliable = level.moves.filter(move => move.reliable);
      if (reliable.length !== 1 || reliable[0].accesses.some(access => ["natural", "retained"].includes(access.method))) return null;
      return reliable[0].name;
    });
    if (forced[0] !== null && forced.every(resource => resource === forced[0])) {
      forcedResources.push({ family: anchor.family, resource: forced[0] });
    }
  }
  const resources = [...new Set(forcedResources.map(row => row.resource))];
  const maximum = context.legalMenu.movePolicy.machineTutorResourceCopiesPerParty;
  errors.push(...resources.flatMap(resource => {
    const families = forcedResources.filter(row => row.resource === resource).map(row => row.family);
    return families.length <= maximum ? [] : [{
      code: "REQUIRED_RELIABLE_RESOURCE_CONFLICT", resource, families,
      message: `${families.join(" / ")} requieren ${resource} como único ataque fiable en todas sus formas/niveles legales; ${families.length} usos obligatorios, máximo ${maximum}.`,
    }];
  }));
  const fixedAnchors = Object.fromEntries(BRANCHES.map(branch => [branch,
    forcedAnchorSet.map(anchor => ({ family: anchor.family, akiRole: "A" }))]));
  if (context.gymDistanceConstraints !== null) errors.push(...gymDistanceFindings(context, fixedAnchors).errors);
  const anchorFamilies = new Set([
    ...(isParametricRivalTrainer(context.trainerId, context.starterPolicy) ? context.starterPolicy.allRegionalStarterFamilyKeys : []),
    ...context.canon.anchorOptions.map(anchor => anchor.family),
    ...(context.composition?.fixedMembers ?? []).map(member => member.family),
  ]);
  const variableFamilies = [...new Set(context.legalMenu.species
    .filter(species => !anchorFamilies.has(species.familyKey)
      && Object.values(species.levels).some(level => level.standardLegal))
    .map(species => species.familyKey))].sort();
  const requiredVariableFamilies = context.composition?.variableFamiliesAcrossVariants === "DISJOINT"
    ? BRANCHES.length * (context.contract.partySize - context.composition.resolvedAnchorCount)
    : 0;
  if (requiredVariableFamilies > 0 && variableFamilies.length < requiredVariableFamilies) {
    errors.push({
      code: "INSUFFICIENT_DISJOINT_VARIABLE_FAMILIES",
      required: requiredVariableFamilies,
      available: variableFamilies.length,
      families: variableFamilies,
      message: `${context.composition.encounterOverrideDecisionId ?? "D227"} requiere ${requiredVariableFamilies} familias variables distintas entre A/B/C; el menú contiene sólo ${variableFamilies.length} familias fuera de los miembros fijos con alguna forma estándar legal. Es una condición necesaria, no una afirmación de factibilidad.`,
    });
  }
  return {
    status: errors.length ? "BLOCKED" : "NO_PROVEN_CONFLICT",
    errors,
    forcedResources,
    variableFamilyPool: {
      required: requiredVariableFamilies,
      available: variableFamilies.length,
      families: variableFamilies,
      semantics: "Necessary-condition upper pool only; role-dependent D219 constraints and complete-party feasibility are not inferred.",
    },
  };
}

function assertContextBindings(context, catalogs) {
  invariant(JSON.stringify(canonical(context.windowRecurrence)) === JSON.stringify(canonical({
    ...windowContext(catalogs.windowSnapshot,context.trainerId,context.windowId),lotId:context.lotId
  })), 'WINDOW_CONTEXT_BINDING_MISMATCH');
  const trainer = catalogs.graphs.encounterGraph.nodes.find(row => row.id === context.trainerId);
  const assignment = catalogs.profileAssignments.records.find(row => row.id === context.trainerId);
  const window = catalogs.plan.windows.find(row => row.batches.includes(trainer?.lotId));
  invariant(trainer && assignment && window, "contexto sin binding factual/D212/ventana.");
  invariant(JSON.stringify(canonical(context.gymEvidence)) === JSON.stringify(canonical(catalogs.gymEvidence ?? []))
    && JSON.stringify(canonical(context.gymDistanceConstraints)) === JSON.stringify(canonical(gymConstraints(context.trainerId, catalogs))),
    "contexto modificado: evidencia D219 no corresponde a las publicaciones ligadas.");
  invariant(JSON.stringify(canonical(context.specialistDistanceConstraints))
    === JSON.stringify(canonical(specialistFutureAnchorConstraints(context.trainerId, assignment, catalogs))),
  "contexto modificado: evidencia/reservas D222 no corresponden al snapshot ligado.");
  invariant(assignment.lotId === trainer.lotId && assignment.baselineProfile === trainer.profile,
    "contexto con binding D212 incoherente.");
  const expectedContract = assignment.profile === "PRÓLOGO"
    ? diagnosticPrologueContract(window.cap, window.ordinal, catalogs.policy)
    : buildProfileContract(assignment.profile, window.cap, window.ordinal, catalogs.policy, catalogs.plan.windows.length);
  const identity = catalogs.identity.trainers.find(row => row.logicalId === context.trainerId);
  const factual = factualCanon(identity, trainer, catalogs);
  const signature = signatureContract(context.trainerId, assignment, factual, catalogs);
  const canon = signature === null ? factual : { ...factual, anchorOptions: structuredClone(signature.anchors),
    ...(isParametricRivalTrainer(context.trainerId, catalogs.policy) ? { canonicalAce: { family: "$starter", species: "$starter" } } : {}) };
  const composition = assignment.profile === "PRÓLOGO" ? null
    : compositionContract(context.trainerId, assignment.profile, canon, catalogs.policy);
  const expectedLedgers = normalizeLedgers(context.ledgers);
  const expectedCurrentLotTeams = normalizeCurrentLotTeams(context.currentLotTeams, expectedLedgers,
    context.trainerId, assignment.lotId, catalogs);
  invariant(context.profile === assignment.profile && context.historicalProfile === assignment.baselineProfile
    && context.lotId === trainer.lotId && context.cap === window.cap && context.windowOrdinal === window.ordinal
    && context.windowId === window.id && (context.bossIdentity?.bossIdentityId ?? null) === (signature?.bossIdentityId ?? null)
    && JSON.stringify(context.physicalRecordConstants) === JSON.stringify(trainer.physicalBaseRecords)
    && JSON.stringify(canonical(context.contract)) === JSON.stringify(canonical(expectedContract))
    && JSON.stringify(canonical(context.profileAssignment)) === JSON.stringify(canonical({ decisionId: "D-212",
      trainerId: context.trainerId, lotId: assignment.lotId, profile: assignment.profile }))
    && JSON.stringify(canonical(context.bossIdentity)) === JSON.stringify(canonical(signature))
    && JSON.stringify(canonical(context.composition)) === JSON.stringify(canonical(composition))
    && JSON.stringify(canonical(context.ledgers)) === JSON.stringify(canonical(expectedLedgers))
    && JSON.stringify(canonical(context.lotFamilyUsage)) === JSON.stringify(canonical(lotFamilyUsage(expectedCurrentLotTeams)))
    && JSON.stringify(canonical(context.currentLotTeams)) === JSON.stringify(canonical(expectedCurrentLotTeams))
    && JSON.stringify(canonical(context.construction))
      === JSON.stringify(canonical(constructionContext(context.trainerId, assignment, catalogs, expectedCurrentLotTeams))),
  "contexto modificado: ID/perfil/contrato no corresponden a D212 y firmas.");
  const expectedStarterPolicy = starterPolicyContext(catalogs);
  invariant(JSON.stringify(canonical(context.canon)) === JSON.stringify(canonical(canon)), "contexto modificado: canon no corresponde al entrenador.");
  invariant(JSON.stringify(canonical(context.starterPolicy)) === JSON.stringify(canonical(expectedStarterPolicy)),
    "contexto modificado: política D229 no corresponde a policy/catálogos.");
  invariant(JSON.stringify(canonical(context.legalMenu)) === JSON.stringify(canonical(buildLegalMenu({
    contract: expectedContract, trainerId: context.trainerId, bossIdentity: signature,
  }, canon, catalogs))),
    "contexto modificado: menú legal no corresponde a los catálogos cargados.");
  invariant(JSON.stringify(canonical(context.anchorAvailabilityEvidence))
    === JSON.stringify(canonical(anchorAvailabilityEvidence(canon, expectedContract, catalogs, context.trainerId))),
  "contexto modificado: evidencia de disponibilidad de anclas no corresponde a los catálogos.");
  const requirements = contextDataRequirements({ trainerId: context.trainerId, assignment, window,
    contract: expectedContract, signature, catalogs });
  invariant(JSON.stringify(canonical(context.dataRequirements)) === JSON.stringify(canonical(requirements)),
    "contexto modificado: requisitos de datos no corresponden a las fuentes cargadas.");
}

export async function buildContext({
  projectRoot,
  trainerId,
  ledgers = { A: [], B: [], C: [] },
  currentLotTeams = { A: [], B: [], C: [] },
}, suppliedCatalogs = null) {
  const catalogs = suppliedCatalogs ?? await loadCatalogs(projectRoot);
  const trainer = catalogs.graphs.encounterGraph.nodes.find(({ id }) => id === trainerId);
  invariant(trainer !== undefined, `entrenador factual desconocido: ${trainerId}.`);
  const identity = catalogs.identity.trainers.find(({ logicalId }) => logicalId === trainerId);
  invariant(identity !== undefined, `falta identidad factual para ${trainerId}.`);
  invariant(identity.batchId === trainer.lotId, `${trainerId} discrepa entre grafo e identidad.`);
  const window = catalogs.plan.windows.find(({ batches }) => batches.includes(trainer.lotId));
  invariant(window !== undefined, `falta ventana para ${trainer.lotId}.`);
  const assignment = catalogs.profileAssignments.records.find(row => row.id === trainerId);
  invariant(assignment !== undefined, `${trainerId}: falta ID en registro D212; no existe fallback histórico.`);
  invariant(assignment.lotId === trainer.lotId && assignment.baselineProfile === trainer.profile
    && JSON.stringify(assignment.physicalBaseRecords) === JSON.stringify(trainer.physicalBaseRecords),
  `${trainerId}: D212 discrepa del ID/lote/bindings/perfil histórico.`);
  const gymDistanceConstraints = gymConstraints(trainerId, catalogs);
  const contract = assignment.profile === "PRÓLOGO"
    ? diagnosticPrologueContract(window.cap, window.ordinal, catalogs.policy)
    : buildProfileContract(assignment.profile, window.cap, window.ordinal, catalogs.policy, catalogs.plan.windows.length);
  const factual = factualCanon(identity, trainer, catalogs);
  const signature = signatureContract(trainerId, assignment, factual, catalogs);
  const canon = signature === null ? factual : { ...factual, anchorOptions: structuredClone(signature.anchors),
    ...(isParametricRivalTrainer(trainerId, catalogs.policy) ? { canonicalAce: { family: "$starter", species: "$starter" } } : {}) };
  const starterPolicy = starterPolicyContext(catalogs);
  invariant(signature === null || signature.bossIdentityId === starterPolicy.allowedTrainerIdentity
    || signature.anchors.every(anchor => !starterPolicy.reservedNpcFamilyKeys.includes(anchor.family)),
  `D229_RESERVED_STARTER_ANCHOR: ${trainerId} inyecta una familia Kanto reservada.`);
  for (const anchor of (signature?.anchors ?? []).filter(a => a.origin === "factual")) {
    invariant(factual.anchorOptions.some(a => a.family === anchor.family && a.floorSpecies === anchor.floorSpecies),
      `${trainerId}: firma factual no coincide con evidencia original.`);
  }
  const bossReviewContext = signature === null ? null : {
    globalSignatures: catalogs.bossSignatures.characters
      .map(character => expandedSignatureCharacter(character, catalogs.policy)),
    neighbors: signature.neighborTrainerIds.map(id => {
      const assignment = catalogs.profileAssignments.records.find(row => row.id === id);
      const neighbor = catalogs.bossSignatures.characters.find(row => row.bossIdentityId === assignment.bossIdentityId);
      const symbolicSignatureFamilies = signatureFamiliesForEncounter(neighbor, id);
      const expandedSignatureFamilies = expandedSignatureFamiliesForEncounter(neighbor, id, catalogs.policy);
      return { trainerId: id, bossIdentityId: assignment.bossIdentityId,
        signatureFamilies: expandedSignatureFamilies,
        ...(JSON.stringify(symbolicSignatureFamilies) === JSON.stringify(expandedSignatureFamilies)
          ? {} : { symbolicSignatureFamilies: [...symbolicSignatureFamilies], starterExpansionDecisionId: "D-229" }),
        comparisonStatus: "NEEDS_TEAM_REVIEW", reason: "Equipo vecino no incorporado; firma sola no valida variedad de equipo/comodines." };
    }),
    legendaryAssignments: structuredClone(catalogs.bossSignatures.legendaryAssignments),
    pending: structuredClone(catalogs.bossSignatures.pending),
  };
  const composition = assignment.profile === "PRÓLOGO" ? null
    : compositionContract(trainerId, assignment.profile, canon, catalogs.policy);
  const dataRequirements = contextDataRequirements({ trainerId, assignment, window, contract, signature, catalogs });
  const specialistDistanceConstraints = specialistFutureAnchorConstraints(trainerId, assignment, catalogs);
  const normalizedLedgers = normalizeLedgers(ledgers);
  const normalizedCurrentLotTeams = normalizeCurrentLotTeams(currentLotTeams, normalizedLedgers,
    trainerId, assignment.lotId, catalogs);
  const base = {
    schemaVersion: 1,
    engineId: ENGINE_ID,
    policyId: POLICY_ID,
    trainerId,
    name: trainer.displayName,
    trainerClass: identity.wikiTrainerClass,
    battleRole: trainer.battleRole,
    profile: assignment.profile,
    historicalProfile: assignment.baselineProfile,
    profileAssignment: { decisionId: "D-212", trainerId, lotId: assignment.lotId, profile: assignment.profile },
    bossIdentity: structuredClone(signature),
    gymEvidence: structuredClone(catalogs.gymEvidence ?? []),
    gymDistanceConstraints,
    specialistDistanceConstraints,
    bossReviewContext,
    composition,
    dataRequirements,
    starterPolicy,
    lotId: trainer.lotId,
    windowId: window.id,
    windowOrdinal: window.ordinal,
    cap: window.cap,
    location: structuredClone(trainer.location),
    physicalRecordConstants: [...trainer.physicalBaseRecords],
    identity: {
      summary: identity.identity.summary,
      archetypes: structuredClone(identity.identity.archetypes),
      explicitDialogueSignals: structuredClone(identity.identity.explicitDialogueSignals),
      originalParties: identity.engineRecords.map((record) => ({
        recordConstant: record.constant,
        members: record.party.map(({ slug, family, level }) => ({ slug, family, level })),
      })),
    },
    canon,
    anchorAvailabilityEvidence: anchorAvailabilityEvidence(canon, contract, catalogs, trainerId),
    contract,
    construction: constructionContext(trainerId, assignment, catalogs, normalizedCurrentLotTeams),
    allProfileContracts: Object.fromEntries(Object.keys(catalogs.policy.profiles).map((profile) => [
      profile,
      buildProfileContract(profile, window.cap, window.ordinal, catalogs.policy, catalogs.plan.windows.length),
    ])),
    ledgers: normalizedLedgers,
    lotFamilyUsage: lotFamilyUsage(normalizedCurrentLotTeams),
    currentLotTeams: normalizedCurrentLotTeams,
    sourceHashes: structuredClone(catalogs.sourceHashes),
    sourceDigests: structuredClone(catalogs.sourceDigests),
    reviewRequirements: structuredClone(catalogs.policy.optimization.qualitativeReviewRequired),
  };
  const legalMenu = buildLegalMenu(base, canon, catalogs);
  for (const anchor of canon.anchorOptions.filter(row => row.exactSpecies !== undefined)) {
    const exactSpecies = legalMenu.species.find(row => row.slug === anchor.exactSpecies);
    invariant(exactSpecies !== undefined && exactSpecies.familyKey === anchor.family
      && Object.values(exactSpecies.levels).some(level => level.anchorLegalFor.includes(anchor.family)),
    `${trainerId}: la especie exacta ${anchor.exactSpecies} no es legal como ancla en la ventana.`);
  }
  const payload = { ...base, legalMenu, windowRecurrence: {
    ...windowContext(catalogs.windowSnapshot,trainerId,window.id),lotId:trainer.lotId
  } };
  return Object.freeze({ ...payload, contextId: digest(payload) });
}

function itemMaterialError(item, member, selectedMoves, nature) {
  const effect = item.effect ?? {};
  if (Array.isArray(effect.requiresSpecies) && !effect.requiresSpecies.includes(member.species)) {
    return `${item.name} no aporta a ${member.species}.`;
  }
  if (effect.requiresDamagingMove && !selectedMoves.some((move) => (
    move.statBasedDamage && (effect.type === undefined || move.type === effect.type)
  ))) return `${item.name} no potencia un movimiento dañino compatible.`;
  if (effect.requiresCompatibleNature && nature?.lowers === effect.dislikedStat) {
    return `${item.name} contradice la naturaleza elegida.`;
  }
  if (!["flat-heal", "status-cure", "passive-heal"].includes(effect.kind)
    && !(effect.kind === "pp-restore" && effect.requiresPpPressure)
    && !effect.requiresSpecies
    && !effect.requiresDamagingMove
    && !effect.requiresCompatibleNature) {
    return `${item.name} usa un efecto sin aporte material demostrado (${effect.kind ?? "desconocido"}).`;
  }
  return null;
}

function classifyMove(move) {
  const effect = move.effect;
  return {
    reliableDamage: move.reliable,
    stabDamage: move.stab,
    priority: move.priority > 0,
    recovery: /RESTORE_HP|ABSORB/u.test(effect),
    control: /SLEEP|PARALYZE|POISON|BURN|FREEZE|CONFUSE|_DOWN/u.test(effect),
    setup: /_UP|BULK_UP|DRAGON_DANCE/u.test(effect) && move.damageClass === "status",
  };
}

export function diagnosticsForMembers(members) {
  const result = {
    reliableDamageMembers: 0,
    stabDamageMembers: 0,
    recoveryMoves: 0,
    controlMoves: 0,
    setupMoves: 0,
    priorityMoves: 0,
    damagingTypes: [],
  };
  const types = new Set();
  for (const member of members) {
    const classifications = member.moves.map(classifyMove);
    if (classifications.some(({ reliableDamage }) => reliableDamage)) result.reliableDamageMembers += 1;
    if (classifications.some(({ stabDamage }) => stabDamage)) result.stabDamageMembers += 1;
    result.recoveryMoves += classifications.filter(({ recovery }) => recovery).length;
    result.controlMoves += classifications.filter(({ control }) => control).length;
    result.setupMoves += classifications.filter(({ setup }) => setup).length;
    result.priorityMoves += classifications.filter(({ priority }) => priority).length;
    member.moves.filter(move => isDamaging(move) && move.type !== null).forEach(({ type }) => types.add(type));
  }
  result.damagingTypes = [...types].sort();
  return result;
}

function findSpeciesMenu(context, slug) {
  return context.legalMenu.species.find(({ slug: candidate }) => candidate === slug) ?? null;
}

function findMoveLevel(speciesMenu, level) {
  return speciesMenu?.levels?.[level] ?? speciesMenu?.levels?.[String(level)] ?? null;
}

function sharedCount(left, right) {
  const rightSet = new Set(right);
  return left.filter((family) => rightSet.has(family)).length;
}

function addShapeError(errors, pathLabel, expected) {
  errors.push({
    code: "UNKNOWN_OR_MISSING_FIELD",
    path: pathLabel,
    message: `${pathLabel} debe contener exactamente ${expected.join(", ")}.`,
  });
}

export function validateSubmission(context, submission, catalogs) {
  invariant(context?.engineId === ENGINE_ID && context?.policyId === POLICY_ID, "contexto ajeno al engine v33.");
  invariant(context.schemaVersion === 1, "schemaVersion de contexto inválida.");
  const { contextId, ...contextPayload } = context;
  invariant(contextId === digest(contextPayload), "contexto modificado después de su construcción.");
  invariant(catalogs?.policy?.engineId === ENGINE_ID, "catálogos ajenos al engine v19.");
  assertContextBindings(context, catalogs);
  invariant(
    JSON.stringify(context.sourceHashes) === JSON.stringify(catalogs.sourceHashes),
    "contexto construido con otras fuentes.",
  );
  if (isParametricRivalTrainer(context.trainerId, catalogs.policy)) return validateWindowResult(context, validateRivalSubmission(context, submission, catalogs));
  if (context.bossIdentity?.bossIdentityId === "rival") return {
    ok: false, status: "FAIL", errors: [{ code: "RIVAL_D229_ENGINE_ADAPTER_REQUIRED", path: "submission",
      message: "D243 habilita únicamente rival-route-22; este encuentro requiere su contrato específico." }],
    warnings: [], normalized: null, evidence: {},
  };
  return validateWindowResult(context, validatePhysicalSubmission(context, submission, catalogs));
}

function validateWindowResult(context, result) {
  if (!result.ok) return result;
  const window = windowFindings(context.windowRecurrence,result.normalized.variants);
  return {...result,ok:window.errors.length===0,status:window.errors.length?'FAIL':result.status,
    errors:[...result.errors,...window.errors],warnings:[...result.warnings,...window.warnings],evidence:{...result.evidence,windowRecurrence:window.audit}};
}

// Private projection only: every public entry first verifies the original sealed context.
function validatePhysicalSubmission(context, submission, catalogs) {
  const errors = [];
  const warnings = [];
  const add = (code, pathLabel, message) => errors.push({ code, path: pathLabel, message });
  const reservedNpcFamilies = new Set(context.starterPolicy.reservedNpcFamilyKeys);
  const localStarterReservationApplies = context.bossIdentity?.bossIdentityId
    !== context.starterPolicy.allowedTrainerIdentity;
  if (!exactKeys(submission, ["trainerId", "variants"])) {
    addShapeError(errors, "submission", ["trainerId", "variants"]);
    return { ok: false, status: "FAIL", errors, warnings, normalized: null, evidence: {} };
  }
  if (submission.trainerId !== context.trainerId) {
    add("TRAINER_ID", "submission.trainerId", `se esperaba ${context.trainerId}.`);
  }
  if (!exactKeys(submission.variants, BRANCHES)) {
    addShapeError(errors, "submission.variants", BRANCHES);
    return { ok: false, status: "FAIL", errors, warnings, normalized: null, evidence: {} };
  }
  const normalizedVariants = {};
  const variantFamilies = {};
  const variantAnchors = {};
  const variantVariableMembers = {};
  const variantDiagnostics = {};
  const memberKeys = ["species", "level", "akiRole", "moves", "nature", "ability", "item", "intent"];
  for (const branch of BRANCHES) {
    const branchPath = `submission.variants.${branch}`;
    const variant = submission.variants[branch];
    if (!exactKeys(variant, ["members", "strategy", "orderRationale",...(Object.hasOwn(variant??{},'identityQuotaException')?['identityQuotaException']:[])])) {
      addShapeError(errors, branchPath, ["members", "strategy", "orderRationale"]);
      continue;
    }
    if (typeof variant.strategy !== "string" || variant.strategy.trim().length === 0) {
      add("STRATEGY_REQUIRED", `${branchPath}.strategy`, "se requiere una estrategia explícita.");
    }
    if (typeof variant.orderRationale !== "string" || variant.orderRationale.trim().length === 0) {
      add("ORDER_RATIONALE_REQUIRED", `${branchPath}.orderRationale`, "se requiere razón del orden táctico.");
    }
    if (!Array.isArray(variant.members) || variant.members.length !== context.contract.partySize) {
      add("PARTY_SIZE", `${branchPath}.members`, "la party debe contener exactamente seis miembros.");
      continue;
    }
    const normalizedMembers = [];
    const families = [];
    const anchors = [];
    const machineOwners = new Map();
    const uniqueItems = new Set();
    let equipped = 0;
    let kCount = 0;
    let structurallyComplete = true;
    for (const [index, member] of variant.members.entries()) {
      const memberPath = `${branchPath}.members[${index}]`;
      if (!exactKeys(member, memberKeys)) {
        addShapeError(errors, memberPath, memberKeys);
        structurallyComplete = false;
        continue;
      }
      if (typeof member.species !== "string") add("SPECIES_SHAPE", `${memberPath}.species`, "species debe ser slug.");
      if (!Number.isInteger(member.level)) add("LEVEL_SHAPE", `${memberPath}.level`, "level debe ser entero.");
      if (!["A", "I", "K"].includes(member.akiRole)) add("AKI_ROLE", `${memberPath}.akiRole`, "akiRole debe ser A, I o K.");
      if (member.akiRole === "K") kCount += 1;
      if (!Array.isArray(member.moves)) add("MOVES_SHAPE", `${memberPath}.moves`, "moves debe ser un array.");
      if (typeof member.nature !== "string") add("NATURE_SHAPE", `${memberPath}.nature`, "nature debe ser texto.");
      if (typeof member.ability !== "string") add("ABILITY_SHAPE", `${memberPath}.ability`, "ability debe ser texto.");
      if (member.item !== null && typeof member.item !== "string") add("ITEM_SHAPE", `${memberPath}.item`, "item debe ser texto o null.");
      if (!Array.isArray(member.intent) || member.intent.length === 0
        || !member.intent.every((entry) => typeof entry === "string" && entry.trim().length > 0)) {
        add("INTENT_REQUIRED", `${memberPath}.intent`, "intent debe ser un array no vacío de textos.");
      }
      const species = catalogs.indexes.pokedexBySlug.get(member.species);
      const family = species === undefined ? null : catalogs.indexes.familyById.get(species.familyId);
      if (species === undefined || family === undefined) {
        add("SPECIES_UNKNOWN", `${memberPath}.species`, `especie desconocida ${member.species}.`);
        structurallyComplete = false;
        continue;
      }
      if (localStarterReservationApplies && reservedNpcFamilies.has(family.familyKey)) {
        add("D229_RESERVED_STARTER_FAMILY", `${memberPath}.species`,
          `${member.species} pertenece a ${family.familyKey}, familia Kanto reservada al jugador/rival en todos los roles A/I/K.`);
      }
      families.push(family.familyKey);
      if (member.akiRole === "A") anchors.push(family.familyKey);
      if (member.level < context.contract.minimumLevel || member.level > context.contract.maximumLevel) {
        add(
          "LEVEL_OUT_OF_RANGE",
          `${memberPath}.level`,
          `nivel ${member.level}; rango ${context.contract.minimumLevel}..${context.contract.maximumLevel}.`,
        );
      }
      const speciesMenu = findSpeciesMenu(context, member.species);
      const levelMenu = findMoveLevel(speciesMenu, member.level);
      if (speciesMenu === null || levelMenu === null) {
        add("FORM_OR_LEVEL_ILLEGAL", `${memberPath}.species`, `${member.species} no es forma legal al nivel ${member.level}.`);
        structurallyComplete = false;
        continue;
      }
      const isAnchor = member.akiRole === "A";
      if (isAnchor && !levelMenu.anchorLegalFor.includes(family.familyKey)) {
        add("ANCHOR_NOT_REGISTERED_OR_FORM_ILLEGAL", `${memberPath}.akiRole`, `${family.familyKey} no es ancla registrada legal en esa forma.`);
      }
      if (!isAnchor && !levelMenu.standardLegal) {
        add("FORM_REQUIRES_ANCHOR", `${memberPath}.species`, `${member.species} requiere el piso factual de un ancla A.`);
      }
      const legalAbilities = speciesMenu.abilities;
      if (!legalAbilities.includes(member.ability)) {
        add("ABILITY_ILLEGAL", `${memberPath}.ability`, `${member.ability} no es habilidad legal de ${member.species}.`);
      }
      const selectedNames = Array.isArray(member.moves) ? member.moves : [];
      if (selectedNames.length < catalogs.policy.moves.minimum
        || selectedNames.length > catalogs.policy.moves.maximum) {
        add("MOVE_COUNT", `${memberPath}.moves`, "se requieren entre uno y cuatro movimientos.");
      }
      if (new Set(selectedNames).size !== selectedNames.length) {
        add("MOVE_DUPLICATE", `${memberPath}.moves`, "los movimientos deben ser distintos.");
      }
      if (selectedNames.length >= catalogs.policy.moves.minimum && selectedNames.length < levelMenu.recommendedMoveCount) {
        warnings.push({ code: "SHORT_MOVESET_REQUIRES_REVIEW", path: `${memberPath}.moves`,
          message: `Se recomiendan ${levelMenu.recommendedMoveCount} movimientos; justificar los huecos por función/pool/recursos, no gastar una MT sólo para rellenar.` });
      }
      const moveByName = new Map(levelMenu.moves.map((move) => [move.name, move]));
      const selectedMoves = [];
      for (const moveName of selectedNames) {
        const move = moveByName.get(moveName);
        if (move === undefined) {
          add("MOVE_ILLEGAL", `${memberPath}.moves`, `${moveName} no es legal/material para ${member.species}.`);
          continue;
        }
        selectedMoves.push(move);
        if (!move.accesses.some(({ method }) => method === "natural" || method === "retained")) {
          const owners = machineOwners.get(move.name) ?? [];
          owners.push(index + 1);
          machineOwners.set(move.name, owners);
        }
      }
      const reliablePool = levelMenu.moves.filter(({ reliable }) => reliable);
      const reliableStabPool = reliablePool.filter(({ stab }) => stab);
      const requiresReliableSupport = selectedMoves.some(move =>
        catalogs.policy.moves.requiresReliableSupportEffects.includes(move.effect));
      if ((reliablePool.length > 0 || requiresReliableSupport) && !selectedMoves.some(({ reliable }) => reliable)) {
        add("RELIABLE_MOVE_OMITTED", `${memberPath}.moves`, requiresReliableSupport
          ? "el movimiento elegido exige un ataque fiable de respaldo en el set."
          : "se omitió todo ataque fiable disponible.");
      }
      if (reliableStabPool.length > 0 && !selectedMoves.some(({ reliable, stab }) => reliable && stab)) {
        warnings.push({ code: "RELIABLE_STAB_OMITTED", path: `${memberPath}.moves`,
          message: "Se omitió todo STAB fiable disponible; el Corrector debe justificar la función y el coste de recursos." });
      }
      if (levelMenu.moves.some(isDamaging) && !selectedMoves.some(isDamaging)) {
        add("DAMAGING_MOVE_OMITTED", `${memberPath}.moves`, "se omitió todo movimiento dañino disponible.");
      }
      const undominatedCount = levelMenu.moves.filter(({ dominatedBy }) => dominatedBy === null).length;
      if (undominatedCount >= levelMenu.recommendedMoveCount) {
        for (const move of selectedMoves.filter(({ dominatedBy }) => dominatedBy !== null)) {
          warnings.push({
            code: "DOMINATED_MOVE_REQUIRES_REVIEW",
            path: `${memberPath}.moves`,
            message: `${move.name} parece dominado por ${move.dominatedBy}; el Corrector debe revisar efecto, PP y función antes de conservarlo.`,
          });
        }
      }
      const nature = Object.hasOwn(catalogs.policy.natureEffects, member.nature)
        ? catalogs.policy.natureEffects[member.nature]
        : undefined;
      if (nature === undefined) {
        add("NATURE_UNKNOWN", `${memberPath}.nature`, `${member.nature} no es una naturaleza Gen III.`);
      } else {
        if (!nature.raises || !nature.lowers) {
          warnings.push({
            code: "NEUTRAL_NATURE_REQUIRES_REVIEW",
            path: `${memberPath}.nature`,
            message: `${member.nature} es neutral; el Corrector debe confirmar que es óptima para el set completo.`,
          });
        }
        const fixedDamageEffects = new Set([...catalogs.policy.moves.fixedDamageEffects, ...catalogs.policy.moves.specialDamageEffects]);
        const damageClasses = new Set(selectedMoves
          .filter(move => isDirectDamage(move, fixedDamageEffects))
          .map(({ damageClass }) => damageClass));
        if (damageClasses.size === 1 && damageClasses.has("physical") && nature.lowers === "Attack") {
          warnings.push({
            code: "NATURE_SET_FIT_REQUIRES_REVIEW",
            path: `${memberPath}.nature`,
            message: `${member.nature} reduce la única ofensiva física directa usada; el Corrector debe confirmar que la función global lo justifica.`,
          });
        }
        if (damageClasses.size === 1 && damageClasses.has("special") && nature.lowers === "Sp. Atk") {
          warnings.push({
            code: "NATURE_SET_FIT_REQUIRES_REVIEW",
            path: `${memberPath}.nature`,
            message: `${member.nature} reduce la única ofensiva especial directa usada; el Corrector debe confirmar que la función global lo justifica.`,
          });
        }
      }
      let item = null;
      if (member.item !== null) {
        equipped += 1;
        item = context.legalMenu.heldItems.find(({ name }) => name === member.item) ?? null;
        if (item === null) {
          add("ITEM_ILLEGAL_OR_OUT_OF_HORIZON", `${memberPath}.item`, `${member.item} no está permitido en este horizonte.`);
        } else {
          const materialError = itemMaterialError(item, member, selectedMoves, nature);
          if (materialError !== null) add("ITEM_NOT_MATERIAL", `${memberPath}.item`, materialError);
          if (item.effect?.kind === "pp-restore" && item.effect.requiresPpPressure) {
            warnings.push({ code: "ITEM_PP_PRESSURE_REQUIRES_REVIEW", path: `${memberPath}.item`,
              message: `${item.name}: justificar movimientos/PP y duración prevista; no asumir aporte por estar equipada.` });
          }
          {
            if (uniqueItems.has(item.name)) add("ITEM_UNIQUE_REUSED", `${memberPath}.item`, `${item.name} no puede repetirse.`);
            uniqueItems.add(item.name);
          }
        }
      }
      const effortValues = effortValuesForEncounter(context.trainerId, member.species, catalogs.policy);
      const effective = nature === undefined || !Number.isInteger(member.level) || member.level < 1 || member.level > 100 ? null : effectiveStats({
        baseStats: species.baseStats,
        level: member.level,
        iv: context.contract.iv,
        effortValues,
        nature,
      });
      normalizedMembers.push({
        slot: index + 1,
        family: family.familyKey,
        species: member.species,
        speciesName: species.name,
        region: species.region,
        types: [...species.types],
        availabilityWindow: structuredClone(speciesMenu.availabilityWindow),
        level: member.level,
        akiRole: member.akiRole,
        moves: selectedMoves,
        nature: { name: member.nature, ...(nature ?? {}) },
        effortValues,
        effectiveStats: effective,
        ability: member.ability,
        abilityOptions: [...legalAbilities],
        item,
        intent: structuredClone(member.intent),
      });
    }
    if (!isLegalLevelVector(context.contract, variant.members.map((member) => member?.level))) {
      add(
        "LEVEL_VECTOR",
        `${branchPath}.members`,
        `los niveles deben sumar ${context.contract.levelTotal} dentro de ${context.contract.minimumLevel}..${context.contract.maximumLevel}.`,
      );
    }
    if (families.length === 6 && new Set(families).size !== 6) {
      add("FAMILY_DUPLICATE", `${branchPath}.members`, "una party debe usar seis familias distintas.");
    }
    if (kCount !== context.composition.competitiveRoles) {
      add("AKI_K_COUNT", `${branchPath}.members`, `se exigen exactamente ${context.composition.competitiveRoles} roles K.`);
    }
    const uniqueAnchors = [...new Set(anchors)].sort();
    if (anchors.length !== uniqueAnchors.length || uniqueAnchors.length < context.composition.anchorMinimum
      || uniqueAnchors.length > context.composition.anchorMaximum) {
      add("AKI_ANCHOR_COUNT", `${branchPath}.members`, `se exigen ${context.composition.anchorMinimum}..${context.composition.anchorMaximum} familias A distintas para este entrenador.`);
    }
    const registeredAnchors = new Set(context.canon.anchorOptions.map(a => a.family));
    const fixedRevisionAnchors=context.windowRecurrence.revisionAdmission?.fixedAnchors?.[branch];
    if(fixedRevisionAnchors&&JSON.stringify(normalizedMembers.filter(m=>m.akiRole==='A').map(m=>({family:m.family,species:m.species})).sort((a,b)=>a.family.localeCompare(b.family)))
      !==JSON.stringify(fixedRevisionAnchors))add('QUALITY_ANCHOR_CHANGED',`${branchPath}.members`,'La revisión conserva exactamente familias y especies A vigentes.');
    if (!uniqueAnchors.every(family => registeredAnchors.has(family))) {
      add("ANCHOR_NOT_IN_CANON", `${branchPath}.members`, "Toda familia A debe proceder de las opciones de Canon factuales/registradas.");
    }
    if (context.profile === "JEFE"
      && JSON.stringify(uniqueAnchors) !== JSON.stringify([...registeredAnchors].sort())) {
      add("REQUIRED_BOSS_ANCHORS", `${branchPath}.members`, "Deben estar todas las anclas registradas del Jefe con rol A.");
    }
    for (const fixed of context.composition.fixedMembers) {
      const matches = variant.members.filter(member => member?.species === fixed.species
        && member?.akiRole === fixed.akiRole);
      if (matches.length !== 1) {
        add("FIXED_MEMBER_REQUIRED", `${branchPath}.members`,
          `${fixed.species} debe aparecer exactamente una vez con rol ${fixed.akiRole}.`);
      }
    }
    const iCount = variant.members.filter((member) => member?.akiRole === "I").length;
    const expectedIdentityRoles = 4 - uniqueAnchors.length;
    if (iCount !== expectedIdentityRoles) {
      add("AKI_I_COUNT", `${branchPath}.members`, `se exigen exactamente ${expectedIdentityRoles} roles I (I=4−A).`);
    }
    if (equipped > context.contract.maxHeldItems) {
      add("ITEM_BUDGET", `${branchPath}.members`, `usa ${equipped} objetos; máximo ${context.contract.maxHeldItems}.`);
    }
    for (const [move, owners] of machineOwners) {
      if (owners.length > catalogs.policy.moves.machineTutorResourceCopiesPerParty) {
        add("MACHINE_RESOURCE_REUSED", `${branchPath}.members`, `${move} consume el recurso en slots ${owners.join(", ")}.`);
      }
    }
    if (context.canon.canonicalAce !== null && structurallyComplete && normalizedMembers.length === 6) {
      const ace = normalizedMembers.at(-1);
      if (!isLegalAceFloor({ floorSpecies: context.canon.canonicalAce.species,
        family: context.canon.canonicalAce.family, species: ace.species, level: ace.level, contract: context.contract,
        trainerId: context.trainerId }, catalogs)) {
        add(
          "ACE_FLOOR_AND_LAST",
          `${branchPath}.members[5]`,
          `el último slot debe conservar familia y piso ${context.canon.canonicalAce.species}, o descendencia legal de la misma rama.`,
        );
      }
    }
    if (families.length === 6) {
      const local=lotFamilyRecurrenceFindings(context.currentLotTeams, branch, context.trainerId, normalizedMembers,context.windowRecurrence.revisionAdmission);
      errors.push(...applyIdentityQuotaException({...variant,members:normalizedMembers},branch,local,{requireExcess:false}).errors);
      const updatedTeams = { ...context.currentLotTeams, [branch]: [...context.currentLotTeams[branch],
        { trainerId: context.trainerId, members: normalizedMembers }] };
      // D259: prior legal owners remain. These are numerical notices, not
      // instructions to repair previously published I/K after adding canon A.
      warnings.push(...lotFamilyGlobalFindings(updatedTeams).filter(row => row.branch === branch).map(row=>({
        ...row,code:'LOT_FAMILY_NUMERICAL_OVERFLOW_PUBLISHED_PRESERVED',
        message:`${row.family}: exceso numérico; los propietarios publicados permanecen. Sólo los I/K nuevos se controlan al admitirlos.`})));
      for (const prior of context.ledgers[branch]) {
        const shared = sharedCount(families, prior.families);
        if (shared > catalogs.policy.party.maximumSharedFamiliesWithPriorLotTrainer) {
          add(
            "LEDGER_FAMILY_OVERLAP",
            `${branchPath}.members`,
            `comparte ${shared} familias con ${prior.trainerId}; máximo 2.`,
          );
        }
      }
    }
    normalizedVariants[branch] = {
      ...(variant.identityQuotaException===undefined?{}:{identityQuotaException:structuredClone(variant.identityQuotaException)}),
      strategy: variant.strategy,
      orderRationale: variant.orderRationale,
      members: normalizedMembers,
    };
    variantFamilies[branch] = families;
    variantAnchors[branch] = uniqueAnchors;
    variantVariableMembers[branch] = normalizedMembers.filter(member => member.akiRole === "I" || member.akiRole === "K");
    variantDiagnostics[branch] = diagnosticsForMembers(normalizedMembers);
  }
  if (BRANCHES.every((branch) => variantAnchors[branch] !== undefined)) {
    const signature = JSON.stringify(variantAnchors.A);
    for (const branch of ["B", "C"]) {
      if (JSON.stringify(variantAnchors[branch]) !== signature) {
        add("ANCHORS_DIFFER_BETWEEN_VARIANTS", `submission.variants.${branch}`, "A/B/C deben conservar las mismas anclas registradas.");
      }
    }
  }
  for (const [left, right] of [["A", "B"], ["A", "C"], ["B", "C"]]) {
    if (variantFamilies[left]?.length !== 6 || variantFamilies[right]?.length !== 6) continue;
    const differences = 6 - sharedCount(variantFamilies[left], variantFamilies[right]);
    if (differences < context.composition.minimumFamilyDifferencesBetweenVariants) {
      add("VARIANT_FAMILY_DISTANCE", `submission.variants.${left}/${right}`, `${left}/${right} cambian sólo ${differences} familias; mínimo ${context.composition.minimumFamilyDifferencesBetweenVariants}.`);
    }
  }
  const variableUses = new Map();
  for (const branch of BRANCHES) {
    for (const member of variantVariableMembers[branch] ?? []) {
      const uses = variableUses.get(member.family) ?? [];
      uses.push({ branch, role: member.akiRole, species: member.species, slot: member.slot });
      variableUses.set(member.family, uses);
    }
  }
  for (const [family, uses] of variableUses) {
    if (context.composition.variableFamiliesAcrossVariants !== "DISJOINT") continue;
    if (new Set(uses.map(use => use.branch)).size < 2) continue;
    const occurrences = uses.map(use => `${use.role} en ${use.branch} slot ${use.slot} (${use.species})`).join("; ");
    add(
      "D227_VARIABLE_FAMILY_REUSED",
      "submission.variants",
      `D227 sólo permite repetir entre A/B/C las ${context.composition.resolvedAnchorCount} familias ancla A registradas; la familia variable ${family} aparece como ${occurrences}. Las ${BRANCHES.length * (context.contract.partySize - context.composition.resolvedAnchorCount)} familias I/K deben ser distintas por familia evolutiva, aunque cambie el rol o la especie.`,
    );
  }
  const starterTripletQuota = starterTripletQuotaFindings(normalizedVariants, catalogs.policy);
  errors.push(...starterTripletQuota.errors);
  const gymDistance = BRANCHES.every(branch => normalizedVariants[branch]?.members.length === 6)
    ? gymDistanceFindings(context, Object.fromEntries(BRANCHES.map(branch => [branch, normalizedVariants[branch].members])))
    : { errors: [], comparisons: [] };
  errors.push(...gymDistance.errors);
  const normalizedMemberVariants = Object.fromEntries(BRANCHES.map(branch => [branch,
    normalizedVariants[branch]?.members ?? []]));
  const specialistDistance = context.profile === "ESPECIALISTA" && catalogs.specialistEvidence !== null
    && BRANCHES.every(branch => normalizedMemberVariants[branch].length === 6)
    ? specialistDistanceFindings(catalogs.specialistEvidence, context.trainerId, normalizedMemberVariants)
    : { errors: [], comparisons: [] };
  errors.push(...specialistDistance.errors);
  const specialistFutureAnchors = context.profile === "ESPECIALISTA"
    && BRANCHES.every(branch => normalizedMemberVariants[branch].length === 6)
    ? specialistFutureAnchorFindings(context, normalizedMemberVariants)
    : { errors: [], comparisons: [] };
  errors.push(...specialistFutureAnchors.errors);
  const ok = errors.length === 0;
  return {
    ok,
    status: ok ? "PASS" : "FAIL",
    errors,
    warnings,
    normalized: ok ? { trainerId: submission.trainerId, variants: normalizedVariants } : null,
    evidence: { diagnostics: variantDiagnostics, bossNeighbors: structuredClone(context.bossReviewContext?.neighbors ?? []), gymDistance,
      specialistDistance, specialistFutureAnchors, starterTripletQuota,
      publicationRequirements: structuredClone(context.dataRequirements.filter(row => row.blockingPhase === "PUBLICATION_GATE")) },
  };
}

function validateRivalSubmission(context, submission, catalogs) {
  const errors = [];
  const fail = (code, path, message) => errors.push({ code, path, message });
  const families = context.starterPolicy.reservedNpcFamilyKeys;
  const setKeys = ["species", "moves", "nature", "ability", "item", "intent"];
  if (!exactKeys(submission, ["trainerId", "variants"]) || !exactKeys(submission.variants, BRANCHES)) {
    fail("RIVAL_TEMPLATE_SHAPE", "submission", "Se requieren exactamente trainerId y tres plantillas A/B/C.");
  } else {
    if (submission.trainerId !== context.trainerId) fail("TRAINER_ID", "submission.trainerId", "ID incompatible con el contexto.");
    for (const branch of BRANCHES) {
      const variant = submission.variants[branch];
      const at = `submission.variants.${branch}`;
      if (!exactKeys(variant, ["members", "strategy", "orderRationale",...(Object.hasOwn(variant??{},'identityQuotaException')?['identityQuotaException']:[])])
        || !Array.isArray(variant.members) || variant.members.length !== 6) {
        fail("RIVAL_TEMPLATE_SHAPE", at, "Cada plantilla requiere cinco miembros comunes y un slot starter final.");
        continue;
      }
      const slot = variant.members[5];
      if (!exactKeys(slot, ["family", "level", "akiRole", "starterSets"])
        || slot.family !== "$starter" || slot.akiRole !== "A"
        || !Number.isInteger(slot.level) || !exactKeys(slot.starterSets, families)) {
        fail("RIVAL_STARTER_SLOT", `${at}.members[5]`, "El último slot debe ser $starter A con nivel común y tres sets por familia Kanto.");
        continue;
      }
      for (const family of families) {
        const set = slot.starterSets[family];
        if (!exactKeys(set, setKeys)) {
          fail("RIVAL_STARTER_SET_SHAPE", `${at}.members[5].starterSets.${family}`,
            "El set específico lleva species/moves/nature/ability/item/intent; nivel y rol pertenecen al slot común.");
        } else if (!(context.legalMenu.starterSlot?.speciesByRivalFamily?.[family] ?? [])
          .some(row => row.species === set.species && row.legalLevels.includes(slot.level))) {
          fail("RIVAL_STARTER_SPECIES", `${at}.members[5].starterSets.${family}.species`,
            `La especie debe pertenecer a ${family} y ser una forma legal al nivel compartido del slot.`);
        }
      }
      for (const [index, member] of variant.members.slice(0, 5).entries()) {
        const species = catalogs.indexes.pokedexBySlug.get(member?.species);
        const family = species === undefined ? null : catalogs.indexes.familyById.get(species.familyId)?.familyKey;
        if (member?.family === "$starter" || context.starterPolicy.allRegionalStarterFamilyKeys.includes(family)) {
          fail("RIVAL_COMMON_STARTER_FORBIDDEN", `${at}.members[${index}]`, "Los cinco miembros comunes no pueden contener ninguna familia starter regional.");
        }
      }
    }
  }
  if (errors.length) return { ok: false, status: "FAIL", errors, warnings: [], normalized: null, evidence: {} };
  const results = {};
  const warnings = [];
  for (const playerFamily of families) {
    const rivalFamily = rivalStarterFamilyForPlayer(playerFamily, catalogs.policy);
    const projected = structuredClone(context);
    projected.canon.anchorOptions = projected.canon.anchorOptions.map(anchor => anchor.family === "$starter"
      ? { family: rivalFamily, origin: "factual", floorSpecies: rivalFamily } : anchor);
    projected.canon.canonicalAce = { family: rivalFamily, species: rivalFamily };
    for (const species of projected.legalMenu.species.filter(row => row.familyKey === rivalFamily)) {
      for (const level of Object.values(species.levels)) {
        if (level.standardLegal) level.anchorLegalFor = [rivalFamily];
      }
    }
    const physical = { trainerId: submission.trainerId, variants: Object.fromEntries(BRANCHES.map(branch => {
      const variant = submission.variants[branch];
      const slot = variant.members[5];
      return [branch, { ...variant, members: [...variant.members.slice(0, 5), {
        ...slot.starterSets[rivalFamily], level: slot.level, akiRole: slot.akiRole,
      }] }];
    })) };
    const result = validatePhysicalSubmission(projected, physical, catalogs);
    const annotate = finding => ({ ...finding,
      path: (finding.path ?? "submission").replace(/submission\.variants\.([ABC])(?=\.|\/|$)/,
        `submission.variants.$1.branches.${playerFamily}`),
      playerStarterFamily: playerFamily, rivalStarterFamily: rivalFamily,
    });
    errors.push(...result.errors.map(annotate));
    warnings.push(...result.warnings.map(annotate));
    results[playerFamily] = result;
  }
  if (errors.length) return { ok: false, status: "FAIL", errors, warnings, normalized: null, evidence: {} };
  const variants = Object.fromEntries(BRANCHES.map(branch => {
    const template = submission.variants[branch];
    const branches = Object.fromEntries(families.map(playerFamily => [playerFamily, {
      playerStarterFamily: playerFamily,
      rivalStarterFamily: rivalStarterFamilyForPlayer(playerFamily, catalogs.policy),
      members: results[playerFamily].normalized.variants[branch].members,
      diagnostics: results[playerFamily].evidence.diagnostics[branch],
    }]));
    const starterSets = Object.fromEntries(Object.values(branches).map(row => [row.rivalStarterFamily, row.members[5]]));
    return [branch, {
      strategy: template.strategy, orderRationale: template.orderRationale,
      ...(template.identityQuotaException===undefined?{}:{identityQuotaException:structuredClone(template.identityQuotaException)}),
      members: [...branches[families[0]].members.slice(0, 5), {
        family: "$starter", slot: 6, level: template.members[5].level, akiRole: "A", starterSets,
      }],
      branches,
    }];
  }));
  return { ok: true, status: "PASS", errors: [], warnings,
    normalized: { trainerId: submission.trainerId, variants },
    evidence: {
      diagnostics: Object.fromEntries(BRANCHES.map(branch => [branch, {
        parametricTemplate: true,
        branches: Object.fromEntries(families.map(family => [family, variants[branch].branches[family].diagnostics])),
      }])),
      physicalBranches: Object.fromEntries(families.map(family => [family, results[family].evidence])),
      publicationRequirements: structuredClone(context.dataRequirements.filter(row => row.blockingPhase === "PUBLICATION_GATE")),
    },
  };
}

export function materialize(context, submission, catalogs) {
  const validation = validateSubmission(context, submission, catalogs);
  if (!validation.ok) {
    const error = new Error(`BETA4_SUBMISSION_INVALID: ${validation.errors.length} hallazgo(s).`);
    error.code = "BETA4_SUBMISSION_INVALID";
    error.findings = validation.errors;
    throw error;
  }
  const variants = Object.fromEntries(BRANCHES.map((branch) => [branch, {
    strategy: validation.normalized.variants[branch].strategy,
    orderRationale: validation.normalized.variants[branch].orderRationale,
    members: validation.normalized.variants[branch].members,
    ...(validation.normalized.variants[branch].identityQuotaException===undefined?{}:{identityQuotaException:structuredClone(validation.normalized.variants[branch].identityQuotaException)}),
    diagnostics: validation.evidence.diagnostics[branch],
    ...(validation.normalized.variants[branch].branches === undefined ? {} : {
      branches: validation.normalized.variants[branch].branches,
      parametricTemplate: true,
    }),
  }]));
  const payload = {
    schemaVersion: 1,
    generatorId: ENGINE_ID,
    policyId: POLICY_ID,
    trainerId: context.trainerId,
    name: context.name,
    trainerClass: context.trainerClass,
    profile: context.profile,
    cap: context.cap,
    windowId: context.windowId,
    lotId: context.lotId,
    iv: context.contract.iv,
    aiProfile: [...context.contract.aiProfile],
    contextId: context.contextId,
    sourceHashes: structuredClone(context.sourceHashes),
    sourceDigests: structuredClone(context.sourceDigests),
    variants,
  };
  return { ...payload, materializationId: digest(payload) };
}
