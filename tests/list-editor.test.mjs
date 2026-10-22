import { test } from "node:test";
import assert from "node:assert/strict";
import { editList, listEditorRows, listFieldHtml, listFocusSelector, listRows, listText } from "../src/list-editor.mjs";

test("rows come from a list or from text with one per line", () => {
  assert.deepEqual(listRows(["Villages go quiet", "Smoke on the hills"]), ["Villages go quiet", "Smoke on the hills"]);
  assert.deepEqual(listRows("Villages go quiet\nSmoke on the hills"), ["Villages go quiet", "Smoke on the hills"]);
  assert.deepEqual(listRows(null), []);
  assert.deepEqual(listRows(""), []);
});

test("the value a form reads skips empty rows, one per line", () => {
  assert.equal(listText(["  Villages go quiet ", "", "Smoke on the hills", "   "]), "Villages go quiet\nSmoke on the hills");
  assert.equal(listText([]), "");
});

test("the editor has a numbered row per item, buttons to move and remove, Add, and the hidden field", () => {
  const html = listEditorRows(["Villages go quiet", "Smoke & ash"], { name: "portents", noun: "portent", max: 10, idPrefix: "t" });

  assert.match(html, /Portent 1<\/label>/);
  assert.match(html, /value="Smoke &amp; ash"/);
  assert.match(html, /aria-label="Move portent 1 up"[^>]*disabled/);
  assert.match(html, /aria-label="Move portent 2 down"[^>]*disabled/);
  assert.match(html, /aria-label="Remove portent 2"/);
  assert.match(html, /Add a portent<\/button>/);
  assert.match(html, /<textarea name="portents" hidden data-list-value>Villages go quiet\nSmoke &amp; ash<\/textarea>/);
  // The rows' own inputs have no name, so the form reads only the hidden field
  assert.doesNotMatch(html, /<input[^>]*name=/);
});

test("Add uses 'an' before a vowel, and stops at the limit", () => {
  assert.match(listEditorRows([], { name: "x", noun: "item", max: 3, idPrefix: "t" }), /Add an item/);
  const full = listEditorRows(["a", "b"], { name: "x", noun: "scene", max: 2, idPrefix: "t" });
  assert.match(full, /data-list-op="add" disabled/);
  assert.match(full, /That's 2/);
});

test("the field has its label and hint around the editor", () => {
  const html = listFieldHtml({ name: "stakes", label: "Stakes", hint: "Questions to answer", value: "Will the bridge hold?", noun: "question", max: 10, idPrefix: "f" });

  assert.match(html, /<legend>Stakes<\/legend>/);
  assert.match(html, /Questions to answer/);
  assert.match(html, /data-list-editor data-name="stakes" data-noun="question"/);
  assert.match(html, /value="Will the bridge hold\?"/);
});

test("adding, moving and removing rows, and where focus goes", () => {
  assert.deepEqual(editList(["a"], "add", NaN, 5), { rows: ["a", ""], focus: { index: 1, target: "item" } });
  assert.deepEqual(editList(["a", "b"], "add", NaN, 2), { rows: ["a", "b"], focus: { target: "add" } });
  assert.deepEqual(editList(["a", "b", "c"], "up", 2, 5), { rows: ["a", "c", "b"], focus: { index: 1, target: "up" } });
  assert.deepEqual(editList(["a", "b"], "up", 1, 5), { rows: ["b", "a"], focus: { index: 0, target: "down" } });
  assert.deepEqual(editList(["a", "b"], "down", 0, 5), { rows: ["b", "a"], focus: { index: 1, target: "up" } });
  assert.deepEqual(editList(["a", "b"], "remove", 1, 5), { rows: ["a"], focus: { index: 0, target: "item" } });
  assert.deepEqual(editList(["a"], "remove", 0, 5), { rows: [], focus: { target: "add" } });
  assert.deepEqual(editList(["a"], "up", 0, 5), { rows: ["a"], focus: null });
  assert.deepEqual(editList(["a"], "remove", 4, 5), { rows: ["a"], focus: null });
});

test("focus selectors point at the row's box, a button, or Add", () => {
  assert.equal(listFocusSelector({ index: 2, target: "item" }), '[data-list-row][data-index="2"] [data-list-item]');
  assert.equal(listFocusSelector({ index: 0, target: "down" }), '[data-list-row][data-index="0"] [data-list-op="down"]');
  assert.equal(listFocusSelector({ target: "add" }), '[data-list-op="add"]');
  assert.equal(listFocusSelector(null), null);
});
