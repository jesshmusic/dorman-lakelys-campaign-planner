import { test } from "node:test";
import assert from "node:assert/strict";
import { EDITABLE, changedAttributes, createAttributes, linksForSync, uuidV4 } from "../src/editing.mjs";

const quest = {
  id: "12",
  uuid: "6f9619ff-8b86-d011-b42d-00cf4fc964ff",
  syncVersion: 4,
  name: "Find the crypt",
  status: "available",
  giverNpcId: "3",
  rewardCurrency: { gp: 50 },
  links: [{ id: "1", uuid: "u1", linkableType: "CampaignNpc", linkableId: "3", name: "Kalvar", quantity: null }],
};

test("sends only the editable fields that changed", () => {
  const after = { ...quest, name: "Clear the crypt", rewardCurrency: { gp: 50 }, syncVersion: 9 };

  assert.deepEqual(changedAttributes("quests", quest, after), { name: "Clear the crypt" });
});

test("sends cleared fields as null", () => {
  assert.deepEqual(changedAttributes("quests", quest, { ...quest, giverNpcId: null }), { giverNpcId: null });
});

test("sends a session's or quest's whole link list when it changed", () => {
  const after = {
    ...quest,
    links: [
      ...quest.links,
      { id: "new1", uuid: "new1", linkableType: "CampaignReference", linkableId: "8", name: "Gem", quantity: 3 },
    ],
  };

  assert.deepEqual(changedAttributes("quests", quest, after), {
    links: [
      { linkableType: "CampaignNpc", linkableId: "3", quantity: null },
      { linkableType: "CampaignReference", linkableId: "8", quantity: 3 },
    ],
  });
});

test("ignores link details the sync doesn't take", () => {
  const renamed = { ...quest, links: [{ ...quest.links[0], name: "Kalvar the Hollow", id: "other", position: 5 }] };

  assert.deepEqual(changedAttributes("quests", quest, renamed), {});
});

test("leaves out fields the sync can't change, and fields the edit didn't touch", () => {
  const after = { ...quest, syncVersion: 10, uuid: "x" };
  delete after.status;

  assert.deepEqual(changedAttributes("quests", quest, after), {});
  assert.deepEqual(changedAttributes("unknown", quest, { name: "x" }), {});
});

test("creates a record with its editable fields", () => {
  const npc = { id: "local1", uuid: "local1", syncVersion: 0, name: "Mira", role: "ally", factionId: null, monster: null };

  assert.deepEqual(createAttributes("npcs", npc), { name: "Mira", role: "ally", factionId: null });
});

test("links go to the sync with string ids", () => {
  assert.deepEqual(linksForSync([{ linkableType: "Monster", linkableId: 12, quantity: undefined }]), [
    { linkableType: "Monster", linkableId: "12", quantity: null },
  ]);
  assert.deepEqual(linksForSync(undefined), []);
});

test("every kind of record the planner edits can be sent", () => {
  for (const collection of ["campaign", "factions", "locations", "npcs", "fronts", "quests", "secrets", "sessions", "references"]) {
    assert.ok(EDITABLE[collection].length > 0, collection);
  }
});

test("makes a version 4 UUID without crypto.randomUUID", () => {
  const uuid = uuidV4();

  assert.match(uuid, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.notEqual(uuidV4(), uuid);
});

test("sets the version and variant bits whatever the random bytes are", () => {
  assert.equal(uuidV4((bytes) => bytes.fill(0xff)), "ffffffff-ffff-4fff-bfff-ffffffffffff");
  assert.equal(uuidV4((bytes) => bytes.fill(0)), "00000000-0000-4000-8000-000000000000");
});

test("sends a secret being revealed, and when", () => {
  const secret = { id: "4", uuid: "u4", text: "The miller is the cultist", revealed: false, revealedSessionUuid: null };

  assert.deepEqual(changedAttributes("secrets", secret, { ...secret, revealed: true, revealedSessionUuid: "s2" }), {
    revealed: true,
    revealedSessionUuid: "s2",
  });
});
