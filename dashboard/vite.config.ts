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
    // In dev, dashboard.json is served from dashboard/public — copy one there
    // from the catalog of whichever repo you want to look at.
    port: 5199,
  },
});
