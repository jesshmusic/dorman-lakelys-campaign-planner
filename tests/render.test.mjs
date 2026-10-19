import { test } from "node:test";
import assert from "node:assert/strict";
import {
  clockSvg,
  compendiumLink,
  creditHtml,
  currencyText,
  escapeHtml,
  referenceLink,
  renderRecord,
} from "../src/render.mjs";
import { ALL_ON } from "../src/techniques.mjs";

const names = {
  factions: { 3: "The Cult" },
  npcs: { 7: "Kalvar the Hollow" },
  locations: { 2: "Old City" },
  sessions: { 5: "Session 1" },
};
const context = {
  baseUrl: "https://dungeonmaster.guru",
  references: [
    { id: "9", name: "Cult Fanatic", category: "monster", citation: "Monster Manual p. 92", foundryUuid: null },
    {
      id: "10",
      name: "Bag of Holding",
      category: "magic_item",
      citation: "Dungeon Master's Guide",
      foundryUuid: "Compendium.dnd-dungeon-masters-guide.equipment.Item.abc123",
    },
  ],
  nameOf: (collection, id) => names[collection]?.[id] ?? null,
};

test("escapes HTML", () => {
  assert.equal(
    escapeHtml(`<script>"x" & 'y'</script>`),
    "&lt;script&gt;&quot;x&quot; &amp; &#39;y&#39;&lt;/script&gt;",
  );
});

test("never lets record text through as HTML", () => {
  const html = renderRecord(
    "npcs",
    { name: "x", role: "villain", description: "<img src=x onerror=alert(1)>" },
    context,
  );

  assert.ok(!html.includes("<img"));
  assert.ok(html.includes("&lt;img"));
});

test("renders an NPC with faction, secret and stat blocks", () => {
  const html = renderRecord(
    "npcs",
    {
      name: "Kalvar",
      role: "bbeg",
      factionId: "3",
      description: "A disgraced priest.",
      motive: "A necropolis",
      secret: "He is already dead",
      statBlockReference: { id: "9", name: "Cult Fanatic", citation: "Monster Manual p. 92" },
      monster: { name: "Zombie", slug: "zombie", challengeRating: "1/4" },
    },
    context,
  );

  assert.match(html, /<strong>Role:<\/strong> BBEG/);
  assert.match(html, /The Cult/);
  assert.match(html, /He is already dead/);
  assert.match(html, /Cult Fanatic \(Monster Manual p\. 92\)/);
  assert.match(html, /href="https:\/\/dungeonmaster\.guru\/app\/2024\/monsters\/zombie"/);
});

test("links a book reference to the DM's compendium when it has a Foundry uuid", () => {
  assert.equal(
    referenceLink(context.references[1]),
    "@UUID[Compendium.dnd-dungeon-masters-guide.equipment.Item.abc123]{Bag of Holding}",
  );
  assert.equal(referenceLink(context.references[0]), "Cult Fanatic (Monster Manual p. 92)");
});

test("ignores a Foundry uuid that could break out of the link", () => {
  const html = referenceLink({ name: "Evil", foundryUuid: "x]{y}<b>", citation: "Monster Manual" });

  assert.equal(html, "Evil (Monster Manual)");
});

