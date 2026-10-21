import { test } from "node:test";
import assert from "node:assert/strict";
import {
  FIRST_ENCOUNTER,
  applyEncounter,
  encounterSort,
  encounterValues,
  encountersOf,
  isItemLink,
  isMonsterLink,
  itemLinks,
  legacyEncounter,
  monsterLinks,
  moveEncounter,
  planQuestEncounters,
  questSort,
  withReference,
  withoutLink,
} from "../src/encounters.mjs";
import { changedAttributes, createAttributes, EDITABLE } from "../src/editing.mjs";
import { PUSH_TYPES, SECTIONS, TYPE_COLLECTIONS } from "../src/constants.mjs";

const ids = () => {
  let n = 0;
  return () => `new${(n += 1)}`;
};

const references = [
  { id: "r1", name: "Ghoul", category: "monster", challengeRating: "1" },
  { id: "r2", name: "Bag of Holding", category: "magic_item" },
  { id: "r3", name: "Treasure Hoard", category: "table" },
];

const link = (id, linkableType, linkableId, extra = {}) => ({ id, uuid: id, linkableType, linkableId, name: id, position: 0, quantity: null, ...extra });

test("encounters are a kind of record the sync knows, with a journal entry of their own", () => {
  assert.equal(PUSH_TYPES.encounters, "encounter");
  assert.equal(TYPE_COLLECTIONS.CampaignEncounter, "encounters");
  const sections = SECTIONS.map((section) => section.collection);
  assert.equal(sections.indexOf("encounters"), sections.indexOf("quests") + 1);
  assert.equal(SECTIONS.find((section) => section.collection === "encounters").name, "Encounters");
  // Sorted between Quests and Secrets in campaigns made before encounters too
  const sorts = SECTIONS.map((section) => section.sort);
  assert.deepEqual([...sorts].sort((a, b) => a - b), sorts);
  assert.deepEqual(EDITABLE.encounters, [
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
  ]);
});

test("an encounter is sent with its editable fields, and only what changed", () => {
  const encounter = {
    id: "e1",
    uuid: "e1",
    syncVersion: 0,
    questId: "q1",
    name: "Ambush",
    kind: "combat",
    description: null,
    notes: null,
    position: 0,
    foundryScenes: [],
    links: [link("k1", "CampaignReference", "r1", { quantity: 4 })],
    rewardCurrency: {},
    rewardXp: null,
  };

  assert.deepEqual(createAttributes("encounters", encounter), {
    name: "Ambush",
    kind: "combat",
    description: null,
    notes: null,
    position: 0,
    questId: "q1",
    foundryScenes: [],
    rewardCurrency: {},
    rewardXp: null,
    links: [{ linkableType: "CampaignReference", linkableId: "r1", quantity: 4 }],
  });
  assert.deepEqual(changedAttributes("encounters", encounter, { ...encounter, kind: "social", position: 2 }), {
    kind: "social",
    position: 2,
  });
});

test("tells monsters from reward items, Dungeon Master Guru's and the books' alike", () => {
  const owner = {
    links: [
      link("k1", "Monster", "m1"),
      link("k2", "CampaignReference", "r1"),
      link("k3", "CampaignReference", "r2"),
      link("k4", "Item", "i1"),
      link("k5", "CampaignNpc", "n1"),
      link("k6", "CampaignReference", "gone"),
    ],
  };

  assert.deepEqual(monsterLinks(owner, references).map((l) => l.id), ["k1", "k2"]);
  assert.deepEqual(itemLinks(owner, references).map((l) => l.id), ["k3", "k4"]);
  assert.ok(isMonsterLink(owner.links[1], new Map(references.map((r) => [r.id, r]))), "takes a Map of references too");
  assert.equal(isItemLink(owner.links[5], references), false);
  assert.deepEqual(monsterLinks(undefined, references), []);
});

test("a quest's encounters, in order", () => {
  const encounters = [
    { id: "e1", questId: "q1", position: 2 },
    { id: "e2", questId: "q2", position: 0 },
    { id: "e3", questId: "q1", position: 0 },
    { id: "e4", questId: "q1" },
  ];

  assert.deepEqual(encountersOf(encounters, "q1").map((e) => e.id), ["e3", "e4", "e1"]);
  assert.deepEqual(encountersOf(undefined, "q1"), []);
});

