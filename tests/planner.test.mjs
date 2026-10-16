import { test } from "node:test";
import assert from "node:assert/strict";
import {
  EDIT_FORMS,
  actorChange,
  addSessionScene,
  coinsFrom,
  sceneChange,
  setLinkQuantity,
  applyBrief,
  applyEdit,
  applySessionPrep,
  formValues,
  gettingStarted,
  linkedIds,
  planDelete,
  referenceFromDocument,
  revelationGroups,
  setSessionLinks,
} from "../scripts/planner.mjs";

const ids = () => {
  let n = 0;
  return () => `new${(n += 1)}`;
};

const store = {
  npcs: [
    { id: "n1", name: "Kalvar", role: "bbeg", factionId: "f1" },
    { id: "n2", name: "Thorne", role: "ally", factionId: null },
  ],
  factions: [{ id: "f1", name: "The Cult" }],
  locations: [
    { id: "l1", name: "Hommlet", parentId: null },
    { id: "l2", name: "The Inn", parentId: "l1" },
  ],
  quests: [
    { id: "q1", name: "Act I", parentId: null, giverNpcId: "n2", locationId: "l2" },
    { id: "q2", name: "Find the crypt", parentId: "q1" },
  ],
  fronts: [
    {
      id: "t1",
      name: "Plague",
      npcId: "n1",
      factionId: "f1",
      clockSegments: 6,
      clockFilled: 2,
      portents: [{ text: "Graves open", triggered: true }],
    },
  ],
  secrets: [
    {
      id: "s1",
      text: "Black candles",
      revelation: "The cult",
      position: 0,
      revealed: true,
      revealedSessionId: "sess1",
    },
    { id: "s2", text: "Ink stains", revelation: "The cult", position: 1 },
    { id: "s3", text: "A forged letter", revelation: "Thorne lies", position: 2 },
    { id: "s4", text: "A stray clue", revelation: null, position: 3 },
    { id: "s5", text: "Third clue", revelation: "The cult", position: 4 },
  ],
  sessions: [
    {
      id: "sess1",
      number: 1,
      links: [
        { id: "k1", linkableType: "CampaignSecret", linkableId: "s2", name: "Ink stains" },
        { id: "k2", linkableType: "CampaignNpc", linkableId: "n1", name: "Kalvar" },
      ],
    },
  ],
};

test("has an edit form for each kind of record", () => {
  assert.deepEqual(Object.keys(EDIT_FORMS).sort(), ["factions", "fronts", "locations", "npcs", "quests", "secrets"]);
});

test("fills an edit form from a record", () => {
  const values = formValues(EDIT_FORMS.fronts.fields, { ...store.fronts[0], stakes: ["Who dies?"] });

  assert.equal(values.name, "Plague");
  assert.equal(values.portents, "Graves open");
  assert.equal(values.stakes, "Who dies?");
  assert.equal(values.clockFilled, "2");
  assert.equal(values.goal, "");
});

test("saves a threat, keeping a portent's tick while its words stay the same", () => {
  const { record } = applyEdit(
    "fronts",
    store.fronts[0],
    {
      name: "The Plague",
      portents: "Graves open\nBells toll",
      stakes: "",
      clockSegments: "8",
      clockFilled: "3",
      npcId: "n2",
      factionId: "nope",
    },
    store,
  );

  assert.deepEqual(record.portents, [
    { text: "Graves open", triggered: true },
    { text: "Bells toll", triggered: false },
  ]);
  assert.deepEqual(
    [record.name, record.clockSegments, record.clockFilled, record.npcId, record.factionId],
    ["The Plague", 8, 3, "n2", null],
  );
});

test("checks a threat's clock", () => {
  assert.deepEqual(applyEdit("fronts", store.fronts[0], { name: "x", clockSegments: "4", clockFilled: "5" }, store), {
    error: "The clock can't have more segments filled than it has.",
  });
  assert.deepEqual(applyEdit("fronts", store.fronts[0], { name: "x", clockSegments: "20" }, store), {
    error: "Clock segments must be a whole number from 2 to 12.",
  });
});

