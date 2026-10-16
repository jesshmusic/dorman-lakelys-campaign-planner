# Dorman Lakely's Campaign Planner

Plan a campaign the Lazy Dungeon Master way, right in Foundry VTT, and run it at the table from the Campaign Dashboard. No account needed. When you want AI help, connect to [Dungeon Master Guru](https://dungeonmaster.guru) and plan there too.

## Two ways to plan

**In your world (free, no account).** Click **New** in the Journal sidebar. A step-by-step guide walks you through what kind of game, the pitch, your table (party, levels, sessions), the world and its truths, and your books, explaining why each step matters. Click **Create in this world**, and you get:

- **Journals:** a folder for the campaign with an entry for each part of it: Overview, Sessions, Cast, Threats, Quests, Secrets and Clues, Places, Factions and Book References. Each record is its own page, visible to the GM only until you share it. A story arc starts with its sessions, three acts and a main threat; a sandbox with a villain and a questline; a one-shot with a five-room dungeon.
- **Campaign Dashboard:** your at-the-table view.
  - The next session and its log.
  - Threat clocks you can advance, and grim portents you can tick off.
  - Secrets and clues to reveal.
  - Quests and their status.
  - Add threats, secrets, quests, NPCs, places, factions and sessions as you go.

**On Dungeon Master Guru (free account).** Plan on the website as well as in Foundry. It adds:

- **AI planning:** draft a cast, threats, places, quests and clues from your brief, get ideas for each step of session prep, and turn your session log into a recap. Use your own OpenAI key, or a Patreon membership.
- **Two-way sync** ([Patreon](https://www.patreon.com/c/DormanLakely) premium): the campaign comes into your journals, and what you change at the table goes back. If the same thing changed in both places, you choose which to keep.
- **Your compendiums:** the module sends Dungeon Master Guru the index of your SRD 5.2 compendiums and the 2024 Player's Handbook, Dungeon Master's Guide and Monster Manual modules you own: names, challenge ratings and IDs, never stat blocks or book text. Monsters and treasure you pick while planning become links in your session journals. Drag one onto a scene to place a token.
- **Your party:** your world's Player Character actors and their sheets, for prep on the website. Spell, feature and item descriptions stay in Foundry.

The **How it works** window (the **?** button in the Journal sidebar) explains both, step by step. It opens once the first time a GM loads the module.

## Finding things

The Journal sidebar has the Campaign Planner's buttons, for the GM only:

| Button | What it does |
|---|---|
| **Campaign** | Opens the Campaign Dashboard. Also in the scene controls, under Journal Notes. |
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
| Dungeon Master Guru address | Leave as is unless you run your own copy of Dungeon Master Guru. |
| Sync automatically | Pull changes when the world loads and every 2 minutes while the GM is connected. |

## Development

The code that doesn't depend on Foundry (`scripts/api.mjs`, `scripts/render.mjs`, `scripts/merge.mjs`) has unit tests:

```bash
npm test
```

## License

MIT
