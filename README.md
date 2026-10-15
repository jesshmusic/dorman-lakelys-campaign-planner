# Dorman Lakely's Campaign Planner

Plan your campaign on [Dungeon Master Guru](https://dungeonmaster.guru), then run it in Foundry VTT.

This module brings a Dungeon Master Guru campaign into your world and keeps it in sync:

- **Journals:** a folder for the campaign with an entry for each part of it: Overview, Sessions, Cast, Threats, Quests, Secrets and Clues, Places, Factions and Book References. Each record is its own page, visible to the GM only until you share it.
- **Campaign Dashboard:** your at-the-table view.
  - The next session's strong start, scenes and log.
  - Threat clocks you can advance, and grim portents you can tick off.
  - Secrets to reveal.
  - Open quests with their status.
- **Two-way sync:** changes you make on Dungeon Master Guru come into Foundry automatically, and changes you make in the dashboard go back. If the same thing was changed in both places, you choose which to keep.
- **Your own books:** Dungeon Master Guru stores only the names and page numbers of things in the 2024 Player's Handbook, Dungeon Master's Guide and Monster Manual. When a book reference is linked to your licensed Foundry compendium, its journal entry links straight to the stat block or item in your world.

Campaign sync is a [Patreon](https://www.patreon.com/c/DormanLakely) premium feature.

## Setup

1. On Dungeon Master Guru, link your Patreon account and create an API token: **Dashboard → Connections → API tokens**.
2. In Foundry, enable the module, then open **Settings → Module Settings → Dorman Lakely's Campaign Planner → Connect**.
3. Paste the token, choose a campaign, and click **Link campaign**.
4. Open the **Campaign Dashboard** from the Journal Notes scene controls.

The token is saved in your browser only. It is never stored in the world, so your players never receive it.

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
