#include "global.h"
#include "deksa_kit.h"
#include "deksa_difficulty.h"
#include "event_object_lock.h"
#include "menu.h"
#include "new_menu_helpers.h"
#include "overworld.h"
#include "party_menu.h"
#include "pokemon.h"
#include "script.h"
#include "script_pokemon_util.h"
#include "sound.h"
#include "string_util.h"
#include "strings.h"
#include "task.h"
#include "text_window.h"
#include "window.h"
#include "constants/moves.h"
#include "constants/songs.h"

static void Task_DeksaKitDrawMenu(u8 taskId);
static void Task_DeksaKitHandleInput(u8 taskId);
static void Task_DeksaKitFinish(u8 taskId);
static void Task_DeksaKitUnusedAction(u8 taskId);
static bool8 DeksaKit_PartyNeedsHealing(void);
static void Task_DeksaKitReviveAllConfirm(u8 taskId);
static void Task_DeksaKitReviveAllInput(u8 taskId);

static const u8 sText_DeksaKitPrompt[] = _("DÉKSA KIT\nWhat do you want to do?");
static const u8 sText_HealOne[] = _("HEAL ONE");
static const u8 sText_HealAll[] = _("HEAL ALL");
static const u8 sText_ReviveOne[] = _("REVIVE ONE");
static const u8 sText_ReviveAll[] = _("REVIVE ALL");
static const u8 sText_Cancel[] = _("CANCEL");
static const u8 sText_NoFainted[] = _("There are no fainted POKéMON\nin your team.{PAUSE_UNTIL_PRESS}");
static const u8 sText_NotEnoughMoney[] = _("You don't have enough money for\nthat revival.{PAUSE_UNTIL_PRESS}");
static const u8 sText_TeamReviveQuote[] = _("Revive all fainted POKéMON?\nThe total is ¥{STR_VAR_2}.");
static const u8 sText_TeamRevived[] = _("All fainted POKéMON were revived\nand fully restored.{PAUSE_UNTIL_PRESS}");
static const u8 sText_MonRevived[] = _("{STR_VAR_1} was revived for ¥{STR_VAR_2}\nand fully restored.{PAUSE_UNTIL_PRESS}");
static const u8 sText_NoPokemon[] = _("There are no POKéMON to heal.{PAUSE_UNTIL_PRESS}");
static const u8 sText_NoEffect[] = _("It will have no effect.{PAUSE_UNTIL_PRESS}");
static const u8 sText_PartyHealed[] = _("Your living POKéMON were\nfully healed!{PAUSE_UNTIL_PRESS}");
static const u8 sText_MonHealed[] = _("{STR_VAR_1} was fully healed!{PAUSE_UNTIL_PRESS}");

enum
{
    DEKSA_KIT_HEAL_ONE,
    DEKSA_KIT_HEAL_ALL,
    DEKSA_KIT_REVIVE_ONE,
    DEKSA_KIT_REVIVE_ALL,
    DEKSA_KIT_CANCEL,
    DEKSA_KIT_ACTION_COUNT,
};

static const struct MenuAction sDeksaKitMenuActions[DEKSA_KIT_ACTION_COUNT] =
{
    [DEKSA_KIT_HEAL_ONE]   = {sText_HealOne,   Task_DeksaKitUnusedAction},
    [DEKSA_KIT_HEAL_ALL]   = {sText_HealAll,   Task_DeksaKitUnusedAction},
    [DEKSA_KIT_REVIVE_ONE] = {sText_ReviveOne, Task_DeksaKitUnusedAction},
    [DEKSA_KIT_REVIVE_ALL] = {sText_ReviveAll, Task_DeksaKitUnusedAction},
    [DEKSA_KIT_CANCEL]     = {sText_Cancel,    Task_DeksaKitUnusedAction},
};

static const struct WindowTemplate sDeksaKitMenuWindowTemplate =
{
    .bg = 0,
    .tilemapLeft = 17,
    .tilemapTop = 7,
    .width = 12,
    .height = 8,
    .paletteNum = 15,
    .baseBlock = 0x100,
};

