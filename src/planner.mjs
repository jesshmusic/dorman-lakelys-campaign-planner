// Editing a campaign that lives in this world: forms for each kind of record,
// checks that match Dungeon Master Guru's, deleting without leaving dangling
// references, and the links that session prep and quest plans make. No
// Foundry globals, so it can be tested in Node.

import { formatCr, PACK_NAMES } from "./compendium.mjs";
import { NPC_ROLES } from "./local.mjs";
import { NPC_ROLES as ROLE_LABELS } from "./render.mjs";
import { TRUTHS_HINT, linesOf, normalizeTruths, truthRows, truthsError } from "./setup.mjs";
import { ALL_ON, visibleFields } from "./techniques.mjs";
import { MAX_LEVEL, MIN_LEVEL } from "./levels.mjs";

export const QUEST_STATUSES = ["available", "active", "completed", "failed"];
// A campaign's status and type, as Dungeon Master Guru names them
export const CAMPAIGN_STATUSES = [
  ["planning", "Planning"],
  ["active", "Active"],
  ["completed", "Completed"],
  ["archived", "Archived"],
];
export const CAMPAIGN_MODES = [
  ["arc", "Story arc"],
  ["sandbox", "Sandbox"],
  ["oneshot", "One-shot"],
];
export const SESSION_STATUSES = ["planned", "prepped", "played"];
export const THREE_CLUES = 3;
const MAX_NAME = 120;
const MAX_SCENES = 20;
const MAX_COINS = 1000000;
const MAX_XP = 1000000;
const MAX_QUANTITY = 9999;
export const COINS = ["pp", "gp", "ep", "sp", "cp"];
// Foundry ids, as Dungeon Master Guru checks them
const SCENE_UUID = /^Scene\.[A-Za-z0-9]{16}$/;
// A journal entry or page, in this world or a compendium
const HANDOUT_UUID = /^(Compendium\.[\w-]+\.[\w-]+\.)?JournalEntry\.[A-Za-z0-9]{16}(\.JournalEntryPage\.[A-Za-z0-9]{16})?$/;
export const MAX_HANDOUTS = 20;
// A roll table, in this world or a compendium
const TABLE_UUID = /^(Compendium\.[\w-]+\.[\w-]+\.)?RollTable\.[A-Za-z0-9]{16}$/;
export const MAX_ROLL_TABLES = 10;
const ACTOR_UUID = /^(Compendium\.[\w-]+\.[\w-]+\.)?Actor\.[A-Za-z0-9]{16}$/;
const LIMITS = { stakes: 10, features: 20, scenes: 20, portents: 10 };

// The fields edited as a list, a row at a time: what one row is called, and how many there can be
export const LIST_FIELDS = {
  portents: { noun: "portent", max: LIMITS.portents, placeholder: "e.g. Villages go quiet along the river" },
  stakes: { noun: "question", max: LIMITS.stakes, placeholder: "e.g. Will the bridge hold?" },
  features: { noun: "feature", max: LIMITS.features, placeholder: "e.g. A rope bridge over the gorge" },
  scenes: { noun: "scene", max: LIMITS.scenes, placeholder: "e.g. Ambush at the ford" },
};
// Foundry's token dispositions (CONST.TOKEN_DISPOSITIONS)
const DISPOSITIONS = { secret: -2, hostile: -1, neutral: 0, friendly: 1 };

export { ROLE_LABELS };

/**
 * The role an actor dropped on the cast starts with, from its token's
 * disposition: hostile is an enemy, friendly an ally, anything else neutral.
 * The DM can change it.
 */
export function roleFromDisposition(disposition) {
  if (disposition === DISPOSITIONS.hostile) return "villain";
  if (disposition === DISPOSITIONS.friendly) return "ally";
  return "neutral";
}

// The link type for each collection, as Dungeon Master Guru names them. Sessions
// link to any of them; quests to NPCs and references (reward items); encounters
// to NPCs and references (monsters and reward items).
export const LINK_TYPES = {
  secrets: "CampaignSecret",
  locations: "CampaignLocation",
  npcs: "CampaignNpc",
  quests: "CampaignQuest",
  fronts: "CampaignFront",
  references: "CampaignReference",
};

