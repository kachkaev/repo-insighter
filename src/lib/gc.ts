import { readdir, rm } from "node:fs/promises";
import path from "node:path";

import { NodeServices } from "@effect/platform-node";
import { Console, Effect } from "effect";
import { Prompt } from "effect/unstable/cli";

import {
  type BlobCacheNamespace,
  listBlobCacheNamespaces,
  pruneBlobCacheNamespaces,
} from "./blob-cache.ts";
import { catalogDirName, readCollectorCacheKey } from "./catalog.ts";
import { collectorCacheKey } from "./collectors/cache-key.ts";
import { builtInCollectors } from "./collectors/roster.ts";
import { describesTreeState } from "./collectors/types.ts";
import { loadConfig } from "./config.ts";
import { runGit } from "./git.ts";
import { listFirstParentShas, resolveRepoRoot } from "./scan.ts";

const toError = (error: unknown) =>
  error instanceof Error ? error : new Error(String(error));

const readdirIfExists = (dirPath: string) =>
  Effect.tryPromise({
    try: async () => {
      try {
        return await readdir(dirPath);
      } catch (error) {
        if (
          error instanceof Error &&
          "code" in error &&
          error.code === "ENOENT"
        ) {
          return [];
        }
        throw error;
      }
    },
    catch: toError,
  });

type StaleOutput = {
  readonly sha: string;
  readonly collectorName: string;
  readonly reason: string;
};

type CollectorOutput = {
  readonly sha: string;
  readonly collectorName: string;
};

type GcPlan = {
  readonly catalogPath: string;
  readonly commitsPath: string;
  /** Catalog commit shas not reachable from HEAD. */
  readonly unreachableShas: readonly string[];
  /** Snapshot outputs stored under commits off HEAD's first-parent chain. */
  readonly offMainlineOutputs: readonly CollectorOutput[];
  /** Outputs whose collector is unknown or whose version is no longer current. */
  readonly staleOutputs: readonly StaleOutput[];
  /** Output counts per collector present in the catalog. */
  readonly countsByCollector: ReadonlyMap<string, number>;
  /** Blob-cache namespaces no registered collector can ever look up again. */
  readonly staleCacheNamespaces: readonly BlobCacheNamespace[];
};

const buildPlan = (repoRoot: string): Effect.Effect<GcPlan, Error> =>
  Effect.gen(function* () {
    const catalogPath = path.join(repoRoot, catalogDirName);
    const commitsPath = path.join(catalogPath, "commits");
    const catalogShas = yield* readdirIfExists(commitsPath);

    const reachable = new Set(
      (yield* runGit(["-C", repoRoot, "rev-list", "HEAD"]))
        .split("\n")
        .filter(Boolean),
    );
    const firstParentShas = yield* listFirstParentShas(repoRoot);

    const config = yield* loadConfig(repoRoot);
    const currentCacheKeys = new Map(
      builtInCollectors.map((collector) => [
        collector.name,
        collectorCacheKey(collector, config),
      ]),
    );
    const snapshotCollectorNames = new Set(
      builtInCollectors
        .filter((collector) => describesTreeState(collector))
        .map((collector) => collector.name),
    );

    const unreachableShas: string[] = [];
    const offMainlineOutputs: CollectorOutput[] = [];
    const staleOutputs: StaleOutput[] = [];
    const countsByCollector = new Map<string, number>();

    for (const sha of catalogShas) {
      if (!reachable.has(sha)) {
        unreachableShas.push(sha);
        continue;
      }

      const collectorNames = yield* readdirIfExists(
        path.join(commitsPath, sha),
      );
      for (const collectorName of collectorNames) {
        countsByCollector.set(
          collectorName,
          (countsByCollector.get(collectorName) ?? 0) + 1,
        );

        if (
          !firstParentShas.has(sha) &&
          snapshotCollectorNames.has(collectorName)
        ) {
          offMainlineOutputs.push({ sha, collectorName });
        }

        const currentCacheKey = currentCacheKeys.get(collectorName);
        if (currentCacheKey === undefined) {
          staleOutputs.push({
            sha,
            collectorName,
            reason: "collector no longer exists",
          });
          continue;
        }
        const writtenCacheKey = yield* readCollectorCacheKey(
          { repoRoot, rootPath: catalogPath },
          sha,
          collectorName,
        );
        if (writtenCacheKey !== currentCacheKey) {
          staleOutputs.push({
            sha,
            collectorName,
            reason: `fingerprint ${String(writtenCacheKey)} ≠ current ${currentCacheKey}`,
          });
        }
      }
    }

    // A cache namespace is live only while some registered collector still
    // computes the very fingerprint it was written under; anything else is
    // unreachable by construction, since lookups key on exactly that pair.
    const liveNamespaces = new Set(
      [...currentCacheKeys].map(
        ([collectorName, cacheKey]) => `${collectorName}:${cacheKey}`,
      ),
    );
    const staleCacheNamespaces = (yield* Effect.try({
      try: () => listBlobCacheNamespaces(repoRoot),
      catch: toError,
    })).filter(
      (namespace) =>
        !liveNamespaces.has(`${namespace.collector}:${namespace.cacheKey}`),
    );

    return {
      catalogPath,
      commitsPath,
      unreachableShas,
      offMainlineOutputs,
      staleOutputs,
      countsByCollector,
      staleCacheNamespaces,
    };
  });

