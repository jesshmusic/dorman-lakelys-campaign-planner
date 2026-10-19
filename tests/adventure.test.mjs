import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ADVENTURE_PACK,
  CAMPAIGN_FLAG,
  adventureData,
  adventureText,
  adventureUuids,
  contentLinkUuids,
  describeContents,
  describeMissing,
  foldersFor,
  isPlayersCharacter,
  listText,
  localFolderName,
  localJournal,
  localRecords,
  sceneImage,
  subfolderIds,
  worldDocument,
} from "../src/adventure.mjs";
import { buildLocalCampaign } from "../src/local.mjs";
import { planDelete } from "../src/planner.mjs";
import { importPayload } from "../src/send.mjs";
import { MODULE_ID } from "../src/constants.mjs";

const MAP = "Scene.QdI6Ix83ypmPq4lc";
const CRYPT = "Scene.WVPcqI82sGV2YrXq";
const KALVAR = "Actor.Kx2b0jPq7fRm1ZcY";
const SWORD = "Item.Sw0rdSw0rdSw0rd1";
const LOOT = "RollTable.L00tL00tL00tL00t";
const GOBLIN = "Compendium.dnd5e.monsters.Actor.G0bl1nG0bl1nG0bl";

// A campaign synced with Dungeon Master Guru, as the pull sends it: server ids
// as strings, UUID v4s, and references between records by id
const U = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const synced = () => ({
  campaign: [
    {
      id: "7",
      uuid: U(7),
      slug: "night-of-the-green-sky",
      name: "Night of the Green Sky",
      premise: "The sky turns green & the dead walk.",
      pitch: "Save the village.",
      mode: "arc",
      excludedCompendiumPacks: [],
      createdAt: "2026-10-01T00:00:00Z",
      updatedAt: "2026-10-02T00:00:00Z",
      syncVersion: 12,
    },
  ],
  factions: [{ id: "3", uuid: U(103), name: "The Cult", syncVersion: 2 }],
  references: [
    { id: "4", uuid: U(104), name: "Longsword +1", category: "magic_item", foundryUuid: SWORD, citation: "This world", syncVersion: 3 },
    { id: "5", uuid: U(105), name: "Goblin", category: "monster", foundryUuid: GOBLIN, citation: "Monster Manual", syncVersion: 3 },
  ],
  locations: [
    { id: "1", uuid: U(201), name: "Hommlet", parentId: null, foundrySceneUuid: MAP, foundrySceneName: "Hommlet", syncVersion: 4 },
    { id: "2", uuid: U(202), name: "The crypt", parentId: "1", foundrySceneUuid: null, syncVersion: 4 },
  ],
  npcs: [
    {
      id: "1",
      uuid: U(301),
      name: "Kalvar",
      role: "villain",
      factionId: "3",
      foundryActorUuid: KALVAR,
      statBlockReference: { id: "5", name: "Goblin", citation: "Monster Manual" },
      monster: null,
      syncVersion: 5,
    },
  ],
  fronts: [{ id: "1", uuid: U(401), name: "The Green Sky", npcId: "1", factionId: "3", syncVersion: 6 }],
  quests: [
    {
      id: "1",
      uuid: U(501),
      name: "Find the crypt",
      parentId: null,
      giverNpcId: "1",
      locationId: "2",
      foundryScenes: [{ uuid: CRYPT, name: "Crypt" }],
      links: [
        { id: "9", uuid: U(901), linkableType: "CampaignNpc", linkableId: "1", name: "Kalvar" },
        { id: "10", uuid: U(902), linkableType: "CampaignReference", linkableId: "4", name: "Longsword +1", quantity: 2 },
        { id: "11", uuid: U(903), linkableType: "Monster", linkableId: "88", name: "Zombie" },
      ],
      syncVersion: 7,
    },
    { id: "2", uuid: U(502), name: "Clear the crypt", parentId: "1", syncVersion: 7 },
  ],
  sessions: [
    {
      id: "1",
      uuid: U(601),
      number: 1,
      displayTitle: "Session 1",
      foundryScenes: [{ uuid: MAP, name: "Hommlet" }],
      links: [
        { id: "12", uuid: U(904), linkableType: "CampaignSecret", linkableId: "1", name: "The priest lies" },
        { id: "13", uuid: U(905), linkableType: "CampaignLocation", linkableId: "2", name: "The crypt" },
      ],
      syncVersion: 8,
    },
  ],
  secrets: [{ id: "1", uuid: U(701), text: "The priest lies", revealed: true, revealedSessionId: "1", syncVersion: 9 }],
});

