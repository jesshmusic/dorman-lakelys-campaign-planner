import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ACTS,
  ADD_FORMS,
  FIVE_ROOMS,
  PORTENTS,
  addForm,
  applyLocalChange,
  buildLocalCampaign,
  levelFor,
  newRecord,
} from "../src/local.mjs";
import { defaultDraft } from "../src/setup.mjs";
import { ALL_ON } from "../src/techniques.mjs";

// Predictable ids: id1, id2, ...
const ids = () => {
  let n = 0;
  return () => `id${(n += 1)}`;
};

const draft = (template, values = {}, extra = {}) => ({
  ...defaultDraft(),
  template,
  values: { ...defaultDraft().values, name: "Zombie Siege", ...values },
  ...extra,
});

test("spreads levels evenly, as Dungeon Master Guru does", () => {
  assert.deepEqual(
    [0, 1, 2, 3, 4, 5].map((i) => levelFor(i, 6, 5, 8)),
    [5, 6, 6, 7, 7, 8],
  );
  assert.equal(levelFor(0, 1, 3, 8), 3);
  assert.equal(levelFor(2, 6, null, 8), null);
  assert.equal(levelFor(3, 6, 4, null), 4);
});

test("makes the campaign from the guide's answers", () => {
  const { campaign } = buildLocalCampaign(
    draft(
      "sandbox",
      {
        tone: " grim ",
        truths: [{ name: "The dead walk ", description: "" }, { name: "", description: "" }, { name: "The temple is corrupt", description: " Its priests feed the dead. " }],
        start_level: "3",
        target_level: "",
      },
      { excludedPacks: ["dnd5e.actors24"], party: ["Actor.akra"] },
    ),
    { id: ids() },
  );

  assert.deepEqual(campaign, {
    id: "id1",
    uuid: "id1",
    syncVersion: 0,
    local: true,
    name: "Zombie Siege",
    premise: null,
    pitch: null,
    settingName: null,
    settingNotes: null,
    truths: [
      { name: "The dead walk", description: "" },
      { name: "The temple is corrupt", description: "Its priests feed the dead." },
    ],
    mode: "sandbox",
    template: "sandbox",
    status: "planning",
    plannedSessions: null,
    cadence: null,
    partySize: 4,
    startLevel: 3,
    targetLevel: null,
    tone: "grim",
    edition: "2024",
    excludedCompendiumPacks: ["dnd5e.actors24"],
    partyActorUuids: ["Actor.akra"],
  });
});

test("makes the campaign from a draft an older version saved, with its truths as text", () => {
  const { campaign } = buildLocalCampaign(draft("blank", { truths: "The dead walk. Even here.\n\nThe temple is corrupt" }), {
    id: ids(),
  });

  assert.deepEqual(campaign.truths, [
    { name: "The dead walk.", description: "Even here." },
    { name: "The temple is corrupt", description: "" },
  ]);
  assert.deepEqual(buildLocalCampaign(draft("blank"), { id: ids() }).campaign.truths, []);
});

test("builds a story arc's sessions, acts and main threat", () => {
  const { records } = buildLocalCampaign(
    draft("three_act", { start_level: "5", target_level: "8", planned_sessions: "6" }),
    { id: ids() },
  );

  assert.deepEqual(
    records.sessions.map((s) => [s.number, s.level, s.displayTitle, s.status]),
    [
      [1, 5, "Session 1", "planned"],
      [2, 6, "Session 2", "planned"],
      [3, 6, "Session 3", "planned"],
      [4, 7, "Session 4", "planned"],
      [5, 7, "Session 5", "planned"],
      [6, 8, "Session 6", "planned"],
    ],
  );
  assert.deepEqual(
    records.quests.map((q) => [q.name, q.kind, q.act, q.status]),
    ACTS.map((name, i) => [name, "main", i + 1, "available"]),
  );
  assert.equal(records.fronts.length, 1);
  assert.deepEqual(
    { name: records.fronts[0].name, segments: records.fronts[0].clockSegments, filled: records.fronts[0].clockFilled },
    { name: "Main threat", segments: 6, filled: 0 },
  );
  assert.deepEqual(
    records.fronts[0].portents,
    PORTENTS.map((text) => ({ text, triggered: false })),
  );
});