test("needs a name, and keeps choices to what's allowed", () => {
  assert.deepEqual(applyEdit("npcs", store.npcs[0], { name: " " }, store), { error: "Name is required." });
  // A role that isn't allowed keeps the NPC's current one
  const { record } = applyEdit("npcs", store.npcs[0], { name: "Kalvar", role: "dragon", factionId: "f1" }, store);
  assert.deepEqual([record.role, record.factionId], ["bbeg", "f1"]);
  assert.equal(applyEdit("npcs", { id: "x" }, { name: "New", role: "dragon" }, store).record.role, "bbeg");
  const quest = applyEdit(
    "quests",
    store.quests[1],
    { name: "Q", kind: "side", status: "active", act: "2" },
    store,
  ).record;
  assert.deepEqual([quest.kind, quest.status, quest.act], ["side", "active", 2]);
});

test("won't put a quest or place inside itself", () => {
  assert.match(applyEdit("quests", store.quests[0], { name: "Act I", parentId: "q2" }, store).error, /inside itself/);
  assert.match(
    applyEdit("locations", store.locations[0], { name: "Hommlet", parentId: "l1" }, store).error,
    /inside itself/,
  );
  assert.equal(
    applyEdit("locations", store.locations[1], { name: "The Inn", parentId: "l1" }, store).record.parentId,
    "l1",
  );
});

test("saves the campaign brief, with six truths at most", () => {
  const campaign = { name: "Old", truths: [] };

  assert.deepEqual(applyBrief(campaign, { name: "Zombie Siege", truths: "1\n2\n3\n4\n5\n6\n7" }), {
    error: "Keep it to 6 truths. You have 7.",
  });
  assert.deepEqual(applyBrief(campaign, { name: "Z", startLevel: "5", targetLevel: "3" }), {
    error: "The target level can't be lower than the starting level.",
  });
  const { record } = applyBrief(campaign, { name: " Zombie Siege ", partySize: "4", truths: "The dead walk" });
  assert.deepEqual(
    [record.name, record.partySize, record.truths, record.tone],
    ["Zombie Siege", 4, ["The dead walk"], null],
  );
});

test("saves a session's prep", () => {
  const session = { id: "sess1", number: 2, status: "planned", links: [] };
  const { record } = applySessionPrep(session, {
    title: "The Siege",
    level: "4",
    status: "prepped",
    scheduledOn: "2026-10-20",
    characterNotes: "Aria wants revenge",
    strongStart: "The bells toll",
    scenes: "Gate fight\n\nThe crypt",
    treasure: "",
  });

  assert.deepEqual(
    [record.displayTitle, record.level, record.status, record.scheduledOn, record.scenes, record.treasure],
    ["The Siege", 4, "prepped", "2026-10-20", ["Gate fight", "The crypt"], null],
  );
  assert.equal(applySessionPrep(session, { title: "" }).record.displayTitle, "Session 2");
  assert.deepEqual(applySessionPrep(session, { level: "25" }), {
    error: "Party level must be a whole number from 1 to 20.",
  });
  assert.deepEqual(applySessionPrep(session, { scheduledOn: "soon" }), { error: "Pick a date for the session." });
});

test("groups secrets by what they reveal, for the Three Clue Rule", () => {
  const { groups, loose } = revelationGroups(store.secrets);

  assert.deepEqual(
    groups.map((g) => [g.revelation, g.clues.length, g.revealed, g.short]),
    [
      ["The cult", 3, 1, false],
      ["Thorne lies", 1, 0, true],
    ],
  );
  assert.deepEqual(
    loose.map((s) => s.id),
    ["s4"],
  );
});

