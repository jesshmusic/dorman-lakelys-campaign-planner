import { clockSvg, escapeHtml } from "../render.mjs";
import { MODULE_ID, SYNCED_HOOK } from "../constants.mjs";

const QUEST_STATUSES = { available: "Available", active: "Active", completed: "Completed", failed: "Failed" };

/**
 * The GM's at-the-table view of the linked campaign: the next session and
 * its log, threat clocks, secrets to reveal and open quests. Every change is
 * sent straight to Dungeon Master Guru.
 */
export class DashboardApp extends foundry.applications.api.ApplicationV2 {
  static DEFAULT_OPTIONS = {
    id: "dlcp-dashboard",
    classes: ["dlcp-app"],
    tag: "div",
    window: { title: "Campaign Dashboard", icon: "fas fa-scroll", resizable: true },
    position: { width: 560, height: 720 },
    actions: {
      sync: DashboardApp.#onSync,
      connect: DashboardApp.#onConnect,
      openJournals: DashboardApp.#onOpenJournals,
      advanceClock: DashboardApp.#onAdvanceClock,
      windBackClock: DashboardApp.#onWindBackClock,
      togglePortent: DashboardApp.#onTogglePortent,
      revealSecret: DashboardApp.#onRevealSecret,
      hideSecret: DashboardApp.#onHideSecret,
      saveLog: DashboardApp.#onSaveLog,
      markPlayed: DashboardApp.#onMarkPlayed,
    },
  };

  #hookId = null;
  #busy = false;

  get sync() {
    return game.modules.get(MODULE_ID).api.sync;
  }

  get title() {
    return this.sync.linked ? `Campaign Dashboard: ${this.sync.linked.name}` : "Campaign Dashboard";
  }

  async _onFirstRender(context, options) {
    await super._onFirstRender?.(context, options);
    this.#hookId = Hooks.on(SYNCED_HOOK, () => this.render());
  }

  async _onClose(options) {
    if (this.#hookId !== null) Hooks.off(SYNCED_HOOK, this.#hookId);
    this.#hookId = null;
    await super._onClose?.(options);
  }

  async _renderHTML() {
    const container = document.createElement("div");
    container.classList.add("dlcp-dashboard");
    container.innerHTML = this.sync.linked ? this.#renderLinked() : this.#renderUnlinked();
    container.querySelector(".dlcp-quest-status")?.closest("ul")
      ?.addEventListener("change", (event) => this.#onQuestStatus(event));
    return container;
  }

  _replaceHTML(result, content) {
    content.replaceChildren(result);
  }

  #renderUnlinked() {
    return `<p>Link this world to a Dungeon Master Guru campaign to see its sessions, threats, secrets and quests here.</p>
      <div class="dlcp-buttons"><button type="button" data-action="connect"><i class="fas fa-link"></i> Connect</button></div>`;
  }

  #renderLinked() {
    const store = this.sync.records();
    const sessions = [...store.sessions.values()].sort((a, b) => a.number - b.number);
    const next = sessions.find((s) => s.status !== "played") ?? sessions.at(-1);
    const fronts = [...store.fronts.values()];
    const quests = [...store.quests.values()].filter((q) => q.status === "active" || q.status === "available");
    const secrets = [...store.secrets.values()];
    const synced = this.sync.linked.lastSynced ? new Date(this.sync.linked.lastSynced).toLocaleTimeString() : "never";

    return `
      <header class="dlcp-toolbar">
        <span class="dlcp-muted">Last synced ${escapeHtml(synced)}</span>
        <span class="dlcp-buttons">
          <button type="button" data-action="openJournals"><i class="fas fa-book-open"></i> Journals</button>
          <button type="button" data-action="sync" ${this.#busy ? "disabled" : ""}><i class="fas fa-sync"></i> Sync now</button>
        </span>
      </header>
      ${this.#renderSession(next)}
      ${this.#renderClocks(fronts)}
      ${this.#renderSecrets(secrets, next)}
      ${this.#renderQuests(quests)}`;
  }

