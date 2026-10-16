export const MODULE_ID = "dorman-lakelys-campaign-planner";
export const MODULE_TITLE = "Dorman Lakely's Campaign Planner";

export const SETTINGS = {
  // The DM's personal API token. Client scope: kept in this browser only,
  // because world settings are sent to every player.
  apiToken: "apiToken",
  baseUrl: "baseUrl",
  // { uuid, name, cursor, lastSynced } for the campaign linked to this world
  campaign: "campaign",
  autoSync: "autoSync",
  // { [worldId]: draft } for the New campaign guide. Client scope, like the token.
  setupDraft: "setupDraft",
  // Whether this GM has seen the "how it works" window
  welcomed: "welcomed",
};

// Fired after every pull or push so open windows can re-render
export const SYNCED_HOOK = `${MODULE_ID}.synced`;

// One journal entry per section of the campaign, one page per record
export const SECTIONS = [
  { collection: "campaign", name: "Overview" },
  { collection: "sessions", name: "Sessions" },
  { collection: "npcs", name: "Cast" },
  { collection: "fronts", name: "Threats" },
  { collection: "quests", name: "Quests" },
  { collection: "secrets", name: "Secrets and Clues" },
  { collection: "locations", name: "Places" },
  { collection: "factions", name: "Factions" },
  { collection: "references", name: "Book References" },
];

// Tombstone record types from the server
export const TYPE_COLLECTIONS = {
  CampaignNpc: "npcs",
  CampaignLocation: "locations",
  CampaignFaction: "factions",
  CampaignFront: "fronts",
  CampaignQuest: "quests",
  CampaignSecret: "secrets",
  CampaignSession: "sessions",
  CampaignReference: "references",
};

// Records Foundry may change, and the push type the server expects
export const PUSH_TYPES = {
  fronts: "front",
  quests: "quest",
  secrets: "secret",
  sessions: "session",
  // Foundry-only fields: a place's map and an NPC's actor
  locations: "location",
  npcs: "npc",
};

export const AUTO_SYNC_MINUTES = 2;
