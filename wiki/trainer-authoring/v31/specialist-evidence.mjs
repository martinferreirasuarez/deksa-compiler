const BRANCHES = Object.freeze(["A", "B", "C"]);
const USABLE_ROUTE_RELATIONS = new Set(["access", "completion", "optional-access"]);

function invariant(condition, message) {
  if (!condition) throw new Error(`D222 specialist evidence: ${message}`);
}

function nonempty(value) {
  return typeof value === "string" && value.length > 0;
}

function uniqueSorted(values) {
  return [...new Set(values)].sort();
}

function normalizeVariants(variants, label) {
  invariant(variants !== null && typeof variants === "object" && !Array.isArray(variants),
    `${label}: variants debe ser un objeto A/B/C.`);
  const normalized = {};
  for (const branch of BRANCHES) {
    const members = Array.isArray(variants[branch]) ? variants[branch] : variants[branch]?.members;
    invariant(Array.isArray(members), `${label}: falta variants.${branch}.members.`);
    normalized[branch] = members.map((member, index) => {
      invariant(member !== null && typeof member === "object" && nonempty(member.family),
        `${label}: variants.${branch}.members[${index}] no tiene family.`);
      invariant(nonempty(member.akiRole),
        `${label}: variants.${branch}.members[${index}] no tiene akiRole.`);
      return { family: member.family, akiRole: member.akiRole };
    });
  }
  return normalized;
}

function familyUnions(variants, label = "candidate") {
  const normalized = normalizeVariants(variants, label);
  const members = BRANCHES.flatMap(branch => normalized[branch]);
  return {
    allFamilies: uniqueSorted(members.map(member => member.family)),
    competitiveFamilies: uniqueSorted(members.filter(member => member.akiRole === "K")
      .map(member => member.family)),
  };
}

function kInvolvedOverlap(left, right) {
  return uniqueSorted([
    ...left.competitiveFamilies.filter(family => right.allFamilies.includes(family)),
    ...left.allFamilies.filter(family => right.competitiveFamilies.includes(family)),
  ]);
}

function routeKey(leftIdentityId, rightIdentityId) {
  return [leftIdentityId, rightIdentityId].sort().join("\u0000");
}

function playableEdge(edge) {
  return edge?.classification !== "editorial" && nonempty(edge?.from) && nonempty(edge?.to);
}

function exactRouteEdge(edge) {
  return playableEdge(edge) && USABLE_ROUTE_RELATIONS.has(edge.relation) && edge.mode !== "allOf";
}

function enumeratePaths(outgoing, from, to) {
  const paths = [];
  const visit = (lotId, lots, edges, seen) => {
    if (lotId === to) {
      paths.push({ lots, edges });
      return;
    }
    for (const edge of outgoing.get(lotId) ?? []) {
      if (seen.has(edge.to)) continue;
      visit(edge.to, [...lots, edge.to], [...edges, edge], new Set(seen).add(edge.to));
    }
  };
  visit(from, [from], [], new Set([from]));
  return paths;
}

function sourceGraphDigest(profileAssignments) {
  const source = profileAssignments.sources?.find(row =>
    row.path === "wiki/trainer-authoring/v7/graphs/graphs.generated.json");
  return nonempty(source?.sha256) ? `sha256:${source.sha256}` : null;
}

