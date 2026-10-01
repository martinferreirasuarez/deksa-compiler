"use client";

/* eslint-disable @next/next/no-img-element */
import { useMemo, useState } from "react";
import type { FaunaPossibilityLotView } from "./fauna-possibilities";
import { groupEquivalentPossibilityTables, habitatLabel, type PossibilityTableGroup } from "./fauna-possibility-groups";
import {
  compactLevelLabel,
  faunaMethodLabels,
  humanizeFaunaMapName,
} from "./fauna-presentation";

function PossibilityGroup({
  group,
  lotId,
  initialOpen,
}: {
  group: PossibilityTableGroup;
  lotId: string;
  initialOpen: boolean;
}) {
  const [isOpen, setIsOpen] = useState(initialOpen);
  return (
    <details
      className="possibility-group"
      open={isOpen}
      onToggle={(event) => setIsOpen(event.currentTarget.open)}
    >
      <summary>
        <span>
          <strong>{habitatLabel(group.habitatTags)} · {faunaMethodLabels[group.method]}</strong>
          <small>
            {compactLevelLabel(group.levelEnvelope.levels)}
            {group.context === "safari" ? " · Safari" : ""}
            {group.effectiveAccessBatch !== lotId ? ` · Acceso posterior: ${group.effectiveAccessBatch}` : ""}
          </small>
          <span className="possibility-locations">{group.mapNames.map(name => <span key={name}>{humanizeFaunaMapName(name)}</span>)}</span>
        </span>
        <em>{group.species.length} {group.species.length === 1 ? "posibilidad" : "posibilidades"}</em>
      </summary>
      {isOpen && (
        <>
          <div className="possibility-species-grid">
            {group.species.map((pokemon) => (
              <article className="possibility-species" key={`${group.key}-${pokemon.speciesId}`}>
                <img src={`/pokemon/${pokemon.slug}.png`} alt="" width="56" height="56" loading="lazy" />
                <span><strong>{pokemon.name}</strong><small title={`Niveles exactos: ${pokemon.levels.join(", ")}`}>{compactLevelLabel(pokemon.levels)}</small></span>
              </article>
            ))}
          </div>
        </>
      )}
    </details>
  );
}

export function FaunaPossibilitiesPanel({ lot }: { lot: FaunaPossibilityLotView }) {
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLocaleLowerCase("es");
  const groups = useMemo(() => groupEquivalentPossibilityTables(lot.tables), [lot.tables]);
  const filteredGroups = groups.flatMap((group) => {
    const species = normalizedQuery
      ? group.species.filter(({ name, familyKey }) =>
          `${name} ${familyKey}`.toLocaleLowerCase("es").includes(normalizedQuery),
        )
      : group.species;
    return species.length > 0 ? [{ ...group, species }] : [];
  });

  return (
    <section className="lot-visual-panel fauna-possibilities-panel lot-tab-panel">
      <header>
        <div><span>01</span><h3>Fauna posible</h3></div>
        <p>{groups.length} grupos · {lot.tables.length} tablas</p>
      </header>
      <label className="possibility-search">
        <span>Buscar Pokémon</span>
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.currentTarget.value)}
          placeholder="Nombre o familia…"
        />
      </label>
      <div className="possibility-groups">
        {filteredGroups.map((group, index) => (
          <PossibilityGroup
            group={group}
            lotId={lot.id}
            initialOpen={Boolean(normalizedQuery) || index === 0 || group.species.length <= 8}
            key={`${group.key}-${normalizedQuery ? "search" : "browse"}`}
          />
        ))}
      </div>
      {filteredGroups.length === 0 && (
        <p className="catalog-empty">No hay posibilidades que coincidan con la búsqueda.</p>
      )}
    </section>
  );
}
