import { readTrainerPublication, trainerV21Card, type TrainerPublicationEntry, type TrainerPublication } from "./trainer-v21";
export type TrainerV28 = TrainerPublication<"v28">;
export type TrainerV28Entry = TrainerPublicationEntry<"v28">;
export const trainerV28Card = trainerV21Card;
export function readTrainerV28(loadText?: (filename: string) => Promise<string>): Promise<TrainerV28Entry[]> {
  return readTrainerPublication("v28", loadText);
}
