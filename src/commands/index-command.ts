import { Command, Flag } from "effect/unstable/cli";

import { runIndex } from "../lib/indexing.ts";

export const indexCommand = Command.make("index", {
  repoPath: Flag.string("repo").pipe(
    Flag.withDefault("."),
    Flag.withDescription(
      "Path to the git repository whose catalog to index (defaults to the current directory)",
    ),
  ),
}).pipe(
  Command.withDescription(
    "Normalize collected snapshots into the metrics cube (SQLite) and dashboard data (always rebuilt from raw outputs)",
  ),
  Command.withHandler((config) => runIndex({ repoPath: config.repoPath })),
);
