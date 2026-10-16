import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DRAFT_VERSION,
  FIELDS,
  LAST_STEP,
  MAX_TRUTHS,
  STEPS,
  TEMPLATES,
  defaultDraft,
  hasProgress,
  normalizeDraft,
  stepForField,
  toPayload,
  truthsOf,
  validateAll,
  validateStep,
} from "../scripts/setup.mjs";

test("walks through the same steps as the website", () => {
  assert.deepEqual(
    STEPS.map((step) => step.id),
    ["kind", "pitch", "table", "world", "books", "review"],
  );
  assert.equal(LAST_STEP, 5);
  for (const step of STEPS) {
    assert.ok(step.title && step.intro, step.id);
    for (const field of step.fields ?? []) assert.ok(FIELDS[field], `${step.id}: ${field}`);
  }
});

test("offers the four templates, story arc first", () => {
  assert.deepEqual(
    TEMPLATES.map((template) => template.value),
    ["three_act", "sandbox", "five_room", "blank"],
  );
  assert.equal(defaultDraft().template, "three_act");
});

test("starts a typical table", () => {
  assert.deepEqual(defaultDraft().values, { party_size: "4", start_level: "1" });
  assert.equal(defaultDraft().version, DRAFT_VERSION);
});

test("needs a name to leave the pitch", () => {
  assert.equal(validateStep("pitch", { name: "  " }), "Give your campaign a name to go on.");
  assert.equal(validateStep("pitch", { name: "Zombie Siege" }), null);
});

test("checks the table's numbers", () => {
  assert.equal(validateStep("table", { party_size: "13" }), "Players must be a whole number from 1 to 12.");
  assert.equal(validateStep("table", { start_level: "2.5" }), "Starting level must be a whole number from 1 to 20.");
  assert.equal(
    validateStep("table", { planned_sessions: "0" }),
    "Planned sessions must be a whole number from 1 to 100.",
  );
  assert.equal(
    validateStep("table", { start_level: "5", target_level: "3" }),
    "The target level can't be lower than the starting level.",
  );
  assert.equal(validateStep("table", { party_size: "", start_level: "3", target_level: "8" }), null);
});

test("keeps the truths to six", () => {
  assert.equal(MAX_TRUTHS, 6);
  const seven = ["1", "2", "3", "4", "5", "6", "7"].join("\n");
  assert.equal(validateStep("world", { truths: seven }), "Keep it to 6 truths. You have 7.");
  assert.equal(validateStep("world", { truths: "One\n\n  \nTwo" }), null);
  assert.deepEqual(truthsOf(" One \n\nTwo\n"), ["One", "Two"]);
});

test("finds the first step that isn't ready", () => {
  assert.deepEqual(validateAll({ name: "", truths: "" }), { step: 1, error: "Give your campaign a name to go on." });
  assert.equal(validateAll({ name: "Zombie Siege" }), null);
});

test("knows which step holds each field", () => {
  assert.equal(stepForField("name"), 1);
  assert.equal(stepForField("target_level"), 2);
  assert.equal(stepForField("truths"), 3);
  assert.equal(stepForField("excluded_compendium_packs"), 4);
  assert.equal(stepForField("template"), 0);
  assert.equal(stepForField("something_else"), LAST_STEP);
});

test("builds the create request", () => {
  const draft = {
    ...defaultDraft(),
    template: "sandbox",
    values: {
      name: " Zombie Siege ",
      party_size: "4",
      start_level: "3",
      target_level: "",
      truths: "The dead walk\n\nThe temple is corrupt",
      tone: "",
    },
    excludedPacks: ["dnd5e.actors24"],
  };
  const world = { id: "greyhawk", title: "Greyhawk" };
  const characters = [{ uuid: "Actor.a", name: "Akra", sheet: {} }];

  assert.deepEqual(toPayload(draft, { world, characters, requestId: "abc123def456" }), {
    template: "sandbox",
    campaign: {
      name: "Zombie Siege",
      tone: null,
      premise: null,
      pitch: null,
      party_size: 4,
      start_level: 3,
      target_level: null,
      planned_sessions: null,
      cadence: null,
      setting_name: null,
      truths: ["The dead walk", "The temple is corrupt"],
      setting_notes: null,
      excluded_compendium_packs: ["dnd5e.actors24"],
    },
    party: { world, characters },
    request_id: "abc123def456",
  });
});

test("picks a saved draft up safely", () => {
  const saved = {
    version: DRAFT_VERSION,
    step: 99,
    furthest: 2,
    template: "nonsense",
    values: { name: "Old" },
    party: ["Actor.kept", "Actor.gone"],
    excludedPacks: ["dnd5e.actors24", 42],
    partySizeEdited: true,
  };

  const draft = normalizeDraft(saved, ["Actor.kept"]);

  assert.equal(draft.step, LAST_STEP);
  assert.equal(draft.furthest, LAST_STEP);
  assert.equal(draft.template, "three_act");
  assert.deepEqual(draft.values, { party_size: "4", start_level: "1", name: "Old" });
  assert.deepEqual(draft.party, ["Actor.kept"]);
  assert.deepEqual(draft.excludedPacks, ["dnd5e.actors24"]);
  assert.equal(draft.partySizeEdited, true);
});

test("starts fresh from a missing or older draft", () => {
  assert.deepEqual(normalizeDraft(null, []), defaultDraft());
  assert.deepEqual(normalizeDraft("text", []), defaultDraft());
  assert.deepEqual(normalizeDraft({ version: DRAFT_VERSION - 1, step: 3 }, []), defaultDraft());
});

test("knows when a draft is worth picking up", () => {
  assert.equal(hasProgress(defaultDraft()), false);
  assert.equal(hasProgress({ ...defaultDraft(), step: 2 }), true);
  assert.equal(hasProgress({ ...defaultDraft(), values: { name: "Zombie Siege" } }), true);
});
