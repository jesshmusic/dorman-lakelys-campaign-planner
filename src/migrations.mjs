// Brings the campaigns kept in a world up to date with this version of the
// module. Each campaign's journal folder notes the data version it's at
// (its "dataVersion" flag); when the module is newer, the GM's client runs
// the steps after that version, in order, on load and before a Sync (see
// migrate-world.mjs). A campaign made by this version starts at DATA_VERSION.
//
// To change how the module keeps a campaign's records, or to repair data an
// older version got wrong: add a step at the end with the next version, and
// raise DATA_VERSION to it. A step takes the campaign's records and its
// changes waiting for Sync, and returns them, changed or not. It must be
// safe to run on data that's already right, as a campaign imported from an
// adventure can come with any version. A change the step makes to a synced
// campaign's records that Dungeon Master Guru should have too goes in the
// returned outbox, so the next Sync sends it.
//
// Dungeon Master Guru changes its own data with Rails migrations; when what
// it sends changes shape, a module step converts the records already pulled.
//
// No Foundry globals, so it can be tested in Node.

import { PUSH_TYPES } from "./constants.mjs";
import { ID_FIELDS, pointAtRealIds, queueUpdate, realIds, withRealIds } from "./outbox.mjs";

// A uuid: how a record made in Foundry is known until it's synced
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_NAME = 120;

const mapRecords = (records, fn) =>
  Object.fromEntries(Object.entries(records).map(([collection, list]) => [collection, list.map((r) => fn(r, collection))]));

/**
 * A record (or a change's attributes) without its pointers at records `gone`
 * says are gone: those ids are cleared, and links to them removed. The same
 * object when nothing points at one.
 */
function withoutPointers(attributes, gone) {
  if (!attributes) return attributes;
  const changed = {};
  for (const field of ID_FIELDS) if (field in attributes && gone(attributes[field])) changed[field] = null;
  const links = Array.isArray(attributes.links) ? attributes.links : null;
  if (links?.some((link) => gone(link.linkableId))) changed.links = links.filter((link) => !gone(link.linkableId));
  if (attributes.revealedSessionUuid && gone(attributes.revealedSessionUuid)) changed.revealedSessionUuid = null;
  return Object.keys(changed).length ? { ...attributes, ...changed } : attributes;
}

/**
 * Version 1: records and changes waiting for Sync point at the ids Dungeon
 * Master Guru gave records made in Foundry, not at their stand-in ids, and
 * nothing points at a record made in Foundry that's since been deleted.
 * Before 1.3.1, Sync only knew the real ids it was given during that Sync,
 * so a quest that linked to book references sent in an earlier Sync (or
 * an encounter of a quest that wasn't sent yet) could never be sent.
 */
function pointAtRealRecords({ records, outbox }) {
  const ids = realIds(Object.values(records).flat());
  const pointed = mapRecords(records, (record) => pointAtRealIds(record, ids));
  const known = new Set(Object.values(pointed).flatMap((list) => list.flatMap((r) => [String(r.id), r.uuid])));
  // Only stand-in ids can be checked: a real id may be a record that isn't pulled yet
  const gone = (id) => id !== null && id !== undefined && UUID.test(String(id)) && !known.has(String(id));
  return {
    records: mapRecords(pointed, (record) => withoutPointers(record, gone)),
    outbox: outbox.map((queued) => {
      const change = withRealIds(queued, ids);
      return change.attributes ? { ...change, attributes: withoutPointers(change.attributes, gone) } : change;
    }),
  };
}

/**
 * Version 2: a book reference made from an actor has the actor's name, so
 * one renamed before 1.3.1 (when references started following their actor)
 * catches up. A synced campaign's renames wait for Sync.
 */
function referencesTakeActorNames({ records, outbox }, { actorName = () => null } = {}) {
  const synced = !records.campaign?.[0]?.local;
  let queued = outbox;
  const references = (records.references ?? []).map((reference) => {
    const name = reference.foundryUuid ? actorName(reference.foundryUuid)?.trim().slice(0, MAX_NAME) : null;
    if (!name || name === reference.name) return reference;
    if (synced) {
      queued = queueUpdate(queued, {
        collection: "references",
        type: PUSH_TYPES.references,
        uuid: reference.uuid,
        baseVersion: reference.syncVersion,
        before: { name: reference.name },
        attributes: { name },
      });
    }
    return { ...reference, name };
  });
  return { records: { ...records, ...(records.references ? { references } : {}) }, outbox: queued };
}

/** The steps, oldest first. Add new ones at the end. */
export const MIGRATIONS = [
  { version: 1, name: "Point at real ids", migrate: pointAtRealRecords },
  { version: 2, name: "Book references take their actor's name", migrate: referencesTakeActorNames },
];

/** The data version this version of the module keeps campaigns in */
export const DATA_VERSION = MIGRATIONS.at(-1).version;

/**
 * A campaign's data brought up to DATA_VERSION.
 * @param {{ records: Record<string, object[]>, outbox: object[] }} data
 *   records: by collection, the campaign itself as `campaign: [record]`
 * @param {number} from the version the data is at (0 for a campaign from before versions)
 * @param {{ actorName?: (uuid: string) => string|null }} context what a step needs from Foundry
 * @returns {{ records: Record<string, object[]>, outbox: object[], version: number, ran: string[] }}
 */
export function migrateCampaign(data, from, context = {}) {
  let current = { records: data.records, outbox: data.outbox ?? [] };
  const ran = [];
  for (const step of MIGRATIONS) {
    if (step.version <= from) continue;
    current = step.migrate(current, context);
    ran.push(step.name);
  }
  return { ...current, version: Math.max(from, DATA_VERSION), ran };
}
