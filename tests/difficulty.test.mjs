import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CR_XP,
  SRD_TABLES,
  XP_BUDGETS,
  band,
  crValue,
  difficultyText,
  encounterDifficulty,
  monstersWithCr,
  partyFor,
  systemTables,
} from "../src/difficulty.mjs";

const references = [
  { id: "r1", name: "Ghoul", category: "monster", challengeRating: "1" },
  { id: "r2", name: "Goblin Warrior", category: "monster", challengeRating: "1/4" },
  { id: "r3", name: "Homebrew Horror", category: "monster", challengeRating: null },
  { id: "r4", name: "Bag of Holding", category: "magic_item" },
];
const link = (linkableType, linkableId, extra = {}) => ({ linkableType, linkableId, name: linkableId, quantity: null, ...extra });
const campaign = { partySize: 4, startLevel: 3 };

// dnd5e 6's tables, as CONFIG.DND5E has them
const DND5E = {
  CR_EXP_LEVELS: [
    10, 200, 450, 700, 1100, 1800, 2300, 2900, 3900, 5000, 5900, 7200, 8400, 10000, 11500, 13000, 15000, 18000, 20000,
    22000, 25000, 33000, 41000, 50000, 62000, 75000, 90000, 105000, 120000, 135000, 155000,
  ],
  ENCOUNTER_DIFFICULTY: [[0, 0, 0], ...XP_BUDGETS.slice(1)],
};

test("reads challenge ratings however they're written", () => {
  assert.equal(crValue("1/4"), 0.25);
  assert.equal(crValue("1/8"), 0.125);
  assert.equal(crValue(" CR 1/2 "), 0.5);
  assert.equal(crValue("CR 12"), 12);
  assert.equal(crValue(3), 3);
  assert.equal(crValue("0"), 0);
  for (const nothing of [null, undefined, "", "Rarity varies", "1/0", -1]) assert.equal(crValue(nothing), null, String(nothing));
});

test("knows the SRD's XP for every challenge rating and the 2024 budgets for every level", () => {
  assert.equal(Object.keys(CR_XP).length, 34);
  assert.deepEqual([CR_XP[0], CR_XP[0.125], CR_XP[0.25], CR_XP[0.5], CR_XP[1], CR_XP[30]], [10, 25, 50, 100, 200, 155000]);
  assert.deepEqual([XP_BUDGETS[1], XP_BUDGETS[3], XP_BUDGETS[20]], [[50, 75, 100], [150, 225, 400], [6400, 13200, 22000]]);
  assert.equal(XP_BUDGETS.length, 21);
  assert.equal(SRD_TABLES.xpForCr(31), null);
});

test("uses dnd5e's own tables when the system has them, with the same numbers", () => {
  const tables = systemTables(DND5E);

  assert.equal(tables.source, "dnd5e");
  for (const cr of Object.keys(CR_XP).map(Number)) assert.equal(tables.xpForCr(cr), CR_XP[cr], `CR ${cr}`);
  for (let level = 1; level <= 20; level += 1) assert.deepEqual(tables.budgetFor(level), XP_BUDGETS[level], `level ${level}`);
  assert.equal(tables.budgetFor(0), null);
  assert.equal(tables.xpForCr(2.5), null);
});

test("falls back to the SRD's tables when the system's are missing or odd", () => {
  assert.equal(systemTables(undefined), null);
  assert.equal(systemTables({}), null);
  assert.equal(systemTables({ ...DND5E, CR_EXP_LEVELS: DND5E.CR_EXP_LEVELS.slice(0, 10) }), null);
  assert.equal(systemTables({ ...DND5E, ENCOUNTER_DIFFICULTY: [[0, 0, 0], ["a", "b", "c"]] }), null);
});

test("an encounter's monsters with their CR and how many", () => {
  const encounter = {
    links: [
      link("CampaignReference", "r2", { quantity: 4 }),
      link("Monster", "m1", { name: "Zombie", detail: "CR 1/4" }),
      link("Monster", "m2", { name: "Bandit", challengeRating: "1/8", quantity: 3 }),
      link("Monster", "m3", { name: "Mystery" }),
      link("Monster", "m4", { name: "Ogre", challengeRating: "2", detail: "CR 1/4" }),
      link("CampaignReference", "r4"),
      link("CampaignNpc", "n1"),
    ],
  };

  assert.deepEqual(monstersWithCr(encounter, references), [
    { name: "Goblin Warrior", cr: 0.25, quantity: 4 },
    { name: "Zombie", cr: 0.25, quantity: 1 },
    { name: "Bandit", cr: 0.125, quantity: 3 },
    { name: "Mystery", cr: null, quantity: 1 },
    // The CR the website sends with the link wins over the one in its detail
    { name: "Ogre", cr: 2, quantity: 1 },
  ]);
});