const byName = (records, name) => records.find((record) => record.name === name);

// World documents ------------------------------------------------------------

test("tells world documents from compendium entries and embedded documents", () => {
  assert.deepEqual(worldDocument(MAP), { documentName: "Scene", id: "QdI6Ix83ypmPq4lc" });
  assert.deepEqual(worldDocument(LOOT), { documentName: "RollTable", id: "L00tL00tL00tL00t" });
  assert.equal(worldDocument(GOBLIN), null);
  assert.equal(worldDocument(`${KALVAR}.Item.Sw0rdSw0rdSw0rd1`), null);
  assert.equal(worldDocument("JournalEntry.Sw0rdSw0rdSw0rd1"), null);
  assert.equal(worldDocument(null), null);
});

test("finds the world documents a page links to", () => {
  const html = `<p>@UUID[${KALVAR}]{Kalvar} carries @UUID[${SWORD}]{a sword}; roll on @UUID[${LOOT}]{Loot}.
    @UUID[${GOBLIN}]{Goblin} @UUID[${KALVAR}.Item.Sw0rdSw0rdSw0rd1]{his sword}</p>`;
  assert.deepEqual(contentLinkUuids(html), [KALVAR, SWORD, LOOT]);
  assert.deepEqual(contentLinkUuids(null), []);
});

test("takes the maps, actors, items and tables the campaign uses, once each, and leaves compendium entries as links", () => {
  const lists = synced();
  lists.references.push({ id: "6", uuid: U(106), name: "Loot", category: "table", foundryUuid: LOOT });
  lists.references.push({ id: "7", uuid: U(107), name: "Ogre", category: "monster", foundryUuid: "Actor.0gre0gre0gre0gre" });

  const uuids = adventureUuids(lists, { texts: [`@UUID[${MAP}]{Map} @UUID[Item.N0teN0teN0teN0te]{A note's item}`] });

  assert.deepEqual(uuids, {
    Scene: [MAP, CRYPT],
    Actor: [KALVAR, "Actor.0gre0gre0gre0gre"],
    Item: [SWORD, "Item.N0teN0teN0teN0te"],
    RollTable: [LOOT],
  });
});

test("an empty campaign uses nothing", () => {
  assert.deepEqual(adventureUuids({}), { Scene: [], Actor: [], Item: [], RollTable: [] });
});

test("leaves out the players' characters, but not a GM's character-type NPC", () => {
  const users = [
    { id: "gm", isGM: true, character: null },
    { id: "pat", isGM: false, character: { id: "pc1" } },
    { id: "sam", isGM: false, character: null },
  ];
  const actor = (id, type, ownership = {}) => ({ id, uuid: `Actor.${id}`, type, ownership });
  assert.equal(isPlayersCharacter(actor("pc1", "character"), { users }), true);
  assert.equal(isPlayersCharacter(actor("pc2", "character", { sam: 3 }), { users }), true);
  assert.equal(isPlayersCharacter(actor("npc1", "character", { gm: 3 }), { users }), false);
  assert.equal(isPlayersCharacter(actor("npc2", "npc", { sam: 3 }), { users }), false);
  assert.equal(isPlayersCharacter(actor("npc3", "npc"), { users, party: ["Actor.npc3"] }), true);
});

// Folders -------------------------------------------------------------------

const FOLDERS = [
  { _id: "campaigns", folder: null },
  { _id: "green", folder: "campaigns" },
  { _id: "handouts", folder: "green" },
  { _id: "maps", folder: "handouts" },
  { _id: "monsters", folder: null },
  { _id: "undead", folder: "monsters" },
];