function routeEvidence(graphs, profileAssignments) {
  const assignments = profileAssignments.records;
  const assignmentById = new Map(assignments.map(row => [row.id, row]));
  const encounterNodes = graphs.encounterGraph.nodes;
  const encounterById = new Map(encounterNodes.map((node, sourceIndex) => [node.id, { ...node, sourceIndex }]));
  invariant(encounterById.size === encounterNodes.length, "encounterGraph contiene IDs duplicados.");

  const specialistRows = assignments.filter(row => row.profile === "ESPECIALISTA");
  for (const row of specialistRows) {
    const encounter = encounterById.get(row.id);
    invariant(encounter !== undefined && encounter.lotId === row.lotId,
      `${row.id}: D212 y encounterGraph discrepan.`);
  }

  const continuityByTrainer = new Map();
  for (const line of graphs.continuityGraph?.lines ?? []) {
    if (line.kind !== "same-character") continue;
    invariant(nonempty(line.id) && Array.isArray(line.members), "línea same-character inválida.");
    for (const trainerId of line.members) {
      if (assignmentById.get(trainerId)?.profile !== "ESPECIALISTA") continue;
      invariant(!continuityByTrainer.has(trainerId),
        `${trainerId}: pertenece a más de una línea same-character.`);
      continuityByTrainer.set(trainerId, line.id);
    }
  }

  const identityIdForTrainer = trainerId => continuityByTrainer.has(trainerId)
    ? `same-character:${continuityByTrainer.get(trainerId)}`
    : `trainer:${trainerId}`;
  const occurrences = specialistRows.map(row => {
    const encounter = encounterById.get(row.id);
    return {
      trainerId: row.id,
      identityId: identityIdForTrainer(row.id),
      lotId: row.lotId,
      localIndex: encounter.sourceIndex,
    };
  });
  const occurrencesByLot = new Map();
  for (const occurrence of occurrences) {
    if (!occurrencesByLot.has(occurrence.lotId)) occurrencesByLot.set(occurrence.lotId, []);
    occurrencesByLot.get(occurrence.lotId).push(occurrence);
  }
  for (const rows of occurrencesByLot.values()) rows.sort((left, right) => left.localIndex - right.localIndex);

  const identitiesById = new Map();
  for (const occurrence of occurrences) {
    if (!identitiesById.has(occurrence.identityId)) identitiesById.set(occurrence.identityId, {
      identityId: occurrence.identityId,
      profile: "ESPECIALISTA",
      trainerIds: [],
      lotIds: [],
      occurrences: [],
    });
    const identity = identitiesById.get(occurrence.identityId);
    identity.trainerIds.push(occurrence.trainerId);
    identity.lotIds.push(occurrence.lotId);
    identity.occurrences.push({ trainerId: occurrence.trainerId, lotId: occurrence.lotId,
      localIndex: occurrence.localIndex });
  }
  const identities = [...identitiesById.values()].map(identity => ({
    ...identity,
    trainerIds: uniqueSorted(identity.trainerIds),
    lotIds: uniqueSorted(identity.lotIds),
    occurrences: identity.occurrences.sort((left, right) => left.localIndex - right.localIndex),
  })).sort((left, right) => left.identityId.localeCompare(right.identityId));

  const exactEdges = graphs.playableGraph.factualEdges.filter(exactRouteEdge);
  const factualEdges = graphs.playableGraph.factualEdges.filter(playableEdge);
  const outgoing = edges => {
    const result = new Map();
    for (const edge of edges) {
      if (!result.has(edge.from)) result.set(edge.from, []);
      result.get(edge.from).push(edge);
    }
    for (const rows of result.values()) rows.sort((left, right) =>
      left.to.localeCompare(right.to) || left.relation.localeCompare(right.relation));
    return result;
  };
  const exactOutgoing = outgoing(exactEdges);
  const factualOutgoing = outgoing(factualEdges);

  function identitiesAlong(path, source, target) {
    const rows = [];
    for (let index = 0; index < path.lots.length; index += 1) {
      const lotId = path.lots[index];
      for (const occurrence of occurrencesByLot.get(lotId) ?? []) {
        if (index === 0 && occurrence.localIndex <= source.localIndex) continue;
        if (index === path.lots.length - 1 && occurrence.localIndex >= target.localIndex) continue;
        if (occurrence.identityId === source.identityId || occurrence.identityId === target.identityId) continue;
        rows.push(occurrence.identityId);
      }
    }
    return uniqueSorted(rows);
  }

  function possibleRoutes(source, target, graph) {
    if (source.lotId === target.lotId) {
      if (source.localIndex >= target.localIndex) return [];
      return [{ lots: [source.lotId], edges: [] }];
    }
    return enumeratePaths(graph, source.lotId, target.lotId);
  }

  function compareIdentities(left, right) {
    const candidates = [];
    let factualRouteExists = false;
    for (const sourceIdentity of [left, right]) {
      const targetIdentity = sourceIdentity === left ? right : left;
      for (const source of sourceIdentity.occurrences) {
        for (const target of targetIdentity.occurrences) {
          const sourceOccurrence = { ...source, identityId: sourceIdentity.identityId };
          const targetOccurrence = { ...target, identityId: targetIdentity.identityId };
          if (possibleRoutes(sourceOccurrence, targetOccurrence, factualOutgoing).length > 0) factualRouteExists = true;
          for (const path of possibleRoutes(sourceOccurrence, targetOccurrence, exactOutgoing)) {
            const betweenIdentityIds = identitiesAlong(path, sourceOccurrence, targetOccurrence);
            candidates.push({
              sourceIdentityId: sourceIdentity.identityId,
              targetIdentityId: targetIdentity.identityId,
              sourceTrainerId: source.trainerId,
              targetTrainerId: target.trainerId,
              distance: betweenIdentityIds.length + 1,
              betweenIdentityIds,
              routeLotIds: path.lots,
              routeEdges: path.edges.map(edge => ({ from: edge.from, to: edge.to, relation: edge.relation,
                ...(edge.requirementGroup === undefined ? {} : { requirementGroup: edge.requirementGroup }),
                ...(edge.mode === undefined ? {} : { mode: edge.mode }) })),
            });
          }
        }
      }
    }
    candidates.sort((a, b) => a.distance - b.distance
      || a.routeLotIds.join("/").localeCompare(b.routeLotIds.join("/"))
      || a.sourceTrainerId.localeCompare(b.sourceTrainerId)
      || a.targetTrainerId.localeCompare(b.targetTrainerId));
    if (candidates.length > 0) {
      const best = candidates[0];
      return {
        pairIdentityIds: [left.identityId, right.identityId].sort(),
        status: "RECOVERED",
        distance: best.distance,
        maximumKInvolvedOverlap: best.distance <= 2 ? best.distance : null,
        minimumRouteCount: candidates.filter(candidate => candidate.distance === best.distance).length,
        evidence: best,
      };
    }
    const openOrderFact = (graphs.playableGraph.openOrderFacts ?? []).find(fact =>
      left.lotIds.some(lotId => fact.lots?.includes(lotId))
      && right.lotIds.some(lotId => fact.lots?.includes(lotId)));
    return {
      pairIdentityIds: [left.identityId, right.identityId].sort(),
      status: "AMBIGUOUS",
      distance: null,
      maximumKInvolvedOverlap: null,
      ambiguityCode: factualRouteExists
        ? "MIXED_LOT_OR_CONJUNCTIVE_ROUTE_NOT_RESOLVED"
        : "SPECIALIST_ORDER_NOT_RESOLVED_BY_FACTUAL_GRAPH",
      ...(openOrderFact === undefined ? {} : { openOrderFact: structuredClone(openOrderFact) }),
    };
  }

  const comparisons = [];
  for (let left = 0; left < identities.length; left += 1) {
    for (let right = left + 1; right < identities.length; right += 1) {
      comparisons.push(compareIdentities(identities[left], identities[right]));
    }
  }
  return { identities, comparisons, identityIdForTrainer };
}