test("gives a story arc six sessions by default, and a clock of 4 to 12 segments", () => {
  assert.equal(buildLocalCampaign(draft("three_act"), { id: ids() }).records.sessions.length, 6);
  const short = buildLocalCampaign(draft("three_act", { planned_sessions: "2" }), { id: ids() }).records;
  assert.equal(short.fronts[0].clockSegments, 4);
  const long = buildLocalCampaign(draft("three_act", { planned_sessions: "20" }), { id: ids() }).records;
  assert.equal(long.fronts[0].clockSegments, 12);
});

test("builds a sandbox, a one-shot and a blank campaign", () => {
  const sandbox = buildLocalCampaign(draft("sandbox", { start_level: "2" }), { id: ids() }).records;
  assert.deepEqual(
    [sandbox.fronts[0].name, sandbox.quests[0].name, sandbox.sessions[0].level],
    ["Main villain", "Main questline", 2],
  );

  const oneShot = buildLocalCampaign(draft("five_room"), { id: ids() });
  assert.equal(oneShot.campaign.mode, "oneshot");
  assert.deepEqual(oneShot.records.sessions[0].scenes, FIVE_ROOMS);
  assert.equal(oneShot.records.quests[0].name, "The adventure");

  const blank = buildLocalCampaign(draft("blank"), { id: ids() }).records;
  assert.deepEqual(blank, { sessions: [], fronts: [], quests: [] });
});

test("gives each record a unique id that is also its uuid", () => {
  const { campaign, records } = buildLocalCampaign(draft("three_act"), { id: ids() });
  const all = [campaign, ...Object.values(records).flat()];

  assert.equal(new Set(all.map((r) => r.id)).size, all.length);
  assert.ok(all.every((r) => r.id === r.uuid && r.syncVersion === 0));
});

test("has an Add form for each kind of record", () => {
  assert.deepEqual(Object.keys(ADD_FORMS).sort(), [
    "encounters",
    "factions",
    "fronts",
    "locations",
    "npcs",
    "quests",
    "secrets",
    "sessions",
  ]);
  for (const form of Object.values(ADD_FORMS)) assert.ok(form.title && form.fields.length);
});

test("adds records from the forms", () => {
  const id = ids();
  assert.deepEqual(
    (({ text, revelation, revealed, position }) => ({ text, revelation, revealed, position }))(
      newRecord("secrets", { text: " Black candles ", revelation: "The cult" }, { id, existing: [{}, {}] }),
    ),
    { text: "Black candles", revelation: "The cult", revealed: false, position: 2 },
  );

  const threat = newRecord(
    "fronts",
    { name: "The cult", goal: "Raise the dead", portents: "Graves open\nBells toll", clockSegments: "20" },
    { id },
  );
  assert.equal(threat.clockSegments, 12);
  assert.deepEqual(threat.portents, [
    { text: "Graves open", triggered: false },
    { text: "Bells toll", triggered: false },
  ]);

  assert.equal(newRecord("quests", { name: "Find the crypt", kind: "nonsense" }, { id }).kind, "side");
  const quest = newRecord("quests", { name: "Find the crypt" }, { id });
  assert.deepEqual(
    [quest.foundryScenes, quest.links, quest.rewardCurrency, quest.rewardXp, quest.milestone, quest.handouts],
    [[], [], {}, null, false, []],
  );
  assert.equal(newRecord("npcs", { name: "Kalvar", role: "bbeg" }, { id }).role, "bbeg");
  assert.equal(newRecord("npcs", { name: "Kalvar", role: "dragon" }, { id }).role, "neutral");
  assert.deepEqual(newRecord("locations", { name: "Crypt", features: "Cold\nDark" }, { id }).features, [
    "Cold",
    "Dark",
  ]);
  assert.equal(newRecord("factions", { name: "The Watch" }, { id }).name, "The Watch");
});

