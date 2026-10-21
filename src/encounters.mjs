// A quest's encounters: the fights, talks, traps and puzzles it's made of,
// each with its monsters (and how many), the NPCs in it, its own maps and its
// own reward. Also moving the monsters a quest had before encounters into one.
// No Foundry globals, so it can be tested in Node.

import { ENCOUNTER_KINDS, newRecord } from "./local.mjs";
import { coinsFrom, setLinkQuantity, setLinks } from "./planner.mjs";
import { isItemLink, isMonsterLink, itemLinks, monsterLinks, referenceOf } from "./link-kinds.mjs";

export { ENCOUNTER_KINDS };

const MAX_NAME = 120;
const MAX_XP = 1000000;
// The name of the encounter a quest's monsters move into
export const FIRST_ENCOUNTER = "Encounter";

const text = (value) => {
  const trimmed = String(value ?? "").trim();
  return trimmed === "" ? null : trimmed;
};

export { isItemLink, isMonsterLink, itemLinks, monsterLinks };

/** A quest's encounters, in order */
export const encountersOf = (encounters, questId) =>
  [...(encounters ?? [])]
    .filter((encounter) => String(encounter.questId) === String(questId))
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));

// Links numbered in their order
const numbered = (links) => links.map((link, position) => ({ ...link, position }));

/**
 * What moving the monsters quests had before encounters takes: each quest
 * with monster links loses them, and gets an encounter "Encounter" (combat,
 * first) with them, their counts kept. Quests without monsters are left
 * alone, so planning it again finds nothing to do; and a quest whose
 * monsters are already all in one of its encounters (a move that stopped
 * partway) just loses them.
 * @param {{ quests?: object[], encounters?: object[], references?: object[] }} store
 * @param {{ id: () => string }} options id makes a new unique id
 * @returns {{ quests: object[], encounters: object[] }} the quests to save, and the encounters to add
 */
export function planQuestEncounters(store, { id }) {
  const quests = [];
  const encounters = [];
  const key = (link) => `${link.linkableType}:${link.linkableId}`;
  for (const quest of store.quests ?? []) {
    const monsters = monsterLinks(quest, store.references);
    if (!monsters.length) continue;
    quests.push({ ...quest, links: numbered((quest.links ?? []).filter((link) => !monsters.includes(link))) });
    const moved = encountersOf(store.encounters, quest.id).some((encounter) => {
      const has = new Set((encounter.links ?? []).map(key));
      return monsters.every((link) => has.has(key(link)));
    });
    if (moved) continue;
    const encounter = newRecord(
      "encounters",
      { questId: quest.id, name: FIRST_ENCOUNTER, kind: "combat", links: numbered(monsters) },
      { id, existing: [] },
    );
    encounters.push({ ...encounter, position: 0 });
  }
  return { quests, encounters };
}

/**
 * The monsters a quest still has from before encounters, shown as one
 * encounter until they move into a real one (a synced campaign's do when
 * Dungeon Master Guru moves them): { name, kind, links }, or null.
 */
export function legacyEncounter(quest, references) {
  const links = monsterLinks(quest, references);
  return links.length ? { name: FIRST_ENCOUNTER, kind: "combat", links, legacy: true } : null;
}

/**
 * One encounter's values from the quest plan's form, where each of its
 * fields is named "enc.<id>.<field>": { name, kind, coin_gp, qty_<link>, ... }
 */
export function encounterValues(values, encounterId) {
  const prefix = `enc.${encounterId}.`;
  return Object.fromEntries(
    Object.entries(values)
      .filter(([key]) => key.startsWith(prefix))
      .map(([key, value]) => [key.slice(prefix.length), value]),
  );
}

/**
 * An encounter after its card in the quest plan is saved, or { error }: its
 * name, type, description and notes, its reward's coins (coin_pp, ...) and
 * XP, how many of each monster and item (qty_<link id>), and its NPCs.
 * @param {object} encounter
 * @param {Record<string, string>} values the card's values (see encounterValues)
 * @param {{ npcIds?: string[], npcs?: object[], id?: () => string }} options npcIds: the NPCs ticked, when the card has them
 */