test("renders a front's clock and portents", () => {
  const html = renderRecord(
    "fronts",
    {
      name: "The Plague",
      npcId: "7",
      clockFilled: 2,
      clockSegments: 6,
      portents: [
        { text: "Villages fall", triggered: true },
        { text: "Walls breached", triggered: false },
      ],
      stakes: [],
    },
    context,
  );

  assert.match(html, /Kalvar the Hollow/);
  assert.match(html, /2 of 6/);
  assert.match(html, /&#9745; Villages fall/);
  assert.match(html, /&#9744; Walls breached/);
});

test("renders a session's eight prep steps with links grouped by step", () => {
  const html = renderRecord(
    "sessions",
    {
      number: 1,
      status: "planned",
      strongStart: "The bells toll",
      scenes: ["Gate fight"],
      links: [
        { linkableType: "CampaignSecret", linkableId: "1", name: "Gravediggers fell first" },
        { linkableType: "Monster", linkableId: "4", name: "Zombie" },
        { linkableType: "CampaignReference", linkableId: "9", name: "Cult Fanatic", detail: "Monster Manual p. 92" },
        { linkableType: "CampaignReference", linkableId: "10", name: "Bag of Holding" },
      ],
    },
    context,
  );

  const step = (heading) => html.split(`<h3>${heading}</h3>`)[1]?.split("<h3>")[0] ?? "";
  assert.match(step("4. Secrets and clues"), /Gravediggers fell first/);
  assert.match(step("7. Relevant monsters"), /Zombie/);
  assert.match(step("7. Relevant monsters"), /Cult Fanatic \(Monster Manual p\. 92\)/);
  assert.doesNotMatch(step("7. Relevant monsters"), /Bag of Holding/);
  assert.match(
    step("8. Treasure"),
    /@UUID\[Compendium\.dnd-dungeon-masters-guide\.equipment\.Item\.abc123\]\{Bag of Holding\}/,
  );
});

test("links SRD monsters and items to the compendium entry of the same name", () => {
  const uuids = {
    "monster:zombie": "Compendium.dnd-monster-manual.actors.Actor.mmZombie00000000",
    "item:rope": "Compendium.dnd5e.equipment24.Item.rope",
  };
  const lookup = { ...context, compendiumUuid: (kind, name) => uuids[`${kind}:${name.toLowerCase()}`] ?? null };
  const html = renderRecord(
    "sessions",
    {
      number: 1,
      status: "planned",
      scenes: [],
      links: [
        { linkableType: "Monster", linkableId: "4", name: "Zombie", detail: "CR 1/4" },
        { linkableType: "Monster", linkableId: "5", name: "Homebrew Horror", detail: "CR 3" },
        { linkableType: "Item", linkableId: "6", name: "Rope" },
      ],
    },
    lookup,
  );

  assert.match(html, /@UUID\[Compendium\.dnd-monster-manual\.actors\.Actor\.mmZombie00000000\]\{Zombie\} \(CR 1\/4\)/);
  assert.match(html, /<li>Homebrew Horror \(CR 3\)<\/li>/);
  assert.match(html, /@UUID\[Compendium\.dnd5e\.equipment24\.Item\.rope\]\{Rope\}/);
});

test("shows a book monster's CR next to its link in session prep", () => {
  const withCr = {
    ...context,
    references: [
      { id: "11", name: "Ghoul", category: "monster", challengeRating: "1", foundryUuid: "Compendium.x.Actor.ghoul" },
    ],
  };
  const html = renderRecord(
    "sessions",
    {
      number: 1,
      status: "planned",
      scenes: [],
      links: [{ linkableType: "CampaignReference", linkableId: "11", name: "Ghoul" }],
    },
    withCr,
  );

  assert.match(html, /@UUID\[Compendium\.x\.Actor\.ghoul\]\{Ghoul\} \(CR 1\)/);
});

test("lists book equipment with the treasure", () => {
  const withGear = {
    ...context,
    references: [{ id: "12", name: "Spyglass", category: "equipment", foundryUuid: "Compendium.x.Item.spyglass" }],
  };
  const html = renderRecord(
    "sessions",
    {
      number: 1,
      status: "planned",
      scenes: [],
      links: [{ linkableType: "CampaignReference", linkableId: "12", name: "Spyglass" }],
    },
    withGear,
  );

  assert.match(html.split("<h3>8. Treasure</h3>")[1], /\{Spyglass\}/);
});

test("links an NPC's SRD stat block to the compendium when it can", () => {
  const html = renderRecord(
    "npcs",
    { name: "Gate guard", role: "neutral", monster: { name: "Guard", slug: "guard", challengeRating: "1/8" } },
    { ...context, compendiumUuid: () => "Compendium.dnd5e.actors24.Actor.guard" },
  );

  assert.match(html, /@UUID\[Compendium\.dnd5e\.actors24\.Actor\.guard\]\{Guard\} \(CR 1\/8\)/);
  assert.doesNotMatch(html, /dungeonmaster\.guru/);
});

test("makes no compendium link from an unsafe uuid", () => {
  assert.equal(compendiumLink("x]{y}", "Evil"), null);
  assert.equal(compendiumLink(null, "Nothing"), null);
  assert.equal(compendiumLink("Compendium.x.Actor.a", "Odd}Name"), "@UUID[Compendium.x.Actor.a]{OddName}");
});

test("lists a local campaign's party as actor links", () => {
  const html = renderRecord(
    "campaign",
    { name: "Zombie Siege", partyActorUuids: ["Actor.akra000000000000", "Actor.gone"] },
    { ...context, actorName: (uuid) => (uuid === "Actor.akra000000000000" ? "Akra" : null) },
  );

  assert.match(html, /<h3>The party<\/h3>/);
  assert.match(html, /@UUID\[Actor\.akra000000000000\]\{Akra\}/);
  assert.match(html, /@UUID\[Actor\.gone\]\{Character\}/);
});

test("renders a revealed secret with its session", () => {
  const html = renderRecord(
    "secrets",
    { text: "The crypt", revelation: "Source", revealed: true, revealedSessionId: "5" },
    context,
  );

  assert.match(html, /Revealed in Session 1/);
});

test("draws a clock with filled and empty segments", () => {
  const svg = clockSvg(4, 1, 40);

  assert.equal((svg.match(/dlcp-clock-filled/g) ?? []).length, 1);
  assert.equal((svg.match(/dlcp-clock-empty/g) ?? []).length, 3);
  assert.match(svg, /aria-label="1 of 4 segments filled"/);
});

test("writes coins biggest first, leaving out the empty ones", () => {
  assert.equal(currencyText({ sp: 30, gp: 150, cp: 0 }), "150 gp, 30 sp");
  assert.equal(currencyText({}), "");
  assert.equal(currencyText(null), "");
});

test("links a place's map and an NPC's actor", () => {
  const place = renderRecord(
    "locations",
    { name: "Pass", foundrySceneUuid: "Scene.QdI6Ix83ypmPq4lc", foundrySceneName: "Mountain Pass" },
    context,
  );
  assert.match(place, /<strong>Map:<\/strong> @UUID\[Scene\.QdI6Ix83ypmPq4lc\]\{Mountain Pass\}/);

  const npc = renderRecord(
    "npcs",
    { name: "Kalvar", role: "bbeg", foundryActorUuid: "Actor.kalvar0000000000", foundryActorName: "Cult Fanatic" },
    context,
  );
  assert.match(npc, /<strong>Stat block:<\/strong> @UUID\[Actor\.kalvar0000000000\]\{Cult Fanatic\}/);
});

test("shows a session's maps, coins and item quantities", () => {
  const withGem = {
    ...context,
    references: [{ id: "g1", name: "Ruby", category: "magic_item", foundryUuid: "Compendium.x.Item.ruby" }],
    recordOf: (collection, id) =>
      collection === "locations" && id === "l1"
        ? { foundrySceneUuid: "Scene.QdI6Ix83ypmPq4lc", foundrySceneName: "Mountain Pass" }
        : collection === "npcs" && id === "n1"
          ? { foundryActorUuid: "Actor.kalvar0000000000", foundryActorName: "Cult Fanatic" }
          : null,
  };
  const html = renderRecord(
    "sessions",
    {
      number: 1,
      status: "planned",
      scenes: [],
      foundryScenes: [{ uuid: "Scene.WVPcqI82sGV2YrXq", name: "Test Map" }],
      treasureCurrency: { gp: 150 },
      links: [
        { linkableType: "CampaignLocation", linkableId: "l1", name: "The Pass" },
        { linkableType: "CampaignNpc", linkableId: "n1", name: "Kalvar", detail: "BBEG" },
        { linkableType: "CampaignReference", linkableId: "g1", name: "Ruby", quantity: 3 },
      ],
    },
    withGem,
  );

  assert.match(html, /The Pass · @UUID\[Scene\.QdI6Ix83ypmPq4lc\]\{Mountain Pass\}/);
  assert.match(html, /<strong>Maps:<\/strong> @UUID\[Scene\.WVPcqI82sGV2YrXq\]\{Test Map\}/);
  assert.match(html, /Kalvar \(BBEG\) · @UUID\[Actor\.kalvar0000000000\]\{Cult Fanatic\}/);
  assert.match(html, /<strong>Coins:<\/strong> 150 gp/);
  assert.match(html, /\{Ruby\} ×3/);
});

test("renders a quest's maps, NPCs, monsters and reward", () => {
  const quest = {
    name: "Clear the crypt",
    kind: "side",
    status: "active",
    giverNpcId: "7",
    locationId: "2",
    description: "Something stirs below the chapel.",
    reward: "The temple's favour",
    rewardCurrency: { gp: 250, sp: 40 },
    rewardXp: 900,
    milestone: true,
    foundryScenes: [{ uuid: "Scene.QdI6Ix83ypmPq4lc", name: "The Crypt" }],
    links: [
      { linkableType: "CampaignNpc", linkableId: "7", name: "Kalvar the Hollow", detail: "BBEG" },
      { linkableType: "CampaignReference", linkableId: "9", name: "Cult Fanatic" },
      { linkableType: "Monster", linkableId: "m1", name: "Ghoul", detail: "CR 1" },
      { linkableType: "CampaignReference", linkableId: "10", name: "Bag of Holding", quantity: 2 },
      { linkableType: "Item", linkableId: "i1", name: "Rope", quantity: 3 },
    ],
  };
  const html = renderRecord("quests", quest, {
    ...context,
    compendiumUuid: (kind, name) => (kind === "monster" && name === "Ghoul" ? "Compendium.dnd5e.monsters.Actor.ghoul0000000000" : null),
  });

  assert.match(html, /<strong>Type:<\/strong> Side quest/);
  assert.match(html, /<strong>Quest giver:<\/strong> Kalvar the Hollow/);
  assert.match(html, /<h3>Maps<\/h3><p>@UUID\[Scene\.QdI6Ix83ypmPq4lc\]\{The Crypt\}<\/p>/);
  assert.match(html, /<h3>NPCs<\/h3><ul><li>Kalvar the Hollow \(BBEG\)<\/li><\/ul>/);
  assert.match(html, /<h3>Monsters<\/h3><ul><li>@UUID\[Compendium\.dnd5e\.monsters\.Actor\.ghoul0000000000\]\{Ghoul\} \(CR 1\)<\/li><li>Cult Fanatic \(Monster Manual p\. 92\)<\/li><\/ul>/);
  assert.match(html, /<h3>Reward<\/h3><p>The temple&#39;s favour<\/p>/);
  assert.match(html, /<strong>Coins:<\/strong> 250 gp, 40 sp/);
  assert.match(html, /<strong>XP:<\/strong> 900/);
  assert.match(html, /<strong>Milestone:<\/strong> the party levels up when it's done\./);
  assert.match(html, /<li>Rope ×3<\/li>/);
  assert.match(html, /@UUID\[Compendium\.dnd-dungeon-masters-guide\.equipment\.Item\.abc123\]\{Bag of Holding\} ×2/);
});

test("leaves out a quest's empty sections", () => {
  const html = renderRecord("quests", { name: "Find the crypt", kind: "main", status: "available" }, context);

  for (const heading of ["Maps", "NPCs", "Monsters", "Reward"]) assert.ok(!html.includes(`<h3>${heading}</h3>`), heading);
});

const without = (...keys) => ({ ...ALL_ON, ...Object.fromEntries(keys.map((key) => [key, false])) });

test("shows the truths on the Overview page unless they're switched off", () => {
  const campaign = { name: "Zombie Siege", pitch: "Survive", truths: ["The dead walk"] };

  assert.match(renderRecord("campaign", campaign, context), /Truths of the setting.*The dead walk/);
  const html = renderRecord("campaign", campaign, { ...context, techniques: without("truths") });
  assert.doesNotMatch(html, /Truths of the setting|The dead walk/);
  assert.match(html, /Survive/);
});

test("leaves a threat's clock or portents off its page when they're switched off", () => {
  const front = {
    name: "The Plague",
    goal: "Spread",
    clockFilled: 2,
    clockSegments: 6,
    portents: [{ text: "Villages fall", triggered: true }],
    stakes: [],
  };

  const noClock = renderRecord("fronts", front, { ...context, techniques: without("clocks") });
  assert.doesNotMatch(noClock, /Clock:|2 of 6/);
  assert.match(noClock, /Villages fall/);
  const noPortents = renderRecord("fronts", front, { ...context, techniques: without("portents") });
  assert.doesNotMatch(noPortents, /Grim portents|Villages fall/);
  assert.match(noPortents, /2 of 6/);
  assert.match(noPortents, /Spread/);
});

test("numbers a session's prep in seven steps without secrets and clues", () => {
  const session = {
    number: 1,
    status: "planned",
    strongStart: "The bells toll",
    links: [
      { linkableType: "CampaignSecret", linkableId: "1", name: "Gravediggers fell first" },
      { linkableType: "Monster", linkableId: "4", name: "Zombie" },
    ],
  };

  const html = renderRecord("sessions", session, { ...context, techniques: without("secrets") });
  assert.doesNotMatch(html, /Secrets and clues|Gravediggers/);
  assert.match(html, /<h3>6\. Relevant monsters<\/h3><ul><li>Zombie/);
  assert.doesNotMatch(html, /<h3>[78]\. /);
  assert.match(html, /<h3>2\. Strong start<\/h3>/);
  assert.match(renderRecord("sessions", session, context), /<h3>4\. Secrets and clues<\/h3>/);
});

test("credits a technique's sources with links that open in a new tab", () => {
  const html = creditHtml(["threats", "clocks"]);

  assert.match(html, /^<p class="dlcp-credit">Learn more: /);
  assert.match(
    html,
    /<a href="https:\/\/roll20\.net\/compendium\/BITD\/Progress%20clocks" target="_blank" rel="noopener">Progress clocks<\/a> \(Blades in the Dark\)/,
  );
  assert.equal((html.match(/target="_blank" rel="noopener"/g) ?? []).length, 3);
  assert.match(creditHtml(["dontPrepPlots", "sandbox"]), /Don&#39;t Prep Plots/);
  assert.match(creditHtml(["oneShot"], ALL_ON, { inline: true }), /^<span class="dlcp-credit">.*<\/span>$/);
});

test("credits nothing for a technique that's switched off", () => {
  assert.equal(creditHtml(["truths"], without("truths")), "");
  assert.doesNotMatch(creditHtml(["threats", "clocks"], without("clocks")), /Progress clocks/);
  assert.equal(creditHtml([]), "");
});
