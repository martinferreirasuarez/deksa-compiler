import { readTrainerPublication, trainerV21Card, type TrainerPublication, type TrainerPublicationEntry } from "./trainer-v21";
export type TrainerV32 = TrainerPublication<"v32">;
export type TrainerV32Entry = TrainerPublicationEntry<"v32">;
export const trainerV32Card = trainerV21Card;
export function readTrainerV32(loadText?: (filename: string) => Promise<string>): Promise<TrainerV32Entry[]> {
  return readTrainerPublication("v32", loadText);
}