test("sets a session's links of one kind, keeping the others", () => {
  const session = setSessionLinks(store.sessions[0], "secrets", ["s3", "s2", "missing"], store.secrets, ids());

  assert.deepEqual(
    session.links.map((l) => [l.id, l.linkableType, l.linkableId, l.name, l.position]),
    [
      ["k2", "CampaignNpc", "n1", "Kalvar", 0],
      ["new1", "CampaignSecret", "s3", "A forged letter", 1],
      ["k1", "CampaignSecret", "s2", "Ink stains", 2],
    ],
  );
  assert.deepEqual(linkedIds(session, "secrets"), ["s3", "s2"]);
  assert.deepEqual(linkedIds(setSessionLinks(session, "secrets", [], store.secrets, ids()), "secrets"), []);
});

test("makes a book reference from a dragged compendium entry", () => {
  const zombie = referenceFromDocument(
    {
      uuid: "Compendium.dnd-monster-manual.actors.Actor.mmZombie00000000",
      name: "Zombie",
      documentName: "Actor",
      type: "npc",
      system: { details: { cr: 0.25 } },
      pack: "dnd-monster-manual.actors",
    },
    ids(),
  );
  assert.deepEqual(
    [zombie.name, zombie.book, zombie.category, zombie.challengeRating, zombie.citation, zombie.foundryUuid],
    ["Zombie", "mm", "monster", "1/4", "Monster Manual", "Compendium.dnd-monster-manual.actors.Actor.mmZombie00000000"],
  );

  const bag = referenceFromDocument(
    {
      uuid: "u",
      name: "Bag of Holding",
      documentName: "Item",
      type: "container",
      system: { rarity: "uncommon" },
      pack: "dnd5e.equipment24",
    },
    ids(),
  );
  assert.deepEqual([bag.category, bag.book, bag.citation], ["magic_item", "srd", "SRD 5.2"]);

  const table = referenceFromDocument(
    { uuid: "RollTable.x", name: "Loot", documentName: "RollTable", pack: null },
    ids(),
  );
  assert.deepEqual([table.category, table.book, table.citation], ["table", "other", "This world"]);
  assert.equal(
    referenceFromDocument({ uuid: "u", name: "Fireball", documentName: "Item", type: "spell" }, ids()).category,
    "spell",
  );
});

test("deleting an NPC clears who pointed at them, and session links", () => {
  const plan = planDelete(store, "npcs", "n1");

  assert.deepEqual(plan.remove, [{ collection: "npcs", id: "n1" }]);
  assert.deepEqual(
    plan.updates.map((u) => [u.collection, u.record.id]),
    [
      ["fronts", "t1"],
      ["sessions", "sess1"],
    ],
  );
  assert.equal(plan.updates[0].record.npcId, null);
  assert.deepEqual(
    plan.updates[1].record.links.map((l) => l.linkableId),
    ["s2"],
  );
});

test("deleting other records clears what pointed at them", () => {
  const field = (plan, collection, id, name) =>
    plan.updates.find((u) => u.collection === collection && u.record.id === id)?.record[name];

  const faction = planDelete(store, "factions", "f1");
  assert.equal(field(faction, "npcs", "n1", "factionId"), null);
  assert.equal(field(faction, "fronts", "t1", "factionId"), null);

  const place = planDelete(store, "locations", "l1");
  assert.equal(field(place, "locations", "l2", "parentId"), null);

  const quest = planDelete(store, "quests", "q1");
  assert.equal(field(quest, "quests", "q2", "parentId"), null);

  const session = planDelete(store, "sessions", "sess1");
  assert.equal(field(session, "secrets", "s1", "revealedSessionId"), null);
  assert.equal(planDelete(store, "secrets", "s9").updates.length, 0);
});

test("lists what to do next, as the website does", () => {
  const campaign = { partyActorUuids: [] };
  const steps = gettingStarted(campaign, { ...store, sessions: [{ id: "a", number: 1, strongStart: "Bells" }] });

  assert.deepEqual(
    steps.map((s) => [s.label, s.done]),
    [
      ["Choose the party", false],
      ["Give your villain a threat", true],
      ["Add the cast", false],
      ["Hide some secrets", false],
      ["Prep the first session", true],
    ],
  );
  assert.equal(steps[4].sessionId, "a");
});

