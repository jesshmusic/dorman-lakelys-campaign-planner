import { DmGuruApi, DEFAULT_BASE_URL } from "./api.mjs";
import { renderRecord } from "./render.mjs";
import { mergeChange } from "./merge.mjs";
import { MODULE_ID, PUSH_TYPES, SECTIONS, SETTINGS, SYNCED_HOOK, TYPE_COLLECTIONS } from "./constants.mjs";

const flag = (document, key) => document.getFlag(MODULE_ID, key);

// Page title for a record
function pageName(collection, record) {
  if (collection === "campaign") return "Campaign";
  if (collection === "sessions") return record.displayTitle ?? `Session ${record.number}`;
  if (collection === "secrets") {
    const textValue = record.text ?? "Secret";
    return textValue.length > 60 ? `${textValue.slice(0, 57)}…` : textValue;
  }
  return record.name ?? "Untitled";
}

/**
 * Keeps this world's journals in step with the linked Dungeon Master Guru
 * campaign. Each record is a journal page whose flags hold the record JSON
 * and its sync version; the Campaign Dashboard reads from those flags.
 */
export class CampaignSync {
  #pulling = null;

  get linked() {
    const campaign = game.settings.get(MODULE_ID, SETTINGS.campaign);
    return campaign?.uuid ? campaign : null;
  }

  get token() {
    return game.settings.get(MODULE_ID, SETTINGS.apiToken);
  }

  get baseUrl() {
    return game.settings.get(MODULE_ID, SETTINGS.baseUrl) || DEFAULT_BASE_URL;
  }

  get ready() {
    return Boolean(game.user.isGM && this.token && this.linked);
  }

  api(token = this.token) {
    return new DmGuruApi({ baseUrl: this.baseUrl, token });
  }

  /** The journal folder for the linked campaign, if it exists */
  get folder() {
    const uuid = this.linked?.uuid;
    return uuid ? game.folders.find((f) => f.type === "JournalEntry" && flag(f, "campaignUuid") === uuid) : null;
  }

  /** Every synced record, as { collection: Map(id -> record) } */
  records() {
    const store = Object.fromEntries(SECTIONS.map(({ collection }) => [collection, new Map()]));
    for (const entry of this.#entriesInFolder()) {
      for (const page of entry.pages) {
        const collection = flag(page, "collection");
        const record = flag(page, "record");
        if (collection && record && store[collection]) store[collection].set(String(record.id), record);
      }
    }
    return store;
  }

