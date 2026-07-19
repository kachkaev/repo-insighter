import { Effect } from "effect";

import { runGit } from "../git.ts";
import { arrayAt, stringAt } from "../json.ts";
import type { Collector, Fact } from "./types.ts";

const fieldSeparator = "\u001F";

const format = [
  "%H",
  "%an",
  "%ae",
  "%aI",
  "%cn",
  "%ce",
  "%cI",
  "%P",
  "%s",
  "%(trailers:unfold=true)",
].join("%x1f");

export type CommitTrailer = {
  readonly key: string;
  readonly value: string;
};

export type CommitMetaOutput = {
  readonly sha: string;
  readonly authorName: string;
  readonly authorEmail: string;
  readonly authoredAt: string;
  readonly committerName: string;
  readonly committerEmail: string;
  readonly committedAt: string;
  readonly parents: readonly string[];
  readonly subject: string;
  readonly trailers: readonly CommitTrailer[];
  /** Values of Co-authored-by trailers, verbatim (e.g. "Name <email>"). */
  readonly coAuthors: readonly string[];
};

export const parseTrailers = (raw: string): CommitTrailer[] => {
  const trailers: CommitTrailer[] = [];

  for (const line of raw.split("\n")) {
    const colonIndex = line.indexOf(":");
    if (colonIndex <= 0) {
      continue;
    }
    const key = line.slice(0, colonIndex).trim();
    const value = line.slice(colonIndex + 1).trim();
    if (key && value) {
      trailers.push({ key, value });
    }
  }

  return trailers;
};

export const parseCommitMeta = (stdout: string): CommitMetaOutput => {
  const [
    sha = "",
    authorName = "",
    authorEmail = "",
    authoredAt = "",
    committerName = "",
    committerEmail = "",
    committedAt = "",
    parentsRaw = "",
    subject = "",
    trailersRaw = "",
  ] = stdout.trim().split(fieldSeparator);

  const trailers = parseTrailers(trailersRaw);

  return {
    sha,
    authorName,
    authorEmail,
    authoredAt,
    committerName,
    committerEmail,
    committedAt,
    parents: parentsRaw.split(" ").filter(Boolean),
    subject,
    trailers,
    coAuthors: trailers
      .filter((trailer) => trailer.key.toLowerCase() === "co-authored-by")
      .map((trailer) => trailer.value),
  };
};

export const commitMetaCollector: Collector = {
  name: "commit-meta",
  description:
    "Author/committer identities, dates, parents, subject and trailers (incl. co-authors)",
  version: "2",
  strategy: "log",
  defaultSampling: "all",
  collect: ({ repoRoot, sha }) =>
    runGit(["-C", repoRoot, "show", "-s", `--format=${format}`, sha]).pipe(
      Effect.map(parseCommitMeta),
    ),
  normalize: (raw) => {
    const facts: Fact[] = [
      {
        metric: "commits.count",
        value: 1,
        categories: { author: stringAt(raw, "authorEmail") },
      },
    ];
    for (const coAuthor of arrayAt(raw, "coAuthors")) {
      if (typeof coAuthor === "string") {
        facts.push({
          metric: "commits.coAuthor",
          value: 1,
          categories: { coAuthor },
        });
      }
    }
    return facts;
  },
};
