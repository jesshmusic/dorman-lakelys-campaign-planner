import { DEFAULT_BASE_URL } from "./api.mjs";
import { CampaignSync } from "./sync.mjs";
import { ConnectApp } from "./apps/connect-app.mjs";
import { DashboardApp } from "./apps/dashboard-app.mjs";
import { DmGuruLink, PatreonLink } from "./apps/link-apps.mjs";
import { AUTO_SYNC_MINUTES, MODULE_ID, MODULE_TITLE, SETTINGS } from "./constants.mjs";

const sync = new CampaignSync();
let dashboard = null;
let connect = null;
let autoSyncTimer = null;

function openDashboard() {
  dashboard ??= new DashboardApp();
  dashboard.render({ force: true });
}

function openConnect() {
  connect ??= new ConnectApp();
  connect.render({ force: true });
}

async function autoSync({ notifyErrors = false } = {}) {
  if (!sync.ready) return;
  try {
    await sync.pull();
  } catch (error) {
    console.warn(`${MODULE_TITLE} | Sync failed`, error);
    if (notifyErrors || error.unauthorized || error.premiumRequired) {
      ui.notifications.warn(`${MODULE_TITLE}: ${error.message}`);
    }
  }
}

function scheduleAutoSync() {
  clearInterval(autoSyncTimer);
  autoSyncTimer = null;
  if (game.user.isGM && game.settings.get(MODULE_ID, SETTINGS.autoSync)) {
    autoSyncTimer = setInterval(() => autoSync(), AUTO_SYNC_MINUTES * 60 * 1000);
  }
}

Hooks.once("init", () => {
  console.log(
    `%c📜 ${MODULE_TITLE} %cv${game.modules.get(MODULE_ID)?.version ?? "unknown"}`,
    "color: #972c1d; font-weight: bold; font-size: 16px;",
    "color: #c9ad6a; font-weight: bold; font-size: 14px;",
  );

  game.settings.register(MODULE_ID, SETTINGS.apiToken, {
    name: "Dungeon Master Guru API token",
    scope: "client",
    config: false,
    type: String,
    default: "",
  });

  game.settings.register(MODULE_ID, SETTINGS.campaign, {
    name: "Linked campaign",
    scope: "world",
    config: false,
    type: Object,
    default: {},
  });

  game.settings.register(MODULE_ID, SETTINGS.baseUrl, {
    name: "Dungeon Master Guru address",
    hint: "Leave as is unless you run your own copy of Dungeon Master Guru.",
    scope: "world",
    config: true,
    restricted: true,
    type: String,
    default: DEFAULT_BASE_URL,
  });

  game.settings.register(MODULE_ID, SETTINGS.autoSync, {
    name: "Sync automatically",
    hint: `Pull changes from Dungeon Master Guru when the world loads and every ${AUTO_SYNC_MINUTES} minutes while the GM is connected.`,
    scope: "world",
    config: true,
    restricted: true,
    type: Boolean,
    default: true,
    onChange: () => scheduleAutoSync(),
  });

  game.settings.registerMenu(MODULE_ID, "connect", {
    name: "Dungeon Master Guru campaign",
    label: "Connect",
    hint: "Link this world to one of your Dungeon Master Guru campaigns.",
    icon: "fas fa-link",
    type: ConnectApp,
    restricted: true,
  });

  game.settings.registerMenu(MODULE_ID, "patreonLink", {
    name: "Support on Patreon",
    label: "Visit Patreon",
    hint: "Campaign sync is a Patreon premium feature. Your support funds new features and updates.",
    icon: "fab fa-patreon",
    type: PatreonLink,
    restricted: true,
  });

  game.settings.registerMenu(MODULE_ID, "dmGuruLink", {
    name: "Dungeon Master Guru",
    label: "Visit Dungeon Master Guru",
    hint: "Plan your campaign, then run it here. Free resources for Dungeon Masters at dungeonmaster.guru.",
    icon: "fas fa-dragon",
    type: DmGuruLink,
    restricted: true,
  });
});

Hooks.once("ready", () => {
  game.modules.get(MODULE_ID).api = { sync, openDashboard, openConnect };
  if (!game.user.isGM) return;

  if (game.settings.get(MODULE_ID, SETTINGS.autoSync)) autoSync();
  scheduleAutoSync();
});

// Foundry v13+ scene controls: groups and tools are objects keyed by name
Hooks.on("getSceneControlButtons", (controls) => {
  if (!game.user.isGM) return;
  const notes = controls.notes ?? controls.tokens;
  if (!notes) return;
  notes.tools["campaign-planner"] = {
    name: "campaign-planner",
    title: "Campaign Dashboard",
    icon: "fas fa-scroll",
    button: true,
    onChange: () => openDashboard(),
  };
});
