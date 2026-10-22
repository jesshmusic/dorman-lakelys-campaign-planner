import { test } from "node:test";
import assert from "node:assert/strict";
import {
  pendingCount,
  pendingUuids,
  pointAtRealIds,
  pointsAt,
  pushPayload,
  queueCreate,
  queueDelete,
  queueUpdate,
  realIds,
  sendOrder,
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

test("knows the real ids of records made here and already sent, from the records", () => {
  const records = [
    { id: "3", uuid: "ref-temp" },
    { id: "q-temp", uuid: "q-temp" },
    { id: 12, uuid: "server-uuid" },
  ];

  assert.deepEqual(realIds(records), { "ref-temp": "3", "server-uuid": "12" });
});

test("points a record at real ids, leaving it as it is when nothing changes", () => {
  const quest = {
    id: "q-temp",
    uuid: "q-temp",
    parentId: "q-parent",
    links: [
      { linkableType: "CampaignReference", linkableId: "ref-temp", quantity: 3 },
      { linkableType: "Monster", linkableId: "55" },
    ],
  };
  const ids = { "ref-temp": "3", "q-parent": "9" };

  const pointed = pointAtRealIds(quest, ids);
  assert.equal(pointed.parentId, "9");
  assert.deepEqual(
    pointed.links.map((link) => [link.linkableId, link.quantity]),
    [
      ["3", 3],
      ["55", undefined],
    ],
  );
  assert.equal(pointed.id, "q-temp", "its own id isn't a pointer");
  assert.equal(pointAtRealIds(pointed, ids), pointed);

  const npc = { id: "n1", statBlockReferenceId: "ref-temp", statBlockReference: { id: "ref-temp", name: "Ghoul" } };
  assert.deepEqual(pointAtRealIds(npc, ids).statBlockReference, { id: "3", name: "Ghoul" });
});

test("lists what a change points at", () => {
  const change = {
    op: "create",
    uuid: "e-temp",
    attributes: { questId: "q-temp", npcId: null, links: [{ linkableId: "ref-temp" }], revealedSessionUuid: "s-uuid" },
  };

  assert.deepEqual(pointsAt(change), ["q-temp", "ref-temp", "s-uuid"]);
  assert.deepEqual(pointsAt({ op: "delete", uuid: "x" }), []);
});

test("sends records made here before what points at them, keeping the rest in order", () => {
  // The quest was made first, then the references dropped on it: its create came first
  const quest = { op: "create", collection: "quests", uuid: "q-temp", attributes: { name: "Q", links: [{ linkableId: "r1" }, { linkableId: "r2" }] } };
  const clock = { op: "update", collection: "fronts", uuid: "f-1", attributes: { clockFilled: 3 } };
  const r1 = { op: "create", collection: "references", uuid: "r1", attributes: { name: "Zombie" } };
  const encounter = { op: "create", collection: "encounters", uuid: "e-temp", attributes: { questId: "q-temp" } };
  const r2 = { op: "create", collection: "references", uuid: "r2", attributes: { name: "Watch Zombie" } };

  assert.deepEqual(
    sendOrder([quest, clock, r1, encounter, r2]).map((change) => change.uuid),
    ["f-1", "r1", "r2", "q-temp", "e-temp"],
  );
  assert.deepEqual(sendOrder([clock, r1]).map((change) => change.uuid), ["f-1", "r1"]);
});

test("records that point at each other go in the order they were queued", () => {
  const a = { op: "create", uuid: "a", attributes: { parentId: "b" } };
  const b = { op: "create", uuid: "b", attributes: { parentId: "a" } };

  assert.deepEqual(sendOrder([a, b]).map((change) => change.uuid), ["a", "b"]);
});
