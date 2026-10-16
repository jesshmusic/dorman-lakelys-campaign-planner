// Editing a campaign that lives in this world: forms for each kind of record,
// checks that match Dungeon Master Guru's, deleting without leaving dangling
// references, and session prep links. No Foundry globals, so it can be
// tested in Node.

import { formatCr, PACK_NAMES } from "./compendium.mjs";
import { NPC_ROLES } from "./local.mjs";
import { MAX_TRUTHS, truthsOf } from "./setup.mjs";

export const QUEST_STATUSES = ["available", "active", "completed", "failed"];
export const SESSION_STATUSES = ["planned", "prepped", "played"];
export const THREE_CLUES = 3;
const MAX_NAME = 120;
const LIMITS = { stakes: 10, features: 20, scenes: 20, portents: 10 };
const ROLE_LABELS = {
  bbeg: "BBEG",
  villain: "Villain",
  lieutenant: "Lieutenant",
  ally: "Ally",
  patron: "Patron",
  neutral: "Neutral",
};

// The session link type for each collection, as Dungeon Master Guru names them
export const LINK_TYPES = {
  secrets: "CampaignSecret",
  locations: "CampaignLocation",
  npcs: "CampaignNpc",
  quests: "CampaignQuest",
  fronts: "CampaignFront",
  references: "CampaignReference",
};

const BOOK_CODES = {
  "Player's Handbook": "phb",
  "Dungeon Master's Guide": "dmg",
  "Monster Manual": "mm",
  "SRD 5.2": "srd",
};
const BOOK_NAMES = {
  phb: "Player's Handbook",
  dmg: "Dungeon Master's Guide",
  mm: "Monster Manual",
  srd: "SRD 5.2",
  other: "Other",
};

const text = (value) => {
  const trimmed = String(value ?? "").trim();
  return trimmed === "" ? null : trimmed;
};
const whole = (value) => {
  const trimmed = String(value ?? "").trim();
  if (trimmed === "") return null;
  const number = Number(trimmed);
  return Number.isInteger(number) ? number : NaN;
};
const pick = (records, id) => (id && records?.some((record) => record.id === id) ? id : null);

/**
 * The edit form for each kind of record. `options` fields list choices; a
 * `records` field picks another record of the campaign.
 */
