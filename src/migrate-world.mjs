// Runs the data migrations (see migrations.mjs) on the campaigns kept in
// this world: each campaign's journal folder, with its records on its pages
// and its changes waiting for Sync on the folder. Only the active GM changes
// anything, so two GMs don't migrate the same folder at once.

import { MODULE_ID, MODULE_TITLE } from "./constants.mjs";
import { DATA_VERSION, migrateCampaign } from "./migrations.mjs";

const flag = (document, key) => document.getFlag(MODULE_ID, key);
const ACTOR_UUID = /(^|\.)Actor\.[A-Za-z0-9]{16}$/;
// Folders being migrated, so the same one isn't done twice at once
const running = new Map();

/** The data version a campaign's folder is at: 0 for one from before versions */
export const folderVersion = (folder) => flag(folder, "dataVersion") ?? 0;

/** The flags a new campaign folder starts with: it's already at this version */
export const newFolderFlags = (campaignUuid) => ({ campaignUuid, dataVersion: DATA_VERSION });

// A world or compendium actor's name, or null when it isn't there
function actorName(uuid) {
  if (!ACTOR_UUID.test(uuid ?? "")) return null;
  try {
    return fromUuidSync(uuid)?.name ?? null;
  } catch {
    return null;
  }
}

async function migrate(folder) {
  const from = folderVersion(folder);
  if (from >= DATA_VERSION || !game.user.isActiveGM) return [];

  const pages = game.journal
    .filter((entry) => entry.folder?.id === folder.id)
    .flatMap((entry) => entry.pages.contents.map((page) => ({ entry, page })))
    .filter(({ page }) => flag(page, "collection") && flag(page, "record"));
  const records = {};
  for (const { page } of pages) (records[flag(page, "collection")] ??= []).push(flag(page, "record"));
  const outbox = flag(folder, "outbox") ?? [];

  const migrated = migrateCampaign({ records, outbox }, from, { actorName });

  // Save the records that changed. Their pages' text is written again when
  // the campaign is next shown (see CampaignSync#rewritePages).
  const byUuid = new Map(Object.values(migrated.records).flat().map((record) => [record.uuid, record]));
  const updates = new Map();
  for (const { entry, page } of pages) {
    const before = flag(page, "record");
    const after = byUuid.get(before.uuid);
    if (!after || JSON.stringify(after) === JSON.stringify(before)) continue;
    if (!updates.has(entry)) updates.set(entry, []);
    updates.get(entry).push({
      _id: page.id,
      [`flags.${MODULE_ID}.record`]: foundry.data.operators.ForcedReplacement.create(after),
    });
  }
  for (const [entry, changes] of updates) await entry.updateEmbeddedDocuments("JournalEntryPage", changes);
  if (JSON.stringify(migrated.outbox) !== JSON.stringify(outbox)) await folder.setFlag(MODULE_ID, "outbox", migrated.outbox);
  await folder.setFlag(MODULE_ID, "dataVersion", migrated.version);
  console.log(`${MODULE_TITLE} | Brought "${folder.name}" up to date: ${migrated.ran.join(", ")}`);
  return migrated.ran;
}

/**
 * Brings one campaign's folder up to this version's data.
 * @returns {Promise<string[]>} the names of the steps that ran
 */
export function migrateFolder(folder) {
  if (!folder) return Promise.resolve([]);
  if (!running.has(folder.id)) running.set(folder.id, migrate(folder).finally(() => running.delete(folder.id)));
  return running.get(folder.id);
}

/**
 * Brings every campaign kept in this world up to this version's data.
 * @returns {Promise<string[]>} the ids of the folders that changed
 */
export async function migrateWorld() {
  const folders = game.folders.filter((folder) => folder.type === "JournalEntry" && flag(folder, "campaignUuid"));
  const migrated = [];
  for (const folder of folders) {
    try {
      if ((await migrateFolder(folder)).length) migrated.push(folder.id);
    } catch (error) {
      // It stays at its version, so the steps run again next time
      console.error(`${MODULE_TITLE} | Could not bring "${folder.name}" up to date`, error);
    }
  }
  return migrated;
}