test("finds every folder inside the campaign's folder", () => {
  assert.deepEqual(subfolderIds("green", FOLDERS), ["handouts", "maps"]);
  assert.deepEqual(subfolderIds("undead", FOLDERS), []);
});

test("takes each document's folder and the folders it's in, once each", () => {
  assert.deepEqual(foldersFor(["green", "undead", null, "handouts", "gone"], FOLDERS), [
    "green",
    "campaigns",
    "undead",
    "monsters",
    "handouts",
  ]);
});

test("a synced campaign's folder loses its (DM Guru)", () => {
  assert.equal(localFolderName("Night of the Green Sky (DM Guru)"), "Night of the Green Sky");
  assert.equal(localFolderName("Night of the Green Sky"), "Night of the Green Sky");
});

// Making it local -----------------------------------------------------------

test("makes a synced campaign's records local: ids are their uuids, and references follow", () => {
  const lists = synced();
  const before = JSON.stringify(lists);
  const local = localRecords(lists);

  const campaign = local.campaign[0];
  assert.equal(campaign.id, U(7));
  assert.equal(campaign.uuid, U(7));
  assert.equal(campaign.local, true);
  assert.equal(campaign.syncVersion, 0);
  assert.deepEqual(campaign.partyActorUuids, []);
  assert.equal("slug" in campaign, false);
  assert.equal("createdAt" in campaign, false);
  assert.equal(campaign.premise, "The sky turns green & the dead walk.");

  for (const records of Object.values(local)) {
    for (const record of records) {
      assert.equal(record.id, record.uuid);
      assert.equal(record.syncVersion, 0);
    }
  }

  const [npc] = local.npcs;
  assert.equal(npc.factionId, U(103));
  assert.deepEqual(npc.statBlockReference, { id: U(105), name: "Goblin", citation: "Monster Manual" });
  assert.equal(npc.foundryActorUuid, KALVAR);
  assert.deepEqual([local.fronts[0].npcId, local.fronts[0].factionId], [U(301), U(103)]);
  assert.equal(byName(local.locations, "The crypt").parentId, U(201));
  assert.equal(byName(local.locations, "Hommlet").parentId, null);

  const quest = byName(local.quests, "Find the crypt");
  assert.deepEqual([quest.giverNpcId, quest.locationId, quest.parentId], [U(301), U(202), null]);
  assert.equal(byName(local.quests, "Clear the crypt").parentId, U(501));
  assert.deepEqual(
    quest.links.map((link) => [link.linkableType, link.linkableId, link.quantity]),
    [
      ["CampaignNpc", U(301), undefined],
      ["CampaignReference", U(104), 2],
      // A Dungeon Master Guru SRD monster keeps its id
      ["Monster", "88", undefined],
    ],
  );
  assert.deepEqual(
    local.sessions[0].links.map((link) => link.linkableId),
    [U(701), U(202)],
  );
  assert.equal(local.secrets[0].revealedSessionId, U(601));

  // The records given are left as they were
  assert.equal(JSON.stringify(lists), before);
});

test("a reference to a record that isn't there keeps its value", () => {
  const local = localRecords({ npcs: [{ id: "1", uuid: U(1), name: "Kalvar", factionId: "99" }], factions: [] });
  assert.equal(local.npcs[0].factionId, "99");
});

test("a local campaign's records stay as they were, but for the party", () => {
  let n = 0;
  const { campaign, records } = buildLocalCampaign(
    { template: "three_act", values: { name: "Zombie Siege" }, party: ["Actor.pc0000000000001"] },
    { id: () => `id${String((n += 1)).padStart(14, "0")}` },
  );
  const lists = { campaign: [campaign], ...records };
  const local = localRecords(lists);
  assert.deepEqual(local.sessions, records.sessions);
  assert.deepEqual(local.quests, records.quests);
  assert.deepEqual(local.campaign[0], { ...campaign, partyActorUuids: [] });
});

