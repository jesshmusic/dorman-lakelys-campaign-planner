// Exporting a campaign as a Foundry Adventure in a world compendium, to share
// it or import it into another world with Foundry's own Adventure importer.
// The adventure carries the campaign's journals and the world's scenes,
// actors, items and roll tables it uses, with their ids, so the links between
// them still work after the import. No Foundry globals, so it can be tested
// in Node.

import { MODULE_ID } from "./constants.mjs";
import { LINK_TYPES } from "./planner.mjs";
import { escapeHtml, renderRecord } from "./render.mjs";
import { campaignSceneUuids } from "./scenes.mjs";
import { isPlayerCharacter, playersOf } from "./characters.mjs";

/** The world compendium the campaigns are exported to, one Adventure each */
export const ADVENTURE_PACK = { name: "campaign-planner-adventures", label: "Campaign Planner Adventures", type: "Adventure" };

/** The flag on an Adventure that names the campaign it holds, so exporting again replaces it */
export const CAMPAIGN_FLAG = `flags.${MODULE_ID}.campaignUuid`;

// The world documents an adventure takes from the campaign, by the field the Adventure keeps them in
export const ADVENTURE_FIELDS = { Scene: "scenes", Actor: "actors", Item: "items", RollTable: "tables" };

// A primary world document: "Scene.QdI6Ix83ypmPq4lc", not a compendium entry or an embedded document
const WORLD_UUID = /^(Scene|Actor|Item|RollTable)\.([A-Za-z0-9]{16})$/;
// A content link in a journal page: @UUID[Item.abc...]{Name}
const CONTENT_LINK = /@UUID\[(Scene|Actor|Item|RollTable)\.([A-Za-z0-9]{16})\]/g;

/**
 * A world document's type and id, from its uuid; null for anything else
 * (compendium entries, embedded documents), which stays a link.
 * @param {string|null} uuid e.g. "Actor.Kx2b0jPq7fRm1ZcY"
 * @returns {{ documentName: string, id: string }|null}
 */
export function worldDocument(uuid) {
  const match = WORLD_UUID.exec(String(uuid ?? ""));
  return match ? { documentName: match[1], id: match[2] } : null;
}

/** The world scenes, actors, items and roll tables a journal page's HTML links to */
export const contentLinkUuids = (html) =>
  [...String(html ?? "").matchAll(CONTENT_LINK)].map(([, documentName, id]) => `${documentName}.${id}`);

/**
 * The world documents a campaign uses, by type: the maps of its places,
 * sessions, quests and encounters; its NPCs' actors; the actors, items and roll tables
 * its book references point to; its places' random encounter tables; and anything its journal pages link to.
 * Compendium entries are left out: they stay links.
 * @param {Record<string, object[]>} lists the campaign's records by collection
 * @param {{ texts?: string[] }} options texts: the journal pages' HTML
 * @returns {{ Scene: string[], Actor: string[], Item: string[], RollTable: string[] }} uuids, once each, in order
 */
export function adventureUuids(lists, { texts = [] } = {}) {
  const found = Object.fromEntries(Object.keys(ADVENTURE_FIELDS).map((documentName) => [documentName, new Set()]));
  const add = (uuid) => {
    const document = worldDocument(uuid);
    if (document) found[document.documentName].add(`${document.documentName}.${document.id}`);
  };
  campaignSceneUuids(lists).forEach(add);
  (lists.npcs ?? []).forEach((npc) => add(npc.foundryActorUuid));
  (lists.references ?? []).forEach((reference) => add(reference.foundryUuid));
  (lists.locations ?? []).forEach((location) => (location.rollTables ?? []).forEach((table) => add(table?.uuid)));
  texts.flatMap(contentLinkUuids).forEach(add);
  return Object.fromEntries(Object.entries(found).map(([documentName, uuids]) => [documentName, [...uuids]]));
}

// A world journal entry, or a page in one: "JournalEntry.<id>" or "JournalEntry.<id>.JournalEntryPage.<id>"
const WORLD_JOURNAL = /^JournalEntry\.([A-Za-z0-9]{16})(\.JournalEntryPage\.[A-Za-z0-9]{16})?$/;

/**
 * The world journal entries the campaign's quests use as handouts (for a
 * page, the entry it's in), once each, so the adventure takes them along.
 * Compendium journals stay links.
 * @param {{ quests?: object[] }} lists
 * @returns {string[]} JournalEntry ids
 */
export function handoutEntryIds({ quests = [] } = {}) {
  const ids = quests.flatMap((quest) => (quest.handouts ?? []).map((handout) => WORLD_JOURNAL.exec(handout?.uuid ?? "")?.[1]));
  return [...new Set(ids.filter(Boolean))];
}

/**
 * Whether an actor stays out of the adventure because it's a player's
 * character: one in the campaign's party, or a Player Character a player
 * plays or owns. A GM's own character-type NPC goes in.
 * @param {{ id: string, uuid: string, type: string, ownership?: object }} actor
 * @param {{ users?: object[], party?: string[] }} options users: the world's users; party: the party's actor uuids
 */
