import { escapeHtml } from "../render.mjs";
import { MODULE_ID } from "../constants.mjs";

const plural = (count, one, many) => `${count} ${count === 1 ? one : many}`;

/**
 * The Sync button for a campaign that syncs with Dungeon Master Guru, with
 * how many changes are waiting. Empty for a campaign in this world.
 * @param {{ busy?: boolean }} options
 */
export function syncButton(sync, { busy = false } = {}) {
  if (sync.isLocal || !sync.linked) return "";
  const count = sync.pendingCount;
  return `<button type="button" data-action="syncNow" ${busy ? "disabled" : ""}
      data-tooltip="${count ? `Send ${plural(count, "change", "changes")} to Dungeon Master Guru and get its changes` : "Get the changes made on Dungeon Master Guru"}">
      <i class="fas fa-sync${busy ? " fa-spin" : ""}"></i> Sync${count ? ` (${count})` : ""}</button>`;
}

/** A short line on how syncing stands: changes waiting, the last sync, or the last time it couldn't connect */
export function syncStatus(sync) {
  if (sync.isLocal || !sync.linked) return "";
  const time = (at) => new Date(at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const count = sync.pendingCount;
  const parts = [];
  if (count) parts.push(`${plural(count, "change", "changes")} to sync`);
  if (sync.lastSyncProblem) parts.push(`couldn't sync at ${time(sync.lastSyncProblem.at)}`);
  else if (sync.linked.lastSynced) parts.push(`last synced ${time(sync.linked.lastSynced)}`);
  return parts.length ? `<span class="dlcp-muted dlcp-sync-status">${escapeHtml(parts.join(" · "))}</span>` : "";
}

/**
 * Syncs and says how it went. Never throws: when Dungeon Master Guru can't be
 * reached, the changes stay saved here for next time.
 */
export async function syncWithFeedback(sync) {
  if (!sync.token) {
    ui.notifications.info("Connect this browser to Dungeon Master Guru to sync. Your changes are saved in this world.");
    game.modules.get(MODULE_ID).api.openConnect();
    return;
  }
  let result;
  try {
    result = await sync.syncNow();
  } catch (error) {
    console.error(`${MODULE_ID} | Sync failed`, error);
    ui.notifications.error(`Sync failed: ${error.message}. Your changes are saved in this world.`);
    return;
  }
  const waiting = sync.pendingCount;
  if (result.unreachable) {
    ui.notifications.warn(
      `Couldn't sync: Dungeon Master Guru ${result.unreachable}. ${
        waiting ? `${plural(waiting, "change is", "changes are")} saved in this world and will sync next time.` : "Try again later."
      }`,
    );
    return;
  }
  for (const { name, reason } of result.failed) {
    ui.notifications.warn(`Dungeon Master Guru didn't take a change to ${name}: ${reason}. It's still waiting to sync.`);
  }
  if (!result.failed.length) {
    ui.notifications.info(result.sent ? `Synced ${plural(result.sent, "change", "changes")} with Dungeon Master Guru.` : "Synced with Dungeon Master Guru.");
  }
}
