import { NodeRuntime, NodeServices } from "@effect/platform-node";
import { Console, Effect } from "effect";
import { Command } from "effect/unstable/cli";

import packageJson from "../package.json" with { type: "json" };
import { collectorsCommand } from "./commands/collectors.ts";
import { gcCommand } from "./commands/gc.ts";
import { scanCommand } from "./commands/scan.ts";
import { statusCommand } from "./commands/status.ts";

const cli = Command.make("repo-insighter").pipe(
  Command.withDescription(
    "Derive insights from a git repository's history: per-commit snapshots, an indexed metrics catalog and material for visualizations",
  ),
  Command.withSubcommands([
    scanCommand,
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