test("the local records still work in the planner, and can be sent to Dungeon Master Guru later", () => {
  const local = localRecords(synced());

  // Deleting the NPC clears what pointed at it, so the ids line up
  const { updates } = planDelete(local, "npcs", U(301));
  assert.deepEqual(
    updates.map((update) => update.collection).sort(),
    ["fronts", "quests"],
  );
  assert.equal(updates.find((u) => u.collection === "fronts").record.npcId, null);
  assert.equal(updates.find((u) => u.collection === "quests").record.giverNpcId, null);
  assert.deepEqual(
    updates.find((u) => u.collection === "quests").record.links.map((link) => link.linkableType),
    ["CampaignReference", "Monster"],
  );

  const payload = importPayload({ campaign: local.campaign[0], store: local, world: { id: "other", title: "Other" } });
  assert.equal(payload.request_id, `send-${U(7)}`);
  assert.equal(payload.records.npcs[0].id, U(301));
  assert.equal(payload.records.fronts[0].npcId, U(301));
});

// The journals --------------------------------------------------------------

const page = (collection, record, extra = {}) => ({
  _id: `page${record.id}`.padEnd(16, "0").slice(0, 16),
  name: record.name ?? "Campaign",
  type: "text",
  text: { content: "<p>Rendered</p>", format: 1 },
  flags: { [MODULE_ID]: { uuid: record.uuid, collection, syncVersion: record.syncVersion, record }, other: { kept: true } },
  ...extra,
});
const entry = (collection, pages) => ({
  _id: `entry-${collection}`,
  name: collection,
  folder: "green",
  flags: { [MODULE_ID]: { collection } },
  pages,
});

test("the journals open as a local campaign wherever they're imported", () => {
  const lists = synced();
  lists.campaign[0].partyActorUuids = ["Actor.pc0000000000001"];
  const handout = { _id: "handout000000000", name: "Handout", type: "text", text: { content: "<p>Mine</p>" }, flags: {} };
  const entries = [
    entry("campaign", [page("campaign", lists.campaign[0])]),
    entry("npcs", lists.npcs.map((npc) => page("npcs", npc))),
    entry("factions", lists.factions.map((faction) => page("factions", faction))),
    entry("fronts", [...lists.fronts.map((front) => page("fronts", front)), handout]),
  ];
  const before = JSON.stringify(entries);

  const journal = localJournal(entries);

  // What the Open campaign picker looks for: the overview page's record is
  // local, and its uuid is the one the folder is flagged with
  const overview = journal.find((e) => e.flags[MODULE_ID].collection === "campaign").pages[0];
  const record = overview.flags[MODULE_ID].record;
  assert.equal(record.local, true);
  assert.equal(record.uuid, U(7));
  assert.equal(overview.flags[MODULE_ID].uuid, U(7));
  assert.equal(overview.flags[MODULE_ID].syncVersion, 0);
  assert.deepEqual(overview.flags.other, { kept: true });
  // Shown again without the party, whose characters stay in their own world
  assert.doesNotMatch(overview.text.content, /party/i);
  assert.match(overview.text.content, /The sky turns green &amp; the dead walk\./);

  const front = journal.find((e) => e.flags[MODULE_ID].collection === "fronts");
  assert.equal(front.pages[0].flags[MODULE_ID].record.npcId, U(301));
  assert.equal(front.pages[0].flags[MODULE_ID].record.factionId, U(103));
  assert.equal(front.pages[0].flags[MODULE_ID].uuid, U(401));
  assert.equal(front.pages[0].text.content, "<p>Rendered</p>");
  // Pages that aren't the campaign's records are left alone
  assert.equal(front.pages[1], handout);
  assert.equal(front._id, "entry-fronts");
  assert.equal(front.folder, "green");

  assert.equal(JSON.stringify(entries), before);
});

// The adventure -------------------------------------------------------------

