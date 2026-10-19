// Changes to a Dungeon Master Guru campaign made in Foundry, kept until the
// GM clicks Sync. Each change is saved to the world's journals right away and
// queued here; Sync sends the queue in order, then pulls. No Foundry globals,
// so it can be tested in Node.
//
// A queued change is one of:
//   { op: "create", collection, type, uuid, attributes }
//   { op: "update", collection, type, uuid, baseVersion, base, attributes }
//     base: each changed field as it was before the first edit, for the
//     three-way merge when the record also changed on Dungeon Master Guru
//   { op: "delete", collection, type, uuid }
// Attributes are in the form the sync sends (see editing.mjs).

// Fields that hold another record's id. A record made in Foundry has a
// stand-in id (its uuid) until Dungeon Master Guru gives it a real one.
export const ID_FIELDS = ["parentId", "factionId", "npcId", "giverNpcId", "locationId", "statBlockReferenceId"];

const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** Queues a record made in Foundry */
export function queueCreate(outbox, { collection, type, uuid, attributes }) {
  return [...outbox, { op: "create", collection, type, uuid, attributes: { ...attributes } }];
}

/**
 * Queues an edit. Edits to the same record join one change: the newest value
 * of each field wins, and the base keeps each field's value from before the
 * first edit. A field changed back to where it started drops out, and so
 * does a change left with nothing in it. An edit to a record made in Foundry
 * and not yet synced joins its create.
 * @param {{ collection: string, type: string, uuid: string, baseVersion: number, before: object, attributes: object }} edit
 *   before: the changed fields' values before this edit
 */
export function queueUpdate(outbox, { collection, type, uuid, baseVersion, before, attributes }) {
  if (outbox.some((change) => change.uuid === uuid && change.op === "delete")) return outbox;
  const index = outbox.findIndex((change) => change.uuid === uuid && change.op !== "delete");
  if (index === -1) {
    const change = { op: "update", collection, type, uuid, baseVersion, base: {}, attributes: {} };
    for (const [key, value] of Object.entries(attributes)) {
      if (same(value, before[key])) continue;
      change.base[key] = before[key] ?? null;
      change.attributes[key] = value;
    }
    return Object.keys(change.attributes).length ? [...outbox, change] : outbox;
  }

  const existing = outbox[index];
  if (existing.op === "create") {
    const updated = { ...existing, attributes: { ...existing.attributes, ...attributes } };
    return outbox.map((change, i) => (i === index ? updated : change));
  }
  const base = { ...existing.base };
  const merged = { ...existing.attributes };
  for (const [key, value] of Object.entries(attributes)) {
    if (!(key in base)) base[key] = before[key] ?? null;
    if (same(value, base[key])) {
      delete merged[key];
      delete base[key];
    } else {
      merged[key] = value;
    }
  }
  if (!Object.keys(merged).length) return outbox.filter((_, i) => i !== index);
  return outbox.map((change, i) => (i === index ? { ...existing, base, attributes: merged } : change));
}

/**
 * Queues a deletion. A record made in Foundry and never synced just drops
 * out of the queue; otherwise its queued edits go and the delete is queued.
 */
export function queueDelete(outbox, { collection, type, uuid }) {
  const created = outbox.some((change) => change.uuid === uuid && change.op === "create");
  const rest = outbox.filter((change) => change.uuid !== uuid);
  return created ? rest : [...rest, { op: "delete", collection, type, uuid }];
}

/** How many records have changes waiting to sync */
export const pendingCount = (outbox) => new Set((outbox ?? []).map((change) => change.uuid)).size;

/** The uuids with a queued change, by kind: { created, updated, deleted } as Sets */
export function pendingUuids(outbox) {
  const sets = { created: new Set(), updated: new Set(), deleted: new Set() };
  const names = { create: "created", update: "updated", delete: "deleted" };
  for (const change of outbox ?? []) sets[names[change.op]]?.add(change.uuid);
  return sets;
}

/**
 * A queued change with stand-in ids replaced by the ids Dungeon Master Guru
 * gave those records when their creates were sent.
 * @param {Record<string, string>} ids stand-in id -> real id
 */
export function withRealIds(change, ids) {
  const real = (id) => (id !== null && id !== undefined && ids[String(id)] !== undefined ? ids[String(id)] : id);
  const remap = (attributes = {}) => {
    const out = { ...attributes };
    for (const field of ID_FIELDS) if (field in out) out[field] = real(out[field]);
    if (Array.isArray(out.links)) out.links = out.links.map((link) => ({ ...link, linkableId: String(real(link.linkableId)) }));
    return out;
  };
  return {
    ...change,
    ...(change.attributes ? { attributes: remap(change.attributes) } : {}),
    ...(change.base ? { base: remap(change.base) } : {}),
  };
}

/** What to send to the push endpoint for a queued change */
export function pushPayload(change) {
  if (change.op === "delete") return { op: "delete", type: change.type, uuid: change.uuid };
  if (change.op === "create") return { op: "create", type: change.type, uuid: change.uuid, attributes: change.attributes };
  return { type: change.type, uuid: change.uuid, baseVersion: change.baseVersion, attributes: change.attributes };
}
