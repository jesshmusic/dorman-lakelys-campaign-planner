import { DmGuruApi } from "./api.mjs";
import { DM_GURU_URL } from "./env.mjs";
import { escapeHtml, renderRecord } from "./render.mjs";
import { mergeChange } from "./merge.mjs";
import { COMPENDIUM_PACKS, INDEX_FIELDS, INDEX_FORMAT, compendiumLookup, entryFromIndex } from "./compendium.mjs";
import { characterPayload, isPlayerCharacter, partyOption } from "./characters.mjs";
import { applyLocalChange, buildLocalCampaign, newRecord } from "./local.mjs";
import { planDelete, referenceFromDocument } from "./planner.mjs";
import { THUMBNAIL, campaignSceneUuids, hasThumbnail, sceneVersion } from "./scenes.mjs";
import { importPayload } from "./send.mjs";
import { encounterSort, planQuestEncounters, questSort } from "./encounters.mjs";
import { SRD_TABLES, systemTables } from "./difficulty.mjs";
import {
  MONSTER_FOLDER,
  chosenSources,
  droppedSources,
  homebrewOptions,
  homebrewPack,
  importedActorUuid,
  monsterActorData,
  worldActorEntries,
  worldActorsSource,
} from "./homebrew.mjs";
import { normalizeTruths } from "./setup.mjs";
import { changedAttributes, createAttributes, describeFields, syncValue, uuidV4 } from "./editing.mjs";
import {
  pendingCount,
  pendingUuids,
  pointAtRealIds,
  pointsAt,
  pushPayload,
  queueCreate,
  queueDelete,
  queueUpdate,
  realIds,
  sendOrder,
  withRealIds,
} from "./outbox.mjs";
import { migrateFolder, newFolderFlags } from "./migrate-world.mjs";
import {
  ADVENTURE_PACK,
  CAMPAIGN_FLAG,
  adventureData,
  adventureUuids,
  foldersFor,
  handoutEntryIds,
  isPlayersCharacter,
  localFolderName,
  localJournal,
  subfolderIds,
  worldDocument,
} from "./adventure.mjs";
import { MODULE_ID, PUSH_TYPES, SECTIONS, SETTINGS, SYNCED_HOOK, TYPE_COLLECTIONS } from "./constants.mjs";
import { currentTechniques } from "./technique-settings.mjs";

const flag = (document, key) => document.getFlag(MODULE_ID, key);

// A campaign record with its truths as [{ name, description }], however they
// were kept: older versions of the module and of Dungeon Master Guru kept text
const withTruths = (campaign) =>
  campaign && "truths" in campaign ? { ...campaign, truths: normalizeTruths(campaign.truths) } : campaign;
// A record as the planner, Dashboard and journals use it
const readable = (collection, record) => (collection === "campaign" ? withTruths(record) : record);

// The cache key of an image Foundry has loaded, or null
function loadedKey(src) {
  if (PIXI.Assets.cache.has(src)) return src;
  const busted = foundry.utils.getCacheBustURL(src);
  return busted && PIXI.Assets.cache.has(busted) ? busted : null;
}

// Makes a scene's thumbnail, then unloads the images it loaded that weren't
// already in use, so sending a whole world's scenes doesn't fill the memory
async function sceneThumbnail(scene) {
  const sources = [
    ...new Set(
      [
        ...scene.levels.contents.flatMap((level) => [level.background?.src, level.foreground?.src]),
        ...scene.tiles.contents.map((tile) => tile.texture?.src),
      ].filter(Boolean),
    ),
  ];
  const before = new Set(sources.filter((src) => loadedKey(src)));
  try {
    return (await scene.createThumbnail(THUMBNAIL)).thumb;
  } finally {
    const loaded = sources.filter((src) => !before.has(src)).map(loadedKey).filter(Boolean);
    await Promise.allSettled(loaded.map((key) => PIXI.Assets.unload(key)));
  }
}

// Changes when the pack's package updates, or when what the module sends changes
function packVersion(pack) {
  const { packageName, packageType } = pack.metadata;
  const version = packageType === "system" ? game.system.version : game.modules.get(packageName)?.version;
  return `${packageName}@${version ?? "unknown"}+${INDEX_FORMAT}`;
}

// dnd5e's config values may be plain strings or { label }
const configLabel = (value) => (typeof value === "string" ? value : value?.label);

// Readable names for a character sheet's keys, e.g. "draconic" -> "Draconic"
function characterLabels() {
  const config = CONFIG.DND5E ?? {};
  const label = (group) => (key) => configLabel(config[group]?.[key]) ?? key;
  return {
    ability: label("abilities"),
    skill: label("skills"),
    school: label("spellSchools"),
    size: label("actorSizes"),
    rarity: label("itemRarity"),
    sense: label("senses"),
    trait: (trait, key) => {
      try {
        return globalThis.dnd5e?.documents?.Trait?.keyLabel?.(key, { trait }) ?? key;
      } catch {
        return key;
      }
    },
  };
}

// Plain text from a biography's HTML, keeping paragraph breaks. DOMParser
// documents are inert: no scripts run, nothing loads.
function htmlToText(html) {
  if (!html) return "";
  const body = new DOMParser().parseFromString(String(html), "text/html").body;
  for (const br of body.querySelectorAll("br")) br.replaceWith("\n");
  for (const block of body.querySelectorAll("p, div, li, h1, h2, h3, h4, h5, h6, blockquote")) block.append("\n\n");
  return (body.textContent ?? "").replace(/\n{3,}/g, "\n\n").trim();
}

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
 * Keeps this world's journals in step with its campaign. Each record is a
 * journal page whose flags hold the record JSON; the Campaign Dashboard reads
 * from those flags. A campaign is either linked to Dungeon Master Guru (and
 * synced both ways) or local: it lives only in this world, and changes are
 * saved straight to its journals.
 */
export class CampaignSync {
  #pulling = null;
  #syncing = null;
  // The last time Sync couldn't reach Dungeon Master Guru: { at, message }, or null
  lastSyncProblem = null;
  #sentCharacters = null;
  // { uuid -> version } of the scene thumbnails Dungeon Master Guru has
  #sentScenes = null;
  #sendingScenes = null;
  #scenesAgain = false;
  #converting = null;

  get linked() {
    const campaign = game.settings.get(MODULE_ID, SETTINGS.campaign);
    return campaign?.uuid ? campaign : null;
  }

  get token() {
    return game.settings.get(MODULE_ID, SETTINGS.apiToken);
  }

  // dungeonmaster.guru, or a local server in a development build (see env.mjs)
  get baseUrl() {
    return DM_GURU_URL;
  }

  /** True for a campaign that lives only in this world */
  get isLocal() {
    return Boolean(this.linked?.local);
  }

