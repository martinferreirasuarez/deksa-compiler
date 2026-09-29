#ifndef GUARD_DEKSA_KIT_H
#define GUARD_DEKSA_KIT_H

#include "global.h"

struct Pokemon;

void DeksaKit_OpenMenu(u8 taskId);
bool8 DeksaKit_CanHeal(struct Pokemon *mon);
void DeksaKit_HealMon(struct Pokemon *mon);

#endif // GUARD_DEKSA_KIT_H
