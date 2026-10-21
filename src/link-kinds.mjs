// What a session's, quest's or encounter's link points at: a monster or a
// reward item. No imports and no Foundry globals, so anything can use it.

// A book reference by id, from a list or a Map of them
export const referenceOf = (references, id) =>
  references instanceof Map
    ? references.get(String(id))
    : (references ?? []).find((reference) => String(reference.id) === String(id));

/** True for a link to a monster: one of Dungeon Master Guru's, or a book reference that's a monster */
export function isMonsterLink(link, references) {
  if (link.linkableType === "Monster") return true;
  return link.linkableType === "CampaignReference" && referenceOf(references, link.linkableId)?.category === "monster";
}

/** True for a link to a reward item: one of Dungeon Master Guru's, or a book reference that isn't a monster */
export function isItemLink(link, references) {
  if (link.linkableType === "Item") return true;
  if (link.linkableType !== "CampaignReference") return false;
  const reference = referenceOf(references, link.linkableId);
  return Boolean(reference) && reference.category !== "monster";
}

/** A record's links to monsters, in order */
export const monsterLinks = (owner, references) => (owner?.links ?? []).filter((link) => isMonsterLink(link, references));

/** A record's links to reward items, in order */
export const itemLinks = (owner, references) => (owner?.links ?? []).filter((link) => isItemLink(link, references));
