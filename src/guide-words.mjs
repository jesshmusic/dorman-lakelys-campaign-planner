// Keeps the New campaign guide's words up to date from Dungeon Master Guru,
// where an admin edits them, and remembers the last copy for when this world
// can't reach it (offline, or never connected). The module's own words are
// used until then.
import { DmGuruApi } from "./api.mjs";
import { DM_GURU_URL } from "./env.mjs";
import { MODULE_ID, MODULE_TITLE, SETTINGS } from "./constants.mjs";
import { setGuideWords } from "./setup.mjs";

let loading = null;

/** At startup: the words from last time, if any */
export function useRememberedGuideWords() {
  setGuideWords(game.settings.get(MODULE_ID, SETTINGS.setupGuide) || null);
}

/**
 * Fetches the latest words, once per session (again after a failure).
 * Needs no account. Resolves true when they're different from before.
 */
export function loadGuideWords() {
  loading ??= (async () => {
    try {
      const guide = await new DmGuruApi({ baseUrl: DM_GURU_URL, token: null }).setupGuide();
      const changed = JSON.stringify(guide) !== JSON.stringify(game.settings.get(MODULE_ID, SETTINGS.setupGuide) || null);
      setGuideWords(guide);
      if (changed) await game.settings.set(MODULE_ID, SETTINGS.setupGuide, guide);
      return changed;
    } catch (error) {
      console.debug(`${MODULE_TITLE} | Using the guide's saved words: ${error.message}`);
      loading = null;
      return false;
    }
  })();
  return loading;
}
