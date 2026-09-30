#include "global.h"
#include "deksa_level_cap.h"
#include "event_data.h"
#include "constants/flags.h"
#include "constants/vars.h"

u8 Deksa_GetLevelCap(void)
{
    if (!FlagGet(FLAG_BADGE01_GET))
        return DEKSA_PRE_BROCK_LEVEL_CAP;
    if (!FlagGet(FLAG_BADGE02_GET))
        return DEKSA_PRE_MISTY_LEVEL_CAP;
    if (!FlagGet(FLAG_BADGE03_GET))
        return DEKSA_PRE_SURGE_LEVEL_CAP;
    if (!FlagGet(FLAG_BADGE04_GET))
        return DEKSA_PRE_ERIKA_LEVEL_CAP;
    if (!FlagGet(FLAG_BADGE05_GET) || !FlagGet(FLAG_BADGE06_GET))
        return DEKSA_PRE_KOGA_SABRINA_LEVEL_CAP;
    if (!FlagGet(FLAG_BADGE07_GET))
        return DEKSA_PRE_BLAINE_LEVEL_CAP;
    if (!FlagGet(FLAG_BADGE08_GET))
        return DEKSA_PRE_GIOVANNI_LEVEL_CAP;
    if (!FlagGet(FLAG_SYS_GAME_CLEAR))
        return DEKSA_PRE_LEAGUE_LEVEL_CAP;
    if (VarGet(VAR_MAP_SCENE_ONE_ISLAND_POKEMON_CENTER_1F) < 5)
        return DEKSA_PRE_RUBY_LEVEL_CAP;
    if (!FlagGet(FLAG_SYS_CAN_LINK_WITH_RS))
        return DEKSA_PRE_SAPPHIRE_LEVEL_CAP;

    return DEKSA_REMATCH_LEAGUE_LEVEL_CAP;
}