test("pictures the adventure with a scene's thumbnail, or else its map", () => {
  const level = (id, src) => ({ _id: id, background: { src } });
  assert.equal(sceneImage({ thumb: "thumbs/a.webp", levels: [level("l1", "maps/a.webp")] }), "thumbs/a.webp");
  assert.equal(
    sceneImage({ thumb: null, initialLevel: "l2", levels: [level("l1", "maps/a.webp"), level("l2", "maps/b.webp")] }),
    "maps/b.webp",
  );
  assert.equal(sceneImage({ levels: [level("l1", null), level("l2", "maps/b.webp")] }), "maps/b.webp");
  assert.equal(sceneImage({ levels: [] }), null);
  assert.equal(sceneImage(null), null);
});

test("captions the adventure with the premise, and says how to open it", () => {
  const { caption, description } = adventureText({
    name: "Night <of> the Green Sky",
    premise: "The sky turns green.\nThe dead walk.",
    pitch: "Save the village.",
    settingName: "Greyhawk",
  });
  assert.equal(caption, "<p>The sky turns green.<br>The dead walk.</p>");
  assert.match(description, /<h3>Pitch for the players<\/h3><p>Save the village\.<\/p>/);
  assert.match(description, /<strong>Setting:<\/strong> Greyhawk/);
  assert.match(description, /Night &lt;of&gt; the Green Sky/);
  assert.match(description, /no Dungeon Master Guru account needed/);
});

test("without a premise, the pitch is the caption", () => {
  const { caption, description } = adventureText({ name: "Zombie Siege", pitch: "Hold the walls." });
  assert.equal(caption, "<p>Hold the walls.</p>");
  assert.doesNotMatch(description, /Pitch for the players/);
  assert.equal(adventureText({ name: "Zombie Siege" }).caption, "");
});

test("the adventure holds the documents and names the campaign it came from", () => {
  const campaign = synced().campaign[0];
  const scenes = [{ _id: "QdI6Ix83ypmPq4lc", name: "No map", levels: [] }, { _id: "WVPcqI82sGV2YrXq", thumb: "thumbs/crypt.webp" }];
  const data = adventureData({
    campaign,
    folders: [{ _id: "green" }],
    journal: [{ _id: "entry" }],
    scenes,
    actors: [{ _id: "Kx2b0jPq7fRm1ZcY" }],
    exportedAt: "2026-10-19T12:00:00.000Z",
    version: "1.0.0",
  });
  assert.equal(data.name, "Night of the Green Sky");
  assert.equal(data.img, "thumbs/crypt.webp");
  assert.equal(data.caption, "<p>The sky turns green &amp; the dead walk.</p>");
  assert.deepEqual(data.folders, [{ _id: "green" }]);
  assert.deepEqual(data.scenes, scenes);
  assert.deepEqual(data.items, []);
  assert.deepEqual(data.tables, []);
  assert.deepEqual(data.flags, { [MODULE_ID]: { campaignUuid: U(7), exportedAt: "2026-10-19T12:00:00.000Z", version: "1.0.0" } });
  assert.equal(CAMPAIGN_FLAG, `flags.${MODULE_ID}.campaignUuid`);
  assert.deepEqual(ADVENTURE_PACK, { name: "campaign-planner-adventures", label: "Campaign Planner Adventures", type: "Adventure" });
});

test("without a scene with a picture, the adventure has none", () => {
  assert.equal(adventureData({ campaign: { name: "Zombie Siege", uuid: "z" } }).img, null);
});

test("says what the adventure holds and what's missing", () => {
  assert.deepEqual(describeContents({ entries: 9, pages: 42, scenes: 3, actors: 1, items: 0, tables: 2 }), [
    "9 journal entries (42 pages)",
    "3 scenes",
    "1 actor",
    "2 roll tables",
  ]);
  assert.deepEqual(describeContents({ entries: 1, pages: 1 }), ["1 journal entry (1 page)"]);
  assert.equal(describeMissing({ Scene: 1, Actor: 2, Item: 0 }), "1 scene and 2 actors");
  assert.equal(describeMissing({ Scene: 1, Actor: 1, RollTable: 3 }), "1 scene, 1 actor and 3 roll tables");
  assert.equal(describeMissing({}), "");
  assert.equal(listText(["one"]), "one");
});
