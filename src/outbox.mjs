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
export const ID_FIELDS = ["parentId", "factionId", "npcId", "giverNpcId", "locationId", "statBlockReferenceId", "questId"];

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
 * The real ids of records made in Foundry that Dungeon Master Guru has
 * already been sent. Such a record keeps its uuid, which was its stand-in id,
 * and gets the id Dungeon Master Guru gave it. A record still waiting to be
 * sent has its uuid as its id, so it isn't here.
 * @param {Iterable<{ id: string|number, uuid: string }>} records
 * @returns {Record<string, string>} stand-in id -> real id
 */
export function realIds(records) {
  const ids = {};
  for (const record of records) {
    if (record?.uuid && record.id !== null && record.id !== undefined && String(record.id) !== record.uuid) {
      ids[record.uuid] = String(record.id);
    }
  }
  return ids;
}

/**
 * A record (or a change's attributes) pointing at real ids instead of
 * stand-in ones. The same object when nothing points at a stand-in.
 * @param {Record<string, string>} ids stand-in id -> real id
 */
export function pointAtRealIds(attributes, ids) {
  if (!attributes) return attributes;
  const real = (id) => (id !== null && id !== undefined && ids[String(id)] !== undefined ? ids[String(id)] : id);
  const changed = {};
  for (const field of ID_FIELDS) {
    if (field in attributes && real(attributes[field]) !== attributes[field]) changed[field] = real(attributes[field]);
  }
  const links = Array.isArray(attributes.links) ? attributes.links : null;
  if (links?.some((link) => real(link.linkableId) !== link.linkableId)) {
    changed.links = links.map((link) => ({ ...link, linkableId: String(real(link.linkableId)) }));
  }
  // What an NPC's page shows for its stat block
  const statBlock = attributes.statBlockReference;
  if (statBlock?.id !== undefined && real(statBlock.id) !== statBlock.id) {
    changed.statBlockReference = { ...statBlock, id: real(statBlock.id) };
  }
  return Object.keys(changed).length ? { ...attributes, ...changed } : attributes;
}

/**
 * A queued change with stand-in ids replaced by the ids Dungeon Master Guru
 * gave those records when their creates were sent.
 * @param {Record<string, string>} ids stand-in id -> real id
 */
export function withRealIds(change, ids) {
  return {
    ...change,
    ...(change.attributes ? { attributes: pointAtRealIds(change.attributes, ids) } : {}),
    ...(change.base ? { base: pointAtRealIds(change.base, ids) } : {}),
  };
}

/** The ids (and session uuids) of the other records a queued change points at */
export function pointsAt(change) {
  const attributes = change.attributes ?? {};
  const ids = ID_FIELDS.filter((field) => attributes[field] !== null && attributes[field] !== undefined).map((field) =>
    String(attributes[field]),
  );
  for (const link of Array.isArray(attributes.links) ? attributes.links : []) ids.push(String(link.linkableId));
  if (attributes.revealedSessionUuid) ids.push(String(attributes.revealedSessionUuid));
  return ids;
}

/**
 * The queue in the order to send it: as queued, except that a change waits
 * for the records made in Foundry that it points at. A quest goes after the
 * book references it links to, and before its encounters.
 */
export function sendOrder(outbox) {
  const waiting = [...outbox];
  const ordered = [];
  while (waiting.length) {
    const creating = new Set(waiting.filter((change) => change.op === "create").map((change) => change.uuid));
    const ready = waiting.findIndex((change) => pointsAt(change).every((id) => id === change.uuid || !creating.has(id)));
    // Records that point at each other can't both wait: send the first as queued
    ordered.push(...waiting.splice(ready === -1 ? 0 : ready, 1));
  }
  return ordered;
}

/** What to send to the push endpoint for a queued change */
export function pushPayload(change) {
  if (change.op === "delete") return { op: "delete", type: change.type, uuid: change.uuid };
  if (change.op === "create") return { op: "create", type: change.type, uuid: change.uuid, attributes: change.attributes };
  return { type: change.type, uuid: change.uuid, baseVersion: change.baseVersion, attributes: change.attributes };
}
