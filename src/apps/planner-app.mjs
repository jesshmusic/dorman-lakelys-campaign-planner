import { ENCOUNTER_KIND_LABELS, clockSvg, creditHtml, currencyText, escapeHtml, truthsHtml } from "../render.mjs";
import { changeTruthRows, readTruthRows, truthsFieldHtml } from "../truths-editor.mjs";
import { listEditorHtml, listFieldHtml } from "../list-editor.mjs";
import { normalizeTruths } from "../setup.mjs";
import { MODULE_ID, SYNCED_HOOK } from "../constants.mjs";
import { ENCOUNTER_KINDS, NPC_ROLES, newRecord } from "../local.mjs";
import { prepSteps } from "../techniques.mjs";
import { currentTechniques } from "../technique-settings.mjs";
import { sendCampaign } from "./send-campaign.mjs";
import { exportAdventure } from "./export-adventure.mjs";
import { syncButton, syncStatus, syncWithFeedback } from "./sync-button.mjs";
import { contentLink, importMonster, monsterHtml, rollTable, rollTablesHtml, showHandout } from "./shared.mjs";
import { difficultyText, encounterDifficulty } from "../difficulty.mjs";
import {
  applyEncounter,
  encounterValues,
  encountersOf,
  itemLinks,
  legacyEncounter,
  monsterLinks,
  moveEncounter,
  withReference,
  withoutLink,
} from "../encounters.mjs";
import {
  COINS,
  LIST_FIELDS,
  actorChange,
  addHandout,
  addRollTable,
  addScene,
  removeHandout,
  removeRollTable,
  sceneChange,
  setLinkQuantity,
  QUEST_STATUSES,
  applyBrief,
  applyEdit,
  applyQuestReward,
  applySessionPrep,
  briefFields,
  editForm,
  formValues,
  gettingStarted,
  ROLE_LABELS,
  roleFromDisposition,
  linkedIds,
  revelationGroups,
  setLinks,
  threatsIntro,
} from "../planner.mjs";

const TABS = [
  { id: "overview", label: "Overview", icon: "fa-book" },
  { id: "party", label: "Party", icon: "fa-users" },
  { id: "story", label: "Story", icon: "fa-skull" },
  { id: "quests", label: "Quests", icon: "fa-scroll" },
  { id: "cast", label: "Cast", icon: "fa-user" },
  { id: "places", label: "Places", icon: "fa-map" },
  { id: "secrets", label: "Secrets", icon: "fa-key" },
  { id: "sessions", label: "Sessions", icon: "fa-calendar-days" },
];

const MODE_LABELS = { arc: "Story arc", sandbox: "Sandbox", oneshot: "One-shot" };
const STATUS_LABELS = { available: "Available", active: "Active", completed: "Completed", failed: "Failed" };
const SESSION_STATUS_LABELS = { planned: "Planned", prepped: "Prepped", played: "Played" };
const NOUNS = { fronts: "threat", quests: "quest", npcs: "NPC", locations: "place", factions: "faction", secrets: "secret" };
// Book references that are treasure: anything but a monster
const TREASURE = ["magic_item", "equipment", "table", "spell", "other"];

// The Lazy DM's eight steps, as the website words them. Numbered as they're
// shown: without secrets and clues, there are seven.
const PREP_STEPS = {
  characters: ["Review the characters", "What does each character want? What hooks might pull them in this session?"],
  strongStart: ["Create a strong start", "Open with something happening that pulls the players straight into the game."],
  scenes: ["Outline potential scenes", "A short list of scenes that might happen. Be ready to throw them away."],
  secrets: ["Define secrets and clues", "Pick around ten unrevealed secrets the party could discover. Don't decide how."],
  locations: ["Develop fantastic locations", "Places that might come up, each with a few evocative features."],
  npcs: ["Outline important NPCs", "Who is likely to show up?"],
  monsters: ["Choose relevant monsters", "Monsters that fit the locations and story, ready to drop in anywhere."],
  treasure: ["Select treasure and magic items", "Rewards that suit the characters."],
};

// Where the brief's fields come from, credited under them
const BRIEF_CREDITS = { pitch: ["pitch"], truths: ["truths"] };

// A form field; `extra` is markup that's already safe, shown under its hint.
// Truths are a list editor, its value the rows.
const field = (f, value, extra = "") => {
  const id = `dlcp-planner-${f.name}`;
  if (f.type === "truths") return truthsFieldHtml({ label: f.label, hint: f.hint, rows: value, idPrefix: id, extra });
  const label = `<label for="${id}">${escapeHtml(f.label)}${f.required ? " (required)" : ""}</label>`;
  const hint = `${f.hint ? `<p class="hint">${escapeHtml(f.hint)}</p>` : ""}${extra}`;
  // A few short lines (portents, stakes, features): a list the GM builds a row at a time
  if (f.type === "lines") {
    return listFieldHtml({ name: f.name, label: f.label, hint: f.hint, value, idPrefix: id, extra, ...LIST_FIELDS[f.name] });
  }
  if (f.type === "textarea") {
    return `<div class="form-group stacked">${label}<textarea id="${id}" name="${f.name}" rows="3">${escapeHtml(value)}</textarea>${hint}</div>`;
  }
  return `<div class="form-group">${label}<input id="${id}" name="${f.name}" type="${f.type === "number" ? "number" : "text"}"
    value="${escapeHtml(value)}" ${f.min !== undefined ? `min="${f.min}" max="${f.max}"` : ""}>${hint}</div>`;
};

/**
 * The Campaign Planner: the whole campaign in one window, with the same tabs
 * as Dungeon Master Guru's planner. A campaign that lives in this world can
 * be edited here; one on Dungeon Master Guru is shown read-only, apart from
 * what syncs from Foundry: clocks, portents, secrets, quest status, maps,
 * actors, and coins and XP.
 */
export class PlannerApp extends foundry.applications.api.ApplicationV2 {
  static DEFAULT_OPTIONS = {
    id: "dlcp-planner",
    classes: ["dlcp-app", "dlcp-planner"],
    tag: "div",
    window: {
      title: "Campaign Planner",
      icon: "fas fa-feather-alt",
      resizable: true,
      controls: [
        { icon: "fas fa-scroll", label: "Run it (Campaign Dashboard)", action: "run" },
        { icon: "fas fa-feather-alt", label: "New campaign", action: "newCampaign" },
        { icon: "fas fa-right-left", label: "Switch campaign", action: "openCampaign" },
        { icon: "fas fa-circle-question", label: "Help", action: "help" },
        { icon: "fas fa-cloud-arrow-up", label: "Send to Dungeon Master Guru", action: "sendCampaign" },
        { icon: "fas fa-box-archive", label: "Export as Adventure", action: "exportAdventure", visible: () => game.user.isGM },
        { icon: "fas fa-bug", label: "Report a bug", action: "reportBug" },
      ],
    },
    position: { width: 880, height: 760 },
    actions: {
      syncNow: PlannerApp.#onSyncNow,
      showTab: PlannerApp.#onShowTab,
      add: PlannerApp.#onAdd,
      edit: PlannerApp.#onEdit,
      delete: PlannerApp.#onDelete,
      openPage: PlannerApp.#onOpenPage,
      openSheet: PlannerApp.#onOpenSheet,
      saveBrief: PlannerApp.#onSaveBrief,
      editTruth: PlannerApp.#onEditTruth,
      advanceClock: PlannerApp.#onAdvanceClock,
      windBackClock: PlannerApp.#onWindBackClock,
      togglePortent: PlannerApp.#onTogglePortent,
      revealSecret: PlannerApp.#onRevealSecret,
      hideSecret: PlannerApp.#onHideSecret,
      openSession: PlannerApp.#onOpenSession,
      closeSession: PlannerApp.#onCloseSession,
      openQuest: PlannerApp.#onOpenQuest,
      closeQuest: PlannerApp.#onCloseQuest,
      saveQuest: PlannerApp.#onSaveQuest,
      removeQuestLink: PlannerApp.#onRemoveQuestLink,
      removeQuestScene: PlannerApp.#onRemoveQuestScene,
      addEncounter: PlannerApp.#onAddEncounter,
      removeEncounter: PlannerApp.#onRemoveEncounter,
      moveEncounter: PlannerApp.#onMoveEncounter,
      removeEncounterLink: PlannerApp.#onRemoveEncounterLink,
      removeEncounterScene: PlannerApp.#onRemoveEncounterScene,
      removeHandout: PlannerApp.#onRemoveHandout,
      showHandout: PlannerApp.#onShowHandout,
      removeRollTable: PlannerApp.#onRemoveRollTable,
      rollTable: PlannerApp.#onRollTable,
      importMonster: PlannerApp.#onImportMonster,
      saveSession: PlannerApp.#onSaveSession,
      addSession: PlannerApp.#onAddSession,
      removeLink: PlannerApp.#onRemoveLink,
      clearScene: PlannerApp.#onClearScene,
      clearActor: PlannerApp.#onClearActor,
      removeSessionScene: PlannerApp.#onRemoveSessionScene,
      run: PlannerApp.#onRun,
      newCampaign: PlannerApp.#onNewCampaign,
      openCampaign: PlannerApp.#onOpenCampaign,
      connect: PlannerApp.#onConnect,
      help: PlannerApp.#onHelp,
      reportBug: PlannerApp.#onReportBug,
      sendCampaign: PlannerApp.#onSendCampaign,
      exportAdventure: PlannerApp.#onExportAdventure,
    },
  };

  #tab = "overview";
  #syncing = false;
  #sessionId = null;
  #questId = null;
  #hookId = null;

  get sync() {
    return game.modules.get(MODULE_ID).api.sync;
  }

  get title() {
    return this.sync.linked ? `Campaign Planner: ${this.sync.linked.name}` : "Campaign Planner";
  }