  #renderSession(session) {
    if (!session) return `<section><h2>Next session</h2><p class="dlcp-muted">No sessions yet.</p></section>`;
    const scenes = session.scenes?.length
      ? `<ul>${session.scenes.map((scene) => `<li>${escapeHtml(scene)}</li>`).join("")}</ul>`
      : "";
    return `
      <section data-session-uuid="${escapeHtml(session.uuid)}">
        <h2>${escapeHtml(session.displayTitle)}${session.status === "played" ? " (played)" : ""}</h2>
        ${session.strongStart ? `<p><strong>Strong start:</strong> ${escapeHtml(session.strongStart)}</p>` : ""}
        ${scenes}
        <label for="dlcp-log"><strong>Session log</strong></label>
        <textarea id="dlcp-log" rows="5" placeholder="What happened? Names you made up, promises, loose ends…">${escapeHtml(session.log ?? "")}</textarea>
        <div class="dlcp-buttons">
          <button type="button" data-action="saveLog"><i class="fas fa-save"></i> Save log</button>
          ${session.status !== "played" ? `<button type="button" data-action="markPlayed"><i class="fas fa-check"></i> Mark played</button>` : ""}
        </div>
      </section>`;
  }

  #renderClocks(fronts) {
    if (!fronts.length) return "";
    const items = fronts
      .map((front) => {
        const portents = (front.portents ?? [])
          .map(
            (portent, index) => `
            <label class="dlcp-portent">
              <input type="checkbox" data-action="togglePortent" data-uuid="${escapeHtml(front.uuid)}" data-index="${index}" ${portent.triggered ? "checked" : ""} />
              ${escapeHtml(portent.text)}
            </label>`,
          )
          .join("");
        return `
          <li class="dlcp-front">
            <div class="dlcp-front-clock">
              <button type="button" data-action="windBackClock" data-uuid="${escapeHtml(front.uuid)}" aria-label="Wind back ${escapeHtml(front.name)}" ${front.clockFilled <= 0 ? "disabled" : ""}>−</button>
              ${clockSvg(front.clockSegments, front.clockFilled, 56)}
              <button type="button" data-action="advanceClock" data-uuid="${escapeHtml(front.uuid)}" aria-label="Advance ${escapeHtml(front.name)}" ${front.clockFilled >= front.clockSegments ? "disabled" : ""}>+</button>
            </div>
            <div>
              <strong>${escapeHtml(front.name)}</strong>
              ${front.goal ? `<p class="dlcp-muted">${escapeHtml(front.goal)}</p>` : ""}
              ${portents}
            </div>
          </li>`;
      })
      .join("");
    return `<section><h2>Threats</h2><ul class="dlcp-list">${items}</ul></section>`;
  }

  #renderSecrets(secrets, session) {
    if (!secrets.length) return "";
    const picked = new Set(
      (session?.links ?? []).filter((l) => l.linkableType === "CampaignSecret").map((l) => l.linkableId),
    );
    const row = (secret) => `
      <li>
        ${escapeHtml(secret.text)}
        ${
          secret.revealed
            ? `<span class="dlcp-badge">Revealed</span> <button type="button" class="dlcp-link-button" data-action="hideSecret" data-uuid="${escapeHtml(secret.uuid)}">Undo</button>`
            : `<button type="button" data-action="revealSecret" data-uuid="${escapeHtml(secret.uuid)}">Reveal</button>`
        }
      </li>`;
    const forSession = secrets.filter((s) => picked.has(s.id));
    const others = secrets.filter((s) => !picked.has(s.id) && !s.revealed);
    return `
      <section>
        <h2>Secrets and clues</h2>
        ${forSession.length ? `<ul class="dlcp-list">${forSession.map(row).join("")}</ul>` : ""}
        ${others.length ? `<details><summary>Other unrevealed secrets (${others.length})</summary><ul class="dlcp-list">${others.map(row).join("")}</ul></details>` : ""}
      </section>`;
  }

  #renderQuests(quests) {
    if (!quests.length) return "";
    const items = quests
      .map(
        (quest) => `
        <li>
          <span>${escapeHtml(quest.name)}</span>
          <select class="dlcp-quest-status" data-uuid="${escapeHtml(quest.uuid)}" aria-label="Status of ${escapeHtml(quest.name)}">
            ${Object.entries(QUEST_STATUSES)
              .map(([value, label]) => `<option value="${value}" ${quest.status === value ? "selected" : ""}>${label}</option>`)
              .join("")}
          </select>
        </li>`,
      )
      .join("");
    return `<section><h2>Quests</h2><ul class="dlcp-list dlcp-quests">${items}</ul></section>`;
  }

  // ── Actions ────────────────────────────────────────────────────────────────

  #record(collection, uuid) {
    return [...this.sync.records()[collection].values()].find((record) => record.uuid === uuid);
  }

  async #change(collection, uuid, attributes) {
    const record = this.#record(collection, uuid);
    if (!record) return;
    try {
      await this.sync.update(collection, record, attributes);
    } catch (error) {
      ui.notifications.error(`Couldn't save to Dungeon Master Guru: ${error.message}`);
    }
  }

  #nextSession() {
    const uuid = this.element.querySelector("[data-session-uuid]")?.dataset.sessionUuid;
    return uuid ? this.#record("sessions", uuid) : null;
  }

  static async #onSync() {
    this.#busy = true;
    this.render();
    try {
      await this.sync.pull();
    } catch (error) {
      ui.notifications.error(`Sync failed: ${error.message}`);
    } finally {
      this.#busy = false;
      this.render();
    }
  }

  static #onConnect() {
    game.modules.get(MODULE_ID).api.openConnect();
  }

  static #onOpenJournals() {
    const folder = this.sync.folder;
    const overview = folder && game.journal.find((entry) => entry.folder?.id === folder.id);
    overview?.sheet.render(true);
  }

  static #onAdvanceClock(_event, target) {
    const front = this.#record("fronts", target.dataset.uuid);
    if (front) this.#change("fronts", front.uuid, { clockFilled: Math.min(front.clockSegments, front.clockFilled + 1) });
  }

  static #onWindBackClock(_event, target) {
    const front = this.#record("fronts", target.dataset.uuid);
    if (front) this.#change("fronts", front.uuid, { clockFilled: Math.max(0, front.clockFilled - 1) });
  }

  static #onTogglePortent(_event, target) {
    const front = this.#record("fronts", target.dataset.uuid);
    if (!front) return;
    const index = Number(target.dataset.index);
    const portents = front.portents.map((portent, i) =>
      i === index ? { ...portent, triggered: !portent.triggered } : portent,
    );
    this.#change("fronts", front.uuid, { portents });
  }

  static #onRevealSecret(_event, target) {
    const session = this.#nextSession();
    this.#change("secrets", target.dataset.uuid, { revealed: true, revealedSessionUuid: session?.uuid ?? null });
  }

  static #onHideSecret(_event, target) {
    this.#change("secrets", target.dataset.uuid, { revealed: false, revealedSessionUuid: null });
  }

  static #onSaveLog() {
    const session = this.#nextSession();
    const log = this.element.querySelector("#dlcp-log")?.value ?? "";
    if (session) this.#change("sessions", session.uuid, { log: log.trim() || null });
  }

  static #onMarkPlayed() {
    const session = this.#nextSession();
    if (session) this.#change("sessions", session.uuid, { status: "played" });
  }

  #onQuestStatus(event) {
    const select = event.target.closest(".dlcp-quest-status");
    if (select) this.#change("quests", select.dataset.uuid, { status: select.value });
  }
}
