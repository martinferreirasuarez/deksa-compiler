import { readWebTrainerView } from "../../trainer-web";
import { readBeta5TrainerView, beta5TrainerCard, isBeta5Entry, isBeta5ParametricTrainer } from "../../trainer-b5";
/* eslint-disable @next/next/no-html-link-for-pages */
import { TrainerPackageNavigation } from "../../trainer-package-navigation";
import { notFound, redirect } from "next/navigation";
import { trainersInAppearanceOrder } from "../../trainer-display-order";
import {
  itemSourcesForLot,
  eggGiftsForLot,
  mapAssetsForLot,
  mapItemsForLot,
  trainersForLot,
} from "../../current-sources";
import { FaunaPossibilitiesPanel } from "../../fauna-possibilities-panel";
import { Beta5FaunaPanel } from "../../fauna-b5-panel";
import { beta5LotProgress } from "../../beta5-lot-progress";
import { stageForLot } from "../../recorrido";
import { faunaPossibilitiesViewForLot } from "../../fauna-possibilities";
import { SiteHeader } from "../../site-header";
import { isParametricTrainer, playerStarters, starterNames } from "../../trainer-v21";
import {
  currentTrainerCard,
  currentLotProgress,
  needsTrainerRegeneration,
} from "../../trainer-current";
import {
  GeneratedTrainerCard,
  ItemCard,
  EggItemCard,
  MapCard,
  MapItemCard,
  RoamingEncounterCard,
} from "../../visual-cards";
import {
  itemAssetSlug,
  visualAssets,
} from "../../visual-data";
import {
  lotById,
  lotHref as archiveLotHref,
  workbench,
} from "../../workbench";

export function generateStaticParams() {
  return workbench.lots.map((lot) => ({ id: lot.id.toLowerCase() }));
}

export const dynamic = "force-dynamic";

export default async function LotPage(props: Parameters<typeof renderLotPage>[0]) {
  const { id } = await props.params;
  const oldQuery = await props.searchParams;
  const query = new URLSearchParams();
  for (const key of ["view", "set", "playerStarter", "q"] as const) {
    const value = oldQuery[key];
    if (typeof value === "string") query.set(key, value);
    else if (value?.[0]) query.set(key, value[0]);
  }
  redirect(`/beta5/lotes/${encodeURIComponent(id.toLowerCase())}${query.size ? `?${query}` : ""}`);
}

