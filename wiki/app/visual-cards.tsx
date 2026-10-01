/* eslint-disable @next/next/no-img-element */
import type { ReactNode } from "react";
import type {
  EvolutionItemSource,
  EggGift,
  MapItemEvidence,
  TrainerIdentity,
} from "./current-sources";
import { isEvolutionItem } from "./current-sources";
import {
  moveTypePresentation,
  pokemonTypePresentations,
} from "./battle-visuals";
import {
  type GeneratedTrainer,
  type GeneratedTrainerTeam,
} from "./trainer-runs";
import { stageReference } from "./recorrido";
import { profileLabel, trainerClassLabel, itemSourceLabel } from './english-labels';
import {
  assetLabel,
  itemAssetSlug,
  pokemonAssetSlug,
  trainerAssetSlug,
  type VisualAsset,
} from "./visual-data";

export function MapCard({
  asset,
  label,
  lots = [],
}: {
  asset: VisualAsset;
  label?: string;
  lots?: string[];
}) {
  return (
    <figure className="map-card">
      <a
        href={`/maps/${asset.file}`}
        target="_blank"
        rel="noreferrer"
        title="Open full map"
      >
        <img
          src={`/maps/${asset.file}`}
          alt={`Map of ${label ?? assetLabel(asset.slug)}`}
          width={asset.width}
          height={asset.height}
          loading="lazy"
        />
      </a>
      <figcaption>
        <strong>{label ?? assetLabel(asset.slug)}</strong>
        <span>
          {lots.length > 0
            ? lots.map(stageReference).join(" · ")
            : "Map"}{" "}
          · open ↗
        </span>
      </figcaption>
    </figure>
  );
}

export function RoamingEncounterCard() {
  const alternatives = [
    { name: "Entei", slug: "entei", starter: "Bulbasaur" },
    { name: "Suicune", slug: "suicune", starter: "Charmander" },
    { name: "Raikou", slug: "raikou", starter: "Squirtle" },
  ];
  return (
    <article className="roaming-encounter-card">
      <header><strong>Roaming Pokémon</strong><span>Lv. 50</span></header>
      <p><strong>Location:</strong> Kanto routes.</p>
      <p><strong>Requirement:</strong> deliver the Sapphire to Celio on One Island.</p>
      <div className="roaming-encounter-options">
        {alternatives.map(mon => (
          <div key={mon.slug}>
            <img src={`/pokemon/${mon.slug}.png`} alt="" width="64" height="64" loading="lazy" />
            <strong>{mon.name}</strong><small>If you chose {mon.starter}</small>
          </div>
        ))}
      </div>
      <small>One per playthrough. Moves between routes.</small>
    </article>
  );
}

export function TrainerCard({ trainer }: { trainer: TrainerIdentity }) {
  const baseRecord = trainer.engineRecords[0];
  const portrait = trainerAssetSlug(baseRecord?.trainerPic);
  return (
    <article className="trainer-source-card" id={trainer.logicalId}>
      <header>
        <div className="trainer-portrait">
          {portrait ? (
            <img
              src={`/trainers/${portrait}.png`}
              alt=""
              width="64"
              height="64"
              loading="lazy"
            />
          ) : (
            <span>?</span>
          )}
        </div>
        <div>
          <span
            className={`profile profile-${trainer.profile
              .toLowerCase()
              .normalize("NFD")
              .replace(/[\u0300-\u036f]/g, "")}`}
          >
            {profileLabel(trainer.profile)}
          </span>
          <h3>{trainer.displayName}</h3>
          <p>
            {trainer.wikiTrainerClass} · {trainer.location.zoneName}
          </p>
        </div>
        <small>{trainer.batchId}</small>
      </header>
      <p className="trainer-identity-copy">{trainer.identity.summary}</p>
      {baseRecord && (
        <div
          className="vanilla-party"
          aria-label={`Equipo vanilla de referencia de ${trainer.displayName}`}
        >
          {baseRecord.party.map((pokemon, index) => (
            <span
              className="vanilla-mon"
              key={`${pokemon.speciesConstant}-${index}`}
            >
              <img
                src={`/pokemon/${pokemonAssetSlug(pokemon.slug) ?? pokemon.slug}.png`}
                alt=""
                width="42"
                height="42"
                loading="lazy"
              />
              <b>{pokemon.name}</b>
              <small>Lv. {pokemon.level}</small>
            </span>
          ))}
        </div>
      )}
      <footer>
        <span>Referencia vanilla · no es equipo Beta 3</span>
        {trainer.engineRecords.length > 1 && (
          <span>{trainer.engineRecords.length} variantes de engine</span>
        )}
      </footer>
    </article>
  );
}

