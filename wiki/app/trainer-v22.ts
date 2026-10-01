import { readTrainerPublication, trainerV21Card, type TrainerPublicationEntry, type TrainerPublication } from "./trainer-v21";

export type TrainerV22 = TrainerPublication<"v22">;
export type TrainerV22Entry = TrainerPublicationEntry<"v22">;
export const trainerV22Card = trainerV21Card;
export function readTrainerV22(loadText?: (filename: string) => Promise<string>): Promise<TrainerV22Entry[]> {
  return readTrainerPublication("v22", loadText);
}
