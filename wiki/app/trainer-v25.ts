import { readTrainerPublication, trainerV21Card, type TrainerPublicationEntry, type TrainerPublication } from "./trainer-v21";

export type TrainerV25 = TrainerPublication<"v25">;
export type TrainerV25Entry = TrainerPublicationEntry<"v25">;
export const trainerV25Card = trainerV21Card;
export function readTrainerV25(loadText?: (filename: string) => Promise<string>): Promise<TrainerV25Entry[]> {
  return readTrainerPublication("v25", loadText);
}
