import { Argument, Command, Flag } from "effect/unstable/cli";

import { runQuery } from "../lib/query.ts";

export const queryCommand = Command.make("query", {
  repoPath: Flag.string("repo").pipe(
    Flag.withDefault("."),
    Flag.withDescription(
      "Path to the git repository whose metrics cube to query (defaults to the current directory)",
    ),
  ),
  json: Flag.boolean("json").pipe(
    Flag.withDescription("Print rows as JSON instead of a table"),
  ),
  sql: Argument.string("sql").pipe(
    Argument.withDescription(
      'A read-only SQL statement, e.g. "SELECT metric, sum(value) FROM facts GROUP BY metric"',
    ),
  ),
}).pipe(
  Command.withDescription(
    "Run a read-only SQL query against the metrics cube (tables: commits, facts)",
  ),
  Command.withHandler((config) =>
    runQuery({
      repoPath: config.repoPath,
      sql: config.sql,
      json: config.json,
    }),
  ),
);
