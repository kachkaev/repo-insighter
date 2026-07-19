import { chmodSync } from "node:fs";
import { builtinModules } from "node:module";

import { defineConfig } from "vite";

const nodeBuiltins = [
  ...builtinModules,
  ...builtinModules.map((moduleName) => `node:${moduleName}`),
  "node:sqlite",
];

export default defineConfig({
  build: {
    // dist/ is shared with the dashboard build (dist/dashboard), which
    // empties only its own subfolder; emptying all of dist here would
    // delete it.
    emptyOutDir: false,
    lib: {
      entry: "src/cli.ts",
      fileName: () => "cli.js",
      formats: ["es"],
    },
    minify: false,
    outDir: "dist",
    rollupOptions: {
      external: nodeBuiltins,
      output: {
        banner: "#!/usr/bin/env node",
        codeSplitting: false,
      },
    },
    target: "node22",
  },
  plugins: [
    {
      closeBundle() {
        chmodSync("dist/cli.js", 0o755);
      },
      name: "chmod-cli",
    },
  ],
});
