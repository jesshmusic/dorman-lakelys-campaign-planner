import { test } from "node:test";
import assert from "node:assert/strict";
import { DATA_VERSION, MIGRATIONS, migrateCampaign } from "../src/migrations.mjs";

// Stand-in ids, as a record made in Foundry has until it's synced
const QUEST = "6f1d0c2a-6a3e-4c1e-9d0b-0a1b2c3d4e5f";
const ZOMBIE = "e85bdf04-1111-4aaa-8bbb-000000000001";
const WATCH_ZOMBIE = "f38c765c-2222-4aaa-8bbb-000000000002";
const RUNNER = "a2018e87-3333-4aaa-8bbb-000000000003";
const DELETED = "0d0d0d0d-4444-4aaa-8bbb-000000000004";

// A synced campaign stuck as 1.3.0 left it: its three book references were
// sent (and have ids 1, 2 and 3), but the quest that links to them still
// points at their stand-in ids, so it, and its encounter, can't be sent
const stuck = () => ({
  records: {
    campaign: [{ id: "7", uuid: "camp-uuid", name: "The Grey Plague" }],
    references: [
      { id: "1", uuid: ZOMBIE, name: "Zombie", foundryUuid: "Actor.aaaaaaaaaaaaaaaa", syncVersion: 4 },
      { id: "2", uuid: WATCH_ZOMBIE, name: "Watch Zombie", foundryUuid: "Actor.bbbbbbbbbbbbbbbb", syncVersion: 5 },
      { id: "3", uuid: RUNNER, name: "Runner Zombie", foundryUuid: null, syncVersion: 6 },
    ],
    quests: [
      {
        id: QUEST,
        uuid: QUEST,
        name: "Clear the warren",
        links: [
          { linkableType: "CampaignReference", linkableId: ZOMBIE, quantity: 4 },
          { linkableType: "CampaignReference", linkableId: WATCH_ZOMBIE },
          { linkableType: "CampaignReference", linkableId: DELETED },
          { linkableType: "Monster", linkableId: "212" },
        ],
      },
    ],
    encounters: [{ id: "e-1", uuid: "e-1", name: "Encounter 1", questId: QUEST }],
  },
  outbox: [
    {
      op: "create",
      collection: "quests",
      type: "quest",
      uuid: QUEST,
      attributes: {
        name: "Clear the warren",
        links: [
          { linkableType: "CampaignReference", linkableId: ZOMBIE, quantity: 4 },
          { linkableType: "CampaignReference", linkableId: RUNNER, quantity: null },
          { linkableType: "CampaignReference", linkableId: DELETED, quantity: null },
        ],
      },
    },
    { op: "create", collection: "encounters", type: "encounter", uuid: "e-1", attributes: { name: "Encounter 1", questId: QUEST } },
  ],
});

const quest = (data) => data.records.quests[0];
const queued = (data, uuid) => data.outbox.find((change) => change.uuid === uuid);

test("the data version is the last step's", () => {
  assert.equal(DATA_VERSION, MIGRATIONS.at(-1).version);
  assert.deepEqual(
    MIGRATIONS.map((step) => step.version),
    MIGRATIONS.map((_, index) => index + 1),
    "steps are numbered in order, from 1",
  );
});

test("points a stuck quest and its waiting create at the references' real ids", () => {
  const migrated = migrateCampaign(stuck(), 0);

  assert.deepEqual(
    quest(migrated).links.map((link) => link.linkableId),
    ["1", "2", "212"],
  );
  assert.deepEqual(
    queued(migrated, QUEST).attributes.links.map((link) => [link.linkableId, link.quantity]),
    [
      ["1", 4],
      ["3", null],
    ],
  );
  assert.equal(migrated.version, DATA_VERSION);
});

test("keeps pointers at records made here that aren't sent yet", () => {
  const migrated = migrateCampaign(stuck(), 0);

  assert.equal(migrated.records.encounters[0].questId, QUEST);
  assert.equal(queued(migrated, "e-1").attributes.questId, QUEST);
});

test("drops pointers at records made here that are gone, but not at real ids it hasn't pulled", () => {
  const data = stuck();
  data.records.encounters[0].questId = DELETED;
  data.outbox[1].attributes.questId = DELETED;
  data.records.quests[0].parentId = "99";

  const migrated = migrateCampaign(data, 0);

  assert.equal(migrated.records.encounters[0].questId, null);
  assert.equal(queued(migrated, "e-1").attributes.questId, null);
  assert.ok(!quest(migrated).links.some((link) => link.linkableId === DELETED));
  assert.equal(quest(migrated).parentId, "99");
});

test("a book reference made from an actor takes the actor's name, sent with the next Sync", () => {
  const names = { "Actor.aaaaaaaaaaaaaaaa": "Zombie", "Actor.bbbbbbbbbbbbbbbb": "Guard Zombie" };
  const migrated = migrateCampaign(stuck(), 0, { actorName: (uuid) => names[uuid] ?? null });

  assert.deepEqual(
    migrated.records.references.map((reference) => reference.name),
    ["Zombie", "Guard Zombie", "Runner Zombie"],
  );
  assert.deepEqual(queued(migrated, WATCH_ZOMBIE), {
    op: "update",
    collection: "references",
    type: "reference",
    uuid: WATCH_ZOMBIE,
    baseVersion: 5,
    base: { name: "Watch Zombie" },
    attributes: { name: "Guard Zombie" },
  });
});

test("a local campaign's renames aren't queued, and a missing actor changes nothing", () => {
  const data = stuck();
  data.records.campaign[0].local = true;
  data.outbox = [];

  const renamed = migrateCampaign(data, 0, { actorName: () => "Guard Zombie" });
  assert.equal(renamed.records.references[1].name, "Guard Zombie");
  assert.deepEqual(renamed.outbox, []);

  const untouched = migrateCampaign(stuck(), 0, { actorName: () => null });
  assert.deepEqual(
    untouched.records.references.map((reference) => reference.name),
    ["Zombie", "Watch Zombie", "Runner Zombie"],
  );
});

test("runs only the steps after the campaign's version, and is safe to run again", () => {
  const once = migrateCampaign(stuck(), 0, { actorName: () => "Guard Zombie" });
  const twice = migrateCampaign({ records: once.records, outbox: once.outbox }, 0, { actorName: () => "Guard Zombie" });

  assert.deepEqual(twice.records, once.records);
  assert.deepEqual(twice.outbox, once.outbox);
  assert.deepEqual(migrateCampaign(stuck(), DATA_VERSION).ran, []);
  assert.deepEqual(migrateCampaign(stuck(), 1).ran, ["Book references take their actor's name"]);
});
