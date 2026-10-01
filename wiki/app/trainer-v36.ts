import { readTrainerPublication, type TrainerPublication, type TrainerPublicationEntry } from "./trainer-v21";
import { trainerV34Card } from "./trainer-v34";
export type TrainerV36 = TrainerPublication<"v36">;
export type TrainerV36Entry = TrainerPublicationEntry<"v36">;
export const trainerV36Card = trainerV34Card;
export function readTrainerV36(loadText?: (filename: string) => Promise<string>): Promise<TrainerV36Entry[]> {
  return readTrainerPublication("v36", loadText);
}
