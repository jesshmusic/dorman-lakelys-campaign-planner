// Sending a campaign that lives in this world to Dungeon Master Guru
// (POST /v1/foundry/campaigns/import). No Foundry globals, so it can be
// tested in Node.

import { normalizeTruths } from "./setup.mjs";

// What gets sent, in the same shapes Dungeon Master Guru sends back. Each
// record keeps its id, so Dungeon Master Guru can keep the references between
// them (an NPC's faction, a session's linked secrets) and return the new ids.
export const SENT_COLLECTIONS = ["factions", "references", "locations", "npcs", "fronts", "quests", "sessions", "secrets"];

// Kept only in Foundry
const LOCAL_ONLY = ["uuid", "syncVersion", "local", "template", "partyActorUuids", "displayTitle", "citation"];

const strip = (record) =>
  Object.fromEntries(Object.entries(record).filter(([key]) => !LOCAL_ONLY.includes(key)));

/**
 * One id per campaign, so sending it again (say after a timeout) returns the
 * campaign Dungeon Master Guru already made instead of a second copy.
 */
export const sendRequestId = (campaign) => `send-${campaign.uuid}`.slice(0, 64);

/**
 * The import request for a campaign that lives in this world.
 * @param {{ campaign: object, store: Record<string, object[]>, world: { id: string, title: string }, characters?: object[] }} options
 *   store: the campaign's records by collection; characters: the party's sheets
 */
export function importPayload({ campaign, store, world, characters = [] }) {
  if (!campaign?.name) throw new Error("The campaign needs a name before it can be sent.");
  const records = Object.fromEntries(
    SENT_COLLECTIONS.map((collection) => [collection, (store[collection] ?? []).map(strip)]),
  );
  return {
    request_id: sendRequestId(campaign),
    // Truths an older version kept as text go as { name, description }, like the rest
    campaign: { ...strip(campaign), truths: normalizeTruths(campaign.truths) },
    records,
    ...(characters.length ? { party: { world, characters } } : {}),
  };
}

/** How many records a campaign will send, for the confirmation: "12 records" */
export const recordCount = (store) =>
  SENT_COLLECTIONS.reduce((total, collection) => total + (store[collection]?.length ?? 0), 0);
