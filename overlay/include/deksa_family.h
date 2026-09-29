#ifndef GUARD_DEKSA_FAMILY_H
#define GUARD_DEKSA_FAMILY_H

u8 DeksaGetSpeciesFamilyId(u16 species);
bool8 DeksaFamilyWasAcquired(u16 species);
bool8 DeksaCanAcquireSpecies(u16 species);
void DeksaCommitSpeciesAcquisition(u16 species);

#endif // GUARD_DEKSA_FAMILY_H