test("moves a quest's monsters into one encounter, keeping how many", () => {
  const quests = [
    {
      id: "q1",
      name: "Clear the crypt",
      links: [
        link("k1", "CampaignNpc", "n1", { position: 0 }),
        link("k2", "CampaignReference", "r1", { position: 1, quantity: 4 }),
        link("k3", "CampaignReference", "r2", { position: 2, quantity: 2 }),
        link("k4", "Monster", "m9", { position: 3, name: "Zombie", detail: "CR 1/4" }),
      ],
    },
    { id: "q2", name: "Find the map", links: [link("k5", "CampaignReference", "r2")] },
    { id: "q3", name: "No links" },
  ];
  const plan = planQuestEncounters({ quests, references }, { id: ids() });

  assert.equal(plan.quests.length, 1);
  assert.deepEqual(plan.quests[0].links.map((l) => [l.id, l.position]), [
    ["k1", 0],
    ["k3", 1],
  ]);
  assert.equal(plan.encounters.length, 1);
  const [encounter] = plan.encounters;
  assert.deepEqual(
    [encounter.id, encounter.uuid, encounter.questId, encounter.name, encounter.kind, encounter.position, encounter.syncVersion],
    ["new1", "new1", "q1", FIRST_ENCOUNTER, "combat", 0, 0],
  );
  assert.equal(FIRST_ENCOUNTER, "Encounter");
  assert.deepEqual(encounter.links.map((l) => [l.id, l.linkableType, l.quantity, l.position]), [
    ["k2", "CampaignReference", 4, 0],
    ["k4", "Monster", null, 1],
  ]);
  assert.deepEqual([encounter.foundryScenes, encounter.rewardCurrency, encounter.rewardXp], [[], {}, null]);
  assert.deepEqual(quests[0].links.length, 4, "the quests given are left as they were");
});

test("moving the monsters again finds nothing to do", () => {
  const quests = [{ id: "q1", links: [link("k2", "CampaignReference", "r1")] }];
  const first = planQuestEncounters({ quests, references }, { id: ids() });
  const again = planQuestEncounters({ quests: first.quests, encounters: first.encounters, references }, { id: ids() });

  assert.deepEqual(again, { quests: [], encounters: [] });
  assert.deepEqual(planQuestEncounters({}, { id: ids() }), { quests: [], encounters: [] });
});

test("a quest's monsters from before encounters show as one encounter until they move", () => {
  const quest = { id: "q1", links: [link("k1", "Monster", "m1"), link("k2", "CampaignNpc", "n1")] };

  assert.deepEqual(legacyEncounter(quest, references), {
    name: "Encounter",
    kind: "combat",
    links: [quest.links[0]],
    legacy: true,
  });
  assert.equal(legacyEncounter({ id: "q2", links: [link("k2", "CampaignNpc", "n1")] }, references), null);
});

test("reads one encounter's fields from the quest plan's form", () => {
  const values = {
    reward: "The temple's favour",
    coin_gp: "100",
    "enc.e1.name": "Ambush",
    "enc.e1.coin_gp": "30",
    "enc.e1.qty_k1": "4",
    "enc.e2.name": "Riddle",
  };

  assert.deepEqual(encounterValues(values, "e1"), { name: "Ambush", coin_gp: "30", qty_k1: "4" });
  assert.deepEqual(encounterValues(values, "e3"), {});
});

test("saves an encounter's card: name, type, words, reward, counts and NPCs", () => {
  const encounter = {
    id: "e1",
    questId: "q1",
    name: "Ambush",
    kind: "combat",
    notes: "Kept",
    links: [link("k1", "CampaignReference", "r1"), link("k2", "CampaignNpc", "n1")],
  };
  const npcs = [
    { id: "n1", name: "Kalvar", role: "bbeg" },
    { id: "n2", name: "Thorne", role: "ally" },
  ];
  const { record } = applyEncounter(
    encounter,
    { name: " Ambush at the bridge ", kind: "social", description: " Goblins ", coin_gp: "30", coin_sp: "", rewardXp: "200", qty_k1: "4" },
    { npcIds: ["n2"], npcs, id: ids() },
  );

  assert.deepEqual(
    [record.name, record.kind, record.description, record.notes, record.rewardCurrency, record.rewardXp],
    ["Ambush at the bridge", "social", "Goblins", "Kept", { gp: 30 }, 200],
  );
  assert.deepEqual(record.links.map((l) => [l.linkableType, l.linkableId, l.quantity]), [
    ["CampaignReference", "r1", 4],
    ["CampaignNpc", "n2", null],
  ]);
  assert.equal(encounter.name, "Ambush", "the encounter given is left as it was");
});

test("an encounter keeps its type and NPCs when the card doesn't say", () => {
  const encounter = { id: "e1", name: "Ambush", kind: "trap", links: [link("k2", "CampaignNpc", "n1")] };
  const { record } = applyEncounter(encounter, { name: "Ambush", kind: "dance", rewardXp: "" });

  assert.equal(record.kind, "trap");
  assert.equal(record.rewardXp, null);
  assert.deepEqual(record.links, encounter.links);
});

test("checks an encounter's name, coins, XP and counts, naming the encounter", () => {
  const encounter = { id: "e1", name: "Ambush", links: [link("k1", "CampaignReference", "r1")] };

  assert.deepEqual(applyEncounter(encounter, { name: " " }), { error: "Ambush: the name is required." });
  assert.match(applyEncounter(encounter, { name: "x".repeat(121) }).error, /at most 120 characters/);
  assert.match(applyEncounter(encounter, { name: "A", coin_gp: "-1" }).error, /^Ambush: Coins must be whole numbers/);
  assert.match(applyEncounter(encounter, { name: "A", rewardXp: "1.5" }).error, /^Ambush: XP must be a whole number/);
  assert.match(applyEncounter(encounter, { name: "A", qty_k1: "0" }).error, /^Ambush: Quantity must be/);
  assert.match(applyEncounter({ id: "e2", links: [] }, { name: "" }).error, /^An encounter: /);
});