export async function renderLotPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    view?: string | string[];
    set?: string | string[];
    playerStarter?: string | string[];
    q?: string | string[];
  }>;
}, beta5: boolean) {
  const lotHref: typeof archiveLotHref = (...args) => {
    const href = archiveLotHref(...args);
    return beta5 ? href.replace('/archivo/beta4/', '/beta5/') : href;
  };
  const { id } = await params;
  const query = await searchParams;
  const faunaQuery = (Array.isArray(query.q) ? query.q[0] : query.q)?.slice(0, 80) ?? '';
  const requestedView = Array.isArray(query.view) ? query.view[0] : query.view;
  const requestedTrainerSet = Array.isArray(query.set) ? query.set[0] : query.set;
  const requestedPlayerStarter = Array.isArray(query.playerStarter) ? query.playerStarter[0] : query.playerStarter;
  const activePlayerStarter = playerStarters.find((starter) => starter === requestedPlayerStarter) ?? "bulbasaur";
  const activeTrainerSet =
    requestedTrainerSet === "A" || requestedTrainerSet === "B" || requestedTrainerSet === "C"
      ? requestedTrainerSet
      : "A";
  const activeView =
    requestedView === "trainers" || requestedView === "content"
      ? "trainers"
      : requestedView === "items" || requestedView === "maps"
        ? requestedView
        : "fauna";
  const lot = lotById(id);
  if (!lot) notFound();
  const stage = beta5 ? stageForLot(lot.id) : null;
  const { entries: trainerEntries, notice } = beta5 ? await readBeta5TrainerView() : await readWebTrainerView();

  const index = workbench.lots.findIndex((entry) => entry.id === lot.id);
  const previous = workbench.lots[index - 1];
  const next = workbench.lots[index + 1];
  const possibleFauna = beta5 ? null : faunaPossibilitiesViewForLot(lot.id);
  const factualTrainerCount = beta5 ? 0 : trainersForLot(lot.id).length;
  const lotTrainerEntries = trainersInAppearanceOrder(
    trainerEntries.filter(({ trainer }) => trainer.lotId === lot.id),
    lot.id,
    trainersForLot(lot.id).map((trainer) => trainer.logicalId),
  );
  const hasRivalBranches = lotTrainerEntries.some(entry => isBeta5Entry(entry) ? isBeta5ParametricTrainer(entry) : isParametricTrainer(entry.trainer));
  const lotProgress = beta5
    ? beta5LotProgress(lot.id, lotTrainerEntries.length)
    : currentLotProgress(trainerEntries.filter((entry): entry is Awaited<ReturnType<typeof readWebTrainerView>>["entries"][number] => !isBeta5Entry(entry)), lot.id);
  const lotItems = itemSourcesForLot(lot.id);
  const lotMapItems = mapItemsForLot(lot.id);
  const extraItemSources = lotItems.filter(source => !lotMapItems.some(item => item.itemId === source.rom.itemId));
  const lotEggs = beta5 ? eggGiftsForLot(lot.id) : [];
  const mapNames = mapAssetsForLot(lot.id);
  const mapAssetsBySlug = new Map(
    visualAssets.assets.maps.map((asset) => [asset.slug, asset]),
  );
  const itemAssetsBySlug = new Map(
    visualAssets.assets.items.map((asset) => [asset.slug, asset]),
  );

  return (
    <>
      <SiteHeader active={beta5 ? 'beta5' : 'lots'} title={stage ? 'Guide' : `${lot.id} · ${lot.title}`} />
      <main className="lot-shell">
        {!beta5 && notice && <p role="status" className="catalog-empty">{notice}</p>}


        <header className="lot-heading">
          <div
            className={stage ? 'lot-number guide-stage-number' : `lot-number lot-number-${lotProgress.className}`}
            title={stage ? `${stage.section} · Part ${stage.number}` : lotProgress.label}
            aria-label={stage ? `Part ${stage.number}` : `${lot.id} · ${lotProgress.label}`}
          >
            {stage ? String(stage.number).padStart(2, '0') : lot.id}
          </div>
          <div>
            <p className="eyebrow">{stage
              ? `${stage.section} · Part ${stage.number}`
              : `Arco ${lot.arc} · taller de lotes`}</p>
            <h2>{stage?.title ?? lot.title}</h2>
          </div>
          <nav className="lot-pagination" aria-label={stage ? 'Walkthrough navigation' : 'Navegación entre lotes'}>
          {previous ? (
            <a href={lotHref(
              previous.id,
              undefined,
              activeView,
              activeView === "trainers" ? activeTrainerSet : undefined,
            )}>
              {stage ? '← Previous' : `← ${previous.id}`}
            </a>
          ) : (
            <span />
          )}
          <a href={beta5 ? '/' : '/archivo/beta4'}>
            {stage ? 'Walkthrough' : 'Índice de lotes'}
          </a>
          {next ? (
            <a href={lotHref(
              next.id,
              undefined,
              activeView,
              activeView === "trainers" ? activeTrainerSet : undefined,
            )}>
              {stage ? 'Next →' : `${next.id} →`}
            </a>
          ) : (
            <span />
          )}
        </nav>
        </header>

        <nav className="lot-view-tabs" aria-label={stage ? 'Part contents' : 'Contenido del lote'}>
          <a
            className={activeView === "fauna" ? "active" : ""}
            href={lotHref(lot.id, undefined, "fauna")}
          >
            <span>Wild Pokémon</span>
            <small>Possible encounters</small>
          </a>
          <a
            className={activeView === "trainers" ? "active" : ""}
            href={lotHref(
              lot.id,
              undefined,
              "trainers",
              activeTrainerSet,
            )}
          >
            <span>Trainers</span>
            <small>
              {lotTrainerEntries.length > 0
                ? `${lotTrainerEntries.length} trainer${lotTrainerEntries.length === 1 ? "" : "s"}`
                : beta5 ? "No trainers" : "Pendiente"}
            </small>
          </a>
          <a
            className={activeView === "items" ? "active" : ""}
            href={lotHref(lot.id, undefined, "items")}
          >
            <span>Items</span>
            <small>{lotMapItems.length + extraItemSources.length + lotEggs.length} items</small>
          </a>
          <a
            className={activeView === "maps" ? "active" : ""}
            href={lotHref(lot.id, undefined, "maps")}
          >
            <span>Maps</span>
            <small>{mapNames.size} maps</small>
          </a>
        </nav>

        {activeView === "fauna" ? (
          beta5 ? <Beta5FaunaPanel lotId={lot.id} initialQuery={faunaQuery} /> : possibleFauna ? (
            <FaunaPossibilitiesPanel lot={possibleFauna} />
          ) : (
            <section className="lot-visual-panel lot-tab-panel">
              <p className="catalog-empty">Todavía no hay posibilidades de fauna para este lote.</p>
            </section>
          )
        ) : activeView === "trainers" ? (
          <section className="lot-visual-panel lot-tab-panel">
            <header>
              <div>
                <span>02</span>
                <h3>Trainers</h3>
                {!beta5 && lotTrainerEntries.length > 0 && (
                  <em className={lotProgress.className === "accepted" ? "status-accepted" : "status-review"}>
                    {lotProgress.className === "accepted"
                      ? "LOTE ACEPTADO"
                      : lotTrainerEntries.every(entry => !isBeta5Entry(entry) && needsTrainerRegeneration(entry))
                      ? "VERSIÓN ANTERIOR · PENDIENTE DE REGENERACIÓN"
                      : "EN REVISIÓN · NO ACEPTADO"}
                  </em>
                )}
              </div>
              <p>
                {lotTrainerEntries.length > 0
                  ? `${lotTrainerEntries.length} trainer${lotTrainerEntries.length === 1 ? "" : "s"} · team ${activeTrainerSet}`
                  : beta5 ? 'No trainers' : `0 equipos publicados · ${factualTrainerCount} identidades factuales catalogadas`}
              </p>
            </header>
                {lotTrainerEntries.length > 0 ? (
                    <>
                    {beta5 && <p className="section-pool-description">Each trainer has three possible teams. Your seed determines which one you face.</p>}
                    <TrainerPackageNavigation>
                      {(["A", "B", "C"] as const).map((packageVariant) => {
                        return (
                          <a
                            className={activeTrainerSet === packageVariant ? "active" : ""}
                            href={lotHref(
                              lot.id,
                              undefined,
                              "trainers",
                              packageVariant,
                            ) + (hasRivalBranches ? `&playerStarter=${activePlayerStarter}` : "")}
                            aria-current={activeTrainerSet === packageVariant ? "page" : undefined}
                            key={packageVariant}
                          >
                            <strong>{packageVariant}</strong>
                            <small>{lotTrainerEntries.length} trainer{lotTrainerEntries.length === 1 ? "" : "s"}</small>
                          </a>
                        );
                      })}
                    </TrainerPackageNavigation>
                    <div className="trainer-catalog-grid lot-trainer-grid generated-trainer-grid">
                      {lotTrainerEntries.map((entry) => {
                        return (
                          <GeneratedTrainerCard
                            trainer={isBeta5Entry(entry) ? beta5TrainerCard(entry, activeTrainerSet, activePlayerStarter) : currentTrainerCard(entry, activeTrainerSet, activePlayerStarter)}
                            key={`${entry.runId}-${activeTrainerSet}-${activePlayerStarter}`}
                          >
                            {(isBeta5Entry(entry) ? isBeta5ParametricTrainer(entry) : isParametricTrainer(entry.trainer)) && (
                              <nav className="trainer-starter-selector" aria-label="Your starter">
                                <span>Starter:</span>
                                {playerStarters.map((starter) => (
                                  <a
                                    key={starter}
                                    className={`starter-dot starter-${starter}${activePlayerStarter === starter ? " active" : ""}`}
                                    title={starterNames[starter]}
                                    aria-label={starterNames[starter]}
                                    aria-current={activePlayerStarter === starter ? "page" : undefined}
                                    href={`${lotHref(lot.id, undefined, "trainers", activeTrainerSet)}&playerStarter=${starter}#generated-${entry.trainerId}`}
                                  >
                                    <span aria-hidden="true">{activePlayerStarter === starter ? "✓" : ""}</span>
                                  </a>
                                ))}
                              </nav>
                            )}
                          </GeneratedTrainerCard>
                        );
                      })}
                    </div>
                  </>
                ) : (
                  <p className="catalog-empty">
                    {stage ? 'No trainers in this part.' : `Lote pendiente. Todavía no hay equipos publicados para ${lot.id}.`}
                  </p>
                )}
          </section>
        ) : activeView === "items" ? (
          <section className="lot-visual-panel lot-tab-panel">
            <header>
              <div><span>03</span><h3>Items</h3></div>
              <p>{lotMapItems.length + extraItemSources.length + lotEggs.length} items</p>
            </header>
                <div className="map-item-grid">
                  {extraItemSources.map((source) => {
                    const slug = itemAssetSlug(source.rom.itemId);
                    return (
                      <ItemCard
                        asset={slug ? (itemAssetsBySlug.get(slug) ?? null) : null}
                        source={source}
                        key={source.rom.itemId}
                      />
                    );
                  })}
                  {lotMapItems.map((item) => <MapItemCard item={item} key={item.id} />)}
                  {lotEggs.map(gift => <EggItemCard gift={gift} key={gift.id} />)}
                </div>
                {lotItems.length === 0 && lotMapItems.length === 0 && lotEggs.length === 0 && (
                  <p className="catalog-empty">No items in this part.</p>
                )}
          </section>
        ) : (
          <section className="lot-visual-panel lot-tab-panel">
            <header>
              <div><span>04</span><h3>Maps</h3></div>
              <p>{mapNames.size} maps</p>
            </header>
                {beta5 && lot.id === "09G" && (
                  <section className="special-encounters">
                    <h4>Special encounters</h4>
                    <RoamingEncounterCard />
                  </section>
                )}
                <div className="map-catalog-grid lot-map-grid">
                  {[...mapNames.keys()].map((slug) => {
                    const asset = mapAssetsBySlug.get(slug);
                    return asset ? <MapCard asset={asset} lots={[lot.id]} key={slug} /> : null;
                  })}
                </div>
                {mapNames.size === 0 && (
                  <p className="catalog-empty">No maps in this part.</p>
                )}
          </section>
        )}
      </main>
    </>
  );
}
