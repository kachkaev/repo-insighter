import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { Effect } from "effect";
import { expect, test } from "vitest";

import { defineConfig } from "../src/config.ts";
import {
  defaultMaxInCharts,
  deriveContributorKind,
  loadConfig,
  resolveConfig,
} from "../src/lib/config.ts";

test("defineConfig returns its argument unchanged", () => {
  const config = { contributors: { maxInCharts: 7 } };
  expect(defineConfig(config)).toBe(config);
});

test("resolveConfig defaults with no contributor config", () => {
  const resolved = resolveConfig({});
  expect(resolved.maxInCharts).toBe(defaultMaxInCharts);
  const contributor = resolved.resolveContributor("carol@example.com", "Carol");
  expect(contributor.label).toBe("carol@example.com");
  expect(contributor.canonicalEmail).toBe("carol@example.com");
  expect(contributor.displayName).toBeUndefined();
  expect(contributor.url).toBeUndefined();
  expect(contributor.kind).toBe("human");
});

test("resolveConfig folds aliases into the first (canonical) entry", () => {
  const resolved = resolveConfig({
    contributors: {
      aliases: [
        [
          "alice@work.example",
          "alice@personal.example",
          "12345+alice@users.noreply.github.com",
        ],
      ],
    },
  });
  expect(resolved.resolveContributor("alice@personal.example").label).toBe(
    "alice@work.example",
  );
  expect(
    resolved.resolveContributor("12345+alice@users.noreply.github.com").label,
  ).toBe("alice@work.example");
  // Canonical stays itself.
  expect(resolved.resolveContributor("alice@work.example").label).toBe(
    "alice@work.example",
  );
});

test("resolveConfig matches aliases case-insensitively", () => {
  const resolved = resolveConfig({
    contributors: {
      aliases: [["Alice@Work.Example", "alice@personal.example"]],
    },
  });
  expect(resolved.resolveContributor("ALICE@personal.EXAMPLE").label).toBe(
    "Alice@Work.Example",
  );
});

test("resolveConfig still prettifies a canonical noreply address", () => {
  const resolved = resolveConfig({});
  expect(
    resolved.resolveContributor("12345+bob@users.noreply.github.com").label,
  ).toBe("bob");
});

test("resolveConfig applies displayName, url and kind from a rich alias group", () => {
  const resolved = resolveConfig({
    contributors: {
      aliases: [
        {
          emails: ["alice@work.example", "alice@personal.example"],
          displayName: "Alice",
          url: "https://github.com/alice",
          kind: "ai",
        },
      ],
    },
  });
  const contributor = resolved.resolveContributor("alice@personal.example");
  expect(contributor.label).toBe("Alice");
  expect(contributor.displayName).toBe("Alice");
  expect(contributor.url).toBe("https://github.com/alice");
  expect(contributor.kind).toBe("ai");
  // The email column still shows the (prettified) canonical email.
  expect(contributor.canonicalEmail).toBe("alice@work.example");
});

test("resolveConfig matches an alias by its prettified noreply handle", () => {
  // Config lists the handle a user sees in the report; the raw commit email is
  // the full GitHub noreply address.
  const resolved = resolveConfig({
    contributors: {
      aliases: [{ emails: ["ziggy"], displayName: "Ziggy" }],
    },
  });
  const contributor = resolved.resolveContributor(
    "98765+ziggy@users.noreply.github.com",
  );
  expect(contributor.label).toBe("Ziggy");
  expect(contributor.displayName).toBe("Ziggy");
});

test("deriveContributorKind classifies bots and AI agents", () => {
  expect(deriveContributorKind("Alice <alice@example.com>")).toBe("human");
  expect(
    deriveContributorKind(
      "renovate[bot] <29139614+renovate[bot]@users.noreply.github.com>",
    ),
  ).toBe("bot");
  expect(deriveContributorKind("dependabot[bot] <dependabot[bot]>")).toBe(
    "bot",
  );
  expect(
    deriveContributorKind(
      "Copilot <198982749+Copilot@users.noreply.github.com>",
    ),
  ).toBe("ai");
});

test("resolveConfig derives kind when the config omits it", () => {
  const resolved = resolveConfig({
    contributors: {
      aliases: [{ emails: ["Copilot"], displayName: "Copilot" }],
    },
  });
  const contributor = resolved.resolveContributor(
    "198982749+Copilot@users.noreply.github.com",
    "Copilot",
  );
  expect(contributor.kind).toBe("ai");
});

test("resolveConfig rejects malformed config", () => {
  expect(() => resolveConfig({ contributors: "nope" })).toThrow(
    /`contributors` must be an object/,
  );
  expect(() => resolveConfig({ contributors: { aliases: "nope" } })).toThrow(
    /`contributors.aliases` must be an array/,
  );
  expect(() => resolveConfig({ contributors: { aliases: [[]] } })).toThrow(
    /must be a non-empty array/,
  );
  expect(() => resolveConfig({ contributors: { aliases: [[""]] } })).toThrow(
    /must be a non-empty string/,
  );
  expect(() =>
    resolveConfig({
      contributors: { aliases: [{ emails: ["a@x"], kind: "robot" }] },
    }),
  ).toThrow(/must be one of "human", "bot" or "ai"/);
  expect(() => resolveConfig({ contributors: { maxInCharts: 0 } })).toThrow(
    /must be an integer between 1 and 100/,
  );
  expect(() => resolveConfig({ contributors: { maxInCharts: 3.5 } })).toThrow(
    /must be an integer between 1 and 100/,
  );
});

test("resolveConfig rejects an email shared across alias groups", () => {
  expect(() =>
    resolveConfig({
      contributors: {
        aliases: [
          ["alice@work.example", "shared@example.com"],
          ["bob@work.example", "shared@example.com"],
        ],
      },
    }),
  ).toThrow(/appears in more than one alias group/);
});

test("loadConfig returns defaults when no config file exists", async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "repo-dive-cfg-"));
  try {
    const resolved = await Effect.runPromise(loadConfig(dir));
    expect(resolved.maxInCharts).toBe(defaultMaxInCharts);
  } finally {
    rmSync(dir, { force: true, recursive: true });
  }
});

test("loadConfig imports a .mjs config file", async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "repo-dive-cfg-"));
  try {
    writeFileSync(
      path.join(dir, "repo-dive.config.mjs"),
      'export default { contributors: { maxInCharts: 15, aliases: [["a@x.example", "a@y.example"]] } };\n',
    );
    const resolved = await Effect.runPromise(loadConfig(dir));
    expect(resolved.maxInCharts).toBe(15);
    expect(resolved.resolveContributor("a@y.example").label).toBe(
      "a@x.example",
    );
  } finally {
    rmSync(dir, { force: true, recursive: true });
  }
});

test("loadConfig fails with a friendly message on a malformed config", async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "repo-dive-cfg-"));
  try {
    writeFileSync(
      path.join(dir, "repo-dive.config.mjs"),
      "export default { contributors: { maxInCharts: -1 } };\n",
    );
    await expect(Effect.runPromise(loadConfig(dir))).rejects.toThrow(
      /Invalid repo-dive config/,
    );
  } finally {
    rmSync(dir, { force: true, recursive: true });
  }
});
