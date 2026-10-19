import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  LINKS,
  MAX_NOTES,
  announcementHtml,
  announcementKind,
  bugReportUrl,
  compareVersions,
  inlineMarkdown,
  notesSince,
  parseChangelog,
} from "../src/welcome.mjs";

const CHANGELOG = `# Changelog

## [Unreleased]

- Not out yet

## [0.3.0] - 2026-11-01

### Added
- **Quests:** plan each quest's maps
  - and its reward
- See [the docs](https://example.com/docs) and \`npm run dev\`

## [0.2.1] - 2026-10-25

- Fixed a typo

## [0.2.0] - 2026-10-20

- **Maps** for places

## [0.1.0]

- First release.
`;

test("compares versions", () => {
  assert.ok(compareVersions("0.10.0", "0.9.9") > 0);
  assert.ok(compareVersions("1.0.0", "1.0.1") < 0);
  assert.equal(compareVersions("0.2.0", "0.2.0"), 0);
});

test("welcomes a first install", () => {
  assert.equal(announcementKind({ lastSeen: null, current: "0.2.0" }), "install");
});

test("treats a world that used the module before as an update", () => {
  assert.equal(announcementKind({ lastSeen: null, current: "0.2.0", usedBefore: true }), "update");
});

test("announces major and minor updates, not patches or the same version", () => {
  assert.equal(announcementKind({ lastSeen: "0.2.0", current: "0.3.0" }), "update");
  assert.equal(announcementKind({ lastSeen: "0.9.4", current: "1.0.0" }), "update");
  assert.equal(announcementKind({ lastSeen: "0.2.0", current: "0.2.1" }), null);
  assert.equal(announcementKind({ lastSeen: "0.2.0", current: "0.2.0" }), null);
  assert.equal(announcementKind({ lastSeen: "0.3.0", current: "0.2.0" }), null);
});

test("reads the changelog's versions and notes, folding sub-headings", () => {
  const sections = parseChangelog(CHANGELOG);

  assert.deepEqual(
    sections.map((section) => [section.version, section.date]),
    [
      ["Unreleased", null],
      ["0.3.0", "2026-11-01"],
      ["0.2.1", "2026-10-25"],
      ["0.2.0", "2026-10-20"],
      ["0.1.0", null],
    ],
  );
  assert.deepEqual(sections[1].notes[0], { text: "**Quests:** plan each quest's maps", children: ["and its reward"] });
});

test("lists the changes since the last version seen, newest first", () => {
  const sections = parseChangelog(CHANGELOG);

  assert.deepEqual(
    notesSince(sections, "0.2.0", "0.3.0").map((section) => section.version),
    ["0.3.0", "0.2.1"],
  );
  assert.deepEqual(
    notesSince(sections, null, "0.2.0").map((section) => section.version),
    ["0.2.0", "0.1.0"],
  );
});

test("turns changelog markdown into safe HTML", () => {
  assert.equal(
    inlineMarkdown("**Bold** `code` [docs](https://example.com) <script>"),
    '<strong>Bold</strong> <code>code</code> <a href="https://example.com" target="_blank" rel="noopener">docs</a> &lt;script&gt;',
  );
  assert.equal(inlineMarkdown("[bad](javascript:alert(1))"), "[bad](javascript:alert(1))");
});

test("the welcome message explains how to start, with help, Patreon and bug report buttons", () => {
  const html = announcementHtml({ kind: "install", version: "0.2.0" });

  assert.match(html, /Welcome to Dorman Lakely's Campaign Planner v0\.2\.0/);
  assert.match(html, /data-dlcp-action="help"/);
  assert.match(html, /data-dlcp-action="newCampaign"/);
  assert.match(html, /data-dlcp-action="reportBug"/);
  assert.ok(html.includes(LINKS.patreon));
});

test("the update message lists what changed, by version", () => {
  const sections = notesSince(parseChangelog(CHANGELOG), "0.2.0", "0.3.0");
  const html = announcementHtml({ kind: "update", version: "0.3.0", sections });

  assert.match(html, /Dorman Lakely's Campaign Planner v0\.3\.0/);
  assert.match(html, /<h4>Version 0\.3\.0<\/h4>/);
  assert.match(html, /<li><strong>Quests:<\/strong> plan each quest&#39;s maps<ul><li>and its reward<\/li><\/ul><\/li>/);
  assert.match(html, /<h4>Version 0\.2\.1<\/h4><ul><li>Fixed a typo<\/li><\/ul>/);
  assert.match(html, /data-dlcp-action="plan"/);
  assert.match(html, /data-dlcp-action="reportBug"/);
});

test("a single version's update has no version headings", () => {
  const sections = notesSince(parseChangelog(CHANGELOG), "0.2.1", "0.3.0");

  assert.ok(!announcementHtml({ kind: "update", version: "0.3.0", sections }).includes("<h4>"));
});

test("a long change list points to the release notes for the rest", () => {
  const notes = Array.from({ length: MAX_NOTES + 3 }, (_, i) => ({ text: `Change ${i}`, children: [] }));
  const html = announcementHtml({ kind: "update", version: "1.0.0", sections: [{ version: "1.0.0", notes }] });

  assert.equal((html.match(/<li>Change/g) ?? []).length, MAX_NOTES);
  assert.match(html, /…and 3 more in the <a href="[^"]+\/releases"/);
});

test("an update with no notes links to the release notes", () => {
  assert.match(announcementHtml({ kind: "update", version: "1.0.0", sections: [] }), /release notes/);
});

test("the bug report link fills in the form's version fields", () => {
  const url = new URL(
    bugReportUrl({
      moduleVersion: "0.2.0",
      foundryVersion: "14.369",
      system: "D&D Fifth Edition 5.2.0 (dnd5e)",
      browser: "Chrome",
      modules: ["fxmaster 8.4.0", "lib-wrapper 1.12"],
      campaign: "In this world (no account)",
    }),
  );

  assert.equal(`${url.origin}${url.pathname}`, `${LINKS.issues}/new`);
  assert.equal(url.searchParams.get("template"), "bug_report.yml");
  assert.equal(url.searchParams.get("module-version"), "0.2.0");
  assert.equal(url.searchParams.get("foundry-version"), "14.369");
  assert.equal(url.searchParams.get("system"), "D&D Fifth Edition 5.2.0 (dnd5e)");
  assert.equal(url.searchParams.get("modules"), "fxmaster 8.4.0\nlib-wrapper 1.12");
  assert.equal(url.searchParams.get("campaign"), "In this world (no account)");
});

test("the bug report form has a field for every value the link fills in", () => {
  const form = readFileSync(new URL("../.github/ISSUE_TEMPLATE/bug_report.yml", import.meta.url), "utf8");
  const url = new URL(bugReportUrl({ moduleVersion: "1", foundryVersion: "1", system: "x", campaign: "y" }));

  for (const key of url.searchParams.keys()) {
    if (key === "template") continue;
    assert.match(form, new RegExp(`id: ${key}\\b`), key);
  }
});

test("the real changelog parses", () => {
  const changelog = readFileSync(new URL("../CHANGELOG.md", import.meta.url), "utf8");
  const sections = parseChangelog(changelog);

  assert.equal(sections[0].version, "Unreleased");
  assert.ok(sections[0].notes.length > 0);
});