export const EDIT_FORMS = {
  fronts: {
    title: "Threat",
    fields: [
      { name: "name", label: "Name", type: "text", required: true },
      { name: "goal", label: "What it wants", type: "text" },
      { name: "doom", label: "What happens if no one stops it", type: "text" },
      { name: "description", label: "Description", type: "textarea" },
      { name: "portents", label: "Grim portents", type: "lines", hint: "Signs it's getting closer, one per line." },
      { name: "stakes", label: "Stakes", type: "lines", hint: "Questions you want answered in play, one per line." },
      { name: "clockSegments", label: "Clock segments", type: "number", min: 2, max: 12 },
      { name: "clockFilled", label: "Segments filled", type: "number", min: 0, max: 12 },
      { name: "npcId", label: "Villain", type: "records", collection: "npcs", blank: "None" },
      { name: "factionId", label: "Faction", type: "records", collection: "factions", blank: "None" },
    ],
  },
  quests: {
    title: "Quest",
    fields: [
      { name: "name", label: "Name", type: "text", required: true },
      {
        name: "kind",
        label: "Kind",
        type: "select",
        options: [
          ["main", "Main"],
          ["side", "Side"],
        ],
      },
      {
        name: "status",
        label: "Status",
        type: "select",
        options: [
          ["available", "Available"],
          ["active", "Active"],
          ["completed", "Completed"],
          ["failed", "Failed"],
        ],
      },
      { name: "act", label: "Act", type: "number", min: 1, max: 20 },
      { name: "description", label: "What it's about", type: "textarea" },
      { name: "reward", label: "Reward", type: "text" },
      { name: "giverNpcId", label: "Given by", type: "records", collection: "npcs", blank: "No one" },
      { name: "locationId", label: "Where", type: "records", collection: "locations", blank: "Anywhere" },
      { name: "parentId", label: "Part of", type: "records", collection: "quests", blank: "Nothing (its own quest)" },
      { name: "notes", label: "Notes", type: "textarea" },
    ],
  },
  npcs: {
    title: "NPC",
    fields: [
      { name: "name", label: "Name", type: "text", required: true },
      { name: "role", label: "Role", type: "select", options: NPC_ROLES.map((role) => [role, ROLE_LABELS[role]]) },
      { name: "description", label: "Who they are", type: "textarea" },
      { name: "motive", label: "What they want", type: "text" },
      { name: "secret", label: "Their secret", type: "text" },
      { name: "appearance", label: "Appearance", type: "text" },
      { name: "voice", label: "Voice and manner", type: "text" },
      { name: "factionId", label: "Faction", type: "records", collection: "factions", blank: "None" },
      { name: "notes", label: "Notes", type: "textarea" },
    ],
  },
  locations: {
    title: "Place",
    fields: [
      { name: "name", label: "Name", type: "text", required: true },
      { name: "description", label: "What it's like", type: "textarea" },
      { name: "features", label: "Features", type: "lines", hint: "A few things worth noticing, one per line." },
      { name: "parentId", label: "Inside", type: "records", collection: "locations", blank: "Nowhere (top level)" },
      { name: "notes", label: "Notes", type: "textarea" },
    ],
  },
  factions: {
    title: "Faction",
    fields: [
      { name: "name", label: "Name", type: "text", required: true },
      { name: "goal", label: "What it wants", type: "text" },
      { name: "description", label: "Who they are", type: "textarea" },
      { name: "notes", label: "Notes", type: "textarea" },
    ],
  },
  secrets: {
    title: "Secret",
    fields: [
      { name: "text", label: "The clue", type: "textarea", required: true },
      {
        name: "revelation",
        label: "What it points to",
        type: "text",
        hint: "Clues with the same answer are grouped, so you can check each has three.",
      },
    ],
  },
};

// The fields of a campaign's brief, edited on the Overview tab
export const BRIEF_FIELDS = [
  { name: "name", label: "Campaign name", type: "text", required: true },
  { name: "tone", label: "Tone", type: "text" },
  { name: "settingName", label: "Setting", type: "text" },
  { name: "partySize", label: "Players", type: "number", min: 1, max: 12 },
  { name: "startLevel", label: "Starting level", type: "number", min: 1, max: 20 },
  { name: "targetLevel", label: "Target level", type: "number", min: 1, max: 20 },
  { name: "plannedSessions", label: "Planned sessions", type: "number", min: 1, max: 100 },
  { name: "cadence", label: "How often you play", type: "text" },
  { name: "premise", label: "Premise", type: "textarea" },
  { name: "pitch", label: "Pitch for your players", type: "textarea" },
  { name: "truths", label: "Truths of the setting", type: "lines", hint: "Up to six, one per line." },
  { name: "settingNotes", label: "Setting notes", type: "textarea" },
];

/** A record's values as form strings */
export function formValues(fields, record) {
  return Object.fromEntries(
    fields.map((field) => {
      const value = record?.[field.name];
      if (field.name === "portents") return [field.name, (value ?? []).map((p) => p.text).join("\n")];
      if (Array.isArray(value)) return [field.name, value.join("\n")];
      return [field.name, value === null || value === undefined ? "" : String(value)];
    }),
  );
}