test("adds an encounter to a quest, after its other encounters", () => {
  const existing = [
    { id: "e1", questId: "q1", position: 0 },
    { id: "e2", questId: "q1", position: 3 },
    { id: "e3", questId: "q2", position: 7 },
  ];
  const encounter = newRecord(
    "encounters",
    { questId: "q1", name: " Ambush at the bridge ", kind: "trap", description: "Goblins in the reeds" },
    { id: ids(), existing },
  );

  assert.deepEqual(
    (({ questId, name, kind, description, notes, position, foundryScenes, links, rewardCurrency, rewardXp, syncVersion }) => ({
      questId,
      name,
      kind,
      description,
      notes,
      position,
      foundryScenes,
      links,
      rewardCurrency,
      rewardXp,
      syncVersion,
    }))(encounter),
    {
      questId: "q1",
      name: "Ambush at the bridge",
      kind: "trap",
      description: "Goblins in the reeds",
      notes: null,
      position: 4,
      foundryScenes: [],
      links: [],
      rewardCurrency: {},
      rewardXp: null,
      syncVersion: 0,
    },
  );
  assert.equal(encounter.id, encounter.uuid);
  assert.equal(newRecord("encounters", { questId: "q9", name: "Talk", kind: "dance" }, { id: ids(), existing }).kind, "combat");
  assert.equal(newRecord("encounters", { questId: "q9", name: "Talk" }, { id: ids(), existing }).position, 0);
  assert.deepEqual(newRecord("encounters", { questId: "q1" }, { id: ids() }), { error: "Name is required." });
});

test("numbers a new session after the last one", () => {
  const session = newRecord(
    "sessions",
    { title: "", level: "4" },
    { id: ids(), existing: [{ number: 1 }, { number: 3 }] },
  );

  assert.deepEqual([session.number, session.title, session.displayTitle, session.level], [4, null, "Session 4", 4]);
});

test("asks for what's required", () => {
  assert.deepEqual(newRecord("secrets", { text: "  " }, { id: ids() }), { error: "The clue is required." });
  assert.deepEqual(newRecord("npcs", {}, { id: ids() }), { error: "Name is required." });
  assert.deepEqual(newRecord("monsters", { name: "x" }, { id: ids() }), { error: "Can't add monsters." });
});

test("saves Dashboard changes to local records", () => {
  const now = () => "2026-10-16T20:00:00.000Z";
  const secret = { id: "s1", text: "Clue", revealed: false, revealedAt: null, revealedSessionId: null };

  const revealed = applyLocalChange("secrets", secret, { revealed: true, revealedSessionUuid: "sess1" }, { now });
  assert.deepEqual(
    [revealed.revealed, revealed.revealedAt, revealed.revealedSessionId],
    [true, "2026-10-16T20:00:00.000Z", "sess1"],
  );
  const hidden = applyLocalChange("secrets", revealed, { revealed: false, revealedSessionUuid: null }, { now });
  assert.deepEqual([hidden.revealed, hidden.revealedAt, hidden.revealedSessionId], [false, null, null]);

  assert.equal(applyLocalChange("fronts", { clockFilled: 1 }, { clockFilled: 2 }, { now }).clockFilled, 2);
  assert.equal(applyLocalChange("quests", { status: "available" }, { status: "active" }, { now }).status, "active");
  assert.deepEqual(
    applyLocalChange(
      "quests",
      { name: "Find the crypt", status: "active" },
      {
        foundryScenes: [{ uuid: "Scene.QdI6Ix83ypmPq4lc", name: "Crypt" }],
        rewardCurrency: { gp: 50 },
        rewardXp: 300,
        milestone: true,
        name: "Changed",
      },
      { now },
    ),
    {
      name: "Find the crypt",
      status: "active",
      foundryScenes: [{ uuid: "Scene.QdI6Ix83ypmPq4lc", name: "Crypt" }],
      rewardCurrency: { gp: 50 },
      rewardXp: 300,
      milestone: true,
    },
  );
  assert.deepEqual(
    applyLocalChange(
      "sessions",
      { log: null, status: "planned" },
      { log: "We fought", status: "played", number: 9 },
      { now },
    ),
    {
      log: "We fought",
      status: "played",
    },
  );
  assert.deepEqual(applyLocalChange("npcs", { name: "Kalvar" }, { name: "Changed" }, { now }), { name: "Kalvar" });
});

