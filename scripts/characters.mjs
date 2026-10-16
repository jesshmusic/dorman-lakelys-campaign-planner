// Player character sheets sent to Dungeon Master Guru. No Foundry globals, so
// it can be tested in Node.
//
// A sheet holds what the player built: stats, class levels, and the names of
// spells, features and gear, never rules text from the books. It leaves out
// what changes every round (current HP, spell slots left), so play doesn't
// trigger a send each time.

const ABILITIES = ["str", "dex", "con", "int", "wis", "cha"];
const SPEEDS = ["walk", "burrow", "climb", "fly", "swim"];
const ITEM_TYPES = ["weapon", "equipment", "consumable", "container", "loot", "tool"];
const OWNER = 3;
const MAX_TEXT = 500;
const MAX_BACKSTORY = 4000;
const MAX_LIST = 200;

const capitalize = (value) => (value ? `${value[0].toUpperCase()}${value.slice(1)}` : "");
const DEFAULT_LABELS = {
  ability: (key) => key.toUpperCase(),
  skill: capitalize,
  trait: (_trait, key) => capitalize(key),
  school: capitalize,
  size: capitalize,
  rarity: capitalize,
  sense: capitalize,
};

const list = (values) => [...(values ?? [])];
const text = (value, max = MAX_TEXT) => {
  const trimmed = String(value ?? "").trim();
  return trimmed ? trimmed.slice(0, max) : null;
};
const number = (value) => (typeof value === "number" && Number.isFinite(value) ? value : null);
// Leaves out empty values so the sheet stays small
const compact = (object) =>
  Object.fromEntries(
    Object.entries(object).filter(
      ([, value]) =>
        value !== null &&
        value !== undefined &&
        value !== "" &&
        !(Array.isArray(value) && !value.length) &&
        !(value.constructor === Object && !Object.keys(value).length),
    ),
  );

/** Non-GM users who play the actor or own it */
export function playersOf(actor, users) {
  return users.filter(
    (user) => !user.isGM && (user.character?.id === actor.id || actor.ownership?.[user.id] === OWNER),
  );
}

/** Only Player Character actors: not NPCs (even ones a player owns), vehicles or groups */
export function isPlayerCharacter(actor) {
  return actor.type === "character";
}

/**
 * What the module sends for one character.
 * @param {object} actor a dnd5e actor
 * @param {{ users?: object[], labels?: object, toText?: (html: string) => string }} options
 */
export function characterPayload(actor, { users = [], labels = {}, toText = (html) => String(html ?? "") } = {}) {
  const players = playersOf(actor, users);
  const sheet = characterSheet(actor, { labels: { ...DEFAULT_LABELS, ...labels }, toText });
  return {
    uuid: actor.uuid,
    name: actor.name,
    playerName: players.map((user) => user.name).join(", ") || null,
    assigned: players.length > 0,
    level: sheet.level ?? null,
    sheet,
  };
}

