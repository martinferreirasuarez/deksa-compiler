import visualAssetsJson from './generated/visual-assets.json' with { type: 'json' };

export type VisualAsset = {
  slug: string;
  file: string;
  width: number;
  height: number;
  bytes: number;
  sha256: string;
};

type VisualAssets = {
  schemaVersion: 1;
  contentDigest: string;
  counts: Record<'maps' | 'trainers' | 'items' | 'pokemon', number>;
  assets: Record<'maps' | 'trainers' | 'items' | 'pokemon', VisualAsset[]>;
};

export const visualAssets = visualAssetsJson as VisualAssets;

const mapSlugs = new Set(visualAssets.assets.maps.map((asset) => asset.slug));
const trainerSlugs = new Set(visualAssets.assets.trainers.map((asset) => asset.slug));
const itemSlugs = new Set(visualAssets.assets.items.map((asset) => asset.slug));
const pokemonSlugs = new Set(visualAssets.assets.pokemon.map((asset) => asset.slug));

// Display names and ROM identifiers must resolve to the same existing file.
function compactAssetName(value: string) {
  return value.toLowerCase().replaceAll('♂', 'm').replaceAll('♀', 'f').replace(/[^a-z0-9]/g, '');
}
const pokemonAliases = new Map([...pokemonSlugs].map(slug => [compactAssetName(slug), slug]));
const itemAliases = new Map([...itemSlugs].map(slug => [compactAssetName(slug), slug]));

const mapAliases: Record<string, string> = {
  'pallet-town-professor-oaks-lab': 'oak-lab',
  'ss-anne-exterior': 'ss-anne-1f',
  'digletts-cave-b1f': 'diglett-cave',
  'five-island-meadow': 'five-isle-meadow',
  'five-island-memorial-pillar': 'memorial-pillar',
  'five-island-resort-gorgeous': 'resort-gorgeous',
  'five-island-water-labyrinth': 'water-labyrinth',
  'seven-island-sevault-canyon-entrance': 'canyon-entrance',
  'seven-island-sevault-canyon': 'sevault-canyon',
};

function normalizeIdentifier(value: string) {
  return value
    .replace(/^MAP_/, '')
    .replaceAll('_', '-')
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[^A-Za-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
}

function mapCandidates(value: string) {
  const normalized = normalizeIdentifier(value).replace(/^route(\d+)/, 'route-$1');
  const candidates = [mapAliases[normalized], normalized];

  if (/^route-21-(north|south)$/.test(normalized)) candidates.push('route-21');
  if (/^five-island-lost-cave-room-\d+$/.test(normalized)) candidates.push('lost-cave');
  if (normalized.startsWith('four-island-icefall-cave-')) candidates.push(normalized.replace('four-island-', ''));
  if (normalized.startsWith('mt-ember-ruby-path-')) {
    candidates.push(normalized.replace('mt-ember-', '').replace(/-stairs$/, ''));
  }
  if (normalized.startsWith('six-island-')) candidates.push(normalized.replace('six-island-', ''));
  if (normalized.startsWith('seven-island-tanoby-ruins')) candidates.push('tanoby-ruins');
  if (normalized.startsWith('seven-island-sevault-canyon')) candidates.push('sevault-canyon');
  if (normalized.endsWith('-city-gym')) candidates.push(normalized.replace('-city-gym', '-gym'));
  if (normalized.startsWith('pokemon-league-')) {
    const room = normalized.replace(/^pokemon-league-/, '').replace(/s-room$/, '').replace(/-room$/, '');
    candidates.push(`league-${room}`);
  }

  return candidates.filter((candidate): candidate is string => Boolean(candidate));
}

export function mapAssetSlug(value: string) {
  return mapCandidates(value).find((candidate) => mapSlugs.has(candidate)) ?? null;
}

export function trainerAssetSlug(trainerPic: string | undefined) {
  if (!trainerPic) return null;
  const normalized = trainerPic.replace(/^TRAINER_PIC_/, '').toLowerCase();
  const aliases: Record<string, string> = {
    rival_early: 'rival',
    rival_late: 'rival',
    champion_rival: 'champion-rival',
    psychic_f: 'psychic',
    psychic_m: 'psychic',
    rocket_grunt_f: 'rocket-grunt-f',
    rocket_grunt_m: 'rocket-grunt',
    swimmer_f: 'swimmer-female',
    swimmer_m: 'swimmer-male',
    pokemon_ranger_f: 'pokemon-ranger-female',
    pokemon_ranger_m: 'pokemon-ranger-male',
    tuber_f: 'tuber-female',
  };
  const candidate = (aliases[normalized] ?? normalized)
    .replace(/^leader_/, '')
    .replace(/^elite_four_/, '')
    .replaceAll('_', '-');
  return trainerSlugs.has(candidate) ? candidate : null;
}

export function itemAssetSlug(itemIdOrName: string) {
  const candidate = itemIdOrName
    .replace(/^ITEM_/, '')
    .trim()
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
  if (itemSlugs.has(candidate)) return candidate;
  const alias = itemAliases.get(compactAssetName(candidate));
  if (alias) return alias;
  if (/^deksa_candy_\d+$/.test(candidate)) return 'rare_candy';
  if (/^(tm|hm)\d+$/.test(candidate)) return 'tm_hm';
  if (/^(super|hyper|max)_potion$/.test(candidate) || candidate === 'full_restore') return 'large_potion';
  if (/heal|antidote|awakening|ice_heal|burn_heal/.test(candidate)) return 'status_heal';
  if (/^(hp_up|protein|iron|carbos|calcium|zinc)$/.test(candidate)) return 'vitamin';
  return null;
}

export function pokemonAssetSlug(speciesId: string) {
  return pokemonAliases.get(compactAssetName(speciesId.replace(/^SPECIES_/i, ''))) ?? null;
}

const labelOverrides: Record<string, string> = {
  'mt': 'Mt.',
  'ss': 'S.S.',
  'tm': 'TM',
  'hm': 'HM',
  'pokemon': 'Pokémon',
  'oaks': 'Oak',
};

export function assetLabel(slug: string) {
  return slug.split(/[-_]/).map((part) => {
    const lower = part.toLowerCase();
    if (labelOverrides[lower]) return labelOverrides[lower];
    if (/^(b?\d+)f$/.test(lower)) return lower.toUpperCase();
    if (/^\d+$/.test(lower)) return lower;
    return `${part.charAt(0).toUpperCase()}${part.slice(1)}`;
  }).join(' ').replace(/\b(B?\d+) F\b/g, '$1F');
}