test("lets the Dashboard and planner set Foundry-only fields", () => {
  const now = () => "x";
  const place = applyLocalChange(
    "locations",
    { name: "Pass" },
    { foundrySceneUuid: "Scene.a", foundrySceneName: "A", name: "No" },
    { now },
  );
  assert.deepEqual([place.foundrySceneName, place.name], ["A", "Pass"]);
  assert.equal(
    applyLocalChange("npcs", { name: "K" }, { foundryActorUuid: "Actor.b" }, { now }).foundryActorUuid,
    "Actor.b",
  );
  assert.deepEqual(
    applyLocalChange("sessions", { log: null }, { treasureCurrency: { gp: 5 }, foundryScenes: [] }, { now })
      .treasureCurrency,
    { gp: 5 },
  );
  const handouts = [{ uuid: "JournalEntry.QdI6Ix83ypmPq4lc", name: "Letter" }];
  assert.deepEqual(applyLocalChange("quests", { name: "Q" }, { handouts }, { now }).handouts, handouts);
  const encounter = applyLocalChange("encounters", { name: "E" }, { rewardXp: 50, name: "No" }, { now });
  assert.deepEqual([encounter.rewardXp, encounter.name], [50, "E"]);
});

test("makes an NPC from an actor", () => {
  const npc = newRecord(
    "npcs",
    { name: "Cult Fanatic", foundryActorUuid: "Compendium.x.y.Actor.abc", foundryActorName: "Cult Fanatic" },
    { id: ids() },
  );
  assert.deepEqual(
    [npc.name, npc.foundryActorUuid, npc.foundryActorName],
    ["Cult Fanatic", "Compendium.x.y.Actor.abc", "Cult Fanatic"],
  );
  assert.equal(newRecord("npcs", { name: "Plain" }, { id: ids() }).foundryActorUuid, null);
});

test("starts new records with the Foundry-only fields empty", () => {
  const { records } = buildLocalCampaign(draft("five_room"), { id: ids() });
  assert.deepEqual([records.sessions[0].foundryScenes, records.sessions[0].treasureCurrency], [[], {}]);
  assert.equal(newRecord("locations", { name: "Crypt" }, { id: ids() }).foundrySceneUuid, null);
});

test("the Dashboard's threat form leaves out the clock or portents when they're switched off", () => {
  const names = (techniques) => addForm("fronts", techniques).fields.map((f) => f.name);

  assert.deepEqual(names(ALL_ON), ADD_FORMS.fronts.fields.map((f) => f.name));
  assert.deepEqual(names({ ...ALL_ON, clocks: false, portents: false }), ["name", "goal", "doom"]);
  assert.ok(names({ ...ALL_ON, clocks: false }).includes("portents"));
  assert.equal(addForm("secrets", ALL_ON).title, "Add a secret");
  assert.equal(addForm("nothing"), undefined);

  // A threat added without them still gets a clock, ready if it's switched back on
  const front = newRecord("fronts", { name: "Cult" }, { id: ids() });
  assert.deepEqual([front.clockSegments, front.clockFilled, front.portents], [6, 0, []]);
});
