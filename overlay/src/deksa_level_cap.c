#include "global.h"
#include "deksa_level_cap.h"
#include "event_data.h"
#include "constants/flags.h"

u8 Deksa_GetLevelCap(void)
{
    if (!FlagGet(FLAG_BADGE01_GET))
        return DEKSA_PRE_BROCK_LEVEL_CAP;

    return DEKSA_PRE_MISTY_LEVEL_CAP;
}
