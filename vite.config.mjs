import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";

// Builds src/ into dist/campaign-planner.js, the file Foundry loads.
// `npm run dev` rebuilds on every change in development mode, which reads
// .env.development.local (see src/env.mjs); `npm run build` makes a release.
export default defineConfig({
  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: true,
    minify: false,
    // Foundry v14's browsers: private class members and static blocks as written
    target: "es2022",
    lib: {
      entry: fileURLToPath(new URL("./src/campaign-planner.mjs", import.meta.url)),
      formats: ["es"],
      fileName: () => "campaign-planner.js",
    },
  },
});
