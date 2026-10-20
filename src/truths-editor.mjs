// The list editor for a campaign's truths, in the New campaign guide and the
// Campaign Planner's brief: a numbered row for each truth, with its name and
// description and buttons to move or remove it, and a button to add another.
// Buttons use the "editTruth" action, with data-op "add", "up", "down" or
// "remove" and the row's data-index. No Foundry globals, so it can be tested
// in Node; the functions that take an element only use that element.

import { escapeHtml } from "./render.mjs";
import { MAX_TRUTHS, MAX_TRUTH_DESCRIPTION, MAX_TRUTH_NAME, truthRows } from "./setup.mjs";

const OPS = ["add", "up", "down", "remove"];

// A button that adds, moves or removes a row
const opButton = (op, index, icon, label, tooltip, disabled = false) =>
  `<button type="button" class="dlcp-icon-button" data-action="editTruth" data-op="${op}" data-index="${index}"
    aria-label="${escapeHtml(label)}" data-tooltip="${escapeHtml(tooltip)}" ${disabled ? "disabled" : ""}><i class="fas fa-${icon}"></i></button>`;

/**
 * The editor's rows and its Add button, to go inside the editor's element.
 * @param {object[]} rows the truths as the GM has them, blank rows too
 * @param {string} idPrefix keeps the inputs' ids apart from other forms
 */
export function truthsEditorRows(rows, idPrefix) {
  const list = truthRows(rows);
  const items = list.map(({ name, description }, index) => {
    const number = index + 1;
    const id = `${idPrefix}-${number}`;
    return `<li class="dlcp-truth-row" data-truth-row data-index="${index}">
      <span class="dlcp-truth-number" aria-hidden="true">${number}.</span>
      <div class="dlcp-truth-fields">
        <label class="dlcp-visually-hidden" for="${escapeHtml(id)}-name">Truth ${number} name</label>
        <input id="${escapeHtml(id)}-name" type="text" data-truth-part="name" value="${escapeHtml(name)}"
          maxlength="${MAX_TRUTH_NAME}" placeholder="A short fact, e.g. Greyhawk runs on gold.">
        <label class="dlcp-visually-hidden" for="${escapeHtml(id)}-description">Truth ${number} description</label>
        <textarea id="${escapeHtml(id)}-description" data-truth-part="description" rows="2"
          maxlength="${MAX_TRUTH_DESCRIPTION}" placeholder="What it means at the table (optional)">${escapeHtml(description)}</textarea>
      </div>
      <span class="dlcp-truth-buttons">
        ${opButton("up", index, "arrow-up", `Move truth ${number} up`, "Move up", index === 0)}
        ${opButton("down", index, "arrow-down", `Move truth ${number} down`, "Move down", index === list.length - 1)}
        ${opButton("remove", index, "trash", `Remove truth ${number}`, "Remove")}
      </span>
    </li>`;
  });
  const full = list.length >= MAX_TRUTHS;
  return `${items.length ? `<ol class="dlcp-truth-rows">${items.join("")}</ol>` : ""}
    <button type="button" class="dlcp-add" data-action="editTruth" data-op="add" ${full ? "disabled" : ""}>
      <i class="fas fa-plus"></i> Add a truth</button>
    ${full ? `<p class="hint">That's ${MAX_TRUTHS}, as many as a campaign can have.</p>` : ""}`;
}

/**
 * The truths editor, with its label and hint: a group of rows the GM builds
 * like a to-do list.
 * @param {{ label: string, hint?: string, rows: object[], idPrefix: string, extra?: string }} options
 *   extra: markup that's already safe, shown under the editor (a credit, say)
 */
export function truthsFieldHtml({ label, hint = "", rows, idPrefix, extra = "" }) {
  return `<fieldset class="dlcp-truths-field">
    <legend>${escapeHtml(label)}</legend>
    ${hint ? `<p class="hint">${escapeHtml(hint)}</p>` : ""}
    <div class="dlcp-truths-editor" data-truths-editor data-id-prefix="${escapeHtml(idPrefix)}">${truthsEditorRows(rows, idPrefix)}</div>
    ${extra}
  </fieldset>`;
}

/**
 * The rows after adding, moving or removing one, and what to focus next: a
 * new row's name, the moved row's button (its other one once it reaches the
 * end), or after a removal the row that took its place, or Add.
 * @param {object[]} rows
 * @param {"add"|"up"|"down"|"remove"} op
 * @param {number} index the row it's done to
 * @returns {{ rows: object[], focus: { index?: number, target: "name"|"up"|"down"|"add" }|null }}
 */
export function editTruths(rows, op, index) {
  const next = truthRows(rows);
  const inRange = Number.isInteger(index) && index >= 0 && index < next.length;
  if (op === "add") {
    if (next.length >= MAX_TRUTHS) return { rows: next, focus: { target: "add" } };
    next.push({ name: "", description: "" });
    return { rows: next, focus: { index: next.length - 1, target: "name" } };
  }
  if (!OPS.includes(op) || !inRange) return { rows: next, focus: null };
  if (op === "remove") {
    next.splice(index, 1);
    return {
      rows: next,
      focus: next.length ? { index: Math.min(index, next.length - 1), target: "name" } : { target: "add" },
    };
  }
  const to = op === "up" ? index - 1 : index + 1;
  if (to < 0 || to >= next.length) return { rows: next, focus: null };
  [next[index], next[to]] = [next[to], next[index]];
  // Its button is disabled once it reaches the end, so its other one takes focus
  const atEnd = op === "up" ? to === 0 : to === next.length - 1;
  return { rows: next, focus: { index: to, target: atEnd ? (op === "up" ? "down" : "up") : op } };
}

/** The element to focus after a change (see editTruths), as a selector inside the editor */
export function truthFocusSelector(focus) {
  if (!focus) return null;
  if (focus.target === "add") return '[data-op="add"]';
  const row = `[data-truth-row][data-index="${focus.index}"]`;
  return focus.target === "name" ? `${row} [data-truth-part="name"]` : `${row} [data-op="${focus.target}"]`;
}

/** The rows as typed in an editor (the element with data-truths-editor) */
export function readTruthRows(editor) {
  return [...(editor?.querySelectorAll("[data-truth-row]") ?? [])].map((row) => ({
    name: row.querySelector('[data-truth-part="name"]')?.value ?? "",
    description: row.querySelector('[data-truth-part="description"]')?.value ?? "",
  }));
}

/**
 * Adds, moves or removes a row of an editor on the page, from one of its
 * buttons. Only the editor is redrawn, so what's typed elsewhere in the form
 * stays, and focus moves to where the GM expects it. Returns the rows now.
 * @param {HTMLElement} button the button clicked (data-op, data-index)
 */
export function changeTruthRows(button) {
  const editor = button.closest("[data-truths-editor]");
  if (!editor) return null;
  const { rows, focus } = editTruths(readTruthRows(editor), button.dataset.op, Number(button.dataset.index));
  editor.innerHTML = truthsEditorRows(rows, editor.dataset.idPrefix);
  const selector = truthFocusSelector(focus);
  if (selector) editor.querySelector(selector)?.focus();
  return rows;
}
