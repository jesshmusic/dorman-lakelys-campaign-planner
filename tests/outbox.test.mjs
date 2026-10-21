import { test } from "node:test";
import assert from "node:assert/strict";
import {
  pendingCount,
  pendingUuids,
  pushPayload,
  queueCreate,
  queueDelete,
  queueUpdate,
  withRealIds,
} from "../src/outbox.mjs";

const front = { collection: "fronts", type: "front", uuid: "f-1", baseVersion: 7 };

test("an edit is queued with what each field was before", () => {
  const outbox = queueUpdate([], { ...front, before: { clockFilled: 2 }, attributes: { clockFilled: 3 } });

  assert.deepEqual(outbox, [
    { op: "update", collection: "fronts", type: "front", uuid: "f-1", baseVersion: 7, base: { clockFilled: 2 }, attributes: { clockFilled: 3 } },
  ]);
  assert.equal(pendingCount(outbox), 1);
});

test("edits to one record join one change, keeping the first base and version", () => {
  let outbox = queueUpdate([], { ...front, before: { clockFilled: 2 }, attributes: { clockFilled: 3 } });
  outbox = queueUpdate(outbox, { ...front, baseVersion: 9, before: { clockFilled: 3, goal: "Rise" }, attributes: { clockFilled: 4, goal: "Rule" } });

  assert.equal(outbox.length, 1);
  assert.equal(outbox[0].baseVersion, 7);
  assert.deepEqual(outbox[0].base, { clockFilled: 2, goal: "Rise" });
  assert.deepEqual(outbox[0].attributes, { clockFilled: 4, goal: "Rule" });
});

test("a field changed back to where it started drops out, and an empty change goes away", () => {
  let outbox = queueUpdate([], { ...front, before: { clockFilled: 2 }, attributes: { clockFilled: 3 } });
  outbox = queueUpdate(outbox, { ...front, before: { clockFilled: 3 }, attributes: { clockFilled: 2 } });

  assert.deepEqual(outbox, []);
  assert.deepEqual(queueUpdate([], { ...front, before: { clockFilled: 2 }, attributes: { clockFilled: 2 } }), []);
});

test("an edit to a record made in Foundry joins its create", () => {
  let outbox = queueCreate([], { collection: "npcs", type: "npc", uuid: "n-1", attributes: { name: "Ilse", role: "neutral" } });
  outbox = queueUpdate(outbox, { collection: "npcs", type: "npc", uuid: "n-1", baseVersion: 0, before: { role: "neutral" }, attributes: { role: "ally" } });

  assert.deepEqual(outbox, [{ op: "create", collection: "npcs", type: "npc", uuid: "n-1", attributes: { name: "Ilse", role: "ally" } }]);
});

test("deleting a record made in Foundry and never synced leaves nothing to send", () => {
  let outbox = queueCreate([], { collection: "npcs", type: "npc", uuid: "n-1", attributes: { name: "Ilse" } });
  outbox = queueDelete(outbox, { collection: "npcs", type: "npc", uuid: "n-1" });

  assert.deepEqual(outbox, []);
});

test("deleting a synced record drops its queued edits and queues the delete; later edits to it are ignored", () => {
  let outbox = queueUpdate([], { ...front, before: { clockFilled: 2 }, attributes: { clockFilled: 3 } });
  outbox = queueDelete(outbox, { collection: "fronts", type: "front", uuid: "f-1" });
  outbox = queueUpdate(outbox, { ...front, before: { clockFilled: 3 }, attributes: { clockFilled: 4 } });

  assert.deepEqual(outbox, [{ op: "delete", collection: "fronts", type: "front", uuid: "f-1" }]);
  assert.deepEqual([...pendingUuids(outbox).deleted], ["f-1"]);
});

test("stand-in ids are swapped for the real ones in id fields and links", () => {
  const change = {
    op: "update",
    type: "quest",
    uuid: "q-1",
    baseVersion: 3,
    base: { giverNpcId: null, links: [] },
    attributes: {
      giverNpcId: "n-temp",
      locationId: "12",
      links: [
        { linkableType: "CampaignNpc", linkableId: "n-temp", quantity: null },
        { linkableType: "Item", linkableId: "44", quantity: 2 },
      ],
    },
  };

  const real = withRealIds(change, { "n-temp": "31" });

  assert.equal(real.attributes.giverNpcId, "31");
  assert.equal(real.attributes.locationId, "12");
  assert.deepEqual(real.attributes.links.map((link) => link.linkableId), ["31", "44"]);
  assert.equal(change.attributes.giverNpcId, "n-temp", "the queued change itself is left alone");
});

test("each kind of change is sent in the push endpoint's shape", () => {
  assert.deepEqual(pushPayload({ op: "create", collection: "npcs", type: "npc", uuid: "u", attributes: { name: "A" } }), {
    op: "create",
    type: "npc",
    uuid: "u",
    attributes: { name: "A" },
  });
  assert.deepEqual(
    pushPayload({ op: "update", collection: "fronts", type: "front", uuid: "u", baseVersion: 4, base: {}, attributes: { clockFilled: 1 } }),
    { type: "front", uuid: "u", baseVersion: 4, attributes: { clockFilled: 1 } },
  );
  assert.deepEqual(pushPayload({ op: "delete", collection: "npcs", type: "npc", uuid: "u" }), { op: "delete", type: "npc", uuid: "u" });
});

test("an encounter made in Foundry for a quest made in Foundry points at the quest's real id once it's sent", () => {
  let outbox = queueCreate([], { collection: "quests", type: "quest", uuid: "q-temp", attributes: { name: "Clear the crypt" } });
  outbox = queueCreate(outbox, {
    collection: "encounters",
    type: "encounter",
    uuid: "e-temp",
    attributes: { name: "Ambush", questId: "q-temp", links: [{ linkableType: "CampaignNpc", linkableId: "n-temp", quantity: null }] },
  });

  const real = withRealIds(outbox[1], { "q-temp": "41", "n-temp": "31" });

  assert.equal(real.attributes.questId, "41");
  assert.deepEqual(real.attributes.links.map((link) => link.linkableId), ["31"]);
  assert.equal(withRealIds(outbox[1], {}).attributes.questId, "q-temp", "until then it keeps the stand-in");
  assert.deepEqual(pushPayload(real), { op: "create", type: "encounter", uuid: "e-temp", attributes: real.attributes });
});

test("moving an encounter to another quest sends the quest's real id, before and after", () => {
  const change = {
    op: "update",
    collection: "encounters",
    type: "encounter",
    uuid: "e-1",
    baseVersion: 2,
    base: { questId: "q-temp" },
    attributes: { questId: "q-temp2" },
  };
  const real = withRealIds(change, { "q-temp": "7", "q-temp2": "8" });

  assert.deepEqual([real.base.questId, real.attributes.questId], ["7", "8"]);
});
