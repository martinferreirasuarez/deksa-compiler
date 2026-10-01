import { readTrainerPublication, trainerV21Card, type TrainerPublication, type TrainerPublicationEntry, type PlayerStarter } from "./trainer-v21";
export type TrainerV34 = TrainerPublication<"v34">;
export type TrainerV34Entry = TrainerPublicationEntry<"v34">;
export function readTrainerV34(loadText?: (filename: string) => Promise<string>): Promise<TrainerV34Entry[]> {
  return readTrainerPublication("v34", loadText);
}
export function trainerV34Card(trainer: Omit<TrainerV34, "generatorId">, variant: "A" | "B" | "C", playerStarter?: PlayerStarter) {
  // Empty display text is a presentation default, never added to sealed evidence.
  const display = structuredClone(trainer);
  for (const team of Object.values(display.variants)) {
    team.strategy ??= "";
    team.orderRationale ??= "";
    for (const member of team.members) if ("species" in member) member.intent ??= [];
    for (const branch of Object.values(team.branches ?? {})) for (const member of branch.members) member.intent ??= [];
  }
  return trainerV21Card(display, variant, playerStarter);
}
