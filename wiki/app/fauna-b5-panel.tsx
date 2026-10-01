"use client";

/* eslint-disable @next/next/no-img-element */
import { useState } from "react";
import { beta5WindowForLot } from "./beta5-window-plan";
import data from "../content/beta5-fauna.generated.json";
import policy from "../content/beta5-fauna-policy.generated.json";

const wildSpeciesIds = new Set(policy.families.flatMap(family => family.speciesKeys));
const poolDescription = "This list shows the Pokémon eligible to appear in the wild up to this section. Not all of them appear in every playthrough: your seed determines which ones are included.";

export function Beta5FaunaPanel({ lotId, initialQuery = '' }: { lotId: string; initialQuery?: string }) {
  const [query, setQuery] = useState(initialQuery);
  const search = <form className="possibility-search" method="get" role="search">
    <input type="hidden" name="view" value="fauna" />
    <label htmlFor="fauna-query">Search Pokémon</label>
    <div className="possibility-search-controls"><input id="fauna-query" name="q" type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Name…" maxLength={80} /><button type="submit">Search</button></div>
  </form>;
  const plannedWindow = beta5WindowForLot(lotId);
  const window = data.windows.find(w => w.lots.includes(lotId));
  const normalized = query.trim().toLocaleLowerCase("en");
  if (!window) {
    const policyWindow = policy.windows.find(w => w.lots.includes(lotId));
    if (!policyWindow || !plannedWindow) return <section className="lot-visual-panel lot-tab-panel">
      <p className="catalog-empty">No wild Pokémon listed for this part.</p>
    </section>;
    const matchesFamily = (family: typeof policy.families[number]) => family.name.toLocaleLowerCase("en").includes(normalized);
    const newFamilies = policy.families.filter(family => family.window === policyWindow.number && matchesFamily(family));
    const priorFamilies = policy.families.filter(family => family.window < policyWindow.number && matchesFamily(family));
    return <section className="lot-visual-panel fauna-possibilities-panel lot-tab-panel">
      <header><div><span>01</span><h3>Wild Pokémon</h3></div>
        <p>{policy.families.filter(family => family.window <= policyWindow.number).length} available families</p></header>
      <p className="section-pool-description">{poolDescription}</p>
      {search}
      {[
        { title: "New in this section", families: newFamilies, open: true },
        { title: "Available from earlier sections", families: priorFamilies, open: normalized.length > 0 },
      ].map(group => group.families.length > 0 && <details className="possibility-group" open={group.open} key={group.title}>
        <summary><strong>{group.title}</strong><em>{group.families.length} {group.families.length === 1 ? 'family' : 'families'}</em></summary>
        <div className="possibility-species-grid">{group.families.map(family => <article className="possibility-species fauna-species" key={family.familyKey}>
          <img src={`/pokemon/${family.slug}.png`} alt="" width="56" height="56" loading="lazy" />
          <span><strong>{family.name}</strong></span>
        </article>)}</div>
      </details>)}
      {newFamilies.length + priorFamilies.length === 0 && <p className="catalog-empty">No matching Pokémon.</p>}
    </section>;
  }
  const eligible = data.species.filter(p => wildSpeciesIds.has(p.id)
    && p.campaign.knownBy !== null && p.campaign.knownBy! <= window.number);
  const matches = (p: typeof data.species[number]) => p.name.toLocaleLowerCase("en").includes(normalized);
  const groups = [
    { title: "New in this section", species: eligible.filter(p => p.campaign.exact === window.number) },
    { title: "Available from earlier sections", species: eligible.filter(p => p.campaign.exact !== null && p.campaign.exact! < window.number) },
    { title: "Also available", species: eligible.filter(p => p.campaign.exact === null) },
  ];
  return <section className="lot-visual-panel fauna-possibilities-panel lot-tab-panel">
    <header><div><span>01</span><h3>Wild Pokémon</h3></div><p>{eligible.length} available species</p></header>
    <p className="section-pool-description">{poolDescription}</p>
    {search}
    <div className="possibility-groups">
      {groups.map(group => {
        const species = group.species.filter(matches);
        return species.length ? <details className="possibility-group" open key={group.title}>
          <summary><strong>{group.title}</strong><em>{species.length} species</em></summary>
          <div className="possibility-species-grid">{species.map(p => <article className="possibility-species fauna-species" key={p.id}>
            <img src={`/pokemon/${p.slug}.png`} alt="" width="56" height="56" loading="lazy" />
            <span><strong>{p.name}</strong></span>
          </article>)}</div>
        </details> : null;
      })}
    </div>
    {!groups.some(g => g.species.some(matches)) && <p className="catalog-empty">No matching Pokémon.</p>}
  </section>;
}
