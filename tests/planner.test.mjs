import { test } from "node:test";
import assert from "node:assert/strict";
import {
  EDIT_FORMS,
  actorChange,
  addScene,
  coinsFrom,
  sceneChange,
  setLinkQuantity,
  applyBrief,
  applyEdit,
  applyQuestReward,
  applySessionPrep,
  formValues,
  gettingStarted,
  linkedIds,
  planDelete,
  referenceFromDocument,
  revelationGroups,
  setLinks,
  ROLE_LABELS,
  roleFromDisposition,
  briefFields,
  editForm,
  threatsIntro,
  addHandout,
  removeHandout,
  isHandoutUuid,
  MAX_HANDOUTS,
  addRollTable,
  removeRollTable,
  MAX_ROLL_TABLES,
} from "../src/planner.mjs";
import { EDITABLE, changedAttributes } from "../src/editing.mjs";
import { ALL_ON } from "../src/techniques.mjs";

const without = (...keys) => ({ ...ALL_ON, ...Object.fromEntries(keys.map((key) => [key, false])) });

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
    {
      id: "q2",
      name: "Find the crypt",
      parentId: "q1",
      links: [
        { id: "k3", linkableType: "CampaignNpc", linkableId: "n1", name: "Kalvar" },
        { id: "k4", linkableType: "CampaignReference", linkableId: "r1", name: "Ghoul" },
      ],
    },
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

test("saves the campaign brief, with its truths as names and descriptions", () => {
  const campaign = { name: "Old", truths: [] };
  const many = Array.from({ length: 21 }, (_, index) => ({ name: `Truth ${index + 1}`, description: "" }));

  assert.deepEqual(applyBrief(campaign, { name: "Zombie Siege", truths: many }), {
    error: "Keep it to 20 truths. You have 21.",
  });
  assert.deepEqual(applyBrief(campaign, { name: "Zombie Siege", truths: [{ name: "", description: "Who rules?" }] }), {
    error: "Each truth needs a name. Truth 1 has only a description.",
  });
  assert.deepEqual(applyBrief(campaign, { name: "Z", startLevel: "5", targetLevel: "3" }), {
    error: "The target level can't be lower than the starting level.",
  });
  // More than six is fine
  assert.equal(applyBrief(campaign, { name: "Zombie Siege", truths: many.slice(0, 7) }).record.truths.length, 7);
  const { record } = applyBrief(campaign, {
    name: " Zombie Siege ",
    partySize: "4",
    truths: [
      { name: " Greyhawk runs on gold. ", description: "Nearly anything can be bought. " },
      { name: "", description: "" },
      { name: "The dead walk", description: "" },
    ],
  });
  assert.deepEqual(
    [record.name, record.partySize, record.truths, record.tone],
    [
      "Zombie Siege",
      4,
      [
        { name: "Greyhawk runs on gold.", description: "Nearly anything can be bought." },
        { name: "The dead walk", description: "" },
      ],
      null,
    ],
  );
});

