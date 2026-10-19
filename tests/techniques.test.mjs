import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { SETTINGS } from "../src/constants.mjs";
import {
  ALL_ON,
  IDEAS,
  PREP_STEPS,
  SOURCES,
  TECHNIQUES,
  creditsFor,
  prepSteps,
  sourcesByAuthor,
  techniquesFrom,
  visibleFields,
} from "../src/techniques.mjs";

const off = (...keys) => ({ ...ALL_ON, ...Object.fromEntries(keys.map((key) => [key, false])) });

test("lists the techniques a DM can switch off, each with its own world setting", () => {
  assert.deepEqual(
    TECHNIQUES.map((t) => t.key),
    ["truths", "clocks", "portents", "secrets", "threeClues", "checklist"],
  );
  assert.deepEqual(
    TECHNIQUES.map((t) => t.setting),
    [
      SETTINGS.useTruths,
      SETTINGS.useClocks,
      SETTINGS.usePortents,
      SETTINGS.useSecrets,
      SETTINGS.useThreeClueRule,
      SETTINGS.useGettingStarted,
    ],
  );
  for (const technique of TECHNIQUES) {
    assert.match(technique.name, /^Use /, "the names read well together in Module Settings");
    assert.ok(technique.hint && !technique.hint.includes("\n"), `${technique.key} has a one-line hint`);
  }
  assert.deepEqual(Object.keys(ALL_ON), TECHNIQUES.map((t) => t.key));
  assert.ok(Object.values(ALL_ON).every(Boolean));
  assert.ok(Object.isFrozen(ALL_ON));
});

test("every source links to an https page", () => {
  for (const source of SOURCES) {
    assert.equal(new URL(source.url).protocol, "https:", source.url);
    assert.ok(source.title && source.author && source.by && source.about, source.id);
  }
  assert.equal(new Set(SOURCES.map((s) => s.id)).size, SOURCES.length, "ids are unique");
  assert.equal(new Set(SOURCES.map((s) => s.url)).size, SOURCES.length, "each page is listed once");
});

test("every credited technique and idea has a source, and every source is credited somewhere", () => {
  const ids = new Set(SOURCES.map((s) => s.id));
  const credited = [...TECHNIQUES.filter((t) => t.key !== "checklist"), ...IDEAS];
  for (const item of credited) {
    assert.ok(item.sources.length > 0, `${item.key} has a source`);
    for (const id of item.sources) assert.ok(ids.has(id), `${item.key}'s source ${id} exists`);
  }
  // The Getting started checklist is the module's own
  assert.deepEqual(TECHNIQUES.find((t) => t.key === "checklist").sources, []);
  const used = new Set([...TECHNIQUES, ...IDEAS].flatMap((item) => item.sources));
  for (const source of SOURCES) assert.ok(used.has(source.id), `${source.id} is credited`);
});

test("every technique is on unless its setting is switched off", () => {
  assert.deepEqual(
    techniquesFrom(() => undefined),
    ALL_ON,
  );
  assert.deepEqual(
    techniquesFrom(() => {
      throw new Error("not registered");
    }),
    ALL_ON,
  );
  const settings = { [SETTINGS.useClocks]: false, [SETTINGS.useTruths]: true, [SETTINGS.usePortents]: "yes" };
  assert.deepEqual(
    techniquesFrom((key) => settings[key]),
    off("clocks"),
  );
});

test("the Three Clue Rule check only applies while secrets are on", () => {
  const settings = { [SETTINGS.useSecrets]: false };
  const techniques = techniquesFrom((key) => settings[key]);
  assert.equal(techniques.secrets, false);
  assert.equal(techniques.threeClues, false);
  assert.equal(techniquesFrom((key) => (key === SETTINGS.useThreeClueRule ? false : true)).secrets, true);
});

test("hides the form fields of techniques that are switched off", () => {
  const fields = [{ name: "name" }, { name: "portents" }, { name: "clockSegments" }, { name: "clockFilled" }, { name: "truths" }];
  assert.deepEqual(visibleFields(fields), fields);
  assert.deepEqual(
    visibleFields(fields, off("clocks")).map((f) => f.name),
    ["name", "portents", "truths"],
  );
  assert.deepEqual(
    visibleFields(fields, off("portents", "truths")).map((f) => f.name),
    ["name", "clockSegments", "clockFilled"],
  );
  assert.deepEqual(visibleFields(["setting_name", "truths", "setting_notes"], off("truths")), ["setting_name", "setting_notes"]);
});

test("session prep has eight steps, or seven without secrets and clues", () => {
  assert.equal(PREP_STEPS.length, 8);
  assert.deepEqual(prepSteps(), PREP_STEPS);
  assert.deepEqual(
    prepSteps(off("secrets")),
    ["characters", "strongStart", "scenes", "locations", "npcs", "monsters", "treasure"],
  );
});

test("credits each source once, and not for a technique that's switched off", () => {
  assert.deepEqual(
    creditsFor(["threats", "clocks"]).map((s) => s.id),
    ["fronts", "lazyCampaigns", "progressClocks"],
  );
  assert.deepEqual(
    creditsFor(["threats", "clocks", "portents"], off("clocks")).map((s) => s.id),
    ["fronts", "lazyCampaigns"],
  );
  assert.deepEqual(creditsFor(["truths"], off("truths")), []);
  assert.deepEqual(
    creditsFor(["secrets", "threeClues"], off("threeClues")).map((s) => s.id),
    ["secretsAndClues"],
  );
  // Ideas the planner always uses are always credited
  assert.deepEqual(
    creditsFor(["sessionPrep"], off(...TECHNIQUES.map((t) => t.key))).map((s) => s.id),
    ["eightSteps", "lazyBook"],
  );
  assert.deepEqual(creditsFor(["checklist", "nothing"]), []);
});

test("groups the sources by author, keeping every one", () => {
  const groups = sourcesByAuthor();
  assert.deepEqual(
    groups.map((g) => g.author),
    [
      "Sly Flourish (Mike Shea)",
      "The Alexandrian (Justin Alexander)",
      "Dungeon World (Sage LaTorra and Adam Koebel)",
      "Blades in the Dark (John Harper)",
      "Johnn Four",
    ],
  );
  assert.equal(groups.flatMap((g) => g.sources).length, SOURCES.length);
});

test("the README credits every source", () => {
  const readme = readFileSync(new URL("../README.md", import.meta.url), "utf8");
  const credits = readme.split("## Credits")[1]?.split("\n## ")[0] ?? "";
  assert.ok(credits, "README has a Credits section");
  for (const source of SOURCES) assert.ok(credits.includes(source.url), `README credits ${source.url}`);
});
