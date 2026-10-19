// Field-level three-way merge for changes made in Foundry that conflict with
// changes made on Dungeon Master Guru. No Foundry globals.

const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/**
 * Decides what to do with a local change after the server reported a conflict.
 *
 * @param {object} base   the record as last synced (what the local change started from)
 * @param {object} mine   the attributes the DM changed in Foundry
 * @param {object} theirs the record as it is now on Dungeon Master Guru
 * @returns {{ retry: object, clashes: string[] }}
 *   retry   - attributes still worth sending (the server didn't touch them, or
 *             already has the same value is skipped)
 *   clashes - attributes both sides changed to different values; the DM decides
 */
export function mergeChange(base, mine, theirs) {
  const retry = {};
  const clashes = [];
  for (const [key, value] of Object.entries(mine)) {
    if (same(theirs[key], value)) continue; // both sides agree already
    if (same(theirs[key], base[key])) retry[key] = value; // only Foundry changed it
    else clashes.push(key); // both changed it, differently
  }
  return { retry, clashes };
}
