import { test } from "node:test";
import assert from "node:assert/strict";
import { MAX_LEVEL, MIN_LEVEL, levelOptions, levelSelectHtml, optionsHtml } from "../src/levels.mjs";

test("offers every level from 1 to 20", () => {
  const options = levelOptions();

  assert.deepEqual([MIN_LEVEL, MAX_LEVEL], [1, 20]);
  assert.equal(options.length, 20);
  assert.deepEqual(options[0], ["1", "1"]);
  assert.deepEqual(options.at(-1), ["20", "20"]);
});

test("offers a choice for no level first, when it has a label", () => {
  const options = levelOptions("Any");

  assert.deepEqual(options[0], ["", "Any"]);
  assert.equal(options.length, 21);
});

test("chooses the option for the value, a number or text, and escapes labels", () => {
  const html = optionsHtml(
    [
      ["", "None"],
      ["5", "Five <b>"],
    ],
    5,
  );

  assert.match(html, /<option value="5" selected>Five &lt;b&gt;<\/option>/);
  assert.match(html, /<option value="" >None<\/option>/);
  assert.match(optionsHtml([["", "None"]], null), /value="" selected/);
});

test("draws a level dropdown with its name and other attributes", () => {
  const html = levelSelectHtml({ id: "dlcp-level", name: "level", value: 3, blank: "Not set", attributes: 'data-field="level"' });

  assert.match(html, /^<select id="dlcp-level" name="level" data-field="level">/);
  assert.match(html, /<option value="3" selected>3<\/option>/);
  assert.match(html, /<option value="" >Not set<\/option>/);
  assert.doesNotMatch(levelSelectHtml({ id: "x", value: "" }), /name=/);
});
