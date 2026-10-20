import { test } from "node:test";
import assert from "node:assert/strict";
import {
  changeTruthRows,
  editTruths,
  readTruthRows,
  truthFocusSelector,
  truthsEditorRows,
  truthsFieldHtml,
} from "../src/truths-editor.mjs";
import { MAX_TRUTHS } from "../src/setup.mjs";

const truth = (name, description = "") => ({ name, description });
const three = [truth("Gold rules"), truth("Walls within walls", "Gates say who you are."), truth("The dead walk")];

test("adds a blank truth at the end, and focuses its name", () => {
  assert.deepEqual(editTruths(three, "add"), {
    rows: [...three, truth("")],
    focus: { index: 3, target: "name" },
  });
  assert.deepEqual(editTruths([], "add"), { rows: [truth("")], focus: { index: 0, target: "name" } });
});

test("won't add more truths than a campaign can have", () => {
  const full = Array.from({ length: MAX_TRUTHS }, (_, index) => truth(`Truth ${index + 1}`));

  assert.equal(editTruths(full, "add").rows.length, MAX_TRUTHS);
});

test("moves a truth up or down, keeping focus on the button that moved it", () => {
  assert.deepEqual(editTruths(three, "down", 0), {
    rows: [three[1], three[0], three[2]],
    focus: { index: 1, target: "down" },
  });
  assert.deepEqual(editTruths(three, "up", 2).focus, { index: 1, target: "up" });
  // At the end its button is disabled, so its other one takes focus
  assert.deepEqual(editTruths(three, "up", 1), { rows: [three[1], three[0], three[2]], focus: { index: 0, target: "down" } });
  assert.deepEqual(editTruths(three, "down", 1).focus, { index: 2, target: "up" });
});

test("won't move a truth past the ends", () => {
  assert.deepEqual(editTruths(three, "up", 0), { rows: three, focus: null });
  assert.deepEqual(editTruths(three, "down", 2), { rows: three, focus: null });
  assert.deepEqual(editTruths(three, "remove", 5), { rows: three, focus: null });
  assert.deepEqual(editTruths(three, "nonsense", 1), { rows: three, focus: null });
  assert.deepEqual(editTruths(three, "up", Number.NaN), { rows: three, focus: null });
});

test("removes a truth, focusing the one that took its place, or Add when none are left", () => {
  assert.deepEqual(editTruths(three, "remove", 1), { rows: [three[0], three[2]], focus: { index: 1, target: "name" } });
  assert.deepEqual(editTruths(three, "remove", 2).focus, { index: 1, target: "name" });
  assert.deepEqual(editTruths([truth("Only")], "remove", 0), { rows: [], focus: { target: "add" } });
});

test("finds what to focus in the editor", () => {
  assert.equal(truthFocusSelector({ index: 2, target: "name" }), '[data-truth-row][data-index="2"] [data-truth-part="name"]');
  assert.equal(truthFocusSelector({ index: 0, target: "down" }), '[data-truth-row][data-index="0"] [data-op="down"]');
  assert.equal(truthFocusSelector({ target: "add" }), '[data-op="add"]');
  assert.equal(truthFocusSelector(null), null);
});

test("numbers each row, with labelled name and description and buttons to move or remove it", () => {
  const html = truthsEditorRows(three, "dlcp-setup-truths");

  assert.equal((html.match(/data-truth-row/g) ?? []).length, 3);
  assert.match(html, /<span class="dlcp-truth-number" aria-hidden="true">3\.<\/span>/);
  assert.match(html, /<label class="dlcp-visually-hidden" for="dlcp-setup-truths-3-name">Truth 3 name<\/label>/);
  assert.match(html, /<input id="dlcp-setup-truths-3-name" type="text" data-truth-part="name" value="The dead walk"/);
  assert.match(html, /for="dlcp-setup-truths-2-description">Truth 2 description<\/label>/);
  assert.match(html, /data-truth-part="description"[^>]*>Gates say who you are\.<\/textarea>/);
  for (const label of ["Move truth 1 up", "Move truth 2 down", "Remove truth 3"]) assert.ok(html.includes(`aria-label="${label}"`), label);
  // The first can't go up, the last can't go down
  assert.match(html, /data-op="up" data-index="0"[^>]*disabled/);
  assert.doesNotMatch(html, /data-op="up" data-index="1"[^>]*disabled/);
  assert.match(html, /data-op="down" data-index="2"[^>]*disabled/);
  assert.match(html, /data-action="editTruth" data-op="add"\s*>\s*<i class="fas fa-plus"><\/i> Add a truth<\/button>/);
});