test("the brief's truths start as the editor's rows, even ones an older version kept as text", () => {
  const field = briefFields().find((f) => f.name === "truths");
  assert.equal(field.type, "truths");
  assert.equal(field.hint, "About six is plenty: short facts everyone at the table knows.");

  assert.deepEqual(formValues([field], { truths: ["The dead walk. Even here.", { name: "Gold rules", description: "" }] }).truths, [
    { name: "The dead walk.", description: "Even here." },
    { name: "Gold rules", description: "" },
  ]);
  assert.deepEqual(formValues([field], {}).truths, []);
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
  const session = setLinks(store.sessions[0], "secrets", ["s3", "s2", "missing"], store.secrets, ids());

  assert.deepEqual(
    session.links.map((l) => [l.id, l.linkableType, l.linkableId, l.name, l.position]),
    [
      ["k2", "CampaignNpc", "n1", "Kalvar", 0],
      ["new1", "CampaignSecret", "s3", "A forged letter", 1],
      ["k1", "CampaignSecret", "s2", "Ink stains", 2],
    ],
  );
  assert.deepEqual(linkedIds(session, "secrets"), ["s3", "s2"]);
  assert.deepEqual(linkedIds(setLinks(session, "secrets", [], store.secrets, ids()), "secrets"), []);
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

test("deleting an NPC clears who pointed at them, and session and quest links", () => {
  const plan = planDelete(store, "npcs", "n1");

  assert.deepEqual(plan.remove, [{ collection: "npcs", id: "n1" }]);
  assert.deepEqual(
    plan.updates.map((u) => [u.collection, u.record.id]),
    [
      ["fronts", "t1"],
      ["sessions", "sess1"],
      ["quests", "q2"],
    ],
  );
  assert.equal(plan.updates[0].record.npcId, null);
  assert.deepEqual(
    plan.updates[1].record.links.map((l) => l.linkableId),
    ["s2"],
  );
  assert.deepEqual(
    plan.updates[2].record.links.map((l) => l.linkableId),
    ["r1"],
  );
});

test("deleting a book reference drops it from quests", () => {
  const plan = planDelete(store, "references", "r1");
  const quest = plan.updates.find((u) => u.collection === "quests");

  assert.deepEqual(
    quest.record.links.map((l) => l.linkableId),
    ["n1"],
  );
});

test("deleting a quest clears its sub-quests without touching its own links", () => {
  const plan = planDelete(store, "quests", "q2");

  assert.deepEqual(plan.updates, []);
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

test("adds a map to a session or quest once", () => {
  const first = addScene([], "Scene.QdI6Ix83ypmPq4lc", "Mountain Pass").scenes;
  assert.deepEqual(first, [{ uuid: "Scene.QdI6Ix83ypmPq4lc", name: "Mountain Pass" }]);
  assert.equal(addScene(first, "Scene.QdI6Ix83ypmPq4lc", "Again").scenes.length, 1);
  assert.deepEqual(addScene(first, "Actor.x"), { error: "That isn't a scene from this world." });

  const full = Array.from({ length: 20 }, (_, i) => ({ uuid: `Scene.${String(i).padStart(16, "a")}`, name: "Map" }));
  assert.deepEqual(addScene(full, "Scene.QdI6Ix83ypmPq4lc", "One more", "quest"), { error: "Up to 20 maps a quest." });
});

test("saves a quest's reward: notes, coins, XP and milestone", () => {
  const quest = { id: "q", name: "Find the crypt", reward: null, rewardCurrency: {}, rewardXp: null, milestone: false };
  const { record } = applyQuestReward(quest, {
    reward: " The mayor's thanks ",
    coin_gp: "250",
    coin_sp: "",
    rewardXp: "900",
    milestone: "on",
  });

  assert.deepEqual(
    [record.reward, record.rewardCurrency, record.rewardXp, record.milestone],
    ["The mayor's thanks", { gp: 250 }, 900, true],
  );
  assert.equal(record.name, "Find the crypt");

  const cleared = applyQuestReward(record, {}).record;
  assert.deepEqual(
    [cleared.reward, cleared.rewardCurrency, cleared.rewardXp, cleared.milestone],
    [null, {}, null, false],
  );
});

test("checks a quest's XP and coins", () => {
  assert.deepEqual(applyQuestReward({}, { rewardXp: "-1" }), { error: "XP must be a whole number from 0 to 1,000,000." });
  assert.deepEqual(applyQuestReward({}, { rewardXp: "lots" }), {
    error: "XP must be a whole number from 0 to 1,000,000.",
  });
  assert.deepEqual(applyQuestReward({}, { coin_gp: "1.5" }), {
    error: "Coins must be whole numbers from 0 to 1,000,000.",
  });
});

test("links a quest's NPCs, keeping its monsters and items", () => {
  const quest = {
    links: [{ id: "k1", linkableType: "CampaignReference", linkableId: "r1", name: "Gem", quantity: 2 }],
  };
  const updated = setLinks(quest, "npcs", ["n2", "missing"], store.npcs, ids());

  assert.deepEqual(
    updated.links.map((l) => [l.linkableType, l.linkableId, l.name, l.detail, l.quantity]),
    [
      ["CampaignReference", "r1", "Gem", undefined, 2],
      ["CampaignNpc", "n2", "Thorne", "Ally", null],
    ],
  );
  assert.deepEqual(linkedIds(updated, "npcs"), ["n2"]);
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
  const updated = setLinks(session, "references", ["r1", "r2"], references, ids());

  assert.deepEqual(
    updated.links.map((l) => [l.linkableId, l.quantity]),
    [
      ["r1", 4],
      ["r2", null],
    ],
  );
});

test("an actor dropped on the cast starts as an enemy, an ally or neutral, from its token", () => {
  assert.equal(roleFromDisposition(-1), "villain");
  assert.equal(roleFromDisposition(1), "ally");
  assert.equal(roleFromDisposition(0), "neutral");
  assert.equal(roleFromDisposition(-2), "neutral");
  assert.equal(roleFromDisposition(undefined), "neutral");
});

test("the villain role is called Enemy", () => {
  assert.equal(ROLE_LABELS.villain, "Enemy");
  assert.deepEqual(
    EDIT_FORMS.npcs.fields.find((f) => f.name === "role").options.find(([value]) => value === "villain"),
    ["villain", "Enemy"],
  );
});

test("a new NPC's form starts as Neutral, and an existing one keeps its role", () => {
  assert.equal(formValues(EDIT_FORMS.npcs.fields, {}).role, "neutral");
  assert.equal(formValues(EDIT_FORMS.npcs.fields, { name: "Kalvar", role: "bbeg" }).role, "bbeg");
  assert.equal(formValues(EDIT_FORMS.npcs.fields, {}).name, "");
});

test("a threat's form leaves out its clock or portents when they're switched off", () => {
  const names = (techniques) => editForm("fronts", techniques).fields.map((f) => f.name);

  assert.deepEqual(names(ALL_ON), EDIT_FORMS.fronts.fields.map((f) => f.name));
  assert.ok(!names(without("clocks")).some((name) => name.startsWith("clock")));
  assert.ok(names(without("clocks")).includes("portents"));
  assert.ok(!names(without("portents")).includes("portents"));
  assert.ok(names(without("portents")).includes("clockSegments"));
  assert.equal(editForm("nothing"), undefined);
});

test("saving a threat keeps its hidden clock and portents", () => {
  const front = store.fronts[0];
  const { record } = applyEdit(
    "fronts",
    front,
    { name: "The Plague", goal: "Spread", stakes: "" },
    store,
    without("clocks", "portents"),
  );

  assert.equal(record.name, "The Plague");
  assert.deepEqual(
    [record.clockSegments, record.clockFilled, record.portents],
    [6, 2, [{ text: "Graves open", triggered: true }]],
  );
  // Only the clock hidden: the portents are saved from the form
  const portents = applyEdit("fronts", front, { name: "P", portents: "Bells toll", stakes: "" }, store, without("clocks"));
  assert.deepEqual(portents.record.portents, [{ text: "Bells toll", triggered: false }]);
  assert.deepEqual([portents.record.clockSegments, portents.record.clockFilled], [6, 2]);
  // With everything on, an empty filled count still means none filled
  assert.equal(applyEdit("fronts", front, { name: "P", clockSegments: "6", stakes: "" }, store).record.clockFilled, 0);
});

test("the brief leaves out the truths when they're switched off, and keeps them", () => {
  assert.ok(briefFields().some((f) => f.name === "truths"));
  assert.ok(!briefFields(without("truths")).some((f) => f.name === "truths"));

  const campaign = { name: "Old", truths: [{ name: "The dead walk", description: "" }] };
  const { record } = applyBrief(campaign, { name: "Zombie Siege" }, without("truths"));
  assert.deepEqual([record.name, record.truths], ["Zombie Siege", [{ name: "The dead walk", description: "" }]]);
  assert.deepEqual(applyBrief(campaign, { name: "Zombie Siege" }).record.truths, []);
});

test("Getting started is empty when the checklist is switched off", () => {
  assert.deepEqual(gettingStarted({ partyActorUuids: [] }, store, without("checklist")), []);
});

test("Getting started leaves out secrets, or the Three Clue Rule, when they're switched off", () => {
  const labels = (techniques) => gettingStarted({ partyActorUuids: [] }, store, techniques).map((s) => s.label);
  assert.deepEqual(labels(without("secrets", "threeClues")), [
    "Choose the party",
    "Give your villain a threat",
    "Add the cast",
    "Prep the first session",
  ]);

  // Without the check, any secret will do
  const secrets = gettingStarted({}, store, without("threeClues")).find((s) => s.tab === "secrets");
  assert.equal(secrets.done, true);
  assert.doesNotMatch(secrets.detail, /three/);
  assert.equal(gettingStarted({}, store).find((s) => s.tab === "secrets").done, false);
  assert.equal(gettingStarted({}, { secrets: [] }, without("threeClues")).find((s) => s.tab === "secrets").done, false);
});

test("describes threats with the techniques that are on", () => {
  const threat = (techniques) => gettingStarted({}, {}, techniques).find((s) => s.tab === "story").detail;

  assert.equal(threat(ALL_ON), "A threat with grim portents, and a clock that fills if the heroes do nothing.");
  assert.equal(threat(without("clocks")), "A threat with grim portents that show it getting closer.");
  assert.equal(threat(without("portents")), "A threat with a clock that fills if the heroes do nothing.");
  assert.doesNotMatch(threat(without("clocks", "portents")), /portents|clock/);

  assert.equal(
    threatsIntro(),
    "Each threat has a goal, grim portents that show it getting closer, and a clock that fills if no one stops it.",
  );
  assert.equal(threatsIntro(without("clocks")), "Each threat has a goal, and grim portents that show it getting closer.");
  assert.equal(threatsIntro(without("portents")), "Each threat has a goal, and a clock that fills if no one stops it.");
  assert.doesNotMatch(threatsIntro(without("clocks", "portents")), /portents|clock/);
});

const withEncounters = {
  ...store,
  references: [{ id: "r1", name: "Ghoul", category: "monster" }],
  encounters: [
    {
      id: "e1",
      questId: "q2",
      name: "Ambush",
      links: [
        { id: "k5", linkableType: "CampaignNpc", linkableId: "n1", name: "Kalvar", position: 0 },
        { id: "k6", linkableType: "CampaignReference", linkableId: "r1", name: "Ghoul", position: 1, quantity: 4 },
      ],
    },
    { id: "e2", questId: "q2", name: "Riddle", links: [] },
    { id: "e3", questId: "q1", name: "Elsewhere", links: [{ id: "k7", linkableType: "CampaignNpc", linkableId: "n1", name: "Kalvar" }] },
  ],
};

test("deleting a quest deletes its encounters too", () => {
  const plan = planDelete(withEncounters, "quests", "q2");

  assert.deepEqual(plan.remove, [
    { collection: "quests", id: "q2" },
    { collection: "encounters", id: "e1" },
    { collection: "encounters", id: "e2" },
  ]);
  assert.deepEqual(plan.updates, []);
  assert.deepEqual(planDelete(withEncounters, "encounters", "e2"), { remove: [{ collection: "encounters", id: "e2" }], updates: [] });
});

test("deleting an NPC or a book reference drops it from encounters", () => {
  const npc = planDelete(withEncounters, "npcs", "n1");
  const encounters = npc.updates.filter((u) => u.collection === "encounters");

  assert.deepEqual(encounters.map((u) => [u.record.id, u.record.links.map((l) => l.linkableId)]), [
    ["e1", ["r1"]],
    ["e3", []],
  ]);
  const reference = planDelete(withEncounters, "references", "r1");
  assert.deepEqual(
    reference.updates.find((u) => u.collection === "encounters").record.links.map((l) => l.id),
    ["k5"],
  );
});

test("deleting a quest doesn't also update the encounters it deletes", () => {
  const quests = { ...withEncounters, quests: [...withEncounters.quests, { id: "q3", links: [] }] };
  const plan = planDelete(quests, "npcs", "n1");

  assert.ok(plan.updates.some((u) => u.collection === "encounters" && u.record.id === "e1"));
  assert.ok(!planDelete(withEncounters, "quests", "q2").updates.some((u) => u.collection === "encounters"));
});

const ENTRY = "JournalEntry.QdI6Ix83ypmPq4lc";
const PAGE = "JournalEntry.QdI6Ix83ypmPq4lc.JournalEntryPage.WVPcqI82sGV2YrXq";
const PACK_ENTRY = "Compendium.world.lore.JournalEntry.WVPcqI82sGV2YrXq";
const PACK_PAGE = "Compendium.my-module.lore.JournalEntry.WVPcqI82sGV2YrXq.JournalEntryPage.QdI6Ix83ypmPq4lc";

test("adds journal entries and pages, from the world or a compendium, as a quest's handouts", () => {
  let handouts = [];
  for (const [uuid, name] of [
    [ENTRY, "The map"],
    [PAGE, " A letter "],
    [PACK_ENTRY, "Lore"],
    [PACK_PAGE, ""],
  ]) {
    const result = addHandout(handouts, uuid, name);
    assert.ok(!result.error, uuid);
    handouts = result.handouts;
  }

  assert.deepEqual(handouts, [
    { uuid: ENTRY, name: "The map" },
    { uuid: PAGE, name: "A letter" },
    { uuid: PACK_ENTRY, name: "Lore" },
    { uuid: PACK_PAGE, name: "Handout" },
  ]);
  assert.deepEqual(addHandout(handouts, ENTRY, "Again").handouts, handouts, "once each");
  assert.equal(addHandout([], ENTRY, "x".repeat(200)).handouts[0].name.length, 120);
  assert.deepEqual(removeHandout(handouts, PAGE).map((h) => h.uuid), [ENTRY, PACK_ENTRY, PACK_PAGE]);
  assert.ok(isHandoutUuid(PAGE));
});

test("a quest's handouts are journal entries or pages, up to 20", () => {
  for (const uuid of ["Scene.QdI6Ix83ypmPq4lc", "Actor.QdI6Ix83ypmPq4lc", "JournalEntry.short", `${ENTRY}.JournalEntryPage.bad`, "", null]) {
    assert.match(addHandout([], uuid, "x").error, /journal entry or page/, String(uuid));
  }
  const full = Array.from({ length: MAX_HANDOUTS }, (_, i) => ({ uuid: `JournalEntry.${String(i).padStart(16, "a")}`, name: "H" }));
  assert.equal(MAX_HANDOUTS, 20);
  assert.equal(addHandout(full, ENTRY, "One more").error, "Up to 20 handouts a quest.");
});

test("handouts are sent with a quest", () => {
  assert.ok(EDITABLE.quests.includes("handouts"));
  const quest = { id: "q1", name: "Q", handouts: [] };
  assert.deepEqual(changedAttributes("quests", quest, { ...quest, handouts: [{ uuid: ENTRY, name: "The map" }] }), {
    handouts: [{ uuid: ENTRY, name: "The map" }],
  });
});

const TABLE = "RollTable.QdI6Ix83ypmPq4lc";
const PACK_TABLE = "Compendium.dnd5e.tables24.RollTable.WVPcqI82sGV2YrXq";

test("adds roll tables to a place, from the world or a compendium, once each and up to 10", () => {
  const first = addRollTable([], TABLE, "Marsh encounters");
  const second = addRollTable(first.rollTables, PACK_TABLE, "");

  assert.deepEqual(second.rollTables, [
    { uuid: TABLE, name: "Marsh encounters" },
    { uuid: PACK_TABLE, name: "Roll table" },
  ]);
  assert.deepEqual(addRollTable(second.rollTables, TABLE, "Again").rollTables, second.rollTables);
  assert.equal(addRollTable([], TABLE, "y".repeat(130)).rollTables[0].name.length, 120);
  assert.deepEqual(removeRollTable(second.rollTables, TABLE), [{ uuid: PACK_TABLE, name: "Roll table" }]);
  for (const uuid of ["Item.QdI6Ix83ypmPq4lc", "RollTable.nope", `${TABLE}.TableResult.QdI6Ix83ypmPq4lc`, undefined]) {
    assert.match(addRollTable([], uuid, "x").error, /Drop a roll table/, String(uuid));
  }
  const full = Array.from({ length: MAX_ROLL_TABLES }, (_, i) => ({ uuid: `RollTable.${String(i).padStart(16, "b")}`, name: "T" }));
  assert.equal(addRollTable(full, TABLE, "One more").error, "Up to 10 roll tables a place.");
  assert.ok(EDITABLE.locations.includes("rollTables"));
});

test("names an encounter's maps limit", () => {
  const full = Array.from({ length: 20 }, (_, i) => ({ uuid: `Scene.${String(i).padStart(16, "c")}`, name: "M" }));

  assert.equal(addScene(full, "Scene.QdI6Ix83ypmPq4lc", "One more", "encounter").error, "Up to 20 maps an encounter.");
  assert.equal(addScene(full, "Scene.QdI6Ix83ypmPq4lc", "One more", "quest").error, "Up to 20 maps a quest.");
});

test("linking the same records again leaves the links as they were, so nothing is sent", () => {
  const quest = {
    id: "q9",
    links: [
      { id: "k1", linkableType: "CampaignNpc", linkableId: "n2", name: "Thorne", position: 0 },
      { id: "k2", linkableType: "CampaignReference", linkableId: "r1", name: "Ghoul", position: 1 },
      { id: "k3", linkableType: "CampaignNpc", linkableId: "n1", name: "Kalvar", position: 2 },
    ],
  };

  assert.equal(setLinks(quest, "npcs", ["n1", "n2"], store.npcs, ids()), quest);
  assert.deepEqual(changedAttributes("quests", quest, setLinks(quest, "npcs", ["n1", "n2"], store.npcs, ids())), {});
  assert.deepEqual(setLinks(quest, "npcs", ["n1"], store.npcs, ids()).links.map((l) => l.linkableId), ["r1", "n1"]);
});

test("a quest's levels are dropdowns of 1 to 20, with Any for none", () => {
  const levels = EDIT_FORMS.quests.fields.filter((f) => f.type === "level");

  assert.deepEqual(
    levels.map((f) => [f.name, f.min, f.max, f.blank]),
    [
      ["levelMin", 1, 20, "Any"],
      ["levelMax", 1, 20, "Any"],
    ],
  );
  assert.ok(levels.every((f) => EDITABLE.quests.includes(f.name)));
});

test("saves a quest's levels, lowest first", () => {
  const quest = store.quests[0];

  const { record } = applyEdit("quests", quest, { name: "Act I", levelMin: "3", levelMax: "5" }, store);
  assert.deepEqual([record.levelMin, record.levelMax], [3, 5]);
  assert.deepEqual(applyEdit("quests", quest, { name: "Act I", levelMin: "", levelMax: "" }, store).record.levelMin, null);
  assert.deepEqual(applyEdit("quests", quest, { name: "Act I", levelMin: "6", levelMax: "4" }, store), {
    error: "The highest level can't be lower than the lowest.",
  });
  assert.deepEqual(applyEdit("quests", quest, { name: "Act I", levelMin: "21" }, store), {
    error: "Lowest level must be a whole number from 1 to 20.",
  });
});

test("the brief's levels are dropdowns, and it has the campaign's status and type", () => {
  const fields = Object.fromEntries(briefFields().map((f) => [f.name, f]));

  assert.deepEqual([fields.startLevel.type, fields.targetLevel.type], ["level", "level"]);
  assert.deepEqual(
    fields.status.options.map(([value]) => value),
    ["planning", "active", "completed", "archived"],
  );
  assert.deepEqual(
    fields.mode.options.map(([value]) => value),
    ["arc", "sandbox", "oneshot"],
  );
  assert.ok(["status", "mode", "startLevel", "targetLevel"].every((name) => EDITABLE.campaign.includes(name)));
});

test("saves the brief's status and type, keeping the ones it has for a choice that isn't allowed", () => {
  const campaign = { name: "Zombie Siege", status: "active", mode: "sandbox", truths: [] };

  const { record } = applyBrief(campaign, { name: "Zombie Siege", status: "completed", mode: "oneshot" });
  assert.deepEqual([record.status, record.mode], ["completed", "oneshot"]);
  const kept = applyBrief(campaign, { name: "Zombie Siege", status: "lost", mode: "" }).record;
  assert.deepEqual([kept.status, kept.mode], ["active", "sandbox"]);
});

test("an NPC's stat block is picked from the campaign's monster references", () => {
  const field = EDIT_FORMS.npcs.fields.find((f) => f.name === "statBlockReferenceId");

  assert.deepEqual([field.type, field.collection, field.blank], ["records", "references", "None"]);
  assert.equal(field.only({ category: "monster" }), true);
  assert.equal(field.only({ category: "magic_item" }), false);
});

test("a pulled NPC's form shows the stat block it has", () => {
  const npc = { id: "n1", name: "Kalvar", statBlockReference: { id: "r1", name: "Ghoul", citation: "SRD 5.2" } };

  assert.equal(formValues(EDIT_FORMS.npcs.fields, npc).statBlockReferenceId, "r1");
  assert.equal(formValues(EDIT_FORMS.npcs.fields, { id: "n2", name: "Thorne" }).statBlockReferenceId, "");
});

test("saving an NPC's stat block keeps what its page shows in step, and sends only the id", () => {
  const references = [{ id: "r1", name: "Ghoul", category: "monster", citation: "SRD 5.2", foundryUuid: null }];
  const npc = { id: "n1", name: "Kalvar", role: "bbeg", statBlockReference: null };

  const { record } = applyEdit("npcs", npc, { name: "Kalvar", role: "bbeg", statBlockReferenceId: "r1" }, { references });
  assert.equal(record.statBlockReferenceId, "r1");
  assert.deepEqual(record.statBlockReference, { id: "r1", name: "Ghoul", citation: "SRD 5.2", foundryUuid: null });
  assert.deepEqual(changedAttributes("npcs", npc, record), { statBlockReferenceId: "r1" });

  const cleared = applyEdit("npcs", record, { name: "Kalvar", role: "bbeg", statBlockReferenceId: "" }, { references }).record;
  assert.deepEqual([cleared.statBlockReferenceId, cleared.statBlockReference], [null, null]);
  // A stat block that isn't in the campaign isn't kept
  const unknown = applyEdit("npcs", npc, { name: "Kalvar", role: "bbeg", statBlockReferenceId: "r9" }, { references }).record;
  assert.equal(unknown.statBlockReferenceId, null);
});

test("deleting a book reference clears the NPCs it's the stat block of, pulled ones too", () => {
  const npcs = [
    { id: "n1", name: "Kalvar", statBlockReferenceId: "r1", statBlockReference: { id: "r1", name: "Ghoul" } },
    { id: "n2", name: "Thorne", statBlockReference: { id: "r1", name: "Ghoul" } },
    { id: "n3", name: "Elmo", statBlockReference: { id: "r2", name: "Bandit" } },
  ];

  const plan = planDelete({ npcs, references: [{ id: "r1" }, { id: "r2" }] }, "references", "r1");
  const cleared = plan.updates.filter((u) => u.collection === "npcs").map((u) => u.record);
  assert.deepEqual(
    cleared.map((npc) => [npc.id, npc.statBlockReferenceId, npc.statBlockReference]),
    [
      ["n1", null, null],
      ["n2", null, null],
    ],
  );
});
