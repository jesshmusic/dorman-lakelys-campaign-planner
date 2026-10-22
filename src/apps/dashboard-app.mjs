import { ENCOUNTER_KIND_LABELS, clockSvg, currencyText, escapeHtml } from "../render.mjs";
import { MODULE_ID, SETTINGS, SYNCED_HOOK } from "../constants.mjs";
import { addForm } from "../local.mjs";
import { LIST_FIELDS } from "../planner.mjs";
import { listFieldHtml } from "../list-editor.mjs";
import { currentTechniques } from "../technique-settings.mjs";
import { LINKS } from "../welcome.mjs";
import { giveReward } from "./give-reward.mjs";
import { syncButton, syncStatus, syncWithFeedback } from "./sync-button.mjs";
import { contentLink, importMonster, monsterHtml, rollTable, rollTablesHtml, showHandout } from "./shared.mjs";
import { encountersOf, legacyEncounter, monsterLinks } from "../encounters.mjs";
import { difficultyText, encounterDifficulty } from "../difficulty.mjs";

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
    window: {
      title: "Campaign Dashboard",
      icon: "fas fa-scroll",
      resizable: true,
      controls: [
        { icon: "fas fa-feather-alt", label: "Plan it (Campaign Planner)", action: "plan" },
        { icon: "fas fa-plus", label: "New campaign", action: "newCampaign" },
        { icon: "fas fa-right-left", label: "Switch campaign", action: "openCampaign" },
        { icon: "fas fa-link", label: "Connect to Dungeon Master Guru", action: "connect" },
        { icon: "fas fa-circle-question", label: "Help", action: "help" },
        { icon: "fas fa-bug", label: "Report a bug", action: "reportBug" },
      ],
    },
    position: { width: 760, height: 840 },
    actions: {
      sync: DashboardApp.#onSync,
      syncNow: DashboardApp.#onSync,
      connect: DashboardApp.#onConnect,
      newCampaign: DashboardApp.#onNewCampaign,
      help: DashboardApp.#onHelp,
      reportBug: DashboardApp.#onReportBug,
      plan: DashboardApp.#onPlan,
      viewScene: DashboardApp.#onViewScene,
      activateScene: DashboardApp.#onActivateScene,
      openCampaign: DashboardApp.#onOpenCampaign,
      add: DashboardApp.#onAdd,
      openJournals: DashboardApp.#onOpenJournals,
      advanceClock: DashboardApp.#onAdvanceClock,
      windBackClock: DashboardApp.#onWindBackClock,
      togglePortent: DashboardApp.#onTogglePortent,
      revealSecret: DashboardApp.#onRevealSecret,
      hideSecret: DashboardApp.#onHideSecret,
      saveLog: DashboardApp.#onSaveLog,
      markPlayed: DashboardApp.#onMarkPlayed,
      giveReward: DashboardApp.#onGiveReward,
      importMonster: DashboardApp.#onImportMonster,
      rollTable: DashboardApp.#onRollTable,
      showHandout: DashboardApp.#onShowHandout,
    },
  };

  #hookId = null;
  #busy = false;
  // The compendium name lookup, made once for each render
  #lookup = null;

  get sync() {
    return game.modules.get(MODULE_ID).api.sync;
  }

  get title() {
    return this.sync.linked ? `Campaign Dashboard: ${this.sync.linked.name}` : "Campaign Dashboard";
  }

  async _onFirstRender(context, options) {
    await super._onFirstRender?.(context, options);
    // The linked campaign may have changed, so refresh the title too
    this.#hookId = Hooks.on(SYNCED_HOOK, () => this.render({ window: { title: this.title } }));
  }

  async _onClose(options) {
    if (this.#hookId !== null) Hooks.off(SYNCED_HOOK, this.#hookId);
    this.#hookId = null;
    await super._onClose?.(options);
  }

  async _renderHTML() {
    const container = document.createElement("div");
    container.classList.add("dlcp-dashboard");
    this.#lookup = this.sync.linked ? this.sync.compendiumUuid() : null;
    container.innerHTML = `${this.sync.linked ? this.#renderLinked() : this.#renderUnlinked()}${this.#renderFooter()}`;
    this.#lookup = null;
    container.querySelector(".dlcp-quest-status")?.closest("ul")
      ?.addEventListener("change", (event) => this.#onQuestStatus(event));
    container.querySelector("[data-open-on-startup]")?.addEventListener("change", (event) => {
      game.settings.set(MODULE_ID, SETTINGS.openDashboard, event.target.checked);
    });
    return container;
  }

  _replaceHTML(result, content) {
    content.replaceChildren(result);
  }

  // Always at the bottom: Patreon, the website, a bug report, opening at startup, and the version
  #renderFooter() {
    const api = game.modules.get(MODULE_ID);
    const link = (href, className, title, inner) =>
      `<a href="${escapeHtml(href)}" class="dlcp-footer-link ${className}" title="${title}" target="_blank" rel="noopener noreferrer">${inner}</a>`;
    return `<footer class="dlcp-footer">
        ${link(LINKS.patreon, "dlcp-footer-patreon", "Support Dorman Lakely on Patreon", `<i class="fab fa-patreon"></i><span>Support on Patreon</span>`)}
        ${link(LINKS.site, "dlcp-footer-site", "Dungeon Master Guru: plan from anywhere, and DM tools", `<img src="modules/${MODULE_ID}/icons/dmguru-logo.svg" alt="" class="dlcp-footer-logo"><span>Dungeon Master Guru</span>`)}
        ${link(api.api.bugReportLink(), "dlcp-footer-bug", "Report a bug on GitHub, with your versions filled in", `<i class="fas fa-bug"></i><span>Report a bug</span>`)}
        <label class="dlcp-footer-startup" title="Open the Campaign Dashboard when this world loads">
          <input type="checkbox" data-open-on-startup ${game.settings.get(MODULE_ID, SETTINGS.openDashboard) ? "checked" : ""}>
          Open at startup
        </label>
        <span class="dlcp-footer-version">v${escapeHtml(api.version)}</span>
      </footer>`;
  }

  #renderUnlinked() {
    return `<p>This world doesn't have a campaign yet.</p>
      <p><strong>Start one here</strong>, step by step: what kind of game, the pitch, the party, the world and your books.
        It lives in this world; no account needed.</p>
      <p>Or <strong>connect to Dungeon Master Guru</strong> to plan on the website too, from anywhere, and link a
        campaign you've made there.</p>
      <div class="dlcp-buttons">
        <button type="button" data-action="newCampaign"><i class="fas fa-feather-alt"></i> New campaign</button>
        <button type="button" data-action="openCampaign"><i class="fas fa-folder-open"></i> Open a campaign</button>
        <button type="button" data-action="connect"><i class="fas fa-link"></i> Connect to Dungeon Master Guru</button>
        <button type="button" data-action="help"><i class="fas fa-circle-question"></i> How it works</button>
      </div>`;
  }

  #renderLinked() {
    const store = this.sync.records();
    const sessions = [...store.sessions.values()].sort((a, b) => a.number - b.number);
    const next = sessions.find((s) => s.status !== "played") ?? sessions.at(-1);
    const fronts = [...store.fronts.values()];
    // Main quests by act, then side quests, in the order they were added
    const quests = [...store.quests.values()]
      .filter((q) => q.status === "active" || q.status === "available")
      .sort(
        (a, b) =>
          (a.kind === "main" ? 0 : 1) - (b.kind === "main" ? 0 : 1) ||
          (a.act ?? 99) - (b.act ?? 99) ||
          (a.position ?? 0) - (b.position ?? 0) ||
          a.name.localeCompare(b.name),
      );
    const secrets = [...store.secrets.values()].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
    const local = this.sync.isLocal;
    // The techniques this world uses; the ones switched off are hidden
    const techniques = currentTechniques();
    const status = local
      ? `<span class="dlcp-muted"><i class="fas fa-house"></i> In this world</span>`
      : syncStatus(this.sync) || `<span class="dlcp-muted">Not synced yet</span>`;

    return `
      <header class="dlcp-toolbar">
        ${status}
        <span class="dlcp-buttons">
          <button type="button" data-action="openCampaign" data-tooltip="Switch to another campaign"><i class="fas fa-right-left"></i> Switch</button>
          <button type="button" data-action="plan"><i class="fas fa-feather-alt"></i> Plan</button>
          <button type="button" data-action="openJournals"><i class="fas fa-book-open"></i> Journals</button>
          ${syncButton(this.sync, { busy: this.#busy })}
        </span>
      </header>
      ${this.#renderSession(next)}
      ${this.#renderClocks(fronts, techniques)}
      ${techniques.secrets ? this.#renderSecrets(secrets, next) : ""}
      ${this.#renderQuests(quests)}
      ${this.sync.editable ? this.#renderAddMore() : ""}`;
  }

  // An "Add" button for a section of a campaign that can be changed here
  #addButton(collection, label) {
    return this.sync.editable
      ? `<button type="button" class="dlcp-add" data-action="add" data-collection="${collection}"><i class="fas fa-plus"></i> ${label}</button>`
      : "";
  }

  #renderAddMore() {
    return `<section><h2>Add to the campaign</h2>
      <p class="dlcp-muted">Each goes in its own journal page, ready to fill in and share.</p>
      <div class="dlcp-buttons">
        ${this.#addButton("npcs", "NPC")}${this.#addButton("locations", "Place")}${this.#addButton("factions", "Faction")}${this.#addButton("sessions", "Session")}
      </div></section>`;
  }

  #renderSession(session) {
    if (!session) {
      return `<section><h2>Next session</h2><p class="dlcp-muted">No sessions yet.</p>
        <div class="dlcp-buttons">${this.#addButton("sessions", "Add a session")}</div></section>`;
    }
    const scenes = session.scenes?.length
      ? `<ul>${session.scenes.map((scene) => `<li>${escapeHtml(scene)}</li>`).join("")}</ul>`
      : "";
    return `
      <section data-session-uuid="${escapeHtml(session.uuid)}">
        <h2>${escapeHtml(session.displayTitle)}${session.status === "played" ? " (played)" : ""}</h2>
        ${session.strongStart ? `<p><strong>Strong start:</strong> ${escapeHtml(session.strongStart)}</p>` : ""}
        ${scenes}
        ${this.#renderMaps(session.foundryScenes)}
        ${this.#renderMonsters(session)}
        ${this.#renderPlaces(
          (session.links ?? []).filter((link) => link.linkableType === "CampaignLocation").map((link) => link.linkableId),
        )}
        ${this.#renderTreasure(session, { collection: "sessions", label: "Treasure", coins: session.treasureCurrency })}
        <label for="dlcp-log"><strong>Session log</strong></label>
        <textarea id="dlcp-log" rows="5" placeholder="What happened? Names you made up, promises, loose ends…">${escapeHtml(session.log ?? "")}</textarea>
        <div class="dlcp-buttons">
          <button type="button" data-action="saveLog"><i class="fas fa-save"></i> Save log</button>
          ${session.status !== "played" ? `<button type="button" data-action="markPlayed"><i class="fas fa-check"></i> Mark played</button>` : ""}
        </div>
      </section>`;
  }

  // A session's or quest's maps: view one yourself, or activate it for the players
  #renderMaps(scenes) {
    const maps = scenes ?? [];
    if (!maps.length) return "";
    return `<p class="dlcp-maps"><strong>Maps:</strong> ${maps
      .map(
        (map) => `<span class="dlcp-map">
          <button type="button" class="dlcp-link-button" data-action="viewScene" data-scene="${escapeHtml(map.uuid)}">${escapeHtml(map.name)}</button>
          <button type="button" class="dlcp-icon-button" data-action="activateScene" data-scene="${escapeHtml(map.uuid)}"
            aria-label="Activate ${escapeHtml(map.name)} for the players" data-tooltip="Activate for the players"><i class="fas fa-bullseye"></i></button>
        </span>`,
      )
      .join("")}</p>`;
  }

  // A session's or encounter's monsters, with how many, to drag onto a map.
  // One of Dungeon Master Guru's own with no compendium entry can be imported.
  #renderMonsters(owner, { label = "Monsters" } = {}) {
    const store = this.sync.records();
    const lookup = this.#lookup ?? this.sync.compendiumUuid();
    const parts = monsterLinks(owner, store.references).map((link) => {
      const count = link.quantity > 1 ? ` ×${escapeHtml(link.quantity)}` : "";
      if (link.linkableType === "Monster") return `${monsterHtml(this.sync, { id: link.linkableId, name: link.name }, lookup)}${count}`;
      const reference = store.references.get(String(link.linkableId));
      const name = reference.foundryUuid ? contentLink(reference.foundryUuid, reference.name, "user") : escapeHtml(reference.name);
      return `${name}${count}`;
    });
    return parts.length ? `<p><strong>${escapeHtml(label)}:</strong> ${parts.join(", ")}</p>` : "";
  }

  // Places with random encounter tables, each table with a Roll button
  #renderPlaces(locationIds) {
    const locations = this.sync.records().locations;
    return [...new Set(locationIds.map(String))]
      .map((id) => locations.get(id))
      .filter((location) => (location?.rollTables ?? []).length)
      .map((location) => `<div class="dlcp-place"><p><strong>Random encounters at ${escapeHtml(location.name)}:</strong></p>${rollTablesHtml(location)}</div>`)
      .join("");
  }

  // An active quest's encounters, in order: what each needs at the table, and its reward to give
  #renderEncounters(quest) {
    const store = this.sync.records();
    const campaign = [...store.campaign.values()][0];
    const legacy = legacyEncounter(quest, store.references);
    const encounters = encountersOf([...store.encounters.values()], quest.id);
    if (!legacy && !encounters.length) return "";
    const card = (encounter) => {
      const difficulty = encounter.legacy
        ? null
        : encounterDifficulty(encounter, { references: store.references, campaign, quest, tables: this.sync.xpTables });
      const title = encounter.legacy ? "Encounter" : `${ENCOUNTER_KIND_LABELS[encounter.kind] ?? "Other"}: ${encounter.name}`;
      return `<li class="dlcp-encounter">
        <h4>${escapeHtml(title)}</h4>
        ${difficulty ? `<p class="dlcp-difficulty"><strong>Difficulty:</strong> ${escapeHtml(difficultyText(difficulty))}</p>` : ""}
        ${this.#renderMonsters(encounter)}
        ${this.#renderMaps(encounter.foundryScenes)}
        ${encounter.legacy ? "" : this.#renderTreasure(encounter, { collection: "encounters", label: "Reward", coins: encounter.rewardCurrency, xp: encounter.rewardXp })}
      </li>`;
    };
    return `<p><strong>Encounters:</strong></p><ul class="dlcp-list dlcp-encounters">${[legacy, ...encounters].filter(Boolean).map(card).join("")}</ul>`;
  }

  // A quest's handouts, each with a button to show it to the players
  #renderHandouts(quest) {
    const handouts = quest.handouts ?? [];
    if (!handouts.length) return "";
    return `<p><strong>Handouts:</strong></p><ul class="dlcp-list dlcp-handouts">${handouts
      .map(
        (handout) => `<li><span class="dlcp-grow">${contentLink(handout.uuid, handout.name, "book-open")}</span>
          <button type="button" data-action="showHandout" data-uuid="${escapeHtml(handout.uuid)}" data-tooltip="Choose which players see it"><i class="fas fa-eye"></i> Show to players</button></li>`,
      )
      .join("")}</ul>`;
  }

  // A session's or quest's book references of some kind, as links you can drag
  #referenceLinks(owner, wanted) {
    const references = this.sync.records().references;
    return (owner.links ?? [])
      .filter((link) => link.linkableType === "CampaignReference")
      .map((link) => ({ link, reference: references.get(String(link.linkableId)) }))
      .filter(({ reference }) => reference && wanted(reference.category))
      .map(
        ({ link, reference }) =>
          `${
            reference.foundryUuid
              ? `<a class="content-link" draggable="true" data-uuid="${escapeHtml(reference.foundryUuid)}" data-link><i class="fas fa-${reference.category === "monster" ? "user" : "suitcase"}"></i>${escapeHtml(reference.name)}</a>`
              : escapeHtml(reference.name)
          }${link.quantity > 1 ? ` ×${escapeHtml(link.quantity)}` : ""}`,
      );
  }

  // Coins and items to hand out; drag an item onto a character sheet to give it.
  // A quest's reward adds its XP or milestone.
  #renderTreasure(owner, { collection, label, coins, xp = null, milestone = false }) {
    const items = this.#referenceLinks(owner, (category) => category !== "monster");
    const parts = [
      currencyText(coins) && escapeHtml(currencyText(coins)),
      ...items,
      xp && `${escapeHtml(xp)} XP`,
      milestone && "level up (milestone)",
    ].filter(Boolean);
    if (!parts.length) return "";
    const button = `<button type="button" data-action="giveReward" data-collection="${collection}" data-uuid="${escapeHtml(owner.uuid)}">
        <i class="fas fa-gem"></i> ${label === "Reward" ? "Give the reward" : "Hand out the treasure"}</button>`;
    return `<p><strong>${escapeHtml(label)}:</strong> ${parts.join(", ")}</p>
      <div class="dlcp-buttons">${button}</div>
      ${items.length ? `<p class="dlcp-muted">Or drag an item onto a character's sheet to give it to them.</p>` : ""}`;
  }

  #renderClocks(fronts, techniques) {
    if (!fronts.length && !this.sync.editable) return "";
    const items = fronts
      .map((front) => {
        const portents = techniques.portents
          ? (front.portents ?? [])
              .map(
                (portent, index) => `
            <label class="dlcp-portent">
              <input type="checkbox" data-action="togglePortent" data-uuid="${escapeHtml(front.uuid)}" data-index="${index}" ${portent.triggered ? "checked" : ""} />
              ${escapeHtml(portent.text)}
            </label>`,
              )
              .join("")
          : "";
        const clock = techniques.clocks
          ? `<div class="dlcp-front-clock">
              <button type="button" data-action="windBackClock" data-uuid="${escapeHtml(front.uuid)}" aria-label="Wind back ${escapeHtml(front.name)}" ${front.clockFilled <= 0 ? "disabled" : ""}>−</button>
              ${clockSvg(front.clockSegments, front.clockFilled, 56)}
              <button type="button" data-action="advanceClock" data-uuid="${escapeHtml(front.uuid)}" aria-label="Advance ${escapeHtml(front.name)}" ${front.clockFilled >= front.clockSegments ? "disabled" : ""}>+</button>
            </div>`
          : "";
        return `
          <li class="dlcp-front">
            ${clock}
            <div>
              <strong>${escapeHtml(front.name)}</strong>
              ${front.goal ? `<p class="dlcp-muted">${escapeHtml(front.goal)}</p>` : ""}
              ${portents}
            </div>
          </li>`;
      })
      .join("");
    return `<section><h2>Threats</h2>
      ${items ? `<ul class="dlcp-list">${items}</ul>` : `<p class="dlcp-muted">No threats yet. A threat is a villain or danger with a plan${techniques.clocks ? ", and a clock that fills if no one stops it" : ""}.</p>`}
      <div class="dlcp-buttons">${this.#addButton("fronts", "Add a threat")}</div></section>`;
  }

  #renderSecrets(secrets, session) {
    if (!secrets.length && !this.sync.editable) return "";
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
    const revealed = secrets.filter((s) => !picked.has(s.id) && s.revealed);
    return `
      <section>
        <h2>Secrets and clues</h2>
        ${forSession.length ? `<ul class="dlcp-list">${forSession.map(row).join("")}</ul>` : ""}
        ${others.length ? `<details ${forSession.length ? "" : "open"}><summary>${forSession.length ? "Other unrevealed secrets" : "Unrevealed secrets"} (${others.length})</summary><ul class="dlcp-list">${others.map(row).join("")}</ul></details>` : ""}
        ${revealed.length ? `<details><summary>Revealed (${revealed.length})</summary><ul class="dlcp-list">${revealed.map(row).join("")}</ul></details>` : ""}
        ${secrets.length ? "" : `<p class="dlcp-muted">No secrets yet. Add clues the party could find, about three for each thing worth learning.</p>`}
        <div class="dlcp-buttons">${this.#addButton("secrets", "Add a secret")}</div>
      </section>`;
  }

  #renderQuests(quests) {
    if (!quests.length && !this.sync.editable) return "";
    // An active quest shows what it needs at the table: its maps, its place's
    // random encounters, its encounters (monsters to drag onto a map, and each
    // one's reward), its handouts to show, and its reward
    const details = (quest) => {
      if (quest.status !== "active") return "";
      return [
        this.#renderMaps(quest.foundryScenes),
        quest.locationId ? this.#renderPlaces([quest.locationId]) : "",
        this.#renderEncounters(quest),
        this.#renderHandouts(quest),
        this.#renderTreasure(quest, {
          collection: "quests",
          label: "Reward",
          coins: quest.rewardCurrency,
          xp: quest.rewardXp,
          milestone: quest.milestone,
        }),
      ].join("");
    };
    const items = quests
      .map(
        (quest) => `
        <li class="dlcp-quest">
          <div class="dlcp-quest-row">
            <span>${escapeHtml(quest.name)}</span>
            <select class="dlcp-quest-status" data-uuid="${escapeHtml(quest.uuid)}" aria-label="Status of ${escapeHtml(quest.name)}">
              ${Object.entries(QUEST_STATUSES)
                .map(([value, label]) => `<option value="${value}" ${quest.status === value ? "selected" : ""}>${label}</option>`)
                .join("")}
            </select>
          </div>
          ${details(quest)}
        </li>`,
      )
      .join("");
    return `<section><h2>Quests</h2>
      ${items ? `<ul class="dlcp-list dlcp-quests">${items}</ul>` : `<p class="dlcp-muted">No open quests.</p>`}
      <div class="dlcp-buttons">${this.#addButton("quests", "Add a quest")}</div></section>`;
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
      ui.notifications.error(
        this.sync.isLocal ? `Couldn't save: ${error.message}` : `Couldn't save to Dungeon Master Guru: ${error.message}`,
      );
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
      await syncWithFeedback(this.sync);
    } finally {
      this.#busy = false;
      this.render();
    }
  }

  static #onNewCampaign() {
    game.modules.get(MODULE_ID).api.openNewCampaign();
  }

  static async #onViewScene(_event, target) {
    const scene = await fromUuid(target.dataset.scene);
    if (scene) await scene.view();
    else ui.notifications.warn("That scene isn't in this world any more.");
  }

  static async #onActivateScene(_event, target) {
    const scene = await fromUuid(target.dataset.scene);
    if (scene) await scene.activate();
    else ui.notifications.warn("That scene isn't in this world any more.");
  }

  static #onPlan() {
    game.modules.get(MODULE_ID).api.openPlanner();
  }

  static #onOpenCampaign() {
    game.modules.get(MODULE_ID).api.openCampaignPicker();
  }

  // Opens the dialog for handing out a quest's reward or a session's treasure
  static #onGiveReward(_event, target) {
    const { collection, uuid } = target.dataset;
    const record = this.sync.recordLists()[collection]?.find((r) => r.uuid === uuid);
    if (!record) return;
    if (collection === "encounters") {
      return giveReward({ title: record.name, label: "Reward", owner: record, coins: record.rewardCurrency, xp: record.rewardXp });
    }
    if (collection === "quests") {
      return giveReward({
        title: record.name,
        label: "Reward",
        owner: record,
        coins: record.rewardCurrency,
        xp: record.rewardXp,
        milestone: record.milestone,
      });
    }
    return giveReward({ title: record.displayTitle ?? record.title, label: "Treasure", owner: record, coins: record.treasureCurrency });
  }

  static #onReportBug() {
    game.modules.get(MODULE_ID).api.openBugReport();
  }

  static #onImportMonster(_event, target) {
    return importMonster(this.sync, target.dataset.monsterId, target);
  }

  static #onRollTable(_event, target) {
    return rollTable(target.dataset.uuid);
  }

  static #onShowHandout(_event, target) {
    return showHandout(target.dataset.uuid);
  }

  static #onHelp() {
    game.modules.get(MODULE_ID).api.openHelp();
  }

  // Asks for a new record's details, then adds it to the local campaign
  static async #onAdd(_event, target) {
    const collection = target.dataset.collection;
    const form = addForm(collection, currentTechniques());
    if (!form) return;
    const field = (f) => {
      const id = `dlcp-add-${f.name}`;
      // A few short lines (portents, features): a list built a row at a time
      if (f.type === "lines") return listFieldHtml({ name: f.name, label: f.label, hint: f.hint, value: [], idPrefix: id, ...LIST_FIELDS[f.name] });
      const hint = f.hint ? `<p class="hint">${escapeHtml(f.hint)}</p>` : "";
      let control;
      if (f.type === "textarea") control = `<textarea id="${id}" name="${f.name}" rows="3"></textarea>`;
      else if (f.type === "select")
        control = `<select id="${id}" name="${f.name}">${f.options
          .map(([value, label]) => `<option value="${value}">${escapeHtml(label)}</option>`)
          .join("")}</select>`;
      else
        control = `<input id="${id}" name="${f.name}" type="${f.type === "number" ? "number" : "text"}"
          value="${escapeHtml(f.value ?? "")}" ${f.min ? `min="${f.min}" max="${f.max}"` : ""}>`;
      return `<div class="form-group ${f.type === "textarea" ? "stacked" : ""}">
        <label for="${id}">${escapeHtml(f.label)}${f.required ? " (required)" : ""}</label>${control}${hint}</div>`;
    };
    const values = await foundry.applications.api.DialogV2.prompt({
      window: { title: form.title },
      content: form.fields.map(field).join(""),
      ok: {
        label: "Add",
        icon: "fas fa-plus",
        callback: (_e, button) => Object.fromEntries(new FormData(button.form).entries()),
      },
      rejectClose: false,
    });
    if (!values) return;
    const result = await this.sync.addLocal(collection, values);
    if (result.error) ui.notifications.warn(result.error);
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
