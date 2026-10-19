import { escapeHtml } from "../render.mjs";
import { MODULE_ID } from "../constants.mjs";

/**
 * Asks which campaign this world should use: one that lives in this world,
 * or (when connected) one on Dungeon Master Guru. Opens the Dashboard on it.
 */
export async function openCampaignPicker() {
  const api = game.modules.get(MODULE_ID).api;
  const sync = api.sync;
  const current = sync.linked?.uuid;
  const local = sync.localCampaigns();

  let remote = [];
  let remoteNote = "";
  if (!sync.token) {
    remoteNote = "Connect to Dungeon Master Guru to open campaigns you've planned there.";
  } else {
    try {
      remote = await sync.api().campaigns();
    } catch (error) {
      remoteNote = `Couldn't load your Dungeon Master Guru campaigns: ${error.message}`;
    }
  }

  const option = (kind, campaign) => `
    <label class="dlcp-check">
      <input type="radio" name="campaign" value="${kind}:${escapeHtml(campaign.uuid)}" ${campaign.uuid === current ? "checked" : ""}>
      ${escapeHtml(campaign.name)}${campaign.uuid === current ? ' <span class="dlcp-muted">(open now)</span>' : ""}
    </label>`;
  const content = `<div class="dlcp-picker">
    <h3><i class="fas fa-house"></i> In this world</h3>
    ${local.length ? local.map((c) => option("local", c)).join("") : `<p class="dlcp-muted">None yet. Start one with New campaign.</p>`}
    <h3><i class="fas fa-globe"></i> On Dungeon Master Guru</h3>
    ${remote.length ? remote.map((c) => option("guru", c)).join("") : `<p class="dlcp-muted">${escapeHtml(remoteNote || "None yet.")}</p>`}
  </div>`;

  const choice = await foundry.applications.api.DialogV2.prompt({
    window: { title: "Open a campaign", icon: "fas fa-folder-open" },
    content,
    ok: {
      label: "Open",
      icon: "fas fa-folder-open",
      callback: (_event, button) => button.form.elements.campaign?.value ?? null,
    },
    rejectClose: false,
  });
  if (!choice) return;

  const [kind, uuid] = [choice.slice(0, choice.indexOf(":")), choice.slice(choice.indexOf(":") + 1)];
  if (uuid === current) return api.openDashboard();
  try {
    if (kind === "local") await sync.useLocal(local.find((c) => c.uuid === uuid));
    else {
      const campaign = remote.find((c) => c.uuid === uuid);
      await sync.link(campaign);
      ui.notifications.info(`Linked to ${campaign.name}. Its journals are in the "${campaign.name} (DM Guru)" folder.`);
    }
    api.openDashboard();
  } catch (error) {
    ui.notifications.error(`Couldn't open that campaign: ${error.message}`);
  }
}
