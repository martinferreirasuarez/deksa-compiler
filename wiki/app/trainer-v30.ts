import { readTrainerPublication, trainerV21Card, type TrainerPublication, type TrainerPublicationEntry } from "./trainer-v21";
export type TrainerV30 = TrainerPublication<"v30">;
export type TrainerV30Entry = TrainerPublicationEntry<"v30">;
export const trainerV30Card = trainerV21Card;
export function readTrainerV30(loadText?: (filename: string) => Promise<string>): Promise<TrainerV30Entry[]> {
  return readTrainerPublication("v30", loadText);
}