function characterSheet(actor, { labels, toText }) {
  const system = actor.system ?? {};
  const details = system.details ?? {};
  const attributes = system.attributes ?? {};
  const traits = system.traits ?? {};
  const items = list(actor.items);
  const ofType = (type) => items.filter((item) => item.type === type);

  const classes = ofType("class").map((item) =>
    compact({ name: item.name, subclass: item.subclass?.name ?? null, levels: number(item.system?.levels) }),
  );
  const species = ofType("race")[0]?.name ?? text(details.race?.name ?? details.race);
  const level = number(details.level);
  const classLine = classes
    .map(
      (c) => `${c.name}${c.subclass ? ` (${c.subclass})` : ""}${classes.length > 1 && c.levels ? ` ${c.levels}` : ""}`,
    )
    .join(" / ");
  const summary = [level && `Level ${level}`, species, classLine].filter(Boolean).join(" ");

  const traitList = (trait, data) => [
    ...list(data?.value).map((key) => labels.trait(trait, key)),
    ...String(data?.custom ?? "")
      .split(";")
      .map((value) => value.trim())
      .filter(Boolean),
  ];

  const spells = ofType("spell")
    .map((item) =>
      compact({
        name: item.name,
        level: number(item.system?.level) ?? 0,
        school: item.system?.school ? labels.school(item.system.school) : null,
        // 0 not prepared, 1 prepared, 2 always prepared
        prepared: number(item.system?.prepared),
      }),
    )
    .sort((a, b) => a.level - b.level || a.name.localeCompare(b.name))
    .slice(0, MAX_LIST);
  const slots = Object.entries(system.spells ?? {})
    .filter(([, slot]) => slot?.max)
    .map(([key, slot]) => ({
      key,
      label: key === "pact" ? "Pact" : `Level ${key.replace("spell", "")}`,
      max: slot.max,
    }));
  const spellcasting =
    attributes.spellcasting || spells.length
      ? compact({
          ability: attributes.spellcasting ? labels.ability(attributes.spellcasting) : null,
          dc: number(attributes.spell?.dc),
          attack: number(attributes.spell?.attack),
          slots,
          spells,
        })
      : null;

  const ranges = attributes.senses?.ranges ?? attributes.senses ?? {};
  const senses = [
    ...Object.entries(ranges)
      .filter(([, range]) => typeof range === "number" && range > 0)
      .map(([key, range]) => `${labels.sense(key)} ${range} ${attributes.senses?.units ?? "ft"}`),
    text(attributes.senses?.special),
  ].filter(Boolean);

  const movement = attributes.movement ?? {};
  const speed = Object.fromEntries(SPEEDS.filter((key) => movement[key] > 0).map((key) => [key, movement[key]]));

  return compact({
    summary: text(summary),
    level,
    species,
    background: ofType("background")[0]?.name ?? null,
    classes,
    alignment: text(details.alignment),
    size: traits.size ? labels.size(traits.size) : null,
    xp: number(details.xp?.value),
    ac: number(attributes.ac?.value),
    hpMax: number(attributes.hp?.max),
    initiative: number(attributes.init?.total),
    proficiency: number(attributes.prof),
    speed: Object.keys(speed).length ? speed : null,
    senses,
    abilities: ABILITIES.map((key) => {
      const ability = system.abilities?.[key] ?? {};
      return compact({
        key,
        label: labels.ability(key),
        score: number(ability.value),
        mod: number(ability.mod),
        save: number(ability.save?.value ?? ability.save),
        proficient: Boolean(ability.proficient),
      });
    }),
    skills: Object.entries(system.skills ?? {})
      .map(([key, skill]) =>
        compact({
          key,
          label: labels.skill(key),
          ability: skill.ability ? labels.ability(skill.ability) : null,
          total: number(skill.total),
          passive: number(skill.passive),
          // 0 none, 0.5 half, 1 proficient, 2 expertise
          proficiency: number(skill.value) ?? 0,
        }),
      )
      .sort((a, b) => a.label.localeCompare(b.label)),
    passives: compact({
      perception: number(system.skills?.prc?.passive),
      insight: number(system.skills?.ins?.passive),
      investigation: number(system.skills?.inv?.passive),
    }),
    languages: traitList("languages", traits.languages),
    proficiencies: compact({
      armor: traitList("armor", traits.armorProf),
      weapons: traitList("weapon", traits.weaponProf),
      tools: Object.keys(system.tools ?? {}).map((key) => labels.trait("tool", key)),
    }),
    defenses: compact({
      resistances: traitList("dr", traits.dr),
      immunities: traitList("di", traits.di),
      vulnerabilities: traitList("dv", traits.dv),
      conditionImmunities: traitList("ci", traits.ci),
    }),
    spellcasting,
    features: ofType("feat")
      .map((item) => compact({ name: item.name, kind: item.system?.type?.value ?? null }))
      .slice(0, MAX_LIST),
    inventory: items
      .filter((item) => ITEM_TYPES.includes(item.type))
      .map((item) =>
        compact({
          name: item.name,
          type: item.type,
          quantity: number(item.system?.quantity) ?? 1,
          equipped: Boolean(item.system?.equipped) || null,
          attuned: Boolean(item.system?.attuned) || null,
          rarity: item.system?.rarity ? labels.rarity(item.system.rarity) : null,
        }),
      )
      .slice(0, MAX_LIST),
    currency: compact(
      Object.fromEntries(["pp", "gp", "ep", "sp", "cp"].map((key) => [key, number(system.currency?.[key]) || null])),
    ),
    personality: compact({
      traits: text(toText(details.trait)),
      ideals: text(toText(details.ideal)),
      bonds: text(toText(details.bond)),
      flaws: text(toText(details.flaw)),
      appearance: text(toText(details.appearance)),
      backstory: text(toText(details.biography?.value), MAX_BACKSTORY),
    }),
    details: compact(
      Object.fromEntries(
        ["gender", "age", "height", "weight", "eyes", "hair", "skin", "faith"].map((key) => [key, text(details[key])]),
      ),
    ),
  });
}
