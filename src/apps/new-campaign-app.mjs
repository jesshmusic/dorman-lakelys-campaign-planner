import { escapeHtml } from "../render.mjs";
import { PACK_NAMES } from "../compendium.mjs";
import { MODULE_ID, SETTINGS } from "../constants.mjs";
import {
  FIELDS,
  LAST_STEP,
  defaultDraft,
  guideSteps,
  guideTemplates,
  hasProgress,
  normalizeDraft,
  stepForField,
  toPayload,
  truthsOf,
  validateAll,
  validateStep,
} from "../setup.mjs";
import { loadGuideWords } from "../guide-words.mjs";

/**
 * The guided "New campaign" setup: what kind of game, the pitch, the table,
 * the world and the books, then a review. Creates the campaign on Dungeon
 * Master Guru (and links this world to it) or in this world.
 * Answers are kept as the DM goes (per world, in this browser).
 */
export class NewCampaignApp extends foundry.applications.api.ApplicationV2 {
  static DEFAULT_OPTIONS = {
    id: "dlcp-new-campaign",
    classes: ["dlcp-app", "dlcp-setup"],
    tag: "div",
    window: { title: "New campaign", icon: "fas fa-feather-alt", resizable: true },
    position: { width: 680, height: "auto" },
    actions: {
      back: NewCampaignApp.#onBack,
      next: NewCampaignApp.#onNext,
      goTo: NewCampaignApp.#onGoTo,
      create: NewCampaignApp.#onCreate,
      createLocal: NewCampaignApp.#onCreateLocal,
      help: NewCampaignApp.#onHelp,
      startOver: NewCampaignApp.#onStartOver,
      connect: NewCampaignApp.#onConnect,
      openDashboard: NewCampaignApp.#onOpenDashboard,
      openPlanner: NewCampaignApp.#onOpenPlanner,
    },
  };

  #draft = null;
  #restored = false;
  #error = null;
  #busy = false;
  // { campaign, linked } once created
  #created = null;
  // Kept across retries, so a create that timed out isn't made twice
  #requestId = null;
  #focusHeading = false;
  #saveSoon = foundry.utils.debounce(() => this.#writeDraft(this.#draft), 400);

  get sync() {
    return game.modules.get(MODULE_ID).api.sync;
  }

  // Drafts --------------------------------------------------------------------

