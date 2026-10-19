// The guided "New campaign" setup: its steps, fields and checks, and the
// request that creates the campaign on Dungeon Master Guru. No Foundry
// globals, so it can be tested in Node.
//
// The words come from Dungeon Master Guru (GET /v1/setup_guide), where an
// admin edits them for the website and this module alike. STEPS and TEMPLATES
// hold the words the module ships with, for worlds that have never reached it.

export const MAX_TRUTHS = 6;

export const TEMPLATES = [
  {
    value: "three_act",
    title: "Story arc",
    description:
      "A set number of sessions, like a six-week campaign. Creates every session with levels rising toward your target, three acts, and a main threat with a clock.",
    example: "Six weekly sessions to stop a zombie plague in Greyhawk.",
  },
  {
    value: "sandbox",
    title: "Sandbox",
    description:
      "An open-ended campaign driven by quests and villains. Creates a main questline and a villain front; add sessions as you go.",
    example: "The party roams the Wild Coast, taking jobs from a quest board while two villains scheme.",
  },
  {
    value: "five_room",
    title: "One-shot",
    description: "A single adventure built on the five-room dungeon: guardian, puzzle, setback, climax, reward.",
    example: "One stormy night in a haunted lighthouse.",
  },
  {
    value: "blank",
    title: "Blank",
    description: "Start from scratch and build it your way.",
    example: "For when you already know exactly what you want.",
  },
];

// Campaign fields, by their Dungeon Master Guru attribute names
export const FIELDS = {
  name: { label: "Campaign name", type: "text", required: true },
  tone: { label: "Tone", type: "text", placeholder: "e.g. survival horror, swashbuckling" },
  premise: { label: "Premise", hint: "What is this campaign about?", type: "textarea" },
  pitch: { label: "Pitch for your players", hint: "A short, spoiler-free summary for session zero", type: "textarea" },
  party_size: { label: "Players", type: "number", min: 1, max: 12 },
  start_level: { label: "Starting level", type: "number", min: 1, max: 20 },
  target_level: { label: "Target level", type: "number", min: 1, max: 20 },
  planned_sessions: {
    label: "Planned sessions",
    hint: "Story arcs get one session each (6 if blank)",
    type: "number",
    min: 1,
    max: 100,
  },
  cadence: { label: "How often you play", type: "text", placeholder: "e.g. weekly" },
  setting_name: { label: "Setting", type: "text", placeholder: "e.g. Greyhawk, Eberron, or your own world" },
  truths: {
    label: "Truths of the setting",
    hint: "Up to six facts everyone at the table knows, one per line",
    type: "lines",
  },
  setting_notes: { label: "Setting notes", type: "textarea" },
};

export const STEPS = [
  {
    id: "kind",
    label: "Kind",
    title: "What kind of game?",
    intro: "Choose the shape of your campaign. It decides what we set up for you, and you can change any of it later.",
    why: "It gives your campaign the right structure from the start: a story arc gets its sessions, acts and main threat, a sandbox gets a questline and a villain, and a one-shot gets a five-room dungeon. Not sure? Pick a story arc.",
  },
  {
    id: "pitch",
    label: "Pitch",
    title: "The pitch",
    intro: "Give your campaign a name, and say what it is about in a sentence or two.",
    why: "A good premise is a situation, not a plot: who is in trouble, what is at stake, and why the characters would care. Prep the situation and let the players decide what happens next.",
    example:
      "The dead are rising in Hommlet, and the temple that should stop them is hiding something. Tone: survival horror.",
    fields: ["name", "tone", "premise", "pitch"],
  },
  {
    id: "table",
    label: "Table",
    title: "The table",
    intro: "Who is playing, at what level, and for how long.",
    why: "This sets the scale of the campaign: how dangerous the threats should be, how quickly the characters level up, and how many sessions to plan for.",
    example: "Four players, levels 3 to 8, six sessions, played weekly.",
    fields: ["party_size", "start_level", "target_level", "planned_sessions", "cadence"],
  },
  {
    id: "world",
    label: "World",
    title: "The world",
    intro: "Where the campaign happens, and what everyone at the table knows about it.",
    why: "Truths are short facts every player knows before the first session. Six of them set the mood better than pages of history, and give the players something to build their characters around.",
    example:
      "The dead do not rest easy in the Flanaess.\nThe Church of Pelor has closed its doors to the poor.\nHommlet’s walls were built for bandits, not armies.",
    fields: ["setting_name", "truths", "setting_notes"],
  },
  {
    id: "books",
    label: "Books",
    title: "Your books",
    intro: "Choose the compendiums this campaign uses for monsters, spells, items and tables.",
    why: "On Dungeon Master Guru, monster and treasure searches use these, and each pick becomes a link in your session journals: click it to open the stat block, or drag it onto a scene to place a token. In a Foundry world, drag entries from these compendiums straight into your journals.",
  },
  {
    id: "review",
    label: "Review",
    title: "Review and create",
    intro: "Check your brief. You can change any of it later.",
  },
];

export const LAST_STEP = STEPS.length - 1;

// The words an admin can change on Dungeon Master Guru; the rest (ids, fields) is the module's
const STEP_WORDS = ["label", "title", "intro", "why", "example"];
const TEMPLATE_WORDS = ["title", "description", "example"];
// Words a step or template can do without
const OPTIONAL_WORDS = ["why", "example"];

function withWordsFrom(list, keyName, words, items) {
  const found = new Map(
    (Array.isArray(list) ? list : []).filter((entry) => typeof entry?.[keyName] === "string").map((entry) => [entry[keyName], entry]),
  );
  return items.map((item) => {
    const entry = found.get(keyName === "id" ? item.id : item.value);
    if (!entry) return item;
    const merged = { ...item };
    for (const word of words) {
      const value = entry[word];
      if (typeof value === "string" && value.trim()) merged[word] = value;
      else if ((value === null || value === "") && OPTIONAL_WORDS.includes(word)) delete merged[word];
    }
    return merged;
  });
}

