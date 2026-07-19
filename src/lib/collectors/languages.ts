import { Effect } from "effect";

import { runCommand } from "../git.ts";
import type { Collector } from "./types.ts";

type LanguageStats = {
  files: number;
  code: number;
  comments: number;
  blanks: number;
  /** code + comments + blanks (incl. embedded children folded into the parent) */
  lines: number;
};

export type LanguagesOutput = {
  readonly byLanguage: Record<string, LanguageStats>;
  readonly totalLines: number;
  readonly totalFiles: number;
};

const statsLines = (stats: {
  code?: number;
  comments?: number;
  blanks?: number;
}): number => (stats.code ?? 0) + (stats.comments ?? 0) + (stats.blanks ?? 0);

const asRecord = (value: unknown): Record<string, unknown> | undefined =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value))
    : undefined;

const numberAt = (record: Record<string, unknown>, key: string): number => {
  const value = record[key];
  return typeof value === "number" ? value : 0;
};

/**
 * Parses `tokei --output json`. Embedded languages (e.g. code fences inside
 * Markdown) appear under the parent's `children` and are folded back into the
 * parent here: a Markdown file counts as Markdown in full, per this project's
 * "count docs as a whole" policy.
 */
export const parseTokeiJson = (stdout: string): LanguagesOutput => {
  const parsed: unknown = JSON.parse(stdout);
  const languages = asRecord(parsed) ?? {};
  const byLanguage: Record<string, LanguageStats> = {};
  let totalLines = 0;
  let totalFiles = 0;

  for (const [language, infoRaw] of Object.entries(languages)) {
    if (language === "Total") {
      continue;
    }
    const info = asRecord(infoRaw);
    if (!info) {
      continue;
    }

    const reports = Array.isArray(info["reports"]) ? info["reports"] : [];
    const files = reports.length;
    const code = numberAt(info, "code");
    const comments = numberAt(info, "comments");
    const blanks = numberAt(info, "blanks");
    let lines = code + comments + blanks;

    // Fold embedded child languages (their lines live inside this language's
    // files) back into the parent.
    const children = asRecord(info["children"]);
    if (children) {
      for (const childReports of Object.values(children)) {
        if (!Array.isArray(childReports)) {
          continue;
        }
        for (const childReportRaw of childReports) {
          const childReport = asRecord(childReportRaw);
          const childStats = childReport && asRecord(childReport["stats"]);
          if (childStats) {
            lines += statsLines({
              code: numberAt(childStats, "code"),
              comments: numberAt(childStats, "comments"),
              blanks: numberAt(childStats, "blanks"),
            });
          }
        }
      }
    }

    if (files === 0 && lines === 0) {
      continue;
    }

    byLanguage[language] = { files, code, comments, blanks, lines };
    totalLines += lines;
    totalFiles += files;
  }

  return { byLanguage, totalLines, totalFiles };
};

export const languagesCollector: Collector = {
  name: "languages",
  description:
    "Language/LOC breakdown via tokei (requires tokei; runs on a temporary worktree; sampled monthly by default)",
  version: "1",
  strategy: "worktree",
  defaultSampling: "monthly",
  collect: ({ worktreePath }) =>
    worktreePath === undefined
      ? Effect.fail(
          new Error("languages collector requires a worktree checkout"),
        )
      : runCommand("tokei", ["--output", "json", "."], {
          cwd: worktreePath,
        }).pipe(
          Effect.map(parseTokeiJson),
          Effect.mapError((error) =>
            error.message.includes("ENOENT")
              ? new Error(
                  "tokei is not installed (the languages collector shells out to it). " +
                    "Install it via `brew install tokei` or see https://github.com/XAMPPRocky/tokei.",
                )
              : error,
          ),
        ),
};