// Checks and converts form values for these fields. A choice that isn't
// allowed keeps the record's current value. Returns { values } or { error }.
function readFields(fields, values, store, current = {}) {
  const out = {};
  for (const field of fields) {
    const raw = values[field.name];
    if (field.required && !text(raw)) return { error: `${field.label} is required.` };
    switch (field.type) {
      case "number": {
        const number = whole(raw);
        if (Number.isNaN(number) || (number !== null && (number < field.min || number > field.max))) {
          return { error: `${field.label} must be a whole number from ${field.min} to ${field.max}.` };
        }
        out[field.name] = number;
        break;
      }
      case "lines":
        out[field.name] = truthsOf(raw);
        break;
      case "select":
        out[field.name] = field.options.some(([value]) => value === raw)
          ? raw
          : (current[field.name] ?? field.options[0][0]);
        break;
      case "records":
        out[field.name] = pick(store?.[field.collection], text(raw));
        break;
      default:
        out[field.name] = text(raw);
    }
    if (field.name === "name" && out.name && out.name.length > MAX_NAME) {
      return { error: `${field.label} can be at most ${MAX_NAME} characters.` };
    }
  }
  return { values: out };
}

/**
 * A record after its edit form is saved, or { error }.
 * @param {string} collection
 * @param {object} record
 * @param {Record<string, string>} values
 * @param {Record<string, object[]>} store every record in the campaign, by collection
 */
export function applyEdit(collection, record, values, store = {}) {
  const form = EDIT_FORMS[collection];
  if (!form) return { error: `Can't edit ${collection}.` };
  const read = readFields(form.fields, values, store, record);
  if (read.error) return read;
  const changes = read.values;

  if (collection === "fronts") {
    const segments = changes.clockSegments ?? record.clockSegments ?? 6;
    const filled = changes.clockFilled ?? 0;
    if (filled > segments) return { error: "The clock can't have more segments filled than it has." };
    if (changes.stakes.length > LIMITS.stakes) return { error: `Up to ${LIMITS.stakes} stakes.` };
    if (changes.portents.length > LIMITS.portents) return { error: `Up to ${LIMITS.portents} portents.` };
    // A portent keeps its tick when its words don't change
    const triggered = new Map((record.portents ?? []).map((p) => [p.text, p.triggered]));
    changes.portents = changes.portents.map((portent) => ({
      text: portent,
      triggered: Boolean(triggered.get(portent)),
    }));
    changes.clockSegments = segments;
    changes.clockFilled = filled;
  }
  if (collection === "locations" && changes.features.length > LIMITS.features) {
    return { error: `Up to ${LIMITS.features} features.` };
  }
  if (["quests", "locations"].includes(collection) && changes.parentId) {
    if (isWithin(store[collection] ?? [], changes.parentId, record.id)) {
      return { error: `It can't be inside itself, or inside something that's inside it.` };
    }
  }
  if (collection === "secrets" && changes.revelation && changes.revelation.length > MAX_NAME) {
    return { error: `What it points to can be at most ${MAX_NAME} characters.` };
  }
  return { record: { ...record, ...changes } };
}

// True when `id` is `ancestorId` or sits somewhere under it
function isWithin(records, id, ancestorId) {
  const byId = new Map(records.map((r) => [r.id, r]));
  const seen = new Set();
  for (let current = id; current && !seen.has(current); current = byId.get(current)?.parentId) {
    if (current === ancestorId) return true;
    seen.add(current);
  }
  return false;
}

/** The campaign after its brief is saved, or { error } */
export function applyBrief(campaign, values) {
  const read = readFields(BRIEF_FIELDS, values);
  if (read.error) return read;
  const changes = read.values;
  if (changes.truths.length > MAX_TRUTHS) {
    return { error: `Keep it to ${MAX_TRUTHS} truths. You have ${changes.truths.length}.` };
  }
  if (changes.startLevel && changes.targetLevel && changes.targetLevel < changes.startLevel) {
    return { error: "The target level can't be lower than the starting level." };
  }
  return { record: { ...campaign, ...changes } };
}

