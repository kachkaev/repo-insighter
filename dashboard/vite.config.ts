import path from "node:path";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  root: import.meta.dirname,
  plugins: [react(), tailwindcss()],
  build: {
    emptyOutDir: true,
    outDir: path.join(import.meta.dirname, "../dist/dashboard"),
  },
  server: {
    // In dev, dashboard.json is proxied from the catalog of the repo under
    // analysis via the REPO_INSIGHTER_DATA env variable (see readme).
    port: 5199,
  },
});
