import { expect, test } from "vitest";

import { parseSamplingPolicy, sampleCommits } from "../src/lib/sampling.ts";

function commit(hash: string, authorDate: string) {
  return {
    hash,
    authorName: "A",
    authorEmail: "a@example.com",
    authorDate,
    subject: "s",
  };
}

const commits = [
  commit("e", "2026-03-15T10:00:00Z"),
  commit("d", "2026-03-01T10:00:00Z"),
  commit("c", "2026-02-20T10:00:00Z"),
  commit("b", "2025-12-31T10:00:00Z"),
  commit("a", "2025-12-01T10:00:00Z"),
];

test("sampleCommits keeps everything for all", () => {
  expect(sampleCommits(commits, "all").length).toBe(5);
});

test("sampleCommits keeps the newest commit per month", () => {
  expect(
    sampleCommits(commits, "monthly").map((entry) => entry.hash),
  ).toStrictEqual(["e", "c", "b"]);
});

test("sampleCommits keeps the newest commit per quarter", () => {
  expect(
    sampleCommits(commits, "quarterly").map((entry) => entry.hash),
  ).toStrictEqual(["e", "b"]);
});

test("sampleCommits supports every-nth", () => {
  expect(
    sampleCommits(commits, { everyNth: 2 }).map((entry) => entry.hash),
  ).toStrictEqual(["e", "c", "a"]);
});

test("parseSamplingPolicy accepts known policies and rejects others", () => {
  expect(parseSamplingPolicy("monthly")).toBe("monthly");
  expect(parseSamplingPolicy("every-nth:5")).toStrictEqual({ everyNth: 5 });
  expect(parseSamplingPolicy("fortnightly")).toBeInstanceOf(Error);
  expect(parseSamplingPolicy("every-nth:0")).toBeInstanceOf(Error);
});
