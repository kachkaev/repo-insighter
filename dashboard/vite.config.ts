import path from "node:path";

import babel from "@rolldown/plugin-babel";
import tailwindcss from "@tailwindcss/vite";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  root: import.meta.dirname,
  plugins: [
    react(),
    // React Compiler auto-memoizes components so the charts' hover state
    // (crosshair, tooltip) no longer re-renders the stacked areas and bars
    // underneath it. plugin-react v6 transforms with oxc and runs the compiler
    // as a separate Babel pass via this preset; it defaults to React 19's
    // built-in `react/compiler-runtime`.
    babel({ presets: [reactCompilerPreset()] }),
    tailwindcss(),
  ],
  build: {
    emptyOutDir: true,
    outDir: path.join(import.meta.dirname, "../dist/dashboard"),
    // dashboard/public only holds local dev data — keep it out of the bundle
    // (`files` in package.json ships dist/ verbatim).
    copyPublicDir: false,
  },
  server: {
    // In dev, dashboard.json is served from dashboard/public — copy one there
    // from the catalog of whichever repo you want to look at.
    port: 5199,
  },
});
