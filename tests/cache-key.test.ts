import assert from "node:assert/strict";
import test from "node:test";

import { Effect } from "effect";

import { collectorCacheKey } from "../src/lib/collectors/cache-key.ts";
import type { Collector } from "../src/lib/collectors/types.ts";
import type { ResolvedConfig } from "../src/lib/config.ts";

function config(maxInCharts: number): ResolvedConfig {
  return {
    maxInCharts,
    resolveContributor: (email) => ({
      canonicalEmail: email,
      label: email,
      displayName: undefined,
      url: undefined,
      kind: "human",
    }),
  };
}

function collector(overrides: Partial<Collector>): Collector {
  return {
    name: "test",
    description: "test collector",
    version: "1",
    strategy: "tree",
    defaultSampling: "all",
    collect: () => Effect.succeed({}),
    normalize: () => [],
    ...overrides,
  };
}

void test("cache key is a 12-char hex fingerprint", () => {
  const key = collectorCacheKey(collector({}), config(10));
  assert.match(key, /^[0-9a-f]{12}$/);
});

void test("a config-free collector's key ignores config, tracks version", () => {
  const free = collector({});
  // Same version, different config → identical key (no config dependency).
  assert.equal(
    collectorCacheKey(free, config(10)),
    collectorCacheKey(free, config(99)),
  );
  // Bumping the version changes the key.
  assert.notEqual(
    collectorCacheKey(free, config(10)),
    collectorCacheKey(collector({ version: "2" }), config(10)),
  );
});

void test("a config-dependent collector's key tracks its config slice", () => {
  const dependent = collector({
    cacheConfig: (resolved) => ({ cap: resolved.maxInCharts }),
  });
  // The depended-on value changes → key changes.
  assert.notEqual(
    collectorCacheKey(dependent, config(10)),
    collectorCacheKey(dependent, config(20)),
  );
  // Same value → stable key.
  assert.equal(
    collectorCacheKey(dependent, config(10)),
    collectorCacheKey(dependent, config(10)),
  );
});

void test("the config slice is canonicalized, so key order does not matter", () => {
  const a = collector({ cacheConfig: () => ({ x: 1, y: 2 }) });
  const b = collector({ cacheConfig: () => ({ y: 2, x: 1 }) });
  assert.equal(
    collectorCacheKey(a, config(10)),
    collectorCacheKey(b, config(10)),
  );
});
