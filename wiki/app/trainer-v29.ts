import { readTrainerPublication, trainerV21Card, type TrainerPublicationEntry, type TrainerPublication } from "./trainer-v21";
export type TrainerV29 = TrainerPublication<"v29">;
export type TrainerV29Entry = TrainerPublicationEntry<"v29">;
export const trainerV29Card = trainerV21Card;
export function readTrainerV29(loadText?: (filename: string) => Promise<string>): Promise<TrainerV29Entry[]> {
  return readTrainerPublication("v29", loadText);
}