static EWRAM_DATA u8 sDeksaKitMenuWindowId = WINDOW_NONE;
// DEKSLOCK never revives anywhere, so its KIT does not offer the option at all
// rather than showing entries that would always refuse. The layout is a pure
// function of the difficulty, so both tables live in ROM: EWRAM is nearly full.
static const u8 sDeksaKitMenuOrderNoRevive[] =
{
    DEKSA_KIT_HEAL_ONE, DEKSA_KIT_HEAL_ALL, DEKSA_KIT_CANCEL,
};

static const u8 sDeksaKitMenuOrderWithRevive[] =
{
    DEKSA_KIT_HEAL_ONE, DEKSA_KIT_HEAL_ALL,
    DEKSA_KIT_REVIVE_ONE, DEKSA_KIT_REVIVE_ALL, DEKSA_KIT_CANCEL,
};

static const u8 *GetDeksaKitMenuOrder(void)
{
    return Deksa_CanRevive() ? sDeksaKitMenuOrderWithRevive : sDeksaKitMenuOrderNoRevive;
}

static u8 GetDeksaKitMenuCount(void)
{
    return Deksa_CanRevive() ? ARRAY_COUNT(sDeksaKitMenuOrderWithRevive)
                             : ARRAY_COUNT(sDeksaKitMenuOrderNoRevive);
}

static void OpenDeksaKitPartyMenu(u8 taskId)
{
    ClearDialogWindowAndFrame(0, TRUE);
    ClearPlayerHeldMovementAndUnfreezeObjectEvents();
    UnlockPlayerFieldControls();
    DestroyTask(taskId);
    SetMainCallback2(CB2_ShowPartyMenuForDeksaKit);
}

static void Task_DeksaKitUnusedAction(u8 taskId)
{
    (void)taskId;
}

static void CloseDeksaKitMenu(void)
{
    if (sDeksaKitMenuWindowId != WINDOW_NONE)
    {
        ClearStdWindowAndFrameToTransparent(sDeksaKitMenuWindowId, FALSE);
        ClearWindowTilemap(sDeksaKitMenuWindowId);
        RemoveWindow(sDeksaKitMenuWindowId);
        sDeksaKitMenuWindowId = WINDOW_NONE;
        ScheduleBgCopyTilemapToVram(0);
    }
}

static void ReturnToFieldAfterDeksaKit(u8 taskId)
{
    ClearDialogWindowAndFrame(0, TRUE);
    DestroyTask(taskId);
    ClearPlayerHeldMovementAndUnfreezeObjectEvents();
    UnlockPlayerFieldControls();
}

void DeksaKit_OpenMenu(u8 taskId)
{
    DisplayItemMessageOnField(taskId, FONT_NORMAL, sText_DeksaKitPrompt, Task_DeksaKitDrawMenu);
}

static void Task_DeksaKitDrawMenu(u8 taskId)
{
    struct WindowTemplate template = sDeksaKitMenuWindowTemplate;

    template.height = 2 + 2 * GetDeksaKitMenuCount();
    template.tilemapTop = 15 - template.height;
    sDeksaKitMenuWindowId = AddWindow(&template);
    if (sDeksaKitMenuWindowId == WINDOW_NONE)
    {
        DisplayItemMessageOnField(taskId, FONT_NORMAL, sText_NoEffect, Task_DeksaKitFinish);
        return;
    }

    SetStdWindowBorderStyle(sDeksaKitMenuWindowId, FALSE);
    AddItemMenuActionTextPrinters(sDeksaKitMenuWindowId, FONT_NORMAL,
                                  GetMenuCursorDimensionByFont(FONT_NORMAL, 0), 2,
                                  GetFontAttribute(FONT_NORMAL, FONTATTR_LETTER_SPACING), 16,
                                  GetDeksaKitMenuCount(), sDeksaKitMenuActions,
                                  GetDeksaKitMenuOrder());
    Menu_InitCursor(sDeksaKitMenuWindowId, FONT_NORMAL, 0, 2, 16,
                    GetDeksaKitMenuCount(), 0);
    ScheduleBgCopyTilemapToVram(0);
    gTasks[taskId].func = Task_DeksaKitHandleInput;
}

