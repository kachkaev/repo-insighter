import { expect, test } from "vitest";

import { parsePackageManifest } from "../src/lib/collectors/package-manifest.ts";

test("parsePackageManifest counts the three direct dependency blocks", () => {
  const summary = parsePackageManifest(
    JSON.stringify({
      name: "app",
      dependencies: { react: "^19", "react-dom": "^19" },
      devDependencies: { typescript: "^5", vitest: "^4", eslint: "^9" },
      optionalDependencies: { fsevents: "^2" },
    }),
  );

  expect(summary).toStrictEqual({
    direct: { prod: 2, dev: 3, optional: 1 },
  });
});

test("parsePackageManifest reads a manifest that declares nothing as zeros", () => {
  // A private root that only sets up workspaces still counts as a manifest.
  const summary = parsePackageManifest(
    JSON.stringify({ name: "root", private: true, workspaces: ["packages/*"] }),
  );

  expect(summary).toStrictEqual({
    direct: { prod: 0, dev: 0, optional: 0 },
  });
});

test("parsePackageManifest ignores non-dependency and malformed blocks", () => {
  // `peerDependencies` is deliberately not counted; a non-object block is zero.
  const summary = parsePackageManifest(
    JSON.stringify({
      dependencies: { lodash: "^4" },
      peerDependencies: { react: "^19" },
      devDependencies: "oops",
    }),
  );

  expect(summary).toStrictEqual({
    direct: { prod: 1, dev: 0, optional: 0 },
  });
});

test("parsePackageManifest returns undefined for non-object content", () => {
  expect(parsePackageManifest("not json {")).toBeUndefined();
  expect(parsePackageManifest(JSON.stringify([1, 2, 3]))).toBeUndefined();
  expect(parsePackageManifest(JSON.stringify("a string"))).toBeUndefined();
});
