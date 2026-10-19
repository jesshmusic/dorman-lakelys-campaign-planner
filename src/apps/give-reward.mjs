import { escapeHtml } from "../render.mjs";
import { MODULE_ID } from "../constants.mjs";
import { COMPENDIUM_PACKS, compendiumLookup } from "../compendium.mjs";
import { isPlayerCharacter } from "../characters.mjs";
import { coinsOf, coinsText, hasCoins, pileCurrencies, rewardItems, splitCoins, splitXp } from "../reward.mjs";

const ITEM_PILES = "item-piles";

// Who can get it: the campaign's party if it has one, or else the world's player characters
function candidates(sync) {
  const campaign = sync.recordLists().campaign[0];
  const party = (campaign?.partyActorUuids ?? []).map((uuid) => fromUuidSync(uuid)).filter((a) => a?.documentName === "Actor");
  return party.length ? party : game.actors.filter((actor) => isPlayerCharacter(actor));
}

// Dungeon Master Guru's own SRD items link to the compendium entry of the same name
function compendiumUuid(sync) {
  const campaign = sync.recordLists().campaign[0];
  const excluded = campaign?.excludedCompendiumPacks ?? [];
  const packs = COMPENDIUM_PACKS.filter((id) => !excluded.includes(id))
    .map((id) => game.packs.get(id))
    .filter(Boolean)
    .map((pack) => ({ id: pack.collection, documentName: pack.documentName, index: pack.index.contents }));
  return compendiumLookup(packs);
}

// Only systems whose characters keep coins and XP on the sheet (like dnd5e) get them added; elsewhere they're listed
const holdsCoins = (actor) => typeof actor.system?.currency === "object" && actor.system.currency !== null;
const holdsXp = (actor) => typeof actor.system?.details?.xp?.value === "number";

// Item Piles can only make piles once it's set up for the game system (for dnd5e, by its "Item Piles: D&D 5e" add-on)
const itemPilesActive = () => Boolean(game.modules.get(ITEM_PILES)?.active && game.itempiles?.API);
const itemPilesReady = () => itemPilesActive() && Boolean(game.itempiles.API.ACTOR_CLASS_TYPE);

/**
 * Opens the dialog for handing out a quest's reward or a session's treasure:
 * give its items, coins and XP to the characters, or (with Item Piles) leave
 * it on the scene as a pile.
 * @param {{ title: string, label: string, owner: object, coins?: object, xp?: number|null, milestone?: boolean }} reward
 *   label: "Reward" or "Treasure"; owner: the quest or session, for its links
 */
export async function giveReward({ title, label, owner, coins = null, xp = null, milestone = false }) {
  const sync = game.modules.get(MODULE_ID).api.sync;
  const items = rewardItems(owner, { references: sync.records().references, compendiumUuid: compendiumUuid(sync) });
  const reward = { title, label, items, coins: coinsOf(coins), xp: Math.max(0, Math.floor(Number(xp) || 0)), milestone };
  if (!items.length && !hasCoins(reward.coins) && !reward.xp && !milestone) {
    return ui.notifications.info(`${title} has no ${label.toLowerCase()} to give yet.`);
  }
  const actors = candidates(sync);
  const pile = Boolean(itemPilesReady() && canvas.scene);

  const buttons = [];
  if (actors.length) buttons.push({ action: "give", label: "Give to the characters", icon: "fas fa-hand-holding", default: true });
  if (pile) buttons.push({ action: "pile", label: "Create an item pile", icon: "fas fa-box-open" });
  buttons.push({ action: "cancel", label: "Cancel", icon: "fas fa-times" });

  let form = null;
  const action = await foundry.applications.api.DialogV2.wait({
    window: { title: `${label}: ${title}`, icon: "fas fa-gem" },
    position: { width: 520 },
    classes: ["dlcp-app", "dlcp-reward"],
    content: dialogContent(reward, actors, { pile, pileNotReady: itemPilesActive() && !itemPilesReady() }),
    buttons: buttons.map((button) => ({
      ...button,
      callback: (event, target) => {
        form = target.form;
        return button.action;
      },
    })),
    rejectClose: false,
  });
  if (!action || action === "cancel" || !form) return;
  const values = new foundry.applications.ux.FormDataExtended(form).object;
  try {
    if (action === "give") await giveToCharacters(reward, actors, values);
    if (action === "pile") await createPile(reward);
  } catch (error) {
    console.error(`${MODULE_ID} | Couldn't hand out the ${label.toLowerCase()}`, error);
    ui.notifications.error(`Couldn't hand out the ${label.toLowerCase()}: ${error.message}`);
  }
}

