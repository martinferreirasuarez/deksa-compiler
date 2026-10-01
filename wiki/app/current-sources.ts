import evolutionItemsJson from './generated/evolution-item-sources.json';
import mapItemsJson from './generated/map-item-evidence.json';
import trainerEvidenceJson from './generated/trainer-identity-evidence.json';
import mapLotsJson from '../content/map-lots.json';

export type TrainerPartyMon = {
  speciesConstant: string;
  name: string;
  slug: string;
  family: string;
  level: number;
};

export type TrainerEngineRecord = {
  constant: string;
  name: string;
  trainerClass: { constant: string; label: string };
  trainerPic: string;
  partySymbol: string;
  party: TrainerPartyMon[];
};

export type TrainerIdentity = {
  batchId: string;
  batchTitle: string;
  logicalId: string;
  displayName: string;
  wikiTrainerClass: string;
  profile: string;
  battleRole: string;
  location: { zoneId: string; zoneName: string; mapIds: string[] };
  engineRecords: TrainerEngineRecord[];
  rematches: unknown[];
  identity: { summary: string };
};

export type EvolutionItemSource = {
  item: string;
  lot: string;
  source: string;
  availability: string;
  behavior: string;
  rom: {
    itemId: string;
    status: string;
    delivery: string;
    gate: string;
    correction?: string;
  };
};

export type MapItemEvidence = {
  id: string;
  lot: string | null;
  candidateLots: string[];
  lotBasis: 'map-evidence' | 'region-map-section' | 'unassigned';
  mapId: string;
  mapName: string;
  kind: 'visible' | 'hidden';
  itemId: string;
  name: string;
  quantity: number;
  position: { x: number; y: number };
  flag: string;
};

type TrainerEvidence = {
  summary: {
    logicalTrainers: number;
    campaignBatches: number;
    batchesWithTrainers: number;
    vanillaPartyRecords: number;
  };
  trainers: TrainerIdentity[];
};

type EvolutionItems = {
  summary: { evolutionItems: number; specialEvolutionRoutes: number };
  sources: EvolutionItemSource[];
};

type MapItems = {
  semantics: string;
  summary: { pickups: number; visible: number; hidden: number; assignedToLot: number; unassigned: number; maps: number };
  items: MapItemEvidence[];
};

type MapLots = {
  schemaVersion: 1;
  semantics: string;
  lots: Record<string, string[]>;
};

export const trainerEvidence = trainerEvidenceJson as TrainerEvidence;
export const evolutionItems = evolutionItemsJson as EvolutionItems;
const evolutionItemIds = new Set(evolutionItems.sources.map(source => source.rom.itemId));
export const isEvolutionItem = (itemId: string) => evolutionItemIds.has(itemId);

export type EggGift = { id: string; lot: string; options: string[]; location: string; requirement?: string };
export const eggGifts: EggGift[] = [
  { id: 'viridian', lot: '01A', options: ['Pichu', 'Azurill'], location: 'Viridian City Pokémon Center' },
  { id: 'daycare', lot: '03A', options: ['Cleffa', 'Igglybuff'], location: 'Route 5 Day Care' },
  { id: 'fuchsia', lot: '05F', options: ['Wynaut'], location: 'Fuchsia City Pokémon Center', requirement: 'After Koga' },
  { id: 'dojo', lot: '05J', options: ['Tyrogue'], location: 'Saffron City Fighting Dojo', requirement: 'Defeat the Karate Master' },
  { id: 'cinnabar', lot: '06E', options: ['Smoochum', 'Elekid', 'Magby'], location: 'Cinnabar Lab', requirement: 'After Blaine' },
  { id: 'togepi', lot: '09C', options: ['Togepi'], location: 'Water Labyrinth', requirement: 'High friendship with your lead Pokémon' },
];
export const eggGiftsForLot = (lot: string) => eggGifts.filter(gift => gift.lot === lot);
export const mapItems = mapItemsJson as MapItems;
const mapLots = mapLotsJson as MapLots;

export function trainersForLot(batchId: string) {
  return trainerEvidence.trainers.filter((trainer) => trainer.batchId === batchId);
}

export function itemSourcesForLot(batchId: string) {
  return evolutionItems.sources.filter((source) => source.lot === batchId);
}

export function mapItemsForLot(batchId: string) {
  return mapItems.items.filter((item) => item.lot === batchId);
}

export function mapLotsByAsset() {
  const lotsByAsset = new Map<string, Set<string>>();
  const add = (asset: string, lot: string) => {
    const lots = lotsByAsset.get(asset) ?? new Set<string>();
    lots.add(lot);
    lotsByAsset.set(asset, lots);
  };

  Object.entries(mapLots.lots).forEach(([lot, assets]) => {
    assets.forEach((asset) => add(asset, lot));
  });
  return lotsByAsset;
}

export function mapAssetsForLot(batchId: string) {
  return new Map((mapLots.lots[batchId] ?? []).map((slug) => [slug, slug]));
}
