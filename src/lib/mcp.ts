import { NodeStdio } from "@effect/platform-node";
import { Effect, Layer, Logger, Schema } from "effect";
import { McpServer, Tool, Toolkit } from "effect/unstable/ai";

import packageJson from "../../package.json" with { type: "json" };
import { executeQuery } from "./query.ts";
import { resolveRepoRoot } from "./scan.ts";

const queryTool = Tool.make("query", {
  description:
    "Run a read-only SQL query (SELECT/WITH/EXPLAIN) against the repository's metrics cube. " +
    "Tables: commits (sha, authored_at, author_email, author_name) and facts " +
    "(commit_sha, collector, metric, value, categories as a JSON object usable via json_extract). " +
    "Returns { columns, rows, truncated }.",
  parameters: Schema.Struct({ sql: Schema.String }),
  success: Schema.Unknown,
})
  .annotate(Tool.Readonly, true)
  .annotate(Tool.Destructive, false);

const schemaTool = Tool.make("schema", {
  description:
    "Describe the repository's metrics cube: tables, available metrics with row counts, " +
    "sample category keys per metric, and the commit range. Call this before writing queries.",
  parameters: Schema.Struct({}),
  success: Schema.Unknown,
})
  .annotate(Tool.Readonly, true)
  .annotate(Tool.Destructive, false);

const buildSchemaDescription = (repoRoot: string): unknown => {
  const metrics = executeQuery(
    repoRoot,
    `SELECT metric, count(*) AS facts, min(value) AS min_value, max(value) AS max_value
     FROM facts GROUP BY metric ORDER BY metric`,
  );
  const categorySamples = executeQuery(
    repoRoot,
    `SELECT metric, categories FROM facts
     WHERE id IN (SELECT min(id) FROM facts GROUP BY metric)`,
  );
  const commitRange = executeQuery(
    repoRoot,
    "SELECT count(*) AS commits, min(authored_at) AS first, max(authored_at) AS last FROM commits",
  );

  return {
    tables: {
      commits: ["sha", "authored_at", "author_email", "author_name"],
      facts: [
        "id",
        "commit_sha",
        "collector",
        "metric",
        "value",
        "categories (JSON object; use json_extract(categories, '$.key'))",
      ],
    },
    commitRange: commitRange.rows[0],
    metrics: metrics.rows,
    categoryKeySamples: categorySamples.rows,
    hints: [
      "Join facts to commits via commit_sha to plot anything over time.",
      "categories is open-ended: keys differ per metric (language, extension, author, rule, cohort, …).",
      "Sampled collectors (languages.*, survival.*) only have facts at sampled commits.",
    ],
  };
};

const mcpToolkit = Toolkit.make(queryTool, schemaTool);

/**
 * Serves the metrics cube over the Model Context Protocol (stdio), so AI
 * agents can explore a scanned repository by asking SQL questions.
 */
export const buildMcpLayer = (
  repoPath: string,
): Effect.Effect<Layer.Layer<never, Error>, Error> =>
  Effect.gen(function* () {
    const repoRoot = yield* resolveRepoRoot(repoPath);

    // Fail fast (before the protocol starts) if the cube is missing.
    yield* Effect.try({
      try: () => executeQuery(repoRoot, "SELECT 1"),
      catch: (error) =>
        error instanceof Error ? error : new Error(String(error)),
    });

    const handlers = mcpToolkit.toLayer({
      query: ({ sql }) =>
        Effect.try({
          try: (): unknown => {
            const result = executeQuery(repoRoot, sql, 200);
            return {
              columns: result.columns,
              rows: result.rows,
              truncated: result.truncated,
            };
          },
          catch: (error) =>
            error instanceof Error ? error : new Error(String(error)),
        }).pipe(
          Effect.catch((error) =>
            Effect.succeed<unknown>({ error: error.message }),
          ),
        ),
      schema: () =>
        Effect.try({
          try: (): unknown => buildSchemaDescription(repoRoot),
          catch: (error) =>
            error instanceof Error ? error : new Error(String(error)),
        }).pipe(
          Effect.catch((error) =>
            Effect.succeed<unknown>({ error: error.message }),
          ),
        ),
    });

    return McpServer.toolkit(mcpToolkit).pipe(
      Layer.provide(handlers),
      Layer.provide(
        McpServer.layerStdio({
          name: "repo-insighter",
          version: packageJson.version,
        }),
      ),
      Layer.provide(NodeStdio.layer),
      // stdout carries the protocol; keep logs on stderr.
      Layer.provide(Layer.succeed(Logger.LogToStderr)(true)),
    );
  });
