import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MONSTER_FOLDER,
  WORLD_ACTORS,
  chosenSources,
  droppedSources,
  homebrewOptions,
  homebrewPack,
  homebrewVersion,
  importedActorUuid,
  monsterActorData,
  monsterImportError,
  monsterLinkState,
  worldActorEntries,
} from "../src/homebrew.mjs";
import { INDEX_FORMAT } from "../src/compendium.mjs";
import { MODULE_ID } from "../src/constants.mjs";

test("offers World actors and the Actor compendiums the index doesn't have yet", () => {
  const packs = [
    { id: "dnd-monster-manual.actors", label: "Monsters", documentName: "Actor" },
    { id: "dnd5e.actors24", label: "Actors (SRD)", documentName: "Actor" },
    { id: "world.villains", label: "Villains", documentName: "Actor" },
    { id: "kobold-press.tome", label: "Tome of Beasts", documentName: "Actor" },
    { id: "world.loot", label: "Loot", documentName: "Item" },
    { id: "world.campaign-planner-adventures", label: "Campaign Planner Adventures", documentName: "Adventure" },
  ];

  assert.deepEqual(homebrewOptions(packs), [
    { id: "world.actors", label: "World actors" },
    { id: "kobold-press.tome", label: "Tome of Beasts" },
    { id: "world.villains", label: "Villains" },
  ]);
  assert.deepEqual(homebrewOptions(), [WORLD_ACTORS]);
  assert.deepEqual(WORLD_ACTORS, { id: "world.actors", label: "World actors" });
});

test("keeps the chosen sources once each, and finds the ones unticked", () => {
  assert.deepEqual(chosenSources(["world.actors", "world.villains", "world.actors", 3, ""]), ["world.actors", "world.villains"]);
  assert.deepEqual(chosenSources(undefined), []);
  assert.deepEqual(chosenSources({}), []);
  assert.deepEqual(droppedSources(["world.actors", "world.villains"], ["world.villains", "kobold-press.tome"]), ["world.actors"]);
  assert.deepEqual(droppedSources([], ["world.actors"]), []);
});

test("indexes the world's NPC actors like a compendium's, leaving out characters and imported monsters", () => {
  const actors = [
    { uuid: "Actor.zz0000000000000", name: "Zombie Lord", type: "npc", system: { details: { cr: 5, type: { value: "undead" } } } },
    { uuid: "Actor.hero000000000000", name: "Akra", type: "character", system: {} },
    { uuid: "Actor.aa0000000000000", name: "Ash Wraith", type: "npc", system: { details: { cr: 0.5 } } },
    { uuid: "Actor.gob000000000000", name: "Goblin", type: "npc", system: {}, flags: { [MODULE_ID]: { monsterId: "12" } } },
  ];

  assert.deepEqual(worldActorEntries(actors), [
    { uuid: "Actor.aa0000000000000", name: "Ash Wraith", challengeRating: "1/2", detail: null, category: "monster" },
    { uuid: "Actor.zz0000000000000", name: "Zombie Lord", challengeRating: "5", detail: "Undead", category: "monster" },
  ]);
  assert.deepEqual(worldActorEntries(), []);
});

test("sends a homebrew pack with its name, marked as homebrew, and a version that follows its entries", () => {
  const entries = [{ uuid: "Actor.aa0000000000000", name: "Ash Wraith", category: "monster", challengeRating: "1/2", detail: null }];
  const pack = homebrewPack(WORLD_ACTORS, entries);

  assert.deepEqual(pack, { pack: "world.actors", version: homebrewVersion(entries), entries, homebrew: true, label: "World actors" });
  assert.ok(pack.version.endsWith(`+${INDEX_FORMAT}`));
  assert.equal(homebrewVersion(entries), homebrewVersion(structuredClone(entries)));
  assert.notEqual(homebrewVersion(entries), homebrewVersion([{ ...entries[0], challengeRating: "1" }]));
  // An unticked pack goes with no entries, so Dungeon Master Guru drops it
  assert.deepEqual(homebrewPack({ id: "world.villains", label: "" }).entries, []);
  assert.equal(homebrewPack({ id: "world.villains", label: "" }).label, "world.villains");
});

