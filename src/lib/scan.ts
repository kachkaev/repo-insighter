import { Console, Effect } from "effect";

import {
  type Catalog,
  isCollected,
  openCatalog,
  writeCollectorOutput,
} from "./catalog.ts";
import { collectorCacheKey } from "./collectors/cache-key.ts";
import { resolveCollectors } from "./collectors/roster.ts";
import type { Collector } from "./collectors/types.ts";
import { loadConfig } from "./config.ts";
import { GitCommandError, runGit } from "./git.ts";
import {
  parseSamplingPolicy,
  sampleCommits,
  samplingLabel,
  type SamplingPolicy,
} from "./sampling.ts";
import { withTemporaryWorktree } from "./worktree.ts";

export type CommitMeta = {
  readonly hash: string;
  readonly authorName: string;
  readonly authorEmail: string;
  readonly authorDate: string;
  readonly subject: string;
};

const fieldSeparator = "\u001F";

const gitLogFormat = ["%H", "%an", "%ae", "%aI", "%s"].join("%x1f");

export const parseGitLog = (stdout: string): CommitMeta[] => {
  const commits: CommitMeta[] = [];

  for (const line of stdout.split("\n")) {
    const [
      hash = "",
      authorName = "",
      authorEmail = "",
      authorDate = "",
      subject = "",
    ] = line.split(fieldSeparator);

    if (!hash) {
      continue;
    }

    commits.push({ hash, authorName, authorEmail, authorDate, subject });
  }

  return commits;
};

export const resolveRepoRoot = (
  repoPath: string,
): Effect.Effect<string, Error> =>
  runGit(["-C", repoPath, "rev-parse", "--show-toplevel"]).pipe(
    Effect.map((stdout) => stdout.trim()),
    Effect.mapError(
      (error) =>
        new Error(
          error instanceof GitCommandError
            ? `Not a git repository: ${repoPath}`
            : `Unable to run git: ${error.message}`,
        ),
    ),
  );

/** Lists commits reachable from HEAD, newest first. Empty for a repo with no commits. */
export const listCommits = (
  repoRoot: string,
): Effect.Effect<CommitMeta[], Error> =>
  runGit(["-C", repoRoot, "log", `--format=${gitLogFormat}`]).pipe(
    Effect.catch((error) =>
      error instanceof GitCommandError &&
      error.stderr.includes("does not have any commits yet")
        ? Effect.succeed("")
        : Effect.fail(error),
    ),
    Effect.map(parseGitLog),
  );

export type RepoSummary = {
  readonly commitCount: number;
  readonly authorCount: number;
  readonly firstCommitDate: string | undefined;
  readonly lastCommitDate: string | undefined;
};

export const summarizeCommits = (
  commits: readonly CommitMeta[],
): RepoSummary => {
  const authorEmails = new Set(commits.map((commit) => commit.authorEmail));
  const dates = commits
    .map((commit) => commit.authorDate)
    .filter(Boolean)
    .toSorted();

  return {
    commitCount: commits.length,
    authorCount: authorEmails.size,
    firstCommitDate: dates.at(0),
    lastCommitDate: dates.at(-1),
  };
};

const runCollector = ({
  catalog,
  sha,
  collector,
  cacheKey,
  worktreePath,
}: {
  readonly catalog: Catalog;
  readonly sha: string;
  readonly collector: Collector;
  readonly cacheKey: string;
  readonly worktreePath?: string | undefined;
}): Effect.Effect<void, Error> =>
  Effect.gen(function* () {
    const startedAt = Date.now();
    const output = yield* collector
      .collect({ repoRoot: catalog.repoRoot, sha, cacheKey, worktreePath })
      .pipe(
        Effect.mapError(
          (error) =>
            new Error(
              `Collector ${collector.name} failed on ${sha.slice(0, 10)}: ${error.message}`,
            ),
        ),
      );
    yield* writeCollectorOutput({
      catalog,
      sha,
      collector,
      cacheKey,
      output,
      durationMs: Date.now() - startedAt,
    });
  });

