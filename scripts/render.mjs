// Journal page HTML for each kind of Dungeon Master Guru record. No Foundry
// globals, so it can be tested in Node. Every value from the server is escaped.

export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

// Plain text with line breaks kept
const text = (value) => escapeHtml(value).replaceAll("\n", "<br>");

const section = (title, body) => (body ? `<h3>${escapeHtml(title)}</h3>${body}` : "");
const para = (value) => (value ? `<p>${text(value)}</p>` : "");
const list = (items) =>
  items && items.length ? `<ul>${items.map((item) => `<li>${text(item)}</li>`).join("")}</ul>` : "";
const fact = (label, value) => (value ? `<p><strong>${escapeHtml(label)}:</strong> ${text(value)}</p>` : "");

export const NPC_ROLES = {
  bbeg: "BBEG",
  villain: "Villain",
  lieutenant: "Lieutenant",
  ally: "Ally",
  patron: "Patron",
  neutral: "Neutral",
};

const QUEST_STATUSES = { available: "Available", active: "Active", completed: "Completed", failed: "Failed" };
const SESSION_STATUSES = { planned: "Planned", prepped: "Prepped", played: "Played" };

/**
 * A Foundry content link for a compendium entry, or the citation as text.
 * @param {{ name: string, citation?: string, foundryUuid?: string|null }} reference
 */
export function referenceLink(reference) {
  const link = compendiumLink(reference.foundryUuid, reference.name);
  if (link) return link;
  return reference.citation
    ? `${escapeHtml(reference.name)} (${escapeHtml(reference.citation)})`
    : escapeHtml(reference.name);
}

// Compendium UUIDs look like Compendium.dnd-monster-manual.actors.Actor.abc123
const SAFE_UUID = /^[\w.-]+$/;

/** A Foundry content link: it opens the entry, or drag it onto a scene to place a token */
export function compendiumLink(uuid, name) {
  if (!uuid || !SAFE_UUID.test(uuid)) return null;
  return `@UUID[${uuid}]{${escapeHtml(name).replaceAll("}", "")}}`;
}

const COINS = ["pp", "gp", "ep", "sp", "cp"];

/** Coins as one line, biggest first: { gp: 150, sp: 30 } -> "150 gp, 30 sp" */
export function currencyText(currency) {
  return COINS.filter((coin) => Number(currency?.[coin]) > 0)
    .map((coin) => `${Number(currency[coin])} ${coin}`)
    .join(", ");
}

// A line with a label and a link (or other markup that's already safe)
const linkFact = (label, html) => (html ? `<p><strong>${escapeHtml(label)}:</strong> ${html}</p>` : "");

const MONSTER_CATEGORIES = ["monster"];
// Anything that isn't a monster: what session prep and quest plans list as treasure
const TREASURE_CATEGORIES = ["magic_item", "equipment", "table", "spell", "other"];

/**
 * Lists a session's or quest's links: a book entry links to its compendium
 * entry (with how many), a place shows its map, an NPC their actor, and
 * Dungeon Master Guru's SRD monsters and items link to the compendium entry
 * of the same name.
 */
function linkLists(owner, { references = [], compendiumUuid, recordOf }) {
  const withDetail = (html, detail) => (detail ? `${html} (${escapeHtml(detail)})` : html);
  const line = (link) => {
    if (link.linkableType === "CampaignReference") {
      const reference = references.find((r) => r.id === link.linkableId);
      if (!reference) return text(link.name);
      const quantity = link.quantity > 1 ? ` ×${escapeHtml(link.quantity)}` : "";
      return withDetail(`${referenceLink(reference)}${quantity}`, reference.challengeRating && `CR ${reference.challengeRating}`);
    }
    if (link.linkableType === "CampaignLocation" || link.linkableType === "CampaignNpc") {
      const record = recordOf?.(link.linkableType === "CampaignLocation" ? "locations" : "npcs", link.linkableId);
      const extra =
        link.linkableType === "CampaignLocation"
          ? compendiumLink(record?.foundrySceneUuid, record?.foundrySceneName ?? "Map")
          : compendiumLink(record?.foundryActorUuid, record?.foundryActorName ?? link.name);
      return `${withDetail(escapeHtml(link.name), link.detail)}${extra ? ` · ${extra}` : ""}`;
    }
    const kind = { Monster: "monster", Item: "item" }[link.linkableType];
    const uuid = kind && compendiumUuid?.(kind, link.name);
    const quantity = link.quantity > 1 ? ` ×${escapeHtml(link.quantity)}` : "";
    return withDetail(`${compendiumLink(uuid, link.name) ?? escapeHtml(link.name)}${quantity}`, link.detail);
  };
  const of = (...types) => (owner.links ?? []).filter((link) => types.includes(link.linkableType));
  const books = (categories) =>
    of("CampaignReference").filter((link) => categories.includes(references.find((r) => r.id === link.linkableId)?.category));
  const list = (links) => (links.length ? `<ul>${links.map((l) => `<li>${line(l)}</li>`).join("")}</ul>` : "");
  return {
    of: (...types) => list(of(...types)),
    monsters: () => list([...of("Monster"), ...books(MONSTER_CATEGORIES)]),
    treasure: () => list([...of("Item"), ...books(TREASURE_CATEGORIES)]),
  };
}

