import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

import { Console, Effect } from "effect";

import { catalogDirName } from "./catalog.ts";
import { builtInCollectors } from "./collectors/roster.ts";
import type { Fact } from "./collectors/types.ts";
import { loadConfig, type ResolvedConfig } from "./config.ts";
import { listCommits, resolveRepoRoot } from "./scan.ts";

const toError = (error: unknown) =>
  error instanceof Error ? error : new Error(String(error));

/**
 * Heuristic for AI coding assistants appearing as commit co-authors.
 * Automation bots (renovate, dependabot, github-actions, …) are deliberately
 * not "AI": they don't reflect assisted authorship.
 */
export const isAiCoAuthor = (coAuthor: string): boolean =>
  !/renovate|dependabot|github-actions/i.test(coAuthor) &&
  /claude|copilot|cursor|chatgpt|openai|gemini|aider|devin|coderabbit|codegen|sweep|windsurf/i.test(
    coAuthor,
  );

/** "12345+alice@users.noreply.github.com" → "alice"; other emails unchanged. */
export const prettifyAuthorEmail = (email: string): string => {
  const match = /^(?:\d+\+)?([^@]+)@users\.noreply\.github\.com$/.exec(email);
  return match?.[1] ?? email;
};

/** "Claude Fable 5 <noreply@anthropic.com>" → "Claude Fable 5" */
export const coAuthorIdentity = (coAuthor: string): string => {
  const angleIndex = coAuthor.indexOf("<");
  const name = (
    angleIndex === -1 ? coAuthor : coAuthor.slice(0, angleIndex)
  ).trim();
  return name || coAuthor.trim();
};

const monthOf = (isoDate: string): string => isoDate.slice(0, 7);

type CommitFacts = {
  readonly sha: string;
  readonly date: string;
  readonly authorEmail: string;
  readonly authorName: string;
  /** collector name → facts from that collector's output */
  readonly factsByCollector: ReadonlyMap<string, readonly Fact[]>;
};

const sumMetric = (
  commit: CommitFacts,
  metric: string,
  filter?: (categories: Readonly<Record<string, string>>) => boolean,
): number => {
  let total = 0;
  for (const facts of commit.factsByCollector.values()) {
    for (const fact of facts) {
      if (
        fact.metric === metric &&
        (filter === undefined || filter(fact.categories ?? {}))
      ) {
        total += fact.value;
      }
    }
  }
  return total;
};

const groupMetric = (
  commit: CommitFacts,
  metric: string,
  categoryKey: string,
): Record<string, number> => {
  const grouped: Record<string, number> = {};
  for (const facts of commit.factsByCollector.values()) {
    for (const fact of facts) {
      if (fact.metric === metric) {
        const key = fact.categories?.[categoryKey] ?? "(unknown)";
        grouped[key] = (grouped[key] ?? 0) + fact.value;
      }
    }
  }
  return grouped;
};

const hasMetric = (commit: CommitFacts, metric: string): boolean =>
  [...commit.factsByCollector.values()].some((facts) =>
    facts.some((fact) => fact.metric === metric),
  );

/** Re-keys a numeric record, summing values whose new keys collide. */
const sumByKey = (
  record: Record<string, number>,
  keyOf: (key: string) => string,
): Record<string, number> => {
  const merged: Record<string, number> = {};
  for (const [key, value] of Object.entries(record)) {
    const newKey = keyOf(key);
    merged[newKey] = (merged[newKey] ?? 0) + value;
  }
  return merged;
};

