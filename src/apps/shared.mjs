// Pieces the Campaign Planner and the Campaign Dashboard both show: content
// links, Dungeon Master Guru monsters (with Import into this world), random
// encounter tables to roll on, and handouts to show the players.
import { escapeHtml } from "../render.mjs";
import { monsterImportError, monsterLinkState } from "../homebrew.mjs";

/** A Foundry content link: click to open it, or drag it onto a scene or a sheet */
export const contentLink = (uuid, name, icon) =>
  `<a class="content-link" draggable="true" data-uuid="${escapeHtml(uuid)}" data-link><i class="fas fa-${icon}"></i>${escapeHtml(name)}</a>`;

/**
 * One of Dungeon Master Guru's monsters: a link to the compendium entry of
 * the same name, or to the actor imported for it; or else, for a synced
 * campaign in a connected browser, its name and an Import into this world
 * button; or else just its name.
 * @param {object} sync the CampaignSync
 * @param {{ id: string, name: string }} monster
 * @param {(kind: string, name: string) => string|null} [lookup] sync.compendiumUuid(), made once for a whole window
 */
export function monsterHtml(sync, monster, lookup = sync.compendiumUuid()) {
  const state = monsterLinkState(monster, {
    compendiumUuid: lookup,
    importedUuid: (id) => sync.monsterActorUuid(id),
    canImport: sync.canImportMonsters,
  });
  if (state.uuid) return contentLink(state.uuid, monster.name, "user");
  const name = escapeHtml(monster.name);
  if (!state.importId) return name;
  return `${name} <button type="button" class="dlcp-link-button dlcp-import" data-action="importMonster" data-monster-id="${escapeHtml(state.importId)}"
    data-tooltip="Make an actor of its stat block, in the Dungeon Master Guru folder of the Actors directory"><i class="fas fa-file-import"></i> Import into this world</button>`;
}

/** Imports a Dungeon Master Guru monster as an actor, saying how it went */
export async function importMonster(sync, monsterId, button) {
  if (!monsterId) return null;
  if (button) button.disabled = true;
  try {
    const actor = await sync.importMonster(monsterId);
    ui.notifications.info(`Imported ${actor?.name ?? "the monster"} into the Dungeon Master Guru folder of the Actors directory.`);
    return actor;
  } catch (error) {
    console.warn("Dorman Lakely's Campaign Planner | Could not import the monster", error);
    ui.notifications.error(`Couldn't import the monster: ${monsterImportError(error)}`);
    if (button?.isConnected) button.disabled = false;
    return null;
  }
}

/** A place's random encounter tables, each a link with a Roll button (and, in the planner, a remove button) */
export function rollTablesHtml(location, { remove = false } = {}) {
  const tables = location.rollTables ?? [];
  if (!tables.length) return "";
  return `<ul class="dlcp-list dlcp-tables">${tables
    .map(
      (table) => `<li><span class="dlcp-grow">${contentLink(table.uuid, table.name, "table-list")}</span>
        <button type="button" data-action="rollTable" data-uuid="${escapeHtml(table.uuid)}" data-tooltip="Roll on it. Only GMs see the result."><i class="fas fa-dice-d20"></i> Roll</button>
        ${remove ? `<button type="button" class="dlcp-link-button" data-action="removeRollTable" data-location="${escapeHtml(location.uuid)}" data-uuid="${escapeHtml(table.uuid)}" aria-label="Remove ${escapeHtml(table.name)}">remove</button>` : ""}</li>`,
    )
    .join("")}</ul>`;
}

/** Draws from a roll table for the GMs only: the result is whispered to them */
export async function rollTable(uuid) {
  const table = uuid ? await fromUuid(uuid) : null;
  if (table?.documentName !== "RollTable") return ui.notifications.warn("That roll table isn't in this world any more.");
  try {
    await table.draw({ messageMode: "gm" });
  } catch (error) {
    ui.notifications.error(`Couldn't roll on ${table.name}: ${error.message}`);
  }
}

/** Opens Foundry's Show to Players dialog for a handout (a journal entry or page) */
export async function showHandout(uuid) {
  const document = uuid ? await fromUuid(uuid) : null;
  if (!["JournalEntry", "JournalEntryPage"].includes(document?.documentName)) {
    return ui.notifications.warn("That handout isn't in this world any more.");
  }
  return foundry.documents.collections.Journal.showDialog(document);
}
