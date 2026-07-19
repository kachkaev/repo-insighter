import { Effect } from "effect";

import { runGit } from "../git.ts";
import { type Collector, extensionOf, isScannableSourceFile } from "./types.ts";

type SurvivalRow = {
  readonly extension: string;
  readonly authorEmail: string;
  /** YYYY-MM the line's commit was authored — the line's age cohort. */
  readonly cohortMonth: string;
  readonly lines: number;
};

type SurvivalOutput = {
  readonly rows: readonly SurvivalRow[];
  readonly totalLines: number;
  readonly fileCount: number;
};

const monthOf = (unixSeconds: number): string => {
  const date = new Date(unixSeconds * 1000);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
};

type LineAttribution = {
  readonly authorEmail: string;
  readonly cohortMonth: string;
};

/**
 * Parses `git blame --line-porcelain` output into one attribution per line.
 * Porcelain repeats full headers per line, so author-mail/author-time always
 * precede the tab-prefixed content line they describe.
 */
export const parseBlamePorcelain = (stdout: string): LineAttribution[] => {
  const attributions: LineAttribution[] = [];
  let authorEmail = "";
  let authorTime = 0;

  for (const line of stdout.split("\n")) {
    if (line.startsWith("author-mail ")) {
      authorEmail = line.slice("author-mail ".length).replaceAll(/^<|>$/g, "");
    } else if (line.startsWith("author-time ")) {
      authorTime = Number(line.slice("author-time ".length));
    } else if (line.startsWith("\t")) {
      attributions.push({
        authorEmail,
        cohortMonth: monthOf(authorTime),
      });
    }
  }

  return attributions;
};

export const survivalCollector: Collector = {
  name: "survival",
  description:
    "Line survival via git blame: living lines by extension, author and age cohort (sampled monthly by default; expensive)",
  version: "1",
  strategy: "tree",
  defaultSampling: "monthly",
  collect: ({ repoRoot, sha }) =>
    Effect.gen(function* () {
      const fileList = yield* runGit([
        "-C",
        repoRoot,
        "ls-tree",
        "-r",
        "--name-only",
        sha,
      ]);
      const files = fileList.split("\n").filter(isScannableSourceFile);

      const counts = new Map<string, number>();
      let totalLines = 0;

      yield* Effect.forEach(
        files,
        (filePath) =>
          runGit([
            "-C",
            repoRoot,
            "blame",
            "--line-porcelain",
            "-w",
            sha,
            "--",
            filePath,
          ]).pipe(
            Effect.map((stdout) => {
              const extension = extensionOf(filePath);
              for (const attribution of parseBlamePorcelain(stdout)) {
                const key = `${extension}\u001F${attribution.authorEmail}\u001F${attribution.cohortMonth}`;
                counts.set(key, (counts.get(key) ?? 0) + 1);
                totalLines += 1;
              }
            }),
          ),
        { concurrency: 8, discard: true },
      );

      const rows: SurvivalRow[] = [...counts.entries()].map(([key, lines]) => {
        const [extension = "", authorEmail = "", cohortMonth = ""] =
          key.split("\u001F");
        return { extension, authorEmail, cohortMonth, lines };
      });

      return {
        rows,
        totalLines,
        fileCount: files.length,
      } satisfies SurvivalOutput;
    }),
};