const buildDashboardData = (
  repoRoot: string,
  commits: readonly CommitFacts[], // oldest first
  config: ResolvedConfig,
) => {
  const aiCoAuthorsOf = (commit: CommitFacts): string[] =>
    [...commit.factsByCollector.values()]
      .flat()
      .filter(
        (fact) =>
          fact.metric === "commits.coAuthor" &&
          isAiCoAuthor(fact.categories?.["coAuthor"] ?? ""),
      )
      .map((fact) => coAuthorIdentity(fact.categories?.["coAuthor"] ?? ""));

  const commitRows = commits.map((commit) => ({
    sha: commit.sha.slice(0, 10),
    date: commit.date,
    author: commit.authorEmail,
    ai: aiCoAuthorsOf(commit).length > 0,
    added: sumMetric(commit, "churn.added"),
    deleted: sumMetric(commit, "churn.deleted"),
  }));

  const monthlyMap = new Map<
    string,
    {
      commits: number;
      aiCommits: number;
      added: number;
      deleted: number;
      aiAdded: number;
    }
  >();
  for (const row of commitRows) {
    const month = monthOf(row.date);
    const bucket = monthlyMap.get(month) ?? {
      commits: 0,
      aiCommits: 0,
      added: 0,
      deleted: 0,
      aiAdded: 0,
    };
    bucket.commits += 1;
    bucket.added += row.added;
    bucket.deleted += row.deleted;
    if (row.ai) {
      bucket.aiCommits += 1;
      bucket.aiAdded += row.added;
    }
    monthlyMap.set(month, bucket);
  }
  const monthly = [...monthlyMap.entries()]
    .toSorted(([left], [right]) => left.localeCompare(right))
    .map(([month, bucket]) => ({ month, ...bucket }));

  const languages = commits
    .filter((commit) => hasMetric(commit, "languages.lines"))
    .map((commit) => ({
      sha: commit.sha.slice(0, 10),
      date: commit.date,
      byLanguage: groupMetric(commit, "languages.lines", "language"),
    }));

  const fileTypes = commits
    .filter((commit) => hasMetric(commit, "files.count"))
    .map((commit) => ({
      sha: commit.sha.slice(0, 10),
      date: commit.date,
      totalFiles: sumMetric(commit, "files.count"),
      totalBytes: sumMetric(commit, "files.bytes"),
    }));

  const directives = commits
    .filter((commit) => hasMetric(commit, "directives.ts"))
    .map((commit) => {
      const byType = groupMetric(commit, "directives.eslint", "type");
      const ts = groupMetric(commit, "directives.ts", "type");
      return {
        sha: commit.sha.slice(0, 10),
        date: commit.date,
        eslintNextLine: byType["next-line"] ?? 0,
        eslintLine: byType["line"] ?? 0,
        eslintBlocks: byType["block"] ?? 0,
        blockCoveredLines: sumMetric(
          commit,
          "directives.eslintBlockCoveredLines",
        ),
        tsIgnore: ts["ignore"] ?? 0,
        tsExpectError: ts["expectError"] ?? 0,
        tsNocheck: ts["nocheck"] ?? 0,
        todos: sumMetric(commit, "todos.count"),
      };
    });

  const dependencies = commits
    .filter((commit) => hasMetric(commit, "dependencies.resolved"))
    .map((commit) => {
      const byKind = groupMetric(commit, "dependencies.direct", "kind");
      return {
        sha: commit.sha.slice(0, 10),
        date: commit.date,
        resolved: sumMetric(commit, "dependencies.resolved"),
        directProd: byKind["prod"] ?? 0,
        directDev: byKind["dev"] ?? 0,
        directOptional: byKind["optional"] ?? 0,
        byPackageManager: groupMetric(
          commit,
          "dependencies.resolved",
          "packageManager",
        ),
      };
    });

  const latestWithDirectives = commits.findLast((commit) =>
    hasMetric(commit, "directives.eslint"),
  );
  const topRules = latestWithDirectives
    ? Object.entries(
        groupMetric(latestWithDirectives, "directives.eslint", "rule"),
      )
        .toSorted(([, left], [, right]) => right - left)
        .slice(0, 20)
        .map(([rule, count]) => ({ rule, count }))
    : [];

  const survival = commits
    .filter((commit) => hasMetric(commit, "survival.lines"))
    .map((commit) => {
      // Living lines cross-tabulated by contributor and the year each line was
      // authored — the dashboard splits each contributor's area into year bands.
      const byContributorYear: Record<string, Record<string, number>> = {};
      for (const facts of commit.factsByCollector.values()) {
        for (const fact of facts) {
          if (fact.metric !== "survival.lines") {
            continue;
          }
          const label = config.resolveContributor(
            fact.categories?.["author"] ?? "",
          ).label;
          const year = (fact.categories?.["cohort"] ?? "").slice(0, 4) || "?";
          const byYear = (byContributorYear[label] ??= {});
          byYear[year] = (byYear[year] ?? 0) + fact.value;
        }
      }
      return {
        sha: commit.sha.slice(0, 10),
        date: commit.date,
        byCohort: groupMetric(commit, "survival.lines", "cohort"),
        byContributor: sumByKey(
          groupMetric(commit, "survival.lines", "author"),
          (email) => config.resolveContributor(email).label,
        ),
        byContributorYear,
        byExtension: groupMetric(commit, "survival.lines", "extension"),
      };
    });

  const contributorMap = new Map<
    string,
    {
      email: string;
      name: string;
      url: string | undefined;
      kind: string;
      commits: number;
      added: number;
      deleted: number;
    }
  >();
  for (const [index, commit] of commits.entries()) {
    const row = commitRows[index];
    if (!row) {
      continue;
    }
    // Resolve first so aliases of one person land in a single bucket.
    const resolved = config.resolveContributor(
      commit.authorEmail,
      commit.authorName,
    );
    const key = resolved.canonicalEmail.toLowerCase();
    const bucket = contributorMap.get(key) ?? {
      email: resolved.canonicalEmail,
      name: resolved.label,
      url: resolved.url,
      kind: resolved.kind,
      commits: 0,
      added: 0,
      deleted: 0,
    };
    // A configured displayName wins; otherwise keep the latest non-empty name.
    bucket.name = resolved.displayName ?? (commit.authorName || bucket.name);
    bucket.commits += 1;
    bucket.added += row.added;
    bucket.deleted += row.deleted;
    contributorMap.set(key, bucket);
  }
  const contributors = [...contributorMap.values()]
    .toSorted((left, right) => right.commits - left.commits)
    .slice(0, 25);

  const aiIdentityMap = new Map<string, number>();
  for (const commit of commits) {
    for (const identity of new Set(aiCoAuthorsOf(commit))) {
      aiIdentityMap.set(identity, (aiIdentityMap.get(identity) ?? 0) + 1);
    }
  }
  const aiIdentities = [...aiIdentityMap.entries()]
    .toSorted(([, left], [, right]) => right - left)
    .map(([identity, commitCount]) => ({ identity, commits: commitCount }));

  return {
    generatedAt: new Date().toISOString(),
    config: {
      contributors: { maxInCharts: config.maxInCharts },
    },
    repo: {
      name: path.basename(repoRoot),
      commitCount: commits.length,
      contributorCount: contributorMap.size,
      firstCommitDate: commits.at(0)?.date,
      lastCommitDate: commits.at(-1)?.date,
    },
    commits: commitRows,
    monthly,
    languages,
    fileTypes,
    directives,
    dependencies,
    topRules,
    survival,
    contributors,
    aiIdentities,
  };
};