  /** Pulls changes from Dungeon Master Guru into the journals */
  pull({ full = false } = {}) {
    this.#pulling ??= this.#pull(full).finally(() => {
      this.#pulling = null;
    });
    return this.#pulling;
  }

  async #pull(full) {
    const linked = this.linked;
    if (!linked) throw new Error("No campaign is linked to this world.");

    const since = full ? 0 : linked.cursor ?? 0;
    const changes = await this.api().changes(linked.uuid, since);
    const name = changes.campaign?.name ?? linked.name;
    const entries = await this.#ensureEntries(name);

    // Current records, updated with what came in
    const store = this.records();
    const incomingUuids = new Set();
    if (changes.campaign) store.campaign.set(String(changes.campaign.id), changes.campaign);
    for (const [collection, records] of Object.entries(changes.records)) {
      for (const record of records) {
        store[collection]?.set(String(record.id), record);
        incomingUuids.add(record.uuid);
      }
    }
    const deleted = new Set(changes.tombstones.map((tombstone) => tombstone.uuid));

    // On a full pull, anything not sent back no longer exists
    if (changes.full) {
      for (const [collection, records] of Object.entries(store)) {
        if (collection === "campaign") continue;
        for (const [id, record] of records) {
          if (!incomingUuids.has(record.uuid)) {
            deleted.add(record.uuid);
            records.delete(id);
          }
        }
      }
    }
    for (const records of Object.values(store)) {
      for (const [id, record] of records) if (deleted.has(record.uuid)) records.delete(id);
    }

    const context = this.#renderContext(store);
    for (const { collection } of SECTIONS) {
      await this.#writePages(entries[collection], collection, [...store[collection].values()], deleted, context);
    }

    await game.settings.set(MODULE_ID, SETTINGS.campaign, {
      ...linked,
      name,
      cursor: changes.cursor,
      lastSynced: Date.now(),
    });
    Hooks.callAll(SYNCED_HOOK);
    return changes;
  }

  /**
   * Sends a change made in Foundry (e.g. a clock advanced) to Dungeon Master
   * Guru. If the record changed there too, merges field by field and asks the
   * DM when both sides changed the same thing. Returns true when saved.
   */
  async update(collection, record, attributes) {
    const type = PUSH_TYPES[collection];
    if (!type) throw new Error(`Can't change ${collection} from Foundry.`);

    const result = await this.api().push(this.linked.uuid, [
      { type, uuid: record.uuid, baseVersion: record.syncVersion, attributes },
    ]);
    if (result.applied.length) return this.#saveRecord(collection, result.applied[0].current);
    if (result.errors.length) {
      ui.notifications.error(`${result.errors[0].errors.join(", ")}`);
      return false;
    }

    const theirs = result.conflicts[0].current;
    const { retry, clashes } = mergeChange(record, comparable(attributes), theirs);
    let toSend = retry;
    if (clashes.length) {
      const keepMine = await foundry.applications.api.DialogV2.confirm({
        window: { title: "Changed on Dungeon Master Guru too" },
        content: `<p>This was also changed on Dungeon Master Guru (${clashes.join(", ")}).</p>
                  <p>Keep the change you just made in Foundry?</p>`,
      });
      toSend = keepMine ? comparable(attributes) : retry;
    }
    if (!Object.keys(toSend).length) {
      await this.#saveRecord(collection, theirs);
      return false;
    }
    const retried = await this.api().push(this.linked.uuid, [
      { type, uuid: record.uuid, baseVersion: theirs.syncVersion, attributes: withExtras(toSend, attributes) },
    ]);
    if (retried.applied.length) return this.#saveRecord(collection, retried.applied[0].current);
    ui.notifications.warn("That record keeps changing on Dungeon Master Guru. Sync and try again.");
    await this.pull();
    return false;
  }

  async #saveRecord(collection, record) {
    const store = this.records();
    store[collection].set(String(record.id), record);
    const entry = this.#entriesInFolder().find((e) => flag(e, "collection") === collection);
    if (entry) await this.#writePages(entry, collection, [record], new Set(), this.#renderContext(store));
    Hooks.callAll(SYNCED_HOOK);
    return true;
  }

  #renderContext(store) {
    return {
      baseUrl: this.baseUrl,
      references: [...store.references.values()],
      nameOf: (collection, id) => {
        if (id === null || id === undefined) return null;
        const record = store[collection]?.get(String(id));
        return record ? pageName(collection, record) : null;
      },
    };
  }

  #entriesInFolder() {
    const folder = this.folder;
    return folder ? game.journal.filter((entry) => entry.folder?.id === folder.id) : [];
  }

  async #ensureEntries(campaignName) {
    const uuid = this.linked.uuid;
    let folder = this.folder;
    if (!folder) {
      folder = await Folder.create({
        name: `${campaignName} (DM Guru)`,
        type: "JournalEntry",
        flags: { [MODULE_ID]: { campaignUuid: uuid } },
      });
    }
    const existing = this.#entriesInFolder();
    const entries = {};
    for (const [index, { collection, name }] of SECTIONS.entries()) {
      entries[collection] =
        existing.find((entry) => flag(entry, "collection") === collection) ??
        (await JournalEntry.create({
          name,
          folder: folder.id,
          sort: (index + 1) * 1000,
          flags: { [MODULE_ID]: { collection } },
        }));
    }
    return entries;
  }

  // Creates, updates or deletes pages so the entry matches the records
  async #writePages(entry, collection, records, deleted, context) {
    const pages = new Map(entry.pages.map((page) => [flag(page, "uuid"), page]));
    const creates = [];
    const updates = [];
    for (const record of records) {
      const content = renderRecord(collection, record, context);
      const data = {
        name: pageName(collection, record),
        "text.content": content,
        [`flags.${MODULE_ID}`]: { uuid: record.uuid, collection, syncVersion: record.syncVersion, record },
      };
      // Sessions in play order; other pages keep their creation order
      if (collection === "sessions") data.sort = record.number * 1000;
      const page = pages.get(record.uuid);
      if (!page) {
        creates.push(
          foundry.utils.expandObject({
            ...data,
            type: "text",
            "text.format": CONST.JOURNAL_ENTRY_PAGE_FORMATS.HTML,
          }),
        );
      } else if (
        page.text.content !== content ||
        page.name !== data.name ||
        flag(page, "syncVersion") !== record.syncVersion
      ) {
        updates.push({ _id: page.id, ...data });
      }
    }
    const removals = [...pages.entries()].filter(([uuid]) => deleted.has(uuid)).map(([, page]) => page.id);

    if (creates.length) await entry.createEmbeddedDocuments("JournalEntryPage", creates);
    if (updates.length) await entry.updateEmbeddedDocuments("JournalEntryPage", updates);
    if (removals.length) await entry.deleteEmbeddedDocuments("JournalEntryPage", removals);
  }

  /** Forgets the link (the journals stay) */
  async unlink() {
    await game.settings.set(MODULE_ID, SETTINGS.campaign, {});
    Hooks.callAll(SYNCED_HOOK);
  }
}

// The push payload names a revealed secret's session by uuid; the record has
// its id. Compare only the fields both share.
function comparable(attributes) {
  const { revealedSessionUuid: _ignored, ...rest } = attributes;
  return rest;
}

function withExtras(toSend, attributes) {
  return "revealed" in toSend && "revealedSessionUuid" in attributes
    ? { ...toSend, revealedSessionUuid: attributes.revealedSessionUuid }
    : toSend;
}

export { TYPE_COLLECTIONS };
