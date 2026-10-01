import { readTrainerPublication, trainerV21Card, type TrainerPublicationEntry, type TrainerPublication } from "./trainer-v21";
export type TrainerV26 = TrainerPublication<"v26">;
export type TrainerV26Entry = TrainerPublicationEntry<"v26">;
export const trainerV26Card = trainerV21Card;
export function readTrainerV26(loadText?: (filename: string) => Promise<string>): Promise<TrainerV26Entry[]> {
  return readTrainerPublication("v26", loadText);
}
