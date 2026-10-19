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
import { changedAttributes, createAttributes, uuidV4 } from "./editing.mjs";
import { MODULE_ID, PUSH_TYPES, SECTIONS, SETTINGS, SYNCED_HOOK, TYPE_COLLECTIONS } from "./constants.mjs";

const flag = (document, key) => document.getFlag(MODULE_ID, key);

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
  #sentCharacters = null;
  // { uuid -> version } of the scene thumbnails Dungeon Master Guru has
  #sentScenes = null;
  #sendingScenes = null;
  #scenesAgain = false;

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
        if (collection && record && store[collection]) store[collection].set(String(record.id), record);
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
        content: `<p>${escapeHtml(pageName(collection, record))}: ${describeFields(clashes)} also changed on Dungeon Master Guru.</p>
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

  /**
   * Sends the index of this world's SRD and core book compendiums to Dungeon
   * Master Guru, so planner searches can link to their entries. Only packs
   * whose package changed since the last send, unless `force`.
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
    return sent;
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
      campaignSceneUuids({ locations: [...store.locations.values()], sessions: [...store.sessions.values()], quests: [...store.quests.values()] }),
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
    if (!this.isLocal) return (await this.#createRemote(collection, record)) || { error: "Couldn't add it on Dungeon Master Guru." };
    await this.#saveRecord(collection, record);
    return record;
  }

  /** True when the planner can change this campaign: one in this world, or a synced one */
  get editable() {
    return this.isLocal || this.ready;
  }

  /**
   * Saves a record from the planner: in this world, or on Dungeon Master Guru
   * for a synced campaign (only the fields that changed; a new record is
   * created there). Returns the saved record, or false.
   */
  async saveRecord(collection, record) {
    if (this.isLocal) return (await this.saveLocal(collection, record)) && record;
    const store = this.records();
    const current =
      collection === "campaign" ? [...store.campaign.values()][0] : store[collection]?.get(String(record.id));
    if (!current) return this.#createRemote(collection, record);
    const attributes = changedAttributes(collection, current, record);
    if (!Object.keys(attributes).length) return current;
    return (await this.update(collection, current, attributes)) && this.records()[collection]?.get(String(current.id));
  }

  /** Deletes a record from the planner: in this world, or on Dungeon Master Guru */
  async deleteRecord(collection, id) {
    if (this.isLocal) return this.deleteLocal(collection, id);
    const record = this.records()[collection]?.get(String(id));
    if (!record) return;
    const result = await this.api().push(this.linked.uuid, [
      { op: "delete", type: PUSH_TYPES[collection], uuid: record.uuid },
    ]);
    if (result.errors?.length) throw new Error(result.errors[0].errors.join(", "));
    // Brings the deletion, and the records that pointed at it with the pointer cleared
    await this.pull();
  }

  // Creates a record of a synced campaign on Dungeon Master Guru, which gives
  // it its id; then saves what came back to the journals
  async #createRemote(collection, record) {
    const result = await this.api().push(this.linked.uuid, [
      { op: "create", type: PUSH_TYPES[collection], uuid: uuidV4(), attributes: createAttributes(collection, record) },
    ]);
    const created = result.applied?.[0]?.current;
    if (!created) {
      ui.notifications.error(result.errors?.[0]?.errors?.join(", ") ?? "Couldn't add it on Dungeon Master Guru.");
      return false;
    }
    await this.#saveRecord(collection, created);
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
    for (const { collection: target, id: targetId } of remove) {
      const record = this.records()[target]?.get(String(targetId));
      const entry = this.#entriesInFolder().find((e) => flag(e, "collection") === target);
      const page = record && entry?.pages.find((p) => flag(p, "uuid") === record.uuid);
      if (page) await entry.deleteEmbeddedDocuments("JournalEntryPage", [page.id]);
    }
    for (const update of updates) await this.#saveRecord(update.collection, update.record);
    Hooks.callAll(SYNCED_HOOK);
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
    if (!this.isLocal) return this.#createRemote("references", reference);
    await this.#saveRecord("references", reference);
    return reference;
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
      baseUrl: this.baseUrl,
      compendiumUuid: this.#compendiumLookup(store),
      actorName: (uuid) => fromUuidSync(uuid)?.name ?? null,
      recordOf: (collection, id) => store[collection]?.get(String(id)) ?? null,
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
        name: this.isLocal ? campaignName : `${campaignName} (DM Guru)`,
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
      // Sessions in play order and main quests by act; other pages keep their creation order
      if (collection === "sessions") data.sort = record.number * 1000;
      if (collection === "quests") data.sort = (record.kind === "main" ? 0 : 100000) + (record.act ?? 99) * 1000 + (record.position ?? 0);
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

// How each field Foundry can change is named when asking the DM about a clash
export const FIELD_LABELS = {
  clockFilled: "the clock",
  portents: "the grim portents",
  status: "the status",
  log: "the session log",
  recap: "the recap",
  revealed: "whether it's revealed",
};

export const describeFields = (keys) => keys.map((key) => FIELD_LABELS[key] ?? key).join(", ");

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
