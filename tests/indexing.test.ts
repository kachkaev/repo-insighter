import assert from "node:assert/strict";
import test from "node:test";

import {
  coAuthorIdentity,
  isAiCoAuthor,
  prettifyAuthorEmail,
} from "../src/lib/indexing.ts";

void test("isAiCoAuthor recognizes AI assistants, not humans or bots", () => {
  assert.equal(isAiCoAuthor("Claude Fable 5 <noreply@anthropic.com>"), true);
  assert.equal(isAiCoAuthor("GitHub Copilot <copilot@github.com>"), true);
  assert.equal(isAiCoAuthor("Alice Example <alice@example.com>"), false);
  assert.equal(isAiCoAuthor("renovate[bot] <bot@renovateapp.com>"), false);
  assert.equal(isAiCoAuthor("dependabot[bot] <x@github.com>"), false);
});

void test("prettifyAuthorEmail shortens GitHub noreply addresses", () => {
  assert.equal(
    prettifyAuthorEmail("12345+alice@users.noreply.github.com"),
    "alice",
  );
  assert.equal(prettifyAuthorEmail("bob@users.noreply.github.com"), "bob");
  assert.equal(prettifyAuthorEmail("carol@example.com"), "carol@example.com");
});

void test("coAuthorIdentity extracts the display name", () => {
  assert.equal(
    coAuthorIdentity("Claude Fable 5 <noreply@anthropic.com>"),
    "Claude Fable 5",
  );
  assert.equal(coAuthorIdentity("plain-name"), "plain-name");
});
