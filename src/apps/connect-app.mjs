import { USING_DEV_SERVER } from "../env.mjs";
import { nextPoll, timeLeft } from "../link.mjs";
import { sendCampaign } from "./send-campaign.mjs";
import { escapeHtml } from "../render.mjs";
import { MODULE_ID, SETTINGS } from "../constants.mjs";

/**
 * Connects to Dungeon Master Guru and links this world to a campaign. To
 * connect, the DM enters a short code on the website (or pastes an API token
 * from their dashboard); then they pick a campaign, or send this world's.
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
      startLink: ConnectApp.#onStartLink,
      cancelLink: ConnectApp.#onCancelLink,
      linkCampaign: ConnectApp.#onLinkCampaign,
      newCampaign: ConnectApp.#onNewCampaign,
      sendIndex: ConnectApp.#onSendIndex,
      sendCampaign: ConnectApp.#onSendCampaign,
      disconnect: ConnectApp.#onDisconnect,
    },
  };

  #account = null;
  #campaigns = null;
  #error = null;
  #busy = false;
  #indexResult = null;
  // Linking with a code: { deviceCode, userCode, verificationUrlComplete, interval, expiresAt, status }
  #link = null;
  #pollTimer = null;

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
      ${hasToken ? this.#renderConnected() : this.#renderConnect(baseUrl)}
      ${this.#renderAccount()}
    `;
    return container;
  }

  _replaceHTML(result, content) {
    content.replaceChildren(result);
  }

  async _onClose(options) {
    clearTimeout(this.#pollTimer);
    this.#link = null;
    await super._onClose?.(options);
  }

  // Not connected yet: get a code to enter on the website, or paste a token
  #renderConnect(baseUrl) {
    return `${this.#link ? this.#renderLink() : `
      <p>Connect to your free Dungeon Master Guru account to plan on the website too, and sync your campaigns with
        this world.</p>
      <div class="dlcp-buttons">
        <button type="button" data-action="startLink" ${this.#busy ? "disabled" : ""}><i class="fas fa-key"></i> Get a code</button>
      </div>`}
      <details class="dlcp-paste-token">
        <summary>Or paste an API token</summary>
        <p class="hint">Create one on your <a href="${baseUrl}/app/user-dashboard" target="_blank" rel="noopener">Dungeon Master
          Guru dashboard</a> (Connections → API tokens). It's saved in this browser only.</p>
        ${this.#tokenField(false)}
      </details>`;
  }

  #renderConnected() {
    return `<div class="dlcp-buttons">
        <button type="button" data-action="checkToken" ${this.#busy ? "disabled" : ""}><i class="fas fa-plug"></i> Check connection</button>
        <button type="button" data-action="disconnect"><i class="fas fa-unlink"></i> Disconnect</button>
      </div>
      <details class="dlcp-paste-token">
        <summary>Use a different API token</summary>
        ${this.#tokenField(true)}
      </details>`;
  }

  #tokenField(hasToken) {
    return `<div class="form-group">
        <label for="dlcp-token">API token</label>
        <input id="dlcp-token" type="password" autocomplete="off" placeholder="${hasToken ? "Saved. Paste a new one to replace it" : "dmg_…"}" />
      </div>
      <div class="dlcp-buttons">
        <button type="button" data-action="checkToken" ${this.#busy ? "disabled" : ""}><i class="fas fa-plug"></i> Connect</button>
      </div>`;
  }

  // The code to enter on the website, while waiting for it
  #renderLink() {
    const link = this.#link;
    const url = escapeHtml(link.verificationUrlComplete ?? link.verificationUrl);
    if (link.status !== "waiting") {
      const why = {
        expired: "That code expired before it was entered.",
        denied: "The code was cancelled on Dungeon Master Guru.",
        error: "Something went wrong while waiting for the code.",
      }[link.status];
      return `<p class="dlcp-notice dlcp-notice--warning">${why}</p>
        <div class="dlcp-buttons"><button type="button" data-action="startLink"><i class="fas fa-key"></i> Get a new code</button></div>`;
    }
    return `<section class="dlcp-card dlcp-link-code">
        <p>On Dungeon Master Guru, sign in and enter this code:</p>
        <p class="dlcp-user-code" aria-label="Your code">${escapeHtml(link.userCode)}</p>
        <div class="dlcp-buttons">
          <a class="dlcp-button-link" href="${url}" target="_blank" rel="noopener"><i class="fas fa-external-link-alt"></i> Open Dungeon Master Guru</a>
          <button type="button" data-action="cancelLink">Cancel</button>
        </div>
        <p class="dlcp-muted"><i class="fas fa-spinner fa-spin"></i> Waiting for the code… It expires in ${timeLeft(link.expiresAt)}.</p>
      </section>`;
  }

  #schedulePoll(seconds) {
    clearTimeout(this.#pollTimer);
    this.#pollTimer = setTimeout(() => this.#poll(), seconds * 1000);
  }

  // Asks whether the code was entered; connects when it was
  async #poll() {
    const link = this.#link;
    if (!link || link.status !== "waiting") return;
    try {
      const { token } = await this.sync.api(null).pollLink(link.deviceCode);
      await game.settings.set(MODULE_ID, SETTINGS.apiToken, token);
      this.#link = null;
      ui.notifications.info("Connected to Dungeon Master Guru.");
      await this.#loadAccount(token);
    } catch (error) {
      // Can't reach the server for a moment: keep waiting
      const step = error.status === 0 ? { wait: link.interval } : nextPoll(error.code, link.interval);
      if ("wait" in step) {
        link.interval = Math.max(link.interval, step.wait);
        this.#schedulePoll(step.wait);
      } else {
        link.status = step.stop;
      }
      this.render();
    }
  }

  // The account and its campaigns, for the parts below the connection
  async #loadAccount(token) {
    this.#busy = true;
    this.#error = null;
    await this.render();
    try {
      const api = this.sync.api(token);
      this.#account = await api.me();
      this.#campaigns = await api.campaigns();
      return true;
    } catch (error) {
      this.#account = null;
      this.#error = error.unauthorized ? "That token didn't work. Check it, or connect again." : error.message;
      return false;
    } finally {
      this.#busy = false;
      this.render();
    }
  }

  // Compendium index: lets planner searches on Dungeon Master Guru link to these compendiums
  #renderIndex() {
    const result = this.#indexResult;
    const chosen = new Set(this.sync.homebrewSources);
    const homebrew = this.sync
      .homebrewOptions()
      .map(
        (option) => `<label class="dlcp-check"><input type="checkbox" data-homebrew value="${escapeHtml(option.id)}" ${chosen.has(option.id) ? "checked" : ""} ${this.#busy ? "disabled" : ""}>
          ${escapeHtml(option.label)}${option.id === "world.actors" ? ` <span class="dlcp-muted">(this world's NPC actors)</span>` : ""}</label>`,
      )
      .join("");
    return `
      <h3>Compendiums</h3>
      <p class="hint">Sends the names, CRs and IDs (never stat blocks) of your SRD and 2024 core book compendiums,
        so monsters and items picked on Dungeon Master Guru become links you can drag onto a scene. Sent automatically
        when a book module updates.</p>
      <fieldset class="dlcp-homebrew">
        <legend>Homebrew monsters</legend>
        <p class="hint">Tick your own monsters to pick them on Dungeon Master Guru too: this world's NPC actors, or an
          Actor compendium of yours. Only their names, CRs and IDs are sent, never their stat blocks. Untick one and
          Dungeon Master Guru forgets it.</p>
        <div class="dlcp-checks">${homebrew}</div>
      </fieldset>
      ${result ? `<p class="dlcp-notice">Sent ${result.entries.toLocaleString()} entries from ${result.packs} compendiums.</p>` : ""}
      <div class="dlcp-buttons">
        <button type="button" data-action="sendIndex" ${this.#busy ? "disabled" : ""}><i class="fas fa-book"></i> Send compendium index</button>
      </div>`;
  }

  async _onRender(context, options) {
    await super._onRender?.(context, options);
    for (const box of this.element.querySelectorAll("[data-homebrew]")) {
      box.addEventListener("change", () => this.#onHomebrewChange());
    }
  }

  // A homebrew source was ticked or unticked: save the choice and send what changed
  async #onHomebrewChange() {
    const ids = [...this.element.querySelectorAll("[data-homebrew]:checked")].map((box) => box.value);
    this.#busy = true;
    this.#error = null;
    await this.render();
    try {
      const result = await this.sync.setHomebrewSources(ids);
      this.#indexResult = result?.packs ? result : null;
    } catch (error) {
      this.#error = `Couldn't send the homebrew monsters: ${error.message}`;
    } finally {
      this.#busy = false;
      this.render();
    }
  }

  // A campaign planned in this world can go to Dungeon Master Guru
  #renderSend() {
    if (!this.sync.isLocal) return "";
    return `<section class="dlcp-card">
      <h3><i class="fas fa-cloud-arrow-up"></i> Send ${escapeHtml(this.sync.linked.name)} to Dungeon Master Guru</h3>
      <p class="hint">Plan it on the website too, from anywhere. This world then syncs with it, and its journals stay
        where they are.</p>
      <div class="dlcp-buttons">
        <button type="button" data-action="sendCampaign" ${this.#busy ? "disabled" : ""}><i class="fas fa-cloud-arrow-up"></i> Send to Dungeon Master Guru</button>
      </div>
    </section>`;
  }

  #renderAccount() {
    if (!this.#account) return "";
    const { user } = this.#account;
    const header = `<p>Signed in as <strong>${escapeHtml(user.name ?? user.username)}</strong>.</p>${this.#renderSend()}`;
    const newCampaign = `<button type="button" data-action="newCampaign"><i class="fas fa-feather-alt"></i> New campaign</button>`;
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

  static async #onSendCampaign() {
    this.#busy = true;
    await this.render();
    try {
      if (await sendCampaign()) this.#campaigns = await this.sync.api().campaigns();
    } finally {
      this.#busy = false;
      await this.render();
    }
  }

  static async #onCheckToken() {
    const pasted = this.element.querySelector("#dlcp-token")?.value.trim();
    const token = pasted || this.sync.token;
    if (!token) {
      this.#error = "Paste your API token first.";
      return this.render();
    }
    if ((await this.#loadAccount(token)) && pasted) {
      await game.settings.set(MODULE_ID, SETTINGS.apiToken, pasted);
      this.render();
    }
  }

  static async #onStartLink() {
    clearTimeout(this.#pollTimer);
    this.#busy = true;
    this.#error = null;
    await this.render();
    try {
      const link = await this.sync.api(null).startLink({ id: game.world.id, title: game.world.title });
      this.#link = { ...link, expiresAt: Date.now() + link.expiresIn * 1000, status: "waiting" };
      this.#schedulePoll(link.interval);
    } catch (error) {
      this.#error = `Couldn't get a code: ${error.message}`;
    } finally {
      this.#busy = false;
      this.render();
    }
  }

  static #onCancelLink() {
    clearTimeout(this.#pollTimer);
    this.#link = null;
    this.render();
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
