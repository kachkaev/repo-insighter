import { expect, test } from "vitest";

import { parseGitLog, summarizeCommits } from "../src/lib/scan.ts";

const separator = "\u001F";

const sampleLog = [
  [
    "aaa111",
    "Alice",
    "alice@example.com",
    "2026-02-03T04:05:06+00:00",
    "Add feature",
  ].join(separator),
  [
    "bbb222",
    "Bob",
    "bob@example.com",
    "2026-01-01T00:00:00+00:00",
    "Initial commit",
  ].join(separator),
  "",
].join("\n");

test("parseGitLog extracts commit metadata", () => {
  const commits = parseGitLog(sampleLog);

  expect(commits.length).toBe(2);
  expect(commits[0]).toStrictEqual({
    hash: "aaa111",
    authorName: "Alice",
    authorEmail: "alice@example.com",
    authorDate: "2026-02-03T04:05:06+00:00",
    subject: "Add feature",
  });
});

test("parseGitLog skips blank lines", () => {
  expect(parseGitLog("\n\n")).toStrictEqual([]);
});

test("summarizeCommits aggregates counts and date range", () => {
  const summary = summarizeCommits(parseGitLog(sampleLog));

  expect(summary).toStrictEqual({
    commitCount: 2,
    authorCount: 2,
    firstCommitDate: "2026-01-01T00:00:00+00:00",
    lastCommitDate: "2026-02-03T04:05:06+00:00",
  });
});

test("summarizeCommits handles an empty history", () => {
  expect(summarizeCommits([])).toStrictEqual({
    commitCount: 0,
    authorCount: 0,
    firstCommitDate: undefined,
    lastCommitDate: undefined,
  });
});
