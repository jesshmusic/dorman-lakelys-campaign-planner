import { escapeHtml } from "../render.mjs";
import { MODULE_ID } from "../constants.mjs";
import { ADVENTURE_PACK, describeContents, describeMissing, listText } from "../adventure.mjs";

const list = (items) => `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;

/**
 * Asks, then exports the open campaign as a Foundry Adventure in this world's
 * Campaign Planner Adventures compendium, and says what went in. GM only.
 * Used by the Campaign Planner.
 * @returns {Promise<boolean>} true when exported
 */
export async function exportAdventure() {
  const sync = game.modules.get(MODULE_ID).api.sync;
  if (!game.user.isGM) {
    ui.notifications.warn("Only a GM can export the campaign.");
    return false;
  }
  if (!sync.linked) {
    ui.notifications.info("Open a campaign first, then export it.");
    return false;
  }

  let contents;
  let previous;
  try {
    contents = sync.adventureContents();
    previous = await sync.previousExport(contents.campaign.uuid);
  } catch (error) {
    ui.notifications.error(`Couldn't export the campaign: ${error.message}`);
    return false;
  }
  const name = contents.campaign.name ?? sync.linked.name;
  const pages = contents.entries.reduce((total, entry) => total + entry.pages.size, 0);
  const included = describeContents({
    entries: contents.entries.length,
    pages,
    scenes: contents.scenes.length,
    actors: contents.actors.length,
    items: contents.items.length,
    tables: contents.tables.length,
  });
  const missing = describeMissing(contents.missing);
  const exportedAt = previous && foundry.utils.getProperty(previous, `flags.${MODULE_ID}.exportedAt`);
  const notes = [
    "Compendium entries stay as links.",
    contents.leftOut ? "Players' characters stay out." : "",
    missing ? `${missing} the campaign uses can't be found in this world, so they're left out.` : "",
  ].filter(Boolean);

  const confirmed = await foundry.applications.api.DialogV2.confirm({
    window: { title: "Export as Adventure", icon: "fas fa-box-archive" },
    position: { width: 520 },
    content: `<p>Export <strong>${escapeHtml(name)}</strong> as an Adventure in the
        <strong>${escapeHtml(ADVENTURE_PACK.label)}</strong> compendium? Foundry's Adventure importer can then bring it
        into a world. It takes:</p>
      ${list([
        `the journals in the ${contents.folder.name} folder: ${included[0]}`,
        ...(included.length > 1 ? [`${listText(included.slice(1))} from this world that it uses`] : []),
      ])}
      <p class="dlcp-muted">${escapeHtml(notes.join(" "))}</p>
      <p>Imported, it's a campaign that lives in that world: open it with <strong>Switch</strong> at the top of the Journal
        sidebar, no Dungeon Master Guru account needed.${sync.isLocal ? "" : " This world keeps syncing as before."}</p>
      ${
        previous
          ? `<p>This replaces its earlier export${exportedAt ? ` from ${escapeHtml(new Date(exportedAt).toLocaleString())}` : ""}.</p>`
          : ""
      }`,
    yes: { label: "Export", icon: "fas fa-box-archive" },
    no: { label: "Cancel" },
  });
  if (!confirmed) return false;

  ui.notifications.info(`Exporting ${name}…`);
  let result;
  try {
    result = await sync.exportAdventure(contents);
  } catch (error) {
    ui.notifications.error(`Couldn't export ${name}: ${error.message}`);
    return false;
  }
  const { pack, counts, replaced } = result;
  await foundry.applications.api.DialogV2.prompt({
    window: { title: "Exported as an Adventure", icon: "fas fa-check" },
    position: { width: 480 },
    content: `<p><strong>${escapeHtml(name)}</strong> is in the <strong>${escapeHtml(pack.title)}</strong> compendium${
      replaced ? ", replacing its earlier export" : ""
    }, with ${escapeHtml(listText(describeContents(counts)))}.</p>
      ${missing ? `<p class="dlcp-muted">Left out because they're gone from this world: ${escapeHtml(missing)}.</p>` : ""}
      <p>To bring it into a world, open the adventure in the compendium and click <strong>Import Adventure</strong>.
        A world compendium stays with its world: to use it in another one, share the compendium in a module.</p>`,
    ok: {
      label: "Open the compendium",
      icon: "fas fa-book-atlas",
      callback: () => pack.render(true),
    },
    rejectClose: false,
  });
  return true;
}
