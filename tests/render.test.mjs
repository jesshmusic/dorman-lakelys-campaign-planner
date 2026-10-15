import { test } from "node:test";
import assert from "node:assert/strict";
import { clockSvg, escapeHtml, referenceLink, renderRecord } from "../scripts/render.mjs";

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
  assert.equal(escapeHtml(`<script>"x" & 'y'</script>`), "&lt;script&gt;&quot;x&quot; &amp; &#39;y&#39;&lt;/script&gt;");
});

test("never lets record text through as HTML", () => {
  const html = renderRecord("npcs", { name: "x", role: "villain", description: "<img src=x onerror=alert(1)>" }, context);

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
  assert.match(step("8. Treasure"), /@UUID\[Compendium\.dnd-dungeon-masters-guide\.equipment\.Item\.abc123\]\{Bag of Holding\}/);
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
