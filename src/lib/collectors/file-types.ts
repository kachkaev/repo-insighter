import { Effect } from "effect";

import { runGit } from "../git.ts";
import { numberAt, recordAt } from "../json.ts";
import { type Collector, extensionOf, type Fact } from "./types.ts";

type FileTypeStats = {
  files: number;
  bytes: number;
};

export type FileTypesOutput = {
  readonly totalFiles: number;
  readonly totalBytes: number;
  readonly byExtension: Readonly<Record<string, FileTypeStats>>;
};

/** Parses `git ls-tree -r -l <sha>` output: "<mode> <type> <sha> <size>\t<path>" per entry. */
export const parseLsTree = (stdout: string): FileTypesOutput => {
  let totalFiles = 0;
  let totalBytes = 0;
  const byExtension: Record<string, FileTypeStats> = {};

  for (const line of stdout.split("\n")) {
    const tabIndex = line.indexOf("\t");
    if (tabIndex === -1) {
      continue;
    }

    const filePath = line.slice(tabIndex + 1);
    const [, type, , sizeRaw] = line.slice(0, tabIndex).split(/\s+/);
    if (type !== "blob") {
      continue;
    }

    const bytes = sizeRaw === "-" ? 0 : Number(sizeRaw);
    totalFiles += 1;
    totalBytes += bytes;

    const extension = extensionOf(filePath);
    const bucket = (byExtension[extension] ??= { files: 0, bytes: 0 });
    bucket.files += 1;
    bucket.bytes += bytes;
  }

  return { totalFiles, totalBytes, byExtension };
};

/**
 * File count and size per extension at this commit's tree — a cheap stand-in
 * for a proper language/LOC breakdown (tokei-style), which needs blob reads.
 */
export const fileTypesCollector: Collector = {
  name: "file-types",
  description: "File count and bytes per extension at each commit's tree",
  version: "1",
  strategy: "tree",
  defaultSampling: "all",
  collect: ({ repoRoot, sha }) =>
    runGit(["-C", repoRoot, "ls-tree", "-r", "-l", sha]).pipe(
      Effect.map(parseLsTree),
    ),
  normalize: (raw) => {
    const facts: Fact[] = [];
    for (const [extension, stats] of Object.entries(
      recordAt(raw, "byExtension"),
    )) {
      facts.push(
        {
          metric: "files.count",
          value: numberAt(stats, "files"),
          categories: { extension },
        },
        {
          metric: "files.bytes",
          value: numberAt(stats, "bytes"),
          categories: { extension },
        },
      );
    }
    return facts;
  },
};
