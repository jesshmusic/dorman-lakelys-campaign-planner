// Character levels, picked from a dropdown of 1 to 20 wherever a form asks
// for one: a campaign's starting and target level, a quest's levels, a
// session's party level. No Foundry globals, so it can be tested in Node.

import { escapeHtml } from "./render.mjs";

export const MIN_LEVEL = 1;
export const MAX_LEVEL = 20;

/**
 * A level dropdown's choices as [value, label], 1 to 20.
 * @param {string} [blank] a label for no level, offered first ("Any", "Not set")
 */
export function levelOptions(blank) {
  const levels = Array.from({ length: MAX_LEVEL - MIN_LEVEL + 1 }, (_, i) => String(MIN_LEVEL + i));
  return [...(blank === undefined ? [] : [["", blank]]), ...levels.map((level) => [level, level])];
}

/** A dropdown's <option>s, with the one for `value` chosen */
export const optionsHtml = (options, value) =>
  options
    .map(
      ([option, label]) =>
        `<option value="${escapeHtml(option)}" ${String(value ?? "") === option ? "selected" : ""}>${escapeHtml(label)}</option>`,
    )
    .join("");

/**
 * A level dropdown.
 * @param {{ id: string, name: string, value: number|string|null, blank?: string, attributes?: string }} options
 *   attributes: more attributes for the <select>, already safe (data-field="…", say)
 */
export const levelSelectHtml = ({ id, name, value, blank, attributes = "" }) =>
  `<select id="${escapeHtml(id)}" ${name ? `name="${escapeHtml(name)}"` : ""} ${attributes}>${optionsHtml(levelOptions(blank), value)}</select>`;