export function isPlayersCharacter(actor, { users = [], party = [] } = {}) {
  if (party.includes(actor.uuid)) return true;
  return isPlayerCharacter(actor) && playersOf(actor, users).length > 0;
}

/**
 * Every folder inside this one, at any depth.
 * @param {string} rootId
 * @param {{ _id: string, folder: string|null }[]} folders the world's folders
 * @returns {string[]}
 */
export function subfolderIds(rootId, folders) {
  const found = [];
  let parents = [rootId];
  while (parents.length) {
    const children = folders.filter((f) => parents.includes(f.folder) && f._id !== rootId && !found.includes(f._id));
    found.push(...children.map((f) => f._id));
    parents = children.map((f) => f._id);
  }
  return found;
}

/**
 * The folders the adventure needs to rebuild the same tree when it's
 * imported: each of these folders and every folder it's inside.
 * @param {(string|null)[]} folderIds the folders the exported documents are in
 * @param {{ _id: string, folder: string|null }[]} folders the world's folders
 * @returns {string[]}
 */
export function foldersFor(folderIds, folders) {
  const byId = new Map(folders.map((f) => [f._id, f]));
  const found = new Set();
  for (const start of folderIds) {
    let id = start;
    while (id && byId.has(id) && !found.has(id)) {
      found.add(id);
      id = byId.get(id).folder ?? null;
    }
  }
  return [...found];
}

/** A synced campaign's journal folder ("Night of the Green Sky (DM Guru)") without its "(DM Guru)" */
export const localFolderName = (name) => String(name ?? "").replace(/\s*\(DM Guru\)$/, "") || name;

// Which collection a session's or quest's link points into, by its linkableType
const LINKED = Object.fromEntries(Object.entries(LINK_TYPES).map(([collection, type]) => [type, collection]));

// The fields that hold another record's id
const REFERENCES = {
  npcs: { factionId: "factions", statBlockReferenceId: "references" },
  fronts: { npcId: "npcs", factionId: "factions" },
  quests: { parentId: "quests", giverNpcId: "npcs", locationId: "locations" },
  encounters: { questId: "quests" },
  locations: { parentId: "locations" },
  secrets: { revealedSessionId: "sessions" },
};

// What Dungeon Master Guru keeps about its own copy of a campaign
const SERVER_ONLY = ["slug", "createdAt", "updatedAt"];

/**
 * A campaign's records as a campaign that lives in a world, the way the New
 * campaign guide makes them: each record's id is its uuid, nothing has
 * synced yet, and the references between records point at the new ids. The
 * reverse of Send to Dungeon Master Guru. A local campaign's records come
 * back as they were, apart from the party: the players' characters stay in
 * their own world, so the importing GM picks theirs.
 * @param {Record<string, object[]>} lists records by collection; lists.campaign[0] is the campaign
 * @returns {Record<string, object[]>} new records; the ones given are left as they were
 */
export function localRecords(lists) {
  const ids = Object.fromEntries(
    Object.entries(lists).map(([collection, records]) => [
      collection,
      new Map(records.map((record) => [String(record.id), String(record.uuid ?? record.id)])),
    ]),
  );
  // A reference to a record that isn't there keeps its value, as the planner would show it
  const point = (collection, id) => (id === null || id === undefined ? id : (ids[collection]?.get(String(id)) ?? id));
  return Object.fromEntries(
    Object.entries(lists).map(([collection, records]) => [
      collection,
      records.map((record) => localRecord(collection, record, point)),
    ]),
  );
}

function localRecord(collection, record, point) {
  const key = String(record.uuid ?? record.id);
  const local = { ...record, id: key, uuid: key, syncVersion: 0 };
  for (const [field, target] of Object.entries(REFERENCES[collection] ?? {})) {
    if (field in record) local[field] = point(target, record[field]);
  }
  if (record.statBlockReference?.id !== undefined && record.statBlockReference?.id !== null) {
    local.statBlockReference = { ...record.statBlockReference, id: point("references", record.statBlockReference.id) };
  }
  if (Array.isArray(record.links)) {
    local.links = record.links.map((link) =>
      LINKED[link.linkableType] ? { ...link, linkableId: point(LINKED[link.linkableType], link.linkableId) } : link,
    );
  }
  if (collection === "campaign") {
    for (const field of SERVER_ONLY) delete local[field];
    local.local = true;
    local.partyActorUuids = [];
  }
  return local;
}

const moduleFlags = (page) => page.flags?.[MODULE_ID];
const isRecordPage = (page) => Boolean(moduleFlags(page)?.collection && moduleFlags(page)?.record);

/**
 * The campaign's journal entries for the adventure, opening as a campaign
 * that lives in the world they're imported into: each page's record made
 * local (see localRecords), and the overview page shown without the party.
 * @param {object[]} entries JournalEntry data, as toObject() gives it
 * @returns {object[]} new entry data; the entries given are left as they were
 */
