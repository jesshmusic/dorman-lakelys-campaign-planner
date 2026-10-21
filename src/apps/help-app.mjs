import { MODULE_ID } from "../constants.mjs";
import { escapeHtml } from "../render.mjs";
import { sourcesByAuthor } from "../techniques.mjs";
import { LINKS } from "../welcome.mjs";

const SITE = LINKS.site;

// Every source of the planner's ideas, by author
const sources = () =>
  sourcesByAuthor()
    .map(
      ({ author, sources: list }) => `<li><strong>${escapeHtml(author)}:</strong>
        <ul>${list
          .map(
            (source) =>
              `<li><a href="${escapeHtml(source.url)}" target="_blank" rel="noopener">${escapeHtml(source.title)}</a>: ${escapeHtml(source.about)}</li>`,
          )
          .join("")}</ul></li>`,
    )
    .join("");

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
            closed. It syncs with this world.</p>
          <button type="button" data-action="connect"><i class="fas fa-link"></i> Connect</button>
        </section>
      </div>
      <p class="dlcp-muted">Not sure? Start in this world. You can move to Dungeon Master Guru later.</p>

      <h2>Start a campaign in this world</h2>
      <ol>
        <li>In the <strong>Journal</strong> sidebar, click <strong>New</strong>.</li>
        <li>Work through the steps: what kind of game, the pitch, the table (your party and their levels), the world and
          its truths, and your books. Add the truths one at a time, each a short name and a description, and move or
          remove them as you like; about six is plenty. Each step explains why it matters, with an example. Your answers
          are kept as you go, so you can close the window and come back.</li>
        <li>On the last step, click <strong>Create in this world</strong>.</li>
      </ol>
      <p>You get a journal folder named after the campaign, with an entry for each part of it: Overview, Sessions, Cast,
        Threats, Quests, Encounters, Secrets and Clues, Places, Factions and Book References. A story arc starts with its sessions,
        three acts and a main threat; a sandbox with a villain and a questline; a one-shot with a five-room dungeon.</p>

      <h2>Switch to another campaign</h2>
      <p>Click <strong>Switch campaign</strong> at the top of the Campaign Planner, <strong>Switch</strong> on the
        Dashboard, or <strong>Switch</strong> in the Journal sidebar. It lists the campaigns in this world, and
        the ones on Dungeon Master Guru when you're connected. The one you pick is the one the Dashboard shows; the others'
        journals stay where they are.</p>

      <h2>Plan it with the Campaign Planner</h2>
      <p>Click <strong>Plan</strong> in the Journal sidebar. The planner has a tab for each part of the campaign:</p>
      <ul>
        <li><strong>Overview:</strong> the brief, with the truths of the setting as a numbered list to add to and
          reorder, and a Getting started list of what to do next.</li>
        <li><strong>Party:</strong> pick the player characters from this world.</li>
        <li><strong>Story:</strong> threats, each with grim portents and a clock, and factions.</li>
        <li><strong>Quests:</strong> main and side quests, who gives them and where. Click <strong>Plan the quest</strong>
          to give it maps, the NPCs involved, its encounters, handouts, and a reward: items (with how many), coins, and
          XP or a milestone.</li>
        <li><strong>Encounters:</strong> the fights, talks, traps and puzzles of a quest, in order. Each has a type,
          what happens, monsters dragged in from your compendiums or the Actors directory (with how many), the NPCs in
          it, its own maps and its own reward. A combat encounter shows how hard it is: the monsters' XP against the
          party's 2024 XP budget, at the quest's lowest level or the campaign's starting level. Each encounter gets a
          journal page of its own.</li>
        <li><strong>Handouts:</strong> drag journal entries or pages onto a quest's Handouts, from the Journal sidebar or
          a compendium, to show the players when the time comes.</li>
        <li><strong>Cast</strong> and <strong>Places:</strong> NPCs, and places inside other places. Drop roll tables on
          a place for its random encounters; <strong>Roll</strong> draws from one, and only GMs see the result.</li>
        <li><strong>Secrets:</strong> clues grouped by what they reveal, with a warning when one has fewer than three.</li>
        <li><strong>Sessions:</strong> prep each session with the Lazy Dungeon Master's eight steps. Drag monsters,
          items and roll tables straight in from your compendiums; they become links in the session's journal page. Add
          coins and item quantities to the treasure, and drag in scenes as the session's maps.</li>
        <li><strong>Maps and actors:</strong> drop a scene on a place for its map, and an actor on an NPC for their stat
          block. Drop an actor on the Cast tab to add them as a new NPC.</li>
      </ul>
      <p>Everything is saved to the campaign's journal pages, so you can also read and share them as journals.</p>
      <p>Don't use some of these? In <strong>Module Settings</strong>, switch off the six truths, threat clocks, grim
        portents, secrets and clues, the Three Clue Rule check or the Getting started checklist. The planner, the
        Dashboard and the journal pages stop showing it. Nothing is deleted: switch it back on and it all comes back.</p>

      <h2>Run it with the Campaign Dashboard</h2>
      <p>It opens when the world loads (untick <strong>Open at startup</strong> in its footer to stop that). Otherwise
        click <strong>Run</strong> in the Journal sidebar, or open it from the scene controls
        (<i class="fas fa-bookmark"></i> Journal Notes, then <i class="fas fa-scroll"></i>).</p>
      <ul>
        <li><strong>Threats:</strong> click + when a threat moves closer to its goal, and tick its grim portents as they
          come true.</li>
        <li><strong>Secrets and clues:</strong> click Reveal when the party learns one.</li>
        <li><strong>Quests:</strong> set each one's status as the party takes it on and finishes it. An active quest
          shows its maps, its place's random encounter tables to roll on, and each encounter: its difficulty, its
          monsters to drag onto a map, its maps, and <strong>Give the reward</strong> for its reward. Its handouts each
          have <strong>Show to players</strong>.</li>
        <li><strong>Session log:</strong> jot down what happened, then click Mark played.</li>
        <li><strong>Maps and treasure:</strong> show the session's maps to yourself, or activate one for the players.
          <strong>Give the reward</strong> (or <strong>Hand out the treasure</strong>) gives the items, coins and XP to
          the characters, or, with Item Piles, leaves them on the scene as a pile. You can also drag an item onto a
          character's sheet.</li>
        <li><strong>Add:</strong> threats, secrets, quests, NPCs, places, factions and sessions each get their own journal
          page. Pages are for the GM until you share them, as with any journal.</li>
        <li><strong>On Dungeon Master Guru?</strong> Plan it on the website or in the Campaign Planner here. Changes made
          here are saved in this world straight away; <strong>Sync</strong> sends them to the website and brings back
          its changes.</li>
      </ul>

      <h2>Plan on Dungeon Master Guru</h2>
      <ol>
        <li>Make a free account at <a href="${SITE}" target="_blank" rel="noopener">dungeonmaster.guru</a>.</li>
        <li>Back here, click <strong>Connect</strong>, then <strong>Get a code</strong>. Enter the code on Dungeon
          Master Guru, and this world connects by itself. (Or paste an API token from your dashboard's
          <strong>Connections</strong>.) The connection is saved in this browser only, so your players never see it.</li>
        <li>Create a campaign: on the website, or here with <strong>New</strong> and then <strong>Create on
          Dungeon Master Guru</strong>.</li>
      </ol>
      <p><strong>What it adds:</strong></p>
      <ul>
        <li><strong>Plan from anywhere:</strong> the same planner on the website, from any computer or phone, even with
          Foundry closed.</li>
        <li><strong>Sync with this world:</strong> link the campaign and it comes into your journals. What you change
          here is saved in this world first, even with no connection, and goes to the website when you click
          <strong>Sync</strong> at the top of the Campaign Planner or Dashboard. If the website can't be reached, nothing
          is lost: your changes wait for the next Sync.</li>
        <li><strong>Your books and your party:</strong> monsters and treasure you pick from your compendiums become links
          you can drag onto a scene, and your players' character sheets are there while you prep.</li>
        <li><strong>Your maps:</strong> a thumbnail of each scene in this world goes to the website, so you
          can pick a place's, session's or quest's maps there, and see them while Foundry is closed.</li>
        <li><strong>Your homebrew monsters:</strong> in the Connect window's Compendiums section, tick this world's NPC
          actors or your own Actor compendiums, and you can pick them on the website too (names, CRs and IDs only).</li>
        <li><strong>The website's monsters:</strong> a monster made on Dungeon Master Guru, with no compendium entry of the
          same name, has an <strong>Import into this world</strong> button in the planner and the Dashboard. It becomes
          an actor in the Dungeon Master Guru folder of the Actors directory.</li>
      </ul>

      <h2>Send a campaign to Dungeon Master Guru</h2>
      <p>Started in this world and want to plan on the website too? Connect, then click <strong>Send to Dungeon Master
        Guru</strong>: in the Connect window, on the Campaign Planner's Overview tab, or in its window menu. Everything
        goes: the brief, the party, threats, quests and their encounters, NPCs, places, secrets, sessions and book
        references. This world then
        syncs with it, and its journal folder and pages stay where they are, including anything you've shared with
        players.</p>

      <h2>Your books</h2>
      <p>Dungeon Master Guru never stores stat blocks or book text. Links to your Player's Handbook, Dungeon Master's
        Guide and Monster Manual open your own licensed copies in Foundry.</p>

      <h2>Where these ideas come from</h2>
      <p>The planner builds on techniques other game masters and designers came up with. Read more about them here:</p>
      <ul class="dlcp-sources">${sources()}</ul>

      <h2>Help and support</h2>
      <p>Found a bug? <strong>Report a bug</strong> opens a GitHub issue with your Foundry, system and module versions
        filled in; add what happened and how to make it happen again. Your support on
        <a href="${LINKS.patreon}" target="_blank" rel="noopener">Patreon</a> funds new features and updates.</p>

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