/** A session after its prep is saved, or { error } */
export function applySessionPrep(session, values) {
  const level = whole(values.level);
  if (Number.isNaN(level) || (level !== null && (level < 1 || level > 20))) {
    return { error: "Party level must be a whole number from 1 to 20." };
  }
  const title = text(values.title);
  if (title && title.length > MAX_NAME) return { error: `The title can be at most ${MAX_NAME} characters.` };
  const scenes = truthsOf(values.scenes);
  if (scenes.length > LIMITS.scenes) return { error: `Up to ${LIMITS.scenes} scenes.` };
  const scheduledOn = text(values.scheduledOn);
  if (scheduledOn && !/^\d{4}-\d{2}-\d{2}$/.test(scheduledOn)) return { error: "Pick a date for the session." };
  return {
    record: {
      ...session,
      title,
      displayTitle: title || `Session ${session.number}`,
      scheduledOn,
      level,
      status: SESSION_STATUSES.includes(values.status) ? values.status : session.status,
      characterNotes: text(values.characterNotes),
      strongStart: text(values.strongStart),
      scenes,
      treasure: text(values.treasure),
    },
  };
}

/**
 * Secrets grouped by what they reveal, for the Three Clue Rule check:
 * [{ revelation, clues, revealed, short }], then clues with no revelation.
 */
export function revelationGroups(secrets) {
  const groups = new Map();
  const loose = [];
  for (const secret of [...secrets].sort((a, b) => (a.position ?? 0) - (b.position ?? 0))) {
    if (!secret.revelation) loose.push(secret);
    else (groups.get(secret.revelation) ?? groups.set(secret.revelation, []).get(secret.revelation)).push(secret);
  }
  return {
    groups: [...groups.entries()]
      .map(([revelation, clues]) => ({
        revelation,
        clues,
        revealed: clues.filter((clue) => clue.revealed).length,
        short: clues.length < THREE_CLUES,
      }))
      .sort((a, b) => a.revelation.localeCompare(b.revelation)),
    loose,
  };
}

// What a session link shows next to its name
function linkDetail(collection, record) {
  if (collection === "references") return record.citation ?? null;
  if (collection === "npcs") return ROLE_LABELS[record.role] ?? null;
  return null;
}

const linkName = (collection, record) => (collection === "secrets" ? record.text : record.name);

/**
 * A session with its links of one kind set to these records, keeping the
 * links it already had to them.
 * @param {object} session
 * @param {string} collection e.g. "secrets"
 * @param {string[]} ids the records to link, in order
 * @param {object[]} records the collection's records
 * @param {() => string} id makes a new link id
 */
export function setSessionLinks(session, collection, ids, records, id) {
  const type = LINK_TYPES[collection];
  const byId = new Map(records.map((record) => [record.id, record]));
  const keep = (session.links ?? []).filter((link) => link.linkableType !== type);
  const existing = new Map(
    (session.links ?? []).filter((link) => link.linkableType === type).map((link) => [link.linkableId, link]),
  );
  const wanted = ids
    .filter((linkableId) => byId.has(linkableId))
    .map((linkableId) => {
      const record = byId.get(linkableId);
      const key = existing.get(linkableId)?.id ?? id();
      return {
        id: key,
        uuid: key,
        linkableType: type,
        linkableId,
        name: linkName(collection, record),
        slug: null,
        detail: linkDetail(collection, record),
        position: 0,
      };
    });
  return { ...session, links: [...keep, ...wanted].map((link, position) => ({ ...link, position })) };
}

/** The ids a session links to, for one collection */
export const linkedIds = (session, collection) =>
  (session.links ?? []).filter((link) => link.linkableType === LINK_TYPES[collection]).map((link) => link.linkableId);

/**
 * A book reference for something dragged in from a compendium or the world:
 * an actor (a monster), an item, or a roll table.
 * @param {{ uuid: string, name: string, documentName: string, type?: string, system?: object, pack?: string|null }} document
 * @param {() => string} id
 */
