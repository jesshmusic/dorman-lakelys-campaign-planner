# Changelog

## [Unreleased]

- The **Dungeon Master Guru address** setting is gone: the module always connects to dungeonmaster.guru.
- **Maps:** give a place its Foundry scene, and a session its maps, by dragging scenes from the Scenes directory. They're links in the journals, and the Dashboard can show a map to you or activate it for the players.
- **NPC actors:** drop an actor (from the world or a compendium) on an NPC for their stat block, or drop one on the Cast tab to add them as a new NPC.
- **Treasure:** coins and item quantities in session prep. The Dashboard lists them, and items can be dragged onto a character's sheet to hand them out.
- For Dungeon Master Guru campaigns, maps and actors are set here too, and sync.
- **Quests:** plan each quest's maps, the NPCs involved, its monsters (dragged in from your compendiums) and its reward: items with how many, coins, and XP or a milestone. Its journal page lists them all, and the Dashboard shows an active quest's maps, monsters and reward. Named Quests here and on Dungeon Master Guru alike.
- **Your scenes on Dungeon Master Guru:** with sync, a thumbnail of each scene in the world goes to Dungeon Master Guru, so you can pick maps there and see them while Foundry is closed. A scene is sent again only when its map changes, and removed when it's deleted. Scenes without a map image, and 3D Canvas scenes, are left out.
- **Campaign Planner:** a full planner in Foundry for campaigns in the world, with the same tabs as Dungeon Master Guru: Overview with Getting started, Party, Story (threats and factions), Quests, Cast, Places, Secrets with the Three Clue Rule check, and Sessions with the eight steps of prep. Add, edit and delete everything; deleting clears anything that pointed to it. Drag monsters, items and roll tables in from your compendiums. Dungeon Master Guru campaigns show read-only.
- The Journal sidebar's buttons are now Plan, Run, New, Open and help.
- **Plan in your world, no account needed:** the New campaign guide can create the campaign right in this world, with the same journals and template structure. The Campaign Dashboard works on it, and can add threats, secrets, quests, NPCs, places, factions and sessions.
- **Easy to find:** Campaign, New, Open and help buttons at the top of the Journal sidebar. **Open** switches between campaigns in this world and on Dungeon Master Guru.
- **How it works:** a help window that explains planning in Foundry and on Dungeon Master Guru, step by step. It opens once the first time a GM loads the module.
- The Dashboard keeps revealed secrets in a Revealed list you can undo from, and lists quests in act order.
- **New campaign guide:** start a campaign step by step from the Connect window or the Campaign Dashboard: what kind of game, the pitch, the party, the world and its truths, and your books, then review and create. Creating is free; with premium sync, the world is linked to the new campaign. Answers are kept in this browser until the campaign is made.
- The Campaign Dashboard's title follows the linked campaign.
- **Compendium index:** sends Dungeon Master Guru the names, CRs and IDs (never stat blocks) of your SRD 5.2 and 2024 core book compendiums, when the world loads and when a book module updates, or from **Send compendium index** in the Connect window.
- **Draggable links:** monsters, items and tables picked on Dungeon Master Guru are compendium links in the session journals. Drag one onto a scene to place a token. Monsters picked from Dungeon Master Guru's own SRD list link to the compendium entry of the same name.
- Session prep shows each book monster's CR, and book equipment is listed with the treasure.
- **Player characters:** sends the world's Player Character actors and their character sheets (names of spells, features and gear, not their descriptions), so campaigns on Dungeon Master Guru can pick their party. Sent when the GM loads the world and a few seconds after a sheet changes.

## [0.1.0]

- First release.
- **Journals:** connect a world to a Dungeon Master Guru campaign and sync it into a journal folder, with one entry per section and one page per record.
- **Campaign Dashboard:**
  - the next session and its log
  - threat clocks and grim portents
  - secrets to reveal
  - quest status
- **Two-way sync:** changes made in either place come across, with a choice when the same thing changed in both.
