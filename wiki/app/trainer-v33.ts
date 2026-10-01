import { readTrainerPublication, trainerV21Card, type TrainerPublication, type TrainerPublicationEntry } from "./trainer-v21";
export type TrainerV33 = TrainerPublication<"v33">;
export type TrainerV33Entry = TrainerPublicationEntry<"v33">;
export const trainerV33Card = trainerV21Card;
export function readTrainerV33(loadText?: (filename: string) => Promise<string>): Promise<TrainerV33Entry[]> {
  return readTrainerPublication("v33", loadText);
}
