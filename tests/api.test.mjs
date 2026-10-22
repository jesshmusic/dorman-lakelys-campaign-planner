import { test } from "node:test";
import assert from "node:assert/strict";
import { DmGuruApi, DmGuruApiError, SYNC_SCHEMA } from "../src/api.mjs";

function fakeFetch(responses) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    const { status = 200, body = {} } = responses.shift() ?? {};
    return { ok: status >= 200 && status < 300, status, json: async () => body };
  };
  return { calls, fetchImpl };
}

test("sends the token and reads the account", async () => {
  const { calls, fetchImpl } = fakeFetch([{ body: { user: { name: "Jess" } } }]);
  const api = new DmGuruApi({ baseUrl: "http://localhost:3000/", token: "dmg_abc", fetchImpl });

  assert.deepEqual(await api.me(), { user: { name: "Jess" } });
  assert.equal(calls[0].url, "http://localhost:3000/v1/foundry/me");
  assert.equal(calls[0].init.method, "GET");
  assert.equal(calls[0].init.headers.Authorization, "Bearer dmg_abc");
});

test("reads the New campaign guide's words without a token", async () => {
  const { calls, fetchImpl } = fakeFetch([{ body: { steps: [], templates: [] } }]);
  const api = new DmGuruApi({ baseUrl: "http://localhost:3000", token: null, fetchImpl });

  assert.deepEqual(await api.setupGuide(), { steps: [], templates: [] });
  assert.equal(calls[0].url, "http://localhost:3000/v1/setup_guide");
  assert.equal(calls[0].init.method, "GET");
  assert.equal(calls[0].init.headers.Authorization, undefined);
});

test("asks for changes since a cursor", async () => {
  const { calls, fetchImpl } = fakeFetch([{ body: { cursor: 9 } }]);
  const api = new DmGuruApi({ token: "t", fetchImpl });

  await api.changes("6f9619ff-8b86-d011-b42d-00cf4fc964ff", 7);

  assert.equal(
    calls[0].url,
    "https://dungeonmaster.guru/v1/foundry/campaigns/6f9619ff-8b86-d011-b42d-00cf4fc964ff/changes?since=7",
  );
});

test("pushes changes as JSON", async () => {
  const { calls, fetchImpl } = fakeFetch([{ body: { applied: [] } }]);
  const api = new DmGuruApi({ token: "t", fetchImpl });
  const changes = [{ type: "front", uuid: "u", baseVersion: 3, attributes: { clockFilled: 2 } }];

  await api.push("c", changes);

  assert.equal(calls[0].init.method, "POST");
  assert.equal(calls[0].init.headers["Content-Type"], "application/json");
  assert.deepEqual(JSON.parse(calls[0].init.body), { changes });
});

test("turns error responses into DmGuruApiError with the server's message and code", async () => {
  const { fetchImpl } = fakeFetch([
    { status: 404, body: { errors: ["Campaign not found"], code: "not_found" } },
  ]);
  const api = new DmGuruApi({ token: "t", fetchImpl });

  await assert.rejects(api.campaigns(), (error) => {
    assert.ok(error instanceof DmGuruApiError);
    assert.equal(error.status, 404);
    assert.equal(error.code, "not_found");
    assert.equal(error.message, "Campaign not found");
    return true;
  });
});

test("sends this world's player characters", async () => {
  const { calls, fetchImpl } = fakeFetch([{ body: { count: 1, skipped: 0 } }]);
  const api = new DmGuruApi({ token: "t", fetchImpl });
  const world = { id: "greyhawk", title: "Greyhawk" };
  const characters = [{ uuid: "Actor.a", name: "Akra", sheet: {} }];

  assert.equal((await api.sendCharacters(world, characters)).count, 1);
  assert.equal(calls[0].url, "https://dungeonmaster.guru/v1/foundry/characters");
  assert.equal(calls[0].init.method, "POST");
  assert.deepEqual(JSON.parse(calls[0].init.body), { world, characters });
});

test("asks which scene thumbnails Dungeon Master Guru has from this world", async () => {
  const { calls, fetchImpl } = fakeFetch([{ body: { scenes: {} } }]);
  const api = new DmGuruApi({ token: "t", fetchImpl });

  assert.deepEqual(await api.sceneStatus("my world"), { scenes: {} });
  assert.equal(calls[0].url, "https://dungeonmaster.guru/v1/foundry/scenes?world=my+world");
  assert.equal(calls[0].init.method, "GET");
});