  // Ready to sync with Dungeon Master Guru (a local campaign never is)
  get ready() {
    return Boolean(game.user.isGM && this.token && this.linked && !this.isLocal);
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
        if (collection && record && store[collection]) store[collection].set(String(record.id), readable(collection, record));
      }
    }
    return store;
  }

  /** Pulls changes from Dungeon Master Guru into the journals */
  pull({ full = false } = {}) {
    if (this.isLocal) return Promise.reject(new Error("This campaign lives in this world; there's nothing to sync."));
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

    // Current records, updated with what came in. Records changed here and
    // not synced yet keep the changes made here until Sync sends them.
    const store = this.records();
    const pending = pendingUuids(this.outbox);
    const waiting = (uuid) => pending.updated.has(uuid) || pending.deleted.has(uuid) || pending.created.has(uuid);
    const incomingUuids = new Set();
    if (changes.campaign && !waiting(changes.campaign.uuid)) {
      store.campaign.set(String(changes.campaign.id), withTruths(changes.campaign));
    }
    for (const [collection, records] of Object.entries(changes.records)) {
      for (const record of records) {
        incomingUuids.add(record.uuid);
        if (waiting(record.uuid)) continue;
        // A record made here gets its real id when Sync sends it; drop the copy under its stand-in id
        for (const [id, existing] of store[collection] ?? []) if (existing.uuid === record.uuid && id !== String(record.id)) store[collection].delete(id);
        store[collection]?.set(String(record.id), record);
      }
    }
    const deleted = new Set(changes.tombstones.map((tombstone) => tombstone.uuid));
    // Deleted on Dungeon Master Guru: edits waiting for it have nowhere to go
    if (changes.tombstones.some((tombstone) => pending.updated.has(tombstone.uuid))) {
      await this.#setOutbox(this.outbox.filter((change) => !(change.op === "update" && deleted.has(change.uuid))));
    }

    // On a full pull, anything not sent back no longer exists
    if (changes.full) {
      for (const [collection, records] of Object.entries(store)) {
        if (collection === "campaign") continue;
        for (const [id, record] of records) {
          if (!incomingUuids.has(record.uuid) && !pending.created.has(record.uuid)) {
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
    try {
      await this.sendCharacters({ force: full });
    } catch (error) {
      console.warn("Dorman Lakely's Campaign Planner | Could not send the player characters", error);
    }
    return changes;
  }

  /**
   * Sends a change made in Foundry (e.g. a clock advanced) to Dungeon Master
   * Guru. If the record changed there too, merges field by field and asks the
   * DM when both sides changed the same thing. Returns true when saved.
   */
  async update(collection, record, attributes) {
    if (this.isLocal) {
      return this.#saveRecord(
        collection,
        applyLocalChange(collection, record, attributes, { now: () => new Date().toISOString() }),
      );
    }
    const type = PUSH_TYPES[collection];
    if (!type) throw new Error(`Can't change ${collection} from Foundry.`);
    // Saved here now; Sync sends it
    const before = Object.fromEntries(Object.keys(attributes).map((key) => [key, this.#syncedValue(key, record)]));
    await this.#saveRecord(collection, this.#withChange(collection, record, attributes));
    await this.#queue(queueUpdate(this.outbox, { collection, type, uuid: record.uuid, baseVersion: record.syncVersion, before, attributes }));
    return true;
  }

  // A field as the sync sends it; a secret's revealing session goes by its uuid
  #syncedValue(key, record, store = this.records()) {
    if (key === "revealedSessionUuid") {
      const session = record.revealedSessionId == null ? null : store.sessions.get(String(record.revealedSessionId));
      return session?.uuid ?? null;
    }
    return syncValue(key, record);
  }

  // A synced record with a change made here applied, for the journals
  #withChange(collection, record, attributes) {
    const { revealedSessionUuid, links, ...rest } = attributes;
    const updated = { ...record, ...rest };
    if (collection === "secrets" && "revealed" in attributes) {
      const session = revealedSessionUuid ? [...this.records().sessions.values()].find((s) => s.uuid === revealedSessionUuid) : null;
      updated.revealedAt = attributes.revealed ? new Date().toISOString() : null;
      updated.revealedSessionId = attributes.revealed ? (session?.id ?? null) : null;
    }
    if (links) {
      // Keep what's known about links that were already there (their names), in the new order
      const known = new Map((record.links ?? []).map((link) => [`${link.linkableType}:${link.linkableId}`, link]));
      updated.links = links.map((link) => ({ ...known.get(`${link.linkableType}:${link.linkableId}`), ...link }));
    }
    return updated;
  }

  /** The changes made here to this synced campaign, waiting for Sync (kept on its journal folder) */
  get outbox() {
    return this.folder?.getFlag(MODULE_ID, "outbox") ?? [];
  }

  /** How many records have changes waiting for Sync */
  get pendingCount() {
    return this.isLocal ? 0 : pendingCount(this.outbox);
  }

  async #setOutbox(outbox) {
    if (this.folder) await this.folder.setFlag(MODULE_ID, "outbox", outbox);
  }

  async #queue(outbox) {
    await this.#setOutbox(outbox);
    Hooks.callAll(SYNCED_HOOK);
  }

  /**
   * Sends the changes made here to Dungeon Master Guru, in order, then pulls
   * what changed there. When Dungeon Master Guru can't be reached, stops and
   * keeps what wasn't sent for next time. A change Dungeon Master Guru turns
   * down stays waiting, with the reason; the rest still go.
   * @returns {Promise<{ sent: number, failed: { name: string, reason: string }[], unreachable: string|null }>}
   */
  syncNow() {
    if (this.isLocal) return Promise.resolve({ sent: 0, failed: [], unreachable: null });
    this.#syncing ??= this.#syncNow().finally(() => {
      this.#syncing = null;
    });
    return this.#syncing;
  }

  async #syncNow() {
    // Data from an older version of the module is brought up to date first
    if ((await migrateFolder(this.folder)).length) await this.rewritePages();
    // Each record goes before what points at it: a quest after its book references
    const queued = sendOrder(this.outbox);
    // The real ids of records made here and sent before; the rest get theirs as they're sent
    const ids = realIds(Object.values(this.records()).flatMap((records) => [...records.values()]));
    // Records made here that weren't sent this time: what points at them waits for them
    const unsent = new Set();
    const kept = [];
    const failed = [];
    let sent = 0;
    let unreachable = null;
    const keep = (change, failure) => {
      failed.push(failure);
      kept.push(change);
      if (change.op === "create") unsent.add(change.uuid);
    };
    for (const [index, original] of queued.entries()) {
      const change = withRealIds(original, ids);
      const needs = pointsAt(change).find((id) => unsent.has(id));
      if (needs) {
        keep(change, { name: this.#nameOf(change.uuid), reason: `It needs ${this.#nameOf(needs)}, which didn't sync.` });
      } else {
        try {
          const outcome = await this.#send(change);
          if (outcome.ok) {
            sent += 1;
            if (outcome.id !== undefined) {
              ids[change.uuid] = String(outcome.id);
              await this.#pointAtRealId(change.uuid, String(outcome.id));
            }
          } else {
            keep(change, { name: outcome.name ?? this.#nameOf(change.uuid), reason: outcome.reason });
          }
        } catch (error) {
          if (cantReach(error)) {
            unreachable = whyNot(error);
            kept.push(change, ...queued.slice(index + 1).map((rest) => withRealIds(rest, ids)));
            break;
          }
          keep(change, { name: this.#nameOf(change.uuid), reason: error.message });
        }
      }
      // Save progress as it goes, so nothing is sent twice if this stops partway
      await this.#setOutbox([...kept, ...queued.slice(index + 1).map((rest) => withRealIds(rest, ids))]);
    }
    if (!unreachable) {
      try {
        await this.pull();
      } catch (error) {
        if (!cantReach(error)) throw error;
        unreachable = whyNot(error);
      }
    }
    this.lastSyncProblem = unreachable ? { at: Date.now(), message: unreachable } : null;
    Hooks.callAll(SYNCED_HOOK);
    return { sent, failed, unreachable };
  }

  // A record's name, by its id or uuid, for a message: "the quest Find the crypt"
  #nameOf(id) {
    for (const [collection, records] of Object.entries(this.records())) {
      for (const record of records.values()) {
        if (record.uuid === id || String(record.id) === String(id)) return pageName(collection, record);
      }
    }
    return "a record that's no longer here";
  }

  // Once a record made here has its real id, the records that point at it
  // here point at that id too (the changes waiting for Sync get it as they're sent)
  async #pointAtRealId(standIn, id) {
    const store = this.records();
    const changed = [];
    for (const [collection, records] of Object.entries(store)) {
      for (const record of records.values()) {
        const pointed = pointAtRealIds(record, { [standIn]: id });
        if (pointed === record) continue;
        records.set(String(record.id), pointed);
        changed.push([collection, pointed]);
      }
    }
    const context = this.#renderContext(store);
    for (const [collection, record] of changed) await this.#writeTo(collection, [record], context);
  }

  // Sends one queued change. Returns { ok, id? } or { ok: false, reason, name }; throws when it can't reach the server.
  async #send(change) {
    const collection = change.collection;
    const record = [...(this.records()[collection]?.values() ?? [])].find((r) => r.uuid === change.uuid);
    const name = record ? pageName(collection, record) : undefined;
    const result = await this.api().push(this.linked.uuid, [pushPayload(change)]);
    const reason = result.errors?.[0]?.errors?.join(", ");

    if (change.op === "delete") return reason ? { ok: false, reason, name } : { ok: true };
    if (change.op === "create") {
      const created = result.applied?.[0]?.current;
      if (created) {
        await this.#replaceRecord(collection, change.uuid, created);
        return { ok: true, id: created.id };
      }
      return { ok: false, reason: reason ?? "Dungeon Master Guru didn't accept it.", name };
    }

    if (result.applied?.length) {
      await this.#saveRecord(collection, result.applied[0].current);
      return { ok: true };
    }
    // Gone from Dungeon Master Guru: the edit has nowhere to go
    if (reason === "Record not found") return { ok: true };
    if (reason) return { ok: false, reason, name };

    // Changed on Dungeon Master Guru too: merge field by field, and ask about fields both sides changed
    const theirs = result.conflicts[0].current;
    const theirsNow = Object.fromEntries(Object.keys(change.attributes).map((key) => [key, this.#syncedValue(key, theirs)]));
    const { retry, clashes } = mergeChange(change.base ?? {}, change.attributes, theirsNow);
    let toSend = retry;
    if (clashes.length) {
      const keepMine = await foundry.applications.api.DialogV2.confirm({
        window: { title: "Changed on Dungeon Master Guru too" },
        content: `<p>${escapeHtml(name ?? "A record")}: ${describeFields(clashes)} also changed on Dungeon Master Guru.</p>
                  <p>Keep the change made in Foundry?</p>`,
      });
      toSend = keepMine ? change.attributes : retry;
    }
    if (!Object.keys(toSend).length) {
      await this.#saveRecord(collection, theirs);
      return { ok: true };
    }
    const retried = await this.api().push(this.linked.uuid, [
      pushPayload({ ...change, baseVersion: theirs.syncVersion, attributes: withExtras(toSend, change.attributes) }),
    ]);
    if (retried.applied?.length) {
      await this.#saveRecord(collection, retried.applied[0].current);
      return { ok: true };
    }
    return { ok: false, reason: "It keeps changing on Dungeon Master Guru. Try Sync again.", name };
  }

  // Swaps a record made here (under its stand-in id) for Dungeon Master Guru's copy
  async #replaceRecord(collection, uuid, record) {
    await this.#saveRecord(collection, record);
  }

  async #saveRecord(collection, saving) {
    const record = readable(collection, saving);
    const store = this.records();
    store[collection].set(String(record.id), record);
    const context = this.#renderContext(store);
    await this.#writeTo(collection, [record], context);
    for (const [target, related] of this.#related(collection, record, store)) await this.#writeTo(target, related, context);
    Hooks.callAll(SYNCED_HOOK);
    return true;
  }

  // Writes records' pages in their section's journal entry. A campaign made
  // before a section existed (Encounters) gets its entry now.
  async #writeTo(collection, records, context) {
    if (!records.length) return;
    let entry = this.#entriesInFolder().find((e) => flag(e, "collection") === collection);
    if (!entry && this.folder) entry = (await this.#ensureEntries(this.linked?.name ?? "Campaign"))[collection];
    if (entry) await this.#writePages(entry, collection, records, new Set(), context);
  }

  // The other pages that show something of this record: a quest's page lists
  // its encounters, and an encounter's page names its quest (and sorts by it)
  #related(collection, record, store) {
    if (collection === "encounters") {
      const quest = store.quests.get(String(record.questId));
      return quest ? [["quests", [quest]]] : [];
    }
    if (collection === "quests") {
      return [["encounters", [...store.encounters.values()].filter((encounter) => String(encounter.questId) === String(record.id))]];
    }
    return [];
  }

  // After encounters are deleted, their quests' pages stop listing them
  async #afterRemoving(removed) {
    const store = this.records();
    const quests = new Set(removed.filter(({ collection }) => collection === "encounters").map(({ record }) => String(record.questId)));
    const pages = [...quests].map((id) => store.quests.get(id)).filter(Boolean);
    if (pages.length) await this.#writeTo("quests", pages, this.#renderContext(store));
  }

  /**
   * Sends the index of this world's SRD and core book compendiums to Dungeon
   * Master Guru, so planner searches can link to their entries, and of the
   * homebrew sources the GM chose (see homebrew.mjs). Only packs that changed
   * since the last send, unless `force`.
   * @returns {Promise<{ packs: number, entries: number }>}
   */
  async sendCompendiumIndex({ force = false } = {}) {
    const api = this.api();
    const { packs: saved } = await api.compendiumStatus();
    const sent = { packs: 0, entries: 0 };
    const labels = {
      schoolLabel: (key) => configLabel(CONFIG.DND5E?.spellSchools?.[key]) ?? key,
      rarityLabel: (key) => configLabel(CONFIG.DND5E?.itemRarity?.[key]) ?? key,
    };
    for (const id of COMPENDIUM_PACKS) {
      const pack = game.packs.get(id);
      if (!pack) continue;
      const version = packVersion(pack);
      if (!force && saved?.[id]?.version === version) continue;

      const index = await pack.getIndex({ fields: INDEX_FIELDS });
      const folderName = (folderId) => pack.folders?.get(folderId)?.name ?? null;
      const entries = index.contents
        .map((entry) => entryFromIndex(id, pack.documentName, entry, { ...labels, folderName }))
        .filter(Boolean);
      const result = await api.sendCompendiumPack(id, version, entries);
      sent.packs += 1;
      sent.entries += result.count;
    }
    const homebrew = await this.#sendHomebrew(api, { send: this.homebrewSources, saved, force });
    return { packs: sent.packs + homebrew.packs, entries: sent.entries + homebrew.entries };
  }

  /** The homebrew sources the GM can choose: World actors, and the Actor compendiums that aren't the books' */
  homebrewOptions() {
    return homebrewOptions(
      game.packs.contents.map((pack) => ({ id: pack.collection, label: pack.title, documentName: pack.documentName })),
      { id: game.world.id, title: game.world.title },
    );
  }

  /** The homebrew sources whose index goes to Dungeon Master Guru (a world setting) */
  get homebrewSources() {
    return chosenSources(game.settings.get(MODULE_ID, SETTINGS.homebrewSources));
  }

  /**
   * Chooses the homebrew sources and, when connected, sends what changed: a
   * newly ticked one with its monsters, and an unticked one with none, so
   * Dungeon Master Guru drops it.
   * @param {string[]} ids
   * @returns {Promise<{ packs: number, entries: number }|null>} null when not connected
   */
  async setHomebrewSources(ids) {
    const before = this.homebrewSources;
    const after = chosenSources(ids);
    await game.settings.set(MODULE_ID, SETTINGS.homebrewSources, after);
    if (!this.token) return null;
    const added = after.filter((id) => !before.includes(id));
    return this.#sendHomebrew(this.api(), { send: added, drop: droppedSources(before, after), force: true });
  }

  // Sends homebrew packs: each in `send` with its monsters (unless Dungeon
  // Master Guru has that version already), and each in `drop` with none
  async #sendHomebrew(api, { send = [], drop = [], saved = {}, force = false }) {
    const options = this.homebrewOptions();
    const source = (id) => ({ id, label: options.find((option) => option.id === id)?.label ?? id });
    const sent = { packs: 0, entries: 0 };
    for (const id of send) {
      const entries = await this.#homebrewEntries(id);
      // Gone from this world for now (its module switched off, say): left as it is there
      if (!entries) continue;
      const pack = homebrewPack(source(id), entries);
      if (!force && saved?.[id]?.version === pack.version) continue;
      const result = await api.sendCompendiumPack(pack.pack, pack.version, pack.entries, { homebrew: true, label: pack.label });
      sent.packs += 1;
      sent.entries += result?.count ?? entries.length;
    }
    for (const id of drop) {
      const pack = homebrewPack(source(id), []);
      await api.sendCompendiumPack(pack.pack, pack.version, [], { homebrew: true, label: pack.label });
    }
    return sent;
  }

  // A homebrew source's monsters as index entries, or null when it isn't in this world
  async #homebrewEntries(id) {
    // This world's actors; another world's (in a copied world, say) aren't here
    const world = worldActorsSource({ id: game.world.id, title: game.world.title });
    if (id === world.id) return worldActorEntries(game.actors.contents, id);
    const pack = game.packs.get(id);
    if (!pack || pack.documentName !== "Actor") return null;
    const index = await pack.getIndex({ fields: INDEX_FIELDS });
    return index.contents.map((entry) => entryFromIndex(id, "Actor", entry)).filter(Boolean);
  }

  /** Finds compendium entries by name, in the packs the campaign uses: (kind, name) => uuid or null */
  compendiumUuid() {
    return this.#compendiumLookup(this.records());
  }

  /** The world actor imported for one of Dungeon Master Guru's monsters, or null */
  monsterActorUuid(monsterId) {
    return importedActorUuid(game.actors?.contents ?? [], monsterId);
  }

  /** True when a Dungeon Master Guru monster can be imported here: a GM, connected, with a synced campaign */
  get canImportMonsters() {
    return Boolean(game.user.isGM && this.token && this.linked && !this.isLocal);
  }

  /**
   * Imports one of Dungeon Master Guru's monsters as an actor in the "Dungeon
   * Master Guru" folder. From then on, links to that monster point at it.
   * Throws a DmGuruApiError when it can't be fetched.
   */
  async importMonster(monsterId) {
    const existing = this.monsterActorUuid(monsterId);
    if (existing) return fromUuidSync(existing);
    const monster = await this.api().monster(monsterId);
    const folder = await this.#monsterFolder();
    const actor = await Actor.implementation.create(monsterActorData({ ...monster, id: monster.id ?? monsterId }, folder?.id ?? null));
    // The journal pages link to it now
    await this.rewritePages();
    Hooks.callAll(SYNCED_HOOK);
    return actor;
  }

  async #monsterFolder() {
    return (
      game.folders.find((f) => f.type === "Actor" && f.getFlag(MODULE_ID, "monsters")) ??
      game.folders.find((f) => f.type === "Actor" && f.name === MONSTER_FOLDER) ??
      Folder.create({ name: MONSTER_FOLDER, type: "Actor", flags: { [MODULE_ID]: { monsters: true } } })
    );
  }

  /** XP by CR and the 2024 budgets: the game system's own when it has them (dnd5e does), or the SRD's */
  get xpTables() {
    return systemTables(globalThis.CONFIG?.DND5E) ?? SRD_TABLES;
  }

  /**
   * Sends this world's player characters to Dungeon Master Guru, where
   * campaigns pick their party from them. Only when they changed since the
   * last send, unless `force`. Returns null when nothing was sent.
   */
  async sendCharacters({ force = false } = {}) {
    if (!this.token) return null;
    const users = game.users.contents;
    const labels = characterLabels();
    const characters = game.actors
      .filter((actor) => isPlayerCharacter(actor))
      .map((actor) => characterPayload(actor, { users, labels, toText: htmlToText }));
    const json = JSON.stringify(characters);
    if (!force && json === this.#sentCharacters) return null;

    const result = await this.api().sendCharacters({ id: game.world.id, title: game.world.title }, characters);
    this.#sentCharacters = json;
    return result;
  }

  /**
   * Sends Dungeon Master Guru a thumbnail of each scene in this world with a
   * map image, so the DM can pick maps there and see them while Foundry is
   * closed. Only scenes it doesn't have yet, or whose map changed, the
   * campaign's own first; and removes the ones gone from the world. Asks what
   * it has the first time, or with `force`. One send at a time: a call during
   * a send runs again after it.
   * @returns {Promise<{ sent: number, removed: number }|null>} null when not connected
   */
  sendSceneThumbnails({ force = false } = {}) {
    if (!game.user.isGM || !this.token) return Promise.resolve(null);
    if (this.#sendingScenes) {
      this.#scenesAgain = true;
      return this.#sendingScenes;
    }
    this.#sendingScenes = this.#sendScenes(force).finally(() => {
      this.#sendingScenes = null;
      if (this.#scenesAgain) {
        this.#scenesAgain = false;
        this.sendSceneThumbnails().catch((error) =>
          console.warn("Dorman Lakely's Campaign Planner | Could not send the scene thumbnails", error),
        );
      }
    });
    return this.#sendingScenes;
  }

  async #sendScenes(force) {
    const api = this.api();
    const worldId = game.world.id;
    if (force || !this.#sentScenes) {
      const { scenes: saved } = await api.sceneStatus(worldId);
      this.#sentScenes = new Map(Object.entries(saved ?? {}).map(([uuid, scene]) => [uuid, scene.version]));
    }
    const store = this.records();
    const used = new Set(
      campaignSceneUuids({
        locations: [...store.locations.values()],
        sessions: [...store.sessions.values()],
        quests: [...store.quests.values()],
        encounters: [...store.encounters.values()],
      }),
    );
    const scenes = game.scenes.contents.filter((scene) => hasThumbnail(scene._source));
    const toSend = scenes
      .map((scene) => ({ scene, version: sceneVersion(scene._source) }))
      .filter(({ scene, version }) => this.#sentScenes.get(scene.uuid) !== version)
      .sort((a, b) => Number(used.has(b.scene.uuid)) - Number(used.has(a.scene.uuid)));
    if (toSend.length >= 5) {
      ui.notifications.info(`Sending thumbnails of ${toSend.length} scenes to Dungeon Master Guru.`);
    }

    const world = { id: worldId, title: game.world.title };
    let sent = 0;
    for (const { scene, version } of toSend) {
      let thumbnail;
      try {
        thumbnail = await sceneThumbnail(scene);
      } catch (error) {
        console.warn(`Dorman Lakely's Campaign Planner | Could not make a thumbnail of ${scene.name}`, error);
        continue;
      }
      await api.sendScene(world, { uuid: scene.uuid, name: scene.name, version, thumbnail });
      this.#sentScenes.set(scene.uuid, version);
      sent += 1;
    }

    // Scenes deleted from the world, or that no longer have a map image
    const current = new Set(scenes.map((scene) => scene.uuid));
    let removed = 0;
    for (const uuid of [...this.#sentScenes.keys()].filter((key) => !current.has(key))) {
      try {
        await api.deleteScene(worldId, uuid);
      } catch (error) {
        if (error.status !== 404) throw error;
      }
      this.#sentScenes.delete(uuid);
      removed += 1;
    }
    return { sent, removed };
  }

  /** The world's player characters, for choosing a party: [{ uuid, name, classes, level, playerName }] */
  partyOptions() {
    const users = game.users.contents;
    return game.actors.filter((actor) => isPlayerCharacter(actor)).map((actor) => partyOption(actor, users));
  }

  /** The full character payloads for these actors, as POST /v1/foundry/characters takes them */
  characterPayloads(actorUuids) {
    const users = game.users.contents;
    const labels = characterLabels();
    return game.actors
      .filter((actor) => isPlayerCharacter(actor) && actorUuids.includes(actor.uuid))
      .map((actor) => characterPayload(actor, { users, labels, toText: htmlToText }));
  }

  /**
   * Creates a campaign in this world from the setup guide's answers, with its
   * template's sessions, quests and threat, and makes it this world's campaign.
   * Needs no Dungeon Master Guru account.
   */
  async createLocal(draft) {
    const { campaign, records } = buildLocalCampaign(draft, { id: () => foundry.utils.randomID(16) });
    await game.settings.set(MODULE_ID, SETTINGS.campaign, { uuid: campaign.uuid, name: campaign.name, local: true });
    const entries = await this.#ensureEntries(campaign.name);
    const store = this.records();
    store.campaign.set(campaign.id, campaign);
    for (const [collection, list] of Object.entries(records)) {
      for (const record of list) store[collection].set(record.id, record);
    }
    const context = this.#renderContext(store);
    for (const { collection } of SECTIONS) {
      await this.#writePages(entries[collection], collection, [...store[collection].values()], new Set(), context);
    }
    Hooks.callAll(SYNCED_HOOK);
    return campaign;
  }

  /**
   * Adds a record to this world's local campaign from an Add form.
   * Returns the record, or { error } when the form is missing something.
   */
  async addLocal(collection, values) {
    const existing = [...(this.records()[collection]?.values() ?? [])];
    const record = newRecord(collection, values, { id: () => foundry.utils.randomID(16), existing });
    if (record.error) return record;
    if (!this.isLocal) return this.#createForSync(collection, record);
    await this.#saveRecord(collection, record);
    return record;
  }

  /**
   * True when the planner can change this campaign: one in this world, or a
   * synced one (changes are saved here and wait for Sync, so this browser
   * needn't be connected to make them)
   */
  get editable() {
    return this.isLocal || Boolean(game.user.isGM && this.linked);
  }

  /**
   * Saves a record from the planner. A synced campaign's changes are saved
   * here and wait for Sync (only the fields that changed are sent; a new
   * record is made there). Returns the saved record, or false.
   */
  async saveRecord(collection, record) {
    if (this.isLocal) return (await this.saveLocal(collection, record)) && record;
    const store = this.records();
    const current =
      collection === "campaign" ? [...store.campaign.values()][0] : store[collection]?.get(String(record.id));
    if (!current) return this.#createForSync(collection, record);
    const attributes = changedAttributes(collection, current, record);
    if (!Object.keys(attributes).length) return current;
    const type = PUSH_TYPES[collection];
    if (!type) throw new Error(`Can't change ${collection} from Foundry.`);
    const before = Object.fromEntries(Object.keys(attributes).map((key) => [key, this.#syncedValue(key, current, store)]));
    const saved = { ...record, id: current.id, uuid: current.uuid, syncVersion: current.syncVersion };
    await this.#saveRecord(collection, saved);
    await this.#queue(queueUpdate(this.outbox, { collection, type, uuid: current.uuid, baseVersion: current.syncVersion, before, attributes }));
    return saved;
  }

  /**
   * Deletes a record from the planner, with what pointed at it cleared. For a
   * synced campaign it's gone here now, and Sync deletes it there.
   */
  async deleteRecord(collection, id) {
    if (this.isLocal) return this.deleteLocal(collection, id);
    const store = this.records();
    if (!store[collection]?.get(String(id))) return;
    const { remove, updates } = planDelete(this.recordLists(), collection, id);
    let outbox = this.outbox;
    const removed = [];
    for (const { collection: target, id: targetId } of remove) {
      const record = store[target]?.get(String(targetId));
      if (!record) continue;
      const entry = this.#entriesInFolder().find((e) => flag(e, "collection") === target);
      const page = entry?.pages.find((p) => flag(p, "uuid") === record.uuid);
      if (page) await entry.deleteEmbeddedDocuments("JournalEntryPage", [page.id]);
      // A quest's encounters are deleted too; deleting what's already gone there is fine
      outbox = queueDelete(outbox, { collection: target, type: PUSH_TYPES[target], uuid: record.uuid });
      removed.push({ collection: target, record });
    }
    // Dungeon Master Guru clears these pointers itself when the delete arrives
    for (const update of updates) await this.#saveRecord(update.collection, update.record);
    await this.#afterRemoving(removed);
    await this.#queue(outbox);
  }

  // A new record of a synced campaign: saved here under a new uuid (its id
  // until Dungeon Master Guru gives it one), and made there on Sync
  async #createForSync(collection, record) {
    const type = PUSH_TYPES[collection];
    if (!type) throw new Error(`Can't add ${collection} from Foundry.`);
    const uuid = uuidV4();
    const created = { ...record, id: uuid, uuid, syncVersion: 0 };
    await this.#saveRecord(collection, created);
    await this.#queue(queueCreate(this.outbox, { collection, type, uuid, attributes: createAttributes(collection, created) }));
    return created;
  }

  /** Every record as { collection: record[] }, for the planner */
  recordLists() {
    return Object.fromEntries(Object.entries(this.records()).map(([collection, map]) => [collection, [...map.values()]]));
  }

  /** Saves a record of this world's campaign: a new one, or an edit */
  async saveLocal(collection, record) {
    if (!this.isLocal) throw new Error("Edit this campaign on Dungeon Master Guru; it syncs here.");
    if (collection === "campaign") {
      // The name is also the folder's and the setting's
      await game.settings.set(MODULE_ID, SETTINGS.campaign, { ...this.linked, name: record.name });
      if (this.folder && this.folder.name !== record.name) await this.folder.update({ name: record.name });
    }
    return this.#saveRecord(collection, record);
  }

  /** Deletes a record of this world's campaign, and every reference to it */
  async deleteLocal(collection, id) {
    if (!this.isLocal) throw new Error("Edit this campaign on Dungeon Master Guru; it syncs here.");
    const { remove, updates } = planDelete(this.recordLists(), collection, id);
    const removed = [];
    for (const { collection: target, id: targetId } of remove) {
      const record = this.records()[target]?.get(String(targetId));
      const entry = this.#entriesInFolder().find((e) => flag(e, "collection") === target);
      const page = record && entry?.pages.find((p) => flag(p, "uuid") === record.uuid);
      if (page) await entry.deleteEmbeddedDocuments("JournalEntryPage", [page.id]);
      if (record) removed.push({ collection: target, record });
    }
    for (const update of updates) await this.#saveRecord(update.collection, update.record);
    await this.#afterRemoving(removed);
    Hooks.callAll(SYNCED_HOOK);
  }

  /**
   * Moves the monsters quests had before encounters into an encounter each
   * ("Encounter", combat, first), in a campaign that lives in this world.
   * Only the active GM does it, so two GMs don't both; it finds nothing to do
   * once it's done. A synced campaign's quests move on Dungeon Master Guru,
   * and come with the next Sync. Returns how many quests changed.
   */
  convertQuestMonsters() {
    if (!this.isLocal || !game.user.isActiveGM || !this.folder) return Promise.resolve(0);
    this.#converting ??= this.#convertQuestMonsters().finally(() => {
      this.#converting = null;
    });
    return this.#converting;
  }

  async #convertQuestMonsters() {
    const { quests, encounters } = planQuestEncounters(this.recordLists(), { id: () => foundry.utils.randomID(16) });
    // Each encounter first, then its quest without the monsters: if this stops
    // partway, the next time finishes it without losing them or doubling up
    for (const encounter of encounters) await this.#saveRecord("encounters", encounter);
    for (const quest of quests) await this.#saveRecord("quests", quest);
    if (quests.length) console.log(`Dorman Lakely's Campaign Planner | Moved the monsters of ${quests.length} quests into encounters`);
    return quests.length;
  }

  /**
   * A book reference for a compendium entry, actor, item or table dropped on
   * the planner: the campaign's existing one, or a new one.
   */
  async referenceFor(document) {
    const existing = [...this.records().references.values()].find((r) => r.foundryUuid === document.uuid);
    if (existing) return existing;
    const reference = referenceFromDocument(
      {
        uuid: document.uuid,
        name: document.name,
        documentName: document.documentName,
        type: document.type,
        system: document.system,
        pack: document.pack ?? null,
      },
      () => foundry.utils.randomID(16),
    );
    if (!this.isLocal) return this.#createForSync("references", reference);
    await this.#saveRecord("references", reference);
    return reference;
  }

  /**
   * A renamed actor's book references take its new name. A synced campaign's
   * renames wait for Sync, like other changes made here.
   */
  async followActorName(actor) {
    if (!game.user.isActiveGM || !this.linked || !this.folder || !actor?.uuid) return 0;
    const name = String(actor.name ?? "").trim().slice(0, 120);
    if (!name) return 0;
    const references = [...this.records().references.values()].filter(
      (reference) => reference.foundryUuid === actor.uuid && reference.name !== name,
    );
    for (const reference of references) {
      if (this.isLocal) await this.saveLocal("references", { ...reference, name });
      else await this.update("references", reference, { name });
    }
    return references.length;
  }

  /** The campaigns that live in this world: [{ uuid, name }] */
  localCampaigns() {
    const campaigns = [];
    for (const folder of game.folders.filter((f) => f.type === "JournalEntry" && flag(f, "campaignUuid"))) {
      const overview = game.journal.find(
        (entry) => entry.folder?.id === folder.id && flag(entry, "collection") === "campaign",
      );
      const record = overview?.pages.contents.map((page) => flag(page, "record")).find(Boolean);
      if (record?.local) campaigns.push({ uuid: record.uuid, name: record.name });
    }
    return campaigns.sort((a, b) => a.name.localeCompare(b.name));
  }

  /** Makes one of this world's own campaigns the one the Dashboard shows */
  async useLocal(campaign) {
    await game.settings.set(MODULE_ID, SETTINGS.campaign, { uuid: campaign.uuid, name: campaign.name, local: true });
    // Its pages may have been written (or imported) with other techniques switched on
    await this.rewritePages();
    // Made (or exported) before encounters: its quests' monsters move into one
    await this.convertQuestMonsters();
    Hooks.callAll(SYNCED_HOOK);
  }

  /**
   * Sends this world's campaign to Dungeon Master Guru, then syncs the world
   * with it: the same journal folder and pages carry on, re-tagged with the
   * new records' ids, so their sharing stays as it was.
   * @returns {Promise<{ campaign: object }>}
   */
  async sendToDmGuru() {
    if (!this.isLocal) throw new Error("This campaign is already on Dungeon Master Guru.");
    // Quests go with their monsters in encounters, as Dungeon Master Guru keeps them
    await this.convertQuestMonsters();
    const store = this.recordLists();
    const campaign = store.campaign[0];
    const world = { id: game.world.id, title: game.world.title };
    const api = this.api();
    const sent = await api.importCampaign(
      importPayload({ campaign, store, world, characters: this.characterPayloads(campaign.partyActorUuids ?? []) }),
    );
    await this.#switchToSynced(sent);
    return { campaign: sent };
  }

  // Turns the local campaign's folder into the synced campaign's: each page
  // gets its new record's uuid, and the pull fills them in place
  async #switchToSynced(sent) {
    const ids = sent.ids ?? {};
    const folder = this.folder;
    for (const entry of this.#entriesInFolder()) {
      const updates = entry.pages.contents
        .filter((page) => ids[flag(page, "uuid")])
        .map((page) => ({
          _id: page.id,
          [`flags.${MODULE_ID}.uuid`]: ids[flag(page, "uuid")],
          [`flags.${MODULE_ID}.record`]: null,
          [`flags.${MODULE_ID}.syncVersion`]: null,
        }));
      if (updates.length) await entry.updateEmbeddedDocuments("JournalEntryPage", updates);
    }
    await folder?.setFlag(MODULE_ID, "campaignUuid", sent.uuid);
    return this.link(sent);
  }

  /** Links this world to a campaign and pulls it into the journals */
  async link(campaign) {
    await game.settings.set(MODULE_ID, SETTINGS.campaign, { uuid: campaign.uuid, name: campaign.name, cursor: 0 });
    return this.pull({ full: true });
  }

  /**
   * What exporting the open campaign as an Adventure takes from this world:
   * its journal folder (and the folders inside it), the scenes, actors, items
   * and roll tables it uses, and the folders they're in. Players' characters
   * stay out, and documents that are gone are counted.
   */
  adventureContents() {
    const folder = this.folder;
    if (!folder) throw new Error("This campaign's journals aren't in this world.");
    const lists = this.recordLists();
    const campaign = lists.campaign[0] ?? { uuid: this.linked.uuid, name: this.linked.name };
    const worldFolders = game.folders.contents.map((f) => ({ _id: f.id, folder: f._source.folder ?? null }));
    const journalFolders = [folder.id, ...subfolderIds(folder.id, worldFolders)];
    const entries = game.journal.filter((entry) => journalFolders.includes(entry._source.folder));
    // Handouts from elsewhere in the Journal go along, so the quests' links to them still work
    const handouts = handoutEntryIds(lists)
      .filter((id) => !entries.some((entry) => entry.id === id))
      .map((id) => game.journal.get(id))
      .filter(Boolean);
    entries.push(...handouts);
    const texts = entries.flatMap((entry) => entry.pages.contents.map((page) => page.text?.content ?? ""));
    const wanted = adventureUuids(lists, { texts });

    const users = game.users.contents;
    const party = campaign.partyActorUuids ?? [];
    const documents = {};
    const missing = {};
    let leftOut = 0;
    for (const [documentName, uuids] of Object.entries(wanted)) {
      const collection = game.collections.get(documentName);
      documents[documentName] = [];
      missing[documentName] = 0;
      for (const uuid of uuids) {
        const document = collection?.get(worldDocument(uuid).id);
        if (!document) missing[documentName] += 1;
        else if (documentName === "Actor" && isPlayersCharacter(document, { users, party })) leftOut += 1;
        else documents[documentName].push(document);
      }
    }
    const used = [
      ...journalFolders,
      ...handouts.map((entry) => entry._source.folder),
      ...Object.values(documents).flat().map((document) => document._source.folder),
    ];
    return {
      campaign,
      folder,
      folders: foldersFor(used, worldFolders).map((id) => game.folders.get(id)).filter(Boolean),
      entries,
      scenes: documents.Scene,
      actors: documents.Actor,
      items: documents.Item,
      tables: documents.RollTable,
      missing,
      leftOut,
    };
  }

  /** The world compendium campaigns are exported to; made when `create` and it doesn't exist yet */
  async adventurePack({ create = false } = {}) {
    const pack = game.packs.get(`world.${ADVENTURE_PACK.name}`);
    if (pack) {
      if (pack.documentName !== "Adventure") throw new Error(`The ${pack.title} compendium doesn't hold adventures.`);
      return pack;
    }
    if (!create) return null;
    return foundry.documents.collections.CompendiumCollection.createCompendium({
      type: ADVENTURE_PACK.type,
      label: ADVENTURE_PACK.label,
      name: ADVENTURE_PACK.name,
    });
  }

  /** The compendium index entry of a campaign's earlier export, or null */
  async previousExport(campaignUuid) {
    const pack = await this.adventurePack();
    if (!pack) return null;
    const index = await pack.getIndex({ fields: [CAMPAIGN_FLAG, `flags.${MODULE_ID}.exportedAt`] });
    return index.find((entry) => foundry.utils.getProperty(entry, CAMPAIGN_FLAG) === campaignUuid) ?? null;
  }

  /**
   * Exports the open campaign as an Adventure in this world's Campaign
   * Planner Adventures compendium, making the compendium first if need be.
   * Exporting again replaces the campaign's earlier export. The journals open
   * as a campaign that lives in the world they're imported into, even when
   * this one syncs with Dungeon Master Guru; this world's are left as they are.
   * @param {object} [contents] what adventureContents() found
   * @returns {Promise<{ pack: object, adventure: object, replaced: boolean, counts: object, missing: object, leftOut: number }>}
   */
  async exportAdventure(contents = this.adventureContents()) {
    if (!game.user.isGM) throw new Error("Only a GM can export the campaign.");
    const pack = await this.adventurePack({ create: true });
    if (!pack) throw new Error("Couldn't make the compendium.");
    if (pack.locked) throw new Error(`The ${pack.title} compendium is locked. Unlock it, then export again.`);

    // Each document as Foundry's own Adventure exporter takes it, ids and folders kept
    const options = {
      clearSort: false,
      clearFolder: false,
      clearFlags: false,
      clearSource: false,
      clearOwnership: true,
      clearState: true,
      keepId: true,
    };
    const toData = (document) => {
      const data = document.toCompendium(pack, options);
      document.constructor._clearFieldsRecursively?.(data, ["_stats.duplicateSource", "_stats.exportSource"]);
      return data;
    };
    const folders = contents.folders.map((folder) => {
      const data = toData(folder);
      if (folder.id === contents.folder.id) data.name = localFolderName(data.name);
      return data;
    });
    const journal = localJournal(contents.entries.map(toData));
    const data = adventureData({
      campaign: contents.campaign,
      folders,
      journal,
      scenes: contents.scenes.map(toData),
      actors: contents.actors.map(toData),
      items: contents.items.map(toData),
      tables: contents.tables.map(toData),
      exportedAt: new Date().toISOString(),
      version: game.modules.get(MODULE_ID)?.version,
    });

    const previous = await this.previousExport(contents.campaign.uuid);
    const existing = previous ? await pack.getDocument(previous._id) : null;
    const operation = { keepId: true, keepEmbeddedIds: true, diff: false, recursive: false };
    const adventure = existing
      ? ((await existing.update(data, operation)) ?? existing)
      : await CONFIG.Adventure.documentClass.create(data, { ...operation, pack: pack.collection });
    if (!adventure) throw new Error("Foundry didn't save the adventure.");
    return {
      pack,
      adventure,
      replaced: Boolean(existing),
      counts: {
        entries: journal.length,
        pages: journal.reduce((total, entry) => total + (entry.pages?.length ?? 0), 0),
        scenes: data.scenes.length,
        actors: data.actors.length,
        items: data.items.length,
        tables: data.tables.length,
        folders: folders.length,
      },
      missing: contents.missing,
      leftOut: contents.leftOut,
    };
  }

  // Finds compendium entries by name in the packs the campaign uses
  #compendiumLookup(store) {
    const campaign = [...store.campaign.values()][0];
    const excluded = campaign?.excludedCompendiumPacks ?? [];
    const packs = COMPENDIUM_PACKS.filter((id) => !excluded.includes(id))
      .map((id) => game.packs.get(id))
      .filter(Boolean)
      .map((pack) => ({ id: pack.collection, documentName: pack.documentName, index: pack.index.contents }));
    return compendiumLookup(packs);
  }

  #renderContext(store) {
    return {
      techniques: currentTechniques(),
      baseUrl: this.baseUrl,
      compendiumUuid: this.#compendiumLookup(store),
      monsterActorUuid: (id) => this.monsterActorUuid(id),
      actorName: (uuid) => fromUuidSync(uuid)?.name ?? null,
      recordOf: (collection, id) => store[collection]?.get(String(id)) ?? null,
      references: [...store.references.values()],
      encounters: [...store.encounters.values()],
      campaign: [...store.campaign.values()][0] ?? null,
      xpTables: this.xpTables,
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
        name: this.isLocal ? campaignName : `${campaignName} (DM Guru)`,
        type: "JournalEntry",
        flags: { [MODULE_ID]: newFolderFlags(uuid) },
      });
    }
    const existing = this.#entriesInFolder();
    const entries = {};
    for (const { collection, name, sort } of SECTIONS) {
      entries[collection] =
        existing.find((entry) => flag(entry, "collection") === collection) ??
        (await JournalEntry.create({
          name,
          folder: folder.id,
          sort,
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
      // Sessions in play order, main quests by act, and encounters by quest;
      // other pages keep their creation order
      if (collection === "sessions") data.sort = record.number * 1000;
      if (collection === "quests") data.sort = questSort(record);
      if (collection === "encounters") data.sort = encounterSort(record, context.recordOf?.("quests", record.questId));
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
        flag(page, "syncVersion") !== record.syncVersion ||
        JSON.stringify(flag(page, "record")) !== JSON.stringify(record)
      ) {
        // Replace the stored record rather than merge into it, or a field that
        // was emptied (coins set to {}, say) would keep its old keys
        const flags = { uuid: record.uuid, collection, syncVersion: record.syncVersion };
        flags.record = foundry.data.operators.ForcedReplacement.create(record);
        updates.push({ _id: page.id, ...data, [`flags.${MODULE_ID}`]: flags });
      }
    }
    const removals = [...pages.entries()].filter(([uuid]) => deleted.has(uuid)).map(([, page]) => page.id);

    if (creates.length) await entry.createEmbeddedDocuments("JournalEntryPage", creates);
    if (updates.length) await entry.updateEmbeddedDocuments("JournalEntryPage", updates);
    if (removals.length) await entry.deleteEmbeddedDocuments("JournalEntryPage", removals);
  }

  /**
   * Writes the linked campaign's journal pages again from their records, as
   * after a technique is switched on or off. Only pages that change are saved.
   */
  async rewritePages() {
    if (!game.user.isGM || !this.linked) return;
    const store = this.records();
    const context = this.#renderContext(store);
    for (const entry of this.#entriesInFolder()) {
      const collection = flag(entry, "collection");
      if (!store[collection]) continue;
      await this.#writePages(entry, collection, [...store[collection].values()], new Set(), context);
    }
  }

  /** Forgets the link (the journals stay) */
  async unlink() {
    await game.settings.set(MODULE_ID, SETTINGS.campaign, {});
    Hooks.callAll(SYNCED_HOOK);
  }
}

// Dungeon Master Guru can't be reached, won't take this browser's token, or
// needs a newer version of the module: stop syncing and keep the changes for next time
const cantReach = (error) =>
  error?.status === 0 || error?.status === 401 || error?.status === 426 || error?.status === 429 || error?.status >= 500;

// Why a sync stopped, to finish "Couldn't sync: Dungeon Master Guru …"
function whyNot(error) {
  if (error.status === 401) return "didn't accept this browser's connection. Connect again";
  if (error.status === 426) return "needs a newer version of this module. Update Dorman Lakely's Campaign Planner, then Sync";
  if (error.status === 429) return "is busy. Try again in a minute";
  if (error.status >= 500) return `had a problem (error ${error.status})`;
  return "couldn't be reached";
}



function withExtras(toSend, attributes) {
  return "revealed" in toSend && "revealedSessionUuid" in attributes
    ? { ...toSend, revealedSessionUuid: attributes.revealedSessionUuid }
    : toSend;
}

export { TYPE_COLLECTIONS };
