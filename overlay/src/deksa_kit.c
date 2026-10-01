#include "global.h"
#include "deksa_kit.h"
#include "deksa_difficulty.h"
#include "event_object_lock.h"
#include "menu.h"
#include "new_menu_helpers.h"
#include "overworld.h"
#include "pokemon.h"
#include "script.h"
#include "script_pokemon_util.h"
#include "sound.h"
#include "string_util.h"
#include "task.h"
#include "text_window.h"
#include "constants/songs.h"

static void Task_DeksaKitFinish(u8 taskId);
static void Task_DeksaKitReviveAllConfirm(u8 taskId);
static void Task_DeksaKitReviveAllInput(u8 taskId);

static const u8 sText_NoPokemon[] = _("There are no POKéMON to heal.{PAUSE_UNTIL_PRESS}");
static const u8 sText_PartyHealed[] = _("Your POKéMON were fully healed!{PAUSE_UNTIL_PRESS}");
static const u8 sText_TeamReviveQuote[] = _("Revive {STR_VAR_1} fainted POKéMON\nfor ¥{STR_VAR_2}?");
static const u8 sText_TeamRevived[] = _("Your team was fully restored!{PAUSE_UNTIL_PRESS}");
static const u8 sText_NotEnoughMoney[] = _("You don't have enough money for\nthat revival.{PAUSE_UNTIL_PRESS}");
static const u8 sText_RevivalUnavailable[] = _("Fainted POKéMON cannot be revived\nin DEKSLOCK.{PAUSE_UNTIL_PRESS}");

static void ReturnToFieldAfterDeksaKit(u8 taskId)
{
    ClearDialogWindowAndFrame(0, TRUE);
    DestroyTask(taskId);
    ClearPlayerHeldMovementAndUnfreezeObjectEvents();
    UnlockPlayerFieldControls();
}

void DeksaKit_Use(u8 taskId)
{
    if (CalculatePlayerPartyCount() == 0)
    {
        DisplayItemMessageOnField(taskId, FONT_NORMAL, sText_NoPokemon, Task_DeksaKitFinish);
        return;
    }

    // Living Pokemon are restored immediately and for free. Declining revival
    // or lacking money must never undo this healing or revive a fainted mon.
    HealPlayerParty();
    PlaySE(SE_USE_ITEM);
    if (!DeksaCenterHasFaintedMons())
    {
        DisplayItemMessageOnField(taskId, FONT_NORMAL, sText_PartyHealed, Task_DeksaKitFinish);
        return;
    }
    if (!Deksa_CanRevive())
    {
        DisplayItemMessageOnField(taskId, FONT_NORMAL, sText_RevivalUnavailable, Task_DeksaKitFinish);
        return;
    }

    ConvertIntToDecimalStringN(gStringVar1, DeksaKit_CountRevivableMons(), STR_CONV_MODE_LEFT_ALIGN, 1);
    ConvertIntToDecimalStringN(gStringVar2, DeksaKit_PartyReviveCost(), STR_CONV_MODE_LEFT_ALIGN, 6);
    StringExpandPlaceholders(gStringVar4, sText_TeamReviveQuote);
    DisplayItemMessageOnField(taskId, FONT_NORMAL, gStringVar4, Task_DeksaKitReviveAllConfirm);
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
    if (input != 0)
    {
        PlaySE(SE_SELECT);
        ReturnToFieldAfterDeksaKit(taskId);
        return;
    }

    // One atomic transaction: the complete current price or no revival.
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
        ReturnToFieldAfterDeksaKit(taskId);
        break;
    }
}

static void Task_DeksaKitFinish(u8 taskId)
{
    ReturnToFieldAfterDeksaKit(taskId);
}
