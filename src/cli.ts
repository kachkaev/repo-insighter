import { NodeRuntime, NodeServices } from "@effect/platform-node";
import { Console, Effect } from "effect";
import { Command, Flag } from "effect/unstable/cli";

import packageJson from "../package.json" with { type: "json" };
import { collectorsCommand } from "./commands/collectors.ts";
import { dashboardCommand } from "./commands/dashboard.ts";
import { gcCommand } from "./commands/gc.ts";
import { indexCommand } from "./commands/index-command.ts";
import { mcpCommand } from "./commands/mcp.ts";
import { queryCommand } from "./commands/query.ts";
import { reportCommand } from "./commands/report.ts";
import { scanCommand } from "./commands/scan.ts";
import { statusCommand } from "./commands/status.ts";
import { defaultDashboardPort } from "./lib/config.ts";
import { runDashboard } from "./lib/dashboard-server.ts";
import { runIndex } from "./lib/indexing.ts";
import { runScan } from "./lib/scan.ts";

const cli = Command.make("repo-dive", {
  repoPath: Flag.string("repo").pipe(
    Flag.withDefault("."),
    Flag.withDescription(
      "Path to the git repository to analyze (defaults to the current directory)",
    ),
  ),
  port: Flag.integer("port").pipe(
    Flag.withDefault(defaultDashboardPort),
    Flag.withDescription("Port to serve the dashboard on"),
  ),
  noOpen: Flag.boolean("no-open").pipe(
    Flag.withDescription("Do not open the dashboard in the default browser"),
  ),
}).pipe(
  Command.withDescription(
    "Derive insights from a git repository's history. " +
      "Without a subcommand, runs the whole pipeline: scan → index → dashboard.",
  ),
  Command.withHandler((config) =>
    Effect.gen(function* () {
      yield* Console.log("Step 1/3 — scan: collecting per-commit snapshots…");
      yield* runScan({ repoPath: config.repoPath });
      yield* Console.log("\nStep 2/3 — index: rolling up the metrics cube…");
      yield* runIndex({ repoPath: config.repoPath });
      yield* Console.log("\nStep 3/3 — dashboard:");
      yield* runDashboard({
        repoPath: config.repoPath,
        port: config.port,
        open: !config.noOpen,
      });
    }),
  ),
  Command.withSubcommands([
    scanCommand,
    indexCommand,
    dashboardCommand,
    reportCommand,
    queryCommand,
    mcpCommand,
    statusCommand,
    collectorsCommand,
    gcCommand,
  ]),
);

const program = Command.run(cli, { version: packageJson.version }).pipe(
  Effect.provide(NodeServices.layer),
  Effect.catch((error) =>
    Console.error(error.message).pipe(
      Effect.andThen(
        Effect.sync(() => {
          process.exitCode = 1;
        }),
      ),
    ),
  ),
);

NodeRuntime.runMain(program);