export function GeneratedTrainerCard({
  trainer,
  children,
}: {
  trainer: GeneratedTrainer;
  children?: ReactNode;
}) {
  const portrait = trainerAssetSlug(trainer.sprite);
  const hasVariants = trainer.teams.length > 1;
  return (
    <article
      className="trainer-source-card generated-trainer-card"
      data-profile={profileLabel(trainer.profile).toLowerCase()}
      id={`generated-${trainer.id}`}
    >
      <header>
        <div className="trainer-portrait">
          {portrait ? (
            <img
              src={`/trainers/${portrait}.png`}
              alt=""
              width="64"
              height="64"
              loading="lazy"
            />
          ) : (
            <span>?</span>
          )}
        </div>
        <div>
          <span
            className={`profile profile-${trainer.profile
              .toLowerCase()
              .normalize("NFD")
              .replace(/[\u0300-\u036f]/g, "")}`}
          >
            {profileLabel(trainer.profile)}
          </span>
          <h3>{trainer.name}</h3>
          <p>
            {trainerClassLabel(trainer.trainerClass)}
          </p>
        </div>
        <div className="trainer-header-controls">
          {children}
        <small>
          Team {trainer.packageVariant}
        </small>
        </div>
      </header>
      {hasVariants ? (
        <div className="generated-variants">
          {trainer.teams.map((team) => (
            <details className="generated-variant" key={team.variantId}>
              <summary>
                <strong>{variantLabel(team.variantId)}</strong>
                <span>Rival ace: {displaySlug(team.requiredAceFamily)}</span>
              </summary>
              <GeneratedParty team={team} />
            </details>
          ))}
        </div>
      ) : (
        <GeneratedParty team={trainer.teams[0]} />
      )}
    </article>
  );
}

function GeneratedParty({ team }: { team: GeneratedTrainerTeam }) {
  return (
    <div className="generated-party">
      {team.mons.map((pokemon, index) => {
        const sprite = pokemonAssetSlug(pokemon.slug) ?? pokemon.slug;
        const types = pokemonTypePresentations(sprite);
        const moveAccess = new Map(
          (pokemon.moveAccess ?? []).map((access) => [
            access.move,
            access,
          ]),
        );
        return (
          <article
            className={`generated-mon ${types[0]?.className ?? "type-mystery"}`}
            data-primary-type={types[0]?.id ?? "mystery"}
            key={`${team.variantId}-${pokemon.slug}-${index}`}
          >
            <header>
              <img
                src={`/pokemon/${sprite}.png`}
                alt=""
                width="54"
                height="54"
                loading="lazy"
              />
              <div className="generated-mon-copy">
                <strong>{pokemon.species}</strong>
                <span className="pokemon-type-list">
                  {types.map((type) => (
                    <span
                      className={`pokemon-type-badge ${type.className}`}
                      key={type.id}
                    >
                      {type.label}
                    </span>
                  ))}
                </span>
                <small>
                  Lv. {pokemon.level} ·{" "}
                  <span
                    className={
                      pokemon.natureQuality === "optimal"
                        ? "nature-name nature-optimal"
                        : "nature-name"
                    }
                    title={
                      pokemon.natureQuality === "optimal"
                        ? "Optimal nature"
                        : undefined
                    }
                  >
                    {pokemon.nature}
                  </span>
                </small>
              </div>
            </header>
            <dl>
              <div>
                <dt>Ability</dt>
                <dd>
                  {pokemon.abilityRationale ? (
                    <strong
                      className="ability-optimal"
                      title="Optimal ability"
                    >
                      {pokemon.ability}
                    </strong>
                  ) : pokemon.ability}
                </dd>
              </div>
              <div className={pokemon.item === "—" ? "empty-item" : ""}>
                <dt>Item</dt>
                <dd>{pokemon.item}</dd>
              </div>
            </dl>
            <ul>
              {pokemon.moves.map((move) => {
                const type = moveTypePresentation(move);
                const access = moveAccess.get(move);
                const discretionaryAccess = access?.method === "tm"
                  ? { badge: "TM", label: "TM" }
                  : access?.method === "hm"
                    ? { badge: "HM", label: "HM" }
                    : access?.method === "tutor"
                      ? { badge: "T", label: "Move Tutor" }
                      : undefined;
                return (
                  <li
                    className={`move-chip ${type.className}${
                      discretionaryAccess ? " move-chip-with-access" : ""
                    }`}
                    key={move}
                  >
                    <span>{move}</span>
                    {discretionaryAccess && (
                      <span
                        className="move-access-meta"
                        title={discretionaryAccess.label}
                      >
                        <b className="move-access-badge">
                          {discretionaryAccess.badge}
                        </b>
                      </span>
                    )}
                    <small>{type.label}</small>
                  </li>
                );
              })}
            </ul>
          </article>
        );
      })}
    </div>
  );
}

