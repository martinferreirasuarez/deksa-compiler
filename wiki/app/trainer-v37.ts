import { readTrainerPublication, type TrainerPublication, type TrainerPublicationEntry } from "./trainer-v21";
import { trainerV34Card } from "./trainer-v34";
export type TrainerV37 = TrainerPublication<"v37">;
export type TrainerV37Entry = TrainerPublicationEntry<"v37">;
export const trainerV37Card = trainerV34Card;
export function readTrainerV37(loadText?: (filename: string) => Promise<string>): Promise<TrainerV37Entry[]> {
  return readTrainerPublication("v37", loadText);
}
