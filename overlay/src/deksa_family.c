#include "global.h"
#include "deksa_family.h"
#include "pokedex.h"
#include "pokemon.h"
#include "constants/pokedex.h"
#include "constants/species.h"
#include "data/deksa_family_by_national_dex.h"

// The persistent ledger is the union of the vanilla CAUGHT bits belonging to
// a canonical family. It deliberately adds no save field of its own.
u8 DeksaGetSpeciesFamilyId(u16 species)
{
    u16 nationalDex;

    if (species == SPECIES_NONE || species >= NUM_SPECIES)
        return 0;

    nationalDex = SpeciesToNationalPokedexNum(species);
    if (nationalDex == NATIONAL_DEX_NONE || nationalDex > NATIONAL_DEX_COUNT)
        return 0;

    return sDeksaFamilyByNationalDex[nationalDex];
}

bool8 DeksaFamilyWasAcquired(u16 species)
{
    u16 nationalDex;
    u8 familyId = DeksaGetSpeciesFamilyId(species);

    // An unmapped species is rejected fail-closed by treating it as unavailable.
    if (familyId == 0)
        return TRUE;

    for (nationalDex = 1; nationalDex <= NATIONAL_DEX_COUNT; nationalDex++)
    {
        if (sDeksaFamilyByNationalDex[nationalDex] == familyId
         && GetSetPokedexFlag(nationalDex, FLAG_GET_CAUGHT))
            return TRUE;
    }

    return FALSE;
}

bool8 DeksaCanAcquireSpecies(u16 species)
{
    return DeksaGetSpeciesFamilyId(species) != 0 && !DeksaFamilyWasAcquired(species);
}

void DeksaCommitSpeciesAcquisition(u16 species)
{
    u16 nationalDex = SpeciesToNationalPokedexNum(species);

    if (DeksaGetSpeciesFamilyId(species) == 0)
        return;

    GetSetPokedexFlag(nationalDex, FLAG_SET_SEEN);
    GetSetPokedexFlag(nationalDex, FLAG_SET_CAUGHT);
}