static void Task_DeksaKitHandleInput(u8 taskId)
{
    s8 input = Menu_ProcessInputNoWrapAround();
    u8 action;

    if (input == MENU_NOTHING_CHOSEN)
        return;

    PlaySE(SE_SELECT);
    CloseDeksaKitMenu();

    if (input == MENU_B_PRESSED || input < 0 || input >= GetDeksaKitMenuCount())
        action = DEKSA_KIT_CANCEL;
    else
        action = GetDeksaKitMenuOrder()[input];

    if (action != DEKSA_KIT_CANCEL && CalculatePlayerPartyCount() == 0)
    {
        DisplayItemMessageOnField(taskId, FONT_NORMAL, sText_NoPokemon, Task_DeksaKitFinish);
        return;
    }

    switch (action)
    {
    case DEKSA_KIT_HEAL_ONE:
        gItemUseCB = ItemUseCB_DeksaKitSingle;
        OpenDeksaKitPartyMenu(taskId);
        break;
    case DEKSA_KIT_HEAL_ALL:
        if (!DeksaKit_PartyNeedsHealing())
        {
            DisplayItemMessageOnField(taskId, FONT_NORMAL, sText_NoEffect, Task_DeksaKitFinish);
        }
        else
        {
            HealPlayerParty();
            PlaySE(SE_USE_ITEM);
            DisplayItemMessageOnField(taskId, FONT_NORMAL, sText_PartyHealed, Task_DeksaKitFinish);
        }
        break;
    case DEKSA_KIT_REVIVE_ONE:
        if (DeksaKit_CountRevivableMons() == 0)
        {
            DisplayItemMessageOnField(taskId, FONT_NORMAL, sText_NoFainted, Task_DeksaKitFinish);
        }
        else
        {
            gItemUseCB = ItemUseCB_DeksaKitRevive;
            OpenDeksaKitPartyMenu(taskId);
        }
        break;
    case DEKSA_KIT_REVIVE_ALL:
        if (DeksaKit_CountRevivableMons() == 0)
        {
            DisplayItemMessageOnField(taskId, FONT_NORMAL, sText_NoFainted, Task_DeksaKitFinish);
        }
        else
        {
            ConvertIntToDecimalStringN(gStringVar2, DeksaKit_PartyReviveCost(),
                                       STR_CONV_MODE_LEFT_ALIGN, 6);
            StringExpandPlaceholders(gStringVar4, sText_TeamReviveQuote);
            DisplayItemMessageOnField(taskId, FONT_NORMAL, gStringVar4, Task_DeksaKitReviveAllConfirm);
        }
        break;
    case DEKSA_KIT_CANCEL:
    default:
        ReturnToFieldAfterDeksaKit(taskId);
        break;
    }
}

static void Task_DeksaKitReviveAllConfirm(u8 taskId)
{
    DisplayYesNoMenuDefaultYes();
    gTasks[taskId].func = Task_DeksaKitReviveAllInput;
}

static void Task_DeksaKitReviveAllInput(u8 taskId)
{
    s8 input = Menu_ProcessInputNoWrapClearOnChoose();

    if (input == -2)
        return;

    // The whole party is charged in one transaction or not at all, so a
    // declined quote leaves both the money and the fainted Pokemon untouched.
    if (input != 0)
    {
        if (input == -1)
            PlaySE(SE_SELECT);
        ReturnToFieldAfterDeksaKit(taskId);
        return;
    }

    switch (DeksaKit_ReviveParty())
    {
    case DEKSA_CENTER_REVIVE_SUCCESS:
        PlaySE(SE_USE_ITEM);
        DisplayItemMessageOnField(taskId, FONT_NORMAL, sText_TeamRevived, Task_DeksaKitFinish);
        break;
    case DEKSA_CENTER_REVIVE_NO_MONEY:
        DisplayItemMessageOnField(taskId, FONT_NORMAL, sText_NotEnoughMoney, Task_DeksaKitFinish);
        break;
    default:
        DisplayItemMessageOnField(taskId, FONT_NORMAL, sText_NoFainted, Task_DeksaKitFinish);
        break;
    }
}

