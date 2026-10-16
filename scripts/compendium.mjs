// The compendium index sent to Dungeon Master Guru, and name lookups for
// journal links. No Foundry globals, so it can be tested in Node.

// Packs to index, books before the free SRD: when both have something with
// the same name, links use the book's. The official packs use the same UUIDs
// in every world, so a link made from one world works in the others.
export const COMPENDIUM_PACKS = [
  "dnd-monster-manual.actors",
  "dnd-monster-manual.tables",
  "dnd-dungeon-masters-guide.actors",
  "dnd-dungeon-masters-guide.equipment",
  "dnd-dungeon-masters-guide.tables",
  "dnd-players-handbook.actors",
  "dnd-players-handbook.spells",
  "dnd-players-handbook.equipment",
  "dnd5e.actors24",
  "dnd5e.spells24",
  "dnd5e.equipment24",
  "dnd5e.tables24",
];

// How Dungeon Master Guru names each pack, in the order it lists them
export const PACK_NAMES = {
  "dnd-players-handbook.spells": { book: "Player's Handbook", label: "Spells" },
  "dnd-players-handbook.equipment": { book: "Player's Handbook", label: "Equipment" },
  "dnd-players-handbook.actors": { book: "Player's Handbook", label: "Creatures" },
  "dnd-dungeon-masters-guide.equipment": { book: "Dungeon Master's Guide", label: "Magic items" },
  "dnd-dungeon-masters-guide.tables": { book: "Dungeon Master's Guide", label: "Tables" },
  "dnd-dungeon-masters-guide.actors": { book: "Dungeon Master's Guide", label: "Creatures" },
  "dnd-monster-manual.actors": { book: "Monster Manual", label: "Monsters" },
  "dnd-monster-manual.tables": { book: "Monster Manual", label: "Tables" },
  "dnd5e.actors24": { book: "SRD 5.2", label: "Monsters" },
  "dnd5e.spells24": { book: "SRD 5.2", label: "Spells" },
  "dnd5e.equipment24": { book: "SRD 5.2", label: "Equipment and magic items" },
  "dnd5e.tables24": { book: "SRD 5.2", label: "Tables" },
};

// Index fields read from each pack. Names, CRs and types only: stat blocks
// and book text never leave Foundry.
export const INDEX_FIELDS = [
  "folder",
  "system.details.cr",
  "system.details.type.value",
  "system.details.type.custom",
  "system.rarity",
  "system.level",
  "system.school",
];

// Bump when what entryFromIndex sends changes, so every pack is sent again
export const INDEX_FORMAT = 2;

const ITEM_TYPES = ["weapon", "equipment", "consumable", "container", "loot", "tool"];
// Everything in the DMG's equipment pack is a magic item, even when its rarity varies
const MAGIC_ITEM_PACKS = ["dnd-dungeon-masters-guide.equipment"];

const capitalize = (value) => (value ? `${value[0].toUpperCase()}${value.slice(1)}` : "");

// "undead" -> "Undead"; a custom type uses its own label, e.g. "Intangible Spirit"
const creatureType = (type) => (type?.value === "custom" ? type.custom : capitalize(type?.value)) || null;

/** A challenge rating as Dungeon Master Guru writes it: 0.25 -> "1/4" */
export function formatCr(cr) {
  if (cr === null || cr === undefined || cr === "") return null;
  const value = Number(cr);
  if (Number.isNaN(value)) return String(cr);
  return { 0.125: "1/8", 0.25: "1/4", 0.5: "1/2" }[value] ?? String(value);
}

/**
 * One index entry as Dungeon Master Guru stores it, or null to leave it out.
 * @param {string} packId e.g. "dnd-monster-manual.actors"
 * @param {string} documentName "Actor", "Item" or "RollTable"
 * @param {object} entry the compendium index entry
 * @param {{ schoolLabel?: (key: string) => string, rarityLabel?: (key: string) => string, folderName?: (id: string) => string|null }} labels
 */
export function entryFromIndex(packId, documentName, entry, labels = {}) {
  const { schoolLabel = capitalize, rarityLabel = capitalize, folderName = () => null } = labels;
  const base = { uuid: entry.uuid, name: entry.name, challengeRating: null, detail: null };
  const system = entry.system ?? {};

  if (documentName === "Actor") {
    if (entry.type !== "npc") return null;
    return {
      ...base,
      category: "monster",
      challengeRating: formatCr(system.details?.cr),
      detail: creatureType(system.details?.type),
    };
  }

  if (documentName === "Item") {
    if (entry.type === "spell") {
      const level = Number(system.level ?? 0);
      const school = system.school ? ` ${schoolLabel(system.school)}` : "";
      return { ...base, category: "spell", detail: level === 0 ? `Cantrip${school}` : `Level ${level}${school}` };
    }
    if (!ITEM_TYPES.includes(entry.type)) return null;
    const magic = Boolean(system.rarity) || (MAGIC_ITEM_PACKS.includes(packId) && entry.type !== "loot");
    return {
      ...base,
      category: magic ? "magic_item" : "equipment",
      detail: system.rarity ? rarityLabel(system.rarity) : magic ? "Rarity varies" : capitalize(entry.type),
    };
  }

  if (documentName === "RollTable") {
    return { ...base, category: "table", detail: (entry.folder && folderName(entry.folder)) || null };
  }
  return null;
}

/**
 * Finds a compendium UUID by name, for records that only have a name (e.g. a
 * monster picked from Dungeon Master Guru's SRD). Packs are checked in order.
 * @param {{ id: string, documentName: string, index: { name: string, uuid: string, type?: string }[] }[]} packs
 * @returns {(kind: "monster"|"item", name: string) => string|null}
 */
export function compendiumLookup(packs) {
  const maps = { monster: new Map(), item: new Map() };
  for (const pack of packs) {
    for (const entry of pack.index) {
      const kind =
        pack.documentName === "Actor" && entry.type === "npc"
          ? "monster"
          : pack.documentName === "Item" && ITEM_TYPES.includes(entry.type)
            ? "item"
            : null;
      const key = entry.name?.toLowerCase();
      if (kind && key && !maps[kind].has(key)) maps[kind].set(key, entry.uuid);
    }
  }
  return (kind, name) => maps[kind]?.get(String(name ?? "").toLowerCase()) ?? null;
}