// Scenes as content links: click one to view it, or drag it
const mapLinks = (scenes) =>
  (scenes ?? [])
    .map((scene) => compendiumLink(scene.uuid, scene.name))
    .filter(Boolean)
    .join(", ");

/**
 * Renders a record as journal page HTML.
 * @param {string} collection e.g. "npcs"
 * @param {object} record the record JSON from the API
 * @param {{ baseUrl: string, nameOf: (collection: string, id: string|null) => string|null, references: object[], compendiumUuid?: (kind: "monster"|"item", name: string) => string|null }} context
 */
export function renderRecord(collection, record, context) {
  const renderer = RENDERERS[collection];
  return renderer ? renderer(record, context) : para(JSON.stringify(record));
}

const RENDERERS = {
  campaign: (c, { actorName } = {}) =>
    [
      fact("Setting", c.settingName),
      fact("Tone", c.tone),
      section(
        "The party",
        (c.partyActorUuids ?? []).length
          ? `<ul>${c.partyActorUuids
              .map((uuid) => `<li>${compendiumLink(uuid, actorName?.(uuid) ?? "Character") ?? ""}</li>`)
              .join("")}</ul>`
          : "",
      ),
      section("Premise", para(c.premise)),
      section("Pitch for the players", para(c.pitch)),
      section("Truths of the setting", list(c.truths)),
      section("Setting notes", para(c.settingNotes)),
    ].join(""),

  npcs: (npc, { baseUrl, nameOf, compendiumUuid }) => {
    const statBlocks = [];
    const actorLink = compendiumLink(npc.foundryActorUuid, npc.foundryActorName ?? npc.name);
    if (actorLink) statBlocks.push(actorLink);
    if (npc.statBlockReference) statBlocks.push(referenceLink(npc.statBlockReference));
    const monsterLink = npc.monster && compendiumLink(compendiumUuid?.("monster", npc.monster.name), npc.monster.name);
    if (monsterLink) {
      statBlocks.push(`${monsterLink} (CR ${escapeHtml(npc.monster.challengeRating)})`);
    } else if (npc.monster) {
      const url = `${baseUrl}/app/2024/monsters/${encodeURIComponent(npc.monster.slug)}`;
      statBlocks.push(
        `<a href="${escapeHtml(url)}" target="_blank" rel="noopener">${escapeHtml(npc.monster.name)} (CR ${escapeHtml(
          npc.monster.challengeRating,
        )})</a>`,
      );
    }
    return [
      fact("Role", NPC_ROLES[npc.role] ?? npc.role),
      fact("Faction", nameOf("factions", npc.factionId)),
      para(npc.description),
      fact("Wants", npc.motive),
      fact("Appearance", npc.appearance),
      fact("Voice", npc.voice),
      section("Secret", para(npc.secret)),
      statBlocks.length ? `<p><strong>Stat block:</strong> ${statBlocks.join(" · ")}</p>` : "",
      section("Notes", para(npc.notes)),
    ].join("");
  },

  locations: (location, { nameOf }) =>
    [
      fact("Inside", nameOf("locations", location.parentId)),
      linkFact("Map", compendiumLink(location.foundrySceneUuid, location.foundrySceneName ?? "Map")),
      para(location.description),
      section("Fantastic features", list(location.features)),
      section("Notes", para(location.notes)),
    ].join(""),

  factions: (faction) =>
    [fact("Goal", faction.goal), para(faction.description), section("Notes", para(faction.notes))].join(""),

  fronts: (front, { nameOf }) =>
    [
      fact("Led by", nameOf("npcs", front.npcId)),
      fact("Faction", nameOf("factions", front.factionId)),
      fact("Goal", front.goal),
      `<p><strong>Clock:</strong> ${front.clockFilled} of ${front.clockSegments}</p>`,
      section(
        "Grim portents",
        front.portents?.length
          ? `<ul>${front.portents
              .map((p) => `<li>${p.triggered ? "&#9745;" : "&#9744;"} ${text(p.text)}</li>`)
              .join("")}</ul>`
          : "",
      ),
      fact("Impending doom", front.doom),
      section("Stakes", list(front.stakes)),
      section("Notes", para(front.description)),
    ].join(""),

  quests: (quest, context) => {
    const { nameOf } = context;
    const links = linkLists(quest, context);
    const maps = mapLinks(quest.foundryScenes);
    return [
      fact("Type", quest.kind === "main" ? "Main quest" : "Side quest"),
      fact("Status", QUEST_STATUSES[quest.status] ?? quest.status),
      fact("Act", quest.act),
      fact(
        "Levels",
        quest.levelMin && quest.levelMax ? `${quest.levelMin}–${quest.levelMax}` : (quest.levelMin ?? quest.levelMax),
      ),
      fact("Quest giver", nameOf("npcs", quest.giverNpcId)),
      fact("Where", nameOf("locations", quest.locationId)),
      fact("Part of", nameOf("quests", quest.parentId)),
      para(quest.description),
      section("Maps", maps ? `<p>${maps}</p>` : ""),
      section("NPCs", links.of("CampaignNpc")),
      section("Monsters", links.monsters()),
      section(
        "Reward",
        para(quest.reward) +
          fact("Coins", currencyText(quest.rewardCurrency)) +
          fact("XP", quest.rewardXp) +
          (quest.milestone ? "<p><strong>Milestone:</strong> the party levels up when it's done.</p>" : "") +
          links.treasure(),
      ),
      section("Notes", para(quest.notes)),
    ].join("");
  },

  secrets: (secret, { nameOf }) =>
    [
      fact("Points to", secret.revelation),
      para(secret.text),
      `<p><em>${secret.revealed ? `Revealed${secret.revealedSessionId ? ` in ${escapeHtml(nameOf("sessions", secret.revealedSessionId) ?? "a session")}` : ""}` : "Not revealed yet"}</em></p>`,
    ].join(""),

  sessions: (session, context) => {
    const links = linkLists(session, context);
    return [
      fact("Status", SESSION_STATUSES[session.status] ?? session.status),
      fact("Date", session.scheduledOn),
      fact("Party level", session.level),
      section("1. Review the characters", para(session.characterNotes)),
      section("2. Strong start", para(session.strongStart)),
      section("3. Potential scenes", list(session.scenes)),
      section("4. Secrets and clues", links.of("CampaignSecret")),
      section("5. Fantastic locations", links.of("CampaignLocation") + linkFact("Maps", mapLinks(session.foundryScenes))),
      section("6. Important NPCs", links.of("CampaignNpc")),
      section("7. Relevant monsters", links.monsters()),
      section(
        "8. Treasure",
        para(session.treasure) + fact("Coins", currencyText(session.treasureCurrency)) + links.treasure(),
      ),
      section("Session log", para(session.log)),
      section("Recap", para(session.recap)),
    ].join("");
  },

  references: (reference) =>
    [
      `<p>${referenceLink(reference)}</p>`,
      fact("Challenge rating", reference.challengeRating),
      section("Notes", para(reference.notes)),
    ].join(""),
};

/**
 * A Blades in the Dark style progress clock as SVG markup.
 * @param {number} segments
 * @param {number} filled
 * @param {number} size pixel width and height
 */
export function clockSvg(segments, filled, size = 64) {
  const radius = size / 2 - 1;
  const center = size / 2;
  const point = (fraction) => {
    const angle = fraction * 2 * Math.PI - Math.PI / 2;
    return `${(center + radius * Math.cos(angle)).toFixed(2)} ${(center + radius * Math.sin(angle)).toFixed(2)}`;
  };
  const wedges = Array.from({ length: segments }, (_, index) => {
    const path = `M ${center} ${center} L ${point(index / segments)} A ${radius} ${radius} 0 0 1 ${point((index + 1) / segments)} Z`;
    return `<path d="${path}" class="${index < filled ? "dlcp-clock-filled" : "dlcp-clock-empty"}" />`;
  }).join("");
  const label = `${filled} of ${segments} segments filled`;
  return `<svg class="dlcp-clock" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" role="img" aria-label="${label}"><title>${label}</title>${wedges}</svg>`;
}
