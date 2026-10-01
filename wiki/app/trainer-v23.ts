import { readTrainerPublication, trainerV21Card, type TrainerPublicationEntry, type TrainerPublication } from "./trainer-v21";

export type TrainerV23 = TrainerPublication<"v23">;
export type TrainerV23Entry = TrainerPublicationEntry<"v23">;
export const trainerV23Card = trainerV21Card;
export function readTrainerV23(loadText?: (filename: string) => Promise<string>): Promise<TrainerV23Entry[]> {
  return readTrainerPublication("v23", loadText);
}
