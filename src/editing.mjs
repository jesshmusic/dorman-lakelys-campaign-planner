// Editing a Dungeon Master Guru campaign from Foundry: which fields each
// kind of record can send, and what an edit changed. No Foundry globals, so
// it can be tested in Node.

import { normalizeTruths } from "./setup.mjs";

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
    "mode",
  ],
  factions: ["name", "goal", "description", "notes"],
  locations: ["name", "description", "features", "notes", "parentId", "foundrySceneUuid", "foundrySceneName", "rollTables"],
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
    "handouts",
  ],
  // A quest's encounters: links to its monsters (with how many), NPCs and reward items
  encounters: [
    "name",
    "kind",
    "description",
    "notes",
    "position",
    "questId",
    "foundryScenes",
    "rewardCurrency",
    "rewardXp",
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

// A session's, quest's or encounter's links as the sync takes them: what's linked, in order, and how many
export const linksForSync = (links) =>
  (links ?? []).map((link) => ({
    linkableType: link.linkableType,
    linkableId: String(link.linkableId),
    quantity: link.quantity ?? null,
  }));

/**
 * A field's value as the sync sends it: links in their short form, a
 * campaign's truths as [{ name, description }], even ones an older version
 * kept as text, and an NPC's stat block by its reference's id
 */
export function syncValue(field, record) {
  if (field === "links") return linksForSync(record[field]);
  // A pulled NPC has its stat block's reference, not the id
  if (field === "statBlockReferenceId" && !(field in record)) return record.statBlockReference?.id ?? null;
  if (field === "truths" && record.truths !== null && record.truths !== undefined) return normalizeTruths(record.truths);
  return record[field] ?? null;
}
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

// How each field Foundry can change is named when asking the DM about a clash
export const FIELD_LABELS = {
  clockFilled: "the clock",
  portents: "the grim portents",
  status: "the status",
  log: "the session log",
  recap: "the recap",
  revealed: "whether it's revealed",
  rewardCurrency: "the reward's coins",
  rewardXp: "the reward's XP",
  milestone: "the milestone",
  treasureCurrency: "the treasure's coins",
  foundryScenes: "the maps",
  links: "what's linked",
  motive: "what they want",
  secret: "their secret",
  voice: "their voice",
  premise: "the premise",
  pitch: "the pitch",
  truths: "the truths",
  strongStart: "the strong start",
  revealedSessionUuid: "when it was revealed",
  giverNpcId: "who gives it",
  factionId: "the faction",
  locationId: "the place",
  parentId: "what it's part of",
  npcId: "who's behind it",
  statBlockReferenceId: "the stat block",
  mode: "the campaign type",
  levelMin: "the lowest level",
  levelMax: "the highest level",
  questId: "the quest it's in",
  handouts: "the handouts",
  rollTables: "the random encounter tables",
  position: "the order",
};

// Other fields by their name: "settingNotes" is "the setting notes"
const fieldLabel = (key) =>
  FIELD_LABELS[key] ??
  `the ${key
    .replace(/Id$/, "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .toLowerCase()}`;

export const describeFields = (keys) => keys.map(fieldLabel).join(", ");
