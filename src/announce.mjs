// The welcome and what's-new messages in chat, and the bug report link.
// The changelog is bundled into the build, so the message lists the changes
// that came with the version the GM just installed.
import changelog from "../CHANGELOG.md?raw";
import { MODULE_ID, MODULE_TITLE, SETTINGS } from "./constants.mjs";
import { announcementHtml, announcementKind, bugReportUrl, notesSince, parseChangelog } from "./welcome.mjs";

/**
 * Posts the welcome message on first install, or what's new after a major or
 * minor update, whispered to the GMs. Only the active GM posts, once per
 * world and version.
 */
export async function announce() {
  if (!game.user.isGM || game.users.activeGM?.id !== game.user.id) return;
  const current = game.modules.get(MODULE_ID).version;
  const lastSeen = game.settings.get(MODULE_ID, SETTINGS.lastVersion) || null;
  // Worlds that used the module before it remembered versions are updating, not installing
  const usedBefore = Boolean(
    game.settings.get(MODULE_ID, SETTINGS.welcomed) || game.settings.get(MODULE_ID, SETTINGS.campaign)?.uuid,
  );
  const kind = announcementKind({ lastSeen, current, usedBefore });
  if (kind) {
    const all = parseChangelog(changelog);
    const sections = lastSeen
      ? notesSince(all, lastSeen, current)
      : all.filter((section) => section.version === current);
    await ChatMessage.create({
      content: announcementHtml({ kind, version: current, sections }),
      speaker: { alias: MODULE_TITLE },
      whisper: game.users.filter((user) => user.isGM).map((user) => user.id),
      flags: { [MODULE_ID]: { announcement: kind } },
    });
  }
  if (lastSeen !== current) await game.settings.set(MODULE_ID, SETTINGS.lastVersion, current);
}

/**
 * Makes the buttons in the welcome and what's-new messages work. One listener
 * on the page catches them all, because Foundry draws the messages already in
 * chat before modules finish loading, and again in pop-outs and notifications.
 */
export function watchAnnouncements(actions) {
  document.addEventListener("click", (event) => {
    const button = event.target.closest?.(".dlcp-announcement [data-dlcp-action]");
    if (!button) return;
    event.preventDefault();
    actions[button.dataset.dlcpAction]?.();
  });
}

/** A new GitHub issue with this world's versions filled in */
export function bugReportLink() {
  const linked = game.settings.get(MODULE_ID, SETTINGS.campaign);
  let campaign = "";
  if (linked?.local) campaign = "In this world (no account)";
  else if (linked?.uuid) campaign = "On Dungeon Master Guru (synced)";
  return bugReportUrl({
    moduleVersion: game.modules.get(MODULE_ID).version,
    foundryVersion: game.version,
    system: `${game.system.title} ${game.system.version} (${game.system.id})`,
    browser: navigator.userAgent,
    modules: game.modules
      .filter((module) => module.active && module.id !== MODULE_ID)
      .map((module) => `${module.id} ${module.version}`),
    campaign,
  });
}

export function openBugReport() {
  window.open(bugReportLink(), "_blank", "noopener,noreferrer");
}