test("sends a scene's thumbnail", async () => {
  const { calls, fetchImpl } = fakeFetch([{ body: { uuid: "Scene.a", thumbnailUrl: "https://x/a.webp" } }]);
  const api = new DmGuruApi({ token: "t", fetchImpl });
  const world = { id: "dev", title: "Dev" };
  const scene = { uuid: "Scene.a", name: "Pass", version: "1-abc", thumbnail: "data:image/webp;base64,AAAA" };

  assert.equal((await api.sendScene(world, scene)).thumbnailUrl, "https://x/a.webp");
  assert.equal(calls[0].url, "https://dungeonmaster.guru/v1/foundry/scenes");
  assert.equal(calls[0].init.method, "POST");
  assert.deepEqual(JSON.parse(calls[0].init.body), { world, scene });
});

test("removes a scene that's gone from the world", async () => {
  const { calls, fetchImpl } = fakeFetch([{ body: {} }]);
  const api = new DmGuruApi({ token: "t", fetchImpl });

  await api.deleteScene("dev", "Scene.QdI6Ix83ypmPq4lc");

  assert.equal(calls[0].url, "https://dungeonmaster.guru/v1/foundry/scenes?world=dev&uuid=Scene.QdI6Ix83ypmPq4lc");
  assert.equal(calls[0].init.method, "DELETE");
});

test("reads which compendium packs Dungeon Master Guru has", async () => {
  const { calls, fetchImpl } = fakeFetch([{ body: { packs: {} } }]);
  const api = new DmGuruApi({ token: "t", fetchImpl });

  assert.deepEqual(await api.compendiumStatus(), { packs: {} });
  assert.equal(calls[0].url, "https://dungeonmaster.guru/v1/foundry/compendium");
  assert.equal(calls[0].init.method, "GET");
});

test("sends one compendium pack's index", async () => {
  const { calls, fetchImpl } = fakeFetch([{ body: { pack: "dnd5e.actors24", count: 1, skipped: 0 } }]);
  const api = new DmGuruApi({ token: "t", fetchImpl });
  const entries = [{ uuid: "u", name: "Zombie", category: "monster", challengeRating: "1/4", detail: "Undead" }];

  assert.equal((await api.sendCompendiumPack("dnd5e.actors24", "dnd5e@6.0.6+1", entries)).count, 1);
  assert.equal(calls[0].url, "https://dungeonmaster.guru/v1/foundry/compendium");
  assert.equal(calls[0].init.method, "POST");
  assert.deepEqual(JSON.parse(calls[0].init.body), { pack: "dnd5e.actors24", version: "dnd5e@6.0.6+1", entries });
});

test("creates a campaign", async () => {
  const { calls, fetchImpl } = fakeFetch([{ status: 201, body: { uuid: "u", name: "Zombie Siege" } }]);
  const api = new DmGuruApi({ token: "t", fetchImpl });
  const body = { template: "blank", campaign: { name: "Zombie Siege" } };

  assert.equal((await api.createCampaign(body)).name, "Zombie Siege");
  assert.equal(calls[0].url, "https://dungeonmaster.guru/v1/foundry/campaigns");
  assert.equal(calls[0].init.method, "POST");
  assert.deepEqual(JSON.parse(calls[0].init.body), body);
});

test("says which fields a rejected campaign got wrong", async () => {
  const { fetchImpl } = fakeFetch([
    { status: 422, body: { errors: ["Target level can't be lower than the starting level"], fields: ["target_level"] } },
  ]);
  const api = new DmGuruApi({ token: "t", fetchImpl });

  await assert.rejects(
    api.createCampaign({}),
    (error) =>
      error.status === 422 &&
      error.message === "Target level can't be lower than the starting level" &&
      error.fields.join() === "target_level",
  );
});

test("flags an invalid token", async () => {
  const { fetchImpl } = fakeFetch([{ status: 401, body: { errors: ["Invalid API token"] } }]);
  const api = new DmGuruApi({ token: "bad", fetchImpl });

  await assert.rejects(api.me(), (error) => error.unauthorized === true);
});

test("reports when the server can't be reached", async () => {
  const api = new DmGuruApi({
    token: "t",
    fetchImpl: async () => {
      throw new Error("Failed to fetch");
    },
  });

  await assert.rejects(api.me(), (error) => error.status === 0 && /Could not reach/.test(error.message));
});

