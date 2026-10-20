import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DRAFT_VERSION,
  FIELDS,
  LAST_STEP,
  MAX_TRUTHS,
  MAX_TRUTH_DESCRIPTION,
  MAX_TRUTH_NAME,
  STEPS,
  TEMPLATES,
  defaultDraft,
  hasProgress,
  normalizeDraft,
  stepForField,
  toPayload,
  linesOf,
  normalizeTruths,
  truthRows,
  truthsError,
  validateAll,
  validateStep,
  withWords,
  setGuideWords,
  guideSteps,
  guideTemplates,
  stepsFor,
  TEMPLATE_IDEAS,
} from "../src/setup.mjs";
import { ALL_ON, creditsFor } from "../src/techniques.mjs";

const withoutTruths = { ...ALL_ON, truths: false };

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

const truth = (name, description = "") => ({ name, description });
// Truths as the editor holds them: n of them, each with a name
const truths = (n) => Array.from({ length: n }, (_, index) => truth(`Truth ${index + 1}`));

test("reads truths as names and descriptions", () => {
  assert.deepEqual(
    normalizeTruths([
      { name: " Greyhawk runs on gold. ", description: " Nearly anything can be bought. " },
      { name: "The city has walls within walls.", description: null },
      { name: "The dead walk." },
    ]),
    [
      truth("Greyhawk runs on gold.", "Nearly anything can be bought."),
      truth("The city has walls within walls."),
      truth("The dead walk."),
    ],
  );
});

test("reads a truth an older version kept as text: the first sentence is its name", () => {
  assert.deepEqual(
    normalizeTruths([
      "Greyhawk runs on gold. The Directing Oligarchy governs the Free City. Nearly anything can be bought.",
      "Beware the Old City! Its gates shut at dusk.",
      "Who rules the Free City? The Directing Oligarchy, in name.",
      "The dead do not rest easy in the Flanaess.",
      "Hommlet’s walls were built for bandits, not armies",
    ]),
    [
      truth("Greyhawk runs on gold.", "The Directing Oligarchy governs the Free City. Nearly anything can be bought."),
      truth("Beware the Old City!", "Its gates shut at dusk."),
      truth("Who rules the Free City?", "The Directing Oligarchy, in name."),
      truth("The dead do not rest easy in the Flanaess."),
      truth("Hommlet’s walls were built for bandits, not armies"),
    ],
  );
  // Punctuation with no space after it isn't the end of a sentence
  assert.deepEqual(normalizeTruths(["The ward costs 2.5 gp...or a favor. Ask Ostler."]), [
    truth("The ward costs 2.5 gp...or a favor.", "Ask Ostler."),
  ]);
});

test("reads truths kept as lines of text, and lists that mix text and truths", () => {
  assert.deepEqual(normalizeTruths(" The dead walk. Even here. \n\n  \nThe temple is corrupt\n"), [
    truth("The dead walk.", "Even here."),
    truth("The temple is corrupt"),
  ]);
  assert.deepEqual(normalizeTruths(["The dead walk", { name: "The temple is corrupt", description: "Its priests feed the dead." }, "  "]), [
    truth("The dead walk"),
    truth("The temple is corrupt", "Its priests feed the dead."),
  ]);
});

test("reads missing truths as none, and leaves out blank ones", () => {
  for (const value of [null, undefined, "", "  \n ", [], 42, { name: "Not a list" }]) {
    assert.deepEqual(normalizeTruths(value), [], String(value));
  }
  assert.deepEqual(normalizeTruths([null, 7, { name: " ", description: "" }, {}]), []);
  // A description with no name is kept, for the check to point out
  assert.deepEqual(normalizeTruths([{ name: "", description: "No name" }]), [truth("", "No name")]);
});

