import { USING_DEV_SERVER } from "../env.mjs";
import { escapeHtml } from "../render.mjs";
import { MODULE_ID, SETTINGS } from "../constants.mjs";

/**
 * Links this world to a Dungeon Master Guru campaign: paste a personal API
 * token (from the Dungeon Master Guru dashboard), check it, pick a campaign.
 */
export class ConnectApp extends foundry.applications.api.ApplicationV2 {
  static DEFAULT_OPTIONS = {
    id: "dlcp-connect",
    classes: ["dlcp-app"],
    tag: "div",
    window: { title: "Connect to Dungeon Master Guru", icon: "fas fa-link", resizable: true },
    position: { width: 480, height: "auto" },
    actions: {
      checkToken: ConnectApp.#onCheckToken,
      linkCampaign: ConnectApp.#onLinkCampaign,
      newCampaign: ConnectApp.#onNewCampaign,
      sendIndex: ConnectApp.#onSendIndex,
      disconnect: ConnectApp.#onDisconnect,
    },
  };

  #account = null;
  #campaigns = null;
  #error = null;
  #busy = false;
  #indexResult = null;

  get sync() {
    return game.modules.get(MODULE_ID).api.sync;
  }

  async _renderHTML() {
    const container = document.createElement("div");
    container.classList.add("dlcp-connect");
    const linked = this.sync.linked;
    const hasToken = Boolean(this.sync.token);
    const baseUrl = escapeHtml(this.sync.baseUrl);

    container.innerHTML = `
      ${this.#error ? `<p class="dlcp-notice dlcp-notice--error">${escapeHtml(this.#error)}</p>` : ""}
      ${linked ? `<p class="dlcp-notice">This world is linked to <strong>${escapeHtml(linked.name)}</strong>.</p>` : ""}
      ${USING_DEV_SERVER ? `<p class="dlcp-notice dlcp-notice--warning">Development build: using the Dungeon Master Guru at ${baseUrl}.</p>` : ""}
      <p>Create an API token on your <a href="${baseUrl}/app/user-dashboard" target="_blank" rel="noopener">Dungeon Master Guru dashboard</a>
         (Connections → API tokens) and paste it here. It is saved in this browser only.</p>
      <div class="form-group">
        <label for="dlcp-token">API token</label>
        <input id="dlcp-token" type="password" autocomplete="off" placeholder="${hasToken ? "Saved. Paste a new one to replace it" : "dmg_…"}" />
      </div>
      <div class="dlcp-buttons">
        <button type="button" data-action="checkToken" ${this.#busy ? "disabled" : ""}>
          <i class="fas fa-plug"></i> ${hasToken ? "Check connection" : "Connect"}
        </button>
        ${linked || hasToken ? `<button type="button" data-action="disconnect"><i class="fas fa-unlink"></i> Disconnect</button>` : ""}
      </div>
      ${this.#renderAccount()}
    `;
    return container;
  }

  _replaceHTML(result, content) {
    content.replaceChildren(result);
  }

  // Compendium index: lets planner searches on Dungeon Master Guru link to these compendiums
  #renderIndex() {
    const result = this.#indexResult;
    return `
      <h3>Compendiums</h3>
      <p class="hint">Sends the names, CRs and IDs (never stat blocks) of your SRD and 2024 core book compendiums,
        so monsters and items picked on Dungeon Master Guru become links you can drag onto a scene. Sent automatically
        when a book module updates.</p>
      ${result ? `<p class="dlcp-notice">Sent ${result.entries.toLocaleString()} entries from ${result.packs} compendiums.</p>` : ""}
      <div class="dlcp-buttons">
        <button type="button" data-action="sendIndex" ${this.#busy ? "disabled" : ""}><i class="fas fa-book"></i> Send compendium index</button>
      </div>`;
  }

  #renderAccount() {
    if (!this.#account) return "";
    const { user, premium } = this.#account;
    const header = `<p>Signed in as <strong>${escapeHtml(user.name ?? user.username)}</strong>.</p>`;
    const newCampaign = `<button type="button" data-action="newCampaign"><i class="fas fa-feather-alt"></i> New campaign</button>`;
    if (!premium) {
      return `${header}<p class="dlcp-notice dlcp-notice--warning">Campaign sync needs a premium Patreon membership linked to
        your Dungeon Master Guru account. <a href="https://www.patreon.com/c/DormanLakely" target="_blank" rel="noopener">Join on Patreon</a>,
        then link it in your Dungeon Master Guru dashboard.</p>
        <p>You can still plan a campaign: it's free, and it's saved on Dungeon Master Guru.</p>
        <div class="dlcp-buttons">${newCampaign}</div>`;
    }
    if (!this.#campaigns?.length) {
      return `${header}${this.#renderIndex()}<p>You don't have any campaigns yet. Start one here, step by step.</p>
        <div class="dlcp-buttons">${newCampaign}</div>`;
    }
    const current = this.sync.linked?.uuid;
    const options = this.#campaigns
      .map(
        (c) =>
          `<option value="${escapeHtml(c.uuid)}" ${c.uuid === current ? "selected" : ""}>${escapeHtml(c.name)}</option>`,
      )
      .join("");
    return `${header}
      <div class="form-group">
        <label for="dlcp-campaign">Campaign</label>
        <select id="dlcp-campaign">${options}</select>
      </div>
      <p class="hint">Linking creates a journal folder for the campaign and keeps it in sync.</p>
      <div class="dlcp-buttons">
        <button type="button" data-action="linkCampaign" ${this.#busy ? "disabled" : ""}><i class="fas fa-link"></i> Link campaign</button>
        ${newCampaign}
      </div>
      ${this.#renderIndex()}`;
  }

  static async #onCheckToken() {
    const pasted = this.element.querySelector("#dlcp-token").value.trim();
    const token = pasted || this.sync.token;
    if (!token) {
      this.#error = "Paste your API token first.";
      return this.render();
    }
    this.#busy = true;
    this.#error = null;
    await this.render();
    try {
      const api = this.sync.api(token);
      this.#account = await api.me();
      this.#campaigns = this.#account.premium ? await api.campaigns() : null;
      if (pasted) await game.settings.set(MODULE_ID, SETTINGS.apiToken, pasted);
    } catch (error) {
      this.#account = null;
      this.#error = error.unauthorized ? "That token didn't work. Check it, or create a new one." : error.message;
    } finally {
      this.#busy = false;
      this.render();
    }
  }

  static async #onLinkCampaign() {
    const uuid = this.element.querySelector("#dlcp-campaign")?.value;
    const campaign = this.#campaigns?.find((c) => c.uuid === uuid);
    if (!campaign) return;
    this.#busy = true;
    await this.render();
    try {
      await this.sync.link(campaign);
      ui.notifications.info(`Linked to ${campaign.name}. Its journals are in the "${campaign.name} (DM Guru)" folder.`);
      this.close();
      game.modules.get(MODULE_ID).api.openDashboard();
    } catch (error) {
      this.#error = error.message;
      this.#busy = false;
      this.render();
    }
  }

  static #onNewCampaign() {
    this.close();
    game.modules.get(MODULE_ID).api.openNewCampaign();
  }

  static async #onSendIndex() {
    this.#busy = true;
    this.#error = null;
    await this.render();
    try {
      this.#indexResult = await this.sync.sendCompendiumIndex({ force: true });
    } catch (error) {
      this.#error = error.message;
    } finally {
      this.#busy = false;
      this.render();
    }
  }

  static async #onDisconnect() {
    const confirmed = await foundry.applications.api.DialogV2.confirm({
      window: { title: "Disconnect from Dungeon Master Guru" },
      content: "<p>Forget the API token and the linked campaign? The journals stay in this world.</p>",
    });
    if (!confirmed) return;
    await game.settings.set(MODULE_ID, SETTINGS.apiToken, "");
    await this.sync.unlink();
    this.#account = null;
    this.#campaigns = null;
    this.#error = null;
    this.render();
  }
}
