import { expect, test } from "vitest";

import {
  coAuthorIdentity,
  isAiCoAuthor,
  prettifyAuthorEmail,
} from "../src/lib/indexing.ts";

test("isAiCoAuthor recognizes AI assistants, not humans or bots", () => {
  expect(isAiCoAuthor("Claude Fable 5 <noreply@anthropic.com>")).toBe(true);
  expect(isAiCoAuthor("GitHub Copilot <copilot@github.com>")).toBe(true);
  expect(isAiCoAuthor("Alice Example <alice@example.com>")).toBe(false);
  expect(isAiCoAuthor("renovate[bot] <bot@renovateapp.com>")).toBe(false);
  expect(isAiCoAuthor("dependabot[bot] <x@github.com>")).toBe(false);
});

test("prettifyAuthorEmail shortens GitHub noreply addresses", () => {
  expect(prettifyAuthorEmail("12345+alice@users.noreply.github.com")).toBe(
    "alice",
  );
  expect(prettifyAuthorEmail("bob@users.noreply.github.com")).toBe("bob");
  expect(prettifyAuthorEmail("carol@example.com")).toBe("carol@example.com");
});

test("coAuthorIdentity extracts the display name", () => {
  expect(coAuthorIdentity("Claude Fable 5 <noreply@anthropic.com>")).toBe(
    "Claude Fable 5",
  );
  expect(coAuthorIdentity("plain-name")).toBe("plain-name");
});