const writeSqlite = (
  dbPath: string,
  commits: readonly CommitFacts[],
): number => {
  const db = new DatabaseSync(dbPath);
  try {
    db.exec("PRAGMA journal_mode = WAL");
    db.exec(`
      CREATE TABLE commits (
        sha TEXT PRIMARY KEY,
        authored_at TEXT NOT NULL,
        author_email TEXT NOT NULL,
        author_name TEXT NOT NULL
      );
      CREATE TABLE facts (
        id INTEGER PRIMARY KEY,
        commit_sha TEXT NOT NULL REFERENCES commits (sha),
        collector TEXT NOT NULL,
        metric TEXT NOT NULL,
        value REAL NOT NULL,
        categories TEXT NOT NULL DEFAULT '{}'
      );
      CREATE INDEX facts_by_metric ON facts (metric, commit_sha);
      CREATE INDEX facts_by_collector ON facts (collector);
    `);

    const insertCommit = db.prepare(
      "INSERT INTO commits (sha, authored_at, author_email, author_name) VALUES (?, ?, ?, ?)",
    );
    const insertFact = db.prepare(
      "INSERT INTO facts (commit_sha, collector, metric, value, categories) VALUES (?, ?, ?, ?, ?)",
    );

    let factCount = 0;
    db.exec("BEGIN");
    for (const commit of commits) {
      insertCommit.run(
        commit.sha,
        commit.date,
        commit.authorEmail,
        commit.authorName,
      );
      for (const [collector, facts] of commit.factsByCollector) {
        for (const fact of facts) {
          insertFact.run(
            commit.sha,
            collector,
            fact.metric,
            fact.value,
            JSON.stringify(fact.categories ?? {}),
          );
          factCount += 1;
        }
      }
    }
    db.exec("COMMIT");
    return factCount;
  } finally {
    db.close();
  }
};