test("finds the actor imported for a Dungeon Master Guru monster by its flag", () => {
  const actors = [
    { uuid: "Actor.other00000000000", flags: {} },
    { uuid: "Actor.goblin000000000", flags: { [MODULE_ID]: { monsterId: "12" } } },
    { uuid: "Actor.noflags00000000" },
  ];

  assert.equal(importedActorUuid(actors, "12"), "Actor.goblin000000000");
  assert.equal(importedActorUuid(actors, 12), "Actor.goblin000000000");
  assert.equal(importedActorUuid(actors, "13"), null);
  assert.equal(importedActorUuid(actors, null), null);
  assert.equal(importedActorUuid(undefined, "12"), null);
});

test("a Dungeon Master Guru monster links to a compendium entry, then an imported actor, else offers to import it", () => {
  const compendiumUuid = (kind, name) => (kind === "monster" && name === "Zombie" ? "Compendium.dnd5e.actors24.Actor.zombie0000000000" : null);
  const importedUuid = (id) => (id === "12" ? "Actor.goblin000000000" : null);
  const options = { compendiumUuid, importedUuid, canImport: true };

  assert.deepEqual(monsterLinkState({ id: "7", name: "Zombie" }, options), { uuid: "Compendium.dnd5e.actors24.Actor.zombie0000000000" });
  assert.deepEqual(monsterLinkState({ id: 12, name: "Goblin Boss" }, options), { uuid: "Actor.goblin000000000", imported: true });
  assert.deepEqual(monsterLinkState({ id: "99", name: "Owlbear Queen" }, options), { importId: "99" });
  // In a campaign in this world, or a browser that isn't connected: just the name
  assert.deepEqual(monsterLinkState({ id: "99", name: "Owlbear Queen" }, { ...options, canImport: false }), {});
  assert.deepEqual(monsterLinkState({ id: null, name: "Nameless" }, options), {});
  assert.deepEqual(monsterLinkState({ id: "99", name: "Owlbear Queen" }), {});
});

test("makes the imported actor in the Dungeon Master Guru folder, flagged with the monster's id", () => {
  const actor = {
    _id: "serverid00000000",
    name: "Owlbear Queen",
    type: "npc",
    folder: "elsewhere",
    sort: 5,
    ownership: { default: 3 },
    _stats: { coreVersion: "14" },
    system: { details: { cr: 5 } },
    items: [{ name: "Claw", type: "weapon" }],
    flags: { dnd5e: { kept: true }, [MODULE_ID]: { other: 1 } },
  };
  const data = monsterActorData({ id: 99, name: "Owlbear Queen", actor }, "folder0000000000");

  assert.deepEqual(data, {
    name: "Owlbear Queen",
    type: "npc",
    folder: "folder0000000000",
    system: { details: { cr: 5 } },
    items: [{ name: "Claw", type: "weapon" }],
    flags: { dnd5e: { kept: true }, [MODULE_ID]: { other: 1, monsterId: "99" } },
  });
  assert.equal(MONSTER_FOLDER, "Dungeon Master Guru");
  assert.deepEqual(
    (({ name, type, flags }) => ({ name, type, flags }))(monsterActorData({ id: "3", name: "Imp", actor: {} })),
    { name: "Imp", type: "npc", flags: { [MODULE_ID]: { monsterId: "3" } } },
  );
  assert.throws(() => monsterActorData({ id: "3", name: "Imp", actor: null }), /didn't send the monster's stat block/);
});

test("says why a monster couldn't be imported", () => {
  assert.match(monsterImportError({ status: 0 }), /Couldn't reach Dungeon Master Guru/);
  assert.match(monsterImportError({ status: 404 }), /isn't on Dungeon Master Guru any more/);
  assert.match(monsterImportError({ status: 401 }), /Connect again/);
  assert.equal(monsterImportError({ status: 422, message: "Not a dnd5e monster" }), "Not a dnd5e monster");
  assert.equal(monsterImportError(undefined), "Something went wrong.");
});
