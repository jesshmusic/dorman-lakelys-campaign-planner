import { test } from "node:test";
import assert from "node:assert/strict";
import { COMPENDIUM_PACKS, PACK_NAMES, compendiumLookup, entryFromIndex, formatCr } from "../src/compendium.mjs";

test("indexes the core books before the SRD", () => {
  assert.ok(COMPENDIUM_PACKS.indexOf("dnd-monster-manual.actors") < COMPENDIUM_PACKS.indexOf("dnd5e.actors24"));
});

test("names every indexed pack the way Dungeon Master Guru does", () => {
  assert.deepEqual(Object.keys(PACK_NAMES).sort(), [...COMPENDIUM_PACKS].sort());
  assert.deepEqual(PACK_NAMES["dnd-monster-manual.actors"], { book: "Monster Manual", label: "Monsters" });
});

test("writes challenge ratings the way Dungeon Master Guru does", () => {
  assert.equal(formatCr(0.125), "1/8");
  assert.equal(formatCr(0.25), "1/4");
  assert.equal(formatCr(0.5), "1/2");
  assert.equal(formatCr(0), "0");
  assert.equal(formatCr(12), "12");
  assert.equal(formatCr(null), null);
  assert.equal(formatCr(""), null);
});

test("indexes a monster with its CR and creature type", () => {
  const zombie = {
    uuid: "Compendium.dnd-monster-manual.actors.Actor.mmZombie00000000",
    name: "Zombie",
    type: "npc",
    system: { details: { cr: 0.25, type: { value: "undead" } } },
  };

  assert.deepEqual(entryFromIndex("dnd-monster-manual.actors", "Actor", zombie), {
    uuid: "Compendium.dnd-monster-manual.actors.Actor.mmZombie00000000",
    name: "Zombie",
    category: "monster",
    challengeRating: "1/4",
    detail: "Undead",
  });
});

test("uses the label of a custom creature type", () => {
  const spirit = {
    uuid: "u",
    name: "Conjured Fire Elemental",
    type: "npc",
    system: { details: { cr: null, type: { value: "custom", custom: "Intangible Spirit" } } },
  };

  assert.equal(entryFromIndex("dnd-players-handbook.actors", "Actor", spirit).detail, "Intangible Spirit");
  assert.equal(entryFromIndex("dnd-players-handbook.actors", "Actor", { ...spirit, system: {} }).detail, null);
});

test("leaves out actors that are not creatures", () => {
  assert.equal(entryFromIndex("dnd5e.actors24", "Actor", { uuid: "u", name: "Hero", type: "character" }), null);
});

test("indexes spells with their level and school", () => {
  const labels = { schoolLabel: (key) => ({ evo: "Evocation", abj: "Abjuration" })[key] };
  const fireball = { uuid: "u1", name: "Fireball", type: "spell", system: { level: 3, school: "evo" } };
  const ward = { uuid: "u2", name: "Resistance", type: "spell", system: { level: 0, school: "abj" } };

  assert.equal(entryFromIndex("dnd5e.spells24", "Item", fireball, labels).detail, "Level 3 Evocation");
  assert.deepEqual(entryFromIndex("dnd5e.spells24", "Item", ward, labels), {
    uuid: "u2",
    name: "Resistance",
    category: "spell",
    challengeRating: null,
    detail: "Cantrip Abjuration",
  });
});

test("sorts items into magic items and equipment", () => {
  const labels = { rarityLabel: (key) => ({ veryRare: "Very Rare" })[key] };
  const item = (type, rarity) => ({ uuid: "u", name: "Thing", type, system: { rarity } });

  assert.deepEqual(
    [
      entryFromIndex("dnd5e.equipment24", "Item", item("equipment", "veryRare"), labels),
      entryFromIndex("dnd5e.equipment24", "Item", item("tool", "")),
      entryFromIndex("dnd-dungeon-masters-guide.equipment", "Item", item("equipment", "")),
      entryFromIndex("dnd-dungeon-masters-guide.equipment", "Item", item("loot", "")),
    ].map(({ category, detail }) => [category, detail]),
    [
      ["magic_item", "Very Rare"],
      ["equipment", "Tool"],
      ["magic_item", "Rarity varies"],
      ["equipment", "Loot"],
    ],
  );
});

test("leaves out feats, classes and other item types", () => {
  assert.equal(entryFromIndex("dnd-dungeon-masters-guide.equipment", "Item", { name: "Charm", type: "feat" }), null);
});

test("indexes roll tables with their folder name", () => {
  const table = { uuid: "u", name: "Level 11-16", folder: "f1" };
  const labels = { folderName: (id) => (id === "f1" ? "Random Magic Items" : null) };

  assert.deepEqual(entryFromIndex("dnd5e.tables24", "RollTable", table, labels), {
    uuid: "u",
    name: "Level 11-16",
    category: "table",
    challengeRating: null,
    detail: "Random Magic Items",
  });
  assert.equal(entryFromIndex("dnd5e.tables24", "RollTable", { uuid: "u", name: "Loose" }).detail, null);
});

test("leaves out other document types", () => {
  assert.equal(entryFromIndex("dnd-players-handbook.content", "JournalEntry", { uuid: "u", name: "Rules" }), null);
});

test("finds monsters and items by name, preferring the first pack", () => {
  const lookup = compendiumLookup([
    { id: "mm", documentName: "Actor", index: [{ name: "Zombie", uuid: "mm-zombie", type: "npc" }] },
    {
      id: "srd",
      documentName: "Actor",
      index: [
        { name: "Zombie", uuid: "srd-zombie", type: "npc" },
        { name: "Ghoul", uuid: "srd-ghoul", type: "npc" },
        { name: "Hero", uuid: "srd-hero", type: "character" },
      ],
    },
    {
      id: "items",
      documentName: "Item",
      index: [
        { name: "Bag of Holding", uuid: "bag", type: "container" },
        { name: "Fireball", uuid: "fireball", type: "spell" },
      ],
    },
  ]);

  assert.equal(lookup("monster", "zombie"), "mm-zombie");
  assert.equal(lookup("monster", "Ghoul"), "srd-ghoul");
  assert.equal(lookup("monster", "Hero"), null);
  assert.equal(lookup("item", "Bag of Holding"), "bag");
  assert.equal(lookup("item", "Fireball"), null);
  assert.equal(lookup("monster", "Bag of Holding"), null);
  assert.equal(lookup("monster", null), null);
});
