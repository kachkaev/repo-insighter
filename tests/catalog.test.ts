import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";

import { Effect } from "effect";
import { expect, test } from "vitest";

import { catalogDirName, openCatalog } from "../src/lib/catalog.ts";

const legacyCatalogDirName = ".repo-insighter";

function makeRepoRoot() {
  return mkdtempSync(path.join(os.tmpdir(), "repo-dive-catalog-"));
}

function writeCatalogManifest(repoRoot: string, dirName: string) {
  const dir = path.join(repoRoot, dirName);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    path.join(dir, "catalog.json"),
    `${JSON.stringify({ formatVersion: 1, vcs: "git", createdAt: new Date().toISOString() })}\n`,
    "utf8",
  );
  return dir;
}

test("openCatalog scaffolds a self-ignoring catalog", async () => {
  const repoRoot = makeRepoRoot();

  try {
    const catalog = await Effect.runPromise(openCatalog(repoRoot));

    expect(catalog.rootPath).toBe(path.join(repoRoot, catalogDirName));
    expect(existsSync(path.join(catalog.rootPath, "catalog.json"))).toBe(true);
    expect(existsSync(path.join(catalog.rootPath, ".gitignore"))).toBe(true);
  } finally {
    rmSync(repoRoot, { recursive: true, force: true });
  }
});

test("openCatalog points at a catalog left by the former name", async () => {
  const repoRoot = makeRepoRoot();

  try {
    writeCatalogManifest(repoRoot, legacyCatalogDirName);

    await expect(Effect.runPromise(openCatalog(repoRoot))).rejects.toThrow(
      /left by repo-insighter/,
    );
    // Bailing out must not leave a half-made catalog that hides the old one.
    expect(existsSync(path.join(repoRoot, catalogDirName))).toBe(false);
  } finally {
    rmSync(repoRoot, { recursive: true, force: true });
  }
});

test("openCatalog ignores the former name once the catalog is renamed", async () => {
  const repoRoot = makeRepoRoot();

  try {
    writeCatalogManifest(repoRoot, legacyCatalogDirName);
    writeCatalogManifest(repoRoot, catalogDirName);

    const catalog = await Effect.runPromise(openCatalog(repoRoot));
    expect(catalog.rootPath).toBe(path.join(repoRoot, catalogDirName));
  } finally {
    rmSync(repoRoot, { recursive: true, force: true });
  }
});
