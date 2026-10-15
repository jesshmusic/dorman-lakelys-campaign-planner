import { test } from "node:test";
import assert from "node:assert/strict";
import { DmGuruApi, DmGuruApiError } from "../scripts/api.mjs";

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
  const { calls, fetchImpl } = fakeFetch([{ body: { premium: true } }]);
  const api = new DmGuruApi({ baseUrl: "http://localhost:3000/", token: "dmg_abc", fetchImpl });

  assert.deepEqual(await api.me(), { premium: true });
  assert.equal(calls[0].url, "http://localhost:3000/v1/foundry/me");
  assert.equal(calls[0].init.method, "GET");
  assert.equal(calls[0].init.headers.Authorization, "Bearer dmg_abc");
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
    { status: 403, body: { errors: ["Campaign sync needs a premium Patreon membership."], code: "premium_required" } },
  ]);
  const api = new DmGuruApi({ token: "t", fetchImpl });

  await assert.rejects(api.campaigns(), (error) => {
    assert.ok(error instanceof DmGuruApiError);
    assert.equal(error.status, 403);
    assert.equal(error.premiumRequired, true);
    assert.match(error.message, /premium/);
    return true;
  });
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
