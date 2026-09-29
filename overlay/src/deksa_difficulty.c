#include "global.h"
#include "deksa_difficulty.h"
#include "event_data.h"
#include "constants/vars.h"

#define DEKSA_STARTING_MONEY_BASE 3000

// Zero means that the intro did not choose a mode. Stored choices use the same
// one-based representation as the save variable so zero can remain Normal for
// both old saves and a new game started without the difficulty picker.
EWRAM_DATA static u8 sPendingDifficulty = 0;

static u8 DecodeDifficulty(u16 storedDifficulty)
{
    if (storedDifficulty >= 1 && storedDifficulty <= DEKSA_DIFFICULTY_COUNT)
        return storedDifficulty - 1;

    return DEKSA_DIFFICULTY_NORMAL;
}

void Deksa_SetDifficulty(u8 difficulty)
{
    if (difficulty >= DEKSA_DIFFICULTY_COUNT)
        difficulty = DEKSA_DIFFICULTY_NORMAL;

    sPendingDifficulty = difficulty + 1;
}

void Deksa_ApplyDifficultyToNewGame(void)
{
    VarSet(VAR_DEKSA_DIFFICULTY, sPendingDifficulty);
    sPendingDifficulty = 0;
}

u8 Deksa_GetDifficulty(void)
{
    return DecodeDifficulty(VarGet(VAR_DEKSA_DIFFICULTY));
}

bool8 Deksa_CanRevive(void)
{
    return Deksa_GetDifficulty() != DEKSA_DIFFICULTY_DEKSLOCK;
}

u16 Deksa_GetReviveCost(u8 level)
{
    switch (Deksa_GetDifficulty())
    {
    case DEKSA_DIFFICULTY_STORY:
        return 0;
    case DEKSA_DIFFICULTY_EASY:
        return (level * 25 + 7) / 8;
    case DEKSA_DIFFICULTY_HARD:
        return (level * 25 + 1) / 2;
    case DEKSA_DIFFICULTY_DEKSLOCK:
        return 0;
    case DEKSA_DIFFICULTY_NORMAL:
    default:
        return (level * 25 + 3) / 4;
    }
}

// Story keeps its free revives here too: three times nothing is nothing.
u16 Deksa_GetKitReviveCost(u8 level)
{
    return Deksa_GetReviveCost(level) * DEKSA_KIT_REVIVE_MULTIPLIER;
}

u32 Deksa_GetStartingMoney(void)
{
    if (Deksa_GetDifficulty() == DEKSA_DIFFICULTY_DEKSLOCK)
        return DEKSA_STARTING_MONEY_BASE;

    return DEKSA_STARTING_MONEY_BASE + Deksa_GetReviveCost(5);
}
