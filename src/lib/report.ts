import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { Console, Effect } from "effect";

import { catalogDirName } from "./catalog.ts";
import { openInBrowser, resolveAssetsDir } from "./dashboard-server.ts";
import { resolveRepoRoot } from "./scan.ts";

const toError = (error: unknown) =>
  error instanceof Error ? error : new Error(String(error));

/**
 * Builds a single self-contained report.html: the dashboard bundle with CSS,
 * JS and the repository's dashboard.json inlined — shareable without running
 * anything.
 */
export const runReport = ({
  repoPath,
  outPath,
  open,
}: {
  readonly repoPath: string;
  readonly outPath?: string | undefined;
  readonly open: boolean;
}): Effect.Effect<void, Error> =>
  Effect.gen(function* () {
    const repoRoot = yield* resolveRepoRoot(repoPath);
    const dataPath = path.join(
      repoRoot,
      catalogDirName,
      "index",
      "dashboard.json",
    );
    if (!existsSync(dataPath)) {
      return yield* Effect.fail(
        new Error(
          `No dashboard data at ${dataPath} — run \`repo-dive scan\` and \`repo-dive index\` first.`,
        ),
      );
    }

    const assetsDir = resolveAssetsDir();
    if (assetsDir === undefined) {
      return yield* Effect.fail(
        new Error(
          "Dashboard assets not found — run `pnpm build` first (dist/dashboard is missing).",
        ),
      );
    }

    const html = yield* Effect.tryPromise({
      try: async () => {
        const [indexHtml, dataJson] = await Promise.all([
          readFile(path.join(assetsDir, "index.html"), "utf8"),
          readFile(dataPath, "utf8"),
        ]);

        // "</script>" inside the JSON payload would terminate the inline tag.
        const safeData = dataJson.replaceAll("</", String.raw`<\/`);
        const dataTag = `<script>window.__REPO_DIVE_DATA__ = ${safeData};</script>`;

        let result = indexHtml;

        const styleMatches = [
          ...result.matchAll(
            /<link rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/g,
          ),
        ];
        for (const match of styleMatches) {
          const css = await readFile(
            path.join(assetsDir, match[1] ?? ""),
            "utf8",
          );
          result = result.replace(match[0], () => `<style>${css}</style>`);
        }

        const scriptMatches = [
          ...result.matchAll(
            /<script type="module"[^>]*src="([^"]+)"[^>]*><\/script>/g,
          ),
        ];
        for (const match of scriptMatches) {
          const js = await readFile(
            path.join(assetsDir, match[1] ?? ""),
            "utf8",
          );
          const safeJs = js.replaceAll("</script", String.raw`<\/script`);
          // A replacer function keeps "$"-sequences in the bundle literal.
          result = result.replace(
            match[0],
            () => `${dataTag}<script type="module">${safeJs}</script>`,
          );
        }

        return result;
      },
      catch: toError,
    });

    const resolvedOutPath =
      outPath ?? path.join(repoRoot, catalogDirName, "index", "report.html");
    yield* Effect.tryPromise({
      try: () => writeFile(resolvedOutPath, html, "utf8"),
      catch: toError,
    });

    yield* Console.log(
      `Report written to ${resolvedOutPath} (${Math.round(html.length / 1024)} kB, self-contained).`,
    );

    if (open) {
      yield* openInBrowser(resolvedOutPath);
    }
  });
