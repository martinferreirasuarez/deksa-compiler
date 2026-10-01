import { readTrainerPublication, type TrainerPublication, type TrainerPublicationEntry } from "./trainer-v21";
import { trainerV34Card } from "./trainer-v34";
export type TrainerV40 = TrainerPublication<"v40">;
export type TrainerV40Entry = TrainerPublicationEntry<"v40">;
export const trainerV40Card = trainerV34Card;
export function readTrainerV40(loadText?: (filename: string) => Promise<string>): Promise<TrainerV40Entry[]> {
  return readTrainerPublication("v40", loadText);
}
