#ifndef GUARD_DEKSA_R4_TRAINERS_H
#define GUARD_DEKSA_R4_TRAINERS_H

u32 DeksaR4_AdjustTrainerPersonality(u16 trainerId, u8 partySlot, u16 species, u32 personality);
bool8 DeksaR4_GetTrainerReward(u16 trainerId, u32 *reward);

#endif // GUARD_DEKSA_R4_TRAINERS_H