export function buildSpecialistRouteEvidence({ graphs, profileAssignments, acceptedPublications } = {}) {
  invariant(graphs !== null && typeof graphs === "object" && nonempty(graphs.graphId),
    "falta graphId del grafo factual.");
  invariant(Array.isArray(graphs.playableGraph?.factualEdges)
    && Array.isArray(graphs.playableGraph?.openOrderFacts)
    && Array.isArray(graphs.encounterGraph?.nodes), "grafo factual incompleto.");
  invariant(profileAssignments !== null && typeof profileAssignments === "object"
    && Array.isArray(profileAssignments.records), "faltan profileAssignments.records.");
  invariant(Array.isArray(acceptedPublications),
    "acceptedPublications debe ser un snapshot explícito; [] representa evidencia ligada sin aceptados.");

  const routes = routeEvidence(graphs, profileAssignments);
  const identityByTrainer = new Map(routes.identities.flatMap(identity =>
    identity.trainerIds.map(trainerId => [trainerId, identity])));
  const seenAcceptedTrainerIds = new Set();
  const acceptedEvidence = acceptedPublications.flatMap((entry, index) => {
    invariant(entry !== null && typeof entry === "object", `acceptedPublications[${index}] inválido.`);
    invariant(nonempty(entry.trainerId), `acceptedPublications[${index}] no tiene trainerId.`);
    invariant(!seenAcceptedTrainerIds.has(entry.trainerId), `${entry.trainerId}: aceptación duplicada.`);
    seenAcceptedTrainerIds.add(entry.trainerId);
    const identity = identityByTrainer.get(entry.trainerId);
    if (identity === undefined) return [];
    invariant(nonempty(entry.publicationDigest) && nonempty(entry.acceptanceDigest),
      `${entry.trainerId}: faltan publicationDigest/acceptanceDigest.`);
    const variants = entry.variants ?? entry.trainer?.variants;
    return [{
      trainerId: entry.trainerId,
      identityId: identity.identityId,
      lotId: profileAssignments.records.find(row => row.id === entry.trainerId)?.lotId ?? null,
      publicationDigest: entry.publicationDigest,
      acceptanceDigest: entry.acceptanceDigest,
      ...familyUnions(variants, `acceptedPublications[${index}]`),
    }];
  }).sort((left, right) => left.identityId.localeCompare(right.identityId)
    || left.trainerId.localeCompare(right.trainerId));

  const acceptedByIdentity = new Map();
  for (const row of acceptedEvidence) {
    if (!acceptedByIdentity.has(row.identityId)) acceptedByIdentity.set(row.identityId, []);
    acceptedByIdentity.get(row.identityId).push(row);
  }
  const acceptedIdentities = [...acceptedByIdentity.entries()].map(([identityId, rows]) => ({
    identityId,
    trainerId: rows[0].trainerId,
    trainerIds: rows.map(row => row.trainerId),
    allFamilies: uniqueSorted(rows.flatMap(row => row.allFamilies)),
    competitiveFamilies: uniqueSorted(rows.flatMap(row => row.competitiveFamilies)),
    publicationDigests: rows.map(row => row.publicationDigest),
    acceptanceDigests: rows.map(row => row.acceptanceDigest),
  })).sort((left, right) => left.identityId.localeCompare(right.identityId));

  const acceptedIds = new Set(acceptedIdentities.map(row => row.identityId));
  const acceptedIdentityById = new Map(acceptedIdentities.map(row => [row.identityId, row]));
  const requirements = routes.comparisons.flatMap(comparison => {
    if (comparison.status !== "AMBIGUOUS"
      || !comparison.pairIdentityIds.every(identityId => acceptedIds.has(identityId))) return [];
    const [left, right] = comparison.pairIdentityIds.map(identityId => acceptedIdentityById.get(identityId));
    const overlapFamilies = kInvolvedOverlap(left, right);
    if (overlapFamilies.length <= 1) return [];
    return [{
      code: "SPECIALIST_ROUTE_DISTANCE_EVIDENCE_MISSING",
      pairIdentityIds: comparison.pairIdentityIds,
      overlapFamilies,
      ambiguityCode: comparison.ambiguityCode,
      message: `D222 no puede recuperar la distancia jugable del par ${comparison.pairIdentityIds.join(" / ")} con el grafo factual actual.`,
    }];
  });

  return Object.freeze({
    schemaVersion: 1,
    decisionId: "D-222",
    coverage: "ACCEPTED_SPECIALIST_COMPARISONS_ONLY",
    futureMandatoryAnchorReservationsEvaluated: false,
    sourceGraphId: graphs.graphId,
    sourceGraphDigest: sourceGraphDigest(profileAssignments),
    graphSources: structuredClone(graphs.sources ?? []),
    assignmentId: profileAssignments.assignmentId ?? null,
    assignmentDecisionId: profileAssignments.decisionId ?? null,
    snapshotBound: true,
    acceptedEvidence,
    acceptedIdentities,
    identities: routes.identities,
    comparisons: routes.comparisons,
    requirements,
  });
}

