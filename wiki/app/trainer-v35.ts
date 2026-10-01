import { readTrainerPublication, type TrainerPublication, type TrainerPublicationEntry } from "./trainer-v21";
import { trainerV34Card } from "./trainer-v34";
export type TrainerV35 = TrainerPublication<"v35">;
export type TrainerV35Entry = TrainerPublicationEntry<"v35">;
export const trainerV35Card = trainerV34Card;
export function readTrainerV35(loadText?: (filename: string) => Promise<string>): Promise<TrainerV35Entry[]> {
  return readTrainerPublication("v35", loadText);
}
