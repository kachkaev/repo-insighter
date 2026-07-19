import { Effect } from "effect";

import { runGit } from "../git.ts";
import { type Collector, extensionOf } from "./types.ts";

type ChurnByExtension = {
  files: number;
  added: number;
  deleted: number;
};

export type ChurnOutput = {
  readonly filesChanged: number;
  readonly added: number;
  readonly deleted: number;
  readonly binaryFiles: number;
  readonly byExtension: Readonly<Record<string, ChurnByExtension>>;
};

/** Parses `git show --numstat --format=` output: "<added>\t<deleted>\t<path>" per file. */
export const parseNumstat = (stdout: string): ChurnOutput => {
  let filesChanged = 0;
  let added = 0;
  let deleted = 0;
  let binaryFiles = 0;
  const byExtension: Record<string, ChurnByExtension> = {};

  for (const line of stdout.split("\n")) {
    const [addedRaw, deletedRaw, filePath] = line.split("\t");
    if (!filePath || addedRaw === undefined || deletedRaw === undefined) {
      continue;
    }

    filesChanged += 1;
    const extension = extensionOf(filePath);
    const bucket = (byExtension[extension] ??= {
      files: 0,
      added: 0,
      deleted: 0,
    });
    bucket.files += 1;

    if (addedRaw === "-" || deletedRaw === "-") {
      binaryFiles += 1;
      continue;
    }

    const fileAdded = Number(addedRaw);
    const fileDeleted = Number(deletedRaw);
    added += fileAdded;
    deleted += fileDeleted;
    bucket.added += fileAdded;
    bucket.deleted += fileDeleted;
  }

  return { filesChanged, added, deleted, binaryFiles, byExtension };
};

/**
 * Lines added/deleted relative to the first parent (empty for most merge
 * commits, which `git show` diffs in combined mode).
 */
export const churnCollector: Collector = {
  name: "churn",
  description:
    "Lines added/deleted per commit vs first parent, by file extension",
  version: "1",
  strategy: "log",
  defaultSampling: "all",
  collect: ({ repoRoot, sha }) =>
    runGit(["-C", repoRoot, "show", "--numstat", "--format=", sha]).pipe(
      Effect.map(parseNumstat),
    ),
};
