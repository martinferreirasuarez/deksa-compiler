#ifndef GUARD_DEKSA_HELD_ITEMS_H
#define GUARD_DEKSA_HELD_ITEMS_H

struct Pokemon;

// PARTY_SIZE means that no existing party slot should be ignored.
bool8 DeksaCanPartyMonHoldItem(u8 partySlot, u16 item);
bool8 DeksaCanMonJoinParty(struct Pokemon *mon);
bool8 DeksaPartyHeldItemsAreUnique(void);
bool8 DeksaTryStoreHeldItemOutsideParty(u16 item);
void DeksaBeginBattleHeldItemTracking(void);
void DeksaMarkBattleHeldItemChanged(u8 partySlot);
bool8 DeksaResolveBattleHeldItemDuplicates(void);

extern const u8 gText_DeksaPartyAlreadyHasHeldItem[];

#endif // GUARD_DEKSA_HELD_ITEMS_H
