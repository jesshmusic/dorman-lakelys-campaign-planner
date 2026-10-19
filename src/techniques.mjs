// The techniques the planner borrows, where they come from, and which ones a
// DM can switch off for a world. Switching one off hides it; its data stays,
// and still syncs. No Foundry globals, so it can be tested in Node.

import { SETTINGS } from "./constants.mjs";

// Where the planner's ideas come from. `by` is the short name shown next to a
// link; `author` is the longer one the How it works window groups them by.
export const SOURCES = [
  {
    id: "eightSteps",
    author: "Sly Flourish (Mike Shea)",
    by: "Sly Flourish",
    title: "The Eight Steps of the Lazy DM",
    url: "https://slyflourish.com/eight_steps_2023.html",
    about: "session prep in eight steps",
  },
  {
    id: "lazyBook",
    author: "Sly Flourish (Mike Shea)",
    by: "Sly Flourish",
    title: "Return of the Lazy Dungeon Master",
    url: "https://slyflourish.com/returnofthelazydm/",
    about: "the book the eight steps come from",
  },
  {
    id: "sixTruths",
    author: "Sly Flourish (Mike Shea)",
    by: "Sly Flourish",
    title: "Understanding the Six Truths",
    url: "https://slyflourish.com/understanding_the_six_truths.html",
    about: "the truths of the setting",
  },
  {
    id: "secretsAndClues",
    author: "Sly Flourish (Mike Shea)",
    by: "Sly Flourish",
    title: "Secrets and Clues, the Secret Weapon of the Lazy Dungeon Master",
    url: "https://slyflourish.com/sharing_secrets.html",
    about: "secrets and clues",
  },
  {
    id: "startingStrong",
    author: "Sly Flourish (Mike Shea)",
    by: "Sly Flourish",
    title: "Starting Strong",
    url: "https://slyflourish.com/starting_strong.html",
    about: "a session's strong start",
  },
  {
    id: "lazyCampaigns",
    author: "Sly Flourish (Mike Shea)",
    by: "Sly Flourish",
    title: "Prepping and Running Lazy Campaigns",
    url: "https://slyflourish.com/prepping_and_running_lazy_campaigns.html",
    about: "threats in a Lazy DM campaign",
  },
  {
    id: "onePageGuide",
    author: "Sly Flourish (Mike Shea)",
    by: "Sly Flourish",
    title: "Writing a One-Page Campaign Guide",
    url: "https://slyflourish.com/one_page_campaign_guide.html",
    about: "the pitch for your players",
  },
  {
    id: "threeClueRule",
    author: "The Alexandrian (Justin Alexander)",
    by: "The Alexandrian",
    title: "Three Clue Rule",
    url: "https://thealexandrian.net/wordpress/1118/roleplaying-games/three-clue-rule",
    about: "three clues for anything the party must learn",
  },
  {
    id: "dontPrepPlots",
    author: "The Alexandrian (Justin Alexander)",
    by: "The Alexandrian",
    title: "Don't Prep Plots",
    url: "https://thealexandrian.net/wordpress/4147/roleplaying-games/dont-prep-plots",
    about: "prepping situations, not plots, as a sandbox does",
  },
  {
    id: "fronts",
    author: "Dungeon World (Sage LaTorra and Adam Koebel)",
    by: "Dungeon World",
    title: "Fronts",
    url: "https://roll20.net/compendium/dw/Fronts",
    about: "threats, grim portents and impending doom",
  },
  {
    id: "progressClocks",
    author: "Blades in the Dark (John Harper)",
    by: "Blades in the Dark",
    title: "Progress clocks",
    url: "https://roll20.net/compendium/BITD/Progress%20clocks",
    about: "threat clocks",
  },
  {
    id: "fiveRoom",
    author: "Johnn Four",
    by: "Johnn Four",
    title: "5 Room Dungeons",
    url: "https://www.roleplayingtips.com/5-room-dungeons/",
    about: "the one-shot template",
  },
];

/**
 * The techniques a DM can switch off, each a world setting that is on by
 * default. `sources` credit where it comes from; the Getting started
 * checklist is the module's own.
 */
