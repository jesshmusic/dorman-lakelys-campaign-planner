import { clockSvg, currencyText, escapeHtml } from "../render.mjs";
import { MODULE_ID, SYNCED_HOOK } from "../constants.mjs";
import { NPC_ROLES, newRecord } from "../local.mjs";
import { sendCampaign } from "./send-campaign.mjs";
import {
  BRIEF_FIELDS,
  COINS,
  EDIT_FORMS,
  actorChange,
  addScene,
  sceneChange,
  setLinkQuantity,
  QUEST_STATUSES,
  applyBrief,
  applyEdit,
  applyQuestReward,
  applySessionPrep,
  formValues,
  gettingStarted,
  ROLE_LABELS,
  roleFromDisposition,
  linkedIds,
  revelationGroups,
  setLinks,
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

// The Lazy DM's eight steps, as the website words them
const PREP_STEPS = {
  characters: ["1. Review the characters", "What does each character want? What hooks might pull them in this session?"],
  strongStart: ["2. Create a strong start", "Open with something happening that pulls the players straight into the game."],
  scenes: ["3. Outline potential scenes", "A short list of scenes that might happen. Be ready to throw them away. One per line."],
  secrets: ["4. Define secrets and clues", "Pick around ten unrevealed secrets the party could discover. Don't decide how."],
  locations: ["5. Develop fantastic locations", "Places that might come up, each with a few evocative features."],
  npcs: ["6. Outline important NPCs", "Who is likely to show up?"],
  monsters: ["7. Choose relevant monsters", "Monsters that fit the locations and story, ready to drop in anywhere."],
  treasure: ["8. Select treasure and magic items", "Rewards that suit the characters."],
};

// A Foundry content link: click to open, drag onto a scene or sheet
const contentLink = (uuid, name, icon) =>
  `<a class="content-link" draggable="true" data-uuid="${escapeHtml(uuid)}" data-link><i class="fas fa-${icon}"></i>${escapeHtml(name)}</a>`;

const field = (f, value) => {
  const id = `dlcp-planner-${f.name}`;
  const label = `<label for="${id}">${escapeHtml(f.label)}${f.required ? " (required)" : ""}</label>`;
  const hint = f.hint ? `<p class="hint">${escapeHtml(f.hint)}</p>` : "";
  if (f.type === "textarea" || f.type === "lines") {
    return `<div class="form-group stacked">${label}<textarea id="${id}" name="${f.name}" rows="${f.type === "lines" ? 4 : 3}">${escapeHtml(value)}</textarea>${hint}</div>`;
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
        { icon: "fas fa-folder-open", label: "Open another campaign", action: "openCampaign" },
        { icon: "fas fa-circle-question", label: "Help", action: "help" },
        { icon: "fas fa-cloud-arrow-up", label: "Send to Dungeon Master Guru", action: "sendCampaign" },
        { icon: "fas fa-bug", label: "Report a bug", action: "reportBug" },
      ],
    },
    position: { width: 880, height: 760 },
    actions: {
      showTab: PlannerApp.#onShowTab,
      add: PlannerApp.#onAdd,
      edit: PlannerApp.#onEdit,
      delete: PlannerApp.#onDelete,
      openPage: PlannerApp.#onOpenPage,
      openSheet: PlannerApp.#onOpenSheet,
      saveBrief: PlannerApp.#onSaveBrief,
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
    },
  };

  #tab = "overview";
  #sessionId = null;
  #questId = null;
  #hookId = null;

  get sync() {
    return game.modules.get(MODULE_ID).api.sync;
  }

  get title() {
    return this.sync.linked ? `Campaign Planner: ${this.sync.linked.name}` : "Campaign Planner";
  }

  // A campaign in this world, or a synced one (premium): both can be changed here
  get #editable() {
    return this.sync.editable;
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
    const where = this.sync.isLocal
      ? `<span class="dlcp-muted"><i class="fas fa-house"></i> In this world</span>`
      : `<span class="dlcp-muted"><i class="fas fa-globe"></i> On Dungeon Master Guru${this.#editable ? ", synced" : ""}</span>`;
    const nav = TABS.map(
      (tab) => `<button type="button" data-action="showTab" data-tab="${tab.id}" ${tab.id === this.#tab ? 'aria-current="page"' : ""}>
        <i class="fas ${tab.icon}"></i> ${tab.label}</button>`,
    ).join("");
    return `
      <header class="dlcp-toolbar">
        <span>${where} ${campaign.mode ? `<span class="dlcp-badge">${escapeHtml(MODE_LABELS[campaign.mode] ?? campaign.mode)}</span>` : ""}</span>
        <span class="dlcp-buttons"><button type="button" data-action="run"><i class="fas fa-scroll"></i> Run it</button></span>
      </header>
      ${
        this.sync.isLocal
          ? ""
          : this.#editable
            ? `<p class="dlcp-notice">This campaign is on Dungeon Master Guru. Changes you make here go there too, and changes
                there come here. <a href="${escapeHtml(site)}" target="_blank" rel="noopener">Open it on Dungeon Master Guru</a></p>`
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
    const steps = gettingStarted(campaign, store);
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

    const brief = this.#editable
      ? `<form class="dlcp-brief" data-form="brief">
          <div class="dlcp-grid">${BRIEF_FIELDS.filter((f) => f.type === "text" || f.type === "number")
            .map((f) => field(f, formValues(BRIEF_FIELDS, campaign)[f.name]))
            .join("")}</div>
          ${BRIEF_FIELDS.filter((f) => f.type === "textarea" || f.type === "lines")
            .map((f) => field(f, formValues(BRIEF_FIELDS, campaign)[f.name]))
            .join("")}
          <div class="dlcp-buttons"><button type="button" data-action="saveBrief"><i class="fas fa-save"></i> Save the brief</button></div>
        </form>`
      : `<section class="dlcp-card">
          ${campaign.premise ? `<h3>Premise</h3><p>${escapeHtml(campaign.premise)}</p>` : ""}
          ${campaign.pitch ? `<h3>Pitch for your players</h3><p>${escapeHtml(campaign.pitch)}</p>` : ""}
          ${(campaign.truths ?? []).length ? `<h3>Truths of the setting</h3><ul>${campaign.truths.map((t) => `<li>${escapeHtml(t)}</li>`).join("")}</ul>` : ""}
        </section>`;
    const send = this.sync.isLocal
      ? `<section class="dlcp-card dlcp-send">
          <header class="dlcp-card-header"><h3><i class="fas fa-cloud-arrow-up"></i> Plan it on Dungeon Master Guru too</h3></header>
          <p class="dlcp-muted">Send this campaign to Dungeon Master Guru to plan it from any computer or phone. With premium
            Patreon, this world then syncs with it, and its journals stay where they are.</p>
          <div class="dlcp-buttons"><button type="button" data-action="sendCampaign"><i class="fas fa-cloud-arrow-up"></i> Send to Dungeon Master Guru</button></div>
        </section>`
      : "";
    return `${checklist}<h2>The brief</h2>${brief}${send}`;
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
    const nameOf = (collection, id) => store[collection]?.find((r) => r.id === id)?.name;
    const threats = store.fronts
      .map((front) => {
        const portents = (front.portents ?? [])
          .map(
            (portent, index) => `<label class="dlcp-portent"><input type="checkbox" data-action="togglePortent" data-uuid="${escapeHtml(front.uuid)}" data-index="${index}" ${portent.triggered ? "checked" : ""}> ${escapeHtml(portent.text)}</label>`,
          )
          .join("");
        return `<li class="dlcp-card dlcp-front">
          <div class="dlcp-front-clock">
            <button type="button" data-action="windBackClock" data-uuid="${escapeHtml(front.uuid)}" aria-label="Wind back ${escapeHtml(front.name)}" ${front.clockFilled <= 0 ? "disabled" : ""}>−</button>
            ${clockSvg(front.clockSegments, front.clockFilled, 64)}
            <button type="button" data-action="advanceClock" data-uuid="${escapeHtml(front.uuid)}" aria-label="Advance ${escapeHtml(front.name)}" ${front.clockFilled >= front.clockSegments ? "disabled" : ""}>+</button>
          </div>
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
      <p class="dlcp-muted">Each threat has a goal, grim portents that show it getting closer, and a clock that fills if no one stops it.</p>
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
    return `<p class="dlcp-muted">Main and side quests. Plan each one's maps, NPCs, monsters and reward.</p>
      <div class="dlcp-lanes">${lane("main", "Main quests")}${lane("side", "Side quests")}</div>
      <div class="dlcp-buttons">${this.#addButton("quests")}</div>`;
  }

  // What a quest needs and gives, in short, for its card
  #questSummary(store, quest) {
    const maps = (quest.foundryScenes ?? []).map((scene) => contentLink(scene.uuid, scene.name, "map"));
    const npcs = (quest.links ?? [])
      .filter((link) => link.linkableType === "CampaignNpc")
      .map((link) => escapeHtml(store.npcs.find((npc) => npc.id === link.linkableId)?.name ?? link.name));
    const monsters = this.#linkNames(store, quest, ["monster"], "Monster");
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
      ["Monsters", monsters],
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

  // A quest's plan: its maps, NPCs, monsters and reward. In this world it's all
  // edited here; for a Dungeon Master Guru campaign, the maps, coins, XP and
  // milestone are, and the rest is planned on the website.
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

    const monsters = editable
      ? `${this.#referenceRows(quest, store, ["monster"], { remove: "removeQuestLink" })}
         <div class="dlcp-drop" data-kind="questMonster"><i class="fas fa-dragon"></i> Drag monsters here from a compendium or the Actors directory.</div>`
      : this.#readOnlyList(this.#linkNames(store, quest, ["monster"], "Monster"), "No monsters picked on Dungeon Master Guru.");

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
        ${editable ? "" : `<p class="dlcp-notice">This quest is planned on Dungeon Master Guru. Add its maps, coins and XP here; they sync.</p>`}
        ${part("Maps", "The scenes the quest plays out on. Click one to view it.", maps)}
        ${part("NPCs involved", "Who helps, hinders or turns up along the way, beyond the quest giver.", npcs)}
        ${part("Monsters", "Creatures the party could face. Drag one from here onto a map to place a token.", monsters)}
        ${part("Reward", "What the party gets for finishing it.", reward)}
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

  // Cast ----------------------------------------------------------------------

  #renderCast(store) {
    const factionName = (id) => store.factions.find((f) => f.id === id)?.name;
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
          </div>${tree(location.id)}</li>`,
        )
        .join("")}</ul>`;
    };
    const places = tree(null);
    return `<p class="dlcp-muted">Fantastic locations, each with a few evocative features. Put places inside others, like a tavern in a town.</p>
      ${places || this.#empty("No places yet.")}
      <div class="dlcp-buttons">${this.#addButton("locations")}</div>`;
  }

  // Secrets -------------------------------------------------------------------

  #renderSecrets(store) {
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
      ${g.short ? `<p class="dlcp-notice dlcp-notice--warning">Needs ${3 - g.clues.length} more ${3 - g.clues.length === 1 ? "clue" : "clues"}. The Three Clue Rule: give the party three ways to find anything they must learn.</p>` : ""}
      <ul class="dlcp-list">${g.clues.map(clue).join("")}</ul>
    </section>`;
    return `<p class="dlcp-muted">Secrets the party could discover, grouped by what they reveal. Don't decide how they'll find them.</p>
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
    return `<p class="dlcp-muted">Prep each session with the Lazy Dungeon Master's eight steps, then run it from the Campaign Dashboard.</p>
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
    const step = (key, body) => `<section class="dlcp-card dlcp-prep-step"><h3>${escapeHtml(PREP_STEPS[key][0])}</h3>
      <p class="dlcp-muted">${escapeHtml(PREP_STEPS[key][1])}</p>${body}</section>`;
    const checklist = (collection, records, label) => this.#checklist(session, collection, records, label);
    const references = (categories, { quantities = false } = {}) =>
      this.#referenceRows(session, store, categories, { quantities, remove: "removeLink" });
    const unrevealed = store.secrets.filter((s) => !s.revealed || linkedIds(session, "secrets").includes(s.id));
    const party = this.sync.partyOptions().filter((option) => (campaign.partyActorUuids ?? []).includes(option.uuid));
    const values = session;

    return `${back}
      <form data-form="session">
        <h2>${escapeHtml(session.displayTitle)}</h2>
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
        ${step("strongStart", `<textarea name="strongStart" rows="3" aria-label="Strong start">${escapeHtml(values.strongStart ?? "")}</textarea>`)}
        ${step("scenes", `<textarea name="scenes" rows="4" aria-label="Potential scenes">${escapeHtml((values.scenes ?? []).join("\n"))}</textarea>`)}
        ${step("secrets", checklist("secrets", unrevealed, "secrets"))}
        ${step("locations", checklist("locations", store.locations, "places") + maps)}
        ${step("npcs", checklist("npcs", store.npcs, "NPCs"))}
        ${step(
          "monsters",
          `${references(["monster"])}<div class="dlcp-drop" data-kind="monster"><i class="fas fa-dragon"></i> Drag monsters here from a compendium or the Actors directory.</div>`,
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
          <button type="button" data-action="run"><i class="fas fa-scroll"></i> Run it</button>
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
    const form = EDIT_FORMS[collection];
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
      const result = applyEdit(collection, base, values, store);
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
    for (const collection of ["secrets", "locations", "npcs"]) {
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

  // Saves a quest's plan. For a Dungeon Master Guru campaign, only what syncs
  // from Foundry: its maps, coins, XP and milestone.
  async #saveQuest(quest, record) {
    if (this.#editable) return this.#save("quests", record);
    const { foundryScenes, rewardCurrency, rewardXp, milestone } = record;
    try {
      return await this.sync.update("quests", quest, { foundryScenes, rewardCurrency, rewardXp, milestone });
    } catch (error) {
      ui.notifications.error(`Couldn't save: ${error.message}`);
      return false;
    }
  }

  // Adds a map to the open quest, keeping anything typed in its plan
  async #addQuestScene(scene) {
    const quest = this.#record("quests", this.#questId);
    if (!quest) return;
    const result = addScene(quest.foundryScenes, scene.uuid, scene.name, "quest");
    if (result.error) return ui.notifications.warn(result.error);
    return this.#saveQuestScenes(quest, result.scenes);
  }

  async #saveQuestScenes(quest, scenes) {
    const current = this.#questFromForm(quest);
    if (current.error) return ui.notifications.warn(current.error);
    return this.#saveQuest(quest, { ...current.record, foundryScenes: scenes });
  }

  // A monster or item dropped on a quest's plan becomes a linked book reference
  async #addQuestReference(document) {
    const quest = this.#record("quests", this.#questId);
    const current = quest && this.#questFromForm(quest);
    if (!current || current.error) {
      if (current?.error) ui.notifications.warn(current.error);
      return;
    }
    const reference = await this.sync.referenceFor(document);
    const references = this.sync.recordLists().references;
    const ids = [...new Set([...linkedIds(current.record, "references"), reference.id])];
    await this.#save("quests", setLinks(current.record, "references", ids, references, () => foundry.utils.randomID(16)));
  }

  // A monster, item or table dropped on session prep becomes a linked book reference
  async #onDrop(event, kind, recordUuid) {
    event.preventDefault();
    event.stopPropagation();
    const data = foundry.applications.ux.TextEditor.implementation.getDragEventData(event);
    const document = data?.uuid ? await fromUuid(data.uuid) : null;
    if (["scene", "sessionScene", "questScene"].includes(kind) && document?.documentName !== "Scene") {
      return ui.notifications.warn("Drop a scene here, from the Scenes directory.");
    }
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
    const monster = kind === "monster" || kind === "questMonster";
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
    if (kind === "questMonster" || kind === "questTreasure") return this.#addQuestReference(dropped);
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
      content: `<p>Delete <strong>${escapeHtml(name)}</strong> and its journal page? Anything that points to it is cleared.</p>`,
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
    const result = applyBrief(campaign, Object.fromEntries(new FormData(form).entries()));
    if (result.error) return ui.notifications.warn(result.error);
    if (await this.#save("campaign", result.record)) ui.notifications.info("Saved the brief.");
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

  static async #onSaveQuest() {
    const quest = this.#record("quests", this.#questId);
    if (!quest) return;
    const result = this.#questFromForm(quest);
    if (result.error) return ui.notifications.warn(result.error);
    if (await this.#saveQuest(quest, result.record)) ui.notifications.info(`Saved ${quest.name}.`);
  }

  static async #onRemoveQuestLink(_event, target) {
    const quest = this.#record("quests", this.#questId);
    const current = quest && this.#questFromForm(quest);
    if (!current || current.error) return;
    const references = this.sync.recordLists().references;
    const ids = linkedIds(current.record, "references").filter((id) => id !== target.dataset.id);
    await this.#save("quests", setLinks(current.record, "references", ids, references, () => foundry.utils.randomID(16)));
  }

  static #onRemoveQuestScene(_event, target) {
    const quest = this.#record("quests", this.#questId);
    if (!quest) return;
    const scenes = (quest.foundryScenes ?? []).filter((scene) => scene.uuid !== target.dataset.scene);
    return this.#saveQuestScenes(quest, scenes);
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

  static #onReportBug() {
    game.modules.get(MODULE_ID).api.openBugReport();
  }
}