export function specialistDistanceFindings(evidence, trainerId, variants) {
  invariant(evidence?.decisionId === "D-222" && evidence.snapshotBound === true,
    "se requiere evidencia D222 ligada, incluso cuando el snapshot aceptado está vacío.");
  invariant(nonempty(trainerId), "falta trainerId candidato.");
  const ownIdentity = evidence.identities?.find(identity => identity.trainerIds.includes(trainerId));
  invariant(ownIdentity !== undefined, `${trainerId}: no es una identidad Especialista D212.`);
  const own = familyUnions(variants);
  const comparisonByPair = new Map(evidence.comparisons.map(comparison =>
    [routeKey(...comparison.pairIdentityIds), comparison]));
  const comparisons = [];
  const errors = [];

  for (const prior of evidence.acceptedIdentities ?? []) {
    if (prior.identityId === ownIdentity.identityId) continue;
    const route = comparisonByPair.get(routeKey(ownIdentity.identityId, prior.identityId));
    invariant(route !== undefined, `falta comparación de ruta con ${prior.identityId}.`);
    const overlapFamilies = kInvolvedOverlap(own, prior);
    const digests = {
      publicationDigests: [...prior.publicationDigests],
      acceptanceDigests: [...prior.acceptanceDigests],
      ...(prior.publicationDigests.length === 1 ? { publicationDigest: prior.publicationDigests[0] } : {}),
      ...(prior.acceptanceDigests.length === 1 ? { acceptanceDigest: prior.acceptanceDigests[0] } : {}),
    };
    if (route.status === "AMBIGUOUS") {
      if (overlapFamilies.length <= 1) {
        comparisons.push({ trainerId: prior.trainerId, trainerIds: [...prior.trainerIds], distance: null,
          overlapFamilies, maximum: 1, maximumKInvolvedOverlap: 1, status: "PASS_ALL_DISTANCE_LIMITS",
          routeStatus: "AMBIGUOUS", ambiguityCode: route.ambiguityCode, ...digests });
        continue;
      }
      comparisons.push({ trainerId: prior.trainerId, trainerIds: [...prior.trainerIds], distance: null,
        overlapFamilies, maximum: null, maximumKInvolvedOverlap: null, status: "AMBIGUOUS",
        ambiguityCode: route.ambiguityCode, ...digests });
      errors.push({
        code: "SPECIALIST_ROUTE_DISTANCE_EVIDENCE_MISSING",
        path: "submission.variants",
        pairTrainerIds: [trainerId, prior.trainerId],
        pairIdentityIds: [ownIdentity.identityId, prior.identityId].sort(),
        message: `D222 no puede recuperar la distancia jugable entre ${trainerId} y ${prior.trainerId}; falta evidencia factual específica para ese par.`,
      });
      continue;
    }
    const maximum = route.maximumKInvolvedOverlap;
    const status = maximum === null ? "PASS_NO_D222_LIMIT"
      : overlapFamilies.length <= maximum ? "PASS" : "FAIL";
    comparisons.push({ trainerId: prior.trainerId, trainerIds: [...prior.trainerIds],
      distance: route.distance, overlapFamilies, maximum, maximumKInvolvedOverlap: maximum,
      status, routeEvidence: structuredClone(route.evidence), ...digests });
    if (status === "FAIL") errors.push({
      code: "SPECIALIST_K_DISTANCE",
      path: "submission.variants",
      pairTrainerIds: [trainerId, prior.trainerId],
      pairIdentityIds: [ownIdentity.identityId, prior.identityId].sort(),
      message: `D222 distancia ${route.distance} con ${prior.trainerId}: ${overlapFamilies.join(", ")}; máximo ${maximum}.`,
    });
  }
  comparisons.sort((left, right) => left.trainerId.localeCompare(right.trainerId));
  return { ...own, comparisons, errors };
}