test("the editor keeps limits on what's typed, and escapes it", () => {
  const html = truthsEditorRows([truth('Gold "rules" <here>', "</textarea><b>x</b>")], "p");

  assert.match(html, /maxlength="120"/);
  assert.match(html, /maxlength="1000"/);
  assert.ok(html.includes('value="Gold &quot;rules&quot; &lt;here&gt;"'));
  assert.ok(html.includes("&lt;/textarea&gt;&lt;b&gt;x&lt;/b&gt;</textarea>"));
});

test("with no truths, the editor is just its Add button; with twenty, Add is off", () => {
  const empty = truthsEditorRows([], "p");
  assert.doesNotMatch(empty, /data-truth-row|<ol/);
  assert.match(empty, /Add a truth/);

  const full = truthsEditorRows(
    Array.from({ length: MAX_TRUTHS }, (_, index) => truth(`Truth ${index + 1}`)),
    "p",
  );
  assert.match(full, /data-op="add" disabled/);
  assert.match(full, /That's 20, as many as a campaign can have\./);
});

test("the editor takes truths an older version kept as text", () => {
  assert.match(truthsEditorRows("Gold rules. Even here.\nThe dead walk", "p"), /value="Gold rules\."[\s\S]*>Even here\.<\/textarea>[\s\S]*value="The dead walk"/);
});

test("the truths field has its label, hint and credit around the editor", () => {
  const html = truthsFieldHtml({
    label: "Truths of the setting",
    hint: "About six is plenty: short facts everyone at the table knows.",
    rows: three,
    idPrefix: "dlcp-planner-truths",
    extra: '<p class="dlcp-credit">Learn more</p>',
  });

  assert.match(html, /^<fieldset class="dlcp-truths-field">\s*<legend>Truths of the setting<\/legend>/);
  assert.match(html, /<p class="hint">About six is plenty: short facts everyone at the table knows\.<\/p>/);
  assert.match(html, /<div class="dlcp-truths-editor" data-truths-editor data-id-prefix="dlcp-planner-truths">/);
  assert.match(html, /<p class="dlcp-credit">Learn more<\/p>\s*<\/fieldset>$/);
});

// Just enough of an editor element for reading and changing its rows
function fakeEditor(rows, idPrefix = "p") {
  const editor = {
    dataset: { idPrefix },
    innerHTML: "",
    focused: null,
    querySelectorAll: () =>
      rows.map((row) => ({ querySelector: (selector) => ({ value: selector.includes("name") ? row.name : row.description }) })),
    querySelector: (selector) => ({ focus: () => (editor.focused = selector) }),
  };
  return editor;
}

test("reads the rows as typed, in order", () => {
  assert.deepEqual(readTruthRows(fakeEditor(three)), three);
  assert.deepEqual(readTruthRows(null), []);
});

test("a button redraws only its editor, and moves focus", () => {
  const editor = fakeEditor(three, "dlcp-setup-truths");
  const button = { dataset: { op: "down", index: "0" }, closest: () => editor };

  assert.deepEqual(changeTruthRows(button), [three[1], three[0], three[2]]);
  assert.equal(editor.innerHTML, truthsEditorRows([three[1], three[0], three[2]], "dlcp-setup-truths"));
  assert.equal(editor.focused, '[data-truth-row][data-index="1"] [data-op="down"]');
  assert.equal(changeTruthRows({ dataset: {}, closest: () => null }), null);
});
