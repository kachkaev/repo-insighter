import assert from "node:assert/strict";
import test from "node:test";

import { coAuthorIdentity, isAiCoAuthor } from "../src/lib/indexing.ts";

void test("isAiCoAuthor recognizes AI assistants and ignores humans", () => {
  assert.equal(isAiCoAuthor("Claude Fable 5 <noreply@anthropic.com>"), true);
  assert.equal(isAiCoAuthor("GitHub Copilot <copilot@github.com>"), true);
  assert.equal(isAiCoAuthor("dependabot[bot] <x@github.com>"), true);
  assert.equal(isAiCoAuthor("Alice Example <alice@example.com>"), false);
});

void test("coAuthorIdentity extracts the display name", () => {
  assert.equal(
    coAuthorIdentity("Claude Fable 5 <noreply@anthropic.com>"),
    "Claude Fable 5",
  );
  assert.equal(coAuthorIdentity("plain-name"), "plain-name");
});
