// Campaigns that live only in this Foundry world, with no Dungeon Master Guru
// account. Their records have the same shape as the ones Dungeon Master Guru
// sends, so the journals and the Campaign Dashboard treat both alike, and a
// local campaign can be sent to Dungeon Master Guru later. No Foundry
// globals, so it can be tested in Node.

import { linesOf, normalizeTruths } from "./setup.mjs";
import { ALL_ON, visibleFields } from "./techniques.mjs";

// The starting structures, as Dungeon Master Guru's CampaignTemplate builds them
export const DEFAULT_ARC_SESSIONS = 6;
export const ACTS = ["Act I: The hook", "Act II: Complications", "Act III: The showdown"];
export const PORTENTS = ["The first sign of trouble", "The threat grows bolder", "Doom is at hand"];
export const FIVE_ROOMS = [
  "Entrance and guardian",
  "Puzzle or roleplaying challenge",
  "Trick or setback",
  "Climax: big battle or conflict",
  "Reward, revelation, or plot twist",
];
const MODES = { three_act: "arc", sandbox: "sandbox", five_room: "oneshot", blank: "arc" };

export const NPC_ROLES = ["bbeg", "villain", "lieutenant", "ally", "patron", "neutral"];
export const QUEST_KINDS = ["main", "side"];

const blankToNull = (value) => {
  const text = String(value ?? "").trim();
  return text === "" ? null : text;
};
const numberOrNull = (value) => {
  const text = String(value ?? "").trim();
  return text === "" || Number.isNaN(Number(text)) ? null : Number(text);
};
const portentsFrom = (texts) => texts.map((text) => ({ text, triggered: false }));

// Spread levels evenly from the starting to the target level
export function levelFor(index, count, start, target) {
  if (start === null || count === 1) return start;
  const end = target ?? start;
  return start + Math.round(((end - start) * index) / (count - 1));
}

// Each kind of record with every field Dungeon Master Guru sends, set to its default
const BLANKS = {
  sessions: (r) => ({
    number: r.number,
    title: r.title ?? null,
    displayTitle: r.title || `Session ${r.number}`,
    scheduledOn: null,
    status: "planned",
    level: r.level ?? null,
    characterNotes: null,
    strongStart: null,
    scenes: r.scenes ?? [],
    treasure: null,
    log: null,
    recap: null,
    links: [],
    // Foundry scenes (maps) for the session, and its coins: { uuid, name }[] and { pp, gp, ep, sp, cp }
    foundryScenes: [],
    treasureCurrency: {},
  }),
  fronts: (r) => ({
    name: r.name,
    description: r.description ?? null,
    goal: r.goal ?? null,
    doom: r.doom ?? null,
    stakes: [],
    portents: r.portents ?? [],
    clockSegments: r.clockSegments ?? 6,
    clockFilled: 0,
    npcId: null,
    factionId: null,
  }),
  quests: (r) => ({
    name: r.name,
    kind: r.kind ?? "main",
    status: "available",
    description: r.description ?? null,
    reward: r.reward ?? null,
    notes: null,
    act: r.act ?? null,
    position: r.position ?? 0,
    levelMin: null,
    levelMax: null,
    parentId: null,
    giverNpcId: null,
    locationId: null,
    // What the quest needs and gives: its maps ({ uuid, name }[]), links to its
    // NPCs, monsters and reward items, its reward coins, and XP or a milestone
    foundryScenes: [],
    links: [],
    rewardCurrency: {},
    rewardXp: null,
    milestone: false,
  }),
  secrets: (r) => ({
    text: r.text,
    revelation: r.revelation ?? null,
    revealed: false,
    revealedAt: null,
    revealedSessionId: null,
    position: r.position ?? 0,
  }),
  npcs: (r) => ({
    name: r.name,
    role: r.role ?? "neutral",
    description: r.description ?? null,
    motive: r.motive ?? null,
    secret: r.secret ?? null,
    appearance: null,
    voice: null,
    notes: null,
    factionId: null,
    monster: null,
    statBlockReference: null,
    // The Foundry actor that is this NPC's stat block, from the world or a compendium
    foundryActorUuid: r.foundryActorUuid ?? null,
    foundryActorName: r.foundryActorName ?? null,
  }),
  locations: (r) => ({
    name: r.name,
    description: r.description ?? null,
    features: r.features ?? [],
    notes: null,
    parentId: null,
    foundryMapId: null,
    // The Foundry scene that maps this place
    foundrySceneUuid: null,
    foundrySceneName: null,
  }),
  factions: (r) => ({ name: r.name, description: r.description ?? null, goal: r.goal ?? null, notes: null }),
};

// A local record's id and uuid are the same string, as Foundry makes it
function record(collection, attributes, id) {
  const key = id();
  return { id: key, uuid: key, syncVersion: 0, ...BLANKS[collection](attributes) };
}

