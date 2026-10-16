import { test } from "node:test";
import assert from "node:assert/strict";
import { characterPayload, isPlayerCharacter, playersOf } from "../scripts/characters.mjs";

const gm = { id: "gm", name: "Gamemaster", isGM: true, character: null };
const sam = { id: "sam", name: "Sam", isGM: false, character: { id: "akra" } };
const kim = { id: "kim", name: "Kim", isGM: false, character: null };
const users = [gm, sam, kim];

const item = (type, name, system = {}, extra = {}) => ({ type, name, system, ...extra });

const akra = {
  id: "akra",
  uuid: "Actor.akra000000000000",
  name: "Akra",
  type: "character",
  ownership: { default: 0, gm: 3, sam: 3 },
  system: {
    details: {
      level: 5,
      alignment: "Lawful Good",
      xp: { value: 6500 },
      trait: "I quote scripture.",
      ideal: "",
      bond: "<p>My temple in <strong>Hommlet</strong></p>",
      flaw: "Too trusting",
      biography: { value: "<p>Raised by priests.</p><img src=x onerror=alert(1)>" },
      age: "22",
      eyes: "Gold",
    },
    attributes: {
      ac: { value: 18 },
      hp: { value: 3, max: 38, temp: 5 },
      init: { total: -1 },
      prof: 3,
      movement: { walk: 30, fly: 0, swim: 0, climb: 0, burrow: 0, units: "ft" },
      senses: { ranges: { darkvision: 60, blindsight: 0 }, units: "ft", special: "" },
      spellcasting: "wis",
      spell: { dc: 14, attack: 6 },
    },
    abilities: {
      str: { value: 13, mod: 1, save: { value: 1 }, proficient: 0 },
      dex: { value: 8, mod: -1, save: { value: -1 }, proficient: 0 },
      con: { value: 14, mod: 2, save: { value: 2 }, proficient: 0 },
      int: { value: 10, mod: 0, save: { value: 0 }, proficient: 0 },
      wis: { value: 16, mod: 3, save: { value: 6 }, proficient: 1 },
      cha: { value: 12, mod: 1, save: { value: 4 }, proficient: 1 },
    },
    skills: {
      prc: { ability: "wis", total: 3, passive: 13, value: 0 },
      ins: { ability: "wis", total: 6, passive: 16, value: 1 },
      rel: { ability: "int", total: 6, passive: 16, value: 2 },
    },
    traits: {
      size: "med",
      languages: { value: new Set(["common", "draconic"]), custom: "Old Oeridian" },
      armorProf: { value: new Set(["lgt", "med", "shl"]) },
      weaponProf: { value: new Set(["sim"]) },
      dr: { value: new Set(["cold"]) },
      di: { value: new Set() },
      ci: { value: new Set() },
    },
    tools: { calligrapher: {} },
    spells: {
      spell1: { value: 1, max: 4 },
      spell2: { value: 0, max: 3 },
      spell3: { value: 2, max: 2 },
      spell4: { max: 0 },
    },
    currency: { pp: 0, gp: 15, ep: 0, sp: 3, cp: 0 },
  },
  items: [
    item("race", "Dragonborn"),
    item("background", "Acolyte"),
    item("class", "Cleric", { levels: 5 }, { subclass: { name: "Life Domain" } }),
    item("feat", "Breath Weapon", { type: { value: "race" } }),
    item("feat", "Divine Order", { type: { value: "class" } }),
    item("spell", "Guiding Bolt", { level: 1, school: "evo", prepared: 1 }),
    item("spell", "Sacred Flame", { level: 0, school: "evo", prepared: 2 }),
    item("weapon", "Mace", { quantity: 1, equipped: true }),
    item("equipment", "Chain Shirt", { quantity: 1, equipped: true }),
    item("consumable", "Potion of Healing", { quantity: 2, rarity: "common" }),
    item("equipment", "Cloak of Protection", { quantity: 1, attuned: true, rarity: "uncommon" }),
  ],
};

// A real browser would use DOMParser; this is enough for the tests
const toText = (html) => String(html ?? "").replace(/<[^>]*>/g, "");
const labels = {
  ability: (key) =>
    ({ str: "Strength", dex: "Dexterity", con: "Constitution", int: "Intelligence", wis: "Wisdom", cha: "Charisma" })[
      key
    ],
  skill: (key) => ({ prc: "Perception", ins: "Insight", rel: "Religion" })[key],
  trait: (trait, key) => `${trait}:${key}`,
  school: (key) => ({ evo: "Evocation" })[key],
  size: () => "Medium",
  rarity: (key) => ({ common: "Common", uncommon: "Uncommon" })[key],
  sense: (key) => ({ darkvision: "Darkvision" })[key],
};

test("finds the players who play or own an actor", () => {
  assert.deepEqual(
    playersOf(akra, users).map((user) => user.name),
    ["Sam"],
  );
  assert.deepEqual(
    playersOf({ id: "fineas", ownership: { kim: 3, gm: 3 } }, users).map((user) => user.name),
    ["Kim"],
  );
});