test("sets a place's map from a scene in this world", () => {
  assert.deepEqual(sceneChange("Scene.QdI6Ix83ypmPq4lc", "Mountain Pass"), {
    foundrySceneUuid: "Scene.QdI6Ix83ypmPq4lc",
    foundrySceneName: "Mountain Pass",
  });
  assert.deepEqual(sceneChange(null), { foundrySceneUuid: null, foundrySceneName: null });
  assert.deepEqual(sceneChange("Compendium.x.y.Scene.QdI6Ix83ypmPq4lc"), {
    error: "That isn't a scene from this world.",
  });
});

test("sets an NPC's actor from the world or a compendium", () => {
  assert.equal(actorChange("Actor.akra000000000000", "Akra").foundryActorUuid, "Actor.akra000000000000");
  assert.equal(
    actorChange("Compendium.dnd-monster-manual.actors.Actor.mmCultFanatic000", "Cult Fanatic").foundryActorName,
    "Cult Fanatic",
  );
  assert.deepEqual(actorChange("Item.abc"), { error: "That isn't an actor." });
  assert.deepEqual(actorChange(""), { foundryActorUuid: null, foundryActorName: null });
});

test("adds a map to a session once", () => {
  const first = addSessionScene([], "Scene.QdI6Ix83ypmPq4lc", "Mountain Pass").scenes;
  assert.deepEqual(first, [{ uuid: "Scene.QdI6Ix83ypmPq4lc", name: "Mountain Pass" }]);
  assert.equal(addSessionScene(first, "Scene.QdI6Ix83ypmPq4lc", "Again").scenes.length, 1);
  assert.deepEqual(addSessionScene(first, "Actor.x"), { error: "That isn't a scene from this world." });
});

test("reads coins, leaving out the empty ones", () => {
  assert.deepEqual(coinsFrom({ coin_gp: "150", coin_sp: " 30 ", coin_cp: "0", coin_pp: "" }), {
    coins: { gp: 150, sp: 30 },
  });
  assert.deepEqual(coinsFrom({ coin_gp: "-5" }), { error: "Coins must be whole numbers from 0 to 1,000,000." });
  assert.deepEqual(coinsFrom({ coin_gp: "2.5" }), { error: "Coins must be whole numbers from 0 to 1,000,000." });
});

test("saves a session's coins with its prep", () => {
  const { record } = applySessionPrep({ id: "s", number: 1, status: "planned" }, { coin_gp: "100", coin_ep: "4" });
  assert.deepEqual(record.treasureCurrency, { gp: 100, ep: 4 });
});

test("sets how many of a treasure item there are", () => {
  const session = { links: [{ id: "k1", linkableType: "CampaignReference", linkableId: "r1", quantity: null }] };

  assert.equal(setLinkQuantity(session, "k1", "3").record.links[0].quantity, 3);
  assert.equal(setLinkQuantity(session, "k1", "1").record.links[0].quantity, null);
  assert.deepEqual(setLinkQuantity(session, "k1", "0"), { error: "Quantity must be a whole number from 1 to 9999." });
});

test("keeps an item's quantity when the session's links change", () => {
  const session = {
    links: [{ id: "k1", linkableType: "CampaignReference", linkableId: "r1", name: "Gem", quantity: 4 }],
  };
  const references = [
    { id: "r1", name: "Gem", citation: "SRD 5.2" },
    { id: "r2", name: "Rope", citation: "SRD 5.2" },
  ];
  const updated = setSessionLinks(session, "references", ["r1", "r2"], references, ids());

  assert.deepEqual(
    updated.links.map((l) => [l.linkableId, l.quantity]),
    [
      ["r1", 4],
      ["r2", null],
    ],
  );
});
