import { test } from "node:test";
import assert from "node:assert/strict";
import { nextPoll, timeLeft } from "../src/link.mjs";

test("keeps waiting while the code hasn't been entered", () => {
  assert.deepEqual(nextPoll("authorization_pending", 5), { wait: 5 });
});

test("waits longer when asked to slow down", () => {
  assert.deepEqual(nextPoll("slow_down", 5), { wait: 10 });
});

test("stops when the code expired, was cancelled, or something else went wrong", () => {
  assert.deepEqual(nextPoll("expired_token"), { stop: "expired" });
  assert.deepEqual(nextPoll("access_denied"), { stop: "denied" });
  assert.deepEqual(nextPoll("something_else"), { stop: "error" });
  assert.deepEqual(nextPoll(null), { stop: "error" });
});

test("shows the time left on the code", () => {
  assert.equal(timeLeft(10 * 60 * 1000, 0), "10:00");
  assert.equal(timeLeft(65 * 1000, 0), "1:05");
  assert.equal(timeLeft(0, 5000), "0:00");
});
