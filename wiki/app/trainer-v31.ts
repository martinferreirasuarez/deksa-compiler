import { readTrainerPublication, trainerV21Card, type TrainerPublication, type TrainerPublicationEntry } from "./trainer-v21";
export type TrainerV31 = TrainerPublication<"v31">;
export type TrainerV31Entry = TrainerPublicationEntry<"v31">;
export const trainerV31Card = trainerV21Card;
export function readTrainerV31(loadText?: (filename: string) => Promise<string>): Promise<TrainerV31Entry[]> {
  return readTrainerPublication("v31", loadText);
}