export function referenceFromDocument(document, id) {
  let category = "other";
  if (document.documentName === "Actor") category = "monster";
  else if (document.documentName === "RollTable") category = "table";
  else if (document.documentName === "Item") {
    if (document.type === "spell") category = "spell";
    else category = document.system?.rarity ? "magic_item" : "equipment";
  }
  const book = BOOK_CODES[PACK_NAMES[document.pack]?.book] ?? "other";
  const key = id();
  return {
    id: key,
    uuid: key,
    syncVersion: 0,
    name: document.name,
    book,
    category,
    page: null,
    challengeRating: category === "monster" ? formatCr(document.system?.details?.cr) : null,
    foundryUuid: document.uuid,
    notes: null,
    citation: book === "other" ? (document.pack ? "Compendium" : "This world") : BOOK_NAMES[book],
  };
}

/**
 * What deleting a record means for the rest of the campaign: the pages to
 * remove, and the records that pointed at it, without the pointer.
 * @returns {{ remove: { collection: string, id: string }[], updates: { collection: string, record: object }[] }}
 */
export function planDelete(store, collection, id) {
  const updates = [];
  const clear = (target, fields) => {
    for (const record of store[target] ?? []) {
      const changed = fields.filter((field) => record[field] === id);
      if (changed.length) {
        updates.push({
          collection: target,
          record: { ...record, ...Object.fromEntries(changed.map((f) => [f, null])) },
        });
      }
    }
  };
  if (collection === "npcs") {
    clear("fronts", ["npcId"]);
    clear("quests", ["giverNpcId"]);
  } else if (collection === "factions") {
    clear("npcs", ["factionId"]);
    clear("fronts", ["factionId"]);
  } else if (collection === "locations") {
    clear("quests", ["locationId"]);
    clear("locations", ["parentId"]);
  } else if (collection === "quests") {
    clear("quests", ["parentId"]);
  } else if (collection === "sessions") {
    clear("secrets", ["revealedSessionId"]);
  } else if (collection === "references") {
    clear("npcs", ["statBlockReferenceId"]);
  }
  const type = LINK_TYPES[collection];
  if (type) {
    for (const session of store.sessions ?? []) {
      if (session.id === id) continue;
      const links = (session.links ?? []).filter((link) => !(link.linkableType === type && link.linkableId === id));
      if (links.length !== (session.links ?? []).length) {
        const already = updates.find((u) => u.collection === "sessions" && u.record.id === session.id);
        if (already) already.record.links = links;
        else updates.push({ collection: "sessions", record: { ...session, links } });
      }
    }
  }
  return { remove: [{ collection, id }], updates };
}

/** The Getting started list for a campaign, as the website shows it */
export function gettingStarted(campaign, store) {
  const secrets = store.secrets ?? [];
  const { groups } = revelationGroups(secrets);
  const firstSession = [...(store.sessions ?? [])].sort((a, b) => a.number - b.number)[0];
  return [
    {
      label: "Choose the party",
      detail: "Pick the player characters, so session prep starts with them.",
      done: (campaign.partyActorUuids ?? []).length > 0,
      tab: "party",
    },
    {
      label: "Give your villain a threat",
      detail: "A threat with grim portents, and a clock that fills if the heroes do nothing.",
      done: (store.fronts ?? []).length > 0,
      tab: "story",
    },
    {
      label: "Add the cast",
      detail: "At least three NPCs: a villain, an ally, and someone in between.",
      done: (store.npcs ?? []).length >= 3,
      tab: "cast",
    },
    {
      label: "Hide some secrets",
      detail: "Give each revelation three clues, so the players have more than one way to find it.",
      done: groups.length > 0 && groups.every((group) => !group.short),
      tab: "secrets",
    },
    {
      label: "Prep the first session",
      detail: "Write a strong start: something already happening when play begins.",
      done: Boolean(firstSession?.strongStart),
      tab: "sessions",
      sessionId: firstSession?.id ?? null,
    },
  ];
}