const collectCommit = ({
  catalog,
  sha,
  collectors,
  cacheKeyOf,
  force,
  failures,
}: {
  readonly catalog: Catalog;
  readonly sha: string;
  readonly collectors: readonly Collector[];
  readonly cacheKeyOf: (collector: Collector) => string;
  readonly force: boolean;
  /** Failed runs are recorded here instead of aborting the whole scan. */
  readonly failures: string[];
}): Effect.Effect<{ run: number; skipped: number }, Error> =>
  Effect.gen(function* () {
    const pending: Collector[] = [];
    let skipped = 0;

    for (const collector of collectors) {
      if (
        !force &&
        (yield* isCollected(catalog, sha, collector, cacheKeyOf(collector)))
      ) {
        skipped += 1;
      } else {
        pending.push(collector);
      }
    }

    const direct = pending.filter(
      (collector) => collector.strategy !== "worktree",
    );
    const needingWorktree = pending.filter(
      (collector) => collector.strategy === "worktree",
    );

    let run = 0;
    for (const collector of direct) {
      const outcome = yield* runCollector({
        catalog,
        sha,
        collector,
        cacheKey: cacheKeyOf(collector),
      }).pipe(
        Effect.map(() => true),
        Effect.catch((error) => {
          failures.push(error.message);
          return Effect.succeed(false);
        }),
      );
      if (outcome) {
        run += 1;
      }
    }

    if (needingWorktree.length > 0) {
      yield* withTemporaryWorktree(catalog.repoRoot, sha, (worktreePath) =>
        Effect.forEach(
          needingWorktree,
          (collector) =>
            runCollector({
              catalog,
              sha,
              collector,
              cacheKey: cacheKeyOf(collector),
              worktreePath,
            }).pipe(
              Effect.map(() => {
                run += 1;
              }),
              Effect.catch((error) => {
                failures.push(error.message);
                return Effect.void;
              }),
            ),
          { discard: true },
        ),
      ).pipe(
        Effect.catch((error) => {
          failures.push(`Worktree for ${sha.slice(0, 10)}: ${error.message}`);
          return Effect.void;
        }),
      );
    }

    return { run, skipped };
  });

