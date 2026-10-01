const BRANCHES = Object.freeze(["A", "B", "C"]);

function invariant(condition, message) {
  if (!condition) throw new Error(`D229 starter policy: ${message}`);
}

function clone(value) {
  return structuredClone(value);
}

function policyContract(policy) {
  const contract = policy?.localStarterReservation ?? policy;
  const reserved = contract?.reservedNpcFamilyKeys;
  const mapping = contract?.playerToRivalFamily;
  invariant(contract?.decisionId === "D-229", "decisionId inválido.");
  invariant(Array.isArray(reserved) && reserved.length === 3 && new Set(reserved).size === 3,
    "se requieren exactamente tres familias locales reservadas.");
  invariant(Array.isArray(contract.allRegionalStarterFamilyKeys)
    && contract.allRegionalStarterFamilyKeys.length === 9
    && new Set(contract.allRegionalStarterFamilyKeys).size === 9
    && reserved.every(family => contract.allRegionalStarterFamilyKeys.includes(family)),
  "se requieren las nueve familias starter regionales para proteger los cinco slots comunes del rival.");
  invariant(mapping && typeof mapping === "object" && !Array.isArray(mapping), "falta mapping jugador→rival.");
  invariant(JSON.stringify(Object.keys(mapping).sort()) === JSON.stringify([...reserved].sort()),
    "el mapping debe cubrir exactamente las tres elecciones del jugador.");
  invariant(JSON.stringify(mapping) === JSON.stringify({ bulbasaur: "charmander", charmander: "squirtle", squirtle: "bulbasaur" }),
    "mapping ventajoso Kanto divergente.");
  invariant(new Set(Object.values(mapping)).size === 3
    && Object.values(mapping).every(family => reserved.includes(family)),
  "el mapping rival debe ser una permutación de las tres familias reservadas.");
  invariant(contract.allowedTrainerIdentity === "rival", "la única identidad NPC autorizada debe ser rival.");
  const template = contract.rivalTemplates;
  invariant(JSON.stringify(template?.editorialVariants) === JSON.stringify(BRANCHES)
    && template?.commonMembersPerTemplate === 5
    && template?.symbolicStarterSlotsPerTemplate === 1
    && template?.symbolicFamily === "$starter"
    && template?.physicalBranchesPerSelectedTemplate === 3
    && template?.starterSets === "SPECIFIC_PER_RIVAL_FAMILY"
    && template?.materializeSelectedTemplateOnly === true
    && template?.authoringEnabled === true
    && JSON.stringify(template?.authorableTrainerIds) === JSON.stringify(["rival-route-22", "rival-cerulean"]),
  "contrato de tres plantillas rivales inválido.");
  return contract;
}

export function validateStarterPolicy(policy) {
  return clone(policyContract(policy));
}

export function parametricRivalTrainerIds(policy) {
  return [...policyContract(policy).rivalTemplates.authorableTrainerIds];
}

export function isParametricRivalTrainer(trainerId, policy) {
  return parametricRivalTrainerIds(policy).includes(trainerId);
}

export function validateStarterTripletQuota(policy) {
  const expected = { decisionId: "D-251", scope: "ALL_TRAINERS_ACROSS_ABC", maximumOccurrences: 1,
    countedRoles: ["I", "K"], canonicalAnchorsExempt: true, unit: "MEMBER_OCCURRENCE_NOT_DISTINCT_FAMILY" };
  if (JSON.stringify(policy?.starterTripletQuota) !== JSON.stringify(expected)) throw new Error("contrato D251 inválido.");
  return clone(expected);
}

// Input members are normalized by the engine: family comes from the species catalog,
// never from an actor-supplied family label. Canon/composition validates A separately.
export function starterTripletQuotaFindings(variants, policy) {
  const quota = validateStarterTripletQuota(policy);
  const families = new Set(policy.localStarterReservation.allRegionalStarterFamilyKeys);
  const occurrences = BRANCHES.flatMap(branch => (variants[branch]?.members ?? []).flatMap((member, index) =>
    quota.countedRoles.includes(member.akiRole) && families.has(member.family)
      ? [{ branch, slot: index + 1, species: member.species, family: member.family, role: member.akiRole }] : []));
  return { decisionId: quota.decisionId, maximumOccurrences: quota.maximumOccurrences, occurrences,
    errors: occurrences.length > quota.maximumOccurrences ? [{ code: "D251_STARTER_TRIPLET_QUOTA",
      path: "submission.variants", message: `D251: ${occurrences.length} usos I/K starter entre A/B/C; máximo 1 ocurrencia total, incluidas evoluciones.` }] : [] };
}