function dialogContent(reward, actors, { pile, pileNotReady }) {
  const { items, coins, xp, milestone, label } = reward;
  const who = actors.length
    ? `<fieldset>
        <legend>Coins and XP go to</legend>
        ${actors
          .map(
            (actor) => `<label class="dlcp-check"><input type="checkbox" name="to.${actor.id}" checked> ${escapeHtml(actor.name)}</label>`,
          )
          .join("")}
      </fieldset>`
    : `<p class="dlcp-notice dlcp-notice--warning">This world has no player characters to give it to.${pile ? " You can leave it on the scene as an item pile." : ""}</p>`;
  const options = (selected) =>
    [`<option value="">Nobody</option>`, ...actors.map((actor) => `<option value="${actor.id}" ${actor.id === selected ? "selected" : ""}>${escapeHtml(actor.name)}</option>`)].join("");
  const rows = items
    .map((item) => {
      const name = item.uuid
        ? `<a class="content-link" draggable="true" data-uuid="${escapeHtml(item.uuid)}" data-link><i class="fas fa-suitcase"></i>${escapeHtml(item.name)}</a>`
        : escapeHtml(item.name);
      const giveTo =
        item.uuid && actors.length
          ? `<select name="item.${escapeHtml(item.key)}" aria-label="Who gets ${escapeHtml(item.name)}">${options(actors[0].id)}</select>`
          : `<span class="dlcp-muted">${item.uuid ? "" : "Not in your compendiums: hand it out yourself"}</span>`;
      return `<tr><td>${name}</td><td>${item.quantity > 1 ? `×${item.quantity}` : ""}</td><td>${giveTo}</td></tr>`;
    })
    .join("");
  const coinLine = hasCoins(coins)
    ? `<p><strong>Coins:</strong> ${escapeHtml(coinsText(coins))}${actors.length ? ", shared evenly" : ""}</p>`
    : "";
  const xpLine = xp
    ? `<p><strong>XP:</strong> ${xp}
        ${
          actors.length
            ? `<select name="xpMode" aria-label="How the XP is given">
                <option value="split">shared among them</option>
                <option value="each">for each of them</option>
              </select>`
            : ""
        }</p>`
    : "";
  return `
    ${who}
    ${rows ? `<table class="dlcp-reward-items"><thead><tr><th>${label === "Reward" ? "Items" : "Treasure"}</th><th></th><th>Goes to</th></tr></thead><tbody>${rows}</tbody></table>` : ""}
    ${coinLine}
    ${xpLine}
    ${milestone ? `<p><strong>Milestone:</strong> the characters level up. Level them up on their sheets.</p>` : ""}
    ${
      pileNotReady
        ? `<p class="dlcp-muted">Item Piles isn't set up for ${escapeHtml(game.system.title)} yet, so it can't make a pile. Turn on
            its add-on for this system in Manage Modules (for D&D 5e, "Item Piles: D&D 5e").</p>`
        : ""
    }`;
}

