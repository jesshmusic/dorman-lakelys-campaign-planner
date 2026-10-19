import { escapeHtml } from "../render.mjs";
import { MODULE_ID } from "../constants.mjs";
import { recordCount } from "../send.mjs";

/**
 * Asks, then sends this world's campaign to Dungeon Master Guru and says what
 * happened. Used by the Connect window and the Campaign Planner.
 * @returns {Promise<boolean>} true when sent
 */
export async function sendCampaign() {
  const api = game.modules.get(MODULE_ID).api;
  const sync = api.sync;
  if (!sync.isLocal) return false;
  if (!sync.token) {
    ui.notifications.info("Connect to Dungeon Master Guru first, then send the campaign.");
    api.openConnect();
    return false;
  }
  const store = sync.recordLists();
  const name = store.campaign[0]?.name ?? sync.linked.name;
  const confirmed = await foundry.applications.api.DialogV2.confirm({
    window: { title: "Send to Dungeon Master Guru", icon: "fas fa-cloud-arrow-up" },
    position: { width: 480 },
    content: `<p>Send <strong>${escapeHtml(name)}</strong> to Dungeon Master Guru, with its party and all
        ${recordCount(store)} of its threats, quests, NPCs, places, secrets, sessions and book references?</p>
      <p>This world then syncs with it: its journals stay where they are, and changes on either side come across.</p>`,
    yes: { label: "Send", icon: "fas fa-cloud-arrow-up" },
    no: { label: "Cancel" },
  });
  if (!confirmed) return false;

  ui.notifications.info(`Sending ${name} to Dungeon Master Guru…`);
  let result;
  try {
    result = await sync.sendToDmGuru();
  } catch (error) {
    ui.notifications.error(`Couldn't send ${name}: ${error.message}`);
    return false;
  }
  const url = `${sync.baseUrl}${result.campaign.url ?? ""}`;
  await foundry.applications.api.DialogV2.prompt({
    window: { title: "Sent to Dungeon Master Guru", icon: "fas fa-check" },
    position: { width: 480 },
    content: `<p><strong>${escapeHtml(name)}</strong> is on Dungeon Master Guru, and this world syncs with it. Plan it on the
        website or here; the Campaign Dashboard works as before.</p>`,
    ok: {
      label: "Open on Dungeon Master Guru",
      icon: "fas fa-external-link-alt",
      callback: () => window.open(url, "_blank", "noopener,noreferrer"),
    },
    rejectClose: false,
  });
  return true;
}
