// Handing out a quest's reward or a session's treasure: its items, coins and
// XP, who gets what, and the currencies for an Item Piles pile. No Foundry
// globals, so it can be tested in Node.
import { COINS } from "./planner.mjs";

/**
 * The items in a reward: book references that aren't monsters, and items
 * picked from Dungeon Master Guru's own SRD list, with how many of each.
 * An item without a Foundry link (uuid null) has to be handed out by hand.
 * @param {{ links?: object[] }} owner a quest or a session
 * @param {{ references: Map<string, object>, compendiumUuid?: (kind: string, name: string) => string|null }} context
 * @returns {{ key: string, name: string, uuid: string|null, quantity: number }[]}
 */
export function rewardItems(owner, { references, compendiumUuid }) {
  const quantity = (link) => Math.max(1, Math.floor(Number(link.quantity) || 1));
  return (owner.links ?? []).flatMap((link) => {
    if (link.linkableType === "CampaignReference") {
      const reference = references.get(String(link.linkableId));
      if (!reference || reference.category === "monster") return [];
      return [{ key: `ref-${reference.id}`, name: reference.name, uuid: reference.foundryUuid ?? null, quantity: quantity(link) }];
    }
    if (link.linkableType === "Item") {
      const uuid = compendiumUuid?.("item", link.name) ?? null;
      return [{ key: `item-${link.linkableId}`, name: link.name, uuid, quantity: quantity(link) }];
    }
    return [];
  });
}

/** Coins as whole, non-negative numbers of each kind: { pp, gp, ep, sp, cp } */
export const coinsOf = (currency) =>
  Object.fromEntries(COINS.map((coin) => [coin, Math.max(0, Math.floor(Number(currency?.[coin]) || 0))]));

export const hasCoins = (coins) => COINS.some((coin) => coins[coin] > 0);

/**
 * Splits coins evenly among some characters. Each kind of coin is shared on
 * its own; what doesn't divide evenly goes one coin at a time to the first
 * characters, so nothing is lost.
 * @returns {object[]} one { pp, gp, ep, sp, cp } per character
 */
export function splitCoins(currency, count) {
  if (count < 1) return [];
  const coins = coinsOf(currency);
  return Array.from({ length: count }, (_, index) =>
    Object.fromEntries(
      COINS.map((coin) => {
        const share = Math.floor(coins[coin] / count);
        return [coin, share + (index < coins[coin] % count ? 1 : 0)];
      }),
    ),
  );
}

/**
 * XP for each character: split among them (the rule for XP a group earns),
 * or the whole amount each.
 * @returns {number[]}
 */
export function splitXp(xp, count, { each = false } = {}) {
  if (count < 1) return [];
  const total = Math.max(0, Math.floor(Number(xp) || 0));
  if (each) return Array(count).fill(total);
  const share = Math.floor(total / count);
  return Array.from({ length: count }, (_, index) => share + (index < total % count ? 1 : 0));
}

/**
 * Coins in the form Item Piles reads, from its own currency list, so it works
 * whatever the game system calls them: "50GP 10SP" for dnd5e.
 * @param {{ abbreviation?: string, data?: { path?: string } }[]} currencies game.itempiles.API.CURRENCIES
 */
export function pileCurrencies(currency, currencies = []) {
  const coins = coinsOf(currency);
  return COINS.filter((coin) => coins[coin] > 0)
    .map((coin) => {
      const match = currencies.find((c) => c.data?.path?.split(".").pop() === coin && c.abbreviation?.includes("{#}"));
      return match ? match.abbreviation.replace("{#}", coins[coin]) : null;
    })
    .filter(Boolean)
    .join(" ");
}

/** "50 gp, 10 sp": coins for a person to read */
export const coinsText = (currency) => {
  const coins = coinsOf(currency);
  return COINS.filter((coin) => coins[coin] > 0)
    .map((coin) => `${coins[coin]} ${coin}`)
    .join(", ");
};