export const runScan = ({
  repoPath,
  collectorNames,
  maxCommits,
  sample,
  force = false,
}: {
  readonly repoPath: string;
  readonly collectorNames?: string | undefined;
  readonly maxCommits?: number | undefined;
  readonly sample?: string | undefined;
  readonly force?: boolean | undefined;
}): Effect.Effect<void, Error> =>
  Effect.gen(function* () {
    const collectors = resolveCollectors(collectorNames);
    if (collectors instanceof Error) {
      return yield* Effect.fail(collectors);
    }

    let sampleOverride: SamplingPolicy | undefined;
    if (sample !== undefined) {
      const parsed = parseSamplingPolicy(sample);
      if (parsed instanceof Error) {
        return yield* Effect.fail(parsed);
      }
      sampleOverride = parsed;
    }

    const repoRoot = yield* resolveRepoRoot(repoPath);
    const commits = yield* listCommits(repoRoot);
    const selected =
      maxCommits === undefined ? commits : commits.slice(0, maxCommits);

    const catalog = yield* openCatalog(repoRoot);
    const summary = summarizeCommits(commits);

    // One fingerprint per collector for the whole run: the config it depends on
    // is fixed, so this decides re-collection uniformly across every commit.
    const config = yield* loadConfig(repoRoot);
    const cacheKeys = new Map(
      collectors.map((collector) => [
        collector.name,
        collectorCacheKey(collector, config),
      ]),
    );
    const cacheKeyOf = (collector: Collector): string =>
      cacheKeys.get(collector.name) ?? collectorCacheKey(collector, config);

    const plans = collectors.map((collector) => {
      const policy = sampleOverride ?? collector.defaultSampling;
      return {
        collector,
        policy,
        shas: new Set(
          sampleCommits(selected, policy).map((commit) => commit.hash),
        ),
      };
    });

    yield* Console.log(
      `Plan: ${plans
        .map(
          (plan) =>
            `${plan.collector.name} → ${plan.shas.size} commits (${samplingLabel(plan.policy)})`,
        )
        .join(", ")}`,
    );

    let totalRun = 0;
    let totalSkipped = 0;
    let processed = 0;
    const failures: string[] = [];

    // Batch phase: collectors that can cover many commits per subprocess do so
    // up front; whatever they produced is excluded from the per-commit phase.
    const batchDone = new Map<string, ReadonlySet<string>>();
    for (const plan of plans) {
      const { collector } = plan;
      if (!collector.collectBatch) {
        continue;
      }
      const pending = new Set<string>();
      for (const sha of plan.shas) {
        if (
          force ||
          !(yield* isCollected(catalog, sha, collector, cacheKeyOf(collector)))
        ) {
          pending.add(sha);
        }
      }
      totalSkipped += plan.shas.size - pending.size;
      if (pending.size === 0) {
        batchDone.set(collector.name, plan.shas);
        continue;
      }

      const batchStartedAt = Date.now();
      const outputs = yield* collector
        .collectBatch({ repoRoot, shas: pending })
        .pipe(
          Effect.catch((error) => {
            failures.push(`Batch ${collector.name}: ${error.message}`);
            return Effect.succeed(new Map<string, unknown>());
          }),
        );
      const durationMs = Math.max(
        1,
        Math.round((Date.now() - batchStartedAt) / Math.max(1, outputs.size)),
      );

      const written = new Set<string>();
      yield* Effect.forEach(
        [...outputs.entries()],
        ([sha, output]) =>
          writeCollectorOutput({
            catalog,
            sha,
            collector,
            cacheKey: cacheKeyOf(collector),
            output,
            durationMs,
          }).pipe(
            Effect.map(() => {
              written.add(sha);
            }),
          ),
        { concurrency: 16, discard: true },
      );
      totalRun += written.size;

      const done = new Set(plan.shas);
      for (const sha of pending) {
        if (!written.has(sha)) {
          done.delete(sha); // fall back to per-commit collect()
        }
      }
      batchDone.set(collector.name, done);
      if (written.size > 0) {
        yield* Console.log(
          `Batched ${collector.name}: ${written.size} commits in one pass.`,
        );
      }
    }

    const startedAt = Date.now();

    const formatEta = (): string => {
      const elapsedSeconds = (Date.now() - startedAt) / 1000;
      const rate = processed / Math.max(1, elapsedSeconds);
      const remainingSeconds = Math.round(
        (selected.length - processed) / Math.max(0.01, rate),
      );
      const minutes = Math.floor(remainingSeconds / 60);
      const seconds = remainingSeconds % 60;
      return `${Math.round(rate)}/s, ~${minutes > 0 ? `${minutes}m ` : ""}${seconds}s left`;
    };

    yield* Effect.forEach(
      selected,
      (commit) =>
        collectCommit({
          catalog,
          sha: commit.hash,
          collectors: plans
            .filter(
              (plan) =>
                plan.shas.has(commit.hash) &&
                !batchDone.get(plan.collector.name)?.has(commit.hash),
            )
            .map((plan) => plan.collector),
          cacheKeyOf,
          force,
          failures,
        }).pipe(
          Effect.tap(({ run, skipped }) =>
            Effect.gen(function* () {
              totalRun += run;
              totalSkipped += skipped;
              processed += 1;
              if (processed % 250 === 0) {
                yield* Console.log(
                  `Scanned ${processed}/${selected.length} commits (${formatEta()})…`,
                );
              }
            }),
          ),
        ),
      { concurrency: 4, discard: true },
    );

    yield* Console.log(
      [
        `Repository: ${repoRoot}`,
        `Commits: ${summary.commitCount} (${summary.authorCount} authors, ${
          summary.firstCommitDate ?? "n/a"
        } — ${summary.lastCommitDate ?? "n/a"})`,
        `Collector runs: ${totalRun} new, ${totalSkipped} already collected` +
          (failures.length > 0 ? `, ${failures.length} failed` : ""),
        `Catalog: ${catalog.rootPath}`,
      ].join("\n"),
    );

    if (failures.length > 0) {
      yield* Console.error(
        [
          `${failures.length} collector runs failed (re-run scan to retry):`,
          ...failures.slice(0, 10).map((message) => `  ${message}`),
          ...(failures.length > 10
            ? [`  … and ${failures.length - 10} more`]
            : []),
        ].join("\n"),
      );
    }
  });
