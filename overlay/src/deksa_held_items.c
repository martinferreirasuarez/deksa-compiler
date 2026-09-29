#include "global.h"
#include "deksa_held_items.h"
#include "item.h"
#include "pokemon.h"
#include "constants/items.h"
#include "constants/species.h"

static EWRAM_DATA u8 sBattleChangedHeldItemSlots = 0;

const u8 gText_DeksaPartyAlreadyHasHeldItem[] = _(
    "That item is already held by\n"
    "another party POKéMON.");

bool8 DeksaCanPartyMonHoldItem(u8 partySlot, u16 item)
{
    u8 i;

    if (item == ITEM_NONE)
        return TRUE;

    for (i = 0; i < PARTY_SIZE; i++)
    {
        if (i != partySlot
         && GetMonData(&gPlayerParty[i], MON_DATA_SPECIES) != SPECIES_NONE
         && GetMonData(&gPlayerParty[i], MON_DATA_HELD_ITEM) == item)
            return FALSE;
    }

    return TRUE;
}

bool8 DeksaCanMonJoinParty(struct Pokemon *mon)
{
    return DeksaCanPartyMonHoldItem(PARTY_SIZE, GetMonData(mon, MON_DATA_HELD_ITEM));
}

bool8 DeksaPartyHeldItemsAreUnique(void)
{
    u8 i;

    for (i = 0; i < PARTY_SIZE; i++)
    {
        u16 item = GetMonData(&gPlayerParty[i], MON_DATA_HELD_ITEM);

        if (!DeksaCanPartyMonHoldItem(i, item))
            return FALSE;
    }

    return TRUE;
}

bool8 DeksaTryStoreHeldItemOutsideParty(u16 item)
{
    if (item == ITEM_NONE)
        return TRUE;
    if (AddBagItem(item, 1))
        return TRUE;
    return AddPCItem(item, 1);
}

void DeksaBeginBattleHeldItemTracking(void)
{
    sBattleChangedHeldItemSlots = 0;
}

void DeksaMarkBattleHeldItemChanged(u8 partySlot)
{
    if (partySlot < PARTY_SIZE)
        sBattleChangedHeldItemSlots |= 1 << partySlot;
}

bool8 DeksaResolveBattleHeldItemDuplicates(void)
{
    u8 i;
    bool8 resolved = TRUE;

    for (i = 0; i < PARTY_SIZE; i++)
    {
        if (sBattleChangedHeldItemSlots & (1 << i))
        {
            u16 item = GetMonData(&gPlayerParty[i], MON_DATA_HELD_ITEM);

            if (!DeksaCanPartyMonHoldItem(i, item))
            {
                if (DeksaTryStoreHeldItemOutsideParty(item))
                {
                    item = ITEM_NONE;
                    SetMonData(&gPlayerParty[i], MON_DATA_HELD_ITEM, &item);
                }
                else
                {
                    // Preserve the item on the Pokémon if both inventories are
                    // full. Item loss is never an acceptable fallback.
                    resolved = FALSE;
                }
            }
        }
    }

    sBattleChangedHeldItemSlots = 0;
    return resolved;
}