test("the editor keeps rows the GM is still filling in", () => {
  const rows = [truth(""), truth("The dead walk ", "Even here"), truth("", " ")];

  assert.deepEqual(truthRows(rows), rows);
  assert.deepEqual(truthRows([{ name: "A" }, "B. More.", null]), [truth("A"), truth("B.", "More.")]);
  assert.deepEqual(truthRows("One\n\nTwo"), [truth("One"), truth("Two")]);
  assert.deepEqual(truthRows(undefined), []);
});

test("checks the truths as Dungeon Master Guru does", () => {
  assert.equal(MAX_TRUTHS, 20);
  assert.equal(truthsError(truths(20)), null);
  assert.equal(truthsError(truths(21)), "Keep it to 20 truths. You have 21.");
  // Blank rows don't count, and aren't checked
  assert.equal(truthsError([...truths(20), truth(""), truth("  ", " ")]), null);
  assert.equal(truthsError([]), null);
  assert.equal(truthsError(null), null);

  // Numbered as the editor shows them, blank rows too
  assert.equal(
    truthsError([truth("The dead walk"), truth(""), truth("", "A description")]),
    "Each truth needs a name. Truth 3 has only a description.",
  );
  assert.equal(truthsError([truth("x".repeat(MAX_TRUTH_NAME))]), null);
  assert.equal(
    truthsError([truth("ok"), truth(` ${"x".repeat(MAX_TRUTH_NAME + 1)} `)]),
    "The name of truth 2 can be at most 120 characters.",
  );
  assert.equal(truthsError([truth("ok", "x".repeat(MAX_TRUTH_DESCRIPTION))]), null);
  assert.equal(
    truthsError([truth("ok", "x".repeat(MAX_TRUTH_DESCRIPTION + 1))]),
    "The description of truth 1 can be at most 1,000 characters.",
  );
});

test("there's no limit of six truths any more, and the World step checks them", () => {
  assert.equal(validateStep("world", { truths: truths(7) }), null);
  assert.equal(validateStep("world", { truths: truths(21) }), "Keep it to 20 truths. You have 21.");
  assert.equal(validateStep("world", { truths: [truth("", "A description")] }), "Each truth needs a name. Truth 1 has only a description.");
  assert.equal(validateStep("world", { truths: "One\n\n  \nTwo" }), null);
  assert.equal(validateStep("world", {}), null);
  assert.equal(FIELDS.truths.hint, "About six is plenty: short facts everyone at the table knows.");
});

