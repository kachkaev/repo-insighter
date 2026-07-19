import { Option } from "effect";
import { Command, Flag } from "effect/unstable/cli";

import { runReport } from "../lib/report.ts";

export const reportCommand = Command.make("report", {
  repoPath: Flag.string("repo").pipe(
    Flag.withDefault("."),
    Flag.withDescription(
      "Path to the git repository whose insights to export (defaults to the current directory)",
    ),
  ),
  outPath: Flag.optional(
    Flag.string("out").pipe(
      Flag.withDescription(
        "Where to write the report (defaults to .repo-insighter/index/report.html)",
      ),
    ),
  ),
  open: Flag.boolean("open").pipe(
    Flag.withDescription("Open the report in the default browser"),
  ),
}).pipe(
  Command.withDescription(
    "Export the dashboard as one self-contained HTML file — shareable without installing anything",
  ),
  Command.withHandler((config) =>
    runReport({
      repoPath: config.repoPath,
      outPath: Option.getOrUndefined(config.outPath),
      open: config.open,
    }),
  ),
);