test("sends only Player Character actors", () => {
  assert.equal(isPlayerCharacter({ type: "character" }), true);
  // An NPC a player owns, like a sidekick, is still an NPC
  assert.equal(isPlayerCharacter({ type: "npc", ownership: { kim: 3 } }), false);
  assert.equal(isPlayerCharacter({ type: "vehicle" }), false);
  assert.equal(isPlayerCharacter({ type: "group" }), false);
});

test("sends who the character is and who plays it", () => {
  const payload = characterPayload(akra, { users, labels, toText });

  assert.equal(payload.uuid, "Actor.akra000000000000");
  assert.equal(payload.name, "Akra");
  assert.equal(payload.playerName, "Sam");
  assert.equal(payload.assigned, true);
  assert.equal(payload.level, 5);
  assert.equal(payload.sheet.summary, "Level 5 Dragonborn Cleric (Life Domain)");
});

test("an unplayed character is not assigned", () => {
  const payload = characterPayload({ ...akra, id: "spare", ownership: {} }, { users: [gm], labels, toText });

  assert.equal(payload.assigned, false);
  assert.equal(payload.playerName, null);
});

test("builds the sheet: stats, abilities, skills and defenses", () => {
  const { sheet } = characterPayload(akra, { users, labels, toText });

  assert.deepEqual(
    [sheet.species, sheet.background, sheet.alignment, sheet.size, sheet.xp],
    ["Dragonborn", "Acolyte", "Lawful Good", "Medium", 6500],
  );
  assert.deepEqual(sheet.classes, [{ name: "Cleric", subclass: "Life Domain", levels: 5 }]);
  assert.deepEqual([sheet.ac, sheet.hpMax, sheet.initiative, sheet.proficiency], [18, 38, -1, 3]);
  assert.deepEqual(sheet.speed, { walk: 30 });
  assert.deepEqual(sheet.senses, ["Darkvision 60 ft"]);
  assert.deepEqual(sheet.abilities[4], { key: "wis", label: "Wisdom", score: 16, mod: 3, save: 6, proficient: true });
  assert.deepEqual(
    sheet.skills.map((skill) => [skill.label, skill.total, skill.proficiency]),
    [
      ["Insight", 6, 1],
      ["Perception", 3, 0],
      ["Religion", 6, 2],
    ],
  );
  assert.deepEqual(sheet.passives, { perception: 13, insight: 16 });
  assert.deepEqual(sheet.languages, ["languages:common", "languages:draconic", "Old Oeridian"]);
  assert.deepEqual(sheet.proficiencies, {
    armor: ["armor:lgt", "armor:med", "armor:shl"],
    weapons: ["weapon:sim"],
    tools: ["tool:calligrapher"],
  });
  assert.deepEqual(sheet.defenses, { resistances: ["dr:cold"] });
});

test("lists spells, features and gear by name only", () => {
  const { sheet } = characterPayload(akra, { users, labels, toText });

  assert.deepEqual(sheet.spellcasting, {
    ability: "Wisdom",
    dc: 14,
    attack: 6,
    slots: [
      { key: "spell1", label: "Level 1", max: 4 },
      { key: "spell2", label: "Level 2", max: 3 },
      { key: "spell3", label: "Level 3", max: 2 },
    ],
    spells: [
      { name: "Sacred Flame", level: 0, school: "Evocation", prepared: 2 },
      { name: "Guiding Bolt", level: 1, school: "Evocation", prepared: 1 },
    ],
  });
  assert.deepEqual(sheet.features, [
    { name: "Breath Weapon", kind: "race" },
    { name: "Divine Order", kind: "class" },
  ]);
  assert.deepEqual(sheet.inventory, [
    { name: "Mace", type: "weapon", quantity: 1, equipped: true },
    { name: "Chain Shirt", type: "equipment", quantity: 1, equipped: true },
    { name: "Potion of Healing", type: "consumable", quantity: 2, rarity: "Common" },
    { name: "Cloak of Protection", type: "equipment", quantity: 1, attuned: true, rarity: "Uncommon" },
  ]);
  assert.deepEqual(sheet.currency, { gp: 15, sp: 3 });
});

test("keeps the player's personality and backstory as plain text", () => {
  const { sheet } = characterPayload(akra, { users, labels, toText });

  assert.deepEqual(sheet.personality, {
    traits: "I quote scripture.",
    bonds: "My temple in Hommlet",
    flaws: "Too trusting",
    backstory: "Raised by priests.",
  });
  assert.deepEqual(sheet.details, { age: "22", eyes: "Gold" });
});

test("leaves out what changes during play", () => {
  const { sheet } = characterPayload(akra, { users, labels, toText });
  const json = JSON.stringify(sheet);

  assert.equal(sheet.hp, undefined);
  assert.doesNotMatch(json, /"value":/);
  assert.doesNotMatch(json, /"temp"/);
});

test("caps a long backstory", () => {
  const long = { ...akra, system: { ...akra.system, details: { biography: { value: "x".repeat(10000) } } } };

  assert.equal(characterPayload(long, { users, labels, toText }).sheet.personality.backstory.length, 4000);
});
