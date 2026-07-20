import { Effect } from "effect";

import { numberAt, recordAt } from "../json.ts";
import { scanTreeWithBlobCache } from "./tree-scan.ts";
import type { Collector, Fact } from "./types.ts";

const markers = ["TODO", "FIXME", "HACK", "XXX"] as const;
const markerPatterns = markers.map(
  (marker) => [marker, new RegExp(String.raw`\b${marker}\b`)] as const,
);

type TodoCommentsOutput = {
  readonly total: number;
  readonly byMarker: Record<string, number>;
};

/** Scans one file's content; results are cached per blob by the tree scanner. */
export const scanFileForTodos = (content: string): TodoCommentsOutput => {
  const byMarker: Record<string, number> = {};
  let total = 0;

  for (const line of content.split("\n")) {
    for (const [marker, pattern] of markerPatterns) {
      if (pattern.test(line)) {
        byMarker[marker] = (byMarker[marker] ?? 0) + 1;
        total += 1;
      }
    }
  }

  return { total, byMarker };
};

const mergeTodos = (fileResults: readonly unknown[]): TodoCommentsOutput => {
  const byMarker: Record<string, number> = {};
  let total = 0;
  for (const result of fileResults) {
    total += numberAt(result, "total");
    for (const [marker, count] of Object.entries(
      recordAt(result, "byMarker"),
    )) {
      if (typeof count === "number") {
        byMarker[marker] = (byMarker[marker] ?? 0) + count;
      }
    }
  }
  return { total, byMarker };
};

export const todoCommentsCollector: Collector = {
  name: "todo-comments",
  description: "TODO/FIXME/HACK/XXX comment counts in source files",
  // Bumped 1 → 2 to invalidate outputs written by an early build of this
  // collector that recorded 0 for every commit. The scan is resumable and the
  // per-blob cache is version-keyed, so without this bump those stale zeros
  // (and their poisoned cache entries) would survive every re-scan.
  version: "2",
  strategy: "tree",
  defaultSampling: "all",
  collect: ({ repoRoot, sha }) =>
    scanTreeWithBlobCache({
      repoRoot,
      sha,
      collectorName: "todo-comments",
      collectorVersion: "1",
      scanContent: scanFileForTodos,
    }).pipe(
      Effect.map((files) => mergeTodos(files.map((file) => file.result))),
    ),
  normalize: (raw) => {
    const facts: Fact[] = [];
    for (const [marker, count] of Object.entries(recordAt(raw, "byMarker"))) {
      if (typeof count === "number") {
        facts.push({
          metric: "todos.count",
          value: count,
          categories: { marker },
        });
      }
    }
    return facts;
  },
};