/**
 * The guide's steps and templates with Dungeon Master Guru's words in place
 * of the built-in ones. Steps and templates it doesn't know, and empty
 * required words, are ignored; an empty "why" or example is left out.
 * @param {{ steps?: object[], templates?: object[] }|null} guide what GET /v1/setup_guide returns
 */
export function withWords(guide) {
  return {
    steps: withWordsFrom(guide?.steps, "id", STEP_WORDS, STEPS),
    templates: withWordsFrom(guide?.templates, "value", TEMPLATE_WORDS, TEMPLATES),
  };
}

let current = withWords(null);

/** The steps and templates as the guide shows them now */
export const guideSteps = () => current.steps;
export const guideTemplates = () => current.templates;

/** Uses Dungeon Master Guru's words, fetched now or remembered from last time */
export function setGuideWords(guide) {
  current = withWords(guide);
}

// Bump when the draft's shape changes, so an old draft starts fresh
export const DRAFT_VERSION = 1;

export function defaultDraft() {
  return {
    version: DRAFT_VERSION,
    step: 0,
    furthest: 0,
    template: "three_act",
    values: { party_size: "4", start_level: "1" },
    // World actor UUIDs of the characters in the party
    party: [],
    // Compendium packs turned off
    excludedPacks: [],
    // Once the DM types a player count, picking characters stops changing it
    partySizeEdited: false,
  };
}

export const truthsOf = (text) =>
  String(text ?? "")
    .split("\n")
    .map((truth) => truth.trim())
    .filter(Boolean);

const text = (values, name) => String(values?.[name] ?? "").trim();

/**
 * Why the DM can't leave a step yet, or null when they can.
 * @param {string} stepId
 * @param {Record<string, string>} values
 */
export function validateStep(stepId, values) {
  if (stepId === "pitch" && !text(values, "name")) return "Give your campaign a name to go on.";
  if (stepId === "table") {
    for (const name of STEPS.find((step) => step.id === "table").fields) {
      const field = FIELDS[name];
      const value = text(values, name);
      if (field.type !== "number" || value === "") continue;
      const number = Number(value);
      if (!Number.isInteger(number) || number < field.min || number > field.max) {
        return `${field.label} must be a whole number from ${field.min} to ${field.max}.`;
      }
    }
    const start = Number(text(values, "start_level"));
    const target = Number(text(values, "target_level"));
    if (text(values, "start_level") && text(values, "target_level") && target < start) {
      return "The target level can't be lower than the starting level.";
    }
  }
  if (stepId === "world") {
    const count = truthsOf(values?.truths).length;
    if (count > MAX_TRUTHS) return `Keep it to ${MAX_TRUTHS} truths. You have ${count}.`;
  }
  return null;
}

/** The first check that fails across every step, as { step, error } */
export function validateAll(values) {
  for (const [index, step] of STEPS.entries()) {
    const error = validateStep(step.id, values);
    if (error) return { step: index, error };
  }
  return null;
}

/** The step that holds a Dungeon Master Guru field, e.g. "target_level" -> the table */
export function stepForField(field) {
  if (field === "template" || field === "mode") return 0;
  if (field === "excluded_compendium_packs") return STEPS.findIndex((step) => step.id === "books");
  const index = STEPS.findIndex((step) => step.fields?.includes(field));
  return index === -1 ? LAST_STEP : index;
}

/**
 * The body for POST /v1/foundry/campaigns.
 * @param {object} draft
 * @param {{ world: { id: string, title: string }, characters: object[], requestId: string }} options
 *   characters: the party's character payloads (see characters.mjs)
 */
export function toPayload(draft, { world, characters = [], requestId }) {
  const campaign = {};
  for (const [name, field] of Object.entries(FIELDS)) {
    const value = text(draft.values, name);
    if (field.type === "lines") campaign[name] = truthsOf(value);
    else if (field.type === "number") campaign[name] = value === "" ? null : Number(value);
    else campaign[name] = value === "" ? null : value;
  }
  campaign.excluded_compendium_packs = [...draft.excludedPacks];
  return {
    template: draft.template,
    campaign,
    party: { world, characters },
    request_id: requestId,
  };
}

/**
 * A saved draft made safe to use: a fresh one if it's missing or from an
 * older version, with the step in range and only characters still in the world.
 * @param {object|null} saved
 * @param {string[]} actorUuids the world's player characters now
 */
export function normalizeDraft(saved, actorUuids) {
  const fresh = defaultDraft();
  if (!saved || typeof saved !== "object" || saved.version !== DRAFT_VERSION) return fresh;
  const step = Math.min(Math.max(Number(saved.step) || 0, 0), LAST_STEP);
  return {
    ...fresh,
    step,
    furthest: Math.min(Math.max(Number(saved.furthest) || step, step), LAST_STEP),
    template: TEMPLATES.some((option) => option.value === saved.template) ? saved.template : fresh.template,
    values: { ...fresh.values, ...(saved.values && typeof saved.values === "object" ? saved.values : {}) },
    party: Array.isArray(saved.party) ? saved.party.filter((uuid) => actorUuids.includes(uuid)) : [],
    excludedPacks: Array.isArray(saved.excludedPacks)
      ? saved.excludedPacks.filter((pack) => typeof pack === "string")
      : [],
    partySizeEdited: Boolean(saved.partySizeEdited),
  };
}

/** Whether the draft has anything worth picking up again */
export const hasProgress = (draft) => draft.step > 0 || Boolean(text(draft.values, "name"));
