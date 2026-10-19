import { test } from "node:test";
import assert from "node:assert/strict";
import { coinsOf, coinsText, hasCoins, pileCurrencies, rewardItems, splitCoins, splitXp } from "../src/reward.mjs";

const references = new Map([
  ["1", { id: "1", name: "Potion of Healing", category: "magic_item", foundryUuid: "Compendium.dnd-players-handbook.equipment.Item.potion" }],
  ["2", { id: "2", name: "Zombie", category: "monster", foundryUuid: "Compendium.dnd-monster-manual.actors.Actor.zombie" }],
  ["3", { id: "3", name: "Map of the Barrows", category: "other", foundryUuid: null }],
]);

test("a reward's items are its book references that aren't monsters, and its SRD items, with how many", () => {
  const quest = {
    links: [
      { linkableType: "CampaignReference", linkableId: "1", quantity: 3 },
      { linkableType: "CampaignReference", linkableId: "2", quantity: 4 },
      { linkableType: "CampaignReference", linkableId: "3", quantity: null },
      { linkableType: "Item", linkableId: 77, name: "Rope, Hempen", quantity: 2 },
      { linkableType: "CampaignNpc", linkableId: "9", name: "Kalvar" },
      { linkableType: "CampaignReference", linkableId: "404" },
    ],
  };
  const compendiumUuid = (kind, name) => (kind === "item" && name === "Rope, Hempen" ? "Compendium.dnd5e.items.Item.rope" : null);

  assert.deepEqual(rewardItems(quest, { references, compendiumUuid }), [
    { key: "ref-1", name: "Potion of Healing", uuid: "Compendium.dnd-players-handbook.equipment.Item.potion", quantity: 3 },
    { key: "ref-3", name: "Map of the Barrows", uuid: null, quantity: 1 },
    { key: "item-77", name: "Rope, Hempen", uuid: "Compendium.dnd5e.items.Item.rope", quantity: 2 },
  ]);
});

test("a reward with no links has no items", () => {
  assert.deepEqual(rewardItems({}, { references }), []);
});

test("coins are whole numbers, never negative", () => {
  assert.deepEqual(coinsOf({ gp: "50", sp: 2.7, cp: -3 }), { pp: 0, gp: 50, ep: 0, sp: 2, cp: 0 });
  assert.equal(hasCoins(coinsOf(null)), false);
  assert.equal(hasCoins(coinsOf({ cp: 1 })), true);
  assert.equal(coinsText({ gp: 50, sp: 10 }), "50 gp, 10 sp");
});

test("coins split evenly, and what doesn't divide goes to the first characters one coin at a time", () => {
  assert.deepEqual(splitCoins({ gp: 50, sp: 10, cp: 1 }, 3), [
    { pp: 0, gp: 17, ep: 0, sp: 4, cp: 1 },
    { pp: 0, gp: 17, ep: 0, sp: 3, cp: 0 },
    { pp: 0, gp: 16, ep: 0, sp: 3, cp: 0 },
  ]);
  const total = splitCoins({ gp: 50 }, 3).reduce((sum, share) => sum + share.gp, 0);
  assert.equal(total, 50);
  assert.deepEqual(splitCoins({ gp: 5 }, 0), []);
});

test("XP is shared among the characters, or given to each of them", () => {
  assert.deepEqual(splitXp(450, 3), [150, 150, 150]);
  assert.deepEqual(splitXp(100, 3), [34, 33, 33]);
  assert.deepEqual(splitXp(450, 3, { each: true }), [450, 450, 450]);
  assert.deepEqual(splitXp(null, 2), [0, 0]);
  assert.deepEqual(splitXp(450, 0), []);
});

test("an item pile gets its coins in Item Piles' own currency format", () => {
  const currencies = [
    { abbreviation: "{#}PP", data: { path: "system.currency.pp" } },
    { abbreviation: "{#}GP", data: { path: "system.currency.gp" } },
    { abbreviation: "{#}SP", data: { path: "system.currency.sp" } },
  ];

  assert.equal(pileCurrencies({ gp: 50, sp: 10, pp: 1 }, currencies), "1PP 50GP 10SP");
  // A coin Item Piles doesn't know is left for the GM to add
  assert.equal(pileCurrencies({ gp: 5, cp: 9 }, currencies), "5GP");
  assert.equal(pileCurrencies({ gp: 5 }, []), "");
});
