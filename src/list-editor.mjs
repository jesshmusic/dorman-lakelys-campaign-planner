// A list the GM builds a row at a time, like a to-do list, for fields that
// hold a few short lines: a threat's grim portents and stakes, a place's
// features, a session's potential scenes. Each row has its own box and
// buttons to move or remove it, with a button to add another.
//
// The rows are mirrored into a hidden textarea with the field's name, one
// line per row, so the forms that read these fields read them as before.
// One listener on the page (watchListEditors) runs the buttons wherever an
// editor is drawn: planner windows, dialogs and the Dashboard. No Foundry
// globals, so it can be tested in Node.

import { escapeHtml } from "./render.mjs";

const OPS = ["add", "up", "down", "remove"];
const MAX_LENGTH = 300;

/** The rows from a field's value: an array of lines, or text with one per line */
export function listRows(value) {
  if (Array.isArray(value)) return value.map((item) => String(item ?? ""));
  if (value === null || value === undefined || value === "") return [];
  return String(value).split("\n");
}

/** The value a form reads: the rows that have something in them, one per line */
export const listText = (rows) =>
  rows
    .map((row) => String(row ?? "").trim())
    .filter(Boolean)
    .join("\n");

const opButton = (op, index, icon, label, tooltip, disabled = false) =>
  `<button type="button" class="dlcp-icon-button" data-list-op="${op}" data-index="${index}"
    aria-label="${escapeHtml(label)}" data-tooltip="${escapeHtml(tooltip)}" ${disabled ? "disabled" : ""}><i class="fas fa-${icon}"></i></button>`;

/**
 * The editor's rows, its Add button and its hidden field.
 * @param {string[]} rows the rows as the GM has them, blank ones too
 * @param {{ name: string, noun: string, max: number, idPrefix: string, placeholder?: string }} options
 *   noun: what one row is, for labels ("portent" → "Portent 2", "Add a portent")
 */
