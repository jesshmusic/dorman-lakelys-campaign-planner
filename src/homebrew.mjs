// Homebrew monsters, both ways. This world's own monsters (its NPC actors,
// and Actor compendiums that aren't the books') can go into the index sent
// to Dungeon Master Guru, so they're picked there like the books' monsters.
// And a monster made on Dungeon Master Guru, with no compendium entry here,
// can be imported into this world as an actor. No Foundry globals, so it can
// be tested in Node.

import { COMPENDIUM_PACKS, INDEX_FORMAT, entryFromIndex } from "./compendium.mjs";
import { MODULE_ID } from "./constants.mjs";
import { hash } from "./scenes.mjs";

/**
 * This world's own NPC actors, as a homebrew source. Dungeon Master Guru
 * keeps one index for all of a DM's worlds, so the pack is named for the world.
 * @param {{ id: string, title?: string }} world
 */
export const worldActorsSource = (world) => ({
  id: `world-actors.${world?.id ?? "world"}`,
  label: `World actors (${world?.title || world?.id || "this world"})`,
});

/** True for a world's actors as a homebrew source: "world-actors.<world id>" */
export const isWorldActors = (id) => String(id ?? "").startsWith("world-actors.");

/** The Actor folder that monsters imported from Dungeon Master Guru go in */
export const MONSTER_FOLDER = "Dungeon Master Guru";

/**
 * The homebrew sources a GM can choose: this world's actors, then each Actor
 * compendium the index doesn't already have, by name.
 * @param {{ id: string, label: string, documentName: string }[]} packs the world's compendiums
 * @param {{ id: string, title?: string }} world
 * @returns {{ id: string, label: string }[]}
 */
export function homebrewOptions(packs = [], world = {}) {
  const extra = packs
    .filter((pack) => pack.documentName === "Actor" && !COMPENDIUM_PACKS.includes(pack.id) && !isWorldActors(pack.id))
    .map((pack) => ({ id: pack.id, label: String(pack.label || pack.id) }))
    .sort((a, b) => a.label.localeCompare(b.label));
  return [worldActorsSource(world), ...extra];
}

/** The sources chosen, as the setting keeps them: ids, once each */
export const chosenSources = (setting) => [...new Set((Array.isArray(setting) ? setting : []).filter((id) => typeof id === "string" && id))];

/** The sources that were chosen before and aren't now: sent with no entries, so Dungeon Master Guru drops them */
export const droppedSources = (before, after) => {
  const now = new Set(chosenSources(after));
  return chosenSources(before).filter((id) => !now.has(id));
};

/**
 * The world's NPC actors as index entries, built like a compendium's: name,
 * CR and creature type. Player characters stay out, and so do monsters
 * imported from Dungeon Master Guru, which it has already.
 * @param {{ uuid: string, name: string, type: string, system?: object, flags?: object }[]} actors
 * @param {string} [packId] the world's source id (see worldActorsSource)
 */
export function worldActorEntries(actors = [], packId = "world-actors") {
  return actors
    .filter((actor) => actor.type === "npc" && !actor.flags?.[MODULE_ID]?.monsterId)
    .map((actor) => entryFromIndex(packId, "Actor", actor))
    .filter(Boolean)
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** A homebrew pack's version: it changes when its entries do, so an unchanged pack isn't sent again */
export const homebrewVersion = (entries) => `homebrew-${hash(JSON.stringify(entries ?? []))}+${INDEX_FORMAT}`;

/**
 * What POST /v1/foundry/compendium takes for a homebrew pack. Sending it
 * again replaces it; with no entries, Dungeon Master Guru drops it.
 * @param {{ id: string, label: string }} source
 * @param {object[]} entries index entries (see entryFromIndex)
 */
export const homebrewPack = (source, entries = []) => ({
  pack: source.id,
  version: homebrewVersion(entries),
  entries,
  homebrew: true,
  label: source.label || source.id,
});

/**
 * The world actor imported for a Dungeon Master Guru monster, found by the
 * flag it was made with, or null.
 * @param {{ uuid: string, flags?: object }[]} actors the world's actors
 */
export function importedActorUuid(actors, monsterId) {
  if (monsterId === null || monsterId === undefined || monsterId === "") return null;
  const actor = (actors ?? []).find((a) => String(a.flags?.[MODULE_ID]?.monsterId ?? "") === String(monsterId));
  return actor?.uuid ?? null;
}

/**
 * How to show a link to one of Dungeon Master Guru's monsters: as the
 * compendium entry of the same name, or else the actor imported for it, or
 * else with a button to import it (only for a synced campaign, in a browser
 * that's connected), or else by its name.
 * @param {{ id: string|number, name: string }} monster
 * @param {{ compendiumUuid?: (kind: string, name: string) => string|null, importedUuid?: (id: string) => string|null, canImport?: boolean }} options
 * @returns {{ uuid: string, imported?: true } | { importId: string } | {}}
 */
export function monsterLinkState(monster, { compendiumUuid, importedUuid, canImport = false } = {}) {
  const fromCompendium = compendiumUuid?.("monster", monster?.name);
  if (fromCompendium) return { uuid: fromCompendium };
  const id = monster?.id === null || monster?.id === undefined ? "" : String(monster.id);
  const imported = id ? importedUuid?.(id) : null;
  if (imported) return { uuid: imported, imported: true };
  return canImport && id ? { importId: id } : {};
}

/**
 * The new actor's data, from what GET /v1/foundry/monsters/:id returns: the
 * stat block as dnd5e actor data, in the Dungeon Master Guru folder, with
 * the monster's id in its flags so links find it.
 * @param {{ id: string|number, name?: string, actor: object }} monster
 * @param {string|null} folderId
 */
export function monsterActorData(monster, folderId = null) {
  const actor = monster?.actor;
  if (!actor || typeof actor !== "object" || Array.isArray(actor)) {
    throw new Error("Dungeon Master Guru didn't send the monster's stat block.");
  }
  const { _id, folder, sort, ownership, _stats, ...rest } = actor;
  const flags = rest.flags && typeof rest.flags === "object" ? rest.flags : {};
  return {
    ...rest,
    name: String(rest.name || monster.name || "Monster"),
    type: rest.type || "npc",
    folder: folderId,
    flags: { ...flags, [MODULE_ID]: { ...flags[MODULE_ID], monsterId: String(monster.id) } },
  };
}

/** What to tell the GM when a monster couldn't be imported */
export function monsterImportError(error) {
  if (error?.status === 0) return "Couldn't reach Dungeon Master Guru. Check the connection and try again.";
  if (error?.status === 404) return "That monster isn't on Dungeon Master Guru any more.";
  if (error?.status === 401) return "Dungeon Master Guru didn't accept this browser's connection. Connect again.";
  return error?.message || "Something went wrong.";
}