  #loadDraft() {
    const saved = game.settings.get(MODULE_ID, SETTINGS.setupDraft)?.[game.world.id];
    const draft = normalizeDraft(
      saved,
      this.sync.partyOptions().map((option) => option.uuid),
    );
    this.#restored = Boolean(saved) && hasProgress(draft);
    return draft;
  }

  // null forgets this world's draft
  async #writeDraft(draft) {
    const drafts = { ...(game.settings.get(MODULE_ID, SETTINGS.setupDraft) ?? {}) };
    if (draft) drafts[game.world.id] = draft;
    else delete drafts[game.world.id];
    await game.settings.set(MODULE_ID, SETTINGS.setupDraft, drafts);
  }

  // Rendering -----------------------------------------------------------------

  async _renderHTML() {
    this.#draft ??= this.#loadDraft();
    const container = document.createElement("div");
    container.classList.add("dlcp-setup-body");
    container.innerHTML = this.#created ? this.#renderCreated() : this.#renderStep();
    return container;
  }

  _replaceHTML(result, content) {
    content.replaceChildren(result);
  }

  async _onFirstRender(context, options) {
    await super._onFirstRender?.(context, options);
    // The latest words from Dungeon Master Guru; the ones already showing are fine until then
    loadGuideWords().then((changed) => changed && this.rendered && this.render());
    // Typing updates the draft without re-rendering, so focus stays put
    this.element.addEventListener("input", (event) => this.#onInput(event));
    this.element.addEventListener("change", (event) => this.#onChange(event));
  }

  async _onRender(context, options) {
    await super._onRender?.(context, options);
    this.#updateAllPacks();
    if (this.#focusHeading) this.element.querySelector(".dlcp-setup-body h2")?.focus();
    this.#focusHeading = false;
  }

  async _onClose(options) {
    if (this.#draft && !this.#created) await this.#writeDraft(this.#draft);
    this.#draft = null;
    this.#created = null;
    this.#error = null;
    await super._onClose?.(options);
  }

  #renderStep() {
    const draft = this.#draft;
    const step = guideSteps()[draft.step];
    const progress = guideSteps().map(
      (s, index) => `<li><button type="button" data-action="goTo" data-step="${index}"
        ${index === draft.step ? 'aria-current="step"' : ""} ${index > draft.furthest ? "disabled" : ""}>${index + 1}. ${escapeHtml(s.label)}</button></li>`,
    ).join("");
    const why =
      step.why || step.example
        ? `<aside class="dlcp-why" aria-label="Why this matters">
            <h3>Why this matters</h3>
            ${step.why ? `<p>${escapeHtml(step.why)}</p>` : ""}
            ${step.example ? `<h4>Example</h4><p class="dlcp-example">${escapeHtml(step.example)}</p>` : ""}
          </aside>`
        : "";
    const forward =
      draft.step < LAST_STEP
        ? `<button type="button" data-action="next">Next: ${escapeHtml(guideSteps()[draft.step + 1].title)} <i class="fas fa-arrow-right"></i></button>`
        : `${
            this.sync.token
              ? `<button type="button" data-action="create" ${this.#busy ? "disabled" : ""}>
                  <i class="fas fa-globe"></i> Create on Dungeon Master Guru</button>`
              : ""
          }
          <button type="button" data-action="createLocal" ${this.#busy ? "disabled" : ""}>
            <i class="fas fa-feather-alt"></i> ${this.#busy ? "Creating…" : "Create in this world"}</button>`;

    return `
      ${this.#restored ? `<p class="dlcp-notice">Picking up where you left off. <button type="button" class="dlcp-link-button" data-action="startOver">Start over</button></p>` : ""}
      <nav aria-label="Setup steps"><ol class="dlcp-steps">${progress}</ol></nav>
      <h2 tabindex="-1">${escapeHtml(step.title)}</h2>
      <p class="dlcp-muted">${escapeHtml(step.intro)}</p>
      <div class="dlcp-step">${this.#renderStepBody(step)}</div>
      ${why}
      ${this.#error ? `<p class="dlcp-notice dlcp-notice--error" role="alert">${escapeHtml(this.#error)}</p>` : ""}
      <footer class="dlcp-buttons dlcp-setup-nav">
        ${draft.step > 0 ? `<button type="button" data-action="back"><i class="fas fa-arrow-left"></i> Back</button>` : ""}
        ${forward}
      </footer>`;
  }

  #renderStepBody(step) {
    switch (step.id) {
      case "kind":
        return this.#renderKinds();
      case "table":
        return `${this.#renderParty()}${this.#renderFields(step.fields)}`;
      case "books":
        return this.#renderBooks();
      case "review":
        return this.#renderReview();
      default:
        return this.#renderFields(step.fields);
    }
  }

  #renderKinds() {
    return `<div class="dlcp-kinds" role="radiogroup" aria-label="Campaign template">${guideTemplates().map(
      (option) => `
      <label class="dlcp-kind ${this.#draft.template === option.value ? "dlcp-kind--selected" : ""}">
        <span><input type="radio" name="template" value="${option.value}" ${this.#draft.template === option.value ? "checked" : ""}>
          <strong>${escapeHtml(option.title)}</strong></span>
        <span class="dlcp-muted">${escapeHtml(option.description)}</span>
        <em class="dlcp-muted">${escapeHtml(option.example)}</em>
      </label>`,
    ).join("")}</div>`;
  }

  #renderFields(names = []) {
    return names
      .map((name) => {
        const field = FIELDS[name];
        const id = `dlcp-setup-${name}`;
        const value = escapeHtml(this.#draft.values[name] ?? "");
        const placeholder = field.placeholder ? `placeholder="${escapeHtml(field.placeholder)}"` : "";
        const control =
          field.type === "textarea" || field.type === "lines"
            ? `<textarea id="${id}" data-field="${name}" rows="${field.type === "lines" ? 6 : 3}" ${placeholder}>${value}</textarea>`
            : `<input id="${id}" data-field="${name}" type="${field.type === "number" ? "number" : "text"}" value="${value}"
                ${field.min ? `min="${field.min}" max="${field.max}"` : ""} ${placeholder}>`;
        const stacked = field.type === "textarea" || field.type === "lines" ? "stacked" : "";
        return `<div class="form-group ${stacked}">
          <label for="${id}">${escapeHtml(field.label)}${field.required ? " (required)" : ""}</label>
          ${control}
          ${field.hint ? `<p class="hint">${escapeHtml(field.hint)}</p>` : ""}
        </div>`;
      })
      .join("");
  }

  #renderParty() {
    const options = this.sync.partyOptions();
    if (!options.length) {
      return `<h3>Who's playing?</h3>
        <p class="dlcp-muted">This world has no Player Character actors yet. You can still create the campaign, and choose
        the party later on Dungeon Master Guru once their characters are in the world.</p>`;
    }
    const rows = options
      .map(
        (option) => `<tr>
          <td><input type="checkbox" data-party="${escapeHtml(option.uuid)}" aria-label="${escapeHtml(option.name)} is in the party"
            ${this.#draft.party.includes(option.uuid) ? "checked" : ""}></td>
          <td>${escapeHtml(option.name)}</td>
          <td>${escapeHtml(option.classes || "—")}</td>
          <td>${escapeHtml(option.level ?? "—")}</td>
          <td>${escapeHtml(option.playerName ?? "—")}</td>
        </tr>`,
      )
      .join("");
    return `<h3>Who's playing?</h3>
      <p class="dlcp-muted">Pick the player characters in the party. If you create the campaign on Dungeon Master Guru,
      their character sheets go with it: what the players built, never spell or item descriptions.</p>
      <table class="dlcp-party">
        <thead><tr><th aria-label="In the party"></th><th>Name</th><th>Class</th><th>Level</th><th>Player</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>`;
  }

  // The SRD and core book packs in this world, named as Dungeon Master Guru names them
  #packChoices() {
    return Object.entries(PACK_NAMES)
      .map(([id, names]) => ({ id, pack: game.packs.get(id), ...names }))
      .filter(({ pack }) => pack)
      .map(({ id, pack, book, label }) => ({ id, book, label, count: pack.index.size }));
  }

  #renderBooks() {
    const packs = this.#packChoices();
    if (!packs.length) {
      return `<p class="dlcp-muted">This world has none of the SRD 5.2 or 2024 core book compendiums enabled. You can
        create the campaign anyway; monster and treasure searches will use Dungeon Master Guru's own SRD.</p>`;
    }
    const books = [...new Set(packs.map((pack) => pack.book))];
    return `
      <label class="dlcp-check"><input type="checkbox" data-all-packs> <strong>All compendiums</strong></label>
      ${books
        .map(
          (book) => `<fieldset class="dlcp-books"><legend>${escapeHtml(book)}</legend>
            ${packs
              .filter((pack) => pack.book === book)
              .map(
                (pack) => `<label class="dlcp-check"><input type="checkbox" data-pack="${escapeHtml(pack.id)}"
                  ${this.#draft.excludedPacks.includes(pack.id) ? "" : "checked"}> ${escapeHtml(pack.label)}
                  <span class="dlcp-muted">(${pack.count})</span></label>`,
              )
              .join("")}
          </fieldset>`,
        )
        .join("")}`;
  }

  #renderReview() {
    const values = this.#draft.values;
    const text = (name) => String(values[name] ?? "").trim();
    const fact = (label, value) =>
      value ? `<p><strong>${escapeHtml(label)}:</strong> ${escapeHtml(value)}</p>` : "";
    const block = (id, body) => {
      const index = guideSteps().findIndex((step) => step.id === id);
      return `<section class="dlcp-summary">
        <header><h3>${escapeHtml(guideSteps()[index].title)}</h3>
          <button type="button" class="dlcp-link-button" data-action="goTo" data-step="${index}">Edit</button></header>
        ${body}
      </section>`;
    };
    const party = this.sync
      .partyOptions()
      .filter((option) => this.#draft.party.includes(option.uuid))
      .map((option) => option.name);
    const start = text("start_level");
    const target = text("target_level");
    const truths = truthsOf(values.truths);
    const packs = this.#packChoices();
    const on = packs.filter((pack) => !this.#draft.excludedPacks.includes(pack.id)).length;
    const linked = this.sync.linked;

    return `
      ${block("kind", `<p>${escapeHtml(guideTemplates().find((option) => option.value === this.#draft.template)?.title ?? "")}</p>`)}
      ${block(
        "pitch",
        fact("Name", text("name") || "Not named yet") +
          fact("Premise", text("premise")) +
          fact("Tone", text("tone")) +
          fact("Pitch for your players", text("pitch")),
      )}
      ${block(
        "table",
        fact("Party", party.join(", ")) +
          fact("Players", text("party_size")) +
          fact("Levels", start && target && start !== target ? `${start} to ${target}` : start || target) +
          fact("Sessions", text("planned_sessions")) +
          fact("How often", text("cadence")),
      )}
      ${block(
        "world",
        fact("Setting", text("setting_name")) +
          (truths.length ? `<ul>${truths.map((truth) => `<li>${escapeHtml(truth)}</li>`).join("")}</ul>` : "") +
          fact("Setting notes", text("setting_notes")) ||
          `<p class="dlcp-muted">Nothing yet. You can add it later.</p>`,
      )}
      ${block(
        "books",
        `<p>${!packs.length ? "No compendiums in this world." : on === packs.length ? "All compendiums" : `${on} of ${packs.length} compendiums`}</p>`,
      )}
      <section class="dlcp-where">
        <h3>Where should it live?</h3>
        <p><strong>In this world:</strong> no account needed. Everything stays in Foundry: journals for the plan, and the
          Campaign Dashboard to run it.</p>
        <p><strong>On Dungeon Master Guru:</strong> plan on the website as well as here, with a free account, from any
          computer or phone. It syncs into this world.</p>
        ${
          this.sync.token
            ? ""
            : `<p class="dlcp-muted">To create it on Dungeon Master Guru, connect first.
                <button type="button" class="dlcp-link-button" data-action="connect">Connect</button> ·
                <button type="button" class="dlcp-link-button" data-action="help">How the two compare</button></p>`
        }
      </section>
      ${
        linked
          ? `<p class="dlcp-notice dlcp-notice--warning">This world's campaign is <strong>${escapeHtml(linked.name)}</strong>.
            The new campaign takes its place. ${escapeHtml(linked.name)}'s journals stay where they are.</p>`
          : ""
      }`;
  }

  #renderCreated() {
    if (this.#created.local) return this.#renderCreatedLocal();
    const { campaign, linked, linkError } = this.#created;
    const url = `${this.sync.baseUrl}${campaign.url ?? ""}`;
    const sync = linked
      ? `<p>This world is linked to it. Its journals are in the "${escapeHtml(campaign.name)} (DM Guru)" folder, and the
          Campaign Dashboard is open.</p>`
      : `<p class="dlcp-notice dlcp-notice--warning">The campaign was made, but linking this world failed: ${escapeHtml(linkError ?? "unknown error")}
            Try again from the Connect window.</p>`;
    return `
      <h2 tabindex="-1">${escapeHtml(campaign.name)} is ready</h2>
      ${sync}
      <p>Next, plan the rest on Dungeon Master Guru: the villain's threat, the cast, secrets and clues, and the first
        session. The campaign's Overview has a Getting started list to work through.</p>
      <div class="dlcp-buttons">
        <a class="button" href="${escapeHtml(url)}" target="_blank" rel="noopener"><i class="fas fa-external-link-alt"></i> Open on Dungeon Master Guru</a>
        ${linked ? `<button type="button" data-action="openDashboard"><i class="fas fa-scroll"></i> Campaign Dashboard</button>` : ""}
      </div>`;
  }

  #renderCreatedLocal() {
    const { campaign } = this.#created;
    return `
      <h2 tabindex="-1">${escapeHtml(campaign.name)} is ready</h2>
      <p>It lives in this world. Its journals are in the "${escapeHtml(campaign.name)}" folder, and the Campaign Planner
        is open.</p>
      <h3>What to do next</h3>
      <p>Open the <strong>Campaign Planner</strong> to fill it in. Its Overview tab has a Getting started list: choose
        the party, give your villain a threat, add the cast, hide some secrets, and prep the first session. Run it at
        the table from the <strong>Campaign Dashboard</strong>.</p>
      <p class="dlcp-muted">Want to plan from anywhere? You can move this campaign to Dungeon Master Guru later.
        <button type="button" class="dlcp-link-button" data-action="help">How it works</button></p>
      <div class="dlcp-buttons">
        <button type="button" data-action="openPlanner"><i class="fas fa-feather-alt"></i> Campaign Planner</button>
        <button type="button" data-action="openDashboard"><i class="fas fa-scroll"></i> Campaign Dashboard</button>
      </div>`;
  }

  // Input ---------------------------------------------------------------------

  #onInput(event) {
    const field = event.target.dataset?.field;
    if (!field) return;
    this.#draft.values[field] = event.target.value;
    if (field === "party_size") this.#draft.partySizeEdited = true;
    this.#saveSoon();
  }

  #onChange(event) {
    const target = event.target;
    if (target.name === "template") {
      this.#draft.template = target.value;
      this.#saveSoon();
      return this.render();
    }
    if (target.dataset.party) {
      const uuid = target.dataset.party;
      this.#draft.party = target.checked
        ? [...new Set([...this.#draft.party, uuid])]
        : this.#draft.party.filter((other) => other !== uuid);
      // Picking characters sets the number of players, until the DM types their own
      if (!this.#draft.partySizeEdited && this.#draft.party.length) {
        this.#draft.values.party_size = String(this.#draft.party.length);
        const input = this.element.querySelector('[data-field="party_size"]');
        if (input) input.value = this.#draft.values.party_size;
      }
    } else if (target.dataset.pack) {
      const pack = target.dataset.pack;
      this.#draft.excludedPacks = target.checked
        ? this.#draft.excludedPacks.filter((other) => other !== pack)
        : [...new Set([...this.#draft.excludedPacks, pack])];
      this.#updateAllPacks();
    } else if (target.dataset.allPacks !== undefined) {
      const ids = this.#packChoices().map((pack) => pack.id);
      this.#draft.excludedPacks = target.checked
        ? this.#draft.excludedPacks.filter((id) => !ids.includes(id))
        : [...new Set([...this.#draft.excludedPacks, ...ids])];
      for (const box of this.element.querySelectorAll("[data-pack]")) box.checked = target.checked;
      this.#updateAllPacks();
    } else {
      return;
    }
    this.#saveSoon();
  }

  // The "All compendiums" box: on, off, or partly on
  #updateAllPacks() {
    const all = this.element?.querySelector("[data-all-packs]");
    if (!all) return;
    const boxes = [...this.element.querySelectorAll("[data-pack]")];
    const on = boxes.filter((box) => box.checked).length;
    all.checked = on === boxes.length;
    all.indeterminate = on > 0 && on < boxes.length;
  }

  // Steps ---------------------------------------------------------------------

  // Shows a step, with an error to explain if there is one
  #goTo(index, error = null) {
    this.#error = error;
    this.#draft.step = index;
    this.#draft.furthest = Math.max(this.#draft.furthest, index);
    this.#focusHeading = true;
    this.#saveSoon();
    return this.render();
  }

  static #onBack() {
    return this.#goTo(Math.max(this.#draft.step - 1, 0));
  }

  static #onNext() {
    const error = validateStep(guideSteps()[this.#draft.step].id, this.#draft.values);
    if (error) return this.#goTo(this.#draft.step, error);
    return this.#goTo(Math.min(this.#draft.step + 1, LAST_STEP));
  }

  static #onGoTo(event, target) {
    const index = Number(target.dataset.step);
    if (Number.isInteger(index) && index <= this.#draft.furthest) return this.#goTo(index);
  }

  static async #onStartOver() {
    this.#draft = defaultDraft();
    this.#restored = false;
    this.#error = null;
    await this.#writeDraft(null);
    return this.render();
  }

  static #onConnect() {
    game.modules.get(MODULE_ID).api.openConnect();
  }

  static #onOpenPlanner() {
    game.modules.get(MODULE_ID).api.openPlanner();
  }

  static #onOpenDashboard() {
    game.modules.get(MODULE_ID).api.openDashboard();
  }

  // Asks before a new campaign takes the place of this world's campaign
  async #confirmReplace() {
    const linked = this.sync.linked;
    if (!linked) return true;
    return foundry.applications.api.DialogV2.confirm({
      window: { title: "Create a new campaign" },
      content: `<p>This world's campaign is <strong>${escapeHtml(linked.name)}</strong>. The new campaign takes its place;
        ${escapeHtml(linked.name)}'s journals stay where they are. Create it?</p>`,
    });
  }

  static async #onCreateLocal() {
    const invalid = validateAll(this.#draft.values);
    if (invalid) return this.#goTo(invalid.step, invalid.error);
    if (!(await this.#confirmReplace())) return;

    this.#busy = true;
    this.#error = null;
    await this.render();
    try {
      const campaign = await this.sync.createLocal(this.#draft);
      await this.#writeDraft(null);
      this.#created = { campaign, local: true };
      this.#focusHeading = true;
      game.modules.get(MODULE_ID).api.openPlanner({ tab: "overview", sessionId: null });
    } catch (error) {
      this.#error = `Couldn't create the campaign: ${error.message}`;
    } finally {
      this.#busy = false;
      this.render();
    }
  }

  static #onHelp() {
    game.modules.get(MODULE_ID).api.openHelp();
  }

  static async #onCreate() {
    const invalid = validateAll(this.#draft.values);
    if (invalid) return this.#goTo(invalid.step, invalid.error);
    if (!(await this.#confirmReplace())) return;

    this.#busy = true;
    this.#error = null;
    await this.render();
    this.#requestId ??= foundry.utils.randomID(16);
    try {
      const api = this.sync.api();
      const campaign = await api.createCampaign(
        toPayload(this.#draft, {
          world: { id: game.world.id, title: game.world.title },
          characters: this.sync.characterPayloads(this.#draft.party),
          requestId: this.#requestId,
        }),
      );
      this.#requestId = null;
      await this.#writeDraft(null);
      this.#created = { campaign, linked: false };

      try {
        await this.sync.link(campaign);
        this.#created.linked = true;
        game.modules.get(MODULE_ID).api.openDashboard();
      } catch (error) {
        this.#created.linkError = error.message;
      }
      this.#focusHeading = true;
    } catch (error) {
      this.#error = this.#messageFor(error);
      if (error.fields?.length) {
        this.#draft.step = Math.min(...error.fields.map(stepForField));
        this.#focusHeading = true;
      }
    } finally {
      this.#busy = false;
      this.render();
    }
  }

  #messageFor(error) {
    if (error.status === 0) return "Couldn't reach Dungeon Master Guru. Your answers are saved; try again in a moment.";
    if (error.unauthorized) {
      return "Dungeon Master Guru didn't accept your API token. Connect again, then create the campaign. Your answers are saved.";
    }
    return error.message;
  }
}