test("moves an encounter up or down, numbering them in their new order", () => {
  const encounters = [
    { id: "e1", questId: "q1", position: 0 },
    { id: "e2", questId: "q1", position: 5 },
    { id: "e3", questId: "q1", position: 9 },
  ];

  assert.deepEqual(moveEncounter(encounters, "e3", -1).map((e) => [e.id, e.position]), [
    ["e1", 0],
    ["e3", 1],
    ["e2", 2],
  ]);
  assert.deepEqual(moveEncounter(encounters, "e1", 1).map((e) => e.id), ["e2", "e1", "e3"]);
  assert.deepEqual(moveEncounter(encounters, "e1", -1).map((e) => [e.id, e.position]), [
    ["e1", 0],
    ["e2", 1],
    ["e3", 2],
  ]);
  assert.deepEqual(moveEncounter([], "e1", 1), []);
});

test("adds and removes an encounter's links", () => {
  const encounter = { id: "e1", links: [link("k1", "Monster", "m1"), link("k2", "CampaignReference", "r1", { quantity: 3 })] };

  const added = withReference(encounter, "r2", references, ids());
  assert.deepEqual(added.links.map((l) => [l.linkableType, l.linkableId, l.quantity]), [
    ["Monster", "m1", null],
    ["CampaignReference", "r1", 3],
    ["CampaignReference", "r2", null],
  ]);
  assert.equal(withReference(added, "r1", references, ids()).links.length, 3, "a reference it links to stays once");
  assert.deepEqual(withoutLink(added, "k1").links.map((l) => [l.linkableId, l.position]), [
    ["r1", 0],
    ["r2", 1],
  ]);
});

test("sorts encounter pages by their quest, then in the quest's order", () => {
  const main = { kind: "main", act: 1, position: 0 };
  const side = { kind: "side", act: null, position: 2 };

  assert.equal(questSort(main), 1000);
  assert.equal(questSort(side), 100000 + 99000 + 2);
  assert.ok(encounterSort({ position: 3 }, main) < encounterSort({ position: 0 }, side));
  assert.ok(encounterSort({ position: 0 }, main) < encounterSort({ position: 1 }, main));
  assert.ok(encounterSort({ position: 0 }, side) < encounterSort({ position: 0 }, null), "one without a quest goes last");
});

test("a move that stopped partway finishes without a second encounter", () => {
  const monster = link("k2", "CampaignReference", "r1", { quantity: 4 });
  const quests = [{ id: "q1", links: [link("k1", "CampaignNpc", "n1"), monster] }];
  const encounters = [{ id: "e1", questId: "q1", name: "Encounter", position: 0, links: [{ ...monster, position: 0 }] }];
  const plan = planQuestEncounters({ quests, encounters, references }, { id: ids() });

  assert.deepEqual(plan.encounters, []);
  assert.deepEqual(plan.quests.map((q) => q.links.map((l) => l.id)), [["k1"]]);
});

test("a reference added to an encounter goes at the end, the others keeping their order", () => {
  const encounter = { links: [link("k1", "CampaignReference", "r1", { quantity: 4 }), link("k2", "Monster", "m1"), link("k3", "CampaignNpc", "n1")] };
  const added = withReference(encounter, "r2", references, ids());

  assert.deepEqual(added.links.map((l) => [l.linkableId, l.position]), [
    ["r1", 0],
    ["m1", 1],
    ["n1", 2],
    ["r2", 3],
  ]);
  assert.deepEqual([added.links[3].name, added.links[3].quantity], ["Bag of Holding", null]);
  assert.equal(withReference(encounter, "missing", references, ids()), encounter);
});

test("ticking the same NPCs leaves an encounter's links in their order", () => {
  const encounter = { id: "e1", name: "Talk", links: [link("k1", "CampaignNpc", "n1"), link("k2", "Monster", "m1", { position: 1 })] };
  const npcs = [{ id: "n1", name: "Kalvar" }, { id: "n2", name: "Thorne" }];

  assert.deepEqual(applyEncounter(encounter, { name: "Talk" }, { npcIds: ["n1"], npcs, id: ids() }).record.links, encounter.links);
  assert.deepEqual(
    applyEncounter(encounter, { name: "Talk" }, { npcIds: ["n1", "n2"], npcs, id: ids() }).record.links.map((l) => l.linkableId),
    ["m1", "n1", "n2"],
  );
});

test("finds a quest's encounters whether its id came as text or a number", () => {
  assert.deepEqual(encountersOf([{ id: "e1", questId: 12 }], "12").map((e) => e.id), ["e1"]);
});
