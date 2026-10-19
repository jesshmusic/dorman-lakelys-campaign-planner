// Editing a Dungeon Master Guru campaign from Foundry: which fields each
// kind of record can send, and what an edit changed. No Foundry globals, so
// it can be tested in Node.

// The fields Foundry can change on Dungeon Master Guru, as the sync names them
export const EDITABLE = {
  campaign: [
    "name",
    "premise",
    "pitch",
    "settingName",
    "settingNotes",
    "truths",
    "tone",
    "partySize",
    "startLevel",
    "targetLevel",
    "plannedSessions",
    "cadence",
    "status",
  ],
  factions: ["name", "goal", "description", "notes"],
  locations: ["name", "description", "features", "notes", "parentId", "foundrySceneUuid", "foundrySceneName"],
  npcs: [
    "name",
    "role",
    "description",
    "motive",
    "secret",
    "appearance",
    "voice",
    "notes",
    "factionId",
    "statBlockReferenceId",
    "foundryActorUuid",
    "foundryActorName",
  ],
  fronts: ["name", "goal", "doom", "description", "portents", "stakes", "clockSegments", "clockFilled", "npcId", "factionId"],
  quests: [
    "name",
    "kind",
    "status",
    "act",
    "description",
    "reward",
    "notes",
    "levelMin",
    "levelMax",
    "parentId",
    "giverNpcId",
    "locationId",
    "foundryScenes",
    "rewardCurrency",
    "rewardXp",
    "milestone",
    "links",
  ],
  secrets: ["text", "revelation", "revealed", "revealedSessionUuid", "position"],
  sessions: [
    "title",
    "scheduledOn",
    "level",
    "status",
    "characterNotes",
    "strongStart",
    "scenes",
    "treasure",
    "treasureCurrency",
    "foundryScenes",
    "log",
    "recap",
    "links",
  ],
  references: ["name", "book", "category", "page", "challengeRating", "foundryUuid", "notes"],
};

// A session's or quest's links as the sync takes them: what's linked, in order, and how many
export const linksForSync = (links) =>
  (links ?? []).map((link) => ({
    linkableType: link.linkableType,
    linkableId: String(link.linkableId),
    quantity: link.quantity ?? null,
  }));

/** A field's value as the sync sends it (links in their short form) */
export const syncValue = (field, record) => (field === "links" ? linksForSync(record[field]) : (record[field] ?? null));
const value = syncValue;
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/** The editable fields an edit changed, ready to send: { field: new value } */
export function changedAttributes(collection, before, after) {
  const changes = {};
  for (const field of EDITABLE[collection] ?? []) {
    if (!(field in after)) continue;
    const next = value(field, after);
    if (!same(value(field, before), next)) changes[field] = next;
  }
  return changes;
}

/** A new record's editable fields, to create it on Dungeon Master Guru */
export function createAttributes(collection, record) {
  return Object.fromEntries(
    (EDITABLE[collection] ?? []).filter((field) => record[field] !== undefined).map((field) => [field, value(field, record)]),
  );
}

/**
 * A random UUID v4 for a new record. crypto.randomUUID only exists on HTTPS
 * and localhost pages, and many Foundry servers are reached over plain HTTP,
 * so this builds one from crypto.getRandomValues, which works on any page.
 */
export function uuidV4(random = (bytes) => globalThis.crypto.getRandomValues(bytes)) {
  const bytes = random(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