export const runIndex = ({
  repoPath,
}: {
  readonly repoPath: string;
}): Effect.Effect<void, Error> =>
  Effect.gen(function* () {
    const repoRoot = yield* resolveRepoRoot(repoPath);
    const config = yield* loadConfig(repoRoot);
    const catalogPath = path.join(repoRoot, catalogDirName);
    const commitsPath = path.join(catalogPath, "commits");
    const registry = new Map(
      builtInCollectors.map((collector) => [collector.name, collector]),
    );

    const gitCommits = yield* listCommits(repoRoot);
    const catalogShas = new Set(
      yield* Effect.tryPromise({
        try: async () => {
          try {
            return await readdir(commitsPath);
          } catch {
            return [];
          }
        },
        catch: toError,
      }),
    );

    // Oldest first so every derived series is naturally chronological.
    const orderedCommits = gitCommits
      .toReversed()
      .filter((commit) => catalogShas.has(commit.hash));

    if (orderedCommits.length === 0) {
      return yield* Effect.fail(
        new Error(
          `No collected commits found in ${commitsPath} — run \`repo-dive scan\` first.`,
        ),
      );
    }

    let unknownCollectorDirs = 0;

    const commitFacts: CommitFacts[] = [];
    yield* Effect.forEach(
      orderedCommits,
      (commit) =>
        Effect.tryPromise({
          try: async (): Promise<CommitFacts> => {
            const commitDir = path.join(commitsPath, commit.hash);
            const factsByCollector = new Map<string, readonly Fact[]>();
            for (const collectorName of await readdir(commitDir)) {
              const collector = registry.get(collectorName);
              if (!collector) {
                unknownCollectorDirs += 1;
                continue;
              }
              const raw: unknown = JSON.parse(
                await readFile(
                  path.join(commitDir, collectorName, "output.json"),
                  "utf8",
                ),
              );
              factsByCollector.set(collectorName, collector.normalize(raw));
            }
            return {
              sha: commit.hash,
              date: commit.authorDate,
              authorEmail: commit.authorEmail,
              authorName: commit.authorName,
              factsByCollector,
            };
          },
          catch: toError,
        }).pipe(Effect.map((facts) => commitFacts.push(facts))),
      { concurrency: 16, discard: true },
    );

    // The map above may finish out of order; restore chronology.
    commitFacts.sort((left, right) => left.date.localeCompare(right.date));

    const indexDir = path.join(catalogPath, "index");
    yield* Effect.tryPromise({
      try: () => mkdir(indexDir, { recursive: true }),
      catch: toError,
    });

    const dbPath = path.join(indexDir, "metrics.sqlite");
    yield* Effect.tryPromise({
      try: () => rm(dbPath, { force: true }),
      catch: toError,
    });
    const factCount = yield* Effect.try({
      try: () => writeSqlite(dbPath, commitFacts),
      catch: toError,
    });

    const dashboardData = buildDashboardData(repoRoot, commitFacts, config);
    const dashboardPath = path.join(indexDir, "dashboard.json");
    yield* Effect.tryPromise({
      try: () =>
        writeFile(dashboardPath, JSON.stringify(dashboardData), "utf8"),
      catch: toError,
    });

    yield* Console.log(
      [
        `Indexed ${commitFacts.length} commits into ${factCount} facts.`,
        `Cube: ${dbPath}`,
        `Dashboard data: ${dashboardPath}`,
        ...(unknownCollectorDirs > 0
          ? [
              `Skipped ${unknownCollectorDirs} outputs from unknown collectors (see \`gc --stale\`).`,
            ]
          : []),
      ].join("\n"),
    );
  });