/**
 * Everything a new local campaign starts with: the campaign itself, plus
 * the template's sessions, quests and threat.
 * @param {object} draft the setup guide's answers (see setup.mjs)
 * @param {{ id: () => string, worldId?: string }} options id makes a new unique id
 * @returns {{ campaign: object, records: Record<string, object[]> }}
 */
export function buildLocalCampaign(draft, { id }) {
  const values = draft.values ?? {};
  const campaignId = id();
  const campaign = {
    id: campaignId,
    uuid: campaignId,
    syncVersion: 0,
    local: true,
    name: blankToNull(values.name) ?? "New campaign",
    premise: blankToNull(values.premise),
    pitch: blankToNull(values.pitch),
    settingName: blankToNull(values.setting_name),
    settingNotes: blankToNull(values.setting_notes),
    truths: normalizeTruths(values.truths),
    mode: MODES[draft.template] ?? "arc",
    template: draft.template,
    status: "planning",
    plannedSessions: numberOrNull(values.planned_sessions),
    cadence: blankToNull(values.cadence),
    partySize: numberOrNull(values.party_size),
    startLevel: numberOrNull(values.start_level),
    targetLevel: numberOrNull(values.target_level),
    tone: blankToNull(values.tone),
    edition: "2024",
    excludedCompendiumPacks: [...(draft.excludedPacks ?? [])],
    // World actors in the party
    partyActorUuids: [...(draft.party ?? [])],
  };

  const records = { sessions: [], fronts: [], quests: [] };
  const start = campaign.startLevel;
  if (draft.template === "three_act") {
    const count = campaign.plannedSessions ?? DEFAULT_ARC_SESSIONS;
    for (let index = 0; index < count; index += 1) {
      records.sessions.push(
        record("sessions", { number: index + 1, level: levelFor(index, count, start, campaign.targetLevel) }, id),
      );
    }
    ACTS.forEach((name, index) =>
      records.quests.push(record("quests", { name, kind: "main", act: index + 1, position: index }, id)),
    );
    records.fronts.push(
      record(
        "fronts",
        { name: "Main threat", clockSegments: Math.min(Math.max(count, 4), 12), portents: portentsFrom(PORTENTS) },
        id,
      ),
    );
  } else if (draft.template === "sandbox") {
    records.fronts.push(
      record("fronts", { name: "Main villain", clockSegments: 6, portents: portentsFrom(PORTENTS) }, id),
    );
    records.quests.push(record("quests", { name: "Main questline", kind: "main", act: 1 }, id));
    records.sessions.push(record("sessions", { number: 1, level: start }, id));
  } else if (draft.template === "five_room") {
    records.quests.push(record("quests", { name: "The adventure", kind: "main" }, id));
    records.sessions.push(record("sessions", { number: 1, level: start, scenes: [...FIVE_ROOMS] }, id));
  }
  return { campaign, records };
}

// The forms for adding to a local campaign from the Dashboard
export const ADD_FORMS = {
  secrets: {
    title: "Add a secret",
    fields: [
      {
        name: "text",
        label: "The clue",
        type: "textarea",
        required: true,
        hint: "Something the party could find out.",
      },
      {
        name: "revelation",
        label: "What it points to",
        type: "text",
        hint: "Give each revelation three clues, so the party has more than one way to find it.",
      },
    ],
  },
  quests: {
    title: "Add a quest",
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
      { name: "description", label: "What it's about", type: "textarea" },
      { name: "reward", label: "Reward", type: "text" },
    ],
  },
  fronts: {
    title: "Add a threat",
    fields: [
      { name: "name", label: "Name", type: "text", required: true, hint: "A villain, faction or danger with a plan." },
      { name: "goal", label: "What it wants", type: "text" },
      { name: "doom", label: "What happens if no one stops it", type: "text" },
      {
        name: "portents",
        label: "Grim portents",
        type: "lines",
        hint: "Signs that it's getting closer, one per line.",
      },
      { name: "clockSegments", label: "Clock segments", type: "number", min: 4, max: 12, value: "6" },
    ],
  },
  npcs: {
    title: "Add an NPC",
    fields: [
      { name: "name", label: "Name", type: "text", required: true },
      {
        name: "role",
        label: "Role",
        type: "select",
        options: [
          ["neutral", "Neutral"],
          ["ally", "Ally"],
          ["patron", "Patron"],
          ["lieutenant", "Lieutenant"],
          ["villain", "Enemy"],
          ["bbeg", "BBEG"],
        ],
      },
      { name: "description", label: "Who they are", type: "textarea" },
      { name: "motive", label: "What they want", type: "text" },
      { name: "secret", label: "Their secret", type: "text" },
    ],
  },
  locations: {
    title: "Add a place",
    fields: [
      { name: "name", label: "Name", type: "text", required: true },
      { name: "description", label: "What it's like", type: "textarea" },
      { name: "features", label: "Features", type: "lines", hint: "A few things worth noticing, one per line." },
    ],
  },
  factions: {
    title: "Add a faction",
    fields: [
      { name: "name", label: "Name", type: "text", required: true },
      { name: "goal", label: "What it wants", type: "text" },
      { name: "description", label: "Who they are", type: "textarea" },
    ],
  },
  sessions: {
    title: "Add a session",
    fields: [
      { name: "title", label: "Title", type: "text", hint: "Optional, e.g. The Siege of Hommlet" },
      { name: "level", label: "Party level", type: "number", min: 1, max: 20 },
    ],
  },
};