export function localJournal(entries) {
  const pages = entries.flatMap((entry) => entry.pages ?? []).filter(isRecordPage);
  const lists = {};
  for (const page of pages) (lists[moduleFlags(page).collection] ??= []).push(moduleFlags(page).record);
  const local = localRecords(lists);
  const converted = new Map();
  const positions = {};
  for (const page of pages) {
    const { collection } = moduleFlags(page);
    positions[collection] = (positions[collection] ?? -1) + 1;
    converted.set(page, local[collection][positions[collection]]);
  }

  return entries.map((entry) => ({
    ...entry,
    pages: (entry.pages ?? []).map((page) => {
      const record = converted.get(page);
      if (!record) return page;
      const flags = moduleFlags(page);
      const updated = {
        ...page,
        flags: { ...page.flags, [MODULE_ID]: { ...flags, uuid: record.uuid, syncVersion: 0, record } },
      };
      if (flags.collection === "campaign") updated.text = { ...page.text, content: renderRecord("campaign", record, {}) };
      return updated;
    }),
  }));
}

/**
 * The adventure's picture: a scene's thumbnail, or else its map.
 * @param {object} scene the scene's data, as toObject() gives it
 * @returns {string|null}
 */
export function sceneImage(scene) {
  if (!scene) return null;
  if (scene.thumb) return scene.thumb;
  const levels = scene.levels ?? [];
  const initial = levels.find((level) => level._id === scene.initialLevel);
  return [initial, ...levels].map((level) => level?.background?.src).find(Boolean) ?? scene.background?.src ?? null;
}

// Plain text as HTML, keeping line breaks
const html = (value) => escapeHtml(value).replaceAll("\n", "<br>");

/**
 * The adventure's caption and description, from the campaign's premise and
 * pitch, with how to open it once imported.
 * @param {object} campaign the campaign record
 * @returns {{ caption: string, description: string }}
 */
export function adventureText(campaign) {
  const premise = String(campaign.premise ?? "").trim();
  const pitch = String(campaign.pitch ?? "").trim();
  const caption = premise || pitch;
  const facts = [
    ["Setting", campaign.settingName],
    ["Tone", campaign.tone],
  ].filter(([, value]) => value);
  const description = [
    premise && pitch ? `<h3>Pitch for the players</h3><p>${html(pitch)}</p>` : "",
    facts.map(([label, value]) => `<p><strong>${label}:</strong> ${html(value)}</p>`).join(""),
    `<h3>Running it</h3><p>Plan and run it with Dorman Lakely's Campaign Planner. After importing, click
      <strong>Switch</strong> at the top of the Journal sidebar and pick <em>${escapeHtml(campaign.name)}</em>. It lives in
      the world it's imported into: no Dungeon Master Guru account needed.</p>`,
  ].join("");
  return { caption: caption ? `<p>${html(caption)}</p>` : "", description };
}

/**
 * The Adventure document's data.
 * @param {{ campaign: object, folders?: object[], journal?: object[], scenes?: object[], actors?: object[], items?: object[], tables?: object[], exportedAt?: string, version?: string }} contents
 *   each list is document data, as toObject() gives it; the journal already made local (see localJournal)
 */
export function adventureData({ campaign, folders = [], journal = [], scenes = [], actors = [], items = [], tables = [], exportedAt, version }) {
  return {
    name: campaign.name,
    img: scenes.map(sceneImage).find(Boolean) ?? null,
    ...adventureText(campaign),
    folders,
    journal,
    scenes,
    actors,
    items,
    tables,
    flags: { [MODULE_ID]: { campaignUuid: campaign.uuid, exportedAt: exportedAt ?? null, version: version ?? null } },
  };
}

const count = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Words as a list: ["a", "b", "c"] -> "a, b and c" */
export const listText = (parts) => (parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}` : (parts[0] ?? ""));

/**
 * What the adventure holds, for the confirmation and the result:
 * ["9 journal entries (42 pages)", "3 scenes", "2 actors"]
 * @param {{ entries: number, pages: number, scenes?: number, actors?: number, items?: number, tables?: number }} counts
 */
export function describeContents({ entries, pages, scenes = 0, actors = 0, items = 0, tables = 0 }) {
  return [
    `${count(entries, "journal entry", "journal entries")} (${count(pages, "page")})`,
    scenes && count(scenes, "scene"),
    actors && count(actors, "actor"),
    items && count(items, "item"),
    tables && count(tables, "roll table"),
  ].filter(Boolean);
}

/**
 * The documents the campaign uses that aren't in the world any more, or "":
 * "1 scene and 2 actors"
 * @param {Record<string, number>} missing by document type, e.g. { Scene: 1, Actor: 2 }
 */
export function describeMissing(missing = {}) {
  const nouns = { Scene: "scene", Actor: "actor", Item: "item", RollTable: "roll table" };
  return listText(
    Object.entries(nouns)
      .filter(([documentName]) => missing[documentName] > 0)
      .map(([documentName, noun]) => count(missing[documentName], noun)),
  );
}
