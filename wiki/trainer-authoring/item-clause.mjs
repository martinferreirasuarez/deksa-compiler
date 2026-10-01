// Beta4.1 mechanical projection; originals and their seals are never changed.
export const ITEM_CLAUSE = 'BETA4.1-ONE-HELD-ITEM-PER-PARTY-FIRST-COPY';
function itemKey(item) {
  if (item == null || item === '—' || item === 'ITEM_NONE') return null;
  const value = typeof item === 'string' ? item : (item.itemId ?? item.name);
  if (typeof value !== 'string' || !value.trim()) throw new Error('Held item has no canonical ID or name');
  const key = value.startsWith('ITEM_') ? value : 'ITEM_' + value.toUpperCase().replaceAll("'", '').replaceAll(' ', '_');
  return key === 'ITEM_NONE' ? null : key;
}
export function uniquePartyItems(members) {
  const seen = new Set();
  return members.map(member => {
    const item = member.item;
    const key = itemKey(item);
    if (!key) return { ...member };
    if (seen.has(key)) return { ...member, item: typeof item === 'string' ? (item.startsWith('ITEM_') ? 'ITEM_NONE' : '—') : null };
    seen.add(key);
    return { ...member };
  });
}

export function projectTrainerItems(trainer) {
  const copy = structuredClone(trainer);
  for (const variant of Object.values(copy.variants)) {
    if (variant.branches) {
      for (const branch of Object.values(variant.branches)) branch.members = uniquePartyItems(branch.members);
    }
    variant.members = uniquePartyItems(variant.members);
    // A parametric starter has a different set per starter choice. Each is
    // checked against the same preceding five slots, independently.
    const symbolic = variant.members.find(m => m.starterSets);
    if (symbolic) for (const [key, set] of Object.entries(symbolic.starterSets)) {
      symbolic.starterSets[key] = uniquePartyItems([...variant.members.filter(m => !m.starterSets), set]).at(-1);
    }
  }
  return copy;
}
