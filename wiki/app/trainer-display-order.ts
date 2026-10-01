// Presentation only: never use this order for the generator's power pyramid.
const routeOverrides: Record<string, readonly string[]> = {
  // ViridianForest/map.json: east path northwards, then west to the exit.
  "01A": ["rival-oak", "rival-route-22", "bug-catcher-rick", "bug-catcher-doug",
    "bug-catcher-anthony", "bug-catcher-charlie", "bug-catcher-sammy", "camper-liam", "leader-brock"],
};

export function trainersInAppearanceOrder<T extends { trainerId: string }>(
  entries: readonly T[], lotId: string, campaignIds: readonly string[],
): T[] {
  const ids = [...new Set([...(routeOverrides[lotId] ?? []), ...campaignIds])];
  const rank = new Map(ids.map((id, index) => [id, index]));
  // Unknown identities remain last, deterministically, not by publication/profile.
  return [...entries].sort((a, b) =>
    (rank.get(a.trainerId) ?? Infinity) - (rank.get(b.trainerId) ?? Infinity)
      || a.trainerId.localeCompare(b.trainerId));
}