function variantLabel(variantId: string) {
  return variantId.startsWith("vs-")
    ? `If you chose ${displaySlug(variantId.slice(3))}`
    : "Team";
}

function displaySlug(value: string | null) {
  if (!value) return "—";
  return value
    .split(/[-_]/)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

export function ItemCard({
  asset,
  source,
}: {
  asset: VisualAsset | null;
  source?: EvolutionItemSource;
}) {
  const slug =
    asset?.slug ?? (source ? itemAssetSlug(source.rom.itemId) : null);
  const label = source?.item ?? (asset ? assetLabel(asset.slug) : "Item");
  return (
    <article className={`map-item-card${source ? " evolution-item-card" : ""}`}>
      <div className="map-item-icon">
        {slug ? (
          <img
            src={`/items/${slug}.png`}
            alt=""
            width="38"
            height="38"
            loading="lazy"
          />
        ) : (
          <span>?</span>
        )}
      </div>
      <div>
        <header>
          <strong>{label}</strong>
        </header>
        {source ? (
          <>
            <p>{itemSourceLabel(source.source)}</p>
            <small>{stageReference(source.lot)}</small>
          </>
        ) : (
          <p>Location unavailable</p>
        )}
      </div>
    </article>
  );
}

export function MapItemCard({ item }: { item: MapItemEvidence }) {
  const coins = item.itemId === "ITEM_NONE" && /GAME_CORNER_COINS/.test(item.flag);
  const slug = itemAssetSlug(coins ? "ITEM_COIN_CASE" : item.itemId);
  const label = coins ? "Coins" : item.name
    .toLocaleLowerCase("en")
    .split(" ")
    .map((part) => /^(?:tm|hm)\d+$/.test(part) || part === "hp" || part === "pp"
      ? part.toUpperCase()
      : `${part.charAt(0).toLocaleUpperCase("en")}${part.slice(1)}`)
    .join(" ");
  return (
    <article className={`map-item-card${isEvolutionItem(item.itemId) ? " evolution-item-card" : ""}`}>
      <div className="map-item-icon">
        {slug ? (
          <img
            src={`/items/${slug}.png`}
            alt=""
            width="38"
            height="38"
            loading="lazy"
          />
        ) : (
          <span>?</span>
        )}
      </div>
      <div>
        <header>
          <strong>
            {label}
            {item.quantity > 1 ? ` ×${item.quantity}` : ""}
          </strong>
          <span>{item.kind === "hidden" ? "Hidden" : "Visible"}</span>
        </header>
        <p>
          {assetLabel(mapAssetSlugLabel(item.mapName))} · ({item.position.x},{" "}
          {item.position.y})
        </p>
        <small>{item.lot ? stageReference(item.lot) : ""}</small>
      </div>
    </article>
  );
}

export function EggItemCard({ gift }: { gift: EggGift }) {
  return <article className="map-item-card egg-item-card">
    <div className="map-item-icon"><img src="/items/pokemon_egg.png" alt="" width="38" height="38" loading="lazy" /></div>
    <div>
      <header><strong>Egg · {gift.options.join(" / ")}</strong><span>Gift</span></header>
      <p>{gift.location}{gift.requirement ? ` · ${gift.requirement}` : ""}</p>
      <small>{stageReference(gift.lot)}</small>
    </div>
  </article>;
}

function mapAssetSlugLabel(mapName: string) {
  return mapName
    .replaceAll("_", "-")
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/^route(\d+)/i, "route-$1")
    .toLowerCase();
}