test("splits text into lines", () => {
  assert.deepEqual(linesOf(" One \n\nTwo\n"), ["One", "Two"]);
  assert.deepEqual(linesOf(null), []);
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
      truths: [truth(" The dead walk "), truth("", ""), truth("The temple is corrupt", "Its priests feed the dead.")],
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
      truths: [truth("The dead walk"), truth("The temple is corrupt", "Its priests feed the dead.")],
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

test("builds the create request from a draft an older version saved", () => {
  const draft = normalizeDraft(
    { ...defaultDraft(), values: { name: "Zombie Siege", truths: "The dead walk. Even here.\n\nThe temple is corrupt" } },
    [],
  );

  assert.deepEqual(draft.values.truths, [truth("The dead walk.", "Even here."), truth("The temple is corrupt")]);
  assert.deepEqual(toPayload(draft, { world: { id: "w", title: "W" }, requestId: "r" }).campaign.truths, draft.values.truths);
  assert.deepEqual(toPayload(defaultDraft(), { world: { id: "w", title: "W" }, requestId: "r" }).campaign.truths, []);
});

test("a saved draft keeps the truths rows the GM was filling in", () => {
  const rows = [truth("The dead walk"), truth("", "")];

  assert.deepEqual(normalizeDraft({ ...defaultDraft(), values: { truths: rows } }, []).values.truths, rows);
  assert.deepEqual(normalizeDraft({ ...defaultDraft(), values: { truths: ["A. B.", "C"] } }, []).values.truths, [
    truth("A.", "B."),
    truth("C"),
  ]);
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

test("Dungeon Master Guru's words replace the built-in ones, and the steps keep their fields", () => {
  const guide = withWords({
    steps: [
      { id: "pitch", label: "Pitch", title: "Your pitch", intro: "Say it in a sentence.", why: null, example: "A haunted lighthouse." },
      { id: "nonsense", title: "Ignored" },
      { id: "table", title: "", intro: "   " },
    ],
    templates: [{ value: "sandbox", title: "Open world", description: "Go anywhere.", example: "The Wild Coast." }],
  });
  const pitch = guide.steps.find((step) => step.id === "pitch");

  assert.equal(pitch.title, "Your pitch");
  assert.equal(pitch.intro, "Say it in a sentence.");
  assert.equal("why" in pitch, false, "an empty why is left out");
  assert.equal(pitch.example, "A haunted lighthouse.");
  assert.deepEqual(pitch.fields, STEPS.find((step) => step.id === "pitch").fields);
  // Empty required words keep the built-in ones; unknown steps are ignored
  assert.deepEqual(guide.steps.find((step) => step.id === "table"), STEPS.find((step) => step.id === "table"));
  assert.deepEqual(guide.steps.map((step) => step.id), STEPS.map((step) => step.id));
  assert.equal(guide.templates.find((t) => t.value === "sandbox").title, "Open world");
  assert.deepEqual(guide.templates.find((t) => t.value === "blank"), TEMPLATES.find((t) => t.value === "blank"));
});

test("without Dungeon Master Guru's words the guide uses the module's own", () => {
  assert.deepEqual(withWords(null), { steps: STEPS, templates: TEMPLATES });
  assert.deepEqual(withWords({ steps: "nope" }).steps, STEPS);
});

test("the guide shows the words it was last given", () => {
  setGuideWords({ steps: [{ id: "kind", title: "What game?" }] });
  assert.equal(guideSteps()[0].title, "What game?");
  assert.deepEqual(guideTemplates(), TEMPLATES);
  setGuideWords(null);
  assert.equal(guideSteps()[0].title, STEPS[0].title);
});

test("the World step doesn't ask for truths when they're switched off", () => {
  assert.equal(stepsFor(STEPS), STEPS);
  const steps = stepsFor(STEPS, withoutTruths);
  const world = steps.find((step) => step.id === "world");

  assert.deepEqual(world.fields, ["setting_name", "setting_notes"]);
  // Its "why" and example are about the truths
  assert.equal(world.why, undefined);
  assert.equal(world.example, undefined);
  assert.equal(world.title, "The world");
  assert.deepEqual(
    steps.filter((step) => step.id !== "world"),
    STEPS.filter((step) => step.id !== "world"),
  );
  assert.ok(STEPS.find((step) => step.id === "world").why, "the guide's own steps are unchanged");
});

test("truths typed before they were switched off are still checked, with a way to change them", () => {
  assert.match(validateStep("world", { truths: truths(21) }, withoutTruths), /You have 21\. Turn the six truths back on/);
  assert.equal(validateAll({ name: "Zombie Siege", truths: truths(21) }, withoutTruths).step, stepForField("truths"));
  assert.equal(validateStep("world", { truths: "One" }, withoutTruths), null);
});

test("credits the ideas behind the sandbox and one-shot templates", () => {
  assert.deepEqual(Object.keys(TEMPLATE_IDEAS).sort(), ["five_room", "sandbox"]);
  for (const [template, idea] of Object.entries(TEMPLATE_IDEAS)) {
    assert.ok(TEMPLATES.some((option) => option.value === template));
    assert.ok(creditsFor([idea]).length > 0, `${template} has a source`);
  }
  assert.deepEqual(creditsFor([TEMPLATE_IDEAS.five_room]).map((s) => s.title), ["5 Room Dungeons"]);
  assert.deepEqual(creditsFor([TEMPLATE_IDEAS.sandbox]).map((s) => s.title), ["Don't Prep Plots"]);
});
