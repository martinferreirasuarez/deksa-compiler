#ifndef GUARD_DEKSA_DIFFICULTY_H
#define GUARD_DEKSA_DIFFICULTY_H

enum DeksaDifficulty
{
    DEKSA_DIFFICULTY_STORY,
    DEKSA_DIFFICULTY_EASY,
    DEKSA_DIFFICULTY_NORMAL,
    DEKSA_DIFFICULTY_HARD,
    DEKSA_DIFFICULTY_DEKSLOCK,
    DEKSA_DIFFICULTY_COUNT,
};

// The intro chooses a pending mode before NewGameInitData clears the save.
// NewGameInitData then commits it to VAR_DEKSA_DIFFICULTY.
void Deksa_SetDifficulty(u8 difficulty);
void Deksa_ApplyDifficultyToNewGame(void);
u8 Deksa_GetDifficulty(void);

// The DEKSA KIT revives anywhere, including between League bosses, so it
// charges a multiple of the Center's price for the same service.
#define DEKSA_KIT_REVIVE_MULTIPLIER 3

bool8 Deksa_CanRevive(void);
u16 Deksa_GetReviveCost(u8 level);
u16 Deksa_GetKitReviveCost(u8 level);
u32 Deksa_GetStartingMoney(void);

#endif // GUARD_DEKSA_DIFFICULTY_H
