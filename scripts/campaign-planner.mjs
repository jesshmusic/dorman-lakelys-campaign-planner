import { DEFAULT_BASE_URL } from "./api.mjs";
import { CampaignSync } from "./sync.mjs";
import { ConnectApp } from "./apps/connect-app.mjs";
import { DashboardApp } from "./apps/dashboard-app.mjs";
import { NewCampaignApp } from "./apps/new-campaign-app.mjs";
import { HelpApp } from "./apps/help-app.mjs";
import { openCampaignPicker } from "./apps/campaign-picker.mjs";
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

let newCampaign = null;

function openNewCampaign() {
  newCampaign ??= new NewCampaignApp();
  newCampaign.render({ force: true });
}

let help = null;

function openHelp() {
  help ??= new HelpApp();
  help.render({ force: true });
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

  game.settings.register(MODULE_ID, SETTINGS.setupDraft, {
    name: "New campaign drafts",
    scope: "client",
    config: false,
    type: Object,
    default: {},
  });

  game.settings.register(MODULE_ID, SETTINGS.welcomed, {
    name: "Seen the Campaign Planner welcome",
    scope: "client",
    config: false,
    type: Boolean,
    default: false,
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

// Keeps Dungeon Master Guru's copy of the compendium index current. Quiet:
// it only matters once the DM searches on Dungeon Master Guru.
async function sendCompendiumIndex() {
  if (!game.user.isGM || !sync.token) return;
  try {
    const { packs } = await sync.sendCompendiumIndex();
    if (packs) console.log(`${MODULE_TITLE} | Sent the index of ${packs} compendiums to Dungeon Master Guru`);
  } catch (error) {
    console.warn(`${MODULE_TITLE} | Could not send the compendium index`, error);
  }
}

// Player characters go to Dungeon Master Guru a few seconds after they change
// (a level up, new gear), batched so a burst of edits is one send
const sendCharactersSoon = foundry.utils.debounce(async () => {
  if (!game.user.isGM || !sync.token) return;
  try {
    await sync.sendCharacters();
  } catch (error) {
    console.warn(`${MODULE_TITLE} | Could not send the player characters`, error);
  }
}, 5000);

function watchCharacters() {
  const actorChanged = (actor) => actor && sendCharactersSoon();
  for (const hook of ["createActor", "updateActor", "deleteActor"]) Hooks.on(hook, actorChanged);
  for (const hook of ["createItem", "updateItem", "deleteItem"]) Hooks.on(hook, (item) => actorChanged(item.parent));
  Hooks.on("updateUser", () => sendCharactersSoon());
}

Hooks.once("ready", () => {
  game.modules.get(MODULE_ID).api = { sync, openDashboard, openConnect, openNewCampaign, openHelp, openCampaignPicker };
  if (!game.user.isGM) return;

  // The first time a GM loads the module, show how it works
  if (!game.settings.get(MODULE_ID, SETTINGS.welcomed)) {
    openHelp();
    game.settings.set(MODULE_ID, SETTINGS.welcomed, true);
  }

  if (game.settings.get(MODULE_ID, SETTINGS.autoSync)) autoSync();
  scheduleAutoSync();
  sendCompendiumIndex();
  sendCharactersSoon();
  watchCharacters();
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

// Campaign Planner buttons at the top of the Journal sidebar, for the GM
Hooks.on("renderJournalDirectory", (_app, html) => {
  if (!game.user.isGM) return;
  const element = html instanceof HTMLElement ? html : html?.[0];
  const header = element?.querySelector(".directory-header");
  if (!header || header.querySelector(".dlcp-directory")) return;
  const row = document.createElement("div");
  row.className = "dlcp-directory action-buttons flexrow";
  row.innerHTML = `
    <button type="button" data-dlcp="dashboard"><i class="fas fa-scroll"></i> Campaign</button>
    <button type="button" data-dlcp="new"><i class="fas fa-feather-alt"></i> New</button>
    <button type="button" data-dlcp="open"><i class="fas fa-folder-open"></i> Open</button>
    <button type="button" data-dlcp="help" class="dlcp-icon-button" aria-label="Campaign Planner help" data-tooltip="Campaign Planner help">
      <i class="fas fa-circle-question"></i></button>`;
  row.addEventListener("click", (event) => {
    const action = event.target.closest("[data-dlcp]")?.dataset.dlcp;
    if (action === "dashboard") openDashboard();
    else if (action === "new") openNewCampaign();
    else if (action === "open") openCampaignPicker();
    else if (action === "help") openHelp();
  });
  const actions = header.querySelector(".header-actions");
  if (actions) actions.after(row);
  else header.prepend(row);
});