async function giveToCharacters(reward, actors, values) {
  const byId = new Map(actors.map((actor) => [actor.id, actor]));
  const chosen = actors.filter((actor) => values[`to.${actor.id}`]);
  const got = new Map(actors.map((actor) => [actor.id, []]));
  const byHand = [];

  for (const item of reward.items) {
    const actor = byId.get(values[`item.${item.key}`]);
    if (!item.uuid) {
      byHand.push(item.name);
      continue;
    }
    if (!actor) continue;
    const document = await fromUuid(item.uuid);
    if (document?.documentName !== "Item") {
      byHand.push(item.name);
      continue;
    }
    await addItem(actor, document, item.quantity);
    got.get(actor.id).push(item.quantity > 1 ? `${item.name} ×${item.quantity}` : item.name);
  }

  if (chosen.length) {
    const coinShares = splitCoins(reward.coins, chosen.length);
    const xpShares = splitXp(reward.xp, chosen.length, { each: values.xpMode === "each" });
    for (const [index, actor] of chosen.entries()) {
      const update = {};
      if (hasCoins(reward.coins) && holdsCoins(actor)) {
        for (const [coin, amount] of Object.entries(coinShares[index])) {
          if (amount) update[`system.currency.${coin}`] = (Number(actor.system.currency[coin]) || 0) + amount;
        }
        if (hasCoins(coinShares[index])) got.get(actor.id).push(coinsText(coinShares[index]));
      }
      if (reward.xp && holdsXp(actor) && xpShares[index]) {
        update["system.details.xp.value"] = actor.system.details.xp.value + xpShares[index];
        got.get(actor.id).push(`${xpShares[index]} XP`);
      }
      if (Object.keys(update).length) await actor.update(update);
    }
  }
  if (hasCoins(reward.coins) && !(chosen.length && chosen.every(holdsCoins))) byHand.push(coinsText(reward.coins));
  if (reward.xp && !(chosen.length && chosen.every(holdsXp))) byHand.push(`${reward.xp} XP`);

  const lines = actors
    .filter((actor) => got.get(actor.id).length)
    .map((actor) => `<li><strong>${escapeHtml(actor.name)}:</strong> ${escapeHtml(got.get(actor.id).join(", "))}</li>`);
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ user: game.user }),
    content: `<h3>${escapeHtml(reward.label)}: ${escapeHtml(reward.title)}</h3>
      ${lines.length ? `<ul>${lines.join("")}</ul>` : ""}
      ${byHand.length ? `<p>Also: ${escapeHtml(byHand.join(", "))}</p>` : ""}
      ${reward.milestone ? "<p><strong>Milestone:</strong> everyone levels up.</p>" : ""}`,
  });
  ui.notifications.info(`Gave out the ${reward.label.toLowerCase()} for ${reward.title}.`);
}

// Gives a character an item: adds to a stack they already have (same source, or same name and type), or makes one
async function addItem(actor, document, quantity) {
  const data = game.items.fromCompendium(document);
  const stacks = foundry.utils.hasProperty(data, "system.quantity");
  const existing =
    stacks &&
    actor.items.find(
      (owned) =>
        owned._stats?.compendiumSource === document.uuid ||
        (owned.name === data.name && owned.type === data.type && foundry.utils.hasProperty(owned, "system.quantity")),
    );
  if (existing) return existing.update({ "system.quantity": (Number(existing.system.quantity) || 0) + quantity });
  if (stacks) foundry.utils.setProperty(data, "system.quantity", quantity);
  return actor.createEmbeddedDocuments("Item", [data]);
}

// Leaves the reward on the scene you're viewing, in the middle of the screen
async function createPile(reward) {
  const api = game.itempiles.API;
  const quantityPath = api.ITEM_QUANTITY_ATTRIBUTE || "system.quantity";
  const items = [];
  const left = [];
  for (const item of reward.items) {
    const document = item.uuid ? await fromUuid(item.uuid) : null;
    if (document?.documentName !== "Item") {
      left.push(item.name);
      continue;
    }
    const data = game.items.fromCompendium(document);
    if (foundry.utils.hasProperty(data, quantityPath)) foundry.utils.setProperty(data, quantityPath, item.quantity);
    items.push(data);
  }
  const { x, y } = canvas.stage.pivot;
  const position = canvas.grid.getSnappedPoint({ x, y }, { mode: CONST.GRID_SNAPPING_MODES.TOP_LEFT_VERTEX });
  const name = `${reward.title} (${reward.label.toLowerCase()})`;
  const { tokenUuid } = await api.createItemPile({
    position,
    sceneId: canvas.scene.id,
    items,
    tokenOverrides: { name },
  });

  if (hasCoins(reward.coins)) {
    const currencies = pileCurrencies(reward.coins, api.CURRENCIES ?? []);
    if (currencies) await api.addCurrencies(tokenUuid, currencies);
    else left.push(coinsText(reward.coins));
  }
  ui.notifications.info(
    left.length
      ? `Made an item pile for ${reward.title}. Add these yourself: ${left.join(", ")}.`
      : `Made an item pile for ${reward.title} on ${canvas.scene.name}.`,
  );
}
