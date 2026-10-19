# Dorman Lakely's Campaign Planner

Plan a campaign the Lazy Dungeon Master way, right in Foundry VTT, and run it at the table from the Campaign Dashboard. No account needed. To plan from anywhere, even with Foundry closed, connect to [Dungeon Master Guru](https://dungeonmaster.guru) and plan there too.

## Two ways to plan

**In your world (free, no account).** Click **New** in the Journal sidebar. A step-by-step guide walks you through what kind of game, the pitch, your table (party, levels, sessions), the world and its truths, and your books, explaining why each step matters. Click **Create in this world**, and you get:

- **Journals:** a folder for the campaign with an entry for each part of it: Overview, Sessions, Cast, Threats, Quests, Secrets and Clues, Places, Factions and Book References. Each record is its own page, visible to the GM only until you share it. A story arc starts with its sessions, three acts and a main threat; a sandbox with a villain and a questline; a one-shot with a five-room dungeon.
- **Campaign Planner:** a tab for each part of the campaign, with editing, a Three Clue Rule check, eight-step session prep, and a plan for each quest: its maps, NPCs, monsters and reward. Drag monsters, items and roll tables in from your compendiums.
- **Campaign Dashboard:** your at-the-table view.
  - The next session and its log.
  - Threat clocks you can advance, and grim portents you can tick off.
  - Secrets and clues to reveal.
  - Quests and their status, with an active quest's maps, monsters and reward.
  - Add threats, secrets, quests, NPCs, places, factions and sessions as you go.

**On Dungeon Master Guru (free account).** Plan on the website as well as in Foundry. It adds:

- **Plan from anywhere:** the same planner on the website, from any computer or phone, even with Foundry closed.
- **Two-way sync** ([Patreon](https://www.patreon.com/c/DormanLakely) premium): the campaign comes into your journals, and what you change at the table goes back. If the same thing changed in both places, you choose which to keep.
- **Your compendiums:** the module sends Dungeon Master Guru the index of your SRD 5.2 compendiums and the 2024 Player's Handbook, Dungeon Master's Guide and Monster Manual modules you own: names, challenge ratings and IDs, never stat blocks or book text. Monsters and treasure you pick while planning become links in your session journals. Drag one onto a scene to place a token.
- **Your party:** your world's Player Character actors and their sheets, for prep on the website. Spell, feature and item descriptions stay in Foundry.
- **Your maps** (with sync): a thumbnail of each scene in your world, so you can pick maps on the website and see them while Foundry is closed.

The **How it works** window (the **?** button in the Journal sidebar) explains both, step by step. It opens once the first time a GM loads the module.

## Finding things

The Journal sidebar has the Campaign Planner's buttons, for the GM only:

| Button | What it does |
|---|---|
| **Plan** | Opens the Campaign Planner: Overview, Party, Story, Quests, Cast, Places, Secrets and Sessions, with the Lazy Dungeon Master's eight steps of session prep. Drag monsters, items and roll tables in from your compendiums. |
| **Run** | Opens the Campaign Dashboard, for the table. Also in the scene controls, under Journal Notes. |
| **New** | Starts a new campaign, step by step. Your answers are kept as you go. |
| **Open** | Opens another campaign: one in this world, or one on Dungeon Master Guru when you're connected. |
| **?** | How it works. |

## Connecting to Dungeon Master Guru

1. Make a free account at [dungeonmaster.guru](https://dungeonmaster.guru), then create an API token: **Dashboard → Connections → API tokens**.
2. In Foundry, open **Settings → Module Settings → Dorman Lakely's Campaign Planner → Connect**, or the Dashboard's menu.
3. Paste the token and click **Check connection**. Then link a campaign, or create one with **New** → **Create on Dungeon Master Guru**.

The token is saved in your browser only. It is never stored in the world, so your players never receive it.

The compendium index is sent when the GM loads the world, and again whenever a book module updates. To send it now, click **Send compendium index** in the Connect window. Each campaign on Dungeon Master Guru can turn compendiums off in its **Compendiums** list.

## Settings

| Setting | What it does |
|---|---|
| Connect | Link this world to one of your campaigns, or disconnect. |
| Sync automatically | Pull changes when the world loads and every 2 minutes while the GM is connected. |

## Help and support

- **Found a bug?** Click **Report a bug**: in the Campaign Planner's or Campaign Dashboard's window menu, the module's settings, or the How it works window. It opens a [GitHub issue](https://github.com/jesshmusic/dorman-lakelys-campaign-planner/issues) with your Foundry, system and module versions already filled in.
- **Support on [Patreon](https://www.patreon.com/c/DormanLakely)** to fund new features. Premium members get campaign sync with Dungeon Master Guru.
- After an update that adds features, a message in chat (for the GM) lists what's new.

## Development

The module is built with [Vite](https://vite.dev): the code in `src/` becomes `dist/campaign-planner.js`, the file Foundry loads.

```bash
npm install
npm run dev     # development build, rebuilt on every change
npm run build   # release build
npm test        # unit tests for the code that doesn't depend on Foundry
```

To work against a local copy of Dungeon Master Guru, put its address in `.env.development.local` (git-ignored):

```bash
VITE_DM_GURU_URL=http://localhost:3000
```

`npm run dev` uses it, and the Connect window says so. Release builds (`npm run build`, and the release workflows) always use dungeonmaster.guru.

## License

MIT