static void Task_DeksaKitFinish(u8 taskId)
{
    ReturnToFieldAfterDeksaKit(taskId);
}

bool8 DeksaKit_CanHeal(struct Pokemon *mon)
{
    u8 i;
    u8 ppBonuses;

    if (GetMonData(mon, MON_DATA_SPECIES) == SPECIES_NONE)
        return FALSE;
    if (GetMonData(mon, MON_DATA_HP) == 0)
        return FALSE;
    if (GetMonData(mon, MON_DATA_HP) != GetMonData(mon, MON_DATA_MAX_HP))
        return TRUE;
    if (GetMonData(mon, MON_DATA_STATUS) != 0)
        return TRUE;

    ppBonuses = GetMonData(mon, MON_DATA_PP_BONUSES);
    for (i = 0; i < MAX_MON_MOVES; i++)
    {
        u16 move = GetMonData(mon, MON_DATA_MOVE1 + i);
        if (move != MOVE_NONE
         && GetMonData(mon, MON_DATA_PP1 + i) != CalculatePPWithBonus(move, ppBonuses, i))
            return TRUE;
    }
    return FALSE;
}

static bool8 DeksaKit_PartyNeedsHealing(void)
{
    u8 i;

    for (i = 0; i < CalculatePlayerPartyCount(); i++)
    {
        if (DeksaKit_CanHeal(&gPlayerParty[i]))
            return TRUE;
    }
    return FALSE;
}

void DeksaKit_HealMon(struct Pokemon *mon)
{
    u16 maxHp = GetMonData(mon, MON_DATA_MAX_HP);
    u32 status = 0;

    if (GetMonData(mon, MON_DATA_HP) == 0)
        return;

    SetMonData(mon, MON_DATA_HP, &maxHp);
    MonRestorePP(mon);
    SetMonData(mon, MON_DATA_STATUS, &status);
}

void ItemUseCB_DeksaKitSingle(u8 taskId, TaskFunc func)
{
    struct Pokemon *mon = &gPlayerParty[gPartyMenu.slotId];

    if (!DeksaKit_CanHeal(mon))
    {
        gPartyMenuUseExitCallback = TRUE;
        DisplayPartyMenuMessage(sText_NoEffect, TRUE);
    }
    else
    {
        DeksaKit_HealMon(mon);
        PlaySE(SE_USE_ITEM);
        GetMonNickname(mon, gStringVar1);
        StringExpandPlaceholders(gStringVar4, sText_MonHealed);
        gPartyMenuUseExitCallback = TRUE;
        DisplayPartyMenuMessage(gStringVar4, TRUE);
    }
    ScheduleBgCopyTilemapToVram(2);
    gTasks[taskId].func = func;
}

// The single revive charges on selection: the player picks one specific fainted
// Pokemon and the message states what it cost. REVIVE ALL, which can run into
// five figures, quotes and asks before taking anything.
void ItemUseCB_DeksaKitRevive(u8 taskId, TaskFunc func)
{
    u8 slot = gPartyMenu.slotId;
    u32 cost = DeksaKit_ReviveCostForSlot(slot);

    switch (DeksaKit_ReviveSlot(slot))
    {
    case DEKSA_CENTER_REVIVE_SUCCESS:
        PlaySE(SE_USE_ITEM);
        GetMonNickname(&gPlayerParty[slot], gStringVar1);
        ConvertIntToDecimalStringN(gStringVar2, cost, STR_CONV_MODE_LEFT_ALIGN, 6);
        StringExpandPlaceholders(gStringVar4, sText_MonRevived);
        gPartyMenuUseExitCallback = TRUE;
        DisplayPartyMenuMessage(gStringVar4, TRUE);
        break;
    case DEKSA_CENTER_REVIVE_NO_MONEY:
        gPartyMenuUseExitCallback = TRUE;
        DisplayPartyMenuMessage(sText_NotEnoughMoney, TRUE);
        break;
    default:
        gPartyMenuUseExitCallback = TRUE;
        DisplayPartyMenuMessage(sText_NoEffect, TRUE);
        break;
    }
    ScheduleBgCopyTilemapToVram(2);
    gTasks[taskId].func = func;
}