test("measures against the campaign's party, at the quest's level or the starting level", () => {
  assert.deepEqual(partyFor({ partySize: 5, startLevel: 3 }, { levelMin: 7 }), { size: 5, level: 7 });
  assert.deepEqual(partyFor({ partySize: 5, startLevel: 3 }, {}), { size: 5, level: 3 });
  assert.deepEqual(partyFor({}, null), { size: 4, level: null });
  assert.deepEqual(partyFor({ local: true, partyActorUuids: ["a", "b", "c"], startLevel: 2 }), { size: 3, level: 2 });
  assert.deepEqual(partyFor({ local: true, partyActorUuids: [], partySize: null }), { size: 4, level: null });
  assert.deepEqual(partyFor({ partyActorUuids: ["a", "b"] }), { size: 4, level: null }, "a synced campaign's party size is its own");
  assert.deepEqual(partyFor({ partySize: 6, local: true, partyActorUuids: ["a"] }), { size: 6, level: null });
});

test("names the difficulty band: each budget is the most XP for its difficulty", () => {
  const budget = { low: 600, moderate: 900, high: 1600 };

  assert.equal(band(0, budget), "Low");
  assert.equal(band(599, budget), "Low");
  assert.equal(band(600, budget), "Low");
  assert.equal(band(601, budget), "Moderate");
  assert.equal(band(900, budget), "Moderate");
  assert.equal(band(1050, budget), "High");
  assert.equal(band(1600, budget), "High");
  assert.equal(band(1601, budget), "Over High");
});

test("adds up the monsters' XP, with no multiplier for how many, against the budget", () => {
  const encounter = {
    kind: "combat",
    links: [link("CampaignReference", "r1", { quantity: 3 }), link("CampaignReference", "r2", { quantity: 6 })],
  };
  const difficulty = encounterDifficulty(encounter, { references, campaign });

  assert.deepEqual(difficulty, {
    xp: 3 * 200 + 6 * 50,
    unrated: 0,
    band: "Moderate",
    budget: { low: 600, moderate: 900, high: 1600 },
    party: { size: 4, level: 3 },
    source: "srd",
  });
  assert.equal(
    difficultyText(difficulty),
    "Moderate: 900 XP (budget for 4 level-3 characters: Low 600 · Moderate 900 · High 1,600).",
  );
  assert.equal(encounterDifficulty(encounter, { references, campaign, tables: systemTables(DND5E) }).source, "dnd5e");
});

test("says when some monsters have no CR, and counts the rest", () => {
  const encounter = { kind: "combat", links: [link("CampaignReference", "r1"), link("CampaignReference", "r3", { quantity: 2 })] };
  const difficulty = encounterDifficulty(encounter, { references, campaign: { partySize: 1, startLevel: 1 } });

  assert.deepEqual([difficulty.xp, difficulty.unrated, difficulty.band], [200, 2, "Over High"]);
  assert.equal(
    difficultyText(difficulty),
    "Over High: 200 XP (budget for 1 level-1 character: Low 50 · Moderate 75 · High 100). Some monsters have no CR, so they aren't counted.",
  );
});

test("without a party level, gives the XP and asks for the level", () => {
  const difficulty = encounterDifficulty({ links: [link("CampaignReference", "r1")] }, { references, campaign: {} });

  assert.deepEqual([difficulty.xp, difficulty.band, difficulty.budget], [200, null, null]);
  assert.match(difficultyText(difficulty), /^200 XP\. Set the campaign's starting level, or the quest's levels/);
});

test("only combat encounters with monsters have a difficulty", () => {
  assert.equal(encounterDifficulty({ kind: "social", links: [link("CampaignReference", "r1")] }, { references, campaign }), null);
  assert.equal(encounterDifficulty({ kind: "combat", links: [link("CampaignReference", "r4")] }, { references, campaign }), null);
  assert.equal(encounterDifficulty(null, {}), null);
  assert.equal(difficultyText(null), "");
});

test("shows big numbers with thousands separators", () => {
  const encounter = { kind: "combat", links: [link("Monster", "m1", { detail: "CR 20", quantity: 2 })] };
  const text = difficultyText(encounterDifficulty(encounter, { campaign: { partySize: 5, startLevel: 15 } }));

  assert.equal(text, "Over High: 50,000 XP (budget for 5 level-15 characters: Low 16,500 · Moderate 27,000 · High 39,000).");
});

test("an encounter over the Moderate budget is High", () => {
  const encounter = { kind: "combat", links: [link("CampaignReference", "r1", { quantity: 5 }), link("CampaignReference", "r2")] };

  assert.equal(
    difficultyText(encounterDifficulty(encounter, { references, campaign })),
    "High: 1,050 XP (budget for 4 level-3 characters: Low 600 · Moderate 900 · High 1,600).",
  );
});
