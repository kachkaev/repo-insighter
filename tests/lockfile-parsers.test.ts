import { expect, test } from "vitest";

import { parseNpmLockfile } from "../src/lib/collectors/lockfile-parsers/npm.ts";
import { parsePnpmLockfile } from "../src/lib/collectors/lockfile-parsers/pnpm.ts";
import { parseYarnLockfile } from "../src/lib/collectors/lockfile-parsers/yarn.ts";

test("parsePnpmLockfile counts resolved packages, version-aware", () => {
  // A monorepo: React 19 in one package, React 18 in another → two resolved
  // versions of react, counted separately.
  const summary = parsePnpmLockfile(
    [
      "lockfileVersion: '9.0'",
      "",
      "importers:",
      "",
      "  .:",
      "    dependencies:",
      "      react:",
      "        specifier: ^19",
      "        version: 19.2.0",
      "    devDependencies:",
      "      typescript:",
      "        specifier: '5'",
      "        version: 5.9.0",
      "",
      "  packages/legacy:",
      "    dependencies:",
      "      react:",
      "        specifier: ^18",
      "        version: 18.3.1",
      "    optionalDependencies:",
      "      fsevents:",
      "        specifier: ^2",
      "        version: 2.3.3",
      "",
      "packages:",
      "",
      "  react@19.2.0: {}",
      "  react@18.3.1: {}",
      "  typescript@5.9.0: {}",
      "  fsevents@2.3.3: {}",
    ].join("\n"),
  );

  expect(summary).toStrictEqual({
    packageManager: "pnpm",
    lockfileVersion: "9.0",
    resolvedCount: 4,
  });
});

test("parsePnpmLockfile skips pnpm's package-manager document", () => {
  // First document manages pnpm itself; only the second is a real lockfile.
  const summary = parsePnpmLockfile(
    [
      "lockfileVersion: '9.0'",
      "",
      "importers:",
      "",
      "  .:",
      "    configDependencies: {}",
      "    packageManagerDependencies:",
      "      pnpm:",
      "        specifier: 11.15.0",
      "        version: 11.15.0",
      "",
      "packages:",
      "",
      "  pnpm@11.15.0: {}",
      "",
      "---",
      "lockfileVersion: '9.0'",
      "",
      "importers:",
      "",
      "  .:",
      "    dependencies:",
      "      lodash:",
      "        specifier: ^4",
      "        version: 4.17.21",
      "",
      "packages:",
      "",
      "  lodash@4.17.21: {}",
    ].join("\n"),
  );

  expect(summary).toStrictEqual({
    packageManager: "pnpm",
    lockfileVersion: "9.0",
    resolvedCount: 1,
  });
});

test("parsePnpmLockfile returns undefined for non-lockfile content", () => {
  expect(parsePnpmLockfile("just a string")).toBeUndefined();
});

test("parseNpmLockfile reads a v3 packages map, excluding workspace links", () => {
  // The workspace's node_modules entry is a symlink and must not be counted as
  // a resolved package; importer entries (root + workspace) are not resolved.
  const summary = parseNpmLockfile(
    JSON.stringify({
      name: "root",
      lockfileVersion: 3,
      requires: true,
      packages: {
        "": {
          name: "root",
          dependencies: { lodash: "^4" },
          devDependencies: { typescript: "^5" },
        },
        "packages/app": { name: "app", dependencies: { react: "^19" } },
        "node_modules/app": { resolved: "packages/app", link: true },
        "node_modules/lodash": { version: "4.17.21" },
        "node_modules/typescript": { version: "5.9.0" },
        "node_modules/react": { version: "19.2.0" },
      },
    }),
  );

  expect(summary).toStrictEqual({
    packageManager: "npm",
    lockfileVersion: "3",
    resolvedCount: 3,
  });
});

test("parseNpmLockfile counts the nested tree of a legacy v1 lockfile", () => {
  // v1 records the resolved graph as a nested tree.
  const summary = parseNpmLockfile(
    JSON.stringify({
      name: "old",
      version: "1.0.0",
      lockfileVersion: 1,
      dependencies: {
        lodash: { version: "4.17.21" },
        chalk: {
          version: "2.4.2",
          dependencies: { "ansi-styles": { version: "3.2.1" } },
        },
      },
    }),
  );

  expect(summary).toStrictEqual({
    packageManager: "npm",
    lockfileVersion: "1",
    resolvedCount: 3,
  });
});

test("parseNpmLockfile returns undefined for non-lockfile JSON", () => {
  expect(parseNpmLockfile("not json {")).toBeUndefined();
  expect(parseNpmLockfile(JSON.stringify({ name: "x" }))).toBeUndefined();
});

test("parseYarnLockfile counts resolution blocks in a classic v1 lockfile", () => {
  // One block per resolved version; comma-joined ranges share a block.
  const summary = parseYarnLockfile(
    [
      "# yarn lockfile v1",
      "",
      "",
      '"@babel/code-frame@^7.0.0":',
      '  version "7.12.11"',
      '  resolved "https://registry.yarnpkg.com/@babel/code-frame/-/x.tgz"',
      "  dependencies:",
      '    "@babel/highlight" "^7.10.4"',
      "",
      "lodash@^4.17.0, lodash@^4.17.21:",
      '  version "4.17.21"',
      '  resolved "https://registry.yarnpkg.com/lodash/-/lodash.tgz"',
      "",
      "chalk@^2.0.0:",
      '  version "2.4.2"',
      "",
    ].join("\n"),
  );

  expect(summary).toStrictEqual({
    packageManager: "yarn",
    lockfileVersion: "1",
    resolvedCount: 3,
  });
});

test("parseYarnLockfile reads Berry YAML, excluding metadata and workspaces", () => {
  const summary = parseYarnLockfile(
    [
      "# This file is generated by running yarn install.",
      "",
      "__metadata:",
      "  version: 6",
      "  cacheKey: 8",
      "",
      '"@babel/code-frame@npm:^7.0.0":',
      "  version: 7.12.11",
      '  resolution: "@babel/code-frame@npm:7.12.11"',
      "",
      '"lodash@npm:^4.17.0, lodash@npm:^4.17.21":',
      "  version: 4.17.21",
      '  resolution: "lodash@npm:4.17.21"',
      "",
      '"root@workspace:.":',
      "  version: 0.0.0-use.local",
      '  resolution: "root@workspace:."',
      "",
    ].join("\n"),
  );

  expect(summary).toStrictEqual({
    packageManager: "yarn",
    lockfileVersion: "6",
    resolvedCount: 2,
  });
});