// The records that have links: sessions, quests, and quests' encounters
// (monsters with how many, NPCs and reward items)
export const LINK_OWNERS = ["sessions", "quests", "encounters"];

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

// A character level, picked from a dropdown of 1 to 20 (see levels.mjs);
// `blank` labels the choice for no level
const LEVEL = { type: "level", min: MIN_LEVEL, max: MAX_LEVEL };

/**
 * The edit form for each kind of record. `options` fields list choices; a
 * `records` field picks another record of the campaign, offering only the
 * ones `only` accepts when it has one.
 */
export const EDIT_FORMS = {
  fronts: {
    title: "Threat",
    fields: [
      { name: "name", label: "Name", type: "text", required: true },
      { name: "goal", label: "What it wants", type: "text" },
      { name: "doom", label: "What happens if no one stops it", type: "text" },
      { name: "description", label: "Description", type: "textarea" },
      { name: "portents", label: "Grim portents", type: "lines", hint: "Signs it's getting closer, in order." },
      { name: "stakes", label: "Stakes", type: "lines", hint: "Questions you want answered in play." },
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
      { name: "levelMin", label: "Lowest level", ...LEVEL, blank: "Any" },
      { name: "levelMax", label: "Highest level", ...LEVEL, blank: "Any" },
      { name: "description", label: "What it's about", type: "textarea" },
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
      {
        name: "role",
        label: "Role",
        type: "select",
        options: NPC_ROLES.map((role) => [role, ROLE_LABELS[role]]),
        default: "neutral",
      },
      { name: "description", label: "Who they are", type: "textarea" },
      { name: "motive", label: "What they want", type: "text" },
      { name: "secret", label: "Their secret", type: "text" },
      { name: "appearance", label: "Appearance", type: "text" },
      { name: "voice", label: "Voice and manner", type: "text" },
      { name: "factionId", label: "Faction", type: "records", collection: "factions", blank: "None" },
      {
        name: "statBlockReferenceId",
        label: "Stat block",
        type: "records",
        collection: "references",
        only: (reference) => reference.category === "monster",
        blank: "None",
        hint: "A monster from the campaign's book references.",
      },
      { name: "notes", label: "Notes", type: "textarea" },
    ],
  },
  locations: {
    title: "Place",
    fields: [
      { name: "name", label: "Name", type: "text", required: true },
      { name: "description", label: "What it's like", type: "textarea" },
      { name: "features", label: "Features", type: "lines", hint: "A few things worth noticing." },
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
  { name: "status", label: "Status", type: "select", options: CAMPAIGN_STATUSES },
  { name: "mode", label: "Type", type: "select", options: CAMPAIGN_MODES },
  { name: "partySize", label: "Players", type: "number", min: 1, max: 12 },
  { name: "startLevel", label: "Starting level", ...LEVEL, blank: "Not set" },
  { name: "targetLevel", label: "Target level", ...LEVEL, blank: "Not set" },
  { name: "plannedSessions", label: "Planned sessions", type: "number", min: 1, max: 100 },
  { name: "cadence", label: "How often you play", type: "text" },
  { name: "premise", label: "Premise", type: "textarea" },
  { name: "pitch", label: "Pitch for your players", type: "textarea" },
  { name: "truths", label: "Truths of the setting", type: "truths", hint: TRUTHS_HINT },
  { name: "settingNotes", label: "Setting notes", type: "textarea" },
];

/**
 * A record's edit form with only the fields for the techniques this world
 * uses: a threat's form leaves out its clock or portents when they're off.
 */
export function editForm(collection, techniques = ALL_ON) {
  const form = EDIT_FORMS[collection];
  return form && { ...form, fields: visibleFields(form.fields, techniques) };
}

/** The brief's fields, without the truths when they're switched off */
export const briefFields = (techniques = ALL_ON) => visibleFields(BRIEF_FIELDS, techniques);

/**
 * A record's values as form strings, and truths as the editor's rows. A new
 * record gets each field's default.
 */
export function formValues(fields, record) {
  return Object.fromEntries(
    fields.map((field) => {
      const value = record && field.name in record ? record[field.name] : field.default;
      if (field.type === "truths") return [field.name, truthRows(value)];
      // A pulled NPC has its stat block's reference, not the id
      if (field.name === "statBlockReferenceId" && record && !(field.name in record)) {
        return [field.name, record.statBlockReference?.id ?? ""];
      }
      if (field.name === "portents") return [field.name, (value ?? []).map((p) => p.text).join("\n")];
      if (Array.isArray(value)) return [field.name, value.join("\n")];
      return [field.name, value === null || value === undefined ? "" : String(value)];
    }),
  );
}

// Checks and converts form values for these fields: strings, and truths as
// the editor's rows. A choice that isn't allowed keeps the record's current
// value. Returns { values } or { error }.
function readFields(fields, values, store, current = {}) {
  const out = {};
  for (const field of fields) {
    const raw = values[field.name];
    if (field.required && !text(raw)) return { error: `${field.label} is required.` };
    switch (field.type) {
      case "number":
      case "level": {
        const number = whole(raw);
        if (Number.isNaN(number) || (number !== null && (number < field.min || number > field.max))) {
          return { error: `${field.label} must be a whole number from ${field.min} to ${field.max}.` };
        }
        out[field.name] = number;
        break;
      }
      case "lines":
        out[field.name] = linesOf(raw);
        break;
      case "truths": {
        const error = truthsError(raw);
        if (error) return { error };
        out[field.name] = normalizeTruths(raw);
        break;
      }
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
 * A record after its edit form is saved, or { error }. Fields for techniques
 * that are switched off aren't in the form, so the record keeps their values.
 * @param {string} collection
 * @param {object} record
 * @param {Record<string, string>} values
 * @param {Record<string, object[]>} store every record in the campaign, by collection
 * @param {object} techniques the ones this world uses (see techniques.mjs)
 */
export function applyEdit(collection, record, values, store = {}, techniques = ALL_ON) {
  const form = editForm(collection, techniques);
  if (!form) return { error: `Can't edit ${collection}.` };
  const read = readFields(form.fields, values, store, record);
  if (read.error) return read;
  const changes = read.values;

  if (collection === "fronts") {
    const segments = changes.clockSegments ?? record.clockSegments ?? 6;
    const filled = "clockFilled" in changes ? (changes.clockFilled ?? 0) : (record.clockFilled ?? 0);
    if (filled > segments) return { error: "The clock can't have more segments filled than it has." };
    if (changes.stakes.length > LIMITS.stakes) return { error: `Up to ${LIMITS.stakes} stakes.` };
    if ("portents" in changes) {
      if (changes.portents.length > LIMITS.portents) return { error: `Up to ${LIMITS.portents} portents.` };
      // A portent keeps its tick when its words don't change
      const triggered = new Map((record.portents ?? []).map((p) => [p.text, p.triggered]));
      changes.portents = changes.portents.map((portent) => ({
        text: portent,
        triggered: Boolean(triggered.get(portent)),
      }));
    }
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
  if (collection === "quests" && changes.levelMin && changes.levelMax && changes.levelMax < changes.levelMin) {
    return { error: "The highest level can't be lower than the lowest." };
  }
  if (collection === "npcs" && "statBlockReferenceId" in changes) {
    // What the NPC's page shows for its stat block
    const reference = (store.references ?? []).find((r) => r.id === changes.statBlockReferenceId);
    changes.statBlockReference = reference
      ? { id: reference.id, name: reference.name, citation: reference.citation ?? null, foundryUuid: reference.foundryUuid ?? null }
      : null;
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

/** The campaign after its brief is saved, or { error }. With truths switched off, it keeps the ones it has. */
export function applyBrief(campaign, values, techniques = ALL_ON) {
  const read = readFields(briefFields(techniques), values, {}, campaign);
  if (read.error) return read;
  const changes = read.values;
  if (changes.startLevel && changes.targetLevel && changes.targetLevel < changes.startLevel) {
    return { error: "The target level can't be lower than the starting level." };
  }
  return { record: { ...campaign, ...changes } };
}

/**
 * The attributes that set (or clear, with no uuid) a place's map, or { error }.
 * @param {string|null} uuid a scene, e.g. "Scene.QdI6Ix83ypmPq4lc"
 */
export function sceneChange(uuid, name) {
  if (!uuid) return { foundrySceneUuid: null, foundrySceneName: null };
  if (!SCENE_UUID.test(uuid)) return { error: "That isn't a scene from this world." };
  return { foundrySceneUuid: uuid, foundrySceneName: String(name ?? "Map").slice(0, MAX_NAME) };
}

/**
 * The attributes that set (or clear) an NPC's actor, or { error }.
 * @param {string|null} uuid a world or compendium actor
 */
export function actorChange(uuid, name) {
  if (!uuid) return { foundryActorUuid: null, foundryActorName: null };
  if (!ACTOR_UUID.test(uuid)) return { error: "That isn't an actor." };
  return { foundryActorUuid: uuid, foundryActorName: String(name ?? "Stat block").slice(0, MAX_NAME) };
}

/**
 * A session's, quest's or encounter's maps with one added (once), or { error }.
 * @param {string} noun what the maps are for, for the error: "session", "quest" or "encounter"
 */
export function addScene(scenes, uuid, name, noun = "session") {
  if (!SCENE_UUID.test(uuid ?? "")) return { error: "That isn't a scene from this world." };
  if ((scenes ?? []).some((scene) => scene.uuid === uuid)) return { scenes: scenes ?? [] };
  if ((scenes ?? []).length >= MAX_SCENES) return { error: `Up to ${MAX_SCENES} maps ${/^[aeiou]/.test(noun) ? "an" : "a"} ${noun}.` };
  return { scenes: [...(scenes ?? []), { uuid, name: String(name ?? "Map").slice(0, MAX_NAME) }] };
}

/**
 * A quest's handouts with a journal entry or page added at the end (once), or { error }.
 * @param {{ uuid: string, name: string }[]} handouts
 * @param {string} uuid e.g. "JournalEntry.QdI6Ix83ypmPq4lc.JournalEntryPage.WVPcqI82sGV2YrXq"
 */
export function addHandout(handouts, uuid, name) {
  const list = handouts ?? [];
  if (!HANDOUT_UUID.test(uuid ?? "")) return { error: "Drop a journal entry or page here, from the Journal sidebar or a compendium." };
  if (list.some((handout) => handout.uuid === uuid)) return { handouts: list };
  if (list.length >= MAX_HANDOUTS) return { error: `Up to ${MAX_HANDOUTS} handouts a quest.` };
  const label = String(name ?? "").trim() || "Handout";
  return { handouts: [...list, { uuid, name: label.slice(0, MAX_NAME) }] };
}

/** A quest's handouts without one */
export const removeHandout = (handouts, uuid) => (handouts ?? []).filter((handout) => handout.uuid !== uuid);

/** True for a journal entry or page uuid a quest can use as a handout */
export const isHandoutUuid = (uuid) => HANDOUT_UUID.test(uuid ?? "");

/**
 * A place's random encounter tables with a roll table added at the end (once), or { error }.
 * @param {{ uuid: string, name: string }[]} tables
 * @param {string} uuid e.g. "RollTable.QdI6Ix83ypmPq4lc" or a compendium table's
 */
export function addRollTable(tables, uuid, name) {
  const list = tables ?? [];
  if (!TABLE_UUID.test(uuid ?? "")) return { error: "Drop a roll table here, from the sidebar or a compendium." };
  if (list.some((table) => table.uuid === uuid)) return { rollTables: list };
  if (list.length >= MAX_ROLL_TABLES) return { error: `Up to ${MAX_ROLL_TABLES} roll tables a place.` };
  const label = String(name ?? "").trim() || "Roll table";
  return { rollTables: [...list, { uuid, name: label.slice(0, MAX_NAME) }] };
}

/** A place's roll tables without one */
export const removeRollTable = (tables, uuid) => (tables ?? []).filter((table) => table.uuid !== uuid);

/** Coins from form values (coin_pp, coin_gp, ...): { gp: 150 }, or { error } */
export function coinsFrom(values) {
  const coins = {};
  for (const coin of COINS) {
    const amount = whole(values[`coin_${coin}`]);
    if (Number.isNaN(amount) || (amount !== null && (amount < 0 || amount > MAX_COINS))) {
      return { error: `Coins must be whole numbers from 0 to ${MAX_COINS.toLocaleString("en")}.` };
    }
    if (amount) coins[coin] = amount;
  }
  return { coins };
}

/** A session, quest or encounter with one link's quantity set (1 or blank clears it), or { error } */
export function setLinkQuantity(record, linkId, value) {
  const quantity = whole(value);
  if (Number.isNaN(quantity) || (quantity !== null && (quantity < 1 || quantity > MAX_QUANTITY))) {
    return { error: `Quantity must be a whole number from 1 to ${MAX_QUANTITY}.` };
  }
  return {
    record: {
      ...record,
      links: (record.links ?? []).map((link) =>
        link.id === linkId ? { ...link, quantity: quantity && quantity > 1 ? quantity : null } : link,
      ),
    },
  };
}

/**
 * A quest after its reward is saved: the reward notes, coins (coin_pp, ...),
 * XP and milestone. Or { error }.
 */
export function applyQuestReward(quest, values) {
  const { coins, error } = coinsFrom(values);
  if (error) return { error };
  const xp = whole(values.rewardXp);
  if (Number.isNaN(xp) || (xp !== null && (xp < 0 || xp > MAX_XP))) {
    return { error: `XP must be a whole number from 0 to ${MAX_XP.toLocaleString("en")}.` };
  }
  return {
    record: {
      ...quest,
      reward: text(values.reward),
      rewardCurrency: coins,
      rewardXp: xp,
      milestone: values.milestone === "on" || values.milestone === true,
    },
  };
}

/** A session after its prep is saved, or { error } */
export function applySessionPrep(session, values) {
  const level = whole(values.level);
  if (Number.isNaN(level) || (level !== null && (level < 1 || level > 20))) {
    return { error: "Party level must be a whole number from 1 to 20." };
  }
  const title = text(values.title);
  if (title && title.length > MAX_NAME) return { error: `The title can be at most ${MAX_NAME} characters.` };
  const scenes = linesOf(values.scenes);
  if (scenes.length > LIMITS.scenes) return { error: `Up to ${LIMITS.scenes} scenes.` };
  const scheduledOn = text(values.scheduledOn);
  if (scheduledOn && !/^\d{4}-\d{2}-\d{2}$/.test(scheduledOn)) return { error: "Pick a date for the session." };
  const { coins, error } = coinsFrom(values);
  if (error) return { error };
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
      treasureCurrency: coins,
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
 * A session, quest or encounter with its links of one kind set to these
 * records, keeping the links it already had to them.
 * @param {object} owner the session or quest
 * @param {string} collection e.g. "secrets"
 * @param {string[]} ids the records to link, in order
 * @param {object[]} records the collection's records
 * @param {() => string} id makes a new link id
 */
export function setLinks(owner, collection, ids, records, id) {
  const type = LINK_TYPES[collection];
  const byId = new Map(records.map((record) => [record.id, record]));
  // The same records as before: the links stay as they are, in their order,
  // so saving doesn't send a change that isn't one
  const now = (owner.links ?? []).filter((link) => link.linkableType === type).map((link) => link.linkableId);
  const next = [...new Set(ids.filter((linkableId) => byId.has(linkableId)))];
  if (next.length === now.length && next.every((linkableId) => now.includes(linkableId))) return owner;
  const keep = (owner.links ?? []).filter((link) => link.linkableType !== type);
  const existing = new Map(
    (owner.links ?? []).filter((link) => link.linkableType === type).map((link) => [link.linkableId, link]),
  );
  const wanted = ids
    .filter((linkableId) => byId.has(linkableId))
    .map((linkableId) => {
      const record = byId.get(linkableId);
      const before = existing.get(linkableId);
      const key = before?.id ?? id();
      return {
        id: key,
        uuid: key,
        linkableType: type,
        linkableId,
        name: linkName(collection, record),
        slug: null,
        detail: linkDetail(collection, record),
        position: 0,
        quantity: before?.quantity ?? null,
      };
    });
  return { ...owner, links: [...keep, ...wanted].map((link, position) => ({ ...link, position })) };
}

/** The ids a session or quest links to, for one collection */
export const linkedIds = (owner, collection) =>
  (owner.links ?? []).filter((link) => link.linkableType === LINK_TYPES[collection]).map((link) => link.linkableId);

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
 * remove (a quest's encounters go with it), and the records that pointed at
 * it, without the pointer.
 * @returns {{ remove: { collection: string, id: string }[], updates: { collection: string, record: object }[] }}
 */
export function planDelete(store, collection, id) {
  const remove = [{ collection, id }];
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
    for (const encounter of store.encounters ?? []) {
      if (String(encounter.questId) === String(id)) remove.push({ collection: "encounters", id: encounter.id });
    }
  } else if (collection === "sessions") {
    clear("secrets", ["revealedSessionId"]);
  } else if (collection === "references") {
    // A pulled NPC has its stat block's reference, not the id
    for (const npc of store.npcs ?? []) {
      if ((npc.statBlockReferenceId ?? npc.statBlockReference?.id) !== id) continue;
      updates.push({ collection: "npcs", record: { ...npc, statBlockReferenceId: null, statBlockReference: null } });
    }
  }
  // Sessions, quests and encounters drop their links to it
  const removed = (owners, owner) => remove.some((r) => r.collection === owners && r.id === owner.id);
  const type = LINK_TYPES[collection];
  if (type) {
    for (const owners of LINK_OWNERS) {
      for (const owner of store[owners] ?? []) {
        if (removed(owners, owner)) continue;
        const links = (owner.links ?? []).filter((link) => !(link.linkableType === type && link.linkableId === id));
        if (links.length !== (owner.links ?? []).length) {
          const already = updates.find((u) => u.collection === owners && u.record.id === owner.id);
          if (already) already.record.links = links;
          else updates.push({ collection: owners, record: { ...owner, links } });
        }
      }
    }
  }
  return { remove, updates };
}

/** The Story tab's line about threats, for the techniques this world uses */
export function threatsIntro({ portents, clocks } = ALL_ON) {
  if (portents && clocks) {
    return "Each threat has a goal, grim portents that show it getting closer, and a clock that fills if no one stops it.";
  }
  if (portents) return "Each threat has a goal, and grim portents that show it getting closer.";
  if (clocks) return "Each threat has a goal, and a clock that fills if no one stops it.";
  return "Each threat has a goal, and what happens if no one stops it.";
}

// The Getting started line about threats, for the techniques this world uses
function threatDetail({ portents, clocks }) {
  if (portents && clocks) return "A threat with grim portents, and a clock that fills if the heroes do nothing.";
  if (portents) return "A threat with grim portents that show it getting closer.";
  if (clocks) return "A threat with a clock that fills if the heroes do nothing.";
  return "A villain or danger with a plan, and what happens if the heroes do nothing.";
}

/**
 * The Getting started list for a campaign, as the website shows it, for the
 * techniques this world uses: nothing when the checklist is switched off,
 * and no secrets when they are.
 */
export function gettingStarted(campaign, store, techniques = ALL_ON) {
  if (!techniques.checklist) return [];
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
      detail: threatDetail(techniques),
      done: (store.fronts ?? []).length > 0,
      tab: "story",
    },
    {
      label: "Add the cast",
      detail: "At least three NPCs: a villain, an ally, and someone in between.",
      done: (store.npcs ?? []).length >= 3,
      tab: "cast",
    },
    techniques.secrets &&
      (techniques.threeClues
        ? {
            label: "Hide some secrets",
            detail: "Give each revelation three clues, so the players have more than one way to find it.",
            done: groups.length > 0 && groups.every((group) => !group.short),
            tab: "secrets",
          }
        : {
            label: "Hide some secrets",
            detail: "Write down a few things the party could discover. Don't decide how they'll find them.",
            done: secrets.length > 0,
            tab: "secrets",
          }),
    {
      label: "Prep the first session",
      detail: "Write a strong start: something already happening when play begins.",
      done: Boolean(firstSession?.strongStart),
      tab: "sessions",
      sessionId: firstSession?.id ?? null,
    },
  ].filter(Boolean);
}
