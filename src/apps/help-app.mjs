import { MODULE_ID } from "../constants.mjs";
import { LINKS } from "../welcome.mjs";

const SITE = LINKS.site;

/**
 * How to use the Campaign Planner: planning in this world, or on Dungeon
 * Master Guru, and running either at the table. Opens once for a GM the first
 * time the module loads, and from the Journal sidebar, the Dashboard and the
 * New campaign guide after that.
 */
export class HelpApp extends foundry.applications.api.ApplicationV2 {
  static DEFAULT_OPTIONS = {
    id: "dlcp-help",
    classes: ["dlcp-app", "dlcp-help"],
    tag: "div",
    window: { title: "Campaign Planner: how it works", icon: "fas fa-circle-question", resizable: true },
    position: { width: 600, height: 680 },
    actions: {
      newCampaign: HelpApp.#onNewCampaign,
      dashboard: HelpApp.#onDashboard,
      plan: HelpApp.#onPlan,
      connect: HelpApp.#onConnect,
      reportBug: HelpApp.#onReportBug,
    },
  };

  async _renderHTML() {
    const container = document.createElement("div");
    container.classList.add("dlcp-help-body");
    container.innerHTML = `
      <p class="dlcp-lead">Plan a campaign the Lazy Dungeon Master way: a strong start, secrets and clues, threats with
        clocks. Then run it at the table from the Campaign Dashboard.</p>

      <h2>Two ways to plan</h2>
      <div class="dlcp-paths">
        <section>
          <h3><i class="fas fa-house"></i> In this world</h3>
          <p>Free, and no account needed. Everything stays in Foundry: a journal folder for the plan, and the Campaign
            Dashboard to run it.</p>
          <button type="button" data-action="newCampaign"><i class="fas fa-feather-alt"></i> New campaign</button>
        </section>
        <section>
          <h3><i class="fas fa-globe"></i> On Dungeon Master Guru</h3>
          <p>Plan on the website as well as here, with a free account: from any computer or phone, even with Foundry
            closed. With premium Patreon it syncs with this world.</p>
          <button type="button" data-action="connect"><i class="fas fa-link"></i> Connect</button>
        </section>
      </div>
      <p class="dlcp-muted">Not sure? Start in this world. You can move to Dungeon Master Guru later.</p>

      <h2>Start a campaign in this world</h2>
      <ol>
        <li>In the <strong>Journal</strong> sidebar, click <strong>New</strong>.</li>
        <li>Work through the steps: what kind of game, the pitch, the table (your party and their levels), the world and
          its truths, and your books. Each step explains why it matters, with an example. Your answers are kept as you go,
          so you can close the window and come back.</li>
        <li>On the last step, click <strong>Create in this world</strong>.</li>
      </ol>
      <p>You get a journal folder named after the campaign, with an entry for each part of it: Overview, Sessions, Cast,
        Threats, Quests, Secrets and Clues, Places, Factions and Book References. A story arc starts with its sessions,
        three acts and a main threat; a sandbox with a villain and a questline; a one-shot with a five-room dungeon.</p>

      <h2>Open a campaign you've already made</h2>
      <p>In the <strong>Journal</strong> sidebar, click <strong>Open</strong>. It lists the campaigns in this world, and
        the ones on Dungeon Master Guru when you're connected. The one you pick is the one the Dashboard shows; the others'
        journals stay where they are.</p>

      <h2>Plan it with the Campaign Planner</h2>
      <p>Click <strong>Plan</strong> in the Journal sidebar. The planner has a tab for each part of the campaign:</p>
      <ul>
        <li><strong>Overview:</strong> the brief, and a Getting started list of what to do next.</li>
        <li><strong>Party:</strong> pick the player characters from this world.</li>
        <li><strong>Story:</strong> threats, each with grim portents and a clock, and factions.</li>
        <li><strong>Quests:</strong> main and side quests, who gives them and where. Click <strong>Plan the quest</strong>
          to give it maps, the NPCs involved, monsters dragged in from your compendiums, and a reward: items (with how
          many), coins, and XP or a milestone.</li>
        <li><strong>Cast</strong> and <strong>Places:</strong> NPCs, and places inside other places.</li>
        <li><strong>Secrets:</strong> clues grouped by what they reveal, with a warning when one has fewer than three.</li>
        <li><strong>Sessions:</strong> prep each session with the Lazy Dungeon Master's eight steps. Drag monsters,
          items and roll tables straight in from your compendiums; they become links in the session's journal page. Add
          coins and item quantities to the treasure, and drag in scenes as the session's maps.</li>
        <li><strong>Maps and actors:</strong> drop a scene on a place for its map, and an actor on an NPC for their stat
          block. Drop an actor on the Cast tab to add them as a new NPC.</li>
      </ul>
      <p>Everything is saved to the campaign's journal pages, so you can also read and share them as journals.</p>

      <h2>Run it with the Campaign Dashboard</h2>
      <p>Click <strong>Run</strong> in the Journal sidebar, or open it from the scene controls
        (<i class="fas fa-bookmark"></i> Journal Notes, then <i class="fas fa-scroll"></i>).</p>
      <ul>
        <li><strong>Threats:</strong> click + when a threat moves closer to its goal, and tick its grim portents as they
          come true.</li>
        <li><strong>Secrets and clues:</strong> click Reveal when the party learns one.</li>
        <li><strong>Quests:</strong> set each one's status as the party takes it on and finishes it. An active quest
          shows its maps, its monsters to drag onto a map, and its reward to hand out.</li>
        <li><strong>Session log:</strong> jot down what happened, then click Mark played.</li>
        <li><strong>Maps and treasure:</strong> show the session's maps to yourself, or activate one for the players.
          Drag treasure items onto a character's sheet to hand them out.</li>
        <li><strong>Add:</strong> threats, secrets, quests, NPCs, places, factions and sessions each get their own journal
          page. Pages are for the GM until you share them, as with any journal.</li>
        <li><strong>On Dungeon Master Guru?</strong> The planner shows the campaign too; plan it on the website, and it
          syncs here.</li>
      </ul>

      <h2>Plan on Dungeon Master Guru</h2>
      <ol>
        <li>Make a free account at <a href="${SITE}" target="_blank" rel="noopener">dungeonmaster.guru</a>.</li>
        <li>On your Dungeon Master Guru dashboard, open <strong>Connections</strong> and create an <strong>API token</strong>.</li>
        <li>Back here, click <strong>Connect</strong>, paste the token and click <strong>Check connection</strong>. The
          token is saved in this browser only, so your players never see it.</li>
        <li>Create a campaign: on the website, or here with <strong>New</strong> and then <strong>Create on
          Dungeon Master Guru</strong>.</li>
      </ol>
      <p><strong>What it adds:</strong></p>
      <ul>
        <li><strong>Plan from anywhere:</strong> the same planner on the website, from any computer or phone, even with
          Foundry closed.</li>
        <li><strong>Sync with this world</strong> (premium Patreon): link the campaign and it comes into your journals.
          Changes you make at the table, like clocks, secrets, quests and the session log, go back to the website.</li>
        <li><strong>Your books and your party:</strong> monsters and treasure you pick from your compendiums become links
          you can drag onto a scene, and your players' character sheets are there while you prep.</li>
        <li><strong>Your maps</strong> (with sync): a thumbnail of each scene in this world goes to the website, so you
          can pick a place's, session's or quest's maps there, and see them while Foundry is closed.</li>
      </ul>

      <h2>Your books</h2>
      <p>Dungeon Master Guru never stores stat blocks or book text. Links to your Player's Handbook, Dungeon Master's
        Guide and Monster Manual open your own licensed copies in Foundry.</p>

      <h2>Help and support</h2>
      <p>Found a bug? <strong>Report a bug</strong> opens a GitHub issue with your Foundry, system and module versions
        filled in; add what happened and how to make it happen again. Your support on
        <a href="${LINKS.patreon}" target="_blank" rel="noopener">Patreon</a> funds new features, and premium members
        get campaign sync with Dungeon Master Guru.</p>

      <div class="dlcp-buttons">
        <button type="button" data-action="newCampaign"><i class="fas fa-feather-alt"></i> New campaign</button>
        <button type="button" data-action="plan"><i class="fas fa-feather-alt"></i> Campaign Planner</button>
        <button type="button" data-action="dashboard"><i class="fas fa-scroll"></i> Campaign Dashboard</button>
      </div>
      <div class="dlcp-buttons">
        <button type="button" data-action="reportBug"><i class="fas fa-bug"></i> Report a bug</button>
        <a class="dlcp-button-link" href="${LINKS.patreon}" target="_blank" rel="noopener"><i class="fab fa-patreon"></i> Support on Patreon</a>
      </div>`;
    return container;
  }

  _replaceHTML(result, content) {
    content.replaceChildren(result);
  }

  static #onNewCampaign() {
    game.modules.get(MODULE_ID).api.openNewCampaign();
  }

  static #onPlan() {
    game.modules.get(MODULE_ID).api.openPlanner();
  }

  static #onDashboard() {
    game.modules.get(MODULE_ID).api.openDashboard();
  }

  static #onReportBug() {
    game.modules.get(MODULE_ID).api.openBugReport();
  }

  static #onConnect() {
    game.modules.get(MODULE_ID).api.openConnect();
  }
}