/**
 * An Add form with only the fields for the techniques this world uses: a
 * threat's leaves out its clock or portents when they're off.
 */
export function addForm(collection, techniques = ALL_ON) {
  const form = ADD_FORMS[collection];
  return form && { ...form, fields: visibleFields(form.fields, techniques) };
}

/**
 * A new record from an Add form, or { error } when something required is missing.
 * @param {string} collection e.g. "secrets"
 * @param {Record<string, string>} values the form's values
 * @param {{ id: () => string, existing: object[] }} options existing: the collection's records so far
 */
export function newRecord(collection, values, { id, existing = [] }) {
  const form = ADD_FORMS[collection];
  if (!form) return { error: `Can't add ${collection}.` };
  for (const field of form.fields) {
    if (field.required && !blankToNull(values[field.name])) return { error: `${field.label} is required.` };
  }
  const text = (name) => blankToNull(values[name]);
  const nextPosition = existing.length;
  switch (collection) {
    case "secrets":
      return record(collection, { text: text("text"), revelation: text("revelation"), position: nextPosition }, id);
    case "quests":
      return record(
        collection,
        {
          name: text("name"),
          kind: QUEST_KINDS.includes(values.kind) ? values.kind : "side",
          description: text("description"),
          reward: text("reward"),
          position: nextPosition,
        },
        id,
      );
    case "fronts": {
      const segments = Math.min(Math.max(numberOrNull(values.clockSegments) ?? 6, 4), 12);
      return record(
        collection,
        {
          name: text("name"),
          goal: text("goal"),
          doom: text("doom"),
          portents: portentsFrom(linesOf(values.portents)),
          clockSegments: segments,
        },
        id,
      );
    }
    case "npcs":
      return record(
        collection,
        {
          foundryActorUuid: text("foundryActorUuid"),
          foundryActorName: text("foundryActorName"),
          name: text("name"),
          role: NPC_ROLES.includes(values.role) ? values.role : "neutral",
          description: text("description"),
          motive: text("motive"),
          secret: text("secret"),
        },
        id,
      );
    case "locations":
      return record(
        collection,
        { name: text("name"), description: text("description"), features: linesOf(values.features) },
        id,
      );
    case "factions":
      return record(collection, { name: text("name"), goal: text("goal"), description: text("description") }, id);
    case "sessions": {
      const number = existing.reduce((highest, session) => Math.max(highest, session.number ?? 0), 0) + 1;
      return record(collection, { number, title: text("title"), level: numberOrNull(values.level) }, id);
    }
    default:
      return { error: `Can't add ${collection}.` };
  }
}

/**
 * A local record after a change from the Campaign Dashboard. Takes the same
 * attributes the Dashboard pushes to Dungeon Master Guru.
 * @param {string} collection
 * @param {object} record
 * @param {object} attributes e.g. { clockFilled: 3 } or { revealed: true, revealedSessionUuid }
 * @param {{ now: () => string }} options
 */
export function applyLocalChange(collection, record, attributes, { now }) {
  if (collection === "secrets") {
    const revealed = Boolean(attributes.revealed);
    return {
      ...record,
      revealed,
      revealedAt: revealed ? now() : null,
      // Local ids and uuids are the same
      revealedSessionId: revealed ? (attributes.revealedSessionUuid ?? null) : null,
    };
  }
  const allowed = {
    fronts: ["clockFilled", "portents"],
    quests: ["status", "foundryScenes", "rewardCurrency", "rewardXp", "milestone"],
    sessions: ["log", "recap", "status", "foundryScenes", "treasureCurrency"],
    locations: ["foundrySceneUuid", "foundrySceneName"],
    npcs: ["foundryActorUuid", "foundryActorName"],
  }[collection];
  if (!allowed) return record;
  const changes = Object.fromEntries(Object.entries(attributes).filter(([key]) => allowed.includes(key)));
  return { ...record, ...changes };
}
