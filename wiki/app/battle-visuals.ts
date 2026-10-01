import battleTypesJson from "./generated/battle-types.json";

type BattleTypes = {
  species: Record<string, string[]>;
  moveDetails: Record<string, { type: string }>;
};

const battleTypes = battleTypesJson as BattleTypes;
const normalizedMoveTypes = new Map(Object.entries(battleTypes.moveDetails).map(([name, details]) => [
  name.toLowerCase().replace(/[^a-z0-9]/g, ""), details.type,
]));

const typeLabels: Record<string, string> = {
  bug: "Bug",
  dark: "Dark",
  dragon: "Dragon",
  electric: "Electric",
  fighting: "Fighting",
  fire: "Fire",
  flying: "Flying",
  ghost: "Ghost",
  grass: "Grass",
  ground: "Ground",
  ice: "Ice",
  mystery: "???",
  normal: "Normal",
  poison: "Poison",
  psychic: "Psychic",
  rock: "Rock",
  steel: "Steel",
  water: "Water",
};

export type BattleTypePresentation = {
  id: string;
  label: string;
  className: string;
};

export function battleTypePresentation(type: string | undefined) {
  const id = type && typeLabels[type] ? type : "mystery";
  return {
    id,
    label: typeLabels[id],
    className: `type-${id}`,
  } satisfies BattleTypePresentation;
}

export function pokemonTypePresentations(speciesSlug: string) {
  return (battleTypes.species[speciesSlug] ?? ["mystery"]).map(
    battleTypePresentation,
  );
}

export function moveTypePresentation(moveName: string) {
  return battleTypePresentation(battleTypes.moveDetails[moveName]?.type
    ?? normalizedMoveTypes.get(moveName.toLowerCase().replace(/[^a-z0-9]/g, "")));
}