  // A campaign in this world, or a synced one: both can be changed here
  get #editable() {
    return this.sync.editable;
  }

  // The techniques this world uses; the ones switched off are hidden
  get #techniques() {
    return currentTechniques();
  }

  /** Opens on a tab, a session's prep, or a quest's plan */
  show({ tab, sessionId, questId } = {}) {
    if (tab) this.#tab = tab;
    if (sessionId !== undefined) this.#sessionId = sessionId;
    if (questId !== undefined) this.#questId = questId;
    return this.render({ force: true, window: { title: this.title } });
  }

  async _onFirstRender(context, options) {
    await super._onFirstRender?.(context, options);
    this.#hookId = Hooks.on(SYNCED_HOOK, () => this.render({ window: { title: this.title } }));
    this.element.addEventListener("change", (event) => this.#onChange(event));
  }

  async _onClose(options) {
    if (this.#hookId !== null) Hooks.off(SYNCED_HOOK, this.#hookId);
    this.#hookId = null;
    await super._onClose?.(options);
  }

  async _onRender(context, options) {
    await super._onRender?.(context, options);
    for (const zone of this.element.querySelectorAll(".dlcp-drop")) {
      zone.addEventListener("dragover", (event) => event.preventDefault());
      zone.addEventListener("drop", (event) => this.#onDrop(event, zone.dataset.kind, zone.dataset.uuid));
    }
  }

  async _renderHTML() {
    const container = document.createElement("div");
    container.classList.add("dlcp-planner-body");
    container.innerHTML = this.sync.linked ? this.#renderCampaign() : this.#renderNoCampaign();
    return container;
  }

  _replaceHTML(result, content) {
    content.replaceChildren(result);
  }

  // Layout --------------------------------------------------------------------

  #renderNoCampaign() {
    return `<p>This world doesn't have a campaign yet.</p>
      <div class="dlcp-buttons">
        <button type="button" data-action="newCampaign"><i class="fas fa-feather-alt"></i> New campaign</button>
        <button type="button" data-action="openCampaign"><i class="fas fa-folder-open"></i> Open a campaign</button>
        <button type="button" data-action="help"><i class="fas fa-circle-question"></i> How it works</button>
      </div>`;
  }

  #renderCampaign() {
    const store = this.sync.recordLists();
    const campaign = store.campaign[0] ?? { name: this.sync.linked.name };
    const site = campaign.slug ? `${this.sync.baseUrl}/app/campaigns/${encodeURIComponent(campaign.slug)}` : this.sync.baseUrl;
    const techniques = this.#techniques;
    if (this.#tab === "secrets" && !techniques.secrets) this.#tab = "overview";
    const where = this.sync.isLocal
      ? `<span class="dlcp-muted"><i class="fas fa-house"></i> In this world</span>`
      : `<span class="dlcp-muted"><i class="fas fa-globe"></i> On Dungeon Master Guru</span> ${syncStatus(this.sync)}`;
    const nav = TABS.filter((tab) => tab.id !== "secrets" || techniques.secrets).map(
      (tab) => `<button type="button" data-action="showTab" data-tab="${tab.id}" ${tab.id === this.#tab ? 'aria-current="page"' : ""}>
        <i class="fas ${tab.icon}"></i> ${tab.label}</button>`,
    ).join("");
    return `
      <header class="dlcp-toolbar">
        <span>${where} ${campaign.mode ? `<span class="dlcp-badge">${escapeHtml(MODE_LABELS[campaign.mode] ?? campaign.mode)}</span>` : ""}</span>
        <span class="dlcp-buttons"><button type="button" data-action="openCampaign" data-tooltip="Switch to another campaign"><i class="fas fa-right-left"></i> Switch campaign</button>${syncButton(this.sync, { busy: this.#syncing })}<button type="button" data-action="run"><i class="fas fa-scroll"></i> Campaign Dashboard</button></span>
      </header>
      ${
        this.sync.isLocal
          ? ""
          : this.#editable
            ? `<p class="dlcp-notice">This campaign is on Dungeon Master Guru. Changes you make here are saved in this world;
                <strong>Sync</strong> sends them there and brings back what changed there.
                <a href="${escapeHtml(site)}" target="_blank" rel="noopener">Open it on Dungeon Master Guru</a></p>`
            : `<p class="dlcp-notice">This campaign is planned on Dungeon Master Guru. To change it here, connect this browser
                to Dungeon Master Guru (<strong>Connect</strong> in the Dashboard's menu).
                <a href="${escapeHtml(site)}" target="_blank" rel="noopener">Plan it on Dungeon Master Guru</a></p>`
      }
      <nav class="dlcp-tabs" aria-label="Campaign sections">${nav}</nav>
      <div class="dlcp-tab">${this.#renderTab(store, campaign)}</div>`;
  }

  #renderTab(store, campaign) {
    switch (this.#tab) {
      case "party":
        return this.#renderParty(campaign);
      case "story":
        return this.#renderStory(store);
      case "quests":
        return this.#questId ? this.#renderQuestPlan(store) : this.#renderQuests(store);
      case "cast":
        return this.#renderCast(store);
      case "places":
        return this.#renderPlaces(store);
      case "secrets":
        return this.#renderSecrets(store);
      case "sessions":
        return this.#sessionId ? this.#renderPrep(store, campaign) : this.#renderSessions(store);
      default:
        return this.#renderOverview(store, campaign);
    }
  }

  // Shared pieces -------------------------------------------------------------

  #addButton(collection) {
    return this.#editable
      ? `<button type="button" class="dlcp-add" data-action="add" data-collection="${collection}"><i class="fas fa-plus"></i> Add ${NOUNS[collection] === "NPC" ? "an NPC" : `a ${NOUNS[collection]}`}</button>`
      : "";
  }

  #recordButtons(collection, record) {
    const page = `<button type="button" class="dlcp-icon-button" data-action="openPage" data-collection="${collection}" data-uuid="${escapeHtml(record.uuid)}" aria-label="Open the journal page" data-tooltip="Open the journal page"><i class="fas fa-book-open"></i></button>`;
    if (!this.#editable) return `<span class="dlcp-record-buttons">${page}</span>`;
    return `<span class="dlcp-record-buttons">${page}
      <button type="button" class="dlcp-icon-button" data-action="edit" data-collection="${collection}" data-id="${escapeHtml(record.id)}" aria-label="Edit" data-tooltip="Edit"><i class="fas fa-pen"></i></button>
      <button type="button" class="dlcp-icon-button" data-action="delete" data-collection="${collection}" data-id="${escapeHtml(record.id)}" aria-label="Delete" data-tooltip="Delete"><i class="fas fa-trash"></i></button>
    </span>`;
  }

  #empty(textValue) {
    return `<p class="dlcp-muted">${escapeHtml(textValue)}</p>`;
  }

  // Overview ------------------------------------------------------------------

  #renderOverview(store, campaign) {
    const techniques = this.#techniques;
    const steps = gettingStarted(campaign, store, techniques);
    const done = steps.filter((step) => step.done).length;
    const checklist =
      done === steps.length
        ? ""
        : `<section class="dlcp-card"><header class="dlcp-card-header"><h3>Getting started</h3><span class="dlcp-muted">${done} of ${steps.length} done</span></header>
          <ol class="dlcp-steps-list">${steps
            .map(
              (step) => `<li>
                <button type="button" class="dlcp-link-button" data-action="showTab" data-tab="${step.tab}" ${step.sessionId ? `data-session-id="${escapeHtml(step.sessionId)}"` : ""}>${escapeHtml(step.label)}</button>
                ${step.done ? `<span class="dlcp-badge">Done</span>` : ""}
                <p class="dlcp-muted">${escapeHtml(step.detail)}</p></li>`,
            )
            .join("")}</ol></section>`;

    const fields = briefFields(techniques);
    const values = formValues(fields, campaign);
    const credit = (f) => (BRIEF_CREDITS[f.name] ? creditHtml(BRIEF_CREDITS[f.name], techniques) : "");
    const brief = this.#editable
      ? `<form class="dlcp-brief" data-form="brief">
          <div class="dlcp-grid">${fields.filter((f) => f.type === "text" || f.type === "number")
            .map((f) => field(f, values[f.name]))
            .join("")}</div>
          ${fields.filter((f) => ["textarea", "lines", "truths"].includes(f.type))
            .map((f) => field(f, values[f.name], credit(f)))
            .join("")}
          <div class="dlcp-buttons"><button type="button" data-action="saveBrief"><i class="fas fa-save"></i> Save the brief</button></div>
        </form>`
      : `<section class="dlcp-card">
          ${campaign.premise ? `<h3>Premise</h3><p>${escapeHtml(campaign.premise)}</p>` : ""}
          ${campaign.pitch ? `<h3>Pitch for your players</h3><p>${escapeHtml(campaign.pitch)}</p>${creditHtml(["pitch"], techniques)}` : ""}
          ${techniques.truths && normalizeTruths(campaign.truths).length ? `<h3>Truths of the setting</h3>${truthsHtml(campaign.truths)}${creditHtml(["truths"], techniques)}` : ""}
        </section>`;
    const send = this.sync.isLocal
      ? `<section class="dlcp-card dlcp-send">
          <header class="dlcp-card-header"><h3><i class="fas fa-cloud-arrow-up"></i> Plan it on Dungeon Master Guru too</h3></header>
          <p class="dlcp-muted">Send this campaign to Dungeon Master Guru to plan it from any computer or phone. This world
            then syncs with it, and its journals stay where they are.</p>
          <div class="dlcp-buttons"><button type="button" data-action="sendCampaign"><i class="fas fa-cloud-arrow-up"></i> Send to Dungeon Master Guru</button></div>
        </section>`
      : "";
    const share = game.user.isGM
      ? `<section class="dlcp-card dlcp-send">
          <header class="dlcp-card-header"><h3><i class="fas fa-box-archive"></i> Share it as an Adventure</h3></header>
          <p class="dlcp-muted">Pack its journals, maps and actors into a Foundry Adventure in a compendium, to import into
            another world with Foundry's Adventure importer. There it opens as a campaign of its own.</p>
          <div class="dlcp-buttons"><button type="button" data-action="exportAdventure"><i class="fas fa-box-archive"></i> Export as Adventure</button></div>
        </section>`
      : "";
    return `${checklist}<h2>The brief</h2>${brief}${send}${share}`;
  }

  // Party ---------------------------------------------------------------------

  #renderParty(campaign) {
    if (!this.sync.isLocal) {
      return `<p>The party for this campaign is chosen on Dungeon Master Guru, from your world's player characters.</p>`;
    }
    const options = this.sync.partyOptions();
    if (!options.length) {
      return this.#empty(
        "This world has no Player Character actors yet. Create them in the Actors directory, then pick the party here.",
      );
    }
    const party = campaign.partyActorUuids ?? [];
    return `<p class="dlcp-muted">Pick the player characters in this campaign's party. Session prep starts with them.</p>
      <table class="dlcp-party">
        <thead><tr><th aria-label="In the party"></th><th>Name</th><th>Class</th><th>Level</th><th>Player</th></tr></thead>
        <tbody>${options
          .map(
            (option) => `<tr>
              <td><input type="checkbox" data-party="${escapeHtml(option.uuid)}" aria-label="${escapeHtml(option.name)} is in the party" ${party.includes(option.uuid) ? "checked" : ""}></td>
              <td><button type="button" class="dlcp-link-button" data-action="openSheet" data-uuid="${escapeHtml(option.uuid)}">${escapeHtml(option.name)}</button></td>
              <td>${escapeHtml(option.classes || "—")}</td><td>${escapeHtml(option.level ?? "—")}</td><td>${escapeHtml(option.playerName ?? "—")}</td>
            </tr>`,
          )
          .join("")}</tbody>
      </table>`;
  }

  // Story ---------------------------------------------------------------------

  #renderStory(store) {
    const techniques = this.#techniques;
    const nameOf = (collection, id) => store[collection]?.find((r) => r.id === id)?.name;
    const threats = store.fronts
      .map((front) => {
        const portents = techniques.portents
          ? (front.portents ?? [])
              .map(
                (portent, index) => `<label class="dlcp-portent"><input type="checkbox" data-action="togglePortent" data-uuid="${escapeHtml(front.uuid)}" data-index="${index}" ${portent.triggered ? "checked" : ""}> ${escapeHtml(portent.text)}</label>`,
              )
              .join("")
          : "";
        const clock = techniques.clocks
          ? `<div class="dlcp-front-clock">
            <button type="button" data-action="windBackClock" data-uuid="${escapeHtml(front.uuid)}" aria-label="Wind back ${escapeHtml(front.name)}" ${front.clockFilled <= 0 ? "disabled" : ""}>−</button>
            ${clockSvg(front.clockSegments, front.clockFilled, 64)}
            <button type="button" data-action="advanceClock" data-uuid="${escapeHtml(front.uuid)}" aria-label="Advance ${escapeHtml(front.name)}" ${front.clockFilled >= front.clockSegments ? "disabled" : ""}>+</button>
          </div>`
          : "";
        return `<li class="dlcp-card dlcp-front">
          ${clock}
          <div class="dlcp-grow">
            <header class="dlcp-card-header"><h3>${escapeHtml(front.name)}</h3>${this.#recordButtons("fronts", front)}</header>
            ${front.goal ? `<p><strong>Wants:</strong> ${escapeHtml(front.goal)}</p>` : ""}
            ${front.doom ? `<p><strong>If no one stops it:</strong> ${escapeHtml(front.doom)}</p>` : ""}
            ${[nameOf("npcs", front.npcId) && `Villain: ${nameOf("npcs", front.npcId)}`, nameOf("factions", front.factionId) && `Faction: ${nameOf("factions", front.factionId)}`].filter(Boolean).map((t) => `<p class="dlcp-muted">${escapeHtml(t)}</p>`).join("")}
            ${portents}
            ${(front.stakes ?? []).length ? `<p><strong>Stakes:</strong></p><ul>${front.stakes.map((s) => `<li>${escapeHtml(s)}</li>`).join("")}</ul>` : ""}
          </div>
        </li>`;
      })
      .join("");
    const factions = store.factions
      .map(
        (faction) => `<li class="dlcp-card"><header class="dlcp-card-header"><h3>${escapeHtml(faction.name)}</h3>${this.#recordButtons("factions", faction)}</header>
          ${faction.goal ? `<p><strong>Wants:</strong> ${escapeHtml(faction.goal)}</p>` : ""}
          ${faction.description ? `<p>${escapeHtml(faction.description)}</p>` : ""}</li>`,
      )
      .join("");
    return `<h2>Threats</h2>
      <p class="dlcp-muted">${escapeHtml(threatsIntro(techniques))}</p>
      ${creditHtml(["threats", "clocks"], techniques)}
      ${threats ? `<ul class="dlcp-cards">${threats}</ul>` : this.#empty("No threats yet.")}
      <div class="dlcp-buttons">${this.#addButton("fronts")}</div>
      <h2>Factions</h2>
      ${factions ? `<ul class="dlcp-cards">${factions}</ul>` : this.#empty("No factions yet.")}
      <div class="dlcp-buttons">${this.#addButton("factions")}</div>`;
  }

  // Quests --------------------------------------------------------------------

  #renderQuests(store) {
    const nameOf = (collection, id) => store[collection]?.find((r) => r.id === id)?.name;
    const card = (quest) => `<li class="dlcp-card">
      <header class="dlcp-card-header"><h3>${escapeHtml(quest.name)}</h3>${this.#recordButtons("quests", quest)}</header>
      <p class="dlcp-quest-meta">
        <select data-quest-status="${escapeHtml(quest.uuid)}" aria-label="Status of ${escapeHtml(quest.name)}">
          ${QUEST_STATUSES.map((status) => `<option value="${status}" ${quest.status === status ? "selected" : ""}>${STATUS_LABELS[status]}</option>`).join("")}
        </select>
        ${quest.act ? `<span class="dlcp-muted">Act ${escapeHtml(quest.act)}</span>` : ""}
      </p>
      ${quest.description ? `<p>${escapeHtml(quest.description)}</p>` : ""}
      ${[
        nameOf("quests", quest.parentId) && `Part of ${nameOf("quests", quest.parentId)}`,
        nameOf("npcs", quest.giverNpcId) && `Given by ${nameOf("npcs", quest.giverNpcId)}`,
        nameOf("locations", quest.locationId) && `At ${nameOf("locations", quest.locationId)}`,
      ]
        .filter(Boolean)
        .map((t) => `<p class="dlcp-muted">${escapeHtml(t)}</p>`)
        .join("")}
      ${this.#questSummary(store, quest)}
      <div class="dlcp-buttons"><button type="button" data-action="openQuest" data-id="${escapeHtml(quest.id)}"><i class="fas fa-map-signs"></i> Plan the quest</button></div>
    </li>`;
    const sorted = [...store.quests].sort(
      (a, b) => (a.act ?? 99) - (b.act ?? 99) || (a.position ?? 0) - (b.position ?? 0) || a.name.localeCompare(b.name),
    );
    const lane = (kind, title) => {
      const quests = sorted.filter((quest) => (quest.kind ?? "main") === kind);
      return `<section class="dlcp-lane"><h2>${title}</h2>${quests.length ? `<ul class="dlcp-cards">${quests.map(card).join("")}</ul>` : this.#empty(`No ${title.toLowerCase()} yet.`)}</section>`;
    };
    return `<p class="dlcp-muted">Main and side quests. Plan each one's maps, NPCs, encounters, handouts and reward.</p>
      <div class="dlcp-lanes">${lane("main", "Main quests")}${lane("side", "Side quests")}</div>
      <div class="dlcp-buttons">${this.#addButton("quests")}</div>`;
  }

  // What a quest needs and gives, in short, for its card
  #questSummary(store, quest) {
    const maps = (quest.foundryScenes ?? []).map((scene) => contentLink(scene.uuid, scene.name, "map"));
    const npcs = (quest.links ?? [])
      .filter((link) => link.linkableType === "CampaignNpc")
      .map((link) => escapeHtml(store.npcs.find((npc) => npc.id === link.linkableId)?.name ?? link.name));
    const encounters = [
      legacyEncounter(quest, store.references) && "Encounter",
      ...encountersOf(store.encounters, quest.id).map((encounter) => encounter.name),
    ]
      .filter(Boolean)
      .map(escapeHtml);
    const handouts = (quest.handouts ?? []).map((handout) => contentLink(handout.uuid, handout.name, "book-open"));
    const reward = [
      currencyText(quest.rewardCurrency) && escapeHtml(currencyText(quest.rewardCurrency)),
      ...this.#linkNames(store, quest, TREASURE, "Item"),
      quest.rewardXp && `${escapeHtml(quest.rewardXp)} XP`,
      quest.milestone && "level up (milestone)",
      quest.reward && escapeHtml(quest.reward),
    ].filter(Boolean);
    return [
      ["Maps", maps],
      ["NPCs", npcs],
      ["Encounters", encounters],
      ["Handouts", handouts],
      ["Reward", reward],
    ]
      .filter(([, parts]) => parts.length)
      .map(([label, parts]) => `<p><strong>${label}:</strong> ${parts.join(", ")}</p>`)
      .join("");
  }

  // A session's or quest's monsters or treasure as links (with how many), from
  // book references and, for Dungeon Master Guru campaigns, its own SRD entries
  #linkNames(store, owner, categories, srdType) {
    return (owner.links ?? []).flatMap((link) => {
      const quantity = link.quantity > 1 ? ` ×${escapeHtml(link.quantity)}` : "";
      if (link.linkableType === srdType) return [`${escapeHtml(link.name)}${quantity}`];
      if (link.linkableType !== "CampaignReference") return [];
      const reference = store.references.find((r) => r.id === link.linkableId);
      if (!reference || !categories.includes(reference.category)) return [];
      const name = reference.foundryUuid
        ? contentLink(reference.foundryUuid, reference.name, reference.category === "monster" ? "user" : "suitcase")
        : escapeHtml(reference.name);
      return [`${name}${quantity}`];
    });
  }

  // A monster or item link's name: a link to its compendium entry or actor
  // when there is one, and for a Dungeon Master Guru monster with none, a
  // button to import it
  #linkLabel(store, link, lookup) {
    if (link.linkableType === "Monster") return monsterHtml(this.sync, { id: link.linkableId, name: link.name }, lookup);
    if (link.linkableType === "Item") return escapeHtml(link.name);
    const reference = store.references.find((r) => r.id === link.linkableId);
    if (!reference) return escapeHtml(link.name);
    return reference.foundryUuid
      ? contentLink(reference.foundryUuid, reference.name, reference.category === "monster" ? "user" : "suitcase")
      : escapeHtml(reference.name);
  }

  // What's after a link's name: a monster's CR, a book entry's citation
  #linkDetail(store, link) {
    const reference = link.linkableType === "CampaignReference" ? store.references.find((r) => r.id === link.linkableId) : null;
    const detail = reference
      ? [reference.challengeRating && `CR ${reference.challengeRating}`, reference.citation].filter(Boolean).join(" · ")
      : link.detail;
    return detail ? ` <span class="dlcp-muted">${escapeHtml(detail)}</span>` : "";
  }

  // An encounter's monsters or items, each with how many and a remove button
  #encounterLinkRows(store, encounter, links, { lookup, noun }) {
    if (!links.length) return "";
    const id = encounter.id;
    return `<ul class="dlcp-list">${links
      .map(
        (link) => `<li><span class="dlcp-grow">${this.#linkLabel(store, link, lookup)}${this.#linkDetail(store, link)}</span>
          <input class="dlcp-quantity" type="number" min="1" max="9999" name="enc.${escapeHtml(id)}.qty_${escapeHtml(link.id)}" value="${escapeHtml(link.quantity ?? 1)}" aria-label="How many ${escapeHtml(link.name)}" data-tooltip="How many">
          <button type="button" class="dlcp-link-button" data-action="removeEncounterLink" data-encounter="${escapeHtml(id)}" data-link-id="${escapeHtml(link.id)}" aria-label="Remove ${escapeHtml(link.name)} from the ${noun}">remove</button></li>`,
      )
      .join("")}</ul>`;
  }

  // How hard a combat encounter is for the party, by the 2024 rules
  #difficulty(store, encounter, quest) {
    const difficulty = encounterDifficulty(encounter, {
      references: store.references,
      campaign: store.campaign[0],
      quest,
      tables: this.sync.xpTables,
    });
    return difficulty ? `<p class="dlcp-difficulty"><strong>Difficulty:</strong> ${escapeHtml(difficultyText(difficulty))}</p>` : "";
  }

  // One encounter's card in the quest plan: everything in it is saved with the quest
  #encounterCard(store, encounter, { quest, index, count, lookup }) {
    const id = escapeHtml(encounter.id);
    const name = (field) => `enc.${id}.${field}`;
    const npcLinks = new Set(
      (encounter.links ?? []).filter((link) => link.linkableType === "CampaignNpc").map((link) => link.linkableId),
    );
    const npcs = store.npcs.length
      ? `<div class="dlcp-checks">${store.npcs
          .map(
            (npc) => `<label class="dlcp-check"><input type="checkbox" data-encounter-npc="${id}" value="${escapeHtml(npc.id)}" ${npcLinks.has(npc.id) ? "checked" : ""}> ${escapeHtml(npc.name)}</label>`,
          )
          .join("")}</div>`
      : this.#empty("No NPCs in the campaign yet. Add them on the Cast tab.");
    const maps = `${
      (encounter.foundryScenes ?? []).length
        ? `<ul class="dlcp-list">${encounter.foundryScenes
            .map(
              (scene) => `<li><span class="dlcp-grow">${contentLink(scene.uuid, scene.name, "map")}</span>
                <button type="button" class="dlcp-link-button" data-action="removeEncounterScene" data-encounter="${id}" data-scene="${escapeHtml(scene.uuid)}" aria-label="Remove ${escapeHtml(scene.name)}">remove</button></li>`,
            )
            .join("")}</ul>`
        : ""
    }<div class="dlcp-drop dlcp-drop--small" data-kind="encounterScene" data-uuid="${escapeHtml(encounter.uuid)}"><i class="fas fa-map"></i> Drag scenes here for this encounter's maps.</div>`;
    const kinds = ENCOUNTER_KINDS.map(
      (kind) => `<option value="${kind}" ${encounter.kind === kind ? "selected" : ""}>${ENCOUNTER_KIND_LABELS[kind]}</option>`,
    ).join("");
    const button = (action, icon, label, extra = "") =>
      `<button type="button" class="dlcp-icon-button" data-action="${action}" data-id="${id}" ${extra} aria-label="${label}" data-tooltip="${label}"><i class="fas fa-${icon}"></i></button>`;
    return `<section class="dlcp-card dlcp-encounter" data-encounter-card="${id}">
      <header class="dlcp-card-header">
        <input type="text" class="dlcp-grow" name="${name("name")}" value="${escapeHtml(encounter.name)}" aria-label="Encounter name" maxlength="120">
        <select name="${name("kind")}" aria-label="Type of encounter">${kinds}</select>
        <span class="dlcp-record-buttons">
          ${button("moveEncounter", "arrow-up", "Move up", `data-delta="-1" ${index === 0 ? "disabled" : ""}`)}
          ${button("moveEncounter", "arrow-down", "Move down", `data-delta="1" ${index === count - 1 ? "disabled" : ""}`)}
          <button type="button" class="dlcp-icon-button" data-action="openPage" data-collection="encounters" data-uuid="${escapeHtml(encounter.uuid)}" aria-label="Open the journal page" data-tooltip="Open the journal page"><i class="fas fa-book-open"></i></button>
          ${button("removeEncounter", "trash", "Remove")}
        </span>
      </header>
      <textarea name="${name("description")}" rows="2" aria-label="What happens" placeholder="What happens: the situation, what the monsters or NPCs want…">${escapeHtml(encounter.description ?? "")}</textarea>
      ${this.#difficulty(store, encounter, quest)}
      <h4>Monsters</h4>
      ${this.#encounterLinkRows(store, encounter, monsterLinks(encounter, store.references), { lookup, noun: "encounter" })}
      <div class="dlcp-drop dlcp-drop--small" data-kind="encounterMonster" data-uuid="${escapeHtml(encounter.uuid)}"><i class="fas fa-dragon"></i> Drag monsters here from a compendium or the Actors directory, then set how many.</div>
      <h4>NPCs</h4>
      ${npcs}
      <h4>Maps</h4>
      ${maps}
      <h4>Reward</h4>
      <div class="dlcp-coins">${COINS.map(
        (coin) => `<label>${coin}<input type="number" min="0" name="${name(`coin_${coin}`)}" value="${escapeHtml(encounter.rewardCurrency?.[coin] ?? "")}" aria-label="${coin}"></label>`,
      ).join("")}</div>
      <div class="form-group"><label for="dlcp-encounter-xp-${id}">XP</label><input id="dlcp-encounter-xp-${id}" name="${name("rewardXp")}" type="number" min="0" value="${escapeHtml(encounter.rewardXp ?? "")}"></div>
      ${this.#encounterLinkRows(store, encounter, itemLinks(encounter, store.references), { lookup, noun: "reward" })}
      <div class="dlcp-drop dlcp-drop--small" data-kind="encounterTreasure" data-uuid="${escapeHtml(encounter.uuid)}"><i class="fas fa-gem"></i> Drag items or roll tables here for this encounter's reward.</div>
      <details ${encounter.notes ? "open" : ""}><summary>Notes</summary>
        <textarea name="${name("notes")}" rows="2" aria-label="Notes">${escapeHtml(encounter.notes ?? "")}</textarea></details>
    </section>`;
  }

  // An encounter shown but not changed here: monsters a quest had before
  // encounters, or a campaign that can't be changed in this browser
  #encounterSummary(store, encounter, { quest, lookup, legacy = false }) {
    const monsters = monsterLinks(encounter, store.references).map(
      (link) => `<li>${this.#linkLabel(store, link, lookup)}${link.quantity > 1 ? ` ×${escapeHtml(link.quantity)}` : ""}${this.#linkDetail(store, link)}</li>`,
    );
    const title = legacy ? "Encounter" : `${ENCOUNTER_KIND_LABELS[encounter.kind] ?? "Other"}: ${encounter.name}`;
    return `<section class="dlcp-card dlcp-encounter">
      <header class="dlcp-card-header"><h4>${escapeHtml(title)}</h4></header>
      ${legacy ? `<p class="dlcp-muted">The monsters this quest had before encounters. They move into an encounter of their own${this.sync.isLocal ? "" : " when Dungeon Master Guru moves them and you Sync"}.</p>` : ""}
      ${encounter.description ? `<p>${escapeHtml(encounter.description)}</p>` : ""}
      ${legacy ? "" : this.#difficulty(store, encounter, quest)}
      ${monsters.length ? `<ul>${monsters.join("")}</ul>` : ""}
    </section>`;
  }

  // A quest's plan: its maps, NPCs, encounters, handouts and reward. In this
  // world it's all edited here; for a Dungeon Master Guru campaign too, unless
  // this browser can't change it.
  #renderQuestPlan(store) {
    const quest = store.quests.find((q) => q.id === this.#questId);
    if (!quest) {
      this.#questId = null;
      return this.#renderQuests(store);
    }
    const editable = this.#editable;
    const nameOf = (collection, id) => store[collection]?.find((r) => r.id === id)?.name;
    const back = `<button type="button" class="dlcp-link-button" data-action="closeQuest"><i class="fas fa-arrow-left"></i> All quests</button>`;
    const part = (title, hint, body) => `<section class="dlcp-card dlcp-prep-step"><h3>${escapeHtml(title)}</h3>
      <p class="dlcp-muted">${escapeHtml(hint)}</p>${body}</section>`;
    const facts = [
      quest.kind === "side" ? "Side quest" : "Main quest",
      quest.act && `Act ${quest.act}`,
      nameOf("npcs", quest.giverNpcId) && `Given by ${nameOf("npcs", quest.giverNpcId)}`,
      nameOf("locations", quest.locationId) && `At ${nameOf("locations", quest.locationId)}`,
      nameOf("quests", quest.parentId) && `Part of ${nameOf("quests", quest.parentId)}`,
    ].filter(Boolean);
    const lookup = this.sync.compendiumUuid();

    const maps = `${
      (quest.foundryScenes ?? []).length
        ? `<ul class="dlcp-list">${quest.foundryScenes
            .map(
              (scene) => `<li><span class="dlcp-grow">${contentLink(scene.uuid, scene.name, "map")}</span>
                <button type="button" class="dlcp-link-button" data-action="removeQuestScene" data-scene="${escapeHtml(scene.uuid)}" aria-label="Remove ${escapeHtml(scene.name)}">remove</button></li>`,
            )
            .join("")}</ul>`
        : ""
    }<div class="dlcp-drop" data-kind="questScene"><i class="fas fa-map"></i> Drag scenes here from the Scenes directory.</div>`;

    const npcs = editable
      ? this.#checklist(quest, "npcs", store.npcs, "NPCs")
      : this.#readOnlyList((quest.links ?? []).filter((l) => l.linkableType === "CampaignNpc").map((l) => escapeHtml(l.name)), "No NPCs picked on Dungeon Master Guru.");

    const list = encountersOf(store.encounters, quest.id);
    const legacy = legacyEncounter(quest, store.references);
    const encounters = `
      ${legacy ? this.#encounterSummary(store, legacy, { quest, lookup, legacy: true }) : ""}
      ${list
        .map((encounter, index) =>
          editable
            ? this.#encounterCard(store, encounter, { quest, index, count: list.length, lookup })
            : this.#encounterSummary(store, encounter, { quest, lookup }),
        )
        .join("")}
      ${list.length || legacy ? "" : this.#empty("No encounters yet.")}
      ${editable ? `<div class="dlcp-buttons"><button type="button" class="dlcp-add" data-action="addEncounter"><i class="fas fa-plus"></i> Add an encounter</button></div>` : ""}`;

    const handouts = `${
      (quest.handouts ?? []).length
        ? `<ul class="dlcp-list">${quest.handouts
            .map(
              (handout) => `<li><span class="dlcp-grow">${contentLink(handout.uuid, handout.name, "book-open")}</span>
                <button type="button" data-action="showHandout" data-uuid="${escapeHtml(handout.uuid)}" data-tooltip="Choose which players see it"><i class="fas fa-eye"></i> Show to players</button>
                <button type="button" class="dlcp-link-button" data-action="removeHandout" data-uuid="${escapeHtml(handout.uuid)}" aria-label="Remove ${escapeHtml(handout.name)}">remove</button></li>`,
            )
            .join("")}</ul>`
        : ""
    }<div class="dlcp-drop" data-kind="questHandout"><i class="fas fa-book-open"></i> Drag journal entries or pages here from the Journal sidebar or a compendium.</div>`;

    const items = editable
      ? `${this.#referenceRows(quest, store, TREASURE, { quantities: true, remove: "removeQuestLink" })}
         <div class="dlcp-drop" data-kind="questTreasure"><i class="fas fa-gem"></i> Drag items or roll tables here from a compendium or the sidebar.</div>`
      : this.#readOnlyList(this.#linkNames(store, quest, TREASURE, "Item"), "");

    const reward = `
      ${editable
        ? `<div class="form-group stacked"><label for="dlcp-quest-reward">Reward notes</label><textarea id="dlcp-quest-reward" name="reward" rows="2" placeholder="Favours, titles, land…">${escapeHtml(quest.reward ?? "")}</textarea></div>`
        : quest.reward ? `<p>${escapeHtml(quest.reward)}</p>` : ""}
      <h4>Coins</h4>
      <div class="dlcp-coins">${COINS.map(
        (coin) => `<label>${coin}<input type="number" min="0" name="coin_${coin}" value="${escapeHtml(quest.rewardCurrency?.[coin] ?? "")}" aria-label="${coin}"></label>`,
      ).join("")}</div>
      <div class="dlcp-grid">
        <div class="form-group"><label for="dlcp-quest-xp">XP</label><input id="dlcp-quest-xp" name="rewardXp" type="number" min="0" value="${escapeHtml(quest.rewardXp ?? "")}"></div>
        <label class="dlcp-check"><input type="checkbox" name="milestone" ${quest.milestone ? "checked" : ""}> Milestone: the party levels up when it's done</label>
      </div>
      <h4>Items</h4>
      ${items}`;

    return `${back}
      <form data-form="quest" class="dlcp-quest-plan">
        <header class="dlcp-card-header"><h2>${escapeHtml(quest.name)}</h2>
          <select data-quest-status="${escapeHtml(quest.uuid)}" aria-label="Status of ${escapeHtml(quest.name)}">
            ${QUEST_STATUSES.map((status) => `<option value="${status}" ${quest.status === status ? "selected" : ""}>${STATUS_LABELS[status]}</option>`).join("")}
          </select></header>
        <p class="dlcp-muted">${escapeHtml(facts.join(" · "))}</p>
        ${quest.description ? `<p>${escapeHtml(quest.description)}</p>` : ""}
        ${editable ? "" : `<p class="dlcp-notice">This quest is planned on Dungeon Master Guru. Add its maps, handouts, coins and XP here; they sync.</p>`}
        ${part("Maps", "The scenes the quest plays out on. Click one to view it.", maps)}
        ${part("NPCs involved", "Who helps, hinders or turns up along the way, beyond the quest giver.", npcs)}
        ${part("Encounters", "The fights, talks, traps and puzzles along the way, in order. Each has its own monsters (with how many), NPCs, maps and reward. Drag a monster from here onto a map to place a token.", encounters)}
        ${part("Handouts", "Letters, maps and notes for the players: journal entries or pages, to show them when the time comes.", handouts)}
        ${part("Reward", "What the party gets for finishing the quest.", reward)}
        <div class="dlcp-buttons dlcp-sticky">
          <button type="button" data-action="saveQuest"><i class="fas fa-save"></i> Save the quest</button>
          ${editable ? `<button type="button" data-action="edit" data-collection="quests" data-id="${escapeHtml(quest.id)}"><i class="fas fa-pen"></i> Edit details</button>` : ""}
          <button type="button" data-action="openPage" data-collection="quests" data-uuid="${escapeHtml(quest.uuid)}"><i class="fas fa-book-open"></i> Journal page</button>
        </div>
      </form>`;
  }

  #readOnlyList(items, emptyText) {
    if (!items.length) return emptyText ? this.#empty(emptyText) : "";
    return `<ul>${items.map((item) => `<li>${item}</li>`).join("")}</ul>`;
  }

  // Checkboxes for linking a session or quest to records of one kind
  #checklist(owner, collection, records, label) {
    const linked = new Set(linkedIds(owner, collection));
    if (!records.length) return this.#empty(`No ${label} in the campaign yet. Add them on their tab.`);
    return `<div class="dlcp-checks">${records
      .map(
        (record) => `<label class="dlcp-check"><input type="checkbox" data-link-collection="${collection}" value="${escapeHtml(record.id)}" ${linked.has(record.id) ? "checked" : ""}>
          ${escapeHtml(collection === "secrets" ? record.text : record.name)}${collection === "secrets" && record.revelation ? ` <span class="dlcp-muted">(${escapeHtml(record.revelation)})</span>` : ""}${record.foundrySceneName ? ` <span class="dlcp-muted"><i class="fas fa-map"></i> ${escapeHtml(record.foundrySceneName)}</span>` : ""}${record.foundryActorName ? ` <span class="dlcp-muted"><i class="fas fa-user"></i> ${escapeHtml(record.foundryActorName)}</span>` : ""}</label>`,
      )
      .join("")}</div>`;
  }

  // A session's or quest's book references of some kinds, each with a remove
  // button and, for treasure, how many
  #referenceRows(owner, store, categories, { quantities = false, remove }) {
    const rows = (owner.links ?? [])
      .filter((link) => link.linkableType === "CampaignReference")
      .map((link) => ({ link, r: store.references.find((ref) => ref.id === link.linkableId) }))
      .filter(({ r }) => r && categories.includes(r.category));
    return rows.length
      ? `<ul class="dlcp-list">${rows
          .map(
            ({ link, r }) => `<li><span class="dlcp-grow">${r.foundryUuid ? contentLink(r.foundryUuid, r.name, r.category === "monster" ? "user" : "suitcase") : escapeHtml(r.name)}
              ${r.challengeRating ? ` <span class="dlcp-muted">CR ${escapeHtml(r.challengeRating)}</span>` : ""} <span class="dlcp-muted">${escapeHtml(r.citation ?? "")}</span></span>
              ${quantities ? `<input class="dlcp-quantity" type="number" min="1" max="9999" name="qty_${escapeHtml(link.id)}" value="${escapeHtml(link.quantity ?? 1)}" aria-label="How many ${escapeHtml(r.name)}">` : ""}
              <button type="button" class="dlcp-link-button" data-action="${remove}" data-id="${escapeHtml(r.id)}" aria-label="Remove ${escapeHtml(r.name)}">remove</button></li>`,
          )
          .join("")}</ul>`
      : "";
  }

  // A session's monsters picked from Dungeon Master Guru's own: a link to the
  // compendium entry or imported actor, or a button to import it
  #srdMonsterRows(owner) {
    const links = (owner.links ?? []).filter((link) => link.linkableType === "Monster");
    if (!links.length) return "";
    const lookup = this.sync.compendiumUuid();
    return `<ul class="dlcp-list">${links
      .map(
        (link) => `<li><span class="dlcp-grow">${monsterHtml(this.sync, { id: link.linkableId, name: link.name }, lookup)}${link.quantity > 1 ? ` ×${escapeHtml(link.quantity)}` : ""}
          ${link.detail ? ` <span class="dlcp-muted">${escapeHtml(link.detail)}</span>` : ""}</span>
          <button type="button" class="dlcp-link-button" data-action="removeLink" data-link-id="${escapeHtml(link.id)}" aria-label="Remove ${escapeHtml(link.name)}">remove</button></li>`,
      )
      .join("")}</ul>`;
  }

  // Cast ----------------------------------------------------------------------

  #renderCast(store) {
    const factionName = (id) => store.factions.find((f) => f.id === id)?.name;
    const lookup = this.sync.compendiumUuid();
    const npcs = [...store.npcs].sort(
      (a, b) => NPC_ROLES.indexOf(a.role) - NPC_ROLES.indexOf(b.role) || a.name.localeCompare(b.name),
    );
    const cards = npcs
      .map(
        (npc) => `<li class="dlcp-card">
          <header class="dlcp-card-header"><h3>${escapeHtml(npc.name)} <span class="dlcp-badge">${escapeHtml(ROLE_LABELS[npc.role] ?? npc.role)}</span></h3>${this.#recordButtons("npcs", npc)}</header>
          ${factionName(npc.factionId) ? `<p class="dlcp-muted">${escapeHtml(factionName(npc.factionId))}</p>` : ""}
          ${npc.description ? `<p>${escapeHtml(npc.description)}</p>` : ""}
          ${npc.motive ? `<p><strong>Wants:</strong> ${escapeHtml(npc.motive)}</p>` : ""}
          ${npc.secret ? `<p><strong>Secret:</strong> ${escapeHtml(npc.secret)}</p>` : ""}
          ${npc.voice ? `<p><strong>Voice:</strong> ${escapeHtml(npc.voice)}</p>` : ""}
          ${npc.monster ? `<p class="dlcp-foundry"><strong>Dungeon Master Guru stat block:</strong> ${monsterHtml(this.sync, npc.monster, lookup)}${npc.monster.challengeRating ? ` <span class="dlcp-muted">CR ${escapeHtml(npc.monster.challengeRating)}</span>` : ""}</p>` : ""}
          <p class="dlcp-foundry">
            ${
              npc.foundryActorUuid
                ? `<strong>Actor:</strong> ${contentLink(npc.foundryActorUuid, npc.foundryActorName ?? npc.name, "user")}
                   <button type="button" class="dlcp-link-button" data-action="clearActor" data-uuid="${escapeHtml(npc.uuid)}">remove</button>`
                : ""
            }
            <span class="dlcp-drop dlcp-drop--small" data-kind="actor" data-uuid="${escapeHtml(npc.uuid)}"><i class="fas fa-user"></i> ${npc.foundryActorUuid ? "Drop another actor to replace it" : "Drop an actor for their stat block"}</span>
          </p>
        </li>`,
      )
      .join("");
    return `<p class="dlcp-muted">The people who drive the story: villains, allies, patrons, and everyone in between.</p>
      ${cards ? `<ul class="dlcp-cards">${cards}</ul>` : this.#empty("No NPCs yet.")}
      <div class="dlcp-buttons">${this.#addButton("npcs")}</div>
      ${this.#editable ? `<div class="dlcp-drop" data-kind="newNpc"><i class="fas fa-user-plus"></i> Drag an actor here from the Actors directory or a compendium to add them to the cast.</div>` : ""}`;
  }

  // Places --------------------------------------------------------------------

  #renderPlaces(store) {
    const children = (parentId) =>
      store.locations
        .filter((location) => (location.parentId ?? null) === parentId)
        .sort((a, b) => a.name.localeCompare(b.name));
    const known = new Set(store.locations.map((l) => l.id));
    const tree = (parentId) => {
      // A place whose parent is gone shows at the top
      const items = parentId === null
        ? store.locations.filter((l) => !l.parentId || !known.has(l.parentId)).sort((a, b) => a.name.localeCompare(b.name))
        : children(parentId);
      if (!items.length) return "";
      return `<ul class="dlcp-tree">${items
        .map(
          (location) => `<li><div class="dlcp-card">
            <header class="dlcp-card-header"><h3>${escapeHtml(location.name)}</h3>${this.#recordButtons("locations", location)}</header>
            ${location.description ? `<p>${escapeHtml(location.description)}</p>` : ""}
            ${(location.features ?? []).length ? `<ul>${location.features.map((f) => `<li>${escapeHtml(f)}</li>`).join("")}</ul>` : ""}
            <p class="dlcp-foundry">
              ${
                location.foundrySceneUuid
                  ? `<strong>Map:</strong> ${contentLink(location.foundrySceneUuid, location.foundrySceneName ?? "Map", "map")}
                     <button type="button" class="dlcp-link-button" data-action="clearScene" data-uuid="${escapeHtml(location.uuid)}">remove</button>`
                  : ""
              }
              <span class="dlcp-drop dlcp-drop--small" data-kind="scene" data-uuid="${escapeHtml(location.uuid)}"><i class="fas fa-map"></i> ${location.foundrySceneUuid ? "Drop another scene to replace it" : "Drop a scene from the Scenes directory"}</span>
            </p>
            ${(location.rollTables ?? []).length ? `<p><strong>Random encounters:</strong></p>${rollTablesHtml(location, { remove: this.#editable })}` : ""}
            ${this.#editable ? `<p class="dlcp-foundry"><span class="dlcp-drop dlcp-drop--small" data-kind="placeTable" data-uuid="${escapeHtml(location.uuid)}"><i class="fas fa-table-list"></i> Drop roll tables for random encounters here</span></p>` : ""}
          </div>${tree(location.id)}</li>`,
        )
        .join("")}</ul>`;
    };
    const places = tree(null);
    return `<p class="dlcp-muted">Fantastic locations, each with a few evocative features. Put places inside others, like a tavern in a town.
        Drop roll tables on a place for its random encounters, and click Roll at the table: only GMs see what comes up.</p>
      ${places || this.#empty("No places yet.")}
      <div class="dlcp-buttons">${this.#addButton("locations")}</div>`;
  }

  // Secrets -------------------------------------------------------------------

  #renderSecrets(store) {
    const techniques = this.#techniques;
    const { groups, loose } = revelationGroups(store.secrets);
    const clue = (secret) => `<li>
      <span class="dlcp-grow">${escapeHtml(secret.text)}</span>
      ${
        secret.revealed
          ? `<span class="dlcp-badge">Revealed</span> <button type="button" class="dlcp-link-button" data-action="hideSecret" data-uuid="${escapeHtml(secret.uuid)}">Undo</button>`
          : `<button type="button" data-action="revealSecret" data-uuid="${escapeHtml(secret.uuid)}">Reveal</button>`
      }
      ${this.#recordButtons("secrets", secret)}
    </li>`;
    const group = (g) => `<section class="dlcp-card">
      <header class="dlcp-card-header"><h3>${escapeHtml(g.revelation)}</h3>
        <span class="dlcp-muted">${g.clues.length} ${g.clues.length === 1 ? "clue" : "clues"}${g.revealed ? `, ${g.revealed} revealed` : ""}</span></header>
      ${techniques.threeClues && g.short ? `<p class="dlcp-notice dlcp-notice--warning">Needs ${3 - g.clues.length} more ${3 - g.clues.length === 1 ? "clue" : "clues"}. The Three Clue Rule: give the party three ways to find anything they must learn.</p>` : ""}
      <ul class="dlcp-list">${g.clues.map(clue).join("")}</ul>
    </section>`;
    return `<p class="dlcp-muted">Secrets the party could discover, grouped by what they reveal. Don't decide how they'll find them.</p>
      ${creditHtml(["secrets", "threeClues"], techniques)}
      ${groups.length ? groups.map(group).join("") : ""}
      ${loose.length ? `<section class="dlcp-card"><h3>Not tied to a revelation</h3><ul class="dlcp-list">${loose.map(clue).join("")}</ul></section>` : ""}
      ${groups.length || loose.length ? "" : this.#empty("No secrets yet.")}
      <div class="dlcp-buttons">${this.#addButton("secrets")}</div>`;
  }

  // Sessions ------------------------------------------------------------------

  #renderSessions(store) {
    const sessions = [...store.sessions].sort((a, b) => a.number - b.number);
    const rows = sessions
      .map(
        (session) => `<tr>
          <td>${escapeHtml(session.number)}</td>
          <td><button type="button" class="dlcp-link-button" data-action="openSession" data-id="${escapeHtml(session.id)}">${escapeHtml(session.displayTitle ?? `Session ${session.number}`)}</button></td>
          <td>${escapeHtml(session.scheduledOn ?? "—")}</td>
          <td>${escapeHtml(session.level ?? "—")}</td>
          <td>${escapeHtml(SESSION_STATUS_LABELS[session.status] ?? session.status)}</td>
          <td>${this.#editable ? `<button type="button" class="dlcp-icon-button" data-action="delete" data-collection="sessions" data-id="${escapeHtml(session.id)}" aria-label="Delete ${escapeHtml(session.displayTitle)}" data-tooltip="Delete"><i class="fas fa-trash"></i></button>` : ""}</td>
        </tr>`,
      )
      .join("");
    const steps = this.#techniques.secrets ? "with the Lazy Dungeon Master's eight steps" : "the Lazy Dungeon Master way";
    return `<p class="dlcp-muted">Prep each session ${steps}, then run it from the Campaign Dashboard.</p>
      ${
        rows
          ? `<table class="dlcp-sessions"><thead><tr><th>#</th><th>Session</th><th>Date</th><th>Level</th><th>Status</th><th aria-label="Actions"></th></tr></thead><tbody>${rows}</tbody></table>`
          : this.#empty("No sessions yet.")
      }
      ${this.#editable ? `<div class="dlcp-buttons"><button type="button" class="dlcp-add" data-action="addSession"><i class="fas fa-plus"></i> Add a session</button></div>` : ""}`;
  }

  #renderPrep(store, campaign) {
    const session = store.sessions.find((s) => s.id === this.#sessionId);
    if (!session) {
      this.#sessionId = null;
      return this.#renderSessions(store);
    }
    const back = `<button type="button" class="dlcp-link-button" data-action="closeSession"><i class="fas fa-arrow-left"></i> All sessions</button>`;
    const maps = `<h4>Maps</h4>
      ${
        (session.foundryScenes ?? []).length
          ? `<ul class="dlcp-list">${session.foundryScenes
              .map(
                (scene) => `<li><span class="dlcp-grow">${contentLink(scene.uuid, scene.name, "map")}</span>
                  <button type="button" class="dlcp-link-button" data-action="removeSessionScene" data-scene="${escapeHtml(scene.uuid)}" aria-label="Remove ${escapeHtml(scene.name)}">remove</button></li>`,
              )
              .join("")}</ul>`
          : ""
      }
      <div class="dlcp-drop" data-kind="sessionScene"><i class="fas fa-map"></i> Drag scenes here from the Scenes directory.</div>`;
    if (!this.#editable) {
      return `${back}<h2>${escapeHtml(session.displayTitle)}</h2>
        <p>Prep this session on Dungeon Master Guru. Its plan is on its journal page here. Maps come from this world, so
          add them here.</p>
        <section class="dlcp-card dlcp-prep-step">${maps}</section>
        <div class="dlcp-buttons"><button type="button" data-action="openPage" data-collection="sessions" data-uuid="${escapeHtml(session.uuid)}"><i class="fas fa-book-open"></i> Open the journal page</button></div>`;
    }
    const techniques = this.#techniques;
    const shown = prepSteps(techniques);
    const step = (key, body, credit = "") =>
      shown.includes(key)
        ? `<section class="dlcp-card dlcp-prep-step"><h3>${shown.indexOf(key) + 1}. ${escapeHtml(PREP_STEPS[key][0])}</h3>
      <p class="dlcp-muted">${escapeHtml(PREP_STEPS[key][1])}</p>${credit}${body}</section>`
        : "";
    const checklist = (collection, records, label) => this.#checklist(session, collection, records, label);
    const references = (categories, { quantities = false } = {}) =>
      this.#referenceRows(session, store, categories, { quantities, remove: "removeLink" });
    const unrevealed = store.secrets.filter((s) => !s.revealed || linkedIds(session, "secrets").includes(s.id));
    const party = this.sync.partyOptions().filter((option) => (campaign.partyActorUuids ?? []).includes(option.uuid));
    const values = session;

    return `${back}
      <form data-form="session">
        <h2>${escapeHtml(session.displayTitle)}</h2>
        ${creditHtml(["sessionPrep"], techniques)}
        <div class="dlcp-grid">
          <div class="form-group"><label for="dlcp-session-title">Title</label><input id="dlcp-session-title" name="title" type="text" value="${escapeHtml(values.title ?? "")}" placeholder="Session ${escapeHtml(session.number)}"></div>
          <div class="form-group"><label for="dlcp-session-date">Date</label><input id="dlcp-session-date" name="scheduledOn" type="date" value="${escapeHtml(values.scheduledOn ?? "")}"></div>
          <div class="form-group"><label for="dlcp-session-level">Party level</label><input id="dlcp-session-level" name="level" type="number" min="1" max="20" value="${escapeHtml(values.level ?? "")}"></div>
          <div class="form-group"><label for="dlcp-session-status">Status</label><select id="dlcp-session-status" name="status">${Object.entries(SESSION_STATUS_LABELS).map(([value, label]) => `<option value="${value}" ${session.status === value ? "selected" : ""}>${label}</option>`).join("")}</select></div>
        </div>
        ${step(
          "characters",
          `${party.length ? `<ul>${party.map((p) => `<li><button type="button" class="dlcp-link-button" data-action="openSheet" data-uuid="${escapeHtml(p.uuid)}">${escapeHtml(p.name)}</button> <span class="dlcp-muted">${escapeHtml([p.classes, p.level && `level ${p.level}`].filter(Boolean).join(", "))}</span></li>`).join("")}</ul>` : `<p class="dlcp-muted">Choose the party on the Party tab to see them here.</p>`}
          <textarea name="characterNotes" rows="3" aria-label="Character notes">${escapeHtml(values.characterNotes ?? "")}</textarea>`,
        )}
        ${step("strongStart", `<textarea name="strongStart" rows="3" aria-label="Strong start">${escapeHtml(values.strongStart ?? "")}</textarea>`, creditHtml(["strongStart"], techniques))}
        ${step("scenes", listEditorHtml({ name: "scenes", value: values.scenes ?? [], idPrefix: "dlcp-prep", ...LIST_FIELDS.scenes }))}
        ${step("secrets", checklist("secrets", unrevealed, "secrets"))}
        ${step("locations", checklist("locations", store.locations, "places") + maps)}
        ${step("npcs", checklist("npcs", store.npcs, "NPCs"))}
        ${step(
          "monsters",
          `${this.#srdMonsterRows(session)}${references(["monster"])}<div class="dlcp-drop" data-kind="monster"><i class="fas fa-dragon"></i> Drag monsters here from a compendium or the Actors directory.</div>`,
        )}
        ${step(
          "treasure",
          `<textarea name="treasure" rows="3" aria-label="Treasure">${escapeHtml(values.treasure ?? "")}</textarea>
          <div class="dlcp-coins">${COINS.map(
            (coin) => `<label>${coin}<input type="number" min="0" name="coin_${coin}" value="${escapeHtml(values.treasureCurrency?.[coin] ?? "")}" aria-label="${coin}"></label>`,
          ).join("")}</div>
          ${references(TREASURE, { quantities: true })}
          <div class="dlcp-drop" data-kind="treasure"><i class="fas fa-gem"></i> Drag items or roll tables here from a compendium or the sidebar.</div>`,
        )}
        <div class="dlcp-buttons dlcp-sticky">
          <button type="button" data-action="saveSession"><i class="fas fa-save"></i> Save the prep</button>
          <button type="button" data-action="run"><i class="fas fa-scroll"></i> Run it in the Dashboard</button>
        </div>
      </form>`;
  }

  // Changes -------------------------------------------------------------------

  #record(collection, key, by = "id") {
    return this.sync.recordLists()[collection]?.find((record) => record[by] === key);
  }

  async #change(collection, uuid, attributes) {
    const record = this.#record(collection, uuid, "uuid");
    if (!record) return;
    try {
      await this.sync.update(collection, record, attributes);
    } catch (error) {
      ui.notifications.error(`Couldn't save: ${error.message}`);
    }
  }

  // Saves to this world, or to Dungeon Master Guru for a synced campaign.
  // Returns the saved record (a new one has its Dungeon Master Guru id), or false.
  async #save(collection, record) {
    try {
      return await this.sync.saveRecord(collection, record);
    } catch (error) {
      ui.notifications.error(`Couldn't save: ${error.message}`);
      return false;
    }
  }

  async #onChange(event) {
    const target = event.target;
    if (target.dataset.questStatus) {
      return this.#change("quests", target.dataset.questStatus, { status: target.value });
    }
    if (target.dataset.party !== undefined && this.sync.isLocal) {
      const campaign = this.sync.recordLists().campaign[0];
      const uuid = target.dataset.party;
      const party = new Set(campaign.partyActorUuids ?? []);
      if (target.checked) party.add(uuid);
      else party.delete(uuid);
      return this.#save("campaign", { ...campaign, partyActorUuids: [...party] });
    }
  }

  // Asks for a record's details. Keeps asking while something's wrong, so
  // nothing typed is lost. Returns the saved record, or null if cancelled.
  async #editDialog(collection, record) {
    const techniques = this.#techniques;
    const form = editForm(collection, techniques);
    const store = this.sync.recordLists();
    let values = formValues(form.fields, record ?? {});
    for (;;) {
      const control = (f) => {
        if (f.type === "select" || f.type === "records") {
          const options =
            f.type === "select"
              ? f.options
              : [["", f.blank], ...store[f.collection].filter((r) => r.id !== record?.id).map((r) => [r.id, r.name])];
          return `<div class="form-group"><label for="dlcp-edit-${f.name}">${escapeHtml(f.label)}</label>
            <select id="dlcp-edit-${f.name}" name="${f.name}">${options
              .map(([value, label]) => `<option value="${escapeHtml(value)}" ${values[f.name] === value ? "selected" : ""}>${escapeHtml(label)}</option>`)
              .join("")}</select></div>`;
        }
        return field({ ...f, name: f.name }, values[f.name] ?? "").replaceAll("dlcp-planner-", "dlcp-edit-");
      };
      // A place's map and an NPC's actor are picked from this world (or kept, if from a compendium)
      const picker = (name, label, current, currentName, documents, hint) => {
        const options = [["", "None"], ...documents.map((d) => [d.uuid, d.name])];
        if (current && !options.some(([uuid]) => uuid === current)) options.push([current, currentName ?? current]);
        return `<div class="form-group"><label for="dlcp-edit-${name}">${label}</label>
          <select id="dlcp-edit-${name}" name="${name}">${options
            .map(([uuid, text]) => `<option value="${escapeHtml(uuid)}" ${(values[name] ?? current ?? "") === uuid ? "selected" : ""}>${escapeHtml(text)}</option>`)
            .join("")}</select><p class="hint">${hint}</p></div>`;
      };
      const extra =
        collection === "locations"
          ? picker("foundrySceneUuid", "Map", record?.foundrySceneUuid, record?.foundrySceneName, game.scenes.contents,
              "A scene from this world. You can also drop one on the place's card.")
          : collection === "npcs"
            ? picker("foundryActorUuid", "Actor", record?.foundryActorUuid, record?.foundryActorName,
                game.actors.filter((a) => ["npc", "character"].includes(a.type)),
                "Their stat block. To use one from a compendium, drop it on the NPC's card.")
            : "";
      const submitted = await foundry.applications.api.DialogV2.prompt({
        window: { title: `${record ? "Edit" : "Add"} ${form.title.toLowerCase() === "npc" ? "NPC" : form.title.toLowerCase()}` },
        position: { width: 520 },
        content: form.fields.map(control).join("") + extra,
        ok: {
          label: record ? "Save" : "Add",
          icon: record ? "fas fa-save" : "fas fa-plus",
          callback: (_event, button) => Object.fromEntries(new FormData(button.form).entries()),
        },
        rejectClose: false,
      });
      if (!submitted) return null;
      values = submitted;

      let base = record;
      if (!base) {
        const key = form.fields.find((f) => f.required)?.name;
        base = newRecord(collection, { [key]: values[key] }, { id: () => foundry.utils.randomID(16), existing: store[collection] });
        if (base.error) {
          ui.notifications.warn(base.error);
          continue;
        }
      }
      const result = applyEdit(collection, base, values, store, techniques);
      if (result.error) {
        ui.notifications.warn(result.error);
        continue;
      }
      let saved = result.record;
      const pickedName = (uuid, fallback) => (uuid ? (fromUuidSync(uuid)?.name ?? fallback) : null);
      if (collection === "locations") {
        const uuid = values.foundrySceneUuid || null;
        const change = sceneChange(uuid, pickedName(uuid, record?.foundrySceneName));
        if (!change.error) saved = { ...saved, ...change };
      }
      if (collection === "npcs") {
        const uuid = values.foundryActorUuid || null;
        const change = actorChange(uuid, pickedName(uuid, record?.foundryActorName));
        if (!change.error) saved = { ...saved, ...change };
      }
      return (await this.#save(collection, saved)) || null;
    }
  }

  // Sets a place's map or an NPC's actor. Works for Dungeon Master Guru campaigns too: these come from Foundry.
  async #setForeign(collection, uuid, change) {
    if (change.error) return ui.notifications.warn(change.error);
    return this.#change(collection, uuid, change);
  }

  // Adds a map to the open session, keeping anything typed in its prep
  async #addSessionScene(scene) {
    const session = this.#record("sessions", this.#sessionId);
    if (!session) return;
    const result = addScene(session.foundryScenes, scene.uuid, scene.name, "session");
    if (result.error) return ui.notifications.warn(result.error);
    return this.#saveSessionScenes(session, result.scenes);
  }

  async #saveSessionScenes(session, scenes) {
    if (!this.#editable) return this.#change("sessions", session.uuid, { foundryScenes: scenes });
    const current = this.#sessionFromForm(session);
    if (current.error) return ui.notifications.warn(current.error);
    return this.#save("sessions", { ...current.record, foundryScenes: scenes });
  }

  // Reads the session prep form into the session, with its links
  #sessionFromForm(session) {
    const form = this.element.querySelector('[data-form="session"]');
    const values = Object.fromEntries(new FormData(form).entries());
    const result = applySessionPrep(session, values);
    if (result.error) return result;
    const store = this.sync.recordLists();
    let updated = result.record;
    // With secrets and clues switched off, the session keeps the secrets it links to
    const collections = this.#techniques.secrets ? ["secrets", "locations", "npcs"] : ["locations", "npcs"];
    for (const collection of collections) {
      const ids = [...form.querySelectorAll(`[data-link-collection="${collection}"]:checked`)].map((box) => box.value);
      updated = setLinks(updated, collection, ids, store[collection], () => foundry.utils.randomID(16));
    }
    return this.#withQuantities(form, updated);
  }

  // Reads the treasure quantities typed into a form into the record's links
  #withQuantities(form, record) {
    let updated = record;
    for (const input of form.querySelectorAll('[name^="qty_"]')) {
      const result = setLinkQuantity(updated, input.name.slice(4), input.value);
      if (result.error) return result;
      updated = result.record;
    }
    return { record: updated };
  }

  // Reads the quest plan form into the quest: its reward, NPCs and quantities
  #questFromForm(quest) {
    const form = this.element.querySelector('[data-form="quest"]');
    const values = Object.fromEntries(new FormData(form).entries());
    const result = applyQuestReward(quest, this.#editable ? values : { ...values, reward: quest.reward });
    if (result.error) return result;
    if (!this.#editable) return result;
    const ids = [...form.querySelectorAll('[data-link-collection="npcs"]:checked')].map((box) => box.value);
    const updated = setLinks(result.record, "npcs", ids, this.sync.recordLists().npcs, () => foundry.utils.randomID(16));
    return this.#withQuantities(form, updated);
  }

  // Reads the whole quest plan: the quest, and each of its encounters' cards
  // (the ones shown; any others stay as they are). Encounters in `skip` are
  // left out. Returns { record, encounters } or { error }.
  #questPlanFromForm(quest, { skip = [] } = {}) {
    const current = this.#questFromForm(quest);
    if (current.error) return current;
    const form = this.element.querySelector('[data-form="quest"]');
    const values = Object.fromEntries(new FormData(form).entries());
    const store = this.sync.recordLists();
    const encounters = [];
    for (const encounter of encountersOf(store.encounters, quest.id)) {
      if (skip.includes(encounter.id)) continue;
      const id = CSS.escape(encounter.id);
      if (!form.querySelector(`[data-encounter-card="${id}"]`)) {
        encounters.push(encounter);
        continue;
      }
      const npcIds = [...form.querySelectorAll(`[data-encounter-npc="${id}"]:checked`)].map((box) => box.value);
      const result = applyEncounter(encounter, encounterValues(values, encounter.id), {
        npcIds,
        npcs: store.npcs,
        id: () => foundry.utils.randomID(16),
      });
      if (result.error) return result;
      encounters.push(result.record);
    }
    return { record: current.record, encounters };
  }

  // Saves a quest's plan: each encounter that changed (or is new), then the
  // quest. For a campaign this browser can't change, only what syncs from
  // Foundry: the quest's maps, handouts, coins, XP and milestone.
  async #saveQuestPlan(quest, { record, encounters = [] }) {
    if (this.#editable) {
      const before = new Map(this.sync.recordLists().encounters.map((encounter) => [encounter.id, encounter]));
      for (const encounter of encounters) {
        const original = before.get(encounter.id);
        if (original && JSON.stringify(original) === JSON.stringify(encounter)) continue;
        if (!(await this.#save("encounters", encounter))) return false;
      }
      return this.#save("quests", record);
    }
    const { foundryScenes, rewardCurrency, rewardXp, milestone, handouts } = record;
    try {
      return await this.sync.update("quests", quest, { foundryScenes, rewardCurrency, rewardXp, milestone, handouts: handouts ?? [] });
    } catch (error) {
      ui.notifications.error(`Couldn't save: ${error.message}`);
      return false;
    }
  }

  /**
   * Changes the open quest's plan, keeping anything typed in it: reads the
   * form, lets `change` alter it ({ record, encounters }, or { error }), and
   * saves what changed. Returns the saved quest, or false.
   */
  async #changeQuestPlan(change = (plan) => plan, { skip = [] } = {}) {
    const quest = this.#record("quests", this.#questId);
    if (!quest) return false;
    const plan = this.#questPlanFromForm(quest, { skip });
    if (plan.error) {
      ui.notifications.warn(plan.error);
      return false;
    }
    const changed = await change(plan);
    if (!changed || changed.error) {
      if (changed?.error) ui.notifications.warn(changed.error);
      return false;
    }
    return this.#saveQuestPlan(quest, changed);
  }

  // Changes one encounter in the open quest's plan
  #changeEncounter(key, change, by = "id") {
    return this.#changeQuestPlan(async (plan) => {
      const encounter = plan.encounters.find((e) => e[by] === key);
      if (!encounter) return null;
      const updated = await change(encounter);
      if (!updated || updated.error) return updated;
      return { ...plan, encounters: plan.encounters.map((e) => (e.id === encounter.id ? updated : e)) };
    });
  }

  // Adds a map to the open quest, keeping anything typed in its plan
  #addQuestScene(scene) {
    return this.#changeQuestPlan((plan) => {
      const result = addScene(plan.record.foundryScenes, scene.uuid, scene.name, "quest");
      return result.error ? result : { ...plan, record: { ...plan.record, foundryScenes: result.scenes } };
    });
  }

  // A journal entry or page dropped on the quest's Handouts
  #addHandout(document) {
    return this.#changeQuestPlan((plan) => {
      const result = addHandout(plan.record.handouts, document.uuid, document.name);
      return result.error ? result : { ...plan, record: { ...plan.record, handouts: result.handouts } };
    });
  }

  // An item or table dropped on a quest's reward becomes a linked book reference
  #addQuestReference(document) {
    return this.#changeQuestPlan(async (plan) => {
      const reference = await this.sync.referenceFor(document);
      const references = this.sync.recordLists().references;
      return { ...plan, record: withReference(plan.record, reference.id, references, () => foundry.utils.randomID(16)) };
    });
  }

  // A monster, item or table dropped on an encounter: linked as a book reference
  #addEncounterReference(encounterUuid, document) {
    return this.#changeEncounter(
      encounterUuid,
      async (encounter) => {
        const reference = await this.sync.referenceFor(document);
        const references = this.sync.recordLists().references;
        return withReference(encounter, reference.id, references, () => foundry.utils.randomID(16));
      },
      "uuid",
    );
  }

  // A scene dropped on an encounter becomes one of its maps
  #addEncounterScene(encounterUuid, scene) {
    return this.#changeEncounter(
      encounterUuid,
      (encounter) => {
        const result = addScene(encounter.foundryScenes, scene.uuid, scene.name, "encounter");
        return result.error ? result : { ...encounter, foundryScenes: result.scenes };
      },
      "uuid",
    );
  }

  // A roll table dropped on a place: one of its random encounter tables
  #addRollTable(locationUuid, table) {
    const location = this.#record("locations", locationUuid, "uuid");
    if (!location) return;
    const result = addRollTable(location.rollTables, table.uuid, table.name);
    if (result.error) return ui.notifications.warn(result.error);
    return this.#change("locations", location.uuid, { rollTables: result.rollTables });
  }

  // Something dropped on the planner: a scene for a map, an actor for an NPC,
  // a monster, item or table for a session, quest or encounter (a linked book
  // reference), a journal for a quest's handouts, or a roll table for a place
  async #onDrop(event, kind, recordUuid) {
    event.preventDefault();
    event.stopPropagation();
    const data = foundry.applications.ux.TextEditor.implementation.getDragEventData(event);
    const document = data?.uuid ? await fromUuid(data.uuid) : null;
    if (["scene", "sessionScene", "questScene", "encounterScene"].includes(kind) && document?.documentName !== "Scene") {
      return ui.notifications.warn("Drop a scene here, from the Scenes directory.");
    }
    if (kind === "questHandout") {
      if (!["JournalEntry", "JournalEntryPage"].includes(document?.documentName)) {
        return ui.notifications.warn("Drop a journal entry or page here, from the Journal sidebar or a compendium.");
      }
      return this.#addHandout(document);
    }
    if (kind === "placeTable") {
      if (document?.documentName !== "RollTable") return ui.notifications.warn("Drop a roll table here, from the sidebar or a compendium.");
      return this.#addRollTable(recordUuid, document);
    }
    if (kind === "encounterScene") return this.#addEncounterScene(recordUuid, document);
    if (["actor", "newNpc"].includes(kind) && document?.documentName !== "Actor") {
      return ui.notifications.warn("Drop an actor here, from the Actors directory or a compendium.");
    }
    if (kind === "scene") return this.#setForeign("locations", recordUuid, sceneChange(document.uuid, document.name));
    if (kind === "actor") return this.#setForeign("npcs", recordUuid, actorChange(document.uuid, document.name));
    if (kind === "newNpc") {
      const npc = newRecord(
        "npcs",
        {
          name: document.name,
          role: roleFromDisposition(document.prototypeToken?.disposition),
          foundryActorUuid: document.uuid,
          foundryActorName: document.name,
        },
        { id: () => foundry.utils.randomID(16), existing: this.sync.recordLists().npcs },
      );
      return this.#save("npcs", npc);
    }
    if (kind === "sessionScene") return this.#addSessionScene(document);
    if (kind === "questScene") return this.#addQuestScene(document);
    const monster = kind === "monster" || kind === "encounterMonster";
    const wanted = monster ? ["Actor"] : ["Item", "RollTable"];
    if (!document || !wanted.includes(document.documentName)) {
      ui.notifications.warn(monster ? "Drop an actor here." : "Drop an item or a roll table here.");
      return;
    }
    const dropped = {
      uuid: document.uuid,
      name: document.name,
      documentName: document.documentName,
      type: document.type,
      system: document.system,
      pack: document.pack ?? null,
    };
    if (kind === "questTreasure") return this.#addQuestReference(dropped);
    if (kind === "encounterMonster" || kind === "encounterTreasure") return this.#addEncounterReference(recordUuid, dropped);
    const session = this.#record("sessions", this.#sessionId);
    const current = session && this.#sessionFromForm(session);
    if (!current || current.error) {
      if (current?.error) ui.notifications.warn(current.error);
      return;
    }
    const reference = await this.sync.referenceFor(dropped);
    const references = this.sync.recordLists().references;
    const ids = [...new Set([...linkedIds(current.record, "references"), reference.id])];
    await this.#save("sessions", setLinks(current.record, "references", ids, references, () => foundry.utils.randomID(16)));
  }

  // Actions -------------------------------------------------------------------

  static #onShowTab(_event, target) {
    this.#tab = target.dataset.tab;
    this.#sessionId = target.dataset.sessionId ?? null;
    this.#questId = null;
    this.render();
  }

  static async #onAdd(_event, target) {
    await this.#editDialog(target.dataset.collection, null);
  }

  static async #onEdit(_event, target) {
    const record = this.#record(target.dataset.collection, target.dataset.id);
    if (record) await this.#editDialog(target.dataset.collection, record);
  }

  static async #onDelete(_event, target) {
    const { collection, id } = target.dataset;
    const record = this.#record(collection, id);
    if (!record) return;
    const name = record.name ?? record.displayTitle ?? record.text;
    const confirmed = await foundry.applications.api.DialogV2.confirm({
      window: { title: "Delete" },
      content: `<p>Delete <strong>${escapeHtml(name)}</strong> and its journal page?${collection === "quests" ? " Its encounters go too." : ""} Anything that points to it is cleared.</p>`,
    });
    if (!confirmed) return;
    try {
      await this.sync.deleteRecord(collection, id);
      if (collection === "sessions" && this.#sessionId === id) this.#sessionId = null;
    } catch (error) {
      ui.notifications.error(`Couldn't delete: ${error.message}`);
    }
  }

  static #onOpenPage(_event, target) {
    const record = this.#record(target.dataset.collection, target.dataset.uuid, "uuid");
    const folder = this.sync.folder;
    for (const entry of game.journal.filter((e) => e.folder?.id === folder?.id)) {
      const page = entry.pages.find((p) => p.getFlag(MODULE_ID, "uuid") === record?.uuid);
      if (page) return entry.sheet.render(true, { pageId: page.id });
    }
  }

  static async #onOpenSheet(_event, target) {
    (await fromUuid(target.dataset.uuid))?.sheet?.render(true);
  }

  static async #onSaveBrief() {
    const form = this.element.querySelector('[data-form="brief"]');
    const campaign = this.sync.recordLists().campaign[0];
    const values = Object.fromEntries(new FormData(form).entries());
    // The truths editor's inputs have no names; its rows are read in order
    const truths = form.querySelector("[data-truths-editor]");
    if (truths) values.truths = readTruthRows(truths);
    const result = applyBrief(campaign, values, this.#techniques);
    if (result.error) return ui.notifications.warn(result.error);
    if (await this.#save("campaign", result.record)) ui.notifications.info("Saved the brief.");
  }

  // Adds, moves or removes one of the brief's truths. Saved with the brief.
  static #onEditTruth(_event, target) {
    changeTruthRows(target);
  }

  static #onAdvanceClock(_event, target) {
    const front = this.#record("fronts", target.dataset.uuid, "uuid");
    if (front) this.#change("fronts", front.uuid, { clockFilled: Math.min(front.clockSegments, front.clockFilled + 1) });
  }

  static #onWindBackClock(_event, target) {
    const front = this.#record("fronts", target.dataset.uuid, "uuid");
    if (front) this.#change("fronts", front.uuid, { clockFilled: Math.max(0, front.clockFilled - 1) });
  }

  static #onTogglePortent(_event, target) {
    const front = this.#record("fronts", target.dataset.uuid, "uuid");
    if (!front) return;
    const index = Number(target.dataset.index);
    const portents = front.portents.map((p, i) => (i === index ? { ...p, triggered: !p.triggered } : p));
    this.#change("fronts", front.uuid, { portents });
  }

  // Reveals in the next session to play
  static #onRevealSecret(_event, target) {
    const sessions = this.sync.recordLists().sessions.sort((a, b) => a.number - b.number);
    const next = sessions.find((s) => s.status !== "played") ?? sessions.at(-1);
    this.#change("secrets", target.dataset.uuid, { revealed: true, revealedSessionUuid: next?.uuid ?? null });
  }

  static #onHideSecret(_event, target) {
    this.#change("secrets", target.dataset.uuid, { revealed: false, revealedSessionUuid: null });
  }

  static #onOpenSession(_event, target) {
    this.#sessionId = target.dataset.id;
    this.render();
  }

  static #onCloseSession() {
    this.#sessionId = null;
    this.render();
  }

  static async #onSaveSession() {
    const session = this.#record("sessions", this.#sessionId);
    if (!session) return;
    const result = this.#sessionFromForm(session);
    if (result.error) return ui.notifications.warn(result.error);
    if (await this.#save("sessions", result.record)) ui.notifications.info(`Saved ${result.record.displayTitle}.`);
  }

  static async #onAddSession() {
    const store = this.sync.recordLists();
    const session = newRecord("sessions", {}, { id: () => foundry.utils.randomID(16), existing: store.sessions });
    const saved = await this.#save("sessions", session);
    if (saved) {
      this.#sessionId = saved.id;
      this.render();
    }
  }

  static async #onRemoveLink(_event, target) {
    const session = this.#record("sessions", this.#sessionId);
    const current = session && this.#sessionFromForm(session);
    if (!current || current.error) return;
    // A Dungeon Master Guru monster goes by its link; a book reference by the reference
    if (target.dataset.linkId) return this.#save("sessions", withoutLink(current.record, target.dataset.linkId));
    const references = this.sync.recordLists().references;
    const ids = linkedIds(current.record, "references").filter((id) => id !== target.dataset.id);
    await this.#save("sessions", setLinks(current.record, "references", ids, references, () => foundry.utils.randomID(16)));
  }

  static #onOpenQuest(_event, target) {
    this.#questId = target.dataset.id;
    this.render();
  }

  static #onCloseQuest() {
    this.#questId = null;
    this.render();
  }

  // Saves the quest and its encounters
  static async #onSaveQuest() {
    const quest = this.#record("quests", this.#questId);
    if (quest && (await this.#changeQuestPlan())) ui.notifications.info(`Saved ${quest.name}.`);
  }

  static #onRemoveQuestLink(_event, target) {
    return this.#changeQuestPlan((plan) => {
      const references = this.sync.recordLists().references;
      const ids = linkedIds(plan.record, "references").filter((id) => id !== target.dataset.id);
      return { ...plan, record: setLinks(plan.record, "references", ids, references, () => foundry.utils.randomID(16)) };
    });
  }

  static #onRemoveQuestScene(_event, target) {
    return this.#changeQuestPlan((plan) => ({
      ...plan,
      record: { ...plan.record, foundryScenes: (plan.record.foundryScenes ?? []).filter((scene) => scene.uuid !== target.dataset.scene) },
    }));
  }

  // A new encounter at the end of the quest's, saved with what's typed in the others
  static #onAddEncounter() {
    return this.#changeQuestPlan((plan) => {
      const encounter = newRecord(
        "encounters",
        { questId: plan.record.id, name: `Encounter ${plan.encounters.length + 1}`, kind: "combat" },
        { id: () => foundry.utils.randomID(16), existing: plan.encounters },
      );
      return encounter.error ? encounter : { ...plan, encounters: [...plan.encounters, encounter] };
    });
  }

  static async #onRemoveEncounter(_event, target) {
    const encounter = this.#record("encounters", target.dataset.id);
    if (!encounter) return;
    const confirmed = await foundry.applications.api.DialogV2.confirm({
      window: { title: "Remove the encounter" },
      content: `<p>Remove <strong>${escapeHtml(encounter.name)}</strong> and its journal page?</p>`,
    });
    if (!confirmed) return;
    // What's typed in the quest and its other encounters is kept
    const saved = await this.#changeQuestPlan((plan) => plan, { skip: [encounter.id] });
    if (!saved) return;
    try {
      await this.sync.deleteRecord("encounters", encounter.id);
    } catch (error) {
      ui.notifications.error(`Couldn't remove it: ${error.message}`);
    }
  }

  static #onMoveEncounter(_event, target) {
    const delta = Number(target.dataset.delta);
    return this.#changeQuestPlan((plan) => ({ ...plan, encounters: moveEncounter(plan.encounters, target.dataset.id, delta) }));
  }

  static #onRemoveEncounterLink(_event, target) {
    return this.#changeEncounter(target.dataset.encounter, (encounter) => withoutLink(encounter, target.dataset.linkId));
  }

  static #onRemoveEncounterScene(_event, target) {
    return this.#changeEncounter(target.dataset.encounter, (encounter) => ({
      ...encounter,
      foundryScenes: (encounter.foundryScenes ?? []).filter((scene) => scene.uuid !== target.dataset.scene),
    }));
  }

  static #onRemoveHandout(_event, target) {
    return this.#changeQuestPlan((plan) => ({
      ...plan,
      record: { ...plan.record, handouts: removeHandout(plan.record.handouts, target.dataset.uuid) },
    }));
  }

  static #onShowHandout(_event, target) {
    return showHandout(target.dataset.uuid);
  }

  static #onRemoveRollTable(_event, target) {
    const location = this.#record("locations", target.dataset.location, "uuid");
    if (!location) return;
    return this.#change("locations", location.uuid, { rollTables: removeRollTable(location.rollTables, target.dataset.uuid) });
  }

  static #onRollTable(_event, target) {
    return rollTable(target.dataset.uuid);
  }

  static #onImportMonster(_event, target) {
    return importMonster(this.sync, target.dataset.monsterId, target);
  }

  static #onClearScene(_event, target) {
    return this.#setForeign("locations", target.dataset.uuid, sceneChange(null));
  }

  static #onClearActor(_event, target) {
    return this.#setForeign("npcs", target.dataset.uuid, actorChange(null));
  }

  static #onRemoveSessionScene(_event, target) {
    const session = this.#record("sessions", this.#sessionId);
    if (!session) return;
    const scenes = (session.foundryScenes ?? []).filter((scene) => scene.uuid !== target.dataset.scene);
    return this.#saveSessionScenes(session, scenes);
  }

  // Sends the changes made here to Dungeon Master Guru and brings back its changes
  static async #onSyncNow() {
    this.#syncing = true;
    this.render();
    try {
      await syncWithFeedback(this.sync);
    } finally {
      this.#syncing = false;
      this.render();
    }
  }

  static #onRun() {
    game.modules.get(MODULE_ID).api.openDashboard();
  }

  static #onNewCampaign() {
    game.modules.get(MODULE_ID).api.openNewCampaign();
  }

  static #onOpenCampaign() {
    game.modules.get(MODULE_ID).api.openCampaignPicker();
  }

  static #onConnect() {
    game.modules.get(MODULE_ID).api.openConnect();
  }

  static #onHelp() {
    game.modules.get(MODULE_ID).api.openHelp();
  }

  static async #onSendCampaign() {
    if (!this.#editable) {
      ui.notifications.info("This campaign is already on Dungeon Master Guru.");
      return;
    }
    if (await sendCampaign()) this.render({ window: { title: this.title } });
  }

  static async #onExportAdventure() {
    await exportAdventure();
  }

  static #onReportBug() {
    game.modules.get(MODULE_ID).api.openBugReport();
  }
}