export const TECHNIQUES = [
  {
    key: "truths",
    setting: SETTINGS.useTruths,
    name: "Use the six truths",
    hint: "Short facts about the world that every player knows, in the New campaign guide, the brief and the Overview journal page. Off hides them; nothing is deleted.",
    sources: ["sixTruths"],
  },
  {
    key: "clocks",
    setting: SETTINGS.useClocks,
    name: "Use threat clocks",
    hint: "A clock on each threat that fills as it nears its goal, on the Story tab, the Dashboard and threat journal pages. Off hides them; nothing is deleted.",
    sources: ["progressClocks"],
  },
  {
    key: "portents",
    setting: SETTINGS.usePortents,
    name: "Use grim portents",
    hint: "Signs that a threat is getting closer, on the Story tab, the Dashboard and threat journal pages. Off hides them; nothing is deleted.",
    sources: ["fronts"],
  },
  {
    key: "secrets",
    setting: SETTINGS.useSecrets,
    name: "Use secrets and clues",
    hint: "Clues the party could find, on the Secrets tab, in session prep and on the Dashboard. Off hides them; nothing is deleted.",
    sources: ["secretsAndClues"],
  },
  {
    key: "threeClues",
    setting: SETTINGS.useThreeClueRule,
    name: "Use the Three Clue Rule check",
    hint: "A warning on the Secrets tab when something the party must learn has fewer than three clues.",
    sources: ["threeClueRule"],
  },
  {
    key: "checklist",
    setting: SETTINGS.useGettingStarted,
    name: "Use the Getting started checklist",
    hint: "The list of what to plan first, on the Campaign Planner's Overview tab.",
    sources: [],
  },
];

// Ideas the planner always uses, and where they come from
export const IDEAS = [
  { key: "sessionPrep", sources: ["eightSteps", "lazyBook"] },
  { key: "strongStart", sources: ["startingStrong"] },
  { key: "threats", sources: ["fronts", "lazyCampaigns"] },
  { key: "pitch", sources: ["onePageGuide"] },
  { key: "oneShot", sources: ["fiveRoom"] },
  { key: "sandbox", sources: ["dontPrepPlots"] },
];

/** Every technique on, as a world starts */
export const ALL_ON = Object.freeze(Object.fromEntries(TECHNIQUES.map(({ key }) => [key, true])));

/**
 * The techniques this world uses, as { truths: true, ... }, from a function
 * that reads a setting by its key. Anything not set to false is on. The
 * Three Clue Rule check only applies while secrets are on.
 * @param {(setting: string) => unknown} get
 */
export function techniquesFrom(get) {
  const techniques = Object.fromEntries(
    TECHNIQUES.map(({ key, setting }) => {
      let value;
      try {
        value = get(setting);
      } catch {
        value = undefined;
      }
      return [key, value !== false];
    }),
  );
  techniques.threeClues &&= techniques.secrets;
  return techniques;
}

// Form fields that belong to a technique, by the field's name
const TECHNIQUE_FIELDS = {
  truths: "truths",
  portents: "portents",
  clockSegments: "clocks",
  clockFilled: "clocks",
};

/**
 * A form's fields without the ones for techniques that are switched off.
 * @param {Array<{ name: string }|string>} fields field objects, or field names
 */
export function visibleFields(fields, techniques = ALL_ON) {
  return (fields ?? []).filter((field) => {
    const technique = TECHNIQUE_FIELDS[typeof field === "string" ? field : field.name];
    return !technique || techniques[technique] !== false;
  });
}

// The eight steps of session prep, in order
export const PREP_STEPS = ["characters", "strongStart", "scenes", "secrets", "locations", "npcs", "monsters", "treasure"];

/** The session prep steps to show, in order (numbered from 1 by their place) */
export const prepSteps = (techniques = ALL_ON) =>
  PREP_STEPS.filter((step) => step !== "secrets" || techniques.secrets !== false);

/**
 * The sources to credit for some techniques and ideas, each once, in order.
 * A technique that is switched off isn't credited.
 * @param {string[]} keys technique and idea keys, e.g. ["threats", "clocks"]
 */
export function creditsFor(keys, techniques = ALL_ON) {
  const ids = [];
  for (const key of keys) {
    const technique = TECHNIQUES.find((t) => t.key === key);
    if (technique && techniques[key] === false) continue;
    const sources = technique?.sources ?? IDEAS.find((idea) => idea.key === key)?.sources ?? [];
    for (const id of sources) if (!ids.includes(id)) ids.push(id);
  }
  return ids.map((id) => SOURCES.find((source) => source.id === id));
}

/** Every source, grouped by author in the order they first appear: [{ author, sources }] */
export function sourcesByAuthor() {
  const groups = [];
  for (const source of SOURCES) {
    const group = groups.find((g) => g.author === source.author);
    if (group) group.sources.push(source);
    else groups.push({ author: source.author, sources: [source] });
  }
  return groups;
}
