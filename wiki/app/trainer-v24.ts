import { readTrainerPublication, trainerV21Card, type TrainerPublicationEntry, type TrainerPublication } from "./trainer-v21";

export type TrainerV24 = TrainerPublication<"v24">;
export type TrainerV24Entry = TrainerPublicationEntry<"v24">;
export const trainerV24Card = trainerV21Card;
export function readTrainerV24(loadText?: (filename: string) => Promise<string>): Promise<TrainerV24Entry[]> {
  return readTrainerPublication("v24", loadText);
}