const removePaths = (
  paths: readonly string[],
  dryRun: boolean,
): Effect.Effect<void, Error> =>
  dryRun
    ? Effect.void
    : Effect.forEach(
        paths,
        (target) =>
          Effect.tryPromise({
            try: () => rm(target, { force: true, recursive: true }),
            catch: toError,
          }),
        { concurrency: 8, discard: true },
      );

/** Removes commit dirs that became empty after collector-output removal. */
const pruneEmptyCommitDirs = (
  commitsPath: string,
): Effect.Effect<number, Error> =>
  Effect.gen(function* () {
    let pruned = 0;
    for (const sha of yield* readdirIfExists(commitsPath)) {
      const commitDir = path.join(commitsPath, sha);
      if ((yield* readdirIfExists(commitDir)).length === 0) {
        yield* Effect.tryPromise({
          try: () => rm(commitDir, { force: true, recursive: true }),
          catch: toError,
        });
        pruned += 1;
      }
    }
    return pruned;
  });

const staleCacheEntryCount = (plan: GcPlan): number =>
  plan.staleCacheNamespaces.reduce(
    (total, namespace) => total + namespace.entryCount,
    0,
  );

/** Human-readable size, e.g. "3.4 MB". */
const formatBytes = (bytes: number): string => {
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${unitIndex === 0 ? value : value.toFixed(1)} ${units[unitIndex]}`;
};

export const runGc = ({
  repoPath,
  unreachable,
  offMainline,
  stale,
  collectorNames,
  dryRun = false,
  yes = false,
}: {
  readonly repoPath: string;
  readonly unreachable?: boolean | undefined;
  readonly offMainline?: boolean | undefined;
  readonly stale?: boolean | undefined;
  readonly collectorNames?: string | undefined;
  readonly dryRun?: boolean | undefined;
  readonly yes?: boolean | undefined;
}): Effect.Effect<void, Error> =>
  Effect.gen(function* () {
    const repoRoot = yield* resolveRepoRoot(repoPath);
    const plan = yield* buildPlan(repoRoot);

    const requestedCollectors = (collectorNames ?? "")
      .split(",")
      .map((name) => name.trim())
      .filter(Boolean);

    const anyFlagGiven =
      unreachable === true ||
      offMainline === true ||
      stale === true ||
      requestedCollectors.length > 0;

    let removeUnreachable = unreachable === true;
    let removeOffMainline = offMainline === true;
    let removeStale = stale === true;
    let collectorsToRemove = requestedCollectors;

    if (!anyFlagGiven) {
      // Interactive mode: show what exists and let the user pick.
      type Action =
        | { readonly kind: "unreachable" }
        | { readonly kind: "offMainline" }
        | { readonly kind: "stale" }
        | { readonly kind: "collector"; readonly name: string };

      const choices: Array<{ title: string; value: Action }> = [];
      if (plan.unreachableShas.length > 0) {
        choices.push({
          title: `Data for ${plan.unreachableShas.length} commits no longer reachable from HEAD`,
          value: { kind: "unreachable" },
        });
      }
      if (plan.offMainlineOutputs.length > 0) {
        choices.push({
          title: `${plan.offMainlineOutputs.length} snapshot outputs taken off HEAD's first-parent chain (left out of the cube)`,
          value: { kind: "offMainline" },
        });
      }
      if (
        plan.staleOutputs.length > 0 ||
        plan.staleCacheNamespaces.length > 0
      ) {
        const parts = [
          ...(plan.staleOutputs.length > 0
            ? [`${plan.staleOutputs.length} collector outputs`]
            : []),
          ...(plan.staleCacheNamespaces.length > 0
            ? [`${staleCacheEntryCount(plan)} blob-cache entries`]
            : []),
        ];
        choices.push({
          title: `Stale ${parts.join(" and ")} (old versions or removed collectors)`,
          value: { kind: "stale" },
        });
      }
      for (const [name, count] of [
        ...plan.countsByCollector.entries(),
      ].toSorted(([left], [right]) => left.localeCompare(right))) {
        choices.push({
          title: `All ${count} outputs of collector "${name}"`,
          value: { kind: "collector", name },
        });
      }

      if (choices.length === 0) {
        yield* Console.log("Catalog is clean — nothing to garbage-collect.");
        return;
      }

      const selected = yield* Prompt.run(
        Prompt.multiSelect<Action>({
          message: "What should be removed from the catalog?",
          choices,
        }),
      ).pipe(Effect.mapError(() => new Error("Aborted.")));

      if (selected.length === 0) {
        yield* Console.log("Nothing selected — catalog left untouched.");
        return;
      }

      removeUnreachable = selected.some(
        (action) => action.kind === "unreachable",
      );
      removeOffMainline = selected.some(
        (action) => action.kind === "offMainline",
      );
      removeStale = selected.some((action) => action.kind === "stale");
      collectorsToRemove = selected.flatMap((action) =>
        action.kind === "collector" ? [action.name] : [],
      );
    }

    // A folder can qualify on more than one count (an off-mainline snapshot
    // written by an old version, say), so paths are deduplicated.
    const targets = new Set<string>();
    const reportLines: string[] = [];

    if (removeUnreachable && plan.unreachableShas.length > 0) {
      for (const sha of plan.unreachableShas) {
        targets.add(path.join(plan.commitsPath, sha));
      }
      reportLines.push(
        `${plan.unreachableShas.length} unreachable commit folders`,
      );
    }
    if (removeOffMainline && plan.offMainlineOutputs.length > 0) {
      for (const output of plan.offMainlineOutputs) {
        targets.add(
          path.join(plan.commitsPath, output.sha, output.collectorName),
        );
      }
      reportLines.push(
        `${plan.offMainlineOutputs.length} off-mainline snapshot outputs`,
      );
    }
    if (removeStale && plan.staleOutputs.length > 0) {
      for (const output of plan.staleOutputs) {
        targets.add(
          path.join(plan.commitsPath, output.sha, output.collectorName),
        );
      }
      reportLines.push(`${plan.staleOutputs.length} stale collector outputs`);
    }
    const pruneCacheNamespaces =
      removeStale && plan.staleCacheNamespaces.length > 0;
    if (pruneCacheNamespaces) {
      reportLines.push(
        `${staleCacheEntryCount(plan)} stale blob-cache entries`,
      );
    }
    for (const name of collectorsToRemove) {
      const count = plan.countsByCollector.get(name) ?? 0;
      if (count === 0) {
        yield* Console.log(
          `Collector "${name}" has no outputs in the catalog.`,
        );
        continue;
      }
      const shas = yield* readdirIfExists(plan.commitsPath);
      for (const sha of shas) {
        targets.add(path.join(plan.commitsPath, sha, name));
      }
      reportLines.push(`${count} outputs of collector "${name}"`);
    }

    if (targets.size === 0 && !pruneCacheNamespaces) {
      yield* Console.log("Nothing to garbage-collect.");
      return;
    }

    const summary = `Removing ${reportLines.join(", ")}.`;
    if (dryRun) {
      yield* Console.log(`[dry-run] ${summary}`);
      return;
    }

    if (!yes) {
      const confirmed = yield* Prompt.run(
        Prompt.confirm({ message: summary.replace(/\.$/, "?") }),
      ).pipe(Effect.mapError(() => new Error("Aborted.")));
      if (!confirmed) {
        yield* Console.log("Aborted — catalog left untouched.");
        return;
      }
    }

    yield* removePaths([...targets], false);
    const pruned = yield* pruneEmptyCommitDirs(plan.commitsPath);
    const cacheBytesReclaimed = pruneCacheNamespaces
      ? yield* Effect.try({
          try: () =>
            pruneBlobCacheNamespaces(repoRoot, plan.staleCacheNamespaces),
          catch: toError,
        })
      : 0;

    yield* Console.log(
      `${summary}${pruned > 0 ? ` Pruned ${pruned} empty commit folders.` : ""}` +
        `${cacheBytesReclaimed > 0 ? ` Blob cache shrank by ${formatBytes(cacheBytesReclaimed)}.` : ""} ` +
        "Run `repo-dive index` to refresh rollups.",
    );
  }).pipe(Effect.provide(NodeServices.layer));
