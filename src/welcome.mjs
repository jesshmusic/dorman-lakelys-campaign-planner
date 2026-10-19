// The welcome message in chat on first install, and "what's new" after a
// major or minor update, plus the prefilled GitHub bug report link. No
// Foundry globals, so it can be tested in Node.

import { escapeHtml } from "./render.mjs";

const REPO = "https://github.com/jesshmusic/dorman-lakelys-campaign-planner";

export const LINKS = {
  patreon: "https://www.patreon.com/c/DormanLakely",
  site: "https://dungeonmaster.guru",
  issues: `${REPO}/issues`,
  releases: `${REPO}/releases`,
};

// Most changes listed in the chat message; the rest are in the release notes
export const MAX_NOTES = 12;

/** [major, minor, patch] from "1.2.3" (anything after the numbers is ignored) */
export function versionParts(version) {
  const [major = 0, minor = 0, patch = 0] = String(version ?? "")
    .split(/[.-]/)
    .slice(0, 3)
    .map((part) => Number.parseInt(part, 10) || 0);
  return [major, minor, patch];
}

/** Negative when a is older than b, 0 when the same, positive when newer */
export function compareVersions(a, b) {
  const [left, right] = [versionParts(a), versionParts(b)];
  for (let i = 0; i < 3; i += 1) if (left[i] !== right[i]) return left[i] - right[i];
  return 0;
}

/**
 * What to post in chat when a GM loads the world:
 * - "install": the first time, with how to get started
 * - "update": after a major or minor update, with what changed
 * - null: nothing new, or only a patch
 * @param {{ lastSeen: string|null, current: string, usedBefore?: boolean }} options
 *   usedBefore: the module was in use before it started remembering versions
 *   (so it's an update from 0.1.0, not a first install)
 */
export function announcementKind({ lastSeen, current, usedBefore = false }) {
  if (!lastSeen) return usedBefore ? "update" : "install";
  if (compareVersions(current, lastSeen) <= 0) return null;
  const [currentMajor, currentMinor] = versionParts(current);
  const [seenMajor, seenMinor] = versionParts(lastSeen);
  return currentMajor !== seenMajor || currentMinor !== seenMinor ? "update" : null;
}

/**
 * The versions in a Keep a Changelog style file, newest first:
 * [{ version, date, notes: [{ text, children: string[] }] }]. Sub-headings
 * (### Added) are folded into one list.
 */
export function parseChangelog(markdown) {
  const sections = [];
  let section = null;
  for (const line of String(markdown ?? "").split("\n")) {
    const heading = line.match(/^## \[([^\]]+)\](?:\s*-\s*(\S+))?/);
    if (heading) {
      section = { version: heading[1], date: heading[2] ?? null, notes: [] };
      sections.push(section);
      continue;
    }
    if (!section) continue;
    const top = line.match(/^- (.+)/);
    const nested = line.match(/^\s{2,}- (.+)/);
    if (top) section.notes.push({ text: top[1].trim(), children: [] });
    else if (nested && section.notes.length) section.notes.at(-1).children.push(nested[1].trim());
  }
  return sections;
}

/** The changes after `from` up to and including `to`, newest version first */
export function notesSince(sections, from, to) {
  return sections.filter(
    (section) =>
      section.version !== "Unreleased" &&
      compareVersions(section.version, to) <= 0 &&
      (!from || compareVersions(section.version, from) > 0),
  );
}

/** Changelog text as safe HTML: **bold**, `code` and [links](https://…) */
export function inlineMarkdown(text) {
  return escapeHtml(text)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(
      /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener">$1</a>',
    );
}

function notesHtml(sections) {
  let shown = 0;
  let hidden = 0;
  const parts = [];
  for (const section of sections) {
    const items = [];
    for (const note of section.notes) {
      if (shown >= MAX_NOTES) {
        hidden += 1;
        continue;
      }
      shown += 1;
      const children = note.children.length
        ? `<ul>${note.children.map((child) => `<li>${inlineMarkdown(child)}</li>`).join("")}</ul>`
        : "";
      items.push(`<li>${inlineMarkdown(note.text)}${children}</li>`);
    }
    if (items.length) {
      const title = sections.length > 1 ? `<h4>Version ${escapeHtml(section.version)}</h4>` : "";
      parts.push(`${title}<ul>${items.join("")}</ul>`);
    }
  }
  if (hidden) {
    parts.push(
      `<p class="dlcp-muted">…and ${hidden} more in the <a href="${LINKS.releases}" target="_blank" rel="noopener">release notes</a>.</p>`,
    );
  }
  return parts.join("");
}

const button = (action, icon, label) =>
  `<button type="button" data-dlcp-action="${action}"><i class="fas fa-${icon}"></i> ${label}</button>`;

const supportLinks = () => `
  <p class="dlcp-announcement-support">
    <a href="${LINKS.patreon}" target="_blank" rel="noopener"><i class="fab fa-patreon"></i> Support on Patreon</a>
    ${button("reportBug", "bug", "Report a bug")}
  </p>`;

/**
 * The chat message's HTML. Its buttons (data-dlcp-action) are wired up when
 * the message renders.
 * @param {{ kind: "install"|"update", version: string, sections?: object[] }} options
 */
export function announcementHtml({ kind, version, sections = [] }) {
  const v = escapeHtml(version);
  if (kind === "install") {
    return `<div class="dlcp-announcement">
      <h3><i class="fas fa-feather-alt"></i> Welcome to Dorman Lakely's Campaign Planner v${v}</h3>
      <p>Plan a campaign the Lazy Dungeon Master way, right here in Foundry: a strong start, secrets and clues, threats
        with clocks, quests and the eight steps of session prep. Then run it at the table from the Campaign Dashboard.</p>
      <ul>
        <li><strong>No account needed:</strong> click <strong>New</strong> in the Journal sidebar to start a campaign
          in this world.</li>
        <li><strong>Want AI help?</strong> Connect a free <a href="${LINKS.site}" target="_blank" rel="noopener">Dungeon
          Master Guru</a> account to plan on the website too.</li>
      </ul>
      <p class="dlcp-announcement-buttons">
        ${button("help", "circle-question", "How it works")}
        ${button("newCampaign", "feather-alt", "New campaign")}
      </p>
      ${supportLinks()}
    </div>`;
  }
  const notes = notesHtml(sections);
  return `<div class="dlcp-announcement">
    <h3><i class="fas fa-feather-alt"></i> Dorman Lakely's Campaign Planner v${v}</h3>
    <p>What's new since you last played:</p>
    ${notes || `<p>See the <a href="${LINKS.releases}" target="_blank" rel="noopener">release notes</a>.</p>`}
    <p class="dlcp-announcement-buttons">
      ${button("plan", "feather-alt", "Open the planner")}
      ${button("help", "circle-question", "How it works")}
    </p>
    ${supportLinks()}
  </div>`;
}

/**
 * A GitHub issue for a bug, with the bug report form's version fields filled in.
 * @param {{ moduleVersion: string, foundryVersion: string, system: string, browser?: string, modules?: string[], campaign?: string }} env
 */
export function bugReportUrl({ moduleVersion, foundryVersion, system, browser = "", modules = [], campaign = "" }) {
  const params = new URLSearchParams({
    template: "bug_report.yml",
    "module-version": moduleVersion ?? "",
    "foundry-version": foundryVersion ?? "",
    system: system ?? "",
    browser: browser.slice(0, 200),
    // Long lists would make the link too long for GitHub
    modules: modules.slice(0, 60).join("\n"),
  });
  if (campaign) params.set("campaign", campaign);
  return `${LINKS.issues}/new?${params}`;
}