test("sends a campaign planned in Foundry", async () => {
  const { calls, fetchImpl } = fakeFetch([{ status: 201, body: { uuid: "u", ids: { a: "b" } } }]);
  const api = new DmGuruApi({ token: "t", fetchImpl });
  const body = { request_id: "send-abc12345", campaign: { name: "Night" }, records: {} };

  assert.deepEqual((await api.importCampaign(body)).ids, { a: "b" });
  assert.equal(calls[0].url, "https://dungeonmaster.guru/v1/foundry/campaigns/import");
  assert.equal(calls[0].init.method, "POST");
  assert.deepEqual(JSON.parse(calls[0].init.body), body);
});

test("starts linking with a code without a token", async () => {
  const { calls, fetchImpl } = fakeFetch([{ status: 201, body: { userCode: "WXYZ-2345", deviceCode: "d" } }]);
  const api = new DmGuruApi({ token: null, fetchImpl });
  const world = { id: "dev", title: "Dev" };

  assert.equal((await api.startLink(world)).userCode, "WXYZ-2345");
  assert.equal(calls[0].url, "https://dungeonmaster.guru/v1/foundry/link");
  assert.equal(calls[0].init.method, "POST");
  assert.ok(!("Authorization" in calls[0].init.headers));
  assert.deepEqual(JSON.parse(calls[0].init.body), { world });
});

test("polls for the token, with the reason it isn't ready as the error code", async () => {
  const { calls, fetchImpl } = fakeFetch([
    { status: 400, body: { error: "authorization_pending" } },
    { body: { token: "dmg_new", user: { name: "Jess" } } },
  ]);
  const api = new DmGuruApi({ token: null, fetchImpl });

  await assert.rejects(api.pollLink("d"), (error) => error.code === "authorization_pending" && error.status === 400);
  assert.equal((await api.pollLink("d")).token, "dmg_new");
  assert.equal(calls[0].url, "https://dungeonmaster.guru/v1/foundry/link/token");
  assert.deepEqual(JSON.parse(calls[0].init.body), { deviceCode: "d" });
});

test("sends a homebrew pack's index with its name", async () => {
  const { calls, fetchImpl } = fakeFetch([{ body: { pack: "world-actors.green-sky", count: 1, skipped: 0 } }]);
  const api = new DmGuruApi({ token: "t", fetchImpl });
  const entries = [{ uuid: "Actor.aa0000000000000", name: "Ash Wraith", category: "monster", challengeRating: "1/2", detail: null }];

  await api.sendCompendiumPack("world-actors.green-sky", "homebrew-abc+2", entries, { homebrew: true, label: "World actors (Night of the Green Sky)" });

  assert.deepEqual(JSON.parse(calls[0].init.body), {
    pack: "world-actors.green-sky",
    version: "homebrew-abc+2",
    entries,
    homebrew: true,
    label: "World actors (Night of the Green Sky)",
  });
});

test("fetches one of the DM's monsters to import", async () => {
  const { calls, fetchImpl } = fakeFetch([{ body: { id: "99", name: "Owlbear Queen", actor: { name: "Owlbear Queen", type: "npc" } } }]);
  const api = new DmGuruApi({ token: "t", fetchImpl });

  assert.equal((await api.monster("99")).name, "Owlbear Queen");
  assert.equal(calls[0].url, "https://dungeonmaster.guru/v1/foundry/monsters/99");
  assert.equal(calls[0].init.method, "GET");
});

test("a monster that's gone is a 404 error", async () => {
  const { fetchImpl } = fakeFetch([{ status: 404, body: { errors: ["Not found"] } }]);
  const api = new DmGuruApi({ token: "t", fetchImpl });

  await assert.rejects(api.monster("1"), (error) => error instanceof DmGuruApiError && error.status === 404);
});

test("tells Dungeon Master Guru which shape of campaign data it speaks", async () => {
  const { calls, fetchImpl } = fakeFetch([{ body: {} }, { body: { steps: [] } }]);
  const api = new DmGuruApi({ token: "t", fetchImpl });

  await api.changes("c", 0);
  await api.setupGuide();

  assert.equal(SYNC_SCHEMA, 1);
  assert.equal(calls[0].init.headers["X-Planner-Schema"], "1");
  assert.equal(calls[1].init.headers["X-Planner-Schema"], undefined, "only the /v1/foundry endpoints take it");
});

test("knows when Dungeon Master Guru needs a newer module", async () => {
  const { fetchImpl } = fakeFetch([{ status: 426, body: { errors: ["Update the module"], code: "update_module" } }]);
  const api = new DmGuruApi({ token: "t", fetchImpl });

  await assert.rejects(api.changes("c", 0), (error) => {
    assert.ok(error instanceof DmGuruApiError);
    assert.equal(error.updateNeeded, true);
    assert.equal(error.code, "update_module");
    return true;
  });
});