export function applyEncounter(encounter, values, { npcIds, npcs = [], id } = {}) {
  const label = text(encounter.name) ?? "An encounter";
  const fail = (message) => ({ error: `${label}: ${message}` });
  const name = text(values.name);
  if (!name) return fail("the name is required.");
  if (name.length > MAX_NAME) return fail(`the name can be at most ${MAX_NAME} characters.`);
  const { coins, error } = coinsFrom(values);
  if (error) return fail(error);
  const xpText = String(values.rewardXp ?? "").trim();
  const xp = xpText === "" ? null : Number(xpText);
  if (xp !== null && (!Number.isInteger(xp) || xp < 0 || xp > MAX_XP)) {
    return fail(`XP must be a whole number from 0 to ${MAX_XP.toLocaleString("en")}.`);
  }
  let record = {
    ...encounter,
    name,
    kind: ENCOUNTER_KINDS.includes(values.kind) ? values.kind : (encounter.kind ?? "combat"),
    description: text(values.description),
    notes: "notes" in values ? text(values.notes) : (encounter.notes ?? null),
    rewardCurrency: coins,
    rewardXp: xp,
  };
  for (const [key, value] of Object.entries(values)) {
    if (!key.startsWith("qty_")) continue;
    const result = setLinkQuantity(record, key.slice(4), value);
    if (result.error) return fail(result.error);
    record = result.record;
  }
  // Ticking the same NPCs leaves the links as they are, in their order
  const linked = (record.links ?? []).filter((link) => link.linkableType === "CampaignNpc").map((link) => link.linkableId);
  const same = npcIds && npcIds.length === linked.length && npcIds.every((npcId) => linked.includes(npcId));
  if (npcIds && !same) record = setLinks(record, "npcs", npcIds, npcs, id);
  return { record };
}

/**
 * A quest's encounters with one moved up (-1) or down (+1), numbered in
 * their new order. Only the ones whose place changed need saving.
 * @param {object[]} encounters the quest's encounters
 */
export function moveEncounter(encounters, encounterId, delta) {
  const ordered = encountersOf(encounters, encounters[0]?.questId);
  const from = ordered.findIndex((encounter) => encounter.id === encounterId);
  const to = from + delta;
  if (from !== -1 && to >= 0 && to < ordered.length) [ordered[from], ordered[to]] = [ordered[to], ordered[from]];
  return ordered.map((encounter, position) => ({ ...encounter, position }));
}

/** A record with one of its links (by the link's id) removed */
export const withoutLink = (owner, linkId) => ({
  ...owner,
  links: numbered((owner.links ?? []).filter((link) => link.id !== linkId)),
});

/**
 * A record linked to one more book reference (a monster, item or table),
 * added at the end so the others keep their order; a reference it already
 * links to stays once.
 * @param {object[]} references every book reference in the campaign, with this one
 * @param {() => string} id makes the new link's id
 */
export function withReference(owner, referenceId, references, id) {
  const links = owner.links ?? [];
  if (links.some((link) => link.linkableType === "CampaignReference" && link.linkableId === referenceId)) return owner;
  const reference = referenceOf(references, referenceId);
  if (!reference) return owner;
  const key = id();
  const link = {
    id: key,
    uuid: key,
    linkableType: "CampaignReference",
    linkableId: referenceId,
    name: reference.name,
    slug: null,
    detail: reference.citation ?? null,
    position: links.length,
    quantity: null,
  };
  return { ...owner, links: numbered([...links, link]) };
}

// A quest's place among the Quests journal's pages: main quests by act, then side quests
export const questSort = (quest) =>
  (quest?.kind === "main" ? 0 : 100000) + (quest?.act ?? 99) * 1000 + (quest?.position ?? 0);

/** An encounter's place among the Encounters journal's pages: by quest, then in the quest's order */
export const encounterSort = (encounter, quest) =>
  (quest ? questSort(quest) : 999999) * 100 + Math.min(Math.max(encounter.position ?? 0, 0), 99);
