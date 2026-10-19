// Where Dungeon Master Guru is. Release builds always use dungeonmaster.guru.
// A development build (npm run dev) can point at a local copy instead, with
// VITE_DM_GURU_URL in .env.development.local (git-ignored), e.g.
//   VITE_DM_GURU_URL=http://localhost:3000
// Vite fills these in when it builds, so release builds never contain it.
import { DEFAULT_BASE_URL } from "./api.mjs";

// The mode, not import.meta.env.DEV: `vite build` counts as production for DEV whatever the mode
export const DM_GURU_URL =
  (import.meta.env.MODE === "development" && import.meta.env.VITE_DM_GURU_URL) || DEFAULT_BASE_URL;

// True in a development build pointed at another Dungeon Master Guru
export const USING_DEV_SERVER = DM_GURU_URL !== DEFAULT_BASE_URL;