export function listEditorRows(rows, { name, noun, max, idPrefix, placeholder = "" }) {
  const Noun = noun.charAt(0).toUpperCase() + noun.slice(1);
  const items = rows.map((value, index) => {
    const number = index + 1;
    const id = `${idPrefix}-${name}-${number}`;
    return `<li class="dlcp-list-row" data-list-row data-index="${index}">
      <span class="dlcp-list-number" aria-hidden="true">${number}.</span>
      <label class="dlcp-visually-hidden" for="${escapeHtml(id)}">${escapeHtml(Noun)} ${number}</label>
      <input id="${escapeHtml(id)}" type="text" data-list-item value="${escapeHtml(value)}" maxlength="${MAX_LENGTH}"
        placeholder="${escapeHtml(placeholder)}">
      <span class="dlcp-list-buttons">
        ${opButton("up", index, "arrow-up", `Move ${noun} ${number} up`, "Move up", index === 0)}
        ${opButton("down", index, "arrow-down", `Move ${noun} ${number} down`, "Move down", index === rows.length - 1)}
        ${opButton("remove", index, "trash", `Remove ${noun} ${number}`, "Remove")}
      </span>
    </li>`;
  });
  const full = rows.length >= max;
  const article = /^[aeiou]/i.test(noun) ? "an" : "a";
  return `${items.length ? `<ol class="dlcp-list-rows">${items.join("")}</ol>` : ""}
    <button type="button" class="dlcp-add" data-list-op="add" ${full ? "disabled" : ""}><i class="fas fa-plus"></i> Add ${article} ${escapeHtml(noun)}</button>
    ${full ? `<p class="hint">That's ${max}, as many as this can have.</p>` : ""}
    <textarea name="${escapeHtml(name)}" hidden data-list-value>${escapeHtml(listText(rows))}</textarea>`;
}

/**
 * The whole field: a labelled group with the rows.
 * @param {{ name: string, label: string, hint?: string, value: string[]|string, noun: string, max: number, idPrefix: string, placeholder?: string, extra?: string }} options
 *   extra: markup that's already safe, shown under the editor (a credit, say)
 */
export function listFieldHtml({ name, label, hint = "", value, noun, max, idPrefix, placeholder = "", extra = "" }) {
  return `<fieldset class="dlcp-list-field">
    <legend>${escapeHtml(label)}</legend>
    ${hint ? `<p class="hint">${escapeHtml(hint)}</p>` : ""}
    ${listEditorHtml({ name, value, noun, max, idPrefix, placeholder })}
    ${extra}
  </fieldset>`;
}

/** Just the editor, for a place that already has its own heading (session prep's steps) */
export function listEditorHtml({ name, value, noun, max, idPrefix, placeholder = "" }) {
  const options = { name, noun, max, idPrefix, placeholder };
  return `<div class="dlcp-list-editor" data-list-editor data-name="${escapeHtml(name)}" data-noun="${escapeHtml(noun)}"
      data-max="${max}" data-id-prefix="${escapeHtml(idPrefix)}" data-placeholder="${escapeHtml(placeholder)}">
      ${listEditorRows(listRows(value), options)}
    </div>`;
}

/**
 * The rows after adding, moving or removing one, and what to focus next: a
 * new row, the moved row's button (its other one once it reaches the end),
 * or after a removal the row that took its place, or Add.
 * @returns {{ rows: string[], focus: { index?: number, target: "item"|"up"|"down"|"add" }|null }}
 */
export function editList(rows, op, index, max) {
  const next = [...rows];
  const inRange = Number.isInteger(index) && index >= 0 && index < next.length;
  if (op === "add") {
    if (next.length >= max) return { rows: next, focus: { target: "add" } };
    next.push("");
    return { rows: next, focus: { index: next.length - 1, target: "item" } };
  }
  if (!OPS.includes(op) || !inRange) return { rows: next, focus: null };
  if (op === "remove") {
    next.splice(index, 1);
    return {
      rows: next,
      focus: next.length ? { index: Math.min(index, next.length - 1), target: "item" } : { target: "add" },
    };
  }
  const to = op === "up" ? index - 1 : index + 1;
  if (to < 0 || to >= next.length) return { rows: next, focus: null };
  [next[index], next[to]] = [next[to], next[index]];
  const atEnd = op === "up" ? to === 0 : to === next.length - 1;
  return { rows: next, focus: { index: to, target: atEnd ? (op === "up" ? "down" : "up") : op } };
}

/** The element to focus after a change, as a selector inside the editor */
export function listFocusSelector(focus) {
  if (!focus) return null;
  if (focus.target === "add") return '[data-list-op="add"]';
  const row = `[data-list-row][data-index="${focus.index}"]`;
  return focus.target === "item" ? `${row} [data-list-item]` : `${row} [data-list-op="${focus.target}"]`;
}

/** The rows as typed in an editor (the element with data-list-editor) */
export const readListRows = (editor) =>
  [...(editor?.querySelectorAll("[data-list-item]") ?? [])].map((input) => input.value ?? "");

const optionsOf = (editor) => ({
  name: editor.dataset.name,
  noun: editor.dataset.noun,
  max: Number(editor.dataset.max) || 20,
  idPrefix: editor.dataset.idPrefix,
  placeholder: editor.dataset.placeholder ?? "",
});

/** Copies the rows into the editor's hidden field, after typing */
export function syncListValue(editor) {
  const field = editor?.querySelector("[data-list-value]");
  if (field) field.value = listText(readListRows(editor));
}

/**
 * Adds, moves or removes a row from one of the editor's buttons. Only the
 * editor is redrawn, so what's typed elsewhere in the form stays.
 * @param {HTMLElement} button the button clicked (data-list-op, data-index)
 * @returns {string[]|null} the rows now
 */
export function changeListRows(button) {
  const editor = button.closest("[data-list-editor]");
  if (!editor) return null;
  const options = optionsOf(editor);
  const { rows, focus } = editList(readListRows(editor), button.dataset.listOp, Number(button.dataset.index), options.max);
  editor.innerHTML = listEditorRows(rows, options);
  const selector = listFocusSelector(focus);
  if (selector) editor.querySelector(selector)?.focus();
  return rows;
}

/**
 * Runs every list editor on the page: its buttons, and keeping its hidden
 * field in step as the GM types. Call once.
 * @param {Document|HTMLElement} root
 */
export function watchListEditors(root) {
  root.addEventListener("click", (event) => {
    const button = event.target.closest?.("[data-list-editor] [data-list-op]");
    if (!button) return;
    event.preventDefault();
    changeListRows(button);
  });
  root.addEventListener("input", (event) => {
    if (!event.target.matches?.("[data-list-editor] [data-list-item]")) return;
    syncListValue(event.target.closest("[data-list-editor]"));
  });
}
