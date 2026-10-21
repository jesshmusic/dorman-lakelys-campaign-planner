export const MODULE_ID = "dorman-lakelys-campaign-planner";
export const MODULE_TITLE = "Dorman Lakely's Campaign Planner";

export const SETTINGS = {
  // The DM's personal API token. Client scope: kept in this browser only,
  // because world settings are sent to every player.
  apiToken: "apiToken",
  // { uuid, name, cursor, lastSynced } for the campaign linked to this world
  campaign: "campaign",
  // { [worldId]: draft } for the New campaign guide. Client scope, like the token.
  setupDraft: "setupDraft",
  // Whether this GM has seen the "how it works" window (before the chat welcome)
  welcomed: "welcomed",
  // The version the welcome or what's-new chat message was last posted for
  lastVersion: "lastVersion",
  // Whether the Campaign Dashboard opens when the world loads. User scope: each GM chooses, per world.
  openDashboard: "openDashboardOnStartup",
  // The New campaign guide's words as last fetched from Dungeon Master Guru. Client scope.
  setupGuide: "setupGuide",
  // Techniques a DM can switch off for this world (see techniques.mjs). World scope, GM only.
  useTruths: "useTruths",
  useClocks: "useClocks",
  usePortents: "usePortents",
  useSecrets: "useSecrets",
  useThreeClueRule: "useThreeClueRule",
  useGettingStarted: "useGettingStarted",
  // The homebrew monster sources whose index goes to Dungeon Master Guru: "world-actors.<world id>" and Actor
  // compendium ids (see homebrew.mjs). World scope, GM only.
  homebrewSources: "homebrewSources",
};

// Fired after every pull or push so open windows can re-render
export const SYNCED_HOOK = `${MODULE_ID}.synced`;

// One journal entry per section of the campaign, one page per record, in
// the Journal sidebar's order. Encounters came later: it sorts after Quests
// in campaigns made before it, too.
export const SECTIONS = [
  { collection: "campaign", name: "Overview", sort: 1000 },
  { collection: "sessions", name: "Sessions", sort: 2000 },
  { collection: "npcs", name: "Cast", sort: 3000 },
  { collection: "fronts", name: "Threats", sort: 4000 },
  { collection: "quests", name: "Quests", sort: 5000 },
  { collection: "encounters", name: "Encounters", sort: 5500 },
  { collection: "secrets", name: "Secrets and Clues", sort: 6000 },
  { collection: "locations", name: "Places", sort: 7000 },
  { collection: "factions", name: "Factions", sort: 8000 },
  { collection: "references", name: "Book References", sort: 9000 },
];

// Tombstone record types from the server
export const TYPE_COLLECTIONS = {
  CampaignNpc: "npcs",
  CampaignLocation: "locations",
  CampaignFaction: "factions",
  CampaignFront: "fronts",
  CampaignQuest: "quests",
  CampaignEncounter: "encounters",
  CampaignSecret: "secrets",
  CampaignSession: "sessions",
  CampaignReference: "references",
};

// Records Foundry may change, and the push type the server expects
// The sync's name for each kind of record Foundry can change on Dungeon Master Guru
export const PUSH_TYPES = {
  campaign: "campaign",
  factions: "faction",
  fronts: "front",
  quests: "quest",
  encounters: "encounter",
  secrets: "secret",
  sessions: "session",
  locations: "location",
  npcs: "npc",
  references: "reference",
};

