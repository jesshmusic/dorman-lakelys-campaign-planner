// How hard a combat encounter is, by the 2024 rules: the monsters' XP added
// up (no multiplier for how many there are) against the party's XP budget.
// No Foundry globals, so it can be tested in Node.

import { isMonsterLink, referenceOf } from "./link-kinds.mjs";

// XP for each challenge rating (SRD 5.2)
export const CR_XP = {
  0: 10,
  0.125: 25,
  0.25: 50,
  0.5: 100,
  1: 200,
  2: 450,
  3: 700,
  4: 1100,
  5: 1800,
  6: 2300,
  7: 2900,
  8: 3900,
  9: 5000,
  10: 5900,
  11: 7200,
  12: 8400,
  13: 10000,
  14: 11500,
  15: 13000,
  16: 15000,
  17: 18000,
  18: 20000,
  19: 22000,
  20: 25000,
  21: 33000,
  22: 41000,
  23: 50000,
  24: 62000,
  25: 75000,
  26: 90000,
  27: 105000,
  28: 120000,
  29: 135000,
  30: 155000,
};

// The 2024 XP budget for each character, by level: [Low, Moderate, High]
export const XP_BUDGETS = [
  null,
  [50, 75, 100],
  [100, 150, 200],
  [150, 225, 400],
  [250, 375, 500],
  [500, 750, 1100],
  [600, 1000, 1400],
  [750, 1300, 1700],
  [1000, 1700, 2100],
  [1300, 2000, 2600],
  [1600, 2300, 3100],
  [1900, 2900, 4100],
  [2200, 3700, 4700],
  [2600, 4200, 5400],
  [2900, 4900, 6200],
  [3300, 5400, 7800],
  [3800, 6100, 9800],
  [4500, 7200, 11700],
  [5000, 8700, 14200],
  [5500, 10700, 17200],
  [6400, 13200, 22000],
];

export const DEFAULT_PARTY_SIZE = 4;

/** The tables above: XP for a CR, and a character's budget for a level */
export const SRD_TABLES = {
  source: "srd",
  xpForCr: (cr) => CR_XP[cr] ?? null,
  budgetFor: (level) => XP_BUDGETS[level] ?? null,
};

const isBudget = (row) => Array.isArray(row) && row.length >= 3 && row.slice(0, 3).every((n) => Number.isFinite(n) && n > 0);

/**
 * The game system's own tables, when it has them: dnd5e keeps XP by CR in
 * CONFIG.DND5E.CR_EXP_LEVELS (whole CRs; less than 1 is 200 × CR, at least
 * 10) and the 2024 budgets in CONFIG.DND5E.ENCOUNTER_DIFFICULTY. Null when
 * they're missing or don't look right, so the SRD's are used.
 * @param {object} [dnd5e] CONFIG.DND5E
 */
export function systemTables(dnd5e) {
  const levels = dnd5e?.CR_EXP_LEVELS;
  const budgets = dnd5e?.ENCOUNTER_DIFFICULTY;
  if (!Array.isArray(levels) || levels.length < 31 || !levels.every((n) => Number.isFinite(n) && n > 0)) return null;
  if (!Array.isArray(budgets) || budgets.length < 21 || !budgets.slice(1, 21).every(isBudget)) return null;
  return {
    source: "dnd5e",
    xpForCr: (cr) => {
      if (cr < 1) return Math.max(200 * cr, 10);
      return Number.isInteger(cr) ? (levels[cr] ?? null) : null;
    },
    budgetFor: (level) => (level >= 1 && isBudget(budgets[level]) ? budgets[level].slice(0, 3) : null),
  };
}

/** A challenge rating as a number: "1/4" is 0.25, "CR 3" is 3; null when it isn't one */
export function crValue(cr) {
  if (cr === null || cr === undefined) return null;
  if (typeof cr === "number") return Number.isFinite(cr) && cr >= 0 ? cr : null;
  const text = String(cr).trim().replace(/^CR\s*/i, "");
  const fraction = /^(\d+)\s*\/\s*(\d+)$/.exec(text);
  if (fraction) return Number(fraction[2]) ? Number(fraction[1]) / Number(fraction[2]) : null;
  if (!/^\d+(\.\d+)?$/.test(text)) return null;
  return Number(text);
}

