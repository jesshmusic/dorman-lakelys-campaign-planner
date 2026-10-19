import { test } from "node:test";
import assert from "node:assert/strict";
import { SENT_COLLECTIONS, importPayload, recordCount, sendRequestId } from "../src/send.mjs";
import { buildLocalCampaign } from "../src/local.mjs";

const ids = () => {
  let n = 0;
  return () => `id${String((n += 1)).padStart(14, "0")}`;
};

const world = { id: "dev", title: "Dev" };

const local = () => {
  const { campaign, records } = buildLocalCampaign(
    { template: "three_act", values: { name: "Night of the Green Sky", start_level: "3" }, party: ["Actor.a1"] },
    { id: ids() },
  );
  return { campaign, store: { campaign: [campaign], ...records } };
};

test("sends the campaign and its records, keeping their ids for the references between them", () => {
  const { campaign, store } = local();
  const npc = { id: "npc0000000000001", uuid: "npc0000000000001", syncVersion: 0, name: "Kalvar", factionId: "fac0000000000001" };
  store.npcs = [npc];
  store.factions = [{ id: "fac0000000000001", uuid: "fac0000000000001", syncVersion: 0, name: "The Cult" }];

  const payload = importPayload({ campaign, store, world });

  assert.equal(payload.campaign.name, "Night of the Green Sky");
  assert.equal(payload.campaign.id, campaign.id);
  assert.deepEqual(payload.records.npcs, [{ id: "npc0000000000001", name: "Kalvar", factionId: "fac0000000000001" }]);
  assert.equal(payload.records.sessions.length, 6);
  assert.equal(payload.records.quests.length, 3);
  assert.deepEqual(Object.keys(payload.records), SENT_COLLECTIONS);
});

test("leaves out what only Foundry keeps", () => {
  const { campaign, store } = local();
  const payload = importPayload({ campaign, store, world });

  for (const key of ["uuid", "syncVersion", "local", "template", "partyActorUuids"]) {
    assert.ok(!(key in payload.campaign), key);
  }
  assert.ok(payload.records.sessions.every((session) => !("uuid" in session) && !("displayTitle" in session)));
});

test("sends the party's sheets with the world", () => {
  const { campaign, store } = local();
  const characters = [{ uuid: "Actor.a1", name: "Akra", sheet: {} }];

  assert.deepEqual(importPayload({ campaign, store, world, characters }).party, { world, characters });
  assert.ok(!("party" in importPayload({ campaign, store, world })));
});

test("uses one request id per campaign, so sending again doesn't make a second copy", () => {
  const { campaign, store } = local();

  assert.equal(importPayload({ campaign, store, world }).request_id, sendRequestId(campaign));
  assert.equal(sendRequestId(campaign), `send-${campaign.uuid}`);
  assert.match(sendRequestId(campaign), /^[\w-]{8,64}$/);
});

test("needs a campaign name", () => {
  assert.throws(() => importPayload({ campaign: { name: "" }, store: {}, world }), /needs a name/);
});

test("counts the records to send", () => {
  const { store } = local();

  assert.equal(recordCount(store), 6 + 3 + 1);
  assert.equal(recordCount({}), 0);
});
