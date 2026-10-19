import { test } from "node:test";
import assert from "node:assert/strict";
import { mergeChange } from "../src/merge.mjs";

test("retries a change the server didn't touch", () => {
  const base = { clockFilled: 1, name: "Plague" };
  const theirs = { clockFilled: 1, name: "The Plague" };

  assert.deepEqual(mergeChange(base, { clockFilled: 2 }, theirs), { retry: { clockFilled: 2 }, clashes: [] });
});

test("drops a change the server already has", () => {
  assert.deepEqual(mergeChange({ status: "active" }, { status: "completed" }, { status: "completed" }), {
    retry: {},
    clashes: [],
  });
});

test("reports a clash when both sides changed the same field differently", () => {
  assert.deepEqual(mergeChange({ clockFilled: 1 }, { clockFilled: 2 }, { clockFilled: 3 }), {
    retry: {},
    clashes: ["clockFilled"],
  });
});

test("compares arrays and objects by value", () => {
  const portents = [{ text: "Crows", triggered: false }];
  const mine = [{ text: "Crows", triggered: true }];

  assert.deepEqual(mergeChange({ portents }, { portents: mine }, { portents: structuredClone(portents) }), {
    retry: { portents: mine },
    clashes: [],
  });
});

test("treats missing and null as the same", () => {
  assert.deepEqual(mergeChange({}, { log: "Notes" }, { log: null }), { retry: { log: "Notes" }, clashes: [] });
});