/**
 * An encounter's monsters with their CR and how many: from a book
 * reference's challenge rating (an actor dropped in keeps the CR it had),
 * or the CR a Dungeon Master Guru monster's link carries.
 * @returns {{ name: string, cr: number|null, quantity: number }[]}
 */
export function monstersWithCr(encounter, references) {
  return (encounter?.links ?? [])
    .filter((link) => isMonsterLink(link, references))
    .map((link) => {
      const reference = link.linkableType === "CampaignReference" ? referenceOf(references, link.linkableId) : null;
      const cr = reference ? crValue(reference.challengeRating) : crValue(link.challengeRating ?? link.detail);
      return { name: reference?.name ?? link.name, cr, quantity: Math.max(1, Math.floor(Number(link.quantity) || 1)) };
    });
}

/**
 * The party an encounter is measured against: the campaign's party size
 * (or, for a campaign in this world, how many characters are in its party;
 * else 4), at the quest's lowest level, or else the campaign's starting level.
 * @returns {{ size: number, level: number|null }}
 */
export function partyFor(campaign, quest) {
  const sized = Number(campaign?.partySize);
  const actors = campaign?.local ? (campaign.partyActorUuids ?? []).length : 0;
  const size = Number.isInteger(sized) && sized > 0 ? sized : actors > 0 ? actors : DEFAULT_PARTY_SIZE;
  const level = [quest?.levelMin, campaign?.startLevel].map(Number).find((n) => Number.isInteger(n) && n >= 1 && n <= 20);
  return { size, level: level ?? null };
}

/**
 * The difficulty band for some XP against a party's budget:
 * under Low "Trivial", up to Low "Low", up to Moderate "Moderate", up to
 * High "High", and above it "Over High".
 * @param {{ low: number, moderate: number, high: number }} budget
 */
export function band(xp, { low, moderate, high }) {
  if (xp < low) return "Trivial";
  if (xp <= low) return "Low";
  if (xp <= moderate) return "Moderate";
  if (xp <= high) return "High";
  return "Over High";
}

/**
 * How hard a combat encounter is, or null when it isn't one or has no
 * monsters: { xp, unrated, band, budget, party, source }. Monsters with no CR
 * add nothing and are counted in `unrated`; without a party level there's no
 * budget or band.
 * @param {object} encounter
 * @param {{ references?: object[]|Map<string, object>, campaign?: object, quest?: object, tables?: object }} context
 *   tables: the game system's (see systemTables), or the SRD's
 */
export function encounterDifficulty(encounter, { references, campaign, quest, tables = SRD_TABLES } = {}) {
  if ((encounter?.kind ?? "combat") !== "combat") return null;
  const monsters = monstersWithCr(encounter, references);
  if (!monsters.length) return null;
  let xp = 0;
  let unrated = 0;
  for (const { cr, quantity } of monsters) {
    const each = cr === null ? null : tables.xpForCr(cr);
    if (each === null || each === undefined) unrated += quantity;
    else xp += each * quantity;
  }
  const party = partyFor(campaign, quest);
  const perCharacter = party.level ? tables.budgetFor(party.level) : null;
  const budget = perCharacter && {
    low: perCharacter[0] * party.size,
    moderate: perCharacter[1] * party.size,
    high: perCharacter[2] * party.size,
  };
  return { xp, unrated, band: budget ? band(xp, budget) : null, budget, party, source: tables.source };
}

const number = (n) => Number(n).toLocaleString("en");

/**
 * The difficulty in a line, e.g. "Moderate: 900 XP (budget for 4 level-3
 * characters: Low 600 · Moderate 900 · High 1,600)". Empty for null.
 */
export function difficultyText(difficulty) {
  if (!difficulty) return "";
  const { xp, unrated, band: label, budget, party } = difficulty;
  const unratedNote = unrated ? ` Some monsters have no CR, so they aren't counted.` : "";
  if (!budget) {
    return `${number(xp)} XP. Set the campaign's starting level, or the quest's levels, to see how hard it is.${unratedNote}`;
  }
  const who = `${party.size} level-${party.level} ${party.size === 1 ? "character" : "characters"}`;
  return `${label}: ${number(xp)} XP (budget for ${who}: Low ${number(budget.low)} · Moderate ${number(budget.moderate)} · High ${number(budget.high)}).${unratedNote}`;
}
