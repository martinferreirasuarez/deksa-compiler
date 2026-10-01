import planJson from "../trainer-authoring/v7/plan/windows.generated.json" with { type: "json" };

const windows = planJson.windows;
const windowByLot = new Map(windows.flatMap((window) =>
  window.batches.map((lotId) => [lotId, window] as const),
));

const sectionNames: Record<string, string> = {
  W01: "Before Brock",
  W02: "Before Misty",
  W03: "Before Lt. Surge",
  W04: "Before Erika",
  W05: "Before Koga",
  W06: "Before Sabrina",
  W07: "Before Blaine",
  W08: "Before Giovanni",
  W09: "Pokémon League",
  W10: "The Ruby",
  W11: "The Sapphire",
  W12: "League rematch",
};

const stageNames: Record<string, string> = {
  "01A": "Pallet Town to Pewter City",
  "02A": "Route 3 and Mt. Moon entrance",
  "02B": "Mt. Moon",
  "02C": "Cerulean City and Nugget Bridge",
  "02D": "Route 25 and Cerulean Gym",
  "03A": "Arrival in Vermilion City",
  "03B": "S.S. Anne: deck and basement",
  "03C": "S.S. Anne: rival and upper floors",
  "03D": "Route 11 and Vermilion Gym",
  "04A": "Route 9",
  "04B": "Rock Tunnel",
  "04C": "Lavender Town and Pokémon Tower",
  "04D": "Route 8 and Celadon City",
  "04E": "Rocket Hideout: upper floors",
  "04F": "Rocket Hideout: Giovanni",
  "04G": "Celadon Gym",
  "05A": "Pokémon Tower and Mr. Fuji",
  "05B": "Routes 12 and 13",
  "05C": "Routes 14 and 15",
  "05D": "Route 16",
  "05E": "Routes 17 and 18",
  "05F": "Safari Zone and Fuchsia Gym",
  "05G": "Silph Co.: lower floors",
  "05H": "Silph Co.: side rooms",
  "05I": "Silph Co.: rival and Giovanni",
  "05J": "Fighting Dojo and Saffron Gym",
  "06A": "Route 10 and Power Plant",
  "06B": "Route 19",
  "06C": "Route 20 and Seafoam Islands",
  "06D": "Route 21 and Cinnabar Lab",
  "06E": "Pokémon Mansion and Cinnabar Gym",
  "07A": "One Island and Mt. Ember",
  "07B": "Three Island and Bond Bridge",
  "07C": "Berry Forest",
  "07D": "Viridian Gym",
  "08A": "Route 23 and rival",
  "08B": "Victory Road",
  "08C": "Elite Four and Champion",
  "09A": "Mt. Ember and the Ruby",
  "09B": "Four Island and Icefall Cave",
  "09C": "Five Island",
  "09D": "Six Island: north",
  "09E": "Seven Island and Tanoby Ruins",
  "09F": "Ruin Valley and Dotted Hole",
  "09G": "Rocket Warehouse and the Sapphire",
  "09H": "Cerulean Cave and special encounters",
  "09I": "Elite Four and Champion rematch",
};

export function sectionName(windowId: string) {
  const name = sectionNames[windowId.slice(0, 3)];
  if (!name) throw new Error(`Sección sin nombre: ${windowId}`);
  return name;
}

export function stageForLot(lotId: string) {
  const window = windowByLot.get(lotId);
  const title = stageNames[lotId];
  if (!window || !title) throw new Error(`Etapa sin nombre: ${lotId}`);
  const number = window.batches.indexOf(lotId) + 1;
  return { number, title, section: sectionName(window.id) };
}

export function stageReference(lotId: string) {
  const stage = stageForLot(lotId);
  return `${stage.section} · Part ${stage.number}`;
}

export function stageOptions() {
  return windows.flatMap((window) => window.batches.map((lotId) => ({
    id: lotId,
    label: `${stageReference(lotId)} · ${stageForLot(lotId).title}`,
  })));
}