export function rivalStarterFamilyForPlayer(playerFamily, policy) {
  const contract = policyContract(policy);
  const rivalFamily = contract.playerToRivalFamily[playerFamily];
  invariant(typeof rivalFamily === "string", `elección local desconocida: ${playerFamily}.`);
  return rivalFamily;
}

export function expandStarterFamilies(families, policy) {
  const contract = policyContract(policy);
  invariant(Array.isArray(families), "families debe ser un array.");
  const expanded = families.flatMap(family => family === contract.rivalTemplates.symbolicFamily
    ? contract.reservedNpcFamilyKeys : [family]);
  invariant(new Set(expanded).size === expanded.length, "la expansión produce familias duplicadas.");
  return expanded;
}

// This helper expands exactly one already-selected editorial template. It does
// not select A/B/C, bind an encounter, choose an evolution or authorize rival
// authoring. Callers must provide the three species-specific starter sets.
export function materializeSelectedRivalTemplate(template, policy, { familyForSpecies } = {}) {
  const contract = policyContract(policy);
  invariant(typeof familyForSpecies === "function", "familyForSpecies es obligatorio para validar especies.");
  invariant(template && typeof template === "object" && !Array.isArray(template), "template debe ser objeto.");
  invariant(BRANCHES.includes(template.templateId), "templateId debe ser A, B o C.");
  invariant(Array.isArray(template.members) && template.members.length === 6, "la plantilla debe tener seis slots.");
  const symbolic = template.members
    .map((member, index) => ({ member, index }))
    .filter(({ member }) => member?.family === contract.rivalTemplates.symbolicFamily);
  invariant(symbolic.length === 1, "la plantilla debe tener un único slot $starter.");
  invariant(template.members.length - symbolic.length === contract.rivalTemplates.commonMembersPerTemplate,
    "la plantilla debe tener cinco miembros comunes.");
  const { member: starterSlot, index: starterIndex } = symbolic[0];
  const expectedFamilies = [...contract.reservedNpcFamilyKeys].sort();
  invariant(starterSlot.starterSets && typeof starterSlot.starterSets === "object"
    && !Array.isArray(starterSlot.starterSets)
    && JSON.stringify(Object.keys(starterSlot.starterSets).sort()) === JSON.stringify(expectedFamilies),
  "el slot $starter requiere un set específico por cada familia rival Kanto.");
  for (const family of expectedFamilies) {
    const set = starterSlot.starterSets[family];
    invariant(set && typeof set === "object" && !Array.isArray(set), `falta set específico para ${family}.`);
    invariant(set.family === undefined, `el set específico ${family} no debe redefinir family.`);
    invariant(typeof set.species === "string" && set.species.length > 0,
      `el set específico ${family} no declara species.`);
    invariant(familyForSpecies(set.species) === family,
      `la especie ${set.species} no pertenece a la familia ${family}.`);
    invariant(Array.isArray(set.moves) && set.moves.length > 0,
      `el set específico ${family} no declara movimientos.`);
  }
  const commonMembers = template.members.filter((_, index) => index !== starterIndex);
  invariant(commonMembers.every(member => member && typeof member === "object" && !Array.isArray(member)
    && typeof member.family === "string" && typeof member.species === "string"
    && familyForSpecies(member.species) === member.family
    && member.family !== contract.rivalTemplates.symbolicFamily), "miembro común inválido o especie/familia incoherente.");
  invariant(new Set(commonMembers.map(member => member.family)).size === commonMembers.length,
    "los cinco miembros comunes deben usar familias distintas.");
  invariant(commonMembers.every(member => !contract.allRegionalStarterFamilyKeys.includes(member.family)),
    "los cinco miembros comunes no pueden agregar otra familia starter; el único starter es $starter.");
  const branches = Object.fromEntries(contract.reservedNpcFamilyKeys.map(playerStarterFamily => {
    const rivalStarterFamily = rivalStarterFamilyForPlayer(playerStarterFamily, contract);
    const members = template.members.map((member, index) => index === starterIndex
      ? { family: rivalStarterFamily, ...clone(starterSlot.starterSets[rivalStarterFamily]) }
      : clone(member));
    return [playerStarterFamily, {
      playerStarterFamily,
      rivalStarterFamily,
      members,
    }];
  }));
  return {
    templateId: template.templateId,
    selectedTemplateOnly: true,
    physicalBranchCount: Object.keys(branches).length,
    commonMemberCount: commonMembers.length,
    requiresDownstreamLegalityValidation: true,
    branches,
  };
}
