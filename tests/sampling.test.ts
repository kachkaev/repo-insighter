import assert from "node:assert/strict";
import test from "node:test";

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

void test("sampleCommits keeps everything for all", () => {
  assert.equal(sampleCommits(commits, "all").length, 5);
});

void test("sampleCommits keeps the newest commit per month", () => {
  assert.deepEqual(
    sampleCommits(commits, "monthly").map((entry) => entry.hash),
    ["e", "c", "b"],
  );
});

void test("sampleCommits keeps the newest commit per quarter", () => {
  assert.deepEqual(
    sampleCommits(commits, "quarterly").map((entry) => entry.hash),
    ["e", "b"],
  );
});

void test("sampleCommits supports every-nth", () => {
  assert.deepEqual(
    sampleCommits(commits, { everyNth: 2 }).map((entry) => entry.hash),
    ["e", "c", "a"],
  );
});

void test("parseSamplingPolicy accepts known policies and rejects others", () => {
  assert.equal(parseSamplingPolicy("monthly"), "monthly");
  assert.deepEqual(parseSamplingPolicy("every-nth:5"), { everyNth: 5 });
  assert.ok(parseSamplingPolicy("fortnightly") instanceof Error);
  assert.ok(parseSamplingPolicy("every-nth:0") instanceof Error);
});
