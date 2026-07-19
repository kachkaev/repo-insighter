import { Command, Flag } from "effect/unstable/cli";

import { runDashboard } from "../lib/dashboard-server.ts";

export const dashboardCommand = Command.make("dashboard", {
  repoPath: Flag.string("repo").pipe(
    Flag.withDefault("."),
    Flag.withDescription(
      "Path to the git repository whose insights to show (defaults to the current directory)",
    ),
  ),
  port: Flag.integer("port").pipe(
    Flag.withDefault(4936),
    Flag.withDescription("Port to serve the dashboard on"),
  ),
  open: Flag.boolean("open").pipe(
    Flag.withDescription("Open the dashboard in the default browser"),
  ),
}).pipe(
  Command.withDescription(
    "Serve the interactive dashboard for a scanned and indexed repository",
  ),
  Command.withHandler((config) =>
    runDashboard({
      repoPath: config.repoPath,
      port: config.port,
      open: config.open,
    }),
  ),
);
